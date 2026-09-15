import {finite,quantile} from './math.js';
/* Robust, speaker-balanced PCA. Gender labels do not enter the projection. */
export class AcousticSpace {
 static keys=['f0','delta_f','hnr','balance','pitch_span'];
 static raw(f){return AcousticSpace.keys.map(k=>k==='f0'?(f?.[k]>0?12*Math.log2(f[k]):NaN):f?.[k]);}
 constructor(samples){
  const rows=samples.map(s=>AcousticSpace.raw(s.features)).filter(v=>v.every(finite));
  this.center=AcousticSpace.keys.map((_,k)=>quantile(rows.map(v=>v[k]),.5)||0);
  this.scale=AcousticSpace.keys.map((_,k)=>Math.max([1,30,2,2,1][k],(quantile(rows.map(v=>v[k]),.75)-quantile(rows.map(v=>v[k]),.25))/1.349||0));
  const z=rows.map(v=>v.map((x,k)=>(x-this.center[k])/this.scale[k]));
  this.mean=AcousticSpace.keys.map((_,k)=>z.reduce((s,v)=>s+v[k],0)/Math.max(1,z.length));
  const covariance=AcousticSpace.keys.map((_,i)=>AcousticSpace.keys.map((_,j)=>z.reduce((s,v)=>s+(v[i]-this.mean[i])*(v[j]-this.mean[j]),0)/Math.max(1,z.length-1)));
  const a=covariance.map(r=>[...r]),v=Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>+(i===j)));
  for(let n=0;n<150;n++){
   let p=0,q=1;for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}
   if(Math.abs(a[p][q])<1e-10)break;
   const theta=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(theta),s=Math.sin(theta),ap=a[p][p],aq=a[q][q],cross=a[p][q];
   a[p][p]=c*c*ap-2*s*c*cross+s*s*aq;a[q][q]=s*s*ap+2*s*c*cross+c*c*aq;a[p][q]=a[q][p]=0;
   for(let k=0;k<5;k++){if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp-s*kq;a[k][q]=a[q][k]=s*kp+c*kq;}const vp=v[k][p],vq=v[k][q];v[k][p]=c*vp-s*vq;v[k][q]=s*vp+c*vq;}
  }
  const order=[0,1,2,3,4].sort((i,j)=>a[j][j]-a[i][i]);
  this.values=order.map(i=>Math.max(0,a[i][i]));
  this.axes=order.map(i=>{const axis=v.map(r=>r[i]);const biggest=axis.reduce((b,x,k)=>Math.abs(x)>Math.abs(axis[b])?k:b,0);return axis.map(x=>x*(axis[biggest]<0?-1:1));});
  const projected=rows.map(r=>this.projectRaw(r));
  this.bounds=[0,1,2].map(k=>{const vals=projected.map(v=>v[k]);const low=quantile(vals,.01),high=quantile(vals,.99),pad=Math.max(.7,(high-low)*.28);return finite(low)?[low-pad,high+pad]:[-3,3];});
 }
 standardized(f){const v=AcousticSpace.raw(f);return v.every(finite)?v.map((x,k)=>(x-this.center[k])/this.scale[k]):null;}
 projectRaw(raw){const z=raw.map((x,k)=>(x-this.center[k])/this.scale[k]-this.mean[k]);return this.axes.map(a=>a.reduce((s,v,k)=>s+v*z[k],0));}
 vector(f){const raw=AcousticSpace.raw(f);if(!raw.every(finite))return null;return this.projectRaw(raw).slice(0,3).map((x,k)=>(x-this.bounds[k][0])/(this.bounds[k][1]-this.bounds[k][0]));}
 distance(a,b){const x=this.standardized(a),y=this.standardized(b);return x&&y?Math.sqrt(x.reduce((s,v,k)=>s+(v-y[k])**2,0)):Infinity;}
 explained(n=2){return this.values.slice(0,n).reduce((a,b)=>a+b,0)/(this.values.reduce((a,b)=>a+b,0)||1);}
}
window.AcousticSpace=AcousticSpace;
