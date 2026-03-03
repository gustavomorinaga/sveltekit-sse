/**
 * Server-Sent Events History Manager
 *
 * This module manages the history of SSE messages for each session using a
 * **Global Sequence ID** strategy. Every message emitted to a connection
 * receives a monotonically-increasing integer ID, regardless of topic.
 *
 * This solves the native browser limitation where `EventSource` stores only
 * the single latest `Last-Event-ID`, which would be ambiguous if each topic
 * maintained its own counter.
 *
 * Key features:
 * - Monotonically-increasing global integer IDs per session (e.g. "0", "1", "2")
 * - `getMessagesSince` uses numeric comparison (> lastSeq) instead of exact match
 * - Topic subscription registry: tracks which topics a session was subscribed to
 *   so the reconnect handler can detect newly-added topics and replay their full
 *   history rather than only messages since Last-Event-ID
 * - Automatic memory management (ring buffer per session)
 * - Periodic cleanup of inactive sessions
 */

export interface SSEMessage<T = unknown> {
  /** Global monotonically-increasing integer (as string) for this session */
  id: string;
  /** The event/topic name */
  topic: string;
  /** The message payload */
  data: T;
  /** Unix ms timestamp */
  timestamp: number;
}

export interface PushMessageOptions<T = unknown> {
  sessionID: string;
  topic: string;
  data: T;
}

interface SessionHistory {
  /** All stored messages in insertion order */
  messages: SSEMessage[];
  /** Next ID to assign (starts at 0) */
  nextSeq: number;
  /** Last access time for GC */
  lastAccess: number;
  /** Topics the client was subscribed to on the *last* connection */
  subscribedTopics: string[];
}

// ─── Configuration ─────────────────────────────────────────────────────────
const MAX_MESSAGES_PER_SESSION = 200;
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min
const SESSION_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 min

const sessionsHistory = new Map<string, SessionHistory>();

// ─── Internal helpers ──────────────────────────────────────────────────────

function getOrCreateSession(sessionID: string): SessionHistory {
  let session = sessionsHistory.get(sessionID);
  if (!session) {
    session = {
      messages: [],
      nextSeq: 0,
      lastAccess: Date.now(),
      subscribedTopics: [],
    };
    sessionsHistory.set(sessionID, session);
  }
  session.lastAccess = Date.now();
  return session;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Appends a message to the session ring-buffer and returns the stored record
 * with its assigned global sequence ID.
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type
export function pushMessage<T = any>({
  sessionID,
  topic,
  data,
}: PushMessageOptions<T>): SSEMessage<T> {
  const session = getOrCreateSession(sessionID);

  const message: SSEMessage<T> = {
    id: String(session.nextSeq++),
    topic,
    data,
    timestamp: Date.now(),
  };

  session.messages.push(message);

  // Ring-buffer: evict oldest messages when over capacity
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages.shift();
  }

  return message;
}

/**
 * Returns all messages whose global sequence ID is strictly greater than
 * `lastEventID` (parsed as a non-negative integer).
 *
 * Returns `[]` when:
 * - The session does not exist
 * - `lastEventID` is not a valid integer string
 */
export function getMessagesSince(
  sessionID: string,
  lastEventID: string
): SSEMessage[] {
  const session = sessionsHistory.get(sessionID);
  if (!session) return [];

  session.lastAccess = Date.now();

  const lastSeq = Number.parseInt(lastEventID, 10);
  if (Number.isNaN(lastSeq)) return [];

  return session.messages.filter(
    (msg) => Number.parseInt(msg.id, 10) > lastSeq
  );
}

/**
 * Returns a snapshot of the full message history for `sessionID`.
 * Used when replaying all messages for newly-added topics.
 */
export function getSessionHistory(sessionID: string): SSEMessage[] {
  const session = sessionsHistory.get(sessionID);
  if (!session) return [];
  session.lastAccess = Date.now();
  return [...session.messages];
}

/**
 * Clears the history for a specific session.
 */
export function clearSessionHistory(sessionID: string): void {
  sessionsHistory.delete(sessionID);
}

// ─── Topic Subscription Registry ───────────────────────────────────────────

/**
 * Returns the topic list registered for the last known connection of
 * `sessionID`, or `null` if the session has never connected.
 */
export function getTopicSubscription(sessionID: string): string[] | null {
  const session = sessionsHistory.get(sessionID);
  if (!session) return null;
  return [...session.subscribedTopics];
}

/**
 * Overwrites the tracked topic subscription list for `sessionID`.
 * Call this after a connection is fully set up so subsequent reconnects know
 * which topics were "known" vs "newly-added".
 */
export function setTopicSubscription(
  sessionID: string,
  topics: string[]
): void {
  const session = getOrCreateSession(sessionID);
  session.subscribedTopics = [...topics];
}

/**
 * Returns a breakdown of which requested topics are safe to replay from
 * `lastEventID` (already known) and which require a full history rewind
 * (newly added after the last subscription).
 *
 * **Safe replay**  = only messages with ID > lastEventID
 * **Full replay**  = all available history for that topic
 */
export function analyzeTopicSafety(
  sessionID: string,
  requestedTopics: string[]
): { safeTopics: string[]; newTopics: string[] } {
  const previous = getTopicSubscription(sessionID);

  // No previous subscription record → treat all as safe
  // (caller won't have a lastEventID either, so replay is a no-op anyway)
  if (!previous || previous.length === 0) {
    return { safeTopics: requestedTopics, newTopics: [] };
  }

  const safeTopics = requestedTopics.filter((t) => previous.includes(t));
  const newTopics = requestedTopics.filter((t) => !previous.includes(t));

  return { safeTopics, newTopics };
}

// ─── Diagnostics ───────────────────────────────────────────────────────────

export function getHistoryStats() {
  const sessions = Array.from(sessionsHistory.entries()).map(
    ([id, session]) => ({
      sessionId: id,
      messageCount: session.messages.length,
      nextSeq: session.nextSeq,
      subscribedTopics: session.subscribedTopics,
      lastAccess: new Date(session.lastAccess).toISOString(),
    })
  );
  return { totalSessions: sessionsHistory.size, sessions };
}

// ─── Periodic GC ───────────────────────────────────────────────────────────

function cleanupInactiveSessions(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [id, session] of sessionsHistory.entries()) {
    if (now - session.lastAccess > SESSION_INACTIVITY_TIMEOUT)
      toDelete.push(id);
  }
  for (const id of toDelete) sessionsHistory.delete(id);
  if (toDelete.length > 0) {
    console.log(`[SSE History] Cleaned ${toDelete.length} inactive session(s)`);
  }
}

setInterval(cleanupInactiveSessions, SESSION_CLEANUP_INTERVAL);
