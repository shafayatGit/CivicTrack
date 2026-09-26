"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import { ApiRequestError, registerUser, setToken } from "@/lib/api";
import { landingPathFor } from "@/lib/navigation";

const initialFieldErrors = { name: "", email: "", nid: "", password: "" };

// Mirrors NID_PATTERN in backend/src/utils/nid.js — the single backend definition
// shared by registration and staff onboarding. Lengths are 10, 13, or 17 digits;
// keeping the two in step means the form never sends a value the API is going to
// reject.
const NID_PATTERN = /^(?:\d{10}|\d{13}|\d{17})$/;

const getFieldErrors = (form) => {
  const errors = { ...initialFieldErrors };

  if (form.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (!NID_PATTERN.test(form.nid.trim())) {
    errors.nid = "Enter a valid National ID (10, 13, or 17 digits).";
  }
  if (form.password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }

  return errors;
};

const RegisterForm = () => {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    nid: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");

    const nextErrors = getFieldErrors(form);
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      const data = await registerUser({
        name: form.name.trim(),
        email: form.email.trim(),
        nid: form.nid.trim(),
        password: form.password,
      });
      setToken(data.data.token);
      // A new account is always a citizen, so this lands on their dashboard. It still
      // goes through the shared helper rather than hardcoding "/dashboard".
      router.push(landingPathFor("citizen"));
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
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Create an account</CardTitle>
        <CardDescription>
          Join CivicTrack to start reporting issues in your community.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {serverError && (
          <Alert variant="destructive">
            <AlertTitle>Registration failed</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <FieldContent>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                value={form.name}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <FieldContent>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="jane@example.com"
                value={form.email}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="nid">National ID</FieldLabel>
            <FieldContent>
              <Input
                id="nid"
                name="nid"
                type="text"
                inputMode="numeric"
                placeholder="10, 13, or 17 digits"
                value={form.nid}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.nid)}
              />
              {fieldErrors.nid && <FieldError>{fieldErrors.nid}</FieldError>}
              <FieldDescription>
                Used to verify citizen accounts and reduce fake reports. It is
                never shown publicly.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <FieldContent>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={Boolean(fieldErrors.password)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={submitting}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {fieldErrors.password && (
                <FieldError>{fieldErrors.password}</FieldError>
              )}
            </FieldContent>
          </Field>

          <Button
            type="submit"
            size="lg"
            className="mt-1 w-full"
            disabled={submitting}
          >
            {submitting && <Loader2 className="animate-spin" />}
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};

export default RegisterForm;