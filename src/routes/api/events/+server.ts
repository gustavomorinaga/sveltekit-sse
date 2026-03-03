import { setTopicSubscription } from "$lib/server/history";
import { produceSSE } from "$lib/server/sse";
import {
  createEmitWithHistory,
  handleChatTopics,
  replayMissedMessages,
  setupLogsPolling,
  setupNotificationsPolling,
} from "$lib/server/sse-helpers";
import { getSession } from "$lib/server/story-engine";
import type { SSETopicsMap } from "$lib/ts";

export const GET = ({ cookies, request, url }) => {
  const requestedTopics = url.searchParams.getAll("topics");

  /**
   * Last-Event-ID resolution — two sources, in priority order:
   *
   * 1. `last-event-id` request header  → browser auto-reconnect (native EventSource)
   * 2. `?lastEventId=` query param     → manual reconnect when topics change
   *    (the client tracks the last ID and appends it when opening a new
   *    EventSource with a different topic set, because the browser only
   *    preserves Last-Event-ID across reconnects of the *same* EventSource
   *    instance)
   */
  const lastEventID =
    request.headers.get("last-event-id") ?? url.searchParams.get("lastEventID");

  let sessionID = cookies.get("story_session");
  if (!sessionID) {
    sessionID = crypto.randomUUID();
    cookies.set("story_session", sessionID, { path: "/", httpOnly: true });
  }

  const connectionType = lastEventID ? "RECONNECT" : "NEW";
  console.log(
    `[SSE] ${connectionType} connection for session ${sessionID}`,
    lastEventID
      ? `Last-Event-ID: ${lastEventID} | topics: [${requestedTopics.join(", ")}]`
      : `topics: [${requestedTopics.join(", ")}]`
  );

  return produceSSE<SSETopicsMap>((emit) => {
    const session = getSession(sessionID);
    const emitWithHistory = createEmitWithHistory({ sessionID, emit });

    session.emitter = emitWithHistory;

    // Replay missed messages if reconnecting (topic-safety-aware)
    if (lastEventID) {
      replayMissedMessages({ sessionID, lastEventID, requestedTopics, emit });
    }

    // Persist current topic subscription so the NEXT reconnect can detect
    // newly-added topics and trigger full-rewind for those topics only.
    setTopicSubscription(sessionID, requestedTopics);

    // Handle chat topics
    const chatTopics = ["message", "prompt", "end", "history"];
    const isChatTopicRequested = requestedTopics.some((topic) =>
      chatTopics.includes(topic)
    );

    if (isChatTopicRequested) {
      handleChatTopics({ sessionID, lastEventID, emitWithHistory, request });
    }

    // Setup polling for stream-based topics
    const notificationsInterval = setupNotificationsPolling({
      requestedTopics,
      emitWithHistory,
    });

    const logsInterval = setupLogsPolling({ requestedTopics, emitWithHistory });

    // Cleanup on disconnect
    return () => {
      if (session.timeoutID) clearTimeout(session.timeoutID);
      clearInterval(notificationsInterval);
      clearInterval(logsInterval);
    };
  });
};
