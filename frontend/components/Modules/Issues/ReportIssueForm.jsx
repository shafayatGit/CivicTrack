"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MapPin, Send } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { NativeSelectOption, NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";

import IssueStatusBadge from "@/components/Modules/Issues/IssueStatusBadge";
import { useResource } from "@/hooks/use-resource";
import {
  ApiRequestError,
  createIssue,
  findDuplicateIssues,
  listCategories,
  listDepartments,
  listWards,
} from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { coordKey, findWardForPoint, hasWardBounds } from "@/lib/geo";

// Leaflet reads `window` as soon as it is imported, so the map cannot be part of the
// server render. `ssr: false` is only legal inside a Client Component, which this file
// is — hence the dynamic import here rather than a plain one.
const LocationPicker = dynamic(
  () => import("@/components/Modules/Issues/LocationPicker"),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-72 w-full rounded-2xl" aria-hidden="true" />
    ),
  },
);

// Shared empty array so the derived lookup lists keep a stable identity while the
// options request is still in flight; a fresh `[]` per render would invalidate the
// memo below on every keystroke.
const EMPTY_LIST = [];

const EMPTY_FORM = {
  categoryId: "",
  wardId: "",
  title: "",
  description: "",
  landmark: "",
  latitude: "",
  longitude: "",
};

const initialFieldErrors = {
  categoryId: "",
  wardId: "",
  title: "",
  description: "",
  latitude: "",
  longitude: "",
};

const isCoordinate = (value) => {
  const parsed = Number(value);
  return value !== "" && Number.isFinite(parsed);
};

// The server-side rules from createIssueSchema, mirrored so the obvious mistakes
// are caught before a round trip.
const validate = (form, wardId) => {
  const errors = { ...initialFieldErrors };

  if (!form.categoryId) {
    errors.categoryId = "Choose a category.";
  }

  if (!wardId) {
    errors.wardId = "Choose the ward this is in.";
  }

  if (form.title.trim().length < 5) {
    errors.title = "Title must be at least 5 characters.";
  }

  if (form.description.trim().length < 10) {
    errors.description = "Please describe the issue in at least 10 characters.";
  }

  if (!isCoordinate(form.latitude) || Math.abs(Number(form.latitude)) > 90) {
    errors.latitude = "Latitude must be between -90 and 90.";
  }

  if (!isCoordinate(form.longitude) || Math.abs(Number(form.longitude)) > 180) {
    errors.longitude = "Longitude must be between -180 and 180.";
  }

  return errors;
};

// Runs once the minimum the duplicate endpoint needs is present: a category, a ward
// and a real pair of coordinates. Any of those missing and the query would 400.
const canProbeDuplicates = (form, wardId) =>
  Boolean(form.categoryId && wardId) &&
  isCoordinate(form.latitude) &&
  isCoordinate(form.longitude);

