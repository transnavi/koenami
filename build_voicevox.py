"""Generate Japanese practice references with VOICEVOX CORE on CUDA."""
from pathlib import Path
import hashlib,json,time
import numpy as np
import soundfile as sf
from voicevox_core.blocking import Onnxruntime,OpenJtalk,Synthesizer,VoiceModelFile
from acoustics import measure,mono16
ROOT=Path(__file__).parent
BASE=ROOT/'.models/voicevox'
PHRASES=[
 'おはようございます。今日もよろしくお願いします。',
 '今日はいい天気ですね。少し散歩に出かけませんか。',
 'ありがとうございます。それでは、また明日お会いしましょう。',
 'すみません、駅までの道を教えていただけますか。',
 'このお店のケーキ、おいしかったね。今度は一緒に行こう。',
 '週末は何をしていましたか。私は家で本を読んでいました。'
]
VOICES=[(0,2,'四国めたん','female'),(0,8,'春日部つむぎ','female'),(0,10,'雨晴はう','female'),(1,14,'冥鳴ひまり','female'),(2,16,'九州そら','female'),(3,61,'中国うさぎ','female'),(4,11,'玄野武宏','male'),(9,12,'白上虎太郎','male'),(14,67,'栗田まろん','androgynous')]
def main():
 rt=Onnxruntime.load_once(filename=str(next((BASE/'runtime').rglob(Onnxruntime.LIB_RECOMMENDED_VERSIONED_FILENAME))))
 syn=Synthesizer(rt,OpenJtalk(str(next((BASE/'dict').glob('open_jtalk*')))),acceleration_mode='GPU',cpu_num_threads=2)
 assert syn.is_gpu_mode
 print('VOICEVOX CUDA enabled',flush=True)
 clips=[];loaded=None;model_id=None
 for file,style,name,group in VOICES:
  if file!=loaded:
   if model_id:syn.unload_voice_model(model_id)
   with VoiceModelFile.open(str(BASE/f'models/vvms/{file}.vvm')) as m:syn.load_voice_model(m);model_id=m.id
   loaded=file
  for text in PHRASES:
   id='voicevox-'+hashlib.sha256(f'0.17.0:{style}:{text}'.encode()).hexdigest()[:16];path=ROOT/'data/samples'/f'{id}.wav'
   if not path.exists():path.write_bytes(syn.tts(text,style))
   x,rate=sf.read(path,dtype='float32');m=measure(mono16(x,rate));f=m['features'];ok=m.get('formant_seconds',0)>=.3 and np.isfinite(f.get('delta_f') or float('nan')) and m.get('resonance_sensitivity_pct',m.get('tracking_sensitivity',0))<=12
   clips.append({'id':id,'speaker':f'voicevox-{name}','name':f'VOICEVOX:{name}','group':group,'voice_label':group,'group_source':'Voice character description; not a listener rating','synthetic':True,'language':'ja','style':'ノーマル','text':text,'audio':'/samples/'+path.name,'duration':m['duration'],'features':f,'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak'),'voiced_seconds':m['voiced_seconds'],'formant_seconds':m.get('formant_seconds',0),'plotted':bool(ok),'reason':None if ok else 'Unstable resonance estimate.','source':'https://voicevox.hiroshiba.jp/','credit':f'VOICEVOX:{name}','engine':'VOICEVOX CORE 0.17.0 / VVM 0.16.4 / CUDA','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'license':'VOICEVOX and character voice library terms; credit required'})
  print(name,len(PHRASES),'clips',flush=True)
 dest=ROOT/'data/voicevox.json';tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps({'version':1,'engine':'VOICEVOX CORE 0.17.0','clips':clips},ensure_ascii=False,allow_nan=False));tmp.replace(dest)
 print('DONE',len(clips),'clips;',sum(c['plotted'] for c in clips),'mapped',flush=True)
if __name__=='__main__':main()
