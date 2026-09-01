function writeAscii(view: DataView, offset: number, value: string) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

export function encodeMonoPcm16Wav(channels: readonly Float32Array[], sampleRate: number) {
	if (!channels.length || !channels[0]?.length) throw new Error('The recording is empty.');
	if (!Number.isFinite(sampleRate) || sampleRate <= 0)
		throw new Error('Invalid audio sample rate.');

	const frameCount = channels[0].length;
	if (channels.some((channel) => channel.length !== frameCount)) {
		throw new Error('Audio channels have different lengths.');
	}

	const bytesPerSample = 2;
	const dataSize = frameCount * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * bytesPerSample, true);
	view.setUint16(32, bytesPerSample, true);
	view.setUint16(34, 16, true);
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	for (let frame = 0; frame < frameCount; frame += 1) {
		let sample = 0;
		for (const channel of channels) sample += channel[frame] ?? 0;
		sample = Math.max(-1, Math.min(1, sample / channels.length));
		view.setInt16(
			44 + frame * bytesPerSample,
			sample < 0 ? sample * 0x8000 : sample * 0x7fff,
			true
		);
	}

	return buffer;
}

export async function convertAudioToWav(file: File) {
	const context = new AudioContext();
	try {
		const decoded = await context.decodeAudioData(await file.arrayBuffer());
		const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
			decoded.getChannelData(index)
		);
		const wav = encodeMonoPcm16Wav(channels, decoded.sampleRate);
		const basename = file.name.replace(/\.[^.]+$/, '') || 'boli-recording';
		return new File([wav], `${basename}.wav`, { type: 'audio/wav' });
	} catch {
		throw new Error('Boli could not read that recording. Try a WAV, MP3, M4A, or WebM file.');
	} finally {
		await context.close().catch(() => undefined);
	}
}
