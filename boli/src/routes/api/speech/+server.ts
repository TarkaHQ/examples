import { requireUser } from '$lib/server/auth';
import { audioContentType, safeFilename, tarkaFetch } from '$lib/server/tarka';
import { error, json } from '@sveltejs/kit';

const formats = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']);

export async function POST({ request }) {
	const { pb, user } = await requireUser(request);
	const body = (await request.json()) as Record<string, unknown>;
	const input = typeof body.input === 'string' ? body.input.trim() : '';
	const model = typeof body.model === 'string' ? body.model : '';
	const voice = typeof body.voice === 'string' ? body.voice : '';
	const voiceName = typeof body.voice_name === 'string' ? body.voice_name : '';
	const format = typeof body.response_format === 'string' ? body.response_format : 'mp3';
	const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
	const speed = Number(body.speed ?? 1);

	if (!input || input.length > 50_000) throw error(400, 'Enter between 1 and 50,000 characters.');
	if (!model || !voice) throw error(400, 'Choose a model and voice.');
	if (!formats.has(format)) throw error(400, 'Choose a supported audio format.');
	if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) {
		throw error(400, 'Speed must be between 0.25 and 4.');
	}

	const payload: Record<string, unknown> = {
		model,
		input,
		voice,
		response_format: format,
		speed
	};
	if (instructions) payload.instructions = instructions;

	const response = await tarkaFetch('/audio/speech', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	const audio = await response.arrayBuffer();
	if (!audio.byteLength) throw error(502, 'Tarka returned an empty audio file.');

	const contentType = response.headers.get('content-type') || audioContentType(format);
	const data = new FormData();
	data.set('owner', user.id);
	data.set('input', input);
	data.set('model', model);
	data.set('voice_ref', voice);
	data.set('voice_name', voiceName);
	data.set('response_format', format);
	data.set('speed', String(speed));
	data.set('instructions', instructions);
	data.set('content_type', contentType);
	data.set(
		'audio',
		new File([audio], `${safeFilename(voiceName || model)}-${Date.now()}.${format}`, {
			type: contentType
		})
	);

	const record = await pb.collection('generations').create(data);
	return json(record, { status: 201 });
}
