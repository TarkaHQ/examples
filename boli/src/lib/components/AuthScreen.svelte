<script lang="ts">
	import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from '@lucide/svelte';
	import LogoMark from './LogoMark.svelte';
	import { pb } from '$lib/pocketbase';
	import { getErrorMessage } from '$lib/client-api';

	let { onauth }: { onauth: () => void | Promise<void> } = $props();

	let mode = $state<'login' | 'register'>('login');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let loading = $state(false);
	let message = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		loading = true;
		try {
			if (mode === 'register') {
				await pb.collection('users').create({
					name: name.trim(),
					email: email.trim(),
					password,
					passwordConfirm: password
				});
			}
			await pb.collection('users').authWithPassword(email.trim(), password);
			await onauth();
		} catch (error) {
			message = getErrorMessage(error);
		} finally {
			loading = false;
		}
	}
</script>

<main class="auth-page">
	<section class="auth-story">
		<div class="story-glow"></div>
		<header class="auth-brand">
			<LogoMark size={40} /><span>Boli</span><small>by Tarka</small>
		</header>
		<div class="story-copy">
			<span class="eyebrow">Your private voice workspace</span>
			<h1>Listen. Create.<br />Sound like you.</h1>
			<p>
				Transcribe audio, create natural speech, and build voices with clear consent — powered by
				Tarka in Nepal.
			</p>
		</div>
		<div class="sound-stage" aria-hidden="true">
			<div class="orb"><span>बोली</span></div>
			<svg viewBox="0 0 720 190" preserveAspectRatio="none">
				<path
					d="M0 103 C48 103 58 92 88 92 C119 92 124 112 154 112 C189 112 197 51 229 51 C265 51 263 136 301 136 C338 136 342 74 379 74 C415 74 420 119 452 119 C487 119 491 38 526 38 C566 38 559 151 601 151 C637 151 646 93 679 93 C698 93 708 104 720 104"
				/>
			</svg>
		</div>
		<footer class="story-proof">
			<span><Check size={14} /> Tarka voice APIs</span><span
				><LockKeyhole size={14} /> Private by default</span
			>
		</footer>
	</section>

	<section class="auth-form-wrap">
		<div class="mobile-brand"><LogoMark size={34} /><span>Boli</span></div>
		<div class="auth-card">
			<div class="auth-heading">
				<span class="eyebrow">{mode === 'login' ? 'Welcome back' : 'Start creating'}</span>
				<h2>{mode === 'login' ? 'Sign in to Boli' : 'Create your workspace'}</h2>
				<p>
					{mode === 'login'
						? 'Your voice library is waiting.'
						: 'One account for your private voice studio.'}
				</p>
			</div>

			<form onsubmit={submit}>
				{#if mode === 'register'}
					<label>
						<span>Your name</span>
						<div class="input-wrap">
							<UserRound size={16} /><input
								bind:value={name}
								autocomplete="name"
								placeholder="Lukas"
								required
							/>
						</div>
					</label>
				{/if}
				<label>
					<span>Email address</span>
					<div class="input-wrap">
						<Mail size={16} /><input
							bind:value={email}
							type="email"
							autocomplete="email"
							placeholder="you@example.com"
							required
						/>
					</div>
				</label>
				<label>
					<span>Password</span>
					<div class="input-wrap">
						<LockKeyhole size={16} />
						<input
							bind:value={password}
							type={showPassword ? 'text' : 'password'}
							autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
							minlength="8"
							placeholder="At least 8 characters"
							required
						/>
						<button
							type="button"
							class="show-password"
							onclick={() => (showPassword = !showPassword)}
							aria-label="Toggle password visibility"
							>{#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}</button
						>
					</div>
				</label>

				{#if message}<p class="form-error" role="alert">{message}</p>{/if}
				<button class="submit-button" type="submit" disabled={loading}>
					<span
						>{loading ? 'Just a moment…' : mode === 'login' ? 'Enter Boli' : 'Create account'}</span
					><ArrowRight size={17} />
				</button>
			</form>

			<p class="mode-switch">
				{mode === 'login' ? 'New to Boli?' : 'Already have an account?'}
				<button
					type="button"
					onclick={() => {
						mode = mode === 'login' ? 'register' : 'login';
						message = '';
					}}
				>
					{mode === 'login' ? 'Create an account' : 'Sign in'}
				</button>
			</p>
		</div>
		<p class="auth-legal">Only clone voices you own or have permission to use.</p>
	</section>
</main>

<style>
	.auth-page {
		display: grid;
		min-height: 100dvh;
		grid-template-columns: minmax(0, 1.25fr) minmax(430px, 0.75fr);
		background: var(--surface);
	}
	.auth-story {
		position: relative;
		display: flex;
		min-height: 100dvh;
		overflow: hidden;
		flex-direction: column;
		padding: 34px 44px;
		background: #151a20;
		color: white;
	}
	.auth-story::after {
		position: absolute;
		right: -10%;
		bottom: -26%;
		width: 65%;
		height: 58%;
		border-radius: 50%;
		background: #dcae55;
		content: '';
		filter: blur(180px);
		opacity: 0.16;
	}
	.story-glow {
		position: absolute;
		top: -25%;
		left: 10%;
		width: 70%;
		height: 55%;
		border-radius: 50%;
		background: #7b91ac;
		filter: blur(180px);
		opacity: 0.13;
	}
	.auth-brand {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 11px;
		font-size: 1rem;
		font-weight: 720;
		letter-spacing: -0.02em;
	}
	.auth-brand small {
		margin-left: 2px;
		color: #7d8793;
		font-size: 0.61rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.story-copy {
		position: relative;
		z-index: 1;
		width: min(660px, 88%);
		margin: auto 0 20px;
	}
	.eyebrow {
		color: var(--accent-dark);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.auth-story .eyebrow {
		color: #e6b85c;
	}
	.story-copy h1 {
		margin: 19px 0 23px;
		font-size: clamp(3.6rem, 6.6vw, 7.3rem);
		font-weight: 530;
		letter-spacing: -0.075em;
		line-height: 0.86;
	}
	.story-copy p {
		max-width: 560px;
		margin: 0;
		color: #a9b1bb;
		font-size: clamp(0.95rem, 1.5vw, 1.18rem);
		line-height: 1.65;
	}
	.sound-stage {
		position: relative;
		z-index: 1;
		height: 210px;
		margin: 28px -44px 0;
	}
	.sound-stage svg {
		position: absolute;
		inset: 10px 0 0;
		width: 100%;
		height: 190px;
		overflow: visible;
	}
	.sound-stage path {
		fill: none;
		stroke: #e6b85c;
		stroke-linecap: round;
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
		opacity: 0.72;
	}
	.orb {
		position: absolute;
		z-index: 2;
		top: 26px;
		left: 42%;
		display: grid;
		width: 120px;
		height: 120px;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 50%;
		background: radial-gradient(circle at 38% 32%, #f2d58e, #c38c31 52%, #61451e);
		box-shadow:
			0 22px 60px rgba(0, 0, 0, 0.4),
			0 0 80px rgba(230, 184, 92, 0.18);
	}
	.orb span {
		color: #171b20;
		font-size: 1.18rem;
		font-weight: 750;
	}
	.story-proof {
		position: relative;
		z-index: 1;
		display: flex;
		gap: 22px;
		color: #838d98;
		font-size: 0.65rem;
	}
	.story-proof span {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.auth-form-wrap {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px clamp(32px, 5vw, 76px) 28px;
	}
	.mobile-brand {
		display: none;
		align-items: center;
		gap: 10px;
		font-weight: 720;
	}
	.auth-card {
		width: 100%;
		max-width: 420px;
	}
	.auth-heading h2 {
		margin: 12px 0 8px;
		color: var(--ink);
		font-size: 2.05rem;
		font-weight: 620;
		letter-spacing: -0.05em;
	}
	.auth-heading p {
		margin: 0;
		color: var(--muted);
		font-size: 0.82rem;
	}
	form {
		display: grid;
		gap: 17px;
		margin-top: 34px;
	}
	label {
		display: grid;
		gap: 8px;
	}
	label > span {
		color: var(--ink-soft);
		font-size: 0.69rem;
		font-weight: 650;
	}
	.input-wrap {
		display: flex;
		height: 48px;
		align-items: center;
		gap: 10px;
		padding: 0 13px;
		border: 1px solid var(--line);
		border-radius: 11px;
		background: var(--surface);
		color: var(--muted);
		transition:
			border-color 0.16s,
			box-shadow 0.16s;
	}
	.input-wrap:focus-within {
		border-color: #c39843;
		box-shadow: 0 0 0 3px rgba(230, 184, 92, 0.15);
		color: var(--ink);
	}
	.input-wrap input {
		width: 100%;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 0.78rem;
	}
	.input-wrap input::placeholder {
		color: #adb2b8;
	}
	.show-password {
		display: grid;
		padding: 4px;
		border: 0;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.form-error {
		margin: -5px 0 0;
		padding: 10px 12px;
		border-radius: 9px;
		background: #fff0ed;
		color: var(--danger);
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.submit-button {
		display: flex;
		height: 49px;
		align-items: center;
		justify-content: space-between;
		padding: 0 17px;
		border: 0;
		border-radius: 11px;
		background: var(--ink);
		color: white;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 680;
		cursor: pointer;
		box-shadow: 0 9px 24px rgba(16, 20, 24, 0.14);
	}
	.submit-button:hover:not(:disabled) {
		background: #2b323a;
		transform: translateY(-1px);
	}
	.submit-button:disabled {
		cursor: wait;
		opacity: 0.65;
	}
	.mode-switch {
		margin-top: 23px;
		color: var(--muted);
		font-size: 0.7rem;
		text-align: center;
	}
	.mode-switch button {
		margin-left: 5px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.auth-legal {
		margin: auto 0 0;
		padding-top: 38px;
		color: #9ca2a8;
		font-size: 0.61rem;
	}
	@media (max-width: 900px) {
		.auth-page {
			grid-template-columns: 1fr;
		}
		.auth-story {
			display: none;
		}
		.auth-form-wrap {
			min-height: 100dvh;
			justify-content: center;
		}
		.mobile-brand {
			display: flex;
			margin-bottom: 54px;
		}
	}
	@media (max-width: 520px) {
		.auth-form-wrap {
			padding: 28px 22px 20px;
		}
		.auth-heading h2 {
			font-size: 1.8rem;
		}
	}
</style>
