"""Build the deck from src/index.src.html + assets/img/.

Outputs
  dist/vanilla-cupcakes.html  claude.ai Artifact version: a page *fragment* (no <html>/<head>);
                              the Artifact host wraps it in its own document skeleton.
  dist/site/index.html        Standalone website version (Cloudflare Pages etc.): full HTML
                              document with <!doctype>, <meta charset="utf-8"> and viewport.
                              Deploy THIS file to a normal web host, never the fragment
                              (without a charset the browser shows mojibake such as "1Ã—").
  dist/site/read/index.html     Read & Check student page (iPad), website only.
  dist/site/teacher/index.html  Teacher score page, website only.

Pages may contain the placeholder comment READCORE (written as /*{{READCORE}}*/);
it is replaced by src/read-core.js so the pure logic stays testable with node.

Images are embedded once, as a JS map of data: URIs (IMG), and assigned to every
<img data-img="name.webp"> at start-up, so a picture used on several slides is not duplicated.
Source images (png/jpg) are converted to WebP at build time.

Usage:  python3 tools/build.py
Needs:  Pillow
"""
import base64
import io
import json
import pathlib
import re

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'index.src.html'
IMG_DIR = ROOT / 'assets' / 'img'
DIST = ROOT / 'dist'


def image_map(src_text):
    used = sorted(set(re.findall(r'([\w]+\.webp)', src_text)))
    imap = {}
    for name in used:
        stem = name[:-5]
        f = next((IMG_DIR / (stem + e) for e in ('.png', '.jpg') if (IMG_DIR / (stem + e)).exists()), None)
        if not f:
            raise SystemExit(f'missing image for {name} in {IMG_DIR}')
        buf = io.BytesIO()
        Image.open(f).save(buf, 'WEBP', quality=88, method=6)
        imap[name] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
    return imap


def standalone(fragment):
    """Wrap the Artifact fragment into a complete HTML document."""
    body = fragment.split('\n', 1)[1] if fragment.startswith('<meta charset') else fragment
    style_end = body.index('</style>') + len('</style>')
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            + body[:style_end] + '\n</head>\n<body>\n' + body[style_end:] + '\n</body>\n</html>\n')


SRC_DIR = ROOT / 'src'
CORE = SRC_DIR / 'read-core.js'
# Extra website pages: (source file in src/, output folder under dist/site/)
PAGES = [('read.src.html', 'read'), ('teacher.src.html', 'teacher')]


def render(src):
    """Fill the image map and inline the shared read-aloud logic."""
    out = src.replace('{{IMGMAP}}', json.dumps(image_map(src)))
    if '/*{{READCORE}}*/' in out:
        out = out.replace('/*{{READCORE}}*/', CORE.read_text(encoding='utf-8'))
    return out


def main():
    site = DIST / 'site'
    site.mkdir(parents=True, exist_ok=True)
    out = render(SRC.read_text(encoding='utf-8'))
    (DIST / 'vanilla-cupcakes.html').write_text(out, encoding='utf-8')
    (site / 'index.html').write_text(standalone(out), encoding='utf-8')
    print(f'deck: artifact {round(len(out) / 1024)} KB -> dist/vanilla-cupcakes.html, site -> dist/site/index.html')
    for name, folder in PAGES:
        page = render((SRC_DIR / name).read_text(encoding='utf-8'))
        (site / folder).mkdir(exist_ok=True)
        (site / folder / 'index.html').write_text(standalone(page), encoding='utf-8')
        print(f'{name}: {round(len(page) / 1024)} KB -> dist/site/{folder}/index.html')

if __name__ == '__main__':
    main()
