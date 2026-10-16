import "server-only";
import { readSSE } from "@/lib/sse";
import type { ChatEvent, ChatRequest, ModelList } from "@/lib/types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: string) {
    super(message);
  }
}

const MAX_BODY_BYTES = 128 * 1024;
export const REQUEST_TIMEOUT_MS = 120_000;

function configuration() {
  const key = process.env.TARKA_API_KEY;
  if (!key || key === "tk_live_replace_me") {
    throw new ApiError(503, "Set TARKA_API_KEY in the server's .env.local file to start chatting.");
  }
  return { key, baseUrl: (process.env.TARKA_API_BASE_URL || "https://tarka.rest/v1").replace(/\/+$/, "") };
}

async function tarkaFetch(path: string, signal: AbortSignal, body?: unknown) {
  const { key, baseUrl } = configuration();
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Do not forward provider error bodies or headers that might contain secrets.
    if (response.status === 429) {
      const retry = response.headers.get("Retry-After");
      throw new ApiError(429, "Tarka is busy or a usage limit was reached. Wait a moment and retry.", retry && /^\d{1,6}$/.test(retry) ? retry : undefined);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(503, "The server's Tarka key cannot access this model. Check its scopes and model permissions.");
    }
    if (response.status === 400 || response.status === 413) {
      throw new ApiError(400, "This model could not accept the conversation. Try a shorter message, a new chat, or another model.");
    }
    if (response.status === 404) throw new ApiError(400, "This model is no longer available. Reload the page to refresh the model list.");
    throw new ApiError(502, "Tarka could not complete the request. Please retry in a moment.");
  }
  return response;
}

export async function getModels(signal: AbortSignal): Promise<ModelList> {
  const response = await tarkaFetch("/models", signal);
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new ApiError(502, "Tarka returned an invalid model list.");
  // The app's key must be restricted to streaming chat aliases; runtime discovery
  // is OpenAI-shaped and does not guarantee modality/capability metadata.
  const ids = [...new Set<string>(payload.data.flatMap((model: { id?: unknown }) =>
    typeof model?.id === "string" && model.id ? [model.id] : [],
  ))].sort();
  const preferred = process.env.TARKA_DEFAULT_MODEL || "qwen3.8-flash-next";
  return { models: ids.map((id) => ({ id })), defaultModel: ids.includes(preferred) ? preferred : ids[0] ?? null };
}

export async function readChatRequest(request: Request): Promise<ChatRequest> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Send the conversation as JSON.");
  }
  if (!request.body) throw new ApiError(400, "A conversation is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new ApiError(413, "This conversation is too large. Start a new chat.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "The conversation is not valid JSON.");
  }
  if (
    !data || typeof data.model !== "string" || !data.model.trim() || data.model.length > 200 ||
    !Array.isArray(data.messages) || data.messages.length === 0 || data.messages.length > 100 ||
    !data.messages.every((message: Record<string, unknown> | null) =>
      message && (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" && message.content.trim().length > 0,
    ) || data.messages.at(-1)?.role !== "user"
  ) throw new ApiError(400, "Send a model and up to 100 non-empty user/assistant messages, ending with a user message.");
  // Only these fields may cross the inference boundary (no browser-supplied tools,
  // system prompts, generation settings, credentials, or upstream URLs).
  return { model: data.model, messages: data.messages.map(({ role, content }: ChatRequest["messages"][number]) => ({ role, content })) };
}

export async function openCompletion(input: ChatRequest, signal: AbortSignal) {
  const { models } = await getModels(signal);
  if (!models.some(({ id }) => id === input.model)) throw new ApiError(400, "This model is unavailable. Reload the page and choose another model.");
  const response = await tarkaFetch("/chat/completions", signal, { ...input, stream: true, max_tokens: 1024 });
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    await response.body?.cancel();
    throw new ApiError(502, "Tarka did not return a chat stream. Please try another model.");
  }
  return response.body;
}

/** Reduce provider SSE to a small, safe browser protocol. */
export async function* completionEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  let finishReason: string | null = null;
  let hasText = false;
  for await (const data of readSSE(body)) {
    if (data === "[DONE]") {
      if (!hasText) throw new Error("Empty completion");
      yield { type: "done", finishReason };
      return;
    }
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error("Provider stream error");
    const choice = chunk.choices?.[0];
    if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    const content = choice?.delta?.content;
    if (typeof content === "string" && content) {
      hasText = true;
      yield { type: "text", text: content };
    }
  }
  throw new Error("Incomplete provider stream");
}

export function errorResponse(error: unknown) {
  const known = error instanceof ApiError;
  const timeout = error instanceof Error && error.name === "TimeoutError";
  return Response.json({ error: { message: known ? error.message : timeout ? "Tarka took too long to respond. Please retry." : "Could not reach Tarka. Please retry in a moment." } }, {
    status: known ? error.status : timeout ? 504 : 502,
    headers: { "Cache-Control": "no-store", ...(known && error.retryAfter ? { "Retry-After": error.retryAfter } : {}) },
  });
}
