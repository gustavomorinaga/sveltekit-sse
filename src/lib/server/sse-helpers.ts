/**
 * SSE Helper Functions
 *
 * This module provides utility functions for working with Server-Sent Events,
 * including message history tracking, replay functionality, and topic-specific handlers.
 */

import { SCRIPT } from "$lib/mock/chat.mock";
import { MOCK_NOTIFICATIONS } from "$lib/mock/notifications.mock";
import { getMessagesSince, pushMessage } from "./history";
import type { SSEEmitter } from "./sse";
import { getSession, playStory } from "./story-engine";
import type { SSETopicsMap } from "$lib/ts";

const POLLING_DELAY = 3000;

export interface CreateEmitWithHistoryOptions {
  /** The session identifier */
  sessionID: string;
  /** The base SSE emitter function */
  emit: SSEEmitter<SSETopicsMap>;
}

/**
 * Creates an emit function that automatically saves messages to history.
 * This wrapper ensures every emitted message is persisted for potential replay.
 *
 * @param options - Configuration object containing sessionID and emit function
 * @returns A wrapped emitter that saves messages to history
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

export interface ReplayMissedMessagesOptions {
  /** The session identifier */
  sessionID: string;
  /** The ID of the last message the client received */
  lastEventID: string;
  /** List of topics the client is subscribed to */
  requestedTopics: string[];
  /** The SSE emitter function */
  emit: SSEEmitter<SSETopicsMap>;
}

/**
 * Replays missed messages to a reconnecting client.
 * When a client reconnects with a Last-Event-ID, this function retrieves
 * and resends all messages that were sent after that ID.
 *
 * @param options - Configuration object for replaying messages
 */
export function replayMissedMessages({
  sessionID,
  lastEventID,
  requestedTopics,
  emit,
}: ReplayMissedMessagesOptions): void {
  const missedMessages = getMessagesSince(sessionID, lastEventID);
  console.log(
    `[SSE] Replaying ${missedMessages.length} missed message(s) for session ${sessionID}`
  );

  for (const msg of missedMessages) {
    if (!requestedTopics.includes(msg.topic)) continue;

    emit({
      event: msg.topic as keyof SSETopicsMap,
      data: msg.data as SSETopicsMap[keyof SSETopicsMap],
      id: msg.id,
    });
  }
}

export interface HandleChatTopicsOptions {
  /** The session identifier */
  sessionID: string;
  /** The ID of the last message (null for first connection) */
  lastEventID: string | null;
  /** The history-aware emitter function */
  emitWithHistory: ReturnType<typeof createEmitWithHistory>;
  /** The HTTP request object for abort signal handling */
  request: Request;
}

/**
 * Handles chat-related SSE logic.
 * Manages chat history restoration, prompt handling, and story progression.
 *
 * @param options - Configuration object for handling chat topics
 */
export function handleChatTopics({
  sessionID,
  lastEventID,
  emitWithHistory,
  request,
}: HandleChatTopicsOptions): void {
  const session = getSession(sessionID);

  // Send chat history only on first connection
  if (!lastEventID && session.history.length > 0) {
    emitWithHistory({ event: "history", data: session.history });
  }

  // Check if waiting for player input
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
  } else if (!lastEventID) playStory(sessionID);

  request.signal.addEventListener("abort", () => {
    console.log(`[SSE] Connection aborted for session ${sessionID}`);
    if (session.timeoutID) clearTimeout(session.timeoutID);
    session.emitter = null;
  });
}

export interface SetupNotificationsPollingOptions {
  /** List of topics the client is subscribed to */
  requestedTopics: string[];
  /** The history-aware emitter function */
  emitWithHistory: ReturnType<typeof createEmitWithHistory>;
}

/**
 * Sets up periodic polling for notifications.
 * Sends random mock notifications at regular intervals to subscribed clients.
 *
 * @param options - Configuration object for notifications polling
 * @returns An interval ID that can be used to stop the polling
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
  }, POLLING_DELAY);
}
