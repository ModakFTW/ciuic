"""
engine/ml/synthetic.py — Synthetic price generator for testing.

Produces correlated GBM paths with a crash period so that ML features
and the full pipeline can be tested before Hardik's data/loader.py lands.

Not used in production — only for tests and early development.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def make_synthetic_prices(
    tickers: list[str] | None = None,
    start: str = "2012-01-02",
    end: str = "2025-12-31",
    seed: int = 42,
    *,
    base_mu: float = 0.08,
    base_sigma: float = 0.20,
    crash_start: str = "2020-02-19",
    crash_end: str = "2020-03-23",
    crash_drift: float = -1.5,
    crash_vol_mult: float = 3.0,
) -> pd.DataFrame:
    """Generate synthetic daily prices on business days with correlated GBM.

    Includes a crash period (default: covid-like window) where drift goes
    sharply negative and volatility spikes, so drawdown-based features and
    labels are realistic.

    Parameters
    ----------
    tickers : list[str] | None
        Ticker symbols for columns. Defaults to 8 mixed assets.
    start, end : str
        Date range (inclusive).
    seed : int
        Numpy random seed for reproducibility.
    base_mu : float
        Annualised drift (pre-crash, post-crash).
    base_sigma : float
        Annualised volatility (pre-crash, post-crash).
    crash_start, crash_end : str
        Crash window boundaries.
    crash_drift : float
        Annualised drift during crash.
    crash_vol_mult : float
        Volatility multiplier during crash.

    Returns
    -------
    pd.DataFrame
        DatetimeIndex (business days), columns = tickers, values = prices.
        Starts near 100 for each ticker.

    Example
    -------
    >>> prices = make_synthetic_prices(["A", "B", "C"], "2018-01-01", "2023-12-31")
    >>> prices.shape[1]
    3
    >>> prices.index.is_monotonic_increasing
    True
    >>> (prices > 0).all().all()
    True
    """
    if tickers is None:
        tickers = ["SYN_EQ1", "SYN_EQ2", "SYN_EQ3", "SYN_EQ4",
                    "SYN_EQ5", "SYN_BOND", "SYN_GOLD", "SYN_ETF"]

    rng = np.random.default_rng(seed)
    n = len(tickers)

    # Build date index
    dates = pd.bdate_range(start=start, end=end)
    T = len(dates)

    # Correlation structure: moderate positive correlation (0.3-0.6)
    # with lower correlation for bond/gold-like assets
    raw = rng.uniform(0.1, 0.5, size=(n, n))
    corr = (raw + raw.T) / 2
    np.fill_diagonal(corr, 1.0)

    # Make the last couple of assets less correlated (bond/gold proxies)
    if n >= 6:
        corr[-2:, :-2] *= 0.3
        corr[:-2, -2:] *= 0.3
        corr[-2:, -2:] = np.array([[1.0, 0.2], [0.2, 1.0]])

    # Ensure positive-definite via eigenvalue clipping
    eigvals, eigvecs = np.linalg.eigh(corr)
    eigvals = np.maximum(eigvals, 1e-6)
    corr = eigvecs @ np.diag(eigvals) @ eigvecs.T
    # Re-normalise to correlation
    d = np.sqrt(np.diag(corr))
    corr = corr / np.outer(d, d)

    # Per-asset vol variation
    sigmas = base_sigma * (0.7 + 0.6 * rng.random(n))  # range ~14%-26%
    cov = np.outer(sigmas, sigmas) * corr
    L = np.linalg.cholesky(cov)

    # Daily parameters
    dt = 1.0 / 252.0
    mus = base_mu * (0.5 + rng.random(n))  # range ~4%-12%

    crash_s = pd.Timestamp(crash_start)
    crash_e = pd.Timestamp(crash_end)

    # Generate log-returns
    Z = rng.standard_normal((T, n))
    corr_Z = Z @ L.T  # (T, n)

    log_returns = np.empty((T, n))
    for i, date in enumerate(dates):
        if crash_s <= date <= crash_e:
            mu_day = crash_drift * dt
            vol_scale = crash_vol_mult
        else:
            mu_day = mus * dt
            vol_scale = 1.0

        log_returns[i] = mu_day - 0.5 * (sigmas * vol_scale) ** 2 * dt + \
                          vol_scale * np.sqrt(dt) * corr_Z[i]

    # Cumulate to prices
    log_prices = np.cumsum(log_returns, axis=0)
    prices_arr = 100.0 * np.exp(log_prices)

    return pd.DataFrame(prices_arr, index=dates, columns=tickers)
