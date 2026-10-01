import {
  Building2,
  ChartNoAxesColumn,
  Flag,
  FolderTree,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  MessagesSquare,
  OctagonX,
  PlusCircle,
  Users,
} from "lucide-react";

// One definition per surface, so the header, the portal shell and the admin
// sidebar can never drift apart on what a role is allowed to reach. `roles: null`
// means "every signed-in user".

export const PORTAL_NAV = [
  { href: "/", label: "Home", icon: LifeBuoy, roles: null },
  // Citizens land here after signing in, so it is the first thing in their nav. Staff
  // and admin have their own consoles and never see it.
  { href: "/dashboard", label: "My dashboard", icon: LayoutDashboard, roles: ["citizen"] },
  { href: "/issues", label: "Issues", icon: OctagonX, roles: null },
  { href: "/report", label: "Report an issue", icon: PlusCircle, roles: ["citizen"] },
  { href: "/messages", label: "Messages", icon: MessagesSquare, roles: ["staff", "admin"] },
];

export const ADMIN_NAV = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/reports", label: "Reports", icon: ChartNoAxesColumn },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/issues", label: "Issue queue", icon: OctagonX },
      { href: "/admin/departments", label: "Departments", icon: Building2 },
      { href: "/admin/wards", label: "Wards", icon: MapPin },
      { href: "/admin/staff", label: "Staff", icon: Users },
      { href: "/admin/categories", label: "Categories", icon: FolderTree },
    ],
  },
  {
    label: "Moderation",
    items: [{ href: "/admin/false-reports", label: "False reports", icon: Flag }],
  },
  {
    label: "Communication",
    items: [{ href: "/messages", label: "Messages", icon: MessagesSquare }],
  },
];

// Sub-routes that should light up their parent entry in the sidebar.
const ACTIVE_PREFIXES = {
  "/admin/categories": ["/admin/categories"],
  "/admin/departments": ["/admin/departments"],
  "/admin/wards": ["/admin/wards"],
  "/admin/staff": ["/admin/staff"],
  "/admin/issues": ["/admin/issues"],
  "/admin/reports": ["/admin/reports"],
  "/admin/false-reports": ["/admin/false-reports"],
};

export const isNavItemActive = (href, pathname) => {
  if (href === "/admin") {
    return pathname === "/admin";
  }

  return (ACTIVE_PREFIXES[href] ?? [href]).some((prefix) =>
    pathname.startsWith(prefix),
  );
};

export const portalNavFor = (role) =>
  PORTAL_NAV.filter((item) => !item.roles || item.roles.includes(role));

// Where a freshly authenticated user should land. Shared by the login and register
// forms so the two can never send the same role to different places.
//
// Staff deliberately stay on "/" — they work the shared issue queue and messages
// rather than a personal dashboard, and there is no staff home screen to route to yet.
export const landingPathFor = (role) => {
  if (role === "admin") {
    return "/admin";
  }

  if (role === "citizen") {
    return "/dashboard";
  }

  return "/";
};
