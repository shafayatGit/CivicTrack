"use client";

import { useCallback, useMemo, useState } from "react";
import { OctagonX, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import LinkButton from "@/components/Modules/Common/LinkButton";
import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import IssueCard from "@/components/Modules/Issues/IssueCard";
import IssueFilters from "@/components/Modules/Issues/IssueFilters";
import PaginationControls from "@/components/Modules/Admin/PaginationControls";
import { useResource } from "@/hooks/use-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  getOwnStaffProfile,
  listCategories,
  listDepartments,
  listIssues,
  listWards,
} from "@/lib/api";

const EMPTY_FILTERS = {
  search: "",
  status: "",
  categoryId: "",
  wardId: "",
  departmentId: "",
};

// A debounce beats a submit button here: the list is the filter's output, so the
// results are expected to move as the user types. 300ms is long enough not to fire a
// query per keystroke and short enough to still feel immediate.
const SEARCH_DEBOUNCE_MS = 300;

const loadFilterOptions = async () => {
  const [categories, wards, departments] = await Promise.all([
    listCategories(),
    listWards({ limit: 100 }),
    listDepartments({ limit: 100 }),
  ]);

  return {
    categories: categories.data ?? [],
    wards: wards.data ?? [],
    departments: departments.data ?? [],
  };
};

// Reused by the portal at /issues and by the admin triage queue at /admin/issues.
// The two surfaces differ only in heading and in which tab they open on, so the
// list, its filters and its empty states stay in one place.
const IssuesExplorer = ({
  heading = "Issues",
  description = "Every civic issue on the platform, with its current status and owner.",
  initialScope = "all",
}) => {
  const { session } = useAuth();
  const role = session?.role;

  const [scope, setScope] = useState(initialScope);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // A failed lookup list only narrows the filter choices, so it is swallowed rather
  // than surfaced: the issue list below reports its own failure.
  const { data: options } = useResource("filter-options", loadFilterOptions);

  // staff.id is not in the JWT, and the "assigned to me" tab needs it as a filter.
  const staffEmail = session?.email ?? null;
  const loadOwnStaff = useCallback(() => getOwnStaffProfile(staffEmail), [staffEmail]);
  const { data: ownStaff } = useResource(
    role === "staff" ? `own-staff:${staffEmail}` : null,
    loadOwnStaff,
    { enabled: role === "staff" },
  );

  // Any filter change invalidates the current page: staying on page 4 of a result
  // set that just shrank to one page would show an empty list with no way back.
  const updateFilters = useCallback((next) => {
    setFilters(next);
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const scopes = useMemo(() => {
    const available = [{ value: "all", label: "All issues" }];

    if (role === "citizen") {
      available.push({ value: "mine", label: "My reports" });
    } else if (role === "staff") {
      available.push({ value: "assigned", label: "Assigned to me" });
    }

    if (role === "admin") {
      available.push({ value: "unassigned", label: "Unassigned" });
    }

    return available;
  }, [role]);

  // Guards against a stale scope after a role change (for example a shared browser
  // that switches accounts, or a role that is not offered the initial tab).
  const activeScope = scopes.some((entry) => entry.value === scope) ? scope : "all";

  // Search is debounced through the resource key rather than through separate state,
  // so there is exactly one source of truth for "what is being fetched".
  const [searchInput, setSearchInput] = useState(EMPTY_FILTERS.search);
  const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  const sessionId = session?.id ?? null;
  const ownStaffId = ownStaff?.id ?? null;

  const query = useMemo(() => {
    const base = {
      search,
      status: filters.status,
      categoryId: filters.categoryId,
      wardId: filters.wardId,
      departmentId: filters.departmentId,
    };

    if (activeScope === "mine") {
      return { ...base, userId: sessionId };
    }

    if (activeScope === "assigned" && ownStaffId) {
      return { ...base, assignedStaffId: ownStaffId };
    }

    if (activeScope === "unassigned") {
      return { ...base, unassigned: "true" };
    }

    return base;
  }, [
    activeScope,
    search,
    filters.status,
    filters.categoryId,
    filters.wardId,
    filters.departmentId,
    ownStaffId,
    sessionId,
  ]);

  // The "assigned to me" tab cannot filter until the staff row is resolved, and
  // querying without it would silently show the whole board under that label.
  const awaitingScope = activeScope === "assigned" && role === "staff" && !ownStaffId;

  const loadIssues = useCallback(() => listIssues({ ...query, page }), [query, page]);

  const { data, error, loading } = useResource(
    `issues:${activeScope}:${page}:${JSON.stringify(query)}`,
    loadIssues,
    { enabled: !awaitingScope },
  );

  const items = data?.data ?? [];
  const pagination = data?.pagination ?? null;
  const showEmpty = !loading && !error && items.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
            {heading}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        {role === "citizen" && (
          <LinkButton href="/report" className="gap-1.5">
            <Plus />
            Report an issue
          </LinkButton>
        )}
      </div>

      <Tabs
        value={activeScope}
        onValueChange={(value) => {
          setScope(value);
          setPage(1);
        }}
      >
        <TabsList className="w-full sm:w-fit">
          {scopes.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value} className="px-4">
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <IssueFilters
        filters={{ ...filters, search: searchInput }}
        onChange={(next) => {
          if (next.search !== filters.search) {
            setSearchInput(next.search);
          }
          updateFilters(next);
        }}
        onReset={() => {
          setSearchInput(EMPTY_FILTERS.search);
          resetFilters();
        }}
        options={options ?? { categories: [], wards: [], departments: [] }}
        resultCount={pagination?.total}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          Could not reach the CivicTrack API. Check that the backend is running on
          port 8000.
        </p>
      ) : showEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <OctagonX />
            </EmptyMedia>
            <EmptyTitle>No issues match these filters</EmptyTitle>
            <EmptyDescription>
              {activeScope === "mine"
                ? "You have not reported anything yet."
                : "Try widening the filters, or be the first to report it."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchInput(EMPTY_FILTERS.search);
                  resetFilters();
                }}
              >
                Clear filters
              </Button>
              {role === "citizen" && (
                <LinkButton href="/report">Report an issue</LinkButton>
              )}
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {items.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}

      <PaginationControls pagination={pagination} onPageChange={setPage} />
    </div>
  );
};

export default IssuesExplorer;

