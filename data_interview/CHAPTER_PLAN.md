# Interview Prep catalog: chapter plan

Agreed with the user on 2026-11-23. Follow this order and grouping for every new chapter.
Source groups live in `topics/` (see `topics/INDEX.md`, 1770 exchanges total).

| Ch | Title | Source topic files | Exchanges | Status |
|---|---|---|---|---|
| 1 | Core Language & Object Model | C10, C11, C17, C20, C21, C22, C27, C28, C29, C30 | ~171 | Planned |
| 2 | Memory & Ownership | C01, C02, C03, C04, C05, C06, C23, C24, C25, C26 | ~117 | Done (`chapter_2_memory_ownership/`, 2026-11-24) |
| 3 | STL & Templates | C07, C08, C09, C12, C13, C14, C15, C16, C18, C19 | ~216 | In progress (2026-11-25) |
| 4 | Concurrency | T01 to T11 | 234 | Done (`chapter_4_concurrency/`) |
| 5 | Systems & Performance | S01 to S06 | 80 | Planned |
| 6 | Networking | N01 to N04 | 173 | Planned |
| 7 | Trading Systems & Design | F01 to F04 | 117 | Planned |
| 8 | Coding Problems | K01, K02 | 295 | Planned (needs walkthrough format) |
| 9 | Quant & Aptitude | Q01, Q02 | 77 | Planned (small) |
| 10 | Behavioral | B01, B02 | 149 | Optional (personal, company-specific) |
| - | Study plans / misc | M01, M02 | 172 | Skip (not content) |

## Recipe for each chapter (same as Chapter 4)

1. Read the source topic files in full. ChatGPT answers are raw material, not trusted facts.
2. Map every exchange to a chapter topic, note gaps, and show the outline to the user before writing.
3. Per topic write `_theory.md`, `_qa.md`, `_practice.md` in the strict parser format.
   - Style: point-wise bullets, no em/en dashes as connectors.
   - Depth target (Chapter 4 averages): theory about 450 to 600 lines with about 9 core sections,
     about 8 edge cases, about 6 to 7 examples and a quick reference; about 12 to 24 interview
     questions; about 7 to 15 practice puzzles (Answer, Explanation bullets, Key Concept).
   - Pick the most important and most interview-relevant questions; no duplicates across topics.
4. Compile and run every program (`g++ -std=c++20`, ASan/UBSan where relevant); answers must match real output.
5. Independent review against the C++ standard (separate reviewer that sees only the content).
6. Top picks topic_00 via `tools/top_picks_chN.json` + `tools/build_top_picks.py`.
7. `./manage.sh check:interview` must pass all 4 checks; check in the app.
8. Commit only when the user asks.
9. LinkedIn posts (`linkedin_tasks/posts/chN_<slug>/`), decided after the Ch2 lessons:
   - Post list first, approved by the user: per topic 1 theory + 4 code-led puzzles (no text-only concept posts;
     a Q&A item becomes a puzzle with a code snippet on slide 1). Short A-D options stay.
   - Duplicate check against every posted and queued post of all chapters (same code or same lesson).
   - Generic framing (events, messages, requests, a cache); no company names; no trading jargon.
   - Rebuild every slide snippet into a full program and run it; label implementation-specific results.
   - Render with `generator/render.py`; fix overflow, code < 28px, SMALL TEXT.
   - Theory posts must NOT contain the answers of their own topic's puzzles (or of later topics' puzzles): the theory
     post goes out first. Ch3 lesson: writers summarised the best facts, which were exactly the puzzle answers.
   - Independent post review (separate reviewer) BEFORE adding the chapter to `linkedin_tasks/series.json`.
   - `chapter.json` (title, topic_order) + `build_queue.py`; then add to series.json (random chapter picker mixes it in).

## Hard rule: no company names

- Never mention any company name in chapter content, Q&A, practice tasks, LinkedIn posts or committed docs.
- Keep it generic ("a trading firm", "a low-latency team", "the interview").
- Before finishing a chapter, grep its files for company names.
