import {finite,quantile,clamp} from './math.js';
import {AcousticSpace} from './space.js';
import {translator} from './i18n/index.js';
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
/* Labels come from the interface language's catalogue; the Worker renders result pages in the language of the link. */
export const metricLabel=(key,lang='ja')=>translator(lang)(`metric.${key}.label`);
export const metricUnit=(key,lang='ja')=>translator(lang)(`metric.${key}.unit`);
export const METRIC_DIGITS={f0:0,delta_f:0,hnr:1,balance:1,pitch_span:1};
export const verdictLabel=(verdict,lang='ja')=>translator(lang)(`verdict.${verdict}`);
export const leaningLabel=(verdict,lang='ja')=>translator(lang)(`leaning.${verdict}`);
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
 {key:'voiced_seconds',unit:'seconds',min:1,digits:1},
 {key:'formant_seconds',unit:'seconds',min:.35,digits:2},
 {key:'clipping_fraction',unit:'%',max:.005,scale:100,digits:2},
 {key:'resonance_sensitivity_pct',unit:'%',max:12,digits:0},
];
/* Returns null when the measurement passes, otherwise the first failing check with its value. */
export function gateFailure(detail,lang='ja'){
 const t=translator(lang);
 if(!detail)return {label:t('gate.none')};
 for(const g of GATE){const raw=detail[g.key];const v=finite(raw)?raw:(g.min!==undefined?0:0);const shown=(v*(g.scale||1)).toFixed(g.digits),unit=g.unit==='seconds'?t('gate.seconds'):g.unit,label=t(`gate.${g.key}`);
  if(g.min!==undefined&&v<g.min)return {label,value:`${shown} ${unit}`,need:t('gate.min',{value:String(g.min),unit})};
  if(g.max!==undefined&&v>g.max)return {label,value:`${shown} ${unit}`,need:t('gate.max',{value:String(g.max*(g.scale||1)),unit})};}
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
/* extra.age (years) is optional and only travels when the user chose to include it. */
export function resultParams(features,lang,extra={}){const p=new URLSearchParams({v:String(SCORE_VERSION),l:lang});for(const k of METRIC_KEYS)p.set(PARAM[k],Number(features[k]).toFixed(METRIC_DIGITS[k]+1));if(finite(extra.age)&&extra.age>=5&&extra.age<=100)p.set('age',String(Math.round(extra.age)));return p;}
export function parseResultParams(params){const features={};for(const k of METRIC_KEYS){if(!params.has(PARAM[k]))return null;const v=Number(params.get(PARAM[k]));if(!finite(v))return null;features[k]=v;}const age=Number(params.get('age'));return {features,lang:params.get('l')||'ja',version:Number(params.get('v'))||1,age:params.has('age')&&finite(age)&&age>=5&&age<=100?Math.round(age):undefined};}
export function shareText(result,lang='ja'){return translator(lang)('share.text',{verdict:verdictLabel(result.verdict,lang),leaning:leaningLabel(result.verdict,lang),score:formatScore(result.display)});}
export const ageText=(years,lang='ja')=>translator(lang)('share.age_years',{n:Math.round(years)});
