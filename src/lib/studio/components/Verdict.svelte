<!-- The verdict readout: the word and the signed score for the listener's measurement, or what
     is missing for one, on the scale with the two groups' bands. Clicking it opens the share card
     (the controller wires #verdict-readout to the share button until the share dialog moves). -->
<script lang="ts">
	import { clamp } from '$lib/math';
	import { m } from '$lib/paraglide/messages';
	import { formatScore, verdictLabel } from '$lib/score';

	import { useStudio } from '../studio.svelte';

	const studio = useStudio();

	const groups = ['male', 'female'] as const;
	const scale = (s: number) => `${clamp((s + 120) / 240, 0, 1) * 100}%`;

	let result = $derived(studio.shareResult);
	let measurement = $derived(studio.measurement);
	// Until the language's scorer has loaded there is nothing to say either way.
	let word = $derived(
		result
			? verdictLabel(result.verdict)
			: !studio.scorer
				? '—'
				: !studio.scorer.available
					? m.verdict_unavailable()
					: !measurement
						? m.verdict_record()
						: measurement.analysisPending
							? m.verdict_analyzing()
							: m.verdict_not_yet()
	);
	let bands = $derived(studio.scorer?.available ? studio.scorer.bands : null);
</script>

<button id="verdict-readout" class="verdict-readout" title={m.toolbar_share()} disabled={!result}>
	<span class="verdict-head">
		<span>{m.verdict_heading()}</span>
		<svg aria-hidden="true"><use href="#i-share"></use></svg>
	</span>
	<span id="verdict-main" class="verdict-main" data-verdict={result?.verdict || ''}>
		<strong id="verdict-word">{word}</strong>
		<b id="verdict-number">{result ? formatScore(result.display) : ''}</b>
	</span>
	<span id="verdict-gate" class="verdict-gate" hidden={!studio.gate || !!result}>
		{studio.gate && !result
			? studio.gate.value
				? m.verdict_gate(studio.gate)
				: studio.gate.label
			: ''}
	</span>
	<span class="verdict-scale" aria-hidden="true">
		{#each groups as group (group)}
			{@const band = bands?.[group]}
			<i
				id="verdict-band-{group}"
				class="verdict-band {group}"
				hidden={!!studio.scorer && !band}
				style:left={band ? scale(band[0]) : undefined}
				style:width={band ? `calc(${scale(band[1])} - ${scale(band[0])})` : undefined}
			></i>
		{/each}
		<i class="verdict-center"></i>
		<i id="verdict-dot" class="verdict-dot" style:left={result ? scale(result.score) : undefined}
		></i>
	</span>
	<span class="verdict-ends" aria-hidden="true">
		<span>{m.verdict_end_male()}</span>
		<span>{m.verdict_end_center()}</span>
		<span>{m.verdict_end_female()}</span>
	</span>
</button>

<style>
	.verdict-readout {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
		text-align: left;
		width: 100%;
		padding: 10px 11px 9px;
		margin-bottom: 14px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--raised);
		cursor: pointer;
	}
	.verdict-readout:disabled {
		cursor: default;
		opacity: 0.7;
	}
	.verdict-readout:not(:disabled):hover {
		border-color: var(--accent);
	}
	.verdict-head {
		display: flex;
		width: 100%;
		justify-content: space-between;
		align-items: center;
		font-size: 10px;
		color: var(--muted);
	}
	.verdict-head svg {
		width: 13px;
		height: 13px;
		stroke: currentColor;
		fill: none;
		stroke-width: 1.8;
	}
	.verdict-main {
		display: flex;
		width: 100%;
		align-items: baseline;
		justify-content: space-between;
		gap: 6px;
	}
	.verdict-main strong {
		font-size: 15px;
		color: var(--heading);
		font-weight: 600;
	}
	.verdict-main b {
		font-size: 22px;
		font-weight: 700;
		color: var(--heading);
		font-variant-numeric: tabular-nums;
	}
	.verdict-main[data-verdict='female'] strong {
		color: var(--pink);
	}
	.verdict-main[data-verdict='male'] strong {
		color: var(--sky);
	}
	.verdict-main[data-verdict='androgynous'] strong {
		color: var(--self);
	}
	.verdict-gate {
		display: block;
		font-size: 10px;
		color: var(--danger);
		line-height: 1.4;
	}
	.verdict-scale {
		position: relative;
		display: block;
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: var(--grid);
		margin-top: 2px;
	}
	.verdict-band {
		position: absolute;
		top: -2px;
		height: 10px;
		border-radius: 5px;
		opacity: 0.35;
	}
	.verdict-band.male {
		background: var(--sky);
	}
	.verdict-band.female {
		background: var(--pink);
	}
	.verdict-center {
		position: absolute;
		left: 50%;
		top: -3px;
		width: 2px;
		height: 12px;
		background: var(--muted);
		transform: translateX(-50%);
		opacity: 0.7;
	}
	.verdict-dot {
		position: absolute;
		top: -4px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--self);
		border: 2px solid var(--surface);
		transform: translateX(-50%);
		box-shadow: 0 1px 3px #0003;
	}
	.verdict-readout:disabled .verdict-dot {
		display: none;
	}
	.verdict-ends {
		display: flex;
		width: 100%;
		justify-content: space-between;
		font-size: 9px;
		color: var(--muted);
	}
	.verdict-ends span:first-child {
		color: var(--sky);
	}
	.verdict-ends span:last-child {
		color: var(--pink);
	}

	@media (max-width: 800px), (max-height: 520px) {
		.verdict-readout {
			grid-area: verdict;
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-areas: 'head main' 'scale scale';
			align-items: center;
			gap: 5px 10px;
			margin: 0;
			padding: 6px 10px 8px;
		}
		.verdict-head {
			grid-area: head;
			width: auto;
			gap: 6px;
		}
		.verdict-main {
			grid-area: main;
			width: auto;
			justify-content: flex-end;
		}
		.verdict-main strong {
			font-size: 14px;
		}
		.verdict-main b {
			font-size: 18px;
		}
		.verdict-scale {
			grid-area: scale;
			margin: 0;
		}
		.verdict-ends {
			display: none;
		}
	}
</style>
