"""
tests/test_cppi.py  –  Tests for CPPI shield:
  - risky share never exceeds 100%
  - floor logic (insured >= floor at all times when no gap risk)
  - cost and benefit fields exist and are plausible
"""
import numpy as np
import pandas as pd
import pytest
from engine.cppi import cppi_shield


def make_prices(n: int = 300, seed: int = 42) -> pd.DataFrame:
    np.random.seed(seed)
    idx = pd.date_range("2020-01-01", periods=n)
    return pd.DataFrame({
        "A": 100 * np.cumprod(1 + np.random.normal(0.0004, 0.015, n)),
        "B": 100 * np.cumprod(1 + np.random.normal(0.0002, 0.010, n)),
        "C": 100 * np.cumprod(1 + np.random.normal(0.0001, 0.005, n)),
    }, index=idx)


def test_risky_share_never_exceeds_100pct():
    prices = make_prices()
    result = cppi_shield(prices, [0.5, 0.3, 0.2], 1_000_000, floor=-0.15, multiplier=3.0)
    risky_shares = result["risky_share"]
    assert all(0.0 <= rs <= 1.0 for rs in risky_shares), \
        f"Risky share out of [0,1]: {[rs for rs in risky_shares if not (0 <= rs <= 1)]}"


def test_floor_logic():
    """Insured series should generally stay above floor (allowing for gap risk resets)."""
    prices = make_prices()
    floor = -0.15
    amount = 1_000_000
    result = cppi_shield(prices, [0.5, 0.3, 0.2], amount, floor=floor, multiplier=3.0)
    floor_val = result["floor_value_start"]
    insured = result["series"]["insured"]
    floor_series = result["series"]["floor"]
    # After floor breach handling, insured should be >= floor series
    for i, (ins, fl) in enumerate(zip(insured, floor_series)):
        assert ins >= fl - 1.0, f"Insured {ins} below floor {fl} at index {i}"


def test_cppi_result_fields():
    prices = make_prices()
    result = cppi_shield(prices, [0.5, 0.3, 0.2], 1_000_000, floor=-0.15, multiplier=2.0)
    assert result["method"] == "cppi"
    assert "cost" in result
    assert "benefit" in result
    assert "return_drag_ann" in result["cost"]
    assert "premium_equivalent_pct" in result["cost"]
    assert "max_drawdown_unprotected" in result["benefit"]
    assert "max_drawdown_insured" in result["benefit"]
    assert "loss_avoided" in result["benefit"]
    assert isinstance(result["floor_breached"], bool)


def test_insured_mdd_le_unprotected():
    """Insured should have equal or less drawdown than unprotected (by CPPI logic)."""
    prices = make_prices(seed=99)
    result = cppi_shield(prices, [0.5, 0.3, 0.2], 1_000_000, floor=-0.20, multiplier=3.0)
    mdd_u = result["benefit"]["max_drawdown_unprotected"]
    mdd_i = result["benefit"]["max_drawdown_insured"]
    # Note: gap risk can occasionally cause slight violations; allow small tolerance
    assert mdd_i >= mdd_u - 0.05, \
        f"Insured MDD {mdd_i:.3f} significantly worse than unprotected {mdd_u:.3f}"


def test_cppi_series_lengths():
    prices = make_prices()
    result = cppi_shield(prices, [0.5, 0.3, 0.2], 1_000_000, floor=-0.15, multiplier=3.0)
    n = len(result["dates"])
    assert len(result["series"]["unprotected"]) == n
    assert len(result["series"]["insured"]) == n
    assert len(result["series"]["floor"]) == n
    assert len(result["risky_share"]) == n
