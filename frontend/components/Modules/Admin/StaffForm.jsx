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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import { useResource } from "@/hooks/use-resource";
import { ApiRequestError, listDepartments } from "@/lib/api";

const EMPTY_LIST = [];

const initialFieldErrors = {
  name: "",
  email: "",
  password: "",
  departmentId: "",
  phone: "",
  nid: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{6,20}$/;
// Same three lengths registration accepts (10, 13, 17). The backend made nid required
// on this payload, so the form has to enforce the identical rule rather than the
// looser "4 to 20 digits" it used to, or an admin fills in a value that only fails
// after a round trip.
const NID_PATTERN = /^(?:\d{10}|\d{13}|\d{17})$/;
const NID_MESSAGE = "Enter a valid National ID (10, 13, or 17 digits).";

/**
 * Admin-driven staff onboarding.
 *
 * The service creates the users row and the staff profile in one transaction, so
 * this form never has to reason about two calls. Password is only in the create
 * payload: the update schema accepts departmentId and preferences only, so an edit
 * dialog must not offer a password field at all.
 */
const StaffForm = ({ initialValues, submitLabel, onSubmit, onCancel }) => {
  const isEdit = Boolean(initialValues);

  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    email: initialValues?.email ?? "",
    password: "",
    departmentId: initialValues?.department_id ?? "",
    phone: initialValues?.phone ?? "",
    nid: initialValues?.nid ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadDepartments = useCallback(async () => {
    const response = await listDepartments({ limit: 100 });
    return response.data ?? EMPTY_LIST;
  }, []);
  const { data } = useResource("staff-department-options", loadDepartments);
  const departments = useMemo(() => data ?? EMPTY_LIST, [data]);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");

    const nextErrors = { ...initialFieldErrors };
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    const phone = form.phone.trim();
    const nid = form.nid.trim();

    if (name.length < 2) {
      nextErrors.name = "Name must be at least 2 characters.";
    } else if (name.length > 100) {
      nextErrors.name = "Name cannot exceed 100 characters.";
    }

    if (!EMAIL_PATTERN.test(email)) {
      nextErrors.email = "Must be a valid email.";
    }

    // Not offered on edit, so the password rules only apply when creating.
    if (!isEdit) {
      if (password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters.";
      } else if (password.length > 72) {
        nextErrors.password = "Password cannot exceed 72 characters.";
      }
    }

    if (!form.departmentId) {
      nextErrors.departmentId = "A department is required.";
    }

    if (phone && !PHONE_PATTERN.test(phone)) {
      nextErrors.phone = "Must be a valid phone number.";
    }

    // Required when creating, because users.nid is NOT NULL. Not offered on edit —
    // the update schema accepts departmentId and preferences only.
    if (!isEdit) {
      if (!nid) {
        nextErrors.nid = "National ID is required.";
      } else if (!NID_PATTERN.test(nid)) {
        nextErrors.nid = NID_MESSAGE;
      }
    }

    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await onSubmit({ departmentId: form.departmentId });
        return;
      }

      await onSubmit({
        name,
        email,
        password,
        departmentId: form.departmentId,
        phone: phone || null,
        nid,
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
          // 409 for an email already in users, which has no Zod details.
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
        <FieldLabel htmlFor="staff-name">Full name</FieldLabel>
        <FieldContent>
          <Input
            id="staff-name"
            name="name"
            type="text"
            placeholder="e.g. Ayesha Rahman"
            value={form.name}
            onChange={handleChange}
            disabled={submitting || isEdit}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? (
            <FieldError>{fieldErrors.name}</FieldError>
          ) : (
            isEdit && <FieldDescription>The account name cannot be changed.</FieldDescription>
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="staff-email">Email</FieldLabel>
        <FieldContent>
          <Input
            id="staff-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="name@example.gov"
            value={form.email}
            onChange={handleChange}
            disabled={submitting || isEdit}
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email ? (
            <FieldError>{fieldErrors.email}</FieldError>
          ) : (
            isEdit && (
              <FieldDescription>
                Also the login name. Changing it is not supported here.
              </FieldDescription>
            )
          )}
        </FieldContent>
      </Field>

      {!isEdit && (
        <Field>
          <FieldLabel htmlFor="staff-password">Temporary password</FieldLabel>
          <FieldContent>
            <Input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password ? (
              <FieldError>{fieldErrors.password}</FieldError>
            ) : (
              <FieldDescription>
                Share this out of band. It is hashed with bcrypt before storage and
                cannot be read back.
              </FieldDescription>
            )}
          </FieldContent>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="staff-department">Department</FieldLabel>
        <FieldContent>
          <NativeSelect
            id="staff-department"
            name="departmentId"
            value={form.departmentId}
            onChange={handleChange}
            disabled={submitting}
            className="w-full"
            aria-invalid={Boolean(fieldErrors.departmentId)}
          >
            <NativeSelectOption value="">Select a department</NativeSelectOption>
            {departments.map((department) => (
              <NativeSelectOption key={department.id} value={department.id}>
                {department.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {fieldErrors.departmentId ? (
            <FieldError>{fieldErrors.departmentId}</FieldError>
          ) : (
            <FieldDescription>
              Decides which roster this officer appears in, and which issues they can
              be assigned.
            </FieldDescription>
          )}
        </FieldContent>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="staff-phone">Phone</FieldLabel>
          <FieldContent>
            <Input
              id="staff-phone"
              name="phone"
              type="tel"
              placeholder="+880 1XXX XXXXX"
              value={form.phone}
              onChange={handleChange}
              disabled={submitting || isEdit}
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            {fieldErrors.phone && <FieldError>{fieldErrors.phone}</FieldError>}
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="staff-nid">NID</FieldLabel>
          <FieldContent>
            <Input
              id="staff-nid"
              name="nid"
              type="text"
              inputMode="numeric"
              placeholder="10, 13, or 17 digits"
              value={form.nid}
              onChange={handleChange}
              disabled={submitting || isEdit}
              aria-invalid={Boolean(fieldErrors.nid)}
            />
            {fieldErrors.nid ? (
              <FieldError>{fieldErrors.nid}</FieldError>
            ) : (
              <FieldDescription>
                Required. Used to stop one person filing reports under many accounts.
              </FieldDescription>
            )}
          </FieldContent>
        </Field>
      </div>

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

export default StaffForm;
