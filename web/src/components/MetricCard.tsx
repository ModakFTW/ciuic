import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  helper?: string;
  badge?: React.ReactNode;
  highlight?: boolean;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  helper,
  badge,
  highlight = false,
  className = "",
}) => {
  return (
    <div
      className={`rounded-lg border p-3.5 transition-colors duration-150 shadow-sm ${
        highlight
          ? "bg-surface-elevated border-accent/40"
          : "bg-surface border-border hover:border-border-focus"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-terminal-muted">
          {title}
        </span>
        {badge}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xl font-bold text-terminal-bright font-mono tabular-nums tracking-tight">
          {value}
        </div>

        {trendValue && (
          <div
            className={`flex items-center text-2xs font-semibold px-1.5 py-0.5 rounded border font-mono tabular-nums ${
              trend === "up"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                : trend === "down"
                ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                : "text-terminal-muted bg-surface-hover border-border"
            }`}
          >
            {trend === "up" && <TrendingUp className="w-3 h-3 mr-1 stroke-[1.75]" />}
            {trend === "down" && <TrendingDown className="w-3 h-3 mr-1 stroke-[1.75]" />}
            {trend === "neutral" && <Minus className="w-3 h-3 mr-1 stroke-[1.75]" />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>

      {(subtitle || helper) && (
        <div className="mt-2.5 pt-2 border-t border-border-subtle flex items-center justify-between text-xs text-terminal-muted font-sans">
          {subtitle && <span className="truncate">{subtitle}</span>}
          {helper && <span className="text-terminal-dim font-mono text-2xs">{helper}</span>}
        </div>
      )}
    </div>
  );
};
