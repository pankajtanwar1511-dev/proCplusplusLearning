# LinkedIn posting bot

Posts the LinkedIn series automatically with GitHub Actions
(`.github/workflows/linkedin_post.yml`), twice a day, and records every post in
`linkedin_tasks/posted.json`. The app's **Interview Prep → LinkedIn Posts** page reads
the same files, so it shows what was posted (time + link) and what is next.

```
linkedin_tasks/
├── series.json        you edit: chapter order, pause, skip, times, token expiry
├── posted.json        bot writes: { "<post id>": { posted_at, url, comment_ok, ... } }
├── posts/<chapter>/   chapter.json, specs/, out/ (slides.pdf, PNGs), queue.json
├── bot/               series.py (shared with the app), post_next.py, linkedin_client.py
└── generator/         render.py, build_queue.py, comments.py, SPEC.md
```

## How the next post is chosen

1. Read `series.json` → load each chapter's `queue.json` in the listed order.
2. Drop ids already in `posted.json` and ids in `skip` (or `"skip": true` in a spec).
3. Post the first one left. Record it in `posted.json` **before** adding the first
   comment, so a failure afterwards can never cause a double post.

There is no position counter: reordering chapters, adding chapters or appending
topics can never double post or miss a post. Dates in the app are projected from
the last real post, so they shift automatically if a run is late or skipped.

Schedule (one run per slot, no retry runs): the workflow fires at the slot times,
11:30 and 23:00 JST. GitHub may start a run late; it then posts whenever it starts,
until 1 h before the next slot (first run until 22:00 JST, second run until 10:30 JST
next day); later than that it skips and the next slot's run posts. Each post records
the cron firing it was for (`for_slot`), so the same firing can never post twice,
and a manual post from 30 min before a firing counts for it.

Duplicate safety: the post call is never retried. If LinkedIn times out or answers
5xx while creating a post (it may be live), or posted.json cannot be pushed, the bot
records the post and opens a "LinkedIn bot on hold" issue; scheduled runs do nothing
until you check LinkedIn, fix posted.json if needed and close the issue.

Guards: no posting before `start_date`, at least `min_gap_hours` between posts,
one run at a time, and a post is never retried automatically (a retry after a
timeout could publish twice).

## One-time setup / token renewal (every 60 days)

1. https://www.linkedin.com/developers/apps → your app → **Products**: both
   **Share on LinkedIn** (`w_member_social`: post + comment) and
   **Sign In with LinkedIn using OpenID Connect** (`openid`, `profile`) must be added.
2. https://www.linkedin.com/developers/tools/oauth/token-generator → select the app,
   tick `openid`, `profile`, `w_member_social` → **Request access token** → copy it.
3. Store it as a repository secret (prompts for the value, keeps it out of history;
   never paste the token into chats, issues or commits):
   ```
   gh secret set LINKEDIN_ACCESS_TOKEN --repo pankajtanwar1511-dev/proCplusplusLearning
   ```
4. Your member id (`urn:li:person:...`) is looked up from the token automatically.
   Optional: set it as `LINKEDIN_USER_ID` to skip the lookup.
   If a token ever leaks: linkedin.com → Settings & Privacy → Data privacy →
   Permitted services → remove the app (revokes all its tokens), then generate a new one.
5. Set `token_expires_on` in `series.json` (generation date + 60 days). The bot opens a
   GitHub issue 7 days before it expires.
6. GitHub → Actions → **LinkedIn post** → Run workflow → mode **dry-run**: checks the
   token and prints exactly what would be posted, without posting.

## Everyday controls

| Want to | Do |
|---|---|
| Pause everything | `"paused": true` in `series.json`, push |
| Never post one item | add its id to `"skip"` in `series.json` |
| Post one item now | Actions → Run workflow → mode `post`, `post_id` = id |
| Catch up after a missed slot | Run workflow → mode `post` (tick `force` to ignore the gap) |
| Change times | `"slots"` in `series.json` (times in `"timezone"`) **and** the two cron lines in the workflow (UTC = JST − 9) |
| See status locally | `python3 linkedin_tasks/bot/post_next.py --status` |
| Test locally without LinkedIn | `python3 post_next.py --simulate --force --posted-file /tmp/p.json` |

Pull before you push: the bot commits `posted.json` to `main` after each post
(`chore(linkedin): posted <id>`). Vercel and Render ignore pushes that only change
`posted.json`, so these commits do not trigger deploys.

## Adding a chapter (or topics)

1. Build the posts: specs in `posts/<chapter>/specs/`, then
   `python3 generator/render.py posts/<chapter>/specs posts/<chapter>/out` (see `generator/SPEC.md`).
2. `posts/<chapter>/chapter.json`: `{"title": "C++ Core", "topic_order": [...]}`.
3. `python3 generator/build_queue.py posts/<chapter>` → `queue.json`.
   Existing order is kept; new posts are appended at the end of that chapter.
   (`--reorder` rebuilds the order; only for chapters that have not started.)
4. Add `"posts/<chapter>"` to `"chapters"` in `series.json`, commit, push.

Post ids must be unique across all chapters (the bot refuses to run otherwise).
A GitHub issue "LinkedIn queue running low" is opened when fewer than
`low_buffer_days` days of posts remain.
