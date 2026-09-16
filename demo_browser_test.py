"""Browser checks for persistent takes, microphone monitoring and user-imported JVS."""
import argparse
import io
import json
import re
import traceback
import time
import zipfile
from pathlib import Path

import soundfile as sf
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent


def wait(page, js):
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        if page.evaluate(js):return
        page.wait_for_timeout(100)
    raise AssertionError('Timed out waiting for: '+js+'; notice: '+page.locator('#notice').inner_text())


def choose(page, name, value):
    page.locator(f'#{name} button.trigger').click()
    page.locator(f'#{name} button.item[data-value="{value}"]').click()


def take_action(page, action, value='0'):
    page.locator('#take-select button.trigger').click()
    page.locator(f'#take-select button.row-action[data-value="{value}"][data-action="{action}"]').click()


def main(url):
    index = json.loads((ROOT / 'data/jvs-import-index.json').read_text())['clips']
    # Public test audio only; never upload the user's private recordings.
    demo = json.loads((ROOT / '.deploy/data/native-ja.json').read_text())['clips'][0]
    audio, rate = sf.read(ROOT / 'data/samples' / Path(demo['audio']).name)
    fixture = Path('/tmp/koenami-demo-microphone.wav')
    sf.write(fixture, audio, rate)
    entries = [c for c in index if c['plotted']][:2]
    archive = Path('/tmp/koenami-jvs-import-test.zip')
    with zipfile.ZipFile(ROOT / 'research/jvs_ver1.zip') as source, zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
        for clip in entries:
            out.writestr(clip['member'], source.read(clip['member']))
    results = []
    with sync_playwright() as p:
        exe = max((Path.home()/'.cache/ms-playwright').glob('chromium-*/chrome-linux*/chrome'), key=lambda file: file.stat().st_mtime)
        browser = p.chromium.launch(executable_path=str(exe), headless=True, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + str(fixture)])
        try:
            context = browser.new_context(viewport={'width': 1440, 'height': 960}, permissions=['microphone'], accept_downloads=True)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url + '/ja/')
            wait(page, '!!window.voiceApp?.state.refFull')
            assert page.evaluate('!voiceApp.state.selected.synthetic && !voiceApp.state.ownFull')
            complete_jvs=page.evaluate('voiceApp.state.clips.filter(c=>c.dataset==="JVS").length>=5000')
            assert page.locator('#jvs-banner').is_visible() != complete_jvs
            if not complete_jvs:
                assert 'drive.google.com/file/d/' in page.locator('#jvs-download').get_attribute('href')
                page.locator('#jvs-banner-import').click()
                assert page.locator('#import-dialog').is_visible()
                page.locator('#import-dialog [data-close]').click()
            results.append('Fresh session selects human reference; no private baseline')
            for _ in range(2):
                page.locator('#upload').set_input_files(str(fixture))
                wait(page, 'voiceApp.state.ownPCM!==null&&!voiceApp.state.busy')
            assert page.evaluate('voiceApp.state.takes.length') == 2
            hidden_difference=page.evaluate('''()=>{
              const space=voiceApp.map.space,keys=space.constructor.keys,a=voiceApp.state.ownFull.features;
              const raw=space.constructor.raw(a).map((v,k)=>v+space.projections.variance.axes[4][k]*space.scale[k]);
              const b=Object.fromEntries(keys.map((k,i)=>[k,k==='f0'?2**(raw[i]/12):raw[i]]));
              return space.comparison(a,b,3);
            }''')
            assert abs(hidden_difference['distance']-1)<1e-8 and hidden_difference['displayedShare']<1e-8
            page.locator('#report-button').click()
            assert '図に表示' in page.locator('#report-content').inner_text()
            assert '/ 100' not in page.locator('#report-content .report-score').inner_text()
            page.locator('#report-dialog [data-close]').click()
            assert page.locator('#wave, #own-seek').count()==0
            assert page.locator('#state').is_hidden()
            box=page.locator('#signal-canvas').bounding_box()
            duration=page.evaluate('voiceApp.state.ownFull.duration')
            middle=box['x']+38+(box['width']-48)*.5
            page.mouse.click(middle,box['y']+18)
            wait(page,f'Math.abs(document.querySelector("#player").currentTime-{duration*.5})<.04')
            page.locator('#signal-canvas').focus()
            page.keyboard.press('ArrowRight')
            wait(page,f'Math.abs(document.querySelector("#player").currentTime-{duration*.5+.1})<.04')
            page.mouse.move(box['x']+38+(box['width']-48)*.2,box['y']+18)
            page.mouse.down()
            page.mouse.move(box['x']+38+(box['width']-48)*.7,box['y']+18,steps=8)
            page.mouse.up()
            wait(page,'!!voiceApp.state.ranges.own')
            selection=page.evaluate('voiceApp.state.ranges.own')
            assert abs(selection[0]-duration*.2)<.03 and abs(selection[1]-duration*.7)<.03
            assert page.locator('#range-reset').is_visible()
            page.keyboard.press('Escape')
            wait(page,'!voiceApp.state.ranges.own')
            assert page.locator('#range-reset').is_hidden()
            page.evaluate('voiceApp.selectRange("own",[0,1])')
            wait(page,'!!voiceApp.state.ranges.own')
            page.locator('#range-reset').click()
            wait(page,'!voiceApp.state.ranges.own')
            assert page.evaluate('voiceApp.state.own===voiceApp.state.ownFull')
            assert page.evaluate('async()=>!(await voiceApp.TakeStore.read()).current.range')
            results.append('One waveform timeline supports seeking, keyboard navigation, and range selection; duplicate footer controls removed')
            wait(page, 'voiceApp.map.samples.some(c=>c.group==="own-history")')
            current = page.evaluate('voiceApp.state.ownTakeId')
            page.reload()
            wait(page, '!!window.voiceApp?.state.ownFull')
            assert page.evaluate('voiceApp.state.ownTakeId') == current
            assert page.evaluate('voiceApp.state.takes.length') == 2
            assert page.evaluate('voiceApp.map.samples.filter(c=>c.group==="own-history").length') == 1
            choose(page, 'take-select', '1')
            wait(page, f'voiceApp.state.ownTakeId!=="{current}"')
            with page.expect_download() as download:
                take_action(page,'download')
            assert download.value.suggested_filename.endswith('.wav')
            results.append('All saved take averages plotted; title menu restores; refresh preserves current; WAV download')
            active_id=page.evaluate('voiceApp.state.ownTakeId')
            old_id=page.evaluate('voiceApp.state.takes.find(t=>t.id!==voiceApp.state.ownTakeId).id')
            with page.expect_download() as older_download:
                take_action(page,'download','1')
            assert older_download.value.suggested_filename.endswith('.wav')
            assert page.evaluate('voiceApp.state.ownTakeId')==active_id
            page.locator('#play-mine').click()
            wait(page,'!document.querySelector("#player").paused')
            take_action(page,'delete','1')
            wait(page,'!voiceApp.state.busy')
            assert page.evaluate('voiceApp.state.ownTakeId')==active_id
            assert not page.evaluate('document.querySelector("#player").paused')
            assert page.evaluate('(id)=>voiceApp.TakeStore.read("recording:"+id)',old_id) is None
            assert page.evaluate('document.activeElement===document.querySelector("#take-select")')
            page.locator('#play-mine').click()
            results.append('Each history row downloads or deletes its own take without switching or pausing the current recording')

            page.evaluate('document.querySelector("#settings-dialog").showModal()')
            page.locator('#live-shape-window').fill('2')
            assert page.locator('#live-shape-duration').inner_text()=='2 秒'
            page.locator('#settings-dialog [data-close]').click()
            page.evaluate('''()=>{const shape=voiceApp.map.shape;voiceApp.map.shape=function(track,color,own,...rest){if(own)window.liveShapeTimes=track.map(p=>p.t);return shape.call(this,track,color,own,...rest);};}''')
            page.locator('#live-mode').click()
            wait(page, 'voiceApp.state.recording')
            wait(page, 'voiceApp.state.liveTrack.length>20')
            assert page.locator('#live-mode-label').inner_text() == '測定中'
            assert page.locator('#live-time').is_visible()
            assert not page.evaluate('voiceApp.captureDebug().monitoring')
            page.locator('#loopback').click()
            wait(page, 'voiceApp.captureDebug().monitoring')
            page.locator('#loopback').click()
            wait(page, '!voiceApp.captureDebug().monitoring')
            page.locator('#loopback').click()
            camera = page.evaluate('({zoom:voiceApp.map.zoom,camera:voiceApp.map.camera,yaw:voiceApp.map.yaw})')
            page.wait_for_timeout(1500)
            assert page.evaluate('({zoom:voiceApp.map.zoom,camera:voiceApp.map.camera,yaw:voiceApp.map.yaw})') == camera
            wait(page,'voiceApp.state.ownFull.duration>6&&window.liveShapeTimes?.length>6&&window.liveShapeTimes[0]>3')
            assert page.evaluate('liveShapeTimes.at(-1)-liveShapeTimes[0]')<=2
            page.keyboard.press('Escape')
            wait(page, '!voiceApp.state.recording&&!voiceApp.state.busy')
            assert page.locator('#loopback').get_attribute('aria-pressed') == 'false'
            assert not page.evaluate('voiceApp.captureDebug().monitoring')
            assert page.locator('#loopback').is_disabled()
            assert page.locator('#live-mode-label').inner_text() == 'リアルタイム'
            results.append('Live label and timer persist; monitoring toggles and disconnects; live camera stays fixed')
            held=[]
            page.route('**/api/analyze', lambda route: held.append(route))
            page.evaluate('voiceApp.state.capabilities.maxSeconds=2')
            page.locator('#record').click()
            wait(page,'voiceApp.state.recording')
            wait(page,'!voiceApp.state.recording&&!voiceApp.state.busy&&voiceApp.state.ownFull.analysisPending')
            wait(page,'voiceApp.state.analyzing.has(voiceApp.state.ownTakeId)')
            pending_id=page.evaluate('voiceApp.state.ownTakeId')
            assert not page.locator('#play-mine').is_disabled()
            assert page.evaluate('async ()=>!!(await voiceApp.TakeStore.read("recording:"+voiceApp.state.ownTakeId))?.pcm')
            page.locator('#play-mine').click()
            wait(page,'!document.querySelector("#player").paused')
            page.evaluate('voiceApp.state.capabilities.maxSeconds=60')
            page.locator('#record').click()
            wait(page,'voiceApp.state.recording')
            assert len(held)==1
            response=held[0].fetch()
            held[0].fulfill(response=response)
            wait(page,f'!voiceApp.state.analyzing.has("{pending_id}")')
            assert page.evaluate('voiceApp.state.recording')
            page.keyboard.press('Escape')
            wait(page,'!voiceApp.state.recording&&!voiceApp.state.busy')
            assert page.evaluate('voiceApp.state.ownTakeId')==pending_id
            assert not page.evaluate('voiceApp.state.ownFull.analysisPending||false')
            assert page.evaluate('voiceApp.state.ownFull.duration')==2
            page.unroute('**/api/analyze')
            results.append('Recording is saved and playable before analysis; a new capture survives the previous result; cancel restores its completed analysis')
            page.evaluate('voiceApp.state.capabilities.maxSeconds=2')
            page.route('**/api/analyze', lambda route: route.fulfill(status=503,body='Temporarily busy'))
            before_count=page.evaluate('voiceApp.state.takes.length')
            page.locator('#record').click()
            wait(page,'voiceApp.state.recording')
            wait(page,'!voiceApp.state.recording&&!voiceApp.state.busy')
            wait(page,'!voiceApp.state.analyzing.has(voiceApp.state.ownTakeId)')
            assert page.evaluate('voiceApp.state.ownPCM.length')==32000
            assert page.evaluate('voiceApp.state.ownFull.analysisPending')
            assert page.evaluate('voiceApp.state.takes.length')==before_count+1
            pending_id=page.evaluate('voiceApp.state.ownTakeId')
            page.unroute('**/api/analyze')
            choose(page,'take-select','retry')
            wait(page,'!voiceApp.state.busy&&!voiceApp.state.ownFull.analysisPending')
            assert page.evaluate('voiceApp.state.ownTakeId')==pending_id
            assert page.evaluate('voiceApp.state.takes.length')==before_count+1
            page.evaluate('voiceApp.state.capabilities.maxSeconds=60')
            results.append('Automatic recording cap trims exactly; failed analysis preserves PCM; retry updates the same take')
            page.evaluate('''()=>{
              voiceApp.state.capabilities.maxSeconds=2;
              const save=voiceApp.TakeStore.saveRecording;
              voiceApp.TakeStore.saveRecording=function(...args){this.saveRecording=save;throw new DOMException('Temporary storage failure','QuotaExceededError');};
            }''')
            before_count=page.evaluate('voiceApp.state.takes.length')
            page.locator('#record').click()
            wait(page,'voiceApp.state.recording')
            wait(page,'!voiceApp.state.recording&&!voiceApp.state.busy')
            assert page.evaluate('voiceApp.state.ownFull.analysisPending')
            assert not page.locator('#play-mine').is_disabled()
            assert page.evaluate('voiceApp.state.takes.length')==before_count
            pending_id=page.evaluate('voiceApp.state.ownTakeId')
            choose(page,'take-select','retry')
            wait(page,'!voiceApp.state.busy&&!voiceApp.state.ownFull.analysisPending&&!voiceApp.state.analyzing.size')
            assert page.evaluate('voiceApp.state.ownTakeId')==pending_id
            assert page.evaluate('voiceApp.state.takes.length')==before_count+1
            assert page.evaluate('async()=>!!(await voiceApp.TakeStore.read("recording:"+voiceApp.state.ownTakeId))?.detail.features.f0')
            page.evaluate('voiceApp.state.capabilities.maxSeconds=60')
            results.append('Transient storage failure preserves playback; retry saves and analyses the same recording')
            page.locator('#add-reference').click()
            page.locator('#jvs-zip').set_input_files(str(archive))
            wait(page, 'voiceApp.state.imported.length===2&&!voiceApp.state.busy&&!voiceApp.state.loadingLanguage')
            page.locator('#import-dialog [data-close]').click()
            first = entries[0]['id']
            page.evaluate('''()=>{const player=document.querySelector("#reference-player");player.playedForCheck=false;player.addEventListener("playing",()=>player.playedForCheck=true,{once:true});}''')
            page.evaluate('(id)=>voiceApp.selectSample(voiceApp.state.clips.find(c=>c.id===id),true)', first)
            wait(page, '!!voiceApp.state.refFull&&voiceApp.state.selected.localLibrary')
            assert page.evaluate('document.querySelector("#reference-player").src.startsWith("blob:")')
            assert page.evaluate('document.querySelector("#reference-player").playedForCheck')
            page.evaluate('document.querySelector("#reference-player").pause()')
            page.evaluate('voiceApp.selectRange("ref",[0,1])')
            wait(page, 'voiceApp.state.ref?.duration===1')
            page.reload()
            wait(page, '!!window.voiceApp?.state.refFull&&voiceApp.state.imported.length===2')
            assert page.evaluate('voiceApp.state.selected.localLibrary')
            assert page.evaluate('voiceApp.map.liveShapeSeconds')==2
            results.append('Official JVS ZIP import, checksum verification, local playback, selected-range analysis, refresh persistence')
            held=[]
            page.route('**/api/analyze',lambda route:held.append(route))
            page.evaluate('voiceApp.state.capabilities.maxSeconds=2')
            page.locator('#record').click()
            wait(page,'voiceApp.state.recording')
            wait(page,'!voiceApp.state.recording&&!voiceApp.state.busy&&voiceApp.state.analyzing.has(voiceApp.state.ownTakeId)')
            deleted_id=page.evaluate('voiceApp.state.ownTakeId')
            page.evaluate('''()=>{const remove=voiceApp.TakeStore.deleteRecording;voiceApp.TakeStore.deleteRecording=function(){this.deleteRecording=remove;throw new Error('Temporary storage failure');};}''')
            take_action(page,'delete')
            wait(page,'!voiceApp.state.busy')
            assert page.evaluate('voiceApp.state.ownTakeId')==deleted_id
            assert page.evaluate('(id)=>!!voiceApp.state.takes.find(t=>t.id===id)',deleted_id)
            take_action(page,'delete')
            wait(page,f'!voiceApp.state.busy&&voiceApp.state.ownTakeId!=="{deleted_id}"')
            assert page.evaluate('(id)=>voiceApp.TakeStore.read("recording:"+id)',deleted_id) is None
            assert len(held)==1
            response=held[0].fetch()
            held[0].fulfill(response=response)
            wait(page,f'!voiceApp.state.analyzing.has("{deleted_id}")')
            assert not page.evaluate('(id)=>voiceApp.state.takes.some(t=>t.id===id)||voiceApp.map.samples.some(t=>t.recordingId===id)',deleted_id)
            page.unroute('**/api/analyze')
            # Every remaining stored take can be deleted from the same title menu.
            while page.evaluate('!!voiceApp.state.ownTakeId'):
                take_action(page,'delete')
                wait(page,'!voiceApp.state.busy')
            assert page.evaluate('voiceApp.state.takes.length')==0
            assert page.evaluate('voiceApp.TakeStore.read("recording-index")')==[]
            assert page.evaluate('voiceApp.TakeStore.read()')=={'current':None,'previous':None}
            page.reload()
            wait(page,'!!window.voiceApp?.state.refFull')
            assert page.evaluate('!voiceApp.state.ownFull&&!voiceApp.state.ownTakeId&&!voiceApp.map.samples.some(t=>t.group==="own-history")')
            results.append('History deletion removes audio and plotted averages; pending analysis cannot restore a deleted take; deleting the last take survives refresh')
            for width, height in [(1440,960),(1280,800),(390,844)]:
                page.set_viewport_size({'width':width,'height':height})
                page.wait_for_timeout(200)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.set_viewport_size({'width':1440,'height':960})
            page.locator('#theme-button').click()
            page.screenshot(path='/tmp/koenami-demo-check.png')
            assert not errors, errors
            results.append('Desktop/mobile fit, dark theme, no page errors')
            print(json.dumps({'url':url,'passed':results},ensure_ascii=False),flush=True)
            (ROOT / 'test-output/demo-browser.json').write_text(json.dumps({'url':url,'passed':results},ensure_ascii=False,indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://localhost:8766')
    args = parser.parse_args()
    try:
        main(args.url.rstrip('/'))
    except Exception:
        print(re.sub(r'/home/[^/\s]+', '/home/<username>', traceback.format_exc()).replace(Path.home().name, '<username>'))
        raise SystemExit(1)
