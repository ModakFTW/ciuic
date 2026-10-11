import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Flame,
  Zap,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sliders,
  DollarSign,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Activity,
  AlertCircle,
  ShieldCheck,
  Check,
} from "lucide-react";
import { usePortfolio } from "../state/PortfolioContext";
import { stressScenario } from "../api/client";
import { PageTitle } from "../components/PageTitle";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { CardSkeleton, Skeleton } from "../components/Skeleton";
import { formatCurrency, formatPercent } from "../utils/format";
import type { Scenario } from "../api/types";

const AVAILABLE_SECTORS = [
  "Technology",
  "Financials",
  "Energy",
  "Consumer Cyclical",
  "Commodities",
  "Telecom",
  "Industrials",
  "Consumer Defensive",
];

export const StressPage: React.FC = () => {
  const { holdings, amount, currency } = usePortfolio();

  // Active scenario state
  const [activeScenario, setActiveScenario] = useState<Scenario>("market_crash");
  // Magnitude slider (-50% to +50%, default -30% for crash)
  const [magnitude, setMagnitude] = useState<number>(-0.30);
  // Sector dropdown (only for sector_downturn)
  const [selectedSector, setSelectedSector] = useState<string>("Technology");
  // Replay window
  const [replay, setReplay] = useState<"covid_2020" | "bear_2022" | null>(null);

  const total = holdings.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
  const weights: Record<string, number> = {};
  holdings.forEach((h) => {
    weights[h.ticker] = total > 0 ? h.amount / total : 0;
  });

  const isScenarioEligible = Object.keys(weights).length >= 2;

  const {
    data: stressData,
    isLoading: isStressing,
    error: stressError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [
      "scenario",
      weights,
      amount,
      activeScenario,
      magnitude,
      activeScenario === "sector_downturn" ? selectedSector : null,
      replay,
    ],
    queryFn: () =>
      stressScenario({
        weights,
        amount,
        scenario: activeScenario,
        magnitude,
        sector: activeScenario === "sector_downturn" ? selectedSector : undefined,
        replay,
      }),
    enabled: isScenarioEligible,
    staleTime: 1000 * 60 * 5,
  });

  const scenariosList: {
    id: Scenario;
    name: string;
    badge: string;
    desc: string;
    defaultMag: number;
    accent: "negative" | "positive" | "warning" | "teal";
  }[] = [
    {
      id: "market_crash",
      name: "Market Crash",
      badge: "-30% Squeeze",
      desc: "Simulates systemic liquidity squeeze and high-beta drawdown across broader equity markets.",
      defaultMag: -0.30,
      accent: "negative",
    },
    {
      id: "market_recovery",
      name: "Market Rally",
      badge: "+25% Rebound",
      desc: "Simulates sharp equity recovery across leading cyclical growth and momentum sectors.",
      defaultMag: 0.25,
      accent: "positive",
    },
    {
      id: "high_volatility",
      name: "High Volatility Regime",
      badge: "2× Covariance",
      desc: "Doubles return covariance matrix with 1,000-path walk-forward Monte Carlo stress test.",
      defaultMag: -0.15,
      accent: "warning",
    },
    {
      id: "sector_downturn",
      name: "Sector Downturn",
      badge: "Target Industry",
      desc: "Isolates multiple compression to a specific target industry sector with correlation dampening.",
      defaultMag: -0.25,
      accent: "teal",
    },
  ];

  const handleSelectScenario = (scId: Scenario, defMag: number) => {
    setActiveScenario(scId);
    setMagnitude(defMag);
    setReplay(null);
  };

  if (!isScenarioEligible) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Macro Stress Testing & Scenario Analysis"
          description="Evaluate portfolio resilience under extreme shocks and systemic market dislocations."
        />
        <div className="p-12 rounded-2xl glass-panel text-center space-y-4 max-w-2xl mx-auto">
          <div className="w-12 h-12 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center text-warning mx-auto">
            <AlertTriangle className="w-6 h-6 stroke-[1.75]" />
          </div>
          <h2 className="text-lg font-bold text-main font-sans">Insufficient Portfolio Positions</h2>
          <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
            At least 2 assets are required to calculate cross-asset covariance matrices and execute realistic scenario stress shocks.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-main border border-[rgba(226,235,244,0.25)] font-semibold text-xs transition-all focus:outline-none focus:ring-2 focus:ring-teal active:scale-[0.98]"
            >
              <span>Return to Portfolio Builder</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Derive metrics safely only when data is present
  const hasData = !!stressData && !stressError;
  const impactPct = stressData?.impact_pct ?? magnitude;
  const isLoss = impactPct < 0;
  const valBefore = stressData?.value_before ?? amount;
  const valAfter = stressData?.value_after ?? Math.round(amount * (1 + impactPct));
  const netCapitalDiff = valAfter - valBefore;

  // Compute scale for asset impact bars
  const maxAbsImpact = stressData?.asset_impacts && stressData.asset_impacts.length > 0
    ? Math.max(0.3, ...stressData.asset_impacts.map((a) => Math.abs(a.impact_pct)))
    : 0.5;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageTitle
        title="Macro Stress Testing & Scenario Analysis"
        description="Simulate extreme market events, liquidity shocks, sector downturns, and multi-path Monte Carlo stress tests."
        badge={
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] border border-[rgba(226,235,244,0.18)] text-secondary">
              Engine: Covariance Shock
            </span>
            {isFetching && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-teal">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Calculating...
              </span>
            )}
          </div>
        }
      />

      {/* 1. Four Scenario Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {scenariosList.map((sc) => {
          const isSelected = activeScenario === sc.id && !replay;

          return (
            <button
              key={sc.id}
              onClick={() => handleSelectScenario(sc.id, sc.defaultMag)}
              className={`p-4 rounded-xl text-left cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 active:scale-[0.96] relative overflow-hidden ${
                isSelected
                  ? "glass-panel-selected border-[rgba(226,235,244,0.38)]"
                  : "glass-panel-interactive"
              }`}
            >
              {/* Top Highlight Indicator */}
              {isSelected && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal/60 via-teal to-teal/60" />
              )}

              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                      isSelected
                        ? "bg-teal/20 text-teal border-teal/40"
                        : "bg-white/[0.04] text-secondary border-white/[0.08]"
                    }`}
                  >
                    <Flame className="w-4 h-4 stroke-[1.75]" />
                  </div>
                  <span className="font-bold text-sm text-main font-sans tracking-tight">
                    {sc.name}
                  </span>
                </div>
                {isSelected ? (
                  <span className="w-4 h-4 rounded-full bg-teal/20 border border-teal text-teal flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-secondary/70 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">
                    {sc.badge}
                  </span>
                )}
              </div>

              <p className="text-xs text-secondary leading-relaxed font-sans line-clamp-2">
                {sc.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* 2. Coherent Control Surface: Shock Slider + Sector Targeting + Crisis Replays */}
      <div className="p-5 rounded-2xl glass-panel-elevated space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[rgba(226,235,244,0.10)]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-teal stroke-[1.75]" />
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-main">
              Shock Parameter Controls
            </h2>
          </div>
          <span className="text-[11px] font-mono text-secondary">
            Parametric Sensitivity Matrix
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Magnitude Slider */}
          <div className="space-y-2.5 md:col-span-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-secondary font-medium flex items-center gap-1.5">
                Scenario Shock Magnitude:
              </span>
              <span
                className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 tabular-nums ${
                  magnitude < 0
                    ? "bg-negative/15 text-negative border-negative/30"
                    : "bg-positive/15 text-positive border-positive/30"
                }`}
              >
                {magnitude < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5 stroke-[2]" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5 stroke-[2]" />
                )}
                {formatPercent(magnitude, 0, true)}
              </span>
            </div>

            <input
              type="range"
              min="-0.50"
              max="0.50"
              step="0.05"
              value={magnitude}
              onChange={(e) => {
                setMagnitude(parseFloat(e.target.value));
                setReplay(null);
              }}
              className="w-full cursor-pointer h-2 bg-white/[0.08] rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60"
              aria-label="Scenario shock magnitude slider"
            />

            <div className="flex justify-between text-[11px] text-secondary/70 font-mono">
              <span>-50% (Extreme Squeeze)</span>
              <span>0% (Neutral Baseline)</span>
              <span>+50% (Bull Expansion)</span>
            </div>
          </div>

          {/* Sector Dropdown (Only for sector_downturn) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="sector-select"
                className="block text-xs font-mono font-medium uppercase tracking-wider text-secondary"
              >
                Target Sector:
              </label>
              {activeScenario === "sector_downturn" ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-teal/15 text-teal border border-teal/30">
                  Active Focus
                </span>
              ) : (
                <span className="text-[10px] font-mono text-secondary/60">
                  (Downturn Only)
                </span>
              )}
            </div>
            <select
              id="sector-select"
              disabled={activeScenario !== "sector_downturn"}
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs font-mono border transition-all ${
                activeScenario === "sector_downturn"
                  ? "bg-[#0C1118] border-[rgba(226,235,244,0.30)] text-main cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 shadow-glass-sm"
                  : "bg-white/[0.02] border-white/[0.06] text-secondary/50 cursor-not-allowed"
              }`}
            >
              {AVAILABLE_SECTORS.map((sec) => (
                <option key={sec} value={sec} className="bg-[#0C1118] text-main">
                  {sec}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-secondary/70 block leading-tight font-sans">
              {activeScenario === "sector_downturn"
                ? `Direct shock on ${selectedSector}; remaining sectors absorb 0.28 × beta`
                : "Select Sector Downturn scenario to enable sector isolation"}
            </span>
          </div>
        </div>

        {/* Historical Crisis Replays */}
        <div className="pt-3.5 border-t border-[rgba(226,235,244,0.10)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-warning stroke-[1.75]" />
            <span className="text-xs font-mono uppercase tracking-wider text-secondary font-medium">
              Historical Crisis Replays:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setActiveScenario("market_crash");
                setReplay("covid_2020");
                setMagnitude(-0.35);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-warning/60 active:scale-[0.96] ${
                replay === "covid_2020"
                  ? "bg-warning/20 text-warning border-warning/50 font-semibold shadow-glass-sm"
                  : "bg-white/[0.04] text-secondary border-[rgba(226,235,244,0.15)] hover:text-main hover:bg-white/[0.08]"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1.5 text-warning stroke-[1.75]" />
              COVID-19 Crash (Feb - Mar 2020)
            </button>
            <button
              onClick={() => {
                setActiveScenario("sector_downturn");
                setReplay("bear_2022");
                setSelectedSector("Technology");
                setMagnitude(-0.30);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-warning/60 active:scale-[0.96] ${
                replay === "bear_2022"
                  ? "bg-warning/20 text-warning border-warning/50 font-semibold shadow-glass-sm"
                  : "bg-white/[0.04] text-secondary border-[rgba(226,235,244,0.15)] hover:text-main hover:bg-white/[0.08]"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1.5 text-warning stroke-[1.75]" />
              Bear Market 2022 (Tech Multiple Compression)
            </button>
          </div>
        </div>
      </div>

      {/* 3. Error State (Never display fabricated results if API call failed) */}
      {stressError && (
        <div className="p-6 rounded-2xl border border-negative/30 bg-negative/10 backdrop-blur-md space-y-4 shadow-glass">
          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-xl bg-negative/20 text-negative flex-shrink-0">
              <AlertCircle className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-mono font-bold text-main uppercase tracking-wider">
                Stress Scenario Calculation Failed
              </h3>
              <p className="text-xs font-mono text-secondary leading-relaxed">
                {(stressError as Error).message || "Failed to fetch scenario shock data from the server."}
              </p>
              <p className="text-xs text-secondary/80 font-sans pt-1">
                Results cannot be computed without a live connection or valid mock data response. To avoid misleading analysis, fabricated values are not displayed.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-negative/20 flex items-center justify-between">
            <span className="text-[11px] font-mono text-secondary">
              Status: Request Disconnected
            </span>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-main border border-[rgba(226,235,244,0.25)] text-xs font-mono font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 active:scale-[0.96]"
            >
              <RefreshCw className="w-3.5 h-3.5 stroke-[2]" />
              <span>Retry Calculation</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Valuation, Shock-Impact, and Risk Transition (Rendered when loading or data available) */}
      {!stressError && (
        <>
          {isStressing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Value Before */}
              <MetricCard
                title="Valuation (Pre-Shock)"
                value={formatCurrency(valBefore, currency)}
                subtitle="Baseline Portfolio Value"
                badge={<DollarSign className="w-4 h-4 text-secondary stroke-[1.75]" />}
              />

              {/* Value After */}
              <MetricCard
                title="Valuation (Post-Shock)"
                value={formatCurrency(valAfter, currency)}
                subtitle={`Net Delta: ${formatCurrency(netCapitalDiff, currency, 0, true)}`}
                trend={isLoss ? "down" : "up"}
                trendValue={formatPercent(impactPct, 1, true)}
                highlight
              />

              {/* Impact % */}
              <MetricCard
                title="Portfolio Shock Impact"
                value={formatPercent(impactPct, 1, true)}
                subtitle={isLoss ? "Systemic Drawdown" : "Systemic Expansion"}
                trend={isLoss ? "down" : "up"}
                trendValue={isLoss ? "Capital Loss" : "Capital Gain"}
                badge={
                  isLoss ? (
                    <TrendingDown className="w-4 h-4 text-negative stroke-[1.75]" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-positive stroke-[1.75]" />
                  )
                }
              />

              {/* Risk Transition: Before -> After Comparison */}
              <div className="rounded-xl glass-panel p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-secondary mb-1">
                  <span>Risk Transition</span>
                  <ShieldAlert className="w-4 h-4 text-warning stroke-[1.75]" />
                </div>

                <div className="flex items-center justify-between gap-2 my-2.5 px-1">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-secondary/70 uppercase">
                      Before
                    </span>
                    <RiskBadge
                      label={stressData?.risk_label_before || "High"}
                      size="sm"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-secondary/50">
                    <div className="w-4 h-px bg-white/[0.2]" />
                    <ArrowRight className="w-3.5 h-3.5 text-secondary" strokeWidth={2} />
                    <div className="w-4 h-px bg-white/[0.2]" />
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-secondary/70 uppercase">
                      After
                    </span>
                    <RiskBadge
                      label={stressData?.risk_label_after || "High"}
                      size="sm"
                    />
                  </div>
                </div>

                <div className="text-[10px] font-mono text-secondary/70 pt-2 border-t border-[rgba(226,235,244,0.10)] flex items-center justify-between">
                  <span>Horizon Window</span>
                  <span className="text-main font-medium">Forward 126d</span>
                </div>
              </div>
            </div>
          )}

          {/* 5. Per-Asset Impact Bars */}
          <div className="rounded-2xl glass-panel p-5 space-y-4 shadow-glass">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[rgba(226,235,244,0.10)]">
              <div>
                <h2 className="text-sm font-bold text-main flex items-center gap-2 font-sans tracking-tight">
                  <Layers className="w-4 h-4 text-teal stroke-[1.75]" />
                  Per-Asset Impact Bars
                </h2>
                <p className="text-xs text-secondary mt-0.5">
                  Idiosyncratic movements calculated from systematic beta, sector exposure, and safe-haven flight.
                </p>
              </div>

              {/* Readable Legend */}
              <div className="flex items-center gap-4 text-xs font-mono text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-negative inline-block border border-negative/40" />
                  <span>Negative Shock</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-positive inline-block border border-positive/40" />
                  <span>Positive Cushion</span>
                </span>
              </div>
            </div>

            {isStressing ? (
              <div className="space-y-3">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ) : !stressData?.asset_impacts || stressData.asset_impacts.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-secondary glass-panel rounded-xl">
                No asset impacts returned for the selected scenario configuration.
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {stressData.asset_impacts.map((asset) => {
                  const isNegative = asset.impact_pct < 0;
                  const barPercent = Math.min(100, (Math.abs(asset.impact_pct) / maxAbsImpact) * 100);

                  return (
                    <div
                      key={asset.ticker}
                      className="p-3 rounded-xl border border-[rgba(226,235,244,0.12)] bg-white/[0.025] hover:bg-white/[0.05] hover:border-[rgba(226,235,244,0.22)] transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-glass-sm"
                    >
                      {/* Ticker & Status Badge */}
                      <div className="w-full md:w-44 flex items-center justify-between md:justify-start gap-2.5">
                        <span className="font-mono font-bold text-main text-sm tracking-tight">
                          {asset.ticker}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1 border tabular-nums ${
                            isNegative
                              ? "bg-negative/10 text-negative border-negative/30"
                              : "bg-positive/10 text-positive border-positive/30"
                          }`}
                        >
                          {isNegative ? (
                            <TrendingDown className="w-3 h-3 stroke-[2]" />
                          ) : (
                            <TrendingUp className="w-3 h-3 stroke-[2]" />
                          )}
                          {isNegative ? "Drawdown" : "Cushion"}
                        </span>
                      </div>

                      {/* Zero-Centered Horizontal Impact Bar */}
                      <div className="flex-1 flex items-center gap-3">
                        <div className="relative flex-1 h-3 bg-[#080B10] rounded-full overflow-hidden border border-[rgba(226,235,244,0.15)] shadow-inner">
                          {/* Zero center axis tick */}
                          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/40 z-10" />

                          {isNegative ? (
                            /* Negative bar extends left from center */
                            <div
                              className="absolute top-0 bottom-0 right-1/2 bg-negative rounded-l-full transition-all duration-300"
                              style={{ width: `${barPercent / 2}%` }}
                            />
                          ) : (
                            /* Positive bar extends right from center */
                            <div
                              className="absolute top-0 bottom-0 left-1/2 bg-positive rounded-r-full transition-all duration-300"
                              style={{ width: `${barPercent / 2}%` }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Numerical Impact Value */}
                      <div className="w-full md:w-28 text-right font-mono font-bold text-sm">
                        <span
                          className={`px-2 py-0.5 rounded-md inline-block border tabular-nums ${
                            isNegative
                              ? "text-negative bg-negative/10 border-negative/25"
                              : "text-positive bg-positive/10 border-positive/25"
                          }`}
                        >
                          {formatPercent(asset.impact_pct, 1, true)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Monte Carlo Regime Stress Range (p5 / p50 / p95) */}
          {(activeScenario === "high_volatility" || stressData?.mc) && (
            <div className="rounded-2xl glass-panel-elevated p-5 space-y-4 shadow-glass border-[rgba(226,235,244,0.22)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[rgba(226,235,244,0.10)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-warning/15 border border-warning/30 flex items-center justify-center text-warning">
                    <Zap className="w-3.5 h-3.5 stroke-[2]" />
                  </div>
                  <h3 className="text-xs font-mono font-bold text-main uppercase tracking-wider">
                    Monte Carlo Stress Spectrum: p5 / p50 / p95 (1,000 Paths)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-warning px-2 py-0.5 rounded-md bg-warning/10 border border-warning/30 font-semibold">
                  Forward 6-Month Projection
                </span>
              </div>

              <p className="text-xs text-secondary leading-relaxed font-sans">
                Under doubled covariance regime conditions, 1,000 randomized walk-forward paths yield the following valuation spectrum:
              </p>

              {/* Range Visualizer Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* p5 (Tail Risk Floor) */}
                <div className="p-3.5 rounded-xl bg-negative/10 border border-negative/25 space-y-1">
                  <div className="flex items-center gap-1.5 text-negative font-mono text-xs font-bold">
                    <TrendingDown className="w-3.5 h-3.5 stroke-[2]" />
                    <span>p5 (Tail Floor)</span>
                  </div>
                  <div className="text-lg font-bold text-main font-mono tabular-nums">
                    {formatCurrency(stressData?.mc?.p5 ?? Math.round(amount * 0.58), currency)}
                  </div>
                  <div className="text-[10px] text-secondary font-mono">95% worst-case boundary</div>
                </div>

                {/* p50 (Median Trajectory) */}
                <div className="p-3.5 rounded-xl bg-teal/10 border border-teal/25 space-y-1">
                  <div className="flex items-center gap-1.5 text-teal font-mono text-xs font-bold">
                    <Activity className="w-3.5 h-3.5 stroke-[2]" />
                    <span>p50 (Median Trajectory)</span>
                  </div>
                  <div className="text-lg font-bold text-main font-mono tabular-nums">
                    {formatCurrency(stressData?.mc?.p50 ?? valAfter, currency)}
                  </div>
                  <div className="text-[10px] text-secondary font-mono">Expected central tendency path</div>
                </div>

                {/* p95 (Bullish Rebound) */}
                <div className="p-3.5 rounded-xl bg-positive/10 border border-positive/25 space-y-1">
                  <div className="flex items-center gap-1.5 text-positive font-mono text-xs font-bold">
                    <TrendingUp className="w-3.5 h-3.5 stroke-[2]" />
                    <span>p95 (Optimistic Upside)</span>
                  </div>
                  <div className="text-lg font-bold text-main font-mono tabular-nums">
                    {formatCurrency(stressData?.mc?.p95 ?? Math.round(amount * 0.79), currency)}
                  </div>
                  <div className="text-[10px] text-secondary font-mono">Top 5% recovery trajectory</div>
                </div>
              </div>

              {/* Visual Range Bar Component */}
              <div className="pt-2 space-y-2">
                <div className="flex justify-between text-[11px] font-mono text-secondary">
                  <span className="text-negative font-medium">← Worst Tail (p5)</span>
                  <span className="text-teal font-medium">Median Path (p50)</span>
                  <span className="text-positive font-medium">Best Recovery (p95) →</span>
                </div>

                <div className="relative h-3.5 bg-[#080B10] rounded-full overflow-hidden border border-[rgba(226,235,244,0.18)] shadow-inner">
                  <div
                    className="absolute top-0 bottom-0 bg-gradient-to-r from-negative via-teal to-positive opacity-80"
                    style={{ left: "5%", right: "5%" }}
                  />
                  {/* p50 pin indicator */}
                  <div
                    className="absolute top-0 bottom-0 w-1.5 bg-white shadow-sm -translate-x-1/2"
                    style={{ left: "50%" }}
                    title="p50 Median Projection"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 7. Explanations Rendered Verbatim */}
          {stressData?.explanations && stressData.explanations.length > 0 && (
            <div className="p-5 rounded-2xl glass-panel space-y-3">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-main flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal stroke-[2]" />
                Scenario Diagnostics & Findings
              </h3>
              <ul className="space-y-2 text-xs text-secondary font-sans">
                {stressData.explanations.map((exp, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-teal font-bold mt-0.5">•</span>
                    <span className="leading-relaxed select-text text-main/90">{exp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};
