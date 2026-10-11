"""
engine/ml/_metrics_shim.py — Minimal local metric implementations.

██████████████████████████████████████████████████████████████████████
██  TEMPORARY SHIM.  Replace with:                                  ██
██      from engine.metrics import (                                ██
██          ann_return, volatility, max_drawdown, sharpe, sortino,  ██
██          cvar95, risk_contribution, diversification_ratio, hhi,  ██
██      )                                                           ██
██  once Hardik ships engine/metrics.py (expected at G1, ~T+1:00).  ██
██████████████████████████████████████████████████████████████████████

All functions are pure (no I/O). Signatures and semantics match
architecture.md §5 so the swap is a one-line import change.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def ann_return(returns: pd.Series | np.ndarray) -> float:
    """Annualised return from daily simple returns.

    Formula: (1 + total_return)^(252/n) - 1

    Example
    -------
    >>> import numpy as np
    >>> ann_return(np.array([0.001]*252))  # ~28.6%
    0.286...
    """
    r = np.asarray(returns)
    n = len(r)
    if n == 0:
        return 0.0
    total = np.prod(1.0 + r) - 1.0
    return float((1.0 + total) ** (252.0 / n) - 1.0)


def volatility(returns: pd.Series | np.ndarray) -> float:
    """Annualised volatility from daily simple returns.

    Formula: std(returns) * sqrt(252)

    Example
    -------
    >>> import numpy as np
    >>> round(volatility(np.full(252, 0.01)), 4)
    0.0
    """
    r = np.asarray(returns)
    if len(r) < 2:
        return 0.0
    return float(np.std(r, ddof=1) * np.sqrt(252))


def max_drawdown(returns: pd.Series | np.ndarray) -> float:
    """Maximum drawdown (negative number) from daily simple returns.

    Example
    -------
    >>> import numpy as np
    >>> max_drawdown(np.array([0.10, -0.20, 0.05]))  # peak 1.10, trough 0.88
    -0.2...
    """
    r = np.asarray(returns)
    if len(r) == 0:
        return 0.0
    cum = np.cumprod(1.0 + r)
    running_max = np.maximum.accumulate(cum)
    dd = cum / running_max - 1.0
    return float(np.min(dd))


def sharpe(returns: pd.Series | np.ndarray, rf: float = 0.065) -> float:
    """Annualised Sharpe ratio.

    Formula: (ann_return - rf) / volatility

    Example
    -------
    >>> import numpy as np
    >>> rng = np.random.default_rng(0)
    >>> r = rng.normal(0.0004, 0.01, 252)
    >>> isinstance(sharpe(r), float)
    True
    """
    vol = volatility(returns)
    if vol < 1e-10:
        return 0.0
    return float((ann_return(returns) - rf) / vol)


def sortino(returns: pd.Series | np.ndarray, rf: float = 0.065) -> float:
    """Annualised Sortino ratio (downside deviation).

    Example
    -------
    >>> import numpy as np
    >>> sortino(np.array([0.01, -0.02, 0.005, -0.01, 0.02]))
    ...
    """
    r = np.asarray(returns)
    if len(r) < 2:
        return 0.0
    downside = r[r < 0]
    if len(downside) < 2:
        return 0.0  # no downside
    dd = float(np.std(downside, ddof=1) * np.sqrt(252))
    if dd < 1e-10:
        return 0.0
    return float((ann_return(r) - rf) / dd)


def cvar95(returns: pd.Series | np.ndarray) -> float:
    """Conditional Value at Risk at the 95% level (daily, as a negative number).

    Mean of the worst 5% of daily returns.

    Example
    -------
    >>> import numpy as np
    >>> cvar95(np.array([-0.05, -0.03, -0.01, 0.01, 0.02]))
    -0.05
    """
    r = np.asarray(returns)
    if len(r) == 0:
        return 0.0
    cutoff = int(max(1, np.floor(len(r) * 0.05)))
    sorted_r = np.sort(r)
    return float(np.mean(sorted_r[:cutoff]))


def risk_contribution(
    weights: np.ndarray | list[float],
    cov_matrix: np.ndarray,
) -> np.ndarray:
    """Fractional risk contribution per asset.

    Formula: RC_i = w_i * (Σ w)_i / σ_p²

    Sums to 1.0 by construction.

    Parameters
    ----------
    weights : array-like
        Portfolio weights (must sum to ≈1).
    cov_matrix : np.ndarray
        (n × n) covariance matrix of asset returns.

    Returns
    -------
    np.ndarray
        Array of risk contributions, same length as weights.

    Example
    -------
    >>> import numpy as np
    >>> w = np.array([0.6, 0.4])
    >>> cov = np.array([[0.04, 0.01], [0.01, 0.09]])
    >>> rc = risk_contribution(w, cov)
    >>> abs(rc.sum() - 1.0) < 1e-10
    True
    """
    w = np.asarray(weights, dtype=float)
    sigma_w = cov_matrix @ w
    port_var = float(w @ sigma_w)
    if port_var < 1e-15:
        return np.ones(len(w)) / len(w)
    rc = w * sigma_w / port_var
    return rc


def diversification_ratio(
    weights: np.ndarray | list[float],
    cov_matrix: np.ndarray,
) -> float:
    """Diversification ratio: sum(w_i * σ_i) / σ_p.

    A ratio > 1 indicates diversification benefit.

    Example
    -------
    >>> import numpy as np
    >>> w = np.array([0.5, 0.5])
    >>> cov = np.array([[0.04, 0.005], [0.005, 0.04]])
    >>> diversification_ratio(w, cov) > 1.0
    True
    """
    w = np.asarray(weights, dtype=float)
    asset_vols = np.sqrt(np.diag(cov_matrix))
    weighted_vols = float(w @ asset_vols)
    port_vol = float(np.sqrt(w @ cov_matrix @ w))
    if port_vol < 1e-15:
        return 1.0
    return weighted_vols / port_vol


def hhi(weights: np.ndarray | list[float]) -> float:
    """Herfindahl-Hirschman Index: sum(w_i²).

    Range: [1/n, 1]. Lower = more diversified.

    Example
    -------
    >>> import numpy as np
    >>> hhi(np.array([0.5, 0.5]))
    0.5
    >>> hhi(np.array([1.0]))
    1.0
    """
    w = np.asarray(weights, dtype=float)
    return float(np.sum(w ** 2))
