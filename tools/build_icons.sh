#!/usr/bin/env bash
# Rebuilds the favicon set and the social card from the sources in tools/, and writes
# tools/manifest_icons.json.
#
#   tools/favicon.svg   the mark (copied to img/favicon.svg; follows the OS dark mode)
#   tools/icon.html     renders the mark at a given size for the PNG/ICO frames
#   tools/og-card.html  the 1200x630 social card (fonts/, media/hero.poster.webp)
#
# Run from the website root:   tools/build_icons.sh
# Needs: headless Google Chrome (CHROME, default /usr/bin/google-chrome) and python3
# with Pillow (PYTHON, default python3). The card reads media/hero.poster.webp, which
# tools/build_media.py writes, so rebuild the hero clip first if it changed.
set -euo pipefail

[ -f tools/og-card.html ] && [ -d img ] || { echo "run from the website root" >&2; exit 1; }

ROOT="$PWD"
CHROME="${CHROME:-/usr/bin/google-chrome}"
PYTHON="${PYTHON:-python3}"
TMP=tools/tmp/icons
mkdir -p "$TMP" img

"$PYTHON" -c 'import PIL' 2>/dev/null || { echo "build_icons.sh: $PYTHON has no Pillow (set PYTHON=...)" >&2; exit 1; }
[ -f media/hero.poster.webp ] || { echo "build_icons.sh: media/hero.poster.webp missing (run tools/build_media.py tools/clips/hero.json)" >&2; exit 1; }

# shot <out.png> <width> <height> <scale> <url> [extra chrome flags...]
# A throwaway profile keeps the user's Chrome profile out of it; the virtual-time
# budget lets the web fonts and images finish loading before the capture;
# preferredColorScheme=1 pins the light colours of favicon.svg whatever the OS theme.
shot() {
  local out=$1 w=$2 h=$3 scale=$4 url=$5; shift 5
  rm -f "$out"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$TMP/chrome-profile" --allow-file-access-from-files \
    --blink-settings=preferredColorScheme=1 \
    --force-device-scale-factor="$scale" --virtual-time-budget=5000 \
    --window-size="$w,$h" --screenshot="$out" "$@" "$url" >/dev/null 2>&1
  [ -s "$out" ] || { echo "build_icons.sh: Chrome did not write $out" >&2; exit 1; }
}

# 1) Favicon set.
cp tools/favicon.svg img/favicon.svg
ICON="file://$ROOT/tools/icon.html"
shot "$TMP/icon16.png" 16 16 1 "$ICON#s=16" --default-background-color=00000000
shot "$TMP/icon32.png" 32 32 1 "$ICON#s=32" --default-background-color=00000000
shot "$TMP/touch.png" 180 180 1 "$ICON#s=120&bg=%23fbfaf7"

# 2) Social card, rendered at 2x for smoother text and image edges, then downscaled.
shot "$TMP/og@2x.png" 1200 630 2 "file://$ROOT/tools/og-card.html"

# 3) Pack, downscale, check sizes, write the manifest.
"$PYTHON" -I - "$TMP" <<'EOF'
import json, os, sys
from PIL import Image

tmp = sys.argv[1]

def load(name, size, mode):
    im = Image.open(f"{tmp}/{name}").convert(mode)
    if im.size != size:
        sys.exit(f"build_icons.sh: {name} is {im.size}, expected {size}")
    return im

i16 = load("icon16.png", (16, 16), "RGBA")
i32 = load("icon32.png", (32, 32), "RGBA")
i32.save("img/favicon.ico", format="ICO", sizes=[(32, 32), (16, 16)], append_images=[i16])

load("touch.png", (180, 180), "RGB").save("img/apple-touch-icon.png", optimize=True)

og = load("og@2x.png", (2400, 1260), "RGB").resize((1200, 630), Image.LANCZOS)
og.save("img/og.png", optimize=True)
og_note = "RGB"
if os.path.getsize("img/og.png") > 400_000:
    og.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                dither=Image.Dither.FLOYDSTEINBERG).save("img/og.png", optimize=True)
    og_note = "re-quantised to 256 colours (RGB PNG was over 400 KB)"

notes = {
    "img/favicon.svg": "copy of tools/favicon.svg: wireframe pose box, visible edges ink, hidden edges muted, top face teal; viewBox 32; dark-mode colours via prefers-color-scheme",
    "img/favicon.ico": "32 px + 16 px frames rendered from favicon.svg by headless Chrome (tools/icon.html), transparent background, light-mode colours",
    "img/apple-touch-icon.png": "180x180, mark at 120 px on paper #fbfaf7 (tools/icon.html)",
    "img/og.png": f"1200x630 social card from tools/og-card.html: Newsreader title, italic subtitle, lab line, hero poster (four real PROXY runs) in a ruled plate; Chrome at 2x, lanczos to 1x; {og_note}",
}
files = []
for path, note in notes.items():
    e = {"path": path, "bytes": os.path.getsize(path)}
    if path.endswith(".svg"):
        e["width"] = e["height"] = 32
    else:
        e["width"], e["height"] = Image.open(path).size
    e["note"] = note
    files.append(e)
manifest = {"built_by": "tools/build_icons.sh",
            "sources": ["tools/favicon.svg", "tools/icon.html", "tools/og-card.html",
                        "fonts/newsreader-latin.woff2", "fonts/newsreader-italic-latin.woff2",
                        "media/hero.poster.webp"],
            "files": files}
with open("tools/manifest_icons.json", "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
for e in files:
    print(f"{e['bytes']:8d}  {e['width']}x{e['height']}  {e['path']}")
EOF
