import React from "react";

export interface TooltipItem {
  label: string;
  value: string | number;
  color?: string;
  subtext?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: string | number;
    color?: string;
    dataKey?: string;
    payload?: any;
  }>;
  label?: string | number;
  title?: string;
  items?: TooltipItem[];
  formatter?: (value: any, name: string) => string;
}

export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
  title,
  items,
  formatter,
}) => {
  if (!active && !items) return null;

  const displayTitle = title || (label ? String(label) : null);

  const displayItems: TooltipItem[] =
    items ||
    (payload && payload.length > 0
      ? payload
          .filter((p) => p.value !== undefined && p.value !== null)
          .map((p) => ({
            label: p.name || String(p.dataKey || ""),
            value: formatter ? formatter(p.value, p.name || "") : String(p.value),
            color: p.color,
          }))
      : []);

  if (displayItems.length === 0 && !displayTitle) return null;

  return (
    <div className="glass-panel-elevated border border-[rgba(226,235,244,0.18)] rounded-xl p-3 text-xs font-mono shadow-glass-lg backdrop-blur-md min-w-[160px] max-w-[280px] space-y-2 pointer-events-none z-50">
      {displayTitle && (
        <div className="text-secondary font-medium border-b border-[rgba(226,235,244,0.1)] pb-1.5 text-[11px] tracking-wide truncate">
          {displayTitle}
        </div>
      )}
      <div className="space-y-1.5">
        {displayItems.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-secondary truncate">
              {item.color && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="text-main font-semibold tabular-nums text-right flex-shrink-0">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
