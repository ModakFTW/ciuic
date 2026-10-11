"""
engine/track.py  –  Live portfolio tracking engine (pure, no I/O).

build_track_result(positions, latest_prices, prices_history, benchmark_prices,
                   benchmark_ticker, lookback, currency, predict_fn) -> dict

Example input:  positions=[{ticker,quantity,buy_price}], latest={"NVDA":{price:900,...}}
Example output: {positions:[...], total_value, total_cost, total_pnl, total_pnl_pct,
                 risk, allocation, sector_exposure, benchmark, explanations, meta}
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Callable, Sequence

from engine.metrics import (
    compute_all_metrics, covariance_matrix, avg_correlation, hhi
)
from engine.simulate import simulate_portfolio


def build_track_result(
    positions: list[dict],
    latest_prices_data: dict[str, dict],
    prices_history: pd.DataFrame,
    benchmark_prices: pd.Series,
    benchmark_ticker: str,
    sector_map: dict[str, str],
    lookback: str = "1y",
    currency: str = "INR",
    predict_fn: Callable | None = None,
) -> dict:
    """
    Build the /track response from live positions.

    positions: list of {ticker, quantity, buy_price}
    latest_prices_data: output of data.loader.latest_prices()
    prices_history: DataFrame of historical prices for metrics
    predict_fn: JJ's predict_risk(weights, prices) -> {label, score, probs, confidence}

    Example input:  positions=[{"ticker":"NVDA","quantity":10,"buy_price":800}]
    Example output: full /track response dict
    """
    # --- Compute per-position P&L ---
    computed_positions = []
    total_value = 0.0
    total_cost = 0.0

    for pos in positions:
        ticker = pos["ticker"]
        qty = float(pos["quantity"])
        buy_price = float(pos["buy_price"])
        cost = qty * buy_price

        price_info = latest_prices_data.get(ticker, {})
        price = price_info.get("price")
        day_change = price_info.get("day_change", 0.0)
        data_source = price_info.get("data_source", "unavailable")

        if price is None:
            price = buy_price  # fallback to cost

        value = qty * price
        pnl = value - cost
        pnl_pct = pnl / cost if cost > 0 else 0.0

        computed_positions.append({
            "ticker": ticker,
            "price": round(price, 4),
            "value": round(value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 6),
            "weight": 0.0,  # filled below
            "day_change": round(day_change, 6) if day_change is not None else 0.0,
        })
        total_value += value
        total_cost += cost

    # Compute weights
    tickers = [p["ticker"] for p in positions]
    weights = []
    for cp in computed_positions:
        w = cp["value"] / total_value if total_value > 0 else 0.0
        cp["weight"] = round(w, 6)
        weights.append(w)

    total_pnl = total_value - total_cost
    total_pnl_pct = total_pnl / total_cost if total_cost > 0 else 0.0

    # --- Allocation and sector exposure ---
    allocation = {cp["ticker"]: cp["weight"] for cp in computed_positions}
    sector_exposure: dict[str, float] = {}
    for cp in computed_positions:
        sector = sector_map.get(cp["ticker"], "Unknown")
        sector_exposure[sector] = sector_exposure.get(sector, 0.0) + cp["weight"]
    sector_exposure = {k: round(v, 4) for k, v in sector_exposure.items()}

    # --- Risk label ---
    risk_result = {"label": "N/A", "score": 0, "probs": {"Low": 0.33, "Medium": 0.33, "High": 0.34}, "confidence": 0.33}
    if predict_fn is not None and len(prices_history) > 30:
        try:
            risk_result = predict_fn(weights, prices_history)
        except Exception:
            pass

    # --- Benchmark overlay ---
    bench_result = _build_benchmark_overlay(
        prices_history, weights, tickers, benchmark_prices, benchmark_ticker, currency
    )

    explanations = _build_explanations(computed_positions, total_pnl_pct, risk_result)

    return {
        "positions": computed_positions,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 6),
        "risk": {
            "label": risk_result.get("label", "N/A"),
            "score": risk_result.get("risk_score", 0),
            "probs": risk_result.get("probs", {"Low": 0.33, "Medium": 0.33, "High": 0.34}),
        },
        "allocation": allocation,
        "sector_exposure": sector_exposure,
        "benchmark": bench_result,
        "explanations": explanations,
    }


def _build_benchmark_overlay(
    prices: pd.DataFrame,
    weights: list[float],
    tickers: list[str],
    benchmark_prices: pd.Series,
    benchmark_ticker: str,
    currency: str,
) -> dict:
    """Build benchmark comparison section of the track response."""
    if prices.empty or len(prices) < 2:
        return {
            "ticker": benchmark_ticker,
            "dates": [],
            "series": {"portfolio": [], "benchmark": []},
            "portfolio": {},
            "benchmark_metrics": {},
            "verdict": "in_line",
        }

    port_sim = simulate_portfolio(prices, weights, 100.0, rebalance="none", currency=currency)
    bench_rets = benchmark_prices.reindex(prices.index).pct_change().dropna()

    # Benchmark series indexed to 100
    bench_values = [100.0]
    for r in bench_rets.values:
        bench_values.append(bench_values[-1] * (1 + r))

    dates = port_sim["dates"]
    bench_values = bench_values[: len(dates)]
    while len(bench_values) < len(dates):
        bench_values.append(bench_values[-1])

    port_metrics = port_sim["metrics"]
    bench_metrics = compute_all_metrics(
        pd.DataFrame({"b": benchmark_prices.reindex(prices.index).dropna()}),
        [1.0],
        currency,
    )

    port_sharpe = port_metrics.get("sharpe", 0)
    bench_sharpe = bench_metrics.get("sharpe", 0)
    if port_sharpe > bench_sharpe * 1.05:
        verdict = "outperforming"
    elif port_sharpe < bench_sharpe * 0.95:
        verdict = "underperforming"
    else:
        verdict = "in_line"

    return {
        "ticker": benchmark_ticker,
        "dates": dates,
        "series": {
            "portfolio": port_sim["series"]["portfolio"],
            "benchmark": [round(v, 2) for v in bench_values],
        },
        "portfolio": port_metrics,
        "benchmark_metrics": bench_metrics,
        "verdict": verdict,
    }


def _build_explanations(positions: list[dict], total_pnl_pct: float, risk: dict) -> list[str]:
    lines = []
    pnl_str = f"+{total_pnl_pct*100:.1f}%" if total_pnl_pct >= 0 else f"{total_pnl_pct*100:.1f}%"
    lines.append(f"Your portfolio is {pnl_str} since purchase.")

    top = sorted(positions, key=lambda p: abs(p["pnl"]), reverse=True)
    if top:
        t = top[0]
        sign = "gained" if t["pnl"] >= 0 else "lost"
        lines.append(f"{t['ticker']} has {sign} the most in absolute terms.")

    label = risk.get("label", "N/A")
    if label != "N/A":
        lines.append(f"Current risk classification: {label}.")

    return lines
