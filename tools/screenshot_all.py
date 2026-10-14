"""Smoke test: open the built site in headless Chromium, screenshot every slide,
exercise a few labs, and report page errors.

Usage:  python3 tools/screenshot_all.py [out_dir]      (default: ./screenshots)
Needs:  playwright (Chromium). In the Claude cloud sandbox Chromium is preinstalled
        at /opt/pw-browsers; do not run `playwright install` there.
"""
import asyncio
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'dist' / 'site' / 'index.html'


async def main(out):
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        await page.goto(SITE.as_uri())
        await page.wait_for_timeout(5500)  # let the help bar fade
        total = await page.evaluate("document.querySelectorAll('.slide').length")
        for i in range(total):
            await page.wait_for_timeout(2400)  # entrance animations
            await page.screenshot(path=str(out / f'slide-{i + 1:02d}.png'))
            await page.click('#nbNext')
        # Fast mode: Step 6 bake (16 min) must finish in ~5 s; Skip must work
        await page.goto(SITE.as_uri() + '#14')
        await page.reload()
        await page.wait_for_timeout(1500)
        await page.click('#s-step6 [data-a="fillall"]', force=True)
        await page.wait_for_timeout(1800)
        await page.click('#s-step6 [data-a="bake"]', force=True)
        await page.wait_for_timeout(1000)
        await page.click('#s-step6 .skip', force=True)
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(out / 'check-step6-skipped.png'))
        await browser.close()
    print('\n'.join(errors) if errors else f'{total} slides, no page errors')


if __name__ == '__main__':
    asyncio.run(main(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'screenshots')))
