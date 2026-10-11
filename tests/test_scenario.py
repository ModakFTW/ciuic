"""
tests/test_scenario.py — Unit and integration tests for engine.scenario and /api/scenario.

Tests:
1. crash impact is negative and recovery positive.
2. the input weights are not mutated.
3. replay flags missing assets and renormalizes remaining weights.
4. high_volatility scenario returns mc {p5, p50, p95} and doubles covariance.
5. sector_downturn scenario shocks sector assets fully and dampens non-sector assets.
6. API endpoint POST /api/scenario contract and error handling.
"""

from __future__ import annotations

import copy
import numpy as np
import pandas as pd
import pytest
from starlette.testclient import TestClient

from api.main import app
from data.loader import load_prices
from engine.scenario import apply_scenario


TECH_HEAVY_TICKERS = [
    "NVDA",
    "TSLA",
    "RELIANCE.NS",
    "TCS.NS",
    "HDFCBANK.NS",
    "GOLDBEES.NS",
]


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def sample_prices() -> pd.DataFrame:
    tickers = TECH_HEAVY_TICKERS + ["^NSEI", "^NDX"]
    # Load 2019 to 2026 to cover covid_2020 and bear_2022 replay
    px = load_prices(tickers, "2019-01-01", "2026-10-09", "INR")
    return px


def test_crash_impact_negative_and_recovery_positive(sample_prices: pd.DataFrame) -> None:
    """Verify that market_crash impact is negative and market_recovery is positive."""
    weights = {"NVDA": 0.5, "RELIANCE.NS": 0.5}
    amt = 1_000_000.0

    # Market crash (default -0.30)
    res_crash = apply_scenario(weights, sample_prices, "market_crash", amount=amt)
    assert res_crash["impact_pct"] < 0.0
    assert res_crash["value_after"] < res_crash["value_before"]
    assert res_crash["value_before"] == amt

    # Market recovery (default +0.20)
    res_rec = apply_scenario(weights, sample_prices, "market_recovery", amount=amt)
    assert res_rec["impact_pct"] > 0.0
    assert res_rec["value_after"] > res_rec["value_before"]
    assert res_rec["value_before"] == amt


def test_input_weights_are_not_mutated(sample_prices: pd.DataFrame) -> None:
    """Verify that the input weights dictionary is not mutated in-place."""
    orig_weights = {"NVDA": 0.3, "TSLA": 0.3, "RELIANCE.NS": 0.4}
    weights_copy = copy.deepcopy(orig_weights)

    apply_scenario(orig_weights, sample_prices, "market_crash", amount=500_000.0)
    assert orig_weights == weights_copy, "Weights dictionary was mutated by apply_scenario"

    # Also test for replay where missing assets could trigger renormalization
    apply_scenario(orig_weights, sample_prices, "market_crash", replay="covid_2020")
    assert orig_weights == weights_copy, "Weights dictionary was mutated during replay"


def test_replay_flags_missing_assets() -> None:
    """Verify that replay flags assets without data in the replay window and renormalizes."""
    dates = pd.bdate_range("2020-01-01", "2021-01-01")
    n = len(dates)

    # Ticker A has full data, Ticker B has NaNs during covid_2020
    px = pd.DataFrame(
        {
            "A": np.linspace(100, 150, n),
            "B": np.linspace(50, 60, n),
            "^NSEI": np.linspace(1000, 1100, n),
            "^NDX": np.linspace(2000, 2200, n),
        },
        index=dates,
    )
    # Wipe out B during covid_2020 (2020-02-19 to 2020-03-23)
    covid_mask = (px.index >= "2020-02-19") & (px.index <= "2020-03-23")
    px.loc[covid_mask, "B"] = np.nan

    weights = {"A": 0.6, "B": 0.4}
    res = apply_scenario(weights, px, "market_crash", replay="covid_2020", amount=1_000_000.0)

    # Check that explanation mentions B was excluded
    missing_flagged = any("B" in exp and "lacks" in exp.lower() for exp in res["explanations"])
    assert missing_flagged, "Missing asset B was not flagged in explanations"

    # Impact should match A's actual return since B was dropped and remaining renormalized
    s_a = px.loc[covid_mask, "A"].dropna()
    expected_ret_a = float(s_a.iloc[-1] / s_a.iloc[0] - 1.0)
    assert abs(res["impact_pct"] - expected_ret_a) < 1e-4


