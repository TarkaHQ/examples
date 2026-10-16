import { createParser } from "eventsource-parser";

/** SSE events need not align with network chunks or UTF-8 character boundaries. */
export async function* readSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const pending: string[] = [];
  const parser = createParser({
    onEvent: (event) => pending.push(event.data),
    maxBufferSize: 1_048_576,
  });
  try {
    while (true) {
      const { value, done } = await reader.read();
      parser.feed(done ? decoder.decode() : decoder.decode(value, { stream: true }));
      while (pending.length) yield pending.shift()!;
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
