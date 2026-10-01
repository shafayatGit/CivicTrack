"use client";

import { useCallback, useMemo, useState } from "react";
import { Flag, Loader2, ShieldAlert, ShieldCheck, UserCheck, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import IssueStatusBadge from "@/components/Modules/Issues/IssueStatusBadge";
import { useResource } from "@/hooks/use-resource";
import {
  flagIssueAsInvalid,
  getOwnStaffProfile,
  listAvailableStaff,
  updateIssue,
} from "@/lib/api";
import { nextStatuses } from "@/lib/issue-status";

const StatusPanel = ({ issue, onUpdated }) => {
  const { session } = useAuth();
  const role = session?.role;
  const isAdmin = role === "admin";
  const [pendingStatus, setPendingStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const options = nextStatuses(issue.status);

  const email = session?.email ?? null;

  // The service compares the caller's staff row against issues.assigned_staff_id,
  // which is a staff.id the JWT does not carry, so it is resolved the same way as
  // the "assigned to me" filter.
  const loadOwnStaff = useCallback(() => getOwnStaffProfile(email), [email]);
  const { data: ownStaff } = useResource(
    role === "staff" ? `own-staff:${email}` : null,
    loadOwnStaff,
    { enabled: role === "staff" },
  );

  // Mirrors assertCanModify in issue.service.js: an admin may act on anything, a
  // staff member only on issues assigned to them, and a citizen never.
  const ownStaffId = ownStaff?.id ?? null;
  const canManage = isAdmin || (role === "staff" && issue.assigned_staff_id === ownStaffId && ownStaffId !== null);

  if (!canManage) {
    return null;
  }

  const applyStatus = async (status) => {
    setSaving(true);
    setError("");

    try {
      const response = await updateIssue(issue.id, { status });
      toast.add({
        type: "success",
        title: `Moved to ${response.data.status}`,
      });
      onUpdated(response.data);
    } catch (updateError) {
      setError(updateError.message ?? "Could not update the status.");
    } finally {
      setSaving(false);
      setPendingStatus("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Move this issue on</CardTitle>
        <CardDescription>
          Currently <IssueStatusBadge status={issue.status} className="mx-1" />
          {isAdmin
            ? "As an admin you can set any state the workflow allows."
            : "You can advance the issues assigned to you."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This issue is in a final state — no further transitions are allowed.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "Resolved" ? "default" : "outline"}
                disabled={saving || pendingStatus === status}
                onClick={() => {
                  setPendingStatus(status);
                  void applyStatus(status);
                }}
              >
                {saving && pendingStatus === status ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                {status === "Resolved" ? "Mark resolved" : `Set ${status}`}
              </Button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
};

const AssignmentPanel = ({ issue, onUpdated }) => {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const departmentId = issue.department_id ?? null;

  // An issue with no department has no roster to offer: listAvailableStaff is keyed
  // on departmentId, so there is nothing sensible to ask for.
  const loadRoster = useCallback(
    () => listAvailableStaff(departmentId),
    [departmentId],
  );
  const { data, loading } = useResource(
    departmentId ? `roster:${departmentId}` : null,
    loadRoster,
    { enabled: Boolean(departmentId) },
  );

  const staff = useMemo(() => data?.data ?? [], [data]);

  const assign = async (staffId) => {
    setSaving(true);
    setError("");

    try {
      const response = await updateIssue(issue.id, { assignedStaffId: staffId });
      toast.add({ type: "success", title: "Issue assigned" });
      onUpdated(response.data);
    } catch (updateError) {
      setError(updateError.message ?? "Could not assign this issue.");
    } finally {
      setSaving(false);
      setSelected("");
    }
  };

  const unassign = async () => {
    setSaving(true);
    setError("");

    try {
      const response = await updateIssue(issue.id, { assignedStaffId: null });
      toast.add({ type: "success", title: "Issue unassigned" });
      onUpdated(response.data);
    } catch (updateError) {
      setError(updateError.message ?? "Could not unassign this issue.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Assignment</CardTitle>
        <CardDescription>
          Only staff in{" "}
          <Badge variant="secondary" className="mx-1">
            {issue.department_name ?? "no department"}
          </Badge>{" "}
          can take this issue, because department performance is reported per
          department.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {issue.assigned_staff_id ? (
            <>
              <UserCheck className="size-4 text-primary" />
              <span className="font-medium">{issue.assignee_name ?? "Assigned"}</span>
            </>
          ) : (
            <>
              <UserX className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Unassigned</span>
            </>
          )}
        </div>

        {loading ? (
          <Skeleton className="h-8 w-full" />
        ) : !issue.department_id ? (
          <p className="text-sm text-muted-foreground">
            This issue has no department, so it cannot be routed to staff. Set a
            default department on its category.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <NativeSelect
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              aria-label="Choose a staff member"
              className="w-full"
              disabled={saving}
            >
              <NativeSelectOption value="">Select a staff member…</NativeSelectOption>
              {staff.map((member) => (
                <NativeSelectOption key={member.id} value={member.id}>
                  {member.name} · {member.issue_count} open
                </NativeSelectOption>
              ))}
            </NativeSelect>

            <Button
              disabled={!selected || saving}
              onClick={() => assign(selected)}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Assign
            </Button>

            {issue.assigned_staff_id && (
              <Button
                variant="outline"
                disabled={saving}
                onClick={unassign}
                className="gap-1.5"
              >
                <UserX />
                Unassign
              </Button>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
};

// Only the officer the issue is assigned to can file this flag, and the service
// refuses it once the issue is resolved or already flagged — so the button is hidden
// in exactly those states rather than shown and failing on submit.
const FalseReportPanel = ({ issue, onUpdated }) => {
  const { session } = useAuth();
  const email = session?.email ?? null;

  const loadOwnStaff = useCallback(() => getOwnStaffProfile(email), [email]);
  const { data: ownStaff } = useResource(
    session?.role === "staff" ? `own-staff:${email}` : null,
    loadOwnStaff,
    { enabled: session?.role === "staff" },
  );

  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isInvalid = issue.is_invalid === 1 || issue.is_invalid === true;
  const isAssignedToMe =
    ownStaff?.id != null && issue.assigned_staff_id === ownStaff.id;

  if (session?.role !== "staff" || !isAssignedToMe) {
    return null;
  }

  const flag = async () => {
    if (reason.trim().length < 10) {
      setFieldError("Describe what you found, in at least 10 characters.");
      return;
    }

    setFieldError("");
    setError("");
    setSaving(true);

    try {
      const response = await flagIssueAsInvalid(issue.id, {
        reason: reason.trim(),
      });
      toast.add({
        type: "success",
        title: "Sent to an admin for review",
        description: "The report stays in the queue until they decide.",
      });
      onUpdated(response.data);
    } catch (flagError) {
      setError(flagError.message ?? "Could not send this report for review.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">
          This report is not real
        </CardTitle>
        <CardDescription>
          Flag it for an admin to review. You are not deciding it yourself — they can
          uphold the flag, which deactivates the citizen who filed it, or dismiss it
          and put the report back to work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isInvalid ? (
          <div className="space-y-2">
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="size-3" />
              Flagged as false — awaiting an admin
            </Badge>
            <p className="text-sm text-muted-foreground">
              Your reason: {issue.invalid_reason}
            </p>
          </div>
        ) : issue.status === "Resolved" ? (
          <p className="text-sm text-muted-foreground">
            This issue is resolved, so it can no longer be flagged.
          </p>
        ) : (
          <Field data-invalid={Boolean(fieldError)}>
            <FieldLabel htmlFor="invalid-reason">Why is it not real?</FieldLabel>
            <FieldContent>
              <Textarea
                id="invalid-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="The road outside 14 Mirpur is intact — the photos are from a different street."
                rows={3}
                aria-invalid={Boolean(fieldError)}
              />
              <FieldDescription>
                An admin reads this before acting, so specifics help.
              </FieldDescription>
              {fieldError && <FieldError>{fieldError}</FieldError>}
            </FieldContent>
          </Field>
        )}

        {!isInvalid && issue.status !== "Resolved" && (
          <Button
            variant="outline"
            onClick={flag}
            disabled={saving}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="animate-spin" /> : <Flag />}
            {saving ? "Sending..." : "Flag as a false report"}
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
};

// Status and assignment are separate cards because they have different audiences:
// a staff member sees the first, an admin sees both.
const IssueManagePanel = ({ issue, onUpdated }) => {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-4">
      <StatusPanel issue={issue} onUpdated={onUpdated} />
      {isAdmin && <AssignmentPanel issue={issue} onUpdated={onUpdated} />}
      <FalseReportPanel issue={issue} onUpdated={onUpdated} />
    </div>
  );
};

export default IssueManagePanel;
