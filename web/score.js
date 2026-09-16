import {finite,quantile,clamp} from './math.js';
import {AcousticSpace} from './space.js';
/* Shareable result: where a voice sits on the female–male contrast axis of the
   current language's reference speakers, plus the five raw measurements.
   The scale is linear along that axis, anchored on the two group medians
   (25 = male median, 75 = female median, 50 = halfway) so a number can be read
   without the plot; the display clamps to 0–100. Bump SCORE_VERSION whenever the
   axis, anchors or verdict bands change; old result URLs carry their version. */
export const SCORE_VERSION=1;
export const METRIC_KEYS=['f0','delta_f','hnr','balance','pitch_span'];
export const METRIC_LABELS={f0:'高さ',delta_f:'響き',hnr:'質感',balance:'明るさ',pitch_span:'抑揚'};
export const METRIC_UNITS={f0:'Hz',delta_f:'Hz ΔF',hnr:'dB',balance:'dB',pitch_span:'半音'};
export const METRIC_DIGITS={f0:0,delta_f:0,hnr:1,balance:1,pitch_span:1};
export const VERDICTS={female:'女性的な声',androgynous:'中間的な声',male:'男性的な声'};
export function distance2(a,b){return finite(a?.f0)&&finite(a?.delta_f)&&finite(b?.f0)&&finite(b?.delta_f)?(12*Math.log2(a.f0/b.f0)/4)**2+((a.delta_f-b.delta_f)/90)**2:Infinity;}
/* One clip per labeled human speaker: the clip nearest that speaker's median pitch and resonance. */
export function representatives(clips){const by=new Map();for(const c of clips.filter(c=>c.plotted&&!c.synthetic&&['female','male'].includes(c.group))){if(!by.has(c.speaker))by.set(c.speaker,[]);by.get(c.speaker).push(c);}return [...by.values()].map(group=>{const f=quantile(group.map(c=>c.features.f0),.5),d=quantile(group.map(c=>c.features.delta_f),.5);return [...group].sort((a,b)=>distance2(a.features,{f0:f,delta_f:d})-distance2(b.features,{f0:f,delta_f:d}))[0];});}
export function verdictOf(score){return score>=65?'female':score<=35?'male':'androgynous';}
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
  const toScore=v=>25+50*(v-this.anchors.male)/(this.anchors.female-this.anchors.male);
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
  const display=Math.round(clamp(score,0,100));
  return {version:SCORE_VERSION,score,display,verdict:verdictOf(display),point:vector?[vector[0],vector[1]]:null,features:Object.fromEntries(METRIC_KEYS.map(k=>[k,features[k]]))};
 }
}
const PARAM={f0:'f0',delta_f:'df',hnr:'hnr',balance:'bal',pitch_span:'sp'};
export function resultParams(features,lang){const p=new URLSearchParams({v:String(SCORE_VERSION),l:lang});for(const k of METRIC_KEYS)p.set(PARAM[k],Number(features[k]).toFixed(METRIC_DIGITS[k]+1));return p;}
export function parseResultParams(params){const features={};for(const k of METRIC_KEYS){if(!params.has(PARAM[k]))return null;const v=Number(params.get(PARAM[k]));if(!finite(v))return null;features[k]=v;}return {features,lang:params.get('l')||'ja',version:Number(params.get('v'))||1};}
export function shareText(result){return `私の声は${VERDICTS[result.verdict]}でした（女性度 ${result.display}）`;}
