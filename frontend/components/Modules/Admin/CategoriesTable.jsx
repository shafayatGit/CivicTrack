"use client";

import { useCallback, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import LinkButton from "@/components/Modules/Common/LinkButton";
import AdminPageHeader from "@/components/Modules/Admin/AdminPageHeader";
import CollectionState from "@/components/Modules/Admin/CollectionState";
import ConfirmDeleteDialog from "@/components/Modules/Admin/ConfirmDeleteDialog";
import CategoryForm from "@/components/Modules/Admin/CategoryForm";
import { useCrudResource } from "@/hooks/use-crud-resource";
import {
  deleteCategory,
  listCategories,
  listDepartments,
  updateCategory,
} from "@/lib/api";
import { formatDate } from "@/lib/format";

const loadCategories = async () => listCategories();

const CategoriesTable = () => {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const { data, error, loading, reload } = useCrudResource(
    "admin-categories",
    loadCategories,
  );

  // Only used to label default_department_id; a failure here leaves the id unlabelled
  // rather than blocking the category list.
  const loadNames = useCallback(async () => {
    const response = await listDepartments({ limit: 100 });
    return response.data ?? [];
  }, []);
  const { data: departments } = useCrudResource(
    "admin-category-departments",
    loadNames,
  );

  const categories = useMemo(() => data?.data ?? [], [data]);
  const departmentNames = useMemo(() => {
    const lookup = new Map();
    for (const department of departments ?? []) {
      lookup.set(department.id, department.name);
    }
    return lookup;
  }, [departments]);

  const handleUpdate = async (payload) => {
    await updateCategory(editing.id, payload);
    setEditing(null);
    reload();
    toast.add({ type: "success", title: "Category updated" });
  };

  const handleDelete = async () => {
    await deleteCategory(deleting.id);
    setDeleting(null);
    reload();
    toast.add({ type: "success", title: "Category deleted" });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Categories"
        description="The issue categories citizens pick from when reporting, and the default department each one routes to."
        actions={
          <LinkButton href="/admin/categories/create" className="gap-1.5">
            <Plus />
            New category
          </LinkButton>
        }
      />

      <CollectionState
        loading={loading}
        error={error?.message}
        isEmpty={categories.length === 0}
        emptyTitle="No categories yet"
        emptyDescription="Create the first category so citizens can classify their reports."
        emptyAction={
          <LinkButton href="/admin/categories/create">New category</LinkButton>
        }
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden md:table-cell">Routes to</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {category.description ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {category.default_department_id ? (
                      <Badge variant="secondary">
                        {departmentNames.get(category.default_department_id) ??
                          "Unknown department"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Manual</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                    {formatDate(category.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(category)}
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(category)}
                        aria-label={`Delete ${category.name}`}
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
      </CollectionState>

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit category</DialogTitle>
            </DialogHeader>
            <CategoryForm
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
        title="Delete category"
        description="A category cannot be deleted while issues are filed under it. Reassign those issues first."
        recordName={deleting?.name}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default CategoriesTable;
