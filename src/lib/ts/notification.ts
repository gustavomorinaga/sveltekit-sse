export interface Notification {
  id: string;
  message: string;
  type: "info" | "error";
  timestamp: string;
}
