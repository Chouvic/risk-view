/**
 * The walkthrough's running order. It is the case study's own order — context, then
 * Parts 1 to 4 — so the report can be read straight down against the brief.
 */
export const OUTLINE: { id: string; step: string; label: string; title: string }[] = [
  {
    id: "problem",
    step: "01",
    label: "Problem",
    title: "The problem this service solves",
  },
  {
    id: "brief",
    step: "02",
    label: "Brief",
    title: "What was asked, and where each answer lives",
  },
  {
    id: "schema",
    step: "03",
    label: "Part 1 · Schema",
    title: "Part 1 — Schema design",
  },
  {
    id: "pipeline",
    step: "04",
    label: "Part 2 · Pipeline",
    title: "Part 2 — Pipeline design",
  },
  {
    id: "implementation",
    step: "05",
    label: "Part 3 · Code",
    title: "Part 3 — Implementation",
  },
  {
    id: "tradeoffs",
    step: "06",
    label: "Part 4 · Trade-offs",
    title: "Part 4 — Trade-offs",
  },
  {
    id: "scope",
    step: "07",
    label: "Scope",
    title: "Assumptions, and what I deliberately did not build",
  },
];

export const OUTLINE_IDS = OUTLINE.map((entry) => entry.id);
