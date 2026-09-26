import Link from "next/link";
import { MapPin, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import IssueStatusBadge from "@/components/Modules/Issues/IssueStatusBadge";
import { formatRelative } from "@/lib/format";

// One row in the issue explorer. The title anchor is stretched over the whole card
// so the entire row is clickable without nesting interactive elements.
const IssueCard = ({ issue }) => (
  <Card
    size="sm"
    className="relative transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring"
  >
    <CardContent className="flex items-start gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <IssueStatusBadge status={issue.status} />
          <Badge variant="outline">{issue.category_name}</Badge>
          {issue.assigned_staff_id ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <User className="size-3" />
              {issue.assignee_name ?? "Assigned"}
            </span>
          ) : (
            <Badge variant="ghost">Unassigned</Badge>
          )}
        </div>

        <h3 className="font-heading text-base font-medium leading-snug">
          <Link
            href={`/issues/${issue.id}`}
            className="after:absolute after:inset-0 hover:underline"
          >
            {issue.title}
          </Link>
        </h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            Ward {issue.ward_number} · {issue.ward_name}
          </span>
          {issue.department_name && <span>{issue.department_name}</span>}
          {issue.landmark && <span className="truncate">{issue.landmark}</span>}
          <span className="ml-auto">{formatRelative(issue.created_at)}</span>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default IssueCard;
