/**
 * Server-Sent Events History Manager
 *
 * This module manages the history of SSE messages for each session, enabling
 * message recovery when clients reconnect after a connection drop.
 *
 * Key features:
 * - Stores messages per session with unique IDs
 * - Allows retrieval of missed messages since a given ID
 * - Automatically manages memory by limiting history size per session
 * - Provides session cleanup for inactive connections
 */

export interface SSEMessage<T = unknown> {
  /** Unique identifier for this message (monotonically increasing per session) */
  id: string;
  /** The event/topic name */
  topic: string;
  /** The message payload */
  data: T;
  /** Timestamp when the message was created */
  timestamp: number;
}

export interface PushMessageOptions<T = unknown> {
  /** The session identifier */
  sessionID: string;
  /** The event/topic name */
  topic: string;
  /** The message payload */
  data: T;
}

interface SessionHistory {
  /** Sequential messages for this session */
  messages: SSEMessage[];
  /** Counter for generating sequential IDs */
  counter: number;
  /** Last access time for cleanup purposes */
  lastAccess: number;
}

// Configuration
const MAX_MESSAGES_PER_SESSION = 100;
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/** Map of session ID to their message history */
const sessionsHistory = new Map<string, SessionHistory>();

/**
 * Generates a unique message ID for a session.
 * Uses a counter-based approach for predictable ordering.
 */
function generateMessageID(sessionID: string): string {
  const session = getOrCreateSession(sessionID);
  const id = `${sessionID}-${session.counter}`;
  session.counter++;
  return id;
}

/**
 * Gets or creates a session history entry.
 */
function getOrCreateSession(sessionID: string): SessionHistory {
  if (!sessionsHistory.has(sessionID)) {
    sessionsHistory.set(sessionID, {
      messages: [],
      counter: 0,
      lastAccess: Date.now(),
    });
  }

  const session = sessionsHistory.get(sessionID);
  if (!session) throw new Error(`Failed to create session ${sessionID}`);

  session.lastAccess = Date.now();
  return session;
}

/**
 * Adds a message to the session history and returns the message with its ID.
 *
 * @param options - Configuration object containing sessionID, topic, and data
 * @returns The stored message with its unique ID
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any payload
export function pushMessage<T = any>({
  sessionID,
  topic,
  data,
}: PushMessageOptions<T>): SSEMessage<T> {
  const session = getOrCreateSession(sessionID);

  const message: SSEMessage<T> = {
    id: generateMessageID(sessionID),
    topic,
    data,
    timestamp: Date.now(),
  };

  session.messages.push(message);

  // Keep only the most recent messages to avoid memory issues
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages.shift();
  }

  return message;
}

/**
 * Retrieves all messages that were sent after the specified message ID.
 * This is used for message recovery when a client reconnects.
 *
 * @param sessionID - The session identifier
 * @param lastEventID - The ID of the last message the client received
 * @returns Array of messages sent after the given ID, or empty if ID not found
 */
export function getMessagesSince(
  sessionID: string,
  lastEventID: string
): SSEMessage[] {
  const session = sessionsHistory.get(sessionID);
  if (!session) return [];

  session.lastAccess = Date.now();

  // Find the index of the last received message
  const lastIndex = session.messages.findIndex((msg) => msg.id === lastEventID);

  // If the ID is not found (too old or invalid), return empty array
  // The client will receive new messages from this point forward
  if (lastIndex === -1) return [];

  // Return all messages after the last received one
  return session.messages.slice(lastIndex + 1);
}

/**
 * Gets the entire message history for a session.
 * Useful for initial connection to restore state.
 *
 * @param sessionID - The session identifier
 * @returns Array of all stored messages for the session
 */
export function getSessionHistory(sessionID: string): SSEMessage[] {
  const session = sessionsHistory.get(sessionID);
  if (!session) return [];

  session.lastAccess = Date.now();
  return [...session.messages];
}

/**
 * Clears the history for a specific session.
 *
 * @param sessionID - The session identifier
 */
export function clearSessionHistory(sessionID: string): void {
  sessionsHistory.delete(sessionID);
}

/**
 * Cleans up inactive sessions to prevent memory leaks.
 * Automatically runs periodically.
 */
function cleanupInactiveSessions(): void {
  const now = Date.now();
  const sessionsToDelete: string[] = [];

  for (const [sessionId, session] of sessionsHistory.entries()) {
    const inactiveDuration = now - session.lastAccess;
    if (inactiveDuration > SESSION_INACTIVITY_TIMEOUT) {
      sessionsToDelete.push(sessionId);
    }
  }

  for (const sessionID of sessionsToDelete) sessionsHistory.delete(sessionID);

  if (sessionsToDelete.length > 0) {
    console.log(
      `[SSE History] Cleaned up ${sessionsToDelete.length} inactive session(s)`
    );
  }
}

// Start periodic cleanup
setInterval(cleanupInactiveSessions, SESSION_CLEANUP_INTERVAL);

/**
 * Gets statistics about the current history state.
 * Useful for monitoring and debugging.
 */
export function getHistoryStats() {
  const sessions = Array.from(sessionsHistory.entries()).map(
    ([id, session]) => ({
      sessionId: id,
      messageCount: session.messages.length,
      lastAccess: new Date(session.lastAccess).toISOString(),
    })
  );

  return {
    totalSessions: sessionsHistory.size,
    sessions,
  };
}
