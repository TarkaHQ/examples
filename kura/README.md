# Kura · कुरा

A small meeting notebook built on Tarka. A Google Meet participant records remote meetings; a Flutter Android app records room conversations, including offline and with the screen locked. The Flutter web build manages the same private meeting library. Transcripts and notes are generated after recording.

## Architecture

`Flutter Android/web → Django API → PostgreSQL job queue → worker → Tarka Whisper + Qwen`

`Meet worker → Vexa joining module + Chromium + PulseAudio/FFmpeg → API → Tarka Object Storage`

The four services are `api`, `worker`, `meet-bot`, and `postgres`. `api` also serves the Flutter web bundle. Recordings use a private Tarka S3 bucket. The hosted worker calls `http://tarka/v1` through the platform's managed gateway; Tarka credentials never enter the Flutter app. Inference aliases are `whisper-large-v3` and `qwen3.8-flash-next`. Hosting, storage, network, and model billing are separate; this example does not change Tarka model pricing.

The Vexa Google Meet join module is vendored at an exact upstream commit with its Apache-2.0 license and modification notice in `bot/vendor/vexa/UPSTREAM.md`. The bot uses one browser session at a time, needs host admission, and exits on denial, removal, inactivity, or a two-hour limit. It never handles CAPTCHA or consent prompts automatically. Screenshots are off unless `KURA_BOT_DIAGNOSTICS=1` is explicitly enabled.

## Local Compose

1. Create a private Tarka Object Storage bucket and bucket-scoped access credentials.
2. Copy `.env.example` to `.env`; set independent random secrets, initial owner credentials, physical S3 bucket name, and S3 credentials. Use a URL-safe database password. Set a Tarka API key with the necessary model access for local development.
3. Run `docker compose -f compose.yaml -f compose.local.yaml up --build` (or `docker-compose` on installations with the standalone CLI).
4. Open `http://localhost:8000` and sign in with the configured owner email/password.

The owner is bootstrapped only into an empty database. Changing the environment password does not overwrite an existing user's password. Create additional private accounts using Django's `createsuperuser` command inside the API container. There is no public signup.

For a fast Python development loop: `cd backend && uv sync`, export `DJANGO_SECRET_KEY`, run migrations and `bootstrap`, then `uv run python manage.py runserver`. The standalone development database defaults to SQLite; deployment and CI use PostgreSQL. Run `uv run python manage.py worker` separately. Build the web UI with `flutter build web --release --no-web-resources-cdn` and copy `app/build/web/` into `backend/web/` for this loop.

## Deploy on Tarka

The GitHub workflow publishes public OCI images tagged by source commit. `compose.yaml` is the production definition; `compose.local.yaml` adds local builds and ports and is not submitted to Tarka.

`deploy/release.json` records the tested image digests, source revision, successful CI run, and intended deployment target. These are published build artifacts; the manifest does not indicate a live deployment. Secret values are deliberately absent.

1. Publish images, resolve both image digests, and set `KURA_API_IMAGE` and `KURA_BOT_IMAGE` to `ghcr.io/tarkahq/kura-{api,bot}@sha256:...`.
2. Create a Tarka bucket; use its returned **physical** `s3_bucket_name` and region. The Kura bucket in the Tarka organization is `tarka-c9683788937a-kura-recordings`, region `eu-central-1`.
3. Create a secret handoff for host `kura`. The owner runs `python3 scripts/prepare-secrets.py`, then uploads the resulting private `.env.deploy` file through the authenticated handoff page. The file is ignored by Git and mode 0600. The coding agent receives only metadata.
4. Submit `compose.yaml` via `CreateAgentHost` in the intended organization with the uploaded bundle ID, `public_service=api`, `public_port=8000`, `tier=core`, and `runtime.primary_model_alias=qwen3.8-flash-next`. Set the two image variables, `S3_BUCKET`, and `S3_REGION`. Dry-run first and use the returned accepted quote for admission.
5. Wait for readiness and a valid HTTPS route. Currently new Tarka app hosts use `us-1`; storage uses `eu-1`. Use the actual URL returned by the Control API.
6. Check `/healthz`, sign-in, upload/transcription, a host-admitted Meet recording, and Android screen-locked recording. Set the Android server address to the returned HTTPS URL.

Tarka injects its outbound proxy environment. The bot uses the host-local browser proxy at `http://tarka-network-edge:3128` when that environment is present, with proxied WebRTC transport. Test real media connectivity in the selected location before treating Meet capture as operational.

Update the existing host by name through the Control API with new pinned images and preserved secrets; keep its named volumes. To roll back, restore the prior image digests after verifying migration compatibility. Do not delete/recreate the host as an update mechanism. Back up PostgreSQL and the recording bucket independently.

## Android

`cd app && flutter pub get && flutter build apk --debug` produces an installable development APK. A signed distribution build requires your own Android signing key; the repository does not contain one. Set the deployment URL at sign-in or supply `--dart-define=KURA_URL=https://your-host.tarka.site` when building.

For a smaller development APK on current ARM64 phones, use `flutter build apk --release --target-platform android-arm64`. This optimizes the app but still uses the local debug signing key; it is not a Play Store release.

The native microphone foreground service keeps the recording independent of the Flutter view, rotates 30-second WAV segments, holds a bounded wake lock, and repairs saved WAV headers after an interrupted process. Recordings remain in app-private storage until every chunk and finalization is acknowledged. Pending recordings retry while the app is open and signed in. Android's “force stop” ends recording; completed audio remains recoverable on reopening. The web build supports file uploads, bot control, playback, exports, and notes; microphone capture is Android-only.

## API and reliability

- `POST /api/login`, `POST /api/logout`: expiring, hashed bearer sessions; native sessions use secure device storage, web sessions remain in memory.
- `GET/POST /api/meetings`, `GET/PATCH/DELETE /api/meetings/{id}`: owner-scoped meetings, idempotent creation through `client_id`.
- `PUT /api/meetings/{id}/chunks/{sequence}`, `POST .../finish`: bounded, SHA-256 checked, idempotent chunks; completion requires a contiguous sequence.
- `POST .../stop`, `POST .../retry`, `GET .../export`: stop capture, retry processing, export Markdown.
- `GET /api/audio/{ticket}`: short-lived access to private audio.
- `/api/internal/*`: bot-only service authentication; not a client API.

Limits: one concurrent Meet bot, two hours per recording, 512 MiB per upload, 4 MiB per chunk. File upload retries resume within the open browser session; reloading the browser loses its file handle. Android recordings survive app restarts. STT results are cached per chunk to avoid repeating completed transcription on job retries. Long transcripts are summarized in bounded sections. Unknown action owners/dates remain unset. Automatic speaker identification is not part of this version.

Deleting a meeting stops capture, hides it immediately, invalidates audio tickets, and queues removal of objects, **all S3 versions**, and metadata after a six-minute cancellation grace period. Do not enable object retention locks on the recording bucket. Diagnostics and PostgreSQL backups need their own retention policy.

## Verification

```sh
cd backend
DJANGO_SECRET_KEY=test-only uv run pytest -q
uv run ruff check --select F .
cd ../bot
npm ci
npm run check
npm test
cd ../app
flutter analyze
flutter test
flutter build web --release --no-web-resources-cdn
flutter build apk --debug
```

CI runs the API tests against PostgreSQL, builds the deployment images, and checks the bot. Real Meet admission/audio and physical-phone screen-lock/interruption tests are separate release checks; unit tests do not establish those capabilities.
