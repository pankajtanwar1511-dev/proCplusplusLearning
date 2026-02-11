#!/usr/bin/env python3
"""
Markdown to JSON Converter for C++ Learning Content

This script parses structured markdown files from the data/ directory
and converts them into structured JSON format for use in the learning app.

Usage:
    python markdown_to_json.py
    python markdown_to_json.py --chapter 1  # Process specific chapter
    python markdown_to_json.py --output custom_output/  # Custom output dir
"""

import os
import re
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import defaultdict


class MarkdownParser:
    """Parses structured C++ learning markdown files into JSON format."""

    def __init__(self, data_dir: str = "../../data", output_dir: str = "../json_output"):
        self.data_dir = Path(data_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def parse_file(self, filepath: Path) -> Dict[str, Any]:
        """Parse a single markdown file into structured JSON."""
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract topic name from first heading
        # Try "# TOPIC: Title" or "## TOPIC: Title" format first
        topic_match = re.search(r'^##?\s*TOPIC:\s*(.+)$', content, re.MULTILINE)
        if topic_match:
            topic_name = topic_match.group(1).strip()
        else:
            # Try "# Topic N.M: Title" format (ROS2 style)
            topic_match = re.search(r'^#\s+Topic\s+[\d.]+:\s+(.+)$', content, re.MULTILINE)
            topic_name = topic_match.group(1).strip() if topic_match else filepath.stem

        # Parse each major section
        sections = {
            "topic": topic_name,
            "filename": filepath.name,
            "theory": self._parse_theory_section(content),
            "edge_cases": self._parse_edge_cases(content),
            "code_examples": self._parse_code_examples(content),
            "interview_qa": self._parse_interview_qa(content),
            "practice_tasks": self._parse_practice_tasks(content),
            "quick_reference": self._parse_quick_reference(content)
        }

        return sections

    def _parse_theory_section(self, content: str) -> Dict[str, Any]:
        """Extract THEORY_SECTION content."""
        # Try ### first (3 hashes - standard format) - colon is optional
        match = re.search(
            r'### THEORY_SECTION:?\s*([^\n]*)\n(.*?)(?=\n### [A-Z_]|\Z)',
            content,
            re.DOTALL
        )

        # Fallback to ## (2 hashes - used in some chapters like 9, 11-16) - colon is optional
        if not match:
            match = re.search(
                r'## THEORY_SECTION:?\s*([^\n]*)\n(.*?)(?=\n## [A-Z_]|\Z)',
                content,
                re.DOTALL
            )

        if not match:
            return {"subsections": []}

        theory_content = match.group(2).strip()

        # Split by ### or #### headers (subsections) - support both 3 and 4 hashes
        subsections = []
        subsection_pattern = r'####+\s+(.+?)\n(.*?)(?=\n####+|\Z)'

        for sub_match in re.finditer(subsection_pattern, theory_content, re.DOTALL):
            subsections.append({
                "title": sub_match.group(1).strip(),
                "content": sub_match.group(2).strip()
            })

        return {
            "subsections": subsections,
            "full_text": theory_content
        }

    def _parse_edge_cases(self, content: str) -> List[Dict[str, Any]]:
        """Extract edge cases with code examples."""
        # Try ### first (3 hashes) - colon is optional
        match = re.search(
            r'### EDGE_CASES:?\s*([^\n]*)\n(.*?)(?=\n### [A-Z_]|\Z)',
            content,
            re.DOTALL
        )

        # Fallback to ## (2 hashes) - colon is optional
        if not match:
            match = re.search(
                r'## EDGE_CASES:?\s*([^\n]*)\n(.*?)(?=\n## [A-Z_]|\Z)',
                content,
                re.DOTALL
            )

        if not match:
            return []

        edge_cases_content = match.group(2).strip()
        edge_cases = []

        # Match #### or ### Edge Case N: title (support both 3 and 4 hashes)
        case_pattern = r'####?\s+Edge Case \d+:\s+(.+?)\n(.*?)(?=\n####?\s+Edge Case|\Z)'

        for case_match in re.finditer(case_pattern, edge_cases_content, re.DOTALL):
            title = case_match.group(1).strip()
            body = case_match.group(2).strip()

            # Extract code blocks
            code_blocks = re.findall(r'```(?:cpp|c\+\+)?\n(.*?)```', body, re.DOTALL)

            # Keep full markdown content (don't remove code blocks)
            # ReactMarkdown will render them properly

            edge_cases.append({
                "title": title,
                "explanation": body.strip(),  # Keep full content including code blocks
                "code_examples": [code.strip() for code in code_blocks]
            })

        return edge_cases

    def _parse_code_examples(self, content: str) -> List[Dict[str, Any]]:
        """Extract code examples section."""
        # Try ### first (3 hashes) - colon is optional
        match = re.search(
            r'### CODE_EXAMPLES:?\s*([^\n]*)\n(.*?)(?=\n### [A-Z_]|\Z)',
            content,
            re.DOTALL
        )

        # Fallback to ## (2 hashes) - colon is optional
        if not match:
            match = re.search(
                r'## CODE_EXAMPLES:?\s*([^\n]*)\n(.*?)(?=\n## [A-Z_]|\Z)',
                content,
                re.DOTALL
            )

        if not match:
            return []

        examples_content = match.group(2).strip()
        examples = []

        # Match #### or ### Example N: title (support both 3 and 4 hashes)
        example_pattern = r'####?\s+Example \d+:\s+(.+?)\n(.*?)(?=\n####?\s+Example|\Z)'

        for ex_match in re.finditer(example_pattern, examples_content, re.DOTALL):
            title = ex_match.group(1).strip()
            body = ex_match.group(2).strip()

            # Extract code blocks
            code_blocks = re.findall(r'```(?:cpp|c\+\+)?\n(.*?)```', body, re.DOTALL)

            # Remove code blocks to get explanation
            explanation = re.sub(r'```(?:cpp|c\+\+)?.*?```', '', body, flags=re.DOTALL)

            examples.append({
                "title": title,
                "explanation": explanation.strip(),
                "code": code_blocks[0].strip() if code_blocks else "",
                "additional_code": [code.strip() for code in code_blocks[1:]]
            })

        return examples

    def _parse_interview_qa(self, content: str) -> List[Dict[str, Any]]:
        """Extract interview questions with metadata."""
        # Try ### first (standard format) - colon is optional
        match = re.search(
            r'### INTERVIEW_QA:?\s*([^\n]*)\n(.*?)(?=\n### [A-Z_]|\Z)',
            content,
            re.DOTALL
        )

        # Fallback to ## (used in some chapter 9 files) - colon is optional
        if not match:
            match = re.search(
                r'## INTERVIEW_QA:?\s*([^\n]*)\n(.*?)(?=\n## [A-Z_]|\Z)',
                content,
                re.DOTALL
            )

        if not match:
            return []

        qa_content = match.group(2).strip()
        questions = []

        # Match #### or ### QN: question (support both 3 and 4 hashes)
        question_pattern = r'####?\s+Q\d+:\s+(.+?)\n(.*?)(?=\n####?\s+Q|\Z)'

        for q_match in re.finditer(question_pattern, qa_content, re.DOTALL):
            question_text = q_match.group(1).strip()
            body = q_match.group(2).strip()

            # Extract metadata tags
            difficulty = re.search(r'\*\*Difficulty:\*\*\s*([#\w\s]+)', body)
            category = re.search(r'\*\*Category:\*\*\s*([#\w\s]+)', body)
            concepts = re.search(r'\*\*Concepts:\*\*\s*([#\w\s]+)', body)

            # Extract answer
            answer_match = re.search(r'\*\*Answer:\*\*\s*(.*?)(?=\n\*\*|\Z)', body, re.DOTALL)

            # Extract explanation
            explanation_match = re.search(r'\*\*Explanation:\*\*\s*(.*?)(?=\n\*\*|\Z)', body, re.DOTALL)

            # Extract code examples
            code_blocks = re.findall(r'```(?:cpp|c\+\+)?\n(.*?)```', body, re.DOTALL)

            # Extract key takeaway
            takeaway_match = re.search(r'\*\*Key takeaway:\*\*\s*(.+?)(?=\n---|$)', body, re.DOTALL)

            questions.append({
                "question": question_text,
                "difficulty": self._parse_tags(difficulty.group(1) if difficulty else ""),
                "category": self._parse_tags(category.group(1) if category else ""),
                "concepts": self._parse_tags(concepts.group(1) if concepts else ""),
                "answer": answer_match.group(1).strip() if answer_match else "",
                "explanation": explanation_match.group(1).strip() if explanation_match else "",
                "code_examples": [code.strip() for code in code_blocks],
                "key_takeaway": takeaway_match.group(1).strip() if takeaway_match else ""
            })

        return questions

    def _parse_practice_tasks(self, content: str) -> List[Dict[str, Any]]:
        """Extract practice tasks (output prediction, code analysis)."""
        # Try ### first (3 hashes) - colon is optional
        match = re.search(
            r'### PRACTICE_TASKS:?\s*([^\n]*)\n(.*?)(?=\n### [A-Z_]|\Z)',
            content,
            re.DOTALL
        )

        # Fallback to ## (2 hashes) - colon is optional
        if not match:
            match = re.search(
                r'## PRACTICE_TASKS:?\s*([^\n]*)\n(.*?)(?=\n## [A-Z_]|\Z)',
                content,
                re.DOTALL
            )

        if not match:
            return []

        practice_content = match.group(2).strip()
        tasks = []

        # Match ### or #### QN (like Q1, Q2) or Task N: title or Practice N: title (support both 3 and 4 hashes)
        task_pattern = r'####?\s+(?:Q(\d+)|(?:Task|Practice)\s+\d+:\s+(.+?))\n(.*?)(?=\n####?\s+(?:Q\d+|Task|Practice)|\Z)'

        for task_match in re.finditer(task_pattern, practice_content, re.DOTALL):
            # Get question number or title
            question_num = task_match.group(1)  # Q1, Q2, etc.
            title = task_match.group(2)  # Task title if provided
            body = task_match.group(3).strip()

            # If it's a Q format, use "Question N" as title
            if question_num:
                display_title = f"Question {question_num}"
            else:
                display_title = title.strip() if title else "Practice Task"

            # Extract code blocks
            code_blocks = re.findall(r'```(?:cpp|c\+\+)?\n(.*?)```', body, re.DOTALL)

            # Extract expected output (usually in comments or separate blocks)
            output_match = re.search(r'(?:Output:|Expected output:|Answer:)\s*```?\s*(.+?)```?', body, re.DOTALL | re.IGNORECASE)

            # Remove code blocks to get explanation
            explanation = re.sub(r'```(?:cpp|c\+\+)?.*?```', '', body, flags=re.DOTALL)

            tasks.append({
                "question_number": int(question_num) if question_num else None,
                "title": display_title,
                "description": explanation.strip(),
                "code": code_blocks[0].strip() if code_blocks else "",
                "expected_output": output_match.group(1).strip() if output_match else "",
                "additional_code": [code.strip() for code in code_blocks[1:]]
            })

        return tasks

    def _parse_quick_reference(self, content: str) -> Dict[str, Any]:
        """Extract quick reference section (answer keys, comparison tables)."""
        # Try ### first (3 hashes) - colon is optional
        match = re.search(
            r'### QUICK_REFERENCE:?\s*([^\n]*)\n(.*?)(?=\n### [A-Z_]|\Z)',
            content,
            re.DOTALL
        )

        # Fallback to ## (2 hashes) - colon is optional
        if not match:
            match = re.search(
                r'## QUICK_REFERENCE:?\s*([^\n]*)\n(.*?)(?=\n## [A-Z_]|\Z)',
                content,
                re.DOTALL
            )

        if not match:
            return {"content": ""}

        reference_content = match.group(2).strip()

        # Extract tables (markdown tables)
        tables = []
        table_pattern = r'\|(.+?\|.+?\n)+(?:\|[-:\s|]+\n)?(?:\|.+?\n)+'

        for table_match in re.finditer(table_pattern, reference_content, re.MULTILINE):
            tables.append(table_match.group(0).strip())

        return {
            "content": reference_content,
            "tables": tables
        }

    def _parse_tags(self, tag_string: str) -> List[str]:
        """Parse hashtag-based tags into list."""
        if not tag_string:
            return []

        tags = re.findall(r'#(\w+)', tag_string)
        return [tag.lower() for tag in tags]

    def process_chapter(self, chapter_dir: Path) -> Dict[str, Any]:
        """Process all markdown files in a chapter directory."""
        chapter_name = chapter_dir.name
        print(f"Processing {chapter_name}...")

        topics = []
        md_files = sorted(chapter_dir.glob("*.md"))

        if not md_files:
            print(f"  ⚠️  No markdown files found in {chapter_name}")
            return None

        for md_file in md_files:
            print(f"  📄 Parsing {md_file.name}...")
            try:
                topic_data = self.parse_file(md_file)
                topics.append(topic_data)
            except Exception as e:
                print(f"  ❌ Error parsing {md_file.name}: {e}")
                continue

        chapter_data = {
            "chapter_name": chapter_name,
            "chapter_number": self._extract_chapter_number(chapter_name),
            "topic_count": len(topics),
            "topics": topics
        }

        # Save chapter JSON
        output_file = self.output_dir / f"{chapter_name}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(chapter_data, f, indent=2, ensure_ascii=False)

        print(f"  ✅ Saved to {output_file} ({len(topics)} topics)\n")

        return chapter_data

    def _extract_chapter_number(self, chapter_name: str) -> int:
        """Extract chapter number from directory name."""
        match = re.search(r'chapter_(\d+)', chapter_name)
        return int(match.group(1)) if match else 0

    def process_all_chapters(self, chapter_filter: Optional[int] = None):
        """Process all chapter directories."""
        chapter_dirs = sorted([d for d in self.data_dir.iterdir()
                              if d.is_dir() and d.name.startswith('chapter_')])

        # No chapter limit - process all chapters

        if chapter_filter:
            chapter_dirs = [d for d in chapter_dirs
                           if self._extract_chapter_number(d.name) == chapter_filter]

        all_chapters = []
        stats = {
            "total_chapters": 0,
            "total_topics": 0,
            "chapters_processed": []
        }

        for chapter_dir in chapter_dirs:
            chapter_data = self.process_chapter(chapter_dir)
            if chapter_data:
                all_chapters.append(chapter_data)
                stats["total_chapters"] += 1
                stats["total_topics"] += chapter_data["topic_count"]
                stats["chapters_processed"].append({
                    "name": chapter_data["chapter_name"],
                    "number": chapter_data["chapter_number"],
                    "topics": chapter_data["topic_count"]
                })

        # Create master index
        master_index = {
            "version": "1.0",
            "description": "C++ Professional Learning Content - All Chapters",
            "statistics": stats,
            "chapters": all_chapters,
            "catalog": "cpp"
        }

        index_file = self.output_dir / "master_index.json"
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(master_index, f, indent=2, ensure_ascii=False)

        print(f"\n{'='*60}")
        print(f"✅ PROCESSING COMPLETE")
        print(f"{'='*60}")
        print(f"Total Chapters: {stats['total_chapters']}")
        print(f"Total Topics: {stats['total_topics']}")
        print(f"Master Index: {index_file}")
        print(f"{'='*60}\n")

        return master_index


def main():
    parser = argparse.ArgumentParser(
        description="Convert C++ learning markdown files to JSON format"
    )
    parser.add_argument(
        '--chapter',
        type=int,
        help='Process specific chapter number'
    )
    parser.add_argument(
        '--data-dir',
        default='../../data',
        help='Path to data directory (default: ../../data)'
    )
    parser.add_argument(
        '--output-dir',
        default='../json_output',
        help='Output directory for JSON files (default: ../json_output)'
    )

    args = parser.parse_args()

    print("\n" + "="*60)
    print("C++ MARKDOWN TO JSON CONVERTER")
    print("="*60 + "\n")

    converter = MarkdownParser(
        data_dir=args.data_dir,
        output_dir=args.output_dir
    )

    try:
        converter.process_all_chapters(chapter_filter=args.chapter)
    except Exception as e:
        print(f"\n❌ Error during processing: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
