<!-- The measurements side of the studio: the verdict, the profile chart, one indicator per
     measurement and the two voices' distance in the map. On phones it becomes a strip above the
     map: the verdict across the top, the indicators and the distance beneath. The distance opens
     the comparison report (the controller wires #report-button until the report dialog moves). -->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	import { fmt } from '../profile';
	import { useStudio } from '../studio.svelte';
	import Indicators from './Indicators.svelte';
	import ProfileChart from './ProfileChart.svelte';
	import Verdict from './Verdict.svelte';

	const studio = useStudio();
</script>

<aside class="profile-panel" aria-label={m.profile_aria()}>
	<Verdict />
	<div class="profile-heading">{m.profile_heading()}</div>
	<ProfileChart />
	<div class="profile-legend">
		<span class="self-line">{m.common_self()}</span>
		<span class="ref-line">{m.common_reference()}</span>
	</div>
	<Indicators />
	<button
		id="report-button"
		class="fit-readout"
		title={studio.distance === null ? m.profile_fit_title() : m.profile_fit_title_ready()}
	>
		<span>{m.profile_fit()}</span>
		<strong id="fit-value">{fmt(studio.distance, 2)}</strong>
	</button>
</aside>

<style>
	.profile-panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		padding: 13px 12px;
		border-right: 1px solid var(--line);
		background: var(--surface);
	}
	.profile-heading {
		margin-bottom: 3px;
		font-size: 12px;
		font-weight: 600;
	}
	.profile-legend {
		display: flex;
		gap: 14px;
		align-items: center;
		justify-content: center;
		margin: 1px 0 5px;
		font-size: 10px;
		color: var(--muted);
	}
	.self-line,
	.ref-line {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		white-space: nowrap;
	}
	.self-line:before,
	.ref-line:before {
		content: '';
		width: 17px;
		border-top: 2px solid var(--reference);
	}
	.self-line:before {
		border-top-style: dashed;
		border-top-color: var(--self);
	}
	.fit-readout {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 9px;
		flex-shrink: 0;
		margin: 8px 0 0;
		padding: 9px 0;
		border: 0;
		border-top: 1px solid var(--line);
		border-radius: 0;
		background: transparent;
	}
	.fit-readout span {
		font-size: 11px;
		color: var(--ink);
	}
	.fit-readout strong {
		font-size: 13px;
		color: var(--reference);
		white-space: nowrap;
	}

	@media (min-width: 1700px) {
		.profile-panel {
			padding: 17px 16px;
		}
	}

	@media (max-width: 1150px) {
		.profile-panel {
			padding: 12px 10px;
		}
		.profile-legend {
			gap: 9px;
			font-size: 9px;
		}
	}

	@media (max-height: 760px) and (min-width: 801px) {
		.profile-panel {
			padding-top: 8px;
		}
	}

	/* Phones: a strip above the map. */
	@media (max-width: 800px), (max-height: 520px) {
		.profile-panel {
			grid-row: 2;
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'verdict verdict' 'indicators fit';
			align-items: stretch;
			gap: 6px;
			overflow: visible;
			padding: 6px 8px;
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.profile-heading,
		.profile-legend {
			display: none;
		}
		.fit-readout {
			grid-area: fit;
			flex-direction: column;
			justify-content: center;
			gap: 2px;
			min-width: 48px;
			margin: 0;
			padding: 0 6px 0 8px;
			border-top: 0;
			border-left: 1px solid var(--line);
		}
		.fit-readout span {
			font-size: 10px;
			white-space: nowrap;
		}
		.fit-readout strong {
			font-size: 14px;
		}
	}
</style>
