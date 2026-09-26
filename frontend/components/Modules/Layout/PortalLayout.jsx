"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import SiteHeader from "@/components/Modules/Layout/SiteHeader";
import SiteFooter from "@/components/Modules/Layout/SiteFooter";

const PortalFallback = () => (
  <div className="flex min-h-svh items-center justify-center p-4">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </div>
);

// Shell for every signed-in screen. The token lives in localStorage, so the guard
// can only run on the client — the same reason /admin guards client-side.
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

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
};

export default PortalLayout;
