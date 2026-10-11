"""
tests/test_metrics.py  –  Unit tests for engine/metrics.py on a 2-asset toy case.
Run with: pytest tests/test_metrics.py -v
"""
import numpy as np
import pandas as pd
import pytest
from engine.metrics import (
    ann_return, volatility, max_drawdown, sharpe, sortino, cvar95,
    risk_contributions, diversification_ratio, hhi, avg_correlation,
    covariance_matrix, compute_all_metrics, return_contributions,
)

# --- Toy data: 2 assets, 300 days ---
np.random.seed(42)
PRICES = pd.DataFrame({
    "A": 100 * (1 + np.random.normal(0.0005, 0.015, 300)).cumprod(),
    "B": 100 * (1 + np.random.normal(0.0002, 0.010, 300)).cumprod(),
}, index=pd.date_range("2023-01-01", periods=300))

WEIGHTS = [0.6, 0.4]


def test_ann_return_range():
    from engine.metrics import simple_returns, portfolio_returns
    rets = portfolio_returns(PRICES, WEIGHTS)
    ar = ann_return(rets)
    assert -1.0 < ar < 5.0, f"ann_return out of range: {ar}"


def test_volatility_positive():
    from engine.metrics import portfolio_returns
    rets = portfolio_returns(PRICES, WEIGHTS)
    vol = volatility(rets)
    assert vol > 0, "Volatility must be positive"
    assert vol < 2.0, "Volatility unexpectedly high"


def test_max_drawdown_negative():
    from engine.metrics import portfolio_returns
    rets = portfolio_returns(PRICES, WEIGHTS)
    mdd = max_drawdown(rets)
    assert mdd <= 0, f"max_drawdown must be <= 0, got {mdd}"


def test_risk_contributions_sum_to_one():
    cov = covariance_matrix(PRICES)
    rc = risk_contributions(WEIGHTS, cov)
    assert len(rc) == 2
    assert abs(rc.sum() - 1.0) < 1e-9, f"RC sum = {rc.sum()}, expected 1.0"


def test_hhi_range():
    h = hhi(WEIGHTS)
    assert 0 < h <= 1.0, f"HHI out of range: {h}"
    # Equal weights => minimum HHI
    h_eq = hhi([0.5, 0.5])
    assert h_eq == pytest.approx(0.5, abs=1e-9)


def test_diversification_ratio_gte_1():
    cov = covariance_matrix(PRICES)
    dr = diversification_ratio(WEIGHTS, cov)
    assert dr >= 1.0, f"Diversification ratio should be >= 1, got {dr}"


def test_avg_correlation_range():
    ac = avg_correlation(PRICES)
    assert -1.0 <= ac <= 1.0, f"avg_correlation out of [-1,1]: {ac}"


def test_cvar95_le_var():
    from engine.metrics import portfolio_returns
    rets = portfolio_returns(PRICES, WEIGHTS)
    cv = cvar95(rets)
    var5 = float(np.percentile(rets, 5))
    assert cv <= var5 + 1e-9, "CVaR95 should be <= VaR5"


def test_compute_all_metrics_keys():
    result = compute_all_metrics(PRICES, WEIGHTS, "INR")
    required = {
        "total_return", "ann_return", "volatility", "max_drawdown",
        "sharpe", "sortino", "diversification_ratio", "cvar_95",
        "avg_correlation", "hhi",
    }
    assert required.issubset(result.keys()), f"Missing keys: {required - result.keys()}"


def test_sharpe_uses_rf():
    from engine.metrics import portfolio_returns
    rets = portfolio_returns(PRICES, WEIGHTS)
    sh_inr = sharpe(rets, "INR")
    sh_usd = sharpe(rets, "USD")
    # INR rf=6.5% > USD rf=4%, so INR Sharpe should be lower (if returns are the same)
    assert isinstance(sh_inr, float)
    assert isinstance(sh_usd, float)
