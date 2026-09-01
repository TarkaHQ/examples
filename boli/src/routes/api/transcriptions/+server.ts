import { requireUser } from '$lib/server/auth';
import { safeFilename, tarkaFetch } from '$lib/server/tarka';
import { error, json } from '@sveltejs/kit';

const transcriptionModels = new Set(['whisper-large-v3', 'whisper-nepali-medium', 'qwen3-asr']);

export async function POST({ request }) {
	const { pb, user } = await requireUser(request);
	const incoming = await request.formData();
	const file = incoming.get('file');
	const model = String(incoming.get('model') || 'whisper-large-v3');
	const language = String(incoming.get('language') || '').trim();
	const prompt = String(incoming.get('prompt') || '').trim();

	if (!(file instanceof File) || file.size === 0) throw error(400, 'Choose an audio file first.');
	if (file.size > 100 * 1024 * 1024) throw error(400, 'Audio files must be 100 MB or smaller.');
	if (!transcriptionModels.has(model)) throw error(400, 'Choose a supported transcription model.');

	const upstream = new FormData();
	upstream.set('file', file, file.name);
	upstream.set('model', model);
	upstream.set('response_format', 'json');
	upstream.set('temperature', '0');
	if (language) upstream.set('language', language);
	if (prompt) upstream.set('prompt', prompt);

	const response = await tarkaFetch('/audio/transcriptions', { method: 'POST', body: upstream });
	const result = (await response.json()) as {
		text?: string;
		task?: string;
		language?: string;
		duration?: number;
	};
	if (!result.text) throw error(502, 'Tarka did not return a transcription.');

	const data = new FormData();
	data.set('owner', user.id);
	data.set('filename', safeFilename(file.name));
	data.set('model', model);
	data.set('language', result.language || language);
	data.set('prompt', prompt);
	data.set('text', result.text);
	data.set('task', result.task || 'transcribe');
	if (typeof result.duration === 'number') data.set('duration', String(result.duration));
	data.set('audio', file, file.name);

	const record = await pb.collection('transcriptions').create(data);
	return json(record, { status: 201 });
}
