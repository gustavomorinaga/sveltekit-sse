const KEEP_ALIVE_INTERVAL_DURATION = 15_000;

export interface SSEEmitOptions<TTopics, K extends keyof TTopics> {
  /** The event/topic name */
  event: K;
  /** The event data payload */
  data: TTopics[K];
  /** Optional unique ID for message recovery on reconnection */
  id?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export type SSEEmitter<TTopics extends Record<string, any>> = <
  K extends keyof TTopics,
>(
  options: SSEEmitOptions<TTopics, K>
) => void;

// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export type SSEProducer<TTopics extends Record<string, any>> = (
  emit: SSEEmitter<TTopics>
) => () => void;

/**
 * Creates a Server-Sent Events (SSE) response stream.
 *
 * This function sets up a readable stream that produces SSE-formatted events using the provided
 * producer function. It automatically handles keep-alive messages and proper cleanup when the
 * connection is closed.
 *
 * @param producer - A function that receives an emitter callback and returns a cleanup function.
 *                   The emitter is used to send events to the client, and the cleanup function
 *                   is called when the stream is cancelled or closed.
 *
 * @returns A Response object configured for SSE with appropriate headers and a readable stream.
 *
 * @example
 * ```typescript
 * export function GET() {
 *   return produceSSE((emit) => {
 *     const interval = setInterval(() => {
 *       emit({ event: 'message', data: { timestamp: Date.now() } });
 *     }, 1000);
 *
 *     return () => clearInterval(interval);
 *   });
 * }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type needs to accept any shape of topics map
export function produceSSE<TTopics extends Record<string, any>>(
  producer: SSEProducer<TTopics>
): Response {
  const encoder = new TextEncoder();
  let keepAliveInterval: ReturnType<typeof setInterval>;
  let cleanup: () => void;

  const stream = new ReadableStream({
    start(controller) {
      const emit: SSEEmitter<TTopics> = ({ event, data, id }) => {
        try {
          let payload = "";
          if (id) payload += `id: ${id}\n`;
          payload += `event: ${String(event)}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (error) {
          console.error("[SSE] Error emitting event:", error);
        }
      };

      keepAliveInterval = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, KEEP_ALIVE_INTERVAL_DURATION);

      cleanup = producer(emit);
    },
    cancel() {
      clearInterval(keepAliveInterval);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
    },
  });
}
