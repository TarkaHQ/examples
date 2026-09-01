<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Check,
		Clipboard,
		FileAudio,
		FileText,
		Languages,
		LoaderCircle,
		Sparkles,
		Upload,
		X
	} from '@lucide/svelte';
	import { apiRequest, getErrorMessage } from '$lib/client-api';
	import type { TranscriptionRecord } from '$lib/types';
	import AudioPlayer from './AudioPlayer.svelte';
	import Recorder from './Recorder.svelte';

	let {
		audioUrls,
		oncreated
	}: {
		audioUrls: Record<string, string>;
		oncreated: (record: TranscriptionRecord) => void | Promise<void>;
	} = $props();

	let fileInput: HTMLInputElement;
	let file = $state<File | null>(null);
	let previewUrl = $state('');
	let model = $state('whisper-large-v3');
	let language = $state('');
	let prompt = $state('');
	let dragging = $state(false);
	let transcribing = $state(false);
	let copied = $state(false);
	let errorMessage = $state('');
	let latest = $state<TranscriptionRecord | null>(null);
	let latestUrl = $derived(latest ? audioUrls[latest.id] || '' : '');

	function readableSize(bytes: number) {
		if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function chooseFile(next: File | null) {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		file = next;
		previewUrl = next ? URL.createObjectURL(next) : '';
		errorMessage = '';
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const next = event.dataTransfer?.files[0];
		if (next) chooseFile(next);
	}

	async function copyText() {
		if (!latest?.text) return;
		await navigator.clipboard.writeText(latest.text);
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}

	async function transcribe() {
		if (!file) {
			errorMessage = 'Upload or record an audio file first.';
			return;
		}
		errorMessage = '';
		transcribing = true;
		try {
			const data = new FormData();
			data.set('file', file, file.name);
			data.set('model', model);
			if (language) data.set('language', language);
			if (prompt.trim()) data.set('prompt', prompt.trim());
			const record = await apiRequest<TranscriptionRecord>('/api/transcriptions', {
				method: 'POST',
				body: data
			});
			latest = record;
			await oncreated(record);
		} catch (error) {
			errorMessage = getErrorMessage(error);
		} finally {
			transcribing = false;
		}
	}

	onDestroy(() => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});
</script>