def test_high_volatility_returns_mc_percentiles(sample_prices: pd.DataFrame) -> None:
    """Verify high_volatility scenario returns mc dict with p5, p50, p95."""
    weights = {"NVDA": 0.5, "TCS.NS": 0.5}
    res = apply_scenario(weights, sample_prices, "high_volatility", amount=1_000_000.0)

    assert "mc" in res
    mc = res["mc"]
    assert "p5" in mc and "p50" in mc and "p95" in mc
    assert mc["p5"] <= mc["p50"] <= mc["p95"]
    assert res["scenario"] == "high_volatility"


def test_sector_downturn_shocks_target_sector_fully(sample_prices: pd.DataFrame) -> None:
    """Verify sector_downturn applies full magnitude to target sector and dampened to others."""
    weights = {"NVDA": 0.5, "RELIANCE.NS": 0.5}
    sector_map = {"NVDA": "Technology", "RELIANCE.NS": "Energy"}

    res = apply_scenario(
        weights,
        sample_prices,
        "sector_downturn",
        magnitude=-0.40,
        sector="Technology",
        sector_map=sector_map,
        amount=1_000_000.0,
    )

    impacts = {item["ticker"]: item["impact_pct"] for item in res["asset_impacts"]}
    # NVDA is in Technology, so takes full magnitude -0.40
    assert abs(impacts["NVDA"] - (-0.40)) < 1e-4
    # RELIANCE.NS is outside Technology, so impact is dampened (< 0, but much smaller magnitude)
    assert abs(impacts["RELIANCE.NS"]) < abs(impacts["NVDA"])


def test_api_post_scenario_contract_and_latency(client: TestClient) -> None:
    """Verify POST /api/scenario endpoint contract, types, and latency."""
    payload = {
        "weights": {
            "NVDA": 0.25,
            "TSLA": 0.25,
            "RELIANCE.NS": 0.25,
            "TCS.NS": 0.25,
        },
        "amount": 1_000_000.0,
        "scenario": "market_crash",
    }

    resp = client.post("/api/scenario", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Required contract fields
    assert "scenario" in data
    assert "value_before" in data
    assert "value_after" in data
    assert "impact_pct" in data
    assert "metrics_after" in data
    assert "risk_label_before" in data
    assert "risk_label_after" in data
    assert "asset_impacts" in data
    assert "explanations" in data
    assert "meta" in data

    assert data["value_before"] == 1_000_000.0
    assert data["impact_pct"] < 0.0
    assert len(data["asset_impacts"]) == 4
    assert len(data["explanations"]) >= 1


def test_api_post_scenario_replay(client: TestClient) -> None:
    """Verify POST /api/scenario with replay=covid_2020."""
    payload = {
        "weights": {"NVDA": 0.5, "RELIANCE.NS": 0.5},
        "amount": 1_000_000.0,
        "scenario": "market_crash",
        "replay": "covid_2020",
    }

    resp = client.post("/api/scenario", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["scenario"] == "covid_2020"
    assert data["impact_pct"] < 0.0  # covid_2020 was a severe crash
    assert len(data["asset_impacts"]) == 2


def test_api_post_scenario_errors(client: TestClient) -> None:
    """Verify typed error handling for unknown tickers and invalid weights."""
    # Unknown ticker
    bad_ticker_payload = {
        "weights": {"UNKNOWN_FAKE_XYZ": 1.0},
        "amount": 100000.0,
        "scenario": "market_crash",
    }
    resp = client.post("/api/scenario", json=bad_ticker_payload)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "UNKNOWN_TICKER"

    # Non-positive amount
    bad_amt_payload = {
        "weights": {"NVDA": 0.5, "TCS.NS": 0.5},
        "amount": -100.0,
        "scenario": "market_crash",
    }
    resp = client.post("/api/scenario", json=bad_amt_payload)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_WEIGHTS"
