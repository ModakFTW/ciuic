import React from "react";
import type { RiskLabel, RiskLevel } from "../api/types";
import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";

interface RiskBadgeProps {
  label: RiskLabel | RiskLevel | string;
  size?: "sm" | "md" | "lg" | "xl";
  showIcon?: boolean;
  score?: number;
  confidence?: number;
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  label,
  size = "md",
  showIcon = true,
  score,
  confidence,
  className = "",
}) => {
  const normalized = (label || "medium").toLowerCase();

  let colorClasses = "bg-amber-500/10 text-amber-300 border-amber-500/30";
  let text = "Medium Risk";
  let Icon = AlertTriangle;

  if (normalized === "low") {
    colorClasses = "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
    text = "Low Risk";
    Icon = ShieldCheck;
  } else if (normalized === "high") {
    colorClasses = "bg-rose-500/10 text-rose-300 border-rose-500/30";
    text = "High Risk";
    Icon = ShieldAlert;
  }

  if (size === "xl") {
    return (
      <div
        className={`inline-flex items-center gap-3.5 px-4 py-3 rounded-lg border bg-surface ${colorClasses} shadow-sm ${className}`}
      >
        <div className="p-2 rounded-md bg-canvas/60 border border-current/20">
          <Icon className="w-6 h-6 stroke-[1.75]" />
        </div>
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-lg font-bold tracking-tight text-terminal-bright">{text}</span>
            {score !== undefined && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-canvas/80 border border-current/30 tabular-nums">
                Score {score}/100
              </span>
            )}
          </div>
          {confidence !== undefined && (
            <div className="text-xs font-mono text-terminal-muted mt-0.5 tabular-nums">
              Confidence {(confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>
      </div>
    );
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-2xs gap-1 rounded",
    md: "px-2.5 py-1 text-xs gap-1.5 rounded-md",
    lg: "px-3 py-1.5 text-sm font-medium gap-2 rounded-md",
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium border ${colorClasses} ${sizeClasses} ${className}`}
      title={`Risk Assessment: ${text}`}
    >
      {showIcon && <Icon className={size === "lg" ? "w-4 h-4 stroke-[1.75]" : "w-3.5 h-3.5 stroke-[1.75]"} />}
      <span>{text}</span>
      {score !== undefined && (
        <span className="opacity-80 font-mono tabular-nums">({score})</span>
      )}
    </span>
  );
};
