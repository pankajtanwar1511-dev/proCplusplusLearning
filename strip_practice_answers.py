#!/usr/bin/env python3
"""
Strip Existing Practice Answers
================================
Removes all **Answer:** sections from practice files so they can be regenerated.
"""

import re
from pathlib import Path

def strip_answers(file_path: Path) -> bool:
    """Remove all answer blocks from a practice file"""
    content = file_path.read_text()
    lines = content.split('\n')

    new_lines = []
    skip_mode = False
    modified = False

    for i, line in enumerate(lines):
        # Start of answer block
        if line.strip() == '**Answer:**':
            skip_mode = True
            modified = True
            continue

        # Start of next question - stop skipping
        if skip_mode and line.strip().startswith('#### Q'):
            skip_mode = False
            new_lines.append(line)
            continue

        # Skip lines in answer block
        if skip_mode:
            continue

        new_lines.append(line)

    if modified:
        # Clean up multiple consecutive blank lines
        cleaned_lines = []
        prev_blank = False
        for line in new_lines:
            is_blank = line.strip() == ''
            if is_blank and prev_blank:
                continue
            cleaned_lines.append(line)
            prev_blank = is_blank

        file_path.write_text('\n'.join(cleaned_lines))
        return True

    return False

def main():
    root_dir = Path('/home/pankaj/cplusplus/proCplusplus/data')

    # Find all practice files
    practice_files = []
    for chapter_dir in sorted(root_dir.glob('chapter_*')):
        if chapter_dir.is_dir():
            practice_files.extend(sorted(chapter_dir.glob('*_practice.md')))

    print(f"Found {len(practice_files)} practice files")
    print("=" * 70)

    modified_count = 0
    for file_path in practice_files:
        if strip_answers(file_path):
            print(f"✓ Stripped: {file_path.name}")
            modified_count += 1
        else:
            print(f"  Skipped: {file_path.name} (no answers found)")

    print("=" * 70)
    print(f"\n✓ Complete: Stripped {modified_count}/{len(practice_files)} files")

if __name__ == '__main__':
    main()
