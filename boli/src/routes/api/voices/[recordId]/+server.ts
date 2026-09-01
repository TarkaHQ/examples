import { requireUser } from '$lib/server/auth';
import { tarkaFetch } from '$lib/server/tarka';
import { json } from '@sveltejs/kit';

export async function PATCH({ request, params }) {
	const { pb } = await requireUser(request);
	const record = await pb.collection('voices').getOne(params.recordId);
	const response = await tarkaFetch(
		`/audio/voice-clones/${encodeURIComponent(record.tarka_voice_id)}`
	);
	const clone = (await response.json()) as { status?: string; error?: { message?: string } };
	const updated = await pb.collection('voices').update(record.id, {
		status: clone.status || record.status,
		error_message: clone.error?.message || ''
	});
	return json(updated);
}

export async function DELETE({ request, params }) {
	const { pb } = await requireUser(request);
	const record = await pb.collection('voices').getOne(params.recordId);
	await tarkaFetch(`/audio/voice-clones/${encodeURIComponent(record.tarka_voice_id)}`, {
		method: 'DELETE'
	});
	await pb.collection('voices').delete(record.id);
	return new Response(null, { status: 204 });
}
