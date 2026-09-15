import {TakeStore} from './storage.js';

const finite=Number.isFinite;
export const RATING_FIELDS=[
 {key:'femininity',label:'女性らしさ',ends:['感じない','強く感じる'],max:6},
 {key:'masculinity',label:'男性らしさ',ends:['感じない','強く感じる'],max:6},
 {key:'naturalness',label:'自然さ',ends:['不自然','自然'],max:6},
 {key:'japanese',label:'日本語の母語話者らしさ',ends:['感じない','強く感じる'],max:6},
 {key:'age',label:'聞こえる年齢',ends:['10歳','90歳'],min:10,max:90},
];
export function cosineDistance(a,b){if(a?.length!==512||b?.length!==512)return Infinity;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?Math.max(0,1-dot/Math.sqrt(aa*bb)):Infinity;}

const distanceMemo=new WeakMap();
function cachedDistance(a,b){if(!a||!b)return Infinity;let row=distanceMemo.get(a);if(!row){row=new WeakMap();distanceMemo.set(a,row);}if(!row.has(b))row.set(b,cosineDistance(a,b));return row.get(b);}

// One neighbour per speaker prevents prolific speakers dominating the estimate.
function neighbours(rows,vector,key,excludeSpeaker){
 const speakers=new Map();
 for(const row of rows){if(row.speaker===excludeSpeaker)continue;const distance=cachedDistance(vector,row.descriptor?.embedding);if(!finite(distance))continue;const previous=speakers.get(row.speaker);if(!previous||distance<previous.distance)speakers.set(row.speaker,{distance,value:row.ratings[key]});}
 const nearest=[...speakers.values()].sort((a,b)=>a.distance-b.distance).slice(0,5);
 let sum=0,weight=0;for(const n of nearest){const w=1/(.015+n.distance)**2;sum+=n.value*w;weight+=w;}return weight?sum/weight:null;
}
export function personalEstimate(all,target,key){
 const rows=all.filter(r=>r.speaker!==target.speaker&&r.language===target.language&&r.descriptor?.version===target.descriptor?.version&&r.descriptor?.embedding?.length===512&&finite(r.ratings?.[key]));
 const speakers=[...new Set(rows.map(r=>r.speaker))];
 if(speakers.length<8)return {ready:false,speakers:speakers.length,reason:'few'};
 const error=[],baseline=[];
 for(const speaker of speakers){const held=rows.filter(r=>r.speaker===speaker),train=rows.filter(r=>r.speaker!==speaker);
  const means=[...new Set(train.map(r=>r.speaker))].map(s=>{const values=train.filter(r=>r.speaker===s).map(r=>r.ratings[key]);return values.reduce((a,b)=>a+b,0)/values.length;});const mean=means.reduce((a,b)=>a+b,0)/means.length;
  error.push(held.reduce((a,r)=>a+Math.abs(neighbours(train,r.descriptor.embedding,key)-r.ratings[key]),0)/held.length);
  baseline.push(held.reduce((a,r)=>a+Math.abs(mean-r.ratings[key]),0)/held.length);
 }
 const mae=error.reduce((a,b)=>a+b,0)/error.length,base=baseline.reduce((a,b)=>a+b,0)/baseline.length;
 if(mae>=base||base===0)return {ready:false,speakers:speakers.length,reason:'validation',mae,baseline:base};
 const estimate=neighbours(rows,target.descriptor?.embedding,key,target.speaker);
 return {ready:finite(estimate),estimate,mae,baseline:base,speakers:speakers.length};
}

