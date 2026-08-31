/**
 * Each table supplies one accessor mapping a row and column key to a comparable
 * value, so money sorts as a number rather than the string it arrives as.
 */

export type SortDirection = "asc" | "desc";

export interface Sort<K extends string> {
  key: K;
  direction: SortDirection;
}

/** Clicking the sorted column reverses it; clicking another starts it ascending. */
export function nextSort<K extends string>(current: Sort<K>, key: K): Sort<K> {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: Sort<K>,
  valueOf: (row: T, key: K) => string | number,
): T[] {
  return [...rows].sort((a, b) => {
    const left = valueOf(a, sort.key);
    const right = valueOf(b, sort.key);
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return sort.direction === "asc" ? comparison : -comparison;
  });
}
