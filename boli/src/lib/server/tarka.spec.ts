import { describe, expect, it } from 'vitest';
import { audioContentType, safeFilename } from './tarka';

describe('Tarka voice helpers', () => {
	it('maps output formats to playable media types', () => {
		expect(audioContentType('mp3')).toBe('audio/mpeg');
		expect(audioContentType('wav')).toBe('audio/wav');
		expect(audioContentType('unexpected')).toBe('application/octet-stream');
	});

	it('turns user labels into safe filenames', () => {
		expect(safeFilename('My Nepali voice!')).toBe('My-Nepali-voice');
		expect(safeFilename('...')).toBe('...');
		expect(safeFilename('')).toBe('audio');
	});
});
