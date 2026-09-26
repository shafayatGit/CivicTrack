"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * The state write happens inside the timer rather than during the effect body, so
 * this is a deferred update rather than a cascading render on every keystroke.
 */
export const useDebouncedValue = (value, delayMs) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
