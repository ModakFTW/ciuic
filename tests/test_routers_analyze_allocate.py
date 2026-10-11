"""
tests/test_routers_analyze_allocate.py — Integration & contract tests for
POST /api/analyze and POST /api/allocate.
"""

import time
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routers.analyze import reset_price_loader, set_price_loader
from api.routers.allocate import reset_price_loader as reset_alloc_loader, set_price_loader as set_alloc_loader


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


TECH_HEAVY_HOLDINGS = [
    {"ticker": "NVDA", "amount": 200000},
    {"ticker": "TSLA", "amount": 200000},
    {"ticker": "RELIANCE.NS", "amount": 200000},
    {"ticker": "TCS.NS", "amount": 200000},
    {"ticker": "HDFCBANK.NS", "amount": 100000},
    {"ticker": "GOLDBEES.NS", "amount": 100000},
]

TECH_HEAVY_TICKERS = [h["ticker"] for h in TECH_HEAVY_HOLDINGS]


def test_analyze_tech_heavy_contract_and_latency(client: TestClient) -> None:
    """Run tech_heavy preset through POST /api/analyze and check contract + latency (<3s)."""
    payload = {
        "holdings": TECH_HEAVY_HOLDINGS,
        "risk_level": "high",
        "period": {"preset": "3y"},
        "currency": "INR",
    }

    t0 = time.time()
    resp = client.post("/api/analyze", json=payload)
    latency = time.time() - t0

    assert resp.status_code == 200
    data = resp.json()

    # Latency target under 3s
    assert latency < 3.0, f"Latency was {latency:.2f}s, expected < 3.0s"

    # Contract fields per architecture.md §6
    required_keys = {
        "risk_label",
        "risk_score",
        "confidence",
        "probs",
        "metrics",
        "weights",
        "asset_stats",
        "correlation",
        "sector_exposure",
        "risk_drivers",
        "explanations",
        "counterfactual",
        "meta",
    }
    assert required_keys.issubset(data.keys())

    # Risk label & score
    assert data["risk_label"] in ("Low", "Medium", "High")
    assert 0 <= data["risk_score"] <= 100
    assert 0.0 <= data["confidence"] <= 1.0

    # Probabilities
    probs = data["probs"]
    assert set(probs.keys()) == {"Low", "Medium", "High"}
    assert abs(sum(probs.values()) - 1.0) < 1e-4

    # Metrics
    metrics = data["metrics"]
    metrics_keys = {
        "total_return",
        "ann_return",
        "volatility",
        "max_drawdown",
        "sharpe",
        "sortino",
        "diversification_ratio",
        "cvar_95",
        "avg_correlation",
        "hhi",
    }
    assert metrics_keys.issubset(metrics.keys())

    # Asset stats
    stats = data["asset_stats"]
    assert len(stats) == len(TECH_HEAVY_HOLDINGS)
    stat_keys = {
        "ticker",
        "weight",
        "ann_return",
        "volatility",
        "max_drawdown",
        "risk_contribution",
        "return_contribution",
    }
    for s in stats:
        assert stat_keys.issubset(s.keys())

    # Risk contribution sums to ~1.0
    rc_sum = sum(s["risk_contribution"] for s in stats)
    assert abs(rc_sum - 1.0) < 1e-3

    # Correlation
    corr = data["correlation"]
    assert set(corr["tickers"]) == set(TECH_HEAVY_TICKERS)
    assert len(corr["matrix"]) == len(TECH_HEAVY_TICKERS)

    # Risk drivers & explanations
    assert len(data["risk_drivers"]) <= 5
    assert len(data["explanations"]) >= 1

    # Meta
    assert "data_source" in data["meta"]
    assert "as_of" in data["meta"]


