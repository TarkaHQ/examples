import { env } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

const pocketBaseUrl = env.PUBLIC_POCKETBASE_URL || 'https://pb.boli.tarka.site';

export async function requireUser(request: Request) {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) {
		throw error(401, 'Sign in to use Boli.');
	}

	const token = authorization.slice('Bearer '.length).trim();
	const pb = new PocketBase(pocketBaseUrl);
	pb.autoCancellation(false);
	pb.authStore.save(token);

	try {
		const auth = await pb.collection('users').authRefresh();
		return { pb, user: auth.record };
	} catch {
		pb.authStore.clear();
		throw error(401, 'Your session has expired. Please sign in again.');
	}
}
