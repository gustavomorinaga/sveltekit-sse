export interface NPCMessage {
  type: "npc";
  name: string;
  text: string;
  delay: number;
}

export interface PromptMessage {
  type: "prompt";
  text: string;
}

export type StoryNode = NPCMessage | PromptMessage;

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isMe?: boolean;
}
