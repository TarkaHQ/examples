import type { Page } from "playwright";

// Only these fixed messages are safe to expose to the meeting owner. Raw
// browser errors may contain page contents or URLs and remain diagnostic-only.
export class GoogleJoinError extends Error {
  constructor(public readonly code: "google_rejected" | "sign_in_required" | "consent_required" | "left_meeting") {
    const messages = {
      google_rejected: 'Google refused this bot before admission: "You can’t join this video call." No recording started. This can happen even when guests are allowed.',
      sign_in_required: "Google requires sign-in before this bot can join. No recording started.",
      consent_required: "Google requires a person to review a consent screen before joining. No recording started.",
      left_meeting: "Google redirected the bot away from the meeting before admission. No recording started.",
    };
    super(messages[code]);
    this.name = "GoogleJoinError";
  }
}

export async function assertGoogleJoinPage(page: Page): Promise<void> {
  const url = new URL(page.url());
  if (url.hostname === "accounts.google.com") throw new GoogleJoinError("sign_in_required");
  if (url.hostname === "consent.google.com") throw new GoogleJoinError("consent_required");
  if (url.protocol !== "https:" || url.hostname !== "meet.google.com" ||
      !/^\/(?:meet\/)?[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname)) {
    throw new GoogleJoinError("left_meeting");
  }
  // Meet displays this rejection briefly, then redirects to its marketing
  // site. Detect it while polling, before an unrelated form can be selected.
  if (await page.getByText(/^You can['’]t join this video call\.?$/).first().isVisible()) {
    throw new GoogleJoinError("google_rejected");
  }
}

export function publicJoinError(error: unknown): string {
  return error instanceof GoogleJoinError ? error.message :
    "The bot could not finish this meeting. Check admission, network access, or try again.";
}
