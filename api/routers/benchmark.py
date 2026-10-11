"""api/routers/benchmark.py – POST /api/benchmark"""
from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter

from api.errors import RiskScopeError, INVALID_WEIGHTS
from api.helpers import (
    get_meta, resolve_period, load_and_validate, validate_tickers, resolve_benchmark
)
from api.schemas import BenchmarkRequest
from engine.metrics import compute_all_metrics
from engine.simulate import simulate_portfolio

router = APIRouter()


@router.post("/benchmark")
def benchmark(req: BenchmarkRequest):
    tickers = list(req.weights.keys())
    weights = list(req.weights.values())

    validate_tickers(tickers)
    total = sum(weights)
    if total <= 0:
        raise RiskScopeError(INVALID_WEIGHTS, "Weights must sum to a positive number.")
    weights = [w / total for w in weights]

    start, end = resolve_period(req.period)
    prices = load_and_validate(tickers, start, end, req.currency)

    bench_ticker, bench_prices = resolve_benchmark(req.benchmark, tickers, req.currency, start, end)
    bench_prices = bench_prices.reindex(prices.index).ffill(limit=3).dropna()

    # Align
    common_idx = prices.index.intersection(bench_prices.index)
    prices = prices.loc[common_idx]
    bench_prices = bench_prices.loc[common_idx]

    port_sim = simulate_portfolio(prices, weights, req.amount, rebalance="monthly", currency=req.currency)
    bench_vals = [req.amount]
    bench_rets_s = bench_prices.pct_change().dropna()
    for r in bench_rets_s.values:
        bench_vals.append(bench_vals[-1] * (1 + r))
    bench_vals = bench_vals[:len(port_sim["dates"])]
    while len(bench_vals) < len(port_sim["dates"]):
        bench_vals.append(bench_vals[-1])

    port_metrics = port_sim["metrics"]
    bench_metrics = compute_all_metrics(
        pd.DataFrame({"b": bench_prices}), [1.0], req.currency
    )

    # Alpha, beta
    port_rets_s = pd.Series(port_sim["series"]["portfolio"]).pct_change().dropna()
    b_rets = bench_prices.pct_change().dropna().reindex(port_rets_s.index)
    if len(b_rets) >= 30 and b_rets.std() > 0:
        cov = np.cov(port_rets_s.values, b_rets.values)
        beta = float(cov[0, 1] / (b_rets.std() ** 2))
    else:
        beta = 1.0
    alpha = float(port_metrics.get("ann_return", 0) - beta * bench_metrics.get("ann_return", 0))
    excess_return = float(port_metrics.get("ann_return", 0) - bench_metrics.get("ann_return", 0))

    ps = port_metrics.get("sharpe", 0)
    bs = bench_metrics.get("sharpe", 0)
    if ps > bs * 1.05:
        verdict = "outperforming"
    elif ps < bs * 0.95:
        verdict = "underperforming"
    else:
        verdict = "in_line"

    explanations = [
        f"Portfolio annualised return: {port_metrics.get('ann_return',0)*100:.1f}% vs benchmark {bench_metrics.get('ann_return',0)*100:.1f}%.",
        f"Beta vs {bench_ticker}: {beta:.2f}. Alpha: {alpha*100:.2f}%.",
        f"Verdict: {verdict}.",
    ]

    # Port drawdown series
    port_dd = [0.0] + list(port_sim.get("drawdown", [])[1:])

    return {
        "portfolio": port_metrics,
        "benchmark": bench_metrics,
        "dates": port_sim["dates"],
        "series": {
            "portfolio": port_sim["series"]["portfolio"],
            "benchmark": [round(v, 2) for v in bench_vals],
        },
        "drawdown": {
            "portfolio": port_dd,
            "benchmark": [0.0] * len(port_sim["dates"]),
        },
        "alpha": round(alpha, 6),
        "beta": round(beta, 4),
        "excess_return": round(excess_return, 6),
        "verdict": verdict,
        "explanations": explanations,
        "meta": get_meta(),
    }
