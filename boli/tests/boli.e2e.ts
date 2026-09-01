import { expect, test } from '@playwright/test';

const testRecord = {
	id: 'testuser1234567',
	collectionId: '_pb_users_auth_',
	collectionName: 'users',
	name: 'Boli Tester',
	email: 'tester@example.com',
	verified: true,
	created: '2026-09-01 00:00:00.000Z',
	updated: '2026-09-01 00:00:00.000Z'
};

async function openAuthenticatedWorkspace(page: import('@playwright/test').Page) {
	const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
	const voice = {
		id: 'testvoice123456',
		collectionId: 'voices',
		collectionName: 'voices',
		owner: testRecord.id,
		name: 'Test clone',
		model: 'qwen3-tts',
		tarka_voice_id: 'voice_test',
		status: 'ready',
		consent_signed_by: 'Boli Tester',
		consent_date: '2026-09-01',
		sample: 'sample.wav',
		created: '2026-09-01 00:00:00.000Z',
		updated: '2026-09-01 00:00:00.000Z'
	};
	const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

	await page.route('https://pb.boli.tarka.site/api/collections/users/auth-refresh', (route) =>
		route.fulfill({ headers, json: { token, record: testRecord } })
	);
	await page.route(
		/https:\/\/pb\.boli\.tarka\.site\/api\/collections\/[^/]+\/records.*/,
		(route) => {
			const collection = new URL(route.request().url()).pathname.split('/')[3];
			const items = collection === 'voices' ? [voice] : [];
			return route.fulfill({
				headers,
				json: { page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items }
			});
		}
	);
	await page.addInitScript(
		({ authToken, record }) => {
			localStorage.setItem('pocketbase_auth', JSON.stringify({ token: authToken, record }));
		},
		{ authToken: token, record: testRecord }
	);
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'What should we say?' })).toBeVisible();
}

test('shows the Boli sign-in experience', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle(/Boli/);
	await expect(
		page.getByRole('heading', { name: 'Listen. Create. Sound like you.' })
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Sign in to Boli' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Enter Boli' })).toBeVisible();
});

test('switches to account creation on mobile', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Create an account' }).click();

	await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
	await expect(page.getByLabel('Your name')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
});

test('keeps the Tarka proxy behind PocketBase authentication', async ({ request }) => {
	const response = await request.get('/api/models');

	expect(response.status()).toBe(401);
	expect(await response.json()).toMatchObject({ message: 'Sign in to use Boli.' });
});

test('shows only the languages supported by each voice and transcription model', async ({
	page
}) => {
	await openAuthenticatedWorkspace(page);

	const outputLanguage = page.getByLabel(/Output language/);
	await expect(outputLanguage).toBeDisabled();
	await expect(outputLanguage).toHaveValue('en');

	await page.getByRole('button', { name: /Test clone/ }).click();
	await expect(outputLanguage).toBeEnabled();
	await outputLanguage.selectOption('ja');
	await expect(outputLanguage).toHaveValue('ja');

	await page.getByRole('button', { name: 'Transcribe', exact: true }).first().click();
	await page.getByLabel('Model').selectOption('qwen3-asr');
	const inputLanguage = page.getByLabel(/Language/);
	await expect(inputLanguage).toBeEnabled();
	await expect(inputLanguage.locator('option')).toHaveCount(31);
	await inputLanguage.selectOption('ar');
	await expect(inputLanguage).toHaveValue('ar');
	await expect(page.locator('.document-icon')).toHaveCSS('display', 'grid');
});

test('handles streamed speech progress and completion', async ({ page }) => {
	await openAuthenticatedWorkspace(page);
	const record = {
		id: 'generation12345',
		collectionId: 'generations',
		collectionName: 'generations',
		owner: testRecord.id,
		input: 'Welcome to Boli',
		model: 'kokoro',
		voice_ref: 'af_heart',
		voice_name: 'Heart',
		response_format: 'mp3',
		speed: 1,
		language: 'en',
		instructions: '',
		content_type: 'audio/mpeg',
		audio: 'heart.mp3',
		created: '2026-09-01 00:00:00.000Z',
		updated: '2026-09-01 00:00:00.000Z'
	};
	await page.route('**/api/speech', (route) =>
		route.fulfill({
			status: 200,
			headers: { 'content-type': 'text/event-stream; charset=utf-8' },
			body: [
				'event: progress\ndata: {"phase":"generating","message":"Generating… 10s"}\n\n',
				'event: progress\ndata: {"phase":"saving","message":"Saving…"}\n\n',
				`event: complete\ndata: ${JSON.stringify(record)}\n\n`
			].join('')
		})
	);

	await page.getByRole('button', { name: 'Generate audio' }).click();
	await expect(page.getByText('Your audio is ready')).toBeVisible();
	await expect(page.getByText('Saved to your Boli library')).toBeVisible();
	await expect(page.getByText('/ 4,096')).toBeVisible();
});
