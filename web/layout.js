'use strict';
// On phones the sample browser is a bottom sheet opened from the selected-sample bar; on wider screens CSS shows it as a static column and it is never opened as a dialog.
const phone=matchMedia('(max-width:800px),(max-height:520px)');
const browser=document.getElementById('sample-browser'),toggle=document.getElementById('samples-toggle'),scroll=document.getElementById('sample-scroll');
const current=()=>document.querySelector('.sample-row[aria-pressed=true]');
function apply(){if(phone.matches)toggle.setAttribute('aria-expanded',String(browser.open));else{if(browser.open)browser.close();toggle.removeAttribute('aria-expanded');}}
phone.addEventListener('change',apply);apply();
toggle.onclick=()=>{if(!phone.matches){current()?.scrollIntoView({block:'center',behavior:'smooth'});return;}browser.showModal();toggle.setAttribute('aria-expanded','true');current()?.scrollIntoView({block:'center'});};
browser.addEventListener('close',()=>{if(phone.matches)toggle.setAttribute('aria-expanded','false');});
scroll.addEventListener('click',e=>{if(browser.open&&e.target.closest('.sample-row'))browser.close();});
