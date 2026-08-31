import { useState } from "react";
import { nextSort, type Sort, type SortDirection } from "@/lib/sorting";

/** Sort state for one table, with the toggle its headers call. */
export function useSort<K extends string>(key: K, direction: SortDirection = "asc") {
  const [sort, setSort] = useState<Sort<K>>({ key, direction });
  return { sort, toggle: (next: K) => setSort((current) => nextSort(current, next)) };
}
