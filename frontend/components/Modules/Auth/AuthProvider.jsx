"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

import {
  AUTH_CHANGE_EVENT,
  clearToken,
  getToken,
  sessionFromToken,
} from "@/lib/api";

const AuthContext = createContext(null);
const subscribe = (onStoreChange) => {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(AUTH_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(AUTH_CHANGE_EVENT, onStoreChange);
  };
};

// The snapshot must be a string: returning a fresh object per call would make
// useSyncExternalStore see a new value on every render and loop forever.
const getTokenSnapshot = () => getToken();

const getServerTokenSnapshot = () => null;

// Distinguishes "not signed in" from "localStorage has not been read yet". The
// server always renders the not-hydrated branch, so a signed-in visitor never sees
// the signed-out markup flash before the token is read.
const noopSubscribe = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

export const AuthProvider = ({ children }) => {
  const token = useSyncExternalStore(
    subscribe,
    getTokenSnapshot,
    getServerTokenSnapshot,
  );

  const hydrated = useSyncExternalStore(
    noopSubscribe,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );

  const session = useMemo(() => (token ? sessionFromToken(token) : null), [token]);

  const value = useMemo(
    () => ({
      session,
      hydrated,
      role: session?.role ?? null,
      isAdmin: session?.role === "admin",
      isStaff: session?.role === "staff",
      isCitizen: session?.role === "citizen",
      signOut: clearToken,
    }),
    [session, hydrated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }

  return context;
};
