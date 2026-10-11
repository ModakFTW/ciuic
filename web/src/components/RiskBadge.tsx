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

  let colorClasses = "bg-warning/10 text-warning border-warning/30";
  let text = "Medium Risk";
  let Icon = AlertTriangle;

  if (normalized === "low") {
    colorClasses = "bg-positive/10 text-positive border-positive/30";
    text = "Low Risk";
    Icon = ShieldCheck;
  } else if (normalized === "high") {
    colorClasses = "bg-negative/10 text-negative border-negative/30";
    text = "High Risk";
    Icon = ShieldAlert;
  }

  if (size === "xl") {
    return (
      <div
        className={`inline-flex items-center gap-3.5 px-4 py-3 rounded-xl border bg-white/[0.04] backdrop-blur-md ${colorClasses} shadow-glass-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] ${className}`}
      >
        <div className="p-2 rounded-lg bg-[#080B10]/60 border border-current/20">
          <Icon className="w-5 h-5 stroke-[1.75]" />
        </div>
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-base font-bold tracking-tight text-main">{text}</span>
            {score !== undefined && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-[#080B10]/80 border border-current/30 tabular-nums">
                Score {score}/100
              </span>
            )}
          </div>
          {confidence !== undefined && (
            <div className="text-xs font-mono text-secondary mt-0.5 tabular-nums">
              Confidence {(confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>
      </div>
    );
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] gap-1 rounded-md",
    md: "px-2.5 py-1 text-xs gap-1.5 rounded-lg",
    lg: "px-3 py-1.5 text-xs font-medium gap-2 rounded-lg",
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium border backdrop-blur-sm ${colorClasses} ${sizeClasses} ${className}`}
      title={`Risk Assessment: ${text}`}
    >
      {showIcon && <Icon className={size === "lg" ? "w-3.5 h-3.5 stroke-[1.75]" : "w-3 h-3 stroke-[1.75]"} />}
      <span>{text}</span>
      {score !== undefined && (
        <span className="opacity-80 font-mono tabular-nums">({score})</span>
      )}
    </span>
  );
};

