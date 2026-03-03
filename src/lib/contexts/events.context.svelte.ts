import { getContext, setContext } from "svelte";

import { dev } from "$app/environment";
import { resolve } from "$app/paths";
import { SSEClient } from "$lib/hooks/sse.hook.svelte";
import type { ChatMessage, Notification, SSETopicsMap } from "$lib/ts";

const NOTIFICATIONS_LIMIT = 5;

class EventsContext {
  readonly stream = new SSEClient<SSETopicsMap>(resolve("/api/events"), {
    debug: dev,
    topics: {
      // Chat Events
      message: (data) => this.chat.unshift(data),
      prompt: (data) => (this.expectedPrompt = data.text),
      end: (data) => {
        // Check if the last message is already an end message to avoid duplicates (can happen on reconnect)
        const lastMessage = this.chat.at(0);
        const isDuplicateEndMessage =
          lastMessage?.sender === "System" && lastMessage.text === data.text;
        if (isDuplicateEndMessage) return;

        this.chat.unshift(data);
        this.ended = true;
      },
      history: (data) => {
        // Restore chat history (reverse to maintain chronological order)
        this.chat = [...data].reverse();
      },
      // Notifications Events
      notifications: (data) => {
        this.notifications.unshift(data);
        if (this.notifications.length > NOTIFICATIONS_LIMIT) {
          this.notifications.pop();
        }
      },
    },
  });

  // Chat

  chat = $state<ChatMessage[]>([]);
  expectedPrompt = $state<string | null>(null);
  ended = $state<boolean>(false);

  sendPrompt = async () => {
    if (!this.expectedPrompt) return;

    const promptText = this.expectedPrompt;

    this.chat.unshift({
      id: crypto.randomUUID(),
      sender: "Player",
      text: this.expectedPrompt,
      isMe: true,
    });

    this.expectedPrompt = null;

    await fetch(resolve("/api/chat"), {
      method: "POST",
      body: JSON.stringify({
        action: "send_prompt",
        message: promptText,
      }),
    });
  };

  resetChat = async () => {
    this.chat = [];
    this.expectedPrompt = null;
    this.ended = false;

    await fetch(resolve("/api/chat"), {
      method: "POST",
      body: JSON.stringify({ action: "reset" }),
    });
  };

  // Notifications

  notifications = $state<Notification[]>([]);
}

const EVENTS_CONTEXT_KEY = Symbol("events");

export function setEventsContext() {
  return setContext(EVENTS_CONTEXT_KEY, new EventsContext());
}

export function getEventsContext() {
  return getContext<ReturnType<typeof setEventsContext>>(EVENTS_CONTEXT_KEY);
}
