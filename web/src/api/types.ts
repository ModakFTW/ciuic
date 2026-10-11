// API Types conforming exactly to docs/architecture.md Section 6 (API contract v2)

export type RiskLevel = "low" | "medium" | "high";
export type RiskLabel = "Low" | "Medium" | "High";
export type Benchmark = "NIFTY50" | "NASDAQ100" | "auto";
export type Currency = "INR" | "USD";
export type Scenario = "market_crash" | "market_recovery" | "high_volatility" | "sector_downturn";
export type RebalanceFrequency = "none" | "monthly" | "quarterly";
export type LookbackPeriod = "1m" | "6m" | "1y" | "3y";
export type BenchmarkVerdict = "outperforming" | "underperforming" | "in_line";

export interface Meta {
  data_source: "live" | "cache";
  as_of: string;
}

export interface ApiError {
  error: {
    code: "UNKNOWN_TICKER" | "INSUFFICIENT_HISTORY" | "INVALID_WEIGHTS" | "INVALID_PERIOD" | "DATA_UNAVAILABLE" | "INTERNAL" | string;
    message: string;
    tickers?: string[];
  };
}

export interface Holding {
  ticker: string;
  amount: number;
}

export interface PositionIn {
  ticker: string;
  quantity: number;
  buy_price: number;
}

export type Period = 
  | { start: string; end: string }
  | { preset: "1y" | "3y" | "5y" | "max" };

export interface Metrics {
  total_return: number;
  ann_return: number;
  volatility: number;
  max_drawdown: number;
  sharpe: number;
  sortino: number;
  diversification_ratio: number;
  cvar_95: number;
  avg_correlation: number;
  hhi: number;
}

// 1. GET /api/health
export interface HealthResponse {
  status: string;
  model_version: string;
  meta: Meta;
}

// 2. GET /api/assets/search?q=
export interface AssetSearchResult {
  ticker: string;
  name: string;
  sector: string;
  market: string;
  currency: string;
}

export interface AssetSearchResponse {
  results: AssetSearchResult[];
}

// 3. GET /api/presets
export interface Preset {
  id: string;
  name: string;
  risk_level: RiskLevel;
  currency: Currency;
  holdings: Holding[];
}

export interface PresetsResponse {
  presets: Preset[];
}

