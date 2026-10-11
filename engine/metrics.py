"""
engine/metrics.py  –  Pure financial metric functions for RiskScope (no I/O).

All functions take aligned price DataFrames or return arrays.
Returns are simple (not log). Annualisation uses 252 trading days.

Example input:  prices = pd.DataFrame with 252 rows, weights = [0.5, 0.5]
Example output: metrics dict with ann_return, vol, sharpe, etc.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Sequence

RF_INR = 0.065  # 6.5% annual risk-free rate for INR
RF_USD = 0.04   # 4.0% annual risk-free rate for USD


def _rf(currency: str = "INR") -> float:
    return RF_INR if currency.upper() == "INR" else RF_USD


def simple_returns(prices: pd.DataFrame | pd.Series) -> pd.DataFrame | pd.Series:
    """
    Compute daily simple returns from price series.

    Example input:  pd.Series([100, 102, 101])
    Example output: pd.Series([NaN, 0.02, -0.0098...])
    """
    return prices.pct_change()


def portfolio_returns(prices: pd.DataFrame, weights: Sequence[float]) -> pd.Series:
    """
    Compute daily portfolio returns given asset prices and weights.

    Example input:  prices=DataFrame(2 cols, 100 rows), weights=[0.6, 0.4]
    Example output: pd.Series of 100 portfolio returns
    """
    w = np.array(weights)
    w = w / w.sum()
    rets = simple_returns(prices).dropna()
    return rets.dot(w)


def ann_return(port_rets: pd.Series) -> float:
    """
    Annualised return: (1 + total_return)^(252/n) - 1.

    Example input:  pd.Series of 252 daily returns averaging 0.0003
    Example output: ~0.078  (7.8% ann. return)
    """
    n = len(port_rets)
    if n == 0:
        return 0.0
    total = (1 + port_rets).prod() - 1
    return float((1 + total) ** (252 / n) - 1)


def volatility(port_rets: pd.Series) -> float:
    """
    Annualised volatility: std * sqrt(252).

    Example input:  pd.Series of daily returns
    Example output: 0.18  (18% ann. vol)
    """
    return float(port_rets.std() * np.sqrt(252))


def max_drawdown(port_rets: pd.Series) -> float:
    """
    Maximum drawdown (negative number).

    Example input:  pd.Series([0.01, -0.05, 0.02, -0.1, 0.03])
    Example output: -0.147... (the largest peak-to-trough decline)
    """
    cum = (1 + port_rets).cumprod()
    running_max = cum.cummax()
    dd = (cum - running_max) / running_max
    return float(dd.min())


def drawdown_series(port_rets: pd.Series) -> pd.Series:
    """
    Full drawdown series (returns Series of drawdown values at each point).

    Example input:  pd.Series of daily portfolio returns
    Example output: pd.Series of same length with negative values representing drawdown
    """
    cum = (1 + port_rets).cumprod()
    running_max = cum.cummax()
    return (cum - running_max) / running_max


def sharpe(port_rets: pd.Series, currency: str = "INR") -> float:
    """
    Annualised Sharpe ratio: (ann_return - rf) / vol.

    Example input:  pd.Series of returns, currency="INR"
    Example output: 0.85
    """
    ar = ann_return(port_rets)
    vol = volatility(port_rets)
    rf = _rf(currency)
    if vol == 0:
        return 0.0
    return float((ar - rf) / vol)


def sortino(port_rets: pd.Series, currency: str = "INR") -> float:
    """
    Sortino ratio using downside deviation.

    Example input:  pd.Series of returns, currency="INR"
    Example output: 1.1
    """
    rf = _rf(currency)
    daily_rf = rf / 252
    downside = port_rets[port_rets < daily_rf] - daily_rf
    if len(downside) == 0:
        return 0.0
    downside_std = np.sqrt((downside ** 2).mean()) * np.sqrt(252)
    ar = ann_return(port_rets)
    if downside_std == 0:
        return 0.0
    return float((ar - rf) / downside_std)


def cvar95(port_rets: pd.Series) -> float:
    """
    Conditional Value at Risk at 95% confidence (expected loss in worst 5% of days).

    Example input:  pd.Series of 252 returns
    Example output: -0.032  (3.2% expected loss on worst days)
    """
    if len(port_rets) == 0:
        return 0.0
    var = float(np.percentile(port_rets, 5))
    tail = port_rets[port_rets <= var]
    if len(tail) == 0:
        return var
    return float(tail.mean())


def risk_contributions(weights: Sequence[float], cov: np.ndarray) -> np.ndarray:
    """
    Per-asset risk contribution: RC_i = w_i*(Sigma w)_i / sigma_p^2. Sums to 1.

    Example input:  weights=[0.6, 0.4], cov=[[0.04, 0.01],[0.01, 0.09]]
    Example output: array([0.65, 0.35])  (approx)
    """
    w = np.array(weights, dtype=float)
    w = w / w.sum()
    sigma_w = cov @ w
    port_var = float(w @ sigma_w)
    if port_var == 0:
        return np.ones(len(w)) / len(w)
    rc = w * sigma_w / port_var
    return rc


def diversification_ratio(weights: Sequence[float], cov: np.ndarray) -> float:
    """
    Diversification ratio: sum(w_i * sigma_i) / sigma_p.

    Example input:  weights=[0.5,0.5], cov=[[0.04,0],[0,0.09]]
    Example output: 1.17...  (> 1 means diversification benefit)
    """
    w = np.array(weights, dtype=float)
    w = w / w.sum()
    asset_vols = np.sqrt(np.diag(cov))
    weighted_vols = float(w @ asset_vols)
    port_vol = float(np.sqrt(w @ cov @ w))
    if port_vol == 0:
        return 1.0
    return weighted_vols / port_vol


def hhi(weights: Sequence[float]) -> float:
    """
    Herfindahl-Hirschman Index: sum(w_i^2). 1 = fully concentrated.

    Example input:  [0.5, 0.3, 0.2]
    Example output: 0.38
    """
    w = np.array(weights, dtype=float)
    w = w / w.sum()
    return float((w ** 2).sum())


def correlation_matrix(prices: pd.DataFrame) -> tuple[list[str], list[list[float]]]:
    """
    Compute correlation matrix from prices.

    Example input:  DataFrame with 3 asset columns
    Example output: (["A","B","C"], [[1.0, 0.4, 0.2], [0.4, 1.0, 0.3], [0.2, 0.3, 1.0]])
    """
    rets = simple_returns(prices).dropna()
    corr = rets.corr()
    tickers = list(corr.columns)
    matrix = [[round(float(corr.iloc[i, j]), 4) for j in range(len(tickers))] for i in range(len(tickers))]
    return tickers, matrix


def avg_correlation(prices: pd.DataFrame) -> float:
    """
    Average pairwise correlation (excluding diagonal).

    Example input:  DataFrame with 3 asset columns
    Example output: 0.45
    """
    rets = simple_returns(prices).dropna()
    corr = rets.corr()
    n = len(corr)
    if n <= 1:
        return 0.0
    total = corr.values.sum() - n  # exclude diagonal
    return float(total / (n * (n - 1)))


def covariance_matrix(prices: pd.DataFrame) -> np.ndarray:
    """
    Annualised sample covariance matrix from daily returns.

    Example input:  DataFrame with 252 rows, 3 columns
    Example output: 3x3 ndarray (annualised)
    """
    rets = simple_returns(prices).dropna()
    return rets.cov().values * 252


def compute_all_metrics(
    prices: pd.DataFrame,
    weights: Sequence[float],
    currency: str = "INR",
) -> dict:
    """
    Compute all standard metrics for a portfolio.

    Example input:  prices=DataFrame(252 rows, 2 cols), weights=[0.6,0.4], currency="INR"
    Example output: {total_return, ann_return, volatility, max_drawdown, sharpe, sortino,
                     diversification_ratio, cvar_95, avg_correlation, hhi}
    """
    w = np.array(weights, dtype=float)
    w = w / w.sum()

    port_rets = portfolio_returns(prices, w)

    total = float((1 + port_rets).prod() - 1)
    ar = ann_return(port_rets)
    vol = volatility(port_rets)
    mdd = max_drawdown(port_rets)
    sh = sharpe(port_rets, currency)
    so = sortino(port_rets, currency)
    cv = cvar95(port_rets)

    cov = covariance_matrix(prices)
    dr = diversification_ratio(w, cov)
    ac = avg_correlation(prices)
    h = hhi(w)

    return {
        "total_return": round(total, 6),
        "ann_return": round(ar, 6),
        "volatility": round(vol, 6),
        "max_drawdown": round(mdd, 6),
        "sharpe": round(sh, 4),
        "sortino": round(so, 4),
        "diversification_ratio": round(dr, 4),
        "cvar_95": round(cv, 6),
        "avg_correlation": round(ac, 4),
        "hhi": round(h, 4),
    }


def return_contributions(prices: pd.DataFrame, weights: Sequence[float]) -> np.ndarray:
    """
    Per-asset return contribution: w_i * mean_return_i / portfolio_mean_return.

    Example input:  prices DataFrame, weights
    Example output: array summing to 1
    """
    w = np.array(weights, dtype=float)
    w = w / w.sum()
    rets = simple_returns(prices).dropna()
    asset_ann = ((1 + rets).prod() ** (252 / len(rets)) - 1).values
    contributions = w * asset_ann
    total = contributions.sum()
    if total == 0:
        return np.ones(len(w)) / len(w)
    return contributions / total
