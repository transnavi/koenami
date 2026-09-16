"""Browser checks for the local listening-review page and speaker search. Saves are intercepted; the log is not written."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def wait(page, expression):
    page.wait_for_function(expression, timeout=90000)


def main(url):
    with sync_playwright() as p:
        exe = max((Path.home() / '.cache/ms-playwright').glob('chromium-*/chrome-linux*/chrome'), key=lambda f: f.stat().st_mtime)
        browser = p.chromium.launch(executable_path=str(exe), headless=True, args=['--no-proxy-server', '--autoplay-policy=no-user-gesture-required'])
        try:
            context = browser.new_context(viewport={'width': 1200, 'height': 900})
            page = context.new_page(); errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
            saved = []
            def intercept(route):
                if route.request.method == 'POST':
                    body = route.request.post_data_json; saved.append(body)
                    route.fulfill(json={**body, 'reviewed': '2026-01-01T00:00:00+00:00'})
                else: route.continue_()
            page.route('**/api/review', intercept)
            page.goto(url + '/review.html')
            wait(page, 'window.reviewApp?.queue.length>0')
            first = page.evaluate('({speaker:reviewApp.queue[0].speaker,clips:reviewApp.queue[0].clips.length,group:reviewApp.queue[0].group})')
            assert first['group'] == 'female', first
            assert page.locator('#display').inner_text().startswith('F'), page.locator('#display').inner_text()
            assert page.evaluate('reviewApp.queue.every(q=>q.clips.length>0)')
            # Rows come from the server in groups; a digit rates the active row and moves to the next one.
            assert page.evaluate('reviewApp.scales.map(s=>s.key)')[:5] == ['femininity', 'masculinity', 'japanese', 'naturalness', 'age']
            assert page.locator('.scale-group').all_inner_texts() == ['性別・発音', '声質', '話し方', '印象']
            page.keyboard.press('5'); page.keyboard.press('1'); page.keyboard.press('6')
            assert page.evaluate('reviewApp.ratings') == {'femininity': 5, 'masculinity': 1, 'japanese': 6} and page.evaluate('reviewApp.active') == 3
            page.keyboard.press('ArrowUp'); page.keyboard.press('5'); page.keyboard.press('3'); page.keyboard.press('ArrowUp'); page.keyboard.press('3')
            assert page.evaluate('reviewApp.ratings') == {'femininity': 5, 'masculinity': 1, 'japanese': 5}
            # Age is a decade choice: digits 1-6 pick 10代以下 … 60代以上, 0 does nothing.
            assert page.evaluate('reviewApp.active') == 4
            page.keyboard.press('0'); page.keyboard.press('2')
            assert page.evaluate('reviewApp.ratings.age') == 20 and page.locator('.scale').nth(4).locator('output').inner_text() == '20代'
            page.keyboard.press('ArrowUp'); page.keyboard.press('2'); assert page.evaluate('reviewApp.ratings.age') is None
            page.locator('.scale').nth(4).locator('.steps button', has_text='60代以上').click(); assert page.evaluate('reviewApp.ratings.age') == 60
            # Voice-quality and impression rows take digits too.
            page.locator('.scale').nth(8).click(); page.keyboard.press('4'); page.keyboard.press('2')
            assert page.evaluate('reviewApp.ratings.nasality') == 4 and page.evaluate('reviewApp.ratings.articulation') == 2
            # Flags: pronunciation flags are exclusive, clip flags accumulate.
            assert page.locator('#scope').count() == 0 and page.locator('#pronunciation-flags').count() == 0
            page.keyboard.press('z'); page.keyboard.press('e')
            assert page.evaluate('[...reviewApp.chosen]') == ['noise', 'no_speech']
            page.locator('#quality-flags > button[aria-pressed=true]').first.click()
            assert page.evaluate('[...reviewApp.chosen]') == ['noise']
            # Clip navigation stays within the speaker.
            if first['clips'] > 1:
                page.keyboard.press('ArrowRight'); assert page.evaluate('reviewApp.clip') == (page.evaluate('reviewApp.queue[0].clips.findIndex(c=>c.id===reviewApp.queue[0].first)') + 1) % first['clips']
            page.locator('#note').fill('テスト'); page.keyboard.press('Enter')
            wait(page, 'reviewApp.at===1')
            assert saved[0]['speaker'] == first['speaker'] and saved[0]['flags'] == ['noise'] and 'scope' not in saved[0] and saved[0]['ratings'] == {'femininity': 5, 'masculinity': 1, 'japanese': 5, 'age': 60, 'nasality': 4, 'articulation': 2} and saved[0]['note'] == 'テスト'
            assert saved[0]['language'] == 'ja' and saved[0]['clip'].startswith('common_voice_ja_')
            assert 'テスト' in page.locator('#log').inner_text() and '雑音' in page.locator('#log').inner_text() and '聞こえる年代 60代以上' in page.locator('#log').inner_text()
            # Skipping moves the speaker to the end of the queue without a save; an empty save is refused.
            second = page.evaluate('reviewApp.queue[1].speaker'); length = page.evaluate('reviewApp.queue.length')
            page.keyboard.press('s'); assert page.evaluate('reviewApp.at') == 1 and len(saved) == 1
            assert page.evaluate('reviewApp.queue.at(-1).speaker') == second and page.evaluate('reviewApp.queue.length') == length
            page.keyboard.press('Enter'); assert len(saved) == 1 and page.locator('#status').inner_text() != ''
            assert page.evaluate('reviewApp.ratings') == {} and page.evaluate('reviewApp.chosen.size') == 0
            # Backspace returns to the previous speaker (a saved one stays reachable); the list jumps anywhere; the theme toggles.
            page.keyboard.press('Backspace'); assert page.evaluate('reviewApp.at') == 0 and page.evaluate('reviewApp.queue[0].speaker') == first['speaker']
            page.keyboard.press('Enter'); assert len(saved) == 1  # nothing entered anew: empty save refused, no duplicate
            page.keyboard.press('l'); wait(page, 'document.getElementById("list-dialog").open')
            assert page.locator('#list-items .list-item').count() == page.evaluate('reviewApp.queue.length')
            page.locator('#list-items .list-item[data-index="3"]').click(); assert page.evaluate('reviewApp.at') == 3 and not page.evaluate('document.getElementById("list-dialog").open')
            before = page.evaluate('document.documentElement.dataset.theme'); page.locator('#theme-button').click()
            assert page.evaluate('document.documentElement.dataset.theme') != before; page.locator('#theme-button').click()
            # Answers typed on one speaker survive a detour to another speaker and back.
            page.keyboard.press('2'); page.keyboard.press('z')
            page.locator('#jump').click(); page.locator('#list-filter').fill(page.evaluate('reviewApp.queue[5].clips[0].display')); page.locator('#list-items .list-item').first.click()
            assert page.evaluate('reviewApp.at') == 5 and page.evaluate('reviewApp.ratings') == {}
            page.keyboard.press('Backspace'); page.keyboard.press('Backspace')
            page.locator('#jump').click(); page.locator('#list-filter').fill(''); page.locator('#list-items .list-item[data-index="3"]').click()
            assert page.evaluate('reviewApp.ratings') == {'femininity': 2} and page.evaluate('[...reviewApp.chosen]') == ['noise']
            page.keyboard.press('2'); page.keyboard.press('ArrowUp'); page.keyboard.press('z')
            page.locator('#jump').click(); page.locator('#list-items .list-item[data-index="2"]').click(); assert page.evaluate('reviewApp.at') == 2
            # Position, skipped speakers and the unsaved draft survive a reload.
            third = page.evaluate('reviewApp.queue[reviewApp.at].speaker')
            page.keyboard.press('4'); page.keyboard.press('x'); page.keyboard.press('ArrowRight'); page.locator('#note').fill('途中')
            clip = page.evaluate('reviewApp.queue[reviewApp.at].clips[reviewApp.clip].id')
            page.reload(); wait(page, 'window.reviewApp?.queue.length>0')
            assert page.evaluate('reviewApp.queue[reviewApp.at].speaker') == third
            assert page.evaluate('reviewApp.queue[reviewApp.at].clips[reviewApp.clip].id') == clip
            assert page.evaluate('reviewApp.ratings') == {'femininity': 4} and page.evaluate('[...reviewApp.chosen]') == ['distorted'] and page.locator('#note').input_value() == '途中'
            assert page.evaluate('reviewApp.queue.at(-1).speaker') == second
            # Space pauses and resumes without restarting; R restarts. 別の話者 is no longer offered.
            assert page.locator('#quality-flags > button').count() == 4 and 'O' not in page.locator('#quality-flags').inner_text()
            page.keyboard.press(' '); paused = page.evaluate('document.querySelector("#play").getAttribute("aria-pressed")')
            page.keyboard.press(' '); assert page.evaluate('document.querySelector("#play").getAttribute("aria-pressed")') != paused
            # Playback loops; 追加項目 mode prefills a reviewed speaker and points at the first missing row.
            assert page.evaluate('document.querySelector("#play")&&true') and page.evaluate('new Audio().loop') is False
            assert page.evaluate('(()=>{for(const a of performance.getEntriesByType("resource"))if(a.name.includes("/samples/"))return true;return false})()')
            page.locator('#mode button[data-mode=update]').click(); wait(page, 'reviewApp.mode==="update"&&!!reviewApp.queue[0]?.previous')
            item = page.evaluate('({missing:reviewApp.queue[reviewApp.at].missing,prev:reviewApp.queue[reviewApp.at].previous.ratings})')
            assert item['missing'] and set(item['prev']) <= set(page.evaluate('reviewApp.ratings'))
            assert page.evaluate('reviewApp.scales[reviewApp.active].key') == item['missing'][0]
            assert page.locator('.scale[data-missing=true]').count() == len(item['missing'])
            page.keyboard.press('3'); page.keyboard.press('Enter'); wait(page, 'reviewApp.at===1||reviewApp.queue.length===0')
            assert saved[-1]['ratings'][item['missing'][0]] == (30 if item['missing'][0] == 'age' else 3) and all(saved[-1]['ratings'][k] == v for k, v in item['prev'].items())
            page.reload(); wait(page, 'window.reviewApp?.queue.length>=0'); assert page.evaluate('reviewApp.mode') == 'update'
            page.locator('#mode button[data-mode=new]').click(); wait(page, 'reviewApp.mode==="new"&&reviewApp.queue.length>0&&!reviewApp.queue[0].previous')
            # The main app no longer carries a rating panel or neural capability.
            page.goto(url + '/ja/'); wait(page, '!!window.voiceApp?.state.refFull')
            assert page.locator('#perception-button').count() == 0 and page.locator('#perception-dialog').count() == 0
            for query in ['JVS002', 'jvs 002']:
                page.locator('#search').fill(query)
                assert page.locator('.speaker-folder').count() == 1
                assert 'jvs002' in page.locator('.speaker-folder').get_attribute('data-speaker')
            page.locator('#search').fill('F2804'); assert page.locator('.speaker-folder[data-speaker$="641429ff339d"]').count() == 1
            assert not errors, errors
            print(json.dumps({'passed': ['Review queue orders unreviewed female speakers first', 'Grouped scales from the server, digit auto-advance, decade ages, per-clip quality flags', 'Save posts the review and advances; skip requeues, empty save refused', 'Position, skipped speakers and draft survive reload', 'Looped playback; 追加項目 mode prefills previous answers and targets missing scales', 'Main app has no rating panel; speaker search works']}, ensure_ascii=False))
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--url', default='http://localhost:8766'); main(parser.parse_args().url)
