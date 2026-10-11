"""
tests/test_contract.py  –  Contract tests: every endpoint validates against pydantic schemas
using the preset portfolios. Uses httpx TestClient (no network).
"""
import json
import numpy as np
import pandas as pd
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

ROOT = Path(__file__).parent.parent


def make_synthetic_prices(tickers, n=300):
    np.random.seed(42)
    idx = pd.date_range("2023-01-01", periods=n)
    data = {}
    for t in tickers:
        base = 100.0 if "USDINR" not in t else 83.0
        data[t] = base * np.cumprod(1 + np.random.normal(0.0003, 0.015, n))
    data["USDINR=X"] = 83 * np.ones(n)
    return pd.DataFrame(data, index=idx)


ASSET_TICKERS = [
    "NVDA", "TSLA", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "GOLDBEES.NS",
    "AAPL", "MSFT", "^NSEI", "^NDX", "USDINR=X",
]


def mock_load_prices(tickers, start, end, currency="INR"):
    all_tickers = list(set(tickers) | {"USDINR=X"})
    df = make_synthetic_prices(all_tickers)
    available = [t for t in tickers if t in df.columns]
    result = df[available] if available else df[df.columns[:len(tickers)]]
    result.attrs = {"data_source": "cache", "as_of": "2026-10-09"}
    return result


def mock_latest_prices(tickers):
    return {t: {"price": 100.0, "day_change": 0.01, "currency": "USD", "data_source": "cache"} for t in tickers}


@pytest.fixture
def client():
    with patch("data.loader.load_prices", side_effect=mock_load_prices), \
         patch("data.loader.latest_prices", side_effect=mock_latest_prices), \
         patch("data.loader._read_meta", return_value={"as_of": "2026-10-09", "data_source": "cache"}):
        from api.main import app
        with TestClient(app) as c:
            yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "meta" in data
    assert "as_of" in data["meta"]


def test_assets_search(client):
    r = client.get("/api/assets/search?q=NVDA")
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert any(a["ticker"] == "NVDA" for a in data["results"])


def test_presets(client):
    r = client.get("/api/presets")
    assert r.status_code == 200
    data = r.json()
    assert "presets" in data
    assert len(data["presets"]) >= 1
    assert "meta" in data


def test_regimes(client):
    r = client.get("/api/regimes")
    assert r.status_code == 200
    data = r.json()
    assert "regimes" in data
    assert len(data["regimes"]) >= 4


def test_simulate_preset(client):
    r = client.post("/api/simulate", json={
        "weights": {"NVDA": 0.4, "TSLA": 0.4, "RELIANCE.NS": 0.2},
        "amount": 1000000,
        "period": {"preset": "3y"},
        "rebalance": "monthly",
        "currency": "INR",
    })
    assert r.status_code == 200
    data = r.json()
    assert "metrics" in data
    assert "series" in data
    assert "meta" in data
    assert data["final_value"] > 0


def test_benchmark_endpoint(client):
    r = client.post("/api/benchmark", json={
        "weights": {"NVDA": 0.5, "RELIANCE.NS": 0.5},
        "amount": 1000000,
        "benchmark": "auto",
        "period": {"preset": "1y"},
        "currency": "INR",
    })
    assert r.status_code == 200
    data = r.json()
    assert "alpha" in data
    assert "beta" in data
    assert "verdict" in data
    assert data["verdict"] in ("outperforming", "underperforming", "in_line")
    assert "meta" in data


def test_shield_endpoint(client):
    r = client.post("/api/shield", json={
        "weights": {"NVDA": 0.4, "TSLA": 0.3, "RELIANCE.NS": 0.3},
        "amount": 1000000,
        "floor": -0.15,
        "multiplier": 3.0,
        "period": {"preset": "3y"},
    })
    assert r.status_code == 200
    data = r.json()
    assert data["method"] == "cppi"
    assert "cost" in data
    assert "benefit" in data
    assert "meta" in data


def test_unknown_ticker_error(client):
    r = client.post("/api/simulate", json={
        "weights": {"UNKNOWN_XYZ": 1.0},
        "amount": 1000000,
        "period": {"preset": "1y"},
        "rebalance": "none",
        "currency": "INR",
    })
    assert r.status_code == 400
    data = r.json()
    assert data["error"]["code"] == "UNKNOWN_TICKER"
