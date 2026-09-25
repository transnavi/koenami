<!-- One button per measurement: the listener's value, the reference's, and a track with the
     reference speakers' middle 80%. A button opens the measurement's explanation. -->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	import { openHelp } from '../help';
	import { fmt, indicator, METRICS, spread, type Indicator, type Spread } from '../metrics';
	import { useStudio } from '../studio.svelte';

	const studio = useStudio();

	// The speakers' spread only changes with the reference group; the voices change with every
	// live measurement.
	let spreads = $derived(METRICS.map((metric) => spread(metric, studio.referenceStats)));
	let rows = $derived(
		spreads.map((s) => ({ spread: s, ...indicator(s, studio.ownFeatures, studio.refFeatures) }))
	);

	function explain(row: Indicator & { spread: Spread }) {
		const { metric, q10, q90, speakers } = row.spread;
		openHelp(metric, [
			[m.help_own(), `${fmt(row.own, metric.n)} ${metric.unit}`],
			[m.help_reference(), `${fmt(row.ref, metric.n)} ${metric.unit}`],
			[
				m.help_band({
					group: (studio.referenceGroup === 'male' ? m.group_male : m.group_female)()
				}),
				`${fmt(q10, metric.n)}–${fmt(q90, metric.n)} ${metric.unit}`
			],
			[m.help_speakers(), speakers]
		]);
	}
</script>

<div id="indicators" class="indicators" role="group" aria-label={m.profile_indicators_aria()}>
	{#each rows as row (row.spread.metric.key)}
		{@const { metric } = row.spread}
		{@const title = m.indicator_title({
			label: metric.label,
			own: fmt(row.own, metric.n),
			ref: fmt(row.ref, metric.n),
			unit: metric.unit
		})}
		<button
			class="indicator"
			data-metric={metric.key}
			{title}
			aria-label={title}
			onclick={() => explain(row)}
		>
			<span class="indicator-heading"
				>{metric.label}<svg aria-hidden="true"><use href="#i-info"></use></svg></span
			>
			<span class="indicator-values"
				><strong>{fmt(row.own, metric.n)}</strong><small>{metric.unit}</small><em
					>{fmt(row.ref, metric.n)}</em
				></span
			>
			<span class="indicator-track"
				>{#if row.band}<span
						class="indicator-band"
						style:left="{row.band.left}%"
						style:width="{row.band.width}%"
					></span>{/if}{#if row.ownAt !== null}<span
						class="indicator-marker"
						style:left="{row.ownAt}%"
					></span>{/if}{#if row.refAt !== null}<span
						class="indicator-target"
						style:left="{row.refAt}%"
					></span>{/if}</span
			>
		</button>
	{/each}
</div>

<style>
	.indicators {
		display: flex;
		flex-direction: column;
		justify-content: space-evenly;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}
	.indicator {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: center;
		flex: 1;
		min-width: 0;
		min-height: 0;
		padding: 10px 1px;
		border: 0;
		border-bottom: 1px solid var(--line);
		border-radius: 0;
		text-align: left;
		background: transparent;
	}
	.indicator:last-child {
		border-bottom: 0;
	}
	.indicator:hover {
		background: var(--raised);
	}
	.indicator-heading {
		display: flex;
		gap: 3px;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		color: var(--muted);
	}
	.indicator-heading svg {
		width: 11px;
		height: 11px;
		opacity: 0.65;
	}
	.indicator-values {
		display: flex;
		align-items: baseline;
		gap: 4px;
		margin: 7px 0 10px;
		white-space: nowrap;
	}
	.indicator-values strong {
		font-size: 22px;
		font-weight: 550;
		letter-spacing: -0.5px;
		color: var(--self);
		font-variant-numeric: tabular-nums;
	}
	.indicator-values small {
		font-size: 9px;
		color: var(--muted);
	}
	.indicator-values em {
		margin-left: auto;
		font-size: 12px;
		font-style: normal;
		color: var(--reference);
	}
	.indicator-track {
		position: relative;
		display: block;
		width: calc(100% - 6px);
		height: 4px;
		margin: 0 3px;
		border-radius: 3px;
		background: var(--raised);
	}
	.indicator-band {
		position: absolute;
		height: 100%;
		border-radius: 3px;
		background: color-mix(in srgb, var(--reference) 22%, transparent);
	}
	.indicator-marker {
		position: absolute;
		top: -3px;
		width: 3px;
		height: 10px;
		border-radius: 1px;
		background: var(--self);
		transform: translateX(-50%);
	}
	.indicator-target {
		position: absolute;
		top: -1.5px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--reference);
		transform: translateX(-50%);
	}

	@media (max-width: 1150px) {
		.indicator-values {
			gap: 3px;
		}
		.indicator-values strong {
			font-size: 19px;
		}
		.indicator-values em {
			font-size: 11px;
		}
	}

	@media (max-height: 760px) and (min-width: 801px) {
		.indicator {
			padding: 7px 1px;
		}
		.indicator-values {
			margin: 4px 0 7px;
		}
	}

	/* Phones: the five in a row, each a small grid of label, unit, value, reference and track. */
	@media (max-width: 800px), (max-height: 520px) {
		.indicators {
			grid-area: indicators;
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: 2px;
		}
		.indicator {
			flex: none;
			display: grid;
			grid-template-columns: auto auto;
			grid-template-areas: 'label unit' 'value value' 'ref ref' 'track track';
			justify-content: center;
			align-content: start;
			gap: 3px;
			padding: 4px 2px;
			border-bottom: 0;
			border-radius: 6px;
		}
		.indicator-heading {
			grid-area: label;
			font-size: 10px;
			line-height: 1.2;
		}
		.indicator-heading svg {
			display: none;
		}
		.indicator-values {
			display: contents;
		}
		.indicator-values strong {
			grid-area: value;
			font-size: 15px;
			letter-spacing: -0.3px;
			text-align: center;
			line-height: 1.1;
		}
		.indicator-values small {
			grid-area: unit;
			align-self: end;
			line-height: 1.2;
			white-space: nowrap;
		}
		.indicator-values em {
			grid-area: ref;
			width: auto;
			margin: 0;
			font-size: 11px;
			text-align: center;
			line-height: 1.1;
		}
		.indicator-track {
			grid-area: track;
			width: 100%;
			margin: 2px 0 0;
		}
	}
</style>
