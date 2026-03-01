import { json } from "@sveltejs/kit";

import { getSession, playStory } from "$lib/server/story-engine";

export const POST = async ({ cookies, request }) => {
  const sessionID = cookies.get("story_session");
  if (!sessionID) return json({ error: "Session not found" }, { status: 401 });

  const body = await request.json();
  const session = getSession(sessionID);

  if (body.action === "send_prompt") {
    // Add player's response to history
    if (body.message) {
      session.history.push({
        id: crypto.randomUUID(),
        sender: "Player",
        text: body.message,
        isMe: true,
      });
    }

    session.step++;
    playStory(sessionID);
    return json({ success: true });
  }

  if (body.action === "reset") {
    if (session.timeoutID) clearTimeout(session.timeoutID);
    session.step = 0;
    session.history = [];
    playStory(sessionID);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};
