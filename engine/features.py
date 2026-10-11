"""
engine/features.py — Portfolio feature extraction for ML risk classification.

Pure function. Uses ONLY the 252 trading days ending at t.
No network, no files, no global state.

Features (architecture.md §4):
    vol_252, vol_63, vol_ratio, ann_return, max_dd, current_dd,
    sharpe, sortino, cvar95, avg_corr, diversification_ratio, hhi,
    top_weight, top_rc_share, beta_blend, equity_share, n_assets, bench_vol_63.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

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

FEATURE_NAMES: list[str] = [
    "vol_252", "vol_63", "vol_ratio", "ann_return", "max_dd", "current_dd",
    "sharpe", "sortino", "cvar95", "avg_corr", "diversification_ratio", "hhi",
    "top_weight", "top_rc_share", "beta_blend", "equity_share", "n_assets",
    "bench_vol_63",
]


def portfolio_features(
    weights: dict[str, float],
    prices: pd.DataFrame,
    t: pd.Timestamp,
    *,
    bench: pd.Series | None = None,
    asset_classes: dict[str, str] | None = None,
    rf: float = 0.065,
) -> dict[str, float]:
    """Compute the 18 ML features for a portfolio at date *t*.

    Uses ONLY the 252 trading days ending at (and including) *t*.

    Parameters
    ----------
    weights : dict[str, float]
        Ticker -> weight mapping (must sum to ~1).
    prices : pd.DataFrame
        Daily adjusted-close prices, columns = tickers, DatetimeIndex.
    t : pd.Timestamp
        Observation date (inclusive upper bound).
    bench : pd.Series | None
        Blended benchmark price series (0.5 NSEI + 0.5 NDX in INR).
    asset_classes : dict[str, str] | None
        Ticker -> asset_class (e.g. "equity", "gold", "bond").
    rf : float
        Annualised risk-free rate.

    Returns
    -------
    dict[str, float]
        Keys are exactly ``FEATURE_NAMES``.

    Raises
    ------
    ValueError
        If fewer than 252 trading days exist up to *t*.

    Example
    -------
    >>> import pandas as pd, numpy as np
    >>> dates = pd.bdate_range("2020-01-01", periods=252)
    >>> prices = pd.DataFrame({"A": np.linspace(100, 120, 252),
    ...                        "B": np.linspace(50, 55, 252)}, index=dates)
    >>> feats = portfolio_features({"A": 0.6, "B": 0.4}, prices, dates[-1])
    >>> sorted(feats.keys()) == sorted(FEATURE_NAMES)
    True
    """
    t = pd.Timestamp(t)
    tickers = sorted(weights.keys())
    w_arr = np.array([weights[tk] for tk in tickers])

    # ── Slice to 252 days up to and including t ─────────────────────────
    mask = prices.index <= t
    available = prices.loc[mask, tickers]
    if len(available) < 252:
        raise ValueError(
            f"Need 252 trading days up to {t.date()}, got {len(available)}."
        )
    window = available.iloc[-252:]  # exactly 252 rows

    # ── Daily simple returns ────────────────────────────────────────────
    asset_rets = window.pct_change().iloc[1:]  # 251 rows
    port_rets = (asset_rets * w_arr).sum(axis=1).values  # portfolio returns

    # ── Volatility features ─────────────────────────────────────────────
    vol_252 = _volatility(port_rets)
    vol_63 = _volatility(port_rets[-63:])
    vol_ratio = vol_63 / vol_252 if vol_252 > 1e-10 else 1.0

    # ── Return / drawdown ───────────────────────────────────────────────
    ar = _ann_return(port_rets)
    mdd = _max_drawdown(port_rets)

    # current drawdown: distance from running max at end of window
    cum = np.cumprod(1.0 + port_rets)
    running_max = np.maximum.accumulate(cum)
    current_dd = float(cum[-1] / running_max[-1] - 1.0)

    # ── Risk-adjusted ───────────────────────────────────────────────────
    sh = _sharpe(port_rets, rf)
    so = _sortino(port_rets, rf)
    cv = _cvar95(port_rets)

    # ── Correlation / diversification ───────────────────────────────────
    corr_matrix = asset_rets.corr().values
    n = len(tickers)
    if n > 1:
        # mean of upper-triangle (excluding diagonal)
        mask_tri = np.triu(np.ones((n, n), dtype=bool), k=1)
        avg_corr = float(np.mean(corr_matrix[mask_tri]))
    else:
        avg_corr = 1.0

    cov_matrix = asset_rets.cov().values * 252  # annualised
    dr = _div_ratio(w_arr, cov_matrix)
    h = _hhi(w_arr)

    # ── Concentration ───────────────────────────────────────────────────
    top_weight = float(np.max(w_arr))
    rc = _risk_contribution(w_arr, cov_matrix)
    top_rc_share = float(np.max(rc))

    # ── Beta vs blended benchmark ───────────────────────────────────────
    if bench is not None:
        bench_window = bench.loc[bench.index <= t].iloc[-252:]
        bench_rets_all = bench_window.pct_change().iloc[1:].values
        # align length
        min_len = min(len(port_rets), len(bench_rets_all))
        pr = port_rets[-min_len:]
        br = bench_rets_all[-min_len:]
        cov_pb = np.cov(pr, br, ddof=1)
        beta_blend = float(cov_pb[0, 1] / cov_pb[1, 1]) if cov_pb[1, 1] > 1e-15 else 1.0
        bench_vol_63_val = _volatility(br[-63:])
    else:
        beta_blend = np.nan
        bench_vol_63_val = np.nan

    # ── Equity share ────────────────────────────────────────────────────
    if asset_classes is not None:
        eq_share = sum(weights[tk] for tk in tickers if asset_classes.get(tk, "equity") == "equity")
    else:
        eq_share = 1.0  # assume all equity if unspecified

    return {
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
