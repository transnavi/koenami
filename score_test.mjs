// Checks the shareable verdict against the built public libraries: node score_test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cardSVG } from './web/card.js';
import {
	Scorer,
	parseResultParams,
	resultParams,
	verdictOf,
	shareText,
	gateFailure,
	verdictLabel
} from './web/score.js';

const quantile = (values, q) => {
	const s = [...values].sort((a, b) => a - b);
	return s[Math.round(q * (s.length - 1))];
};
for (const lang of ['ja', 'zh-CN', 'en']) {
	const scorer = new Scorer(
		JSON.parse(readFileSync(`.deploy/assets/public-api/${lang}.json`, 'utf8')).clips
	);
	assert.ok(scorer.available, `${lang}: contrast axis`);
	for (const [group, anchor] of [
		['female', 25],
		['male', -25]
	]) {
		const scores = scorer.speakers
			.filter((c) => c.group === group)
			.map((c) => scorer.score(c.features).score);
		assert.ok(
			Math.abs(quantile(scores, 0.5) - anchor) < 1.5,
			`${lang} ${group} median ${quantile(scores, 0.5)} ≈ ${anchor}`
		);
	}
	assert.ok(
		scorer.bands.female[0] > scorer.bands.male[1],
		`${lang}: central 80% bands do not overlap`
	);
	const own = scorer.speakers.find((c) => c.group === 'female').features,
		result = scorer.score(own);
	const back = parseResultParams(resultParams(own, lang));
	assert.equal(back.lang, lang);
	assert.ok(
		Math.abs(scorer.score(back.features).score - result.score) < 0.2,
		'URL round trip keeps the score'
	);
	assert.match(cardSVG(result, scorer), /<svg[^>]*width="1200"/);
	assert.match(
		cardSVG(result, scorer, { lang: 'ko' }),
		/font-family="'Noto Sans KR', sans-serif"[\s\S]*여성적|남성적/
	);
	assert.match(cardSVG(result, scorer, { lang: 'en' }), /'Noto Sans JP'[\s\S]*VOICE VERDICT/);
}
const ko = new Scorer(JSON.parse(readFileSync('.deploy/assets/public-api/ko.json', 'utf8')).clips);
assert.equal(ko.available, false, 'ko has too few labeled speakers for a verdict');
assert.equal(ko.score({ f0: 200, delta_f: 1100, hnr: 10, balance: -15, pitch_span: 5 }), null);
assert.deepEqual([verdictOf(30), verdictOf(0), verdictOf(-30)], ['female', 'androgynous', 'male']);
assert.equal(
	shareText({ verdict: 'male', display: -28 }),
	'私の声は男性的な声でした（男性寄り −28）'
);
assert.equal(
	shareText({ verdict: 'androgynous', display: 0 }),
	'私の声は中間的な声でした（中間 0）'
);
assert.equal(
	shareText({ verdict: 'female', display: 28 }, 'en'),
	'My voice on Koenami: Feminine voice (leaning feminine +28)'
);
assert.equal(
	shareText({ verdict: 'male', display: -3 }, 'ko'),
	'내 목소리는 남성적인 목소리였습니다 (남성 쪽 −3)'
);
assert.equal(verdictLabel('androgynous', 'zh-CN'), '中间的声音');
assert.equal(parseResultParams(new URLSearchParams('v=1&l=ja&f0=abc')), null);
assert.equal(
	parseResultParams(new URLSearchParams('v=1&l=ja&f0=150')),
	null,
	'missing measurements are rejected, not read as 0'
);
console.log('score_test: ok');
assert.equal(
	gateFailure({
		voiced_seconds: 2,
		formant_seconds: 1,
		clipping_fraction: 0,
		resonance_sensitivity_pct: 3
	}),
	null
);
assert.equal(
	gateFailure({ voiced_seconds: 0.6, formant_seconds: 1, clipping_fraction: 0 }).label,
	'有声区間'
);
assert.equal(
	gateFailure({ voiced_seconds: 2, formant_seconds: 1, clipping_fraction: 0.02 }).need,
	'0.5 %以下'
);
assert.equal(
	gateFailure({ voiced_seconds: 0.6, formant_seconds: 1, clipping_fraction: 0 }, 'en').need,
	'1 s or more'
);
assert.equal(
	gateFailure({
		voiced_seconds: 2,
		formant_seconds: 1,
		clipping_fraction: 0,
		resonance_sensitivity_pct: 20
	}).label,
	'響きの推定のぶれ'
);
console.log('gate: ok');
const withAge = parseResultParams(
	resultParams({ f0: 200, delta_f: 1100, hnr: 10, balance: -15, pitch_span: 5 }, 'ja', {
		age: 26.4
	})
);
assert.equal(withAge.age, 26, 'age travels rounded');
assert.equal(
	parseResultParams(
		resultParams({ f0: 200, delta_f: 1100, hnr: 10, balance: -15, pitch_span: 5 }, 'ja')
	).age,
	undefined,
	'no age unless chosen'
);
assert.equal(
	parseResultParams(new URLSearchParams('v=1&l=ja&f0=200&df=1100&hnr=10&bal=-15&sp=5&age=250')).age,
	undefined,
	'implausible age ignored'
);
console.log('age: ok');
