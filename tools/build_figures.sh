#!/usr/bin/env bash
# Rebuilds the paper figures under img/ and writes tools/manifest_figures.json.
#
# Run from the website root:   tools/build_figures.sh
# Needs: pdfimages (poppler), ffmpeg + ffprobe with libwebp, python3 (stdlib only).
#
# Every figure in proxy_paper.pdf is a single embedded raster, so the figures are taken
# natively with pdfimages (no re-rendering). pdfimages numbers the rasters in page order;
# the odd numbers are the soft masks of the preceding image (all fully opaque) and are
# not used. The expected raster sizes are pinned below: if the paper is recompiled with
# different figures the script stops, so the table (and the captions on the page) can be
# checked before anything is overwritten.
#
# Fig. 4 is the exception. The older Overleaf export images/generative-videos.png
# (1086x754) shows the same 16 frames as the paper's 947x650 raster at a higher
# resolution, so it is used instead. Set FIG4=paper to use the paper raster.
set -euo pipefail

[ -f proxy_paper.pdf ] && [ -d tools ] || { echo "run from the website root (proxy_paper.pdf not found)" >&2; exit 1; }

PDF=proxy_paper.pdf
TMP=tools/tmp/figures
FIG4="${FIG4:-/home/aditya/MIT Dropbox/Aditya Agarwal/Apps/Overleaf/[ICRA 2027] PROXY/images/generative-videos.png}"
FIG4_SIZE=1086x754
QUALITY=88

mkdir -p "$TMP" img
rm -f "$TMP"/paper-*.png

die() { echo "build_figures.sh: $*" >&2; exit 1; }
size() { ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$1"; }

# 1) Extract the embedded rasters.
pdfimages -png "$PDF" "$TMP/paper"

# 2) Check the rasters still match the figures this site was built against.
#    num:WxH:figure
EXPECTED="000:1722x874:1 002:1708x830:2 004:2344x440:3 006:947x650:4 008:2338x468:5 010:1066x658:6"
n=$(ls "$TMP"/paper-*.png | wc -l)
[ "$n" = 12 ] || die "expected 12 rasters (6 figures + 6 soft masks) in $PDF, found $n; the paper changed"
for e in $EXPECTED; do
  IFS=: read -r num want fig <<<"$e"
  f="$TMP/paper-$num.png"
  [ -f "$f" ] || die "Fig. $fig: $f missing; the paper changed"
  got=$(size "$f")
  [ "$got" = "$want" ] || die "Fig. $fig: raster $num is $got, expected $want; the paper changed, re-check the figure table"
done

if [ "$FIG4" = paper ]; then
  FIG4_SRC="$TMP/paper-006.png"
  FIG4_NOTE="$PDF Fig. 4 (page 5), embedded raster 006, 947x650 native"
else
  [ -f "$FIG4" ] || die "Fig. 4 source not found: $FIG4 (set FIG4=paper to use the paper raster)"
  got=$(size "$FIG4")
  [ "$got" = "$FIG4_SIZE" ] || die "Fig. 4 source is $got, expected $FIG4_SIZE: $FIG4"
  FIG4_SRC="$FIG4"
  FIG4_NOTE="Overleaf [ICRA 2027] PROXY/images/generative-videos.png, 1086x754 native (same 16 frames as the paper's 947x650 Fig. 4 raster at higher resolution; alpha fully opaque, flattened)"
fi

# 3) WebP. webp <src> <target width> <out>: lanczos downscale to the target width;
#    a target at or above the native width keeps the native size (never upscales).
webp() {
  local src=$1 target=$2 out=$3 w vf
  w=$(size "$src"); w=${w%x*}
  if [ "$target" -lt "$w" ]; then vf="scale=$target:-1:flags=lanczos"; else vf="null"; fi
  ffmpeg -nostdin -loglevel error -y -i "$src" -vf "$vf" -frames:v 1 -pix_fmt yuv420p \
    -c:v libwebp -quality "$QUALITY" -compression_level 6 -map_metadata -1 "$out"
}

# Fig. 1 (raster 000, the teaser) is size-checked above but not converted: the page does not use it.
webp "$TMP/paper-002.png" 1200 img/system-1200.webp
webp "$TMP/paper-002.png" 1708 img/system-1708.webp
webp "$TMP/paper-004.png" 1200 img/diversify-1200.webp
webp "$TMP/paper-004.png" 2000 img/diversify-2000.webp
webp "$FIG4_SRC"          99999 img/generated.webp
webp "$TMP/paper-008.png" 1200 img/tasks-1200.webp
webp "$TMP/paper-008.png" 2000 img/tasks-2000.webp
webp "$TMP/paper-010.png" 99999 img/scene-dist.webp

# 4) Manifest, with sizes read back from the written files.
rows=""
add() {  # add <path> <source>
  local wh; wh=$(size "$1")
  rows+="$1|${wh%x*}|${wh#*x}|$(stat -c %s "$1")|$2"$'\n'
}
P="$PDF"
add img/system-1200.webp    "$P Fig. 2 (page 3), embedded raster 002, 1708x830, lanczos to 1200 px"
add img/system-1708.webp    "$P Fig. 2 (page 3), embedded raster 002, 1708x830 native"
add img/diversify-1200.webp "$P Fig. 3 (page 4), embedded raster 004, 2344x440, lanczos to 1200 px"
add img/diversify-2000.webp "$P Fig. 3 (page 4), embedded raster 004, 2344x440, lanczos to 2000 px"
add img/generated.webp      "$FIG4_NOTE"
add img/tasks-1200.webp     "$P Fig. 5 (page 7), embedded raster 008, 2338x468, lanczos to 1200 px"
add img/tasks-2000.webp     "$P Fig. 5 (page 7), embedded raster 008, 2338x468, lanczos to 2000 px"
add img/scene-dist.webp     "$P Fig. 6 (page 7), embedded raster 010, 1066x658 native"

ROWS="$rows" python3 -I - <<'EOF'
import json, os
files = []
for line in os.environ["ROWS"].strip().splitlines():
    path, w, h, b, src = line.split("|", 4)
    files.append({"path": path, "width": int(w), "height": int(h), "bytes": int(b), "source": src})
manifest = {
    "built_by": "tools/build_figures.sh",
    "paper": "proxy_paper.pdf (figures are single embedded rasters, extracted with pdfimages -png)",
    "webp": "ffmpeg libwebp -quality 88 -compression_level 6, yuv420p, lanczos downscale, never upscaled, metadata stripped",
    "files": files,
}
with open("tools/manifest_figures.json", "w") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")
for e in files:
    print(f"{e['bytes']:8d}  {e['width']:4d}x{e['height']:<4d}  {e['path']}")
print(f"wrote tools/manifest_figures.json ({len(files)} files)")
EOF
