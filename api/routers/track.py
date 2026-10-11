"""api/routers/track.py – POST /api/track"""
from __future__ import annotations

from fastapi import APIRouter

from api.errors import RiskScopeError, INVALID_WEIGHTS
from api.helpers import (
    get_meta, resolve_benchmark, lookback_to_dates,
    load_and_validate, validate_tickers, sector_map_from_tickers
)
from api.schemas import TrackRequest
from data.loader import latest_prices
from engine.track import build_track_result

router = APIRouter()


def _try_import_predict():
    try:
        from engine.ml.predict import predict_risk
        return predict_risk
    except Exception:
        return None


@router.post("/track")
def track(req: TrackRequest):
    tickers = [p.ticker for p in req.positions]
    validate_tickers(tickers)

    start, end = lookback_to_dates(req.lookback)
    prices = load_and_validate(tickers, start, end, req.currency)

    bench_ticker, bench_prices = resolve_benchmark(req.benchmark, tickers, req.currency, start, end)
    bench_prices = bench_prices.reindex(prices.index).ffill(limit=3).dropna()

    live = latest_prices(tickers)
    sector_map = sector_map_from_tickers(tickers)

    predict_fn = _try_import_predict()

    weights = [1.0 / len(tickers)] * len(tickers)  # approximate for risk label
    result = build_track_result(
        positions=[p.model_dump() for p in req.positions],
        latest_prices_data=live,
        prices_history=prices,
        benchmark_prices=bench_prices,
        benchmark_ticker=bench_ticker,
        sector_map=sector_map,
        lookback=req.lookback,
        currency=req.currency,
        predict_fn=predict_fn,
    )
    meta = get_meta()
    # Update meta data_source based on live data availability
    for info in live.values():
        if info.get("data_source") == "live":
            meta["data_source"] = "live"
            break
    result["meta"] = meta
    return result
