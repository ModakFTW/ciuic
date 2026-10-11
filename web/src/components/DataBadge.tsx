import React from "react";
import type { Meta } from "../api/types";
import { Database, Radio } from "lucide-react";

interface DataBadgeProps {
  meta?: Meta | null;
  className?: string;
}

export const DataBadge: React.FC<DataBadgeProps> = ({ meta, className = "" }) => {
  const isLive = meta?.data_source === "live";
  const asOf = meta?.as_of || "2026-10-09";

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border ${
        isLive
          ? "bg-positive/10 text-positive border-positive/30 shadow-glass-sm"
          : "glass-panel-elevated border-[rgba(226,235,244,0.18)] text-secondary"
      } ${className}`}
      title={isLive ? `Live market pricing as of ${asOf}` : `Offline cached data as of ${asOf}`}
    >
      {isLive ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-positive"></span>
          </span>
          <span className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-positive stroke-[1.75]" />
            <span className="font-semibold text-positive">LIVE</span>
            <span className="text-secondary/50">|</span>
            <span className="tabular-nums text-main">{asOf}</span>
          </span>
        </>
      ) : (
        <>
          <Database className="w-3 h-3 text-secondary stroke-[1.75]" />
          <span className="hidden xs:inline">Cache</span>
          <span className="tabular-nums text-main">{asOf}</span>
        </>
      )}
    </div>
  );
};
