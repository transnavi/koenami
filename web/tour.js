// First-visit guide: a spotlight and a card walk through the studio one area at a
// time. The lit area stays clickable; four blockers around it hold the rest. Progress lives in localStorage so "あとで" resumes where it stopped on
// the next visit; "スキップ" and finishing both mark it done. The card is a
// non-modal <dialog>, which also makes the app skip its keyboard shortcuts while
// the guide is open. The ⓘ dialog can start it again.
const KEY='voice-tour';
const ART={
 wave:'<use href="#i-wave"/>',
 pick:'<use href="#i-play"/>',
 list:'<path d="M4 6h16M4 12h16M4 18h10"/>',
 mic:'<use href="#i-mic"/>',
 radar:'<path d="M12 3l8.6 6.2-3.3 10.1H6.7L3.4 9.2Z"/>',
 map:'<circle cx="8" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="11" cy="10" r="3"/>',
 signal:'<path d="M3 12c2-6 3-6 4 0s2 6 3 0 2-6 3 0 2 6 3 0 2-6 3 0 2 6 3 0"/>',
 live:'<use href="#i-wave"/>',
 info:'<use href="#i-info"/>',
};
// Inline stand-ins for the real controls mentioned in the text.
const icon=(id,cls='')=>`<span class="tour-key ${cls}"><svg aria-hidden="true"><use href="#i-${id}"/></svg></span>`;
const CHIPS={help:icon('help','tour-key-plain'),info:icon('info','tour-key-plain'),play:icon('play','tour-key-round'),mic:icon('mic','tour-key-round tour-key-record'),star:'<span class="tour-key tour-key-plain">☆</span>',R:'<kbd class="tour-key tour-key-kbd">R</kbd>'};
const STEPS=[
 {art:'wave',title:'Koenamiへようこそ',text:'見本を真似して録音し、声の違いを目で確かめられるツールです。1分ほど、主な画面を順にご紹介します。スキップしても、画面右上の{help}からいつでも見直せます。'},
 {art:'pick',target:['.target'],title:'選んだ見本',text:'今選択されている見本を{play}で再生でき、また{star}でお気に入りとして登録できます。'},
 {art:'list',target:['.samples-panel .sample-filters','#samples-toggle'],title:'見本の一覧',text:'声の種類で絞り込み、並べ替えて、近づきたい声を探します。'},
 {art:'mic',target:['#record'],title:'録音',text:'{mic}か{R}で録音を始め、もう一度押して止めます。'},
 {art:'radar',target:['#indicators'],title:'声の特徴',text:'高さ・響き・質感・明るさ・抑揚を、自分と見本で見比べます。'},
 {art:'map',target:['.graph-area'],title:'声の分布',text:'見本の声の地図です。自分の声が見本にどれだけ近いかが分かります。'},
 {art:'signal',target:['.signal-panel'],title:'波形',text:'高さの推移やスペクトログラムを見比べます。ドラッグで範囲を選べます。'},
 {art:'live',target:['#live-mode'],title:'リアルタイム',text:'話しながら、声の位置が動くのを見て調整します。'},
 {art:'info',target:['#info-button'],title:'詳しい説明',text:'使い方や声のしくみの解説は{info}から開けます。'},
];
const phone=matchMedia('(max-width:800px),(max-height:520px)');
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}};
const save=v=>{try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}};

