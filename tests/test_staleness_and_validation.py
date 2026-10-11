"""
tests/test_staleness_and_validation.py — Unit tests for Part B staleness, trimming, and synthetic notices.

All tests run completely offline (no network).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routers import allocate, analyze
from engine.ml.validation import validate_prices


@pytest.fixture
def sample_universe_prices() -> pd.DataFrame:
    """Generate dummy price history for universe tickers."""
    today_ist = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    dates = pd.date_range(end=today_ist - timedelta(days=2), periods=400, freq="B")
    data = {}
    for t in ["TCS.NS", "NVDA", "^NSEI", "^NDX", "RELIANCE.NS", "TSLA", "GOLDBEES.NS", "HDFCBANK.NS"]:
        data[t] = 1500.0 + np.random.RandomState(42).randn(len(dates)).cumsum()
        data[t] = np.maximum(data[t], 100.0)
    # Ensure plausible INR levels
    data["NVDA"] = data["NVDA"] * 10.0  # > 1000
    data["TCS.NS"] = data["TCS.NS"] + 1000.0  # > 500
    df = pd.DataFrame(data, index=dates)
    return df


def test_trim_today_partial_bar(sample_universe_prices: pd.DataFrame) -> None:
    """(a) a frame whose last row is today is trimmed by exactly that row."""
    today_ist = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    df_with_today = sample_universe_prices.copy()
    today_ts = pd.Timestamp(today_ist)
    df_with_today.loc[today_ts] = df_with_today.iloc[-1].values

    # Mock raw parquet exists for check 2a
    with patch("pathlib.Path.exists", return_value=False):
        cleaned, dropped = validate_prices(df_with_today, as_of=str(today_ist))

    assert dropped == 1
    assert len(cleaned) == len(df_with_today) - 1
    assert cleaned.index.max().date() < today_ist


def test_staleness_sentence_trigger() -> None:
    """(b) an old frame triggers the staleness sentence and a fresh one does not."""
    today_ist = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    client = TestClient(app)

    # 1. Old frame (e.g. 10 business days ago)
    old_end = today_ist - timedelta(days=14)
    dates_old = pd.date_range(end=old_end, periods=260, freq="B")
    df_old = pd.DataFrame({
        "NVDA": 20000.0,
        "TSLA": 15000.0,
        "RELIANCE.NS": 2500.0,
        "TCS.NS": 3500.0,
        "HDFCBANK.NS": 1600.0,
        "GOLDBEES.NS": 60.0,
        "^NSEI": 24000.0,
        "^NDX": 18000.0,
    }, index=dates_old)

    analyze.set_price_loader(lambda *args, **kwargs: df_old)
    allocate.set_price_loader(lambda *args, **kwargs: df_old)

    payload = {
        "holdings": [
            {"ticker": "NVDA", "amount": 200000},
            {"ticker": "TSLA", "amount": 200000},
            {"ticker": "RELIANCE.NS", "amount": 200000},
            {"ticker": "TCS.NS", "amount": 200000},
            {"ticker": "HDFCBANK.NS", "amount": 100000},
            {"ticker": "GOLDBEES.NS", "amount": 100000},
        ],
        "risk_level": "high",
        "currency": "INR",
    }

    try:
        res_old = client.post("/api/analyze", json=payload)
        assert res_old.status_code == 200
        exps_old = res_old.json().get("explanations", [])
        assert any("business days old; the risk label reflects the last completed close" in s for s in exps_old)

        # 2. Fresh frame (e.g. 1 business day ago)
        # Find last Friday / business day
        dates_fresh = pd.date_range(end=today_ist, periods=260, freq="B")
        df_fresh = pd.DataFrame({
            "NVDA": 20000.0,
            "TSLA": 15000.0,
            "RELIANCE.NS": 2500.0,
            "TCS.NS": 3500.0,
            "HDFCBANK.NS": 1600.0,
            "GOLDBEES.NS": 60.0,
            "^NSEI": 24000.0,
            "^NDX": 18000.0,
        }, index=dates_fresh)

        analyze.set_price_loader(lambda *args, **kwargs: df_fresh)
        res_fresh = client.post("/api/analyze", json=payload)
        assert res_fresh.status_code == 200
        exps_fresh = res_fresh.json().get("explanations", [])
        assert not any("business days old; the risk label reflects the last completed close" in s for s in exps_fresh)
    finally:
        analyze.reset_price_loader()
        allocate.reset_price_loader()


def test_synthetic_data_note_explanation() -> None:
    """(c) synthetic data_note triggers the synthetic sentence; REAL data_note does not."""
    client = TestClient(app)
    payload = {
        "holdings": [
            {"ticker": "NVDA", "amount": 200000},
            {"ticker": "TSLA", "amount": 200000},
            {"ticker": "RELIANCE.NS", "amount": 200000},
            {"ticker": "TCS.NS", "amount": 200000},
            {"ticker": "HDFCBANK.NS", "amount": 100000},
            {"ticker": "GOLDBEES.NS", "amount": 100000},
        ],
        "risk_level": "high",
        "currency": "INR",
    }

    # 1. With REAL data note
    res_real = client.post("/api/analyze", json=payload)
    assert res_real.status_code == 200
    exps_real = res_real.json().get("explanations", [])
    assert "Model was trained on synthetic development data." not in exps_real

    # 2. Mock eval.json with SYNTHETIC
    with patch("api.routers.analyze._read_eval_data_note", return_value="SYNTHETIC dev data"):
        res_synth = client.post("/api/analyze", json=payload)
        assert res_synth.status_code == 200
        exps_synth = res_synth.json().get("explanations", [])
        assert "Model was trained on synthetic development data." in exps_synth


def test_risk_label_and_probs_identical_with_and_without_sentences() -> None:
    """(d) the response risk_label and probs are identical with and without the added sentences."""
    client = TestClient(app)
    payload = {
        "holdings": [
            {"ticker": "NVDA", "amount": 200000},
            {"ticker": "TSLA", "amount": 200000},
            {"ticker": "RELIANCE.NS", "amount": 200000},
            {"ticker": "TCS.NS", "amount": 200000},
            {"ticker": "HDFCBANK.NS", "amount": 100000},
            {"ticker": "GOLDBEES.NS", "amount": 100000},
        ],
        "risk_level": "high",
        "currency": "INR",
    }

    # Baseline response (REAL, fresh)
    res1 = client.post("/api/analyze", json=payload)
    assert res1.status_code == 200
    d1 = res1.json()

    # Response with synthetic notice added
    with patch("api.routers.analyze._read_eval_data_note", return_value="SYNTHETIC dev data"):
        res2 = client.post("/api/analyze", json=payload)
        assert res2.status_code == 200
        d2 = res2.json()

    assert d1["risk_label"] == d2["risk_label"]
    assert d1["probs"] == d2["probs"]
    assert d1["risk_score"] == d2["risk_score"]
    assert d1["confidence"] == d2["confidence"]
