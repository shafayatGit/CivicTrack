"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useResource } from "@/hooks/use-resource";
import { listAdmins, listIssues, listStaff } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Starts a thread.
 *
 * The backend resolves the sender from the session, so the form only ever chooses
 * the *other* participant: an admin picks a staff member, a staff member picks an
 * admin. It also decides whether the thread is general or tied to an issue, because
 * issue_id is part of a thread's identity — the same pair of people has a separate
 * conversation per issue.
 */
const NewThreadDialog = ({ open, onOpenChange, role, onCreated }) => {
  const [search, setSearch] = useState("");
  const [staffId, setStaffId] = useState("");
  const [adminId, setAdminId] = useState("");
  const [issueId, setIssueId] = useState("");
  const [error, setError] = useState("");

  const loadStaff = useCallback(async () => {
    const response = await listStaff({ limit: 100 });
    return response.data ?? [];
  }, []);
  const { data: staff, error: staffError } = useResource(
    open && role === "admin" ? "new-thread:staff" : null,
    loadStaff,
    { enabled: open && role === "admin" },
  );

  const loadAdmins = useCallback(async () => {
    const response = await listAdmins();
    return response.data ?? [];
  }, []);
  const { data: admins, error: adminsError } = useResource(
    open && role === "staff" ? "new-thread:admins" : null,
    loadAdmins,
    { enabled: open && role === "staff" },
  );

  // Only the issue picker needs the full list; without it a thread is general.
  const loadIssues = useCallback(async () => {
    const response = await listIssues({ page: 1, limit: 100 });
    return response.data ?? [];
  }, []);
  const { data: issues } = useResource(
    open ? "new-thread:issues" : null,
    loadIssues,
    { enabled: open },
  );

  const needle = search.trim().toLowerCase();
  const matches = useMemo(() => {
    const rows = role === "admin" ? (staff ?? []) : (admins ?? []);

    if (!needle) {
      return rows;
    }

    return rows.filter((row) =>
      `${row.name} ${row.email}`.toLowerCase().includes(needle),
    );
  }, [role, staff, admins, needle]);

  const loadError = role === "admin" ? staffError : adminsError;

  const handleCreate = () => {
    setError("");

    // A thread needs both ends. The service fills in the sender's own id, so the
    // check is only about the participant this user has to choose.
    if (role === "admin" && !staffId) {
      setError("Choose a staff member to message.");
      return;
    }

    if (role === "staff" && !adminId) {
      setError("Choose an administrator to message.");
      return;
    }

    onCreated({
      ...(role === "admin" ? { staffId } : { adminId }),
      // Sent as null, never omitted: issue_id NULL is what makes a thread general.
      issueId: issueId || null,
    });

    setStaffId("");
    setAdminId("");
    setIssueId("");
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            {role === "admin"
              ? "Start a thread with a staff member."
              : "Start a thread with an administrator."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not start the thread</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loadError ? (
          <p className="text-sm text-destructive">{loadError.message}</p>
        ) : (
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="thread-participant">
                {role === "admin" ? "Staff member" : "Administrator"}
              </FieldLabel>
              <Input
                id="thread-participant"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by name or email"
              />
            </Field>

            {matches.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No one to message</EmptyTitle>
                  <EmptyDescription>
                    {needle
                      ? "No match for that filter."
                      : "The other role has no accounts yet."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {matches.map((row) => {
                  const value = row.id;
                  const checked = (role === "admin" ? staffId : adminId) === value;

                  return (
                    <li key={value}>
                      <button
                        type="button"
                        onClick={() =>
                          role === "admin" ? setStaffId(value) : setAdminId(value)
                        }
                        aria-pressed={checked}
                        className={cn(
                          "w-full rounded-xl border p-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                          checked && "border-primary bg-primary/5",
                        )}
                      >
                        <span className="block font-medium">{row.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.email}
                          {row.department_name ? ` · ${row.department_name}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <Field>
              <FieldLabel htmlFor="thread-issue">About an issue</FieldLabel>
              <NativeSelect
                id="thread-issue"
                value={issueId}
                onChange={(event) => setIssueId(event.target.value)}
                className="w-full"
              >
                <NativeSelectOption value="">
                  General thread
                </NativeSelectOption>
                {(issues ?? []).map((issue) => (
                  <NativeSelectOption key={issue.id} value={issue.id}>
                    {issue.title} · {formatRelative(issue.created_at)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Each issue is a separate conversation with the same person.
              </FieldDescription>
            </Field>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" className="sm:flex-1" onClick={handleCreate}>
            Start conversation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewThreadDialog;
