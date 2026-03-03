/**
 * SSE Helper Functions
 *
 * Provides utilities for multi-topic SSE with a Global Sequence ID strategy:
 *
 * 1. `createEmitWithHistory` – wraps the raw emitter so every emission is
 *    persisted to the ring-buffer with a global monotonic ID before being sent.
 *
 * 2. `replayMissedMessages` – smart reconnect handler that understands the
 *    'Topic Safety Problem': if the client is now subscribing to a topic it
 *    was NOT subscribed to before, the Last-Event-ID is not a safe replay
 *    cursor for that topic, so the full history of that topic is replayed
 *    first, followed by the missed messages for all other topics.
 *
 * 3. `handleChatTopics` – drives the interactive chat story engine.
 *
 * 4. `setupNotificationsPolling` – periodic mock notification sender.
 *
 * 5. `setupLogsPolling` – periodic mock log entry sender (new topic demo).
 */

import { MOCK_LOGS } from "$lib/mock/logs.mock";
import { SCRIPT } from "$lib/mock/chat.mock";
import { MOCK_NOTIFICATIONS } from "$lib/mock/notifications.mock";
import {
  analyzeTopicSafety,
  getMessagesSince,
  getSessionHistory,
  pushMessage,
} from "./history";
import type { SSEEmitter } from "./sse";
import { getSession, playStory } from "./story-engine";
import type { SSETopicsMap } from "$lib/ts";

const NOTIFICATIONS_POLLING_DELAY = 3_000;
const LOGS_POLLING_DELAY = 2_000;

// ─── createEmitWithHistory ─────────────────────────────────────────────────

export interface CreateEmitWithHistoryOptions {
  sessionID: string;
  emit: SSEEmitter<SSETopicsMap>;
}

/**
 * Returns a wrapped emitter that automatically persists every message to the
 * session ring-buffer (with a global sequence ID) before sending it over the
 * wire.  The `id:` field written to the SSE stream is the global sequence
 * number, ensuring the browser's `Last-Event-ID` always reflects the most
 * recently seen global position.
 */
export function createEmitWithHistory({
  sessionID,
  emit,
}: CreateEmitWithHistoryOptions): SSEEmitter<SSETopicsMap> {
  return <K extends keyof SSETopicsMap>({
    event,
    data,
  }: {
    event: K;
    data: SSETopicsMap[K];
  }) => {
    const message = pushMessage({ sessionID, topic: String(event), data });
    emit({ event, data, id: message.id });
  };
}

// ─── replayMissedMessages ──────────────────────────────────────────────────

export interface ReplayMissedMessagesOptions {
  sessionID: string;
  /** The raw Last-Event-ID string from the request header or query param */
  lastEventID: string;
  requestedTopics: string[];
  emit: SSEEmitter<SSETopicsMap>;
}

/**
 * Replays missed messages to a reconnecting client, handling the "Topic
 * Safety Problem" automatically.
 *
 * Algorithm:
 * 1. Call `analyzeTopicSafety` to split `requestedTopics` into:
 *    - `safeTopics`  – known from the previous connection → replay from lastSeq+1
 *    - `newTopics`   – added after the last connection → replay ALL history
 * 2. Build a merged, chronologically-ordered list:
 *    - All stored messages that belong to `newTopics` (full rewind)
 *    - All stored messages with globalID > lastEventID that belong to `safeTopics`
 * 3. De-duplicate by ID (a new topic's message may also be > lastSeq) and
 *    emit in insertion order.
 */
