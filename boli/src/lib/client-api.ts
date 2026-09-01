import { pb } from '$lib/pocketbase';
import { consumeEventStream, type StreamProgress } from '$lib/event-stream';

interface APIErrorBody {
	message?: string;
	error?: { message?: string };
}

async function responseError(response: Response) {
	let body: APIErrorBody = {};
	try {
		body = await response.json();
	} catch {
		// The fallback below is more useful than a JSON parsing error.
	}
	const fallback =
		response.status === 524
			? 'The connection timed out before the result was ready.'
			: `Request failed (${response.status})`;
	return new Error(body.message || body.error?.message || fallback);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (pb.authStore.token) headers.set('Authorization', `Bearer ${pb.authStore.token}`);

	const response = await fetch(path, { ...init, headers });
	if (!response.ok) throw await responseError(response);

	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

export async function streamApiRequest<T>(
	path: string,
	init: RequestInit = {},
	onprogress?: (progress: StreamProgress) => void
): Promise<T> {
	const headers = new Headers(init.headers);
	if (pb.authStore.token) headers.set('Authorization', `Bearer ${pb.authStore.token}`);
	const response = await fetch(path, { ...init, headers });
	if (!response.ok) throw await responseError(response);
	if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
		throw new Error('Boli did not return a generation progress stream.');
	}
	return consumeEventStream<T>(response.body, onprogress);
}

export function getErrorMessage(value: unknown) {
	if (value instanceof Error) return value.message;
	if (typeof value === 'string') return value;
	return 'Something went wrong. Please try again.';
}
