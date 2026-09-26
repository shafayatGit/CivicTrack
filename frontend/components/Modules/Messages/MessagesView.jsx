"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessagesSquare, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

import { useAuth } from "@/components/Modules/Auth/AuthProvider";
import NewThreadDialog from "@/components/Modules/Messages/NewThreadDialog";
import ThreadConversation from "@/components/Modules/Messages/ThreadConversation";
import { useCrudResource } from "@/hooks/use-crud-resource";
import { useResource } from "@/hooks/use-resource";
import { emitWithAck, getSocket, SOCKET_EVENTS } from "@/lib/socket";
import {
  getThreadMessages,
  getUnreadCount,
  listThreads,
  markThreadRead,
  sendMessage,
} from "@/lib/api";
import { formatRelative } from "@/lib/format";

const PAGE_SIZE = 30;

// issue_id is nullable and NULL means "general thread", so it is part of the key
// rather than defaulted away — otherwise every general thread with the same pair of
// people would collapse into one entry.
// Selected threads are held in camelCase because they are built from the thread
// list, but every message that arrives from the wire — a socket broadcast or a
// REST response — is a raw row in snake_case. Both feed the same comparison, so
// the key reads whichever spelling it is handed.
export const threadKey = (source) => {
  const staffId = source?.staffId ?? source?.staff_id;
  const adminId = source?.adminId ?? source?.admin_id;
  const issueId = source?.issueId ?? source?.issue_id;

  return `${staffId ?? ""}|${adminId ?? ""}|${issueId ?? ""}`;
};

