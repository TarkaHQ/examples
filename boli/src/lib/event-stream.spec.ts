import { describe, expect, it, vi } from 'vitest';
import { consumeEventStream } from './event-stream';

function stream(...chunks: string[]) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		}
	});
}

describe('Boli generation event streams', () => {
	it('reads fragmented progress and completion events', async () => {
		const onprogress = vi.fn();
		const result = await consumeEventStream<{ id: string }>(
			stream(
				'event: progress\ndata: {"phase":"generating",',
				'"message":"Generating… 10s","elapsed_seconds":10}\n\n',
				': keepalive\n\nevent: complete\ndata: {"id":"record-1"}\n\n'
			),
			onprogress
		);

		expect(onprogress).toHaveBeenCalledWith({
			phase: 'generating',
			message: 'Generating… 10s',
			elapsed_seconds: 10
		});
		expect(result).toEqual({ id: 'record-1' });
	});

	it('surfaces errors delivered after the stream has started', async () => {
		await expect(
			consumeEventStream(stream('event: error\ndata: {"message":"Tarka is unavailable."}\n\n'))
		).rejects.toThrow('Tarka is unavailable.');
	});

	it('rejects a stream that closes without a saved record', async () => {
		await expect(
			consumeEventStream(
				stream('event: progress\ndata: {"phase":"saving","message":"Saving…"}\n\n')
			)
		).rejects.toThrow('ended before the audio was ready');
	});
});
