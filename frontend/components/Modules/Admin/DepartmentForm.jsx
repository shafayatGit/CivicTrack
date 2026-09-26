"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import { ApiRequestError } from "@/lib/api";

const initialFieldErrors = { name: "", contactEmail: "" };

// Departments and wards share this shape: a unique display name plus one or two
// optional operational fields, validated client-side to the same rules the Zod
// schema applies server-side.
const DepartmentForm = ({ initialValues, submitLabel, onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    contactEmail: initialValues?.contact_email ?? "",
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
    const name = form.name.trim();
    const contactEmail = form.contactEmail.trim();

    if (name.length < 2) {
      nextErrors.name = "Name must be at least 2 characters.";
    } else if (name.length > 100) {
      nextErrors.name = "Name cannot exceed 100 characters.";
    }

    // Optional field, so an empty string is valid and sent as null. Only validated
    // when present, because the schema is nullish rather than an empty-string union.
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      nextErrors.contactEmail = "Must be a valid email.";
    }

    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name, contactEmail: contactEmail || null });
    } catch (error) {
      if (error instanceof ApiRequestError && error.response) {
        const fromServer = {};
        for (const issue of error.response.details ?? []) {
          const field = issue.path?.[0];
          if (field && issue.message) {
            fromServer[field] = issue.message;
          }
        }

        if (Object.keys(fromServer).length > 0) {
          setFieldErrors({ ...initialFieldErrors, ...fromServer });
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
        <FieldLabel htmlFor="department-name">Name</FieldLabel>
        <FieldContent>
          <Input
            id="department-name"
            name="name"
            type="text"
            placeholder="e.g. Roads and Infrastructure"
            value={form.name}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? (
            <FieldError>{fieldErrors.name}</FieldError>
          ) : (
            <FieldDescription>
              Issues routed to this department appear in its queue.
            </FieldDescription>
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="department-contact">Contact email</FieldLabel>
        <FieldContent>
          <Input
            id="department-contact"
            name="contactEmail"
            type="email"
            placeholder="wpd@example.gov"
            value={form.contactEmail}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.contactEmail)}
          />
          {fieldErrors.contactEmail ? (
            <FieldError>{fieldErrors.contactEmail}</FieldError>
          ) : (
            <FieldDescription>Optional. Where the public is directed.</FieldDescription>
          )}
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

export default DepartmentForm;
