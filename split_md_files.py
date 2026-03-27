#!/usr/bin/env python3
"""
MD File Splitter - Splits all-in-one topic MD files into theory/practice/QA sections

Usage:
    python3 split_md_files.py --chapter <num>  # Split one chapter
    python3 split_md_files.py --all            # Split all chapters

Structure:
    Input:  data/chapter_X/topic_Y.md (all sections together)
    Output:
        data/chapter_X/topic_Y_theory.md    (THEORY_SECTION + EDGE_CASES + CODE_EXAMPLES + QUICK_REFERENCE)
        data/chapter_X/topic_Y_practice.md  (PRACTICE_TASKS)
        data/chapter_X/topic_Y_qa.md        (INTERVIEW_QA)

Features:
    - Preserves all content exactly
    - Maintains formatting
    - Handles all 88 topics
    - Creates backup of original files
"""

import os
import re
import argparse
from pathlib import Path

# Define section markers
SECTION_MARKERS = {
    'theory': ['THEORY_SECTION', 'EDGE_CASES', 'CODE_EXAMPLES', 'QUICK_REFERENCE'],
    'practice': ['PRACTICE_TASKS'],
    'qa': ['INTERVIEW_QA']
}

def extract_topic_header(content):
    """Extract the topic title (## TOPIC: ...) from content"""
    match = re.search(r'^## TOPIC:.*$', content, re.MULTILINE)
    return match.group(0) if match else ""

def find_section_boundaries(content, section_name):
    """Find start and end positions of a section"""
    # Pattern: ### SECTION_NAME: or ### SECTION_NAME
    pattern = rf'^### {section_name}(?::.*)?$'
    match = re.search(pattern, content, re.MULTILINE)

    if not match:
        return None, None

    start = match.start()

    # Find the next ### section or end of file
    next_section_pattern = r'^### [A-Z_]+(?::.*)?$'
    next_match = re.search(next_section_pattern, content[match.end():], re.MULTILINE)

    if next_match:
        end = match.end() + next_match.start()
    else:
        end = len(content)

    return start, end

def extract_sections(content, section_names):
    """Extract multiple sections and combine them"""
    topic_header = extract_topic_header(content)
    sections = []

    # Add topic header at the beginning
    if topic_header:
        sections.append(topic_header + "\n")

    for section_name in section_names:
        start, end = find_section_boundaries(content, section_name)
        if start is not None and end is not None:
            section_content = content[start:end].rstrip() + "\n"
            sections.append(section_content)

    return "\n".join(sections)

def split_single_file(input_path, output_dir):
    """Split a single MD file into theory/practice/qa files"""
    # Read input file
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract base filename (e.g., topic_1.md -> topic_1)
    base_name = Path(input_path).stem

    # Create output files
    outputs = {
        'theory': f"{base_name}_theory.md",
        'practice': f"{base_name}_practice.md",
        'qa': f"{base_name}_qa.md"
    }

    results = {}

    for file_type, section_names in SECTION_MARKERS.items():
        output_content = extract_sections(content, section_names)
        output_path = os.path.join(output_dir, outputs[file_type])

        # Write output file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(output_content)

        results[file_type] = output_path

    return results

def backup_original(file_path):
    """Create a backup of the original file"""
    backup_path = f"{file_path}.backup"
    if os.path.exists(file_path) and not os.path.exists(backup_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return backup_path
    return None

def split_chapter(chapter_num, base_dir='/home/pankaj/cplusplus/proCplusplus/data'):
    """Split all topics in a chapter"""
    chapter_dirs = [d for d in os.listdir(base_dir) if d.startswith('chapter_')]
    chapter_dirs.sort()

    # Find matching chapter directory
    target_dir = None
    for chapter_dir in chapter_dirs:
        # Extract chapter number (e.g., chapter_1_oops -> 1)
        match = re.match(r'chapter_(\d+)_', chapter_dir)
        if match and int(match.group(1)) == chapter_num:
            target_dir = os.path.join(base_dir, chapter_dir)
            break

    if not target_dir:
        print(f"❌ Chapter {chapter_num} not found")
        return False

    print(f"\n{'='*60}")
    print(f"Processing Chapter {chapter_num}: {os.path.basename(target_dir)}")
    print(f"{'='*60}\n")

    # Find all topic_*.md files (excluding already split files)
    topic_files = []
    for file in os.listdir(target_dir):
        if re.match(r'^topic_\d+\.md$', file) or re.match(r'^topic_[a-z0-9_]+\.md$', file):
            # Skip if already has _theory, _practice, _qa suffix
            if not any(suffix in file for suffix in ['_theory', '_practice', '_qa']):
                topic_files.append(file)

    topic_files.sort()

    if not topic_files:
        print(f"⚠️  No topic files to split in {target_dir}")
        return False

    print(f"Found {len(topic_files)} topic files to split:\n")

    success_count = 0
    for topic_file in topic_files:
        input_path = os.path.join(target_dir, topic_file)

        try:
            # Create backup
            backup_path = backup_original(input_path)
            if backup_path:
                print(f"📦 Backed up: {topic_file} -> {os.path.basename(backup_path)}")

            # Split the file
            results = split_single_file(input_path, target_dir)

            print(f"✅ {topic_file} split into:")
            for file_type, output_path in results.items():
                file_size = os.path.getsize(output_path)
                print(f"   - {os.path.basename(output_path)} ({file_size:,} bytes)")
            print()

            success_count += 1

        except Exception as e:
            print(f"❌ Error splitting {topic_file}: {e}\n")

    print(f"\n{'='*60}")
    print(f"Chapter {chapter_num} Summary: {success_count}/{len(topic_files)} files split successfully")
    print(f"{'='*60}\n")

    return True

def split_all_chapters(base_dir='/home/pankaj/cplusplus/proCplusplus/data'):
    """Split all chapters in the data directory"""
    chapter_dirs = [d for d in os.listdir(base_dir) if d.startswith('chapter_')]
    chapter_dirs.sort()

    print(f"\n{'='*60}")
    print(f"Splitting ALL chapters ({len(chapter_dirs)} chapters)")
    print(f"{'='*60}\n")

    total_success = 0
    total_files = 0

    for chapter_dir in chapter_dirs:
        # Extract chapter number
        match = re.match(r'chapter_(\d+)_', chapter_dir)
        if match:
            chapter_num = int(match.group(1))
            if split_chapter(chapter_num, base_dir):
                total_success += 1
            total_files += 1

    print(f"\n{'='*60}")
    print(f"FINAL SUMMARY: {total_success}/{total_files} chapters processed")
    print(f"{'='*60}\n")

def main():
    parser = argparse.ArgumentParser(description='Split MD files into theory/practice/QA sections')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--chapter', type=int, help='Chapter number to split (1-20)')
    group.add_argument('--all', action='store_true', help='Split all chapters')
    parser.add_argument('--base-dir', default='/home/pankaj/cplusplus/proCplusplus/data',
                        help='Base directory containing chapter folders')

    args = parser.parse_args()

    if args.all:
        split_all_chapters(args.base_dir)
    else:
        split_chapter(args.chapter, args.base_dir)

if __name__ == '__main__':
    main()
