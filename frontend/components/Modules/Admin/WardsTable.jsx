"use client";

import { useCallback, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";

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
import PaginationControls from "@/components/Modules/Admin/PaginationControls";
import WardForm from "@/components/Modules/Admin/WardForm";
import { useCrudResource } from "@/hooks/use-crud-resource";
import { createWard, deleteWard, listWards, updateWard } from "@/lib/api";
import { formatNumber } from "@/lib/format";

const PAGE_SIZE = 20;

const WardsTable = () => {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(
    () => listWards({ page, limit: PAGE_SIZE }),
    [page],
  );
  const { data, error, loading, reload } = useCrudResource(
    `admin-wards:${page}`,
    load,
  );

  const wards = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;

  const handleCreate = async (payload) => {
    await createWard(payload);
    setCreating(false);
    setPage(1);
    reload();
    toast.add({ type: "success", title: "Ward created" });
  };

  const handleUpdate = async (payload) => {
    await updateWard(editing.id, payload);
    setEditing(null);
    reload();
    toast.add({ type: "success", title: "Ward updated" });
  };

  const handleDelete = async () => {
    await deleteWard(deleting.id);
    setDeleting(null);
    reload();
    toast.add({ type: "success", title: "Ward deleted" });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Wards"
        description="The administrative areas citizens report issues against, and the unit of the duplicate-report scan."
        actions={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus />
            New ward
          </Button>
        }
      />

      <CollectionState
        loading={loading}
        error={error?.message}
        isEmpty={wards.length === 0}
        skeleton={<TableSkeleton rows={5} />}
        emptyTitle="No wards yet"
        emptyDescription="Create the wards your city is divided into so reports can be located."
        emptyIcon={MapPin}
        emptyAction={<Button onClick={() => setCreating(true)}>New ward</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Map area</TableHead>
                  <TableHead className="text-center">Issues</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wards.map((ward) => (
                  <TableRow key={ward.id}>
                    <TableCell className="font-medium tabular-nums">
                      {ward.ward_number}
                    </TableCell>
                    <TableCell>{ward.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ward.min_latitude === null ||
                      ward.min_latitude === undefined ? (
                        <span className="italic">Not mapped</span>
                      ) : (
                        <span className="font-mono tabular-nums">
                          {Number(ward.min_latitude).toFixed(4)},{" "}
                          {Number(ward.min_longitude).toFixed(4)}
                          {" → "}
                          {Number(ward.max_latitude).toFixed(4)},{" "}
                          {Number(ward.max_longitude).toFixed(4)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {formatNumber(ward.issue_count)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(ward)}
                          aria-label={`Edit ward ${ward.ward_number}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(ward)}
                          aria-label={`Delete ward ${ward.ward_number}`}
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
              <DialogTitle>New ward</DialogTitle>
              <DialogDescription>
                The ward number is the public identifier and cannot be reused by
                another ward.
              </DialogDescription>
            </DialogHeader>
            <WardForm
              submitLabel="Create ward"
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
              <DialogTitle>Edit ward</DialogTitle>
              <DialogDescription>
                Changing the ward number changes what citizens see on the report
                form.
              </DialogDescription>
            </DialogHeader>
            <WardForm
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
        title="Delete ward"
        description="A ward cannot be deleted while it has reported issues. Move or resolve them first."
        recordName={`Ward ${deleting?.ward_number} — ${deleting?.name}`}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default WardsTable;