export function replayMissedMessages({
  sessionID,
  lastEventID,
  requestedTopics,
  emit,
}: ReplayMissedMessagesOptions): void {
  const { safeTopics, newTopics } = analyzeTopicSafety(
    sessionID,
    requestedTopics
  );

  const allHistory = getSessionHistory(sessionID);
  const missedSince = getMessagesSince(sessionID, lastEventID);

  // Build a set of IDs already queued to avoid duplicates
  const queued = new Set<string>();
  const toReplay: typeof allHistory = [];

  // Full-rewind for topics the client never subscribed to before
  if (newTopics.length > 0) {
    console.log(
      `[SSE] New topics detected [${newTopics.join(", ")}] – full history rewind`
    );
    for (const msg of allHistory) {
      if (!newTopics.includes(msg.topic)) continue;
      if (queued.has(msg.id)) continue;
      queued.add(msg.id);
      toReplay.push(msg);
    }
  }

  // Delta replay for topics that were already known
  for (const msg of missedSince) {
    if (!safeTopics.includes(msg.topic)) continue;
    if (queued.has(msg.id)) continue;
    queued.add(msg.id);
    toReplay.push(msg);
  }

  // Sort merged list by global seq so the client sees events in order
  toReplay.sort(
    (a, b) => Number.parseInt(a.id, 10) - Number.parseInt(b.id, 10)
  );

  console.log(
    `[SSE] Replaying ${toReplay.length} message(s) for session ${sessionID}` +
      ` (new-topic full-rewind: ${newTopics.length > 0 ? newTopics.join(", ") : "none"})`
  );

  for (const msg of toReplay) {
    emit({
      event: msg.topic as keyof SSETopicsMap,
      data: msg.data as SSETopicsMap[keyof SSETopicsMap],
      id: msg.id,
    });
  }
}

// ─── handleChatTopics ──────────────────────────────────────────────────────

export interface HandleChatTopicsOptions {
  sessionID: string;
  lastEventID: string | null;
  emitWithHistory: ReturnType<typeof createEmitWithHistory>;
  request: Request;
}

/**
 * Handles chat-related SSE logic.
 * Manages chat history restoration, prompt handling, and story progression.
 */
export function handleChatTopics({
  sessionID,
  lastEventID,
  emitWithHistory,
  request,
}: HandleChatTopicsOptions): void {
  const session = getSession(sessionID);

  // Send chat history only on first connection (not a reconnect)
  if (!lastEventID && session.history.length > 0) {
    emitWithHistory({ event: "history", data: session.history });
  }

  const currentNode = SCRIPT[session.step];
  const isWaitingForPrompt = currentNode?.type === "prompt";

  if (isWaitingForPrompt) {
    emitWithHistory({
      event: "prompt",
      data: {
        id: crypto.randomUUID(),
        sender: "System",
        text: currentNode.text,
      },
    });
  } else if (!lastEventID) {
    playStory(sessionID);
  }

  request.signal.addEventListener("abort", () => {
    console.log(`[SSE] Connection aborted for session ${sessionID}`);
    if (session.timeoutID) clearTimeout(session.timeoutID);
    session.emitter = null;
  });
}

// ─── setupNotificationsPolling ─────────────────────────────────────────────

export interface SetupNotificationsPollingOptions {
  requestedTopics: string[];
  emitWithHistory: ReturnType<typeof createEmitWithHistory>;
}

/**
 * Sets up periodic polling for mock notifications.
 */
export function setupNotificationsPolling({
  requestedTopics,
  emitWithHistory,
}: SetupNotificationsPollingOptions): ReturnType<typeof setInterval> {
  return setInterval(() => {
    if (!requestedTopics.includes("notifications")) return;

    const randomNotification =
      MOCK_NOTIFICATIONS[Math.floor(Math.random() * MOCK_NOTIFICATIONS.length)];

    emitWithHistory({
      event: "notifications",
      data: {
        id: crypto.randomUUID(),
        ...randomNotification,
        timestamp: new Date().toLocaleTimeString(),
      },
    });
  }, NOTIFICATIONS_POLLING_DELAY);
}

// ─── setupLogsPolling ──────────────────────────────────────────────────────

export interface SetupLogsPollingOptions {
  requestedTopics: string[];
  emitWithHistory: ReturnType<typeof createEmitWithHistory>;
}

/**
 * Sets up periodic polling for mock system log entries.
 * Demonstrates the third topic in the multi-topic SSE system.
 */
export function setupLogsPolling({
  requestedTopics,
  emitWithHistory,
}: SetupLogsPollingOptions): ReturnType<typeof setInterval> {
  return setInterval(() => {
    if (!requestedTopics.includes("logs")) return;

    const randomLog =
      MOCK_LOGS[Math.floor(Math.random() * MOCK_LOGS.length)];

    emitWithHistory({
      event: "logs",
      data: {
        id: crypto.randomUUID(),
        ...randomLog,
        timestamp: new Date().toLocaleTimeString(),
      },
    });
  }, LOGS_POLLING_DELAY);
}
