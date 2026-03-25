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
    print("SECTION COMPLETENESS VERIFICATION - ALL 88 TOPICS")
    print("="*100)
    print()

    issues = []
    total_topics = 0
    perfect_topics = 0

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

            # Report
            if topic_issues:
                print(f"  Topic {idx}: {topic.get('topic_name', 'Unknown')[:50]}")
                for issue in topic_issues:
                    print(f"    {issue}")
                issues.append({
                    'chapter': chapter_num,
                    'topic': idx,
                    'name': topic.get('topic_name', 'Unknown'),
                    'issues': topic_issues
                })
            else:
                perfect_topics += 1

    # Summary
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    print(f"Total Topics: {total_topics}")
    print(f"Perfect Topics (all 6 sections complete): {perfect_topics} ({perfect_topics/total_topics*100:.1f}%)")
    print(f"Topics with Issues: {len(issues)} ({len(issues)/total_topics*100:.1f}%)")

    if issues:
        print(f"\n{'='*100}")
        print(f"TOPICS WITH ISSUES: {len(issues)}")
        print(f"{'='*100}")
        for issue in issues:
            print(f"Chapter {issue['chapter']}, Topic {issue['topic']}: {issue['name'][:40]}")
            for i in issue['issues']:
                print(f"  {i}")
    else:
        print("\n✅ ALL 88 TOPICS HAVE COMPLETE SECTIONS!")

if __name__ == '__main__':
    check_section_completeness()
