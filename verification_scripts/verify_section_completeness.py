#!/usr/bin/env python3
"""
Verification #1: Section Completeness Check
Ensures all 6 main sections exist and contain actual content
"""

import os
import json
from pathlib import Path

def check_section_completeness():
    base_dir = Path('/home/pankaj/cplusplus/proCplusplus')
    json_dir = base_dir / 'processed_data' / 'json_output'

    print("="*100)
    print("SECTION COMPLETENESS VERIFICATION - ALL TOPICS")
    print("="*100)
    print()

    # "Completeness" means every one of the 6 sections is present and non-empty
    # (a hard ❌ failure if not). Item-count thresholds (e.g. "only 2 edge cases")
    # are richness WARNINGS (⚠️) — they don't make a topic incomplete, so they're
    # reported for visibility but don't fail the check.
    incomplete = []      # topics missing/emptying at least one section (❌)
    warning_topics = []  # topics that are complete but below a richness threshold
    total_topics = 0
    complete_topics = 0
    total_warnings = 0

    # Get all chapter JSON files
    chapter_files = sorted([f for f in json_dir.glob('chapter_*.json')
                           if f.name != 'master_index.json'])

    for chapter_file in chapter_files:
        with open(chapter_file, 'r', encoding='utf-8') as f:
            chapter_data = json.load(f)

        chapter_num = chapter_data['chapter_number']
        chapter_name = chapter_data['chapter_name']

        print(f"\nChapter {chapter_num}: {chapter_name}")
        print("-" * 100)

        for idx, topic in enumerate(chapter_data['topics'], 1):
            total_topics += 1
            topic_issues = []

            # Check THEORY
            if not topic.get('theory'):
                topic_issues.append("❌ THEORY missing or empty")
            elif isinstance(topic['theory'], dict):
                if not topic['theory'].get('full_text'):
                    topic_issues.append("⚠️  THEORY has no full_text")
                if not topic['theory'].get('subsections'):
                    topic_issues.append("⚠️  THEORY has no subsections")

            # Check EDGE_CASES
            edge_cases = topic.get('edge_cases', [])
            if not edge_cases:
                topic_issues.append("❌ EDGE_CASES empty")
            elif len(edge_cases) < 3:
                topic_issues.append(f"⚠️  EDGE_CASES only has {len(edge_cases)} items")

            # Check CODE_EXAMPLES
            code_examples = topic.get('code_examples', [])
            if not code_examples:
                topic_issues.append("❌ CODE_EXAMPLES empty")
            elif len(code_examples) < 3:
                topic_issues.append(f"⚠️  CODE_EXAMPLES only has {len(code_examples)} items")

            # Check INTERVIEW_QA
            interview_qa = topic.get('interview_qa', [])
            if not interview_qa:
                topic_issues.append("❌ INTERVIEW_QA empty")
            elif len(interview_qa) < 5:
                topic_issues.append(f"⚠️  INTERVIEW_QA only has {len(interview_qa)} questions")

            # Check PRACTICE_TASKS
            practice_tasks = topic.get('practice_tasks', [])
            if not practice_tasks:
                topic_issues.append("❌ PRACTICE_TASKS empty")
            elif len(practice_tasks) < 3:
                topic_issues.append(f"⚠️  PRACTICE_TASKS only has {len(practice_tasks)} tasks")

            # Check QUICK_REFERENCE
            if not topic.get('quick_reference'):
                topic_issues.append("❌ QUICK_REFERENCE missing or empty")

            # Split hard completeness failures (❌) from soft richness warnings (⚠️).
            hard = [i for i in topic_issues if i.startswith('❌')]
            soft = [i for i in topic_issues if not i.startswith('❌')]

            if topic_issues:
                print(f"  Topic {idx}: {topic.get('topic_name', 'Unknown')[:50]}")
                for issue in topic_issues:
                    print(f"    {issue}")

            record = {
                'chapter': chapter_num,
                'topic': idx,
                'name': topic.get('topic_name', 'Unknown'),
                'issues': topic_issues,
            }

            if hard:
                incomplete.append(record)
            else:
                complete_topics += 1
                if soft:
                    warning_topics.append(record)
                    total_warnings += len(soft)

    # Summary
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    print(f"Total Topics: {total_topics}")
    print(f"Topics with all 6 sections: {complete_topics}/{total_topics}")
    print(f"Incomplete Topics (missing/empty section): {len(incomplete)}")
    print(f"Complete-but-below-richness-threshold Topics: {len(warning_topics)} "
          f"({total_warnings} warnings)")

    if warning_topics:
        print(f"\n{'='*100}")
        print(f"RICHNESS WARNINGS (informational — sections present, just sparse): {len(warning_topics)} topics")
        print(f"{'='*100}")
        for w in warning_topics:
            print(f"Chapter {w['chapter']}, Topic {w['topic']}: {w['name'][:40]}")
            for i in w['issues']:
                print(f"  {i}")

    if incomplete:
        print(f"\n{'='*100}")
        print(f"INCOMPLETE TOPICS: {len(incomplete)}")
        print(f"{'='*100}")
        for issue in incomplete:
            print(f"Chapter {issue['chapter']}, Topic {issue['topic']}: {issue['name'][:40]}")
            for i in issue['issues']:
                print(f"  {i}")
        print(f"\n❌ {len(incomplete)} TOPIC(S) MISSING SECTIONS")
    else:
        print(f"\n✅ ALL {total_topics} TOPICS HAVE COMPLETE SECTIONS!")

if __name__ == '__main__':
    check_section_completeness()
