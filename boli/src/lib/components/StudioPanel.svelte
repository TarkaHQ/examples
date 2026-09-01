<script lang="ts">
	import { apiRequest, getErrorMessage } from '$lib/client-api';
	import type { GenerationRecord, VoiceRecord } from '$lib/types';
	import {
		AudioLines,
		ChevronDown,
		CirclePlus,
		Gauge,
		LoaderCircle,
		SlidersHorizontal,
		Sparkles,
		Volume2
	} from '@lucide/svelte';
	import AudioPlayer from './AudioPlayer.svelte';

	let {
		voices,
		audioUrls,
		oncreated,
		ongovoices
	}: {
		voices: VoiceRecord[];
		audioUrls: Record<string, string>;
		oncreated: (record: GenerationRecord) => void | Promise<void>;
		ongovoices: () => void;
	} = $props();

	type VoiceOption = {
		id: string;
		name: string;
		description: string;
		model: string;
		voice: string;
		language: string;
		tone: string;
		custom?: boolean;
		ready?: boolean;
	};

	const builtIns: VoiceOption[] = [
		{
			id: 'heart',
			name: 'Heart',
			description: 'Warm, expressive English',
			model: 'kokoro',
			voice: 'af_heart',
			language: 'EN',
			tone: 'blue'
		},
		{
			id: 'piper',
			name: 'Piper',
			description: 'Crisp, reliable narration',
			model: 'piper',
			voice: 'default',
			language: 'EN',
			tone: 'sand'
		},
		{
			id: 'nepali',
			name: 'Kathmandu',
			description: 'Clear, calm Nepali speaker',
			model: 'nepali-parler-tts',
			voice: 'A clear, calm Nepali speaker with a warm and natural delivery',
			language: 'NE',
			tone: 'warm'
		}
	];

	let allVoices = $derived([
		...builtIns,
		...voices.map((voice, index): VoiceOption => ({
			id: voice.id,
			name: voice.name,
			description: voice.status === 'ready' ? 'Your cloned voice' : `Clone ${voice.status}`,
			model: voice.model,
			voice: voice.tarka_voice_id,
			language: 'CUSTOM',
			tone: ['green', 'lilac', 'rose'][index % 3],
			custom: true,
			ready: voice.status === 'ready'
		}))
	]);

	let selectedId = $state('heart');
	let input = $state('Welcome to Boli — your private voice studio, powered by Tarka.');
	let speed = $state(1);
	let format = $state('mp3');
	let instructions = $state('');
	let generating = $state(false);
	let errorMessage = $state('');
	let latest = $state<GenerationRecord | null>(null);
	let selectedVoice = $derived(allVoices.find((voice) => voice.id === selectedId) || builtIns[0]);
	let latestUrl = $derived(latest ? audioUrls[latest.id] || '' : '');

	function selectVoice(voice: VoiceOption) {
		if (voice.custom && !voice.ready) return;
		selectedId = voice.id;
	}

	async function generate() {
		errorMessage = '';
		if (!input.trim()) {
			errorMessage = 'Write something for Boli to say.';
			return;
		}
		generating = true;
		try {
			const record = await apiRequest<GenerationRecord>('/api/speech', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					input,
					model: selectedVoice.model,
					voice: selectedVoice.voice,
					voice_name: selectedVoice.name,
					response_format: format,
					speed,
					instructions
				})
			});
			latest = record;
			await oncreated(record);
		} catch (error) {
			errorMessage = getErrorMessage(error);
		} finally {
			generating = false;
		}
	}
</script>

