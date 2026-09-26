"use client";

import { useCallback, useState } from "react";

import { useResource } from "@/hooks/use-resource";

/**
 * useResource plus a `reload()` for after a write.
 *
 * Revisions are folded into the resource key rather than exposed as a refetch
 * counter inside useResource, so a reload re-runs the same key-derivation logic
 * every other query goes through — the table can never show the results of an
 * older request over a newer one.
 *
 * `options` is forwarded to useResource untouched, so a query that must stay idle
 * until the session resolves (or until a dialog opens) can still gate itself.
 */
export const useCrudResource = (key, load, options) => {
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const { data, error, loading } = useResource(
    revision > 0 ? `${key}#${revision}` : key,
    load,
    options,
  );

  return { data, error, loading, reload, revision };
};
