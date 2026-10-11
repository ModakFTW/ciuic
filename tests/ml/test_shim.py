"""
tests/ml/test_shim.py — Tests for the temporary metrics shim.

Key invariant: risk contributions must sum to 1.0 on any valid portfolio.
Also tests other shim functions on a toy 2-asset case.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.ml._metrics_shim import (
    ann_return,
    cvar95,
    diversification_ratio,
    hhi,
    max_drawdown,
    risk_contribution,
    sharpe,
    sortino,
    volatility,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture()
def toy_2asset():
    """Toy 2-asset portfolio: A (low vol), B (high vol), moderate correlation."""
    weights = np.array([0.6, 0.4])
    # A: σ=20%, B: σ=30%, correlation=0.25
    sigma_a, sigma_b, rho = 0.20, 0.30, 0.25
    cov = np.array([
        [sigma_a ** 2, rho * sigma_a * sigma_b],
        [rho * sigma_a * sigma_b, sigma_b ** 2],
    ])
    return weights, cov


@pytest.fixture()
def daily_returns():
    """252 days of synthetic daily returns for a single asset."""
    rng = np.random.default_rng(123)
    return rng.normal(0.0004, 0.012, 252)


# ── Risk contribution tests ────────────────────────────────────────────────


class TestRiskContribution:
    """Risk contributions must sum to 1 and be non-negative for long-only."""

    def test_sums_to_one(self, toy_2asset):
        w, cov = toy_2asset
        rc = risk_contribution(w, cov)
        assert abs(rc.sum() - 1.0) < 1e-10, f"RC sums to {rc.sum()}, expected 1.0"

    def test_correct_length(self, toy_2asset):
        w, cov = toy_2asset
        rc = risk_contribution(w, cov)
        assert len(rc) == len(w)

    def test_non_negative_long_only(self, toy_2asset):
        w, cov = toy_2asset
        rc = risk_contribution(w, cov)
        assert (rc >= -1e-10).all(), f"Negative risk contribution: {rc}"

    def test_equal_weight_equal_vol_equal_rc(self):
        """Equal weights + identical assets => equal risk contributions."""
        n = 4
        w = np.ones(n) / n
        sigma = 0.20
        rho = 0.3
        cov = np.full((n, n), rho * sigma ** 2)
        np.fill_diagonal(cov, sigma ** 2)
        rc = risk_contribution(w, cov)
        assert abs(rc.sum() - 1.0) < 1e-10
        assert np.allclose(rc, 1.0 / n, atol=1e-10)

    def test_concentrated_portfolio(self):
        """One asset at 100% weight should have 100% risk contribution."""
        w = np.array([1.0, 0.0])
        cov = np.array([[0.04, 0.01], [0.01, 0.09]])
        rc = risk_contribution(w, cov)
        assert abs(rc.sum() - 1.0) < 1e-10
        assert abs(rc[0] - 1.0) < 1e-10
        assert abs(rc[1] - 0.0) < 1e-10

    def test_three_assets(self):
        """Verify sum-to-1 on a 3-asset case."""
        w = np.array([0.5, 0.3, 0.2])
        cov = np.array([
            [0.04, 0.006, 0.002],
            [0.006, 0.09, 0.009],
            [0.002, 0.009, 0.01],
        ])
        rc = risk_contribution(w, cov)
        assert abs(rc.sum() - 1.0) < 1e-10


# ── Other metric tests ─────────────────────────────────────────────────────


class TestVolatility:
    def test_positive(self, daily_returns):
        assert volatility(daily_returns) > 0

    def test_constant_returns_zero_vol(self):
        assert volatility(np.full(100, 0.001)) < 1e-10

    def test_scaling(self):
        """Doubling returns should roughly double volatility."""
        r = np.array([0.01, -0.01, 0.02, -0.02, 0.005])
        v1 = volatility(r)
        v2 = volatility(2 * r)
        assert abs(v2 / v1 - 2.0) < 0.01


class TestAnnReturn:
    def test_positive_drift(self):
        r = np.full(252, 0.001)  # ~28.7% annualised
        ar = ann_return(r)
        assert ar > 0.20

    def test_zero_returns(self):
        assert abs(ann_return(np.zeros(100))) < 1e-10


class TestMaxDrawdown:
    def test_negative(self, daily_returns):
        """Max drawdown should be <= 0."""
        assert max_drawdown(daily_returns) <= 0.0

    def test_always_positive_returns(self):
        """No drawdown if returns are always positive."""
        assert max_drawdown(np.full(100, 0.01)) == 0.0

    def test_known_case(self):
        """Peak at 1.10, then drop to 0.88 => dd = 0.88/1.10 - 1 ≈ -0.2."""
        r = np.array([0.10, -0.20, 0.05])
        mdd = max_drawdown(r)
        assert mdd < -0.19


class TestSharpe:
    def test_returns_float(self, daily_returns):
        assert isinstance(sharpe(daily_returns), float)


class TestSortino:
    def test_returns_float(self, daily_returns):
        assert isinstance(sortino(daily_returns), float)


class TestCVaR95:
    def test_negative(self, daily_returns):
        """CVaR95 should typically be negative for a normal-ish distribution."""
        assert cvar95(daily_returns) < 0


class TestDiversificationRatio:
    def test_greater_than_one(self, toy_2asset):
        """With imperfect correlation, div ratio > 1."""
        w, cov = toy_2asset
        dr = diversification_ratio(w, cov)
        assert dr > 1.0

    def test_perfect_correlation_equals_one(self):
        """Perfectly correlated assets => div ratio = 1."""
        w = np.array([0.5, 0.5])
        sigma = 0.20
        cov = np.array([[sigma ** 2, sigma ** 2], [sigma ** 2, sigma ** 2]])
        dr = diversification_ratio(w, cov)
        assert abs(dr - 1.0) < 1e-10


class TestHHI:
    def test_equal_weight(self):
        assert abs(hhi(np.array([0.5, 0.5])) - 0.5) < 1e-10

    def test_concentrated(self):
        assert abs(hhi(np.array([1.0, 0.0])) - 1.0) < 1e-10

    def test_four_equal(self):
        assert abs(hhi(np.ones(4) / 4) - 0.25) < 1e-10
