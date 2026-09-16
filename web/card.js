import {finite,clamp} from './math.js';
import {METRIC_KEYS,METRIC_LABELS,METRIC_UNITS,METRIC_DIGITS,VERDICTS,LEANINGS,formatScore} from './score.js';
/* The share card is one SVG string, rendered by the browser for the in-app
   preview and download and by resvg on the Worker for the social image.
   Both use the subset Noto Sans JP shipped with the site; the browser embeds it
   as a data URI, resvg receives the same bytes as a font buffer. */
export const CARD_WIDTH=1200,CARD_HEIGHT=630;
const COLORS={bg:'#f9fbff',surface:'#ffffff',ink:'#3f4a62',heading:'#27374c',muted:'#6d7790',line:'#dce6f2',sky:'#4ba8ea',pink:'#d56498',self:'#6b4aaf',grid:'#e4eaf3'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,n=0)=>finite(v)?v.toFixed(n).replace('-','−'):'—';
function slider(x,y,w,result,bands){
 const pos=s=>x+w*clamp((s+60)/120,0,1);
 const band=(g,color)=>bands?.[g]?`<rect x="${pos(bands[g][0])}" y="${y-7}" width="${Math.max(2,pos(bands[g][1])-pos(bands[g][0]))}" height="14" rx="7" fill="${color}" opacity=".28"/>`:'';
 return `<rect x="${x}" y="${y-3}" width="${w}" height="6" rx="3" fill="${COLORS.grid}"/>${band('male',COLORS.sky)}${band('female',COLORS.pink)}<line x1="${pos(0)}" y1="${y-14}" x2="${pos(0)}" y2="${y+14}" stroke="${COLORS.muted}" stroke-width="2"/><circle cx="${pos(result.score)}" cy="${y}" r="13" fill="${COLORS.self}" stroke="#fff" stroke-width="4"/><text x="${x}" y="${y+40}" font-size="20" fill="${COLORS.sky}">男性的</text><text x="${pos(0)}" y="${y+40}" font-size="18" fill="${COLORS.muted}" text-anchor="middle">中間</text><text x="${x+w}" y="${y+40}" font-size="20" fill="${COLORS.pink}" text-anchor="end">女性的</text>`;
}
function metricColumn(x,y,w,key,value,bands){
 const all=[value,...(bands?.female||[]),...(bands?.male||[])].filter(finite);let lo=Math.min(...all),hi=Math.max(...all);const pad=(hi-lo||1)*.12;lo-=pad;hi+=pad;
 const pos=v=>x+w*clamp((v-lo)/(hi-lo),0,1);
 const band=(g,color)=>bands?.[g]?.every(finite)?`<rect x="${pos(bands[g][0])}" y="${y+58}" width="${Math.max(2,pos(bands[g][1])-pos(bands[g][0]))}" height="10" rx="5" fill="${color}" opacity=".3"/>`:'';
 return `<text x="${x}" y="${y}" font-size="19" fill="${COLORS.muted}">${METRIC_LABELS[key]}</text><text x="${x}" y="${y+38}" font-size="30" font-weight="700" fill="${COLORS.heading}">${fmt(value,METRIC_DIGITS[key])}<tspan font-size="16" font-weight="400" fill="${COLORS.muted}"> ${esc(METRIC_UNITS[key])}</tspan></text><rect x="${x}" y="${y+61}" width="${w}" height="4" rx="2" fill="${COLORS.grid}"/>${band('male',COLORS.sky)}${band('female',COLORS.pink)}${finite(value)?`<circle cx="${pos(value)}" cy="${y+63}" r="7" fill="${COLORS.self}" stroke="#fff" stroke-width="3"/>`:''}`;
}
function cloud(x,y,size,points,point){
 const dots=points.map(([px,py,g])=>`<circle cx="${(x+size*clamp(px,0,1)).toFixed(1)}" cy="${(y+size*(1-clamp(py,0,1))).toFixed(1)}" r="4" fill="${g==='female'?COLORS.pink:COLORS.sky}" opacity=".45"/>`).join('');
 const own=point?`<g transform="translate(${x+size*clamp(point[0],0,1)} ${y+size*(1-clamp(point[1],0,1))})"><rect x="-13" y="-13" width="26" height="26" rx="4" transform="rotate(45)" fill="${COLORS.self}" stroke="#fff" stroke-width="4"/></g>`:'';
 return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="18" fill="${COLORS.surface}" stroke="${COLORS.line}"/>${dots}${own}<text x="${x+14}" y="${y+size-14}" font-size="16" fill="${COLORS.sky}">男性的な見本</text><text x="${x+size-14}" y="${y+size-14}" font-size="16" fill="${COLORS.pink}" text-anchor="end">女性的な見本</text>`;
}
/* result: Scorer.score() output; scorer: {bands, metricBands, cloud}; fonts: {weight: data URI} for browser rendering, omitted for resvg. */
export function cardSVG(result,scorer,{fonts=null,site='koe.transnavi.jp'}={}){
 const style=fonts?`<style>${Object.entries(fonts).map(([weight,uri])=>`@font-face{font-family:"Noto Sans JP";font-weight:${weight};src:url(${uri}) format("truetype")}`).join('')}</style>`:'';
 const accent=result.verdict==='female'?COLORS.pink:result.verdict==='male'?COLORS.sky:COLORS.self;
 const metrics=METRIC_KEYS.map((key,i)=>metricColumn(64+i*218,470,170,key,result.features[key],scorer.metricBands?.[key])).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" font-family="'Noto Sans JP', sans-serif">${style}<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1f7"/><stop offset=".5" stop-color="${COLORS.bg}"/><stop offset="1" stop-color="#edf6ff"/></linearGradient></defs><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/><text x="64" y="86" font-size="22" fill="${COLORS.muted}" letter-spacing="2">KOENAMI · 声の判定</text><text x="64" y="176" font-size="72" font-weight="700" fill="${accent}">${VERDICTS[result.verdict]}</text><text x="64" y="300" font-size="92" font-weight="700" fill="${COLORS.heading}">${formatScore(result.display)}<tspan font-size="30" font-weight="400" fill="${accent}" dx="14">${LEANINGS[result.verdict]}</tspan></text>${slider(64,356,640,result,scorer.bands)}${cloud(776,64,360,scorer.cloud||[],result.point)}${metrics}<text x="${CARD_WIDTH-64}" y="${CARD_HEIGHT-30}" font-size="18" fill="${COLORS.muted}" text-anchor="end">${esc(site)}</text></svg>`;
}
