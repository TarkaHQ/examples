<script lang="ts">
	import { AudioLines, Clipboard, FileText, FolderOpen, Search, Sparkles } from '@lucide/svelte';
	import type { ActivityItem, GenerationRecord, TranscriptionRecord } from '$lib/types';
	import AudioPlayer from './AudioPlayer.svelte';

	let {
		generations,
		transcriptions,
		audioUrls
	}: {
		generations: GenerationRecord[];
		transcriptions: TranscriptionRecord[];
		audioUrls: Record<string, string>;
	} = $props();

	let filter = $state<'all' | 'generation' | 'transcription'>('all');
	let search = $state('');

	let activities = $derived(
		[
			...generations.map((record): ActivityItem => ({
				id: record.id,
				type: 'generation',
				title: record.voice_name || record.model,
				subtitle: `${record.model} · ${record.response_format.toUpperCase()}`,
				created: record.created,
				audioUrl: audioUrls[record.id] || '',
				text: record.input,
				record
			})),
			...transcriptions.map((record): ActivityItem => ({
				id: record.id,
				type: 'transcription',
				title: record.filename,
				subtitle: `${record.model}${record.language ? ` · ${record.language.toUpperCase()}` : ''}`,
				created: record.created,
				audioUrl: audioUrls[record.id] || '',
				text: record.text,
				record
			}))
		].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
	);

	let visible = $derived(
		activities.filter((item) => {
			const matchesType = filter === 'all' || item.type === filter;
			const term = search.trim().toLowerCase();
			return (
				matchesType &&
				(!term || `${item.title} ${item.subtitle} ${item.text}`.toLowerCase().includes(term))
			);
		})
	);

	function dateLabel(value: string) {
		const date = new Date(value);
		const today = new Date();
		if (date.toDateString() === today.toDateString()) {
			return `Today, ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date)}`;
		}
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
		}).format(date);
	}

	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
	}
</script>

