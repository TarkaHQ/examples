export type LanguageOperation = 'speech' | 'transcription';

export interface LanguageOption {
	value: string;
	label: string;
	apiValue: string;
}

export interface ModelLanguageSupport {
	defaultValue: string;
	selectable: boolean;
	forward: boolean;
	options: LanguageOption[];
}

const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });

function option(
	value: string,
	apiValue = value,
	label = displayNames.of(value) || value.toUpperCase()
) {
	return { value, label, apiValue };
}

function automatic(label: string): LanguageOption {
	return { value: '', label, apiValue: '' };
}

function fixed(value: string, label: string): ModelLanguageSupport {
	return {
		defaultValue: value,
		selectable: false,
		forward: false,
		options: [option(value, value, `${label} — model default`)]
	};
}

const qwenTtsLanguages = [
	option('zh', 'Chinese'),
	option('en', 'English'),
	option('ja', 'Japanese'),
	option('ko', 'Korean'),
	option('de', 'German'),
	option('fr', 'French'),
	option('ru', 'Russian'),
	option('pt', 'Portuguese'),
	option('es', 'Spanish'),
	option('it', 'Italian')
];

const qwenAsrLanguages = [
	option('zh', 'Chinese'),
	option('en', 'English'),
	option('yue', 'Cantonese'),
	option('ar', 'Arabic'),
	option('de', 'German'),
	option('fr', 'French'),
	option('es', 'Spanish'),
	option('pt', 'Portuguese'),
	option('id', 'Indonesian'),
	option('it', 'Italian'),
	option('ko', 'Korean'),
	option('ru', 'Russian'),
	option('th', 'Thai'),
	option('vi', 'Vietnamese'),
	option('ja', 'Japanese'),
	option('tr', 'Turkish'),
	option('hi', 'Hindi'),
	option('ms', 'Malay'),
	option('nl', 'Dutch'),
	option('sv', 'Swedish'),
	option('da', 'Danish'),
	option('fi', 'Finnish'),
	option('pl', 'Polish'),
	option('cs', 'Czech'),
	option('fil', 'Filipino'),
	option('fa', 'Persian'),
	option('el', 'Greek'),
	option('hu', 'Hungarian'),
	option('mk', 'Macedonian'),
	option('ro', 'Romanian')
];

const whisperLanguageCodes = [
	'en',
	'zh',
	'de',
	'es',
	'ru',
	'ko',
	'fr',
	'ja',
	'pt',
	'tr',
	'pl',
	'ca',
	'nl',
	'ar',
	'sv',
	'it',
	'id',
	'hi',
	'fi',
	'vi',
	'he',
	'uk',
	'el',
	'ms',
	'cs',
	'ro',
	'da',
	'hu',
	'ta',
	'no',
	'th',
	'ur',
	'hr',
	'bg',
	'lt',
	'la',
	'mi',
	'ml',
	'cy',
	'sk',
	'te',
	'fa',
	'lv',
	'bn',
	'sr',
	'az',
	'sl',
	'kn',
	'et',
	'mk',
	'br',
	'eu',
	'is',
	'hy',
	'ne',
	'mn',
	'bs',
	'kk',
	'sq',
	'sw',
	'gl',
	'mr',
	'pa',
	'si',
	'km',
	'sn',
	'yo',
	'so',
	'af',
	'oc',
	'ka',
	'be',
	'tg',
	'sd',
	'gu',
	'am',
	'yi',
	'lo',
	'uz',
	'fo',
	'ht',
	'ps',
	'tk',
	'nn',
	'mt',
	'sa',
	'lb',
	'my',
	'bo',
	'tl',
	'mg',
	'as',
	'tt',
	'haw',
	'ln',
	'ha',
	'ba',
	'jw',
	'su',
	'yue'
];

const speech: Record<string, ModelLanguageSupport> = {
	kokoro: fixed('en', 'English'),
	piper: fixed('en', 'English'),
	'nepali-parler-tts': fixed('ne', 'Nepali'),
	'qwen3-tts': {
		defaultValue: '',
		selectable: true,
		forward: true,
		options: [automatic('Auto — match the text'), ...qwenTtsLanguages]
	}
};

const transcription: Record<string, ModelLanguageSupport> = {
	'whisper-large-v3': {
		defaultValue: '',
		selectable: true,
		forward: true,
		options: [
			automatic('Detect automatically'),
			...whisperLanguageCodes.map((code) => option(code))
		]
	},
	'whisper-nepali-medium': {
		defaultValue: 'ne',
		selectable: false,
		forward: true,
		options: [option('ne', 'ne', 'Nepali — model default')]
	},
	'qwen3-asr': {
		defaultValue: '',
		selectable: true,
		forward: true,
		options: [automatic('Detect automatically'), ...qwenAsrLanguages]
	}
};

const registries = { speech, transcription };

export function getModelLanguageSupport(operation: LanguageOperation, model: string) {
	return registries[operation][model];
}

export function getModelLanguageOption(operation: LanguageOperation, model: string, value: string) {
	return getModelLanguageSupport(operation, model)?.options.find((item) => item.value === value);
}

export function normalizeReportedLanguage(
	operation: LanguageOperation,
	model: string,
	value: string
) {
	const normalized = value.trim().toLowerCase();
	if (!normalized) return '';
	const match = getModelLanguageSupport(operation, model)?.options.find(
		(item) =>
			item.value.toLowerCase() === normalized ||
			item.apiValue.toLowerCase() === normalized ||
			item.label.toLowerCase() === normalized
	);
	return match?.value || normalized;
}
