/* Pairwise listening: two clips, three questions, one key each. Judgements go to curation/pairs.jsonl through the local API. */
const $=id=>document.getElementById(id);
const STORAGE='koenami-pairs';
const state={lang:'ja',session:sessionId(),queue:[],at:0,questions:{},answers:{},active:0,log:[],judged:0,drafts:{}};
function sessionId(){const now=Date.now();let s=null;try{s=JSON.parse(localStorage.getItem('koenami-review-session'));}catch{}if(!s||now-s.at>40*60*1000)s={id:Math.random().toString(36).slice(2,10)+now.toString(36),at:now};s.at=now;try{localStorage.setItem('koenami-review-session',JSON.stringify(s));}catch{}return s.id;}
function pairKey(p){return p.a.id+'|'+p.b.id;}
function current(){return state.queue[state.at];}
function remember(){const p=current();if(p)state.drafts[pairKey(p)]={answers:state.answers,note:$('note').value,active:state.active};try{localStorage.setItem(STORAGE,JSON.stringify({lang:state.lang,key:p?pairKey(p):null,drafts:state.drafts}));}catch{}}
function recall(){try{return JSON.parse(localStorage.getItem(STORAGE))||{};}catch{return {};}}

function setTheme(value){try{localStorage.setItem('voice-theme',value);}catch{}document.documentElement.dataset.theme=value;$('theme-button').querySelector('use').setAttribute('href',value==='dark'?'#i-sun':'#i-moon');}
$('theme-button').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');$('theme-button').querySelector('use').setAttribute('href',document.documentElement.dataset.theme==='dark'?'#i-sun':'#i-moon');

/* Playback: the pair loops A → B → A … so the ear keeps a fresh comparison; Q or W hold one side; Space pauses in place. */
const players={a:new Audio(),b:new Audio()};let playing=null,loop=true;
function mark(){for(const side of ['a','b'])$('side-'+side).setAttribute('aria-pressed',String(playing===side&&!players[side].paused));$('loop').setAttribute('aria-pressed',String(loop));}
for(const side of ['a','b']){const other=side==='a'?'b':'a';players[side].onended=()=>{if(loop)playSide(other);else{playing=null;mark();}};players[side].onplay=players[side].onpause=mark;}
function playSide(side){for(const s of ['a','b'])if(s!==side)players[s].pause();playing=side;players[side].currentTime=0;players[side].play().catch(()=>{});mark();}
function hold(side){loop=false;playSide(side);}
function restart(){loop=true;playSide('a');}
function togglePause(){const p=playing&&players[playing];if(!p)return restart();if(p.paused)p.play().catch(()=>{});else p.pause();mark();}

