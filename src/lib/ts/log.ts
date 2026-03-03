export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  source: string;
}
