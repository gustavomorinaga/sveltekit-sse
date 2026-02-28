// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export interface SSEOptions<TTopics extends Record<string, any>> {
  topics: { [K in keyof TTopics]?: (data: TTopics[K]) => void };
  reconnectWait?: number;
  autoConnect?: boolean;
  debug?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export class SSEClient<TTopics extends Record<string, any>> {
  status = $state<"idle" | "connecting" | "connected" | "error">("idle");
  error = $state<Error | null>(null);

  readonly #baseURL: string;
  readonly #options: SSEOptions<TTopics>;
  #eventSource: EventSource | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(baseURL: string, options: SSEOptions<TTopics>) {
    this.#baseURL = baseURL;
    this.#options = { reconnectWait: 3000, autoConnect: true, ...options };

    if (this.#options.autoConnect) this.status = "connecting";

    this.#log("SSEClient initialized", { baseURL, options });

    $effect(() => {
      if (this.#options.autoConnect) this.connect();
      return () => this.close();
    });
  }

  connect = () => {
    this.close();

    this.status = "connecting";

    const topicsKeys = Object.keys(this.#options.topics);
    const url = new URL(this.#baseURL, location.origin);
    for (const topic of topicsKeys) url.searchParams.append("topics", topic);

    this.#log("Connecting to SSE", { url: url.toString(), topics: topicsKeys });

    this.#eventSource = new EventSource(url.toString());

    this.#eventSource.onopen = () => {
      this.status = "connected";
      this.error = null;
      this.#log("SSE connection opened");
    };

    const topicsEntries = Object.entries(this.#options.topics) as [
      keyof TTopics,
      (data: TTopics[keyof TTopics]) => void,
    ][];
    for (const [topic, callback] of topicsEntries) {
      this.#eventSource.addEventListener(topic as string, (event) => {
        try {
          const parsedData: TTopics[keyof TTopics] = JSON.parse(event.data);
          this.#log(`Event received on topic "${topic as string}"`, parsedData);
          callback(parsedData);
        } catch (err) {
          console.error("[SSE] Failed to parse message data:", err);
        }
      });
    }

    this.#eventSource.onerror = () => this.#handleError();
  };

  close = () => {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    if (this.#eventSource) {
      this.#eventSource.close();
      this.#eventSource = null;
      this.#log("SSE connection closed");
    }
    this.status = "idle";
  };

  #handleError() {
    this.status = "error";
    this.error = new Error("Connection lost. Attempting to reconnect...");
    this.#log("SSE connection error", {
      reconnectIn: `${this.#options.reconnectWait}ms`,
    });
    this.close();
    this.#reconnectTimer = setTimeout(
      this.connect,
      this.#options.reconnectWait
    );
  }

  #log(message: string, data?: unknown) {
    if (!this.#options.debug) return;
    console.log(`[SSE] ${message}`, data ?? "");
  }
}
