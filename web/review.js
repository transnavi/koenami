/* Keyboard-first listening review. Every decision is appended to curation/reviews.jsonl through the local API. */
const $=id=>document.getElementById(id);
const SCALES=[
 {key:'femininity',name:'女性らしさ',ends:['感じない','強く感じる']},
 {key:'masculinity',name:'男性らしさ',ends:['感じない','強く感じる']},
 {key:'naturalness',name:'自然さ',ends:['不自然','自然']},
 {key:'japanese',name:'母語話者らしさ',ends:['感じない','強く感じる'],only:'ja'},
 {key:'age',name:'聞こえる年齢',number:[10,90]},
];
const KEYS={speaker:{native_like:'M',not_native_like:'N',tentative:'T',distorted_audio:'D'},clip:{no_speech:'E',murmur:'U',noise:'Z',other_speaker:'O',distorted:'X'}};
const state={lang:'ja',queue:[],flags:{},at:0,clip:0,ratings:{},chosen:new Set(),active:0,log:[]};
const audio=new Audio();audio.onplay=audio.onpause=audio.onended=()=>$('play').setAttribute('aria-pressed',String(!audio.paused));

async function load(){
 const r=await fetch('/api/review?lang='+encodeURIComponent(state.lang));if(!r.ok)throw Error(await r.text());
 const data=await r.json();state.queue=data.queue;state.flags=data.flags;state.log=data.log;state.reviewed=data.reviewed;state.at=0;show();
}
function current(){return state.queue[state.at];}
function scales(){return SCALES.filter(s=>!s.only||s.only===state.lang);}
function show(){
 const item=current();$('card').hidden=!item;$('done').hidden=!!item;renderLog();
 $('progress').textContent=`済 ${state.reviewed}人 · 残り ${state.queue.length-state.at}人`;
 if(!item)return;
 state.clip=Math.max(0,item.clips.findIndex(c=>c.id===item.first));state.ratings={};state.chosen=new Set();state.active=0;$('note').value='';$('note').blur();$('status').textContent='';
 $('speaker-meta').textContent=(item.group==='female'?'女性的な声':'男性的な声')+' · '+item.clips.length+'音声';
 renderClip();renderScales();renderFlags();play();
}
function renderClip(){const item=current(),c=item.clips[state.clip];$('display').textContent=c.display||item.speaker;$('text').innerHTML='';const t=document.createElement('span');t.textContent=c.text||'';const s=document.createElement('small');s.textContent=`${state.clip+1}/${item.clips.length} · ${c.duration?.toFixed(1)} 秒`;$('text').append(t,s);audio.src=c.audio;}
function play(){audio.currentTime=0;audio.play().catch(()=>{});}
function step(d){const item=current();state.clip=(state.clip+d+item.clips.length)%item.clips.length;renderClip();play();}
function renderScales(){
 $('scales').replaceChildren();
 scales().forEach((s,i)=>{
  const row=document.createElement('div');row.className='scale';row.dataset.active=String(i===state.active);row.onclick=()=>{state.active=i;renderScales();};
  const name=document.createElement('span');name.className='name';name.textContent=s.name;row.append(name);
  if(s.number){const input=document.createElement('input');input.type='number';input.min=s.number[0];input.max=s.number[1];input.step=5;input.value=state.ratings.age??'';input.placeholder='歳';input.oninput=()=>{const v=Number(input.value);if(input.value&&v>=s.number[0]&&v<=s.number[1])state.ratings.age=v;else delete state.ratings.age;};row.append(input);}
  else{const steps=document.createElement('div');steps.className='steps';for(let v=0;v<=6;v++){const b=document.createElement('button');b.type='button';b.textContent=String(v);b.setAttribute('aria-pressed',String(state.ratings[s.key]===v));b.onclick=e=>{e.stopPropagation();state.active=i;rate(v);};steps.append(b);}
   const out=document.createElement('output');out.textContent=Number.isFinite(state.ratings[s.key])?String(state.ratings[s.key]):'—';row.append(steps,out);
   const ends=document.createElement('div');ends.className='ends';for(const e of s.ends){const span=document.createElement('span');span.textContent=e;ends.append(span);}row.append(ends);}
  $('scales').append(row);
 });
}
function rate(v){const s=scales()[state.active];if(!s||s.number)return;state.ratings[s.key]=state.ratings[s.key]===v?undefined:v;if(state.ratings[s.key]===undefined)delete state.ratings[s.key];renderScales();}
function renderFlags(){
 for(const scope of ['speaker','clip']){const box=$(scope+'-flags');box.querySelectorAll('button').forEach(b=>b.remove());
  for(const [flag,label] of Object.entries(state.flags[scope]||{})){const b=document.createElement('button');b.type='button';b.textContent=label;const k=document.createElement('kbd');k.textContent=KEYS[scope][flag]||'';b.append(k);b.setAttribute('aria-pressed',String(state.chosen.has(flag)));b.onclick=()=>toggle(flag);box.append(b);}}
}
function toggle(flag){if(state.chosen.has(flag))state.chosen.delete(flag);else{state.chosen.add(flag);for(const other of ['native_like','not_native_like','tentative'])if(other!==flag&&['native_like','not_native_like','tentative'].includes(flag))state.chosen.delete(other);}renderFlags();}
async function save(){
 const item=current(),c=item.clips[state.clip];
 const body={speaker:item.speaker,clip:c.id,display:c.display,language:state.lang,flags:[...state.chosen],ratings:state.ratings,note:$('note').value};
 if(!body.flags.length&&!Object.keys(body.ratings).length&&!body.note.trim()){$('status').textContent='評価か判定を1つ以上つけてください';return;}
 $('save').disabled=true;
 try{const r=await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());
  state.log.push(await r.json());state.reviewed++;state.at++;show();}
 catch(e){$('status').textContent='保存できませんでした: '+e.message;}
 finally{$('save').disabled=false;}
}
function skip(){state.at++;show();}
function renderLog(){
 $('log').replaceChildren();
 for(const r of state.log.slice(-8).reverse()){const p=document.createElement('div');const s=document.createElement('strong');s.textContent=r.display||r.speaker;
  const parts=[...(r.flags||[]).map(f=>state.flags.speaker?.[f]||state.flags.clip?.[f]||f),...Object.entries(r.ratings||{}).map(([k,v])=>(SCALES.find(s=>s.key===k)?.name||k)+' '+v)];
  p.append(s,' '+parts.join(' · ')+(r.note?' · '+r.note:''));$('log').append(p);}
}
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea')){if(e.key==='Enter'&&!e.isComposing){e.preventDefault();save();}else if(e.key==='Escape')e.target.blur();return;}
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 const k=e.key;
 if(k===' '){e.preventDefault();audio.paused?play():audio.pause();}
 else if(k==='ArrowLeft')step(-1);else if(k==='ArrowRight')step(1);
 else if(k==='ArrowUp'){state.active=Math.max(0,state.active-1);renderScales();}else if(k==='ArrowDown'){state.active=Math.min(scales().length-1,state.active+1);renderScales();}
 else if(/^[0-6]$/.test(k))rate(Number(k));
 else if(k==='Enter')save();else if(k.toLowerCase()==='s')skip();
 else{const upper=k.toUpperCase();for(const scope of ['speaker','clip'])for(const [flag,key] of Object.entries(KEYS[scope]))if(key===upper)toggle(flag);}
});
$('play').onclick=()=>audio.paused?play():audio.pause();$('prev-clip').onclick=()=>step(-1);$('next-clip').onclick=()=>step(1);$('save').onclick=save;$('skip').onclick=skip;
$('lang').onchange=()=>{state.lang=$('lang').value;load().catch(e=>{$('status').textContent=e.message;});};
window.reviewApp=state;
load().catch(e=>{$('card').hidden=true;$('done').hidden=false;$('done').textContent='読み込めませんでした: '+e.message;});
