import { describe, expect, it } from 'vitest';
import {
	getModelLanguageOption,
	getModelLanguageSupport,
	normalizeReportedLanguage
} from './model-languages';

describe('Tarka model language capabilities', () => {
	it('offers only the ten languages supported by Qwen3 TTS plus Auto', () => {
		const support = getModelLanguageSupport('speech', 'qwen3-tts');

		expect(support?.selectable).toBe(true);
		expect(support?.options).toHaveLength(11);
		expect(getModelLanguageOption('speech', 'qwen3-tts', 'ja')?.apiValue).toBe('Japanese');
		expect(getModelLanguageOption('speech', 'qwen3-tts', 'ne')).toBeUndefined();
	});

	it('keeps single-language speech models fixed', () => {
		expect(getModelLanguageSupport('speech', 'kokoro')).toMatchObject({
			defaultValue: 'en',
			selectable: false,
			forward: false
		});
		expect(getModelLanguageSupport('speech', 'nepali-parler-tts')).toMatchObject({
			defaultValue: 'ne',
			selectable: false,
			forward: false
		});
	});

	it('uses each transcription model’s actual language surface', () => {
		const whisper = getModelLanguageSupport('transcription', 'whisper-large-v3');
		const qwen = getModelLanguageSupport('transcription', 'qwen3-asr');

		expect(whisper?.options.some((language) => language.value === 'ne')).toBe(true);
		expect(qwen?.options).toHaveLength(31);
		expect(getModelLanguageOption('transcription', 'qwen3-asr', 'ar')?.apiValue).toBe('Arabic');
		expect(getModelLanguageOption('transcription', 'qwen3-asr', 'ne')).toBeUndefined();
	});

	it('normalizes model-reported language names for PocketBase', () => {
		expect(normalizeReportedLanguage('transcription', 'qwen3-asr', 'English')).toBe('en');
		expect(normalizeReportedLanguage('transcription', 'whisper-large-v3', 'NE')).toBe('ne');
	});
});
