import { pb } from '$lib/pocketbase';

interface APIErrorBody {
	message?: string;
	error?: { message?: string };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (pb.authStore.token) headers.set('Authorization', `Bearer ${pb.authStore.token}`);

	const response = await fetch(path, { ...init, headers });
	if (!response.ok) {
		let body: APIErrorBody = {};
		try {
			body = await response.json();
		} catch {
			// The fallback below is more useful than a JSON parsing error.
		}
		const fallback =
			response.status === 524
				? 'Tarka took longer than the gateway timeout. The result may still finish; check your library before retrying.'
				: `Request failed (${response.status})`;
		throw new Error(body.message || body.error?.message || fallback);
	}

	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

export function getErrorMessage(value: unknown) {
	if (value instanceof Error) return value.message;
	if (typeof value === 'string') return value;
	return 'Something went wrong. Please try again.';
}
