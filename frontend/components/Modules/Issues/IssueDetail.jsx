"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, BadgeCheck, Flag, MapPin, User } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import LinkButton from "@/components/Modules/Common/LinkButton";
import IssueComments from "@/components/Modules/Issues/IssueComments";
import IssuePhotos from "@/components/Modules/Issues/IssuePhotos";
import IssueStatusBadge from "@/components/Modules/Issues/IssueStatusBadge";
import IssueStatusTimeline from "@/components/Modules/Issues/IssueStatusTimeline";
import IssueManagePanel from "@/components/Modules/Issues/IssueManagePanel";
import IssueVoteButton from "@/components/Modules/Issues/IssueVoteButton";
import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import { useResource } from "@/hooks/use-resource";
import { getIssue, getIssueStatusHistory } from "@/lib/api";
import { formatCoords, formatDateTime } from "@/lib/format";

// Issue and history are fetched together: the timeline is only meaningful next to
// the row it belongs to, and one round trip beats two.
const loadIssue = async (issueId) => {
  const [issue, history] = await Promise.all([
    getIssue(issueId),
    getIssueStatusHistory(issueId),
  ]);

  return { issue: issue.data, history: history.data ?? [] };
};

const DetailRow = ({ label, children }) => (
  <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="col-span-2 min-w-0 break-words">{children ?? "—"}</span>
  </div>
);

const IssueDetail = ({ issueId }) => {
  const [patch, setPatch] = useState(null);
  const { session, isAdmin } = useAuth();

  const load = useCallback(() => loadIssue(issueId), [issueId]);
  const { data, error, loading } = useResource(`issue:${issueId}`, load);

  // A status change or an assignment returns the whole updated row, so the panel
  // hands it back and the page re-renders without a second round trip. The history
  // is patched locally too, because the status trigger wrote a new status_history
  // row and refetching the whole issue just to show it would be wasteful.
  const handleUpdated = (updated) => {
    const known = patch?.history ?? data?.history ?? [];

    setPatch({
      issue: updated,
      history: [
        ...known,
        {
          // The transition just recorded by the trigger, appended locally. The id
          // is generated rather than derived from updated_at because `datetime` has
          // no fractional seconds, so two changes in one second would collide.
          id: `local-${crypto.randomUUID()}`,
          old_status: issue?.status,
          new_status: updated.status,
          changed_by_name: null,
          changed_at: updated.updated_at,
        },
      ],
    });
  };

  const issue = patch?.issue ?? data?.issue ?? null;
  const history = patch?.history ?? data?.history ?? [];

  // Mirrors canManageIssuePhotos in backend/src/middleware/issuePhotoAccess.js. This
  // is only a rendering decision — the server re-checks it on every write, so a
  // tampered client gains nothing by hiding or showing these controls.
  //
  // `isOwner` is compared against user_id, not the reporter's name or email, because
  // the detail query exposes the id and nothing else stable about the reporter.
  const isOwner = Boolean(session?.id && issue?.user_id === session.id);
  const canAddPhotos = isAdmin || (isOwner && issue?.status === "Reported");
  const canDeletePhotos = isAdmin;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !issue) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPin />
          </EmptyMedia>
          <EmptyTitle>Issue unavailable</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        <LinkButton href="/issues" variant="outline">
          Back to all issues
        </LinkButton>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <LinkButton
          href="/issues"
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit gap-1.5 text-muted-foreground"
        >
          <ArrowLeft />
          All issues
        </LinkButton>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <IssueStatusBadge status={issue.status} />
            {issue.is_invalid === 1 || issue.is_invalid === true ? (
              <Badge variant="destructive" className="gap-1">
                <Flag className="size-3" />
                Flagged as false
              </Badge>
            ) : null}
            <Badge variant="outline">{issue.category_name}</Badge>
            {issue.citizen_confirmed === 1 || issue.citizen_confirmed === true ? (
              <Badge variant="secondary" className="gap-1">
                <BadgeCheck className="size-3" />
                Reporter confirmed
              </Badge>
            ) : null}
          </div>

          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
            {issue.title}
          </h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">What was reported</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-line text-foreground">
                {issue.description}
              </p>

              <Separator />

              <div className="divide-y">
                <DetailRow label="Reported by">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3.5 text-muted-foreground" />
                    {issue.reporter_name}
                  </span>
                </DetailRow>
                <DetailRow label="Ward">
                  {issue.ward_number} · {issue.ward_name}
                </DetailRow>
                <DetailRow label="Department">
                  {issue.department_name ?? "Not routed"}
                </DetailRow>
                <DetailRow label="Landmark">
                  {issue.landmark}
                </DetailRow>
                <DetailRow label="Location">
                  <span className="font-mono text-xs">
                    {formatCoords(issue.latitude, issue.longitude)}
                  </span>
                </DetailRow>
                <DetailRow label="Reported at">
                  {formatDateTime(issue.created_at)}
                </DetailRow>
                {issue.is_invalid === 1 || issue.is_invalid === true ? (
                  <>
                    <DetailRow label="Officer&rsquo;s verdict">
                      {issue.invalid_reason}
                    </DetailRow>
                    <DetailRow label="Flagged at">
                      {formatDateTime(issue.invalid_flagged_at)}
                    </DetailRow>
                  </>
                ) : null}
                {issue.resolved_at && (
                  <DetailRow label="Resolved at">
                    {formatDateTime(issue.resolved_at)}
                  </DetailRow>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <IssuePhotos
                issueId={issue.id}
                canAdd={canAddPhotos}
                canDelete={canDeletePhotos}
              />
            </CardContent>
          </Card>

          <IssueManagePanel issue={issue} onUpdated={handleUpdated} />

          {/* Public to anyone, signed in or not — the point of the feature. */}
          <IssueComments issueId={issue.id} />
        </div>

        <div className="space-y-6">
          <IssueStatusTimeline history={history} currentStatus={issue.status} />

          <Card>
            <CardContent>
              <IssueVoteButton
                issueId={issue.id}
                initialCount={issue.vote_count}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Reference</CardTitle>
              <CardDescription>
                Share this identifier with your ward office.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs break-all text-muted-foreground">
                {issue.id}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default IssueDetail;
