"""api/helpers.py – Shared utilities for routers."""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from api.errors import RiskScopeError, UNKNOWN_TICKER, INSUFFICIENT_HISTORY, INVALID_PERIOD
from data.loader import load_prices, _read_meta

UNIVERSE_PATH = Path(__file__).parent.parent / "data" / "universe.json"
PRESETS_PATH = Path(__file__).parent.parent / "data" / "presets.json"

MIN_ROWS = 63  # at least 63 trading days required

LOOKBACK_DAYS = {"1m": 30, "6m": 180, "1y": 365, "3y": 3 * 365, "max": 10 * 365}

BENCHMARK_MAP = {
    "NIFTY50": ("^NSEI", "INR"),
    "NASDAQ100": ("^NDX", "USD"),
}


def _load_universe_map() -> dict[str, dict]:
    with open(UNIVERSE_PATH) as f:
        data = json.load(f)
    result = {}
    for a in data["assets"]:
        result[a["ticker"]] = a
    for b in data["benchmarks"]:
        result[b["ticker"]] = b
    return result


UNIVERSE_MAP = _load_universe_map()
VALID_TICKERS = {a["ticker"] for a in json.loads(UNIVERSE_PATH.read_text())["assets"]}


def validate_tickers(tickers: list[str]) -> None:
    bad = [t for t in tickers if t not in VALID_TICKERS]
    if bad:
        raise RiskScopeError(UNKNOWN_TICKER, f"Unknown tickers: {bad}", tickers=bad)


def get_meta() -> dict:
    m = _read_meta()
    return {"data_source": m.get("data_source", "cache"), "as_of": m.get("as_of", str(date.today()))}


def resolve_period(period) -> tuple[str, str]:
    """
    Resolve a period (PeriodRange or PeriodPreset) to (start_str, end_str).

    Example input:  PeriodPreset(preset="3y")
    Example output: ("2023-10-11", "2026-10-11")
    """
    today = date.today()
    if hasattr(period, "preset"):
        preset = period.preset
        if preset == "1y":
            start = today - timedelta(days=365)
        elif preset == "3y":
            start = today - timedelta(days=3 * 365)
        elif preset == "5y":
            start = today - timedelta(days=5 * 365)
        else:  # max
            start = date(2012, 1, 1)
        return str(start), str(today)
    elif hasattr(period, "start") and hasattr(period, "end"):
        return period.start, period.end
    raise RiskScopeError(INVALID_PERIOD, "Invalid period format.")


def load_and_validate(
    tickers: list[str],
    start: str,
    end: str,
    currency: str,
    min_rows: int = MIN_ROWS,
) -> pd.DataFrame:
    """Load prices, validate tickers exist and have sufficient history."""
    validate_tickers(tickers)
    prices = load_prices(tickers, start, end, currency)
    if prices.empty or len(prices) < min_rows:
        raise RiskScopeError(
            INSUFFICIENT_HISTORY,
            f"Insufficient price history for the requested period. Got {len(prices)} rows, need {min_rows}.",
        )
    # Check for tickers missing from prices
    missing = [t for t in tickers if t not in prices.columns]
    if missing:
        raise RiskScopeError(UNKNOWN_TICKER, f"No data for tickers: {missing}", tickers=missing)
    return prices


def holdings_to_weights(holdings: list) -> tuple[list[str], list[float]]:
    """Convert holdings list to (tickers, normalized_weights)."""
    tickers = [h.ticker for h in holdings]
    amounts = [float(h.amount) for h in holdings]
    total = sum(amounts)
    weights = [a / total for a in amounts]
    return tickers, weights


def resolve_benchmark(
    benchmark_str: str,
    tickers: list[str],
    currency: str,
    start: str,
    end: str,
) -> tuple[str, pd.Series]:
    """
    Resolve benchmark name to ticker and load its price series.

    Example input:  "auto", ["NVDA","TCS.NS"], "INR", "2023-01-01", "2026-01-01"
    Example output: ("^NSEI", pd.Series of prices)
    """
    if benchmark_str == "auto":
        india_count = sum(1 for t in tickers if t.endswith(".NS"))
        us_count = len(tickers) - india_count
        bench_ticker = "^NSEI" if india_count >= us_count else "^NDX"
    else:
        bench_ticker = BENCHMARK_MAP.get(benchmark_str, ("^NSEI", "INR"))[0]

    bench_prices = load_prices([bench_ticker], start, end, currency)
    if bench_ticker in bench_prices.columns:
        return bench_ticker, bench_prices[bench_ticker]
    return bench_ticker, pd.Series(dtype=float)


def lookback_to_dates(lookback: str) -> tuple[str, str]:
    days = LOOKBACK_DAYS.get(lookback, 365)
    end = date.today()
    start = end - timedelta(days=days)
    return str(start), str(end)


def sector_map_from_tickers(tickers: list[str]) -> dict[str, str]:
    return {t: UNIVERSE_MAP.get(t, {}).get("sector", "Unknown") for t in tickers}
