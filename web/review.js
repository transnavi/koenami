/* Keyboard-first listening review. Every decision is appended to curation/reviews.jsonl through the local API. */
const $=id=>document.getElementById(id);
const KEYS={no_speech:'E',murmur:'U',noise:'Z',distorted:'X',other_speaker:'O'};
const state={lang:'ja',mode:'new',queue:[],flags:{},at:0,clip:0,ratings:{},chosen:new Set(),scope:'clip',active:0,log:[],skipped:[]};
/* Position, skipped speakers and the unsaved draft survive a reload; the review log itself lives on the server. */
const STORAGE='koenami-review';
function remember(){const item=current();try{localStorage.setItem(STORAGE,JSON.stringify({lang:state.lang,mode:state.mode,skipped:{...recall().skipped,[state.lang+':'+state.mode]:state.skipped},speaker:item?.speaker,clip:item?.clips[state.clip]?.id,ratings:state.ratings,chosen:[...state.chosen],scope:state.scope,note:$('note').value,active:state.active}));}catch{}}
function recall(){try{return JSON.parse(localStorage.getItem(STORAGE))||{};}catch{return {};}}
const audio=new Audio();audio.loop=true;audio.onplay=audio.onpause=audio.onended=()=>$('play').setAttribute('aria-pressed',String(!audio.paused));

