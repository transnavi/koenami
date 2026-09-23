<!-- The studio's top bar: brand, language menu, corpus size, and the studio-wide actions.
     The first region out of the template body; its ids and `icon-button` classes are contract,
     and the shared button and koe-select primitives stay in the global stylesheet. -->
<script lang="ts">
	import { home, lang, t, tutorialHref, tutorialLang } from '$lib/i18n';

	import { useStudio } from '../studio.svelte';
	import { restartTour } from '../tour';

	const state = useStudio();

	let busy = $derived(state.busy || state.recording || state.loadingLanguage);
	let share = $derived(state.shareResult());
	let corpus = $derived(
		state.scorer
			? t('corpus.count', {
					clips: t('corpus.clips', { n: state.clips.filter((c) => !c.synthetic).length }),
					speakers: t('corpus.speakers', {
						n: new Set(state.clips.filter((c) => !c.synthetic).map((c) => c.speaker)).size
					})
				})
			: ''
	);
</script>

<header class="toolbar">
	<a class="brand" href={home(lang)} aria-label="Koenami">
		<svg aria-hidden="true"><use href="#i-wave"></use></svg>
		<h1>Koenami</h1>
	</a>
	<!-- Each language is its own page; the controller's change handler saves the session and
	     navigates, and still owns the select's value while the session view is its concern. -->
	<span class="language-control" title={t('toolbar.language')}>
		<koe-select id="language" icon="i-globe" aria-label={t('toolbar.language')} disabled={busy}>
			{#each state.languages as l (l.id)}
				<option value={l.id}>{l.label}</option>
			{/each}
		</koe-select>
	</span>
	<span id="corpus-count" class="toolbar-count">{corpus}</span>
	<div class="toolbar-end">
		<a
			class="icon-button"
			href={tutorialHref(lang)}
			hreflang={tutorialLang(lang)}
			target="_blank"
			title={t('toolbar.tutorial')}
			aria-label={t('toolbar.tutorial')}
		>
			<svg aria-hidden="true"><use href="#i-book"></use></svg>
		</a>
		<button
			id="tour-restart"
			class="icon-button"
			title={t('toolbar.guide')}
			aria-label={t('toolbar.guide')}
			onclick={restartTour}
		>
			<svg aria-hidden="true"><use href="#i-help"></use></svg>
		</button>
		<!-- The click that fills and opens the share card stays with the controller while the
		     share dialog still lives in the template body (dialogs phase). -->
		<button
			id="share-button"
			class="icon-button"
			title={t(state.scorer?.available ? 'toolbar.share' : 'share.unavailable')}
			aria-label={t('toolbar.share')}
			disabled={busy || !share}
		>
			<svg aria-hidden="true"><use href="#i-share"></use></svg>
		</button>
		<button
			id="settings-button"
			class="icon-button"
			title={t('toolbar.settings')}
			aria-label={t('toolbar.settings')}
			onclick={() => state.openDialog('settings-dialog')}
		>
			<svg aria-hidden="true"><use href="#i-gear"></use></svg>
		</button>
		<button
			id="info-button"
			class="icon-button"
			title={t('toolbar.info')}
			aria-label={t('toolbar.info')}
			onclick={() => state.openDialog('info-dialog')}
		>
			<svg aria-hidden="true"><use href="#i-info"></use></svg>
		</button>
		<button
			id="theme-button"
			class="icon-button"
			title={t('toolbar.theme')}
			aria-label={t('toolbar.theme')}
			onclick={() => state.toggleTheme()}
		>
			<svg aria-hidden="true"><use href={state.dark ? '#i-sun' : '#i-moon'}></use></svg>
		</button>
	</div>
</header>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 22px;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}
	.brand {
		display: flex;
		gap: 9px;
		align-items: center;
		color: var(--heading);
		text-decoration: none !important;
	}
	.brand svg {
		color: var(--pink);
		width: 23px;
		height: 23px;
	}
	.brand h1 {
		font-size: 17px;
		letter-spacing: -0.5px;
		font-weight: 650;
		margin: 0;
	}
	.language-control {
		display: flex;
		align-items: center;
		/* The one toolbar item that may give way: its label ellipsises when the buttons need the room. */
		min-width: 0;
		flex-shrink: 1;
	}
	.language-control koe-select {
		border: 0;
		background: transparent;
		font-size: 13px;
		min-width: 110px;
	}
	.toolbar-count {
		font-size: 11px;
		color: var(--muted);
	}
	.toolbar-end {
		display: flex;
		gap: 4px;
		margin-left: auto;
	}

	@media (max-width: 1150px) {
		.toolbar {
			padding: 0 15px;
			gap: 15px;
		}
		.toolbar-count {
			display: none;
		}
	}

	@media (max-width: 800px), (max-height: 520px) {
		.toolbar {
			gap: 8px;
			padding: 0 6px 0 12px;
		}
		.toolbar-count {
			display: none;
		}
		.brand {
			gap: 6px;
		}
		.brand svg {
			width: 20px;
			height: 20px;
		}
		.brand h1 {
			font-size: 16px;
		}
		.language-control koe-select {
			min-width: 0;
			max-width: 150px;
			min-height: 36px;
		}
		/* Narrow phones: the globe alone stands for the language menu; its label would only be truncated. */
		@media (max-width: 400px) {
			.language-control koe-select {
				width: 50px;
			}
		}
		@media (max-width: 340px) {
			.brand h1 {
				display: none;
			}
		}
		.toolbar-end {
			gap: 0;
		}
		.toolbar-end .icon-button {
			width: 32px;
			height: 40px;
		}
		.toolbar-end svg {
			width: 20px;
			height: 20px;
		}
		#share-button {
			display: none;
		}
	}
</style>
