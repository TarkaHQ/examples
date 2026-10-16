import { expect, test } from "@playwright/test";

test("streams Markdown, sends context with the selected model, and resets", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("qwen3.8-flash-next");
  await page.screenshot({ path: testInfo.outputPath("welcome.png"), fullPage: true });
  await page.getByRole("button", { name: /Make it simple/ }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(/language models/);
  await page.getByLabel("Message", { exact: true }).fill("Hello");
  await page.getByLabel("Message", { exact: true }).press("Shift+Enter");
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Hello\n");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page.getByText("friend", { exact: true })).toBeVisible();
  await expect(page.locator("pre code")).toHaveText("const answer = 42;\n");
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0);
  await page.getByLabel("Model", { exact: true }).selectOption("himalaya-q8");
  const nextRequest = page.waitForRequest((request) => request.url().endsWith("/api/chat"));
  await page.getByLabel("Message", { exact: true }).fill("Follow up");
  await page.getByRole("button", { name: "Send message" }).click();
  const payload = (await nextRequest).postDataJSON();
  expect(payload.model).toBe("himalaya-q8");
  expect(payload.messages.map((message: { role: string }) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(payload.messages[0].content).toBe("Hello");
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("conversation.png"), fullPage: true });
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Where should we begin?" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("stops an active stream, retries without duplicating turns, and clears on refresh", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Model", { exact: true })).toBeEnabled();
  await page.getByLabel("Message", { exact: true }).fill("slow");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("A slow reply")).toBeVisible();
  await expect(page.getByLabel("Model", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop generating" }).click();
  await expect(page.getByText("Reply stopped.")).toBeVisible();
  const retry = page.waitForRequest((request) => request.url().endsWith("/api/chat"));
  await page.getByRole("button", { name: "Retry reply" }).click();
  expect((await retry).postDataJSON().messages).toEqual([{ role: "user", content: "slow" }]);
  await expect(page.getByRole("article", { name: "Your message" })).toHaveCount(1);
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Where should we begin?" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByLabel("Message", { exact: true }).fill("Hello again");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("friend", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("shows recoverable discovery and chat errors", async ({ page }) => {
  await page.route("**/api/models", (route) => route.fulfill({ status: 503, json: { error: { message: "Set TARKA_API_KEY to start chatting." } } }));
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "Set TARKA_API_KEY" })).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("Hello");
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  await page.unroute("**/api/models");
  await page.getByRole("button", { name: "Refresh models" }).click();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.route("**/api/chat", (route) => route.fulfill({ status: 429, json: { error: { message: "Tarka is busy. Retry in a moment." } } }));
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Tarka is busy" })).toBeVisible();
  await page.unroute("**/api/chat");
  await page.getByRole("button", { name: "Retry reply" }).click();
  await expect(page.getByText("friend", { exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Your message" })).toHaveCount(1);
});

test("does not execute model HTML", async ({ page }) => {
  await page.route("**/api/chat", (route) => route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text", text: '<script>alert("xss")</script>\n\n[safe](https://example.com)\n\n[unsafe](javascript:alert(1))' })}\n\ndata: {"type":"done","finishReason":"stop"}\n\n` }));
  await page.goto("/");
  await expect(page.getByLabel("Model", { exact: true })).toBeEnabled();
  await page.getByLabel("Message", { exact: true }).fill("Hello");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("link", { name: "safe", exact: true })).toHaveAttribute("href", "https://example.com");
  await expect(page.getByRole("article", { name: "Assistant reply" }).locator("script")).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});
