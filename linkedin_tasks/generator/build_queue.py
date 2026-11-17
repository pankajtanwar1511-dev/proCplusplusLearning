#!/usr/bin/env python3
"""Build a chapter's posting order (queue.json) from its rendered posts.

Usage: python3 build_queue.py <chapter_posts_dir> [--reorder]
  reads  <dir>/specs/*.json, <dir>/out/<id>/..., <dir>/chapter.json (title + topic order)
  writes <dir>/queue.json   (read by the bot and the app via linkedin_tasks/bot/series.py)

Order inside a chapter: topic blocks in chapter.json "topic_order"; each block is the
theory carousel first, then Q&A posts alternating code puzzles and concept questions.

Order is STABLE: if queue.json already exists, posts keep their existing positions and
new posts are appended at the end, so adding topics to a chapter that is already being
posted never jumps ahead of the schedule. Use --reorder to rebuild the order from
scratch (only for chapters that have not started posting).

Dates are not stored here: series.py projects them from posted.json and series.json.
"""
import json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comments import first_comment  # noqa: E402


def plain(t):
    """LinkedIn text has no markdown: drop `code` backticks and **bold**/*italic* markers."""
    t = (t or "").replace("`", "").replace("<br>", "\n")
    return re.sub(r'\*\*?(?=\S)(.+?)(?<=\S)\*\*?', r'\1', t)


def interleave(posts):
    code = [p for p in posts if p["type"] == "code_puzzle"]
    concept = [p for p in posts if p["type"] != "code_puzzle"]
    out = []
    while code or concept:
        if code:
            out.append(code.pop(0))
        if concept:
            out.append(concept.pop(0))
    return out


def default_order(by_topic, topic_order):
    order = topic_order + [t for t in sorted(by_topic) if t not in topic_order]
    seq = []
    for t in order:
        posts = by_topic.get(t, [])
        seq += [p for p in posts if p["type"] == "theory"] + interleave([p for p in posts if p["type"] != "theory"])
    return seq


def main():
    base = Path(sys.argv[1])
    reorder = "--reorder" in sys.argv
    meta = json.loads((base / "chapter.json").read_text()) if (base / "chapter.json").exists() else {}

    by_topic, specs = {}, {}
    for f in sorted((base / "specs").glob("*.json")):
        for p in json.loads(f.read_text()):
            by_topic.setdefault(p["topic_no"], []).append(p)
            specs[p["id"]] = p
    fresh = [p["id"] for p in default_order(by_topic, meta.get("topic_order", []))]

    qpath = base / "queue.json"
    old = [] if reorder or not qpath.exists() else [p["id"] for p in json.loads(qpath.read_text())["posts"]]
    order = [i for i in old if i in specs] + [i for i in fresh if i not in old]
    dropped = [i for i in old if i not in specs]

    posts = []
    for pid in order:
        p = specs[pid]
        out = base / "out" / pid
        pngs = sorted(x.name for x in out.glob("s-*.png"))
        t = {k: (plain(v) if isinstance(v, str) else v) for k, v in p["text"].items()}
        full = t["hook"].rstrip() + "\n\n" + t.get("body", "").strip()
        full = full.rstrip() + "\n\n" + " ".join("#" + h for h in t.get("hashtags", []))
        posts.append({
            "id": pid, "type": p["type"], "topic_no": p["topic_no"], "topic_short": p.get("topic_short", ""),
            "source": p.get("source", ""), "hook": t["hook"], "body": t.get("body", ""),
            "hashtags": t.get("hashtags", []), "post_text": full, "first_comment": first_comment(p),
            "slide_count": len(p["slides"]), "slides": [f"{pid}/{n}" for n in pngs],
            "pdf": f"{pid}/slides.pdf", "rendered": len(pngs) == len(p["slides"]),
            **({"skip": True} if p.get("skip") else {}),
        })

    summary = {"chapter": base.name, "chapter_title": meta.get("title", base.name), "total_posts": len(posts),
               "by_type": {k: sum(q["type"] == k for q in posts) for k in ("theory", "code_puzzle", "concept")},
               "total_slides": sum(q["slide_count"] for q in posts),
               "unrendered": [q["id"] for q in posts if not q["rendered"]],
               "appended": [i for i in order if i not in old] if old else [], "dropped": dropped}
    qpath.write_text(json.dumps({"chapter_title": summary["chapter_title"], "summary": summary, "posts": posts},
                                indent=1, ensure_ascii=False))
    print(json.dumps(summary, indent=1))
    if summary["unrendered"]:
        print("WARNING: some posts are not rendered; run render.py first", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