async function load(saved={}){
 const r=await fetch('/api/pairs?lang='+encodeURIComponent(state.lang)+'&session='+state.session);if(!r.ok)throw Error(await r.text());
 const data=await r.json();state.questions=data.questions;state.log=data.log;state.judged=data.judged;state.queue=data.queue;state.drafts={...state.drafts,...(saved.drafts||{})};
 state.at=Math.max(0,state.queue.findIndex(p=>pairKey(p)===saved.key));show();
}
function show(){
 const p=current();$('card').hidden=!p;$('done').hidden=!!p;renderLog();
 $('progress').textContent=`済 ${state.judged}組 · 残り ${state.queue.length-state.at}組`;
 if(!p){remember();return;}
 const draft=state.drafts[pairKey(p)]||{};state.answers={...(draft.answers||{})};state.active=draft.active||0;$('note').value=draft.note||'';$('note').blur();$('status').textContent='';
 for(const side of ['a','b']){$('text-'+side).textContent=p[side].text||'';$('meta-'+side).textContent=(p[side].duration||0).toFixed(1)+' 秒';players[side].src=p[side].audio;}
 renderQuestions();remember();if(!draft.answers)restart();
}
function renderQuestions(){
 $('questions').replaceChildren();
 Object.entries(state.questions).forEach(([key,name],i)=>{
  const row=document.createElement('div');row.className='question';row.dataset.active=String(i===state.active);row.onclick=()=>{state.active=i;renderQuestions();remember();};
  const label=document.createElement('span');label.className='name';label.textContent=name;const choices=document.createElement('div');choices.className='choices';
  [['a','A','1'],['same','同じ','2'],['b','B','3']].forEach(([v,text,k])=>{const b=document.createElement('button');b.type='button';b.textContent=text;const kb=document.createElement('kbd');kb.textContent=k;b.append(kb);b.setAttribute('aria-pressed',String(state.answers[key]===v));b.onclick=e=>{e.stopPropagation();state.active=i;answer(v);};choices.append(b);});
  row.append(label,choices);$('questions').append(row);
 });
}
function answer(v){const keys=Object.keys(state.questions),key=keys[state.active];if(!key)return;state.answers[key]=state.answers[key]===v?undefined:v;if(state.answers[key]===undefined)delete state.answers[key];state.active=Math.min(keys.length-1,state.active+1);renderQuestions();remember();}
let inflight=false;
async function save(){
 const p=current();if(!p||inflight)return;
 if(!Object.keys(state.answers).length){$('status').textContent='少なくとも1問に答えてください';return;}
 const body={a:p.a.id,b:p.b.id,language:state.lang,answers:state.answers,kind:p.kind,distance:p.distance,session:state.session,note:$('note').value};
 inflight=true;$('save').disabled=true;
 try{const r=await fetch('/api/pairs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());
  state.log.push({...(await r.json()),labels:[p.a.display||p.a.speaker,p.b.display||p.b.speaker]});state.judged++;delete state.drafts[pairKey(p)];state.at++;show();}
 catch(e){$('status').textContent='保存できませんでした: '+e.message;}
 finally{inflight=false;$('save').disabled=false;}
}
function skip(){const p=current();if(!p)return;state.queue.splice(state.at,1);state.queue.push(p);show();}
function renderLog(){
 $('log').replaceChildren();
 for(const r of state.log.slice(-8).reverse()){const div=document.createElement('div');const s=document.createElement('strong');const labels=r.labels||[r.a,r.b];s.textContent=labels.map(l=>String(l||'').replace(/^[FM]\s*/,'№ ')).join(' vs ');
  const parts=Object.entries(r.answers||{}).map(([k,v])=>(state.questions[k]||k).replace(/^どちら(が|を)/,'')+' '+({a:'A',b:'B',same:'同じ'}[v]||v));
  div.append(s,' '+parts.join(' · ')+(r.note?' · '+r.note:''));$('log').append(div);}
}
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea')){if(e.key==='Enter'&&!e.isComposing){e.preventDefault();save();}else if(e.key==='Escape')e.target.blur();return;}
 if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
 const k=e.key;if(k==='Enter'||k===' ')e.preventDefault();
 if(k===' ')togglePause();
 else if(k.toLowerCase()==='q')hold('a');else if(k.toLowerCase()==='w')hold('b');else if(k.toLowerCase()==='r')restart();
 else if(k==='ArrowUp'){state.active=Math.max(0,state.active-1);renderQuestions();remember();}else if(k==='ArrowDown'){state.active=Math.min(Object.keys(state.questions).length-1,state.active+1);renderQuestions();remember();}
 else if(k==='1')answer('a');else if(k==='2')answer('same');else if(k==='3')answer('b');
 else if(k==='Enter')save();else if(k.toLowerCase()==='s')skip();
});
$('side-a').onclick=()=>hold('a');$('side-b').onclick=()=>hold('b');$('loop').onclick=restart;$('save').onclick=save;$('skip').onclick=skip;$('note').oninput=remember;
window.pairsApp=state;
load(recall()).catch(e=>{$('card').hidden=true;$('done').hidden=false;$('done').textContent='読み込めませんでした: '+e.message;});
