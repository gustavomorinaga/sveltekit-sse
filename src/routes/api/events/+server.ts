import { MOCK_CHAT_MESSAGES } from "$lib/server/mock/chat.mock";
import { MOCK_NOTIFICATIONS } from "$lib/server/mock/notifications.mock";
import { produceSSE } from "$lib/server/sse";
import type { SSETopicsMap } from "$lib/ts";

const POLLING_DELAY = 3000;

export const GET = ({ url }) => {
  // Extract the requested channels/topics from URL query params
  const requestedTopics = url.searchParams.getAll("topics");

  return produceSSE<SSETopicsMap>((emit) => {
    // In a real application, you would subscribe to actual data sources here (e.g., databases, message queues)
    // Simulated example:
    const interval = setInterval(() => {
      // We only emit on the 'chat' channel if the client requested it
      if (requestedTopics.includes("chat")) {
        const randomChatMessage =
          MOCK_CHAT_MESSAGES[
            Math.floor(Math.random() * MOCK_CHAT_MESSAGES.length)
          ];

        emit("chat", {
          id: crypto.randomUUID(),
          ...randomChatMessage,
          timestamp: new Date().toLocaleTimeString(),
        });
      }

      // We only emit on the 'notifications' channel if the client requested it
      if (requestedTopics.includes("notifications")) {
        const randomNotification =
          MOCK_NOTIFICATIONS[
            Math.floor(Math.random() * MOCK_NOTIFICATIONS.length)
          ];

        emit("notifications", {
          id: crypto.randomUUID(),
          ...randomNotification,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    }, POLLING_DELAY);

    // Connection cleanup when the client disconnects
    return () => clearInterval(interval);
  });
};
