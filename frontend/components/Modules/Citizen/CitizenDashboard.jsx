"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  CheckCircle2,
  Inbox,
  OctagonX,
  PlusCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import CollectionState, {
  ListSkeleton,
} from "@/components/Modules/Admin/CollectionState";

import LinkButton from "@/components/Modules/Common/LinkButton";
import IssueStatusBadge from "@/components/Modules/Issues/IssueStatusBadge";
import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import { useResource } from "@/hooks/use-resource";
import { getMyIssueStats, listMyIssues } from "@/lib/api";
import { landingPathFor } from "@/lib/navigation";
import { formatNumber, formatRelative } from "@/lib/format";

const StatCard = ({ label, value, description, icon: Icon }) => (
  <Card size="sm" className="h-full">
    <CardHeader className="flex flex-row items-center justify-between gap-2">
      <CardDescription>{label}</CardDescription>
      <Icon className="size-5 text-primary" />
    </CardHeader>
    <CardContent>
      <p className="font-heading text-3xl font-semibold tabular-nums">
        {value === null ? "—" : formatNumber(value)}
      </p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </CardContent>
  </Card>
);

const CitizenDashboard = () => {
  const { session, hydrated, isCitizen } = useAuth();
  const router = useRouter();

  // This screen is scoped to whoever the token belongs to, so an admin who types the
  // URL would otherwise get a valid but empty citizen dashboard — "Welcome back, Sam"
  // above three zeroes. Staff and admin have their own surfaces, so send them to their
  // own landing page instead. Same client-side guard style as AdminLayout: the token
  // lives in localStorage, so there is no middleware that could do this server-side.
  const wrongRole = hydrated && !isCitizen;

  useEffect(() => {
    if (wrongRole) {
      router.replace(landingPathFor(session?.role));
    }
  }, [wrongRole, router, session?.role]);

  // Both requests hit endpoints that scope themselves to the token, so there is no
  // id to pass and no way for this page to accidentally render another citizen's data.
  const loadStats = useCallback(() => getMyIssueStats(), []);
  const { data: statsResponse, error: statsError, loading: statsLoading } =
    useResource("citizen-stats", loadStats);

  const loadRecent = useCallback(async () => {
    const response = await listMyIssues({ page: 1, limit: 5 });
    return response.data ?? [];
  }, []);
  const { data: recent, error: recentError, loading: recentLoading } =
    useResource("citizen-recent", loadRecent);

  const stats = statsResponse?.data ?? null;
  const issues = recent ?? [];
  const hasAny = (stats?.total_issues ?? 0) > 0;

  // This return has to sit below every hook above, not next to the effect. Putting it
  // earlier would make useCallback/useResource conditional, which is both a hooks
  // violation and a real bug: React would keep the previous render's hook state.
  if (!hydrated || wrongRole) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
          {session?.name ? `Welcome back, ${session.name}` : "Your dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Everything you have reported, and where each report stands.
        </p>
      </div>

      {statsError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your reports</AlertTitle>
          <AlertDescription>{statsError.message}</AlertDescription>
        </Alert>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {statsLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))
          ) : (
            <>
              <StatCard
                label="Open"
                value={stats?.open_issues ?? null}
                description="Reported and not yet resolved"
                icon={Inbox}
              />
              <StatCard
                label="Resolved"
                value={stats?.resolved_issues ?? null}
                description="Reports that are done"
                icon={CheckCircle2}
              />
              <StatCard
                label="All reports"
                value={stats?.total_issues ?? null}
                description="Everything you have filed"
                icon={OctagonX}
              />
            </>
          )}
        </section>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="font-heading text-lg">Your recent reports</CardTitle>
            <CardDescription>The five most recent things you have reported.</CardDescription>
          </div>
          <LinkButton href="/report" size="sm" className="gap-1.5">
            <PlusCircle />
            New report
          </LinkButton>
        </CardHeader>
        <CardContent>
          <CollectionState
            loading={recentLoading}
            error={recentError?.message}
            isEmpty={issues.length === 0}
            skeleton={<ListSkeleton rows={3} />}
            emptyIcon={Inbox}
            emptyTitle="No reports yet"
            emptyDescription="Spotted a pothole, a broken streetlight or a blocked drain? Reporting it takes under a minute and it goes straight to the right department."
            emptyAction={
              <LinkButton href="/report">Report your first issue</LinkButton>
            }
          >
            <ul className="divide-y">
              {issues.map((issue) => (
                <li key={issue.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{issue.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {issue.ward_number} · {issue.ward_name} ·{" "}
                        {formatRelative(issue.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <IssueStatusBadge status={issue.status} />
                      <LinkButton
                        href={`/issues/${issue.id}`}
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                      >
                        View
                      </LinkButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CollectionState>
        </CardContent>
      </Card>

      {hasAny && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">What happens next</CardTitle>
            <CardDescription>
              A report moves through four steps, and you can follow it on the issue
              page at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Reported</span> — received
              and waiting for a department to pick it up. This is the only stage where
              you can still add photos as evidence.
            </p>
            <p>
              <span className="font-medium text-foreground">Acknowledged</span> — a
              department has accepted it and assigned an officer.
            </p>
            <p>
              <span className="font-medium text-foreground">In progress</span> — the
              crew is working on it.
            </p>
            <p>
              <span className="font-medium text-foreground">Resolved</span> — done, and
              you can confirm the fix.
            </p>
            <p className="border-t pt-3">
              Something still wrong after a report is resolved? Open that report and
              send it back to the department from the issue page.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CitizenDashboard;
