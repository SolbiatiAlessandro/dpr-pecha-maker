#!/usr/bin/env python3
"""Inline fonts and scripts into one self-contained page: docs/index.html (served by GitHub Pages)."""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ["vendor/jsewts.js", "src/legacy-table.js", "src/folio.js", "src/engine.js", "src/pxp.js", "src/sample.js", "src/app.js"]
FONTS = [
    ("Jomolhari", "fonts/jomolhari-tibetan.woff2", "U+0F00-0FFF"),
    ("Jomolhari", "fonts/jomolhari-latin.woff2", "U+0000-00FF,U+2000-206F"),
    ("Noto Serif Tibetan", "fonts/noto-serif-tibetan.woff2", "U+0F00-0FFF"),
]


def font_face(family, path, unicode_range):
    data = base64.b64encode((ROOT / path).read_bytes()).decode()
    return f"@font-face{{font-family:'{family}';font-display:swap;src:url(data:font/woff2;base64,{data}) format('woff2');unicode-range:{unicode_range}}}"


def main():
    html = (ROOT / "src/index.html").read_text(encoding="utf-8")
    fonts = "\n".join(font_face(*f) for f in FONTS)
    # The browser build of jsewts registers itself through this call.
    scripts = "\n".join((ROOT / s).read_text(encoding="utf-8").replace("</script", "<\\/script") for s in SCRIPTS)
    page = html.replace("/*FONTS*/", fonts).replace("/*SCRIPTS*/", scripts)
    page = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + page.replace("<title>", "<title>", 1)
    out = ROOT / "docs/index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print(out, round(out.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
