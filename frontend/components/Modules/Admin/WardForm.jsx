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
  wardNumber: "",
  minLatitude: "",
  maxLatitude: "",
  minLongitude: "",
  maxLongitude: "",
};

// The four corners travel together: the backend rejects a partial rectangle, and the
// report form's ward auto-detection silently does nothing for a ward with no box.
const BOUND_FIELDS = [
  { name: "minLatitude", label: "Min latitude", placeholder: "23.7000000" },
  { name: "maxLatitude", label: "Max latitude", placeholder: "23.7900000" },
  { name: "minLongitude", label: "Min longitude", placeholder: "90.3500000" },
  { name: "maxLongitude", label: "Max longitude", placeholder: "90.4300000" },
];

// DECIMAL columns come back from the API as strings ("23.7200000"). An absent bound
// is null, which has to become an empty input rather than the text "null".
const boundInputValue = (ward, key) => {
  const value = ward?.[key];
  return value === null || value === undefined ? "" : String(value);
};

const validateBounds = (form) => {
  const errors = {};
  const filled = BOUND_FIELDS.filter(
    (field) => form[field.name].trim() !== "",
  );

  if (filled.length === 0) {
    return errors;
  }

  if (filled.length !== BOUND_FIELDS.length) {
    errors[BOUND_FIELDS[BOUND_FIELDS.length - 1].name] =
      "Give all four bounds or none of them.";
    return errors;
  }

  const values = Object.fromEntries(
    BOUND_FIELDS.map((field) => [field.name, Number(form[field.name])]),
  );

  for (const field of BOUND_FIELDS) {
    const limit = field.name.includes("Latitude") ? 90 : 180;
    const value = values[field.name];

    if (!Number.isFinite(value) || Math.abs(value) > limit) {
      errors[field.name] = `Must be a number between -${limit} and ${limit}.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return errors;
  }

  if (values.minLatitude >= values.maxLatitude) {
    errors.minLatitude = "Minimum latitude must be below the maximum.";
  }

  if (values.minLongitude >= values.maxLongitude) {
    errors.minLongitude = "Minimum longitude must be below the maximum.";
  }

  return errors;
};

const WardForm = ({ initialValues, submitLabel, onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    // ward_number is a string in the schema even when the admin types digits, and
    // leading zeros matter, so it is never coerced to a number.
    wardNumber:
      initialValues?.ward_number === null || initialValues?.ward_number === undefined
        ? ""
        : String(initialValues.ward_number),
    minLatitude: boundInputValue(initialValues, "min_latitude"),
    maxLatitude: boundInputValue(initialValues, "max_latitude"),
    minLongitude: boundInputValue(initialValues, "min_longitude"),
    maxLongitude: boundInputValue(initialValues, "max_longitude"),
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
    const wardNumber = form.wardNumber.trim();

    if (name.length < 2) {
      nextErrors.name = "Name must be at least 2 characters.";
    } else if (name.length > 100) {
      nextErrors.name = "Name cannot exceed 100 characters.";
    }

    if (wardNumber.length < 1) {
      nextErrors.wardNumber = "Ward number is required.";
    } else if (wardNumber.length > 20) {
      nextErrors.wardNumber = "Ward number is too long.";
    }

    Object.assign(nextErrors, validateBounds(form));

    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    // An emptied input is sent as null, not "", so the backend's preprocess turns it
    // into a real NULL and the ward stops taking part in auto-detection. Sending ""
    // would work too, but null is the honest representation of "no bound".
    const bounds = Object.fromEntries(
      BOUND_FIELDS.map((field) => [
        field.name,
        form[field.name].trim() === "" ? null : Number(form[field.name]),
      ]),
    );

    setSubmitting(true);
    try {
      await onSubmit({ name, wardNumber, ...bounds });
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
          // 409 for a duplicate ward number, which has no Zod details attached.
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
        <FieldLabel htmlFor="ward-number">Ward number</FieldLabel>
        <FieldContent>
          <Input
            id="ward-number"
            name="wardNumber"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 42"
            value={form.wardNumber}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.wardNumber)}
          />
          {fieldErrors.wardNumber ? (
            <FieldError>{fieldErrors.wardNumber}</FieldError>
          ) : (
            <FieldDescription>
              The stable public identifier. Must be unique.
            </FieldDescription>
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="ward-name">Name</FieldLabel>
        <FieldContent>
          <Input
            id="ward-name"
            name="name"
            type="text"
            placeholder="e.g. Dhanmondi"
            value={form.name}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? (
            <FieldError>{fieldErrors.name}</FieldError>
          ) : (
            <FieldDescription>Display name shown to citizens.</FieldDescription>
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Map area</FieldLabel>
        <FieldContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {BOUND_FIELDS.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <label
                  htmlFor={`ward-${field.name}`}
                  className="text-xs text-muted-foreground"
                >
                  {field.label}
                </label>
                <Input
                  id={`ward-${field.name}`}
                  name={field.name}
                  type="text"
                  inputMode="decimal"
                  placeholder={field.placeholder}
                  value={form[field.name]}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={Boolean(fieldErrors[field.name])}
                />
                {fieldErrors[field.name] && (
                  <FieldError>{fieldErrors[field.name]}</FieldError>
                )}
              </div>
            ))}
          </div>
          <FieldDescription>
            Optional. Give all four corners or leave all four empty. Once set, a
            citizen who drops a pin inside this box gets the ward filled in for them,
            and the report form draws the area on the map.
          </FieldDescription>
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

export default WardForm;
