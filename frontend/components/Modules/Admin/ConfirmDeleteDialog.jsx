"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Deletion is destructive and often blocked by a foreign key, so the confirm copy
// takes the record's name and the caller supplies the failure text — a 409 from the
// API is expected often enough (a department with staff, a ward with issues) that a
// bare "failed" would be useless.
const ConfirmDeleteDialog = ({
  open,
  onOpenChange,
  title = "Delete record",
  description,
  recordName,
  confirmLabel = "Delete",
  onConfirm,
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setPending(true);
    setError("");

    try {
      await onConfirm();
    } catch (deleteError) {
      setError(deleteError.message ?? "Could not delete this record.");
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError("");
          setPending(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex flex-col gap-1.5">
            <span>{description}</span>
            {recordName && (
              <Badge variant="secondary" className="w-fit">
                {recordName}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "Deleting..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmDeleteDialog;