async function load(saved={}){
 const r=await fetch('/api/review?lang='+encodeURIComponent(state.lang)+'&mode='+state.mode);if(!r.ok)throw Error(await r.text());
 const data=await r.json();state.flags=data.flags;state.scales=data.scales;state.decades=data.ageDecades;state.log=data.log;state.reviewed=data.reviewed;
 // Skipped speakers move to the end of the queue instead of disappearing.
 state.skipped=(saved.skipped?.[state.lang+':'+state.mode]||[]).filter(sid=>data.queue.some(q=>q.speaker===sid));
 state.queue=data.queue.filter(q=>!state.skipped.includes(q.speaker)).concat(state.skipped.map(sid=>data.queue.find(q=>q.speaker===sid)));
 state.at=Math.max(0,state.queue.findIndex(q=>q.speaker===saved.speaker));
 for(const b of document.querySelectorAll('#mode button'))b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));
 show(saved.speaker===current()?.speaker?saved:null);
}
function current(){return state.queue[state.at];}
function scales(){return (state.scales||[]).filter(s=>!s.only||s.only===state.lang);}
function show(draft=null){
 const item=current();$('card').hidden=!item;$('done').hidden=!!item;renderLog();
 $('progress').textContent=`済 ${state.reviewed}人 · 残り ${state.queue.length-state.at}人`;
 $('done').textContent=state.mode==='update'?'追加項目が必要な話者はありません。':'この言語の話者はすべてレビュー済みです。';
 if(!item){remember();return;}
 // Re-reviews start from the speaker's previous answers; only rows the current scales added are still empty.
 const base=draft||(item.previous&&{ratings:item.previous.ratings,chosen:item.previous.flags,scope:item.previous.scope,note:item.previous.note,active:Math.max(0,scales().findIndex(s=>item.missing?.includes(s.key)))});
 state.clip=Math.max(0,item.clips.findIndex(c=>c.id===(draft?.clip||item.first)));state.ratings={...(base?.ratings||{})};state.chosen=new Set(base?.chosen||[]);state.scope=base?.scope||'clip';state.active=base?.active||0;$('note').value=base?.note||'';$('note').blur();$('status').textContent='';
 $('speaker-meta').textContent=(item.group==='female'?'女性的な声':'男性的な声')+' · '+item.clips.length+'音声';
 renderClip();renderScales();renderFlags();remember();if(!draft)play();
}
function renderClip(){const item=current(),c=item.clips[state.clip];$('display').textContent=c.display||item.speaker;$('text').innerHTML='';const t=document.createElement('span');t.textContent=c.text||'';const s=document.createElement('small');s.textContent=`${state.clip+1}/${item.clips.length} · ${c.duration?.toFixed(1)} 秒`;$('text').append(t,s);audio.src=c.audio;}
function play(){audio.currentTime=0;audio.play().catch(()=>{});}
function step(d){const item=current();if(!item)return;state.clip=(state.clip+d+item.clips.length)%item.clips.length;renderClip();remember();play();}
function renderScales(){
 $('scales').replaceChildren();
 let group=null;
 scales().forEach((s,i)=>{
  if(s.group!==group){group=s.group;const h=document.createElement('div');h.className='scale-group';h.textContent=group;$('scales').append(h);}
  const row=document.createElement('div');row.className='scale';row.dataset.active=String(i===state.active);row.dataset.missing=String(!!current()?.missing?.includes(s.key));row.onclick=()=>{state.active=i;renderScales();remember();};
  const name=document.createElement('span');name.className='name';name.textContent=s.name;row.append(name);
  const choices=s.decades?Object.entries(state.decades).map(([v,label])=>[Number(v),label]):Array.from({length:7},(_,v)=>[v,String(v)]);
  {const steps=document.createElement('div');steps.className='steps';for(const [v,label] of choices){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(state.ratings[s.key]===v));b.onclick=e=>{e.stopPropagation();state.active=i;rate(v);};steps.append(b);}
   const out=document.createElement('output');out.textContent=Number.isFinite(state.ratings[s.key])?(s.decades?state.decades[state.ratings[s.key]]:String(state.ratings[s.key])):'—';row.append(steps,out);
   if(s.ends){const ends=document.createElement('div');ends.className='ends';for(const e of s.ends){const span=document.createElement('span');span.textContent=e;ends.append(span);}row.append(ends);}}
  $('scales').append(row);
 });
}
function key(d){const s=scales()[state.active];if(!s)return;if(s.decades){const v=Object.keys(state.decades).map(Number)[d-1];if(v===undefined)return;rate(v);}else rate(d);state.active=Math.min(scales().length-1,state.active+1);renderScales();remember();}
function rate(v){const s=scales()[state.active];if(!s)return;state.ratings[s.key]=state.ratings[s.key]===v?undefined:v;if(state.ratings[s.key]===undefined)delete state.ratings[s.key];renderScales();remember();}
function renderFlags(){
 const box=$('quality-flags');box.querySelectorAll(':scope > button').forEach(b=>b.remove());const anchor=box.querySelector('.scope');
 for(const [flag,label] of Object.entries(state.flags||{})){const b=document.createElement('button');b.type='button';b.textContent=label;const k=document.createElement('kbd');k.textContent=KEYS[flag]||'';b.append(k);b.setAttribute('aria-pressed',String(state.chosen.has(flag)));b.onclick=()=>toggle(flag);box.insertBefore(b,anchor);}
 // The scope only matters once a quality problem is flagged.
 $('scope').hidden=!state.chosen.size;$('scope-clip').setAttribute('aria-pressed',String(state.scope==='clip'));$('scope-speaker').setAttribute('aria-pressed',String(state.scope==='speaker'));
}
function toggle(flag){if(state.chosen.has(flag))state.chosen.delete(flag);else state.chosen.add(flag);renderFlags();remember();}
let inflight=false;
async function save(){
 const item=current();if(!item||inflight)return;const c=item.clips[state.clip];
 const body={speaker:item.speaker,clip:c.id,display:c.display,language:state.lang,flags:[...state.chosen],scope:state.scope,ratings:state.ratings,note:$('note').value};
 if(!body.flags.length&&!Object.keys(body.ratings).length&&!body.note.trim()){$('status').textContent='評価か判定を1つ以上つけてください';return;}
 inflight=true;$('save').disabled=true;
 try{const r=await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());
  state.log.push(await r.json());state.reviewed++;state.at++;show();}
 catch(e){$('status').textContent='保存できませんでした: '+e.message;}
 finally{inflight=false;$('save').disabled=false;}
}
function skip(){const item=current();if(!item)return;state.skipped.push(item.speaker);state.queue.splice(state.at,1);state.queue.push(item);show();}
function renderLog(){
 $('log').replaceChildren();
 for(const r of state.log.slice(-8).reverse()){const p=document.createElement('div');const s=document.createElement('strong');s.textContent=r.display||r.speaker;
  const parts=[...(r.flags||[]).map(f=>(state.flags?.[f]||f)+(r.scope==='speaker'?'（話者全体）':'')),...Object.entries(r.ratings||{}).map(([k,v])=>(state.scales?.find(s=>s.key===k)?.name||k)+' '+(k==='age'?state.decades?.[v]??v:v))];
  p.append(s,' '+parts.join(' · ')+(r.note?' · '+r.note:''));$('log').append(p);}
}
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea')){if(e.key==='Enter'&&!e.isComposing){e.preventDefault();save();}else if(e.key==='Escape')e.target.blur();return;}
 if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
 const k=e.key;
 if(k==='Enter'||k===' ')e.preventDefault();
 if(k===' ')audio.paused?play():audio.pause();
 else if(k==='ArrowLeft')step(-1);else if(k==='ArrowRight')step(1);
 else if(k==='ArrowUp'){state.active=Math.max(0,state.active-1);renderScales();remember();}else if(k==='ArrowDown'){state.active=Math.min(scales().length-1,state.active+1);renderScales();remember();}
 else if(/^[0-6]$/.test(k))key(Number(k));
 else if(k==='Enter')save();else if(k.toLowerCase()==='s')skip();
 else if(k.toUpperCase()==='A')setScope(state.scope==='clip'?'speaker':'clip');
 else{const upper=k.toUpperCase();for(const [flag,key] of Object.entries(KEYS))if(key===upper)toggle(flag);}
});
function setScope(scope){state.scope=scope;renderFlags();remember();}
$('scope-clip').onclick=()=>setScope('clip');$('scope-speaker').onclick=()=>setScope('speaker');
$('play').onclick=()=>audio.paused?play():audio.pause();$('prev-clip').onclick=()=>step(-1);$('next-clip').onclick=()=>step(1);$('save').onclick=save;$('skip').onclick=skip;
$('note').oninput=remember;
$('lang').onchange=()=>{const previous=state.lang;state.lang=$('lang').value;load({skipped:recall().skipped}).catch(e=>{state.lang=previous;$('lang').value=previous;$('status').textContent=e.message;});};
for(const b of document.querySelectorAll('#mode button'))b.onclick=()=>{if(state.mode===b.dataset.mode)return;const previous=state.mode;state.mode=b.dataset.mode;load({skipped:recall().skipped}).catch(e=>{state.mode=previous;$('status').textContent=e.message;});};
window.reviewApp=state;
const saved=recall();if(saved.mode==='update')state.mode='update';if(saved.lang&&[...$('lang').options].some(o=>o.value===saved.lang)){state.lang=saved.lang;$('lang').value=saved.lang;}
load(saved).catch(e=>{$('card').hidden=true;$('done').hidden=false;$('done').textContent='読み込めませんでした: '+e.message;});
