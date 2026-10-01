"use client";

import SiteHeader from "@/components/Modules/Layout/SiteHeader";
import SiteFooter from "@/components/Modules/Layout/SiteFooter";

// The header/footer/container chrome, with no auth behaviour of any kind.
//
// It exists so the signed-in shell and the public shell cannot drift apart in padding,
// max width, or which header they render. SiteHeader already handles a null session —
// it shows Sign in / Get started instead of the user menu — so this is safe to render
// for a visitor who has never signed in.
const SiteShell = ({ children }) => (
  <div className="flex min-h-svh flex-col">
    <SiteHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      {children}
    </main>
    <SiteFooter />
  </div>
);

export default SiteShell;
