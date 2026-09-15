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
                choose(page, 'take-select', 'download')
            assert download.value.suggested_filename.endswith('.wav')
            results.append('All saved take averages plotted; title menu restores; refresh preserves current; WAV download')
            page.locator('#live-mode').click()
            wait(page, 'voiceApp.state.recording')
            wait(page, 'voiceApp.state.liveTrack.length>20')
            assert page.locator('#live-mode-label').inner_text() == 'ライブ中'
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
            page.keyboard.press('Escape')
            wait(page, '!voiceApp.state.recording&&!voiceApp.state.busy')
            assert page.locator('#loopback').get_attribute('aria-pressed') == 'false'
            assert not page.evaluate('voiceApp.captureDebug().monitoring')
            assert page.locator('#loopback').is_disabled()
            assert page.locator('#live-mode-label').inner_text() == 'ライブ'
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
            page.evaluate('(id)=>voiceApp.selectSample(voiceApp.state.clips.find(c=>c.id===id),true)', first)
            wait(page, '!!voiceApp.state.refFull&&voiceApp.state.selected.localLibrary')
            assert page.evaluate('document.querySelector("#reference-player").src.startsWith("blob:")')
            wait(page, '!document.querySelector("#reference-player").paused')
            page.locator('#play-reference').click()
            page.evaluate('voiceApp.selectRange("ref",[0,1])')
            wait(page, 'voiceApp.state.ref?.duration===1')
            page.reload()
            wait(page, '!!window.voiceApp?.state.refFull&&voiceApp.state.imported.length===2')
            assert page.evaluate('voiceApp.state.selected.localLibrary')
            results.append('Official JVS ZIP import, checksum verification, local playback, selected-range analysis, refresh persistence')
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
