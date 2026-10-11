"""
api/routers/brief.py — POST /api/brief

Executive portfolio risk briefing endpoint combining ML risk analysis,
optional portfolio allocation/shield metrics, recent headlines, and LLM synthesis.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from api.helpers import get_meta
from engine.llm.news import get_headlines
from engine.llm.router import generate_brief_text

router = APIRouter()

DISCLAIMER_TEXT = (
    "Educational simulation. Not financial advice. Past performance does not predict "
    "future results. The Drawdown Shield is a simulated strategy, not an insurance policy."
)


class BriefRequest(BaseModel):
    analyze: dict[str, Any]
    allocate: Optional[dict[str, Any]] = None
    compare: Optional[dict[str, Any]] = None
    shield: Optional[dict[str, Any]] = None
    tickers: Optional[list[str]] = None


@router.post("/brief")
def create_brief(req: BriefRequest) -> dict[str, Any]:
    """Generate an executive summary brief for portfolio risk analysis."""
    analyze = req.analyze
    allocate = req.allocate
    compare = req.compare
    shield = req.shield

    # 1. Copy risk metrics from analyze UNCHANGED (ML model decides)
    risk_label = analyze.get("risk_label", "Medium")
    risk_score = analyze.get("risk_score", 50)
    probs = analyze.get("probs", {})

    # Compute ml_margin: top1 prob - top2 prob
    p_values = sorted([float(v) for v in probs.values()], reverse=True) if probs else []
    if len(p_values) >= 2:
        ml_margin = round(p_values[0] - p_values[1], 4)
    elif len(p_values) == 1:
        ml_margin = round(p_values[0], 4)
    else:
        ml_margin = 0.0

    # 2. Extract facts from payloads
    risk_drivers_raw = analyze.get("risk_drivers", [])
    risk_drivers_factor_dir = [
        {"factor": d.get("factor", ""), "direction": d.get("direction", "")}
        for d in risk_drivers_raw
        if isinstance(d, dict)
    ]

    explanations: list[str] = list(analyze.get("explanations", []))
    if allocate and isinstance(allocate.get("explanations"), list):
        for e in allocate["explanations"]:
            if e not in explanations:
                explanations.append(e)

    facts: dict[str, Any] = {
        "risk_label": risk_label,
        "risk_score": risk_score,
        "probs": probs,
        "risk_drivers": risk_drivers_factor_dir,
        "explanations": explanations,
        "data_source": analyze.get("meta", {}).get("data_source", "cache"),
        "as_of": analyze.get("meta", {}).get("as_of", ""),
    }

    if allocate and "tradeoff" in allocate:
        facts["tradeoff"] = allocate["tradeoff"]

    if shield:
        shield_info: dict[str, Any] = {}
        if "benefit" in shield:
            shield_info["benefit"] = shield["benefit"]
        if "cost" in shield:
            shield_info["cost"] = shield["cost"]
        if "shield_benefit" in shield:
            shield_info["shield_benefit"] = shield["shield_benefit"]
        if shield_info:
            facts["shield"] = shield_info

    # 3. Determine mode and fetch headlines if eligible
    env_mode = os.environ.get("BRIEF_MODE", "auto").lower().strip()
    mode = env_mode if env_mode in ("template", "cache", "auto") else "auto"

    headlines: dict[str, list[dict[str, str]]] = {}
    if mode not in ("template", "cache"):
        # Resolve tickers
        tickers = req.tickers or []
        if not tickers:
            holdings = analyze.get("holdings", [])
            if isinstance(holdings, list):
                tickers = [h.get("ticker", "") for h in holdings if isinstance(h, dict) and h.get("ticker")]
        if not tickers and isinstance(analyze.get("correlation", {}).get("tickers"), list):
            tickers = analyze["correlation"]["tickers"]

        if tickers:
            headlines = get_headlines(tickers[:8])

    # 4. Generate brief text
    brief_res = generate_brief_text(facts=facts, headlines=headlines, mode=mode)
    brief_data = brief_res.get("brief", {})
    summary = brief_data.get("summary", "")
    key_points = brief_data.get("key_points", [])
    reviewer = brief_data.get("reviewer", {"severity": "low", "concerns": []})

    # 5. Compute watch_flag in Python: (ml_margin < 0.15) and (reviewer.severity == "high")
    rev_severity = str(reviewer.get("severity", "low")).lower()
    watch_flag = bool((ml_margin < 0.15) and (rev_severity == "high"))

    meta = analyze.get("meta", get_meta())

    return {
        "risk_label": risk_label,
        "risk_score": risk_score,
        "probs": probs,
        "ml_margin": ml_margin,
        "watch_flag": watch_flag,
        "summary": summary,
        "key_points": key_points,
        "reviewer": reviewer,
        "headlines": headlines,
        "provider_used": brief_res.get("provider_used"),
        "providers_tried": brief_res.get("providers_tried", []),
        "fallback": brief_res.get("fallback", False),
        "source": brief_res.get("source", "template"),
        "mode": brief_res.get("mode", mode),
        "disclaimer": DISCLAIMER_TEXT,
        "meta": meta,
    }
