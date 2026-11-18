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

W, H = render.PAGE_W, render.PAGE_H
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
    lo, hi = (8, 15) if first else (6, 18)   # the question also gets thinking time
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
    """Top-right timer pill  [ Answer in 9s ]  plus a thin progress bar on the top edge."""
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
    return im


def intro_card(topic, secs_label):
    """Title card: '30-SECOND CHALLENGE' + topic, shown before the question."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    f_k, f_h, f_t = ImageFont.truetype(BOLD, 34), ImageFont.truetype(BOLD, 96), ImageFont.truetype(BOLD, 52)
    cx = W // 2
    d.text((cx, H * 0.30), "C++ INTERVIEW", font=f_k, fill=BLUE, anchor="mm")
    d.text((cx, H * 0.43), secs_label, font=f_h, fill=AMBER, anchor="mm")
    d.text((cx, H * 0.53), "CHALLENGE", font=f_h, fill=(255, 255, 255), anchor="mm")
    d.rounded_rectangle([cx - 330, H * 0.63, cx + 330, H * 0.63 + 90], radius=45, outline=BLUE, width=3)
    d.text((cx, H * 0.63 + 45), topic, font=f_t, fill=BLUE, anchor="mm")
    d.text((cx, H * 0.80), "Can you answer before the timer ends?", font=ImageFont.truetype(REG, 36),
           fill=SLATE, anchor="mm")
    return im


def end_card():
    """Closing card: the follow call to action."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    cx = W // 2
    d.text((cx, H * 0.36), "Got it right?", font=ImageFont.truetype(BOLD, 64), fill=(255, 255, 255), anchor="mm")
    d.text((cx, H * 0.48), "Follow for a daily", font=ImageFont.truetype(BOLD, 72), fill=AMBER, anchor="mm")
    d.text((cx, H * 0.57), "C++ challenge", font=ImageFont.truetype(BOLD, 72), fill=AMBER, anchor="mm")
    d.text((cx, H * 0.70), "Comment your letter below", font=ImageFont.truetype(REG, 38), fill=BLUE, anchor="mm")
    d.text((cx, H * 0.88), "C++ Interview Prep", font=ImageFont.truetype(BOLD, 30), fill=SLATE, anchor="mm")
    return im


def times_up_card():
    """Between question and answer: time's up + follow call to action (gets an 'Answer in' timer)."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    cx = W // 2
    d.text((cx, H * 0.33), "Time's up!", font=ImageFont.truetype(BOLD, 96), fill=(255, 255, 255), anchor="mm")
    d.text((cx, H * 0.46), "Lock in your answer", font=ImageFont.truetype(REG, 44), fill=BLUE, anchor="mm")
    d.rounded_rectangle([cx - 400, H * 0.57, cx + 400, H * 0.57 + 190], radius=30, outline=AMBER, width=4)
    d.text((cx, H * 0.57 + 62), "Follow for a daily", font=ImageFont.truetype(BOLD, 58), fill=AMBER, anchor="mm")
    d.text((cx, H * 0.57 + 132), "C++ challenge", font=ImageFont.truetype(BOLD, 58), fill=AMBER, anchor="mm")
    d.text((cx, H * 0.88), "C++ Interview Prep", font=ImageFont.truetype(BOLD, 30), fill=SLATE, anchor="mm")
    return im


def merged_answer(post):
    """One reveal slide: verdict + 2 key bullets + one line per wrong option."""
    ans = copy.deepcopy(post["slides"][1])
    why = next((s for s in post["slides"] if s["layout"] == "wrong_options"), None)
    bullets = ans.get("bullets", [])[:2]
    if why:
        bullets += ["❌ " + re.split(r"(?<=\.)\s", it, maxsplit=1)[0] for it in why["items"]]
    ans["bullets"] = bullets
    ans.pop("wrong", None)
    ans.pop("cta", None)
    return ans


def render_video(post, out_dir, question_secs=None, intro_secs=0, merge=False, outro_secs=0, gap_secs=0):
    if merge:
        post = {**post, "slides": [post["slides"][0], merged_answer(post)]}
    d = Path(out_dir) / post["id"]
    frames_dir = d / "video_frames"
    shutil.rmtree(frames_dir, ignore_errors=True)
    frames_dir.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as tmp:
        pngs = slide_pngs(post, tmp)
        lst, plan, k = [], [], 0
        n = len(pngs)
        if intro_secs:
            card = intro_card(post.get("topic_short", "C++"), f"{question_secs or 30}-SECOND")
            for _ in range(intro_secs):
                f = frames_dir / f"f{k:04d}.png"
                card.save(f)
                lst.append(f)
                k += 1
            plan.append(intro_secs)
        for i, (png, slide) in enumerate(zip(pngs, post["slides"])):
            base = Image.open(png).convert("RGB").crop((0, 0, W, H))
            secs = question_secs if (i == 0 and question_secs) else duration(slide, i == 0)
            plan.append(secs)
            label = ("Time left" if gap_secs else "Answer in") if i == 0 else ("Next in" if i < n - 1 else "")
            for t in range(secs):
                f = frames_dir / f"f{k:04d}.png"
                overlay(base, secs - t, secs, label).save(f)
                lst.append(f)
                k += 1
            if i == 0 and gap_secs:
                card = times_up_card()
                for t in range(gap_secs):
                    f = frames_dir / f"f{k:04d}.png"
                    overlay(card, gap_secs - t, gap_secs, "Answer in").save(f)
                    lst.append(f)
                    k += 1
                plan.append(gap_secs)
    if outro_secs:
        card = end_card()
        for _ in range(outro_secs):
            f = frames_dir / f"f{k:04d}.png"
            card.save(f)
            lst.append(f)
            k += 1
        plan.append(outro_secs)
    listing = d / "video_frames" / "list.txt"
    listing.write_text("".join(f"file '{f}'\nduration 1\n" for f in lst) + f"file '{lst[-1]}'\n")
    mp4 = d / "video.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                    "-movflags", "+faststart", str(mp4)], check=True)
    return mp4, plan


def main():
    args = sys.argv[1:]
    challenge = None
    merge = "--merge" in args
    if merge:
        args.remove("--merge")
    gap = "--gap" in args                         # 3 s "Time's up / follow" card before the answer
    if gap:
        args.remove("--gap")
    outro = "--outro" in args or merge          # 3 s "follow" end card
    if "--outro" in args:
        args.remove("--outro")
    if "--challenge" in args:                     # --challenge 30: title card + 30 s question timer
        i = args.index("--challenge")
        challenge = int(args[i + 1])
        del args[i:i + 2]
    specs, out, ids = Path(args[0]), Path(args[1]).resolve(), args[2:]   # ffmpeg concat needs absolute paths
    posts = {p["id"]: p for p in render.load_specs(specs)}
    for pid in ids:
        mp4, plan = render_video(posts[pid], out, question_secs=challenge, intro_secs=3 if challenge else 0,
                                 merge=merge, outro_secs=3 if outro else 0, gap_secs=3 if gap else 0)
        print(f"{pid}: {sum(plan)} s  slides {plan}  -> {mp4}")


if __name__ == "__main__":
    main()
