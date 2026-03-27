#!/usr/bin/env python3
"""
Remove "Answer Key for Practice Questions" from QUICK_REFERENCE sections.

This script:
1. Finds all topic_*_theory.md files
2. Locates "Answer Key for Practice Questions" subsection within QUICK_REFERENCE
3. Removes only that subsection (keeps other QUICK_REFERENCE content)
4. Creates backups before modifying
"""

import re
import os
from pathlib import Path

def remove_answer_key_from_file(filepath):
    """Remove Answer Key subsection from QUICK_REFERENCE in a single file."""

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check if file has QUICK_REFERENCE section
    if '### QUICK_REFERENCE' not in content:
        return False, "No QUICK_REFERENCE section found"

    # Check if answer key exists
    if 'Answer Key for Practice Questions' not in content:
        return False, "No Answer Key subsection found"

    # Pattern to match the Answer Key subsection
    # Matches from "#### Answer Key..." through the table until the next #### or end of section
    answer_key_pattern = r'####\s+Answer Key for Practice Questions\s*\n\n\|[^\n]+\n\|[-:\s|]+\n(?:\|[^\n]+\n)+'

    # Count matches before removal
    matches = re.findall(answer_key_pattern, content)
    if not matches:
        return False, "Answer Key pattern not found (might have different format)"

    # Create backup
    backup_path = str(filepath) + '.before_remove_answerkey'
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # Remove the Answer Key subsection
    modified_content = re.sub(answer_key_pattern, '', content, flags=re.MULTILINE)

    # Clean up extra blank lines (more than 2 consecutive)
    modified_content = re.sub(r'\n\n\n+', '\n\n', modified_content)

    # Write modified content
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(modified_content)

    return True, f"Removed Answer Key subsection ({len(matches[0])} bytes)"

def find_theory_files(data_dir='data'):
    """Find all topic_*_theory.md files."""
    theory_files = []
    data_path = Path(data_dir)

    for chapter_dir in sorted(data_path.glob('chapter_*')):
        if chapter_dir.is_dir():
            for theory_file in sorted(chapter_dir.glob('topic_*_theory.md')):
                theory_files.append(theory_file)

    return theory_files

def main():
    print("\n" + "="*70)
    print("REMOVE PRACTICE ANSWER KEYS FROM QUICK_REFERENCE")
    print("="*70 + "\n")

    # Find all theory files
    theory_files = find_theory_files()

    print(f"Found {len(theory_files)} theory files\n")

    stats = {
        'processed': 0,
        'modified': 0,
        'skipped': 0,
        'errors': 0
    }

    for filepath in theory_files:
        stats['processed'] += 1
        relative_path = str(filepath).replace('data/', '')

        try:
            success, message = remove_answer_key_from_file(filepath)

            if success:
                print(f"✅ {relative_path}")
                print(f"   {message}")
                stats['modified'] += 1
            else:
                print(f"⏭️  {relative_path}")
                print(f"   {message}")
                stats['skipped'] += 1

        except Exception as e:
            print(f"❌ {relative_path}")
            print(f"   Error: {e}")
            stats['errors'] += 1

    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"Total files processed: {stats['processed']}")
    print(f"Modified: {stats['modified']}")
    print(f"Skipped: {stats['skipped']}")
    print(f"Errors: {stats['errors']}")
    print("="*70 + "\n")

    if stats['modified'] > 0:
        print("Next steps:")
        print("1. Review changes: git diff data/")
        print("2. If looks good, regenerate JSON: cd processed_data/scripts && python3 markdown_to_json.py")
        print("3. Commit changes")

    return 0 if stats['errors'] == 0 else 1

if __name__ == "__main__":
    exit(main())
