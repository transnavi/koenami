// Checks the shareable verdict against the built public libraries: node score_test.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scorer,parseResultParams,resultParams,verdictOf,shareText} from './web/score.js';
import {cardSVG} from './web/card.js';

const quantile=(values,q)=>{const s=[...values].sort((a,b)=>a-b);return s[Math.round(q*(s.length-1))];};
for(const lang of ['ja','zh-CN','en']){
 const scorer=new Scorer(JSON.parse(readFileSync(`.deploy/assets/public-api/${lang}.json`,'utf8')).clips);
 assert.ok(scorer.available,`${lang}: contrast axis`);
 for(const [group,anchor] of [['female',75],['male',25]]){
  const scores=scorer.speakers.filter(c=>c.group===group).map(c=>scorer.score(c.features).score);
  assert.ok(Math.abs(quantile(scores,.5)-anchor)<1.5,`${lang} ${group} median ${quantile(scores,.5)} ≈ ${anchor}`);
 }
 assert.ok(scorer.bands.female[0]>scorer.bands.male[1],`${lang}: central 80% bands do not overlap`);
 const own=scorer.speakers.find(c=>c.group==='female').features,result=scorer.score(own);
 const back=parseResultParams(resultParams(own,lang));
 assert.equal(back.lang,lang);
 assert.ok(Math.abs(scorer.score(back.features).score-result.score)<.2,'URL round trip keeps the score');
 assert.match(cardSVG(result,scorer),/<svg[^>]*width="1200"/);
}
const ko=new Scorer(JSON.parse(readFileSync('.deploy/assets/public-api/ko.json','utf8')).clips);
assert.equal(ko.available,false,'ko has too few labeled speakers for a verdict');
assert.equal(ko.score({f0:200,delta_f:1100,hnr:10,balance:-15,pitch_span:5}),null);
assert.deepEqual([verdictOf(80),verdictOf(50),verdictOf(20)],['female','androgynous','male']);
assert.equal(shareText({verdict:'male',display:22}),'私の声は男性的な声でした（女性度 22）');
assert.equal(parseResultParams(new URLSearchParams('v=1&l=ja&f0=abc')),null);
console.log('score_test: ok');
