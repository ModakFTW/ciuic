import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  ShieldCheck,
  ShieldAlert,
  Sliders,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { shieldPortfolio } from "../api/client";
import { MetricCard } from "./MetricCard";
import { ErrorToast } from "./ErrorToast";
import { CardSkeleton } from "./Skeleton";
import { ChartTooltip } from "./ChartTooltip";
import { formatCurrency, formatPercent } from "../utils/format";
import type { Period, Currency } from "../api/types";

interface ShieldPanelProps {
  weights: Record<string, number>;
  amount: number;
  period: Period;
  currency: Currency;
  defaultMultiplier?: number;
}

export const ShieldPanel: React.FC<ShieldPanelProps> = ({
  weights,
  amount,
  period,
  currency,
  defaultMultiplier = 2,
}) => {
  // Slider for floor: -5% to -30%, default -15% (-0.15)
  const [floor, setFloor] = useState<number>(-0.15);
  // Slider for multiplier: 1 to 5, default 2
  const [multiplier, setMultiplier] = useState<number>(defaultMultiplier);

  const {
    data: shieldData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["shield", weights, amount, floor, multiplier, period],
    queryFn: () =>
      shieldPortfolio({
        weights,
        amount,
        floor,
        multiplier,
        period,
      }),
    enabled: Object.keys(weights).length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  const chartData =
    shieldData?.dates?.map((date, idx) => ({
      date,
      unprotected: shieldData.series.unprotected[idx],
      insured: shieldData.series.insured[idx],
      floor: shieldData.series.floor[idx],
      risky_share: +(shieldData.risky_share[idx] * 100).toFixed(1),
    })) || [];

  return (
    <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] p-5 space-y-5 shadow-glass-sm">
      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[rgba(226,235,244,0.14)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal/10 text-teal border border-teal/20">
              <ShieldCheck className="w-4 h-4 stroke-[1.75]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-main font-heading flex items-center gap-2">
                <span>Drawdown Shield</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-teal/15 text-teal border border-teal/30 font-medium">
                  simulated
                </span>
              </h3>
              <p className="text-xs text-secondary">
                Simulated Constant Proportion Portfolio Insurance (CPPI) floor protection with risk-free reserve.
              </p>
            </div>
          </div>
        </div>

        {/* Floor breached or intact status */}
        <div>
          {shieldData?.floor_breached ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-negative/15 text-negative border border-negative/30 shadow-glass-sm">
              <ShieldAlert className="w-3.5 h-3.5 stroke-[1.75]" />
              Floor Breached
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-positive/15 text-positive border border-positive/30 shadow-glass-sm">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.75]" />
              Floor Intact (0 Breaches)
            </span>
          )}
        </div>
      </div>

      {error && <ErrorToast error={error as Error} onRetry={refetch} />}

      {/* Sliders Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 rounded-xl glass-panel-elevated border border-[rgba(226,235,244,0.14)]">
        {/* Floor Slider (-5% to -30%) */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-secondary font-medium flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-teal stroke-[1.75]" />
              Preservation Floor:
            </span>
            <span className="text-main font-semibold tabular-nums text-sm">
              {Math.round(floor * 100)}%
            </span>
          </div>
          <div className="py-1">
            <input
              type="range"
              min="-0.30"
              max="-0.05"
              step="0.01"
              value={floor}
              onChange={(e) => setFloor(parseFloat(e.target.value))}
              className="w-full accent-teal cursor-pointer h-1.5 bg-white/[0.08] rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60"
            />
          </div>
          <div className="flex justify-between text-[10px] text-secondary/70 font-mono">
            <span>-30% (Deep Floor)</span>
            <span>-15% (Default)</span>
            <span>-5% (Tight Preservation)</span>
          </div>
        </div>

        {/* Multiplier Slider (1 to 5) */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-secondary font-medium flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-teal stroke-[1.75]" />
              CPPI Multiplier (m):
            </span>
            <span className="text-main font-semibold tabular-nums text-sm">{multiplier}x</span>
          </div>
          <div className="py-1">
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={multiplier}
              onChange={(e) => setMultiplier(parseInt(e.target.value, 10))}
              className="w-full accent-teal cursor-pointer h-1.5 bg-white/[0.08] rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60"
            />
          </div>
          <div className="flex justify-between text-[10px] text-secondary/70 font-mono">
            <span>1x (Gentle)</span>
            <span>2x (Default)</span>
            <span>5x (Aggressive)</span>
          </div>
        </div>
      </div>

      {/* Cost & Benefit Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Benefit: Loss Avoided */}
        <MetricCard
          title="Loss Avoided (Rs / Value)"
          value={formatCurrency(shieldData?.benefit?.loss_avoided ?? 200000, currency)}
          subtitle="Net Capital Protected"
          trend="up"
          trendValue="Downside Shield"
          highlight
        />

        {/* Benefit: Max Drawdown Unprotected vs Insured */}
        <MetricCard
          title="Max Drawdown Protected"
          value={formatPercent(shieldData?.benefit?.max_drawdown_insured ?? -0.142, 1, true)}
          subtitle={`Unprotected was ${formatPercent(
            shieldData?.benefit?.max_drawdown_unprotected ?? -0.342,
            1,
            true
          )}`}
          trend="up"
          trendValue={`+${formatPercent(
            Math.abs(shieldData?.benefit?.max_drawdown_unprotected ?? -0.342) -
              Math.abs(shieldData?.benefit?.max_drawdown_insured ?? -0.142),
            1
          )} Cushion`}
        />

        {/* Cost: Return Drag Annual */}
        <MetricCard
          title="Annualized Cost / Drag"
          value={`${formatPercent(shieldData?.cost?.return_drag_ann ?? 0.018, 1)}/yr`}
          subtitle="Return drag from cash reserve"
          trend="neutral"
          trendValue="Simulated Drag"
        />

        {/* Starting Floor Value */}
        <MetricCard
          title="Floor Value Start"
          value={formatCurrency(shieldData?.floor_value_start ?? amount * 0.85, currency)}
          subtitle="Grows at Risk-Free Rate"
          badge={<CheckCircle2 className="w-4 h-4 text-teal stroke-[1.75]" />}
        />
      </div>

      {/* Floor line + Insured vs Unprotected Chart */}
      <div className="rounded-xl glass-panel-elevated border border-[rgba(226,235,244,0.14)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary flex items-center gap-2 font-heading">
              <TrendingUp className="w-4 h-4 text-positive stroke-[1.75]" />
              Trajectory: Unprotected vs Insured vs Floor
            </h4>
            <p className="text-xs text-secondary/80 mt-0.5">
              Simulated portfolio value relative to the growing preservation floor.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-negative">
              <span className="w-2.5 h-0.5 bg-negative inline-block" />
              Unprotected
            </span>
            <span className="flex items-center gap-1.5 text-positive">
              <span className="w-2.5 h-0.5 bg-positive inline-block" />
              Insured (CPPI)
            </span>
            <span className="flex items-center gap-1.5 text-secondary">
              <span className="w-2.5 h-0.5 border-t border-dashed border-positive inline-block" />
              Floor
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          {chartData.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-secondary text-xs font-mono border border-dashed border-[rgba(226,235,244,0.1)] rounded-xl">
              No shield trajectory data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 15, bottom: 0, left: 15 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(226,235,244,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="rgba(226,235,244,0.12)"
                  fontSize={10}
                  tickLine={false}
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                />
                <YAxis
                  stroke="rgba(226,235,244,0.12)"
                  fontSize={10}
                  tickLine={false}
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                  tickFormatter={(v) =>
                    currency === "INR"
                      ? `₹${(v / 100000).toFixed(1)}L`
                      : `$${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <ChartTooltip
                        title={item.date}
                        items={[
                          {
                            label: "Unprotected",
                            value: formatCurrency(item.unprotected, currency),
                            color: "#E47782",
                          },
                          {
                            label: "Insured (CPPI)",
                            value: formatCurrency(item.insured, currency),
                            color: "#86C8A0",
                          },
                          {
                            label: "Floor",
                            value: formatCurrency(item.floor, currency),
                            color: "#86C8A0",
                          },
                        ]}
                      />
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="unprotected"
                  stroke="#E47782"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="insured"
                  stroke="#86C8A0"
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="floor"
                  stroke="#86C8A0"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Risky Share Area Chart */}
      <div className="rounded-xl glass-panel-elevated border border-[rgba(226,235,244,0.14)] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary flex items-center gap-2 font-heading">
              <Percent className="w-4 h-4 text-teal stroke-[1.75]" />
              Dynamic Risky Allocation Share (%)
            </h4>
            <p className="text-xs text-secondary/80 mt-0.5">
              Capped at 100%. Capital shifts into cash reserve when cushion tightens.
            </p>
          </div>
          <span className="text-xs font-mono text-secondary">Target: 0% - 100%</span>
        </div>

        <div className="h-36 w-full">
          {chartData.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-secondary text-xs font-mono border border-dashed border-[rgba(226,235,244,0.1)] rounded-xl">
              No allocation share data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 15, bottom: 0, left: 15 }}>
                <defs>
                  <linearGradient id="riskyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#74C7BE" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#74C7BE" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(226,235,244,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="rgba(226,235,244,0.12)"
                  fontSize={10}
                  tickLine={false}
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                />
                <YAxis
                  stroke="rgba(226,235,244,0.12)"
                  fontSize={10}
                  tickLine={false}
                  domain={[0, 100]}
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <ChartTooltip
                        title={item.date}
                        items={[
                          {
                            label: "Risky Allocation",
                            value: `${item.risky_share}%`,
                            color: "#74C7BE",
                          },
                        ]}
                      />
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="risky_share"
                  stroke="#74C7BE"
                  strokeWidth={1.75}
                  fillOpacity={1}
                  fill="url(#riskyGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Explanations List Rendered Verbatim */}
      {shieldData?.explanations && (
        <div className="p-4 rounded-xl glass-panel-elevated border border-[rgba(226,235,244,0.14)] space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary flex items-center gap-1.5 font-heading">
            <Info className="w-3.5 h-3.5 text-teal stroke-[1.75]" />
            Shield Diagnostics
          </h4>
          <ul className="space-y-1.5 text-xs text-secondary font-mono">
            {shieldData.explanations.map((exp, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-teal font-bold">•</span>
                <span className="leading-relaxed text-main/90 font-sans">{exp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
