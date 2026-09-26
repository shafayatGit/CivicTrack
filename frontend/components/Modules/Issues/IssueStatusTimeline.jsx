import { CheckCircle2, CircleDot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

const isResolved = (status) => status === "Resolved";

// The history rows come back newest-first (ORDER BY h.changed_at DESC), so they are
// reversed for display: the oldest change is the first thing worth reading, because
// it explains how the issue reached its current state.
const IssueStatusTimeline = ({ history, currentStatus }) => {
  const ordered = [...history].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Status history</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l pl-6">
          {ordered.map((entry, index) => {
            const latest = index === ordered.length - 1;

            return (
              <li key={entry.id} className="relative">
                <span className="absolute top-1 -left-[31px] flex size-3 items-center justify-center">
                  {latest && isResolved(currentStatus) ? (
                    <CheckCircle2 className="size-3.5 fill-primary text-primary" />
                  ) : (
                    <CircleDot
                      className={
                        latest
                          ? "size-3.5 text-primary"
                          : "size-3.5 text-muted-foreground"
                      }
                    />
                  )}
                </span>

                <p className="text-sm font-medium">
                  {entry.old_status ? `${entry.old_status} → ` : ""}
                  {entry.new_status}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.changed_at)}
                  {entry.changed_by_name ? ` · ${entry.changed_by_name}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
};

export default IssueStatusTimeline;
