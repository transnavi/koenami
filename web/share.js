import {cardSVG,CARD_WIDTH,CARD_HEIGHT} from './card.js';
import {resultParams,shareText} from './score.js';
/* Everything a result needs to leave the app: its URL, the post text, the card
   as SVG and PNG, and the intent links. The result URL carries only the five
   measurements; the receiving page and the Worker recompute the score from them. */
export const HASHTAG='Koenami';
let fonts=null;
async function loadFonts(){
 if(fonts)return fonts;
 const load=async weight=>{const bytes=new Uint8Array(await (await fetch(`/fonts/koenami-share-${weight}.ttf`)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return `data:font/ttf;base64,${btoa(binary)}`;};
 const [regular,bold]=await Promise.all([load(400),load(700)]);
 return fonts={400:regular,700:bold};
}
export function resultURL(features,lang,origin=location.origin){return `${origin}/r?${resultParams(features,lang)}`;}
export function intents(url,text){
 return [
  {id:'x',label:'X',href:`https://x.com/intent/post?${new URLSearchParams({text,url,hashtags:HASHTAG})}`},
  {id:'bluesky',label:'Bluesky',href:`https://bsky.app/intent/compose?${new URLSearchParams({text:`${text} #${HASHTAG}\n${url}`})}`},
  {id:'misskey',label:'Misskey',href:`https://misskey-hub.net/share/?${new URLSearchParams({text:`${text} #${HASHTAG}`,url,visibility:'public'})}`},
 ];
}
export async function cardImage(result,scorer){
 const svg=cardSVG(result,scorer,{fonts:await loadFonts()});
 const image=new Image();image.decoding='async';
 const source=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{await new Promise((ok,fail)=>{image.onload=ok;image.onerror=()=>fail(new Error('画像を作成できませんでした。'));image.src=source;});}
 finally{URL.revokeObjectURL(source);}
 const canvas=document.createElement('canvas');canvas.width=CARD_WIDTH;canvas.height=CARD_HEIGHT;canvas.getContext('2d').drawImage(image,0,0);
 const blob=await new Promise(ok=>canvas.toBlob(ok,'image/png'));if(!blob)throw new Error('画像を作成できませんでした。');
 return new File([blob],`koenami-${result.display}.png`,{type:'image/png'});
}
export function shareBundle(result,scorer,lang){const url=resultURL(result.features,lang),text=shareText(result);return {url,text,svg:cardSVG(result,scorer),intents:intents(url,text)};}
export async function systemShare(result,scorer,lang){
 const {url,text}=shareBundle(result,scorer,lang);
 const file=await cardImage(result,scorer);
 const withFile={title:'Koenami',text:`${text} #${HASHTAG}`,url,files:[file]};
 if(navigator.canShare?.(withFile)){await navigator.share(withFile);return true;}
 if(navigator.share){await navigator.share({title:'Koenami',text:`${text} #${HASHTAG}`,url});return true;}
 return false;
}
