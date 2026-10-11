"""api/routers/shield.py – POST /api/shield"""
from __future__ import annotations

from fastapi import APIRouter

from api.errors import RiskScopeError, INVALID_WEIGHTS
from api.helpers import (
    get_meta, resolve_period, load_and_validate, validate_tickers
)
from api.schemas import ShieldRequest
from engine.cppi import cppi_shield

router = APIRouter()

DEFAULT_MULTIPLIER_BY_LABEL = {"Low": 4.0, "Medium": 3.0, "High": 2.0}


def _try_import_predict():
    try:
        from engine.ml.predict import predict_risk
        return predict_risk
    except Exception:
        return None


@router.post("/shield")
def shield(req: ShieldRequest):
    tickers = list(req.weights.keys())
    weights = list(req.weights.values())

    validate_tickers(tickers)
    total = sum(weights)
    if total <= 0:
        raise RiskScopeError(INVALID_WEIGHTS, "Weights must sum to a positive number.")
    weights = [w / total for w in weights]

    start, end = resolve_period(req.period)
    prices = load_and_validate(tickers, start, end, "INR")  # shield always in INR for CPPI calcs

    # Determine multiplier
    multiplier = req.multiplier
    if multiplier is None:
        predict_fn = _try_import_predict()
        if predict_fn is not None:
            try:
                pred = predict_fn(weights, prices)
                label = pred.get("label", "Medium")
                multiplier = DEFAULT_MULTIPLIER_BY_LABEL.get(label, 3.0)
            except Exception:
                multiplier = 3.0
        else:
            multiplier = 3.0

    result = cppi_shield(prices, weights, req.amount, req.floor, multiplier, "INR")
    result["meta"] = get_meta()
    return result
