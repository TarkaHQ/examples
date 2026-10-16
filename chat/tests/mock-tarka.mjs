import { createServer } from "node:http";

// A local upstream fixture, never a live Tarka model. Exercise the actual Next.js
// route and streaming boundary in browser tests, including client disconnects.
createServer(async (req, res) => {
  if (req.url === "/health") return res.end("ok");
  if (req.headers.authorization !== "Bearer test-only-key") {
    res.writeHead(401).end();
    return;
  }
  if (req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ data: [{ id: "qwen3.8-flash-next" }, { id: "himalaya-q8" }] }));
  }
  if (req.url !== "/v1/chat/completions") return res.writeHead(404).end();
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const prompt = body.messages.at(-1).content;
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const text = prompt.includes("slow") ? "A slow reply" : "Hello **friend**.\n\n```js\nconst answer = 42;\n```";
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  const timer = setTimeout(() => {
    res.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  }, prompt.includes("slow") ? 10_000 : 200);
  res.on("close", () => clearTimeout(timer));
}).listen(3101, "127.0.0.1");
