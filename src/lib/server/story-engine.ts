import { SCRIPT } from "$lib/mock/chat.mock";
import type { ChatMessage, SSETopicsMap } from "$lib/ts";
import type { SSEEmitter } from "./sse";

interface PlayerSession {
  step: number;
  timeoutID?: ReturnType<typeof setTimeout>;
  emitter: SSEEmitter<SSETopicsMap> | null;
  history: ChatMessage[];
}

export const activeSessions = new Map<string, PlayerSession>();

export function getSession(id: string): PlayerSession {
  if (!activeSessions.has(id)) {
    activeSessions.set(id, { step: 0, emitter: null, history: [] });
  }

  const session = activeSessions.get(id);
  if (!session) throw new Error(`Session ${id} not found`);

  return session;
}

export function playStory(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session?.emitter) return;

  // Clear residual timeouts to prevent parallel execution
  if (session.timeoutID) clearTimeout(session.timeoutID);

  const nextNode = () => {
    if (!session.emitter) return; // Connection might have been closed
    if (session.step >= SCRIPT.length) {
      const endMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "System",
        text: "End of the story.",
      };
      session.history.push(endMessage);
      session.emitter({ event: "end", data: endMessage });
      return;
    }

    const node = SCRIPT[session.step];

    if (node.type === "npc") {
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        sender: node.name,
        text: node.text,
      };
      session.history.push(message);
      session.emitter({ event: "message", data: message });
      session.step++;
      session.timeoutID = setTimeout(nextNode, node.delay);
    } else if (node.type === "prompt") {
      const promptMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "System",
        text: node.text,
      };
      // Don't add prompts to history - they're UI instructions, not chat messages
      session.emitter({ event: "prompt", data: promptMessage });
    }
  };

  nextNode();
}
