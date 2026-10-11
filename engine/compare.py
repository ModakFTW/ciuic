"""
engine/compare.py  –  Five-strategy comparison engine (pure, no I/O).

compare_strategies(prices_full, holdings_weights, tickers, amount, period_start,
                   benchmark_prices, benchmark_ticker, shield_floor, currency, predict_fn) -> dict

Strategies:
  original       – user's portfolio (monthly rebalance)
  recommended    – JJ optimizer trained on 3y BEFORE period_start (equal-weight fallback)
  equal_weight   – equal weight across tickers
  insured        – CPPI applied to original
  benchmark      – ^NSEI or ^NDX or auto

Example input:  see router
Example output: {dates, series, metrics, weights, risk_labels, best_by, note, explanations, meta}
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Callable, Sequence

from engine.metrics import compute_all_metrics
from engine.simulate import simulate_portfolio
from engine.cppi import cppi_shield


def compare_strategies(
    prices: pd.DataFrame,
    weights: Sequence[float],
    tickers: list[str],
    amount: float,
    benchmark_prices: pd.Series,
    benchmark_ticker: str,
    shield_floor: float = -0.15,
    currency: str = "INR",
    predict_fn: Callable | None = None,
    recommend_weights: Sequence[float] | None = None,
) -> dict:
    """
    Run five strategies over the same period and collect metrics and growth series.

    recommend_weights: if provided by JJ's optimizer, use them; else fall back to equal weight.
    predict_fn: JJ's predict_risk(weights, prices) -> {label, ...}; if None, label = "N/A".

    Example input:  prices(756×5), weights=[0.2]*5, amount=1_000_000
    Example output: {dates, series:{original,...}, metrics:{original,...}, ...}
    """
    prices = prices.dropna(how="any")
    n = len(tickers)

    # Equal weight
    eq_weights = [1 / n] * n

    # Recommended: use provided or fall back to equal weight
    rec_weights = list(recommend_weights) if recommend_weights is not None else eq_weights

    # --- Simulate each strategy ---
    orig_sim = simulate_portfolio(prices, weights, amount, rebalance="monthly", currency=currency)
    rec_sim = simulate_portfolio(prices, rec_weights, amount, rebalance="monthly", currency=currency)
    eq_sim = simulate_portfolio(prices, eq_weights, amount, rebalance="monthly", currency=currency)

    # CPPI on original
    cppi_label_mult = 3.0
    if predict_fn is not None:
        try:
            pred = predict_fn(list(weights), prices)
            label = pred.get("label", "Medium")
            cppi_label_mult = {"Low": 4.0, "Medium": 3.0, "High": 2.0}.get(label, 3.0)
        except Exception:
            pass

    cppi_sim = cppi_shield(prices, weights, amount, floor=shield_floor, multiplier=cppi_label_mult, currency=currency)

    # Benchmark series (index to amount)
    bench_rets = benchmark_prices.pct_change().dropna()
    bench_values = [amount]
    for r in bench_rets.values:
        bench_values.append(bench_values[-1] * (1 + r))
    bench_values = bench_values[: len(orig_sim["dates"])]
    # Pad if needed
    while len(bench_values) < len(orig_sim["dates"]):
        bench_values.append(bench_values[-1])

    # --- Metrics ---
    def _metrics_from_sim(sim: dict) -> dict:
        return sim["metrics"]

    bench_series_s = pd.Series(bench_values)
    bench_sim_rets = bench_series_s.pct_change().dropna()
    bench_metrics = compute_all_metrics(
        pd.DataFrame({"bench": benchmark_prices}),
        [1.0],
        currency,
    )

    all_metrics = {
        "original": _metrics_from_sim(orig_sim),
        "recommended": _metrics_from_sim(rec_sim),
        "equal_weight": _metrics_from_sim(eq_sim),
        "insured": {
            **{k: v for k, v in orig_sim["metrics"].items()},
            "max_drawdown": cppi_sim["benefit"]["max_drawdown_insured"],
        },
        "benchmark": bench_metrics,
    }

    # --- Risk labels ---
    def _label(w, p):
        if predict_fn is None:
            return "N/A"
        try:
            return predict_fn(list(w), p).get("label", "N/A")
        except Exception:
            return "N/A"

    risk_labels = {
        "original": _label(weights, prices),
        "recommended": _label(rec_weights, prices),
        "equal_weight": _label(eq_weights, prices),
        "insured": _label(weights, prices),
        "benchmark": "N/A",
    }

    # --- best_by ---
    strategies = ["original", "recommended", "equal_weight", "insured", "benchmark"]
    best_by = {
        "total_return": max(strategies, key=lambda s: all_metrics[s].get("total_return", -999)),
        "volatility": min(strategies, key=lambda s: all_metrics[s].get("volatility", 999)),
        "max_drawdown": max(strategies, key=lambda s: all_metrics[s].get("max_drawdown", -999)),
        "sharpe": max(strategies, key=lambda s: all_metrics[s].get("sharpe", -999)),
    }

    explanations = [
        "Recommended allocation was optimized on data before the analysis period (no look-ahead).",
        f"Insured strategy applies a CPPI floor at {shield_floor*100:.0f}% of initial value.",
        "Equal-weight provides a naive diversification baseline.",
        f"Benchmark ({benchmark_ticker}) is shown in the same currency for comparison.",
    ]

    return {
        "dates": orig_sim["dates"],
        "series": {
            "original": orig_sim["series"]["portfolio"],
            "recommended": rec_sim["series"]["portfolio"],
            "equal_weight": eq_sim["series"]["portfolio"],
            "insured": cppi_sim["series"]["insured"],
            "benchmark": [round(v, 2) for v in bench_values],
        },
        "metrics": all_metrics,
        "weights": {
            "original": dict(zip(tickers, weights)),
            "recommended": dict(zip(tickers, rec_weights)),
            "equal_weight": dict(zip(tickers, eq_weights)),
        },
        "risk_labels": risk_labels,
        "best_by": best_by,
        "note": "Recommended allocation optimized only on data before period.start",
        "explanations": explanations,
    }
