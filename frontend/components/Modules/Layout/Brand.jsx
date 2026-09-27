import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

// The wordmark, used by the navbar and again inside the mobile sheet, so the two
// stay identical. It is a link home rather than plain text because the navbar has
// no other way back to the landing page.
//
// The mark is the same LayoutDashboard glyph the admin console uses in
// AdminSidebar.jsx, so the product reads as one thing across both shells.
const Brand = ({ className }) => (
  <Link
    href="/"
    className={className ?? "flex items-center gap-2 font-heading text-base font-semibold"}
  >
    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
      <LayoutDashboard className="size-4" aria-hidden="true" />
    </span>
    CivicTrack
  </Link>
);

export default Brand;
