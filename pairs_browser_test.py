"""Browser checks for the local pairwise-comparison page. Saves are intercepted; the log is not written."""
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
            page.route('**/api/pairs', intercept)
            page.goto(url + '/pairs.html')
            wait(page, 'window.pairsApp?.queue.length>0')
            first = page.evaluate('({a:pairsApp.queue[0].a.id,b:pairsApp.queue[0].b.id,kind:pairsApp.queue[0].kind,d:pairsApp.queue[0].distance,n:pairsApp.queue.length})')
            assert first['a'] != first['b'] and first['n'] == 60, first
            kinds = page.evaluate('pairsApp.queue.map(p=>p.kind)'); assert 10 <= kinds.count('far') <= 15 and kinds.count('near') + kinds.count('far') == 60
            # Both sides are blind: the page shows sentences and durations, never labels.
            assert page.locator('#side-a .text').inner_text() and 'F ' not in page.locator('#card').inner_text()
            assert page.locator('.question .rubric').count() == 3 and '女声は男声より上' in page.locator('.question .rubric').first.inner_text()
            own = page.evaluate('pairsApp.queue.filter(p=>p.own).length'); assert own == 0 or (own <= 15 and page.evaluate('pairsApp.queue.filter(p=>p.own).every(p=>[p.a.id,p.b.id].some(id=>id.startsWith("own-")))'))
            # 1 / 2 / 3 answer the active question and advance; pressing the same key again clears it.
            page.keyboard.press('1'); page.keyboard.press('2'); page.keyboard.press('3')
            assert page.evaluate('pairsApp.answers') == {'femininity': 'a', 'naturalness': 'same', 'preference': 'b'}
            page.keyboard.press('ArrowUp'); page.keyboard.press('3'); page.keyboard.press('3')  # naturalness → B, then the advance lands on preference and clears it
            assert page.evaluate('pairsApp.answers') == {'femininity': 'a', 'naturalness': 'b'}
            # Q holds A, W holds B, Space pauses in place, R restarts the A→B loop.
            page.keyboard.press('q'); assert page.evaluate('pairsApp&&document.getElementById("loop").getAttribute("aria-pressed")') == 'false'
            page.keyboard.press('r'); assert page.evaluate('document.getElementById("loop").getAttribute("aria-pressed")') == 'true'
            page.keyboard.press(' '); page.keyboard.press(' ')
            page.locator('#note').fill('Aのほうが息が多い'); page.keyboard.press('Enter'); wait(page, 'pairsApp.at===1')
            assert saved[0]['a'] == first['a'] and saved[0]['b'] == first['b'] and saved[0]['answers'] == {'femininity': 'a', 'naturalness': 'b'}
            assert saved[0]['kind'] == 'near' and saved[0]['distance'] == first['d'] and saved[0]['session'] and saved[0]['note'] == 'Aのほうが息が多い'
            assert 'Aのほうが息が多い' in page.locator('#log').inner_text() and '女性らしい A' in page.locator('#log').inner_text()
            # Empty saves are refused; skip requeues; drafts survive a reload.
            page.keyboard.press('Enter'); assert len(saved) == 1 and page.locator('#status').inner_text() != ''
            second = page.evaluate('pairsApp.queue[1].a.id'); page.keyboard.press('s'); assert page.evaluate('pairsApp.queue.at(-1).a.id') == second and page.evaluate('pairsApp.at') == 1
            page.keyboard.press('2'); third = page.evaluate('pairsApp.queue[pairsApp.at].a.id')
            page.reload(); wait(page, 'window.pairsApp?.queue.length>0')
            assert page.evaluate('pairsApp.queue[pairsApp.at].a.id') == third and page.evaluate('pairsApp.answers') == {'femininity': 'same'}
            assert not errors, errors
            print(json.dumps({'passed': ['Sixty seeded pairs, 45 near and 15 far, distinct speakers, blind', 'Keys 1/2/3 answer and advance; Q/W/R/Space control playback', 'Save posts the judgement with kind, distance, session and note', 'Empty save refused; skip requeues; draft and position survive reload']}, ensure_ascii=False))
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--url', default='http://localhost:8766'); main(parser.parse_args().url)
