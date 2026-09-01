# Boli

Boli (बोली, “voice” in Nepali) is a small private voice studio built with SvelteKit, Tarka’s voice APIs, and PocketBase.

It includes:

- Text to speech with Kokoro, Piper, Nepali Parler TTS, and consent-backed Qwen3 voice clones
- Speech to text with Whisper Large v3, Whisper Nepali Medium, and Qwen3 ASR
- Optional, model-aware language selection for multilingual speech and transcription models
- Browser microphone recording and audio uploads
- Consent-backed voice creation, status refresh, use, and deletion
- A searchable PocketBase library containing source audio, transcripts, and generated speech
- PocketBase email/password authentication and owner-scoped access rules

## Local setup

Install dependencies and create the local environment file:

```sh
npm install
cp .env.example .env
```

Set a Tarka API key with the `utilities` scope in `.env`:

```dotenv
TARKA_API_KEY=tk_live_replace_me
TARKA_API_BASE_URL=https://tarka.rest/v1
PUBLIC_POCKETBASE_URL=https://pb.boli.tarka.site
```

`TARKA_API_KEY` is server-only. Do not rename it with a `PUBLIC_` prefix or use it from a browser component.

Start the app:

```sh
npm run dev
```

The app will work for authentication and library browsing without the Tarka key, but voice API actions will show a configuration message until the key is set.

## PocketBase

The hosted instance at `https://pb.boli.tarka.site` is already configured with:

- `users` — PocketBase auth collection
- `voices` — clone IDs, status, consent metadata, and protected reference samples
- `generations` — TTS inputs, settings, and protected generated audio
- `transcriptions` — STT output and protected source audio

Every Boli collection uses `owner = @request.auth.id` rules for list, view, update, and delete. Creation also requires the submitted owner to match the authenticated user. Audio fields are protected and are opened with short-lived PocketBase file tokens.

To configure a fresh PocketBase instance, put the superuser credentials in temporary shell environment variables and run:

```sh
PB_SUPERUSER_EMAIL='...' PB_SUPERUSER_PASSWORD='...' npm run setup:pocketbase
```

The setup script is idempotent. It creates missing collections, verifies existing fields, protected-file settings, and owner-only rules, and refuses to overwrite an unexpected schema.

## Request flow

The browser authenticates directly with PocketBase and sends its PocketBase token to Boli’s SvelteKit endpoints. Each endpoint refreshes the PocketBase session before proxying the request to Tarka. This keeps the shared Tarka key on the server while retaining per-user storage and authorization.

Speech generation returns an immediate server-sent event stream. Boli sends elapsed-time progress while Tarka is synthesizing, reports when audio is being received and saved, and finishes with the new PocketBase record. Keeping the HTTP response active allows long generations to run beyond Cloudflare's normal pre-response gateway window without exposing the Tarka API key.

```text
Browser → Boli server route → Tarka voice API
   └──────── PocketBase auth, records, and protected files
```

The server routes are:

- `GET /api/models`
- `POST /api/speech`
- `POST /api/transcriptions`
- `POST /api/voices`
- `PATCH /api/voices/:recordId`
- `DELETE /api/voices/:recordId`

## Verification

```sh
npm run check
npm run lint
npm run test:unit -- --run
npm run test:e2e
npm run build
```

## Cloudflare Pages

Boli uses SvelteKit's Cloudflare adapter. Configure the Pages project with:

- Root directory: `boli`
- Build command: `npm run build`
- Build output directory: `.svelte-kit/cloudflare`

The output directory is also declared in `wrangler.jsonc`, so do not configure `boli/public` as the Pages output. Add `TARKA_API_KEY` as an encrypted environment variable for both production and preview deployments. `TARKA_API_BASE_URL` and `PUBLIC_POCKETBASE_URL` may be omitted to use the defaults shown above.
