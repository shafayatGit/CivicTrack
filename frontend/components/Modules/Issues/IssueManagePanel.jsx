"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, ShieldCheck, UserCheck, UserX } from "lucide-react";

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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import IssueStatusBadge from "@/components/Modules/Issues/IssueStatusBadge";
import { useResource } from "@/hooks/use-resource";
import { getOwnStaffProfile, listAvailableStaff, updateIssue } from "@/lib/api";
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

// Status and assignment are separate cards because they have different audiences:
// a staff member sees the first, an admin sees both.
const IssueManagePanel = ({ issue, onUpdated }) => {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-4">
      <StatusPanel issue={issue} onUpdated={onUpdated} />
      {isAdmin && <AssignmentPanel issue={issue} onUpdated={onUpdated} />}
    </div>
  );
};

export default IssueManagePanel;
