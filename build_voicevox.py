"""Generate Japanese practice references with VOICEVOX CORE on CUDA.

Phrases already synthesised under data/samples are measured without the
synthesizer, so the library rebuilds on a machine without VOICEVOX or CUDA.
"""
from pathlib import Path
import hashlib,json,math
from engine import measure_files,version
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
class Voicevox:
 """The synthesizer, loaded on first use."""
 def __init__(self):self.syn=None;self.loaded=None;self.model_id=None
 def tts(self,file,style,text):
  from voicevox_core.blocking import Onnxruntime,OpenJtalk,Synthesizer,VoiceModelFile
  if self.syn is None:
   rt=Onnxruntime.load_once(filename=str(next((BASE/'runtime').rglob(Onnxruntime.LIB_RECOMMENDED_VERSIONED_FILENAME))))
   self.syn=Synthesizer(rt,OpenJtalk(str(next((BASE/'dict').glob('open_jtalk*')))),acceleration_mode='GPU',cpu_num_threads=2)
   assert self.syn.is_gpu_mode
   print('VOICEVOX CUDA enabled',flush=True)
  if file!=self.loaded:
   if self.model_id:self.syn.unload_voice_model(self.model_id)
   with VoiceModelFile.open(str(BASE/f'models/vvms/{file}.vvm')) as m:self.syn.load_voice_model(m);self.model_id=m.id
   self.loaded=file
  return self.syn.tts(text,style)
def main():
 voicevox=Voicevox();phrases=[]
 for file,style,name,group in VOICES:
  for text in PHRASES:
   id='voicevox-'+hashlib.sha256(f'0.17.0:{style}:{text}'.encode()).hexdigest()[:16];path=ROOT/'data/samples'/f'{id}.wav'
   if not path.exists():path.write_bytes(voicevox.tts(file,style,text))
   phrases.append((style,name,group,text,id,path))
 measured=measure_files(p[5] for p in phrases);clips=[]
 for style,name,group,text,id,path in phrases:
   m=measured[str(path)];f=m['features'];ok=m.get('formant_seconds',0)>=.3 and math.isfinite(f.get('delta_f') or float('nan')) and m.get('resonance_sensitivity_pct',m.get('tracking_sensitivity',0))<=12
   clips.append({'id':id,'speaker':f'voicevox-{name}','name':f'VOICEVOX:{name}','group':group,'voice_label':group,'group_source':'Voice character description; not a listener rating','synthetic':True,'language':'ja','style':'ノーマル','text':text,'audio':'/samples/'+path.name,'duration':m['duration'],'features':f,'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak'),'voiced_seconds':m['voiced_seconds'],'formant_seconds':m.get('formant_seconds',0),'plotted':bool(ok),'reason':None if ok else 'Unstable resonance estimate.','source':'https://voicevox.hiroshiba.jp/','credit':f'VOICEVOX:{name}','engine':'VOICEVOX CORE 0.17.0 / VVM 0.16.4 / CUDA','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'license':'VOICEVOX and character voice library terms; credit required'})
 dest=ROOT/'data/voicevox.json';tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps({'version':version(),'engine':'VOICEVOX CORE 0.17.0','clips':clips},ensure_ascii=False,allow_nan=False));tmp.replace(dest)
 print('DONE',len(clips),'clips;',sum(c['plotted'] for c in clips),'mapped',flush=True)
if __name__=='__main__':main()
