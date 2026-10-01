"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_REASON = 255;

// Hiding is reversible, unlike deletion, so the dialog asks for a reason instead of a
// confirmation. The reason is stored on the comment and shown on the placeholder, which
// is what makes a later restore (or a complaint about it) answerable — an unexplained
// silent takedown is indistinguishable from censorship.
const HideCommentDialog = ({ open, onOpenChange, comment, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setPending(true);
    setError("");

    try {
      await onConfirm(reason.trim() || undefined);
    } catch (hideError) {
      setError(hideError.message ?? "Could not hide this comment.");
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          setError("");
          setPending(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hide this comment</DialogTitle>
          <DialogDescription>
            It disappears from the public thread and is replaced with a placeholder. It
            is not deleted, and you can restore it at any time.
          </DialogDescription>
        </DialogHeader>

        {/* Preview, so an admin acting on a stale page cannot hide the wrong comment. */}
        {comment && (
          <blockquote className="rounded-2xl border-l-2 bg-muted/50 p-3 text-sm text-muted-foreground">
            {comment.comment_text}
          </blockquote>
        )}

        <Field>
          <FieldLabel htmlFor="hide-reason">
            Reason <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>          <FieldContent>
            <Textarea
              id="hide-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MAX_REASON}
              rows={2}
              placeholder="Abusive or off-topic"
            />
            <FieldDescription>
              {reason.length}/{MAX_REASON}
            </FieldDescription>
          </FieldContent>
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "Hiding..." : "Hide comment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HideCommentDialog;