<section class="workspace-panel studio-panel">
	<header class="panel-heading">
		<div>
			<span class="section-kicker"><Sparkles size={13} /> Voice studio</span>
			<h1>What should we say?</h1>
			<p>Choose a voice, shape the delivery, and create ready-to-use audio.</p>
		</div>
		<button class="secondary-button add-voice" type="button" onclick={ongovoices}
			><CirclePlus size={16} /> New voice</button
		>
	</header>

	<div class="studio-grid">
		<div class="studio-main">
			<section class="voice-shelf">
				<div class="subheading">
					<div>
						<h2>Your voices</h2>
						<span>{allVoices.length} available</span>
					</div>
					<button type="button" aria-label="Voice options"><ChevronDown size={16} /></button>
				</div>
				<div class="voice-list">
					{#each allVoices as voice (voice.id)}
						<button
							type="button"
							class="voice-card"
							class:selected={selectedVoice.id === voice.id}
							class:unavailable={voice.custom && !voice.ready}
							data-tone={voice.tone}
							onclick={() => selectVoice(voice)}
						>
							<span class="voice-avatar"><AudioLines size={20} /></span>
							<span class="voice-name">{voice.name}</span>
							<span class="voice-description">{voice.description}</span>
							<span class="voice-foot"
								><em>{voice.language}</em>{#if voice.custom}<i>{voice.ready ? 'Ready' : 'Wait'}</i
									>{/if}</span
							>
						</button>
					{/each}
					<button type="button" class="voice-card create-card" onclick={ongovoices}>
						<span class="create-icon"><CirclePlus size={20} /></span>
						<span class="voice-name">Clone a voice</span>
						<span class="voice-description">Add a consented sample</span>
					</button>
				</div>
			</section>

			<section class="composer-card">
				<div class="composer-topline">
					<span><Volume2 size={15} /> Speaking with <strong>{selectedVoice.name}</strong></span>
					<span class="model-pill">{selectedVoice.model}</span>
				</div>
				<textarea
					bind:value={input}
					maxlength="50000"
					aria-label="Text to turn into speech"
					placeholder="Type or paste the words you want to hear…"></textarea>
				<div class="composer-footer">
					<span class="character-count">{input.length.toLocaleString()} / 50,000</span>
					<button
						class="generate-button"
						type="button"
						onclick={generate}
						disabled={generating || !input.trim()}
					>
						{#if generating}<span class="spin"><LoaderCircle size={16} /></span> Creating voice…{:else}<Sparkles
								size={16}
							/> Generate audio{/if}
					</button>
				</div>
			</section>

			{#if errorMessage}<div class="inline-message error" role="alert">{errorMessage}</div>{/if}

			{#if latest}
				<section class="result-card">
					<div class="result-heading">
						<div>
							<span class="result-dot"></span>
							<div>
								<strong>Your audio is ready</strong><small>Saved to your Boli library</small>
							</div>
						</div>
						<span>Just now</span>
					</div>
					{#if latestUrl}<AudioPlayer
							src={latestUrl}
							title={latest.voice_name || latest.model}
							meta={latest.response_format.toUpperCase()}
						/>{:else}<div class="audio-loading">Securing your audio link…</div>{/if}
				</section>
			{/if}
		</div>

		<aside class="studio-settings">
			<div class="settings-title">
				<SlidersHorizontal size={16} />
				<h2>Voice settings</h2>
			</div>
			<div class="selected-voice-summary" data-tone={selectedVoice.tone}>
				<span class="summary-avatar"><AudioLines size={19} /></span>
				<div><strong>{selectedVoice.name}</strong><small>{selectedVoice.description}</small></div>
				<span class="live-dot" title="Available"></span>
			</div>
			<label class="control-label">
				<span>Model</span>
				<div class="select-wrap">
					<select value={selectedVoice.model} disabled
						><option>{selectedVoice.model}</option></select
					><ChevronDown size={14} />
				</div>
			</label>
			<label class="control-label">
				<span><Gauge size={13} /> Speed <em>{speed.toFixed(2)}×</em></span>
				<input class="speed-range" bind:value={speed} type="range" min="0.5" max="2" step="0.05" />
				<div class="range-labels"><small>Slow</small><small>Natural</small><small>Fast</small></div>
			</label>
			<label class="control-label">
				<span>Audio format</span>
				<div class="format-grid">
					{#each ['mp3', 'wav', 'flac', 'opus'] as option (option)}
						<button type="button" class:active={format === option} onclick={() => (format = option)}
							>{option}</button
						>
					{/each}
				</div>
			</label>
			<label class="control-label instructions">
				<span>Delivery notes <em>Optional</em></span>
				<textarea
					bind:value={instructions}
					maxlength="2000"
					placeholder="e.g. Calm, with a thoughtful pause…"></textarea>
			</label>
			<div class="privacy-note">
				<span>✓</span>
				<p>
					<strong>Private workspace</strong>Your text and audio are stored under your Boli account.
				</p>
			</div>
		</aside>
	</div>
</section>

<style>
	.studio-panel {
		max-width: 1440px;
	}
	.panel-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 31px;
	}
	.section-kicker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: #8d6722;
		font-family: var(--font-mono);
		font-size: 0.61rem;
		font-weight: 760;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.panel-heading h1 {
		margin: 9px 0 8px;
		color: var(--ink);
		font-size: clamp(2rem, 4vw, 3.15rem);
		font-weight: 570;
		letter-spacing: -0.065em;
		line-height: 1;
	}
	.panel-heading p {
		margin: 0;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.secondary-button {
		display: inline-flex;
		height: 38px;
		align-items: center;
		gap: 7px;
		padding: 0 13px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.69rem;
		font-weight: 670;
		cursor: pointer;
		box-shadow: var(--shadow-xs);
	}
	.secondary-button:hover {
		border-color: var(--line-strong);
		transform: translateY(-1px);
	}
	.studio-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 285px;
		gap: 23px;
	}
	.studio-main {
		min-width: 0;
	}
	.voice-shelf,
	.composer-card,
	.result-card,
	.studio-settings {
		border: 1px solid var(--line);
		border-radius: 17px;
		background: var(--surface);
		box-shadow: var(--shadow-xs);
	}
	.voice-shelf {
		padding: 17px 17px 18px;
	}
	.subheading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 13px;
	}
	.subheading > div {
		display: flex;
		align-items: baseline;
		gap: 9px;
	}
	.subheading h2 {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 720;
	}
	.subheading span {
		color: var(--muted);
		font-size: 0.61rem;
	}
	.subheading button {
		display: grid;
		padding: 5px;
		border: 0;
		background: transparent;
		color: var(--muted);
	}
	.voice-list {
		display: grid;
		grid-template-columns: repeat(4, minmax(120px, 1fr));
		gap: 10px;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.voice-card {
		position: relative;
		display: flex;
		min-height: 146px;
		overflow: hidden;
		flex-direction: column;
		align-items: flex-start;
		padding: 13px;
		border: 1px solid var(--line);
		border-radius: 13px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.15s,
			box-shadow 0.15s,
			transform 0.15s;
	}
	.voice-card::before {
		position: absolute;
		inset: 0 0 auto;
		height: 3px;
		background: var(--voice-color, #94a9b5);
		content: '';
		opacity: 0;
	}
	.voice-card:hover {
		border-color: var(--line-strong);
		transform: translateY(-2px);
	}
	.voice-card.selected {
		border-color: #b7862d;
		box-shadow: 0 0 0 2px rgba(230, 184, 92, 0.24);
	}
	.voice-card.selected::before {
		opacity: 1;
	}
	.voice-card.unavailable {
		cursor: not-allowed;
		opacity: 0.52;
	}
	.voice-card[data-tone='blue'],
	.selected-voice-summary[data-tone='blue'] {
		--voice-bg: #dce8ef;
		--voice-color: #668ca1;
	}
	.voice-card[data-tone='sand'],
	.selected-voice-summary[data-tone='sand'] {
		--voice-bg: #ebe5d5;
		--voice-color: #a28e58;
	}
	.voice-card[data-tone='warm'],
	.selected-voice-summary[data-tone='warm'] {
		--voice-bg: #eedfd8;
		--voice-color: #a97762;
	}
	.voice-card[data-tone='green'],
	.selected-voice-summary[data-tone='green'] {
		--voice-bg: #dce9dd;
		--voice-color: #66896a;
	}
	.voice-card[data-tone='lilac'],
	.selected-voice-summary[data-tone='lilac'] {
		--voice-bg: #e6e0ed;
		--voice-color: #85749b;
	}
	.voice-card[data-tone='rose'],
	.selected-voice-summary[data-tone='rose'] {
		--voice-bg: #ecdde2;
		--voice-color: #9b6a7a;
	}
	.voice-avatar,
	.summary-avatar {
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border-radius: 10px;
		background: var(--voice-bg, #e7e9eb);
		color: var(--voice-color, #68737d);
	}
	.voice-name {
		margin-top: 12px;
		font-size: 0.78rem;
		font-weight: 720;
		letter-spacing: -0.02em;
	}
	.voice-description {
		display: -webkit-box;
		overflow: hidden;
		margin-top: 4px;
		color: var(--muted);
		font-size: 0.61rem;
		line-height: 1.38;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	.voice-foot {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		margin-top: auto;
		padding-top: 9px;
	}
	.voice-foot em,
	.voice-foot i {
		padding: 3px 5px;
		border-radius: 5px;
		background: var(--surface-2);
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.voice-foot i {
		background: #ecf6ee;
		color: #497653;
	}
	.create-card {
		align-items: center;
		justify-content: center;
		border-style: dashed;
		text-align: center;
	}
	.create-card .voice-name {
		margin-top: 9px;
	}
	.create-icon {
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--muted);
	}
	.composer-card {
		margin-top: 15px;
		padding: 18px 19px 16px;
	}
	.composer-topline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		color: var(--muted);
		font-size: 0.65rem;
	}
	.composer-topline > span:first-child {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.composer-topline strong {
		color: var(--ink);
	}
	.model-pill {
		padding: 4px 7px;
		border-radius: 6px;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.53rem;
	}
	.composer-card > textarea {
		width: 100%;
		min-height: 210px;
		resize: vertical;
		padding: 23px 2px 12px;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: clamp(1.25rem, 2.2vw, 1.7rem);
		font-weight: 450;
		letter-spacing: -0.035em;
		line-height: 1.52;
	}
	.composer-card > textarea::placeholder {
		color: #bdc1c4;
	}
	.composer-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding-top: 13px;
		border-top: 1px solid var(--line-soft);
	}
	.character-count {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.56rem;
	}
	.generate-button {
		display: inline-flex;
		min-width: 165px;
		height: 42px;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 16px;
		border: 0;
		border-radius: 11px;
		background: var(--ink);
		color: white;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 9px 22px rgba(20, 24, 29, 0.16);
	}
	.generate-button:hover:not(:disabled) {
		background: #30373f;
		transform: translateY(-1px);
	}
	.generate-button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	.result-card {
		margin-top: 15px;
		padding: 16px;
		background: #fbfaf7;
	}
	.result-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 13px;
	}
	.result-heading > div {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.result-heading > span {
		color: var(--muted);
		font-size: 0.57rem;
	}
	.result-heading strong,
	.result-heading small {
		display: block;
	}
	.result-heading strong {
		font-size: 0.72rem;
	}
	.result-heading small {
		margin-top: 2px;
		color: var(--muted);
		font-size: 0.57rem;
	}
	.result-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #6a9a73;
		box-shadow: 0 0 0 4px #e6f0e8;
	}
	.audio-loading {
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 13px;
		color: var(--muted);
		font-size: 0.68rem;
		text-align: center;
	}
	.studio-settings {
		align-self: start;
		padding: 17px;
	}
	.settings-title {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 15px;
		border-bottom: 1px solid var(--line-soft);
	}
	.settings-title h2 {
		margin: 0;
		font-size: 0.75rem;
	}
	.selected-voice-summary {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 15px 0 21px;
		padding: 11px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.summary-avatar {
		width: 35px;
		height: 35px;
		flex: 0 0 auto;
	}
	.selected-voice-summary > div {
		display: grid;
		min-width: 0;
		gap: 2px;
	}
	.selected-voice-summary strong {
		overflow: hidden;
		font-size: 0.68rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.selected-voice-summary small {
		overflow: hidden;
		color: var(--muted);
		font-size: 0.53rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.live-dot {
		width: 7px;
		height: 7px;
		margin-left: auto;
		border-radius: 50%;
		background: #6a9a73;
	}
	.control-label {
		display: grid;
		gap: 9px;
		margin-top: 19px;
	}
	.control-label > span {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--ink-soft);
		font-size: 0.62rem;
		font-weight: 680;
	}
	.control-label > span em {
		margin-left: auto;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		font-style: normal;
		font-weight: 500;
	}
	.select-wrap {
		position: relative;
	}
	.select-wrap select {
		width: 100%;
		height: 39px;
		appearance: none;
		padding: 0 32px 0 10px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.58rem;
	}
	.select-wrap :global(svg) {
		position: absolute;
		top: 13px;
		right: 10px;
		color: var(--muted);
		pointer-events: none;
	}
	.speed-range {
		width: 100%;
		accent-color: var(--ink);
	}
	.range-labels {
		display: flex;
		justify-content: space-between;
		margin-top: -5px;
		color: var(--muted);
		font-size: 0.5rem;
	}
	.format-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 5px;
	}
	.format-grid button {
		height: 32px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		font-weight: 700;
		text-transform: uppercase;
		cursor: pointer;
	}
	.format-grid button.active {
		border-color: var(--ink);
		background: var(--ink);
		color: white;
	}
	.instructions textarea {
		min-height: 82px;
		resize: vertical;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: 9px;
		outline: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.64rem;
		line-height: 1.5;
	}
	.instructions textarea:focus {
		border-color: var(--line-strong);
	}
	.privacy-note {
		display: flex;
		gap: 8px;
		margin-top: 20px;
		padding: 11px;
		border-radius: 10px;
		background: #f0f5f1;
		color: #53745a;
	}
	.privacy-note > span {
		font-size: 0.66rem;
		font-weight: 800;
	}
	.privacy-note p {
		display: grid;
		gap: 2px;
		margin: 0;
		font-size: 0.55rem;
		line-height: 1.35;
	}
	.privacy-note strong {
		color: #3c6245;
		font-size: 0.59rem;
	}
	.inline-message {
		margin-top: 13px;
		padding: 11px 13px;
		border-radius: 9px;
		font-size: 0.68rem;
	}
	.inline-message.error {
		border: 1px solid #ecc9c1;
		background: #fff3f0;
		color: var(--danger);
	}
	.spin {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1120px) {
		.studio-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.studio-settings {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 0 20px;
		}
		.settings-title,
		.privacy-note {
			grid-column: 1 / -1;
		}
		.selected-voice-summary {
			grid-column: 1 / -1;
			margin-bottom: 3px;
		}
	}
	@media (max-width: 760px) {
		.voice-list {
			grid-template-columns: repeat(5, minmax(135px, 1fr));
		}
		.studio-settings {
			display: block;
		}
		.panel-heading {
			margin-bottom: 23px;
		}
		.add-voice {
			display: none;
		}
		.composer-card > textarea {
			min-height: 170px;
		}
	}
	@media (max-width: 520px) {
		.voice-shelf {
			margin-right: -18px;
			border-right: 0;
			border-radius: 15px 0 0 15px;
		}
		.voice-list {
			padding-right: 18px;
		}
		.composer-card {
			padding: 15px;
		}
		.composer-footer {
			align-items: flex-end;
		}
		.generate-button {
			min-width: 145px;
		}
	}
</style>
