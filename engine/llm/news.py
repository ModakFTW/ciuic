"""
engine/llm/news.py — Lightweight headline fetcher with yfinance & Google News RSS fallback.

Cached per ticker under data/cache/news. Never raises.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

CACHE_DIR_DEFAULT = Path(__file__).resolve().parents[2] / "data" / "cache" / "news"


def _clean_text(text: str) -> str:
    """Strip HTML tags, control chars, and truncate to 200 chars."""
    if not text:
        return ""
    # Strip HTML tags
    cleaned = re.sub(r"<[^>]+>", "", text)
    # Strip control characters
    cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", cleaned)
    # Normalize whitespace
    cleaned = " ".join(cleaned.split())
    return cleaned[:200]


def _read_cache(ticker: str, cache_dir: Path, today_str: str) -> list[dict[str, str]] | None:
    cache_file = cache_dir / f"{ticker.replace('^', '_').replace('=', '_')}.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("date") == today_str and isinstance(data.get("headlines"), list):
                return data["headlines"]
        except Exception:
            pass
    return None


def _write_cache(ticker: str, cache_dir: Path, today_str: str, headlines: list[dict[str, str]]) -> None:
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = cache_dir / f"{ticker.replace('^', '_').replace('=', '_')}.json"
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump({"date": today_str, "headlines": headlines}, f, indent=2)
    except Exception:
        pass


def _fetch_yfinance_news(ticker: str) -> list[dict[str, str]]:
    """Fetch news via yfinance, handling both old and new schema shapes."""
    try:
        import yfinance as yf  # lazy import
        t = yf.Ticker(ticker)
        raw_news = getattr(t, "news", None)
        if not raw_news or not isinstance(raw_news, list):
            return []

        headlines: list[dict[str, str]] = []
        for item in raw_news:
            if not isinstance(item, dict):
                continue

            title = ""
            publisher = ""

            # Check new shape: content -> title, provider -> displayName
            if "content" in item and isinstance(item["content"], dict):
                c = item["content"]
                title = str(c.get("title", ""))
                provider = c.get("provider", {})
                if isinstance(provider, dict):
                    publisher = str(provider.get("displayName", ""))
                elif isinstance(provider, str):
                    publisher = provider
            # Check old shape: title, publisher
            elif "title" in item:
                title = str(item.get("title", ""))
                publisher = str(item.get("publisher", ""))

            title = _clean_text(title)
            publisher = _clean_text(publisher) or "Market News"

            if title:
                headlines.append({"title": title, "publisher": publisher})
                if len(headlines) >= 8:
                    break
        return headlines
    except Exception:
        return []


def _fetch_rss_news(ticker: str) -> list[dict[str, str]]:
    """Fallback: fetch headlines from Google News RSS."""
    try:
        query = ticker.split(".")[0].replace("^", "")
        url = f"https://news.google.com/rss/search?q={query}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            content = resp.read()
        root = ET.fromstring(content)
        headlines: list[dict[str, str]] = []
        for item in root.findall(".//item"):
            title_elem = item.find("title")
            source_elem = item.find("source")
            raw_title = title_elem.text if title_elem is not None and title_elem.text else ""
            source = source_elem.text if source_elem is not None and source_elem.text else ""

            # Google News RSS title format is usually "Headline - Publisher"
            if not source and " - " in raw_title:
                parts = raw_title.rsplit(" - ", 1)
                title = _clean_text(parts[0])
                source = _clean_text(parts[1])
            else:
                title = _clean_text(raw_title)
                source = _clean_text(source) or "Google News"

            if title:
                headlines.append({"title": title, "publisher": source})
                if len(headlines) >= 8:
                    break
        return headlines
    except Exception:
        return []


def get_headlines(tickers: list[str]) -> dict[str, list[dict[str, str]]]:
    """Get recent news headlines for given tickers.

    Never raises. Returns {ticker: [{title, publisher}]}. Max 8 per ticker.
    """
    result: dict[str, list[dict[str, str]]] = {}
    if not tickers:
        return result

    cache_dir = Path(os.environ.get("NEWS_CACHE_DIR", str(CACHE_DIR_DEFAULT)))
    try:
        today_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")
    except Exception:
        today_str = datetime.now().strftime("%Y-%m-%d")

    for ticker in tickers:
        try:
            cached = _read_cache(ticker, cache_dir, today_str)
            if cached is not None:
                result[ticker] = cached[:8]
                continue

            hl = _fetch_yfinance_news(ticker)
            if not hl:
                hl = _fetch_rss_news(ticker)

            hl = hl[:8]
            _write_cache(ticker, cache_dir, today_str, hl)
            result[ticker] = hl
        except Exception:
            result[ticker] = []

    return result