const ReportIssueForm = () => {
  const router = useRouter();

  const [form, setForm] = useState(EMPTY_FORM);
  // null means "follow the category default"; a value is a deliberate override.
  const [departmentOverride, setDepartmentOverride] = useState(null);
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // A deliberate ward choice is remembered per coordinate rather than in a single
  // `wardOverride` slot keyed off nothing. Two consequences, both wanted: moving the
  // pin re-runs the auto-detection instead of silently keeping a stale choice, and
  // there is no effect that has to clear the override when the coordinates change
  // (which would trip react-hooks/set-state-in-effect and re-render anyway).
  const [wardOverrides, setWardOverrides] = useState({});

  // Same trick for "yes, this really is a separate report": the acknowledgement belongs
  // to the set of duplicates that was shown, so a new probe automatically un-acks.
  const [duplicateAcks, setDuplicateAcks] = useState({});

  const loadOptions = useCallback(async () => {
    const [categories, wards, departments] = await Promise.all([
      listCategories(),
      listWards({ limit: 100 }),
      listDepartments({ limit: 100 }),
    ]);

    return {
      categories: categories.data ?? [],
      wards: wards.data ?? [],
      departments: departments.data ?? [],
    };
  }, []);

  const {
    data: options,
    error: optionsError,
  } = useResource("report-options", loadOptions);

  const categories = options?.categories ?? EMPTY_LIST;
  const wards = options?.wards ?? EMPTY_LIST;
  const departments = options?.departments ?? EMPTY_LIST;

  // The category's default department is the routing value, derived during render
  // rather than copied into form state, so switching category cannot leave a stale
  // department behind. An explicit choice still wins.
  const selectedCategory = useMemo(
    () => categories.find((entry) => entry.id === form.categoryId),
    [categories, form.categoryId],
  );

  const departmentId =
    departmentOverride ?? selectedCategory?.default_department_id ?? "";

  // --- Ward auto-detection -------------------------------------------------------
  //
  // Derived during render instead of being written into form state, so the dropdown,
  // the map rectangle and the submitted payload can never disagree with each other.
  const activeCoordKey = coordKey(form.latitude, form.longitude);

  const autoWard = useMemo(() => {
    if (activeCoordKey === null) {
      return { match: null, ambiguous: false, mapped: 0 };
    }

    return findWardForPoint(wards, Number(form.latitude), Number(form.longitude));
  }, [activeCoordKey, wards, form.latitude, form.longitude]);

  const selectedWardId = activeCoordKey
    ? (wardOverrides[activeCoordKey] ?? autoWard.match?.id ?? "")
    : form.wardId;

  const selectedWard = useMemo(
    () => wards.find((ward) => ward.id === selectedWardId),
    [wards, selectedWardId],
  );

  // The rectangle drawn on the map for the selected ward, if it has one.
  const wardRectangle = useMemo(() => {
    if (!selectedWard || !hasWardBounds(selectedWard)) {
      return null;
    }

    return {
      min_latitude: selectedWard.min_latitude,
      min_longitude: selectedWard.min_longitude,
      max_latitude: selectedWard.max_latitude,
      max_longitude: selectedWard.max_longitude,
    };
  }, [selectedWard]);

  // Only nag when there is something to compare against: a city where no admin has
  // drawn a single ward box cannot tell the citizen anything useful.
  const wardWarning = useMemo(() => {
    if (activeCoordKey === null || autoWard.mapped === 0) {
      return "";
    }

    if (autoWard.ambiguous) {
      return "This point falls inside more than one mapped ward. Choose the right one below.";
    }

    if (autoWard.match) {
      return "";
    }

    if (selectedWard && hasWardBounds(selectedWard)) {
      return "This point is outside the selected ward's mapped area. Pick the ward that actually contains it.";
    }

    return "No mapped ward contains this point. Choose the ward manually below.";
  }, [activeCoordKey, autoWard, selectedWard]);

  // Duplicate probe. The debounce lives in the resource key so each probe waits for
  // typing to settle: every probe is a bounding-box scan on issues.
  // The probe runs against selectedWardId, not form.wardId. The endpoint filters on
  // ward, so probing the raw value would scan a ward the citizen is about to override
  // and miss the one they are actually filing under.
  const probeKey = canProbeDuplicates(form, selectedWardId)
    ? `dupes:${form.categoryId}:${selectedWardId}:${form.latitude}:${form.longitude}`
    : null;

  const loadDuplicates = useCallback(
    () =>
      findDuplicateIssues({
        wardId: selectedWardId,
        categoryId: form.categoryId,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radiusKm: 1,
      }),
    [form.categoryId, selectedWardId, form.latitude, form.longitude],
  );

  const {
    data: duplicateData,
    error: duplicateError,
    loading: probing,
  } = useResource(probeKey, loadDuplicates, {
    enabled: Boolean(probeKey),
    debounceMs: 500,
  });

  // A failed probe must never block the report; it is advice, not a gate.
  const duplicates = duplicateData?.data ?? [];

  // Duplicates have to be acknowledged against the exact list that was shown. Tying
  // this to probeKey means that as soon as the category, ward or pin changes, the
  // checkbox resets instead of carrying over consent to a set of reports the citizen
  // never saw.
  const duplicatesAcknowledged =
    probeKey !== null && duplicateAcks[probeKey] === true;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === "wardId") {
      setWardOverrides((prev) => {
        if (value === (autoWard.match?.id ?? "")) {
          // The dropdown agrees with the map again, so there is nothing to remember.
          if (!(activeCoordKey in prev)) {
            return prev;
          }

          const next = { ...prev };
          delete next[activeCoordKey];
          return next;
        }

        if (activeCoordKey === null) {
          // No pin on the map yet, so the dropdown is the only source of truth and
          // form.wardId already holds it.
          return prev;
        }

        return { ...prev, [activeCoordKey]: value };
      });
    }
  };

  const handlePick = useCallback((latitude, longitude) => {
    setForm((prev) => ({
      ...prev,
      latitude: String(latitude),
      longitude: String(longitude),
    }));
    setFieldErrors((prev) => ({ ...prev, latitude: "", longitude: "" }));
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setDepartmentOverride(null);
    setFieldErrors(initialFieldErrors);
    setWardOverrides({});
    setDuplicateAcks({});
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");

    const nextErrors = validate(form, selectedWardId);
    setFieldErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    // Duplicates are advisory about the same report, not a hard block — two citizens
    // can legitimately describe the same pothole. But silently filing a fourth copy
    // of a known issue is worse, so the citizen has to say they checked.
    if (duplicates.length > 0 && !duplicatesAcknowledged) {
      setServerError(
        "Confirm that this is a separate report before submitting, or close one of the existing reports instead.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const response = await createIssue({
        categoryId: form.categoryId,
        wardId: selectedWardId,
        departmentId: departmentId || undefined,
        title: form.title.trim(),
        description: form.description.trim(),
        landmark: form.landmark.trim() || undefined,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });

      toast.add({ type: "success", title: "Issue reported" });
      router.push(`/issues/${response.data.id}`);
    } catch (submitError) {
      if (submitError instanceof ApiRequestError && submitError.response) {
        const fromServer = {};

        for (const detail of submitError.response.details ?? []) {
          const field = detail.path?.[0];
          if (field && detail.message) {
            fromServer[field] = detail.message;
          }
        }

        if (Object.keys(fromServer).length > 0) {
          setFieldErrors({ ...initialFieldErrors, ...fromServer });
        } else {
          setServerError(submitError.message);
        }
      } else {
        setServerError(
          "Unable to reach the server. Please check your connection and try again.",
        );
      }

      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
          Report an issue
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          The more precise the location, the faster it reaches the right department.
        </p>
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertTitle>Could not submit the report</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {optionsError && (
        <Alert>
          <AlertTitle>Setup incomplete</AlertTitle>
          <AlertDescription>
            Could not load categories and wards. An admin needs to set those up
            first.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">What is wrong?</CardTitle>
              <CardDescription>
                A short title and a description of what you can see.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <FieldContent>
                  <Input
                    id="title"
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    placeholder="Streetlight out on the corner"
                    maxLength={150}
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.title)}
                  />
                  {fieldErrors.title && <FieldError>{fieldErrors.title}</FieldError>}
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="description"
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={5}
                    placeholder="The light has been out for a week. It is dark and unsafe for pedestrians after 7pm."
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.description)}
                  />
                  {fieldErrors.description && (
                    <FieldError>{fieldErrors.description}</FieldError>
                  )}
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="landmark">Nearest landmark</FieldLabel>
                <FieldContent>
                  <Input
                    id="landmark"
                    name="landmark"
                    value={form.landmark}
                    onChange={handleChange}
                    placeholder="Opposite the mosque on Road 11"
                    maxLength={150}
                    disabled={submitting}
                  />
                  <FieldDescription>Optional, but it helps the crew find the spot.</FieldDescription>
                </FieldContent>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Where is it?</CardTitle>
              <CardDescription>
                Coordinates drive both routing and the duplicate check below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <LocationPicker
                latitude={isCoordinate(form.latitude) ? Number(form.latitude) : null}
                longitude={isCoordinate(form.longitude) ? Number(form.longitude) : null}
                onPick={handlePick}
                wardBounds={wardRectangle}
              />

              <FieldDescription>
                Click the map or drag the pin to place the report. The coordinates
                below stay editable for precision.
              </FieldDescription>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
                  <FieldContent>
                    <Input
                      id="latitude"
                      name="latitude"
                      inputMode="decimal"
                      value={form.latitude}
                      onChange={handleChange}
                      placeholder="23.78000"
                      disabled={submitting}
                      aria-invalid={Boolean(fieldErrors.latitude)}
                    />
                    {fieldErrors.latitude && (
                      <FieldError>{fieldErrors.latitude}</FieldError>
                    )}
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
                  <FieldContent>
                    <Input
                      id="longitude"
                      name="longitude"
                      inputMode="decimal"
                      value={form.longitude}
                      onChange={handleChange}
                      placeholder="90.40000"
                      disabled={submitting}
                      aria-invalid={Boolean(fieldErrors.longitude)}
                    />
                    {fieldErrors.longitude && (
                      <FieldError>{fieldErrors.longitude}</FieldError>
                    )}
                  </FieldContent>
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <FieldContent>
                  <NativeSelect
                    id="categoryId"
                    name="categoryId"
                    value={form.categoryId}
                    onChange={handleChange}
                    disabled={submitting}
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.categoryId)}
                  >
                    <NativeSelectOption value="">Choose a category…</NativeSelectOption>
                    {categories.map((category) => (
                      <NativeSelectOption key={category.id} value={category.id}>
                        {category.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {fieldErrors.categoryId && (
                    <FieldError>{fieldErrors.categoryId}</FieldError>
                  )}
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="wardId">Ward</FieldLabel>
                <FieldContent>
                  <NativeSelect
                    id="wardId"
                    name="wardId"
                    value={selectedWardId}
                    onChange={handleChange}
                    disabled={submitting}
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.wardId)}
                  >
                    <NativeSelectOption value="">Choose a ward…</NativeSelectOption>
                    {wards.map((ward) => (
                      <NativeSelectOption key={ward.id} value={ward.id}>
                        {ward.ward_number} · {ward.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {fieldErrors.wardId && <FieldError>{fieldErrors.wardId}</FieldError>}
                  {wardWarning && (
                    <FieldDescription>{wardWarning}</FieldDescription>
                  )}
                  {autoWard.match && selectedWardId === autoWard.match.id && (
                    <FieldDescription>
                      Filled in from the map — the pin is inside this ward.
                    </FieldDescription>
                  )}
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="departmentId">Department</FieldLabel>
                <FieldContent>
                  <NativeSelect
                    id="departmentId"
                    value={departmentId}
                    onChange={(event) => setDepartmentOverride(event.target.value)}
                    disabled={submitting}
                    className="w-full"
                  >
                    <NativeSelectOption value="">
                      {selectedCategory?.default_department_id
                        ? "Use the category default"
                        : "Let the category decide"}
                    </NativeSelectOption>
                    {departments.map((department) => (
                      <NativeSelectOption key={department.id} value={department.id}>
                        {department.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldDescription>
                    Left unset, the issue is routed to the category&apos;s default
                    department.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </CardContent>
          </Card>

          {probeKey && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-base">
                  Possible duplicates
                  {probing && <Loader2 className="size-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {duplicateError ? (
                  <Alert>
                    <AlertTriangle />
                    <AlertTitle>Could not check for duplicates</AlertTitle>
                    <AlertDescription>
                      {duplicateError.message ??
                        "The nearby-report lookup failed."}{" "}
                      You can still submit this report — the check is advisory, not a
                      requirement.
                    </AlertDescription>
                  </Alert>
                ) : duplicates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {probing
                      ? "Checking nearby reports…"
                      : "No open reports of this category within 1 km."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <Alert>
                      <AlertTriangle />
                      <AlertTitle>
                        {duplicates.length} similar{" "}
                        {duplicates.length === 1 ? "report" : "reports"} nearby
                      </AlertTitle>
                      <AlertDescription>
                        Adding your report as a separate issue splits the attention
                        the department gives it. Check whether one of these already
                        covers it.
                      </AlertDescription>
                    </Alert>

                    <ul className="space-y-2">
                      {duplicates.map((duplicate) => (
                        <li
                          key={duplicate.id}
                          className="rounded-2xl border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/issues/${duplicate.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium hover:underline"
                            >
                              {duplicate.title}
                            </Link>
                            <IssueStatusBadge status={duplicate.status} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {duplicate.distance_km} km away ·{" "}
                            {formatRelative(duplicate.created_at)}
                            {duplicate.landmark ? ` · ${duplicate.landmark}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>

                    <Field>
                      <FieldLabel htmlFor="confirmSeparate" className="text-sm">
                        <Checkbox
                          id="confirmSeparate"
                          checked={duplicatesAcknowledged}
                          disabled={submitting}
                          onCheckedChange={(checked) =>
                            setDuplicateAcks((prev) => {
                              if (!probeKey) {
                                return prev;
                              }

                              if (checked === true) {
                                return { ...prev, [probeKey]: true };
                              }

                              const next = { ...prev };
                              delete next[probeKey];
                              return next;
                            })
                          }
                        />
                        None of these covers the same problem, so this is a separate
                        report.
                      </FieldLabel>
                    </Field>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button type="submit" size="lg" disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              {submitting ? "Submitting..." : "Submit report"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={submitting}
              onClick={resetForm}
              className="gap-1.5"
            >
              <MapPin />
              Clear
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};

export default ReportIssueForm;
