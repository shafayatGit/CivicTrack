"use client";

import { useEffect } from "react";
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

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import AdminSidebar from "@/components/Modules/Admin/AdminSidebar";

const AdminFallback = () => (
  <main className="flex min-h-svh items-center justify-center p-4">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </main>
);

const AdminLayout = ({ children }) => {
  const router = useRouter();
  const { isAdmin, hydrated, signOut } = useAuth();
  const needsAuth = hydrated && !isAdmin;

  useEffect(() => {
    if (needsAuth) {
      router.replace(hydrated ? "/login" : "/");
    }
  }, [needsAuth, hydrated, router]);

  if (!hydrated || needsAuth) {
    return <AdminFallback />;
  }

  const handleLogout = () => {
    signOut();
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
