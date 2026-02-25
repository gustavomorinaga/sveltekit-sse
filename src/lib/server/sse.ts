const KEEP_ALIVE_INTERVAL_DURATION = 15_000;

type SSEEmitter = (eventName: string, data: unknown) => void;
type SSEProducer = (emit: SSEEmitter) => () => void;

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
 *       emit('message', { timestamp: Date.now() });
 *     }, 1000);
 *
 *     return () => clearInterval(interval);
 *   });
 * }
 * ```
 */
export function produceSSE(producer: SSEProducer): Response {
  const encoder = new TextEncoder();
  let keepAliveInterval: ReturnType<typeof setInterval>;
  let cleanup: () => void;

  const stream = new ReadableStream({
    start(controller) {
      const emit: SSEEmitter = (eventName, data) => {
        try {
          const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
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
