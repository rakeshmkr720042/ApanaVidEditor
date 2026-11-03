"""Builds every app icon, splash, in-app image and Play Store graphic from store-assets/source.

Run from the repo root after changing a source image:  python3 scripts/brand/make_brand.py
Needs Pillow + numpy, and `npm ci` first (the store texts use the Poppins / Noto Sans Devanagari
fonts from node_modules/@fontsource).
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = 'store-assets/source/'
RES = 'android/app/src/main/res/'
STORE = 'store-assets/play-store/'
BG = (14, 16, 20)  # app background #0E1014


def save_png(im, path, colors=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if colors:  # palette PNGs are a fraction of the size and look the same at icon sizes
        im = im.quantize(colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE) if im.mode == 'RGBA' else im.quantize(colors)
    im.save(path, optimize=True)


# ---------- 1. the icon tile, cut out of its white page ----------
src = np.asarray(Image.open(SRC + '02-app-icon.png').convert('RGB')).astype(np.int16)
ink = src.min(axis=2) < 235
ys, xs = np.where(ink)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
# The tile is one rounded square; fill each row between its first and last coloured pixel so the
# white play triangle inside counts as tile too.
mask = np.zeros(ink.shape, bool)
for y in range(y0, y1):
    r = np.where(ink[y])[0]
    if len(r):
        mask[y, r[0]:r[-1] + 1] = True
alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
tile = Image.fromarray(src.astype(np.uint8)).convert('RGBA')
tile.putalpha(alpha)
side = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
tile = tile.crop(box).resize((1024, 1024), Image.LANCZOS)  # rounded tile, transparent corners


def blurred_fill(size):
    """The tile's own colours, spread out: fills the corners so no white shows."""
    big = tile.convert('RGB').crop((150, 150, 874, 874)).resize((size, size), Image.LANCZOS)
    return big.filter(ImageFilter.GaussianBlur(size / 14))


square = blurred_fill(1024).convert('RGBA')
square.alpha_composite(tile)
square = square.convert('RGB')  # full-bleed square: Play Store icon, iOS / PWA, adaptive art


