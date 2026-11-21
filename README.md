# PROXY project page

Static project page for *PROXY: Learning Relational Object-Centric Manipulation Policies from a
Single RGB-D Image* by Maggie Huili Yao, Sahit Chintalapudi, Tiffany Zhang, Akash Anand, Megha Tippur,
Tomás Lozano-Pérez, Leslie Pack Kaelbling and Aditya Agarwal (MIT CSAIL, Learning and
Intelligent Systems Lab). Planned address:
<https://skymanaditya1.github.io/proxy-website/> (GitHub Pages; see "Before launch").

The page is plain files: one HTML page, one stylesheet, one script, self-hosted fonts,
WebP figures and WebM/MP4 clips. There is no build step at serve time, no CDN, no
analytics and no web-font service. Every in-page URL is relative, so the page works under
the GitHub Pages sub-path. The look follows the objsearch site ("Knowing Where to Look",
`skymanaditya1/objsearch-website`): warm paper, Newsreader, one accent colour (teal here).

## Preview locally

```
cd proxy_website
python3 -m http.server 8000
# open http://localhost:8000/
```

`python3 -m http.server` does not answer HTTP Range requests, so in Chrome and Firefox the
clips cannot be seeked (scrubbing and the resume position of Enlarge look broken) and Safari
does not play them at all. GitHub Pages is fine. To test video locally, use a static server
that supports Range, for example `npx http-server -p 8000` or `caddy file-server --listen :8000`.

## Layout

```
index.html          the page
style.css           tokens (light/dark), type scale, layout, components
main.js             page behaviour (theme toggle, video controls and other enhancements)
paper.pdf           the paper (byte copy of proxy_paper.pdf; the Paper button links here)
robots.txt, sitemap.xml
.nojekyll           serve files as-is on GitHub Pages
LICENSE             MIT, site code only (see Licence)
fonts/              Newsreader roman + italic (variable, Latin subset), OFL.txt, SOURCE.md
img/                paper figures as WebP, LIS and MIT logos, favicon.svg/.ico,
                    apple-touch-icon.png, og.png (social card)
media/              clips as <slug>.v1.webm + <slug>.v1.mp4 with <slug>.poster.webp
tools/
  build_figures.sh  paper figures -> img/*.webp, manifest_figures.json
  build_icons.sh    favicon set + og.png -> img/, manifest_icons.json
  build_media.py    clips from proxy_videos.zip -> media/, manifest_media_<spec>.json
  clips/*.json      clip specs (hero, method, tasks, compare, d1, gallery)
  favicon.svg       source of img/favicon.svg
  icon.html         renders the mark for the PNG/ICO sizes
  og-card.html      source of img/og.png
  site.env          BASE_URL and PROXY_VIDEOS_ZIP
  manifest_*.json   every generated file with its size, bytes and source
  tmp/              intermediates (gitignored)
```

Not tracked (see `.gitignore`): `proxy_videos.zip` (7.1 GB of evaluation rollouts),
`proxy_paper.pdf` (the paper as delivered) and `tools/tmp/`.

`fonts/` (all four files), `img/lis-logo.svg` and `img/mit-logo.webp` are copied unchanged
from the objsearch site. `img/rss-2026-logo.webp` is the blue "Robotics: Science and Systems"
banner cropped from the official logo (https://roboticsconference.org/2026/images/RSS2026-logo.png,
rows 0–592 of 2500x854, flattened on white, 800 px wide, WebP q90). `fonts/SOURCE.md` records the upstream commit and the subsetting
recipe; the `tools/build_font_icons.sh` it mentions lives in that repository.

## Rebuilding assets

Run every script from the website root. Each one rewrites its outputs and its manifest
in `tools/`; intermediates go to `tools/tmp/`.

