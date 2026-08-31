import { useEffect, useRef, useState } from "react";

/**
 * Tracks which section is in view so the sidebar can mark it. The observer reports
 * only the entries that changed, so the visible set is accumulated here.
 */
export function useActiveSection(ids: string[], enabled: boolean): string {
  const [active, setActive] = useState(ids[0]);
  const visible = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    const seen = visible.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.add(entry.target.id);
          else seen.delete(entry.target.id);
        }
        // Two sections can straddle the band; the lower one is where the reader is.
        const current = ids.findLast((id) => seen.has(id));
        if (current) setActive(current);
      },
      // A band across the top of the viewport, at reading height.
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => {
      observer.disconnect();
      seen.clear();
    };
  }, [ids, enabled]);

  return active;
}
