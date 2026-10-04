"use client";

import { useCallback, useMemo, useState } from "react";
import { Gauge, Loader2, RefreshCw } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import AdminPageHeader from "@/components/Modules/Admin/AdminPageHeader";
import CollectionState, {
  TableSkeleton,
} from "@/components/Modules/Admin/CollectionState";
import { useCrudResource } from "@/hooks/use-crud-resource";
import {
  generateDepartmentPerformance,
  listDepartmentPerformance,
} from "@/lib/api";
import { formatNumber } from "@/lib/format";

const PAGE_SIZE = 20;

const formatHours = (value) => {
  if (value === null || value === undefined) {
    return "—";
  }

  const hours = Number(value);
  if (!Number.isFinite(hours)) {
    return "—";
  }

  return hours < 24 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
};

// Built from local date parts, not toISOString(). toISOString() returns the UTC date, and
// this app is used in UTC+6 — so a visitor picking "today" any time after midnight local
// would be sent the previous day and the window would be off by one at both ends. The
// server labels windows by calendar date, so the client has to read the same calendar.
const isoLocal = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const isoToday = () => isoLocal(new Date());

// The first of the current month, so the two inputs arrive as a sensible default pair
// rather than two empty boxes.
const isoFirstOfMonth = () => `${isoToday().slice(0, 7)}-01`;

const DepartmentPerformanceReport = () => {
  const [periodStart, setPeriodStart] = useState(isoFirstOfMonth);
  const [periodEnd, setPeriodEnd] = useState(isoToday);
  const [page, setPage] = useState(1);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generated, setGenerated] = useState(null);

  // Fixed key order: resourceKey is a JSON.stringify, so a rebuilt object literal with
  // the keys in a different sequence would read as a different query.
  const load = useCallback(
    () =>
      listDepartmentPerformance({
        periodStart,
        periodEnd,
        page,
        limit: PAGE_SIZE,
      }),
    [periodStart, periodEnd, page],
  );

  const { data, error, loading, reload } = useCrudResource(
    `admin-dept-performance:${periodStart}:${periodEnd}:${page}`,
    load,
  );

  const rows = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;
  // Echoed by the server rather than re-derived here, so the heading can never
  // disagree with the window the numbers actually came from.
  const period = data?.period;
  const availableWindows = useMemo(() => data?.availableWindows ?? [], [data]);

  // A window the admin has not generated yet returns an empty table rather than an
  // error, so the empty state needs to offer the action that fills it.
  const isEmpty = rows.length === 0;

  // The read pins one window exactly (that is what makes "one row per department" true —
  // uq_department_performance_window is per department per window), so a range nobody has
  // generated reads empty. Rather than leave that as a dead end, offer the windows that do
  // exist — the admin's next question is always "which ones are there?".
  const handleSelectWindow = (window) => {
    setPeriodStart(window.periodStart);
    setPeriodEnd(window.periodEnd);
    setPage(1);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError("");
    setGenerated(null);

    try {
      const response = await generateDepartmentPerformance({
        periodStart,
        periodEnd,
      });
      setGenerated({
        measured: response.measured,
        unmeasured: response.unmeasured,
      });
      setPage(1);
      reload();
    } catch (cause) {
      setGenerateError(
        cause?.message ?? "Unable to generate the snapshot. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Department performance"
        description="Resolution times and overdue counts per department, measured over a fixed reporting window."
      />

      <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="period-start">From</Label>
            <Input
              id="period-start"
              type="date"
              value={periodStart}
              max={periodEnd}
              onChange={(event) => {
                setPeriodStart(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="period-end">To</Label>
            <Input
              id="period-end"
              type="date"
              value={periodEnd}
              min={periodStart}
              onChange={(event) => {
                setPeriodEnd(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {generating ? "Generating..." : "Generate snapshot"}
        </Button>
      </div>

      {generated && (
        <Alert>
          <AlertTitle>Snapshot generated</AlertTitle>
          <AlertDescription>
            {generated.measured} department
            {generated.measured === 1 ? "" : "s"} measured against a target
            {generated.unmeasured > 0
              ? `, ${generated.unmeasured} with no target set and therefore reported as unmeasured.`
              : "."}
          </AlertDescription>
        </Alert>
      )}

      {generateError && (
        <Alert variant="destructive">
          <AlertTitle>Could not generate the snapshot</AlertTitle>
          <AlertDescription>{generateError}</AlertDescription>
        </Alert>
      )}

      {period && (
        <p className="text-sm text-muted-foreground">
          Window: {period.periodStart} to {period.periodEnd}
        </p>
      )}

      {isEmpty && availableWindows.length > 0 && (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium">Windows already generated</p>
          <p className="text-sm text-muted-foreground">
            This report covers one window at a time, so pick one to see its numbers.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {availableWindows.map((window) => {
              const key = `${window.periodStart}:${window.periodEnd}`;

              return (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectWindow(window)}
                >
                  {window.periodStart} to {window.periodEnd}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <CollectionState
        loading={loading}
        error={error?.message}
        isEmpty={isEmpty}
        skeleton={<TableSkeleton rows={6} />}
        emptyTitle="No snapshot for this window"
        emptyDescription="Performance is measured from stored snapshots, so a window has to be generated once before it can be reported on."
        emptyIcon={Gauge}
        emptyAction={
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {generating ? "Generating..." : "Generate snapshot"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Avg resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.department_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.resolution_target_hours != null
                        ? `${formatNumber(row.resolution_target_hours)}h`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.resolved_count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.open_count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* NULL and 0 are different claims: NULL means no target was
                          published, so overdue was never measured. Printing 0 there
                          would read as a perfect score for a missing measurement. */}
                      {row.overdue_count === null ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          No target
                        </Badge>
                      ) : (
                        <span
                          className={
                            Number(row.overdue_count) > 0
                              ? "font-medium text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          {formatNumber(row.overdue_count)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatHours(row.avg_resolution_hours)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={!pagination.hasNextPage}
              >
                Next page
              </Button>
            </div>
          )}
        </div>
      </CollectionState>
    </div>
  );
};

export default DepartmentPerformanceReport;