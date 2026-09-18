import type { Catalogue } from './ja';

/* English. Same keys as ja.js; {n} strings with {one, other} pick a form by count. */
export default {
	'page.title': 'Koenami · voice training for feminine and masculine voices',
	'page.description':
		'A free voice training tool for anyone working toward a feminine or masculine voice: people who want both, transgender people, and anyone curious about a voice they do not have yet. Pick a reference voice, record while imitating it, and see your own voice in the same acoustic space, with the distance to the voice you are aiming for. Real-time measurement included.',
	'page.browser_requirements': 'A browser with microphone access',
	'page.publisher': 'とらんすナビ',

	'toolbar.language': 'Language (interface and references)',
	'toolbar.guide': 'Screen guide',
	'toolbar.share': 'Share the verdict',
	'toolbar.settings': 'Settings',
	'toolbar.info': 'Sources and related tools',
	'toolbar.theme': 'Switch light and dark',

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
		'Standardized distance to the reference across the five measurements; 0 means equal. Opens the comparison report.',
	'verdict.heading': 'Voice verdict',
	'verdict.end_male': 'Masculine −100',
	'verdict.end_center': '0',
	'verdict.end_female': 'Feminine +100',

	'graph.aria': 'Voice comparison',
	'graph.canvas_aria':
		'Voice map. Scroll to zoom, drag to rotate, Shift+drag to pan. The outline is the central 80% of a 1.2-second moving median.',
	'graph.projection_variance': 'Principal',
	'graph.projection_variance_title':
		'Axes follow the directions of greatest overall spread (principal component analysis). Feminine and masculine labels play no part.',
	'graph.projection_contrast': 'Contrast',
	'graph.projection_contrast_title':
		'The horizontal axis is the direction that separates feminine and masculine references the most, computed from the labeled references.',
	'graph.auto_rotate': 'Auto-rotate',
	'graph.auto_rotate_title': 'Toggle the 3D auto-rotation',
	'graph.space_label': 'Voice map',
	'graph.space_title': 'Principal component space of the five measurements',
	'graph.space_title_contrast':
		'Computed from the five measurements. The horizontal axis is the direction that separates feminine and masculine voices the most.',
	'graph.zoom_in': 'Zoom in',
	'graph.zoom_out': 'Zoom out',
	'graph.find_me': 'Fit the view to the voices',
	'graph.reset': 'Reset the view',
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
	'signal.both_title_on':
		'Each selection is stretched to 0–100% of its length. Word positions do not line up.',
	'signal.words': 'Words',
	'signal.words_title': 'Transcribe and split into words',
	'signal.range_reset': 'Clear the selection',
	'signal.range_reset_title': 'Clear the selection (Esc)',
	'signal.canvas_aria':
		'Click the waveform to seek, drag to select a range. Left and right arrow keys move the playback position. Click the pitch scale to switch between Hz and note names.',
	'signal.word_list_aria': 'Estimated word positions',
	'signal.word_title': '{start}–{end}s · estimated position',

	'samples.aria': 'Reference audio',
	'samples.browser_aria': 'Choose a reference',
	'samples.heading': 'Reference voices',
	'samples.add': 'Import reference audio',
	'samples.group_aria': 'Kind of reference',
	'samples.sort_aria': 'Sort order',
	'sort.name': 'By speaker name',
	'sort.near': 'Closest to your voice',
	'sort.low': 'Lowest pitch first',
	'sort.high': 'Highest pitch first',
	'samples.search': 'Search',
	'samples.search_aria': 'Search references',
	'samples.more': 'Show more',
	'lab.teacher': 'Teacher',
	'lab.pitch': 'Pitch',
	'lab.pitch_aria': "Teacher's pitch",
	'lab.resonance': 'Resonance',
	'lab.resonance_aria': "Teacher's resonance",
	'lab.weight': 'Weight',
	'lab.weight_aria': "Teacher's vocal weight",
	'lab.low': 'Low',
	'lab.med': 'Middle',
	'lab.high': 'High',
	'lab.light': 'Light',
	'lab.heavy': 'Heavy',
	'jvs.banner_title': 'Add the JVS references',
	'jvs.banner_count': '100 speakers · 5,000 clips',
	'jvs.download': 'Download ↗',
	'jvs.download_title': 'Official JVS release (ZIP, about 3.5 GB)',
	'jvs.import': 'Import',
	'jvs.added': { one: '{n} clip imported', other: '{n} clips imported' },
	'jvs.cancelled': 'Import stopped. The clips imported so far are kept.',
	'jvs.index_failed': 'The JVS index could not be fetched.',
	'jvs.audio_missing': 'The JVS audio is missing. Import it again.',
	'jvs.no_match':
		'No matching JVS audio was found. Choose the official ZIP or the folder it unpacks to.',
	'jvs.quota':
		'Not enough storage. Choosing one speaker folder at a time imports a part of the corpus.',
	'jvs.size_mismatch': 'An audio file has an unexpected size.',
	'jvs.hash_mismatch': 'A file does not match the official audio. Choose the official ZIP again.',

	'target.aria': 'Selected reference',
	'target.play': 'Play the reference',
	'target.pause': 'Pause the reference',
	'target.pick': 'Choose a reference',
	'target.favorite': 'Favorite',
	'target.favorite_add': 'Add the reference to favorites',
	'target.source': 'Source',
	'target.seek_aria': 'Reference playback position',
	'target.meta_synthetic': 'synthetic voice',
	'target.analysis_error': 'Reference analysis: {message}',
	'favorite.add': 'Add to favorites',
	'favorite.remove': 'Remove from favorites',
	'favorite.add_clip': 'Add {name} to favorites',
	'favorite.remove_clip': 'Remove {name} from favorites',
	'favorite.marked': 'Has favorites',

	'record.title': 'Record (R)',
	'record.aria': 'New recording',
	'record.stop': 'Stop recording',
	'record.stop_title': 'Stop recording (R)',
	'play.label': 'Play',
	'play.own': 'Play your voice',
	'play.own_title': 'Play your voice (Space)',
	'play.own_pause': 'Pause your voice',
	'takes.menu': 'Recordings',
	'takes.retry': 'Analyze again',
	'takes.default_name': 'Recording {n}',
	'live.label': 'Real-time',
	'live.measuring': 'Measuring',
	'live.title': 'Plot the microphone in real time',
	'live.start': 'Start real-time measurement',
	'live.stop': 'Stop real-time measurement',
	'live.stop_title': 'Stop real-time measurement (Esc)',
	'loopback.aria': 'Hear your own voice',
	'loopback.title': 'Hear your own voice (headphones recommended)',
	'loopback.stop': 'Stop hearing your own voice',
	'speed.aria': 'Playback speed',
	'speed.reset': 'Back to normal speed',
	'ab.title': 'Play the reference, then your voice',
	'upload.title': 'Load an audio file',
	'state.recording': 'Recording',
	'state.preparing': 'Preparing',
	'state.analyzing': 'Analyzing',

	'import.heading': 'Add a reference',
	'import.audio': 'Choose an audio file',
	'import.jvs_heading': 'Add JVS',
	'import.jvs_site': 'Download from the official site ↗',
	'import.jvs_hint':
		'Choose the official ZIP or the folder it unpacks to. Adds 100 speakers and 5,000 clips.',
	'import.zip': 'Choose ZIP',
	'import.folder': 'Choose folder',
	'import.progress_aria': 'JVS import',
	'import.cancel': 'Stop',
	'import.terms':
		'Use of the audio follows the JVS terms. Imported references are stored in this browser.',

	'settings.heading': 'Settings',
	'settings.theme': 'Colors',
	'theme.light': 'Light',
	'theme.dark': 'Dark',
	'theme.system': 'Follow the device',
	'settings.live_window': 'Real-time analysis window',
	'settings.live_shape': 'Real-time trail length',
	'settings.seconds': '{n} s',
	'settings.normalize': 'Match playback volume',
	'settings.export': 'Export measurements',
	'settings.takes': 'Recordings',
	'settings.download_all': 'Download all',
	'settings.delete_all': 'Delete all',

	'info.about1':
		'A voice training tool for anyone working toward a feminine or masculine voice: people who want both, transgender people, and anyone curious about a voice they do not have yet. Pick a reference voice and record while imitating it; your voice appears in the same acoustic space, and you can see how close you are to the voice you are aiming for. Real-time measurement shows which way your voice moves while you adjust it.',
	'info.about2':
		'The references cover Japanese, Mandarin, English and Korean. Koenami is free and open source, and recordings stay in your browser. Voice training tutorials, analysis from the angles of phonetics, vocal pedagogy, acoustics and anatomy, and evaluation closer to how listeners hear a voice are planned.',
	'info.guide': 'How to use (Japanese) ↗',
	'info.tutorial': 'How the voice works, a practice guide (Japanese) ↗',
	'info.method': 'Method and sources (Japanese) ↗',
	'info.references': 'References (Japanese) ↗',
	'info.source': 'Source code (GitHub) ↗',
	'info.colors': 'Colors follow',

	'rename.heading': 'Rename',
	'rename.aria': 'Recording name',
	'rename.empty': 'Enter a name.',
	'rename.failed': 'The recording could not be renamed. Try again.',
	'report.heading': 'Comparison',
	'report.save': 'Save the report',
	'metric.factors': 'What changes it',
	'metric.caveats': 'Caveats',

	'share.heading': 'Voice verdict',
	'share.help': 'How to read the verdict',
	'share.age_label': 'Rough perceived age',
	'share.age_run': 'Estimate',
	'share.age_running': 'Estimating…',
	'share.age_include': 'Include in the image and link',
	'share.age_note':
		'A reference value from an age estimation model (audEERING). Whether it matches how old a Japanese voice, or a voice in training, sounds has not been checked. The audio is sent only for this estimate and is not stored.',
	'share.age_value': '{age} (4-second windows: {low}–{high})',
	'share.age_years': 'about {n}',
	'share.group_aria': 'Share the result',
	'share.system': 'Share…',
	'share.copy': 'Copy link',
	'share.copied': 'Link copied.',
	'share.save': 'Save image',
	'share.open': 'Result page',
	'share.post_to': 'Post to {name}',
	'share.image_alt': '{text}. An image of the five measurements and the reference distribution.',
	'share.history': 'Verdict over time',
	'share.history_sub': 'recordings on this device',
	'share.history_aria': 'Verdict of each recording over time',
	'share.history_note':
		'Older recordings did not store the verdict conditions (voiced duration and the rest), so they are shown without that check.',
	'share.note':
		'The link carries only the five measurements; the recording is not sent. <a href="/method.html" target="_blank" hreflang="ja">Method and sources</a> (Japanese) explains how to read the verdict.',
	'share.unavailable': 'The references in this language cannot give a verdict',
	'share.text': 'My voice on Koenami: {verdict} ({leaning} {score})',
	'share.image_failed': 'The image could not be created.',
	'history.current': 'Shown',
	'history.open': 'Open',
	'history.open_title': 'Show this recording',

	'metric.f0.label': 'Pitch',
	'metric.f0.unit': 'Hz',
	'metric.f0.description':
		'How fast the vocal folds vibrate: the median fundamental frequency (F0) of voiced speech. Higher values mean a higher voice. The band marks the central 80% of the reference group.',
	'metric.f0.factors': [
		'Vocal fold tension (how the laryngeal muscles are used) and vocal fold mass',
		'Larynx height, airflow and strain',
		'Sentence type and emotion; questions and emphasis raise it'
	],
	'metric.f0.caveats': [
		'Pitch alone does not settle how a voice is gendered. At the same pitch, resonance changes the impression (<a href="https://doi.org/10.5112/jjlp.50.14" target="_blank" rel="noreferrer">Sakuraba et al. 2009</a>).',
		'Breath noise and machine hum produce extreme values. Keep 10–20 cm from the microphone and try a quiet room.'
	],
	'metric.delta_f.label': 'Resonance',
	'metric.delta_f.unit': 'Hz ΔF',
	'metric.delta_f.description':
		'The formant spacing estimated from the first four formants. Larger values tend to go with a smaller vocal tract and a brighter sound. Vowels change it too, so the same words compare best.',
	'metric.delta_f.factors': [
		'Larynx height (raising it shortens the vocal tract and raises the value)',
		'Mouth opening, tongue position and lip shape',
		'The vowel: "ee" and "ah" differ a lot in the same person'
	],
	'metric.delta_f.caveats': [
		'An estimate. It is unstable on short or noisy recordings and moves with the analysis settings.',
		'A difference in vowels can look like a difference in resonance. Compare the same words, ideally the same vowels.'
	],
	'metric.hnr.label': 'Texture',
	'metric.hnr.unit': 'dB',
	'metric.hnr.description':
		'The ratio of periodic to noise components in the voice (HNR). Low values can come with breathiness or roughness, but recording noise lowers them as well. It does not measure vocal weight directly.',
	'metric.hnr.factors': [
		'Breathiness (how the vocal folds close)',
		'Roughness and rasp',
		'Recording noise; a noisy room lowers it'
	],
	'metric.hnr.caveats': [
		'Not a measure of vocal weight or thickness.',
		'A reference recorded in a quiet room compared with your own noisy recording reads lower by the noise alone.'
	],
	'metric.balance.label': 'Brightness',
	'metric.balance.unit': 'dB',
	'metric.balance.description':
		'The energy between 1,000 and 4,000 Hz relative to 100 to 1,000 Hz. Higher values mean more high-frequency content. Vowels, airflow and the microphone all affect it.',
	'metric.balance.factors': [
		'Mouth opening and tongue position',
		'Airflow and how the vocal folds close',
		"Microphone position and character, and the browser's audio processing"
	],
	'metric.balance.caveats': [
		'Strongly equipment-dependent. Recordings made under different conditions are hard to compare.',
		'Better suited to watching your own recordings change on the same equipment than to comparing with a reference.'
	],
	'metric.pitch_span.label': 'Intonation',
	'metric.pitch_span.unit': 'st',
	'metric.pitch_span.description':
		'The width of the 10th to 90th percentile of pitch. It relates to a feminine impression in some settings, but larger is not better. Japanese pitch accent, Mandarin tones, sentence type and emotion all change it. The standard deviation and pauses are in the report.',
	'metric.pitch_span.factors': [
		'Sentence type and emotion',
		'The language: Japanese pitch accent and Mandarin tones widen or narrow it',
		'Recording length; longer recordings tend to span more'
	],
	'metric.pitch_span.caveats': [
		'Larger is not better.',
		'Recordings of different lengths compare poorly; use the same sentence or a short phrase.'
	],
	'verdict.help.label': 'Voice verdict',
	'verdict.help.description':
		'The position of the five measurements along the direction that separates feminine and masculine references the most (the contrast axis). 0 is exactly halfway between the two medians, −50 is the masculine median and +50 the feminine median.',
	'verdict.help.factors': [
		'All five measurements above; pitch and resonance weigh the most',
		'The reference language. References differ by language, so numbers do not compare across languages'
	],
	'verdict.help.caveats': [
		'A position among acoustic measurements, not a listener rating; it is not calibrated.',
		'Unstable on short or noisy recordings. Record the same sentence a few times and compare.',
		'Either direction, and moving toward 0, counts as a goal.'
	],
	'indicator.title': '{label}: you {own} {unit} · reference {ref} {unit}',
	'help.own': 'You',
	'help.reference': 'Selected reference',
	'help.band': '{group} · central 80%',
	'help.speakers': 'Reference speakers',
	'help.male_band': 'Masculine references · central 80%',
	'help.female_band': 'Feminine references · central 80%',
	'help.band_range': '{low} to {high}',

	'corpus.clips': { one: '{n} clip', other: '{n} clips' },
	'corpus.speakers': { one: '{n} speaker', other: '{n} speakers' },
	'corpus.count': '{clips} · {speakers}',

	'quality.no_voice': 'No voice was detected. Check the microphone input.',
	'quality.longer': 'Speak a little longer.',
	'quality.resonance': 'Resonance could not be measured reliably.',
	'quality.waiting': 'Waiting for speech…',
	'verdict.unavailable': 'Not available in this language',
	'verdict.record': 'Record to see it',
	'verdict.analyzing': 'Analyzing',
	'verdict.not_yet': 'No verdict yet',
	'verdict.gate': '{label} {value} (needs {need})',
	'verdict.female': 'Feminine voice',
	'verdict.androgynous': 'Voice in between',
	'verdict.male': 'Masculine voice',
	'leaning.female': 'leaning feminine',
	'leaning.androgynous': 'in the middle',
	'leaning.male': 'leaning masculine',
	'gate.voiced_seconds': 'Voiced speech',
	'gate.formant_seconds': 'Stable resonance',
	'gate.clipping_fraction': 'Clipping',
	'gate.resonance_sensitivity_pct': 'Resonance estimate swing',
	'gate.seconds': 's',
	'gate.none': 'No measurement',
	'gate.min': '{value} {unit} or more',
	'gate.max': '{value} {unit} or less',

	'report.pitch_sd_hz': 'Pitch standard deviation · Hz',
	'report.pitch_sd_st': 'Pitch standard deviation · st',
	'report.quiet_pct': 'Silence · %',
	'report.quiet_mean': 'Mean silent stretch · s',
	'report.pace': 'Speaking rate · {unit}',
	'report.note_pitch':
		'The reference is {diff} semitones {direction} than you. Slow the playback down and try the same sentence at a pitch that stays comfortable.',
	'report.higher': 'higher',
	'report.lower': 'lower',
	'report.note_resonance':
		'Estimated resonance: you {own}, reference {ref} Hz ΔF. Pick the same vowel or a short word and listen for the difference in resonance while holding the pitch.',
	'report.note_intonation':
		'Intonation also depends on the language and the sentence. Read the same text and compare the accent, the sentence endings and the pauses.',
	'report.distance_caption': 'Acoustic distance to the reference · 0 means equal',
	'report.distance_note':
		'A standardized distance across pitch, resonance, texture, brightness and intonation. It does not rate femininity or naturalness.',
	'report.share':
		'Difference between the two voices: {shown}% shown in the map · {omitted}% omitted',
	'report.share_note':
		'The squared five-dimensional difference, split into the directions the map shows and the ones it leaves out. Voices that overlap in the map can still differ in the omitted directions.',
	'report.col_metric': 'Measurement',
	'report.col_own': 'You',
	'report.col_ref': 'Reference',
	'report.col_band': 'Central 80% of references',
	'report.footer': '{name} · {duration} · reference {reference}',
	'report.languages': 'Recording language {own} · reference language {ref}',
	'report.density':
		'Density rank within the {group} reference distribution: {percentile}th percentile (not a listener rating).',
	'report.projection':
		'The map projects five dimensions onto {dimension}. It shows {variance}% of the variance; the measurements on the left cover the omitted directions.',
	'report.file_title': 'Voice comparison',
	'report.method_link': 'Research behind the measurements',

	'notice.imported': 'Audio loaded.',
	'notice.take_deleted': 'Recording deleted.',
	'notice.zipped': { one: '{n} recording zipped.', other: '{n} recordings zipped.' },
	'notice.deleted_all': { one: '{n} recording deleted.', other: '{n} recordings deleted.' },
	'confirm.delete_all': {
		one: 'Delete the {n} saved recording? This cannot be undone.',
		other: 'Delete all {n} saved recordings? This cannot be undone.'
	},
	'error.load': 'Could not load: {message}',
	'error.playback': 'Playback failed. Choose another clip.',
	'error.replay': 'Playback failed.',
	'error.ab_wait': 'Wait until both clips have loaded.',
	'error.words_first': 'Load audio first.',
	'error.file_size': 'Choose an audio file under 150 MB.',
	'error.duration': 'Choose audio between 0.25 seconds and 15 minutes long.',
	'error.too_long': {
		one: 'Choose audio no longer than {n} minute.',
		other: 'Choose audio no longer than {n} minutes.'
	},
	'error.too_short': 'Record at least 0.25 seconds.',
	'error.mic_denied': 'Allow this page to use the microphone in the browser settings.',
	'error.take_save': 'The recording could not be saved. Download any audio you need.',
	'error.take_save_retry':
		'The recording could not be saved. Download the audio, then check the storage space.',
	'error.take_kept': 'The recording is kept. It can be analyzed again from the recordings menu.',
	'error.take_load': 'This recording could not be loaded.',
	'error.take_delete': 'The recording could not be deleted. Try again.',
	'error.no_takes': 'There are no saved recordings.',
	'error.favorite_save': 'The favorites could not be saved.',
	'error.reference_save': 'The reference audio could not be saved.',

	'action.play': 'Play',
	'action.stop': 'Stop',
	'action.rename': 'Rename',
	'action.download': 'Download',
	'action.delete': 'Delete',
	'action.label': '{action} {name}',

	'tour.later': 'Later',
	'tour.later_title': 'Pause and continue next time',
	'tour.skip': 'Skip',
	'tour.skip_title': 'Close the guide',
	'tour.back': 'Back',
	'tour.next': 'Next',
	'tour.start': 'Start',
	'tour.steps': [
		{
			title: 'Welcome to Koenami',
			text: 'Record while imitating a reference voice and see the difference. This walk through the main parts of the screen takes about a minute.\nSkip it if you like; {help} at the top right brings it back any time.'
		},
		{
			title: 'Selected reference',
			text: 'Play the selected reference with {play} and mark it as a favorite with {star}.'
		},
		{
			title: 'Reference list',
			text: 'Filter by kind of voice, sort, and find the voice you want to get closer to.'
		},
		{ title: 'Recording', text: 'Start recording with {mic} or {R}; press again to stop.' },
		{
			title: 'Voice profile',
			text: 'Pitch, resonance, texture, brightness and intonation, yours next to the reference.'
		},
		{
			title: 'Voice map',
			text: 'A map of the reference voices. It shows how close your voice is to the reference.'
		},
		{ title: 'Waveform', text: 'Compare the pitch track and spectrogram. Drag to select a range.' },
		{ title: 'Real-time', text: 'Speak and watch your voice move on the map while you adjust it.' },
		{
			title: 'More detail',
			text: 'The guide and the explanation of how the voice works open from {info}.'
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
	'nav.guide': 'How to use',
	'nav.tutorial': 'How the voice works',
	'nav.method': 'Method and sources',
	'result.eyebrow': 'Verdict for this voice',
	'result.loading': 'Loading…',
	'result.age_label': 'Rough perceived age: ',
	'result.age_note':
		'A reference value from an age estimation model, unverified for Japanese voices and voices in training.',
	'result.try': 'Measure your own voice',
	'result.metrics_heading': 'The five measurements',
	'result.metrics_intro':
		'This voice next to the central 80% of the reference speakers (feminine and masculine).',
	'result.col_metric': 'Measurement',
	'result.col_this': 'This voice',
	'result.col_female': 'Feminine references',
	'result.col_male': 'Masculine references',
	'result.notes_heading': 'How to read this verdict',
	'result.notes_p1':
		"The number is the position of this voice's five measurements along the contrast direction computed from the reference speakers (the direction that separates feminine and masculine voices the most). On a linear scale, 0 is exactly halfway between the masculine and feminine medians, −50 is the masculine median and +50 the feminine median; the display runs from −100 to +100. +30 and above is called a feminine voice, −30 and below a masculine voice, and the range between a voice in between.",
	'result.notes_p2':
		'Either direction is a goal. Aim for + for a feminine voice, − for a masculine voice, and toward 0 for a voice that reads as neither.',
	'result.notes_li1':
		'It is a position among five acoustic measurements, not a measure of how listeners hear the voice. The same person moves with the text, the delivery, the microphone and the room.',
	'result.notes_li2':
		'The reference distribution is not a population norm. References differ by language, so numbers do not compare across languages.',
	'result.notes_li3':
		'Resonance and intonation are unstable on short or noisy recordings. Record the same sentence a few times and compare.',
	'result.notes_footer':
		'The calculation is described in <a href="/method.html" hreflang="ja">Method and sources</a> (Japanese). This number (<span id="result-version">v1</span>) changes whenever the verdict method changes.',
	'result.unavailable': 'This result cannot be shown',
	'result.no_params': 'The link carries no measurements.',
	'result.no_library': 'The reference library could not be loaded.',
	'result.no_verdict': 'The references in this language cannot give a verdict.',
	'result.version_note':
		'This link was made with verdict method v{from}. It has been recomputed with the current method (v{to}).',

	'manifest.name': 'Koenami · voice training for feminine and masculine voices',
	'manifest.description':
		'Record while imitating a reference voice and see the distance to the voice you are aiming for.',
	'manifest.screenshot_wide':
		'The Koenami studio: voice map, five measurements, reference list and waveform',
	'manifest.screenshot_narrow': 'The studio on a phone',

	'api.busy': 'Wait a moment and try again.',
	'api.too_long': 'Choose audio no longer than one minute.',
	'api.no_audio': 'No audio was sent.',
	'api.too_short': 'Use audio of at least 0.25 seconds.',
	'api.starting': 'The analysis server is starting. Wait a moment and try again.'
} satisfies Catalogue;
