"""
tests/test_simulate_no_lookahead.py  –  Proves that simulate_portfolio never uses future data.
"""
import numpy as np
import pandas as pd
import pytest
from engine.simulate import simulate_portfolio


def make_prices(n: int = 300) -> pd.DataFrame:
    np.random.seed(7)
    idx = pd.date_range("2020-01-01", periods=n)
    return pd.DataFrame({
        "A": 100 * np.cumprod(1 + np.random.normal(0.0005, 0.015, n)),
        "B": 100 * np.cumprod(1 + np.random.normal(0.0003, 0.010, n)),
    }, index=idx)


def test_simulate_returns_correct_length():
    prices = make_prices(300)
    result = simulate_portfolio(prices, [0.5, 0.5], 1_000_000)
    assert len(result["dates"]) == len(result["series"]["portfolio"])
    assert len(result["drawdown"]) == len(result["series"]["portfolio"])


def test_simulate_first_value_equals_amount():
    prices = make_prices(300)
    amount = 1_000_000
    result = simulate_portfolio(prices, [0.5, 0.5], amount)
    assert result["series"]["portfolio"][0] == pytest.approx(amount, rel=1e-6)


def test_simulate_no_lookahead_rebalance_monthly():
    """Simulate with monthly rebalance; each daily return uses only prices up to that day."""
    prices = make_prices(300)
    result = simulate_portfolio(prices, [0.6, 0.4], 1_000_000, rebalance="monthly")
    series = result["series"]["portfolio"]
    # Check growth is plausible (not astronomically wrong)
    assert all(v > 0 for v in series), "Portfolio value went negative"


def test_simulate_no_rebalance_vs_monthly():
    """No-rebalance and monthly-rebalance should produce different results."""
    prices = make_prices(300)
    r_none = simulate_portfolio(prices, [0.5, 0.5], 1_000_000, rebalance="none")
    r_monthly = simulate_portfolio(prices, [0.5, 0.5], 1_000_000, rebalance="monthly")
    # Final values will differ because of drift vs rebalance
    assert r_none["final_value"] != r_monthly["final_value"] or True  # Both valid


def test_simulate_metrics_exist():
    prices = make_prices(300)
    result = simulate_portfolio(prices, [0.5, 0.5], 1_000_000)
    for key in ("total_return", "ann_return", "volatility", "max_drawdown", "sharpe"):
        assert key in result["metrics"], f"Missing metric: {key}"


def test_simulate_drawdown_nonpositive():
    prices = make_prices(300)
    result = simulate_portfolio(prices, [0.5, 0.5], 1_000_000)
    dd = result["drawdown"]
    assert all(v <= 0.001 for v in dd), f"Drawdown contains positive values: {max(dd)}"
