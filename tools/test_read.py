"""E2E check for the Read & Check pages with a fake speech engine and a mocked API.

Serves dist/site over http (relative /api/* URLs need an origin), drives the student
flow on an iPad-sized viewport, checks the uploads, screenshots each screen and fails
on any page error.

Usage:  python tools/test_read.py [out_dir]      (default: ./screenshots/read)
Needs:  playwright + Chromium. Locally: pip install playwright && python -m playwright install chromium
        In the Claude cloud sandbox Chromium is preinstalled at /opt/pw-browsers.
"""
import asyncio
import functools
import http.server
import json
import pathlib
import sys
import threading

from playwright.async_api import async_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'dist' / 'site'
CARDS = ['1', '2', '3', '4-1', '4-2', '5', '6']
SLIDES = ['s-step1', 's-step2', 's-step3', 's-step41', 's-step42', 's-step5', 's-step6']  # deck slide per card

# Records speechSynthesis calls instead of speaking; each utterance 'ends' after 30 ms.
FAKE_TTS = '''
window.__spoken = [];
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
  getVoices: () => [], cancel() {}, addEventListener() {},
  speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend({}), 30); },
} });
'''

# Speaks at a fixed 60 ms per letter, fires start/end but no word boundaries.
TIMED_TTS = '''
window.__ended = 0;
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
  getVoices: () => [], cancel() {}, addEventListener() {},
  speak(u) {
    setTimeout(() => { u.onstart && u.onstart({}); }, 50);
    setTimeout(() => { window.__endAt = performance.now(); window.__ended++; u.onend && u.onend({}); }, 50 + u.text.length * 60);
  },
} });
'''


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(SITE))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


async def student(page, base, out, posted):
    await page.goto(base + '/read/?engine=fake')
    await page.click('#groupPad button:text-is("3")')
    await page.click('#seatPad button:text-is("12")')
    assert await page.inner_text('#seatShow') == '12'
    await page.screenshot(path=str(out / '1-seat.png'))
    await page.click('#startBtn')
    slide = page.frame_locator('#slideFrame')
    await expect(slide.locator('#navbtns')).to_be_hidden()  # embed mode: no deck chrome
    for i, card in enumerate(CARDS):
        await expect(slide.locator('.slide.is-active')).to_have_id(SLIDES[i], timeout=15000)
        if i == 0:
            await page.click('#listenBtn')  # model reading goes through the slide's voice
        await page.click('#readBtn')
        await page.wait_for_selector('#nextBtn:not([hidden])', timeout=15000)
        if i == 0:
            assert await page.locator('#sentence .w.bad').count() + await page.locator('#cardTitle .w.bad').count() == 1
            assert '★' in await page.inner_text('#stars')
            await page.screenshot(path=str(out / '2-card-result.png'))
            await page.click('#againBtn')  # second reading of card 1
            await page.wait_for_selector('#nextBtn:not([hidden])', timeout=15000)
        await page.click('#nextBtn')
    await page.wait_for_selector('[data-screen="summary"]:not([hidden])')
    assert 'All 7 steps read!' in await page.inner_text('#sumBadge')
    await page.wait_for_timeout(800)  # confetti + upload queue
    await page.screenshot(path=str(out / '3-summary.png'))
    assert [p['card'] for p in posted] == CARDS, posted
    assert posted[0]['attempts'] == 2 and posted[1]['attempts'] == 1, posted
    assert all(p['grp'] == 3 and p['seat'] == 12 for p in posted), posted
    await page.click('#nextKid')
    assert await page.is_visible('[data-screen="seat"]')
    assert await page.is_disabled('#startBtn')
    # the group is remembered after a reload
    await page.reload()
    assert await page.is_visible('[data-screen="seat"]')


async def teacher(page, base, out):
    await page.goto(base + '/teacher/')
    await page.wait_for_selector('#groups table')
    assert await page.locator('#groups section.grp').count() == 2   # groups 1 and 3
    g3 = await page.inner_text('#groups section.grp:has-text("Group 3")')
    assert '7 / 7' in g3, g3
    g1 = page.locator('#groups section.grp:has-text("Group 1")')
    assert '1 / 7' in await g1.inner_text()                           # card 2 is below "read"
    await g1.locator('tr.seat').first.click()                          # open the weak words
    detail = await g1.locator('tr.detail').inner_text()
    assert 'whisk' in detail and '<img' in detail, detail                # shown as text
    assert await page.locator('#groups img').count() == 0                # never parsed as HTML
    await page.screenshot(path=str(out / '4-teacher.png'), full_page=True)


