// First-visit guide: a spotlight and a card walk through the studio one area at a
// time. Progress lives in localStorage so "あとで" resumes where it stopped on
// the next visit; "スキップ" and finishing both mark it done. The card is a
// non-modal <dialog>, which also makes the app skip its keyboard shortcuts while
// the guide is open. The ⓘ dialog can start it again.
const KEY='voice-tour';
const STEPS=[
 {title:'Koenamiへようこそ',text:'見本の声を聴き、自分の声を録音して、5つの指標と地図で見比べる練習ツールです。主な画面を順に案内します。2分ほどで終わり、「あとで」で中断すると次回は続きから始まります。'},
 {target:['.target'],title:'選んだ見本',text:'いま選んでいる見本の声です。再生ボタンで聴き、★でお気に入りに入れられます。近づきたい声を見本にしてください。'},
 {target:['.samples-panel .sample-filters','#samples-toggle'],title:'見本の一覧',text:'女性的な声・中性的な声・男性的な声で絞り込み、話者名順や自分の声に近い順で並べ替えられます。手元の音声やJVSの音声も見本に追加できます。'},
 {target:['#record'],title:'録音する',text:'マイクのボタンか R キーで録音を始め、もう一度押すと止まります。見本と同じ言葉を言うと比べやすくなります。録音はこのブラウザーの中だけに保存されます。'},
 {target:['#indicators'],title:'声の特徴',text:'高さ・響き・質感・明るさ・抑揚の5指標を、自分と見本で並べて表示します。帯は参照グループの話者の中央80%です。左下の「見本との差」は5指標をまとめた距離です。'},
 {target:['.graph-area'],title:'声の分布',text:'見本の声を点として並べた地図です。自分の声は紫、選んだ見本はその見本の色で囲まれます。2Dと3D、主成分と男女差の表示を切り替えられます。'},
 {target:['.signal-panel'],title:'波形と高さの推移',text:'高さの推移、スペクトログラム、波形を自分と見本で見比べます。波形をドラッグすると、その範囲だけを測り直せます。'},
 {target:['#live-mode'],title:'リアルタイム測定',text:'話している声をそのまま地図に描きます。見本の点に近づく方向を確かめながら、声を変えてみてください。'},
 {target:['#info-button'],title:'詳しい説明',text:'使い方、声のしくみと練習の手引き、測定方法と出典は、このボタンから開けます。このガイドは、左隣の ? ボタンでいつでも見直せます。'},
];
const phone=matchMedia('(max-width:800px),(max-height:520px)');
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}};
const save=v=>{try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}};

let shade,spot,card,step=0,raf=0;
function build(){
 shade=document.createElement('div');shade.className='tour-shade';shade.hidden=true;
 spot=document.createElement('div');spot.className='tour-spot';shade.append(spot);
 card=document.createElement('dialog');card.className='tour-card';card.setAttribute('aria-labelledby','tour-title');
 card.innerHTML='<p class="tour-count" id="tour-count"></p><h2 id="tour-title"></h2><p id="tour-text"></p><div class="tour-actions"><button type="button" class="text-button" data-act="later">あとで</button><button type="button" class="text-button" data-act="skip">スキップ</button><span class="tour-spacer"></span><button type="button" class="text-button" data-act="back">戻る</button><button type="button" class="tour-next" data-act="next">次へ</button></div>';
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
 if(el){const r=el.getBoundingClientRect();Object.assign(spot.style,{left:`${r.left-pad}px`,top:`${r.top-pad}px`,width:`${r.width+2*pad}px`,height:`${r.height+2*pad}px`,opacity:1});}
 else Object.assign(spot.style,{left:'50%',top:'50%',width:'0px',height:'0px',opacity:0});
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
 card.querySelector('#tour-title').textContent=s.title;card.querySelector('#tour-text').textContent=s.text;
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
