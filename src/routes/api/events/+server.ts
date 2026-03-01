import { SCRIPT } from "$lib/mock/chat.mock";
import { MOCK_NOTIFICATIONS } from "$lib/mock/notifications.mock";
import { produceSSE } from "$lib/server/sse";
import { getSession, playStory } from "$lib/server/story-engine";
import type { SSETopicsMap } from "$lib/ts";

const POLLING_DELAY = 3000;

export const GET = ({ cookies, request, url }) => {
  // Extract the requested channels/topics from URL query params
  const requestedTopics = url.searchParams.getAll("topics");

  let sessionID = cookies.get("story_session");
  if (!sessionID) {
    sessionID = crypto.randomUUID();
    cookies.set("story_session", sessionID, { path: "/", httpOnly: true });
  }

  return produceSSE<SSETopicsMap>((emit) => {
    const session = getSession(sessionID);
    session.emitter = emit;

    const chatTopics = ["message", "prompt", "end", "history"];
    const isChatTopicRequested = requestedTopics.some((topic) =>
      chatTopics.includes(topic)
    );

    if (isChatTopicRequested) {
      // Send chat history to restore session
      if (session.history.length > 0) emit("history", session.history);

      // Check if current step is a prompt (waiting for player input)
      const currentNode = SCRIPT[session.step];
      const isWaitingForPrompt = currentNode?.type === "prompt";

      if (isWaitingForPrompt) {
        // Re-send the prompt if reconnecting while waiting for input
        emit("prompt", {
          id: crypto.randomUUID(),
          sender: "System",
          text: currentNode.text,
        });
      } else {
        // Continue story if not waiting for player input
        playStory(sessionID);
      }

      request.signal.addEventListener("abort", () => {
        console.log(`[SSE] Connection aborted for session ${sessionID}`);
        if (session.timeoutID) clearTimeout(session.timeoutID);
        session.emitter = null;
      });
    }

    const notificationsInterval = setInterval(() => {
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
    return () => {
      if (session.timeoutID) clearTimeout(session.timeoutID);
      clearInterval(notificationsInterval);
    };
  });
};
