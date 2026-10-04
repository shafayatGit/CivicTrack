"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import {
  ApiRequestError,
  changePassword,
  getMyProfile,
  setToken,
  updateProfile,
} from "@/lib/api";

// Mirrors backend/src/modules/user/user.validation.js — updateProfileSchema. Both the
// phone regex and the 2-character name floor are checked here so the obvious mistakes
// never cost a round trip, but the server's copy is the one that decides.
const PHONE_PATTERN = /^[0-9+\-\s()]{6,20}$/;

const initialProfileErrors = { name: "", phone: "" };
const initialPasswordErrors = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

// One mapper for both forms, because the server's `details` array is a list of Zod
// issues and the fields it names are exactly the fields each form owns. Anything not in
// `known` is dropped rather than parked on an input that does not exist — a refine on
// the whole object (the "provide at least one field" rule) reports an empty path, and
// rendering that as a field error would be noise.
const errorsFromApi = (error, known) => {
  if (!(error instanceof ApiRequestError) || !error.response) {
    return null;
  }

  const mapped = {};
  for (const issue of error.response.details ?? []) {
    const field = issue.path?.[0];
    if (field && known.includes(field) && issue.message) {
      mapped[field] = issue.message;
    }
  }

  return Object.keys(mapped).length > 0 ? mapped : null;
};

const ProfileDetailsForm = ({ profile, onSaved }) => {
  // Seeded straight from props in the initialiser, not copied in by an effect. The
  // parent does not mount this until `profile` has loaded, so the first render already
  // has real values and there is no window where the form shows blanks.
  //
  // After a save the parent holds the updated row, but `key` is the profile id and that
  // does not change — so the component does not remount and the half-typed values on
  // screen survive, which is what someone mid-edit expects.
  const [form, setForm] = useState({
    name: profile.name ?? "",
    phone: profile.phone ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState(initialProfileErrors);
  const [serverError, setServerError] = useState("");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");
    setSaved(false);

    const nextErrors = { ...initialProfileErrors };
    if (form.name.trim().length < 2) {
      nextErrors.name = "Name must be at least 2 characters.";
    }
    // An empty phone is a legitimate value here, not an error: null clears the column.
    // Validating only the non-empty case is what makes "remove my phone number" possible.
    if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim())) {
      nextErrors.phone = "Enter a valid phone number.";
    }
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await updateProfile({
        name: form.name.trim(),
        // Sent as null rather than omitted: the server's COALESCE writes an explicit null
        // to clear the column, whereas an absent key would leave the old value in place.
        phone: form.phone.trim() ? form.phone.trim() : null,
      });

      // The server re-mints the JWT because `name` is a signed claim and the header has
      // no other source for it. Handing it to setToken is what makes the new name appear
      // in the chrome immediately instead of after the next sign-in.
      if (response.data?.token) {
        setToken(response.data.token);
      }
      setSaved(true);
      onSaved(response.data);
    } catch (error) {
      const mapped = errorsFromApi(error, ["name", "phone"]);
      if (mapped) {
        setFieldErrors({ ...initialProfileErrors, ...mapped });
      } else {
        setServerError(
          error instanceof ApiRequestError
            ? error.message
            : "Unable to reach the server. Please check your connection and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile details</CardTitle>
        <CardDescription>
          How your name and contact number appear on the reports you file.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {serverError && (
            <Alert variant="destructive">
              <AlertTitle>Could not save</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Field>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <FieldContent>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="phone">Phone number</FieldLabel>
            <FieldContent>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="eg. +8801712345678"
                value={form.phone}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              {fieldErrors.phone ? (
                <FieldError>{fieldErrors.phone}</FieldError>
              ) : (
                <FieldDescription>
                  Optional. Clear the field and save to remove it.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? "Saving..." : "Save changes"}
            </Button>
            {saved && (
              <span className="text-sm text-muted-foreground" role="status">
                Saved.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const PasswordForm = () => {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState(initialPasswordErrors);
  const [serverError, setServerError] = useState("");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");
    setSaved(false);

    const nextErrors = { ...initialPasswordErrors };
    if (!form.currentPassword) {
      nextErrors.currentPassword = "Enter your current password.";
    }
    if (form.newPassword.length < 6) {
      nextErrors.newPassword = "New password must be at least 6 characters.";
    }
    if (form.newPassword !== form.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // Cleared rather than left filled: the old password is now wrong, so leaving it in
      // the DOM would be showing a credential that no longer works.
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSaved(true);
    } catch (error) {
      const mapped = errorsFromApi(error, [
        "currentPassword",
        "newPassword",
      ]);
      if (mapped) {
        setFieldErrors({ ...initialPasswordErrors, ...mapped });
      } else {
        setServerError(
          error instanceof ApiRequestError
            ? error.message
            : "Unable to reach the server. Please check your connection and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Changing your password does not sign you out of this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {serverError && (
            <Alert variant="destructive">
              <AlertTitle>Could not change password</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Field>
            <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
            <FieldContent>
              <Input
                id="currentPassword"
                name="currentPassword"
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.currentPassword)}
              />
              {fieldErrors.currentPassword && (
                <FieldError>{fieldErrors.currentPassword}</FieldError>
              )}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="newPassword">New password</FieldLabel>
            <FieldContent>
              <Input
                id="newPassword"
                name="newPassword"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={form.newPassword}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.newPassword)}
              />
              {fieldErrors.newPassword && (
                <FieldError>{fieldErrors.newPassword}</FieldError>
              )}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
            <FieldContent>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
              />
              {fieldErrors.confirmPassword && (
                <FieldError>{fieldErrors.confirmPassword}</FieldError>
              )}
            </FieldContent>
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? "Updating..." : "Change password"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPasswords((prev) => !prev)}
              disabled={submitting}
              aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
            >
              {showPasswords ? <EyeOff /> : <Eye />}
              {showPasswords ? "Hide" : "Show"}
            </Button>
            {saved && (
              <span className="text-sm text-muted-foreground" role="status">
                Password updated.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const ProfileSettings = () => {
  const { session, hydrated } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  // Re-read after a save so the read-only rows below (email, NID, role) and the header
  // agree with what was just written, rather than showing whatever arrived on mount.
  const handleSaved = (updated) => setProfile(updated);

  useEffect(() => {
    // Gated on hydrated, not on session: the token lives in localStorage, so on the
    // first client render there is no session yet and the fetch would 401. `hydrated` is
    // the flag that says localStorage has actually been read.
    if (!hydrated) {
      return;
    }

    let cancelled = false;
    getMyProfile()
      .then((response) => {
        if (!cancelled) {
          setProfile(response.data);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError instanceof ApiRequestError
              ? requestError.message
              : "Unable to load your profile.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  if (!hydrated || (!error && !profile)) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load your profile</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Read-only identity. Rendered rather than editable because the server rejects
          these fields outright — offering inputs here would be three controls that
          cannot succeed. */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            These identify your account and cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium break-all">{profile?.email}</span>
          </div>
          <Separator />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">National ID</span>
            <span className="text-sm font-medium break-all">{profile?.nid}</span>
          </div>
          <Separator />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Role</span>
            <div>
              {/* Fall back to the token: profile is present here, but a role the token
                  already carries is the same value and never renders an empty badge. */}
              <Badge variant="secondary">{profile?.role ?? session?.role}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProfileDetailsForm profile={profile} onSaved={handleSaved} />
      <PasswordForm />
    </div>
  );
};

export default ProfileSettings;