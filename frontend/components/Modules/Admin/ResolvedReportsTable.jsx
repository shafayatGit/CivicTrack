"use client";

import { useCallback, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import AdminPageHeader from "@/components/Modules/Admin/AdminPageHeader";
import CollectionState, {
  TableSkeleton,
} from "@/components/Modules/Admin/CollectionState";
import PaginationControls from "@/components/Modules/Admin/PaginationControls";
import { useCrudResource } from "@/hooks/use-crud-resource";
import { getResolvedSummary } from "@/lib/api";
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

  // Under a day stays in hours, because "4.2 hours" is more useful to a reader than
  // "0.2 days"; past that, days are the more natural unit.
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }

  return `${(hours / 24).toFixed(1)}d`;
};

const ResolvedReportsTable = () => {
  const [page, setPage] = useState(1);

  const load = useCallback(
    () => getResolvedSummary({ page, limit: PAGE_SIZE }),
    [page],
  );
  const { data, error, loading } = useCrudResource(
    `admin-resolved-summary:${page}`,
    load,
  );

  const rows = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports"
        description="Resolved issues rolled up by category and ward, with the average time taken to resolve them."
      />

      <CollectionState
        loading={loading}
        error={error?.message}
        isEmpty={rows.length === 0}
        skeleton={<TableSkeleton rows={6} />}
        emptyTitle="No resolved issues yet"
        emptyDescription="Once issues start being marked resolved, this report fills in."
        emptyIcon={BarChart3}
      >
        <div className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                  <TableHead className="text-right">Avg resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.category}-${row.ward}`}>
                    <TableCell className="font-medium">{row.category}</TableCell>
                    <TableCell className="text-muted-foreground">{row.ward}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.resolved_count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatHours(row.avg_resolution_hours)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls pagination={pagination} onPageChange={setPage} />
        </div>
      </CollectionState>
    </div>
  );
};

export default ResolvedReportsTable;
