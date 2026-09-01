<script lang="ts">
	import { onMount } from 'svelte';
	import type { RecordModel } from 'pocketbase';
	import {
		BookOpen,
		ChevronDown,
		FileText,
		Library,
		LogOut,
		Menu,
		Mic2,
		Settings,
		Sparkles,
		X
	} from '@lucide/svelte';
	import { pb } from '$lib/pocketbase';
	import { apiRequest } from '$lib/client-api';
	import type {
		GenerationRecord,
		TarkaModelList,
		TranscriptionRecord,
		VoiceRecord,
		WorkspaceView
	} from '$lib/types';
	import AuthScreen from '$lib/components/AuthScreen.svelte';
	import LibraryPanel from '$lib/components/LibraryPanel.svelte';
	import LogoMark from '$lib/components/LogoMark.svelte';
	import StudioPanel from '$lib/components/StudioPanel.svelte';
	import TranscribePanel from '$lib/components/TranscribePanel.svelte';
	import VoicesPanel from '$lib/components/VoicesPanel.svelte';

	let ready = $state(false);
	let loadingData = $state(false);
	let authRecord = $state<RecordModel | null>(pb.authStore.record);
	let view = $state<WorkspaceView>('studio');
	let mobileMenu = $state(false);
	let profileOpen = $state(false);
	let voices = $state<VoiceRecord[]>([]);
	let generations = $state<GenerationRecord[]>([]);
	let transcriptions = $state<TranscriptionRecord[]>([]);
	let audioUrls = $state<Record<string, string>>({});
	let tarkaState = $state<'checking' | 'online' | 'setup' | 'offline'>('checking');
	let modelCount = $state(0);

	const navigation = [
		{ id: 'studio' as const, label: 'Studio', icon: Sparkles },
		{ id: 'transcribe' as const, label: 'Transcribe', icon: FileText },
		{ id: 'voices' as const, label: 'Voices', icon: Mic2 },
		{ id: 'library' as const, label: 'Library', icon: Library }
	];

	let displayName = $derived(String(authRecord?.name || authRecord?.email || 'Boli user'));
	let initials = $derived(
		displayName
			.split(/\s+/)
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);

	function navigate(next: WorkspaceView) {
		view = next;
		mobileMenu = false;
	}

	async function refreshRecords() {
		if (!pb.authStore.isValid) return;
		loadingData = true;
		try {
			const [nextVoices, nextGenerations, nextTranscriptions] = await Promise.all([
				pb.collection<VoiceRecord>('voices').getFullList({ sort: '-created' }),
				pb.collection<GenerationRecord>('generations').getFullList({ sort: '-created' }),
				pb.collection<TranscriptionRecord>('transcriptions').getFullList({ sort: '-created' })
			]);
			voices = nextVoices;
			generations = nextGenerations;
			transcriptions = nextTranscriptions;

			const hasFiles = nextGenerations.length > 0 || nextTranscriptions.length > 0;
			const token = hasFiles ? await pb.files.getToken() : '';
			const nextUrls: Record<string, string> = {};
			for (const record of nextGenerations) {
				if (record.audio) nextUrls[record.id] = pb.files.getURL(record, record.audio, { token });
			}
			for (const record of nextTranscriptions) {
				if (record.audio) nextUrls[record.id] = pb.files.getURL(record, record.audio, { token });
			}
			audioUrls = nextUrls;
		} finally {
			loadingData = false;
		}
	}

	async function checkTarka() {
		tarkaState = 'checking';
		try {
			const models = await apiRequest<TarkaModelList>('/api/models');
			modelCount = models.data?.length || 0;
			tarkaState = 'online';
		} catch (error) {
			const message = error instanceof Error ? error.message : '';
			tarkaState = message.includes('TARKA_API_KEY') ? 'setup' : 'offline';
		}
	}

	async function signedIn() {
		authRecord = pb.authStore.record;
		await Promise.all([refreshRecords(), checkTarka()]);
	}

	function signOut() {
		pb.authStore.clear();
		authRecord = null;
		voices = [];
		generations = [];
		transcriptions = [];
		audioUrls = {};
		profileOpen = false;
	}

	onMount(() => {
		const unsubscribe = pb.authStore.onChange((_token, record) => {
			authRecord = record;
		});

		void (async () => {
			if (pb.authStore.isValid) {
				try {
					await pb.collection('users').authRefresh();
					await signedIn();
				} catch {
					pb.authStore.clear();
				}
			}
			ready = true;
		})();

		return unsubscribe;
	});
