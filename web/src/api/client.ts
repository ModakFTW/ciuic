import type {
  HealthResponse,
  AssetSearchResponse,
  PresetsResponse,
  RegimesResponse,
  ModelInfoResponse,
  LivePricesResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  AllocateRequest,
  AllocateResponse,
  SimulateRequest,
  SimulateResponse,
  BenchmarkRequest,
  BenchmarkResponse,
  TrackRequest,
  TrackResponse,
  CompareRequest,
  CompareResponse,
  ShieldRequest,
  ShieldResponse,
  ScenarioRequest,
  ScenarioResponse,
  BriefRequest,
  BriefResponse,
  ApiError,
} from "./types";

const IS_MOCK =
  import.meta.env.VITE_MOCK === "1" ||
  import.meta.env.VITE_MOCK === "true" ||
  import.meta.env.VITE_MOCK === true;

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

export class ApiRequestError extends Error {
  code?: string;
  tickers?: string[];

  constructor(message: string, code?: string, tickers?: string[]) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.tickers = tickers;
  }
}

async function request<T>(
  path: string,
  mockFilename: string,
  options?: RequestInit
): Promise<T> {
  if (IS_MOCK) {
    const mockUrl = `/mocks/${mockFilename}`;
    try {
      const response = await fetch(mockUrl);
      if (!response.ok) {
        throw new ApiRequestError(
          `Failed to load mock file: ${mockFilename} (HTTP ${response.status})`,
          "MOCK_NOT_FOUND"
        );
      }
      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) throw err;
      throw new ApiRequestError(
        (err as Error)?.message || "Failed to fetch mock data",
        "MOCK_ERROR"
      );
    }
  }

  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${API_BASE}/${cleanPath}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      let errorBody: ApiError | null = null;
      try {
        errorBody = (await response.json()) as ApiError;
      } catch {
        // Ignored if response is not JSON
      }

      if (errorBody && errorBody.error) {
        throw new ApiRequestError(
          errorBody.error.message,
          errorBody.error.code,
          errorBody.error.tickers
        );
      }

      throw new ApiRequestError(
        `API request failed with HTTP ${response.status}`,
        "HTTP_ERROR"
      );
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    if (err instanceof ApiRequestError) throw err;
    throw new ApiRequestError(
      (err as Error)?.message || "Network request failed",
      "NETWORK_ERROR"
    );
  }
}

// 1. GET /api/health
export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("health", "health.json", { method: "GET" });
}

// 2. GET /api/assets/search?q=
export async function searchAssets(query: string = ""): Promise<AssetSearchResponse> {
  const queryParam = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<AssetSearchResponse>(
    `assets/search${queryParam}`,
    "assets_search.json",
    { method: "GET" }
  );
}

// 3. GET /api/presets
export async function getPresets(): Promise<PresetsResponse> {
  return request<PresetsResponse>("presets", "presets.json", { method: "GET" });
}

// 4. GET /api/regimes
export async function getRegimes(): Promise<RegimesResponse> {
  return request<RegimesResponse>("regimes", "regimes.json", { method: "GET" });
}

// 5. GET /api/model/info
export async function getModelInfo(): Promise<ModelInfoResponse> {
  return request<ModelInfoResponse>("model/info", "model_info.json", { method: "GET" });
}

// 6. GET /api/prices/live?tickers=
export async function getLivePrices(tickers: string[] = []): Promise<LivePricesResponse> {
  const queryParam = tickers.length > 0 ? `?tickers=${tickers.join(",")}` : "";
  return request<LivePricesResponse>(
    `prices/live${queryParam}`,
    "prices_live.json",
    { method: "GET" }
  );
}

