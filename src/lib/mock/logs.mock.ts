import type { LogEntry } from "$lib/ts";

type CoreLog = Omit<LogEntry, "id" | "timestamp">;

export const MOCK_LOGS: CoreLog[] = [
  { level: "info", message: "Server started on port 5173", source: "vite" },
  { level: "debug", message: "HMR update applied to +page.svelte", source: "vite" },
  { level: "warn", message: "Deprecated API call detected in auth module", source: "auth" },
  { level: "error", message: "Unhandled rejection: fetch failed for /api/data", source: "fetch" },
  { level: "info", message: "Database connection pool initialized (max: 10)", source: "db" },
  { level: "debug", message: "Cache miss for key user:profile:42", source: "cache" },
  { level: "warn", message: "Memory usage exceeded 80% threshold", source: "monitor" },
  { level: "info", message: "Scheduled job 'cleanup-sessions' executed", source: "cron" },
  { level: "error", message: "Failed to send email notification to user@example.com", source: "mailer" },
  { level: "debug", message: "SSE connection accepted from 127.0.0.1", source: "sse" },
  { level: "info", message: "User session token refreshed successfully", source: "auth" },
  { level: "warn", message: "Rate limit approaching for IP 192.168.1.10", source: "ratelimit" },
];
