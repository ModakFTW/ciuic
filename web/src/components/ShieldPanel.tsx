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
    <div className="rounded-lg border border-border bg-surface p-5 space-y-5 shadow-sm">
      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-risk-low-subtle text-risk-low border border-risk-low-border">
              <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <span>Drawdown Shield</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-risk-low-subtle text-risk-low border border-risk-low-border font-medium">
                  simulated
                </span>
              </h3>
              <p className="text-xs text-text-secondary">
                Simulated Constant Proportion Portfolio Insurance (CPPI) floor protection with risk-free reserve.
              </p>
            </div>
          </div>
        </div>

        {/* Floor breached or intact status */}
        <div>
          {shieldData?.floor_breached ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-risk-high-subtle text-risk-high border border-risk-high-border">
              <ShieldAlert className="w-3.5 h-3.5 text-risk-high" strokeWidth={1.75} />
              Floor Breached
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-risk-low-subtle text-risk-low border border-risk-low-border">
              <CheckCircle2 className="w-3.5 h-3.5 text-risk-low" strokeWidth={1.75} />
              Floor Intact (0 Breaches)
            </span>
          )}
        </div>
      </div>

      {error && <ErrorToast error={error as Error} onRetry={refetch} />}

      {/* Sliders Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 rounded-md bg-surface-elevated border border-border">
        {/* Floor Slider (-5% to -30%) */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-text-secondary font-medium flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent-light" strokeWidth={1.75} />
              Preservation Floor:
            </span>
            <span className="text-text-primary font-semibold tabular-nums text-sm">
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
              className="w-full accent-accent cursor-pointer h-1.5 bg-surface-hover rounded"
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted font-mono">
            <span>-30% (Deep Floor)</span>
            <span>-15% (Default)</span>
            <span>-5% (Tight Preservation)</span>
          </div>
        </div>

        {/* Multiplier Slider (1 to 5) */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-text-secondary font-medium flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent-light" strokeWidth={1.75} />
              CPPI Multiplier (m):
            </span>
            <span className="text-text-primary font-semibold tabular-nums text-sm">{multiplier}x</span>
          </div>
          <div className="py-1">
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={multiplier}
              onChange={(e) => setMultiplier(parseInt(e.target.value, 10))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-surface-hover rounded"
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted font-mono">
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
          badge={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        />
      </div>

      {/* Floor line + Insured vs Unprotected Chart */}
      <div className="rounded-lg border border-border bg-surface-elevated p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-risk-low" strokeWidth={1.75} />
              Trajectory: Unprotected vs Insured vs Floor
            </h4>
            <p className="text-xs text-text-muted mt-0.5">
              Simulated portfolio value relative to the growing preservation floor.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-risk-high">
              <span className="w-2.5 h-0.5 bg-risk-high inline-block" />
              Unprotected
            </span>
            <span className="flex items-center gap-1.5 text-risk-low">
              <span className="w-2.5 h-0.5 bg-risk-low inline-block" />
              Insured (CPPI)
            </span>
            <span className="flex items-center gap-1.5 text-text-muted">
              <span className="w-2.5 h-0.5 border-t border-dashed border-risk-low inline-block" />
              Floor
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 15, bottom: 0, left: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22252B" vertical={false} />
              <XAxis dataKey="date" stroke="#5A6072" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#5A6072"
                fontSize={11}
                tickLine={false}
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
                    <div className="bg-surface border border-border p-2.5 rounded text-xs font-mono shadow-sm space-y-1">
                      <div className="text-text-muted font-medium border-b border-border pb-1">
                        {item.date}
                      </div>
                      <div className="text-risk-high">
                        Unprotected: ₹{item.unprotected?.toLocaleString()}
                      </div>
                      <div className="text-risk-low font-medium">
                        Insured: ₹{item.insured?.toLocaleString()}
                      </div>
                      <div className="text-text-muted">
                        Floor: ₹{item.floor?.toLocaleString()}
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="unprotected"
                stroke="#F87171"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="insured"
                stroke="#34D399"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="floor"
                stroke="#34D399"
                strokeWidth={1.2}
                strokeDasharray="3 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risky Share Area Chart */}
      <div className="rounded-lg border border-border bg-surface-elevated p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
              <Percent className="w-4 h-4 text-accent-light" strokeWidth={1.75} />
              Dynamic Risky Allocation Share (%)
            </h4>
            <p className="text-xs text-text-muted mt-0.5">
              Capped at 100%. Capital shifts into cash reserve when cushion tightens.
            </p>
          </div>
          <span className="text-xs font-mono text-text-muted">Target: 0% - 100%</span>
        </div>

        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 15, bottom: 0, left: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22252B" vertical={false} />
              <XAxis dataKey="date" stroke="#5A6072" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#5A6072"
                fontSize={11}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-surface border border-border p-2 rounded text-xs font-mono shadow-sm">
                      <span className="text-text-muted">{item.date}: </span>
                      <span className="text-accent-light font-medium">{item.risky_share}% Risky</span>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="risky_share"
                stroke="#2563EB"
                strokeWidth={1.75}
                fill="#2563EB"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Explanations List Rendered Verbatim */}
      {shieldData?.explanations && (
        <div className="p-4 rounded-md bg-surface-elevated border border-border space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-accent-light" strokeWidth={1.75} />
            Shield Diagnostics
          </h4>
          <ul className="space-y-1.5 text-xs text-text-secondary font-mono">
            {shieldData.explanations.map((exp, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-accent-light font-bold">•</span>
                <span className="leading-relaxed">{exp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
