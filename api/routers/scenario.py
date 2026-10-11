"""
api/routers/scenario.py — POST /api/scenario stress testing and historical replay.

Frozen contract per architecture.md §6 and decisions D52, D53.
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
    UNIVERSE_MAP,
    get_meta,
    validate_tickers,
)
from api.schemas import ScenarioRequest
from data.loader import load_prices
from engine.scenario import apply_scenario

router = APIRouter()

# Pluggable price loader for unit test dependency injection
_price_loader: Callable[..., pd.DataFrame] = load_prices


def set_price_loader(loader: Callable[..., pd.DataFrame]) -> None:
    """Override price loader (used in testing)."""
    global _price_loader
    _price_loader = loader


def reset_price_loader() -> None:
    """Reset price loader to default load_prices."""
    global _price_loader
    _price_loader = load_prices


@router.post("/scenario")
def post_scenario(req: ScenarioRequest) -> dict[str, Any]:
    """Execute a stress test scenario or historical replay.

    Conforms to architecture.md §6:
    Input:  {weights, amount, scenario, magnitude?, sector?, replay?}
    Output: {scenario, value_before, value_after, impact_pct, metrics_after,
             risk_label_before, risk_label_after, asset_impacts:[{ticker, impact_pct}],
             mc?:{p5, p50, p95}, explanations, meta}
    """
    try:
        # ── 1. Validate weights & tickers ──────────────────────────────
        tickers = list(req.weights.keys())
        if not (1 <= len(tickers) <= 15):
            raise RiskScopeError(
                INVALID_WEIGHTS,
                f"Portfolio must have 1-15 holdings, got {len(tickers)}.",
                tickers=tickers,
            )

        validate_tickers(tickers)

        tot_w = sum(req.weights.values())
        if tot_w <= 0:
            raise RiskScopeError(INVALID_WEIGHTS, "Sum of weights must be > 0.")

        if req.amount <= 0:
            raise RiskScopeError(INVALID_WEIGHTS, "Amount must be > 0.")

        # ── 2. Load historical prices (covering replay & 252d beta window) ──
        # Load from 2019 to cover covid_2020 (Feb 2020) and bear_2022
        start_date = "2019-01-01"
        end_date = "2026-10-15"
        req_tickers = list(set(tickers + ["^NSEI", "^NDX"]))

        try:
            prices = _price_loader(req_tickers, start_date, end_date, "INR")
            if prices.empty:
                raise RiskScopeError(DATA_UNAVAILABLE, "No price data returned by loader.")
        except RiskScopeError:
            raise
        except Exception as e:
            raise RiskScopeError(DATA_UNAVAILABLE, f"Failed to load prices: {e}")

        # Check required tickers
        missing = [t for t in tickers if t not in prices.columns]
        if missing:
            raise RiskScopeError(
                DATA_UNAVAILABLE,
                f"Missing price data for tickers: {missing}",
                tickers=missing,
            )

        if len(prices) < 63:
            raise RiskScopeError(
                INSUFFICIENT_HISTORY,
                f"Insufficient price history: got {len(prices)} rows, require at least 63.",
                tickers=tickers,
            )

        # ── 3. Build sector mapping ────────────────────────────────────
        sector_map = {t: UNIVERSE_MAP.get(t, {}).get("sector", "Other") for t in tickers}

        # ── 4. Execute engine stress test ──────────────────────────────
        res = apply_scenario(
            weights=req.weights,
            prices=prices,
            scenario=req.scenario,
            amount=req.amount,
            magnitude=req.magnitude,
            sector=req.sector,
            sector_map=sector_map,
            replay=req.replay,
            rf=0.065,
        )

        # ── 5. Attach metadata ─────────────────────────────────────────
        meta = get_meta()
        if hasattr(prices, "attrs") and prices.attrs:
            if "data_source" in prices.attrs:
                meta["data_source"] = prices.attrs["data_source"]
            if "as_of" in prices.attrs:
                meta["as_of"] = prices.attrs["as_of"]
        res["meta"] = meta

        return res

    except RiskScopeError:
        raise
    except Exception as exc:
        raise RiskScopeError(INTERNAL, f"Scenario failed: {exc}")
