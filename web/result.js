import {finite} from './math.js';
import {Scorer,parseResultParams,shareText,METRIC_KEYS,METRIC_LABELS,METRIC_UNITS,METRIC_DIGITS,VERDICTS} from './score.js';
import {cardImage,intents,resultURL,systemShare} from './share.js';
'use strict';
const $=id=>document.getElementById(id);
const fmt=(v,n=0)=>finite(v)?v.toFixed(n):'—';
const LANGUAGES=new Set(['ja','zh-CN','en','ko']);
function fail(message){$('result-verdict').textContent='この結果は表示できません';$('result-status').textContent=message;}
async function main(){
 const parsed=parseResultParams(new URLSearchParams(location.search));
 if(!parsed||!LANGUAGES.has(parsed.lang)){fail('リンクに測定値が含まれていません。');return;}
 const library=await (await fetch(`/api/library?lang=${encodeURIComponent(parsed.lang)}`)).json().catch(()=>null);
 if(!library){fail('見本の一覧を読み込めませんでした。');return;}
 const scorer=new Scorer(library.clips),result=scorer.score(parsed.features);
 if(!result){fail('この言語の見本では判定を計算できません。');return;}
 const url=resultURL(result.features,parsed.lang),text=shareText(result);
 document.title=`Koenami · ${VERDICTS[result.verdict]}（女性度 ${result.display}）`;
 $('result-verdict').textContent=VERDICTS[result.verdict];$('result-verdict').dataset.verdict=result.verdict;
 $('result-score').querySelector('strong').textContent=String(result.display);$('result-score').hidden=false;
 $('result-version').textContent=`v${result.version}`;$('result-try').href=`/${parsed.lang}/`;
 $('result-metric-rows').innerHTML=METRIC_KEYS.map(key=>{const bands=scorer.metricBands[key],n=METRIC_DIGITS[key],range=b=>`${fmt(b[0],n)}〜${fmt(b[1],n)}`;return `<tr><td>${METRIC_LABELS[key]} · ${METRIC_UNITS[key]}</td><td>${fmt(result.features[key],n)}</td><td>${range(bands.female)}</td><td>${range(bands.male)}</td></tr>`;}).join('');
 $('result-metrics').hidden=false;$('result-notes').hidden=false;
 $('result-intents').replaceChildren(...intents(url,text).map(i=>{const a=document.createElement('a');a.href=i.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${i.label}に投稿`;return a;}));
 $('result-copy').onclick=async()=>{try{await navigator.clipboard.writeText(url);$('result-status').textContent='リンクをコピーしました。';}catch{$('result-status').textContent=url;}};
 let image=null;const render=async()=>image||(image=await cardImage(result,scorer));
 $('result-save').onclick=async()=>{try{const file=await render();const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){$('result-status').textContent=e.message;}};
 if(navigator.share){const b=document.createElement('button');b.type='button';b.textContent='共有…';b.onclick=()=>systemShare(result,scorer,parsed.lang).catch(e=>{if(e.name!=='AbortError')$('result-status').textContent=e.message;});$('result-copy').before(b);}
 $('result-actions').hidden=false;
 try{const file=await render();const img=$('result-image');img.src=URL.createObjectURL(file);img.alt=`${text}。5つの指標と見本の分布を描いた画像。`;img.hidden=false;}catch(e){$('result-status').textContent=e.message;}
}
main().catch(e=>fail(e.message));
