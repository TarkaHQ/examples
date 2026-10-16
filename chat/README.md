# Tarka Chat

A small ChatGPT-style example built with Next.js App Router, React, and TypeScript. Choose a Tarka-hosted model, send messages, and watch its reply stream in.

- Model picker populated from the models available to the server's Tarka key
- Markdown replies with code blocks and tables
- Multi-turn conversation, Stop, Retry reply, and New chat
- Responsive layout and keyboard controls: Enter sends, Shift+Enter adds a line
- One conversation in React memory; no login, database, or localStorage

## Local setup

Use Node.js 22.12+ (Node 24 LTS recommended) and npm. From this directory:

```sh
npm ci
cp .env.example .env.local
```

Set a server-side Tarka key in `.env.local`:

```dotenv
TARKA_API_KEY=tk_live_replace_me
TARKA_API_BASE_URL=https://tarka.rest/v1
TARKA_DEFAULT_MODEL=qwen3.8-flash-next
```

Then run:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). If this checkout already has a provisioned `.env.local`, keep it rather than replacing it with the example file. The UI can load without a key and will explain how to configure one.

`TARKA_API_BASE_URL` and `TARKA_DEFAULT_MODEL` are optional; their defaults are shown above. If the preferred model is unavailable, the picker selects the first available alias alphabetically. Switching models retains the conversation and uses the newly selected model on the next request, including retries.

## Provision a key with tarka-control

1. Call `tarka_get_current_user` and select the intended organization by slug.
2. Call `tarka_list_models` with `modality: "chat"`; retain active aliases with `capabilities.streaming: true`.
3. Call `tarka_create_api_key` with that organization's ID, a descriptive label, those `allowed_model_aliases`, and the required scopes: `inference` for general LLMs and `himalaya` for Himalaya models.
4. Save the one-time `plaintext_key` in `.env.local`. Keep the file private (`chmod 600 .env.local`). It is ignored by Git.

The local implementation was provisioned in the `tarka` organization with label `examples-nextjs-chat-local`. The actual key is not included in this repository.

Use a key restricted to **streaming chat models**. Runtime discovery is OpenAI-compatible and does not guarantee modality or capability metadata; the app deliberately relies on the key's model restrictions instead of embedding a stale catalog or requiring control-plane credentials. Organization policy and product entitlements still apply. Never use a `NEXT_PUBLIC_` prefix for the key.

See Tarka's [key policy](https://tarkahq.com/docs/control-api/keys-policy-usage/), [model discovery](https://tarkahq.com/docs/inference/api-access/), and [language model API](https://tarkahq.com/docs/inference/llms/).

## Request flow

```text
Browser → Next.js route handler → Tarka Inference API
        ← sanitized SSE events ← streamed chat completion
```

- `GET /api/models` calls Tarka's `GET /v1/models`. It returns `{ models: [{ id }], defaultModel }` with no credentials or caching.
- `POST /api/chat` accepts `{ model, messages: [{ role, content }] }`. Only `user` and `assistant` text messages are accepted, ending with a user message. The server checks the requested model against current discovery and sends an OpenAI-compatible Chat Completions request with `stream: true`.
- The browser receives SSE `data` objects of type `text` (`text`), `done` (`finishReason`), or `error` (`message`). Provider metadata, reasoning deltas, headers, and raw errors are not forwarded.

The route allows up to 100 messages and a 128 KiB JSON body, caps replies at 1,024 generated tokens, and gives discovery plus generation a 120-second upstream timeout. Models have their own context windows; a long conversation may need a new chat or a larger model. The standalone discovery endpoint has a 15-second timeout.

Stopping a reply or resetting the chat aborts the upstream request. Interrupted and length-limited replies stay visible as incomplete and are omitted from future conversation context. Retry replaces the latest incomplete reply without adding another user message. Successful completion requires Tarka's `[DONE]` marker; early EOF is an error. There are no automatic generation retries.

The conversation clears on reload or New chat. Messages are sent to Tarka for inference; this example does not persist them itself. Markdown rendering disables raw HTML and unsafe URL schemes.

## Verification

```sh
npm run check
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

The browser suite builds and runs the production app on port 3100 with a local mock Tarka server on port 3101. It uses a dummy key and makes no live inference calls. It covers desktop and mobile layouts, streaming, model switching, context, Stop, Retry, New chat, errors, and Markdown safety. Screenshots and failure traces are written to ignored `test-results/`.

To check the real integration, run the development app with your key, send a message using Qwen, send a follow-up, then select another available model and send a message. All browser inference traffic should go to `/api/chat`; the Tarka key belongs only in the server's outgoing request.

## Node deployment

```sh
npm run build
npm start
```

Set the environment variables on the host at runtime. Use a Node-capable Next.js host; static export cannot run these endpoints. Allow at least 130 seconds for the chat route and disable response buffering on any reverse proxy so tokens arrive incrementally.

This is an unauthenticated example: anyone who can reach its chat endpoint can use the configured key. For shared hosting, put access control and per-user limits in front of it. No hosting resources are created by this example.