// 4. GET /api/regimes
export interface Regime {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface RegimesResponse {
  regimes: Regime[];
}

// 5. GET /api/model/info
export interface ModelInfoResponse {
  trained_on: string;
  n_samples: number;
  label_definition: string;
  cutpoints: number[];
  test_period: string;
  metrics: {
    model: { macro_f1: number; accuracy: number; off_by_two: number };
    logreg: { macro_f1: number; accuracy: number; off_by_two: number };
    persistence: { macro_f1: number; accuracy: number; off_by_two: number };
    majority: { macro_f1: number; accuracy: number; off_by_two: number };
  };
  confusion_matrix: number[][];
  median_fwd_vol: {
    Low: number;
    Medium: number;
    High: number;
  };
}

// 6. GET /api/prices/live?tickers=
export interface LivePriceItem {
  ticker: string;
  price: number;
  day_change: number;
  currency: Currency | string;
}

export interface LivePricesResponse {
  prices: LivePriceItem[];
  meta: Meta;
}

// 7. POST /api/analyze
export interface AnalyzeRequest {
  holdings: Holding[];
  risk_level: RiskLevel;
  period: Period;
  currency: Currency;
}

export interface AssetStat {
  ticker: string;
  weight: number;
  ann_return: number;
  volatility: number;
  max_drawdown: number;
  risk_contribution: number;
  return_contribution: number;
}

export interface RiskDriver {
  factor: string;
  impact: number;
  direction: "increases_risk" | "reduces_risk" | string;
}

export interface Counterfactual {
  target_label: RiskLabel;
  weights: Record<string, number>;
  predicted_label: RiskLabel;
}

export interface AnalyzeResponse {
  risk_label: RiskLabel;
  risk_score: number;
  confidence: number;
  probs: {
    Low: number;
    Medium: number;
    High: number;
  };
  metrics: Metrics;
  weights: Record<string, number>;
  asset_stats: AssetStat[];
  correlation: {
    tickers: string[];
    matrix: number[][];
  };
  sector_exposure: Record<string, number>;
  risk_drivers: RiskDriver[];
  explanations: string[];
  counterfactual: Counterfactual | null;
  meta: Meta;
}

// 8. POST /api/allocate
export interface AllocateRequest {
  tickers: string[];
  amount: number;
  risk_level: RiskLevel;
  period: Period;
  currency: Currency;
  current_weights?: Record<string, number>;
}

export interface RecommendedAsset {
  ticker: string;
  weight: number;
  amount: number;
  rationale: string;
}

export interface CurrentVsRecommended {
  ticker: string;
  current: number;
  recommended: number;
}

export interface EfficientFrontierPoint {
  volatility: number;
  ann_return: number;
  label: string;
}

export interface AllocateResponse {
  method: string;
  recommended: RecommendedAsset[];
  current_vs_recommended: CurrentVsRecommended[];
  before: Metrics;
  after: Metrics;
  predicted_risk_after: {
    label: RiskLabel;
    probs: {
      Low: number;
      Medium: number;
      High: number;
    };
  };
  tradeoff: {
    return_change: number;
    volatility_change: number;
    drawdown_change: number;
  };
  efficient_frontier: EfficientFrontierPoint[];
  capacity_note?: string;
  explanations: string[];
  meta: Meta;
}

// 9. POST /api/simulate
export interface SimulateRequest {
  weights: Record<string, number>;
  amount: number;
  period: Period;
  rebalance: RebalanceFrequency;
  currency: Currency;
}

export interface SimulateResponse {
  metrics: Metrics;
  final_value: number;
  dates: string[];
  series: {
    portfolio: number[];
  };
  drawdown: number[];
  explanations: string[];
  meta: Meta;
}

// 10. POST /api/benchmark
export interface BenchmarkRequest {
  weights: Record<string, number>;
  amount: number;
  benchmark: Benchmark;
  period: Period;
  currency: Currency;
}

export interface BenchmarkResponse {
  portfolio: Metrics;
  benchmark: Metrics;
  dates: string[];
  series: {
    portfolio: number[];
    benchmark: number[];
  };
  drawdown: {
    portfolio: number[];
    benchmark: number[];
  };
  alpha: number;
  beta: number;
  excess_return: number;
  verdict: BenchmarkVerdict;
  explanations: string[];
  meta: Meta;
}

// 11. POST /api/track
export interface TrackRequest {
  positions: PositionIn[];
  benchmark: Benchmark;
  lookback: LookbackPeriod;
  currency: Currency;
}

export interface TrackPosition {
  ticker: string;
  price: number;
  value: number;
  pnl: number;
  pnl_pct: number;
  weight: number;
  day_change: number;
}

export interface TrackResponse {
  positions: TrackPosition[];
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  risk: {
    label: RiskLabel;
    score: number;
    probs: {
      Low: number;
      Medium: number;
      High: number;
    };
  };
  allocation: Record<string, number>;
  sector_exposure: Record<string, number>;
  benchmark: {
    ticker: string;
    dates: string[];
    series: {
      portfolio: number[];
      benchmark: number[];
    };
    portfolio: Metrics;
    benchmark_metrics: Metrics;
    verdict: BenchmarkVerdict;
  };
  explanations: string[];
  meta: Meta;
}

// 12. POST /api/compare
export interface CompareRequest {
  holdings: Holding[];
  risk_level: RiskLevel;
  benchmark: Benchmark;
  period: Period;
  shield_floor: number;
  currency: Currency;
}

export interface CompareResponse {
  dates: string[];
  series: {
    original: number[];
    recommended: number[];
    equal_weight: number[];
    insured: number[];
    benchmark: number[];
  };
  metrics: {
    original: Metrics;
    recommended: Metrics;
    equal_weight: Metrics;
    insured: Metrics;
    benchmark: Metrics;
  };
  weights: {
    original: Record<string, number>;
    recommended: Record<string, number>;
    equal_weight: Record<string, number>;
  };
  risk_labels: {
    original: RiskLabel;
    recommended: RiskLabel;
    equal_weight: RiskLabel;
    insured: RiskLabel;
    benchmark: RiskLabel;
  };
  best_by: {
    total_return: string;
    volatility: string;
    max_drawdown: string;
    sharpe: string;
  };
  note: string;
  explanations: string[];
  meta: Meta;
}

// 13. POST /api/shield
export interface ShieldRequest {
  weights: Record<string, number>;
  amount: number;
  floor: number;
  multiplier?: number;
  period: Period;
}

export interface ShieldResponse {
  method: "cppi";
  multiplier_used: number;
  floor_value_start: number;
  dates: string[];
  series: {
    unprotected: number[];
    insured: number[];
    floor: number[];
  };
  risky_share: number[];
  cost: {
    return_drag_ann: number;
    premium_equivalent_pct: number;
  };
  benefit: {
    max_drawdown_unprotected: number;
    max_drawdown_insured: number;
    loss_avoided: number;
  };
  floor_breached: boolean;
  explanations: string[];
  meta: Meta;
}

// 14. POST /api/scenario
export interface ScenarioRequest {
  weights: Record<string, number>;
  amount: number;
  scenario: Scenario;
  magnitude?: number;
  sector?: string;
  replay?: "covid_2020" | "bear_2022" | null;
}

export interface ScenarioResponse {
  scenario: Scenario;
  value_before: number;
  value_after: number;
  impact_pct: number;
  metrics_after: Metrics;
  risk_label_before: RiskLabel;
  risk_label_after: RiskLabel;
  asset_impacts: Array<{
    ticker: string;
    impact_pct: number;
  }>;
  mc?: {
    p5: number;
    p50: number;
    p95: number;
  };
  explanations: string[];
  meta: Meta;
}

// 15. POST /api/brief (COULD)
export interface BriefRequest {
  tickers: string[];
  risk_label: RiskLabel;
}

export interface BriefResponse {
  sentiment: string;
  sector_trends: Array<{
    sector: string;
    view: string;
    note: string;
  }>;
  risks: string[];
  headlines_used: string[];
  disclaimer: string;
  meta: Meta;
}
