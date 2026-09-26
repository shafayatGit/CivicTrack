"use client";

import { useCallback, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import DepartmentForm from "@/components/Modules/Admin/DepartmentForm";
import PaginationControls from "@/components/Modules/Admin/PaginationControls";
import { useCrudResource } from "@/hooks/use-crud-resource";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";

const PAGE_SIZE = 20;

const DepartmentsTable = () => {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(
    () => listDepartments({ page, limit: PAGE_SIZE }),
    [page],
  );
  const { data, error, loading, reload } = useCrudResource(
    `admin-departments:${page}`,
    load,
  );

  const departments = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;

  const handleCreate = async (payload) => {
    await createDepartment(payload);
    setCreating(false);
    // A new row changes the ordering, so go back to the first page: staying on
    // page 3 of a list that just gained a row would hide the row just created.
    setPage(1);
    reload();
    toast.add({ type: "success", title: "Department created" });
  };

  const handleUpdate = async (payload) => {
    await updateDepartment(editing.id, payload);
    setEditing(null);
    reload();
    toast.add({ type: "success", title: "Department updated" });
  };

  const handleDelete = async () => {
    await deleteDepartment(deleting.id);
    setDeleting(null);
    reload();
    toast.add({ type: "success", title: "Department deleted" });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Departments"
        description="The units that issues are routed to. Each department has its own staff roster and issue queue."
        actions={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus />
            New department
          </Button>
        }
      />

      <CollectionState
        loading={loading}
        error={error?.message}
        isEmpty={departments.length === 0}
        skeleton={<TableSkeleton rows={5} />}
        emptyTitle="No departments yet"
        emptyDescription="Create a department before assigning staff or routing issues."
        emptyIcon={Building2}
        emptyAction={<Button onClick={() => setCreating(true)}>New department</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead className="text-center">Open</TableHead>
                  <TableHead className="hidden text-center sm:table-cell">
                    Resolved
                  </TableHead>
                  <TableHead className="hidden text-center lg:table-cell">Total</TableHead>
                  <TableHead className="hidden xl:table-cell">Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((department) => (
                  <TableRow key={department.id}>
                    <TableCell className="font-medium">{department.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {department.contact_email ?? "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatNumber(department.open_issues)}
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums text-muted-foreground sm:table-cell">
                      {formatNumber(department.resolved_issues)}
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums text-muted-foreground lg:table-cell">
                      {formatNumber(department.total_issues)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground xl:table-cell">
                      {formatDate(department.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(department)}
                          aria-label={`Edit ${department.name}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(department)}
                          aria-label={`Delete ${department.name}`}
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
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New department</DialogTitle>
              <DialogDescription>
                Departments own a staff roster and receive routed issues.
              </DialogDescription>
            </DialogHeader>
            <DepartmentForm
              submitLabel="Create department"
              onCancel={() => setCreating(false)}
              onSubmit={handleCreate}
            />
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit department</DialogTitle>
              <DialogDescription>
                Renaming a department does not move the issues already routed to it.
              </DialogDescription>
            </DialogHeader>
            <DepartmentForm
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
        title="Delete department"
        description="A department cannot be deleted while it has staff, open issues, or is the default route for a category."
        recordName={deleting?.name}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default DepartmentsTable;
