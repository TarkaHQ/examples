"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readSSE } from "@/lib/sse";
import type { ChatEvent, ChatMessage, ModelList } from "@/lib/types";
import { Icon, Mark } from "./icons";

type Message = ChatMessage & {
  id: string;
  model?: string;
  status: "complete" | "streaming" | "incomplete";
  error?: string;
};

function modelLabel(id: string) {
  if (id === "qwen3.8-flash-next") return "Qwen3.8 Flash Next";
  return id.split("-").map((part) => /^(q\d|bf\d)/.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

async function responseError(response: Response) {
  try {
    const body = await response.json();
    if (typeof body.error?.message === "string") return body.error.message as string;
  } catch { /* A proxy may return a non-JSON failure. */ }
  return "The request failed. Please retry in a moment.";
}

const starters = [
  { icon: "spark" as const, title: "Make it simple", text: "Explain a complex idea", prompt: "Explain how large language models work using a simple everyday analogy." },
  { icon: "pen" as const, title: "Find the words", text: "Give a draft a fresh start", prompt: "Help me write a short, friendly introduction email to a new teammate." },
  { icon: "code" as const, title: "Think in code", text: "Build something useful", prompt: "Show me a small, useful JavaScript function and explain how it works." },
  { icon: "compass" as const, title: "Follow your curiosity", text: "Explore a new perspective", prompt: "Tell me something surprising about the world, and explain why it happens." },
];

export default function Chat() {
  const [models, setModels] = useState<ModelList["models"]>([]);
  const [model, setModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const discovery = useRef<AbortController | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  const loadModels = useCallback(() => {
    discovery.current?.abort();
    const controller = new AbortController();
    discovery.current = controller;
    return fetch("/api/models", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return response.json() as Promise<ModelList>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setModels(data.models);
        setModel((current) => data.models.some(({ id }) => id === current) ? current : data.defaultModel ?? "");
        if (!data.models.length) setModelError("No chat models are available for this key. Check its model permissions, then refresh.");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setModelError(error instanceof Error ? error.message : "Could not load models.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingModels(false);
      });
  }, []);

  useEffect(() => {
    void loadModels();
    return () => { discovery.current?.abort(); active.current?.abort(); };
  }, [loadModels]);

  useEffect(() => {
    if (stickToBottom.current && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = "auto";
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
    }
  }, [draft]);

  async function generate(history: Message[]) {
    if (active.current || !model || loadingModels || modelError) return;
    const controller = new AbortController();
    active.current = controller;
    const id = crypto.randomUUID();
    setBusy(true);
    stickToBottom.current = true;
    setMessages([...history, { id, role: "assistant", content: "", model, status: "streaming" }]);
    const update = (patch: Partial<Message>) => {
      if (active.current === controller) setMessages((current) => current.map((message) => message.id === id ? { ...message, ...patch } : message));
    };
    let content = "";
    let completed = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: history.filter((message) => message.status === "complete").map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (!response.body) throw new Error("The reply stream was empty. Please retry.");
      for await (const data of readSSE(response.body)) {
        const event: ChatEvent = JSON.parse(data);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "text") {
          content += event.text;
          update({ content });
        }
        if (event.type === "done") {
          completed = true;
          update(event.finishReason === "length" ? { status: "incomplete", error: "The reply reached its length limit. Try a more focused question." } : { status: "complete" });
          break;
        }
      }
      if (!completed) throw new Error("The reply was interrupted. You can retry it.");
    } catch (error) {
      update({ status: "incomplete", error: controller.signal.aborted ? "Reply stopped." : error instanceof Error ? error.message : "Something went wrong. Please retry." });
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
        textarea.current?.focus();
      }
    }
  }

  function send() {
    const content = draft.trim();
    if (!content || busy || !model || loadingModels || modelError) return;
    setDraft("");
    void generate([...messages, { id: crypto.randomUUID(), role: "user", content, status: "complete" }]);
  }

  function newChat() {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setMessages([]);
    setDraft("");
    stickToBottom.current = true;
    textarea.current?.focus();
  }

  const ready = !!model && !loadingModels && !modelError;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={newChat} aria-label="Tarka Chat home"><Mark /><span>Tarka <span className="brand-light">Chat</span></span></button>
        <div className="header-actions">
          <div className="model-picker">
            <span className="model-dot" />
            <select aria-label="Model" value={model} onChange={(event) => setModel(event.target.value)} disabled={busy || loadingModels || !models.length}>
              {!model && <option value="">{loadingModels ? "Loading models…" : "No models available"}</option>}
              {models.map(({ id }) => <option key={id} value={id}>{modelLabel(id)}</option>)}
            </select>
            <Icon name="chevron" size={16} />
          </div>
          <button className="new-chat" onClick={newChat} aria-label="New chat" title="New chat"><Icon name="plus" size={18} /><span>New chat</span></button>
        </div>
      </header>

      <main className="conversation" ref={scrollArea} onScroll={() => {
        const node = scrollArea.current;
        if (node) stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
      }}>
        {messages.length === 0 ? (
          <section className="welcome">
            <div className="welcome-inner">
              <div className="eyebrow"><span /> A LITTLE CURIOSITY GOES A LONG WAY</div>
              <h1>Where should<br />we begin<span className="accent">?</span></h1>
              <p className="intro">A question, a rough idea, a blank page.<br />Let’s see where a conversation takes you.</p>
              <div className="starters">
                {starters.map((starter) => <button key={starter.title} className="starter" disabled={!ready} onClick={() => { setDraft(starter.prompt); textarea.current?.focus(); }}>
                  <Icon name={starter.icon} /><span className="starter-title">{starter.title}</span><span className="starter-text">{starter.text}</span><span className="starter-arrow">↗</span>
                </button>)}
              </div>
            </div>
          </section>
        ) : (
          <div className="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
            {messages.map((message, index) => <article key={message.id} className={`message message-${message.role}`} aria-label={message.role === "user" ? "Your message" : "Assistant reply"}>
              {message.role === "user" ? <div className="user-bubble">{message.content}</div> : <>
                <div className="assistant-meta"><Mark /><span>{modelLabel(message.model ?? "Tarka")}</span>{message.status === "streaming" && <span className="stream-label">Responding</span>}</div>
                {message.content ? <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a> }}>{message.content}</Markdown></div> : message.status === "streaming" ? <div className="thinking" role="status" aria-label="Waiting for reply"><span /><span /><span /></div> : null}
                {message.status === "incomplete" && <div className="reply-error" role="alert"><span>{message.error}</span>{index === messages.length - 1 && <button className="text-button" disabled={busy || !ready} onClick={() => void generate(messages.slice(0, index))}><Icon name="retry" size={14} />Retry reply</button>}</div>}
              </>}
            </article>)}
          </div>
        )}
      </main>

      <footer className="composer-area">
        {modelError && <div className="model-error" role="alert"><span>{modelError}</span><button className="text-button" onClick={() => { setLoadingModels(true); setModelError(null); void loadModels(); }} disabled={loadingModels}><Icon name="retry" size={14} />Refresh models</button></div>}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <textarea ref={textarea} aria-label="Message" placeholder="Ask anything, or start with an idea…" value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={32_000} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
          }} />
          <div className="composer-bottom"><span className="composer-note"><Icon name="spark" size={14} />Room for a little possibility</span>{busy ? <button type="button" className="send-button" aria-label="Stop generating" title="Stop generating" onClick={() => active.current?.abort()}><Icon name="stop" size={18} /></button> : <button className="send-button" type="submit" aria-label="Send message" title="Send message" disabled={!draft.trim() || !ready}><Icon name="arrow" /></button>}</div>
        </form>
        <div className="footer-note"><span>Powered by <a href="https://tarkahq.com" target="_blank" rel="noopener noreferrer">Tarka</a></span><span className="footer-separator">·</span><span>Chats stay in this tab until you refresh.</span></div>
      </footer>
    </div>
  );
}
