import assert from 'node:assert/strict';
import {personalEstimate,cosineDistance} from './web/perception.js';
const vector=x=>{const v=Array(512).fill(0);v[0]=Math.cos(x);v[1]=Math.sin(x);return v;};
const rows=Array.from({length:12},(_,i)=>({key:'ref:'+i,speaker:'s'+i,language:'ja',ratings:{femininity:i/2},descriptor:{version:'test',embedding:vector(i/15)}}));
const target={key:'own:new',speaker:'self',language:'ja',descriptor:{version:'test',embedding:vector(.4)}};
assert.equal(personalEstimate(rows.slice(0,7),target,'femininity').reason,'few');
assert.equal(personalEstimate(rows.map(r=>({...r,speaker:'same'})),target,'femininity').speakers,1);
assert.equal(personalEstimate(rows,{...target,language:'en'},'femininity').speakers,0);
assert.equal(personalEstimate(rows,target,'age').ready,false);
const result=personalEstimate(rows,target,'femininity');
assert.ok(result.ready);assert.ok(result.mae<result.baseline);assert.ok(Math.abs(result.estimate-3)<1);
assert.equal(personalEstimate(rows.map(r=>({...r,ratings:{femininity:3}})),target,'femininity').reason,'validation');
assert.ok(cosineDistance(vector(.4),vector(.4).map(x=>2*x))<1e-12);
assert.equal(cosineDistance([],[]),Infinity);
console.log('PASS: speaker-held-out validation, language isolation, insufficient labels, baseline rejection, cosine normalization');

const repeat={...target,speaker:rows[0].speaker,key:'ref:another'};
assert.deepEqual(personalEstimate(rows,repeat,'femininity'),personalEstimate(rows.slice(1),repeat,'femininity'));
