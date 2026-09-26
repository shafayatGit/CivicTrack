import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// matchMedia is an external store, so the snapshot can be read straight from it
// instead of mirroring it into state from an effect. Reading `matches` also keeps a
// single source of truth: the subscription and the value agree by construction.
const subscribe = (onStoreChange) => {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onStoreChange)

  return () => mql.removeEventListener("change", onStoreChange)
}

const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches

// The server has no viewport. Rendering the desktop branch and letting the client
// correct it on hydration avoids a mismatch.
const getServerSnapshot = () => false

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
