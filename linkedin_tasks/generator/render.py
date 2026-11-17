#!/usr/bin/env python3
"""Render LinkedIn carousel posts from JSON specs into vector PDFs + PNG slides.

Usage:
  python3 render.py <specs_dir> <out_dir> [post_id ...]

Each spec file holds one post (or a list of posts). Per post the renderer writes
  <out_dir>/<id>/slides.pdf      1080x1350 vector PDF (upload to LinkedIn as a document)
  <out_dir>/<id>/s-NN.png        1080x1350 PNG per slide (preview / review)
  <out_dir>/<id>/post.txt        post text + first comment, ready to paste
and <out_dir>/render_report.json with fit results. Any slide that still
overflows after auto-fit is reported as an error (exit code 1).

Inline markup allowed in every text field: `code`, **bold**, *italic*, and <br>.
See SPEC.md for the slide layouts.
"""
import html, json, re, subprocess, sys, tempfile
from pathlib import Path

from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import CppLexer

sys.path.insert(0, str(Path(__file__).parent))
from comments import first_comment  # noqa: E402

CHROME = "google-chrome"
MIN_CODE_PX = 28   # below this, code is hard to read on a phone
BRAND = "C++ Interview Prep"
FMT = HtmlFormatter(nowrap=True, style="monokai")


# ---------------------------------------------------------------- helpers
def md(text):
    """Escape, then apply the tiny inline markup."""
    if text is None:
        return ""
    parts = re.split(r'(`[^`]+`)', str(text))
    out = []
    for p in parts:
        if p.startswith("`") and p.endswith("`") and len(p) > 1:
            out.append(f"<code>{html.escape(p[1:-1])}</code>")
        else:
            e = html.escape(p).replace("&lt;br&gt;", "<br>")
            e = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', e)
            e = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', e)
            out.append(e)
    return "".join(out)


def code(src, cls=""):
    return f'<pre class="code {cls}">{highlight(src.strip(chr(10)), CppLexer(), FMT)}</pre>'


def bullets(items, cls=""):
    return f'<ul class="{cls}">' + "".join(f"<li>{md(i)}</li>" for i in items) + "</ul>"


def kicker(s, color=None):
    style = f' style="color:{color}"' if color else ""
    return f'<div class="kicker"{style}>{md(s)}</div>' if s else ""


def columns(cols):
    cells = []
    for c in cols:
        v = ""
        if c.get("verdict"):
            v = f'<div class="verdict {"ok" if c.get("verdict_ok") else "bad"}">{md(c["verdict"])}</div>'
        cells.append(f'<div><div class="colh">{md(c.get("label", ""))}</div>{code(c["code"], "col")}{v}</div>')
    return f'<div class="cols">{"".join(cells)}</div>'


# ---------------------------------------------------------------- slide layouts
def s_puzzle(s):
    h = kicker(s.get("kicker"))
    h += f'<h1>{md(s["title"])}</h1>'
    if s.get("code"):
        h += code(s["code"], "big")
    if s.get("shared_code"):
        h += code(s["shared_code"], "mid")
    if s.get("columns"):
        h += columns(s["columns"])
    if s.get("options"):
        h += '<div class="opts">' + "".join(
            f'<span><b>{chr(65 + i)}</b>{md(o)}</span>' for i, o in enumerate(s["options"])) + "</div>"
    return h


def s_question(s):
    h = kicker(s.get("kicker", "C++ Interview Question"), "#f59e0b")
    h += f'<h1>{md(s["title"])}</h1>'
    if s.get("code"):
        h += code(s["code"], "mid")
    h += '<div class="qopts">' + "".join(
        f'<div><b>{chr(65 + i)}</b>{md(o)}</div>' for i, o in enumerate(s["options"])) + "</div>"
    return h


def s_answer(s):
    h = kicker(s.get("kicker", "Answer"), "#4ade80")
    sub = f'<span>{md(s["verdict_sub"])}</span>' if s.get("verdict_sub") else ""
    h += f'<div class="ans ok">✅ {md(s["verdict"])}{sub}</div>'
    if s.get("text"):
        h += f'<p class="body-p">{md(s["text"])}</p>'
    if s.get("bullets"):
        h += bullets(s["bullets"])
    if s.get("code"):
        h += code(s["code"], "mid")
    if s.get("wrong"):
        h += f'<div class="ans bad">❌ Common wrong answer: {md(s["wrong"])}</div>'
    return h


def s_code(s):
    h = kicker(s.get("kicker", "The fix"))
    if s.get("title"):
        h += f'<h2>{md(s["title"])}</h2>'
    if s.get("code"):
        h += code(s["code"], "big")
    if s.get("columns"):
        h += columns(s["columns"])
    if s.get("bullets"):
        h += bullets(s["bullets"])
    if s.get("tip"):
        h += f'<div class="tip">⚠️ {md(s["tip"])}</div>'
    if s.get("takeaway"):
        h += f'<div class="take">💡 {md(s["takeaway"])}</div>'
    return h


