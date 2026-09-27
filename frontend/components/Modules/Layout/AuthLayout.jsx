import SiteHeader from "@/components/Modules/Layout/SiteHeader";
import SiteFooter from "@/components/Modules/Layout/SiteFooter";

// Shell for the two signed-out screens. Same header and footer as the landing page
// and the portal, so the pages do not feel like a different product — but without
// PortalLayout's auth guard, which would bounce a signed-out visitor straight back
// to /login and make /register unreachable.
//
// The main is a flex child rather than min-h-svh: the form is centred in whatever
// space the header and footer leave, so a short form does not strand the footer
// below the fold.
const AuthLayout = ({ children }) => (
  <div className="flex min-h-svh flex-col">
    <SiteHeader />

    <main className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8">
      {children}
    </main>

    <SiteFooter />
  </div>
);

export default AuthLayout;
