# Aufruf: python3 scripts/logo-erzeugen.py (braucht Playwright mit Chrome und Pillow).
# Schreibt favicon.svg, alle Icons und das Vorschaubild og-bild.png nach static/.
# Aufruf: python3 scripts/logo-erzeugen.py (braucht Playwright mit Chrome und Pillow). Schreibt favicon.svg und alle Icons nach static/.
# Das Vorschaubild og-bild.png wird mit /tmp/logo/og.html erzeugt (siehe unten), Schriften aus static/fonts.
# Erzeugt das neue Logo (Standort-Pin mit Ähre) als SVG und alle PNG/ICO-Varianten
from playwright.sync_api import sync_playwright
from PIL import Image
import io, os
R = '/home/claude/hofladen/static/'
PIN = 'M32 3C19 3 8.5 13.3 8.5 26.2 8.5 43.4 32 61 32 61s23.5-17.6 23.5-34.8C55.5 13.3 45 3 32 3z'
AEHRE = ('<rect x="30.4" y="21" width="3.2" height="27" rx="1.6"/>'
  '<ellipse cx="32" cy="15.6" rx="3.5" ry="6"/>'
  '<ellipse cx="25.9" cy="25.4" rx="3.2" ry="5.8" transform="rotate(-38 25.9 25.4)"/>'
  '<ellipse cx="38.1" cy="25.4" rx="3.2" ry="5.8" transform="rotate(38 38.1 25.4)"/>'
  '<ellipse cx="25.9" cy="35.4" rx="3.2" ry="5.8" transform="rotate(-38 25.9 35.4)"/>'
  '<ellipse cx="38.1" cy="35.4" rx="3.2" ry="5.8" transform="rotate(38 38.1 35.4)"/>')
INNEN = f'<path d="{PIN}" fill="#F4C430"/><g fill="#173B2C">{AEHRE}</g>'
MARKE = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{INNEN}</svg>'
# App-Icon: Pin auf dunkelgrünem Grund
ICON = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#173B2C"/><g transform="translate(11.2 9.6) scale(.65)">{INNEN}</g></svg>'
open(R + 'favicon.svg', 'w').write(MARKE + '\n')
print(INNEN)  # Inhalt für LOGO in scripts/build.mjs
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    def png(svg, px, transparent=True):
        pg = b.new_page(viewport={'width': px, 'height': px})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width=\'{px}\' height=\'{px}\' ")}</body></html>')
        data = pg.screenshot(omit_background=transparent, clip={'x': 0, 'y': 0, 'width': px, 'height': px})
        pg.close()
        return Image.open(io.BytesIO(data))
    for n, px in [('favicon-48.png', 48), ('favicon-96.png', 96)]: png(MARKE, px).save(R + n)
    for n, px in [('icon-192.png', 192), ('icon-512.png', 512)]: png(ICON, px).save(R + n)
    png(ICON, 180, False).convert('RGB').save(R + 'apple-touch-icon.png')
    ico = [png(MARKE, s) for s in (16, 32, 48)]
    ico[2].save(R + 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
    # Vorschaubild für soziale Netzwerke
    pg = b.new_page(viewport={'width': 1200, 'height': 630})
    open('/tmp/og-bild.html', 'w').write(f'''<html><head><meta charset="utf-8"><style>
      @font-face {{ font-family: Z; src: url("file://{R}fonts/zilla-slab-bold.woff"); font-weight: 700; }}
      @font-face {{ font-family: A; src: url("file://{R}fonts/atkinson-next.woff"); font-weight: 200 800; }}
      body {{ margin: 0; width: 1200px; height: 630px; background: #173B2C radial-gradient(#2F6249 1.6px, transparent 1.7px) 0 0 / 28px 28px;
        display: flex; align-items: center; gap: 64px; padding: 0 110px; box-sizing: border-box; color: #fff; }}
      h1 {{ font: 700 92px/1 Z; margin: 0 0 26px; }} p {{ font: 500 36px/1.35 A; margin: 0; color: #DCE8E0; max-width: 620px; }}
    </style></head><body><svg width="230" height="230" viewBox="0 0 64 64">{INNEN}</svg>
    <div><h1>Hofladenliste</h1><p>Hofläden, Milchtankstellen und Hofautomaten in deiner Nähe – mit Öffnungszeiten und Route.</p></div></body></html>''')
    pg.goto('file:///tmp/og-bild.html')  # Datei statt set_content, sonst lädt Chrome die Schriften nicht
    pg.evaluate('document.fonts.ready')
    pg.wait_for_timeout(400)
    Image.open(io.BytesIO(pg.screenshot())).convert('RGB').save(R + 'og-bild.png', optimize=True)
    b.close()
print('ok')
