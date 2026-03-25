#!/usr/bin/env python3
"""
Verification #4: Critical Content Check
Verify important C++ keywords and patterns are preserved
"""

import json
from pathlib import Path

def verify_critical_content():
    base_dir = Path('/home/pankaj/cplusplus/proCplusplus')
    json_dir = base_dir / 'processed_data' / 'json_output'

    print("="*100)
    print("CRITICAL CONTENT VERIFICATION - C++ Keywords & Patterns")
    print("="*100)
    print()

    # Define critical patterns that MUST appear in certain chapters
    critical_patterns = {
        1: ['virtual', 'override', 'polymorphism', 'class', 'inheritance'],  # OOP
        2: ['new', 'delete', 'malloc', 'free', 'memory leak'],  # Memory
        3: ['unique_ptr', 'shared_ptr', 'weak_ptr', 'make_shared'],  # Smart Pointers
        4: ['std::move', 'rvalue', 'lvalue', 'forward', '&&'],  # Move semantics
        7: ['template', 'typename', 'class T', 'SFINAE'],  # Templates
        8: ['vector', 'map', 'set', 'iterator', 'algorithm'],  # STL
        9: ['auto', 'decltype', 'lambda', 'nullptr'],  # C++11
        11: ['std::thread', 'mutex', 'lock_guard', 'atomic'],  # Multithreading
        16: ['std::optional', 'std::variant', 'if constexpr'],  # C++17
        19: ['concept', 'requires', 'ranges', 'coroutine'],  # C++20
    }

    missing_patterns = []
    total_checks = 0
    passed_checks = 0

    chapter_files = sorted([f for f in json_dir.glob('chapter_*.json')
                           if f.name != 'master_index.json'])

    for chapter_file in chapter_files:
        with open(chapter_file, 'r', encoding='utf-8') as f:
            chapter_data = json.load(f)

        chapter_num = chapter_data['chapter_number']

        if chapter_num not in critical_patterns:
            continue

        print(f"\nChapter {chapter_num}: {chapter_data['chapter_name']}")
        print("-" * 100)

        # Convert entire chapter JSON to string for searching
        chapter_str = json.dumps(chapter_data, indent=2).lower()

        for pattern in critical_patterns[chapter_num]:
            total_checks += 1
            if pattern.lower() in chapter_str:
                passed_checks += 1
                print(f"  ✅ '{pattern}' found")
            else:
                print(f"  ❌ '{pattern}' MISSING!")
                missing_patterns.append({
                    'chapter': chapter_num,
                    'pattern': pattern
                })

    # Additional check: #include headers
    print(f"\n{'='*100}")
    print("CHECKING C++ HEADERS (#include)")
    print(f"{'='*100}")

    headers_to_check = ['iostream', 'vector', 'memory', 'thread', 'mutex', 'algorithm']
    header_found = 0
    header_total = 0

    for chapter_file in chapter_files:
        with open(chapter_file, 'r', encoding='utf-8') as f:
            chapter_data = json.load(f)

        chapter_str = json.dumps(chapter_data)

        for header in headers_to_check:
            header_total += 1
            # Check for both <header> and just header name
            if f'<{header}>' in chapter_str or f'#{header}' in chapter_str:
                header_found += 1

    print(f"Headers found in JSON: {header_found}/{header_total}")

    # Summary
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    print(f"Critical Pattern Checks: {total_checks}")
    print(f"Patterns Found: {passed_checks} ({passed_checks/total_checks*100:.1f}%)")
    print(f"Missing Patterns: {len(missing_patterns)} ({len(missing_patterns)/total_checks*100:.1f}%)")

    if missing_patterns:
        print(f"\n{'='*100}")
        print(f"MISSING CRITICAL PATTERNS: {len(missing_patterns)}")
        print(f"{'='*100}")
        for m in missing_patterns:
            print(f"Chapter {m['chapter']}: Missing '{m['pattern']}'")
    else:
        print("\n✅ ALL CRITICAL CONTENT PRESERVED!")

if __name__ == '__main__':
    verify_critical_content()
