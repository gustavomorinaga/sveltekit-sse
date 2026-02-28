import type { ChatMessage } from "$lib/ts";

type CoreChatMessage = Omit<ChatMessage, "id" | "timestamp">;

export const MOCK_CHAT_MESSAGES: CoreChatMessage[] = [
  {
    user: "Alice",
    message: "Hey, how's it going?",
  },
  {
    user: "Bob",
    message: "Not bad, just working on the project.",
    isMine: true,
  },
  {
    user: "Charlie",
    message: "Anyone up for a quick meeting later?",
  },
  {
    user: "Alice",
    message: "Sure, what time works for everyone?",
  },
  {
    user: "Bob",
    message: "How about 3 PM?",
    isMine: true,
  },
  {
    user: "Charlie",
    message: "3 PM works for me!",
  },
];
