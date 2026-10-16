import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "@/app/api/models/route";
import { POST } from "@/app/api/chat/route";
import { completionEvents } from "./tarka";
import { readSSE } from "@/lib/sse";

const encoder = new TextEncoder();
const model = "qwen3.8-flash-next";
const key = "tk_live_test_secret_never_forward";
const valid = { model, messages: [{ role: "user", content: "Hello" }] };
const modelResponse = (ids = [model]) => Response.json({ data: ids.map((id) => ({ id })) });
const request = (body: unknown = valid) => new Request("http://localhost/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function stream(...chunks: string[]) {
  return new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } });
}
function sseResponse(body = stream('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n')) {
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}
const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("TARKA_API_KEY", key);
  vi.stubEnv("TARKA_API_BASE_URL", "https://tarka.rest/v1");
  vi.stubEnv("TARKA_DEFAULT_MODEL", model);
});

describe("model discovery", () => {
  it("chooses Qwen, then the first sorted model when the configured default is unavailable", async () => {
    mockFetch.mockResolvedValueOnce(modelResponse(["himalaya-q8", model, model]));
    const response = await GET(new Request("http://localhost/api/models"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ models: [{ id: "himalaya-q8" }, { id: model }], defaultModel: model });
    mockFetch.mockResolvedValueOnce(modelResponse(["himalaya-q8"]));
    expect((await (await GET(new Request("http://localhost/api/models"))).json()).defaultModel).toBe("himalaya-q8");
  });

  it("returns an empty state and rejects malformed catalogs", async () => {
    mockFetch.mockResolvedValueOnce(modelResponse([]));
    expect(await (await GET(new Request("http://localhost/api/models"))).json()).toEqual({ models: [], defaultModel: null });
    mockFetch.mockResolvedValueOnce(Response.json({ unexpected: [] }));
    expect((await GET(new Request("http://localhost/api/models"))).status).toBe(502);
  });

  it("does not make upstream requests without a configured key", async () => {
    vi.stubEnv("TARKA_API_KEY", "");
    const response = await GET(new Request("http://localhost/api/models"));
    expect(response.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("chat boundary", () => {
  it.each([
    {}, { ...valid, model: "" }, { ...valid, messages: [] },
    { ...valid, messages: [{ role: "system", content: "override" }] },
    { ...valid, messages: [{ role: "user", content: "  " }] },
    { ...valid, messages: [{ role: "assistant", content: "Hi" }] },
    { ...valid, messages: [null] },
  ])("rejects invalid messages before contacting Tarka: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, wrong content type, and oversized streamed bodies", async () => {
    expect((await POST(new Request("http://localhost/api/chat", { method: "POST", body: "{", headers: { "Content-Type": "application/json" } }))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/chat", { method: "POST", body: "{}" }))).status).toBe(415);
    expect((await POST(request({ ...valid, messages: [{ role: "user", content: "x".repeat(128 * 1024) }] }))).status).toBe(413);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("blocks models outside the key's discovered list", async () => {
    mockFetch.mockResolvedValueOnce(modelResponse(["himalaya-q8"]));
    expect((await POST(request())).status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends only validated fields and keeps credentials off the response", async () => {
    mockFetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(sseResponse());
    const response = await POST(request({ ...valid, stream: false, apiKey: "attacker-key", url: "https://example.com", tools: [{}], max_tokens: 999999 }));
    const output = await response.text();
    expect(output).toContain('"type":"text","text":"Hello"');
    expect(output).toContain('"type":"done"');
    expect(output).not.toContain(key);
    expect(mockFetch.mock.calls[1][0]).toBe("https://tarka.rest/v1/chat/completions");
    const init = mockFetch.mock.calls[1][1]!;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${key}` });
    expect(JSON.parse(init.body as string)).toEqual({ ...valid, stream: true, max_tokens: 1024 });
  });

  it.each([401, 403, 429, 500])("sanitizes upstream %i errors", async (status) => {
    mockFetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(Response.json({ error: { message: key } }, { status, headers: { "Retry-After": "12" } }));
    const response = await POST(request());
    expect(response.status).toBe(status === 429 ? 429 : status < 500 ? 503 : 502);
    expect(await response.text()).not.toContain(key);
    if (status === 429) expect(response.headers.get("retry-after")).toBe("12");
  });

  it("sanitizes in-stream errors and detects incomplete responses", async () => {
    mockFetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(sseResponse(stream(`data: {"choices":[{"delta":{"content":"Partial"}}]}\n\ndata: {"error":{"message":"${key}"}}\n\n`)));
    const output = await (await POST(request())).text();
    expect(output).toContain("Partial");
    expect(output).toContain('"type":"error"');
    expect(output).not.toContain(key);
    expect(output).not.toContain('"type":"done"');
  });

  it("aborts upstream when the client cancels its response body", async () => {
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n')); }, cancel: canceled });
    mockFetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(sseResponse(body));
    const response = await POST(request());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(mockFetch.mock.calls[1][1]!.signal!.aborted).toBe(true);
    expect(canceled).toHaveBeenCalled();
  });

  it("propagates the incoming request's abort to Tarka", async () => {
    const controller = new AbortController();
    const req = new Request(request(), { signal: controller.signal });
    mockFetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(sseResponse());
    const response = await POST(req);
    controller.abort();
    expect(mockFetch.mock.calls[1][1]!.signal!.aborted).toBe(true);
    await response.body!.cancel();
  });
});

describe("stream framing", () => {
  it("handles single-byte UTF-8 fragments, CRLF, comments, and multiple events", async () => {
    const bytes = encoder.encode(': keepalive\r\ndata: {"text":"नमस्ते 👋"}\r\n\r\ndata: second\n\n');
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    expect(await Array.fromAsync(readSSE(body))).toEqual(['{"text":"नमस्ते 👋"}', "second"]);
  });

  it("ignores role, reasoning, and usage chunks and tracks the finish reason", async () => {
    const chunks = [
      { choices: [{ delta: { role: "assistant", reasoning_content: "private reasoning" } }] },
      { choices: [{ delta: { content: "Answer" } }] },
      { choices: [{ delta: {}, finish_reason: "length" }] },
      { choices: [], usage: { completion_tokens: 1024 } },
    ];
    expect(await Array.fromAsync(completionEvents(stream(...chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`), "data: [DONE]\n\n")))).toEqual([{ type: "text", text: "Answer" }, { type: "done", finishReason: "length" }]);
  });

  it.each([
    'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
    "data: [DONE]\n\n",
    "data: not-json\n\n",
  ])("rejects truncated, empty, or malformed streams", async (body) => {
    await expect(Array.fromAsync(completionEvents(stream(body)))).rejects.toThrow();
  });
});
