"use client";

import { useCallback, useMemo, useState } from "react";
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
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import { useResource } from "@/hooks/use-resource";
import { listDepartments } from "@/lib/api";
import { ApiRequestError } from "@/lib/api";

// Stable identity while the request is in flight; a fresh [] per render would
// invalidate the lookup memo on every keystroke.
const EMPTY_LIST = [];

const initialFieldErrors = {
  name: "",
  description: "",
  defaultDepartmentId: "",
};

const CategoryForm = ({ initialValues, submitLabel, onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    description: initialValues?.description ?? "",
    // A stored null means "no routing", which is not the same as "not chosen yet",
    // so the empty option is explicit rather than inferred from a falsy value.
    defaultDepartmentId:
      initialValues?.default_department_id === null ||
      initialValues?.default_department_id === undefined
        ? ""
        : initialValues.default_department_id,
  });
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // A bad department list only means the routing picker is unavailable, so the
  // failure is not shown: the name and description are still editable.
  const loadDepartments = useCallback(async () => {
    const response = await listDepartments({ limit: 100 });
    return response.data ?? EMPTY_LIST;
  }, []);
  const { data } = useResource("category-department-options", loadDepartments);
  const departments = useMemo(() => data ?? EMPTY_LIST, [data]);

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
    // The API requires it on update and rejects an empty string on create, so the
    // check mirrors the server rather than being stricter or laxer.
    if (form.description.trim().length < 1) {
      nextErrors.description = "Description is required.";
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
        // Empty string means "no routing hook" and is sent as null, not omitted:
        // updateCategory writes the column directly, so omitting it would be
        // ambiguous but sending null genuinely clears an existing route.
        defaultDepartmentId: form.defaultDepartmentId || null,
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
          // A 409 from the service (duplicate name) has no Zod details, so the
          // message is the only useful thing to show.
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
            placeholder="What kind of issue belongs in this category"
            value={form.description}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.description)}
          />
          {fieldErrors.description ? (
            <FieldError>{fieldErrors.description}</FieldError>
          ) : (
            <FieldDescription>
              Shown to citizens on the report form.
            </FieldDescription>
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="category-department">Default department</FieldLabel>
        <FieldContent>
          <NativeSelect
            id="category-department"
            name="defaultDepartmentId"
            value={form.defaultDepartmentId}
            onChange={handleChange}
            disabled={submitting}
            className="w-full"
          >
            <NativeSelectOption value="">
              No automatic routing
            </NativeSelectOption>
            {departments.map((department) => (
              <NativeSelectOption key={department.id} value={department.id}>
                {department.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            Issues reported under this category are routed to this department
            automatically. Leave unset to route them manually.
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

export default CategoryForm;
