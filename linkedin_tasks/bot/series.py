"""Shared model of the LinkedIn series: used by the posting bot AND the app backend.

Files (all under linkedin_tasks/):
  series.json                 settings + ordered list of chapter folders (edit by hand)
  posted.json                 what has been posted, keyed by post id (written by the bot only)
  posts/<chapter>/queue.json  each chapter's ordered posts (written by generator/build_queue.py)

The full sequence is every chapter's queue in series.json order. The next post is
simply the first post that is not in posted.json and not skipped. Nothing keeps a
cursor, so reordering, adding chapters or appending topics can never cause a
double post or a missed post.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent          # linkedin_tasks/
SERIES_FILE = ROOT / "series.json"
POSTED_FILE = ROOT / "posted.json"


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def load_config():
    cfg = load_json(SERIES_FILE, {})
    cfg.setdefault("paused", False)
    cfg.setdefault("timezone", "Asia/Kolkata")
    cfg.setdefault("slots", ["09:00", "21:00"])
    cfg.setdefault("min_gap_hours", 4)
    cfg.setdefault("window_minutes", 120)   # scheduled runs post only this long after a slot
    cfg.setdefault("low_buffer_days", 7)
    cfg.setdefault("skip", [])
    cfg.setdefault("chapters", [])
    return cfg


def load_posted(path=None):
    return load_json(path or POSTED_FILE, {})


def save_posted(posted, path=None):
    p = Path(path or POSTED_FILE)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(posted, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(p)                                       # atomic: never a half-written file


def sequence(cfg=None):
    """All posts of all chapters, in posting order, each tagged with its chapter folder."""
    cfg = cfg or load_config()
    out = []
    for chapter in cfg["chapters"]:
        q = load_json(ROOT / chapter / "queue.json", None)
        if q is None:
            raise FileNotFoundError(f"{chapter}/queue.json missing: run generator/build_queue.py")
        title = q.get("chapter_title") or Path(chapter).name
        for p in q["posts"]:
            out.append({**p, "chapter": chapter, "chapter_name": Path(chapter).name, "chapter_title": title})
    ids = [p["id"] for p in out]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"post ids must be unique across chapters: {sorted(dupes)}")
    return out


def tz(cfg):
    return ZoneInfo(cfg["timezone"])


def slot_times_from(start, cfg):
    """Yield successive slot datetimes (aware, series timezone) at or after `start`."""
    z = tz(cfg)
    start = start.astimezone(z)
    day = start.date()
    slots = sorted(cfg["slots"])
    while True:
        for s in slots:
            h, m = map(int, s.split(":"))
            t = datetime(day.year, day.month, day.day, h, m, tzinfo=z)
            if t >= start:
                yield t
        day += timedelta(days=1)


def current_slot(cfg, now):
    """Latest slot time at or before `now` (searches today and yesterday)."""
    z = tz(cfg)
    now = now.astimezone(z)
    best = None
    for back in (0, 1):
        day = (now - timedelta(days=back)).date()
        for s in cfg["slots"]:
            h, m = map(int, s.split(":"))
            t = datetime(day.year, day.month, day.day, h, m, tzinfo=z)
            if t <= now and (best is None or t > best):
                best = t
    return best


def build_view(cfg=None, posted=None, now=None):
    """Sequence with status per post and projected times for the unposted ones."""
    cfg = cfg or load_config()
    posted = posted if posted is not None else load_posted()
    z = tz(cfg)
    now = (now or datetime.now(z)).astimezone(z)
    seq = sequence(cfg)
    skip = set(cfg["skip"]) | {p["id"] for p in seq if p.get("skip")}

    last = None
    for v in posted.values():
        t = datetime.fromisoformat(v["posted_at"])
        last = t if last is None or t > last else last

    # Projection starts at the first slot that respects both "now" and the minimum gap.
    start = now
    if last is not None:
        start = max(start, last + timedelta(hours=cfg["min_gap_hours"]))
    if cfg.get("start_date"):
        first = datetime.fromisoformat(cfg["start_date"]).replace(tzinfo=z)
        start = max(start, first)
    slots = slot_times_from(start, cfg)

    items, next_id = [], None
    for i, p in enumerate(seq, 1):
        item = {k: v for k, v in p.items()}
        item["seq"] = i
        pdf = ROOT / p["chapter"] / "out" / p["id"] / "slides.pdf"
        item["rendered_at"] = int(pdf.stat().st_mtime) if pdf.exists() else 0   # cache-busting stamp
        if p["id"] in posted:
            item["status"] = "posted"
            item.update({"posted_at": posted[p["id"]]["posted_at"], "post_url": posted[p["id"]].get("url"),
                         "comment_ok": posted[p["id"]].get("comment_ok")})
        elif p["id"] in skip:
            item["status"] = "skipped"
        else:
            item["status"] = "next" if next_id is None else "scheduled"
            next_id = next_id or p["id"]
            item["planned_at"] = next(slots).isoformat()
        items.append(item)

    remaining = sum(1 for x in items if x["status"] in ("next", "scheduled"))
    per_day = len(cfg["slots"])
    days_left = -(-remaining // per_day) if per_day else 0
    planned = [x["planned_at"] for x in items if x.get("planned_at")]
    summary = {
        "total": len(items), "posted": len(posted), "remaining": remaining,
        "skipped": sum(1 for x in items if x["status"] == "skipped"),
        "days_left": days_left, "low_buffer": days_left < cfg["low_buffer_days"],
        "paused": cfg["paused"], "next_id": next_id,
        "last_posted_at": last.isoformat() if last else None,
        "last_planned_at": planned[-1] if planned else None,
        "chapters": cfg["chapters"], "slots": cfg["slots"], "timezone": cfg["timezone"],
        "by_type": {t: sum(1 for x in items if x["type"] == t) for t in ("theory", "code_puzzle", "concept")},
        "total_slides": sum(x.get("slide_count", 0) for x in items),
        "token_expires_on": cfg.get("token_expires_on"),
    }
    return {"summary": summary, "posts": items}
