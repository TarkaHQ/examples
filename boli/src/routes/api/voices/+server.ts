import { requireUser } from '$lib/server/auth';
import { tarkaFetch } from '$lib/server/tarka';
import { error, json } from '@sveltejs/kit';

export async function POST({ request }) {
	const { pb, user } = await requireUser(request);
	const incoming = await request.formData();
	const sample = incoming.get('sample');
	const name = String(incoming.get('name') || '').trim();
	const signedBy = String(incoming.get('consent_signed_by') || '').trim();
	const consentDate = String(incoming.get('consent_date') || '').trim();
	const consentConfirmed = String(incoming.get('consent_confirmed') || '') === 'true';
	const model = 'qwen3-tts';

	if (!(sample instanceof File) || sample.size === 0) throw error(400, 'Add a clean voice sample.');
	if (sample.size > 25 * 1024 * 1024) throw error(400, 'Voice samples must be 25 MB or smaller.');
	if (!name || name.length > 120) throw error(400, 'Enter a voice name up to 120 characters.');
	if (!signedBy || signedBy.length > 160) throw error(400, 'Enter the consenting speaker’s name.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(consentDate)) throw error(400, 'Choose a valid consent date.');
	if (!consentConfirmed)
		throw error(400, 'Confirm that the speaker consented to this voice clone.');

	const upstream = new FormData();
	upstream.set('model', model);
	upstream.set('name', name);
	upstream.set('sample', sample, sample.name);
	upstream.set('consent_signed_by', signedBy);
	upstream.set('consent_date', consentDate);

	const response = await tarkaFetch('/audio/voice-clones', { method: 'POST', body: upstream });
	const clone = (await response.json()) as {
		id?: string;
		name?: string;
		model?: string;
		status?: string;
	};
	if (!clone.id) throw error(502, 'Tarka did not return a voice identifier.');

	const data = new FormData();
	data.set('owner', user.id);
	data.set('name', clone.name || name);
	data.set('model', clone.model || model);
	data.set('tarka_voice_id', clone.id);
	data.set('status', clone.status || 'pending');
	data.set('consent_signed_by', signedBy);
	data.set('consent_date', `${consentDate} 00:00:00.000Z`);
	data.set('sample', sample, sample.name);

	const record = await pb.collection('voices').create(data);
	return json(record, { status: 201 });
}
