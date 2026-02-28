import { getContext, setContext } from "svelte";

import { resolve } from "$app/paths";
import { SSEClient } from "$lib/hooks/sse.hook.svelte";
import type { ChatMessage, Notification, SSETopicsMap } from "$lib/ts";

const NOTIFICATIONS_LIMIT = 10;

export class EventsContext {
  readonly streams = new SSEClient<SSETopicsMap>(resolve("/api/events"), {
    topics: {
      chat: (data) => {
        this.chat.unshift(data);
      },
      notifications: (data) => {
        this.notifications.unshift(data);
        if (this.notifications.length > NOTIFICATIONS_LIMIT) {
          this.notifications.pop();
        }
      },
    },
  });

  chat = $state<ChatMessage[]>([]);
  notifications = $state<Notification[]>([]);
}

const EVENTS_CONTEXT_KEY = Symbol("events");

export function setEventsContext() {
  return setContext(EVENTS_CONTEXT_KEY, new EventsContext());
}

export function getEventsContext() {
  return getContext<ReturnType<typeof setEventsContext>>(EVENTS_CONTEXT_KEY);
}