async def deck_voice(browser, base, out, errors):
    """The class deck: Read together speaks the sentence, the speaker button reads the script."""
    page = await browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append('deck: ' + str(e)))
    await page.add_init_script(FAKE_TTS)
    await page.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await page.goto(base + '/#8')
    await page.wait_for_timeout(1200)
    await page.click('#s-step1 .read-row button')
    await page.wait_for_timeout(300)
    spoken = await page.evaluate('window.__spoken')
    assert spoken[-1] == 'Mix milk and honey. Heat and let it cool.', spoken
    await page.click('#nbVoice')
    await page.wait_for_function("document.querySelector('#nbVoice').getAttribute('aria-pressed') === 'false'", timeout=10000)
    spoken = await page.evaluate('window.__spoken')
    assert "Now, let's look at step one." in spoken, spoken
    assert 'Group 1, please read Step 1 together.' in spoken, spoken      # grey cue removed
    assert not any(t.startswith('Lab:') for t in spoken), spoken           # cue-only lines skipped
    await page.screenshot(path=str(out / '5-deck-step1.png'))
    await page.close()

    # A voice without word-boundary events (like many online voices): after one sentence the
    # highlight should learn the speed, so the last word lights close to when the speech ends.
    page = await browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append('deck: ' + str(e)))
    await page.add_init_script(TIMED_TTS)
    await page.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await page.goto(base + '/#8')
    await page.wait_for_timeout(1200)
    btn = '#s-step1 .read-row button'
    await page.click(btn)
    await page.wait_for_function('window.__ended === 1', timeout=10000)
    await page.wait_for_timeout(1500)
    await page.evaluate("""() => {
      const ws = [...document.querySelectorAll('#s-step1 .instr p .w')];
      window.__lastLit = 0;
      new MutationObserver(() => { if (ws[ws.length - 1].classList.contains('lit') && !window.__lastLit) window.__lastLit = performance.now(); })
        .observe(ws[ws.length - 1], { attributes: true });
    }""")
    await page.click(btn)
    await page.wait_for_function('window.__ended === 2', timeout=10000)
    gap = await page.evaluate('window.__endAt - window.__lastLit')
    assert 0 <= gap < 600, f'last word lit {gap:.0f} ms before the speech ended'
    await page.close()


async def main(out):
    out.mkdir(parents=True, exist_ok=True)
    httpd = serve()
    base = f'http://127.0.0.1:{httpd.server_address[1]}'
    errors, posted = [], []

    async def api(route):
        url = route.request.url
        if url.endswith('/api/score'):
            posted.append(json.loads(route.request.post_data))
            await route.fulfill(json={'ok': True})
        elif url.endswith('/api/token'):
            await route.fulfill(json={'error': 'config'})
        elif '/api/scores' in url:
            await route.fulfill(json={'day': '2026-10-30', 'rows': ROWS})
        else:
            await route.fulfill(status=404, json={'error': 'not_found'})

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1024, 'height': 768}, has_touch=True)  # iPad landscape
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        await page.route('**/api/**', api)
        # the fake engine does not need the Speech SDK; keep the test offline and fast
        await page.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(body='', content_type='application/javascript'))
        await page.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
        await student(page, base, out, posted)
        await teacher(page, base, out)
        await deck_voice(browser, base, out, errors)
        await browser.close()
    httpd.shutdown()
    if errors:
        print('PAGE ERRORS:', *errors, sep='\n')
        sys.exit(1)
    print('ok, screenshots in', out)


def row(seat, card, grp, stars, overall, completeness, weak=()):
    return {'seat': seat, 'card': card, 'grp': grp, 'stars': stars, 'overall': overall, 'accuracy': overall,
            'fluency': overall, 'completeness': completeness, 'prosody': overall, 'weak': list(weak),
            'attempts': 1, 'updated_at': 1793260800000}


# teacher-page sample data
ROWS = (
    [row(12, c, 3, 3, 90, 100) for c in CARDS]                                        # seat 12: all read
    + [row(5, '1', 1, 1, 55, 70, ['whisk', '<img src=x onerror=alert(1)>']),        # seat 5: weak words
       row(5, '2', 1, 0, 30, 40)]                                                    # not read (completeness 40)
)

if __name__ == '__main__':
    asyncio.run(main(pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'screenshots' / 'read'))
