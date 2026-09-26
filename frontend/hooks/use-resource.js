"use client";

import { useEffect, useState } from "react";

const toError = (cause) =>
  cause instanceof Error ? cause : new Error(String(cause ?? "Unknown error"));

/**
 * Loads async data for a given `key` and reports whether the result on screen
 * belongs to that key.
 *
 * `loading` is *derived* by comparing the key that produced the current result with
 * the key that is wanted, rather than written by a setState at the top of the
 * effect. That difference matters: the derived version never cascades a render on
 * mount, and it makes it structurally impossible to show one query's data or error
 * under another query's key — the usual bug in this pattern.
 *
 * `load` must be memoised by the caller (useCallback). All writes happen after the
 * loader settles, so a superseded request can never overwrite a newer one.
 */
export const useResource = (key, load, { enabled = true, debounceMs = 0 } = {}) => {
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    const run = () => {
      load()
        .then((data) => {
          if (!cancelled) {
            setResult({ key, data, error: null });
          }
        })
        .catch((cause) => {
          if (!cancelled) {
            setResult({ key, data: null, error: toError(cause) });
          }
        });
    };

    // A debounced key change (search typing, coordinate entry) waits before it
    // costs a request.
    const timer = debounceMs > 0 ? setTimeout(run, debounceMs) : run();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, enabled, debounceMs, load]);

  const settled = result.key === key;

  return {
    data: enabled && settled ? result.data : null,
    error: enabled && settled ? result.error : null,
    loading: enabled && !settled,
  };
};

/**
 * Stable cache key for a query object. JSON.stringify is ordered by insertion, so
 * callers must build the object with its keys in a fixed order — which is what the
 * memoised query objects in this app do.
 */
export const resourceKey = (parts) => JSON.stringify(parts);
