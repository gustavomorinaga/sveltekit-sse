import { produceSSE } from "$lib/server/sse";

const messages = [
  "User X just logged in",
  "New order received: Order #1234",
  "System backup completed",
  "Alert: High CPU usage detected",
  "New comment on your post",
];

export const GET = () => {
  return produceSSE((emit) => {
    const interval = setInterval(() => {
      const randomMessage =
        messages[Math.floor(Math.random() * messages.length)];

      emit("notification", {
        id: crypto.randomUUID(),
        message: randomMessage,
        type: Math.random() > 0.8 ? "error" : "info",
        timestamp: new Date().toLocaleTimeString(),
      });
    }, 3000);

    return () => clearInterval(interval);
  });
};
