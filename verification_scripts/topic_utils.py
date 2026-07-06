#!/usr/bin/env python3
"""
Shared helpers for the verification scripts.

The markdown content is authored either as a single file per topic
(``topic_1.md``) or, more commonly now, split across three files
(``topic_1_theory.md`` + ``topic_1_practice.md`` + ``topic_1_qa.md``).

The JSON parser groups these split files back into ONE topic before parsing.
The verifiers must do the same grouping, otherwise they mistake each split
file for a separate topic and misalign every MD-vs-JSON comparison.

To guarantee the verifier's notion of "a topic" matches the parser's exactly
(and never drifts from it), we reuse the parser's own grouping/combining logic
instead of re-implementing it here. The counting/sampling checks themselves stay
independent in each verifier.
"""

import sys
from pathlib import Path

# Make the parser importable from the verification_scripts directory.
_PARSER_DIR = Path(__file__).resolve().parent.parent / 'processed_data' / 'scripts'
if str(_PARSER_DIR) not in sys.path:
    sys.path.insert(0, str(_PARSER_DIR))

from markdown_to_json import MarkdownParser  # noqa: E402


# A single reusable parser instance is enough — we only use its (stateless)
# file-grouping and file-combining helpers, not its output directory.
# Point it at the real, already-existing dirs so instantiation has no side
# effects (the constructor mkdir's output_dir).
_BASE_DIR = Path(__file__).resolve().parent.parent
_PARSER = MarkdownParser(
    data_dir=str(_BASE_DIR / 'data'),
    output_dir=str(_BASE_DIR / 'processed_data' / 'json_output'),
)


def iter_topics(chapter_dir):
    """Yield ``(base_name, combined_markdown)`` for each topic in a chapter.

    Topics are yielded in the SAME order the parser emits them into the
    chapter JSON (sorted by base name), so callers can align the Nth topic
    here with the Nth topic in ``chapter_data['topics']``.

    Split files (``*_theory.md`` / ``*_practice.md`` / ``*_qa.md``) are merged
    into one combined markdown string; a lone ``topic_X.md`` is used only when
    no split files exist for that topic — mirroring the parser exactly.
    """
    for group in _PARSER._find_topic_groups(chapter_dir):
        if group['is_split']:
            content = _PARSER._combine_split_files(
                group.get('theory'),
                group.get('practice'),
                group.get('qa'),
            )
        else:
            single = group['single_file']
            with open(single, 'r', encoding='utf-8') as f:
                content = f.read()
        yield group['base'], content
