"""api/routers/meta.py – /health, /assets/search, /presets, /regimes, /prices/live, /model/info"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query

from api.errors import RiskScopeError, DATA_UNAVAILABLE
from api.helpers import get_meta, VALID_TICKERS, UNIVERSE_MAP
from data.loader import latest_prices

router = APIRouter()

UNIVERSE_PATH = Path(__file__).parent.parent.parent / "data" / "universe.json"
PRESETS_PATH = Path(__file__).parent.parent.parent / "data" / "presets.json"
EVAL_PATH = Path(__file__).parent.parent.parent / "engine" / "ml" / "models" / "eval.json"


@router.get("/health")
def health():
    meta = get_meta()
    model_version = "1.0.0"
    if EVAL_PATH.exists():
        try:
            ev = json.loads(EVAL_PATH.read_text())
            model_version = ev.get("model_version", "1.0.0")
        except Exception:
            pass
    return {"status": "ok", "model_version": model_version, "meta": meta}


@router.get("/assets/search")
def assets_search(q: str = Query("", description="Search query")):
    with open(UNIVERSE_PATH) as f:
        data = json.load(f)
    q_lower = q.lower()
    results = []
    for asset in data["assets"]:
        if (
            q_lower in asset["ticker"].lower()
            or q_lower in asset["name"].lower()
            or q_lower in asset.get("sector", "").lower()
        ):
            results.append({
                "ticker": asset["ticker"],
                "name": asset["name"],
                "sector": asset.get("sector", ""),
                "market": asset.get("market", ""),
                "currency": asset.get("currency", ""),
            })
    return {"results": results, "meta": get_meta()}


@router.get("/presets")
def presets():
    with open(PRESETS_PATH) as f:
        data = json.load(f)
    meta = get_meta()
    return {"presets": data, "meta": meta}


@router.get("/regimes")
def regimes():
    meta = get_meta()
    return {
        "regimes": [
            {"id": "bull_2021", "label": "Bull 2021", "start": "2020-11-01", "end": "2021-11-15"},
            {"id": "bear_2022", "label": "Bear 2022", "start": "2022-01-03", "end": "2022-10-12"},
            {"id": "covid_2020", "label": "COVID Crash 2020", "start": "2020-02-19", "end": "2020-03-23"},
            {"id": "recovery_2023", "label": "Recovery 2023", "start": "2023-01-01", "end": "2023-12-31"},
        ],
        "meta": meta,
    }


@router.get("/prices/live")
def prices_live(tickers: str = Query(..., description="Comma-separated tickers")):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    bad = [t for t in ticker_list if t not in VALID_TICKERS and t not in {a for a in UNIVERSE_MAP}]
    if bad:
        raise RiskScopeError(DATA_UNAVAILABLE, f"Tickers not in universe: {bad}", tickers=bad)

    live = latest_prices(ticker_list)
    meta = get_meta()
    prices_out = []
    for ticker in ticker_list:
        info = live.get(ticker, {})
        prices_out.append({
            "ticker": ticker,
            "price": info.get("price"),
            "day_change": info.get("day_change"),
            "currency": info.get("currency", ""),
        })
        if info.get("data_source") == "live":
            meta["data_source"] = "live"

    return {"prices": prices_out, "meta": meta}


@router.get("/model/info")
def model_info():
    meta = get_meta()
    if EVAL_PATH.exists():
        ev = json.loads(EVAL_PATH.read_text())
        return {**ev, "meta": meta}
    # Default stub if model not yet trained
    return {
        "trained_on": "not_yet_trained",
        "n_samples": 0,
        "label_definition": "0.5*fwd_vol/0.18 + 0.5*abs(fwd_mdd)/0.18",
        "cutpoints": {"low_medium": None, "medium_high": None},
        "test_period": {"start": "2023-01-01", "end": None},
        "metrics": {
            "model": {"macro_f1": None, "accuracy": None, "off_by_two": None},
            "logreg": {"macro_f1": None, "accuracy": None, "off_by_two": None},
            "persistence": {"macro_f1": None, "accuracy": None, "off_by_two": None},
            "majority": {"macro_f1": None, "accuracy": None, "off_by_two": None},
        },
        "confusion_matrix": None,
        "median_fwd_vol": {"Low": None, "Medium": None, "High": None},
        "meta": meta,
    }
