"""
engine/ml/explain.py — SHAP-based explanation of risk predictions.

Pure functions (no network/file I/O except optional model loading if weights passed).
Takes model + features (or weights + prices), returns explanations and risk drivers.

Method (D36):
    Primary: shap.TreeExplainer on the base HistGradientBoosting estimator -> top 5 drivers.
    Fallback: local perturbation sensitivity (permutation importance proxy).
    Output: English templates like "Average correlation of 0.71 pushes the risk toward High."
    Helpers: asset_risk_contribution, return_contribution.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from engine.features import FEATURE_NAMES, portfolio_features

# ── English templates (D36) ────────────────────────────────────────────────
_TEMPLATES: dict[str, str] = {
    "vol_252": "Annual volatility of {value:.1%} {direction} the risk level.",
    "vol_63": "Recent 63-day volatility of {value:.1%} {direction} the risk.",
    "vol_ratio": "Volatility ratio (short/long) of {value:.2f} {direction} momentum risk.",
    "ann_return": "Annualised return of {value:.1%} {direction} the risk assessment.",
    "max_dd": "Maximum drawdown of {value:.1%} {direction} the risk.",
    "current_dd": "Current drawdown of {value:.1%} {direction} the risk.",
    "sharpe": "Sharpe ratio of {value:.2f} {direction} risk-adjusted performance.",
    "sortino": "Sortino ratio of {value:.2f} {direction} downside risk assessment.",
    "cvar95": "CVaR(95%) of {value:.1%} {direction} tail risk.",
    "avg_corr": "Average correlation of {value:.2f} {direction} the risk toward {label}.",
    "diversification_ratio": "Diversification ratio of {value:.2f} {direction} concentration risk.",
    "hhi": "HHI concentration of {value:.3f} {direction} the risk.",
    "top_weight": "Top asset weight of {value:.1%} {direction} concentration risk.",
    "top_rc_share": "Top risk contributor at {value:.1%} {direction} the risk.",
    "beta_blend": "Blended beta of {value:.2f} {direction} market sensitivity.",
    "equity_share": "Equity allocation of {value:.1%} {direction} the risk.",
    "n_assets": "Portfolio has {value:.0f} assets which {direction} diversification.",
    "bench_vol_63": "Benchmark 63-day vol of {value:.1%} {direction} market environment risk.",
}


# ── Helper 1: asset_risk_contribution ──────────────────────────────────────
def asset_risk_contribution(
    weights: dict[str, float] | np.ndarray | list[float],
    cov_or_prices: np.ndarray | pd.DataFrame,
) -> dict[str, float] | np.ndarray:
    """Compute per-asset fractional risk contribution: w_i * (Sigma w)_i / sigma_p^2.

    Guaranteed to sum to 1.0 by construction.

    Parameters
    ----------
    weights : dict[str, float] | np.ndarray | list[float]
        Portfolio weights. If dict, maps ticker -> weight.
    cov_or_prices : np.ndarray | pd.DataFrame
        Either an (n x n) covariance matrix (annualised or daily), or a
        daily prices DataFrame (from which asset returns and covariance are computed).

    Returns
    -------
    dict[str, float] | np.ndarray
        Fractional risk contributions (sums to 1.0). Matches the input type of weights.

    Example
    -------
    >>> import numpy as np
    >>> w = {"A": 0.6, "B": 0.4}
    >>> cov = np.array([[0.04, 0.01], [0.01, 0.09]])
    >>> rc = asset_risk_contribution(w, cov)
    >>> abs(sum(rc.values()) - 1.0) < 1e-10
    True
    """
    is_dict = isinstance(weights, dict)
    if is_dict:
        tickers = list(weights.keys())
        w_arr = np.array([float(weights[k]) for k in tickers], dtype=float)
    else:
        tickers = []
        w_arr = np.asarray(weights, dtype=float)

    n = len(w_arr)
    if n == 0:
        return {} if is_dict else np.array([])
    if n == 1:
        return {tickers[0]: 1.0} if is_dict else np.array([1.0])

    # Check if cov_or_prices is a DataFrame of prices or covariance
    if isinstance(cov_or_prices, pd.DataFrame):
        if is_dict and all(t in cov_or_prices.columns for t in tickers):
            df_sub = cov_or_prices[tickers]
            if len(df_sub) == len(tickers) and np.allclose(df_sub.values, df_sub.values.T):
                # Square symmetric matrix -> treat as covariance matrix
                cov = df_sub.values
            else:
                # Historical price series -> compute annualised covariance
                rets = df_sub.pct_change().dropna()
                cov = rets.cov().values * 252.0
        else:
            cov = cov_or_prices.values
    else:
        cov = np.asarray(cov_or_prices, dtype=float)

    sigma_w = cov @ w_arr
    port_var = float(w_arr @ sigma_w)

    if port_var < 1e-15 or np.isnan(port_var):
        rc = np.ones(n) / float(n)
    else:
        rc = (w_arr * sigma_w) / port_var

    if is_dict:
        return {tk: float(v) for tk, v in zip(tickers, rc)}
    return rc


# ── Helper 2: return_contribution ──────────────────────────────────────────
def return_contribution(
    weights: dict[str, float] | np.ndarray | list[float],
    asset_returns: dict[str, float] | np.ndarray | pd.Series | list[float],
    *,
    portfolio_return: float | None = None,
    relative: bool = True,
) -> dict[str, float] | np.ndarray:
    """Compute per-asset return contribution.

    If ``relative=True`` (default), computes ``w_i * asset_return / p_return``
    which sums to 1.0 when portfolio return is non-zero.
    If ``relative=False``, computes absolute contribution ``w_i * asset_return``.

    Parameters
    ----------
    weights : dict[str, float] | np.ndarray | list[float]
        Portfolio weights.
    asset_returns : dict[str, float] | np.ndarray | pd.Series | list[float]
        Annualised or period return per asset.
    portfolio_return : float | None
        Total portfolio return. If None, computed as sum(w_i * r_i).
    relative : bool
        If True, normalizes by portfolio return (sums to 1.0).

    Returns
    -------
    dict[str, float] | np.ndarray
        Per-asset return contributions.

    Example
    -------
    >>> w = {"A": 0.6, "B": 0.4}
    >>> r = {"A": 0.10, "B": 0.05}
    >>> rc = return_contribution(w, r)
    >>> abs(sum(rc.values()) - 1.0) < 1e-10
    True
    """
    is_dict = isinstance(weights, dict)
    if is_dict:
        tickers = list(weights.keys())
        w_arr = np.array([float(weights[k]) for k in tickers], dtype=float)
        if isinstance(asset_returns, dict):
            r_arr = np.array([float(asset_returns.get(k, 0.0)) for k in tickers], dtype=float)
        elif isinstance(asset_returns, pd.Series):
            r_arr = np.array([float(asset_returns.get(k, 0.0)) for k in tickers], dtype=float)
        else:
            r_arr = np.asarray(asset_returns, dtype=float)
    else:
        tickers = []
        w_arr = np.asarray(weights, dtype=float)
        if isinstance(asset_returns, dict):
            r_arr = np.array(list(asset_returns.values()), dtype=float)
        else:
            r_arr = np.asarray(asset_returns, dtype=float)

    weighted_rets = w_arr * r_arr
    p_ret = float(portfolio_return) if portfolio_return is not None else float(np.sum(weighted_rets))

    if relative:
        if abs(p_ret) > 1e-12 and not np.isnan(p_ret):
            contrib = weighted_rets / p_ret
        else:
            # If portfolio return is zero, fallback to equal or raw share
            total_w = float(np.sum(w_arr))
            contrib = w_arr / total_w if total_w > 0 else np.ones(len(w_arr)) / len(w_arr)
    else:
        contrib = weighted_rets

    if is_dict:
        return {tk: float(v) for tk, v in zip(tickers, contrib)}
    return contrib


# ── Core SHAP / Permutation explanation logic ──────────────────────────────
def _extract_base_estimator(model: Any) -> Any:
    """Extract base estimator compatible with TreeExplainer."""
    if isinstance(model, dict) and "model" in model:
        model = model["model"]
    if hasattr(model, "calibrated_classifiers_") and model.calibrated_classifiers_:
        # CalibratedClassifierCV -> inspect first calibrated estimator
        cc = model.calibrated_classifiers_[0]
        if hasattr(cc, "estimator"):
            return cc.estimator
        if hasattr(cc, "base_estimator"):
            return cc.base_estimator
    if hasattr(model, "estimator"):
        return model.estimator
    return model


def _compute_shap_impacts(
    base_est: Any,
    X: pd.DataFrame,
    feature_names: list[str],
    predicted_label: str,
) -> np.ndarray:
    """Compute per-feature SHAP impact for the predicted class.

    Raises Exception if shap is unavailable or incompatible.
    """
    import shap  # noqa: F401

    explainer = shap.TreeExplainer(base_est)
    shap_vals = explainer.shap_values(X)

    # Determine class index for predicted_label
    classes = list(getattr(base_est, "classes_", ["High", "Low", "Medium"]))
    if predicted_label in classes:
        class_idx = classes.index(predicted_label)
    else:
        class_idx = 0

    if isinstance(shap_vals, list):
        # Multiclass list of arrays: one per class
        impacts = np.asarray(shap_vals[class_idx][0], dtype=float)
    elif isinstance(shap_vals, np.ndarray):
        if shap_vals.ndim == 3:
            # (n_samples, n_features, n_classes)
            impacts = np.asarray(shap_vals[0, :, class_idx], dtype=float)
        elif shap_vals.ndim == 2:
            impacts = np.asarray(shap_vals[0, :], dtype=float)
        else:
            impacts = np.asarray(shap_vals.flatten()[:len(feature_names)], dtype=float)
    else:
        raise ValueError("Unrecognized shap_values output structure.")

    return impacts


def _compute_permutation_impacts(
    estimator: Any,
    X: pd.DataFrame,
    feature_names: list[str],
    predicted_label: str,
) -> np.ndarray:
    """Fallback: compute feature impact via local perturbation sensitivity."""
    classes = list(getattr(estimator, "classes_", ["High", "Low", "Medium"]))
    class_idx = classes.index(predicted_label) if predicted_label in classes else 0

    # Baseline probability
    if hasattr(estimator, "predict_proba"):
        base_prob = float(estimator.predict_proba(X)[0][class_idx])
    else:
        base_prob = 0.5

    impacts = []
    for col in feature_names:
        x_val = float(X[col].iloc[0]) if not pd.isna(X[col].iloc[0]) else 0.0
        delta = max(1e-4, abs(x_val) * 0.1)

        X_plus = X.copy()
        X_plus[col] = x_val + delta

        if hasattr(estimator, "predict_proba"):
            prob_plus = float(estimator.predict_proba(X_plus)[0][class_idx])
            impact = prob_plus - base_prob
        else:
            impact = 0.01

        impacts.append(impact)

    return np.array(impacts, dtype=float)


def explain_risk(
    arg1: Any = None,
    arg2: Any = None,
    arg3: Any = None,
    *,
    model: Any = None,
    features: dict[str, float] | None = None,
    predicted_label: str | None = None,
    weights: dict[str, float] | None = None,
    prices: pd.DataFrame | None = None,
    bench: pd.Series | pd.DataFrame | None = None,
    asset_class: dict[str, str] | None = None,
    top_n: int = 5,
    rf: float = 0.065,
    model_path: Path | str | None = None,
) -> dict[str, Any]:
    """Generate human-readable explanations and risk drivers for a portfolio.

    Supports two invocation patterns:
    1. Feature-based: ``explain_risk(model, features, predicted_label, top_n=5)``
    2. Portfolio-based: ``explain_risk(weights, prices, ...)``

    Parameters
    ----------
    arg1, arg2, arg3 : Any
        Positional arguments allowing either ``(model, features, predicted_label)``
        or ``(weights, prices)``.
    model : Any
        Trained classifier or model artifact.
    features : dict[str, float]
        Feature name -> value dict.
    predicted_label : str
        ``"Low"`` | ``"Medium"`` | ``"High"``.
    weights : dict[str, float] | None
        Portfolio weights.
    prices : pd.DataFrame | None
        Historical prices DataFrame.
    top_n : int
        Number of top driving features to include (default 5).

    Returns
    -------
    dict[str, Any]
        ``risk_drivers``: list of ``{factor, impact, direction}`` dicts.
        ``explanations``: list of English strings ready to render.

    Example
    -------
    >>> from engine.ml.predict import load_model
    >>> artifact = load_model()
    >>> res = explain_risk(artifact["model"], {"vol_252": 0.22, "avg_corr": 0.71}, "High")
    >>> len(res["risk_drivers"]) <= 5
    True
    >>> len(res["explanations"]) == len(res["risk_drivers"])
    True
    """
    from engine.ml.predict import load_model, predict_risk

    # ── Parse polymorphic arguments ────────────────────────────────────
    target_model = model
    target_features = features
    target_label = predicted_label

    if arg1 is not None and arg2 is not None:
        if isinstance(arg1, dict) and isinstance(arg2, pd.DataFrame):
            # Signature: explain_risk(weights, prices, ...)
            weights_in = arg1
            prices_in = arg2
            pred_res = predict_risk(
                weights=weights_in,
                prices=prices_in,
                bench=bench,
                asset_class=asset_class,
                rf=rf,
                model_path=model_path,
                return_features=True,
            )
            target_features = pred_res["features"]
            target_label = pred_res["label"]
            artifact = load_model(model_path)
            target_model = artifact["model"]
        else:
            # Signature: explain_risk(model, features, predicted_label)
            target_model = arg1
            target_features = arg2
            if arg3 is not None and isinstance(arg3, str):
                target_label = arg3

    if target_features is None:
        if weights is not None and prices is not None:
            pred_res = predict_risk(
                weights=weights,
                prices=prices,
                bench=bench,
                asset_class=asset_class,
                rf=rf,
                model_path=model_path,
                return_features=True,
            )
            target_features = pred_res["features"]
            target_label = pred_res["label"]
            artifact = load_model(model_path)
            target_model = artifact["model"]
        else:
            raise ValueError("Either (model, features, predicted_label) or (weights, prices) must be provided.")

    if target_model is None:
        artifact = load_model(model_path)
        target_model = artifact["model"]

    if target_label is None:
        target_label = "Medium"

    # ── Extract base estimator & feature names ─────────────────────────
    base_est = _extract_base_estimator(target_model)
    if hasattr(base_est, "feature_names_in_"):
        fitted_features = list(base_est.feature_names_in_)
    else:
        fitted_features = list(FEATURE_NAMES)

    X = pd.DataFrame(
        [[target_features.get(f, np.nan) for f in fitted_features]],
        columns=fitted_features,
    )

    # ── Calculate feature impacts (SHAP or fallback) ───────────────────
    try:
        impacts = _compute_shap_impacts(base_est, X, fitted_features, target_label)
    except Exception:
        # Fallback to local permutation sensitivity (D36)
        impacts = _compute_permutation_impacts(base_est, X, fitted_features, target_label)

    # ── Select top_n by |impact| ───────────────────────────────────────
    # If caller provided a subset of features, select among those provided
    provided_set = set(target_features.keys())
    eligible_indices = [i for i, f in enumerate(fitted_features) if f in provided_set]
    if not eligible_indices:
        eligible_indices = list(range(len(fitted_features)))

    eligible_abs_impacts = [abs(impacts[i]) for i in eligible_indices]
    ranked_order = np.argsort(eligible_abs_impacts)[::-1][:top_n]
    top_indices = [eligible_indices[r] for r in ranked_order]

    risk_drivers: list[dict[str, Any]] = []
    explanations: list[str] = []

    for idx in top_indices:
        factor = fitted_features[idx]
        impact_val = float(impacts[idx])
        feature_val = float(target_features.get(factor, 0.0))

        # Direction in driver schema: "increases" if positive else "decreases"
        direction_schema = "increases" if impact_val >= 0 else "decreases"

        driver = {
            "factor": factor,
            "impact": round(impact_val, 4),
            "direction": direction_schema,
        }
        risk_drivers.append(driver)

        # ── Format English template (D36) ──────────────────────────────
        template = _TEMPLATES.get(factor, "{factor} of {value:.2f} {direction} the risk.")

        if factor == "avg_corr":
            direction_word = "pushes" if impact_val >= 0 else "pulls away from"
        elif factor == "n_assets":
            direction_word = "supports" if (impact_val >= 0 and target_label == "Low") or (impact_val < 0 and target_label == "High") else "limits"
        elif target_label == "Low":
            direction_word = "reduces" if impact_val >= 0 else "increases"
        elif target_label == "High":
            direction_word = "increases" if impact_val >= 0 else "reduces"
        else:  # Medium
            direction_word = "moderates" if impact_val >= 0 else "increases"

        try:
            explanation_str = template.format(
                value=feature_val,
                direction=direction_word,
                label=target_label,
                factor=factor,
            )
        except Exception:
            explanation_str = f"{factor} of {feature_val:.2f} {direction_word} the risk."

        explanations.append(explanation_str)

    return {
        "risk_drivers": risk_drivers,
        "explanations": explanations,
    }
