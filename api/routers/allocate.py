"""
api/routers/allocate.py — POST /api/allocate

Implements optimal asset allocation using Ledoit-Wolf covariance shrinkage,
SLSQP optimization, 25 frontier candidates, and the ML risk gate.
Exact compliance with architecture.md §6 and decision D39.
"""

from __future__ import annotations

from typing import Any, Callable

import pandas as pd
from fastapi import APIRouter

from api.errors import (
    DATA_UNAVAILABLE,
    INSUFFICIENT_HISTORY,
    INTERNAL,
    INVALID_WEIGHTS,
    RiskScopeError,
)
from api.helpers import (
    get_meta,
    load_and_validate,
    resolve_period,
    validate_tickers,
)
from api.schemas import AllocateRequest
from data.loader import load_prices
from engine.optimize import optimize_portfolio

router = APIRouter()

# Dependency injection hook for price loader
_price_loader: Callable[..., pd.DataFrame] = load_prices


def set_price_loader(loader_fn: Callable[..., pd.DataFrame]) -> None:
    """Override the default price loader (for testing or synthetic feeds)."""
    global _price_loader
    _price_loader = loader_fn


def reset_price_loader() -> None:
    """Reset the price loader to the default data.loader.load_prices."""
    global _price_loader
    _price_loader = load_prices


@router.post("/allocate")
def allocate_portfolio(req: AllocateRequest) -> dict[str, Any]:
    """Find the optimal allocation adhering to requested risk level and asset caps."""
    try:
        # ── 1. Validate tickers ────────────────────────────────────────
        validate_tickers(req.tickers)

        if req.amount <= 0:
            raise RiskScopeError(INVALID_WEIGHTS, "Allocation amount must be > 0.")

        # ── 2. Parse current_weights ───────────────────────────────────
        cur_w_dict: dict[str, float] | None = None
        if req.current_weights is not None:
            if len(req.current_weights) != len(req.tickers):
                raise RiskScopeError(
                    INVALID_WEIGHTS,
                    f"Length of current_weights ({len(req.current_weights)}) "
                    f"must match tickers count ({len(req.tickers)}).",
                    tickers=req.tickers,
                )
            tot_w = sum(req.current_weights)
            if tot_w <= 0:
                raise RiskScopeError(INVALID_WEIGHTS, "Sum of current_weights must be > 0.")
            cur_w_dict = {tk: float(w) / tot_w for tk, w in zip(req.tickers, req.current_weights)}

        # ── 3. Resolve period & load prices ────────────────────────────
        start, end = resolve_period(req.period)

        try:
            if _price_loader is load_prices:
                prices = load_and_validate(req.tickers, start, end, req.currency, min_rows=63)
            else:
                validate_tickers(req.tickers)
                prices = _price_loader(req.tickers, start, end, req.currency)
                if prices.empty:
                    raise RiskScopeError(DATA_UNAVAILABLE, "No price data returned by loader.")
        except RiskScopeError:
            raise
        except Exception as e:
            raise RiskScopeError(DATA_UNAVAILABLE, f"Failed to load prices: {e}")

        if len(prices) < 63:
            raise RiskScopeError(
                INSUFFICIENT_HISTORY,
                f"Insufficient price history: got {len(prices)} rows, require at least 63.",
                tickers=req.tickers,
            )

        # ── 4. Run portfolio optimizer ─────────────────────────────────
        opt_res = optimize_portfolio(
            tickers=req.tickers,
            prices=prices,
            risk_level=req.risk_level,
            current_weights=cur_w_dict,
            amount=req.amount,
            currency=req.currency,
        )

        # ── 5. Metadata ────────────────────────────────────────────────
        meta = get_meta()
        if hasattr(prices, "attrs") and prices.attrs:
            if "data_source" in prices.attrs:
                meta["data_source"] = prices.attrs["data_source"]
            if "as_of" in prices.attrs:
                meta["as_of"] = prices.attrs["as_of"]
        opt_res["meta"] = meta

        return opt_res

    except RiskScopeError:
        raise
    except Exception as exc:
        raise RiskScopeError(INTERNAL, f"Allocation failed: {exc}")
