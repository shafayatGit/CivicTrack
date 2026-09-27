"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import LinkButton from "@/components/Modules/Common/LinkButton";
import Brand from "@/components/Modules/Layout/Brand";
import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import { isNavItemActive, portalNavFor } from "@/lib/navigation";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NavLinks = ({ items, pathname, onNavigate, className }) => (
  <nav className={cn("flex items-center gap-1", className)}>
    {items.map(({ href, label, icon: Icon }) => {
      const active = isNavItemActive(href, pathname);

      return (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-medium transition-colors",
            active
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      );
    })}
  </nav>
);

const UserMenu = () => {
  const { session, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    signOut();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="gap-2 rounded-2xl pr-2 pl-1" />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>{initials(session.name)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate text-sm sm:inline">
          {session.name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {session.name}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {session.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2">
            <User />
            <Badge variant="secondary">{session.role}</Badge>
          </DropdownMenuItem>
          {session.role === "admin" && (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => router.push("/admin")}
            >
              <ShieldCheck />
              Admin console
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="gap-2"
          onClick={handleSignOut}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const SiteHeader = () => {
  const pathname = usePathname();
  const { session, hydrated } = useAuth();
  const items = portalNavFor(session?.role);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Brand />

        {hydrated && session && (
          <NavLinks items={items} pathname={pathname} className="hidden md:flex" />
        )}

        <div className="ml-auto flex items-center gap-2">
          {hydrated && session ? (
            <>
              {session.role === "citizen" && (
                <LinkButton
                  href="/report"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  Report an issue
                </LinkButton>
              )}
              <UserMenu />
            </>
          ) : hydrated ? (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">
                Sign in
              </LinkButton>
              <LinkButton href="/register" size="sm">
                Get started
              </LinkButton>
            </>
          ) : null}

          {hydrated && session && (
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open menu"
                    className="md:hidden"
                  />
                }
              >
                <Menu />
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="font-heading">
                  <Brand />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Site navigation
                </SheetDescription>
                <div className="px-4 pb-6">
                  <NavLinks
                    items={items}
                    pathname={pathname}
                    className="flex-col items-stretch [&_a]:px-3 [&_a]:py-2"
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
