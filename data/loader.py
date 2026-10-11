"""
data/loader.py  –  Cache-first price loader for RiskScope.

load_prices(tickers, start, end, currency) -> pd.DataFrame
    Returns daily adjusted closes aligned on the union of dates,
    forward-filled up to 3 days, NaN rows dropped.
    Columns are the requested tickers; index is pd.DatetimeIndex.
    Always attaches .attrs["data_source"] and .attrs["as_of"].

latest_prices(tickers) -> dict
    Tries a 5-second live yfinance call; falls back to last cached close.

Example input:  load_prices(["TCS.NS","NVDA"], "2022-01-01", "2023-01-01", "INR")
Example output: DataFrame with two columns, ~250 rows, attrs["as_of"]="2023-01-01"
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Sequence

import numpy as np
import pandas as pd
import yfinance as yf

log = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / "cache"
PRICES_PATH = CACHE_DIR / "prices.parquet"
META_PATH = CACHE_DIR / "meta.json"
UNIVERSE_PATH = Path(__file__).parent / "universe.json"

FFILL_LIMIT = 3
LIVE_TIMEOUT = 5  # seconds


def _load_universe() -> dict[str, dict]:
    """Load universe.json -> {ticker: asset_dict}."""
    with open(UNIVERSE_PATH) as f:
        data = json.load(f)
    result: dict[str, dict] = {}
    for asset in data["assets"]:
        result[asset["ticker"]] = asset
    for bench in data["benchmarks"]:
        result[bench["ticker"]] = bench
    return result


UNIVERSE: dict[str, dict] = _load_universe()


def _read_cache() -> pd.DataFrame:
    """Read prices.parquet; returns empty DataFrame if not found."""
    if PRICES_PATH.exists():
        df = pd.read_parquet(PRICES_PATH)
        df.index = pd.DatetimeIndex(df.index)
        return df
    return pd.DataFrame()


def _read_meta() -> dict:
    if META_PATH.exists():
        with open(META_PATH) as f:
            return json.load(f)
    return {"as_of": str(date.today()), "data_source": "cache"}


def _fx_series(cache: pd.DataFrame) -> pd.Series | None:
    """Return USDINR=X series from cache, or None."""
    if "USDINR=X" in cache.columns:
        return cache["USDINR=X"]
    return None


def _convert_to_currency(
    prices: pd.DataFrame,
    tickers: list[str],
    target_currency: str,
    fx: pd.Series | None,
) -> pd.DataFrame:
    """
    Convert asset prices to target_currency using daily USDINR=X series.

    Example input:  prices has NVDA in USD, target_currency="INR", fx=USDINR series
    Example output: NVDA column multiplied by the daily USD->INR rate.
    """
    if fx is None or target_currency not in ("INR", "USD"):
        return prices

    result = prices.copy()
    for ticker in tickers:
        if ticker not in result.columns:
            continue
        asset = UNIVERSE.get(ticker, {})
        asset_currency = asset.get("currency", "USD")
        if asset_currency == target_currency:
            continue
        # Align fx to prices index
        fx_aligned = fx.reindex(result.index).ffill(limit=FFILL_LIMIT)
        if target_currency == "INR" and asset_currency == "USD":
            result[ticker] = result[ticker] * fx_aligned
        elif target_currency == "USD" and asset_currency == "INR":
            result[ticker] = result[ticker] / fx_aligned
    return result


def load_prices(
    tickers: Sequence[str],
    start: str | date,
    end: str | date,
    currency: str = "INR",
) -> pd.DataFrame:
    """
    Return daily adjusted closes for tickers between start and end (inclusive),
    expressed in the given currency, using cache-first strategy.

    Example input:  load_prices(["TCS.NS", "NVDA"], "2022-01-01", "2023-01-01", "INR")
    Example output: DataFrame(index=DatetimeIndex, columns=["TCS.NS","NVDA"])
                    .attrs = {"data_source": "cache", "as_of": "2023-01-01"}
    """
    tickers = list(tickers)
    start_dt = pd.Timestamp(start)
    end_dt = pd.Timestamp(end)

    cache = _read_cache()
    meta = _read_meta()

    if cache.empty:
        data_source = "cache"
        df = pd.DataFrame(index=pd.DatetimeIndex([]))
    else:
        # Filter columns to those requested + FX
        need_cols = set(tickers) | {"USDINR=X"}
        available = [c for c in need_cols if c in cache.columns]
        df = cache[available].copy()
        df = df[(df.index >= start_dt) & (df.index <= end_dt)]
        data_source = "cache"

    # Align and clean
    df = df.sort_index()
    df = df.ffill(limit=FFILL_LIMIT)
    df = df.dropna(how="any")

    fx = _fx_series(df)

    # Only keep requested tickers
    available_tickers = [t for t in tickers if t in df.columns]
    if not available_tickers:
        empty = pd.DataFrame(columns=tickers)
        empty.attrs = {"data_source": data_source, "as_of": meta.get("as_of", str(date.today()))}
        return empty

    result = df[available_tickers].copy()
    result = _convert_to_currency(result, available_tickers, currency, fx)

    as_of = str(result.index[-1].date()) if not result.empty else meta.get("as_of", str(date.today()))
    result.attrs = {"data_source": data_source, "as_of": as_of}
    return result


def latest_prices(tickers: Sequence[str]) -> dict:
    """
    Try live yfinance (5s timeout) for the latest price; fall back to last cached close.

    Example input:  latest_prices(["NVDA", "TCS.NS"])
    Example output: {"NVDA": {"price": 875.3, "day_change": 0.012, "currency": "USD", "data_source": "live"}, ...}
    """
    tickers = list(tickers)
    result: dict = {}
    cache = _read_cache()
    meta = _read_meta()

    # Try live using Ticker.history() per-ticker (yf.download bulk API is unreliable)
    live_data: dict[str, dict] = {}
    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="2d", auto_adjust=True)
            if hist.empty or "Close" not in hist.columns:
                continue
            vals = hist["Close"].dropna()
            if len(vals) >= 2:
                price = float(vals.iloc[-1])
                prev = float(vals.iloc[-2])
                day_change = (price - prev) / prev if prev != 0 else 0.0
                live_data[ticker] = {
                    "price": round(price, 4),
                    "day_change": round(day_change, 6),
                    "currency": UNIVERSE.get(ticker, {}).get("currency", "USD"),
                    "data_source": "live",
                }
        except Exception as e:
            log.warning("Live price fetch failed for %s: %s", ticker, e)

    for ticker in tickers:
        if ticker in live_data:
            result[ticker] = live_data[ticker]
        elif not cache.empty and ticker in cache.columns:
            price_series = cache[ticker].dropna()
            if not price_series.empty:
                price = float(price_series.iloc[-1])
                prev = float(price_series.iloc[-2]) if len(price_series) >= 2 else price
                day_change = (price - prev) / prev if prev != 0 else 0.0
                result[ticker] = {
                    "price": round(price, 4),
                    "day_change": round(day_change, 6),
                    "currency": UNIVERSE.get(ticker, {}).get("currency", "USD"),
                    "data_source": "cache",
                    "as_of": meta.get("as_of"),
                }
        else:
            result[ticker] = {
                "price": None,
                "day_change": None,
                "currency": UNIVERSE.get(ticker, {}).get("currency", "USD"),
                "data_source": "unavailable",
            }

    return result


def to_currency(prices: pd.DataFrame, tickers: list[str], target_currency: str) -> pd.DataFrame:
    """
    Public helper: convert a prices DataFrame to target_currency using cached FX.

    Example input:  to_currency(df, ["NVDA"], "INR")
    Example output: df with NVDA multiplied by USDINR series.
    """
    cache = _read_cache()
    fx = _fx_series(cache)
    return _convert_to_currency(prices, tickers, target_currency, fx)
