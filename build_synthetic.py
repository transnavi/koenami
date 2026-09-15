"""Generate public practice phrases and measure every synthetic reference."""
import asyncio,json,hashlib
from pathlib import Path
import edge_tts
import soundfile as sf
from acoustics import measure
ROOT=Path(__file__).parent
TEXTS={
 'ja':['今日はいい天気ですね。少し散歩に出かけませんか。','おはようございます。今日もよろしくお願いします。','では、授業を始めます。分からないところがあったら聞いてください。','ありがとうございます。またお会いできるのを楽しみにしています。'],
 'zh-CN':['今天天气很好。我们一起出去走走吧。','早上好，很高兴见到你。今天有什么计划？','谢谢你的帮助。我们下次再见。'],
 'en':['It is a lovely day. Would you like to go for a walk?','Good morning. It is nice to see you again.','Thank you for your help. I hope we can talk again soon.'],
 'ko':['오늘 날씨가 좋네요. 같이 산책하러 갈까요?','안녕하세요. 다시 만나서 반가워요.','도와주셔서 감사합니다. 다음에 또 만나요.']}
async def main():
 voices=await edge_tts.list_voices();clips=[]
 for lang,texts in TEXTS.items():
  locale={'ja':'ja-JP','zh-CN':'zh-CN','en':'en-US','ko':'ko-KR'}[lang]
  selected=[v for v in voices if v['Locale']==locale]
  selected=([v for v in selected if v['Gender']=='Female'][:4]+[v for v in selected if v['Gender']=='Male'][:2])
  print(lang,'synthetic voices',len(selected),flush=True)
  for voice in selected:
   for i,text in enumerate(texts):
    name=voice['ShortName'];id='tts-'+hashlib.sha256((name+text).encode()).hexdigest()[:14];path=ROOT/'data/samples'/f'{id}.mp3'
    if not path.exists():
     for attempt in range(3):
      try:
       await edge_tts.Communicate(text,name).save(str(path));break
      except Exception:
       path.unlink(missing_ok=True)
       if attempt==2:raise
    x,sr=sf.read(path);m=measure(x,sr)
    f=m['features'];ok=m.get('formant_seconds',0)>=.35 and 'delta_f' in f and m.get('resonance_sensitivity_pct',100)<=12
    clips.append({'id':id,'speaker':name,'group':'synthetic','synthetic':True,'language':lang,'voice_label':voice['Gender'].lower(),'name':name.split('-')[2].replace('Neural',''),'text':text,'audio':'/samples/'+path.name,'duration':m['duration'],'features':f,'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak'),'voiced_seconds':m['voiced_seconds'],'formant_seconds':m.get('formant_seconds',0),'plotted':ok,'reason':None if ok else 'Unstable resonance estimate.','source':'https://github.com/rany2/edge-tts','engine':'Microsoft Edge neural TTS / edge-tts 7.2.8','sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
  (ROOT/'data/synthetic.json').write_text(json.dumps({'clips':clips},ensure_ascii=False))
  print(lang,'generated',len(clips),flush=True)
asyncio.run(main())
