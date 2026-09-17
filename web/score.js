import {finite,quantile,clamp} from './math.js';
import {AcousticSpace} from './space.js';
/* Shareable result: where a voice sits on the female–male contrast axis of the
   current language's reference speakers, plus the five raw measurements.
   The scale is signed and linear along that axis: 0 is halfway between the two
   group medians, −25 the male median, +25 the female median. Either direction is
   a goal in its own right and 0 is the goal for an androgynous voice, so the
   number never carries one group's name. The display clamps to ±50.
   Bump SCORE_VERSION whenever the axis, anchors or verdict bands change; old
   result URLs carry their version. */
export const SCORE_VERSION=1;
export const METRIC_KEYS=['f0','delta_f','hnr','balance','pitch_span'];
export const METRIC_LABELS={f0:'高さ',delta_f:'響き',hnr:'質感',balance:'明るさ',pitch_span:'抑揚'};
export const METRIC_UNITS={f0:'Hz',delta_f:'Hz ΔF',hnr:'dB',balance:'dB',pitch_span:'半音'};
export const METRIC_DIGITS={f0:0,delta_f:0,hnr:1,balance:1,pitch_span:1};
export const VERDICTS={female:'女性的な声',androgynous:'中間的な声',male:'男性的な声'};
export const LEANINGS={female:'女性寄り',androgynous:'中間',male:'男性寄り'};
export const SCALE_LIMIT=50;
/* Signed number with an explicit sign; U+2212 for minus. */
export const formatScore=v=>v>0?`+${v}`:v<0?`−${-v}`:'0';
export function distance2(a,b){return finite(a?.f0)&&finite(a?.delta_f)&&finite(b?.f0)&&finite(b?.delta_f)?(12*Math.log2(a.f0/b.f0)/4)**2+((a.delta_f-b.delta_f)/90)**2:Infinity;}
/* One clip per labeled human speaker: the clip nearest that speaker's median pitch and resonance. */
export function representatives(clips){const by=new Map();for(const c of clips.filter(c=>c.plotted&&!c.synthetic&&['female','male'].includes(c.group))){if(!by.has(c.speaker))by.set(c.speaker,[]);by.get(c.speaker).push(c);}return [...by.values()].map(group=>{const f=quantile(group.map(c=>c.features.f0),.5),d=quantile(group.map(c=>c.features.delta_f),.5);return [...group].sort((a,b)=>distance2(a.features,{f0:f,delta_f:d})-distance2(b.features,{f0:f,delta_f:d}))[0];});}
/* The verdict is withheld until a take passes the same rule every reference clip had to pass
   (the build_*.py scripts): enough stable voiced speech, no clipping, a resonance estimate that does
   not swing with the analysis settings. Each entry names the measurement and the bound. */
export const GATE=[
 {key:'voiced_seconds',label:'有声区間',unit:'秒',min:1,digits:1},
 {key:'formant_seconds',label:'安定した響きの区間',unit:'秒',min:.35,digits:2},
 {key:'clipping_fraction',label:'クリップ率',unit:'%',max:.005,scale:100,digits:2},
 {key:'resonance_sensitivity_pct',label:'響きの推定のぶれ',unit:'%',max:12,digits:0},
];
/* Returns null when the measurement passes, otherwise the first failing check with its value. */
export function gateFailure(detail){
 if(!detail)return {label:'測定なし'};
 for(const g of GATE){const raw=detail[g.key];const v=finite(raw)?raw:(g.min!==undefined?0:0);const shown=(v*(g.scale||1)).toFixed(g.digits);
  if(g.min!==undefined&&v<g.min)return {label:g.label,value:`${shown} ${g.unit}`,need:`${g.min} ${g.unit}以上`};
  if(g.max!==undefined&&v>g.max)return {label:g.label,value:`${shown} ${g.unit}`,need:`${(g.max*(g.scale||1))} ${g.unit}以下`};}
 return null;
}
export function verdictOf(score){return score>=15?'female':score<=-15?'male':'androgynous';}
/* Built from the public library alone, never from imported references, so the studio's
   verdict equals what /r and /og.png recompute from the shared numbers. */
export class Scorer{
 constructor(clips){
  this.speakers=representatives(clips);
  this.space=new AcousticSpace(this.speakers);
  const contrast=this.space.projections.contrast;
  this.available=!!contrast;
  if(!this.available)return;
  const axis=c=>this.space.projectRaw(AcousticSpace.raw(c.features),contrast.axes)[0];
  const groups={female:[],male:[]};
  for(const c of this.speakers){const v=axis(c);if(finite(v))groups[c.group].push(v);}
  this.anchors={male:quantile(groups.male,.5),female:quantile(groups.female,.5)};
  const toScore=v=>50*(v-(this.anchors.male+this.anchors.female)/2)/(this.anchors.female-this.anchors.male);
  this.toScore=toScore;
  this.bands={};for(const g of ['female','male'])this.bands[g]=[quantile(groups[g],.1),quantile(groups[g],.9)].map(toScore);
  this.metricBands={};for(const key of METRIC_KEYS){this.metricBands[key]={};for(const g of ['female','male']){const values=this.speakers.filter(c=>c.group===g).map(c=>c.features[key]).filter(finite);this.metricBands[key][g]=[quantile(values,.1),quantile(values,.9)];}}
  this.cloud=this.speakers.map(c=>{const v=this.space.vector(c.features,'contrast');return v?[v[0],v[1],c.group]:null;}).filter(Boolean);
 }
 score(features){
  if(!this.available)return null;
  const raw=AcousticSpace.raw(features);if(!raw.every(finite))return null;
  const projected=this.space.projectRaw(raw,this.space.projections.contrast.axes),score=this.toScore(projected[0]);
  if(!finite(score))return null;
  const vector=this.space.vector(features,'contrast');
  const display=Math.round(clamp(score,-SCALE_LIMIT,SCALE_LIMIT));
  return {version:SCORE_VERSION,score,display,verdict:verdictOf(display),point:vector?[vector[0],vector[1]]:null,features:Object.fromEntries(METRIC_KEYS.map(k=>[k,features[k]]))};
 }
}
const PARAM={f0:'f0',delta_f:'df',hnr:'hnr',balance:'bal',pitch_span:'sp'};
export function resultParams(features,lang){const p=new URLSearchParams({v:String(SCORE_VERSION),l:lang});for(const k of METRIC_KEYS)p.set(PARAM[k],Number(features[k]).toFixed(METRIC_DIGITS[k]+1));return p;}
export function parseResultParams(params){const features={};for(const k of METRIC_KEYS){if(!params.has(PARAM[k]))return null;const v=Number(params.get(PARAM[k]));if(!finite(v))return null;features[k]=v;}return {features,lang:params.get('l')||'ja',version:Number(params.get('v'))||1};}
export function shareText(result){return `私の声は${VERDICTS[result.verdict]}でした（${LEANINGS[result.verdict]} ${formatScore(result.display)}）`;}
