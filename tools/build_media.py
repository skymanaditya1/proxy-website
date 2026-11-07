#!/usr/bin/env python3
"""Build the site's video clips from the evaluation-video zip.

Every clip on the page is described in a spec file under tools/clips/*.json. This script
pulls only the source files a spec needs out of the zip (never the whole 7 GB archive),
encodes each clip twice (H.264 MP4 and VP9 WebM, no audio), grabs a WebP poster from the
encoded MP4, and writes tools/manifest_media_<spec>.json with what it produced.

Run from the website root (paths are resolved relative to the repo root either way):

  python3 -I tools/build_media.py tools/clips/hero.json            # build every clip in a spec
  python3 -I tools/build_media.py tools/clips/hero.json --only hero  # just some slugs
  python3 -I tools/build_media.py tools/clips/hero.json --sheets     # also write contact sheets
  python3 -I tools/build_media.py --inspect ur5-corl-videos/pour/ours/2_raw.mp4 --every 0.5
        # extract one source and dump frames every 0.5 s to tools/tmp/inspect/<name>/tNNN.NN.jpg

Spec format (JSON):
  {"clips": [
     {"slug": "task-stack-panda",                 # -> media/<slug>.v1.mp4/.webm, media/<slug>.poster.webp
      "src": "panda_corl_videos/bowls/ours/3_raw.mp4",
      "ss": 0.0, "to": 11.1,                       # source seconds (to = null means end of file)
      "speed": 1,                                  # >1 speeds playback up (frames are dropped)
      "size": [960, 540],                          # output size; source is scaled to fit exactly
      "poster_t": 1.0,                             # poster time in OUTPUT seconds
      "gop": 60,                                   # optional keyframe interval (30 for short loops)
      "note": "free text for the manifest"},
     {"slug": "hero", "size": [1280, 720], "poster_t": 9.0, "hold": 1.0,
      "grid": [ {"src": ..., "ss": ..., "to": ..., "speed": 1}, x4 ]}  # 2x2: TL, TR, BL, BR
  ]}
In a grid every tile is scaled to half size, tiles that end early hold their last frame until
the longest tile ends, then all tiles hold for `hold` more seconds. A 6 px line in the page's
paper colour separates the tiles.

The zip is untrusted input: members are looked up by exact name, copied with zipfile into
tools/tmp/src/ under a flattened name, and only ever read by ffmpeg.
"""
import argparse
import concurrent.futures as cf
import json
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.environ.get("PROXY_VIDEOS_ZIP", os.path.join(ROOT, "proxy_videos.zip"))
TMP = os.path.join(ROOT, "tools", "tmp")
SRC_DIR = os.path.join(TMP, "src")
OUT = os.path.join(ROOT, "media")
FPS = 30
DIVIDER = "0xfbfaf7"

X264 = ["-an", "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-map_metadata", "-1", "-video_track_timescale", "30000"]
VP9 = ["-an", "-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-row-mt", "1", "-deadline", "good",
       "-cpu-used", "2", "-pix_fmt", "yuv420p", "-map_metadata", "-1"]


def flat(member):
    return member.replace("/", "__")


def extract(member):
    """Copy one zip member to tools/tmp/src/ and return its local path."""
    os.makedirs(SRC_DIR, exist_ok=True)
    dst = os.path.join(SRC_DIR, flat(member))
    if os.path.exists(dst):
        return dst
    with zipfile.ZipFile(ZIP) as zf:
        try:
            info = zf.getinfo(member)
        except KeyError:
            sys.exit(f"not in zip: {member}")
        tmp = dst + ".part"
        with zf.open(info) as fi, open(tmp, "wb") as fo:
            shutil.copyfileobj(fi, fo, 1 << 20)
        os.replace(tmp, dst)
    return dst


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
         "-show_entries", "stream=codec_name,width,height,nb_read_packets,r_frame_rate:format=duration",
         "-of", "json", path], capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    s = d["streams"][0]
    return {"codec": s["codec_name"], "width": s["width"], "height": s["height"],
            "frames": int(s.get("nb_read_packets", 0)), "duration_s": round(float(d["format"]["duration"]), 3)}


def seg_args(seg):
    a = ["-ss", f"{float(seg.get('ss', 0)):.3f}"]
    if seg.get("to") is not None:
        a += ["-t", f"{float(seg['to']) - float(seg.get('ss', 0)):.3f}"]
    return a + ["-i", extract(seg["src"])]


def seg_len(seg):
    """Output length of a segment in seconds (needs the source duration when to is null)."""
    ss = float(seg.get("ss", 0))
    to = seg.get("to")
    if to is None:
        to = probe(extract(seg["src"]))["duration_s"]
    return (float(to) - ss) / float(seg.get("speed", 1))


def tile_chain(seg, w, h):
    sp = float(seg.get("speed", 1))
    crop = f"crop={seg['crop']}," if seg.get("crop") else ""
    return (f"{crop}setpts=(PTS-STARTPTS)/{sp},fps={FPS},"
            f"scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p")


