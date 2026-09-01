# Tarka Examples

Small, practical applications that show developers how to build on top of the Tarka platform.

Each example focuses on a real product workflow rather than an isolated API call. The apps are intentionally compact enough to explore, adapt, and use as a starting point for your own projects. Over time, this repository will grow to cover more Tarka APIs, frameworks, and integration patterns.

## Examples

| App | What it demonstrates | Stack |
| --- | --- | --- |
| [Boli](./boli) | Speech-to-text, text-to-speech, and consent-backed voice cloning with Tarka's voice APIs | SvelteKit, PocketBase, Cloudflare Pages |

## Using an example

Every app lives in its own folder and is self-contained. Open the app's README for its prerequisites, environment variables, local setup, architecture, and deployment instructions.

For example, to run Boli:

```sh
cd boli
npm install
cp .env.example .env
npm run dev
```

You will need a Tarka API key for requests to the platform. Keep API keys in the example's local environment file and never expose server-side credentials through public environment variables or commit them to Git.

## Repository goals

The examples in this repository aim to be:

- Small enough to understand without a lengthy setup
- Complete enough to demonstrate an end-to-end workflow
- Clear about authentication, storage, and safe handling of API keys
- Easy to fork and turn into a real application
- Representative of current Tarka platform capabilities

## Contributing

New examples are welcome. Place each app in a clearly named top-level folder and include an app-specific README with setup instructions, required environment variables, verification commands, and deployment notes.

When adding an example, also add it to the table above so developers can discover it from the repository homepage.
