export interface StreamProgress {
	phase: 'generating' | 'receiving' | 'saving';
	message: string;
	elapsed_seconds?: number;
	received_bytes?: number;
}

interface ServerSentEvent {
	event: string;
	data: string;
}

function parseEvent(frame: string): ServerSentEvent | undefined {
	let event = 'message';
	const data: string[] = [];

	for (const line of frame.split(/\r?\n/)) {
		if (!line || line.startsWith(':')) continue;
		const separator = line.indexOf(':');
		const field = separator === -1 ? line : line.slice(0, separator);
		let value = separator === -1 ? '' : line.slice(separator + 1);
		if (value.startsWith(' ')) value = value.slice(1);
		if (field === 'event') event = value;
		if (field === 'data') data.push(value);
	}

	if (!data.length) return undefined;
	return { event, data: data.join('\n') };
}

function nextBoundary(buffer: string) {
	const match = /\r?\n\r?\n/.exec(buffer);
	return match ? { index: match.index, length: match[0].length } : undefined;
}

function eventPayload<T>(event: ServerSentEvent) {
	try {
		return JSON.parse(event.data) as T;
	} catch {
		throw new Error('Boli sent an invalid generation update.');
	}
}

export async function consumeEventStream<T>(
	body: ReadableStream<Uint8Array>,
	onprogress?: (progress: StreamProgress) => void
): Promise<T> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let completed = false;
	let result: T | undefined;

	function handle(frame: string) {
		const event = parseEvent(frame);
		if (!event) return;
		if (event.event === 'progress') {
			onprogress?.(eventPayload<StreamProgress>(event));
			return;
		}
		if (event.event === 'complete') {
			result = eventPayload<T>(event);
			completed = true;
			return;
		}
		if (event.event === 'error') {
			const payload = eventPayload<{ message?: string }>(event);
			throw new Error(payload.message || 'Audio generation failed.');
		}
	}

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });

		let boundary = nextBoundary(buffer);
		while (boundary) {
			handle(buffer.slice(0, boundary.index));
			buffer = buffer.slice(boundary.index + boundary.length);
			boundary = nextBoundary(buffer);
		}

		if (done) break;
	}

	if (buffer.trim()) handle(buffer);
	if (!completed) throw new Error('The generation stream ended before the audio was ready.');
	return result as T;
}
