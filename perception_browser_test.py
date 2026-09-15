"""Browser checks for listening ratings and speaker search. Uses public reference fixtures."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
def wait(page,expression):
    page.wait_for_function(expression,timeout=90000)

def main():
    with sync_playwright() as p:
        exe=max((Path.home()/'.cache/ms-playwright').glob('chromium-*/chrome-linux*/chrome'),key=lambda f:f.stat().st_mtime)
        browser=p.chromium.launch(executable_path=str(exe),headless=True,args=['--no-proxy-server'])
        try:
            context=browser.new_context(viewport={'width':1440,'height':960},accept_downloads=True)
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            descriptor={'version':'wavlm-sv-int8-v2','embedding':[1.]+[0.]*511,'age':{'estimate':30}}
            failing=[True]
            def inference(route):
                route.fulfill(status=503,body='Test inference unavailable') if failing[0] else route.fulfill(json=descriptor)
            page.route('**/api/perception/**',inference)
            page.route('**/api/perception',inference)
            page.goto('http://localhost:8766/ja/')
            wait(page,'!!window.voiceApp?.state.refFull')
            assert page.locator('.transport #live-mode').count()==1
            for query in ['JVS002','jvs 002']:
                page.locator('#search').fill(query)
                assert page.locator('.speaker-folder').count()==1
                assert 'jvs002' in page.locator('.speaker-folder').get_attribute('data-speaker')
            page.locator('#search').fill('F263')
            assert page.locator('.speaker-folder').count()==1
            page.locator('.speaker-folder summary').click()
            assert page.locator('.sample-row').count()==3
            page.locator('.sample-row').first.click()
            wait(page,'voiceApp.state.selected.speaker==="641429ff339d" && !!voiceApp.state.refFull')
            page.locator('#perception-button').click()
            page.locator('#rating-retry').wait_for(state='visible')
            page.locator('#rating-save').click()
            assert page.evaluate('voiceApp.TakeStore.read("listener-ratings")')==[]
            page.locator('#rating-input-femininity').fill('5')
            page.locator('#rating-save').click()
            wait(page,'document.getElementById("rating-status").textContent==="保存しました"')
            rows=page.evaluate('voiceApp.TakeStore.read("listener-ratings")')
            assert len(rows)==1 and rows[0]['ratings']=={'femininity':5} and rows[0]['descriptor'] is None
            failing[0]=False
            page.locator('#rating-retry').click()
            wait(page,'document.getElementById("rating-status").textContent===""')
            rows=page.evaluate('voiceApp.TakeStore.read("listener-ratings")')
            assert rows[0]['descriptor']['version']==descriptor['version']
            page.locator('.rating-details summary').click()
            assert 'あと8人' in page.locator('#rating-estimates').inner_text()
            # Explicit labels focus the range; clearing a field retains keyboard focus.
            page.locator('label[for=rating-input-naturalness]').click()
            assert page.evaluate('document.activeElement.id')=='rating-input-naturalness'
            page.locator('#rating-input-naturalness').fill('4')
            page.get_by_role('button',name='自然さの評価を消す',exact=True).click()
            assert page.evaluate('document.activeElement.id')=='rating-input-naturalness'
            page.locator('#perception-dialog [data-close]').click()
            # Separate tabs update different rows atomically.
            other=context.new_page();other.goto('http://localhost:8766/ja/');wait(other,'!!window.voiceApp?.state.refFull')
            other.evaluate('voiceApp.TakeStore.updateRating("ref:other-tab",()=>({key:"ref:other-tab",speaker:"other",ratings:{naturalness:4}}))')
            page.locator('#perception-button').click()
            page.locator('#rating-input-masculinity').fill('1')
            page.locator('#rating-save').click()
            wait(page,'document.getElementById("rating-status").textContent==="保存しました"')
            assert len(page.evaluate('voiceApp.TakeStore.read("listener-ratings")'))==2
            page.locator('#perception-dialog [data-close]').click()
            # A failed read disables writes and preserves all saved rows.
            page.evaluate('''()=>{const store=voiceApp.TakeStore,read=store.read;store.read=function(key){if(key==="listener-ratings"){this.read=read;return Promise.reject(Error("Read failure"));}return read.call(this,key);};}''')
            page.locator('#perception-button').click()
            wait(page,'document.getElementById("rating-status").textContent.includes("読み込めません")')
            assert page.locator('#rating-save').is_disabled()
            assert len(page.evaluate('voiceApp.TakeStore.read("listener-ratings")'))==2
            page.locator('#rating-retry').click()
            wait(page,'!document.getElementById("rating-save").disabled')
            page.locator('#rating-delete').click()
            wait(page,'document.getElementById("rating-status").textContent==="評価を削除しました"')
            assert [r['key'] for r in page.evaluate('voiceApp.TakeStore.read("listener-ratings")')]==['ref:other-tab']
            page.locator('#perception-dialog [data-close]').click()
            page.locator('#settings-button').click()
            with page.expect_download() as event:page.locator('#rating-export').click()
            assert event.value.suggested_filename=='koenami-listener-ratings.json'
            page.locator('#settings-dialog [data-close]').click()
            page.reload();wait(page,'!!window.voiceApp?.state.refFull')
            assert len(page.evaluate('voiceApp.TakeStore.read("listener-ratings")'))==1
            # A deleted recording cannot be recreated by a late rating response.
            assert not page.evaluate('voiceApp.TakeStore.updateRating("own:deleted",()=>({key:"own:deleted",ratings:{age:30}})).then(rows=>rows.some(r=>r.key==="own:deleted"))')
            # Removing the last inspected own take must not launch another inference.
            fixture=json.loads(Path('.deploy/data/native-ja.json').read_text())['clips'][0]
            page.locator('#upload').set_input_files(str(Path('data/samples')/Path(fixture['audio']).name))
            wait(page,'voiceApp.state.ownPCM!==null&&!voiceApp.state.busy')
            own_id=page.evaluate('voiceApp.state.ownTakeId')
            page.locator('#perception-button').click();page.locator('#rating-own').click()
            wait(page,'document.getElementById("rating-status").textContent===""')
            page.locator('#rating-input-naturalness').fill('3');page.locator('#rating-save').click()
            wait(page,'document.getElementById("rating-status").textContent==="保存しました"')
            page.locator('#perception-dialog [data-close]').click()
            requests=[];page.on('request',lambda request:requests.append(request.url) if '/api/perception' in request.url else None)
            page.evaluate('(id)=>voiceApp.TakeStore.deleteRecording(id)',own_id)
            assert not page.evaluate('(id)=>voiceApp.TakeStore.read("listener-ratings").then(rows=>rows.some(r=>r.key==="own:"+id))',own_id)
            page.wait_for_timeout(150)
            assert not requests
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#perception-button').click()
            wait(page,'!document.getElementById("rating-save").disabled')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            box=page.locator('.transport #live-mode').bounding_box()
            assert box and box['x']>=0 and box['x']+box['width']<=390
            # Skipping without rating keeps advancing through distinct voices.
            seen=[]
            for _ in range(3):
                seen.append(page.evaluate('voiceApp.state.selected.id'))
                page.locator('#rating-next').click()
                wait(page,'document.getElementById("rating-status").textContent===""')
            assert len(set(seen))==3
            # Corrupt rating data does not block deleting the audio itself.
            page.locator('#perception-dialog [data-close]').click()
            page.evaluate('voiceApp.TakeStore.write({bad:true},"listener-ratings")')
            page.evaluate('voiceApp.TakeStore.deleteRecording("missing")')
            assert not errors,errors
            print('PASS: speaker IDs, transport Live, untouched ratings, persistence, descriptor retry, cross-tab atomic saves, read-failure recovery, deletion, export, keyboard focus, mobile layout')
        finally:browser.close()

if __name__=='__main__':main()
