import type { Currency } from "../api/types";

/**
 * Formats a currency value with proper locale grouping (Indian system for INR, US system for USD)
 */
export function formatCurrency(
  value: number | undefined | null,
  currency: Currency = "INR",
  maximumFractionDigits: number = 0,
  includePlusSign: boolean = false
): string {
  if (value === undefined || value === null || isNaN(value)) {
    return currency === "INR" ? "₹0" : "$0";
  }

  const locale = currency === "INR" ? "en-IN" : "en-US";
  const symbol = currency === "INR" ? "₹" : "$";
  const formatted = Math.abs(value).toLocaleString(locale, {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits > 0 ? maximumFractionDigits : 0,
  });

  const sign = value < 0 ? "-" : includePlusSign && value > 0 ? "+" : "";
  return `${sign}${symbol}${formatted}`;
}

/**
 * Formats a decimal ratio into a percentage with one decimal place
 * e.g. 0.264 -> "26.4%", -0.342 -> "-34.2%"
 */
export function formatPercent(
  value: number | undefined | null,
  decimals: number = 1,
  includePlusSign: boolean = false
): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "0.0%";
  }

  const pct = value * 100;
  const sign = includePlusSign && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

/**
 * Formats a standard numeric ratio to 2 decimal places
 */
export function formatRatio(
  value: number | undefined | null,
  decimals: number = 2
): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "0.00";
  }
  return value.toFixed(decimals);
}
