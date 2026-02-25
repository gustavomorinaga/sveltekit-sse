export interface SSEOptions<T> {
  eventName?: string;
  reconnectWait?: number;
  autoConnect?: boolean;
  onMessage?: (data: T) => void;
}

/**
 * Manages a client-side Server-Sent Events (SSE) connection with reactive state,
 * automatic reconnection, and typed message parsing.
 *
 * @typeParam T - The shape of parsed SSE message data.
 *
 * @remarks
 * - Uses `EventSource` to establish a connection to the provided URL.
 * - Parses incoming event data as JSON and updates `data`.
 * - Automatically reconnects on error after `reconnectWait`.
 *
 * @example
 * ```ts
 * const client = new SSEClient<MyPayload>("/api/stream", {
 *   eventName: "message",
 *   reconnectWait: 5000,
 *   onMessage: (payload) => console.log(payload),
 * });
 * ```
 */
export class SSEClient<T> {
  data = $state<T | null>(null);
  status = $state<"idle" | "connecting" | "connected" | "error">("idle");
  error = $state<Error | null>(null);

  readonly #url: string;
  readonly #options: Required<SSEOptions<T>>;
  #eventSource: EventSource | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, options: SSEOptions<T> = {}) {
    this.#url = url;
    this.#options = {
      eventName: "message",
      reconnectWait: 3000,
      autoConnect: true,
      ...options,
    } as Required<SSEOptions<T>>;

    if (this.#options.autoConnect) this.status = "connecting";

    $effect(() => {
      if (this.#options.autoConnect) this.connect();
      return () => this.close();
    });
  }

  connect = () => {
    this.close();

    this.status = "connecting";
    this.#eventSource = new EventSource(this.#url);

    this.#eventSource.onopen = () => {
      this.status = "connected";
      this.error = null;
    };

    this.#eventSource.addEventListener(this.#options.eventName, (event) => {
      try {
        this.data = JSON.parse(event.data) as T;
        this.#options.onMessage?.(this.data);
      } catch (error) {
        this.error = new Error(
          `Error parsing SSE data: ${(error as Error).message}`
        );
      }
    });

    this.#eventSource.onerror = () => {
      this.#handleError();
    };
  };

  close = () => {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    if (this.#eventSource) {
      this.#eventSource.close();
      this.#eventSource = null;
    }
    this.status = "idle";
  };

  #handleError() {
    this.status = "error";
    this.error = new Error("Connection lost. Attempting to reconnect...");

    this.close();

    this.#reconnectTimer = setTimeout(
      () => this.connect(),
      this.#options.reconnectWait
    );
  }
}
