"""api/errors.py – Typed error responses for RiskScope."""
from __future__ import annotations
from fastapi import Request
from fastapi.responses import JSONResponse


class RiskScopeError(Exception):
    def __init__(self, code: str, message: str, tickers: list[str] | None = None, status: int = 400):
        self.code = code
        self.message = message
        self.tickers = tickers
        self.status = status
        super().__init__(message)


UNKNOWN_TICKER = "UNKNOWN_TICKER"
INSUFFICIENT_HISTORY = "INSUFFICIENT_HISTORY"
INVALID_WEIGHTS = "INVALID_WEIGHTS"
INVALID_PERIOD = "INVALID_PERIOD"
DATA_UNAVAILABLE = "DATA_UNAVAILABLE"
INTERNAL = "INTERNAL"


async def riskscope_error_handler(request: Request, exc: RiskScopeError):
    body: dict = {"error": {"code": exc.code, "message": exc.message}}
    if exc.tickers:
        body["error"]["tickers"] = exc.tickers
    return JSONResponse(status_code=exc.status, content=body)
