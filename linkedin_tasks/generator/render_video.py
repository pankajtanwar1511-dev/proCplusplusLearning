#!/usr/bin/env python3
"""Render Q&A posts as timed reveal videos (MP4, 1080x1350, H.264).

Usage: python3 render_video.py <specs_dir> <out_dir> POST_ID [POST_ID ...]
Writes <out_dir>/<id>/video.mp4 (+ video_frames/ for inspection).

Each slide stays on screen for a time based on how much there is to read.
Every frame carries a top-right row ("Tap to pause" + seconds left on the
current slide) and a thin progress bar, so viewers
know when the answer is coming and can stop on any slide. Slide footers lose
their "swipe" hints (the video advances by itself).
"""
import copy, json, math, re, shutil, subprocess, sys, tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import render  # noqa: E402

W, H = 1080, 1350
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
AMBER, BLUE, SLATE, BG = (245, 158, 11), (147, 197, 253), (148, 163, 184), (15, 23, 42)


def words(slide):
    """Approximate reading load of a slide: words of prose + weighted code lines."""
    text, code_lines = [], 0
    def walk(v, key=""):
        nonlocal code_lines
        if isinstance(v, str):
            if key == "code":
                code_lines += v.count("\n") + 1
            elif key not in ("layout", "cta", "kicker"):
                text.append(v)
        elif isinstance(v, list):
            for x in v:
                walk(x, key)
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(x, k)
    walk(slide)
    n = len(re.findall(r"\w+", " ".join(text)))
    return n, code_lines


def duration(slide, first):
    n, code = words(slide)
    secs = n / 3.5 + code * 0.6 + 1          # ~3.5 words/s skim-reading on a phone, + code scanning
    lo, hi = (8, 15) if first else (6, 14)   # the question also gets thinking time
    return int(max(lo, min(hi, math.ceil(secs))))


def slide_pngs(post, tmp):
    """Render the post's slides without swipe hints, return PNG paths."""
    p = copy.deepcopy(post)
    for s in p["slides"]:
        s.pop("cta", None)
    # keep the top 120 px clear for the timer row (slides are vertically centred)
    css = render.CSS
    render.CSS = css + "\n.pg { padding-top: 130px; }"
    try:
        html_text = render.build_html(p)
    finally:
        render.CSS = css
    html = Path(tmp) / "v.html"
    html.write_text(html_text)
    pdf = Path(tmp) / "v.pdf"
    render.chrome([f"--print-to-pdf={pdf}", f"file://{html}"])
    subprocess.run(["pdftoppm", "-r", "96", "-png", str(pdf), str(Path(tmp) / "s")], check=True,
                   capture_output=True)
    return sorted(Path(tmp).glob("s-*.png"))


def overlay(base, left, total, label):
    """Top-right, one horizontal row:  [pause icon] Tap to pause   [ Answer in 9s ]"""
    im = base.copy()
    d = ImageDraw.Draw(im)
    # progress bar across the top edge (time elapsed on this slide)
    d.rectangle([0, 0, W, 10], fill=(30, 41, 59))
    d.rectangle([0, 0, int(W * (1 - left / total)), 10], fill=AMBER)
    lab_f, num_f, hint_f = ImageFont.truetype(BOLD, 30), ImageFont.truetype(BOLD, 40), ImageFont.truetype(REG, 28)
    num = f"{left}s"
    label = (label + " ") if label else ""
    lw, nw = d.textlength(label, font=lab_f), d.textlength(num, font=num_f)
    y1, y2 = 30, 96
    x2 = W - 40
    x1 = int(x2 - (lw + nw + 48))
    d.rounded_rectangle([x1, y1, x2, y2], radius=22, fill=(30, 41, 59), outline=AMBER, width=3)
    cy = (y1 + y2) // 2
    d.text((x1 + 24, cy), label, font=lab_f, fill=BLUE, anchor="lm")
    d.text((x1 + 24 + lw, cy), num, font=num_f, fill=(255, 255, 255), anchor="lm")
    # "Tap to pause" with a pause icon, same line, left of the pill
    hint = "Tap to pause"
    hw = d.textlength(hint, font=hint_f)
    hx = x1 - 28 - hw
    d.text((hx, cy), hint, font=hint_f, fill=SLATE, anchor="lm")
    d.rectangle([hx - 36, cy - 13, hx - 28, cy + 13], fill=SLATE)
    d.rectangle([hx - 22, cy - 13, hx - 14, cy + 13], fill=SLATE)
    return im


def render_video(post, out_dir):
    d = Path(out_dir) / post["id"]
    frames_dir = d / "video_frames"
    shutil.rmtree(frames_dir, ignore_errors=True)
    frames_dir.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as tmp:
        pngs = slide_pngs(post, tmp)
        lst, plan, k = [], [], 0
        n = len(pngs)
        for i, (png, slide) in enumerate(zip(pngs, post["slides"])):
            base = Image.open(png).convert("RGB").crop((0, 0, W, H))
            secs = duration(slide, i == 0)
            plan.append(secs)
            label = "Answer in" if i == 0 else ("Next in" if i < n - 1 else "")
            for t in range(secs):
                f = frames_dir / f"f{k:04d}.png"
                overlay(base, secs - t, secs, label).save(f)
                lst.append(f)
                k += 1
    listing = d / "video_frames" / "list.txt"
    listing.write_text("".join(f"file '{f}'\nduration 1\n" for f in lst) + f"file '{lst[-1]}'\n")
    mp4 = d / "video.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                    "-movflags", "+faststart", str(mp4)], check=True)
    return mp4, plan


def main():
    specs, out, ids = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
    posts = {p["id"]: p for p in render.load_specs(specs)}
    for pid in ids:
        mp4, plan = render_video(posts[pid], out)
        print(f"{pid}: {sum(plan)} s  slides {plan}  -> {mp4}")


if __name__ == "__main__":
    main()
