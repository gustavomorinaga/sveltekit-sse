import type { ChatMessage } from "./chat";
import type { Notification } from "./notification";

/**
 * Centralized mapping of all available SSE topics and their data types.
 * This ensures type safety across the entire SSE implementation.
 */
export interface SSETopicsMap {
  notifications: Notification;
  chat: ChatMessage;
}
