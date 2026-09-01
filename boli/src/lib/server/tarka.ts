import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

const baseUrl = (env.TARKA_API_BASE_URL || 'https://tarka.rest/v1').replace(/\/$/, '');

function configuredKey() {
	if (!env.TARKA_API_KEY || env.TARKA_API_KEY === 'tk_live_replace_me') {
		throw error(503, 'TARKA_API_KEY is not configured on the Boli server.');
	}
	return env.TARKA_API_KEY;
}

async function responseMessage(response: Response) {
	try {
		const payload = (await response.json()) as {
			message?: string;
			error?: { message?: string };
		};
		return payload.error?.message || payload.message;
	} catch {
		return undefined;
	}
}

export async function tarkaFetch(path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${configuredKey()}`);
	const response = await fetch(`${baseUrl}${path}`, { ...init, headers });

	if (!response.ok) {
		const message = await responseMessage(response);
		throw error(
			response.status >= 400 && response.status <= 599 ? response.status : 502,
			message || `Tarka voice API returned ${response.status}.`
		);
	}

	return response;
}

export function audioContentType(format: string) {
	return (
		(
			{
				mp3: 'audio/mpeg',
				opus: 'audio/ogg',
				aac: 'audio/aac',
				flac: 'audio/flac',
				wav: 'audio/wav',
				pcm: 'audio/L16'
			} as Record<string, string>
		)[format] || 'application/octet-stream'
	);
}

export function safeFilename(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'audio';
}
