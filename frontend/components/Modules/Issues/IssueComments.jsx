"use client";

import { useCallback, useState } from "react";
import {
  EyeOff,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

import ConfirmDeleteDialog from "@/components/Modules/Admin/ConfirmDeleteDialog";
import PaginationControls from "@/components/Modules/Admin/PaginationControls";
import HideCommentDialog from "@/components/Modules/Issues/HideCommentDialog";
import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import { useCrudResource } from "@/hooks/use-crud-resource";
import {
  createComment,
  deleteComment,
  hideComment,
  listComments,
  restoreComment,
} from "@/lib/api";
import { ApiRequestError } from "@/lib/api";
import { formatDateTime, formatNumber, initials } from "@/lib/format";
import { allowsParticipation } from "@/lib/participation";

const PAGE_SIZE = 20;

// An official reply is labelled from the ACCOUNT's role, which the server derives from
// the token. It is never taken from anything the commenter supplied, so an anonymous
// visitor cannot type their way into an "Official" badge.
const ROLE_BADGE = {
  staff: "City staff",
  admin: "Administrator",
};

const CommentRow = ({ comment, isAdmin, onHide, onRestore, onDelete }) => {
  if (comment.is_hidden) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-dashed p-3">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            Hidden by a moderator
            {comment.hidden_by_name ? ` (${comment.hidden_by_name})` : ""}
            {comment.hidden_at ? ` on ${formatDateTime(comment.hidden_at)}` : ""}.
          </p>
          {comment.hidden_reason && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reason: {comment.hidden_reason}
            </p>
          )}
          {isAdmin && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={onRestore}>
              <RotateCcw />
              Restore
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {initials(comment.author_name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{comment.author_name}</span>

          {ROLE_BADGE[comment.author_role] && (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3" />
              {ROLE_BADGE[comment.author_role]}
            </Badge>
          )}

          {!comment.is_author_registered && (
            <span className="text-xs text-muted-foreground">Guest</span>
          )}

          <span className="text-xs text-muted-foreground">
            {formatDateTime(comment.created_at)}
          </span>
        </div>

        <p className="mt-1 text-sm whitespace-pre-line text-foreground">
          {comment.comment_text}
        </p>

        {isAdmin && (
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant="ghost" onClick={onHide}>
              <EyeOff />
              Hide
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 />
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const IssueComments = ({ issueId }) => {
  const { session, hydrated, isAdmin } = useAuth();
  const canPost = allowsParticipation(session?.role);
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hiding, setHiding] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Hidden comments are only ever fetched for an admin, and the load waits for
  // `hydrated`: a signed-out visitor's first render has no session yet, and asking for
  // them then would 403 instead of simply returning the public thread.
  const load = useCallback(
    () =>
      listComments(issueId, {
        page,
        limit: PAGE_SIZE,
        ...(isAdmin ? { includeHidden: "true" } : {}),
      }),
    [issueId, isAdmin, page],
  );

  const { data, error, loading, reload } = useCrudResource(
    `comments:${issueId}:${page}:${isAdmin ? "admin" : "public"}`,
    load,
    { enabled: hydrated },
  );

  const comments = data?.data ?? [];
  const pagination = data?.pagination;

  const restore = async (comment) => {
    try {
      await restoreComment(comment.id);
      toast.add({ type: "success", title: "Comment restored" });
      reload();
    } catch (restoreError) {
      toast.add({
        type: "error",
        title: restoreError.message ?? "Could not restore this comment",
      });
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    if (text.trim().length === 0) {
      setFieldError("Write something first");
      return;
    }

    setFieldError("");
    setSubmitting(true);

    try {
      // authorName is only sent when signed out. The server ignores it entirely for a
      // signed-in user and always stores the account name.
      await createComment(issueId, {
        commentText: text.trim(),
        ...(session ? {} : { authorName: name.trim() || undefined }),
      });

      setText("");
      if (!session) {
        setName("");
      }

      // Back to the first page: the thread is oldest-first, so a new comment would
      // otherwise land on a later page and look like it vanished.
      setPage(1);
      reload();
      toast.add({ type: "success", title: "Comment posted" });
    } catch (submitError) {
      if (submitError instanceof ApiRequestError && submitError.status === 429) {
        toast.add({ type: "warning", title: submitError.message });
      } else if (
        submitError instanceof ApiRequestError &&
        Array.isArray(submitError.response?.details)
      ) {
        // Map the Zod issue array onto this form's single field, the same way the other
        // forms in the app do.
        setFieldError(
          submitError.response.details[0]?.message ?? "Could not post this comment",
        );
      } else {
        setFieldError(submitError.message ?? "Could not post this comment");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">
          Discussion
          {pagination?.total > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {formatNumber(pagination.total)}{" "}
              {pagination.total === 1 ? "comment" : "comments"}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Anyone can add context. Sign in to post under your name.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/*
          Staff and administrators read the thread and moderate it, but cannot add to it:
          the discussion is resident sentiment, and an official comment would read as a
          neighbour's corroboration. The server refuses the write with a 403 — this only
          keeps the form from being offered at all.

          `hydrated` gates it because the decision needs the session, which is null during
          SSR. Rendering the form and hiding it a frame later is both a hydration
          mismatch and a flicker.
        */}
        {hydrated && !canPost ? (
          <p className="rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
            Staff and administrator accounts cannot comment on reports, so the discussion
            stays a record of what residents reported. You can still hide or delete
            comments below as a moderator.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
          <Field data-invalid={Boolean(fieldError)}>
            <FieldLabel htmlFor="comment-text">Add a comment</FieldLabel>
            <FieldContent>
              <Textarea
                id="comment-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Has anyone else seen this? Is it still blocked?"
                rows={3}
                maxLength={2000}
                aria-invalid={Boolean(fieldError)}
              />

              {hydrated && !session && (
                <>
                  <FieldLabel htmlFor="comment-name" className="mt-2">
                    Your name (optional)
                  </FieldLabel>
                  <Input
                    id="comment-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    placeholder="Anonymous"
                  />
                  <FieldDescription>
                    Shown next to your comment. Leave it blank to post as
                    &ldquo;Anonymous&rdquo;.
                  </FieldDescription>
                </>
              )}

              {fieldError && <FieldError>{fieldError}</FieldError>}
            </FieldContent>
          </Field>

          <Button type="submit" disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            {submitting ? "Posting..." : "Post comment"}
          </Button>
          </form>
        )}

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
            <MessageSquare className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No comments yet. Be the first to add something.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                isAdmin={isAdmin}
                onHide={() => setHiding(comment)}
                onRestore={() => restore(comment)}
                onDelete={() => setDeleting(comment)}
              />
            ))}
          </div>
        )}

        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </CardContent>

      <HideCommentDialog
        open={Boolean(hiding)}
        onOpenChange={(open) => !open && setHiding(null)}
        comment={hiding}
        onConfirm={async (reason) => {
          await hideComment(hiding.id, { reason });
          setHiding(null);
          toast.add({ type: "success", title: "Comment hidden" });
          reload();
        }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this comment"
        description="Unlike hiding, this removes the comment permanently and cannot be undone."
        recordName={deleting?.comment_text?.slice(0, 60)}
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          await deleteComment(deleting.id);
          setDeleting(null);
          toast.add({ type: "success", title: "Comment deleted" });
          reload();
        }}
      />
    </Card>
  );
};

export default IssueComments;
