import { completionEvents, errorResponse, openCompletion, readChatRequest, REQUEST_TIMEOUT_MS } from "@/lib/server/tarka";
import type { ChatEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 130;

export async function POST(request: Request) {
  const upstream = new AbortController();
  const signal = AbortSignal.any([request.signal, upstream.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  try {
    const input = await readChatRequest(request);
    const body = await openCompletion(input, signal);
    const events = completionEvents(body);
    const encoder = new TextEncoder();
    const encode = (event: ChatEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await events.next();
          if (next.done) controller.close();
          else controller.enqueue(encode(next.value));
        } catch {
          if (!request.signal.aborted && !upstream.signal.aborted) {
            controller.enqueue(encode({ type: "error", message: signal.aborted ? "The reply timed out. You can retry it." : "The reply was interrupted. You can retry it." }));
          }
          controller.close();
          upstream.abort();
        }
      },
      async cancel() {
        upstream.abort();
        await events.return(undefined).catch(() => {});
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    upstream.abort();
    return errorResponse(error);
  }
}