const MessagesView = () => {
  const { session, hydrated } = useAuth();
  const role = session?.role;
  const userId = session?.id;

  // Messages are a staff <-> admin channel. The nav already hides the link from
  // citizens, but the route is reachable by typing it, and the socket handshake
  // would connect a citizen before the API rejected the first query.
  const allowed = role === "staff" || role === "admin";

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);

  // Messages pushed over the socket are held apart from the fetched page so a
  // broadcast can be merged in without re-querying the history it landed in.
  const [liveMessages, setLiveMessages] = useState([]);
  const [pushedUnread, setPushedUnread] = useState(null);

  const load = useCallback(() => listThreads({ page, limit: PAGE_SIZE }), [page]);
  const { data, error, loading, reload } = useCrudResource(
    `messages:threads:${page}`,
    load,
    { enabled: allowed },
  );

  const loadUnread = useCallback(() => getUnreadCount(), []);
  const { data: unreadData } = useResource("messages:unread", loadUnread, {
    enabled: allowed,
  });

  const threads = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;
  const badge = pushedUnread ?? unreadData?.data?.unread ?? null;

  // --- live messages --------------------------------------------------------
  useEffect(() => {
    const socket = allowed ? getSocket() : null;

    if (!socket) {
      return undefined;
    }

    if (!socket.connected) {
      socket.connect();
    }

    const onUnread = (payload) => setPushedUnread(payload?.unread ?? 0);

    const onMessage = (message) => {
      if (!selected || threadKey(selected) !== threadKey(message)) {
        return;
      }

      // The sender's own message comes back over the socket after the ack already
      // returned it, so the id is the dedupe key.
      setLiveMessages((current) =>
        current.some((entry) => entry.id === message.id)
          ? current
          : [...current, message],
      );

      // Opening a thread is what makes its messages read, so an inbound message
      // while it is open is acknowledged immediately.
      if (message.sender_id !== userId) {
        void emitWithAck(socket, SOCKET_EVENTS.threadRead, selected).catch(() => {});
      }
    };

    const onThreadRead = (payload) => {
      if (!selected || threadKey(selected) !== threadKey(payload)) {
        return;
      }

      setLiveMessages((current) =>
        current.map((entry) =>
          entry.sender_id === userId ? entry : { ...entry, is_read: true },
        ),
      );
    };

    socket.on(SOCKET_EVENTS.unreadRefresh, onUnread);
    socket.on(SOCKET_EVENTS.messageNew, onMessage);
    socket.on(SOCKET_EVENTS.threadReadBroadcast, onThreadRead);

    return () => {
      socket.off(SOCKET_EVENTS.unreadRefresh, onUnread);
      socket.off(SOCKET_EVENTS.messageNew, onMessage);
      socket.off(SOCKET_EVENTS.threadReadBroadcast, onThreadRead);
    };
  }, [allowed, selected, userId]);

  // --- room membership ------------------------------------------------------
  useEffect(() => {
    const socket = allowed ? getSocket() : null;

    if (!socket || !selected) {
      return undefined;
    }

    // Joining is what the server authorises: an unchecked join would be a read-side
    // hole, because the room is where message:new is delivered.
    void emitWithAck(socket, SOCKET_EVENTS.threadJoin, selected).catch(() => {});

    return () => {
      void emitWithAck(socket, SOCKET_EVENTS.threadLeave, selected).catch(() => {});
    };
  }, [allowed, selected]);

  // --- history --------------------------------------------------------------
  const selectedKey = selected ? threadKey(selected) : null;

  const loadHistory = useCallback(
    () => getThreadMessages(selected, { page: 1, limit: PAGE_SIZE }),
    [selected],
  );

  const {
    data: history,
    error: historyError,
    loading: historyLoading,
  } = useResource(
    selectedKey ? `messages:history:${selectedKey}` : null,
    loadHistory,
    { enabled: Boolean(selected) },
  );

  const fetched = useMemo(() => history?.data ?? [], [history]);

  const messages = useMemo(() => {
    const seen = new Set();

    return [...fetched, ...liveMessages]
      .filter((message) => {
        if (seen.has(message.id)) {
          return false;
        }
        seen.add(message.id);
        return true;
      })
      .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
  }, [fetched, liveMessages]);

  // --- actions --------------------------------------------------------------
  const openThread = (thread) => {
    const next = {
      staffId: thread.staff_id,
      adminId: thread.admin_id,
      issueId: thread.issue_id,
      // Carried for the header only; the wire payload never includes them.
      participantName:
        role === "admin" ? thread.staff_name : thread.admin_name,
    };

    setSelected(next);
    setDraft("");
    // The buffer belongs to the previously open thread, so it is dropped as part of
    // the same state transition that opens the new one.
    setLiveMessages([]);

    // The unread badge is cleared server-side, which also refreshes it for the other
    // participant. Only worth asking for when there is something to clear.
    if (thread.unread_count > 0) {
      const socket = getSocket();

      if (socket?.connected) {
        void emitWithAck(socket, SOCKET_EVENTS.threadRead, next).catch(() => {});
      } else {
        void markThreadRead(next)
          .then(reload)
          .catch(() => {});
      }
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();

    const text = draft.trim();

    if (!text || !selected) {
      return;
    }

    const payload = {
      staffId: selected.staffId,
      adminId: selected.adminId,
      issueId: selected.issueId,
      messageText: text,
    };

    setSending(true);

    try {
      const socket = getSocket();

      // Over the socket when it is up, so a sent message arrives the same way a
      // colleague's does. REST is the fallback for a dropped connection. Either
      // way the created row comes back from the call, and it is shown straight
      // away rather than waiting for the broadcast to loop back — the id dedupe in
      // onMessage keeps the two from appearing twice.
      const created = socket?.connected
        ? await emitWithAck(socket, SOCKET_EVENTS.messageSend, payload)
        : (await sendMessage(payload)).data;

      setLiveMessages((current) =>
        current.some((entry) => entry.id === created.id)
          ? current
          : [...current, created],
      );

      setDraft("");
    } catch (sendError) {
      toast.add({ type: "error", title: sendError.message });
    } finally {
      setSending(false);
    }
  };

  const handleCreated = (thread) => {
    setStarting(false);
    setSelected({ ...thread, participantName: null });
    setLiveMessages([]);
    // A brand new thread is not in the fetched page yet, and the send that follows
    // will create it server-side.
    setPage(1);
    reload();
  };

  if (!hydrated) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!allowed) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessagesSquare />
          </EmptyMedia>
          <EmptyTitle>Messages are for staff and administrators</EmptyTitle>
          <EmptyDescription>
            There is nothing here for a citizen account.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
            Messages
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Conversations between staff and administrators.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {badge !== null && (
            <Badge variant={badge > 0 ? "default" : "secondary"}>
              {badge} unread
            </Badge>
          )}
          <Button onClick={() => setStarting(true)} className="gap-1.5">
            <Plus />
            New
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))
          ) : error ? (
            <p className="text-sm text-destructive">{error.message}</p>
          ) : threads.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquare />
                </EmptyMedia>
                <EmptyTitle>No conversations yet</EmptyTitle>
                <EmptyDescription>
                  Start one to reach the {role === "admin" ? "staff" : "admins"}.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {threads.map((thread) => {
                const key = threadKey(thread);
                const active = key === selectedKey;

                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => openThread(thread)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50",
                        active && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {role === "admin"
                            ? thread.staff_name
                            : thread.admin_name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelative(thread.sent_at)}
                        </span>
                      </div>

                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {thread.message_text}
                      </p>

                      <div className="mt-1.5 flex items-center gap-2">
                        {thread.issue_id ? (
                          <Badge variant="outline">Issue</Badge>
                        ) : (
                          <Badge variant="ghost">General</Badge>
                        )}
                        {thread.unread_count > 0 && (
                          <Badge>{thread.unread_count} new</Badge>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrevPage}
                onClick={() => setPage((current) => current - 1)}
              >
                Newer
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Older
              </Button>
            </div>
          )}
        </div>

        <div className="flex min-h-[32rem] flex-col rounded-xl border">
          {!selected ? (
            <Empty className="m-auto border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquare />
                </EmptyMedia>
                <EmptyTitle>Pick a conversation</EmptyTitle>
                <EmptyDescription>
                  Choose a thread on the left, or start a new one.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : historyLoading ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-2/3" />
              ))}
            </div>
          ) : historyError ? (
            <p className="p-3 text-sm text-destructive">
              {historyError.message}
            </p>
          ) : (
            <ThreadConversation
              messages={messages}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              sending={sending}
              currentUserId={userId}
              heading={
                selected.participantName ??
                (role === "admin" ? "Staff member" : "Administrator")
              }
              badge={
                selected.issueId ? (
                  <Badge variant="outline" className="mt-1">
                    About an issue
                  </Badge>
                ) : (
                  <Badge variant="ghost" className="mt-1">
                    General thread
                  </Badge>
                )
              }
            />
          )}
        </div>
      </div>

      <NewThreadDialog
        open={starting}
        onOpenChange={setStarting}
        role={role}
        onCreated={handleCreated}
      />
    </div>
  );
};

export default MessagesView;
