// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export interface SSEOptions<TTopics extends Record<string, any>> {
  topics: { [K in keyof TTopics]?: (data: TTopics[K]) => void };
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

  constructor(baseURL: string, options: SSEOptions<TTopics>) {
    this.#baseURL = baseURL;
    this.#options = { autoConnect: true, ...options };

    if (this.#options.autoConnect) this.status = "connecting";

    this.#log("SSEClient initialized", { baseURL, options });

    $effect(() => {
      if (this.#options.autoConnect) this.connect();
      return () => this.close();
    });
  }

  connect = () => {
    // Don't create multiple connections
    const isConnectionActive =
      this.#eventSource?.readyState === EventSource.OPEN ||
      this.#eventSource?.readyState === EventSource.CONNECTING;
    if (isConnectionActive) {
      this.#log("Connection already active, skipping");
      return;
    }

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

          if (this.#options.debug) {
            this.#log(`Event received on topic "${topic as string}"`, {
              data: parsedData,
              lastEventId: event.lastEventId,
              eventSource_lastEventId: this.#eventSource?.url,
            });
          }

          callback(parsedData);
        } catch (error) {
          console.error("[SSE] Failed to parse message data:", error);
        }
      });
    }

    // EventSource natively handles reconnection and sends Last-Event-ID automatically
    // We just update the UI state when there's an error
    this.#eventSource.onerror = (error) => {
      this.status = "error";
      this.error = new Error(
        "Connection lost. Browser will reconnect automatically..."
      );
      this.#log(
        "SSE connection error - browser will auto-reconnect with Last-Event-ID",
        error
      );
    };
  };

  close = () => {
    if (this.#eventSource) {
      this.#eventSource.close();
      this.#eventSource = null;
      this.#log("SSE connection closed");
    }
    this.status = "idle";
  };

  #log(message: string, data?: unknown) {
    if (!this.#options.debug) return;
    console.log(`[SSE] ${message}`, data ?? "");
  }
}
