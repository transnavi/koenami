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
            # Ratings by keyboard: digits act on the active row, arrows move rows.
            page.keyboard.press('5'); page.keyboard.press('ArrowDown'); page.keyboard.press('1'); page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown'); page.keyboard.press('6')
            assert page.evaluate('reviewApp.ratings') == {'femininity': 5, 'masculinity': 1, 'japanese': 6}
            page.keyboard.press('5'); page.keyboard.press('ArrowUp'); page.keyboard.press('3'); page.keyboard.press('3')
            assert page.evaluate('reviewApp.ratings') == {'femininity': 5, 'masculinity': 1, 'japanese': 5}
            # Age is a decade choice: digits 1-6 pick 10代以下 … 60代以上, 0 does nothing.
            page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown'); page.keyboard.press('0'); page.keyboard.press('2')
            assert page.evaluate('reviewApp.ratings.age') == 20 and page.locator('.scale[data-active=true] output').inner_text() == '20代'
            page.keyboard.press('2'); assert page.evaluate('reviewApp.ratings.age') is None
            page.locator('.scale[data-active=true] .steps button', has_text='60代以上').click(); assert page.evaluate('reviewApp.ratings.age') == 60
            # Flags: pronunciation flags are exclusive, clip flags accumulate.
            page.keyboard.press('n'); page.keyboard.press('m'); page.keyboard.press('z'); page.keyboard.press('e')
            assert page.evaluate('[...reviewApp.chosen]') == ['native_like', 'noise', 'no_speech']
            page.locator('#clip-flags button[aria-pressed=true]').first.click()
            assert page.evaluate('[...reviewApp.chosen]') == ['native_like', 'noise']
            # Clip navigation stays within the speaker.
            if first['clips'] > 1:
                page.keyboard.press('ArrowRight'); assert page.evaluate('reviewApp.clip') == (page.evaluate('reviewApp.queue[0].clips.findIndex(c=>c.id===reviewApp.queue[0].first)') + 1) % first['clips']
            page.locator('#note').fill('テスト'); page.keyboard.press('Enter')
            wait(page, 'reviewApp.at===1')
            assert saved[0]['speaker'] == first['speaker'] and saved[0]['flags'] == ['native_like', 'noise'] and saved[0]['ratings'] == {'femininity': 5, 'masculinity': 1, 'japanese': 5, 'age': 60} and saved[0]['note'] == 'テスト'
            assert saved[0]['language'] == 'ja' and saved[0]['clip'].startswith('common_voice_ja_')
            assert 'テスト' in page.locator('#log').inner_text() and '聞こえる年齢 60代以上' in page.locator('#log').inner_text()
            # Skipping advances without a save; an empty save is refused.
            page.keyboard.press('s'); assert page.evaluate('reviewApp.at') == 2 and len(saved) == 1
            page.keyboard.press('Enter'); assert len(saved) == 1 and page.locator('#status').inner_text() != ''
            assert page.evaluate('reviewApp.ratings') == {} and page.evaluate('reviewApp.chosen.size') == 0
            # The main app no longer carries a rating panel or neural capability.
            page.goto(url + '/ja/'); wait(page, '!!window.voiceApp?.state.refFull')
            assert page.locator('#perception-button').count() == 0 and page.locator('#perception-dialog').count() == 0
            for query in ['JVS002', 'jvs 002']:
                page.locator('#search').fill(query)
                assert page.locator('.speaker-folder').count() == 1
                assert 'jvs002' in page.locator('.speaker-folder').get_attribute('data-speaker')
            page.locator('#search').fill('F263'); assert page.locator('.speaker-folder').count() == 1
            assert not errors, errors
            print(json.dumps({'passed': ['Review queue orders unreviewed female speakers first', 'Keyboard ratings, exclusive pronunciation flags, clip flags', 'Save posts the review and advances; skip and empty save do not', 'Main app has no rating panel; speaker search works']}, ensure_ascii=False))
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--url', default='http://localhost:8766'); main(parser.parse_args().url)
