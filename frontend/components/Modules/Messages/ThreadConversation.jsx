"use client";

import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import MessageBubble from "@/components/Modules/Messages/MessageBubble";

export const MAX_MESSAGE_LENGTH = 2000;

// The conversation pane: history, then the composer. Separated from MessagesView so
// the socket wiring stays in one file and this stays a pure function of its props.
const ThreadConversation = ({
  messages,
  draft,
  onDraftChange,
  onSend,
  sending,
  currentUserId,
  heading,
  badge,
  footer,
}) => {
  return (
    <>
      <div className="border-b p-3">
        <p className="text-sm font-medium">{heading}</p>
        {badge}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages in this thread yet.
          </p>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.sender_id === currentUserId}
            />
          ))
        )}
      </div>

      {footer}

      <form
        onSubmit={onSend}
        className="flex items-end gap-2 border-t p-3"
      >
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Write a message"
          aria-label="Message"
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-h-16 resize-none"
          onKeyDown={(event) => {
            // Enter sends and Shift+Enter breaks the line. requestSubmit routes
            // through the same submit handler as the button, so there is one code
            // path rather than two.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || draft.trim().length === 0}
        >
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </>
  );
};

export default ThreadConversation;
