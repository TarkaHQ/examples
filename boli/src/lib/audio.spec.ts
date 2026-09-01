import { describe, expect, it } from 'vitest';
import { encodeMonoPcm16Wav } from './audio';

function ascii(view: DataView, offset: number, length: number) {
	return String.fromCharCode(
		...Array.from({ length }, (_, index) => view.getUint8(offset + index))
	);
}

describe('audio conversion', () => {
	it('encodes browser samples as mono PCM WAV', () => {
		const wav = encodeMonoPcm16Wav(
			[new Float32Array([-1, 0, 1]), new Float32Array([-1, 0.5, 1])],
			48_000
		);
		const view = new DataView(wav);

		expect(ascii(view, 0, 4)).toBe('RIFF');
		expect(ascii(view, 8, 4)).toBe('WAVE');
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(48_000);
		expect(view.getUint16(34, true)).toBe(16);
		expect(ascii(view, 36, 4)).toBe('data');
		expect(view.getUint32(40, true)).toBe(6);
		expect(view.getInt16(44, true)).toBe(-32_768);
		expect(view.getInt16(46, true)).toBe(8_191);
		expect(view.getInt16(48, true)).toBe(32_767);
	});

	it('rejects empty audio', () => {
		expect(() => encodeMonoPcm16Wav([], 48_000)).toThrow('recording is empty');
	});
});
