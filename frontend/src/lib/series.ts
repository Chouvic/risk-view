/**
 * A currency keeps its hue everywhere, so filtering never repaints a series. The
 * three hues are colourblind-safe on a white surface (worst pair ΔE 9.2 deutan).
 * Literal hex because they go straight into SVG attributes.
 */

import type { CurrencyCode } from "@/api/types";

const CURRENCY_COLOR: Record<CurrencyCode, string> = {
  EUR: "#2a78d6",
  GBP: "#eb6834",
  USD: "#1baf7a",
};

/** Any code outside the closed set falls back to the palette's fourth slot. */
export function currencyColor(currency: string): string {
  return CURRENCY_COLOR[currency as CurrencyCode] ?? "#eda100";
}

/** Chart chrome, kept here so every chart in the app matches. */
export const CHART = {
  grid: "#eeede8",
  axis: "#e6e5e0",
  tick: "#8b8985",
  surface: "#ffffff",
  crosshair: "#c9c8c2",
  lineWidth: 2,
  areaOpacity: 0.1,
  barSize: 16,
  barRadius: 4,
  tickFontSize: 12,
} as const;
