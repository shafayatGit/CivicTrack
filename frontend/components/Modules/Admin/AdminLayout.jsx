"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import {
  clearToken,
  decodeToken,
  getToken,
} from "@/lib/api";

import AdminSidebar from "@/components/Modules/Admin/AdminSidebar";

const subscribe = (onStoreChange) => {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
};

const getTokenSnapshot = () => getToken();

const AdminLayout = ({ children }) => {
  const router = useRouter();
  const token = useSyncExternalStore(subscribe, getTokenSnapshot, () => null);

  const isAdmin = useMemo(() => {
    if (!token) {
      return false;
    }
    return decodeToken(token)?.role === "admin";
  }, [token]);

  useEffect(() => {
    if (!isAdmin) {
      router.replace(token ? "/" : "/login");
    }
  }, [isAdmin, token, router]);

  if (!isAdmin) {
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const handleLogout = () => {
    clearToken();
    router.push("/login");
  };

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-64 shrink-0 border-r bg-background lg:block">
        <div className="sticky top-0 h-svh">
          <AdminSidebar onLogout={handleLogout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur lg:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open menu" />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Admin navigation</SheetTitle>
              <SheetDescription className="sr-only" />
              <AdminSidebar onLogout={handleLogout} />
            </SheetContent>
          </Sheet>

          <span className="font-heading text-base font-semibold">
            CivicTrack Admin
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Logout"
          >
            <LogOut />
          </Button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;