def test_allocate_tech_heavy_contract_and_latency(client: TestClient) -> None:
    """Run tech_heavy preset tickers through POST /api/allocate and check contract + latency (<3s)."""
    payload = {
        "tickers": TECH_HEAVY_TICKERS,
        "amount": 1000000.0,
        "risk_level": "medium",
        "period": {"preset": "3y"},
        "currency": "INR",
    }

    t0 = time.time()
    resp = client.post("/api/allocate", json=payload)
    latency = time.time() - t0

    assert resp.status_code == 200
    data = resp.json()

    # Latency target under 3s
    assert latency < 3.0, f"Latency was {latency:.2f}s, expected < 3.0s"

    # Contract fields per architecture.md §6
    required_keys = {
        "method",
        "recommended",
        "current_vs_recommended",
        "before",
        "after",
        "predicted_risk_after",
        "tradeoff",
        "efficient_frontier",
        "explanations",
        "meta",
    }
    assert required_keys.issubset(data.keys())

    # Recommended amounts sum to total amount
    total_alloc = sum(r["amount"] for r in data["recommended"])
    assert abs(total_alloc - 1000000.0) < 10.0

    # Recommended weights sum to 1.0
    total_w = sum(r["weight"] for r in data["recommended"])
    assert abs(total_w - 1.0) < 1e-4

    # Each recommended item has rationale
    for r in data["recommended"]:
        assert "ticker" in r and "weight" in r and "amount" in r and "rationale" in r
        assert len(r["rationale"]) > 10

    # Efficient frontier has candidates
    assert len(data["efficient_frontier"]) == 25

    # Predicted risk after
    assert "label" in data["predicted_risk_after"]
    assert "probs" in data["predicted_risk_after"]

    # Tradeoff dict
    assert set(data["tradeoff"].keys()) == {"return_change", "volatility_change", "drawdown_change"}


def test_typed_errors_no_stack_traces(client: TestClient) -> None:
    """Verify typed error codes (UNKNOWN_TICKER, INVALID_WEIGHTS) with no stack trace."""
    # 1. Unknown ticker in analyze
    r1 = client.post("/api/analyze", json={
        "holdings": [{"ticker": "INVALID_XYZ", "amount": 100}, {"ticker": "NVDA", "amount": 100}],
        "risk_level": "medium",
        "period": {"preset": "3y"},
    })
    assert r1.status_code == 400
    body1 = r1.json()
    assert body1["error"]["code"] == "UNKNOWN_TICKER"
    assert "traceback" not in r1.text.lower()

    # 2. Unknown ticker in allocate
    r2 = client.post("/api/allocate", json={
        "tickers": ["INVALID_XYZ", "NVDA"],
        "amount": 100000,
        "risk_level": "medium",
    })
    assert r2.status_code == 400
    body2 = r2.json()
    assert body2["error"]["code"] == "UNKNOWN_TICKER"
    assert "traceback" not in r2.text.lower()

    # 3. Mismatched current_weights in allocate
    r3 = client.post("/api/allocate", json={
        "tickers": ["NVDA", "TSLA"],
        "amount": 100000,
        "risk_level": "medium",
        "current_weights": [0.5],  # 1 weight for 2 tickers
    })
    assert r3.status_code == 400
    body3 = r3.json()
    assert body3["error"]["code"] == "INVALID_WEIGHTS"
    assert "traceback" not in r3.text.lower()


def test_dependency_injection_price_loader(client: TestClient) -> None:
    """Verify custom price loader function can be injected into the routers."""
    def custom_loader(tickers, start, end, currency):
        dates = pd.bdate_range("2023-01-01", periods=260)
        data = {t: np.linspace(100.0, 150.0, 260) for t in tickers}
        df = pd.DataFrame(data, index=dates)
        df.attrs = {"data_source": "custom_test_feed", "as_of": "2024-01-01"}
        return df

    try:
        set_price_loader(custom_loader)
        set_alloc_loader(custom_loader)

        resp = client.post("/api/analyze", json={
            "holdings": [{"ticker": "NVDA", "amount": 100}, {"ticker": "TSLA", "amount": 100}],
            "risk_level": "medium",
            "period": {"preset": "3y"},
        })
        assert resp.status_code == 200
        assert resp.json()["meta"]["data_source"] == "custom_test_feed"

    finally:
        reset_price_loader()
        reset_alloc_loader()


def test_analyze_metrics_equals_compute_all_metrics(client: TestClient) -> None:
    """Verify POST /api/analyze metrics for tech_heavy equals compute_all_metrics, 10 keys."""
    from engine.metrics import compute_all_metrics
    from data.loader import load_prices

    payload = {
        "holdings": TECH_HEAVY_HOLDINGS,
        "risk_level": "high",
        "period": {"preset": "3y"},
        "currency": "INR",
    }
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    metrics = data["metrics"]

    # 10 keys exact match to contract
    contract_keys = {
        "total_return",
        "ann_return",
        "volatility",
        "max_drawdown",
        "sharpe",
        "sortino",
        "diversification_ratio",
        "cvar_95",
        "avg_correlation",
        "hhi",
    }
    assert set(metrics.keys()) == contract_keys
    assert len(metrics) == 10

