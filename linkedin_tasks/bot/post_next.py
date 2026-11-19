#!/usr/bin/env python3
"""Post the next LinkedIn carousel in the series and record it in posted.json.

Usage (normally run by .github/workflows/linkedin_post.yml):
  python3 post_next.py                 # scheduled run: post next item if due
  python3 post_next.py --dry-run       # check token + show what would be posted, change nothing
  python3 post_next.py --id T02-P2     # post a specific item (manual run)
  python3 post_next.py --force         # ignore the minimum gap between posts
  python3 post_next.py --simulate      # full flow without calling LinkedIn (local testing)
  python3 post_next.py --status        # print the series status and exit
  python3 post_next.py --comment-missing  # add the first comment to posted items where it failed

Writes GitHub Actions outputs (posted_id, low_buffer, token_warning) when
GITHUB_OUTPUT is set, so the workflow can commit and open reminder issues.
"""
import argparse
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import series  # noqa: E402

log = logging.getLogger("bot")


def gh_output(**kv):
    path = os.getenv("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def document_title(post):
    kind = {"theory": "Theory + Myths", "code_puzzle": "Code Puzzle", "concept": "Interview Question"}
    return f"{post.get('chapter_title', 'C++')} · {post.get('topic_short', '')} · {kind.get(post['type'], 'Post')}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--simulate", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--id")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--comment-missing", action="store_true")
    ap.add_argument("--posted-file", help="override posted.json (testing)")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    cfg = series.load_config()
    posted = series.load_posted(a.posted_file)
    view = series.build_view(cfg, posted)
    s = view["summary"]
    now = datetime.now(series.tz(cfg))

    # Reminders the workflow turns into GitHub issues.
    token_warning = ""
    if cfg.get("token_expires_on"):
        left = (date.fromisoformat(cfg["token_expires_on"]) - now.date()).days
        if left <= 7:
            token_warning = f"LinkedIn token expires on {cfg['token_expires_on']} ({left} days left)"
    gh_output(low_buffer=str(s["low_buffer"]).lower(), days_left=s["days_left"], token_warning=token_warning)

    log.info("Series: %d posted, %d remaining (%d days), next: %s, paused: %s",
             s["posted"], s["remaining"], s["days_left"], s["next_id"], s["paused"])
    if token_warning:
        log.warning(token_warning)
    if a.status:
        return 0

    if a.comment_missing:
        from linkedin_client import LinkedInClient
        missing = [p for p in view["posts"] if p["status"] == "posted" and not posted[p["id"]].get("comment_ok")]
        if a.id:
            missing = [p for p in missing if p["id"] == a.id]
        if not missing:
            log.info("No posted item is missing its first comment.")
            return 0
        client = LinkedInClient()
        client.check_token()
        failed = 0
        for p in missing:
            try:
                client.add_comment(posted[p["id"]]["post_urn"], p["first_comment"])
                posted[p["id"]]["comment_ok"] = True
                series.save_posted(posted, a.posted_file)
                log.info("✅ Comment added to %s", p["id"])
            except Exception as e:  # noqa: BLE001
                failed += 1
                log.error("%s: %s", p["id"], e)
        gh_output(posted_id="comments")
        return 1 if failed else 0

    if s["paused"] and not a.id:
        log.info("Series is paused (series.json). Nothing to do.")
        return 0

    by_id = {p["id"]: p for p in view["posts"]}
    if a.id:
        post = by_id.get(a.id)
        if not post:
            log.error("Unknown post id %s", a.id)
            return 1
        if post["status"] == "posted":
            log.error("%s was already posted on %s (%s)", a.id, post["posted_at"], post.get("post_url"))
            return 1
    else:
        post = by_id.get(s["next_id"]) if s["next_id"] else None
        if not post:
            log.info("Nothing left to post. Add a chapter to series.json.")
            return 0

    if cfg.get("start_date") and now.date() < date.fromisoformat(cfg["start_date"]) and not (a.force or a.id):
        log.info("Series starts on %s. Not posting yet.", cfg["start_date"])
        return 0
    # Scheduled runs: GitHub cron is often late (even hours) or drops runs, so the
    # workflow tries every hour and the bot CATCHES UP: it posts whenever today has
    # fewer posts than slots already due today, as long as it is before
    # "last_post_time" (IST) and min_gap_hours have passed. Two slots = two posts a day.
    # Manual runs (workflow_dispatch / local) skip this check.
    if os.getenv("GITHUB_EVENT_NAME") == "schedule" and not (a.force or a.id):
        z = series.tz(cfg)
        today = now.astimezone(z).date()
        due = sum(1 for sl in cfg["slots"] if now.astimezone(z).strftime("%H:%M") >= sl)
        done = sum(1 for v in posted.values()
                   if datetime.fromisoformat(v["posted_at"]).astimezone(z).date() == today)
        if done >= due:
            log.info("Today: %d slot(s) due, %d posted. Nothing to do.", due, done)
            return 0
        if now.astimezone(z).strftime("%H:%M") >= cfg["last_post_time"]:
            log.warning("Today: %d slot(s) due, %d posted, but it is past %s IST. Not posting at night.",
                        due, done, cfg["last_post_time"])
            return 0
        log.info("Today: %d slot(s) due, %d posted. Posting (catch-up allowed).", due, done)
    if s["last_posted_at"] and not (a.force or a.id):
        gap = now - datetime.fromisoformat(s["last_posted_at"])
        if gap < timedelta(hours=cfg["min_gap_hours"]):
            log.info("Last post was %.1f h ago (< %d h). Skipping this run.", gap.total_seconds() / 3600,
                     cfg["min_gap_hours"])
            return 0

    chapter_dir = series.ROOT / post["chapter"] / "out" / post["id"]
    is_video = post.get("format") == "video"
    pdf = chapter_dir / ("video.mp4" if is_video else "slides.pdf")
    if not pdf.exists():
        log.error("Missing %s: run generator/%s", pdf, "render_video.py" if is_video else "render.py")
        return 1
    text, comment, title = post["post_text"], post["first_comment"], document_title(post)
    log.info("Next: %s (%s, %s), %d slides, %d chars", post["id"], post["type"], post["topic_short"],
             post.get("slide_count", 0), len(text))

    if a.dry_run:
        from linkedin_client import LinkedInClient, TokenError
        try:
            who = LinkedInClient().check_token()
            log.info("Token OK (%s)", who)
        except (TokenError, ValueError) as e:
            log.error("Token problem: %s", e)
            gh_output(token_error="true")
            return 1
        print(f"\n--- DRY RUN: would post {post['id']} ({'video' if is_video else 'carousel'}) ---\nTitle: {title}\nFile: {pdf}\n\n{text}\n\n"
              f"--- first comment ---\n{comment}\n")
        return 0

    if a.simulate:
        urn, comment_ok = f"urn:li:share:SIMULATED-{post['id']}", True
    else:
        from linkedin_client import LinkedInClient, TokenError
        client = LinkedInClient()
        try:
            client.check_token()
        except TokenError as e:
            log.error("Token problem: %s", e)
            gh_output(token_error="true")
            return 1
        media = client.upload_video(pdf) if is_video else client.upload_document(pdf)
        urn = client.create_document_post(text, media, title)

    # Record the post BEFORE the comment: a comment failure must never cause a re-post.
    from linkedin_client import post_url
    posted[post["id"]] = {"posted_at": datetime.now(series.tz(cfg)).isoformat(timespec="seconds"),
                          "post_urn": urn, "url": post_url(urn), "chapter": post["chapter"],
                          "comment_ok": False, "run": os.getenv("GITHUB_RUN_URL", "local")}
    series.save_posted(posted, a.posted_file)

    if a.simulate:
        comment_ok = True
    else:
        comment_ok = False
        for attempt in range(3):
            try:
                time.sleep(10)          # give LinkedIn a moment to index the new post
                client.add_comment(urn, comment)
                comment_ok = True
                break
            except Exception as e:      # noqa: BLE001 - post is already live; just report
                log.warning("Comment attempt %d failed: %s", attempt + 1, e)
    posted[post["id"]]["comment_ok"] = comment_ok
    series.save_posted(posted, a.posted_file)

    log.info("✅ Posted %s %s (comment: %s)", post["id"], posted[post["id"]]["url"], comment_ok)
    gh_output(posted_id=post["id"], comment_ok=str(comment_ok).lower())
    return 0


if __name__ == "__main__":
    sys.exit(main())
