"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import { ApiRequestError } from "@/lib/api";

const initialFieldErrors = { name: "", description: "" };

const CategoryForm = ({ initialValues, submitLabel, onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    description: initialValues?.description ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");

    const nextErrors = { ...initialFieldErrors };
    if (form.name.trim().length < 2) {
      nextErrors.name = "Name must be at least 2 characters.";
    }

    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim(),
      });
    } catch (error) {
      if (error instanceof ApiRequestError && error.response) {
        const fieldErrorsFromServer = {};
        for (const issue of error.response.details ?? []) {
          const field = issue.path?.[0];
          if (field && issue.message) {
            fieldErrorsFromServer[field] = issue.message;
          }
        }

        if (Object.keys(fieldErrorsFromServer).length > 0) {
          setFieldErrors({
            ...initialFieldErrors,
            ...fieldErrorsFromServer,
          });
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError(
          "Unable to reach the server. Please check your connection and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {serverError && (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel htmlFor="category-name">Name</FieldLabel>
        <FieldContent>
          <Input
            id="category-name"
            name="name"
            type="text"
            placeholder="e.g. Roads and pavements"
            value={form.name}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="category-description">Description</FieldLabel>
        <FieldContent>
          <Textarea
            id="category-description"
            name="description"
            placeholder="Short description of this category"
            value={form.description}
            onChange={handleChange}
            disabled={submitting}
          />
        </FieldContent>
      </Field>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" className="sm:flex-1" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
};

export default CategoryForm;