def graph(clip):
    """Return (input args, filter_complex, output duration)."""
    W, H = clip["size"]
    if "grid" in clip:
        segs = clip["grid"]
        assert len(segs) == 4, "grid needs exactly 4 tiles"
        w, h = W // 2, H // 2
        lens = [seg_len(s) for s in segs]
        total = max(lens) + float(clip.get("hold", 1.0))
        inputs, parts = [], []
        for i, (s, ln) in enumerate(zip(segs, lens)):
            inputs += seg_args(s)
            parts.append(f"[{i}:v]{tile_chain(s, w, h)},tpad=stop_mode=clone:stop_duration={total - ln + 0.5:.3f}[t{i}]")
        d = 3  # half of the 6 px divider
        parts.append(f"[t0][t1]hstack=2[top];[t2][t3]hstack=2[bot];[top][bot]vstack=2,"
                     f"drawbox=x={w - d}:y=0:w={2 * d}:h={H}:color={DIVIDER}:t=fill,"
                     f"drawbox=x=0:y={h - d}:w={W}:h={2 * d}:color={DIVIDER}:t=fill,"
                     f"trim=duration={total:.3f},setpts=PTS-STARTPTS[v]")
        return inputs, ";".join(parts), total
    seg = {k: clip[k] for k in ("src", "ss", "to", "speed", "crop") if k in clip}
    total = seg_len(seg)
    return seg_args(seg), f"[0:v]{tile_chain(seg, W, H)}[v]", total


def ff(args):
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y"] + args,
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-2000:])


def build(clip, sheets):
    slug = clip["slug"]
    inputs, fc, total = graph(clip)
    gop = ["-g", str(clip.get("gop", 60))]
    mp4 = os.path.join(OUT, f"{slug}.v1.mp4")
    webm = os.path.join(OUT, f"{slug}.v1.webm")
    poster = os.path.join(OUT, f"{slug}.poster.webp")
    ff(inputs + ["-filter_complex", fc, "-map", "[v]"] + X264 + gop + [mp4])
    ff(inputs + ["-filter_complex", fc, "-map", "[v]"] + VP9 + gop + [webm])
    pt = min(float(clip.get("poster_t", 0.5)), max(0.0, total - 0.1))
    ff(["-ss", f"{pt:.3f}", "-i", mp4, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82",
        "-compression_level", "6", "-map_metadata", "-1", poster])
    if sheets:
        os.makedirs(os.path.join(TMP, "sheets"), exist_ok=True)
        step = max(total / 8.0, 0.1)
        ff(["-i", mp4, "-vf", f"fps=1/{step:.3f},scale=320:-2,tile=4x2:padding=4:color=white",
            "-frames:v", "1", "-q:v", "4", os.path.join(TMP, "sheets", f"{slug}.jpg")])
    entry = {"slug": slug, "note": clip.get("note", ""), "poster_t": pt, "files": []}
    if "grid" in clip:
        entry["grid"] = clip["grid"]
        entry["hold"] = clip.get("hold", 1.0)
    else:
        entry.update({k: clip.get(k) for k in ("src", "ss", "to", "speed", "crop") if k in clip})
    for p in (mp4, webm):
        entry["files"].append({"path": os.path.relpath(p, ROOT), "bytes": os.path.getsize(p), **probe(p)})
    entry["files"].append({"path": os.path.relpath(poster, ROOT), "bytes": os.path.getsize(poster)})
    return entry


def inspect(member, every, start, end):
    src = extract(member)
    info = probe(src)
    name = flat(member).rsplit(".", 1)[0]
    out = os.path.join(TMP, "inspect", name)
    os.makedirs(out, exist_ok=True)
    end = info["duration_s"] if end is None else end
    t = start
    while t < end:
        ff(["-ss", f"{t:.3f}", "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4",
            os.path.join(out, f"t{t:06.2f}.jpg")])
        t += every
    print(json.dumps({"source": member, **info, "frames_dir": out}, indent=1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", nargs="?")
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--sheets", action="store_true")
    ap.add_argument("--inspect")
    ap.add_argument("--every", type=float, default=1.0)
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float)
    a = ap.parse_args()
    if a.inspect:
        return inspect(a.inspect, a.every, a.start, a.end)
    if not a.spec:
        ap.error("give a spec file or --inspect MEMBER")
    spec = json.load(open(a.spec))
    only = {s for s in a.only.split(",") if s}
    clips = [c for c in spec["clips"] if not only or c["slug"] in only]
    os.makedirs(OUT, exist_ok=True)
    name = os.path.splitext(os.path.basename(a.spec))[0]
    man_path = os.path.join(ROOT, "tools", f"manifest_media_{name}.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {"spec": os.path.relpath(a.spec, ROOT), "clips": []}
    done = {c["slug"]: c for c in manifest["clips"]}
    failed = []
    with cf.ThreadPoolExecutor(max_workers=a.jobs) as ex:
        futs = {ex.submit(build, c, a.sheets): c["slug"] for c in clips}
        for f in cf.as_completed(futs):
            slug = futs[f]
            try:
                done[slug] = f.result()
                mp4 = done[slug]["files"][0]
                print(f"ok   {slug}: {mp4['width']}x{mp4['height']} {mp4['duration_s']} s {mp4['bytes'] // 1024} KB")
            except Exception as e:  # report and keep going
                failed.append(slug)
                print(f"FAIL {slug}: {e}", file=sys.stderr)
    order = [c["slug"] for c in spec["clips"]]
    manifest["clips"] = sorted(done.values(), key=lambda c: order.index(c["slug"]) if c["slug"] in order else 1e9)
    with open(man_path, "w") as fo:
        json.dump(manifest, fo, indent=1)
    print(f"manifest: {os.path.relpath(man_path, ROOT)}")
    if failed:
        sys.exit(f"{len(failed)} clip(s) failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
