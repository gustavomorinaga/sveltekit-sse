import { produceSSE } from "$lib/server/sse";
import {
  createEmitWithHistory,
  handleChatTopics,
  replayMissedMessages,
  setupNotificationsPolling,
} from "$lib/server/sse-helpers";
import { getSession } from "$lib/server/story-engine";
import type { SSETopicsMap } from "$lib/ts";

export const GET = ({ cookies, request, url }) => {
  const requestedTopics = url.searchParams.getAll("topics");
  const lastEventID = request.headers.get("last-event-id");

  let sessionID = cookies.get("story_session");
  if (!sessionID) {
    sessionID = crypto.randomUUID();
    cookies.set("story_session", sessionID, { path: "/", httpOnly: true });
  }

  console.log(
    `[SSE] Connection ${lastEventID ? "RECONNECT" : "NEW"} for session ${sessionID}`,
    lastEventID ? `Last-Event-ID: ${lastEventID}` : "No Last-Event-ID header"
  );

  return produceSSE<SSETopicsMap>((emit) => {
    const session = getSession(sessionID);
    const emitWithHistory = createEmitWithHistory({ sessionID, emit });

    session.emitter = emitWithHistory;

    // Replay missed messages if reconnecting
    if (lastEventID) {
      replayMissedMessages({ sessionID, lastEventID, requestedTopics, emit });
    }

    // Handle chat topics
    const chatTopics = ["message", "prompt", "end", "history"];
    const isChatTopicRequested = requestedTopics.some((topic) =>
      chatTopics.includes(topic)
    );

    if (isChatTopicRequested) {
      handleChatTopics({ sessionID, lastEventID, emitWithHistory, request });
    }

    // Setup notifications polling
    const notificationsInterval = setupNotificationsPolling({
      requestedTopics,
      emitWithHistory,
    });

    // Cleanup on disconnect
    return () => {
      if (session.timeoutID) clearTimeout(session.timeoutID);
      clearInterval(notificationsInterval);
    };
  });
};
