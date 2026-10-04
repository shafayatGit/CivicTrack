"use client";

import { useCallback, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import AdminPageHeader from "@/components/Modules/Admin/AdminPageHeader";
import CollectionState, {
  TableSkeleton,
} from "@/components/Modules/Admin/CollectionState";
import ConfirmDeleteDialog from "@/components/Modules/Admin/ConfirmDeleteDialog";
import PaginationControls from "@/components/Modules/Admin/PaginationControls";
import StaffForm from "@/components/Modules/Admin/StaffForm";
import { useCrudResource } from "@/hooks/use-crud-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  createStaff,
  deleteStaff,
  listDepartments,
  listStaff,
  updateStaff,
} from "@/lib/api";
import { formatNumber, initials } from "@/lib/format";

const PAGE_SIZE = 20;

const StaffTable = () => {
  const [searchInput, setSearchInput] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Debounced so a name search does not fire a request per keystroke. The resource
  // key changes once typing settles, which is the only thing that triggers a fetch.
  const search = useDebouncedValue(searchInput, 300);

  const load = useCallback(
    () =>
      listStaff({
        page,
        limit: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(departmentId ? { departmentId } : {}),
      }),
    [page, search, departmentId],
  );

  const { data, error, loading, reload } = useCrudResource(
    `admin-staff:${page}:${search}:${departmentId}`,
    load,
  );

  const loadDepartments = useCallback(async () => {
    const response = await listDepartments({ limit: 100 });
    return response.data ?? [];
  }, []);
  const { data: departments } = useCrudResource(
    "admin-staff-departments",
    loadDepartments,
  );

  const staff = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;

  // Any filter change invalidates the current page: staying on page 4 of a result set
  // that just shrank to one page would show an empty list with no way back.
  const resetPage = () => setPage(1);

  const handleSearch = (event) => {
    setSearchInput(event.target.value);
    resetPage();
  };

  const handleDepartment = (event) => {
    setDepartmentId(event.target.value);
    resetPage();
  };

  const handleCreate = async (payload) => {
    // The 201 comes back either way: the account is committed before the mail is
    // attempted, so a bounced SMTP send is reported here rather than as a failed
    // request. Retrying the POST would 409 on the now-taken email and strand the
    // account, which is why the two cases are worded differently below.
    const response = await createStaff(payload);
    setCreating(false);
    setPage(1);
    reload();

    if (response.data?.credentialsEmailed === false) {
      toast.add({
        type: "warning",
        title: "Staff account created, but the email did not send",
        description:
          "The account exists and the password is not recoverable — mail it to them yourself, or delete the account and create it again.",
      });
      return;
    }

    toast.add({
      type: "success",
      title: "Staff account created",
      description: "Login details emailed to them. They must change the password after signing in.",
    });
  };

  const handleUpdate = async (payload) => {
    await updateStaff(editing.id, payload);
    setEditing(null);
    reload();
    toast.add({ type: "success", title: "Staff member updated" });
  };

  const handleDelete = async () => {
    await deleteStaff(deleting.id);
    setDeleting(null);
    reload();
    toast.add({ type: "success", title: "Staff account removed" });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Staff"
        description="Officers who can be assigned issues. Creating one also creates the login account, in a single transaction, and emails them their temporary password."
        actions={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus />
            New staff
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          value={searchInput}
          onChange={handleSearch}
          placeholder="Search by name or email"
          aria-label="Search staff"
          className="sm:max-w-xs"
        />
        <NativeSelect
          value={departmentId}
          onChange={handleDepartment}
          aria-label="Filter by department"
          className="sm:max-w-xs"
        >
          <NativeSelectOption value="">All departments</NativeSelectOption>
          {(departments ?? []).map((department) => (
            <NativeSelectOption key={department.id} value={department.id}>
              {department.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <CollectionState
        loading={loading}
        error={error?.message}
        isEmpty={staff.length === 0}
        skeleton={<TableSkeleton rows={5} />}
        emptyTitle={searchInput || departmentId ? "No matching staff" : "No staff yet"}
        emptyDescription={
          searchInput || departmentId
            ? "Try a different name, email or department."
            : "Add an officer so issues can be assigned to someone."
        }
        emptyIcon={Users}
        emptyAction={
          !searchInput && !departmentId ? (
            <Button onClick={() => setCreating(true)}>New staff</Button>
          ) : null
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Department</TableHead>
                  <TableHead className="hidden text-center sm:table-cell">
                    Assigned
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                        >
                          {initials(member.name)}
                        </span>
                        <span className="font-medium">{member.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {member.email}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {member.department_name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums text-muted-foreground sm:table-cell">
                      {formatNumber(member.issue_count)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(member)}
                          aria-label={`Edit ${member.name}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(member)}
                          aria-label={`Remove ${member.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls pagination={pagination} onPageChange={setPage} />
        </div>
      </CollectionState>

      {creating && (
        <Dialog open onOpenChange={(open) => !open && setCreating(false)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>New staff account</DialogTitle>
              <DialogDescription>
                Creates the login and the staff profile together. The password is
                hashed before it is stored.
              </DialogDescription>
            </DialogHeader>
            <StaffForm
              submitLabel="Create staff"
              onCancel={() => setCreating(false)}
              onSubmit={handleCreate}
            />
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Move {editing.name}</DialogTitle>
              <DialogDescription>
                Only the department can be changed here. Moving an officer changes
                which roster they appear in.
              </DialogDescription>
            </DialogHeader>
            <StaffForm
              key={editing.id}
              initialValues={editing}
              submitLabel="Save changes"
              onCancel={() => setEditing(null)}
              onSubmit={handleUpdate}
            />
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove staff account"
        description="The login and staff profile are removed, this officer's message history is deleted, and any issues they were assigned become unassigned."
        recordName={`${deleting?.name} — ${deleting?.email}`}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default StaffTable;
