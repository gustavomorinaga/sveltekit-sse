import { getContext, setContext } from "svelte";
import { SvelteSet } from "svelte/reactivity";

import { dev } from "$app/environment";
import { resolve } from "$app/paths";
import { SSEClient } from "$lib/hooks/sse.hook.svelte";
import type {
  ChatMessage,
  LogEntry,
  Notification,
  SSETopicsMap,
} from "$lib/ts";

const NOTIFICATIONS_LIMIT = 5;
const LOGS_LIMIT = 30;

// ─── Topic groups ──────────────────────────────────────────────────────────

/** Non-chat topics that can be added/removed at runtime */
const STREAM_TOPICS = ["notifications", "logs"] as const;

type StreamTopic = (typeof STREAM_TOPICS)[number];

class EventsContext {
  /**
   * Centralized SSE client instance for the entire app. The connection is opened
   * immediately but the subscribed topics can be dynamically updated via the
   * `toggleTopic` method, which updates the topic handlers and triggers the
   * server-side topic safety analysis and history replay as needed.
   */
  readonly stream = new SSEClient<SSETopicsMap>(resolve("/api/events"), {
    debug: dev,
    topics: this.#buildTopicHandlers(["notifications", "logs"]),
  });

  /**
   * Reactive set of currently subscribed non-chat topics.
   * The chat topics are always active. Use `toggleTopic` to add/remove
   * notifications or logs and watch the server replay history correctly.
   *
   * Uses `SvelteSet` (svelte/reactivity) instead of a native `Set` because
   * Svelte 5 does NOT deep-proxy Set mutations (.add / .delete). A plain
   * `$state<Set>` only reacts to full reassignments, not in-place mutations.
   */
  activeTopics = new SvelteSet<StreamTopic>(["notifications", "logs"]);

  // ─── Chat ─────────────────────────────────────────────────────────────────

  chat = $state<ChatMessage[]>([]);
  expectedPrompt = $state<string | null>(null);
  ended = $state<boolean>(false);

  // ─── Notifications ────────────────────────────────────────────────────────

  notifications = $state<Notification[]>([]);

  // ─── Logs ─────────────────────────────────────────────────────────────────

  logs = $state<LogEntry[]>([]);

  // ─── Topic handlers factory ───────────────────────────────────────────────

  /**
   * Builds the topic-handler map for the SSEClient.
   * Always includes the full set of chat topics plus whatever stream topics
   * are requested.
   */
  #buildTopicHandlers(
    streamTopics: StreamTopic[]
  ): Partial<{ [K in keyof SSETopicsMap]: (data: SSETopicsMap[K]) => void }> {
    const handlers: Partial<{
      [K in keyof SSETopicsMap]: (data: SSETopicsMap[K]) => void;
    }> = {
      // ── Chat handlers (always active) ──────────────────────────────────
      message: (data) => this.chat.unshift(data),
      prompt: (data) => (this.expectedPrompt = data.text),
      end: (data) => {
        const lastMessage = this.chat.at(0);
        const isDuplicate =
          lastMessage?.sender === "System" && lastMessage.text === data.text;
        if (isDuplicate) return;
        this.chat.unshift(data);
        this.ended = true;
      },
      history: (data) => {
        this.chat = [...data].reverse();
      },
    };

    // ── Optional stream handlers ──────────────────────────────────────────
    if (streamTopics.includes("notifications")) {
      handlers.notifications = (data) => {
        this.notifications.unshift(data);
        if (this.notifications.length > NOTIFICATIONS_LIMIT) {
          this.notifications.pop();
        }
      };
    }

    if (streamTopics.includes("logs")) {
      handlers.logs = (data) => {
        this.logs.unshift(data);
        if (this.logs.length > LOGS_LIMIT) this.logs.pop();
      };
    }

    return handlers;
  }

  // ─── Dynamic topic management ─────────────────────────────────────────────

  /**
   * Toggles a stream topic subscription on or off.
   *
   * If the topic is currently active it is removed from the subscription and
   * the connection is updated.  If it is not active it is added.
   *
   * When a topic is ADDED the server will detect the new topic via the
   * `analyzeTopicSafety` mechanism and replay its full history before resuming
   * the delta stream.
   */
  toggleTopic = (topic: StreamTopic) => {
    if (this.activeTopics.has(topic)) this.activeTopics.delete(topic);
    else this.activeTopics.add(topic);

    const nextTopics = [...this.activeTopics] as StreamTopic[];

    this.stream.updateTopics({
      nextTopics: this.#buildTopicHandlers(nextTopics),
    });
  };

  // ─── Chat actions ─────────────────────────────────────────────────────────

  sendPrompt = async () => {
    if (!this.expectedPrompt) return;

    const promptText = this.expectedPrompt;

    this.chat.unshift({
      id: crypto.randomUUID(),
      sender: "Player",
      text: promptText,
      isMe: true,
    });

    this.expectedPrompt = null;

    await fetch(resolve("/api/chat"), {
      method: "POST",
      body: JSON.stringify({ action: "send_prompt", message: promptText }),
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
}

const EVENTS_CONTEXT_KEY = Symbol("events");

export function setEventsContext() {
  return setContext(EVENTS_CONTEXT_KEY, new EventsContext());
}

export function getEventsContext() {
  return getContext<ReturnType<typeof setEventsContext>>(EVENTS_CONTEXT_KEY);
}
