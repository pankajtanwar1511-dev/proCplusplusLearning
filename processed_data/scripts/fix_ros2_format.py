#!/usr/bin/env python3
"""
Script to fix ROS2 markdown format to match the expected parser format.
Transforms chapters 4, 5, 6 from the alternate format to the standard format.
"""

import re
from pathlib import Path

def transform_markdown(content, topic_title):
    """
    Transform markdown from:
        # Chapter N: Name
        ## Topic M: Title
        ## Theory
        ## Code Examples

    To:
        ## TOPIC: Title
        ## THEORY_SECTION
        ## CODE_EXAMPLES
    """

    # Remove the chapter header (# Chapter N: ...)
    content = re.sub(r'^#\s+Chapter\s+\d+:.*?\n', '', content, flags=re.MULTILINE)

    # Extract topic title from ## Topic N: Title
    topic_match = re.search(r'^##\s+Topic\s+[\d.]+:\s*(.+)$', content, re.MULTILINE)
    if topic_match:
        extracted_title = topic_match.group(1).strip()
        # Remove the topic header line
        content = re.sub(r'^##\s+Topic\s+[\d.]+:.*?\n', '', content, flags=re.MULTILINE)
    else:
        extracted_title = topic_title

    # Add the TOPIC header at the beginning
    content = f'## TOPIC: {extracted_title}\n\n' + content

    # Transform section headers
    transformations = [
        (r'^##\s+Theory\s*$', '## THEORY_SECTION'),
        (r'^##\s+Edge\s+Cases?\s*$', '## EDGE_CASES'),
        (r'^##\s+Code\s+Examples?\s*$', '## CODE_EXAMPLES'),
        (r'^##\s+Interview\s+Q/?A\s*$', '## INTERVIEW_QA'),
        (r'^##\s+Practice\s+Tasks?\s*$', '## PRACTICE_TASKS'),
        (r'^##\s+Quick\s+Reference\s*$', '## QUICK_REFERENCE'),
    ]

    for pattern, replacement in transformations:
        content = re.sub(pattern, replacement, content, flags=re.MULTILINE | re.IGNORECASE)

    return content

def process_file(filepath):
    """Process a single markdown file."""
    print(f"  Processing {filepath.name}...")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            original_content = f.read()

        # Extract topic number from filename for fallback title
        topic_num = filepath.stem.replace('topic_', '')
        fallback_title = f"Topic {topic_num}"

        # Transform the content
        transformed_content = transform_markdown(original_content, fallback_title)

        # Write back
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(transformed_content)

        print(f"    ✅ Transformed successfully")
        return True

    except Exception as e:
        print(f"    ❌ Error: {e}")
        return False

def main():
    base_dir = Path(__file__).parent.parent.parent / 'data_ros2'

    # Process chapters 4, 5, 6
    chapters_to_fix = [
        'chapter_4_real_world_development',
        'chapter_5_robotics_applications',
        'chapter_6_advanced_production_systems'
    ]

    print("\n" + "="*60)
    print("ROS2 MARKDOWN FORMAT FIXER")
    print("="*60 + "\n")

    total_files = 0
    success_count = 0

    for chapter_name in chapters_to_fix:
        chapter_dir = base_dir / chapter_name

        if not chapter_dir.exists():
            print(f"⚠️  Chapter directory not found: {chapter_name}")
            continue

        print(f"📁 Processing {chapter_name}...")

        md_files = sorted(chapter_dir.glob('topic_*.md'))

        if not md_files:
            print(f"  ⚠️  No topic files found")
            continue

        for md_file in md_files:
            total_files += 1
            if process_file(md_file):
                success_count += 1

        print()

    print("="*60)
    print(f"✅ COMPLETE: {success_count}/{total_files} files transformed")
    print("="*60 + "\n")

if __name__ == '__main__':
    main()
