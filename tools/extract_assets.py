"""Rebuild every image in assets/img/ from the original slide screenshots.

The deck's pictures (chef girl poses, cupcake circles, step photos, comic
panels) were cut out of the teacher's low-resolution slide screenshots in
references/original-slides/. This script records exactly how, so the assets
can be regenerated or re-cropped later.

Usage:  python3 tools/extract_assets.py [--out assets/img]
Needs:  Pillow, numpy, scipy

If the original high-resolution artwork becomes available, replace the files in
assets/img/ directly (same names) and skip this script.
"""
import argparse
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
SLIDES = ROOT / 'references' / 'original-slides'
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def slide(name):
    return Image.open(SLIDES / name).convert('RGB')


def cut_out(src, box, out, scale=3, thr=(232, 205, 190)):
    """Crop, upscale, and remove the peach grid background.

    Background = light pixels connected to the crop border (flood fill), so the
    white hat/face inside the outline survives. Only the largest remaining
    blob is kept (drops stray cherries/sparkles), edges are softened slightly.
    """
    im = slide(src).crop(box)
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    a = np.asarray(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r > thr[0]) & (g > thr[1]) & (b > thr[2]) & ((r - b) < 70)
    lab, _ = ndimage.label(bg)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    alpha = np.where(np.isin(lab, list(edge)), 0, 255).astype(np.uint8)
    lab2, n2 = ndimage.label(alpha > 0)
    if n2 > 1:
        sizes = ndimage.sum(np.ones_like(lab2), lab2, range(1, n2 + 1))
        alpha[lab2 != (np.argmax(sizes) + 1)] = 0
    alpha = ndimage.binary_erosion(alpha > 0, iterations=1).astype(np.uint8) * 255
    im.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8)))
    im = im.crop(im.getbbox())
    im.save(out, optimize=True)
    return im.size


def circle(src, center, r, out):
    """Round photo crop (the three 'Choose one' cupcakes), upscaled 3x."""
    cx, cy = center
    im = slide(src).crop((cx - r, cy - r, cx + r, cy + r)).resize((r * 6, r * 6), Image.LANCZOS)
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, r * 6 - 1, r * 6 - 1), fill=255)
    im.putalpha(m)
    im.save(out)
    return im.size


def box(src_img, b, out, s=3):
    im = src_img.crop(b)
    im = im.resize((im.width * s, im.height * s), Image.LANCZOS)
    im.save(out, quality=85)
    return im.size


def comic_panels(out_dir):
    """Cut the 6-step comic into panels and replace the Chinese timer labels
    (30秒 / 2分鐘 / 3分鐘) with English ones, because the deck is English only."""
    c = slide('05-recipe-comic.png')
    c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
    d = ImageDraw.Draw(c)
    font = ImageFont.truetype(FONT_BOLD, 26)
    font_p1 = ImageFont.truetype(FONT_BOLD, 28)
    labels = [  # (x0, y0, x1, y1) in original 622x347 coords, text, colour
        (195, 44, 218, 57, '30s', (255, 214, 120), font_p1),   # on the dark microwave display
        (487, 47, 517, 60, '2 min', (40, 40, 40), font),
        (584, 47, 616, 60, '3 min', (40, 40, 40), font),
        (62, 205, 86, 217, '2 min', (40, 40, 40), font),
    ]
    for x0, y0, x1, y1, text, colour, f in labels:
        X0, Y0, X1, Y1 = x0 * 3, y0 * 3, x1 * 3, y1 * 3
        d.rectangle((X0, Y0, X1, Y1), fill=c.getpixel((X0 - 3, Y0 - 3)))
        w = d.textlength(text, font=f)
        d.text(((X0 + X1) / 2 - w / 2, Y0 + 2), text, fill=colour, font=f)
    panels = {  # original-coordinate boxes (picture only, captions excluded)
        'p1': (11, 11, 222, 148), 'p2': (231, 11, 412, 148), 'p3a': (421, 11, 518, 148), 'p3b': (522, 11, 617, 148),
        'p4a': (11, 184, 112, 312), 'p4b': (116, 184, 208, 312), 'p5': (216, 184, 412, 318), 'p6': (421, 184, 617, 318),
    }
    for name, b in panels.items():
        c.crop(tuple(v * 3 for v in b)).save(out_dir / f'{name}.jpg', quality=85)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'assets' / 'img'))
    out = pathlib.Path(ap.parse_args().out)
    out.mkdir(parents=True, exist_ok=True)

    # chef girl poses (background removed)
    cut_out('01-title.png', (20, 30, 175, 220), out / 'girl_wave.png')
    cut_out('07-step1.png', (42, 6, 158, 128), out / 'girl_pin.png')
    cut_out('08-step2.png', (338, 4, 478, 133), out / 'girl_bowl.png')
    cut_out('10-step4-1.png', (340, 8, 474, 130), out / 'girl_spatula.png')
    cut_out('04-paste-and-match.png', (388, 152, 492, 282), out / 'girl_thumbs.png')
    # unused preview crop kept for completeness (rectangular, background not removed)
    t = slide('01-title.png').crop((20, 30, 175, 220)).resize((465, 570), Image.LANCZOS)
    t.save(out / 't_girl.png')

    # 'Choose one' cupcakes
    circle('02-choose-one.png', (95, 140), 62, out / 'cup1.png')
    circle('02-choose-one.png', (255, 92), 64, out / 'cup2.png')
    circle('02-choose-one.png', (422, 136), 60, out / 'cup3.png')

    # step photos
    box(slide('07-step1.png'), (308, 82, 468, 268), out / 'ph_liquids.jpg')
    box(slide('10-step4-1.png'), (36, 92, 186, 246), out / 'ph_oil.jpg')
    box(slide('11-step5.png'), (38, 86, 192, 244), out / 'ph_mix.jpg')

    comic_panels(out)
    print('assets written to', out)


if __name__ == '__main__':
    main()
