<script lang="ts">
	import {
		AudioLines,
		CirclePlus,
		Clock3,
		FileAudio,
		LoaderCircle,
		RefreshCw,
		ShieldCheck,
		Sparkles,
		Trash2,
		Upload,
		X
	} from '@lucide/svelte';
	import { apiRequest, getErrorMessage } from '$lib/client-api';
	import type { VoiceRecord } from '$lib/types';
	import Recorder from './Recorder.svelte';

	let {
		voices,
		onchanged,
		ongostudio
	}: {
		voices: VoiceRecord[];
		onchanged: () => void | Promise<void>;
		ongostudio: () => void;
	} = $props();

	let formOpen = $state(false);
	let name = $state('');
	let signedBy = $state('');
	let consentDate = $state(new Date().toISOString().slice(0, 10));
	let confirmed = $state(false);
	let sample = $state<File | null>(null);
	let creating = $state(false);
	let actionId = $state('');
	let errorMessage = $state('');

	function closeForm() {
		if (creating) return;
		formOpen = false;
		errorMessage = '';
	}

	async function createVoice(event: SubmitEvent) {
		event.preventDefault();
		if (!sample) {
			errorMessage = 'Upload or record a voice sample.';
			return;
		}
		creating = true;
		errorMessage = '';
		try {
			const data = new FormData();
			data.set('name', name);
			data.set('sample', sample, sample.name);
			data.set('consent_signed_by', signedBy);
			data.set('consent_date', consentDate);
			data.set('consent_confirmed', String(confirmed));
			await apiRequest<VoiceRecord>('/api/voices', { method: 'POST', body: data });
			name = '';
			signedBy = '';
			confirmed = false;
			sample = null;
			formOpen = false;
			await onchanged();
		} catch (error) {
			errorMessage = getErrorMessage(error);
		} finally {
			creating = false;
		}
	}

	async function refresh(voice: VoiceRecord) {
		actionId = voice.id;
		errorMessage = '';
		try {
			await apiRequest<VoiceRecord>(`/api/voices/${voice.id}`, { method: 'PATCH' });
			await onchanged();
		} catch (error) {
			errorMessage = getErrorMessage(error);
		} finally {
			actionId = '';
		}
	}

	async function remove(voice: VoiceRecord) {
		if (
			!confirm(
				`Delete “${voice.name}”? This also deletes the clone from Tarka and cannot be undone.`
			)
		)
			return;
		actionId = voice.id;
		errorMessage = '';
		try {
			await apiRequest<void>(`/api/voices/${voice.id}`, { method: 'DELETE' });
			await onchanged();
		} catch (error) {
			errorMessage = getErrorMessage(error);
		} finally {
			actionId = '';
		}
	}

	function readableSize(bytes: number) {
		return bytes < 1024 * 1024
			? `${Math.round(bytes / 1024)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function dateLabel(date: string) {
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(date));
	}
</script>

<section class="workspace-panel voices-panel">
	<header class="panel-heading">
		<div>
			<span class="section-kicker"><AudioLines size={13} /> Voice library</span>
			<h1>Voices that are yours.</h1>
			<p>
				Create reusable voices from short, clean recordings — always with the speaker’s permission.
			</p>
		</div>
		<button class="primary-action" type="button" onclick={() => (formOpen = true)}
			><CirclePlus size={16} /> Clone a voice</button
		>
	</header>

	<div class="consent-banner">
		<span class="shield"><ShieldCheck size={22} /></span>
		<div>
			<strong>Consent is part of the voice.</strong>
			<p>Boli asks who signed off and when, then Tarka keeps that attestation with the clone.</p>
		</div>
		<span class="banner-label">Consent-backed</span>
	</div>

	{#if errorMessage && !formOpen}<div class="inline-message error" role="alert">
			{errorMessage}
		</div>{/if}

	<section class="voice-library">
		<div class="library-head">
			<div>
				<h2>Custom voices</h2>
				<span>{voices.length} {voices.length === 1 ? 'voice' : 'voices'}</span>
			</div>
			<p>Qwen3-TTS · private to your account</p>
		</div>
		{#if voices.length}
			<div class="voice-grid">
				{#each voices as voice, index (voice.id)}
					<article class="library-voice" data-tone={['green', 'lilac', 'rose', 'blue'][index % 4]}>
						<div class="voice-top">
							<span class="voice-art"><AudioLines size={22} /></span>
							<span
								class:ready={voice.status === 'ready'}
								class:failed={voice.status === 'failed'}
								class="status-pill">{voice.status}</span
							>
						</div>
						<h3>{voice.name}</h3>
						<p>
							{voice.status === 'ready'
								? 'Ready for generation in the studio.'
								: voice.status === 'failed'
									? voice.error_message || 'The clone could not be prepared.'
									: 'Tarka is preparing this voice.'}
						</p>
						<div class="voice-details">
							<span><Sparkles size={12} /> {voice.model}</span>
							<span><Clock3 size={12} /> {dateLabel(voice.created)}</span>
						</div>
						<div class="voice-actions">
							{#if voice.status === 'ready'}
								<button class="use-button" type="button" onclick={ongostudio}
									><AudioLines size={14} /> Use in studio</button
								>
							{:else}
								<button
									class="use-button"
									type="button"
									onclick={() => refresh(voice)}
									disabled={actionId === voice.id}
									><span class:spin={actionId === voice.id}><RefreshCw size={14} /></span> Check status</button
								>
							{/if}
							<button
								class="delete-button"
								type="button"
								onclick={() => remove(voice)}
								disabled={actionId === voice.id}
								aria-label={`Delete ${voice.name}`}><Trash2 size={15} /></button
							>
						</div>
					</article>
				{/each}
				<button class="new-voice-card" type="button" onclick={() => (formOpen = true)}
					><span><CirclePlus size={22} /></span><strong>Add another voice</strong>
					<p>A clean 3–30 second sample works best.</p></button
				>
			</div>
		{:else}
			<div class="empty-library">
				<div class="empty-orbit"><span><AudioLines size={28} /></span></div>
				<h3>Your first voice belongs here.</h3>
				<p>Record yourself or upload a clean sample from a consenting speaker.</p>
				<button type="button" onclick={() => (formOpen = true)}
					><CirclePlus size={15} /> Create your first voice</button
				>
			</div>
		{/if}
	</section>
</section>

{#if formOpen}
	<div
		class="drawer-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) closeForm();
		}}
	>
		<aside class="clone-drawer" aria-label="Clone a voice">
			<header>
				<div>
					<span class="section-kicker">New custom voice</span>
					<h2>Bring a voice to Boli.</h2>
					<p>A little clean audio is all Tarka needs.</p>
				</div>
				<button type="button" onclick={closeForm} aria-label="Close"><X size={19} /></button>
			</header>
			<form onsubmit={createVoice}>
				<label
					><span>Voice name</span><input
						bind:value={name}
						maxlength="120"
						placeholder="e.g. My narrator"
						required
					/></label
				>
				<div class="sample-section">
					<div class="field-title"><span>Voice sample</span><em>3–30 seconds recommended</em></div>
					{#if sample}
						<div class="sample-file">
							<span><FileAudio size={20} /></span>
							<div><strong>{sample.name}</strong><small>{readableSize(sample.size)}</small></div>
							<button type="button" onclick={() => (sample = null)}><X size={15} /></button>
						</div>
					{:else}
						<label class="sample-upload"
							><Upload size={18} /><span>Choose an audio sample</span><input
								type="file"
								accept="audio/*,.m4a"
								onchange={(event) => (sample = event.currentTarget.files?.[0] || null)}
							/></label
						>
						<div class="mini-divider"><span>or record now</span></div>
						<Recorder compact onrecorded={(file) => (sample = file)} />
					{/if}
				</div>
				<div class="consent-fields">
					<div class="field-title"><span>Consent record</span><ShieldCheck size={15} /></div>
					<div class="two-fields">
						<label
							><span>Consenting speaker</span><input
								bind:value={signedBy}
								maxlength="160"
								placeholder="Full legal name"
								required
							/></label
						>
						<label
							><span>Date of consent</span><input
								bind:value={consentDate}
								type="date"
								max={new Date().toISOString().slice(0, 10)}
								required
							/></label
						>
					</div>
					<label class="consent-check"
						><input bind:checked={confirmed} type="checkbox" required /><span
							><strong>I confirm I have explicit permission.</strong>I am authorized to create and
							use this speaker’s cloned voice.</span
						></label
					>
				</div>
				{#if errorMessage}<div class="inline-message error" role="alert">{errorMessage}</div>{/if}
				<button class="create-button" type="submit" disabled={creating || !sample || !confirmed}>
					{#if creating}<span class="spin"><LoaderCircle size={16} /></span> Creating your voice…{:else}<Sparkles
							size={16}
						/> Create voice{/if}
				</button>
			</form>
		</aside>
	</div>
{/if}

<style>
	.voices-panel {
		max-width: 1280px;
	}
	.panel-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 22px;
		margin-bottom: 27px;
	}
	.section-kicker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: #6c826e;
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
		max-width: 640px;
		margin: 0;
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.primary-action {
		display: inline-flex;
		height: 40px;
		flex: 0 0 auto;
		align-items: center;
		gap: 7px;
		padding: 0 14px;
		border: 0;
		border-radius: 10px;
		background: var(--ink);
		color: white;
		font: inherit;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: var(--shadow-sm);
	}
	.primary-action:hover {
		background: #30373f;
		transform: translateY(-1px);
	}
	.consent-banner {
		display: flex;
		align-items: center;
		gap: 13px;
		margin-bottom: 18px;
		padding: 15px 17px;
		border: 1px solid #cddccd;
		border-radius: 14px;
		background: #f1f6f1;
		color: #4d7254;
	}
	.shield {
		display: grid;
		width: 39px;
		height: 39px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 11px;
		background: #dfece1;
	}
	.consent-banner strong {
		display: block;
		color: #34583c;
		font-size: 0.72rem;
	}
	.consent-banner p {
		margin: 3px 0 0;
		font-size: 0.61rem;
		line-height: 1.45;
	}
	.banner-label {
		margin-left: auto;
		padding: 5px 7px;
		border: 1px solid #c4d7c7;
		border-radius: 6px;
		font-family: var(--font-mono);
		font-size: 0.51rem;
		font-weight: 700;
		text-transform: uppercase;
	}
	.inline-message {
		margin-bottom: 13px;
		padding: 11px 13px;
		border-radius: 9px;
		font-size: 0.68rem;
	}
	.inline-message.error {
		border: 1px solid #ecc9c1;
		background: #fff3f0;
		color: var(--danger);
	}
	.voice-library {
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 17px;
		background: var(--surface);
		box-shadow: var(--shadow-xs);
	}
	.library-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}
	.library-head > div {
		display: flex;
		align-items: baseline;
		gap: 9px;
	}
	.library-head h2 {
		margin: 0;
		font-size: 0.78rem;
	}
	.library-head span,
	.library-head p {
		margin: 0;
		color: var(--muted);
		font-size: 0.57rem;
	}
	.voice-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.library-voice,
	.new-voice-card {
		min-height: 245px;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}
	.library-voice[data-tone='green'] {
		--voice-bg: #ddeadd;
		--voice-ink: #668769;
	}
	.library-voice[data-tone='lilac'] {
		--voice-bg: #e7e0ed;
		--voice-ink: #86759a;
	}
	.library-voice[data-tone='rose'] {
		--voice-bg: #ecdde2;
		--voice-ink: #9a6a79;
	}
	.library-voice[data-tone='blue'] {
		--voice-bg: #dce8ee;
		--voice-ink: #648798;
	}
	.voice-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}
	.voice-art {
		display: grid;
		width: 42px;
		height: 42px;
		place-items: center;
		border-radius: 12px;
		background: var(--voice-bg);
		color: var(--voice-ink);
	}
	.status-pill {
		padding: 4px 6px;
		border-radius: 6px;
		background: #f7f1df;
		color: #826622;
		font-family: var(--font-mono);
		font-size: 0.49rem;
		font-weight: 750;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.status-pill.ready {
		background: #e7f2e9;
		color: #477552;
	}
	.status-pill.failed {
		background: #fff0ed;
		color: var(--danger);
	}
	.library-voice h3 {
		margin: 16px 0 5px;
		font-size: 0.88rem;
		letter-spacing: -0.025em;
	}
	.library-voice > p {
		min-height: 35px;
		margin: 0;
		color: var(--muted);
		font-size: 0.61rem;
		line-height: 1.45;
	}
	.voice-details {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 13px;
	}
	.voice-details span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px;
		border-radius: 5px;
		background: var(--surface-2);
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.48rem;
	}
	.voice-actions {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-top: 16px;
		padding-top: 13px;
		border-top: 1px solid var(--line-soft);
	}
	.use-button {
		display: inline-flex;
		height: 34px;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.58rem;
		font-weight: 680;
		cursor: pointer;
	}
	.use-button:hover {
		border-color: var(--ink);
	}
	.use-button:disabled {
		opacity: 0.5;
	}
	.delete-button {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.delete-button:hover {
		background: #fff0ed;
		color: var(--danger);
	}
	.new-voice-card {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		border-style: dashed;
		color: var(--ink);
		font: inherit;
		text-align: center;
		cursor: pointer;
	}
	.new-voice-card:hover {
		border-color: var(--line-strong);
		background: var(--surface-2);
	}
	.new-voice-card > span {
		display: grid;
		width: 43px;
		height: 43px;
		place-items: center;
		margin-bottom: 12px;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--muted);
	}
	.new-voice-card strong {
		font-size: 0.72rem;
	}
	.new-voice-card p {
		max-width: 170px;
		margin: 5px 0 0;
		color: var(--muted);
		font-size: 0.58rem;
		line-height: 1.5;
	}
	.empty-library {
		display: flex;
		min-height: 410px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		text-align: center;
	}
	.empty-orbit {
		display: grid;
		width: 100px;
		height: 100px;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 50%;
		background:
			radial-gradient(circle, #f6ecd6 0 31%, transparent 32%),
			repeating-radial-gradient(circle, transparent 0 14px, #e8e9e9 15px 16px);
	}
	.empty-orbit span {
		display: grid;
		width: 46px;
		height: 46px;
		place-items: center;
		border-radius: 50%;
		background: var(--accent);
		color: var(--ink);
		box-shadow: var(--shadow-sm);
	}
	.empty-library h3 {
		margin: 19px 0 7px;
		font-size: 1rem;
	}
	.empty-library p {
		max-width: 330px;
		margin: 0;
		color: var(--muted);
		font-size: 0.66rem;
		line-height: 1.55;
	}
	.empty-library button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 17px;
		padding: 9px 12px;
		border: 0;
		border-radius: 9px;
		background: var(--ink);
		color: white;
		font: inherit;
		font-size: 0.62rem;
		font-weight: 680;
		cursor: pointer;
	}
	.drawer-backdrop {
		position: fixed;
		z-index: 100;
		inset: 0;
		display: flex;
		justify-content: flex-end;
		background: rgba(12, 16, 20, 0.4);
		backdrop-filter: blur(4px);
	}
	.clone-drawer {
		width: min(520px, 100%);
		height: 100%;
		overflow-y: auto;
		padding: 28px 30px 34px;
		background: var(--surface);
		box-shadow: -20px 0 70px rgba(0, 0, 0, 0.18);
		animation: enter 0.24s ease-out;
	}
	.clone-drawer > header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
		padding-bottom: 21px;
		border-bottom: 1px solid var(--line-soft);
	}
	.clone-drawer header h2 {
		margin: 8px 0 7px;
		font-size: 1.65rem;
		font-weight: 590;
		letter-spacing: -0.05em;
	}
	.clone-drawer header p {
		margin: 0;
		color: var(--muted);
		font-size: 0.69rem;
	}
	.clone-drawer header button {
		display: grid;
		width: 35px;
		height: 35px;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
	}
	.clone-drawer form {
		display: grid;
		gap: 20px;
		margin-top: 22px;
	}
	.clone-drawer form > label,
	.two-fields label {
		display: grid;
		gap: 7px;
	}
	.clone-drawer label > span,
	.field-title > span {
		color: var(--ink-soft);
		font-size: 0.64rem;
		font-weight: 680;
	}
	.clone-drawer input:not([type='checkbox']):not([type='file']) {
		width: 100%;
		height: 42px;
		padding: 0 11px;
		border: 1px solid var(--line);
		border-radius: 9px;
		outline: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.68rem;
	}
	.clone-drawer input:focus {
		border-color: var(--line-strong);
	}
	.sample-section,
	.consent-fields {
		display: grid;
		gap: 12px;
		padding: 15px;
		border: 1px solid var(--line);
		border-radius: 13px;
		background: var(--surface-2);
	}
	.field-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.field-title em {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-style: normal;
	}
	.sample-upload {
		display: flex;
		height: 52px;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 1px dashed var(--line-strong);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.62rem;
		font-weight: 650;
		cursor: pointer;
	}
	.sample-upload input {
		display: none;
	}
	.mini-divider {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--muted);
		font-size: 0.51rem;
	}
	.mini-divider::before,
	.mini-divider::after {
		height: 1px;
		flex: 1;
		background: var(--line);
		content: '';
	}
	.sample-file {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px;
		border: 1px solid #cadbd0;
		border-radius: 10px;
		background: #f1f7f2;
	}
	.sample-file > span {
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border-radius: 9px;
		background: #dfece1;
		color: #55775c;
	}
	.sample-file > div {
		display: grid;
		min-width: 0;
		gap: 3px;
	}
	.sample-file strong {
		overflow: hidden;
		font-size: 0.62rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sample-file small {
		color: var(--muted);
		font-size: 0.53rem;
	}
	.sample-file button {
		display: grid;
		width: 30px;
		height: 30px;
		margin-left: auto;
		place-items: center;
		border: 0;
		background: transparent;
		color: var(--muted);
	}
	.two-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 9px;
	}
	.consent-check {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		padding: 11px;
		border: 1px solid #c9ddcc;
		border-radius: 9px;
		background: #f3f8f3;
		cursor: pointer;
	}
	.consent-check input {
		margin-top: 2px;
		accent-color: #52725a;
	}
	.consent-check > span {
		color: #66806b !important;
		font-size: 0.55rem !important;
		font-weight: 450 !important;
		line-height: 1.45;
	}
	.consent-check strong {
		display: block;
		color: #3f6347;
		font-size: 0.6rem;
	}
	.create-button {
		display: flex;
		height: 44px;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 0;
		border-radius: 10px;
		background: var(--ink);
		color: white;
		font: inherit;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}
	.create-button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.spin {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes enter {
		from {
			transform: translateX(35px);
			opacity: 0.4;
		}
	}
	@media (max-width: 950px) {
		.voice-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 620px) {
		.voice-grid {
			grid-template-columns: 1fr;
		}
		.panel-heading .primary-action {
			display: none;
		}
		.banner-label {
			display: none;
		}
		.voice-library {
			padding: 14px;
		}
		.library-head p {
			display: none;
		}
		.clone-drawer {
			padding: 23px 19px 28px;
		}
		.two-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
