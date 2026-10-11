"""
engine/ml/predict.py — Risk prediction using the trained classifier.

Loads the saved model from disk (only I/O exception in engine/).
Pure otherwise.

Outputs (D37):
    label:      "Low" | "Medium" | "High"
    probs:      {Low, Medium, High}
    risk_score: round(100 * (0.5 * p_medium + p_high))
    confidence: max(probs)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from engine.features import FEATURE_NAMES, portfolio_features

MODELS_DIR = Path(__file__).parent / "models"
DEFAULT_MODEL_PATH = MODELS_DIR / "risk_clf.joblib"

# Module-level lazy cache for model artifacts
_MODEL_CACHE: dict[Path, dict[str, Any]] = {}


def load_model(model_path: Path | str | None = None) -> dict[str, Any]:
    """Load the trained model artifact from disk with lazy caching.

    Parameters
    ----------
    model_path : Path | str | None
        Path to the saved model artifact. Defaults to ``MODELS_DIR / "risk_clf.joblib"``.

    Returns
    -------
    dict[str, Any]
        Loaded model artifact containing ``model``, ``feature_names``, etc.

    Example
    -------
    >>> artifact = load_model()
    >>> "model" in artifact and "feature_names" in artifact
    True
    """
    path = Path(model_path) if model_path is not None else DEFAULT_MODEL_PATH
    resolved = path.resolve()
    if resolved not in _MODEL_CACHE:
        if not resolved.exists():
            raise FileNotFoundError(f"Model file not found at {resolved}")
        loaded = joblib.load(resolved)
        if not isinstance(loaded, dict):
            loaded = {
                "model": loaded,
                "feature_names": FEATURE_NAMES,
                "classes": getattr(loaded, "classes_", ["High", "Low", "Medium"]),
            }
        _MODEL_CACHE[resolved] = loaded
    return _MODEL_CACHE[resolved]


def clear_model_cache() -> None:
    """Clear the lazy module-level model cache (useful for testing)."""
    _MODEL_CACHE.clear()


def predict_risk(
    weights: dict[str, float],
    prices: pd.DataFrame,
    bench: pd.Series | pd.DataFrame | None = None,
    asset_class: dict[str, str] | None = None,
    *,
    bench_prices: pd.DataFrame | pd.Series | None = None,
    equity_tickers: set[str] | None = None,
    asset_classes: dict[str, str] | None = None,
    rf: float = 0.065,
    model_path: Path | str | None = None,
    return_features: bool = False,
) -> dict[str, Any]:
    """Predict the risk class and score for a portfolio.

    Computes the 18 portfolio features at the LAST date in ``prices``,
    evaluates the calibrated classifier, and maps probabilities by class name.

    Parameters
    ----------
    weights : dict[str, float]
        Ticker -> weight (sums to ~1).
    prices : pd.DataFrame
        Historical daily adjusted-close prices, columns = tickers, DatetimeIndex.
    bench : pd.Series | pd.DataFrame | None
        Blended benchmark prices or returns. If None and ^NSEI/^NDX are in prices,
        automatically constructed (0.5 NSEI + 0.5 NDX).
    asset_class : dict[str, str] | None
        Ticker -> asset class mapping (e.g. "equity", "commodity", "bond").
    bench_prices : pd.DataFrame | pd.Series | None
        Alias for bench.
    equity_tickers : set[str] | None
        Tickers classified as equity.
    asset_classes : dict[str, str] | None
        Alias for asset_class.
    rf : float
        Annualised risk-free rate (default 0.065).
    model_path : Path | str | None
        Override path to the saved model. Defaults to ``MODELS_DIR / "risk_clf.joblib"``.
    return_features : bool
        If True, includes the raw feature dict under ``"features"`` key.

    Returns
    -------
    dict[str, Any]
        ``{label, probs: {Low, Medium, High}, risk_score, confidence}``.

    Example
    -------
    >>> import pandas as pd, numpy as np
    >>> dates = pd.bdate_range("2020-01-01", periods=260)
    >>> px = pd.DataFrame({"A": np.linspace(100, 130, 260), "B": np.linspace(50, 60, 260)}, index=dates)
    >>> res = predict_risk({"A": 0.6, "B": 0.4}, px)
    >>> res["label"] in ("Low", "Medium", "High")
    True
    >>> 0 <= res["risk_score"] <= 100
    True
    >>> abs(sum(res["probs"].values()) - 1.0) < 1e-4
    True
    """
    if not weights:
        raise ValueError("Portfolio weights must not be empty.")
    if prices.empty:
        raise ValueError("Prices DataFrame must not be empty.")

    # ── Normalize weights ──────────────────────────────────────────────
    total_w = float(sum(weights.values()))
    if total_w <= 0.0:
        raise ValueError(f"Sum of weights must be positive, got {total_w}.")
    normalized_weights = {k: float(v) / total_w for k, v in weights.items()}

    # ── Resolve benchmark series ───────────────────────────────────────
    bench_input = bench if bench is not None else bench_prices
    bench_series: pd.Series | None = None
    if bench_input is not None:
        if isinstance(bench_input, pd.DataFrame):
            if "^NSEI" in bench_input.columns and "^NDX" in bench_input.columns:
                r_n = bench_input["^NSEI"].pct_change().fillna(0.0)
                r_x = bench_input["^NDX"].pct_change().fillna(0.0)
                bench_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0
            else:
                bench_series = bench_input.iloc[:, 0]
        elif isinstance(bench_input, pd.Series):
            if bench_input.std() < 0.2 and bench_input.abs().max() < 2.0:
                bench_series = (1.0 + bench_input.fillna(0.0)).cumprod() * 100.0
            else:
                bench_series = bench_input
    elif "^NSEI" in prices.columns and "^NDX" in prices.columns:
        r_n = prices["^NSEI"].pct_change().fillna(0.0)
        r_x = prices["^NDX"].pct_change().fillna(0.0)
        bench_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0

    # ── Resolve asset classes ──────────────────────────────────────────
    ac_dict: dict[str, str] | None = None
    if asset_classes is not None:
        ac_dict = asset_classes
    elif asset_class is not None:
        ac_dict = asset_class
    elif equity_tickers is not None:
        ac_dict = {
            tk: ("equity" if tk in equity_tickers else "other")
            for tk in normalized_weights.keys()
        }

    # ── Compute features at the LAST date in prices ────────────────────
    if not isinstance(prices.index, pd.DatetimeIndex):
        prices = prices.copy()
        prices.index = pd.to_datetime(prices.index)
    prices = prices.sort_index()
    t = prices.index[-1]

    feats = portfolio_features(
        weights=normalized_weights,
        prices=prices,
        t=t,
        bench=bench_series,
        asset_classes=ac_dict,
        rf=rf,
    )

    # ── Load model artifact ────────────────────────────────────────────
    artifact = load_model(model_path)
    model = artifact["model"]
    feature_names = artifact.get("feature_names", FEATURE_NAMES)

    # Construct 1-row feature DataFrame with correct column ordering
    X = pd.DataFrame([[feats.get(fn, np.nan) for fn in feature_names]], columns=feature_names)

    # ── Evaluate predictions ───────────────────────────────────────────
    # Read probabilities by class name, NOT by position (D35/D37)
    probas = model.predict_proba(X)[0]
    classes = list(getattr(model, "classes_", ["High", "Low", "Medium"]))
    probs_by_class = {cls: float(p) for cls, p in zip(classes, probas)}

    p_low = float(probs_by_class.get("Low", 0.0))
    p_med = float(probs_by_class.get("Medium", 0.0))
    p_high = float(probs_by_class.get("High", 0.0))

    probs = {
        "Low": p_low,
        "Medium": p_med,
        "High": p_high,
    }

    # Predicted label: class with highest probability (equivalent to model.predict(X)[0] without redundant re-evaluation)
    pred_label = max(probs, key=lambda k: probs[k])

    # Risk score: round(100 * (0.5 * p_medium + 1.0 * p_high)) (D37)
    risk_score = int(round(100.0 * (0.5 * p_med + 1.0 * p_high)))
    # Bound to [0, 100]
    risk_score = max(0, min(100, risk_score))

    # Confidence: max prob (D37)
    confidence = float(max(probs.values()))

    result: dict[str, Any] = {
        "label": pred_label,
        "probs": probs,
        "risk_score": risk_score,
        "confidence": confidence,
    }
    if return_features:
        result["features"] = feats

    return result


def predict_risk_batch(
    weights_list: list[dict[str, float]],
    prices: pd.DataFrame,
    bench: pd.Series | pd.DataFrame | None = None,
    asset_class: dict[str, str] | None = None,
    *,
    bench_prices: pd.DataFrame | pd.Series | None = None,
    equity_tickers: set[str] | None = None,
    asset_classes: dict[str, str] | None = None,
    rf: float = 0.065,
    model_path: Path | str | None = None,
) -> list[dict[str, Any]]:
    """Predict risk class and scores for multiple portfolios sharing price history.

    Vectorized/batched computation for rapid frontier candidate evaluation.
    """
    if not weights_list:
        return []
    if prices.empty:
        raise ValueError("Prices DataFrame must not be empty.")

    # ── Resolve benchmark series ───────────────────────────────────────
    bench_input = bench if bench is not None else bench_prices
    bench_series: pd.Series | None = None
    if bench_input is not None:
        if isinstance(bench_input, pd.DataFrame):
            if "^NSEI" in bench_input.columns and "^NDX" in bench_input.columns:
                r_n = bench_input["^NSEI"].pct_change().fillna(0.0)
                r_x = bench_input["^NDX"].pct_change().fillna(0.0)
                bench_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0
            else:
                bench_series = bench_input.iloc[:, 0]
        elif isinstance(bench_input, pd.Series):
            if bench_input.std() < 0.2 and bench_input.abs().max() < 2.0:
                bench_series = (1.0 + bench_input.fillna(0.0)).cumprod() * 100.0
            else:
                bench_series = bench_input
    elif "^NSEI" in prices.columns and "^NDX" in prices.columns:
        r_n = prices["^NSEI"].pct_change().fillna(0.0)
        r_x = prices["^NDX"].pct_change().fillna(0.0)
        bench_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0

    # ── Resolve asset classes ──────────────────────────────────────────
    ac_dict: dict[str, str] | None = None
    if asset_classes is not None:
        ac_dict = asset_classes
    elif asset_class is not None:
        ac_dict = asset_class

    # ── Prepare prices & observation date t ───────────────────────────
    if not isinstance(prices.index, pd.DatetimeIndex):
        prices = prices.copy()
        prices.index = pd.to_datetime(prices.index)
    prices = prices.sort_index()
    t = prices.index[-1]

    # Pre-extract common tickers from union of weights
    all_tickers = sorted({tk for w in weights_list for tk in w.keys()})
    mask = prices.index <= t
    available = prices.loc[mask, [c for c in all_tickers if c in prices.columns]]
    if len(available) < 252:
        raise ValueError(f"Need 252 trading days up to {t.date()}, got {len(available)}.")
    window = available.iloc[-252:]
    asset_rets_df = window.pct_change().iloc[1:]

    # Import metric calculation functions
    from engine.ml._metrics_shim import (
        ann_return as _ann_return,
        cvar95 as _cvar95,
        diversification_ratio as _div_ratio,
        hhi as _hhi,
        max_drawdown as _max_drawdown,
        risk_contribution as _risk_contribution,
        sharpe as _sharpe,
        sortino as _sortino,
        volatility as _volatility,
    )

    # Precompute shared metrics on asset returns
    corr_matrix = asset_rets_df.corr().values
    cov_matrix = asset_rets_df.cov().values * 252.0
    n = len(asset_rets_df.columns)
    if n > 1:
        mask_tri = np.triu(np.ones((n, n), dtype=bool), k=1)
        avg_corr = float(np.mean(corr_matrix[mask_tri]))
    else:
        avg_corr = 1.0

    if bench_series is not None:
        bench_window = bench_series.loc[bench_series.index <= t].iloc[-252:]
        bench_rets_all = bench_window.pct_change().iloc[1:].values
        bench_vol_63_val = _volatility(bench_rets_all[-63:])
    else:
        bench_rets_all = None
        bench_vol_63_val = np.nan

    asset_cols = list(asset_rets_df.columns)
    asset_rets_mat = asset_rets_df.values

    # ── Build feature rows for all portfolios ─────────────────────────
    artifact = load_model(model_path)
    model = artifact["model"]
    feature_names = artifact.get("feature_names", FEATURE_NAMES)

    rows: list[list[float]] = []
    for weights in weights_list:
        tot_w = float(sum(weights.values()))
        if tot_w <= 0.0:
            tot_w = 1.0
        w_vec = np.array([float(weights.get(tk, 0.0)) / tot_w for tk in asset_cols], dtype=float)

        port_rets = asset_rets_mat @ w_vec
        vol_252 = _volatility(port_rets)
        vol_63 = _volatility(port_rets[-63:])
        vol_ratio = vol_63 / vol_252 if vol_252 > 1e-10 else 1.0

        ar = _ann_return(port_rets)
        mdd = _max_drawdown(port_rets)

        cum = np.cumprod(1.0 + port_rets)
        running_max = np.maximum.accumulate(cum)
        current_dd = float(cum[-1] / running_max[-1] - 1.0)

        sh = _sharpe(port_rets, rf)
        so = _sortino(port_rets, rf)
        cv = _cvar95(port_rets)

        dr = _div_ratio(w_vec, cov_matrix)
        h = _hhi(w_vec)

        top_weight = float(np.max(w_vec))
        rc = _risk_contribution(w_vec, cov_matrix)
        top_rc_share = float(np.max(rc))

        if bench_rets_all is not None:
            min_len = min(len(port_rets), len(bench_rets_all))
            pr = port_rets[-min_len:]
            br = bench_rets_all[-min_len:]
            cov_pb = np.cov(pr, br, ddof=1)
            beta_blend = float(cov_pb[0, 1] / cov_pb[1, 1]) if cov_pb[1, 1] > 1e-15 else 1.0
        else:
            beta_blend = np.nan

        if ac_dict is not None:
            eq_share = sum(float(weights.get(tk, 0.0)) / tot_w for tk in asset_cols if ac_dict.get(tk, "equity") == "equity")
        else:
            eq_share = 1.0

        f_map = {
            "vol_252": vol_252,
            "vol_63": vol_63,
            "vol_ratio": vol_ratio,
            "ann_return": ar,
            "max_dd": mdd,
            "current_dd": current_dd,
            "sharpe": sh,
            "sortino": so,
            "cvar95": cv,
            "avg_corr": avg_corr,
            "diversification_ratio": dr,
            "hhi": h,
            "top_weight": top_weight,
            "top_rc_share": top_rc_share,
            "beta_blend": beta_blend,
            "equity_share": eq_share,
            "n_assets": float(n),
            "bench_vol_63": bench_vol_63_val,
        }
        rows.append([f_map.get(fn, np.nan) for fn in feature_names])

    # ── Batch inference ───────────────────────────────────────────────
    X = pd.DataFrame(rows, columns=feature_names)
    probas_mat = model.predict_proba(X)
    classes = list(getattr(model, "classes_", ["High", "Low", "Medium"]))

    results: list[dict[str, Any]] = []
    for probas in probas_mat:
        probs_by_class = {cls: float(p) for cls, p in zip(classes, probas)}
        p_low = float(probs_by_class.get("Low", 0.0))
        p_med = float(probs_by_class.get("Medium", 0.0))
        p_high = float(probs_by_class.get("High", 0.0))
        probs = {"Low": p_low, "Medium": p_med, "High": p_high}
        pred_label = max(probs, key=lambda k: probs[k])
        risk_score = int(round(100.0 * (0.5 * p_med + 1.0 * p_high)))
        risk_score = max(0, min(100, risk_score))
        confidence = float(max(probs.values()))
        results.append({
            "label": pred_label,
            "probs": probs,
            "risk_score": risk_score,
            "confidence": confidence,
        })

    return results
