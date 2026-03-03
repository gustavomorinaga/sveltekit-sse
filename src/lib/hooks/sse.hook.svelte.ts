/**
 * SSE Client Hook
 *
 * Extends the native EventSource with:
 *
 * 1. **Manual `lastEventId` tracking** – when the client deliberately closes
 *    and re-opens a connection (e.g. to add a new topic), the browser creates
 *    a brand-new EventSource object and loses the internally-stored
 *    Last-Event-ID.  We mirror the ID in reactive state and append it as
 *    `?lastEventId=<n>` on every manual reconnect so the server can still
 *    apply its topic-safety replay logic.
 *
 * 2. **`updateTopics`** – atomically replaces the subscribed topic set.
 *    Closes the current connection and re-opens with the new topic list plus
 *    the current `lastEventId`, triggering server-side full-rewind for any
 *    newly-added topic.
 *
 * 3. **Per-topic message counters** – reactive `$state` map so the UI can
 *    display activity badges per topic without extra logic in components.
 *
 * ⚠️  CRITICAL – `$effect` / `untrack` contract:
 *    The `$effect` that calls `connect()` on mount must NOT create reactive
 *    dependencies on any `$state` fields (e.g. `lastEventId`). If it did,
 *    every incoming SSE message that updates `lastEventId` would re-run the
 *    effect, triggering close() + connect() in a tight loop (memory leak).
 *    All reads of `$state` inside `connect()` are wrapped with `untrack()`.
 */

import { untrack } from "svelte";

// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export interface SSEOptions<TTopics extends Record<string, any>> {
  topics: { [K in keyof TTopics]?: (data: TTopics[K]) => void };
  autoConnect?: boolean;
  debug?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export class SSEClient<TTopics extends Record<string, any>> {
  /**
   * The last error encountered by the SSE connection, if any.
   */
  error = $state<Error | null>(null);
  /**
   * The last global sequence ID received from the server.
   * Mirrors the native `EventSource.lastEventId` but survives instance
   * recreations so we can pass it as `?lastEventId=` on manual reconnects.
   */
  lastEventID = $state<string | null>(null);
  /**
   * The current connection status. Useful for the UI to display connection state
   */
  status = $state<"idle" | "connecting" | "connected" | "error">("idle");
  /**
   * Reactive per-topic message counters.
   * Incremented every time a message is received on that topic.
   */
  topicCounters = $state<Record<string, number>>({});

  /**
   * The native EventSource instance.  We keep a reference to call `close()` on it
   */
  readonly #baseURL: string;
  /**
   * The current options, including the subscribed topics and their handlers.
   */
  #options: SSEOptions<TTopics>;
  /**
   * The active EventSource instance, if connected.  We track it to prevent duplicate connections and to call `close()` when needed.
   */
  #eventSource: EventSource | null = null;

  constructor(baseURL: string, options: SSEOptions<TTopics>) {
    this.#baseURL = baseURL;
    this.#options = { autoConnect: true, ...options };

    if (this.#options.autoConnect) this.status = "connecting";
    this.#log("SSEClient initialized", {
      baseURL,
      topics: Object.keys(options.topics),
    });

    $effect(() => {
      // `untrack` ensures the effect body creates NO reactive dependencies.
      // Without it, reading `this.lastEventID` inside `connect()` would make
      // this effect re-run on every received message → reconnect loop.
      if (this.#options.autoConnect) untrack(() => this.connect());
      return () => this.close();
    });
  }

  /**
   * Establishes the SSE connection with the current options.
   * If a connection is already active, it does nothing.
   * Otherwise, it creates a new EventSource, sets up event listeners for the subscribed topics, and handles connection lifecycle events (open, error).
   * The `lastEventID` is included in the connection URL as a query parameter to enable server-side replay on manual reconnects.
   * All reads of reactive state inside this method are wrapped with `untrack()` to prevent unintended reactive dependencies and potential reconnect loops.
   */
  connect = () => {
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

    // On a MANUAL connect (or updateTopics), the browser has no Last-Event-ID
    // because it only tracks that per-EventSource instance. We pass ours so
    // the server can resume correctly and detect newly-added topics.
    // `untrack` prevents this read from creating a dependency in any enclosing
    // $effect — the primary guard against the reconnect-loop bug.
    const lastID = untrack(() => this.lastEventID);
    if (lastID !== null) url.searchParams.set("lastEventID", lastID);

    this.#log("Connecting to SSE", {
      url: url.toString(),
      topics: topicsKeys,
      lastEventId: lastID,
    });

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
          // Mirror the last received global sequence ID
          if (event.lastEventId) this.lastEventID = event.lastEventId;

          // Increment per-topic counter
          const key = topic as string;
          this.topicCounters[key] = (this.topicCounters[key] ?? 0) + 1;

          const parsedData: TTopics[keyof TTopics] = JSON.parse(event.data);

          this.#log(
            `Event on topic "${topic as string}" [id=${event.lastEventId}]`,
            { data: parsedData }
          );

          callback(parsedData);
        } catch (error) {
          console.error("[SSE] Failed to parse message data:", error);
        }
      });
    }

    // EventSource natively handles reconnection and sends Last-Event-ID
    // automatically on browser-initiated retries.
    this.#eventSource.onerror = () => {
      this.status = "error";
      this.error = new Error(
        "Connection lost. Browser will reconnect automatically..."
      );
      this.#log(
        "SSE connection error - browser will auto-reconnect with Last-Event-ID"
      );
    };
  };

  /**
   * Closes the SSE connection if it's active.
   * Sets the status to "idle" and clears the EventSource reference.
   * If no connection is active, it does nothing.
   */
  close = () => {
    if (this.#eventSource) {
      this.#eventSource.close();
      this.#eventSource = null;
      this.#log("SSE connection closed");
    }
    this.status = "idle";
  };

  /**
   * Atomically replaces the subscribed topic set and reconnects.
   *
   * When `addTopics` is provided, the new set is the union of the current
   * topics and the added ones.  When `removeTopics` is provided those are
   * omitted.  You may also supply `nextTopics` directly to replace completely.
   *
   * The current `lastEventId` is automatically included in the new connection
   * URL so the server can perform a topic-safety-aware replay.
   */
  updateTopics = (opts: {
    addTopics?: (keyof TTopics)[];
    removeTopics?: (keyof TTopics)[];
    nextTopics?: { [K in keyof TTopics]?: (data: TTopics[K]) => void };
  }) => {
    const currentTopics = { ...this.#options.topics };

    let nextTopicHandlers: typeof currentTopics;

    if (opts.nextTopics) {
      nextTopicHandlers = opts.nextTopics;
    } else {
      nextTopicHandlers = { ...currentTopics };
      for (const topic of opts.addTopics ?? []) {
        // Keep existing handler or mark as empty (server still sends, client logs)
        if (!(topic in nextTopicHandlers)) {
          // biome-ignore lint/suspicious/noExplicitAny: generic
          (nextTopicHandlers as any)[topic] = undefined;
        }
      }
      for (const topic of opts.removeTopics ?? []) {
        delete nextTopicHandlers[topic];
      }
    }

    if (this.#options.debug) {
      this.#log("Updating topics", {
        from: Object.keys(currentTopics),
        to: Object.keys(nextTopicHandlers),
        lastEventId: this.lastEventID,
      });
    }

    // Swap options BEFORE closing so connect() picks up the new handlers
    this.#options = { ...this.#options, topics: nextTopicHandlers };

    this.close();
    this.connect();
  };

  /**
   * Internal logging method that respects the debug flag in options.
   * Prefixes all logs with [SSE] for easy filtering.
   * Accepts an optional data object for structured logging.
   */
  #log(message: string, data?: unknown) {
    if (!this.#options.debug) return;
    console.log(`[SSE] ${message}`, data ?? "");
  }
}
