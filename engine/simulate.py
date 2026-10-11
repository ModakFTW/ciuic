"""
engine/simulate.py  –  Historical portfolio simulation (pure, no I/O).

simulate_portfolio(prices, weights, amount, rebalance, currency) -> dict
    Grows 'amount' through the price series with optional rebalancing.
    No look-ahead: rebalance decision is made at end-of-period close.

Example input:  prices=DataFrame(252 rows, 3 cols), weights=[0.4,0.3,0.3],
                amount=1000000, rebalance="monthly", currency="INR"
Example output: {metrics, final_value, dates:[...], series:{portfolio:[...]},
                 drawdown:[...], explanations:[...]}
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Sequence

from engine.metrics import (
    ann_return, volatility, max_drawdown, sharpe, sortino, cvar95,
    diversification_ratio, covariance_matrix, avg_correlation, hhi,
    drawdown_series, simple_returns,
)


def simulate_portfolio(
    prices: pd.DataFrame,
    weights: Sequence[float],
    amount: float,
    rebalance: str = "monthly",  # "none" | "monthly" | "quarterly"
    currency: str = "INR",
) -> dict:
    """
    Simulate portfolio growth with optional rebalancing.

    No look-ahead: rebalance is triggered at each period-end using only
    prices available up to (and including) that point.

    Example input:  prices(252×3), weights=[0.4,0.3,0.3], amount=1_000_000
    Example output: dict with dates, series, drawdown, metrics, final_value
    """
    w = np.array(weights, dtype=float)
    w = w / w.sum()
    prices = prices.dropna(how="any")

    if len(prices) < 2:
        return _empty_result(amount)

    rets = prices.pct_change().dropna()

    # Build growth series with rebalancing
    n = len(rets)
    port_values = [amount]
    current_w = w.copy()

    dates_idx = rets.index

    for i, (date, row) in enumerate(rets.iterrows()):
        daily_asset_rets = row.values
        period_return = float(current_w @ daily_asset_rets)
        new_val = port_values[-1] * (1 + period_return)
        port_values.append(new_val)

        # Drift weights
        asset_growth = current_w * (1 + daily_asset_rets)
        total = asset_growth.sum()
        if total > 0:
            current_w = asset_growth / total

        # Rebalance check (end of month / quarter)
        if i < n - 1:  # don't rebalance on last day
            next_date = dates_idx[i + 1]
            if _should_rebalance(date, next_date, rebalance):
                current_w = w.copy()

    # Align to rets index (rets has n rows, values has n+1 entries)
    port_values_series = pd.Series(port_values[1:], index=dates_idx)
    full_index = pd.DatetimeIndex([prices.index[0]]).append(dates_idx)
    full_values = pd.Series([amount] + port_values[1:], index=full_index)

    # Port returns (for metrics)
    port_rets = full_values.pct_change().dropna()

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
    total_ret = float(full_values.iloc[-1] / amount - 1)

    dd_ser = drawdown_series(port_rets)

    explanations = _build_explanations(ar, vol, mdd, sh, rebalance)

    return {
        "metrics": {
            "total_return": round(total_ret, 6),
            "ann_return": round(ar, 6),
            "volatility": round(vol, 6),
            "max_drawdown": round(mdd, 6),
            "sharpe": round(sh, 4),
            "sortino": round(so, 4),
            "diversification_ratio": round(dr, 4),
            "cvar_95": round(cv, 6),
            "avg_correlation": round(ac, 4),
            "hhi": round(h, 4),
        },
        "final_value": round(float(full_values.iloc[-1]), 2),
        "dates": [str(d.date()) for d in full_index],
        "series": {
            "portfolio": [round(v, 2) for v in full_values.tolist()],
        },
        "drawdown": [0.0] + [round(v, 6) for v in dd_ser.tolist()],
        "explanations": explanations,
    }


def _should_rebalance(current: pd.Timestamp, next_ts: pd.Timestamp, mode: str) -> bool:
    """Check if we cross a rebalance boundary between current and next date."""
    if mode == "none":
        return False
    if mode == "monthly":
        return current.month != next_ts.month
    if mode == "quarterly":
        return (current.month - 1) // 3 != (next_ts.month - 1) // 3
    return False


def _empty_result(amount: float) -> dict:
    return {
        "metrics": {
            "total_return": 0.0, "ann_return": 0.0, "volatility": 0.0,
            "max_drawdown": 0.0, "sharpe": 0.0, "sortino": 0.0,
            "diversification_ratio": 1.0, "cvar_95": 0.0,
            "avg_correlation": 0.0, "hhi": 1.0,
        },
        "final_value": amount,
        "dates": [],
        "series": {"portfolio": []},
        "drawdown": [],
        "explanations": ["Insufficient price data for simulation."],
    }


def _build_explanations(ar: float, vol: float, mdd: float, sh: float, rebalance: str) -> list[str]:
    lines = []
    lines.append(
        f"Portfolio returned {ar*100:.1f}% annualised with {vol*100:.1f}% annualised volatility."
    )
    lines.append(f"Maximum drawdown was {mdd*100:.1f}%.")
    lines.append(f"Sharpe ratio: {sh:.2f}.")
    if rebalance != "none":
        lines.append(f"Portfolio was rebalanced {rebalance} to target weights.")
    return lines
