<script lang="ts">
	import { Download, Pause, Play } from '@lucide/svelte';

	let {
		src,
		title = 'Audio',
		meta = '',
		compact = false
	}: { src: string; title?: string; meta?: string; compact?: boolean } = $props();

	let audio: HTMLAudioElement;
	let playing = $state(false);
	let current = $state(0);
	let duration = $state(0);

	const bars = [
		28, 52, 34, 70, 42, 84, 58, 38, 68, 92, 54, 32, 76, 48, 64, 36, 82, 46, 60, 30, 70, 50, 38, 58,
		28, 44, 34, 62
	];
	let progress = $derived(duration ? current / duration : 0);

	function formatTime(value: number) {
		if (!Number.isFinite(value)) return '0:00';
		const minutes = Math.floor(value / 60);
		return `${minutes}:${Math.floor(value % 60)
			.toString()
			.padStart(2, '0')}`;
	}

	async function toggle() {
		if (!audio || !src) return;
		if (playing) audio.pause();
		else await audio.play();
		playing = !playing;
	}

	function seek(event: Event) {
		const next = Number((event.currentTarget as HTMLInputElement).value);
		audio.currentTime = next;
		current = next;
	}

	function download() {
		const link = document.createElement('a');
		link.href = src;
		link.download = title || 'boli-audio';
		link.click();
	}
</script>

<div class:compact class="audio-player">
	<audio
		bind:this={audio}
		{src}
		onloadedmetadata={() => (duration = audio.duration)}
		ontimeupdate={() => (current = audio.currentTime)}
		onplay={() => (playing = true)}
		onpause={() => (playing = false)}
		onended={() => (playing = false)}
	></audio>
	<button
		class="play-button"
		type="button"
		onclick={toggle}
		aria-label={playing ? 'Pause audio' : 'Play audio'}
	>
		{#if playing}<Pause size={17} fill="currentColor" />{:else}<Play
				size={17}
				fill="currentColor"
			/>{/if}
	</button>
	<div class="audio-content">
		<div class="audio-head">
			<strong>{title}</strong>
			<span>{meta || formatTime(duration)}</span>
		</div>
		<div class="waveform" aria-hidden="true">
			{#each bars as height, index (index)}
				<span style:height={`${height}%`} class:played={index / bars.length <= progress}></span>
			{/each}
			<input
				aria-label="Seek audio"
				type="range"
				min="0"
				max={duration || 0}
				step="0.01"
				value={current}
				oninput={seek}
			/>
		</div>
	</div>
	<button class="download-button" type="button" onclick={download} aria-label="Download audio"
		><Download size={16} /></button
	>
</div>

<style>
	.audio-player {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		padding: 13px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.audio-player.compact {
		padding: 9px 10px;
		border-radius: 11px;
	}
	.audio-player audio {
		display: none;
	}
	.play-button,
	.download-button {
		display: grid;
		width: 37px;
		height: 37px;
		flex: 0 0 auto;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: var(--ink);
		color: white;
		cursor: pointer;
	}
	.compact .play-button {
		width: 32px;
		height: 32px;
	}
	.download-button {
		width: 34px;
		height: 34px;
		background: transparent;
		color: var(--muted);
	}
	.download-button:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.audio-content {
		min-width: 0;
		flex: 1;
	}
	.audio-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 7px;
	}
	.audio-head strong {
		overflow: hidden;
		color: var(--ink);
		font-size: 0.75rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.audio-head span {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.61rem;
	}
	.compact .audio-head {
		margin-bottom: 5px;
	}
	.waveform {
		position: relative;
		display: flex;
		height: 24px;
		align-items: center;
		gap: 2px;
	}
	.compact .waveform {
		height: 18px;
	}
	.waveform span {
		width: 3px;
		min-height: 3px;
		flex: 1;
		border-radius: 4px;
		background: #d9dce0;
		transition: background 0.15s ease;
	}
	.waveform span.played {
		background: var(--accent);
	}
	.waveform input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		opacity: 0;
	}
</style>