def adaptive(size=1080, art=0.80):
    """Android adaptive layer (108dp): tile at `art` of the layer over its own blurred colours."""
    out = blurred_fill(size).convert('RGBA')
    n = round(size * art)
    t = square.resize((n, n), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (n, n), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, n - 1, n - 1), radius=n // 5, fill=255)
    t.putalpha(m.filter(ImageFilter.GaussianBlur(n / 40)))
    out.alpha_composite(t, ((size - n) // 2, (size - n) // 2))
    return out.convert('RGB')


adapt = adaptive()


def legacy(size):
    """Pre-Android-8 / Windows / favicon icon: the rounded tile with a little margin."""
    pad = round(size * 0.04)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(tile.resize((size - 2 * pad, size - 2 * pad), Image.LANCZOS), (pad, pad))
    return out


def round_icon(size):
    s = 4 * size
    crop = adapt.crop((100, 100, 980, 980)).resize((s, s), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).ellipse((4, 4, s - 5, s - 5), fill=255)
    crop.putalpha(m)
    return crop.resize((size, size), Image.LANCZOS)


# ---------- 2. Android launcher icons ----------
for d, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    save_png(legacy(px), f'{RES}mipmap-{d}/ic_launcher.png')
    save_png(round_icon(px), f'{RES}mipmap-{d}/ic_launcher_round.png')
    save_png(adapt.resize((px * 108 // 48,) * 2, Image.LANCZOS), f'{RES}mipmap-{d}/ic_launcher_foreground.png')

# ---------- 3. splash screens (older Android; 12+ shows the launcher icon on the app colour) ----------
splash_icon = legacy(1024)
for name, (w, h) in {
    'drawable': (480, 320), 'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480),
    'drawable-land-xhdpi': (1280, 720), 'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
    'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
    'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920),
}.items():
    out = Image.new('RGBA', (w, h), BG + (255,))
    n = round(min(w, h) * 0.32)
    out.alpha_composite(splash_icon.resize((n, n), Image.LANCZOS), ((w - n) // 2, (h - n) // 2))
    save_png(out.convert('RGB'), f'{RES}{name}/splash.png', 128)

# ---------- 4. Windows app + website / PWA icons ----------
save_png(legacy(512), 'electron/icon.png')
save_png(legacy(48), 'public/icons/favicon-48.png')
save_png(legacy(192), 'public/icons/icon-192.png')
save_png(legacy(512), 'public/icons/icon-512.png')
save_png(adaptive(512, 0.86), 'public/icons/maskable-512.png')
save_png(square.resize((180, 180), Image.LANCZOS), 'public/icons/apple-touch-icon.png')
save_png(legacy(96), 'public/brand/icon-96.png')

# ---------- 5. in-app pictures (webp, small) ----------
def webp(im, path, w, q=78):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = im.convert('RGB')
    im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(path, 'WEBP', quality=q, method=6)


hero = Image.open(SRC + '07-hero-background.jpg')
# right 5% holds the image generator's sparkle mark; the left side is empty for our text
webp(hero.crop((0, 0, round(hero.width * 0.95), hero.height)), 'public/brand/hero.webp', 1400, 72)
gopro = Image.open(SRC + '06-go-pro-banner.jpg')
webp(gopro.crop((0, 0, round(gopro.width * 0.95), gopro.height)), 'public/brand/go-pro.webp', 1200, 80)
logo = Image.open(SRC + '10-logo.png')
webp(logo, 'public/brand/logo.webp', 720, 85)

# ---------- 6. Play Store ----------
save_png(square.resize((512, 512), Image.LANCZOS), STORE + 'icon-512.png')


def font(name, size):
    return ImageFont.truetype(name, size, layout_engine=ImageFont.Layout.RAQM)


FONTS = 'node_modules/@fontsource/'
def say(d, xy, text, size, weight=600, fill='white'):
    """Draws mixed Hindi + English text: Devanagari runs in Noto Sans Devanagari, the rest in Poppins."""
    lat = font(f'{FONTS}poppins/files/poppins-latin-{weight}-normal.woff', size)
    dev = font(f'{FONTS}noto-sans-devanagari/files/noto-sans-devanagari-devanagari-{weight}-normal.woff', round(size * 0.98))
    runs, cur, kind = [], '', None
    for ch in text:
        k = 'dev' if '\u0900' <= ch <= '\u097f' or ch == '\u200d' else ('any' if ch == ' ' else 'lat')
        if k == 'any':
            k = kind or 'lat'
        if kind and k != kind:
            runs.append((kind, cur)); cur = ''
        kind, cur = k, cur + ch
    runs.append((kind, cur))
    x, y = xy
    for k, part in runs:
        f = dev if k == 'dev' else lat
        d.text((x, y + round(size * 1.0)), part, font=f, fill=fill, anchor='ls')  # shared baseline
        x += d.textlength(part, font=f)
    return x


def text_w(text, size, weight=600):
    return say(ImageDraw.Draw(Image.new('RGB', (1, 1))), (0, 0), text, size, weight)


# feature graphic 1024x500: laptop + phone on the right, our own text on the dark left side
art = hero.convert('RGB').crop((round(hero.width * 0.36), 0, round(hero.width * 0.95), hero.height))
H = 430
art = art.resize((round(art.width * H / art.height), H), Image.LANCZOS).convert('RGBA')
fade = np.ones((H, art.width), np.float32)
fade *= np.clip(np.arange(art.width) / 260, 0, 1)[None, :]  # soft left edge
edge = np.clip(np.minimum(np.arange(H), H - 1 - np.arange(H)) / 40, 0, 1)
fade *= edge[:, None]  # soft top and bottom edges
fade = Image.fromarray((fade * 255).astype(np.uint8))
fg = Image.new('RGBA', (1024, 500), BG + (255,))
fg.paste(art, (1024 - art.width + 8, 36), fade)
fg.alpha_composite(legacy(116), (52, 64))
d = ImageDraw.Draw(fg)
xe = say(d, (184, 88), 'Apna ', 50, 800)
say(d, (xe, 88), 'Editor', 50, 800, (255, 150, 60))
say(d, (56, 228), 'Apni video, apna andaaz', 34, 600, (255, 214, 120))
say(d, (56, 284), 'अपनी वीडियो, अपना अंदाज़', 32, 600)
say(d, (56, 368), 'Offline video editor · Hindi + English', 20, 500, (200, 200, 215))
save_png(fg.convert('RGB'), STORE + 'feature-graphic-1024x500.png')
print('brand assets written')


# ---------- 7. Play Store phone screenshots: real app screens (store-assets/app-screens, 1080x1920) in a frame ----------
SCREENS = [
    ('1-editor', 'Edit videos on your phone', 'फ़ोन पर आसानी से वीडियो एडिट करें'),
    ('2-text', 'Stylish text and titles', 'स्टाइलिश टेक्स्ट और टाइटल'),
    ('3-effects', 'Effects, filters and colour', 'इफ़ेक्ट, फ़िल्टर और कलर'),
    ('4-home-hindi', 'Hindi + English, works offline', 'हिंदी और English, बिना इंटरनेट भी'),
]
grad = np.zeros((1920, 1080, 3), np.float32)
top, bottom = np.array([42, 14, 58]), np.array([12, 10, 24])
grad[:] = (top + (bottom - top) * (np.arange(1920) / 1919)[:, None])[:, None, :]
glow = Image.new('L', (1080, 1920), 0)
ImageDraw.Draw(glow).ellipse((-200, -300, 1280, 700), fill=120)
glow = np.asarray(glow.filter(ImageFilter.GaussianBlur(160)), np.float32)[..., None] / 255
grad = grad * (1 - glow) + np.array([230, 51, 122]) * glow * 0.55 + grad * glow * 0.45
frame_bg = Image.fromarray(grad.clip(0, 255).astype(np.uint8))
for name, en, hi in SCREENS:
    path = f'store-assets/app-screens/{name}.png'
    if not os.path.exists(path):
        continue
    shot = Image.open(path).convert('RGB')
    out = frame_bg.copy().convert('RGBA')
    d = ImageDraw.Draw(out)
    for txt, size, weight, fill, y in ((en, 64, 800, 'white', 120), (hi, 52, 600, (255, 214, 120), 222)):
        say(d, ((1080 - text_w(txt, size, weight)) // 2, y), txt, size, weight, fill)
    w = 820
    h = round(shot.height * w / shot.width)
    shot = shot.resize((w, h), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=48, fill=255)
    x, y = (1080 - w) // 2, 360
    shadow = Image.new('RGBA', out.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x - 14, y - 14, x + w + 14, y + h + 14), radius=60, fill=(0, 0, 0, 170))
    out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(24)))
    ImageDraw.Draw(out).rounded_rectangle((x - 10, y - 10, x + w + 9, y + h + 9), radius=56, fill=(30, 30, 40, 255), outline=(255, 255, 255, 60), width=2)
    out.paste(shot, (x, y), m)
    save_png(out.convert('RGB'), f'{STORE}phone-{name}.png')
print('store screenshots written')