def s_wrong_options(s):
    h = kicker(s.get("kicker", "Why the others are wrong"))
    h += "".join(f'<div class="ans bad">❌ {md(i)}</div>' for i in s["items"])
    if s.get("takeaway"):
        h += f'<div class="take">💡 {md(s["takeaway"])}</div>'
    return h


def s_cover(s):
    h = kicker(s.get("kicker", "C++ Concurrency"))
    h += f'<div class="hero">{md(s["hero"])}</div>'
    if s.get("lead"):
        h += f'<p class="lead">{md(s["lead"])}</p>'
    return h


def s_cards(s):
    h = kicker(s.get("kicker")) + (f'<h2>{md(s["title"])}</h2>' if s.get("title") else "")
    h += '<div class="qa2">' + "".join(
        f'<div><b class="lbl">{md(c["label"])}</b>{md(c["text"])}</div>' for c in s["cards"]) + "</div>"
    if s.get("takeaway"):
        h += f'<div class="take">💡 {md(s["takeaway"])}</div>'
    return h


def s_table(s):
    h = kicker(s.get("kicker")) + (f'<h2>{md(s["title"])}</h2>' if s.get("title") else "")
    head = ""
    if s.get("header"):
        head = "<tr>" + "".join(f"<th>{md(c)}</th>" for c in s["header"]) + "</tr>"
    rows = "".join("<tr>" + "".join(f"<td>{md(c)}</td>" for c in r) + "</tr>" for r in s["rows"])
    h += f'<table class="tbl">{head}{rows}</table>'
    if s.get("takeaway"):
        h += f'<div class="take">💡 {md(s["takeaway"])}</div>'
    return h


def s_chain(s):
    h = kicker(s.get("kicker")) + (f'<h2>{md(s["title"])}</h2>' if s.get("title") else "")
    steps = s["steps"]
    h += '<div class="chain">' + "".join(
        f'<div class="{"fin" if i == len(steps) - 1 and s.get("final_ok", True) else ""}">{md(t)}</div>'
        for i, t in enumerate(steps)) + "</div>"
    if s.get("takeaway"):
        h += f'<div class="take">💡 {md(s["takeaway"])}</div>'
    return h


def s_statement(s):
    h = kicker(s.get("kicker", "The trap"))
    h += f'<div class="hero">{md(s["hero"])}</div>'
    if s.get("lead"):
        h += f'<p class="lead">{md(s["lead"])}</p>'
    return h


def s_checklist(s):
    h = kicker(s.get("kicker")) + (f'<h2>{md(s["title"])}</h2>' if s.get("title") else "")
    h += bullets(s["items"], "checks")
    if s.get("code"):
        h += code(s["code"], "mid")
    if s.get("warn"):
        h += f'<div class="ans bad">{md(s["warn"])}</div>'
    if s.get("takeaway"):
        h += f'<div class="take">💡 {md(s["takeaway"])}</div>'
    return h


def s_myths(s):
    h = kicker(s.get("kicker", "Myth busters"), "#f87171")
    h += f'<h2>{md(s.get("title", "Answers that fail interviews"))}</h2>'
    h += '<div class="myths">' + "".join(
        f'<div class="myth"><div class="mx">❌ {md(m["myth"])}</div><div class="mo">✅ {md(m["truth"])}</div></div>'
        for m in s["items"]) + "</div>"
    return h


def s_takeaway(s):
    h = kicker(s.get("kicker", "Takeaway"))
    h += f'<div class="hero sm">{md(s["hero"])}</div>'
    if s.get("lead"):
        h += f'<p class="lead">{md(s["lead"])}</p>'
    return h


LAYOUTS = {
    "puzzle": s_puzzle, "question": s_question, "answer": s_answer, "code": s_code,
    "wrong_options": s_wrong_options, "cover": s_cover, "cards": s_cards, "table": s_table,
    "chain": s_chain, "statement": s_statement, "checklist": s_checklist, "myths": s_myths,
    "takeaway": s_takeaway,
}


def render_page(slide, n, total, topic_label):
    inner = LAYOUTS[slide["layout"]](slide)
    left = (f'<b class="ctaf">{md(slide["cta"])}</b>' if slide.get("cta")
            else f'<span>{html.escape(BRAND)} · {html.escape(topic_label)}</span>')
    return (f'<section class="pg" data-n="{n}"><div class="body"><div class="inner">{inner}</div></div>'
            f'<footer>{left}<span>{n}/{total}</span></footer></section>')


CSS = (Path(__file__).with_name("slides.css")).read_text() + HtmlFormatter(style="monokai").get_style_defs(".code")

