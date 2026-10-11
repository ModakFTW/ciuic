"""
tests/test_offline.py  –  Verifies the backend still works when network is blocked.
Uses the committed parquet cache; does not make any yfinance calls.
"""
import json
import numpy as np
import pandas as pd
import pytest
from pathlib import Path
from unittest.mock import patch

CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"
PRICES_PATH = CACHE_DIR / "prices.parquet"


def make_synthetic_prices(n=300):
    np.random.seed(1)
    idx = pd.date_range("2023-01-01", periods=n)
    return pd.DataFrame({
        "NVDA": 100 * np.cumprod(1 + np.random.normal(0.001, 0.02, n)),
        "TCS.NS": 3000 * np.cumprod(1 + np.random.normal(0.0005, 0.012, n)),
        "GOLDBEES.NS": 50 * np.cumprod(1 + np.random.normal(0.0002, 0.006, n)),
        "USDINR=X": 83 * np.ones(n),
        "^NSEI": 19000 * np.cumprod(1 + np.random.normal(0.0004, 0.011, n)),
    }, index=idx)


def write_synthetic_cache():
    """Write synthetic parquet + meta so tests can run without real data."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df = make_synthetic_prices()
    df.to_parquet(PRICES_PATH)
    meta = {
        "as_of": "2026-10-09",
        "data_source": "cache",
        "tickers_downloaded": list(df.columns),
        "tickers_requested": list(df.columns),
    }
    with open(CACHE_DIR / "meta.json", "w") as f:
        json.dump(meta, f)
    return df


@pytest.fixture(autouse=True)
def ensure_cache(tmp_path):
    """Ensure cache exists (write synthetic if not) and block network calls."""
    if not PRICES_PATH.exists():
        write_synthetic_cache()
    # Block yfinance network calls
    with patch("yfinance.download", side_effect=Exception("Network blocked")):
        yield


def test_load_prices_offline():
    from data.loader import load_prices
    prices = load_prices(["NVDA", "TCS.NS"], "2023-01-01", "2025-01-01", "INR")
    assert not prices.empty
    assert "NVDA" in prices.columns or "TCS.NS" in prices.columns


def test_metrics_offline():
    from data.loader import load_prices
    from engine.metrics import compute_all_metrics

    prices = load_prices(["NVDA", "TCS.NS"], "2023-01-01", "2025-01-01", "INR")
    if prices.empty or len(prices) < 10:
        pytest.skip("Insufficient cached data")

    result = compute_all_metrics(prices, [0.5, 0.5], "INR")
    assert "sharpe" in result
    assert "max_drawdown" in result


def test_simulate_offline():
    from data.loader import load_prices
    from engine.simulate import simulate_portfolio

    prices = load_prices(["NVDA", "TCS.NS"], "2023-01-01", "2025-01-01", "INR")
    if prices.empty or len(prices) < 10:
        pytest.skip("Insufficient cached data")

    result = simulate_portfolio(prices, [0.5, 0.5], 1_000_000)
    assert "final_value" in result
    assert result["final_value"] > 0


def test_cppi_offline():
    from data.loader import load_prices
    from engine.cppi import cppi_shield

    prices = load_prices(["NVDA", "TCS.NS"], "2023-01-01", "2025-01-01", "INR")
    if prices.empty or len(prices) < 10:
        pytest.skip("Insufficient cached data")

    result = cppi_shield(prices, [0.5, 0.5], 1_000_000, floor=-0.15, multiplier=3.0)
    assert result["method"] == "cppi"
    assert len(result["series"]["insured"]) > 0
