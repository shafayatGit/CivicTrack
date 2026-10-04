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

const initialFieldErrors = {
  name: "",
  contactEmail: "",
  resolutionTargetHours: "",
};

// Departments and wards share this shape: a unique display name plus one or two
// optional operational fields, validated client-side to the same rules the Zod
// schema applies server-side.
const DepartmentForm = ({ initialValues, submitLabel, onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    contactEmail: initialValues?.contact_email ?? "",
    // A department with no target is a deliberate "we don't publish an SLA", not an
    // oversight, so this starts blank rather than pre-filled with a default. Only a
    // value the admin actually typed is sent.
    resolutionTargetHours:
      initialValues?.resolution_target_hours != null
        ? String(initialValues.resolution_target_hours)
        : "",
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

    // Same optional contract, but numeric: min(1) mirrors chk_departments_resolution_target
    // in migration 024, and the ceiling keeps a typo from silently setting a 40-year SLA.
    const targetRaw = form.resolutionTargetHours.trim();
    if (targetRaw) {
      const target = Number(targetRaw);
      if (!/^\d+$/.test(targetRaw)) {
        nextErrors.resolutionTargetHours = "Must be a whole number of hours.";
      } else if (target < 1) {
        nextErrors.resolutionTargetHours = "Target must be at least 1 hour.";
      } else if (target > 8760) {
        nextErrors.resolutionTargetHours =
          "Target cannot exceed 8760 hours (one year).";
      }
    }

    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name,
        contactEmail: contactEmail || null,
        // null, not 0 and not "": the backend distinguishes "no target set" (overdue
        // reports NULL) from a real number, and this is how that is expressed.
        resolutionTargetHours: targetRaw ? Number(targetRaw) : null,
      });
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

      <Field>
        <FieldLabel htmlFor="department-target">Resolution target</FieldLabel>
        <FieldContent>
          <Input
            id="department-target"
            name="resolutionTargetHours"
            type="number"
            inputMode="numeric"
            min="1"
            max="8760"
            step="1"
            placeholder="e.g. 72"
            value={form.resolutionTargetHours}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.resolutionTargetHours)}
          />
          {fieldErrors.resolutionTargetHours ? (
            <FieldError>{fieldErrors.resolutionTargetHours}</FieldError>
          ) : (
            <FieldDescription>
              Hours allowed to resolve a report. Leave blank if this department does
              not publish a target — overdue is then reported as unmeasured rather
              than as zero.
            </FieldDescription>
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
