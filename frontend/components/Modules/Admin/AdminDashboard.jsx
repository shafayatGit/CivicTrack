"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Files,
  Gauge,
  Inbox,
  Users,
  UserX,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis } from "recharts";

import LinkButton from "@/components/Modules/Common/LinkButton";
import AdminPageHeader from "@/components/Modules/Admin/AdminPageHeader";
import { useResource } from "@/hooks/use-resource";
import { getIssueStats, getResolvedSummary, listDepartments, listStaff } from "@/lib/api";
import { ISSUE_STATUSES } from "@/lib/issue-status";
import { formatNumber, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// The theme is deliberately narrow — one green, one red, and a grey ramp — so the
// accents below are drawn from those rather than invented hues. A metric that means
// "someone must act on this" gets the red; "steady state" gets the green.
const ACCENTS = {
  primary: "bg-primary/10 text-primary",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-foreground",
};

// Statuses read left-to-right as a workflow, so the bars run light to dark with the
// one status that means work is happening right now picked out in the brand green.
// Keyed by the same four strings as ISSUE_STATUSES, which is what the API groups by.
const STATUS_BAR_COLORS = {
  Reported: "var(--color-chart-2)",
  Acknowledged: "var(--color-chart-3)",
  "In Progress": "var(--primary)",
  Resolved: "var(--color-chart-5)",
};

const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

const StatCard = ({ label, value, description, icon: Icon, accent = "primary", to }) => {
  const body = (
    <Card
      size="sm"
      className="h-full justify-between gap-4 transition duration-200 group-hover/card:-translate-y-0.5 group-hover/card:shadow-md"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            ACCENTS[accent],
          )}
        >
          <Icon className="size-4" />
        </span>

        {/* The whole card is the link, so the affordance has to live on the card. */}
        {to ? (
          <ArrowUpRight
            className="size-4 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/card:opacity-100"
            aria-hidden="true"
          />
        ) : null}
      </CardHeader>

      <CardContent className="space-y-1">
        <p className="font-heading text-4xl font-semibold tracking-tight tabular-nums">
          {value === null ? "—" : formatNumber(value)}
        </p>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  // Wrapping the whole card keeps the click target large, matching how the issue
  // card uses a stretched anchor. The radius mirrors the Card's own, which is
  // min(--radius-4xl, 24px), so the focus ring hugs the edge instead of cutting
  // across the corners.
  if (!to) {
    return body;
  }

  return (
    <Link
      href={to}
      className="group block h-full rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
};

const AdminDashboard = () => {
  const loadStats = useCallback(() => getIssueStats(), []);
  const { data, error, loading } = useResource("admin-stats", loadStats);

  const loadTop = useCallback(
    () => getResolvedSummary({ page: 1, limit: 5 }),
    [],
  );
  const { data: top } = useResource("admin-resolved-top", loadTop);

  const loadDepartmentCount = useCallback(async () => {
    const response = await listDepartments({ limit: 100 });
    return response.data ?? [];
  }, []);
  const { data: departments } = useResource("admin-dashboard-departments", loadDepartmentCount);

  const loadStaffCount = useCallback(async () => {
    const response = await listStaff({ limit: 100 });
    return response.data ?? [];
  }, []);
  const { data: staff } = useResource("admin-dashboard-staff", loadStaffCount);

  const stats = data?.data ?? null;

  // The API always returns all four statuses, zero-filled, so the chart never has a
  // hole in it because a status has no issues.
  const chartData = ISSUE_STATUSES.map((status) => ({
    status,
    total: toNumber(stats?.by_status?.[status]),
  }));

  const totalIssues = toNumber(stats?.total_issues);
  const resolvedIssues = toNumber(stats?.resolved_issues);
  const resolutionRate = stats ? percent(resolvedIssues, totalIssues) : null;

  const topCategories = top?.data ?? [];
  // Bars are scaled against the top row rather than the total, so the leader always
  // fills the track instead of a 4%-of-issues category rendering as a hairline.
  const topResolved = Math.max(
    ...topCategories.map((row) => toNumber(row.resolved_count)),
    0,
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description="Live counters from the issues table, and the categories resolving the most reports."
        actions={
          <LinkButton href="/admin/issues">Open the queue</LinkButton>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load dashboard counters</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-44 w-full" />
            ))
          ) : (
            <>
              <StatCard
                label="Open issues"
                value={stats?.open_issues ?? null}
                description="Everything not yet resolved"
                icon={Inbox}
                to="/admin/issues"
              />
              <StatCard
                label="Unassigned"
                value={stats?.unassigned_issues ?? null}
                description="Open, and nobody owns them yet"
                icon={UserX}
                accent="destructive"
                to="/admin/issues"
              />
              <StatCard
                label="Resolved"
                value={stats?.resolved_issues ?? null}
                description="Closed since the platform began"
                icon={CheckCircle2}
                to="/admin/reports"
              />
              <StatCard
                label="All issues"
                value={stats?.total_issues ?? null}
                description="Every report ever submitted"
                icon={Files}
                accent="muted"
              />
            </>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {/* Same anatomy as StatCard — icon tile, big number, label, supporting
              line — with the progress track as the one addition, so the card reads
              as part of the set rather than a different kind of tile. */}
          <Card size="sm" className="justify-between gap-4">
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl",
                  ACCENTS.primary,
                )}
              >
                <Gauge className="size-4" />
              </span>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="font-heading text-4xl font-semibold tracking-tight tabular-nums">
                  {resolutionRate === null ? "—" : `${resolutionRate}%`}
                </p>
                <p className="text-sm font-medium">Resolution rate</p>
                <p className="text-xs text-muted-foreground">
                  {stats
                    ? `${formatNumber(resolvedIssues)} of ${formatNumber(totalIssues)} issues resolved`
                    : "—"}
                </p>
              </div>

              <Progress
                value={resolutionRate ?? 0}
                // A platform with nothing reported yet has no rate to show, and a
                // full bar would read as "everything is done".
                aria-label="Share of issues resolved"
              />
            </CardContent>
          </Card>

          <StatCard
            label="Departments"
            value={departments === null ? null : departments.length}
            description="Routing targets"
            icon={Building2}
            accent="muted"
          />
          <StatCard
            label="Staff"
            value={staff === null ? null : staff.length}
            description="Officers who can be assigned"
            icon={Users}
            accent="muted"
          />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Issues by status</CardTitle>
            <CardDescription>
              Counts across every department.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ChartContainer
                config={{ total: { label: "Issues" } }}
                className="h-56 w-full"
              >
                <BarChart data={chartData} accessibilityLayer margin={{ top: 20 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" radius={8}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_BAR_COLORS[entry.status]}
                      />
                    ))}
                    <LabelList
                      dataKey="total"
                      position="top"
                      className="fill-foreground text-xs font-medium"
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Top resolving categories</CardTitle>
            <CardDescription>
              Resolved counts by category and ward, from the summary view.
            </CardDescription>
          </div>
          <LinkButton href="/admin/reports" variant="outline">
            Full report
          </LinkButton>
        </CardHeader>
        <CardContent>
          {topCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has been resolved yet, so there is nothing to rank.
            </p>
          ) : (
            <ul className="space-y-3">
              {topCategories.map((row, index) => {
                const count = toNumber(row.resolved_count);

                return (
                  <li key={`${row.category}-${row.ward}`} className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                          index === 0
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {row.category}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.ward}
                        </span>
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {formatNumber(count)}
                      </span>
                    </div>

                    <div
                      className="ml-9 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${topResolved > 0 ? (count / topResolved) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
