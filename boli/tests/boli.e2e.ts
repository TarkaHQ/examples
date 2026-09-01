import { expect, test } from '@playwright/test';

test('shows the Boli sign-in experience', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle(/Boli/);
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
