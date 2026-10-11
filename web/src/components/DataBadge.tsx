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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-2xs font-mono border transition-colors ${
        isLive
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          : "bg-surface border-border text-terminal-muted"
      } ${className}`}
      title={isLive ? `Live market pricing as of ${asOf}` : `Offline cached data as of ${asOf}`}
    >
      {isLive ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
          </span>
          <span className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400 stroke-[1.75]" />
            <span className="font-semibold text-emerald-300">LIVE</span>
            <span className="text-emerald-500/50">|</span>
            <span className="tabular-nums text-emerald-200">{asOf}</span>
          </span>
        </>
      ) : (
        <>
          <Database className="w-3 h-3 text-terminal-dim stroke-[1.75]" />
          <span>
            Cache <span className="tabular-nums text-terminal-text">{asOf}</span>
          </span>
        </>
      )}
    </div>
  );
};
