# Kura Flutter app

Android recorder and web meeting library. See [Kura's README](../README.md) for setup, backend, deployment, and verification.

The Android foreground microphone service lives under `android/app/src/main/kotlin/com/tarkahq/kura/`; it saves 30-second recoverable WAV segments independently of the Flutter UI. The web build is served by the Django API and calls the same origin.
