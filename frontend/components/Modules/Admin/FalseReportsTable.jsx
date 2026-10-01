"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Flag, Loader2, ShieldOff, Undo2, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import AdminPageHeader from "@/components/Modules/Admin/AdminPageHeader";
import CollectionState from "@/components/Modules/Admin/CollectionState";
import PaginationControls from "@/components/Modules/Admin/PaginationControls";
import IssueStatusBadge from "@/components/Modules/Issues/IssueStatusBadge";
import { useCrudResource } from "@/hooks/use-crud-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  deactivateCitizen,
  dismissFalseReport,
  listFalseReports,
  reactivateUser,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 20;

const FILTERS = [
  { value: "pending", label: "Awaiting decision" },
  { value: "upheld", label: "Upheld" },
  { value: "dismissed", label: "Dismissed" },
];

const FLAG_BADGES = {
  pending: "secondary",
  upheld: "destructive",
  dismissed: "outline",
};

// The deactivation dialog is its own component so the note field keeps its own state
// and its own error, instead of the table growing a second error channel next to the
// one it uses for the row actions.
const DeactivateDialog = ({ flag, onOpenChange, onDone }) => {
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    if (note.trim().length < 3) {
      setFieldError("Say why, in at least 3 characters — this is what the person sees.");
      return;
    }

    setFieldError("");
    setServerError("");
    setPending(true);

    try {
      await deactivateCitizen(flag.id, { note: note.trim() });
      toast.add({
        type: "success",
        title: `${flag.citizen_name} can no longer sign in or report`,
      });
      onDone();
    } catch (error) {
      setServerError(error.message ?? "Could not deactivate this account.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={Boolean(flag)}
      onOpenChange={(open) => {
        if (!open) {
          setNote("");
          setFieldError("");
          setServerError("");
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate this citizen?</DialogTitle>
          <DialogDescription>
            <span>
              {flag?.citizen_name} will not be able to sign in or file new reports.
              Their existing session is ended immediately, and they cannot register
              again under this email. You can undo this from the upheld list.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3 text-sm">
          <span className="font-medium">{flag?.citizen_name}</span>
          <span className="text-muted-foreground">{flag?.citizen_email}</span>
          {flag?.citizen_nid && (
            <span className="text-muted-foreground">NID {flag.citizen_nid}</span>
          )}
        </div>

        <Field data-invalid={Boolean(fieldError)}>
          <FieldLabel htmlFor="deactivation-note">Reason</FieldLabel>
          <FieldContent>
            <Textarea
              id="deactivation-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Two fabricated reports in Dhanmondi within a week."
              rows={3}
              aria-invalid={Boolean(fieldError)}
            />
            <FieldDescription>
              Shown to this person if they try to sign in.
            </FieldDescription>
            {fieldError && <FieldError>{fieldError}</FieldError>}
          </FieldContent>
        </Field>

        {serverError && <p className="text-sm text-destructive">{serverError}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <UserX />}
            {pending ? "Deactivating..." : "Deactivate citizen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FalseReportsTable = () => {
  const [status, setStatus] = useState("pending");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [deactivating, setDeactivating] = useState(null);
  const [dismissing, setDismissing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState("");

  const search = useDebouncedValue(searchInput, 300);

  const load = useCallback(
    () =>
      listFalseReports({
        page,
        limit: PAGE_SIZE,
        status,
        ...(search ? { search } : {}),
      }),
    [page, search, status],
  );

  // A fixed key order: the resource key is a JSON.stringify of these parts, so
  // building them in a different order between renders would refetch forever.
  const { data, error, loading, reload } = useCrudResource(
    `admin-false-reports:${status}:${search}:${page}`,
    load,
  );

  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const dismiss = async (flag) => {
    setBusyId(flag.id);
    setRowError("");

    try {
      await dismissFalseReport(flag.id);
      toast.add({
        type: "success",
        title: "Flag dismissed — the report is back in the queue",
      });
      setDismissing(null);
      reload();
    } catch (dismissError) {
      setRowError(dismissError.message ?? "Could not dismiss this flag.");
    } finally {
      setBusyId(null);
    }
  };

  const reactivate = async (flag) => {
    setBusyId(flag.id);
    setRowError("");

    try {
      await reactivateUser(flag.citizen_id);
      toast.add({ type: "success", title: `${flag.citizen_name} can sign in again` });
      reload();
    } catch (reactivateError) {
      setRowError(reactivateError.message ?? "Could not re-enable this account.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="False reports"
        description="Reports an officer judged not real. Upholding one deactivates the citizen who filed it; dismissing one hands the report back to the queue."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <NativeSelect
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by decision"
            className="w-full sm:w-56"
          >
            {FILTERS.map((filter) => (
              <NativeSelectOption key={filter.value} value={filter.value}>
                {filter.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Search report or citizen"
            aria-label="Search false reports"
            className="w-full sm:w-72"
          />
        </div>
      </div>

      {rowError && <p className="text-sm text-destructive">{rowError}</p>}

      <CollectionState
        loading={loading}
        error={error}
        isEmpty={items.length === 0}
        emptyIcon={Flag}
        emptyTitle={
          status === "pending" ? "No reports awaiting a decision" : "Nothing here"
        }
        emptyDescription={
          status === "pending"
            ? "When an officer flags a report as false it appears here for review."
            : "No flags have been decided this way yet."
        }
      >
        <div className="overflow-x-auto rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Officer&rsquo;s reason</TableHead>
                <TableHead>Flagged</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="max-w-64">
                    <Link
                      href={`/issues/${flag.issue_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {flag.issue_title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {flag.category_name} · {flag.ward_name}
                      {flag.issue_is_invalid ? " · flagged false" : " · flag cleared"}
                    </p>
                    <IssueStatusBadge
                      status={flag.issue_status}
                      className="mt-1"
                    />
                  </TableCell>

                  <TableCell className="max-w-56">
                    <p className="font-medium">{flag.citizen_name}</p>
                    <p className="text-xs text-muted-foreground break-all">
                      {flag.citizen_email}
                    </p>
                    {flag.citizen_nid && (
                      <p className="text-xs text-muted-foreground">
                        NID {flag.citizen_nid}
                      </p>
                    )}
                    <Badge
                      variant={flag.citizen_is_active ? "outline" : "destructive"}
                      className="mt-1"
                    >
                      {flag.citizen_is_active ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>

                  <TableCell className="max-w-72 text-sm">
                    {flag.reason}
                    <p className="mt-1 text-xs text-muted-foreground">
                      by {flag.flagged_by_name ?? "an officer"}
                    </p>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(flag.flagged_at)}
                  </TableCell>

                  <TableCell>
                    <Badge variant={FLAG_BADGES[flag.status]}>
                      {flag.status === "pending"
                        ? "Awaiting decision"
                        : flag.status === "upheld"
                          ? "Upheld"
                          : "Dismissed"}
                    </Badge>
                    {flag.actioned_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {flag.status === "upheld" ? "Upheld" : "Dismissed"} by{" "}
                        {flag.actioned_by_name ?? "an admin"}
                      </p>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-2">
                      {flag.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === flag.id}
                            onClick={() => setDeactivating(flag)}
                            className="w-full"
                          >
                            <UserX />
                            Deactivate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === flag.id}
                            onClick={() => {
                              setRowError("");
                              setDismissing(flag);
                            }}
                            className="w-full"
                          >
                            {dismissing?.id === flag.id &&
                            busyId === flag.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <ShieldOff />
                            )}
                            Dismiss
                          </Button>
                        </>
                      ) : null}

                      {flag.status === "upheld" && !flag.citizen_is_active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === flag.id}
                          onClick={() => reactivate(flag)}
                          className="w-full"
                        >
                          {busyId === flag.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Undo2 />
                          )}
                          Reactivate
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollectionState>

      <PaginationControls pagination={pagination} onPageChange={setPage} />

      <DeactivateDialog
        flag={deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        onDone={reload}
      />

      <Dialog
        open={Boolean(dismissing)}
        onOpenChange={(open) => !open && setDismissing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dismiss this flag?</DialogTitle>
            <DialogDescription>
              The report is treated as genuine and returns to the normal queue. The
              citizen is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDismissing(null)}
              disabled={busyId === dismissing?.id}
            >
              Cancel
            </Button>
            <Button
              onClick={() => dismissing && dismiss(dismissing)}
              disabled={busyId === dismissing?.id}
            >
              {busyId === dismissing?.id && <Loader2 className="animate-spin" />}
              Dismiss flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FalseReportsTable;
