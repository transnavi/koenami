import {finite} from './math.js';
import {Scorer,parseResultParams,shareText,formatScore,ageText,METRIC_KEYS,METRIC_DIGITS,metricLabel,metricUnit,verdictLabel,leaningLabel} from './score.js';
import {cardImage,intents,resultURL,systemShare,labelled} from './share.js';
import {t,lang as uiLang,home,LANGUAGES as languages} from './i18n/index.js';
'use strict';
const $=id=>document.getElementById(id);
const fmt=(v,n=0)=>finite(v)?v.toFixed(n):'—';
const LANGUAGES=new Set(languages);
function fail(message){$('result-verdict').textContent=t('result.unavailable');$('result-status').textContent=message;}
async function main(){
 const parsed=parseResultParams(new URLSearchParams(location.search));
 if(!parsed){fail(t('result.no_params'));return;}
 if(!LANGUAGES.has(parsed.lang)){fail(t('result.no_verdict'));return;}
 const library=await (await fetch(`/api/library?lang=${encodeURIComponent(parsed.lang)}`)).json().catch(()=>null);
 if(!library){fail(t('result.no_library'));return;}
 const scorer=new Scorer(library.clips),scored=scorer.score(parsed.features),result=scored&&{...scored,age:parsed.age};
 if(!result){fail(t('result.no_verdict'));return;}
 const url=resultURL(result.features,parsed.lang,location.origin,{age:result.age}),text=shareText(result,uiLang);
 if(finite(result.age)){$('result-age').querySelector('strong').textContent=ageText(result.age,uiLang);$('result-age').hidden=false;}
 document.title=t('result.window_title',{verdict:verdictLabel(result.verdict,uiLang),leaning:leaningLabel(result.verdict,uiLang),score:formatScore(result.display)});
 $('result-verdict').textContent=verdictLabel(result.verdict,uiLang);$('result-verdict').dataset.verdict=result.verdict;
 $('result-score').querySelector('strong').textContent=formatScore(result.display);$('result-score').querySelector('span').textContent=leaningLabel(result.verdict,uiLang);$('result-score').hidden=false;
 $('result-version').textContent=`v${result.version}`;if(parsed.version!==result.version)$('result-status').textContent=t('result.version_note',{from:parsed.version,to:result.version});$('result-try').href=home(parsed.lang);
 $('result-metric-rows').innerHTML=METRIC_KEYS.map(key=>{const bands=scorer.metricBands[key],n=METRIC_DIGITS[key],range=b=>t('help.band_range',{low:fmt(b[0],n),high:fmt(b[1],n)});return `<tr><td>${metricLabel(key,uiLang)} · ${metricUnit(key,uiLang)}</td><td>${fmt(result.features[key],n)}</td><td>${range(bands.female)}</td><td>${range(bands.male)}</td></tr>`;}).join('');
 $('result-metrics').hidden=false;$('result-notes').hidden=false;
 $('result-intents').replaceChildren(...intents(url,text).map(i=>{const a=document.createElement('a');a.href=i.href;a.target='_blank';a.rel='noopener noreferrer';a.innerHTML=labelled(i.icon,i.label);a.title=t('share.post_to',{name:i.label});return a;}));
 $('result-copy').onclick=async()=>{try{await navigator.clipboard.writeText(url);$('result-status').textContent=t('share.copied');}catch{$('result-status').textContent=url;}};
 let image=null;const render=async()=>image||(image=await cardImage(result,scorer,uiLang));
 $('result-save').onclick=async()=>{try{const file=await render();const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){$('result-status').textContent=e.message;}};
 if(navigator.share){const b=document.createElement('button');b.type='button';b.innerHTML=labelled('share',t('share.system'));b.onclick=()=>systemShare(result,scorer,parsed.lang,uiLang).catch(e=>{if(e.name!=='AbortError')$('result-status').textContent=e.message;});$('result-copy').before(b);}
 $('result-copy').innerHTML=labelled('link',t('share.copy'));$('result-save').innerHTML=labelled('image',t('share.save'));$('result-actions').hidden=false;
 try{const file=await render();const img=$('result-image');img.src=URL.createObjectURL(file);img.alt=t('share.image_alt',{text});img.hidden=false;}catch(e){$('result-status').textContent=e.message;}
}
main().catch(e=>fail(e.message));
