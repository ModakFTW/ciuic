"""api/main.py – FastAPI application entry point for RiskScope."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.errors import RiskScopeError, riskscope_error_handler, INTERNAL
from api.routers import meta, simulate, benchmark, track, shield, compare

app = FastAPI(title="RiskScope API", version="2.0.0")

# CORS: only allow the frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Error handlers
app.add_exception_handler(RiskScopeError, riskscope_error_handler)


@app.exception_handler(Exception)
async def generic_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": INTERNAL, "message": "An internal error occurred."}},
    )


# Routers
app.include_router(meta.router, prefix="/api")
app.include_router(simulate.router, prefix="/api")
app.include_router(benchmark.router, prefix="/api")
app.include_router(track.router, prefix="/api")
app.include_router(shield.router, prefix="/api")
app.include_router(compare.router, prefix="/api")

# JJ's routers will be included when ready
try:
    from api.routers import analyze, allocate, scenario, brief
    app.include_router(analyze.router, prefix="/api")
    app.include_router(allocate.router, prefix="/api")
    app.include_router(scenario.router, prefix="/api")
    app.include_router(brief.router, prefix="/api")
except ImportError:
    pass
