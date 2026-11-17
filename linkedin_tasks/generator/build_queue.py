#!/usr/bin/env python3
"""Build the posting schedule (queue.json) for one chapter's rendered posts.

Usage: python3 build_queue.py <chapter_posts_dir>
  reads  <dir>/specs/*.json, <dir>/out/<id>/..., <dir>/schedule.json (created with defaults)
  writes <dir>/queue.json   (read by the app's LinkedIn Posts page)

Order: topic blocks in schedule.json "topic_order"; inside a block the theory
carousel comes first, then the Q&A posts in spec-file order, alternating code
puzzles and concept questions where possible. Two slots a day.
"""
import json, re, sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comments import first_comment  # noqa: E402

DEFAULTS = {
    "start_date": "2026-11-23",
    "slots": [{"name": "morning", "time": "09:00 IST"}, {"name": "evening", "time": "21:00 IST"}],
    "days_per_week": 7,
    "topic_order": [2, 1, 3, 4, 5, 6, 9, 10, 7, 8, 11],
}


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


def main():
    base = Path(sys.argv[1])
    cfg_path = base / "schedule.json"
    if not cfg_path.exists():
        cfg_path.write_text(json.dumps(DEFAULTS, indent=2))
    cfg = {**DEFAULTS, **json.loads(cfg_path.read_text())}

    by_topic = {}
    for f in sorted((base / "specs").glob("*.json")):
        for p in json.loads(f.read_text()):
            by_topic.setdefault(p["topic_no"], []).append(p)
    order = cfg["topic_order"] + [t for t in sorted(by_topic) if t not in cfg["topic_order"]]

    seq = []
    for t in order:
        posts = by_topic.get(t, [])
        theory = [p for p in posts if p["type"] == "theory"]
        seq += theory + interleave([p for p in posts if p["type"] != "theory"])

    slots, start = cfg["slots"], date.fromisoformat(cfg["start_date"])
    day, slot_i, d = 1, 0, start
    queue = []
    for i, p in enumerate(seq, 1):
        out = base / "out" / p["id"]
        pngs = sorted(x.name for x in out.glob("s-*.png"))
        t = {k: (plain(v) if isinstance(v, str) else v) for k, v in p["text"].items()}
        full = t["hook"].rstrip() + "\n\n" + t.get("body", "").strip()
        full = full.rstrip() + "\n\n" + " ".join("#" + h for h in t.get("hashtags", []))
        queue.append({
            "seq": i, "day": day, "date": d.isoformat(), "weekday": d.strftime("%a"),
            "slot": slots[slot_i]["name"], "time": slots[slot_i]["time"],
            "id": p["id"], "type": p["type"], "topic_no": p["topic_no"], "topic_short": p.get("topic_short", ""),
            "source": p.get("source", ""), "hook": t["hook"], "body": t.get("body", ""),
            "hashtags": t.get("hashtags", []), "post_text": full,
            "first_comment": first_comment(p),
            "slide_count": len(p["slides"]),
            "slides": [f"{p['id']}/{n}" for n in pngs], "pdf": f"{p['id']}/slides.pdf",
            "rendered": len(pngs) == len(p["slides"]),
        })
        slot_i += 1
        if slot_i == len(slots):
            slot_i, day = 0, day + 1
            d += timedelta(days=1)
            if cfg["days_per_week"] < 7:
                while d.weekday() >= cfg["days_per_week"]:
                    d += timedelta(days=1)

    summary = {
        "chapter": base.name, "total_posts": len(queue),
        "by_type": {k: sum(q["type"] == k for q in queue) for k in ("theory", "code_puzzle", "concept")},
        "total_slides": sum(q["slide_count"] for q in queue),
        "days": queue[-1]["day"] if queue else 0,
        "first_date": queue[0]["date"] if queue else None, "last_date": queue[-1]["date"] if queue else None,
        "unrendered": [q["id"] for q in queue if not q["rendered"]],
        "schedule": cfg,
    }
    (base / "queue.json").write_text(json.dumps({"summary": summary, "posts": queue}, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in summary.items() if k != "schedule"}, indent=1))


if __name__ == "__main__":
    main()
