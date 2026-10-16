export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatRequest = { model: string; messages: ChatMessage[] };
export type ModelList = { models: { id: string }[]; defaultModel: string | null };
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "done"; finishReason: string | null }
  | { type: "error"; message: string };
