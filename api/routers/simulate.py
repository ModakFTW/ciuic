"""api/routers/simulate.py – POST /api/simulate"""
from __future__ import annotations

from fastapi import APIRouter

from api.errors import RiskScopeError, INVALID_WEIGHTS
from api.helpers import (
    get_meta, resolve_period, load_and_validate, validate_tickers
)
from api.schemas import SimulateRequest
from engine.simulate import simulate_portfolio

router = APIRouter()


@router.post("/simulate")
def simulate(req: SimulateRequest):
    tickers = list(req.weights.keys())
    weights = list(req.weights.values())

    validate_tickers(tickers)

    total = sum(weights)
    if total <= 0:
        raise RiskScopeError(INVALID_WEIGHTS, "Weights must sum to a positive number.")
    weights = [w / total for w in weights]

    start, end = resolve_period(req.period)
    prices = load_and_validate(tickers, start, end, req.currency)

    result = simulate_portfolio(prices, weights, req.amount, req.rebalance, req.currency)
    result["meta"] = get_meta()
    return result
