"use client";

import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";

// One message. The timestamp carries the read receipt for the other person's
// messages, which is the only place a sender can see that their message landed.
const MessageBubble = ({ message, mine }) => (
  <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
    <div
      className={cn(
        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
        mine ? "bg-primary text-primary-foreground" : "bg-muted",
      )}
    >
      {!mine && (
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">
          {message.sender_name}
        </p>
      )}

      <p className="whitespace-pre-wrap break-words">{message.message_text}</p>

      <p
        className={cn(
          "mt-1 text-[10px]",
          mine ? "text-primary-foreground/70" : "text-muted-foreground",
        )}
      >
        {formatRelative(message.sent_at)}
        {!mine && message.is_read ? " · read" : ""}
      </p>
    </div>
  </div>
);

export default MessageBubble;
