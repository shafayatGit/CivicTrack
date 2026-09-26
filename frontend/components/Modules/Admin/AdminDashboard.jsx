"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import LinkButton from "@/components/Modules/Common/LinkButton";
import AdminPageHeader from "@/components/Modules/Admin/AdminPageHeader";
import { useResource } from "@/hooks/use-resource";
import { getIssueStats, getResolvedSummary, listDepartments, listStaff } from "@/lib/api";
import { ISSUE_STATUSES } from "@/lib/issue-status";
import { formatNumber } from "@/lib/format";

const StatCard = ({ label, value, description, icon: Icon, to }) => {
  const body = (
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

  // Wrapping the whole card keeps the click target large, matching how the issue
  // card uses a stretched anchor.
  if (!to) {
    return body;
  }

  return (
    <Link href={to} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
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
    total: stats?.by_status?.[status] ?? 0,
  }));

  const topCategories = top?.data ?? [];

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
              <Skeleton key={index} className="h-32 w-full" />
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
                icon={CheckCircle2}
              />
            </>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                <BarChart data={chartData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={6} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard
            label="Departments"
            value={departments === null ? null : departments.length}
            description="Routing targets"
            icon={Building2}
          />
          <StatCard
            label="Staff"
            value={staff === null ? null : staff.length}
            description="Officers who can be assigned"
            icon={Users}
          />
        </div>
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
            <ul className="divide-y">
              {topCategories.map((row, index) => (
                <li
                  key={`${row.category}-${row.ward}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="w-6 text-sm tabular-nums text-muted-foreground">
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
                  <span className="text-sm tabular-nums">
                    {formatNumber(row.resolved_count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
