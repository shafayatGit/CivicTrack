"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import SiteShell from "@/components/Modules/Layout/SiteShell";

const PortalFallback = () => (
  <div className="flex min-h-svh items-center justify-center p-4">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </div>
);

// Shell for every signed-in screen. The token lives in localStorage, so the guard
// can only run on the client — the same reason /admin guards client-side.
//
// This is the only difference from the public shell: a missing session is a redirect
// rather than a render. Anything reachable without an account is mounted under the
// public group instead, not exempted here, so adding a route cannot accidentally
// inherit the redirect.
const PortalLayout = ({ children }) => {
  const router = useRouter();
  const { session, hydrated } = useAuth();
  const needsLogin = hydrated && !session;

  useEffect(() => {
    if (needsLogin) {
      router.replace("/login");
    }
  }, [needsLogin, router]);

  if (!hydrated || needsLogin) {
    return <PortalFallback />;
  }

  return <SiteShell>{children}</SiteShell>;
};

export default PortalLayout;
