import { ArrowLeftRight, LayoutDashboard, TrendingUp, Waves } from "lucide-react";
import type { ComponentType } from "react";

/** The bands of a fund's page. The sidebar links to them and the page renders them. */
export const FUND_SECTIONS: {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
}[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    title: "Overview",
    description: "Headline return and the exposure behind it.",
  },
  {
    id: "returns",
    label: "Returns",
    icon: TrendingUp,
    title: "Returns",
    description: "IRR by position currency, against the fund.",
  },
  {
    id: "nav",
    label: "NAV & exposure",
    icon: Waves,
    title: "NAV & exposure",
    description: "Value over the fund's life against the amount still outstanding.",
  },
  {
    id: "hedges",
    label: "FX hedges",
    icon: ArrowLeftRight,
    title: "FX hedges",
    description: "Rolling three-month forwards against each non-base currency's open exposure.",
  },
];
