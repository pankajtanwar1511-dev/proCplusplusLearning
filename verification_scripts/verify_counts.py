#!/usr/bin/env python3
"""
Verification #2: Count Verification
Compare question/task counts between MD and JSON
"""

import re
import json
from pathlib import Path

def count_md_patterns(md_file, section_name):
    """Count #### Q patterns in a specific section of MD file"""
    with open(md_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract the specific section
    pattern = rf'### {section_name}:.*?\n(.*?)(?=\n### [A-Z_]+:|\Z)'
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        return 0

    section_content = match.group(1)

    # Count #### Q patterns
    q_pattern = r'####\s+Q\d+'
    return len(re.findall(q_pattern, section_content))

def verify_counts():
    base_dir = Path('/home/pankaj/cplusplus/proCplusplus')
    data_dir = base_dir / 'data'
    json_dir = base_dir / 'processed_data' / 'json_output'

    print("="*100)
    print("COUNT VERIFICATION - MD vs JSON")
    print("="*100)
    print()

    discrepancies = []
    total_checks = 0
    matching_checks = 0

    # Get all chapter directories
    chapter_dirs = sorted([d for d in data_dir.iterdir()
                          if d.is_dir() and d.name.startswith('chapter_')])

    for chapter_dir in chapter_dirs:
        chapter_name = chapter_dir.name
        chapter_num = int(chapter_name.split('_')[1])
        json_file = json_dir / f'{chapter_name}.json'

        if not json_file.exists():
            continue

        with open(json_file, 'r', encoding='utf-8') as f:
            chapter_data = json.load(f)

        print(f"\nChapter {chapter_num}: {chapter_name}")
        print("-" * 100)

        md_files = sorted(chapter_dir.glob('*.md'))

        for idx, md_file in enumerate(md_files):
            if idx >= len(chapter_data['topics']):
                continue

            topic_json = chapter_data['topics'][idx]

            # Count INTERVIEW_QA
            md_qa_count = count_md_patterns(md_file, 'INTERVIEW_QA')
            json_qa_count = len(topic_json.get('interview_qa', []))

            # Count PRACTICE_TASKS
            md_practice_count = count_md_patterns(md_file, 'PRACTICE_TASKS')
            json_practice_count = len(topic_json.get('practice_tasks', []))

            # Count CODE_EXAMPLES
            with open(md_file, 'r', encoding='utf-8') as f:
                md_content = f.read()
            code_section_match = re.search(r'### CODE_EXAMPLES:.*?\n(.*?)(?=\n### [A-Z_]+:|\Z)',
                                          md_content, re.DOTALL)
            md_code_count = 0
            if code_section_match:
                # Count Example headers (same pattern as JSON parser)
                md_code_count = len(re.findall(r'####\s+Example \d+:\s+', code_section_match.group(1)))
            json_code_count = len(topic_json.get('code_examples', []))

            total_checks += 3
            qa_match = md_qa_count == json_qa_count
            practice_match = md_practice_count == json_practice_count
            code_match = md_code_count == json_code_count

            if qa_match and practice_match and code_match:
                matching_checks += 3
            else:
                matching_checks += sum([qa_match, practice_match, code_match])

            # Report mismatches
            if not (qa_match and practice_match and code_match):
                print(f"  Topic {idx+1}: {md_file.name[:50]}")
                if not qa_match:
                    print(f"    ⚠️  INTERVIEW_QA: MD={md_qa_count}, JSON={json_qa_count}")
                    discrepancies.append({
                        'chapter': chapter_num,
                        'file': md_file.name,
                        'section': 'INTERVIEW_QA',
                        'md': md_qa_count,
                        'json': json_qa_count
                    })
                if not practice_match:
                    print(f"    ⚠️  PRACTICE_TASKS: MD={md_practice_count}, JSON={json_practice_count}")
                    discrepancies.append({
                        'chapter': chapter_num,
                        'file': md_file.name,
                        'section': 'PRACTICE_TASKS',
                        'md': md_practice_count,
                        'json': json_practice_count
                    })
                if not code_match:
                    print(f"    ⚠️  CODE_EXAMPLES: MD={md_code_count}, JSON={json_code_count}")
                    discrepancies.append({
                        'chapter': chapter_num,
                        'file': md_file.name,
                        'section': 'CODE_EXAMPLES',
                        'md': md_code_count,
                        'json': json_code_count
                    })

    # Summary
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    print(f"Total Count Checks: {total_checks}")
    print(f"Matching Counts: {matching_checks} ({matching_checks/total_checks*100:.1f}%)")
    print(f"Discrepancies: {len(discrepancies)} ({len(discrepancies)/total_checks*100:.1f}%)")

    if discrepancies:
        print(f"\n{'='*100}")
        print(f"DISCREPANCIES FOUND: {len(discrepancies)}")
        print(f"{'='*100}")
        for d in discrepancies:
            print(f"Chapter {d['chapter']}: {d['file']} - {d['section']}: MD={d['md']}, JSON={d['json']}")
    else:
        print("\n✅ ALL COUNTS MATCH PERFECTLY!")

if __name__ == '__main__':
    verify_counts()
