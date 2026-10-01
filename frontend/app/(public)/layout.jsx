import SiteShell from "@/components/Modules/Layout/SiteShell";

// Shell for pages that must render for a visitor with no account. Identical chrome to
// the signed-in shell — only the auth redirect is absent — so a public page does not
// look like a different site.
const PublicRootLayout = ({ children }) => <SiteShell>{children}</SiteShell>;

export default PublicRootLayout;
