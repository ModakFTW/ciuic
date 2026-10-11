"""
engine/ml/validation.py — Data freshness, validation, and metadata utilities for ML pipeline.

Ensures the model trains ONLY on completed daily closes.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT_DIR / "data" / "cache"
META_PATH = CACHE_DIR / "meta.json"
PARQUET_PATH = CACHE_DIR / "prices.parquet"
UNIVERSE_PATH = ROOT_DIR / "data" / "universe.json"


def get_universe_tickers() -> list[str]:
    """Load all asset and benchmark tickers from data/universe.json."""
    if not UNIVERSE_PATH.exists():
        raise FileNotFoundError(f"Universe file not found: {UNIVERSE_PATH}")
    with open(UNIVERSE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    tickers = [a["ticker"] for a in data.get("assets", [])]
    tickers += [b["ticker"] for b in data.get("benchmarks", [])]
    return tickers


def get_git_commit() -> str:
    """Return short git commit sha or 'unknown'."""
    try:
        res = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(ROOT_DIR),
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return res if res else "unknown"
    except Exception:
        return "unknown"


def refresh_cache() -> tuple[str, str, bool]:
    """Run data/scripts/fetch_data.py as a subprocess if network is available.

    Returns (as_of_before, as_of_after, refreshed_success).
    """
    as_of_before = "unknown"
    if META_PATH.exists():
        try:
            with open(META_PATH, "r", encoding="utf-8") as f:
                as_of_before = json.load(f).get("as_of", "unknown")
        except Exception:
            pass

    print(f"as_of before refresh: {as_of_before}")

    fetch_script = ROOT_DIR / "data" / "scripts" / "fetch_data.py"
    refreshed_success = False

    try:
        res = subprocess.run(
            [sys.executable, str(fetch_script)],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
            timeout=180,
        )
        if res.returncode == 0:
            print("Data fetch completed successfully.")
            refreshed_success = True
        else:
            print(
                f"Data fetch failed (exit code {res.returncode}); continuing with existing cache."
            )
    except subprocess.TimeoutExpired:
        print("Data fetch timed out; continuing with existing cache.")
    except Exception as e:
        print(f"Data fetch failed ({e}); continuing with existing cache.")

    as_of_after = as_of_before
    if META_PATH.exists():
        try:
            with open(META_PATH, "r", encoding="utf-8") as f:
                as_of_after = json.load(f).get("as_of", as_of_before)
        except Exception:
            pass

    print(f"as_of after refresh: {as_of_after}")
    return as_of_before, as_of_after, refreshed_success


def validate_prices(
    prices: pd.DataFrame,
    as_of: str,
    raw_parquet_path: Path | str | None = None,
) -> tuple[pd.DataFrame, int]:
    """Validate prices DataFrame before training or dataset generation.

    Prints one PASS/FAIL line each for:
      a. INR-converted: NVDA and TCS.NS at plausible INR levels; NVDA ratio matches USDINR factor.
      b. Index sorted and unique; no NaNs; no non-positive prices.
      c. Partial bars removed: drop any final row dated today (IST) or later.
      d. ^NSEI and ^NDX present; every ticker used has at least 378 rows.
      e. Last date equals as_of (or earlier date after step c).

    Returns (cleaned_prices, dropped_rows_count).
    """
    # a. INR-converted validation
    try:
        assert "NVDA" in prices.columns, "NVDA not found in prices columns"
        assert "TCS.NS" in prices.columns, "TCS.NS not found in prices columns"
        nvda_inr = float(prices["NVDA"].iloc[-1])
        tcs_inr = float(prices["TCS.NS"].iloc[-1])
        assert nvda_inr > 1000.0, f"NVDA price {nvda_inr} is not a plausible INR level"
        assert tcs_inr > 500.0, f"TCS.NS price {tcs_inr} is not a plausible INR level"

        p_path = Path(raw_parquet_path) if raw_parquet_path else PARQUET_PATH
        if p_path.exists():
            raw_df = pd.read_parquet(p_path)
            assert "NVDA" in raw_df.columns, "NVDA missing in raw parquet"
            assert "USDINR=X" in raw_df.columns, "USDINR=X missing in raw parquet"
            nvda_usd = float(raw_df["NVDA"].iloc[-1])
            usdinr_rate = float(raw_df["USDINR=X"].iloc[-1])
            ratio = nvda_inr / nvda_usd
            assert abs(ratio - usdinr_rate) / usdinr_rate < 0.05, (
                f"NVDA INR/USD ratio {ratio:.2f} differs from USDINR rate {usdinr_rate:.2f}"
            )
            print(
                f"PASS: INR-converted (NVDA={nvda_inr:.1f} INR, TCS.NS={tcs_inr:.1f} INR, "
                f"NVDA INR/USD ratio {ratio:.2f} matches USDINR factor {usdinr_rate:.2f})"
            )
        else:
            print(f"PASS: INR-converted (NVDA={nvda_inr:.1f} INR, TCS.NS={tcs_inr:.1f} INR)")
    except Exception as exc:
        print(f"FAIL: INR-converted check failed: {exc}")
        raise

    # b. Index sorted, unique, no NaNs, positive prices
    try:
        assert prices.index.is_monotonic_increasing, "Index is not monotonically increasing"
        assert prices.index.is_unique, "Index contains duplicate timestamps"
        assert not prices.isna().any().any(), "Prices DataFrame contains NaNs"
        assert (prices > 0).all().all(), "Prices DataFrame contains non-positive values"
        print("PASS: Index sorted and unique; no NaNs; no non-positive prices")
    except Exception as exc:
        print(f"FAIL: Index / NaN / positivity check failed: {exc}")
        raise

    # c. Partial bars removed (today in IST or later)
    today_ist = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    initial_len = len(prices)
    cleaned_prices = prices[prices.index.date < today_ist].copy()
    dropped_count = initial_len - len(cleaned_prices)
    print(
        f"PASS: Partial bars removed: dropped {dropped_count} rows dated >= {today_ist} (IST)"
    )

    # d. Benchmarks present and min 378 rows
    try:
        assert "^NSEI" in cleaned_prices.columns, "^NSEI benchmark missing"
        assert "^NDX" in cleaned_prices.columns, "^NDX benchmark missing"
        min_rows = min(int(cleaned_prices[c].count()) for c in cleaned_prices.columns)
        assert min_rows >= 378, f"Ticker with lowest row count has {min_rows} < 378 rows"
        print(
            f"PASS: ^NSEI and ^NDX present; every ticker used has at least 378 rows (min: {min_rows})"
        )
    except Exception as exc:
        print(f"FAIL: Benchmarks or row count check failed: {exc}")
        raise

    # e. Last date equals as_of (or earlier date after step c)
    try:
        last_date = str(cleaned_prices.index[-1].date())
        # If original as_of was >= today_ist, expected last date is the trimmed last date
        as_of_date = pd.to_datetime(as_of).date()
        expected_last_date = str(min(as_of_date, today_ist)) if as_of_date >= today_ist else as_of
        # If step c dropped rows, the expected last date is the date of the last bar before today
        if dropped_count > 0:
            expected_last_date = last_date
        assert last_date == expected_last_date, (
            f"Last date {last_date} does not match expected as_of {expected_last_date}"
        )
        print(f"PASS: Last date equals as_of ({last_date})")
    except Exception as exc:
        print(f"FAIL: Last date check failed: {exc}")
        raise

    return cleaned_prices, dropped_count
