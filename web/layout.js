'use strict';
// On phones the sample browser is a bottom sheet opened from the selected-sample bar; on wider screens it stays a static column.
const phone=matchMedia('(max-width:800px),(max-height:520px)');
const browser=document.getElementById('sample-browser'),toggle=document.getElementById('samples-toggle'),scroll=document.getElementById('sample-scroll');
function apply(){if(phone.matches){if(browser.open&&!browser.matches(':modal'))browser.close();}else{if(browser.matches(':modal'))browser.close();browser.setAttribute('open','');}}
phone.addEventListener('change',apply);apply();
toggle.onclick=()=>{if(!phone.matches){document.querySelector('.sample-row[aria-pressed=true]')?.scrollIntoView({block:'center',behavior:'smooth'});return;}if(browser.open)browser.close();else{browser.showModal();toggle.setAttribute('aria-expanded','true');document.querySelector('.sample-row[aria-pressed=true]')?.scrollIntoView({block:'center'});}};
browser.addEventListener('close',()=>{toggle.setAttribute('aria-expanded','false');if(!phone.matches)browser.setAttribute('open','');});
scroll.addEventListener('click',e=>{if(phone.matches&&browser.matches(':modal')&&e.target.closest('.sample-row'))browser.close();});
