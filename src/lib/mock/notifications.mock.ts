import type { Notification } from "$lib/ts";

type CoreNotification = Omit<Notification, "id" | "timestamp">;

export const MOCK_NOTIFICATIONS: CoreNotification[] = [
  {
    message: "Alert: High CPU usage detected",
    type: "error",
  },
  {
    message: "Error: Failed to connect to database",
    type: "error",
  },
  {
    message: "New comment on your post",
    type: "info",
  },
  {
    message: "New order received: Order #1234",
    type: "info",
  },
  {
    message: "System backup completed",
    type: "info",
  },
  {
    message: "User X just logged in",
    type: "info",
  },
];
