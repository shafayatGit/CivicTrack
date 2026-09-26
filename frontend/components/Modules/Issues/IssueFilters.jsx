"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
  NativeSelectOptGroup,
} from "@/components/ui/native-select";
import { ISSUE_STATUSES } from "@/lib/issue-status";

const EMPTY = "";

// A plain <select> per filter: this bar holds five controls at once, and native
// selects stay usable on a phone and inside a compact grid where a portal-based
// listbox would add a popover per control.
const IssueFilters = ({ filters, onChange, options, onReset, resultCount }) => {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value });

  const isFiltered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-3 rounded-3xl border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={set("search")}
            placeholder="Search titles and descriptions"
            aria-label="Search issues"
            className="pl-9"
          />
        </div>

        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5">
            <X />
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NativeSelect
          value={filters.status}
          onChange={set("status")}
          aria-label="Filter by status"
          className="w-full"
        >
          <NativeSelectOption value={EMPTY}>All statuses</NativeSelectOption>
          {ISSUE_STATUSES.map((status) => (
            <NativeSelectOption key={status} value={status}>
              {status}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          value={filters.categoryId}
          onChange={set("categoryId")}
          aria-label="Filter by category"
          className="w-full"
        >
          <NativeSelectOption value={EMPTY}>All categories</NativeSelectOption>
          {options.categories.map((category) => (
            <NativeSelectOption key={category.id} value={category.id}>
              {category.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          value={filters.wardId}
          onChange={set("wardId")}
          aria-label="Filter by ward"
          className="w-full"
        >
          <NativeSelectOption value={EMPTY}>All wards</NativeSelectOption>
          {options.wards.map((ward) => (
            <NativeSelectOption key={ward.id} value={ward.id}>
              {ward.ward_number} · {ward.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          value={filters.departmentId}
          onChange={set("departmentId")}
          aria-label="Filter by department"
          className="w-full"
        >
          <NativeSelectOption value={EMPTY}>All departments</NativeSelectOption>
          {options.departments.map((department) => (
            <NativeSelectOption key={department.id} value={department.id}>
              {department.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {resultCount !== undefined && (
        <p className="text-xs text-muted-foreground">
          {resultCount} matching {resultCount === 1 ? "issue" : "issues"}
        </p>
      )}
    </div>
  );
};

export default IssueFilters;