const $=id=>document.getElementById(id);
export function setupPerception({context,request,play,next,notify,download}){
 let rows=[],subject=null,draft={},token=0,busy=false,loaded=false,controller=null,descriptors=new Map(),estimateCache=new Map();
 async function refresh(){const saved=await TakeStore.read('listener-ratings');if(saved!==undefined&&!Array.isArray(saved))throw Error('Invalid ratings');rows=saved||[];loaded=true;estimateCache.clear();for(const row of rows)if(row.descriptor?.version==='wavlm-sv-int8-v2')descriptors.set(row.key,row.descriptor);}
 const ready=refresh().catch(()=>{loaded=false;});
 const estimates=$('perception-dialog').querySelector('.rating-details');
 const changed=updated=>{rows=updated;estimateCache.clear();};
 window.addEventListener('koenami-recording-deleted',e=>{changed(rows.filter(r=>r.key!=='own:'+e.detail));descriptors.delete('own:'+e.detail);if(subject?.key==='own:'+e.detail){++token;controller?.abort();subject=null;draft={};$('rating-fields').hidden=true;$('rating-save').hidden=true;$('rating-listen').disabled=true;$('rating-title').textContent='音声を選んでください';$('rating-status').textContent='';draw();}});
 const fields=()=>RATING_FIELDS.filter(f=>f.key!=='japanese'||subject?.language==='ja');
 function enable(){for(const id of ['rating-save','rating-next','rating-delete'])$(id).disabled=busy||!loaded;}
 function draw(){
  $('rating-fields').replaceChildren();
  for(const f of fields()){
   const row=document.createElement('div');row.className='rating-row';
   const title=document.createElement('div');title.className='rating-label';
   const label=document.createElement('label');label.htmlFor='rating-input-'+f.key;label.textContent=f.label;
   const value=document.createElement('output');value.htmlFor=label.htmlFor;
   const show=()=>{value.textContent=finite(draft[f.key])?String(draft[f.key])+(f.key==='age'?'歳':' / 6'):'未評価';};show();
   const slider=document.createElement('input');slider.id=label.htmlFor;slider.type='range';slider.min=f.min||0;slider.max=f.max;slider.step=1;slider.value=draft[f.key]??(f.key==='age'?35:3);slider.dataset.rating=f.key;slider.setAttribute('aria-valuetext',value.textContent);slider.classList.toggle('unrated',!finite(draft[f.key]));
   slider.oninput=()=>{draft[f.key]=+slider.value;show();slider.setAttribute('aria-valuetext',value.textContent);slider.classList.remove('unrated');};
   const clear=document.createElement('button');clear.type='button';clear.className='text-button';clear.textContent='×';clear.setAttribute('aria-label',f.label+'の評価を消す');clear.onclick=()=>{delete draft[f.key];show();slider.classList.add('unrated');slider.setAttribute('aria-valuetext',value.textContent);slider.focus();};
   const ends=document.createElement('span');ends.className='rating-ends';for(const s of f.ends){const span=document.createElement('span');span.textContent=s;ends.append(span);}
   title.append(label,value,clear);row.append(title,slider,ends);$('rating-fields').append(row);
  }
  $('rating-delete').hidden=!rows.some(r=>r.key===subject?.key);renderEstimates();
 }
 function renderEstimates(){
  const el=$('rating-estimates');el.replaceChildren();if(!subject||!estimates.open)return;
  const descriptor=descriptors.get(subject.key);if(!descriptor)return;
  const age=descriptor.age?.estimate;
  if(finite(age)&&age>=0&&age<=100){const p=document.createElement('p');p.textContent='年齢モデルの参考値：約'+Math.round(age/5)*5+'歳';
   const small=document.createElement('small');small.textContent='申告された年齢・年代などで学習したモデルです。日本語の「聞こえる年齢」との一致は未検証です。';p.append(small);el.append(p);}
  for(const field of fields()){
   const key=subject.key+':'+field.key;
   if(!estimateCache.has(key))estimateCache.set(key,personalEstimate(rows,{...subject,descriptor},field.key));
   const result=estimateCache.get(key),p=document.createElement('p');
   p.textContent=result.ready?field.label+'：'+result.estimate.toFixed(1)+(field.key==='age'?'歳':' / 6')+' · あなたの評価から推定':field.label+'：'+(result.reason==='few'?'あと'+(8-result.speakers)+'人の評価で検証':'検証では評価の平均を上回れませんでした');
   if(result.ready){const small=document.createElement('small');small.textContent=result.speakers+'人 · 別話者で検証した平均誤差 '+result.mae.toFixed(1)+(field.key==='age'?'歳':' / 6');p.append(small);}el.append(p);
  }
 }
 estimates.ontoggle=renderEstimates;
 async function load(side){
  controller?.abort();const ticket=++token;subject=context(side);busy=false;loaded=false;enable();
  $('rating-own').setAttribute('aria-pressed',String(side==='own'));$('rating-ref').setAttribute('aria-pressed',String(side==='ref'));
  $('rating-next').hidden=side==='own';$('rating-title').textContent=subject?.name||'音声を選んでください';
  $('rating-fields').hidden=!subject;$('rating-save').hidden=!subject;$('rating-listen').disabled=!subject;$('rating-retry').hidden=true;
  try{await ready;await refresh();}catch{if(ticket===token){$('rating-status').textContent='評価を読み込めませんでした。もう一度お試しください。';$('rating-retry').hidden=false;}return;}
  if(ticket!==token)return;draft={...(rows.find(r=>r.key===subject?.key)?.ratings||{})};draw();enable();if(!subject){$('rating-status').textContent='';return;}
  const captured=subject;controller=new AbortController();$('rating-status').textContent='声の特徴を解析中…';
  try{
   if(!descriptors.has(captured.key)){const descriptor=await request(captured,controller.signal);if(ticket!==token)return;descriptors.set(captured.key,descriptor);estimateCache.clear();}
   changed(await TakeStore.updateRating(captured.key,old=>old?{...old,descriptor:descriptors.get(captured.key)}:undefined));
   if(ticket!==token)return;$('rating-status').textContent='';renderEstimates();
  }catch(e){if(ticket!==token)return;$('rating-status').textContent=e.name==='AbortError'?'解析を中止しました。':e.message;$('rating-retry').hidden=false;}
 }
 $('perception-button').onclick=()=>{$('perception-dialog').showModal();load('ref');};
 $('perception-dialog').addEventListener('close',()=>{++token;controller?.abort();});
 $('rating-own').onclick=()=>load('own');$('rating-ref').onclick=()=>load('ref');$('rating-retry').onclick=()=>load(subject?.side||'ref');
 $('rating-listen').onclick=()=>play(subject?.side||'ref');
 $('rating-next').onclick=async()=>{await next(rows.filter(r=>Object.keys(r.ratings).length).map(r=>r.speaker));load('ref');};
 async function save(remove=false){if(!subject||busy||!loaded)return;busy=true;enable();const captured=subject,ticket=token;
  try{const ratings={...draft},row=!remove&&Object.values(ratings).some(finite)?{key:captured.key,speaker:captured.speaker,name:captured.name,language:captured.language,ratings,descriptor:descriptors.get(captured.key)||null,date:new Date().toISOString()}:undefined;
   changed(await TakeStore.updateRating(captured.key,()=>row));if(ticket!==token)return;if(remove)draft={};draw();$('rating-status').textContent=remove?'評価を削除しました':'保存しました';
  }catch{notify('評価を保存できませんでした。',true);}finally{if(ticket===token){busy=false;enable();}}
 }
 $('rating-save').onclick=()=>save();$('rating-delete').onclick=()=>save(true);
 $('rating-export').onclick=async()=>{try{await refresh();download(new Blob([JSON.stringify({version:1,ratings:rows},null,2)],{type:'application/json'}),'koenami-listener-ratings.json');}catch{notify('評価を読み込めませんでした。',true);}};
 return {load,ready,estimate:personalEstimate};
}
