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
      className={`rounded-lg border p-4 backdrop-blur-md shadow-glass-sm ${
        highlight
          ? "bg-white/[0.06] border-[rgba(226,235,244,0.30)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]"
          : "bg-white/[0.035] border-[rgba(226,235,244,0.18)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-secondary">
          {title}
        </span>
        {badge}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xl font-bold text-main font-mono tabular-nums tracking-tight">
          {value}
        </div>

        {trendValue && (
          <div
            className={`flex items-center text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border tabular-nums ${
              trend === "up"
                ? "text-positive bg-positive/10 border-positive/30"
                : trend === "down"
                ? "text-negative bg-negative/10 border-negative/30"
                : "text-secondary bg-white/[0.04] border-white/[0.10]"
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
        <div className="mt-3 pt-2.5 border-t border-[rgba(226,235,244,0.10)] flex items-center justify-between text-xs text-secondary font-sans">
          {subtitle && <span className="truncate">{subtitle}</span>}
          {helper && <span className="text-secondary/70 font-mono text-[11px]">{helper}</span>}
        </div>
      )}
    </div>
  );
};

