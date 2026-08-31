import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { GLOSSARY, type GlossaryEntry, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/cn";

/** A metric name that explains itself: hover or focus for the glossary entry. */
export function InfoLabel({
  metric,
  label,
  className,
}: {
  metric: GlossaryKey;
  /** Overrides the glossary term when the surrounding copy needs a shorter name. */
  label?: string;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        className={cn(
          "cursor-help rounded-sm underline decoration-ink-3/60 decoration-dotted underline-offset-4",
          "transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-accent",
          className,
        )}
      >
        {label ?? GLOSSARY[metric].term}
      </Tooltip.Trigger>
      <GlossaryCard entry={GLOSSARY[metric]} />
    </Tooltip.Root>
  );
}

/** The same definition behind an icon, for headers where the name is the sort control. */
export function InfoDot({ metric }: { metric: GlossaryKey }) {
  const entry = GLOSSARY[metric];
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={`What is ${entry.term}?`}
        className="cursor-help rounded-sm text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Info size={13} />
      </Tooltip.Trigger>
      <GlossaryCard entry={entry} />
    </Tooltip.Root>
  );
}

function GlossaryCard({ entry }: { entry: GlossaryEntry }) {
  return (
    <Tooltip.Portal>
      <Tooltip.Content
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="z-50 max-w-xs rounded-lg border border-hairline bg-surface p-3 shadow-lg shadow-black/5"
      >
        <p className="text-sm font-semibold text-ink">{entry.term}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{entry.definition}</p>
        {entry.method ? (
          <p className="mt-2 border-t border-hairline pt-2 text-sm leading-relaxed text-ink-3">
            {entry.method}
          </p>
        ) : null}
        <Tooltip.Arrow className="fill-hairline" />
      </Tooltip.Content>
    </Tooltip.Portal>
  );
}
