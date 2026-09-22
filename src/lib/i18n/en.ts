import type { Catalogue } from './ja';

/* English. Same keys as ja.js; {n} strings with {one, other} pick a form by count. */
export default {
	'page.title': 'Koenami · voice training for feminine and masculine voices',
	'page.description':
		'A free voice training tool for transgender people and anyone else working toward a feminine or masculine voice, or learning to switch between the two. Pick a reference voice, record yourself imitating it, and see where your voice lands next to it and how far you have to go. Real-time measurement included.',
	'page.browser_requirements': 'A browser with microphone access',
	'page.publisher': 'とらんすナビ',

	'toolbar.language': 'Language (interface and references)',
	'toolbar.tutorial': 'How your voice works: a practice guide',
	'toolbar.guide': 'Guided tour',
	'toolbar.share': 'Share the verdict',
	'toolbar.settings': 'Settings',
	'toolbar.info': 'Sources and related tools',
	'toolbar.theme': 'Switch between light and dark',
	'common.self': 'You',
	'common.reference': 'Reference',
	'common.close': 'Close',
	'common.save': 'Save',

	'profile.aria': 'Five voice measurements',
	'profile.heading': 'Voice profile',
	'profile.canvas_aria': 'Your five measurements overlaid on the reference',
	'profile.indicators_aria': 'Voice measurements',
	'profile.fit': 'Distance to reference',
	'profile.fit_title': 'Open the comparison report',
	'profile.fit_title_ready':
		'Distance from the reference, standardized across the five measurements (0 = identical). Click to open the comparison report.',
	'verdict.heading': 'Voice verdict',
	'verdict.end_male': 'Masculine −100',
	'verdict.end_center': '0',
	'verdict.end_female': 'Feminine +100',

	'graph.aria': 'Voice comparison',
	'graph.canvas_aria': 'Voice map. Scroll to zoom, drag to rotate, Shift+drag to pan.',
	'graph.projection_variance': 'Spread',
	'graph.projection_variance_title':
		'Axes follow the directions of greatest spread (principal component analysis). The feminine/masculine labels are ignored.',
	'graph.projection_contrast': 'Contrast',
	'graph.projection_contrast_title':
		'The horizontal axis is the direction that best separates the feminine and masculine references, computed from the labeled references.',
	'graph.auto_rotate': 'Auto-rotate',
	'graph.auto_rotate_title': 'Toggle 3D auto-rotation',
	'graph.space_label': 'Voice map',
	'graph.space_title': 'Principal component space of the five measurements',
	'graph.space_title_contrast':
		'Computed from the five measurements. The horizontal axis is the direction that separates feminine and masculine voices the most.',
	'graph.zoom_in': 'Zoom in',
	'graph.zoom_out': 'Zoom out',
	'graph.find_me': 'Fit all voices in view',
	'graph.reset': 'Reset view',
	'group.female': 'Feminine voices',
	'group.male': 'Masculine voices',
	'group.androgynous': 'Androgynous voices',
	'group.all': 'All voices',
	'group.favorites': '★ Favorites',
	'group.custom': 'Imported voices',

	'signal.aria': 'Waveform and spectrum comparison',
	'signal.view_aria': 'Signal view',
	'signal.pitch': 'Pitch',
	'signal.spectrogram': 'Spectrogram',
	'signal.spectrum': 'Spectrum',
	'signal.waveform': 'Waveform',
	'signal.both': 'Overlay',
	'signal.both_title': 'Stretch both to the same length and overlay them',
	'signal.both_title_on': "Each selection is stretched to 0–100%, so words won't line up.",
	'signal.words': 'Words',
	'signal.words_title': 'Transcribe and split into words',
	'signal.range_reset': 'Clear selection',
	'signal.range_reset_title': 'Clear selection (Esc)',
	'signal.canvas_aria':
		'Click the waveform to seek, drag to select a range. Left and right arrow keys move the playback position. Click the pitch scale to switch between Hz and note names.',
	'signal.word_list_aria': 'Estimated word positions',
	'signal.word_title': '{start}–{end}s · estimated position',

	'samples.aria': 'Reference audio',
	'samples.browser_aria': 'Choose a reference',
	'samples.heading': 'Reference voices',
	'samples.add': 'Import reference audio',
	'samples.group_aria': 'Reference type',
	'samples.sort_aria': 'Sort order',
	'sort.name': 'Speaker name',
	'sort.near': 'Closest to you',
	'sort.low': 'Lowest pitch first',
	'sort.high': 'Highest pitch first',
	'samples.search': 'Search',
	'samples.search_aria': 'Search references',
	'samples.more': 'Show more',
	'lab.teacher': 'Instructor',
	'lab.pitch': 'Pitch',
	'lab.pitch_aria': "Instructor's pitch",
	'lab.resonance': 'Resonance',
	'lab.resonance_aria': "Instructor's resonance",
	'lab.weight': 'Weight',
	'lab.weight_aria': "Instructor's vocal weight",
	'lab.low': 'Low',
	'lab.med': 'Medium',
	'lab.high': 'High',
	'lab.light': 'Light',
	'lab.heavy': 'Heavy',
	'jvs.added': { one: '{n} clip imported', other: '{n} clips imported' },
	'jvs.cancelled': 'Import stopped. Clips already imported have been kept.',
	'jvs.index_failed': 'The JVS index could not be loaded.',
	'jvs.audio_missing': 'JVS audio not found. Import it again.',
	'jvs.no_match': 'No matching JVS audio found. Choose the official ZIP or the unzipped folder.',
	'jvs.quota':
		"Not enough storage. To import only part of the corpus, choose one speaker's folder.",
	'jvs.size_mismatch': 'An audio file has an unexpected size.',
	'jvs.hash_mismatch': "A file doesn't match the official audio. Choose the official ZIP again.",

	'target.aria': 'Selected reference',
	'target.play': 'Play reference',
	'target.pause': 'Pause reference',
	'target.pick': 'Choose a reference',
	'target.favorite': 'Favorite',
	'target.favorite_add': 'Add to favorites',
	'target.source': 'Source',
	'target.seek_aria': 'Reference playback position',
	'target.meta_synthetic': 'synthetic voice',
	'target.analysis_error': "Couldn't analyze the reference: {message}",
	'favorite.add': 'Add to favorites',
	'favorite.remove': 'Remove from favorites',
	'favorite.add_clip': 'Add {name} to favorites',
	'favorite.remove_clip': 'Remove {name} from favorites',
	'favorite.marked': 'Favorited',

	'record.title': 'Record (R)',
	'record.aria': 'New recording',
	'record.stop': 'Stop recording',
	'record.stop_title': 'Stop recording (R)',
	'play.label': 'Play',
	'play.own': 'Play your voice',
	'play.own_title': 'Play your voice (Space)',
	'play.own_pause': 'Pause your voice',
	'takes.menu': 'Recordings',
	'takes.retry': 'Reanalyze',
	'takes.default_name': 'Recording {n}',
	'takes.sort': 'Sort order',
	'takes.sort_newest': 'Newest',
	'takes.sort_oldest': 'Oldest',
	'takes.sort_name': 'Name',
	'takes.sort_longest': 'Longest',
	'live.label': 'Real-time',
	'live.measuring': 'Measuring',
	'live.title': 'Show your microphone input live',
	'live.start': 'Start real-time measurement',
	'live.stop': 'Stop real-time measurement',
	'live.stop_title': 'Stop real-time measurement (Esc)',
	'loopback.aria': 'Monitor your voice',
	'loopback.title': 'Monitor your voice (use headphones)',
	'loopback.stop': 'Stop monitoring',
	'speed.aria': 'Playback speed',
	'speed.reset': 'Normal speed',
	'ab.title': 'Play reference, then your voice',
	'upload.title': 'Open an audio file',
	'state.recording': 'Recording',
	'state.preparing': 'Preparing',
	'state.analyzing': 'Analyzing',

	'import.heading': 'Add a reference',
	'import.audio': 'Choose an audio file',
	'import.jvs_heading': 'Add JVS',
	'import.jvs_site': 'Download from the official site ↗',
	'import.jvs_hint':
		'Choose the official ZIP or the unzipped folder to add 100 speakers and 5,000 clips.',
	'import.zip': 'Choose ZIP',
	'import.folder': 'Choose folder',
	'import.progress_aria': 'JVS import',
	'import.cancel': 'Stop',
	'import.terms':
		'Use of the audio is governed by the JVS terms. Imported references are stored in this browser only.',
	'settings.heading': 'Settings',
	'settings.theme': 'Appearance',
	'theme.light': 'Light',
	'theme.dark': 'Dark',
	'theme.system': 'System',
	'settings.live_window': 'Real-time analysis window',
	'settings.live_shape': 'Real-time trail length',
	'settings.seconds': '{n} s',
	'settings.normalize': 'Normalize playback volume',
	'settings.export': 'Export measurements',
	'settings.takes': 'Recordings',
	'settings.download_all': 'Download all',
	'settings.delete_all': 'Delete all',

	'info.about1':
		'Koenami is a voice training tool for transgender people and anyone else working toward a feminine or masculine voice, or learning to switch between the two. Pick a reference voice and record yourself imitating it; your voice appears on the same map as the reference, so you can see how close you are to the voice you want. In real-time mode you watch your own position move across the map as you speak, so you can find which direction to push in.',
	'info.about2':
		'The references cover Japanese, Mandarin, English and Korean. Koenami is free and open source, and recordings never leave your browser.',
	'info.guide': 'User guide (Japanese) ↗',
	'info.tutorial': 'How your voice works: a practice guide ↗',
	'info.method': 'Method and sources (Japanese) ↗',
	'info.references': 'References (Japanese) ↗',
	'info.source': 'Source code (GitHub) ↗',
	'rename.failed': "Couldn't rename the recording. Try again.",
	'report.heading': 'Comparison',
	'report.save': 'Save report',
	'metric.factors': 'What affects it',
	'metric.caveats': 'Caveats',

	'share.heading': 'Voice verdict',
	'share.help': 'How to read the verdict',
	'share.age_label': 'Approximate perceived age',
	'share.age_run': 'Estimate',
	'share.age_running': 'Estimating…',
	'share.age_include': 'Include in the image and link',
	'share.age_note':
		"An estimate from an age-recognition model (audEERING). It hasn't been validated against how old Japanese voices, or voices in training, actually sound to listeners. Audio is sent only for this estimate and isn't stored.",
	'share.age_value': '{age} (4-second windows: {low}–{high})',
	'share.age_years': 'about {n}',
	'share.group_aria': 'Share the result',
	'share.system': 'Share…',
	'share.copy': 'Copy link',
	'share.copied': 'Link copied.',
	'share.save': 'Save image',
	'share.open': 'Open result page',
	'share.post_to': 'Post to {name}',
	'share.image_alt': '{text}. An image of the five measurements and the reference distribution.',
	'share.history': 'Verdict over time',
	'share.history_sub': 'recordings on this device',
	'share.history_aria': 'Verdict of each recording over time',
	'share.history_note':
		"Older recordings didn't save the verdict checks (such as voiced duration), so they're shown unchecked.",
	'share.note':
		'The link contains only the five measurements; the recording is not sent. <a href="/method.html" target="_blank" hreflang="ja">Method and sources</a> (Japanese) explains how to read the verdict.',
	'share.unavailable': "Verdicts aren't available for this reference language",
	'share.text': 'My voice on Koenami: {verdict} ({leaning} {score})',
	'share.image_failed': "Couldn't create the image.",
	'history.current': 'Current',
	'history.open': 'Open',
	'history.open_title': 'Show this recording',

	'metric.f0.label': 'Pitch',
	'metric.f0.unit': 'Hz',
	'metric.f0.description':
		'How fast the vocal folds vibrate: the median fundamental frequency (F0) of voiced speech. Higher is a higher voice. The band covers the middle 80% of the reference group.',
	'metric.f0.factors': [
		'Vocal fold tension (how the laryngeal muscles are used) and vocal fold mass',
		'Larynx height, airflow and strain',
		'Sentence type and emotion; questions and emphasis raise it'
	],
	'metric.f0.caveats': [
		'Pitch alone doesn\'t decide how a voice is gendered. At the same pitch, resonance changes the impression (<a href="https://doi.org/10.5112/jjlp.50.14" target="_blank" rel="noreferrer">Sakuraba et al. 2009</a>).',
		'Breath noise and fan hum throw it off. Stay 10–20 cm from the mic and record somewhere quiet.'
	],
	'metric.delta_f.label': 'Resonance',
	'metric.delta_f.unit': 'Hz ΔF',
	'metric.delta_f.description':
		'The formant spacing estimated from the first four formants. Larger values tend to go with a shorter vocal tract and a brighter sound. Vowels change it too, so compare the same words.',
	'metric.delta_f.factors': [
		'Larynx height (raising it shortens the vocal tract and raises the value)',
		'Mouth opening, tongue position and lip shape',
		'The vowel: the same person\'s "ee" and "ah" differ a lot'
	],
	'metric.delta_f.caveats': [
		"It's an estimate: unstable on short or noisy recordings, and sensitive to the analysis settings.",
		'A difference in vowels can look like a difference in resonance. Compare the same words, ideally the same vowels.'
	],
	'metric.hnr.label': 'Texture',
	'metric.hnr.unit': 'dB',
	'metric.hnr.description':
		"Harmonics-to-noise ratio (HNR): how much of the voice is periodic rather than noise. Breathiness, roughness and background noise all lower it. It isn't a direct measure of vocal weight.",
	'metric.hnr.factors': [
		'Breathiness (how the vocal folds close)',
		'Roughness and rasp',
		'Recording noise; a noisy room lowers it'
	],
	'metric.hnr.caveats': [
		'Not a measure of vocal weight or thickness.',
		'Compare a noisy recording of yourself with a reference made in a quiet room and yours will read lower from the noise alone.'
	],
	'metric.balance.label': 'Brightness',
	'metric.balance.unit': 'dB',
	'metric.balance.description':
		'Energy at 1–4 kHz relative to 100 Hz–1 kHz. Higher means more high-frequency content. Vowels, airflow and the microphone all affect it.',
	'metric.balance.factors': [
		'Mouth opening and tongue position',
		'Airflow and how the vocal folds close',
		"Microphone position and character, and the browser's audio processing"
	],
	'metric.balance.caveats': [
		"Depends heavily on the equipment, so recordings made under different conditions don't compare well.",
		'Better for tracking your own recordings on the same equipment than for comparing against a reference.'
	],
	'metric.pitch_span.label': 'Intonation',
	'metric.pitch_span.unit': 'st',
	'metric.pitch_span.description':
		"The range between the 10th and 90th percentiles of pitch. It can contribute to a feminine impression, but Japanese pitch accent, Mandarin tones, sentence type and emotion all change it too, so wider isn't better. Standard deviation and pausing are in the report.",
	'metric.pitch_span.factors': [
		'Sentence type and emotion',
		'The language: Japanese pitch accent and Mandarin tones widen or narrow it',
		'Recording length: longer recordings tend to cover a wider range'
	],
	'metric.pitch_span.caveats': [
		"Wider isn't better.",
		'Recordings of different lengths are hard to compare; use the same sentence or a short phrase.'
	],
	'verdict.help.label': 'Voice verdict',
	'verdict.help.description':
		'Where the five measurements fall along the direction that best separates the feminine and masculine references (the contrast axis). 0 is halfway between the two medians; −50 is the masculine median, +50 the feminine one.',
	'verdict.help.factors': [
		'All five measurements above, with pitch and resonance weighing most',
		"The reference language: each language has its own references, so scores aren't comparable across languages"
	],
	'verdict.help.caveats': [
		'A position in acoustic space, not a listener rating, and not calibrated.',
		'Unstable on short or noisy recordings. Record the same sentence a few times and compare.',
		'Moving in either direction, or toward 0, is a valid goal.'
	],
	'indicator.title': '{label}: you {own} {unit} · reference {ref} {unit}',
	'help.own': 'You',
	'help.reference': 'Selected reference',
	'help.band': '{group} · middle 80%',
	'help.speakers': 'Reference speakers',
	'help.male_band': 'Masculine references · middle 80%',
	'help.female_band': 'Feminine references · middle 80%',
	'help.band_range': '{low}–{high}',

	'corpus.clips': { one: '{n} clip', other: '{n} clips' },
	'corpus.speakers': { one: '{n} speaker', other: '{n} speakers' },
	'corpus.count': '{clips} · {speakers}',

	'quality.no_voice': 'No voice detected. Check your microphone.',
	'quality.longer': 'Keep talking a little longer.',
	'quality.resonance': "Couldn't get a reliable resonance reading.",
	'quality.waiting': 'Listening…',
	'verdict.unavailable': 'Not available in this language',
	'verdict.record': 'Record to see it',
	'verdict.analyzing': 'Analyzing',
	'verdict.not_yet': 'No verdict yet',
	'verdict.gate': '{label} {value} (needs {need})',
	'verdict.female': 'Feminine voice',
	'verdict.androgynous': 'In-between voice',
	'verdict.male': 'Masculine voice',
	'leaning.female': 'leaning feminine',
	'leaning.androgynous': 'in the middle',
	'leaning.male': 'leaning masculine',
	'gate.voiced_seconds': 'Voiced speech',
	'gate.formant_seconds': 'Stable resonance',
	'gate.clipping_fraction': 'Clipping',
	'gate.resonance_sensitivity_pct': 'Resonance estimate variability',
	'gate.seconds': 's',
	'gate.none': 'Not measured',
	'gate.min': 'at least {value} {unit}',
	'gate.max': 'at most {value} {unit}',

	'report.pitch_sd_hz': 'Pitch standard deviation · Hz',
	'report.pitch_sd_st': 'Pitch standard deviation · st',
	'report.quiet_pct': 'Silence · %',
	'report.quiet_mean': 'Average pause · s',
	'report.pace': 'Speaking rate · {unit}',
	'report.note_pitch':
		"The reference is {diff} semitones {direction} than you. Slow the playback down and try the same sentence at a pitch that's comfortable.",
	'report.higher': 'higher',
	'report.lower': 'lower',
	'report.note_resonance':
		'Estimated resonance: you {own}, reference {ref} Hz ΔF. Pick one vowel or a short word, hold the pitch steady, and listen for the difference in resonance.',
	'report.note_intonation':
		'Intonation also depends on the language and the sentence. Read the same text and compare accent, sentence endings and pauses.',
	'report.distance_caption': 'Acoustic distance from the reference · 0 = identical',
	'report.distance_note':
		"A standardized distance across pitch, resonance, texture, brightness and intonation. It doesn't rate femininity or naturalness.",
	'report.share':
		'Difference between the two voices: {shown}% visible on the map · {omitted}% not shown',
	'report.share_note':
		'The squared difference across all five dimensions, split between the directions the map shows and those it leaves out. Voices that overlap on the map can still differ in the omitted directions.',
	'report.col_metric': 'Measurement',
	'report.col_own': 'You',
	'report.col_ref': 'Reference',
	'report.col_band': 'Middle 80% of references',
	'report.footer': '{name} · {duration} · reference {reference}',
	'report.languages': 'Recording language {own} · reference language {ref}',
	'report.density':
		'Density rank among the {group} references: percentile {percentile} (not a listener rating).',
	'report.projection':
		'The map projects five dimensions down to {dimension}, keeping {variance}% of the variance. The measurements on the left cover what it leaves out.',
	'report.file_title': 'Voice comparison',
	'report.method_link': 'Research behind the measurements',

	'notice.imported': 'Audio loaded.',
	'notice.take_deleted': 'Recording deleted.',
	'notice.zipped': { one: '{n} recording zipped.', other: '{n} recordings zipped.' },
	'notice.deleted_all': { one: '{n} recording deleted.', other: '{n} recordings deleted.' },
	'confirm.delete_all': {
		one: "Delete the {n} saved recording? This can't be undone.",
		other: "Delete all {n} saved recordings? This can't be undone."
	},
	'error.load': "Couldn't load: {message}",
	'error.playback': "Couldn't play this clip. Try another.",
	'error.replay': "Couldn't play it.",
	'error.ab_wait': 'Wait until both clips have loaded.',
	'error.words_first': 'Load audio first.',
	'error.file_size': 'Choose an audio file under 150 MB.',
	'error.duration': 'Choose audio between 0.25 seconds and 15 minutes long.',
	'error.too_long': {
		one: 'Choose audio no longer than {n} minute.',
		other: 'Choose audio no longer than {n} minutes.'
	},
	'error.too_short': 'Record at least 0.25 seconds.',
	'error.mic_denied': 'Allow microphone access for this page in your browser settings.',
	'error.take_save': "Couldn't save the recording. Download it if you need it.",
	'error.take_save_retry':
		"Couldn't save the recording. Download it, then check your storage space.",
	'error.take_kept': 'The recording is still there; you can reanalyze it from the Recordings menu.',
	'error.take_load': "Couldn't load this recording.",
	'error.take_delete': "Couldn't delete the recording. Try again.",
	'error.no_takes': 'No saved recordings.',
	'error.favorite_save': "Couldn't save favorites.",
	'error.reference_save': "Couldn't save the reference audio.",

	'action.play': 'Play',
	'action.stop': 'Stop',
	'action.rename': 'Rename',
	'action.download': 'Download',
	'action.delete': 'Delete',
	'action.label': '{action} {name}',

	'tour.later': 'Later',
	'tour.later_title': 'Pause the tour and pick it up next time',
	'tour.skip': 'Skip',
	'tour.skip_title': 'Close the tour',
	'tour.back': 'Back',
	'tour.next': 'Next',
	'tour.start': 'Start',
	'tour.steps': [
		{
			title: 'Welcome to Koenami',
			text: 'Record yourself imitating a reference voice and see how the two differ. This tour of the main parts of the screen takes about a minute.\nYou can skip it; {help} in the top right brings it back any time.'
		},
		{
			title: 'Selected reference',
			text: '{play} plays the selected reference; {star} adds it to your favorites.'
		},
		{
			title: 'Reference list',
			text: 'Filter by voice type and sort to find the voice you want to move toward.'
		},
		{ title: 'Recording', text: '{mic} or {R} starts recording; press again to stop.' },
		{
			title: 'Voice profile',
			text: 'Your pitch, resonance, texture, brightness and intonation, side by side with the reference.'
		},
		{
			title: 'Voice map',
			text: 'A map of all the reference voices, showing how close yours is to the one you picked.'
		},
		{ title: 'Waveform', text: 'Compare the pitch track and spectrogram. Drag to select a range.' },
		{
			title: 'Real-time',
			text: 'Speak and watch your voice move across the map as you adjust it.'
		},
		{
			title: 'More detail',
			text: 'The user guide and an explanation of how the voice works are under {info}.'
		}
	],

	'card.eyebrow': 'KOENAMI · VOICE VERDICT',
	'card.male': 'Masculine −100',
	'card.center': '0',
	'card.female': 'Feminine +100',
	'card.male_refs': 'Masculine',
	'card.female_refs': 'Feminine',

	'result.title': 'Koenami · voice verdict',
	'result.description':
		'A voice verdict measured with Koenami: where this voice sits among feminine, masculine and in-between references.',
	'result.og_description': 'Where this voice sits among feminine and masculine references.',
	'result.share_description':
		'{text}. Where this voice sits among feminine and masculine references.',
	'result.window_title': 'Koenami · {verdict} ({leaning} {score})',
	'nav.guide': 'User guide',
	'nav.tutorial': 'How the voice works',
	'nav.method': 'Method and sources',
	'result.eyebrow': 'Verdict for this voice',
	'result.loading': 'Loading…',
	'result.age_label': 'Approximate perceived age: ',
	'result.age_note':
		'An estimate from an age-recognition model; not validated for Japanese voices or voices in training.',
	'result.try': 'Try it with your voice',
	'result.metrics_heading': 'The five measurements',
	'result.metrics_intro':
		'This voice against the middle 80% of the feminine and masculine reference speakers.',
	'result.col_metric': 'Measurement',
	'result.col_this': 'This voice',
	'result.col_female': 'Feminine references',
	'result.col_male': 'Masculine references',
	'result.notes_heading': 'How to read this verdict',
	'result.notes_p1':
		"The score is where this voice's five measurements fall along the contrast direction computed from the reference speakers (the direction that best separates feminine and masculine voices). The scale is linear: 0 is halfway between the masculine and feminine medians, −50 is the masculine median, +50 the feminine median, and the display runs from −100 to +100. +30 and above is called a feminine voice, −30 and below a masculine voice, and anything in between an in-between voice.",
	'result.notes_p2':
		'Any direction can be the goal: toward + for a feminine voice, toward − for a masculine voice, and toward 0 for a less gendered or androgynous voice.',
	'result.notes_li1':
		"It's a position computed from five acoustic measurements, not a measure of how listeners hear the voice. The same person's score changes with the text, the delivery, the microphone and the room.",
	'result.notes_li2':
		"The reference distribution isn't a population norm, and each language has its own references, so scores aren't comparable across languages.",
	'result.notes_li3':
		'Resonance and intonation are unstable on short or noisy recordings. Record the same sentence a few times and compare.',
	'result.notes_footer':
		'The calculation is described in <a href="/method.html" hreflang="ja">Method and sources</a> (Japanese). The version number (<span id="result-version">v1</span>) changes whenever the verdict method does.',
	'result.unavailable': "This result can't be shown",
	'result.no_params': 'This link contains no measurements.',
	'result.no_library': "Couldn't load the reference library.",
	'result.no_verdict': "Verdicts aren't available for this reference language.",
	'result.version_note':
		'This link was created with verdict method v{from} and has been recomputed with the current method (v{to}).',

	'manifest.name': 'Koenami · voice training for feminine and masculine voices',
	'manifest.description':
		'Record yourself imitating a reference voice and see how far you are from the voice you want.',
	'manifest.screenshot_wide':
		'The Koenami studio: voice map, five measurements, reference list and waveform',
	'manifest.screenshot_narrow': 'The studio on a phone',

	'api.busy': 'Try again in a moment.',
	'api.too_long': 'Choose audio no longer than one minute.',
	'api.no_audio': 'No audio received.',
	'api.too_short': 'Audio must be at least 0.25 seconds long.',
	'api.starting': 'The analysis server is starting up. Try again in a moment.'
} satisfies Catalogue;
