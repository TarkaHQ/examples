import { requireUser } from '$lib/server/auth';
import { tarkaFetch } from '$lib/server/tarka';
import { json } from '@sveltejs/kit';

export async function GET({ request }) {
	await requireUser(request);
	const response = await tarkaFetch('/models');
	return json(await response.json());
}
