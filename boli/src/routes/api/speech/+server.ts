import { requireUser } from '$lib/server/auth';
import { audioContentType, safeFilename, tarkaFetch } from '$lib/server/tarka';
import { getModelLanguageOption, getModelLanguageSupport } from '$lib/model-languages';
import { error, isHttpError } from '@sveltejs/kit';

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
	const requestedLanguage =
		typeof body.language === 'string' ? body.language.trim().toLowerCase() : '';
	const speed = Number(body.speed ?? 1);
	const languageSupport = getModelLanguageSupport('speech', model);
	const language = requestedLanguage || languageSupport?.defaultValue || '';
	const languageOption = languageSupport
		? getModelLanguageOption('speech', model, language)
		: undefined;

	if (!input || input.length > 4_096) throw error(400, 'Enter between 1 and 4,096 characters.');
	if (!model || !voice) throw error(400, 'Choose a model and voice.');
	if (!formats.has(format)) throw error(400, 'Choose a supported audio format.');
	if (language.length > 16 || (languageSupport && !languageOption)) {
		throw error(400, `Choose a language supported by ${model}.`);
	}
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
	payload.stream_format = 'audio';
	if (languageSupport?.forward && languageOption?.apiValue) {
		payload.language = languageOption.apiValue;
	} else if (!languageSupport && language) {
		payload.language = language;
	}

	const encoder = new TextEncoder();
	const upstreamAbort = new AbortController();
	let closed = false;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	request.signal.addEventListener('abort', () => upstreamAbort.abort(), { once: true });

	function errorDetails(value: unknown) {
		if (isHttpError(value)) return { status: value.status, message: value.body.message };
		if (value instanceof Error) return { status: 500, message: value.message };
		return { status: 500, message: 'Audio generation failed.' };
	}

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const started = Date.now();
			let phase: 'generating' | 'receiving' | 'saving' = 'generating';

			function send(event: string, value: unknown) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
				} catch {
					closed = true;
					upstreamAbort.abort();
				}
			}

			function progress(message: string, extra: Record<string, number> = {}) {
				send('progress', { phase, message, ...extra });
			}

			progress('Starting…', { elapsed_seconds: 0 });
			heartbeat = setInterval(() => {
				const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
				if (phase === 'generating')
					progress(`Generating… ${elapsed}s`, { elapsed_seconds: elapsed });
				else
					send('progress', {
						phase,
						message: phase === 'receiving' ? 'Receiving audio…' : 'Saving…',
						elapsed_seconds: elapsed
					});
			}, 10_000);

			void (async () => {
				try {
					const response = await tarkaFetch('/audio/speech', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload),
						signal: upstreamAbort.signal
					});
					phase = 'receiving';
					progress('Receiving audio…');
					const audio = await response.arrayBuffer();
					if (!audio.byteLength) throw error(502, 'Tarka returned an empty audio file.');

					phase = 'saving';
					progress('Saving…', { received_bytes: audio.byteLength });
					const contentType = response.headers.get('content-type') || audioContentType(format);
					const data = new FormData();
					data.set('owner', user.id);
					data.set('input', input);
					data.set('model', model);
					data.set('voice_ref', voice);
					data.set('voice_name', voiceName);
					data.set('response_format', format);
					data.set('speed', String(speed));
					data.set('language', language);
					data.set('instructions', instructions);
					data.set('content_type', contentType);
					data.set(
						'audio',
						new File([audio], `${safeFilename(voiceName || model)}-${Date.now()}.${format}`, {
							type: contentType
						})
					);

					const record = await pb.collection('generations').create(data);
					send('complete', record);
				} catch (value) {
					if (!closed) send('error', errorDetails(value));
				} finally {
					if (heartbeat) clearInterval(heartbeat);
					if (!closed) {
						closed = true;
						controller.close();
					}
				}
			})();
		},
		cancel() {
			closed = true;
			if (heartbeat) clearInterval(heartbeat);
			upstreamAbort.abort();
		}
	});

	return new Response(stream, {
		headers: {
			'Cache-Control': 'no-cache, no-transform',
			'Content-Type': 'text/event-stream; charset=utf-8',
			'X-Accel-Buffering': 'no',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}
