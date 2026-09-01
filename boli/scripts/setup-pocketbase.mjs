import PocketBase from 'pocketbase';

const url = process.env.PUBLIC_POCKETBASE_URL || 'https://pb.boli.tarka.site';
const email = process.env.PB_SUPERUSER_EMAIL;
const password = process.env.PB_SUPERUSER_PASSWORD;

if (!email || !password) {
	console.error('Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD before running this script.');
	process.exit(1);
}

const pb = new PocketBase(url);
pb.autoCancellation(false);

const ownerRules = {
	listRule: 'owner = @request.auth.id',
	viewRule: 'owner = @request.auth.id',
	createRule: '@request.auth.id != "" && owner = @request.auth.id',
	updateRule: 'owner = @request.auth.id',
	deleteRule: 'owner = @request.auth.id'
};

const text = (name, options = {}) => ({
	name,
	type: 'text',
	required: false,
	hidden: false,
	presentable: false,
	min: 0,
	max: 0,
	pattern: '',
	autogeneratePattern: '',
	...options
});

const owner = {
	name: 'owner',
	type: 'relation',
	required: true,
	hidden: false,
	presentable: false,
	collectionId: '_pb_users_auth_',
	cascadeDelete: true,
	minSelect: 0,
	maxSelect: 1
};

const audioFile = (name, maxSize = 52_428_800) => ({
	name,
	type: 'file',
	required: true,
	hidden: false,
	presentable: false,
	maxSelect: 1,
	maxSize,
	mimeTypes: [
		'audio/aac',
		'audio/flac',
		'audio/m4a',
		'audio/mpeg',
		'audio/mp3',
		'audio/mp4',
		'audio/ogg',
		'audio/opus',
		'audio/wav',
		'audio/webm',
		'audio/x-m4a',
		'audio/x-wav'
	],
	thumbs: [],
	protected: true
});

const status = {
	name: 'status',
	type: 'select',
	required: true,
	hidden: false,
	presentable: false,
	values: ['pending', 'processing', 'ready', 'failed'],
	maxSelect: 1
};

const timestamps = [
	{
		name: 'created',
		type: 'autodate',
		hidden: false,
		presentable: false,
		onCreate: true,
		onUpdate: false
	},
	{
		name: 'updated',
		type: 'autodate',
		hidden: false,
		presentable: false,
		onCreate: true,
		onUpdate: true
	}
];

const definitions = [
	{
		name: 'voices',
		type: 'base',
		...ownerRules,
		fields: [
			owner,
			text('name', { required: true, max: 120, presentable: true }),
			text('model', { required: true, max: 80 }),
			text('tarka_voice_id', { required: true, max: 160 }),
			status,
			text('consent_signed_by', { required: true, max: 160 }),
			{
				name: 'consent_date',
				type: 'date',
				required: true,
				hidden: false,
				presentable: false,
				min: '',
				max: ''
			},
			audioFile('sample', 26_214_400),
			text('error_message', { max: 500 }),
			...timestamps
		],
		indexes: [
			'CREATE INDEX `idx_voices_owner_created` ON `voices` (`owner`, `created`)',
			'CREATE UNIQUE INDEX `idx_voices_tarka_id` ON `voices` (`tarka_voice_id`)'
		]
	},
	{
		name: 'generations',
		type: 'base',
		...ownerRules,
		fields: [
			owner,
			text('input', { required: true, max: 50_000, presentable: true }),
			text('model', { required: true, max: 80 }),
			text('voice_ref', { required: true, max: 500 }),
			text('voice_name', { max: 160 }),
			text('response_format', { required: true, max: 16 }),
			text('language', { max: 16 }),
			{
				name: 'speed',
				type: 'number',
				required: true,
				hidden: false,
				presentable: false,
				min: 0.25,
				max: 4,
				onlyInt: false
			},
			text('instructions', { max: 2_000 }),
			audioFile('audio', 104_857_600),
			text('content_type', { max: 80 }),
			text('duration_label', { max: 40 }),
			...timestamps
		],
		indexes: ['CREATE INDEX `idx_generations_owner_created` ON `generations` (`owner`, `created`)']
	},
	{
		name: 'transcriptions',
		type: 'base',
		...ownerRules,
		fields: [
			owner,
			text('filename', { required: true, max: 255, presentable: true }),
			text('model', { required: true, max: 80 }),
			text('language', { max: 16 }),
			text('prompt', { max: 2_000 }),
			text('text', { required: true, max: 200_000 }),
			text('task', { max: 40 }),
			{
				name: 'duration',
				type: 'number',
				required: false,
				hidden: false,
				presentable: false,
				min: 0,
				max: null,
				onlyInt: false
			},
			audioFile('audio', 104_857_600),
			...timestamps
		],
		indexes: [
			'CREATE INDEX `idx_transcriptions_owner_created` ON `transcriptions` (`owner`, `created`)'
		]
	}
];

const safeAdditions = new Set(['generations.language']);

await pb.collection('_superusers').authWithPassword(email, password);

const existing = await pb.collections.getFullList();
const existingByName = new Map(existing.map((collection) => [collection.name, collection]));

for (const definition of definitions) {
	const current = existingByName.get(definition.name);
	if (current) {
		const problems = [];
		const additions = [];
		const actualFields = new Map(current.fields.map((field) => [field.name, field]));
		for (const expected of definition.fields) {
			const actual = actualFields.get(expected.name);
			if (!actual) {
				if (safeAdditions.has(`${definition.name}.${expected.name}`)) additions.push(expected);
				else problems.push(`missing field ${expected.name}`);
				continue;
			}
			if (actual.type !== expected.type) {
				problems.push(`${expected.name} should be ${expected.type}, found ${actual.type}`);
			}
			if (expected.protected === true && actual.protected !== true) {
				problems.push(`${expected.name} must be a protected file field`);
			}
			if (expected.name === 'owner' && actual.collectionId !== '_pb_users_auth_') {
				problems.push('owner must relate to the users collection');
			}
		}
		for (const [rule, expected] of Object.entries(ownerRules)) {
			if (current[rule] !== expected) problems.push(`${rule} does not match the owner-only rule`);
		}
		if (problems.length) {
			throw new Error(
				`${definition.name} already exists but failed verification: ${problems.join('; ')}. Review it manually before changing production data.`
			);
		}
		if (additions.length) {
			await pb.collections.update(current.id, { fields: [...current.fields, ...additions] });
			console.log(
				`Updated collection ${definition.name}: added ${additions.map((field) => field.name).join(', ')}`
			);
		} else {
			console.log(`Verified existing collection: ${definition.name}`);
		}
		continue;
	}

	await pb.collections.create(definition);
	console.log(`Created collection: ${definition.name}`);
}

console.log(`PocketBase is ready for Boli at ${url}.`);
