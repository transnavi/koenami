export const finite = x => typeof x === 'number' && Number.isFinite(x);
export const quantile = (a,p) => {if(!a.length)return NaN;const b=[...a].sort((x,y)=>x-y),i=(b.length-1)*p;return b[Math.floor(i)]+(b[Math.ceil(i)]-b[Math.floor(i)])*(i%1);};
export const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export const AXES={f0:{label:'Pitch',unit:'Hz',min:65,max:500,log:true,ticks:[80,120,180,260,380]},delta_f:{label:'Resonance',unit:'Hz ΔF',min:650,max:1500,ticks:[700,900,1100,1300,1500]},hnr:{label:'Texture',unit:'dB HNR',min:-5,max:30,ticks:[0,10,20,30]},balance:{label:'Balance',unit:'dB',min:-40,max:5,ticks:[-40,-30,-20,-10,0]},pitch_span:{label:'Variation',unit:'st',min:0,max:22,ticks:[0,5,10,15,20]}};
