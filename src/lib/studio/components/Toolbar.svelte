<!-- The studio's top bar: brand, language menu, corpus size, and the studio-wide actions.
     The first region out of the template body; its ids and `icon-button` classes are contract,
     and the shared button and koe-select primitives stay in the global stylesheet. -->
<script lang="ts">
	import { home, tutorialHref, tutorialLang } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages';

	import { useStudio } from '../studio.svelte';
	import { restartTour } from '../tour';

	const studio = useStudio();

	let busy = $derived(studio.busy || studio.recording || studio.loadingLanguage);
	let share = $derived(studio.shareResult);
	let corpus = $derived(
		studio.scorer
			? m.corpus_count({
					clips: m.corpus_clips({ n: studio.clips.filter((c) => !c.synthetic).length }),
					speakers: m.corpus_speakers({
						n: new Set(studio.clips.filter((c) => !c.synthetic).map((c) => c.speaker)).size
					})
				})
			: ''
	);
</script>

<header class="toolbar">
	<a class="brand" href={home()} aria-label="Koenami">
		<svg aria-hidden="true"><use href="#i-wave"></use></svg>
		<h1>Koenami</h1>
	</a>
	<!-- Each language is its own page; the controller's change handler saves the session and
	     navigates, and still owns the select's value while the session view is its concern. -->
	<span class="language-control" title={m.toolbar_language()}>
		<koe-select id="language" icon="i-globe" aria-label={m.toolbar_language()} disabled={busy}>
			{#each studio.languages as l (l.id)}
				<option value={l.id}>{l.label}</option>
			{/each}
		</koe-select>
	</span>
	<span id="corpus-count" class="toolbar-count">{corpus}</span>
	<div class="toolbar-end">
		<a
			class="icon-button"
			href={tutorialHref()}
			hreflang={tutorialLang()}
			target="_blank"
			title={m.toolbar_tutorial()}
			aria-label={m.toolbar_tutorial()}
		>
			<svg aria-hidden="true"><use href="#i-book"></use></svg>
		</a>
		<button
			id="tour-restart"
			class="icon-button"
			title={m.toolbar_guide()}
			aria-label={m.toolbar_guide()}
			onclick={restartTour}
		>
			<svg aria-hidden="true"><use href="#i-help"></use></svg>
		</button>
		<!-- The click that fills and opens the share card stays with the controller while the
		     share dialog still lives in the template body (dialogs phase). Until the scorer
		     loads there is no language verdict either way, and the old template's static title
		     said "share" — keep that until the answer is known. -->
		<button
			id="share-button"
			class="icon-button"
			title={studio.scorer && !studio.scorer.available ? m.share_unavailable() : m.toolbar_share()}
			aria-label={m.toolbar_share()}
			disabled={busy || !share}
		>
			<svg aria-hidden="true"><use href="#i-share"></use></svg>
		</button>
		<button
			id="settings-button"
			class="icon-button"
			title={m.toolbar_settings()}
			aria-label={m.toolbar_settings()}
			onclick={() => studio.openDialog('settings-dialog')}
		>
			<svg aria-hidden="true"><use href="#i-gear"></use></svg>
		</button>
		<button
			id="info-button"
			class="icon-button"
			title={m.toolbar_info()}
			aria-label={m.toolbar_info()}
			onclick={() => studio.openDialog('info-dialog')}
		>
			<svg aria-hidden="true"><use href="#i-info"></use></svg>
		</button>
		<button
			id="theme-button"
			class="icon-button"
			title={m.toolbar_theme()}
			aria-label={m.toolbar_theme()}
			onclick={() => studio.toggleTheme()}
		>
			<svg aria-hidden="true"><use href={studio.dark ? '#i-sun' : '#i-moon'}></use></svg>
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
