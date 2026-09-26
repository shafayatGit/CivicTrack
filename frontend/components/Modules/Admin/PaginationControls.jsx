"use client";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

import { formatNumber } from "@/lib/format";

// Renders the `pagination` block that utils/pagination.js puts on every list
// response, so page controls look the same in the issue queue, the staff roster
// and the message threads.
const PaginationControls = ({ pagination, onPageChange }) => {
  if (!pagination) {
    return null;
  }

  const { page, total, totalPages } = pagination;

  if (totalPages <= 1) {
    return null;
  }

  const first = (page - 1) * pagination.limit + 1;
  const last = Math.min(page * pagination.limit, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{formatNumber(first)}</span>
        {" – "}
        <span className="font-medium text-foreground">{formatNumber(last)}</span> of{" "}
        <span className="font-medium text-foreground">{formatNumber(total)}</span>
      </p>

      <Pagination className="justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={!pagination.hasPrevPage}
              className={pagination.hasPrevPage ? "" : "pointer-events-none opacity-50"}
              onClick={(event) => {
                event.preventDefault();
                if (pagination.hasPrevPage) {
                  onPageChange(page - 1);
                }
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={!pagination.hasNextPage}
              className={pagination.hasNextPage ? "" : "pointer-events-none opacity-50"}
              onClick={(event) => {
                event.preventDefault();
                if (pagination.hasNextPage) {
                  onPageChange(page + 1);
                }
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default PaginationControls;
