export interface ChatMessage {
  id: string;
  user: string;
  message: string;
  isMine?: boolean;
  timestamp: string;
}
