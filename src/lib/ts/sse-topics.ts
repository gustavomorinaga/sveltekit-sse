import type { ChatMessage } from "./chat";
import type { LogEntry } from "./log";
import type { Notification } from "./notification";

/**
 * Centralized mapping of all available SSE topics and their data types.
 * This ensures type safety across the entire SSE implementation.
 */
export interface SSETopicsMap {
  // Chat-related topics
  message: ChatMessage;
  prompt: ChatMessage;
  end: ChatMessage;
  history: ChatMessage[];
  // Notification-related topics
  notifications: Notification;
  // Log-related topics
  logs: LogEntry;
}