<section class="workspace-panel library-panel">
	<header class="panel-heading">
		<div>
			<span class="section-kicker"><FolderOpen size={13} /> Your library</span>
			<h1>Everything you’ve made.</h1>
			<p>Generated speech and transcripts, safely kept with their original audio.</p>
		</div>
	</header>

	<section class="library-shell">
		<header class="library-toolbar">
			<div class="filter-tabs">
				<button class:active={filter === 'all'} type="button" onclick={() => (filter = 'all')}
					>All <span>{activities.length}</span></button
				>
				<button
					class:active={filter === 'generation'}
					type="button"
					onclick={() => (filter = 'generation')}>Speech <span>{generations.length}</span></button
				>
				<button
					class:active={filter === 'transcription'}
					type="button"
					onclick={() => (filter = 'transcription')}
					>Transcripts <span>{transcriptions.length}</span></button
				>
			</div>
			<label class="search-box"
				><Search size={15} /><input bind:value={search} placeholder="Search your library" /></label
			>
		</header>

		{#if visible.length}
			<div class="activity-list">
				{#each visible as item (item.type + item.id)}
					<article class="activity-card" data-type={item.type}>
						<div class="activity-icon">
							{#if item.type === 'generation'}<AudioLines size={19} />{:else}<FileText
									size={19}
								/>{/if}
						</div>
						<div class="activity-content">
							<div class="activity-head">
								<div>
									<span class="type-label"
										>{item.type === 'generation' ? 'Generated speech' : 'Transcription'}</span
									>
									<h2>{item.title}</h2>
								</div>
								<time>{dateLabel(item.created)}</time>
							</div>
							<p class="activity-text">{item.text}</p>
							<div class="activity-meta">
								<span>{item.subtitle}</span>{#if item.type === 'generation'}<span
										>{(item.record as GenerationRecord).speed}× speed</span
									>{/if}<button type="button" onclick={() => copy(item.text)}
									><Clipboard size={12} /> Copy text</button
								>
							</div>
							{#if item.audioUrl}<AudioPlayer
									src={item.audioUrl}
									title={item.title}
									meta={item.type === 'generation'
										? (item.record as GenerationRecord).response_format.toUpperCase()
										: 'SOURCE'}
									compact
								/>{/if}
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<div class="empty-library">
				<span><Sparkles size={25} /></span>
				<h2>{activities.length ? 'Nothing matches that search.' : 'Your library is ready.'}</h2>
				<p>
					{activities.length
						? 'Try a different phrase or filter.'
						: 'Create speech or transcribe audio and it will appear here automatically.'}
				</p>
			</div>
		{/if}
	</section>
</section>

<style>
	.library-panel {
		max-width: 1180px;
	}
	.panel-heading {
		margin-bottom: 29px;
	}
	.section-kicker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: #887b62;
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
		margin: 0;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.library-shell {
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 17px;
		background: var(--surface);
		box-shadow: var(--shadow-xs);
	}
	.library-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		padding: 14px 17px;
		border-bottom: 1px solid var(--line-soft);
	}
	.filter-tabs {
		display: flex;
		gap: 4px;
	}
	.filter-tabs button {
		display: inline-flex;
		height: 32px;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 0.62rem;
		font-weight: 650;
		cursor: pointer;
	}
	.filter-tabs button span {
		padding: 2px 5px;
		border-radius: 5px;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.48rem;
	}
	.filter-tabs button.active {
		background: var(--ink);
		color: white;
	}
	.filter-tabs button.active span {
		background: rgba(255, 255, 255, 0.12);
		color: #dfe3e7;
	}
	.search-box {
		display: flex;
		width: min(250px, 32vw);
		height: 35px;
		align-items: center;
		gap: 7px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 9px;
		color: var(--muted);
	}
	.search-box:focus-within {
		border-color: var(--line-strong);
		color: var(--ink);
	}
	.search-box input {
		width: 100%;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 0.62rem;
	}
	.activity-list {
		display: grid;
	}
	.activity-card {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 13px;
		padding: 18px;
		border-bottom: 1px solid var(--line-soft);
	}
	.activity-card:last-child {
		border-bottom: 0;
	}
	.activity-icon {
		display: grid;
		width: 40px;
		height: 40px;
		place-items: center;
		border-radius: 11px;
		background: #e7e1d2;
		color: #8f7c4f;
	}
	.activity-card[data-type='transcription'] .activity-icon {
		background: #dce8ee;
		color: #658595;
	}
	.activity-content {
		min-width: 0;
	}
	.activity-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
	}
	.type-label {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.48rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.activity-head h2 {
		margin: 3px 0 0;
		font-size: 0.77rem;
		letter-spacing: -0.015em;
	}
	.activity-head time {
		flex: 0 0 auto;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.51rem;
	}
	.activity-text {
		display: -webkit-box;
		overflow: hidden;
		margin: 9px 0 10px;
		color: var(--ink-soft);
		font-size: 0.69rem;
		line-height: 1.55;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	.activity-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-bottom: 11px;
	}
	.activity-meta > span {
		padding: 4px 6px;
		border-radius: 5px;
		background: var(--surface-2);
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.48rem;
	}
	.activity-meta button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		padding: 4px 6px;
		border: 0;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 0.51rem;
		cursor: pointer;
	}
	.activity-meta button:hover {
		color: var(--ink);
	}
	.empty-library {
		display: flex;
		min-height: 460px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		padding: 30px;
		text-align: center;
	}
	.empty-library > span {
		display: grid;
		width: 54px;
		height: 54px;
		place-items: center;
		border-radius: 16px;
		background: #f2ead8;
		color: #967a40;
	}
	.empty-library h2 {
		margin: 17px 0 6px;
		font-size: 0.9rem;
	}
	.empty-library p {
		max-width: 350px;
		margin: 0;
		color: var(--muted);
		font-size: 0.64rem;
		line-height: 1.5;
	}
	@media (max-width: 700px) {
		.library-toolbar {
			align-items: stretch;
			flex-direction: column;
		}
		.search-box {
			width: 100%;
		}
		.filter-tabs {
			overflow-x: auto;
		}
		.activity-card {
			grid-template-columns: 35px minmax(0, 1fr);
			padding: 15px;
		}
		.activity-icon {
			width: 35px;
			height: 35px;
		}
		.activity-head {
			gap: 8px;
		}
		.activity-head time {
			display: none;
		}
	}
</style>
