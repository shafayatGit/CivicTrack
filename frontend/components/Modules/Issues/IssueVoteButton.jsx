"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import { getVoteSummary, toggleVote } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { allowsParticipation } from "@/lib/participation";
import { cn } from "@/lib/utils";

// Works for residents with or without an account — that is the point of the feature. A
// signed-in citizen's vote is tied to their account; an anonymous one's rides on the
// `ct_voter` cookie the server sets, so it survives a page reload in the same browser.
//
// Staff and administrators get the count but no button: the vote is a measure of
// resident sentiment, and an official should not be able to move it on a report they
// also handle. The server refuses the write with a 403 regardless — this only keeps the
// page from offering a control that cannot work.
const IssueVoteButton = ({ issueId, initialCount = 0 }) => {
  const { session, hydrated } = useAuth();
  const canVote = allowsParticipation(session?.role);

  // initialCount comes from the issue payload the page already fetched, so the badge
  // shows the real number on first paint instead of flashing 0 and then correcting.
  const [count, setCount] = useState(initialCount);
  const [hasVoted, setHasVoted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => getVoteSummary(issueId), [issueId]);

  useEffect(() => {
    let cancelled = false;

    load()
      .then((response) => {
        if (cancelled) return;
        setCount(response.data.voteCount);
        setHasVoted(response.data.hasVoted);
      })
      .catch(() => {
        // A failed read is not worth an error state on a button: the count from the
        // issue payload is still shown, and voting may still work.
      })
      .finally(() => !cancelled && setLoaded(true));

    return () => {
      cancelled = true;
    };
  }, [load]);

  const onToggle = async () => {
    if (busy) {
      return;
    }

    setBusy(true);

    // Optimistic: the server answers with the authoritative count anyway, so this is
    // purely so the button feels instant on a slow connection. Reverted on failure.
    const previous = { count, hasVoted };
    setHasVoted(!hasVoted);
    setCount((current) => Math.max(0, current + (hasVoted ? -1 : 1)));

    try {
      const response = await toggleVote(issueId);
      setCount(response.data.voteCount);
      setHasVoted(response.data.hasVoted);
    } catch (error) {
      setCount(previous.count);
      setHasVoted(previous.hasVoted);

      // 429 is expected and not a failure the reader caused by accident — say what to
      // do about it rather than showing a raw message.
      if (error.status === 429) {
        toast.add({ type: "warning", title: error.message });
      } else {
        toast.add({
          type: "error",
          title: error.message ?? "Could not record your vote",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/*
        Whether the button exists depends on the session, which is null during SSR. So
        until `hydrated` flips, reserve the space invisibly rather than rendering the
        button and swapping it a frame later — that is both a hydration mismatch and a
        visible flicker for every staff member who opens the page.
      */}
      {!hydrated ? (
        <span className="invisible" aria-hidden="true">
          <Button type="button" variant="outline" tabIndex={-1} className="gap-2">
            <ThumbsUp />
            Vote
          </Button>
        </span>
      ) : canVote ? (
        <Button
          type="button"
          variant={hasVoted ? "default" : "outline"}
          onClick={onToggle}
          disabled={busy}
          aria-pressed={hasVoted}
          className="gap-2"
        >
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ThumbsUp className={cn(hasVoted && "fill-current")} />
          )}
          {hasVoted ? "Voted" : "Vote"}
        </Button>
      ) : (
        // A note rather than a disabled button: the control is withheld on purpose, and
        // saying why is more honest than a greyed-out button a reader keeps retrying.
        <span className="text-sm text-muted-foreground">
          Staff and administrators cannot vote on reports.
        </span>
      )}

      <span className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          {formatNumber(count)}
        </span>{" "}
        {count === 1 ? "vote" : "votes"}
      </span>

      {!loaded && hydrated && canVote && (
        <span className="sr-only" role="status">
          Loading your vote
        </span>
      )}
    </div>
  );
};

export default IssueVoteButton;
