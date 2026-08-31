import { useCallback, useEffect, useState } from "react";

interface Resource<T> {
  data: T | null;
  error: string | null;
  /** First load, with nothing to show yet. */
  loading: boolean;
  /** Reload while previous data is still on screen — the view dims instead of flashing. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Loads one value and keeps the previous one visible while it reloads. `load` must
 * be stable — it is the dependency that triggers a fetch.
 */
export function useAsyncResource<T>(load: ((signal: AbortSignal) => Promise<T>) | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(load !== null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!load) {
      setData(null);
      setPending(false);
      return;
    }
    const controller = new AbortController();
    setPending(true);
    load(controller.signal)
      .then((value) => {
        setData(value);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Request failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading: pending && data === null, refreshing: pending && data !== null, reload };
}