<section class="workspace-panel transcribe-panel">
	<header class="panel-heading">
		<div>
			<span class="section-kicker"><FileText size={13} /> Speech to text</span>
			<h1>Turn moments into words.</h1>
			<p>Upload a conversation or record one now. Boli keeps the audio and transcript together.</p>
		</div>
	</header>

	<div class="transcribe-grid">
		<div class="input-column">
			<section class="upload-card">
				<div class="card-heading">
					<div>
						<h2>Add audio</h2>
						<span>MP3, WAV, M4A, OGG or WebM · up to 100 MB</span>
					</div>
					<FileAudio size={19} />
				</div>

				{#if file}
					<div class="chosen-file">
						<div class="file-art"><FileAudio size={24} /></div>
						<div class="file-copy">
							<strong>{file.name}</strong><span
								>{readableSize(file.size)} · Ready to transcribe</span
							>
						</div>
						<button type="button" onclick={() => chooseFile(null)} aria-label="Remove audio"
							><X size={17} /></button
						>
					</div>
					{#if previewUrl}<audio class="native-preview" controls src={previewUrl}></audio>{/if}
				{:else}
					<button
						type="button"
						class="drop-zone"
						class:dragging
						onclick={() => fileInput.click()}
						ondragover={(event) => {
							event.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						ondrop={onDrop}
					>
						<span class="upload-icon"><Upload size={22} /></span>
						<strong>Drop your audio here</strong>
						<span>or click to browse from your device</span>
						<em>Choose audio</em>
					</button>
				{/if}
				<input
					class="visually-hidden"
					bind:this={fileInput}
					type="file"
					accept="audio/*,.m4a"
					onchange={(event) => chooseFile(event.currentTarget.files?.[0] || null)}
				/>

				<div class="or-divider"><span>or</span></div>
				<Recorder onrecorded={chooseFile} />
				{#if errorMessage}<div class="inline-message error" role="alert">{errorMessage}</div>{/if}
			</section>

			<section class="transcription-settings">
				<div class="settings-heading">
					<h2>Transcription settings</h2>
					<span>Tarka STT</span>
				</div>
				<div class="settings-grid">
					<label
						><span>Model</span><select bind:value={model}
							><option value="whisper-large-v3">Whisper Large v3</option><option
								value="whisper-nepali-medium">Whisper Nepali Medium</option
							><option value="qwen3-asr">Qwen3 ASR</option></select
						></label
					>
					<label
						><span><Languages size={13} /> Language hint</span><select bind:value={language}
							><option value="">Detect automatically</option><option value="ne">Nepali</option
							><option value="en">English</option><option value="hi">Hindi</option><option
								value="de">German</option
							><option value="fr">French</option><option value="es">Spanish</option></select
						></label
					>
				</div>
				<label class="prompt-field"
					><span>Names or vocabulary <em>Optional</em></span><input
						bind:value={prompt}
						maxlength="2000"
						placeholder="e.g. Tarka, Biralo, Kathmandu…"
					/></label
				>
				<button
					class="transcribe-button"
					type="button"
					onclick={transcribe}
					disabled={!file || transcribing}
				>
					{#if transcribing}<span class="spin"><LoaderCircle size={17} /></span> Listening closely…{:else}<Sparkles
							size={17}
						/> Transcribe audio{/if}
				</button>
			</section>
		</div>

		<aside class="transcript-column">
			<div class="transcript-card" class:has-result={latest}>
				<div class="transcript-head">
					<div>
						<span class="document-icon"><FileText size={17} /></span>
						<div>
							<h2>Transcript</h2>
							<span>{latest ? 'Saved to your library' : 'Your result will appear here'}</span>
						</div>
					</div>
					{#if latest}<button type="button" onclick={copyText}
							>{#if copied}<Check size={15} /> Copied{:else}<Clipboard size={15} /> Copy{/if}</button
						>{/if}
				</div>
				{#if latest}
					<div class="transcript-meta">
						<span>{latest.language?.toUpperCase() || 'AUTO'}</span><span>{latest.model}</span
						>{#if latest.duration}<span>{Math.round(latest.duration)} sec</span>{/if}
					</div>
					<div class="transcript-text">{latest.text}</div>
					{#if latestUrl}<AudioPlayer src={latestUrl} title={latest.filename} compact />{/if}
				{:else}
					<div class="transcript-empty">
						<div class="empty-lines">
							<span></span><span></span><span></span><span></span><span></span>
						</div>
						<strong>Your words, neatly captured.</strong>
						<p>Boli will preserve the original audio alongside its transcript.</p>
					</div>
				{/if}
			</div>
			<div class="language-tip">
				<Languages size={18} />
				<div>
					<strong>Nepali specialist</strong>
					<p>Choose Whisper Nepali Medium and set the hint to Nepali for focused recognition.</p>
				</div>
			</div>
		</aside>
	</div>
</section>

<style>
	.transcribe-panel {
		max-width: 1280px;
	}
	.panel-heading {
		margin-bottom: 30px;
	}
	.section-kicker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: #667f8e;
		font-family: var(--font-mono);
		font-size: 0.61rem;
		font-weight: 760;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.panel-heading h1 {
		margin: 9px 0 8px;
		font-size: clamp(2rem, 4vw, 3.15rem);
		font-weight: 570;
		letter-spacing: -0.065em;
		line-height: 1;
	}
	.panel-heading p {
		max-width: 650px;
		margin: 0;
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.55;
	}
	.transcribe-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
		gap: 20px;
	}
	.input-column {
		display: grid;
		align-content: start;
		gap: 15px;
	}
	.upload-card,
	.transcription-settings,
	.transcript-card,
	.language-tip {
		border: 1px solid var(--line);
		border-radius: 17px;
		background: var(--surface);
		box-shadow: var(--shadow-xs);
	}
	.upload-card {
		padding: 19px;
	}
	.card-heading,
	.settings-heading,
	.transcript-head,
	.transcript-head > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.card-heading {
		margin-bottom: 16px;
		color: var(--muted);
	}
	.card-heading h2,
	.settings-heading h2,
	.transcript-head h2 {
		margin: 0;
		color: var(--ink);
		font-size: 0.78rem;
	}
	.card-heading span,
	.settings-heading span,
	.transcript-head span {
		display: block;
		margin-top: 3px;
		color: var(--muted);
		font-size: 0.57rem;
	}
	.drop-zone {
		display: flex;
		width: 100%;
		min-height: 230px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		padding: 25px;
		border: 1px dashed var(--line-strong);
		border-radius: 14px;
		background: var(--surface-2);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.drop-zone:hover,
	.drop-zone.dragging {
		border-color: #7895a4;
		background: #f0f5f7;
	}
	.upload-icon {
		display: grid;
		width: 46px;
		height: 46px;
		place-items: center;
		margin-bottom: 13px;
		border-radius: 14px;
		background: var(--surface);
		color: #617f8f;
		box-shadow: var(--shadow-sm);
	}
	.drop-zone strong {
		font-size: 0.78rem;
	}
	.drop-zone > span:not(.upload-icon) {
		margin-top: 5px;
		color: var(--muted);
		font-size: 0.62rem;
	}
	.drop-zone em {
		margin-top: 17px;
		padding: 8px 11px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		font-size: 0.62rem;
		font-style: normal;
		font-weight: 670;
	}
	.chosen-file {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		border: 1px solid #c7d9df;
		border-radius: 13px;
		background: #f2f7f8;
	}
	.file-art {
		display: grid;
		width: 45px;
		height: 45px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 12px;
		background: #d9e8ec;
		color: #5c8190;
	}
	.file-copy {
		display: grid;
		min-width: 0;
		gap: 4px;
	}
	.file-copy strong {
		overflow: hidden;
		font-size: 0.73rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-copy span {
		color: #66818a;
		font-size: 0.58rem;
	}
	.chosen-file button {
		display: grid;
		width: 32px;
		height: 32px;
		margin-left: auto;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.chosen-file button:hover {
		background: white;
		color: var(--danger);
	}
	.native-preview {
		width: 100%;
		height: 40px;
		margin-top: 11px;
	}
	.or-divider {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 15px 0;
		color: var(--muted);
		font-size: 0.57rem;
	}
	.or-divider::before,
	.or-divider::after {
		height: 1px;
		flex: 1;
		background: var(--line-soft);
		content: '';
	}
	.inline-message {
		margin-top: 12px;
		padding: 11px 13px;
		border-radius: 9px;
		font-size: 0.68rem;
	}
	.inline-message.error {
		border: 1px solid #ecc9c1;
		background: #fff3f0;
		color: var(--danger);
	}
	.transcription-settings {
		padding: 18px 19px;
	}
	.settings-heading {
		margin-bottom: 15px;
	}
	.settings-heading > span {
		margin: 0;
		padding: 4px 7px;
		border-radius: 6px;
		background: var(--surface-2);
		font-family: var(--font-mono);
	}
	.settings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.transcription-settings label {
		display: grid;
		gap: 7px;
	}
	.transcription-settings label > span {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--ink-soft);
		font-size: 0.61rem;
		font-weight: 670;
	}
	.transcription-settings select,
	.transcription-settings input {
		width: 100%;
		height: 39px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 9px;
		outline: none;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.65rem;
	}
	.transcription-settings select:focus,
	.transcription-settings input:focus {
		border-color: var(--line-strong);
	}
	.prompt-field {
		margin-top: 13px;
	}
	.prompt-field em {
		margin-left: auto;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.51rem;
		font-style: normal;
		font-weight: 500;
	}
	.transcribe-button {
		display: flex;
		width: 100%;
		height: 43px;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 16px;
		border: 0;
		border-radius: 10px;
		background: var(--ink);
		color: white;
		font: inherit;
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
	}
	.transcribe-button:hover:not(:disabled) {
		background: #30373f;
	}
	.transcribe-button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.transcript-column {
		display: grid;
		align-content: start;
		gap: 15px;
	}
	.transcript-card {
		min-height: 500px;
		padding: 17px;
	}
	.transcript-head {
		padding-bottom: 14px;
		border-bottom: 1px solid var(--line-soft);
	}
	.document-icon {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border-radius: 9px;
		background: var(--surface-2);
		color: #647c89;
	}
	.transcript-head button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 9px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		color: var(--ink-soft);
		font: inherit;
		font-size: 0.57rem;
		font-weight: 650;
		cursor: pointer;
	}
	.transcript-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin: 15px 0 12px;
	}
	.transcript-meta span {
		padding: 4px 6px;
		border-radius: 5px;
		background: var(--surface-2);
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 700;
	}
	.transcript-text {
		max-height: 390px;
		overflow-y: auto;
		margin-bottom: 16px;
		padding-right: 5px;
		color: var(--ink-soft);
		font-size: 0.76rem;
		line-height: 1.72;
		white-space: pre-wrap;
	}
	.transcript-empty {
		display: flex;
		min-height: 410px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		text-align: center;
	}
	.empty-lines {
		display: grid;
		width: 75%;
		gap: 10px;
		margin-bottom: 35px;
		opacity: 0.6;
	}
	.empty-lines span {
		height: 8px;
		border-radius: 5px;
		background: var(--surface-2);
	}
	.empty-lines span:nth-child(2) {
		width: 88%;
	}
	.empty-lines span:nth-child(3) {
		width: 96%;
	}
	.empty-lines span:nth-child(4) {
		width: 72%;
	}
	.empty-lines span:nth-child(5) {
		width: 43%;
	}
	.transcript-empty strong {
		font-size: 0.75rem;
	}
	.transcript-empty p {
		max-width: 240px;
		margin: 7px 0 0;
		color: var(--muted);
		font-size: 0.62rem;
		line-height: 1.55;
	}
	.language-tip {
		display: flex;
		gap: 11px;
		padding: 14px;
		background: #f5f2e8;
		color: #8c6d31;
	}
	.language-tip :global(svg) {
		flex: 0 0 auto;
	}
	.language-tip strong {
		display: block;
		color: #6e5424;
		font-size: 0.65rem;
	}
	.language-tip p {
		margin: 4px 0 0;
		font-size: 0.56rem;
		line-height: 1.5;
	}
	.spin {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1000px) {
		.transcribe-grid {
			grid-template-columns: 1fr;
		}
		.transcript-card {
			min-height: 360px;
		}
		.transcript-empty {
			min-height: 280px;
		}
	}
	@media (max-width: 600px) {
		.settings-grid {
			grid-template-columns: 1fr;
		}
		.drop-zone {
			min-height: 190px;
		}
		.upload-card,
		.transcription-settings {
			padding: 15px;
		}
	}
</style>
