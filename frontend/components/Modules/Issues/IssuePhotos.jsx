"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import ConfirmDeleteDialog from "@/components/Modules/Admin/ConfirmDeleteDialog";
import { useResource } from "@/hooks/use-resource";
import {
  addIssuePhotoByUrl,
  deleteIssuePhoto,
  listIssuePhotos,
  uploadIssuePhoto,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";

// Mirrors the limits in backend/src/middleware/upload.js so an oversized or
// unsupported file is refused here instead of after the upload round trip.
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const AddPhotoDialog = ({ issueId, onAdded }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setPhotoUrl("");
    setError("");
    setPending(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const validateFile = (candidate) => {
    if (!candidate) {
      return "Choose a photo to upload.";
    }

    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      return "Only JPEG, PNG, WebP and GIF images are accepted.";
    }

    if (candidate.size > MAX_BYTES) {
      return "Photos must be 5 MB or smaller.";
    }

    return "";
  };

  const handleSubmit = async () => {
    setError("");

    if (mode === "url") {
      if (!/^https?:\/\/\S+$/i.test(photoUrl.trim())) {
        setError("Enter a valid image URL starting with http:// or https://.");
        return;
      }
    } else {
      const fileError = validateFile(file);
      if (fileError) {
        setError(fileError);
        return;
      }
    }

    setPending(true);

    try {
      if (mode === "url") {
        await addIssuePhotoByUrl({ issueId, photoUrl: photoUrl.trim() });
      } else {
        await uploadIssuePhoto({ issueId, file });
      }

      toast.add({ type: "success", title: "Photo added to the issue" });
      setOpen(false);
      reset();
      onAdded();
    } catch (uploadError) {
      setError(uploadError.message ?? "Could not add the photo.");
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : (setOpen(false), reset()))}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5" />
        }
      >
        <ImagePlus />
        Add photo
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add evidence photo</DialogTitle>
          <DialogDescription>
            Upload a file through Cloudinary, or attach an image that is already
            hosted somewhere.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            variant={mode === "file" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("file")}
          >
            Upload file
          </Button>
          <Button
            variant={mode === "url" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("url")}
          >
            Paste URL
          </Button>
        </div>

        {mode === "file" ? (
          <Field>
            <FieldLabel htmlFor="photo-file">Photo</FieldLabel>
            <FieldContent>
              <Input
                id="photo-file"
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WebP or GIF, up to 5 MB.
              </p>
              {error && <FieldError>{error}</FieldError>}
            </FieldContent>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="photo-url">Image URL</FieldLabel>
            <FieldContent>
              <Textarea
                id="photo-url"
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                placeholder="https://example.com/photo.jpg"
                disabled={pending}
                rows={3}
              />
              {error && <FieldError>{error}</FieldError>}
            </FieldContent>
          </Field>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            {pending ? "Adding..." : "Add photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// canAdd and canDelete are deliberately separate props rather than one canManage
// flag. They are not the same permission: the reporting citizen may attach evidence
// while the issue is still "Reported" (backend/src/middleware/issuePhotoAccess.js),
// but removing evidence is admin-only. One flag would either hide the delete button
// from admins or offer it to an owner who would only get a 403.
const IssuePhotos = ({ issueId, canAdd = false, canDelete = false }) => {
  const [deleting, setDeleting] = useState(null);
  // Bumped by a write so the list refetches without a separate refresh path.
  const [revision, setRevision] = useState(0);

  const load = useCallback(() => listIssuePhotos(issueId), [issueId]);
  const { data, error, loading } = useResource(`photos:${issueId}:${revision}`, load);

  const photos = data?.data ?? [];
  const reload = () => setRevision((current) => current + 1);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">
          Photos
          {photos.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {photos.length}
            </Badge>
          )}
        </h2>
        {canAdd && <AddPhotoDialog issueId={issueId} onAdded={reload} />}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="aspect-4/3 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No photos attached to this issue yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="group relative aspect-4/3 overflow-hidden rounded-2xl border bg-muted"
            >
              <Image
                src={photo.photo_url}
                alt={`Evidence photo uploaded ${formatDateTime(photo.uploaded_at)}`}
                fill
                sizes="(max-width: 640px) 50vw, 200px"
                className="object-cover"
                // issue_photos.photo_url is provider-agnostic (migration 009) and
                // the by-URL endpoint accepts any host, so the optimiser's host
                // allowlist cannot cover every row. These are small thumbnails.
                unoptimized
              />
              {canDelete && (
                <Button
                  variant="destructive"
                  size="icon-sm"
                  aria-label="Delete photo"
                  className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => setDeleting(photo)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete photo"
        description="The image will be removed from the issue and from Cloudinary storage."
        recordName={deleting?.photo_url}
        confirmLabel="Delete photo"
        onConfirm={async () => {
          await deleteIssuePhoto(deleting.id);
          setDeleting(null);
          reload();
        }}
      />
    </section>
  );
};

export default IssuePhotos;
