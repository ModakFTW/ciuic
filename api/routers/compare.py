"""api/routers/compare.py – POST /api/compare"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter

from api.errors import RiskScopeError
from api.helpers import (
    get_meta, resolve_period, load_and_validate,
    holdings_to_weights, resolve_benchmark
)
from api.schemas import CompareRequest
from engine.compare import compare_strategies

router = APIRouter()


def _try_import_predict():
    try:
        from engine.ml.predict import predict_risk
        return predict_risk
    except Exception:
        return None


def _try_import_optimize():
    try:
        from engine.optimize import optimize_weights
        return optimize_weights
    except Exception:
        return None


@router.post("/compare")
def compare(req: CompareRequest):
    tickers, weights = holdings_to_weights(req.holdings)
    start, end = resolve_period(req.period)
    prices = load_and_validate(tickers, start, end, req.currency)

    bench_ticker, bench_prices = resolve_benchmark(req.benchmark, tickers, req.currency, start, end)
    bench_prices = bench_prices.reindex(prices.index).ffill(limit=3).dropna()

    # Get recommended weights: optimize on 3y BEFORE period.start (no look-ahead)
    recommend_weights = None
    optimize_fn = _try_import_optimize()
    if optimize_fn is not None:
        try:
            pre_end = start
            pre_start = str((date.fromisoformat(start) - timedelta(days=3 * 365)).isoformat())
            pre_prices = load_and_validate(tickers, pre_start, pre_end, req.currency, min_rows=63)
            opt_result = optimize_fn(tickers, pre_prices, req.risk_level, req.currency)
            recommend_weights = opt_result.get("weights")
        except Exception:
            pass

    predict_fn = _try_import_predict()
    total_amount = sum(h.amount for h in req.holdings)

    result = compare_strategies(
        prices=prices,
        weights=weights,
        tickers=tickers,
        amount=total_amount,
        benchmark_prices=bench_prices,
        benchmark_ticker=bench_ticker,
        shield_floor=req.shield_floor,
        currency=req.currency,
        predict_fn=predict_fn,
        recommend_weights=recommend_weights,
    )
    result["meta"] = get_meta()
    return result