**Paper figures**: `tools/build_figures.sh`
(needs poppler's `pdfimages`, ffmpeg/ffprobe with libwebp, python3).
All six figures in `proxy_paper.pdf` are single embedded rasters, so they are extracted
natively and converted to WebP (libwebp quality 88, lanczos downscale, never upscaled).
Fig. 1 (the teaser) is size-checked but not converted, because the page does not use it.
The script checks the raster sizes against the paper this site was built from and stops
if they differ, so a recompiled paper with changed figures cannot silently overwrite them.

| File | Paper figure | Size |
| --- | --- | --- |
| `img/system-1200.webp`, `img/system-1708.webp` | Fig. 2 | 1200 / 1708 (native) |
| `img/diversify-1200.webp`, `img/diversify-2000.webp` | Fig. 3 | 1200 / 2000 |
| `img/generated.webp` | Fig. 4 | 1086x754 |
| `img/tasks-1200.webp`, `img/tasks-2000.webp` | Fig. 5 | 1200 / 2000 |
| `img/scene-dist.webp` | Fig. 6 | 1066x658 (native) |

Fig. 4 comes from the older Overleaf export `[ICRA 2027] PROXY/images/generative-videos.png`
(1086x754), which shows the same 16 frames as the paper's 947x650 raster at a higher
resolution. `FIG4=paper tools/build_figures.sh` uses the paper raster instead.
`paper.pdf` is refreshed by hand: `cp proxy_paper.pdf paper.pdf`.

**Icons and social card**: `tools/build_icons.sh`
(needs headless Google Chrome and python3 with Pillow; `CHROME=` and `PYTHON=` override
the defaults). It copies `tools/favicon.svg` to `img/favicon.svg`, renders the mark with
`tools/icon.html` to the 16 and 32 px frames of `img/favicon.ico` and to
`img/apple-touch-icon.png` (180x180, mark at 120 px on #fbfaf7), and screenshots
`tools/og-card.html` at 2x into `img/og.png` (1200x630, re-quantised if over 400 KB). The
card shows `media/hero.poster.webp`, so rerun it after rebuilding the hero clip.

**Clips**: `python3 -I tools/build_media.py tools/clips/<spec>.json`
for each spec: `hero`, `method`, `tasks`, `compare`, `d1`, `gallery`. The script pulls only
the members a spec needs out of the zip, which it finds at `$PROXY_VIDEOS_ZIP` or, when
that is unset, at `proxy_videos.zip` in the website root. To use the values in
`tools/site.env`:

```
set -a; . tools/site.env; set +a
python3 -I tools/build_media.py tools/clips/hero.json
```

## Deploying (GitHub Pages)

1. Push this directory to the hosting repository (planned: `skymanaditya1/proxy-website`).
2. Settings, Pages: deploy from a branch, branch `main`, folder `/ (root)`. `.nojekyll` is
   already present, so files are served as-is.
3. Each push to `main` redeploys within a minute or two.

## If the repo or URL changes

Every in-page URL is relative. The absolute URLs are written out by hand (nothing reads
`tools/site.env` to generate them), so change all of these together:

- `index.html`: `<link rel="canonical">`, `og:url`, `og:image`, and the JSON-LD `url` and `image`
- `robots.txt`: the `Sitemap:` line
- `sitemap.xml`: `<loc>`
- the BibTeX `url` field in `index.html`
- `BASE_URL` in `tools/site.env`

## Before launch

- [ ] Confirm the hosting repository and URL (planned `skymanaditya1/proxy-website`, served at `https://skymanaditya1.github.io/proxy-website/`); update the absolute URLs above if it differs.
- [x] Venue line in the masthead, meta/OG descriptions and `og.png`: accepted at the RSS 2026 Diffusion for Robot Learning and Data-Centric Robotics workshops.
- [ ] arXiv ID for the Paper/arXiv buttons, and the BibTeX type (`@misc` with `eprint` until there is a venue, then `@inproceedings`).
- [ ] Code link (`github.com/skymanaditya1/Proxy`: public? licence?) or keep the "coming soon" placeholder.
- [ ] Thread (X) and YouTube links, or keep them as placeholders.
- [ ] Homepages for Maggie Huili Yao, Sahit Chintalapudi, Tiffany Zhang, Akash Anand and Megha Tippur (masthead and JSON-LD).
- [ ] Update `paper.pdf` once the paper itself lists Tiffany Zhang (the site lists 8 authors; the current PDF lists 7).
- [ ] Playback-speed factor of the UR5 PROXY/SPOT clips: the recorded rollouts look time-compressed (the DP clips look real-time), so confirm the real-time factor and set the speed labels on the clips to match.
- [ ] Maggie's generated Wan clips, Blender renders and VLM filtering examples (accepted and rejected) for the method section; Fig. 4 is the only generated-video material on hand.
- [ ] Re-sync the text (abstract, captions, tables) with the final paper, then refresh `paper.pdf` and rerun `tools/build_figures.sh`.
- [ ] Check the social-card unfurl (`img/og.png`, absolute `og:image` URL) with a link-preview tool.

## Licence

The site code (HTML, CSS, JS and `tools/`) is MIT-licensed, see `LICENSE`. The licence
does not cover the paper or the videos: the paper, its text and figures are © the authors
(and the publisher once published), and the clips under `media/` are © the authors.
Newsreader is distributed under the SIL Open Font License 1.1 (`fonts/OFL.txt`). The LIS,
MIT and RSS logos belong to their owners.
