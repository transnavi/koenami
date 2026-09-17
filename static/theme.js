"use strict";
let savedTheme='system';try{savedTheme=localStorage.getItem('voice-theme')||'system';}catch{}
document.documentElement.dataset.theme=savedTheme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):savedTheme;