let shade,spot,blockers,card,step=0,raf=0;
function build(){
 shade=document.createElement('div');shade.className='tour-shade';shade.hidden=true;
 spot=document.createElement('div');spot.className='tour-spot';blockers=['top','right','bottom','left'].map(()=>{const d=document.createElement('div');d.className='tour-block';return d;});shade.append(spot,...blockers);
 card=document.createElement('dialog');card.className='tour-card';card.setAttribute('aria-labelledby','tour-title');
 card.innerHTML='<div class="tour-head"><svg class="tour-art" viewBox="0 0 24 24" aria-hidden="true"></svg><div><p class="tour-count" id="tour-count"></p><h2 id="tour-title"></h2></div></div><p id="tour-text"></p><div class="tour-actions"><button type="button" class="text-button" data-act="later" title="中断して、次回に続きから">あとで</button><button type="button" class="text-button" data-act="skip" title="ガイドを終了">スキップ</button><span class="tour-spacer"></span><button type="button" class="text-button" data-act="back">戻る</button><button type="button" class="tour-next" data-act="next">次へ</button></div>';
 card.addEventListener('click',e=>{const act=e.target.closest('[data-act]')?.dataset.act;if(act==='next')next();else if(act==='back')show(step-1);else if(act==='later')pause();else if(act==='skip')finish();});
 card.addEventListener('cancel',e=>{e.preventDefault();pause();});
 card.addEventListener('keydown',e=>{if(e.key==='ArrowRight')next();else if(e.key==='ArrowLeft')show(step-1);else if(e.key==='Escape')pause();});
 card.addEventListener('focusout',e=>{if(card.open&&e.relatedTarget&&!card.contains(e.relatedTarget))card.querySelector('[data-act=next]').focus();});
 document.body.append(shade,card);
}
const visible=el=>{if(!el||!el.checkVisibility())return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
const target=()=>(STEPS[step].target||[]).map(s=>document.querySelector(s)).find(visible)||null;
function place(){
 const el=target(),pad=8;
 const box=el?(r=>({l:r.left-pad,t:r.top-pad,w:r.width+2*pad,h:r.height+2*pad}))(el.getBoundingClientRect()):{l:innerWidth/2,t:innerHeight/2,w:0,h:0};
 Object.assign(spot.style,{left:`${box.l}px`,top:`${box.t}px`,width:`${box.w}px`,height:`${box.h}px`,opacity:el?1:0});
 const [bt,br,bb,bl]=blockers;Object.assign(bt.style,{left:0,top:0,width:'100%',height:`${Math.max(0,box.t)}px`});Object.assign(bb.style,{left:0,top:`${box.t+box.h}px`,width:'100%',bottom:0,height:'auto'});Object.assign(bl.style,{left:0,top:`${box.t}px`,width:`${Math.max(0,box.l)}px`,height:`${box.h}px`});Object.assign(br.style,{left:`${box.l+box.w}px`,top:`${box.t}px`,right:0,width:'auto',height:`${box.h}px`});
 if(phone.matches||!el){card.style.left=card.style.top='';card.classList.toggle('tour-card-center',!el&&!phone.matches);return;}
 card.classList.remove('tour-card-center');
 const r=el.getBoundingClientRect(),w=card.offsetWidth,h=card.offsetHeight,gap=14,vw=innerWidth,vh=innerHeight;
 let top=r.bottom+gap,left=r.left;
 if(top+h>vh-12)top=r.top-gap-h;
 if(top<12){top=Math.max(12,Math.min(vh-h-12,r.top));left=r.right+gap;if(left+w>vw-12)left=r.left-gap-w;}
 left=Math.max(12,Math.min(vw-w-12,left));top=Math.max(12,Math.min(vh-h-12,top));
 card.style.left=`${left}px`;card.style.top=`${top}px`;
}
function show(n){
 step=Math.max(0,Math.min(STEPS.length-1,n));save({...load(),step});
 const s=STEPS[step];
 card.querySelector('#tour-count').textContent=`${step+1} / ${STEPS.length}`;
 card.querySelector('#tour-title').textContent=s.title;card.querySelector('#tour-text').innerHTML=s.text.replace(/\{(\w+)\}/g,(_,id)=>CHIPS[id]);card.querySelector('.tour-art').innerHTML=ART[s.art];
 card.querySelector('[data-act=back]').hidden=step===0;
 card.querySelector('[data-act=next]').textContent=step===STEPS.length-1?'はじめる':'次へ';
 shade.hidden=false;if(!card.open)card.show();
 target()?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 place();card.querySelector('[data-act=next]').focus();
}
function next(){if(step>=STEPS.length-1)finish();else show(step+1);}
function close(){shade.hidden=true;if(card.open)card.close();cancelAnimationFrame(raf);}
function pause(){save({...load(),step});close();}
function finish(){save({done:true});close();}
function tick(){if(card?.open)place();raf=requestAnimationFrame(tick);}

export function startTour(from=0){if(!card)build();cancelAnimationFrame(raf);tick();show(from);}
function initTour(){
 const state=load();
 document.getElementById('tour-restart')?.addEventListener('click',()=>{document.querySelector('dialog[open]:not(.tour-card)')?.close();startTour(0);});
 if(state.done)return;
 // Wait for the studio to settle before the first spotlight.
 setTimeout(()=>startTour(Number.isInteger(state.step)?state.step:0),600);
}
initTour();
