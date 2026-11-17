#!/usr/bin/env python3
"""Build a chapter's "Top Picks" topic (topic_00) by copying selected items
verbatim from the chapter's other topics, driven by a selection JSON.

Only additions to copied text: a "Deep dive" bullet pointing to the source
topic, and renumbering (Q1..QN, Edge Case N, Example N).
Usage: build_top_picks.py <selection.json>   (paths relative to data_interview/)
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sel = json.load(open(sys.argv[1]))
cdir = ROOT / sel["chapter_dir"]

def topic_files(nn):
    th = sorted(cdir.glob(f"topic_{nn}_*_theory.md"))[0]
    base = th.name[:-len("_theory.md")]
    return base, th, cdir / f"{base}_qa.md", cdir / f"{base}_practice.md"

def title_of(path):
    return re.search(r'^##?\s*TOPIC:\s*(.+)$', path.read_text(), re.M).group(1).strip()

def section(text, name):
    m = re.search(rf'^### {name}(?::[^\n]*)?\n(.*?)(?=^### [A-Z_]+|\Z)', text, re.M | re.S)
    return m.group(1) if m else ""

def blocks(sec, header_re):
    """Split a section into {number: block_text_without_header_line}."""
    parts = re.split(rf'^(?={header_re})', sec, flags=re.M)
    out = {}
    for p in parts:
        m = re.match(header_re + r'[^\n]*\n', p)
        if m:
            n = int(re.search(r'\d+', m.group(0)).group(0))
            out[n] = (m.group(0), p[m.end():])
    return out

def strip_sep(body):
    return re.sub(r'\n-{3,}\s*$', '', body.rstrip()).rstrip() + "\n"

qa_out, pr_out, ec_out, ex_out, ql_out, cover = [], [], [], [], [], []
for nn, pk in sel["picks"].items():
    base, th, qa, pr = topic_files(nn)
    tname = title_of(th)
    deep = f"- Deep dive: Topic {int(nn)}, {tname}"
    qa_sec = section(qa.read_text(), "INTERVIEW_QA")
    pr_sec = section(pr.read_text(), "PRACTICE_TASKS")
    th_txt = th.read_text()
    qb = blocks(qa_sec, r'#### Q\d+')
    pb = blocks(pr_sec, r'#### Q\d+')
    eb = blocks(section(th_txt, "EDGE_CASES"), r'#### Edge Case \d+')
    xb = blocks(section(th_txt, "CODE_EXAMPLES"), r'#### Example \d+')
    for n in pk["qa"]:
        hdr, body = qb[n]
        body = strip_sep(body)
        # deep-dive bullet goes at the end of the Explanation, before Key takeaway
        body = re.sub(r'\s*\n\*\*Key takeaway:\*\*', lambda m: f"\n{deep}\n\n**Key takeaway:**", body, count=1)
        qa_out.append((re.sub(r'^#### Q\d+', '#### Q{N}', hdr), body))
    for n in pk["practice"]:
        hdr, body = pb[n]
        body = strip_sep(body)
        if "\n**Fixed Version:**" in body:
            body = re.sub(r'\s*\n\*\*Fixed Version:\*\*', lambda m: f"\n{deep}\n\n**Fixed Version:**", body, count=1)
        else:
            body = body.rstrip() + f"\n{deep}\n"
        pr_out.append(body)
    for n in pk["edge"]:
        hdr, body = eb[n]
        t = re.sub(r'^#### Edge Case \d+:\s*', '', hdr).strip()
        ec_out.append((t, strip_sep(body).rstrip() + f"\n{deep}\n"))
    for n in pk["example"]:
        hdr, body = xb[n]
        t = re.sub(r'^#### Example \d+:\s*', '', hdr).strip()
        ex_out.append((t, strip_sep(body).rstrip() + f"\n{deep}\n"))
    ql = re.search(r'^#### Interview one-liners[^\n]*\n(.*?)(?=^#### |^### |\Z)',
                   section(th_txt, "QUICK_REFERENCE"), re.M | re.S)
    if ql:
        ql_out.append((tname, ql.group(1).strip()))
    cover.append((int(nn), tname, len(pk["qa"]), len(pk["practice"])))

title = sel["title"]
nq, np_ = len(qa_out), len(pr_out)
L = [f"## TOPIC: {title}", "", "### THEORY_SECTION: Start Here", "",
     "#### 1. How to use this list",
     f"- The {nq + np_} highest-value items from this chapter: {nq} interview questions and {np_} code puzzles.",
     "- Every topic in the chapter is represented, so this list doubles as a fast revision pass before an interview.",
     "- Each item is built around a misconception that many engineers hold. Answer it yourself before revealing the answer.",
     "- Every answer ends with a \"Deep dive\" pointer to the full topic for more questions on the same idea.",
     "- Interview Q&A tab: conceptual and design questions. Practice Tasks tab: output prediction and bug hunting.", "",
     "#### 2. Coverage map",
     "| Topic | Interview questions | Code puzzles |", "|---|---|---|"]
L += [f"| {n}. {t} | {q} | {p} |" for n, t, q, p in cover]
L += [f"| **Total** | **{nq}** | **{np_}** |", "",
      "#### 3. Suggested order",
      "- First pass: the Practice Tasks tab, top to bottom. Predict each output before revealing it.",
      "- Second pass: the Interview Q&A tab. Say each answer out loud in under a minute, then compare.",
      "- Any item you miss: open its Deep dive topic and work through that topic's full question set.", ""]
L += ["### EDGE_CASES: The Traps That Catch the Most Engineers", ""]
for i, (t, b) in enumerate(ec_out, 1):
    L += [f"#### Edge Case {i}: {t}", b.rstrip(), ""]
L += ["### CODE_EXAMPLES: Patterns Worth Memorizing", ""]
for i, (t, b) in enumerate(ex_out, 1):
    L += [f"#### Example {i}: {t}", b.rstrip(), ""]
L += ["### QUICK_REFERENCE: Interview One-Liners for the Whole Chapter", ""]
for t, tbl in ql_out:
    L += [f"#### {t}", tbl, ""]
(cdir / f"{sel['output_slug']}_theory.md").write_text("\n".join(L).rstrip() + "\n")

Q = [f"## TOPIC: {title}", "", "### INTERVIEW_QA: The Must-Know Interview Questions", ""]
for i, (hdr, body) in enumerate(qa_out, 1):
    Q += [hdr.replace("{N}", str(i)).rstrip(), body.rstrip(), "", "---", ""]
(cdir / f"{sel['output_slug']}_qa.md").write_text("\n".join(Q).rstrip() + "\n")

P = [f"## TOPIC: {title}", "", "### PRACTICE_TASKS: The Must-Know Code Puzzles", ""]
for i, body in enumerate(pr_out, 1):
    P += [f"#### Q{i}", body.rstrip(), "", "---", ""]
(cdir / f"{sel['output_slug']}_practice.md").write_text("\n".join(P).rstrip() + "\n")
print(f"QA {nq}, practice {np_}, edge {len(ec_out)}, examples {len(ex_out)}, one-liner tables {len(ql_out)}")
