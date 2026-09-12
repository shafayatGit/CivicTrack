"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderTree,
  CirclePlus,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  {
    href: "/admin/categories/create",
    label: "Create Category",
    icon: CirclePlus,
  },
];

const AdminSidebar = ({ onLogout }) => {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-1 p-4">
      <Link
        href="/admin"
        className="mb-4 flex items-center gap-2 rounded-2xl px-2 py-2"
      >
        <LayoutDashboard className="size-5 shrink-0 text-primary" />
        <span className="font-heading text-base font-semibold">
          CivicTrack Admin
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/admin/categories"
              ? pathname.startsWith(href)
              : pathname === href;

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <Button
        variant="ghost"
        onClick={onLogout}
        className="mt-4 justify-start gap-2.5 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
        Logout
      </Button>
    </div>
  );
};

export default AdminSidebar;