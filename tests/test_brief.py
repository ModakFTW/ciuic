"""
tests/test_brief.py — Test suite for briefing router, validation, news, and /api/brief endpoint.

All tests run completely offline with fake providers, temporary directories, and network mocking.
"""

from __future__ import annotations

import json
import os
import socket
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from api.main import app
from engine.llm import router
from engine.llm.router import _PROVIDER_FAILURES, generate_brief_text


@pytest.fixture(autouse=True)
def clean_circuit_breaker(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Reset circuit breaker and set clean temporary cache directory for each test."""
    _PROVIDER_FAILURES.clear()
    monkeypatch.setenv("LLM_CACHE_DIR", str(tmp_path / "llm_cache"))
    monkeypatch.setenv("NEWS_CACHE_DIR", str(tmp_path / "news_cache"))


@pytest.fixture
def sample_facts() -> dict:
    return {
        "risk_label": "High",
        "risk_score": 78,
        "probs": {"Low": 0.15, "Medium": 0.25, "High": 0.60},
        "risk_drivers": [
            {"factor": "volatility_252", "direction": "High"},
            {"factor": "avg_correlation", "direction": "High"},
        ],
        "explanations": [
            "High portfolio volatility of 28.5% pushes risk toward High.",
            "Top risk contributors drive over 60% of total volatility.",
        ],
        "data_source": "cache",
        "as_of": "2026-10-09",
    }


def test_template_works_with_no_keys(sample_facts: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    """1. Template works with no keys configured."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)

    res = generate_brief_text(sample_facts)
    assert res["source"] == "template"
    assert res["provider_used"] is None
    brief = res["brief"]
    assert "High" in brief["summary"]
    assert len(brief["key_points"]) <= 4
    assert brief["reviewer"]["severity"] == "low"


def test_mode_template_never_calls_provider(sample_facts: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    """2. mode='template' never calls a provider even if configured."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-1.5-flash")

    with patch("engine.llm.router._execute_provider") as mock_exec:
        res = generate_brief_text(sample_facts, mode="template")
        assert res["source"] == "template"
        assert res["mode"] == "template"
        assert res["providers_tried"] == []
        mock_exec.assert_not_called()


def test_bad_json_tries_next_provider(sample_facts: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    """3. bad JSON -> next provider succeeds."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-1.5-flash")
    monkeypatch.setenv("GROQ_API_KEY", "fake_key")
    monkeypatch.setenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    valid_groq_resp = {
        "summary": "High risk portfolio with 78 risk score based on 2026-10-09 data.",
        "key_points": ["Top risk contributors drive over 60% of total volatility."],
        "reviewer": {"severity": "medium", "concerns": ["Elevated portfolio concentration."]},
    }

    def fake_execute(provider: str, prompt: str, timeout: float):
        if provider == "gemini":
            raise ValueError("Bad JSON returned by gemini")
        return valid_groq_resp

    with patch("engine.llm.router._execute_provider", side_effect=fake_execute):
        res = generate_brief_text(sample_facts, providers=["gemini", "groq"], mode="auto")
        assert res["source"] == "llm"
        assert res["provider_used"] == "groq"
        assert "gemini" in res["providers_tried"]
        assert "groq" in res["providers_tried"]
        assert res["brief"]["summary"] == valid_groq_resp["summary"]


def test_invented_number_or_label_change_falls_back_to_template(sample_facts: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    """4. Invented number -> rejected -> template, ML risk_label preserved."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-1.5-flash")

    # 99.99 is not in sample_facts
    hallucinated_resp = {
        "summary": "Portfolio risk is Moderate with an invented figure of 99.99 percent.",
        "key_points": ["Invented number 99.99."],
        "reviewer": {"severity": "low", "concerns": []},
    }

    with patch("engine.llm.router._execute_provider", return_value=hallucinated_resp):
        res = generate_brief_text(sample_facts, mode="auto")
        # Rejected because of invented number 99.99 -> fallback to template
        assert res["source"] == "template"
        assert res["fallback"] is True

    # Test via API router
    client = TestClient(app)
    req_body = {
        "analyze": sample_facts,
    }
    with patch("engine.llm.router._execute_provider", return_value=hallucinated_resp):
        api_res = client.post("/api/brief", json=req_body)
        assert api_res.status_code == 200
        data = api_res.json()
        # ML model decides risk_label: unchanged "High"
        assert data["risk_label"] == "High"
        assert data["risk_score"] == 78
        assert data["fallback"] is True
        assert data["source"] == "template"


def test_provider_failure_skipped_on_next_call(sample_facts: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    """5. A provider that fails is skipped on the next call (within 60s)."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-1.5-flash")

    call_count = 0

    def fail_execute(provider: str, prompt: str, timeout: float):
        nonlocal call_count
        call_count += 1
        raise ConnectionError("Network failure")

    with patch("engine.llm.router._execute_provider", side_effect=fail_execute):
        res1 = generate_brief_text(sample_facts, providers=["gemini"], mode="auto")
        assert res1["source"] == "template"
        assert call_count == 1

        # Second call immediately after: gemini should be skipped by circuit breaker
        res2 = generate_brief_text(sample_facts, providers=["gemini"], mode="auto")
        assert res2["source"] == "template"
        assert call_count == 1  # Not called again!
        assert "gemini" not in res2["providers_tried"]


def test_watch_flag_logic() -> None:
    """6. watch_flag only when (ml_margin < 0.15) AND (reviewer.severity == 'high')."""
    client = TestClient(app)

    # Permutation 1: margin < 0.15 AND severity == high -> True
    facts1 = {
        "risk_label": "High",
        "risk_score": 75,
        "probs": {"Low": 0.20, "Medium": 0.38, "High": 0.42},  # margin = 0.42 - 0.38 = 0.04 < 0.15
        "data_source": "cache",
        "as_of": "2026-10-09",
    }
    mock_high_rev = {
        "brief": {
            "summary": "Summary",
            "key_points": ["Point"],
            "reviewer": {"severity": "high", "concerns": ["Volatile close"]},
        },
        "provider_used": "fake",
        "providers_tried": ["fake"],
        "fallback": False,
        "source": "llm",
        "mode": "auto",
    }
    with patch("api.routers.brief.generate_brief_text", return_value=mock_high_rev):
        res = client.post("/api/brief", json={"analyze": facts1})
        assert res.status_code == 200
        d = res.json()
        assert d["ml_margin"] < 0.15
        assert d["reviewer"]["severity"] == "high"
        assert d["watch_flag"] is True

    # Permutation 2: margin >= 0.15 AND severity == high -> False
    facts2 = {
        "risk_label": "High",
        "risk_score": 75,
        "probs": {"Low": 0.10, "Medium": 0.20, "High": 0.70},  # margin = 0.70 - 0.20 = 0.50 >= 0.15
        "data_source": "cache",
        "as_of": "2026-10-09",
    }
    with patch("api.routers.brief.generate_brief_text", return_value=mock_high_rev):
        res = client.post("/api/brief", json={"analyze": facts2})
        assert res.status_code == 200
        assert res.json()["watch_flag"] is False

    # Permutation 3: margin < 0.15 AND severity == low -> False
    mock_low_rev = {
        "brief": {
            "summary": "Summary",
            "key_points": ["Point"],
            "reviewer": {"severity": "low", "concerns": []},
        },
        "provider_used": "fake",
        "providers_tried": ["fake"],
        "fallback": False,
        "source": "llm",
        "mode": "auto",
    }
    with patch("api.routers.brief.generate_brief_text", return_value=mock_low_rev):
        res = client.post("/api/brief", json={"analyze": facts1})
        assert res.status_code == 200
        assert res.json()["watch_flag"] is False


def test_offline_warm_cache_and_blocked_network(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """7. ONE offline test: warm cache with a fake provider, block network, same facts -> cache, different facts -> template."""
    cache_dir = tmp_path / "llm_cache"
    monkeypatch.setenv("LLM_CACHE_DIR", str(cache_dir))
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-1.5-flash")

    facts_a = {
        "risk_label": "Medium",
        "risk_score": 52,
        "probs": {"Low": 0.2, "Medium": 0.6, "High": 0.2},
        "data_source": "cache",
        "as_of": "2026-10-09",
        "explanations": ["Moderate risk profile."],
    }
    facts_b = {
        "risk_label": "Low",
        "risk_score": 25,
        "probs": {"Low": 0.8, "Medium": 0.15, "High": 0.05},
        "data_source": "cache",
        "as_of": "2026-10-09",
        "explanations": ["Low risk profile."],
    }

    fake_brief_a = {
        "summary": "Portfolio risk is Medium with 52 score as of 2026-10-09.",
        "key_points": ["Moderate risk profile."],
        "reviewer": {"severity": "low", "concerns": []},
    }

    # Step 1: Warm cache for facts_a using fake provider
    with patch("engine.llm.router._execute_provider", return_value=fake_brief_a):
        warmed = generate_brief_text(facts_a, mode="auto")
        assert warmed["source"] == "llm"

    # Step 2: Block all network calls by monkeypatching socket
    def blocked_socket(*args, **kwargs):
        raise OSError("Network access strictly disabled for test")

    monkeypatch.setattr(socket, "socket", blocked_socket)
    monkeypatch.setattr(socket, "create_connection", blocked_socket)

    # Step 3: Same facts -> served from cache without network
    res_a = generate_brief_text(facts_a, mode="auto")
    assert res_a["source"] == "cache"
    assert res_a["fallback"] is False
    assert res_a["brief"]["summary"] == fake_brief_a["summary"]

    # Step 4: Different facts -> cache miss, network blocked -> falls back to template, NEVER raises
    res_b = generate_brief_text(facts_b, mode="auto")
    assert res_b["source"] == "template"
    assert res_b["fallback"] is True
    assert "Low" in res_b["brief"]["summary"]