</script>

<svelte:head>
	<title>Boli — Voice studio by Tarka</title>
	<meta
		name="description"
		content="Transcribe audio, generate speech, and create consent-backed voices with Tarka."
	/>
	<meta name="theme-color" content="#151a20" />
</svelte:head>

{#if !ready}
	<div class="boot-screen">
		<LogoMark size={48} /><span class="boot-wave"></span>
		<p>Opening Boli…</p>
	</div>
{:else if !authRecord}
	<AuthScreen onauth={signedIn} />
{:else}
	<div class="app-shell">
		<aside class:open={mobileMenu} class="sidebar">
			<div class="sidebar-brand"><LogoMark size={38} /><span>Boli</span></div>
			<nav aria-label="Main navigation">
				{#each navigation as item (item.id)}
					{@const Icon = item.icon}
					<button
						class:active={view === item.id}
						type="button"
						onclick={() => navigate(item.id)}
						title={item.label}
					>
						<Icon size={18} /><span>{item.label}</span>
					</button>
				{/each}
			</nav>
			<div class="sidebar-spacer"></div>
			<a
				class="sidebar-link"
				href="https://tarkahq.com/docs/inference/utility-models"
				target="_blank"
				rel="noreferrer"><BookOpen size={18} /><span>API docs</span></a
			>
			<button class="sidebar-link" type="button" title="Settings"
				><Settings size={18} /><span>Settings</span></button
			>
			<button
				class="mobile-close"
				type="button"
				onclick={() => (mobileMenu = false)}
				aria-label="Close menu"><X size={19} /></button
			>
		</aside>

		<div class="app-body">
			<header class="topbar">
				<div class="topbar-left">
					<button
						class="menu-button"
						type="button"
						onclick={() => (mobileMenu = !mobileMenu)}
						aria-label="Open menu"><Menu size={19} /></button
					>
					<div class="mobile-wordmark"><LogoMark size={29} /><span>Boli</span></div>
					<span class="view-label">{navigation.find((item) => item.id === view)?.label}</span>
				</div>
				<div class="topbar-right">
					<div
						class="api-state"
						class:online={tarkaState === 'online'}
						class:setup={tarkaState === 'setup'}
						title={tarkaState === 'online'
							? `${modelCount} Tarka models visible`
							: 'Check server environment'}
					>
						<span></span>{tarkaState === 'checking'
							? 'Connecting'
							: tarkaState === 'online'
								? 'Tarka online'
								: tarkaState === 'setup'
									? 'API key needed'
									: 'Tarka unavailable'}
					</div>
					<div class="profile-wrap">
						<button
							class="profile-button"
							type="button"
							onclick={() => (profileOpen = !profileOpen)}
							><span class="profile-avatar">{initials}</span><span class="profile-copy"
								><strong>{displayName}</strong><small>{authRecord.email}</small></span
							><ChevronDown size={14} /></button
						>
						{#if profileOpen}<div class="profile-menu">
								<div><strong>{displayName}</strong><span>{authRecord.email}</span></div>
								<button type="button" onclick={signOut}><LogOut size={15} /> Sign out</button>
							</div>{/if}
					</div>
				</div>
			</header>

			<main class="app-content" aria-busy={loadingData}>
				{#if view === 'studio'}
					<StudioPanel
						{voices}
						{audioUrls}
						oncreated={refreshRecords}
						ongovoices={() => navigate('voices')}
					/>
				{:else if view === 'transcribe'}
					<TranscribePanel {audioUrls} oncreated={refreshRecords} />
				{:else if view === 'voices'}
					<VoicesPanel {voices} onchanged={refreshRecords} ongostudio={() => navigate('studio')} />
				{:else}
					<LibraryPanel {generations} {transcriptions} {audioUrls} />
				{/if}
			</main>

			<nav class="mobile-tabs" aria-label="Mobile navigation">
				{#each navigation as item (item.id)}
					{@const Icon = item.icon}
					<button class:active={view === item.id} type="button" onclick={() => navigate(item.id)}
						><Icon size={18} /><span>{item.label}</span></button
					>
				{/each}
			</nav>
		</div>

		{#if mobileMenu}<button
				class="sidebar-scrim"
				type="button"
				onclick={() => (mobileMenu = false)}
				aria-label="Close menu"
			></button>{/if}
	</div>
{/if}
