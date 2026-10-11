"""
engine/cppi.py  –  CPPI (Constant Proportion Portfolio Insurance) Drawdown Shield.

cppi_shield(prices, weights, amount, floor, multiplier, currency) -> dict
    Simulates a CPPI strategy: risky sleeve = original monthly-rebalanced portfolio,
    safe sleeve = cash at risk-free rate. No leverage (risky share capped at 100%).

Example input:  prices=DataFrame(252 rows, 3 cols), weights=[0.4,0.3,0.3],
                amount=1_000_000, floor=-0.15, multiplier=3
Example output: {method, multiplier_used, floor_value_start, dates,
                 series:{unprotected, insured, floor},
                 risky_share:[...], cost, benefit, floor_breached, explanations}
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Sequence

from engine.metrics import max_drawdown, ann_return
from engine.simulate import simulate_portfolio

RF_INR = 0.065
RF_USD = 0.04


def _rf(currency: str) -> float:
    return RF_INR if currency.upper() == "INR" else RF_USD


def cppi_shield(
    prices: pd.DataFrame,
    weights: Sequence[float],
    amount: float,
    floor: float = -0.15,      # e.g. -0.15 means floor at -15% of initial
    multiplier: float = 3.0,
    currency: str = "INR",
) -> dict:
    """
    Run CPPI drawdown shield simulation.

    floor: negative fraction, e.g. -0.15 => floor = amount * (1 + floor)
    multiplier: CPPI multiplier (1-5). Higher = more aggressive.
    Safe sleeve earns daily risk-free rate. Risky sleeve = monthly-rebalanced original portfolio.
    No leverage: risky_share capped at 1.0.

    Example input:  cppi_shield(prices, [0.4,0.3,0.3], 1_000_000, -0.15, 3, "INR")
    Example output: dict with series, cost, benefit, floor_breached
    """
    w = np.array(weights, dtype=float)
    w = w / w.sum()

    prices = prices.dropna(how="any")
    if len(prices) < 2:
        return _empty_cppi(amount, floor, multiplier)

    rf = _rf(currency)
    daily_rf = (1 + rf) ** (1 / 252) - 1

    # Simulate unprotected (monthly rebalance, same weights)
    unprotected_sim = simulate_portfolio(prices, w, amount, rebalance="monthly", currency=currency)
    unprotected_series = unprotected_sim["series"]["portfolio"]
    dates = unprotected_sim["dates"]

    # Build insured series via CPPI
    F0 = amount * (1 + floor)  # initial floor value
    V = amount
    F = F0

    insured_values = [V]
    floor_values = [F]
    risky_shares = []
    floor_breached = False

    rets = prices.pct_change().dropna()

    for i, (date, row) in enumerate(rets.iterrows()):
        # Floor grows at risk-free rate
        F = F * (1 + daily_rf)

        cushion = max(V - F, 0.0)
        risky_share = min(1.0, multiplier * cushion / V) if V > 0 else 0.0
        risky_shares.append(round(risky_share, 4))

        # Return for this day: weighted asset return
        port_daily_ret = float(w @ row.values)
        risky_ret = port_daily_ret
        safe_ret = daily_rf

        V = V * (risky_share * (1 + risky_ret) + (1 - risky_share) * (1 + safe_ret))

        if V < F:
            floor_breached = True
            V = max(V, F)  # hard floor (gap risk absorbed)

        insured_values.append(round(V, 2))
        floor_values.append(round(F, 2))

    # Align lengths: prepend initial for risky_shares
    risky_shares = [risky_shares[0]] + risky_shares if risky_shares else [0.0]

    # Metrics
    insured_rets = pd.Series(insured_values).pct_change().dropna()
    unprotected_rets = pd.Series(unprotected_series).pct_change().dropna()

    mdd_unprotected = max_drawdown(unprotected_rets)
    mdd_insured = max_drawdown(insured_rets)

    # Annualised return drag
    ar_insured = ann_return(insured_rets)
    ar_unprotected = ann_return(unprotected_rets)
    return_drag = ar_unprotected - ar_insured
    premium_equivalent_pct = round(return_drag * 100, 2)

    loss_avoided = amount * (abs(mdd_unprotected) - abs(mdd_insured))

    explanations = _build_explanations(
        floor, multiplier, mdd_unprotected, mdd_insured, return_drag, floor_breached, loss_avoided
    )

    return {
        "method": "cppi",
        "multiplier_used": multiplier,
        "floor_value_start": round(F0, 2),
        "dates": dates,
        "series": {
            "unprotected": unprotected_series,
            "insured": insured_values,
            "floor": floor_values,
        },
        "risky_share": risky_shares[:len(dates)],
        "cost": {
            "return_drag_ann": round(return_drag, 6),
            "premium_equivalent_pct": premium_equivalent_pct,
        },
        "benefit": {
            "max_drawdown_unprotected": round(mdd_unprotected, 6),
            "max_drawdown_insured": round(mdd_insured, 6),
            "loss_avoided": round(loss_avoided, 2),
        },
        "floor_breached": floor_breached,
        "explanations": explanations,
    }


def _empty_cppi(amount: float, floor: float, multiplier: float) -> dict:
    F0 = amount * (1 + floor)
    return {
        "method": "cppi",
        "multiplier_used": multiplier,
        "floor_value_start": round(F0, 2),
        "dates": [],
        "series": {"unprotected": [], "insured": [], "floor": []},
        "risky_share": [],
        "cost": {"return_drag_ann": 0.0, "premium_equivalent_pct": 0.0},
        "benefit": {"max_drawdown_unprotected": 0.0, "max_drawdown_insured": 0.0, "loss_avoided": 0.0},
        "floor_breached": False,
        "explanations": ["Insufficient price data for CPPI simulation."],
    }


def _build_explanations(
    floor: float, multiplier: float,
    mdd_unprot: float, mdd_ins: float,
    return_drag: float, breached: bool, loss_avoided: float,
) -> list[str]:
    lines = []
    lines.append(
        f"The Drawdown Shield sets a floor at {floor*100:.0f}% of initial portfolio value "
        f"with a CPPI multiplier of {multiplier:.0f}."
    )
    lines.append(
        f"Unprotected maximum drawdown: {mdd_unprot*100:.1f}%. "
        f"Insured maximum drawdown: {mdd_ins*100:.1f}%."
    )
    if loss_avoided > 0:
        lines.append(f"Shield would have saved approximately ₹{loss_avoided:,.0f} at the worst point.")
    lines.append(
        f"The cost of protection is an estimated {return_drag*100:.2f}% annual return drag "
        f"({abs(return_drag*100):.2f}% premium equivalent)."
    )
    if breached:
        lines.append(
            "Note: The floor was breached at some point due to gap risk (a very sharp single-day move). "
            "The portfolio was reset to the floor value."
        )
    lines.append(
        "This is a simulated strategy, not a real insurance policy. "
        "Educational simulation only — not financial advice."
    )
    return lines