// 7. POST /api/analyze
export async function analyzePortfolio(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("analyze", "analyze.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 8. POST /api/allocate
export async function allocatePortfolio(payload: AllocateRequest): Promise<AllocateResponse> {
  return request<AllocateResponse>("allocate", "allocate.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 9. POST /api/simulate
export async function simulatePortfolio(payload: SimulateRequest): Promise<SimulateResponse> {
  return request<SimulateResponse>("simulate", "simulate.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 10. POST /api/benchmark
export async function benchmarkPortfolio(payload: BenchmarkRequest): Promise<BenchmarkResponse> {
  return request<BenchmarkResponse>("benchmark", "benchmark.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 11. POST /api/track
export async function trackPortfolio(payload: TrackRequest): Promise<TrackResponse> {
  return request<TrackResponse>("track", "track.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 12. POST /api/compare
export async function compareStrategies(payload: CompareRequest): Promise<CompareResponse> {
  return request<CompareResponse>("compare", "compare.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 13. POST /api/shield
export async function shieldPortfolio(payload: ShieldRequest): Promise<ShieldResponse> {
  return request<ShieldResponse>("shield", "shield.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 14. POST /api/scenario
export async function stressScenario(payload: ScenarioRequest): Promise<ScenarioResponse> {
  const base = await request<ScenarioResponse>("scenario", "scenario.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (IS_MOCK) {
    const mag =
      payload.magnitude !== undefined
        ? payload.magnitude
        : payload.scenario === "market_recovery"
        ? 0.25
        : payload.scenario === "high_volatility"
        ? -0.15
        : -0.30;
    const baseAmt = payload.amount || base.value_before || 1000000;

    // Dynamically derive asset impacts based on scenario and payload
    const tickers = payload.weights && Object.keys(payload.weights).length > 0
      ? Object.keys(payload.weights)
      : base.asset_impacts.map((a) => a.ticker);

    const assetImpacts = tickers.map((ticker) => {
      let betaMul = 1.0;
      if (ticker === "NVDA") betaMul = 1.35;
      else if (ticker === "TSLA") betaMul = 1.55;
      else if (ticker === "GOLDBEES.NS") betaMul = -0.22; // safe haven flight
      else if (ticker === "RELIANCE.NS") betaMul = 0.82;
      else if (ticker === "TCS.NS") betaMul = 0.68;
      else if (ticker === "HDFCBANK.NS") betaMul = 0.75;

      if (payload.scenario === "sector_downturn") {
        const sec = payload.sector || "Technology";
        const isTech = ticker === "NVDA" || ticker === "TSLA" || ticker === "TCS.NS";
        if (sec === "Technology" && isTech) {
          betaMul = 1.6;
        } else if (sec === "Financials" && ticker === "HDFCBANK.NS") {
          betaMul = 1.6;
        } else if (sec === "Energy" && ticker === "RELIANCE.NS") {
          betaMul = 1.6;
        } else {
          betaMul = 0.28;
        }
      }

      return {
        ticker,
        impact_pct: Math.round(mag * betaMul * 1000) / 1000,
      };
    });

    let overallImpact = mag;
    if (payload.weights && Object.keys(payload.weights).length > 0) {
      let wSum = 0;
      assetImpacts.forEach((ai) => {
        const w = payload.weights[ai.ticker] || 0;
        wSum += w * ai.impact_pct;
      });
      if (wSum !== 0) overallImpact = Math.round(wSum * 1000) / 1000;
    }

    const valueAfter = Math.round(baseAmt * (1 + overallImpact));
    const isGain = overallImpact > 0;

    let riskAfter: "Low" | "Medium" | "High" = "High";
    if (isGain && overallImpact > 0.15) riskAfter = "Medium";
    else if (!isGain && overallImpact < -0.2) riskAfter = "High";

    return {
      ...base,
      scenario: payload.scenario,
      value_before: baseAmt,
      value_after: valueAfter,
      impact_pct: overallImpact,
      risk_label_before: "High",
      risk_label_after: riskAfter,
      asset_impacts: assetImpacts,
      mc: {
        p5: Math.round(baseAmt * (1 + overallImpact - 0.125)),
        p50: valueAfter,
        p95: Math.round(baseAmt * (1 + overallImpact + 0.145)),
      },
      explanations:
        payload.scenario === "market_recovery"
          ? [
              `Under a ${(Math.abs(mag) * 100).toFixed(0)}% broad market expansion, high-beta equities drive portfolio performance.`,
              `Net portfolio value increases to ₹${valueAfter.toLocaleString("en-IN")}, demonstrating upside participation.`,
              `Forward risk dispersion tightens with improved Sharpe and drawdown metrics.`,
            ]
          : payload.scenario === "sector_downturn"
          ? [
              `Target sector (${payload.sector || "Technology"}) absorbs a direct ${(Math.abs(mag) * 100).toFixed(0)}% multiple compression shock.`,
              `Non-sector assets absorb a dampened shock (0.28 × beta), mitigating total portfolio loss to ${(overallImpact * 100).toFixed(1)}%.`,
              `Diversification across asset classes dampens extreme systemic tail risk.`,
            ]
          : payload.scenario === "high_volatility"
          ? [
              `Doubled return covariance expands tail outcomes across all 1,000 simulated Monte Carlo trajectories.`,
              `5th percentile tail risk projects a drawdown floor of ₹${Math.round(baseAmt * (1 + overallImpact - 0.125)).toLocaleString("en-IN")}.`,
              `Gold and defensive allocations offer critical variance dampening during regime shifts.`,
            ]
          : [
              `Under a systemic ${(Math.abs(mag) * 100).toFixed(0)}% market drawdown, high-beta tech holdings suffer amplified losses.`,
              `Total capital impacts result in a ${(overallImpact * 100).toFixed(1)}% shift (net ₹${Math.abs(valueAfter - baseAmt).toLocaleString("en-IN")}).`,
              `Flight to safety assets (e.g. Gold) buffer against worse tail outcomes.`,
            ],
    };
  }

  return base;
}

// 15. POST /api/brief
export async function getMarketBrief(payload: BriefRequest): Promise<BriefResponse> {
  return request<BriefResponse>("brief", "brief.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
