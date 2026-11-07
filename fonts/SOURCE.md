# Newsreader (self-hosted)

Variable serif by Production Type, licensed under the SIL Open Font License 1.1
(see `OFL.txt`, copied verbatim from the upstream directory).

## Upstream

- Repository: https://github.com/google/fonts
- Directory: `ofl/newsreader/`
- Branch: `main`, commit `e44c4b011a820c2cbe2fd2cfa8052037d7edb571` (committed 2026-09-20T08:29:10Z)
- Files fetched via raw.githubusercontent.com at that commit's tree:
  - `Newsreader[opsz,wght].ttf` sha256 `8a08d13f8a6c0d51be379a60af84f945f65369a67e509ee3c3bdcc421254d7c1`
  - `Newsreader-Italic[opsz,wght].ttf` sha256 `796668611f80b64d5adf182fde3b6f29ed83b4e7cbec7b96937e84ac01364792`
  - `OFL.txt` sha256 `fdfad38143ec470553cae82a1e45320bdd1b9ec70415d37bd0171051d8a4ded8`

## Subsetting

Both faces were first restricted with fonttools 4.62.1 (`fontTools.varLib.instancer`)
to the axis ranges the page uses (`wght` 400-600 roman, 400-500 italic; `opsz` 14-72
for both), then subset with `pyftsubset` to a Latin range, keeping kerning, ligatures,
figure styles, fractions and superscripts:

```
python3 -c 'from fontTools.ttLib import TTFont; from fontTools.varLib import instancer
instancer.instantiateVariableFont(TTFont("Newsreader[opsz,wght].ttf"),
  {"wght": (400, 600), "opsz": (14, 72)}).save("roman.instanced.ttf")'
pyftsubset roman.instanced.ttf \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2013-2014,U+2018-201D,U+2020-2022,U+2026,U+2030,U+2039-203A,U+2044,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --layout-features="kern,liga,calt,lnum,onum,pnum,tnum,frac,sups,subs,ccmp,locl,mark,mkmk" \
  --no-hinting --desubroutinize --flavor=woff2 --output-file=newsreader-latin.woff2
```

(the italic uses `wght` 400-500). The exact commands live in
`tools/build_font_icons.sh`.

| File | Glyphs | Size |
| --- | --- | --- |
| `newsreader-latin.woff2` | 256 | 85 KB |
| `newsreader-italic-latin.woff2` | 256 | 90 KB |

Most of each file is still the `gvar` table (two-axis variation data); the
full-range subsets were 137 KB and 153 KB.

## Usage

```css
@font-face {
  font-family: "Newsreader";
  src: url("fonts/newsreader-latin.woff2") format("woff2");
  font-weight: 400 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Newsreader";
  src: url("fonts/newsreader-italic-latin.woff2") format("woff2");
  font-weight: 400 500;
  font-style: italic;
  font-display: swap;
}
```

The `opsz` axis is applied automatically by browsers (`font-optical-sizing: auto`);
set `font-variation-settings: "opsz" 72` to force the display cut on large headings.
