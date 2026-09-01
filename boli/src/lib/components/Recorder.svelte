<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Mic, Square, Trash2 } from '@lucide/svelte';

	let {
		onrecorded,
		compact = false
	}: { onrecorded: (file: File | null) => void; compact?: boolean } = $props();

	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let chunks: Blob[] = [];
	let recording = $state(false);
	let elapsed = $state(0);
	let previewUrl = $state('');
	let message = $state('');

	function formatTime(seconds: number) {
		return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
	}

	function preferredMimeType() {
		for (const type of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']) {
			if (MediaRecorder.isTypeSupported(type)) return type;
		}
		return '';
	}

	async function start() {
		message = '';
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mimeType = preferredMimeType();
			recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
			chunks = [];
			recorder.ondataavailable = (event) => {
				if (event.data.size) chunks.push(event.data);
			};
			recorder.onstop = finish;
			recorder.start(250);
			recording = true;
			elapsed = 0;
			timer = setInterval(() => (elapsed += 1), 1000);
		} catch {
			message = 'Microphone access is needed to record.';
		}
	}

	function stop() {
		if (recorder?.state === 'recording') recorder.stop();
	}

	function finish() {
		if (timer) clearInterval(timer);
		timer = null;
		recording = false;
		stream?.getTracks().forEach((track) => track.stop());
		const type = recorder?.mimeType || 'audio/webm';
		const blob = new Blob(chunks, { type });
		const extension = type.includes('mp4') ? 'm4a' : 'webm';
		const file = new File([blob], `boli-recording-${Date.now()}.${extension}`, { type });
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(blob);
		onrecorded(file);
	}

	function clear() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
		elapsed = 0;
		onrecorded(null);
	}

	onDestroy(() => {
		if (timer) clearInterval(timer);
		stream?.getTracks().forEach((track) => track.stop());
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});
</script>

<div class:compact class="recorder">
	{#if recording}
		<div class="recording-state">
			<span class="recording-dot"></span>
			<strong>Recording</strong>
			<span>{formatTime(elapsed)}</span>
		</div>
		<button type="button" class="record-button stop" onclick={stop}
			><Square size={14} fill="currentColor" /> Stop</button
		>
	{:else if previewUrl}
		<audio controls src={previewUrl}></audio>
		<button type="button" class="icon-button" onclick={clear} aria-label="Discard recording"
			><Trash2 size={16} /></button
		>
	{:else}
		<div class="record-copy">
			<span class="mic-icon"><Mic size={18} /></span>
			<div><strong>Record here</strong><span>Use your microphone</span></div>
		</div>
		<button type="button" class="record-button" onclick={start}><Mic size={15} /> Record</button>
	{/if}
</div>
{#if message}<p class="recorder-message">{message}</p>{/if}

<style>
	.recorder {
		display: flex;
		min-height: 74px;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 13px 15px;
		border: 1px dashed var(--line-strong);
		border-radius: 14px;
		background: var(--surface-2);
	}
	.recorder.compact {
		min-height: 58px;
		padding: 9px 11px;
		border-radius: 11px;
	}
	.record-copy,
	.recording-state {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 10px;
	}
	.record-copy > div {
		display: grid;
		gap: 2px;
	}
	.record-copy strong,
	.recording-state strong {
		font-size: 0.74rem;
	}
	.record-copy span,
	.recording-state span {
		color: var(--muted);
		font-size: 0.66rem;
	}
	.mic-icon {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-xs);
	}
	.record-button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 9px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.7rem;
		font-weight: 650;
		cursor: pointer;
	}
	.record-button:hover {
		border-color: var(--ink);
	}
	.record-button.stop {
		border-color: #e4b4ac;
		color: var(--danger);
	}
	.recording-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--danger);
		animation: pulse 1.2s infinite;
	}
	.recorder audio {
		width: 100%;
		max-width: 300px;
		height: 36px;
	}
	.icon-button {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.icon-button:hover {
		background: #fff0ed;
		color: var(--danger);
	}
	.recorder-message {
		margin: 7px 2px 0;
		color: var(--danger);
		font-size: 0.67rem;
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
			transform: scale(0.82);
		}
	}
</style>
