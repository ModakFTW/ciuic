"""api/schemas.py – Pydantic schemas matching the architecture.md v2 contract."""
from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, field_validator, model_validator


RiskLevel = Literal["low", "medium", "high"]
RiskLabel = Literal["Low", "Medium", "High"]
BenchmarkType = Literal["NIFTY50", "NASDAQ100", "auto"]
CurrencyType = Literal["INR", "USD"]
ScenarioType = Literal["market_crash", "market_recovery", "high_volatility", "sector_downturn"]
RebalanceType = Literal["none", "monthly", "quarterly"]
LookbackType = Literal["1m", "6m", "1y", "3y"]


class Holding(BaseModel):
    ticker: str
    amount: float


class PositionIn(BaseModel):
    ticker: str
    quantity: float
    buy_price: float


class PeriodPreset(BaseModel):
    preset: Literal["1y", "3y", "5y", "max"]


class PeriodRange(BaseModel):
    start: str
    end: str


# ------- Request bodies -------

class AnalyzeRequest(BaseModel):
    holdings: list[Holding]
    risk_level: RiskLevel
    period: PeriodRange | PeriodPreset = PeriodPreset(preset="3y")
    currency: CurrencyType = "INR"

    @field_validator("holdings")
    @classmethod
    def check_holdings(cls, v):
        if not (2 <= len(v) <= 15):
            raise ValueError("Must have 2-15 holdings")
        return v


class AllocateRequest(BaseModel):
    tickers: list[str]
    amount: float
    risk_level: RiskLevel
    period: PeriodRange | PeriodPreset = PeriodPreset(preset="3y")
    currency: CurrencyType = "INR"
    current_weights: Optional[list[float]] = None

    @field_validator("tickers")
    @classmethod
    def check_tickers(cls, v):
        if not (2 <= len(v) <= 15):
            raise ValueError("Must have 2-15 tickers")
        return v

    @field_validator("amount")
    @classmethod
    def check_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be > 0")
        return v


class SimulateRequest(BaseModel):
    weights: dict[str, float]
    amount: float
    period: PeriodRange | PeriodPreset = PeriodPreset(preset="3y")
    rebalance: RebalanceType = "monthly"
    currency: CurrencyType = "INR"


class BenchmarkRequest(BaseModel):
    weights: dict[str, float]
    amount: float
    benchmark: BenchmarkType = "auto"
    period: PeriodRange | PeriodPreset = PeriodPreset(preset="3y")
    currency: CurrencyType = "INR"


class TrackRequest(BaseModel):
    positions: list[PositionIn]
    benchmark: BenchmarkType = "auto"
    lookback: LookbackType = "1y"
    currency: CurrencyType = "INR"

    @field_validator("positions")
    @classmethod
    def check_positions(cls, v):
        if not (1 <= len(v) <= 15):
            raise ValueError("Must have 1-15 positions")
        return v


class CompareRequest(BaseModel):
    holdings: list[Holding]
    risk_level: RiskLevel
    benchmark: BenchmarkType = "auto"
    period: PeriodRange | PeriodPreset = PeriodPreset(preset="3y")
    shield_floor: float = -0.15
    currency: CurrencyType = "INR"


class ShieldRequest(BaseModel):
    weights: dict[str, float]
    amount: float
    floor: float = -0.15
    multiplier: Optional[float] = None
    period: PeriodRange | PeriodPreset = PeriodPreset(preset="3y")


class ScenarioRequest(BaseModel):
    weights: dict[str, float]
    amount: float
    scenario: ScenarioType
    magnitude: Optional[float] = None
    sector: Optional[str] = None
    replay: Optional[Literal["covid_2020", "bear_2022"]] = None
