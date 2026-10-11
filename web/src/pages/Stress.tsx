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
} from "lucide-react";
import { usePortfolio } from "../state/PortfolioContext";
import { stressScenario } from "../api/client";
import { PageTitle } from "../components/PageTitle";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { ErrorToast } from "../components/ErrorToast";
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

  const scenariosList: { id: Scenario; name: string; desc: string; defaultMag: number }[] = [
    {
      id: "market_crash",
      name: "Market Crash (-30%)",
      desc: "Simulates systemic liquidity squeeze and high-beta drawdown across broader markets",
      defaultMag: -0.30,
    },
    {
      id: "market_recovery",
      name: "Market Rally (+25%)",
      desc: "Simulates sharp equity rebound across leading cyclical growth and momentum sectors",
      defaultMag: 0.25,
    },
    {
      id: "high_volatility",
      name: "High Volatility Regime",
      desc: "Doubles return covariance matrix with 1,000-path walk-forward Monte Carlo stress test",
      defaultMag: -0.15,
    },
    {
      id: "sector_downturn",
      name: "Sector Downturn",
      desc: "Isolates multiple compression to a specific target industry sector with correlation dampening",
      defaultMag: -0.25,
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
          description="Evaluate portfolio resilience under extreme shocks and liquidity crunches."
        />
        <div className="p-12 rounded-2xl border border-[#1F293D] bg-[#111827] text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Insufficient Portfolio Positions</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You need at least 2 assets configured to perform scenario shocks and covariance stress tests.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <span>Return to Portfolio Builder</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const impactPct = stressData?.impact_pct ?? magnitude;
  const isLoss = impactPct < 0;
  const valBefore = stressData?.value_before ?? amount;
  const valAfter = stressData?.value_after ?? Math.round(amount * (1 + impactPct));
  const netCapitalDiff = valAfter - valBefore;

  // Compute scale for asset impact bars (max absolute impact or 0.6)
  const maxAbsImpact = stressData?.asset_impacts
    ? Math.max(0.3, ...stressData.asset_impacts.map((a) => Math.abs(a.impact_pct)))
    : 0.5;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageTitle
        title="Macro Stress Testing & Scenario Analysis"
        description="Simulate extreme market events, liquidity shocks, sector downturns, and multi-path Monte Carlo stress tests."
      />

      {stressError && <ErrorToast error={stressError as Error} onRetry={refetch} />}

      {/* 1. Scenario Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {scenariosList.map((sc) => {
          const isSelected = activeScenario === sc.id && !replay;
          return (
            <button
              key={sc.id}
              onClick={() => handleSelectScenario(sc.id, sc.defaultMag)}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                isSelected
                  ? "bg-rose-950/30 border-rose-500/70 shadow-lg shadow-rose-950/30"
                  : "bg-[#111827] border-[#1F293D] hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Flame
                  className={`w-4 h-4 ${
                    isSelected ? "text-rose-400" : "text-slate-400"
                  }`}
                />
                <span className="font-bold text-sm text-white">{sc.name}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">{sc.desc}</p>
            </button>
          );
        })}
      </div>

      {/* 2. Interactive Controls: Magnitude Slider + Sector Dropdown + Historical Replays */}
      <div className="p-5 rounded-xl border border-[#1F293D] bg-[#111827] space-y-4 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Magnitude Slider */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                Scenario Shock Magnitude:
              </span>
              <span
                className={`font-bold text-sm px-2 py-0.5 rounded flex items-center gap-1 ${
                  magnitude < 0
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                }`}
              >
                {magnitude < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" />
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
              className="w-full accent-sky-500 cursor-pointer h-2 bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex justify-between text-[11px] text-slate-500 font-mono">
              <span>-50% (Extreme Squeeze)</span>
              <span>0% (Neutral Baseline)</span>
              <span>+50% (Historic Bull Expansion)</span>
            </div>
          </div>

          {/* Sector Dropdown (Only for sector_downturn) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="sector-select"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Target Sector:
              </label>
              {activeScenario === "sector_downturn" ? (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Active Filter
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-500">
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
                  ? "bg-slate-900 border-sky-500 text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-md shadow-sky-500/10"
                  : "bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              {AVAILABLE_SECTORS.map((sec) => (
                <option key={sec} value={sec} className="bg-slate-900 text-white">
                  {sec}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 block">
              {activeScenario === "sector_downturn"
                ? `Direct shock on ${selectedSector}; other sectors absorb 0.28 × beta`
                : "Select Sector Downturn scenario above to enable sector targeting"}
            </span>
          </div>
        </div>

        {/* Replay Buttons for covid_2020 and bear_2022 */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Historical Crisis Replays:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setActiveScenario("market_crash");
                setReplay("covid_2020");
                setMagnitude(-0.35);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                replay === "covid_2020"
                  ? "bg-amber-500/25 text-amber-300 border-amber-500/60 font-bold shadow-md shadow-amber-500/10"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
              COVID-19 Crash (Feb - Mar 2020)
            </button>
            <button
              onClick={() => {
                setActiveScenario("sector_downturn");
                setReplay("bear_2022");
                setSelectedSector("Technology");
                setMagnitude(-0.30);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                replay === "bear_2022"
                  ? "bg-amber-500/25 text-amber-300 border-amber-500/60 font-bold shadow-md shadow-amber-500/10"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
              Bear Market 2022 (Tech Multiple Compression)
            </button>
          </div>
        </div>
      </div>

      {/* 3. Before/After Cards (Value, Impact %, Risk Label Before & After) */}
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
            title="Portfolio Value (Before)"
            value={formatCurrency(valBefore, currency)}
            subtitle="Pre-Shock Valuation"
            badge={<DollarSign className="w-4 h-4 text-slate-400" />}
          />

          {/* Value After */}
          <MetricCard
            title="Portfolio Value (After Shock)"
            value={formatCurrency(valAfter, currency)}
            subtitle={`Net Change: ${formatCurrency(netCapitalDiff, currency, 0, true)}`}
            trend={isLoss ? "down" : "up"}
            trendValue={formatPercent(impactPct, 1, true)}
            highlight
          />

          {/* Impact % */}
          <MetricCard
            title="Shock Impact Percentage"
            value={formatPercent(impactPct, 1, true)}
            subtitle={isLoss ? "Drawdown Severity" : "Portfolio Expansion"}
            trend={isLoss ? "down" : "up"}
            trendValue={isLoss ? "Capital Loss" : "Capital Gain"}
            badge={
              isLoss ? (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              ) : (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              )
            }
          />

          {/* Risk Label Before and After */}
          <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">
              <span>Risk Transition</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="flex items-center justify-between gap-2 my-2">
              <RiskBadge
                label={stressData?.risk_label_before || "High"}
                size="sm"
              />
              <ArrowRight className="w-4 h-4 text-slate-500" />
              <RiskBadge
                label={stressData?.risk_label_after || "High"}
                size="sm"
              />
            </div>
            <div className="text-[11px] font-mono text-slate-400 pt-1.5 border-t border-slate-800 flex items-center justify-between">
              <span>Model Classification</span>
              <span className="text-slate-300 font-semibold">Forward 126d</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Per-Asset Impact Bars */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              Per-Asset Impact Bars
            </h2>
            <p className="text-xs text-slate-400">
              Visualizing idiosyncratic movements based on systematic beta sensitivity, sector exposure, and safe-haven flight.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" />
              Negative Shock
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
              Positive Cushion
            </span>
          </div>
        </div>

        {isStressing ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {stressData?.asset_impacts?.map((asset) => {
              const isNegative = asset.impact_pct < 0;
              const barPercent = Math.min(100, (Math.abs(asset.impact_pct) / maxAbsImpact) * 100);

              return (
                <div
                  key={asset.ticker}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  {/* Ticker & Status */}
                  <div className="w-full md:w-44 flex items-center justify-between md:justify-start gap-2.5">
                    <span className="font-mono font-bold text-white text-sm">
                      {asset.ticker}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${
                        isNegative
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}
                    >
                      {isNegative ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <TrendingUp className="w-3 h-3" />
                      )}
                      {isNegative ? "Drawdown" : "Cushion"}
                    </span>
                  </div>

                  {/* Horizontal Visual Impact Bar */}
                  <div className="flex-1 flex items-center gap-3">
                    <div className="relative flex-1 h-3.5 bg-slate-800/80 rounded-full overflow-hidden border border-slate-750">
                      {/* Zero center axis tick */}
                      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-600 z-10" />

                      {isNegative ? (
                        /* Negative bar extending left from center (50%) */
                        <div
                          className="absolute top-0 bottom-0 right-1/2 bg-gradient-to-l from-rose-500 to-rose-600 rounded-l-full transition-all duration-500"
                          style={{ width: `${barPercent / 2}%` }}
                        />
                      ) : (
                        /* Positive bar extending right from center (50%) */
                        <div
                          className="absolute top-0 bottom-0 left-1/2 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-r-full transition-all duration-500"
                          style={{ width: `${barPercent / 2}%` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Impact Value */}
                  <div className="w-full md:w-28 text-right font-mono font-bold text-sm">
                    <span
                      className={`px-2 py-0.5 rounded inline-block ${
                        isNegative
                          ? "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                          : "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
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

      {/* 5. For high_volatility (and whenever mc exists): p5/p50/p95 Range Bar from mc */}
      {(activeScenario === "high_volatility" || stressData?.mc) && (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/25 via-[#111827] to-[#111827] p-5 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Monte Carlo Regime Stress Range: p5 / p50 / p95 (1,000 Paths)
              </h3>
            </div>
            <span className="text-xs font-mono text-amber-300 font-semibold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
              Forward 6-Month Projection
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Under doubled covariance regime conditions, 1,000 randomized walk-forward paths yield the following valuation spectrum:
          </p>

          {/* Range Visualizer Bar & Metric Cards */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              {/* p5 (Tail Risk Floor) */}
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 space-y-1">
                <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>p5 (Tail Risk Floor)</span>
                </div>
                <div className="text-lg font-bold text-white">
                  {formatCurrency(stressData?.mc?.p5 ?? Math.round(amount * 0.58), currency)}
                </div>
                <div className="text-[10px] text-slate-400">95% confidence worst-case boundary</div>
              </div>

              {/* p50 (Median Trajectory) */}
              <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-500/30 space-y-1">
                <div className="flex items-center gap-1.5 text-sky-400 font-bold">
                  <Activity className="w-3.5 h-3.5" />
                  <span>p50 (Median Trajectory)</span>
                </div>
                <div className="text-lg font-bold text-white">
                  {formatCurrency(stressData?.mc?.p50 ?? valAfter, currency)}
                </div>
                <div className="text-[10px] text-slate-400">Expected central tendency path</div>
              </div>

              {/* p95 (Optimistic Recovery) */}
              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>p95 (Bullish Rebound)</span>
                </div>
                <div className="text-lg font-bold text-white">
                  {formatCurrency(stressData?.mc?.p95 ?? Math.round(amount * 0.79), currency)}
                </div>
                <div className="text-[10px] text-slate-400">Top 5% upside recovery trajectory</div>
              </div>
            </div>

            {/* Range Bar Component */}
            <div className="pt-2 space-y-2">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span className="text-rose-400 font-semibold">← Worst Tail (p5)</span>
                <span className="text-sky-300 font-semibold">Central Path (p50)</span>
                <span className="text-emerald-400 font-semibold">Best Recovery (p95) →</span>
              </div>

              <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="absolute top-0 bottom-0 bg-gradient-to-r from-rose-500 via-sky-500 to-emerald-500 opacity-80"
                  style={{ left: "5%", right: "5%" }}
                />
                {/* p50 pin indicator */}
                <div
                  className="absolute top-0 bottom-0 w-2 bg-white shadow-md shadow-white/50 -translate-x-1/2"
                  style={{ left: "50%" }}
                  title="p50 Median Projection"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Explanations Rendered Verbatim */}
      {stressData?.explanations && stressData.explanations.length > 0 && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
            Scenario Diagnostics & Findings (Verbatim)
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {stressData.explanations.map((exp, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-rose-400 font-bold mt-0.5">•</span>
                <span className="leading-relaxed select-text">{exp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