FIT_JS = """<script>
const report = [];
for (const pg of document.querySelectorAll('.pg')) {
  const pres = [...pg.querySelectorAll('pre.code')];
  const body = pg.querySelector('.body');
  const wide = () => pres.some(p => p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1);
  // Content is vertically centred, so it can spill past BOTH edges; compare the
  // content block's own height with the space available inside the body.
  const inner = pg.querySelector('.inner');
  const room = () => body.clientHeight - parseFloat(getComputedStyle(body).paddingBottom);
  const tall = () => inner.getBoundingClientRect().height / (parseFloat(body.style.zoom) || 1) > room() + 1;
  const set = v => pres.forEach(p => p.style.fontSize = v + 'px');
  let size = 44;
  if (pres.length) { set(size); while (size > 22 && (wide() || tall())) { size -= 1; set(size); } }
  let zoom = 1.0;
  while (zoom > 0.74 && (tall() || wide())) { zoom = +(zoom - 0.02).toFixed(2); body.style.zoom = zoom; }
  const textWide = [...body.querySelectorAll('*')].some(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'visible' && e.tagName !== 'PRE');
  pg.setAttribute('data-fit', JSON.stringify({n: +pg.dataset.n, code_px: pres.length ? size : null, zoom,
    overflow: tall() || wide() || textWide}));
}
</script>"""


def build_html(post):
    slides = post["slides"]
    pages = "".join(render_page(s, i + 1, len(slides), post.get("topic_short", "Concurrency"))
                    for i, s in enumerate(slides))
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>{pages}{FIT_JS}</body></html>"""


def chrome(args, timeout=120):
    return subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                           "--virtual-time-budget=10000", *args],
                          capture_output=True, text=True, timeout=timeout)


def plain(t):
    """LinkedIn text has no markdown: drop `code` backticks and **bold**/*italic* markers."""
    t = (t or "").replace("`", "").replace("<br>", "\n")
    return re.sub(r'\*\*?(?=\S)(.+?)(?<=\S)\*\*?', r'\1', t)


def post_text(post):
    t = {k: (plain(v) if isinstance(v, str) else v) for k, v in post["text"].items()}
    tags = " ".join("#" + h for h in t.get("hashtags", []))
    body = t["hook"].rstrip() + "\n\n" + t.get("body", "").strip()
    return body.rstrip() + ("\n\n" + tags if tags else "")


def render_post(post, out_dir, tmp):
    pid = post["id"]
    d = out_dir / pid
    d.mkdir(parents=True, exist_ok=True)
    src = Path(tmp) / f"{pid}.html"
    src.write_text(build_html(post))
    dom = chrome(["--dump-dom", f"file://{src}"]).stdout
    fits = [json.loads(html.unescape(m)) for m in re.findall(r'data-fit="([^"]*)"', dom)]
    chrome([f"--print-to-pdf={d / 'slides.pdf'}", f"file://{src}"])
    for old in d.glob("s-*.png"):
        old.unlink()
    subprocess.run(["pdftoppm", "-r", "96", "-png", str(d / "slides.pdf"), str(d / "s")],
                   capture_output=True)
    # normalise names to s-01.png ...
    for p in sorted(d.glob("s-*.png")):
        n = int(re.search(r'-(\d+)\.png$', p.name).group(1))
        p.rename(d / f"s-{n:02d}.png")
    txt = post_text(post)
    (d / "post.txt").write_text(
        f"=== POST TEXT ===\n{txt}\n\n=== FIRST COMMENT ===\n{first_comment(post)}\n")
    return {"id": pid, "slides": len(post["slides"]), "fit": fits,
            "overflow": [f["n"] for f in fits if f.get("overflow")],
            "small_code": [f["n"] for f in fits if f.get("code_px") and f["code_px"] < MIN_CODE_PX],
            "chars": len(txt), "png": len(list(d.glob("s-*.png")))}


def load_specs(specs_dir):
    posts = []
    for f in sorted(Path(specs_dir).glob("*.json")):
        data = json.loads(f.read_text())
        for p in (data if isinstance(data, list) else data.get("posts", [data])):
            p["_file"] = f.name
            posts.append(p)
    return posts


def main():
    specs_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    only = set(sys.argv[3:])
    out_dir.mkdir(parents=True, exist_ok=True)
    posts = [p for p in load_specs(specs_dir) if not only or p["id"] in only]
    rep_path = out_dir / "render_report.json"
    report = json.loads(rep_path.read_text()) if rep_path.exists() and only else {}
    bad = 0
    with tempfile.TemporaryDirectory() as tmp:
        for p in posts:
            r = render_post(p, out_dir, tmp)
            report[p["id"]] = r
            flag = "OVERFLOW slides " + str(r["overflow"]) if r["overflow"] else "ok"
            if r["small_code"]:
                flag += f" SMALL CODE (<{MIN_CODE_PX}px) slides {r['small_code']}"
            if r["overflow"] or r["small_code"] or r["png"] != r["slides"]:
                bad += 1
            zooms = [f["zoom"] for f in r["fit"] if f["zoom"] < 1]
            print(f'{p["id"]:12s} {r["slides"]} slides  text {r["chars"]:4d} chars  '
                  f'{"zoom " + str(min(zooms)) if zooms else ""}  {flag}')
    rep_path.write_text(json.dumps(report, indent=1))
    print(f"\n{len(posts)} posts rendered, {bad} with problems")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
