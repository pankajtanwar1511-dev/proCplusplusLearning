#!/usr/bin/env python3
"""
Verification #3: Random Sampling
Check 10 random topics for specific content presence
"""

import re
import json
import random
from pathlib import Path

def check_content_presence(md_file, json_topic):
    """Check if key content from MD appears in JSON"""
    with open(md_file, 'r', encoding='utf-8') as f:
        md_content = f.read()

    issues = []

    # Extract first question from INTERVIEW_QA in MD
    qa_match = re.search(r'### INTERVIEW_QA:.*?####\s+Q1[:\s]+([^\n]+)\n+(.*?)(?=####\s+Q2|\n###)',
                         md_content, re.DOTALL)
    if qa_match:
        q1_title = qa_match.group(1).strip()
        # Check if this appears in JSON
        json_qa = json_topic.get('interview_qa', [])
        if json_qa:
            first_qa = json_qa[0]
            if q1_title not in str(first_qa):
                issues.append(f"⚠️  Q1 title '{q1_title[:50]}' not in JSON")
        else:
            issues.append("❌ No INTERVIEW_QA in JSON")

    # Check for code example presence - ONLY within CODE_EXAMPLES section
    code_section_match = re.search(r'### CODE_EXAMPLES:(.*?)(?=\n###\s+[A-Z_]+:|$)', md_content, re.DOTALL)
    if code_section_match:
        code_section = code_section_match.group(1)
        code_match = re.search(r'```cpp\n(.*?)\n```', code_section, re.DOTALL)
        if code_match:
            code_snippet = code_match.group(1).strip()[:100]  # First 100 chars
            # Check if code appears in JSON - search within actual code fields
            json_examples = json_topic.get('code_examples', [])
            if json_examples:
                # Search in all code examples' code fields
                code_clean = re.sub(r'\s+', '', code_snippet)
                found = False
                for example in json_examples:
                    # Handle both string and list for additional_code
                    additional = example.get('additional_code', '')
                    if isinstance(additional, list):
                        additional = ' '.join(additional)
                    example_code = example.get('code', '') + str(additional)
                    example_clean = re.sub(r'\s+', '', example_code)
                    if code_clean in example_clean:
                        found = True
                        break
                if not found:
                    issues.append(f"⚠️  Code snippet not found in JSON")
            else:
                issues.append("❌ No CODE_EXAMPLES in JSON")

    # Check for practice task presence
    practice_match = re.search(r'### PRACTICE_TASKS:.*?####\s+Q1[:\s]+([^\n]+)',
                               md_content, re.DOTALL)
    if practice_match:
        task1_title = practice_match.group(1).strip()
        json_practice = json_topic.get('practice_tasks', [])
        if json_practice:
            first_task = json_practice[0]
            if task1_title not in str(first_task):
                issues.append(f"⚠️  Task 1 title '{task1_title[:50]}' not in JSON")
        else:
            issues.append("❌ No PRACTICE_TASKS in JSON")

    return issues

def verify_random_sampling():
    base_dir = Path('/home/pankaj/cplusplus/proCplusplus')
    data_dir = base_dir / 'data'
    json_dir = base_dir / 'processed_data' / 'json_output'

    print("="*100)
    print("RANDOM SAMPLING VERIFICATION - 10 Random Topics")
    print("="*100)
    print()

    # Collect all topics
    all_topics = []
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

        md_files = sorted(chapter_dir.glob('*.md'))

        for idx, md_file in enumerate(md_files):
            if idx < len(chapter_data['topics']):
                all_topics.append({
                    'chapter': chapter_num,
                    'md_file': md_file,
                    'json_topic': chapter_data['topics'][idx],
                    'name': chapter_data['topics'][idx].get('topic_name', 'Unknown')
                })

    # Sample 10 random topics
    sample_size = min(10, len(all_topics))
    sampled_topics = random.sample(all_topics, sample_size)

    print(f"Randomly selected {sample_size} topics for deep content verification:\n")

    total_issues = 0
    perfect_count = 0

    for i, topic in enumerate(sampled_topics, 1):
        print(f"\n{i}. Chapter {topic['chapter']}: {topic['name'][:60]}")
        print(f"   File: {topic['md_file'].name}")

        issues = check_content_presence(topic['md_file'], topic['json_topic'])

        if issues:
            total_issues += len(issues)
            for issue in issues:
                print(f"   {issue}")
        else:
            perfect_count += 1
            print(f"   ✅ All content verified present in JSON")

    # Summary
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    print(f"Topics Sampled: {sample_size}")
    print(f"Perfect Match: {perfect_count} ({perfect_count/sample_size*100:.1f}%)")
    print(f"Topics with Issues: {sample_size - perfect_count} ({(sample_size - perfect_count)/sample_size*100:.1f}%)")
    print(f"Total Issues Found: {total_issues}")

    if perfect_count == sample_size:
        print("\n✅ ALL SAMPLED TOPICS HAVE PERFECT CONTENT MATCH!")
    else:
        print(f"\n⚠️  {sample_size - perfect_count} topics have content discrepancies")

if __name__ == '__main__':
    random.seed(42)  # For reproducible results
    verify_random_sampling()
