#!/usr/bin/env python3
"""
Automated Practice Answer Generator - Individual Compilation
=============================================================
Processes all *_practice.md files to:
1. Extract each C++ code snippet
2. Compile and run EACH individually
3. Generate detailed, explanatory answers
4. Update practice files in-place

Usage:
    python3 add_practice_answers_automated.py [--test-file PATH] [--parallel N]
"""

import re
import subprocess
import tempfile
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Tuple, Optional
import argparse

@dataclass
class Question:
    """Represents a single practice question"""
    number: int
    code: str
    start_line: int
    end_line: int

@dataclass
class Answer:
    """Represents the answer to a question"""
    output: str
    compilation_error: Optional[str]
    error_details: Optional[str]
    explanation: List[str]

class PracticeProcessor:
    """Processes practice markdown files to add answers - INDIVIDUAL mode"""

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.content = file_path.read_text()
        self.lines = self.content.split('\n')

    def extract_questions(self) -> List[Question]:
        """Extract all questions with code blocks from the file"""
        questions = []
        current_q = None
        in_code_block = False
        code_lines = []
        code_start = -1

        for i, line in enumerate(self.lines):
            # Match question headers: #### Q1, #### Q2, etc.
            q_match = re.match(r'^####\s+Q(\d+)', line)
            if q_match:
                # Save previous question if exists
                if current_q is not None and code_lines:
                    current_q.code = '\n'.join(code_lines)
                    current_q.end_line = i - 1
                    questions.append(current_q)

                # Start new question
                q_num = int(q_match.group(1))
                current_q = Question(number=q_num, code='', start_line=i, end_line=-1)
                code_lines = []
                in_code_block = False

            # Track code blocks
            elif line.strip().startswith('```cpp'):
                in_code_block = True
                code_start = i
            elif line.strip() == '```' and in_code_block:
                in_code_block = False
            elif in_code_block and current_q is not None:
                code_lines.append(line)

        # Save last question
        if current_q is not None and code_lines:
            current_q.code = '\n'.join(code_lines)
            current_q.end_line = len(self.lines)
            questions.append(current_q)

        return questions

    def compile_and_run(self, code: str, timeout: int = 5) -> Tuple[str, Optional[str], Optional[str]]:
        """
        Compile and run C++ code individually
        Returns (output, error_type, error_details)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            source_file = Path(tmpdir) / 'test.cpp'
            exe_file = Path(tmpdir) / 'test'

            # Write source code
            source_file.write_text(code)

            # Compile
            compile_result = subprocess.run(
                ['g++', '-std=c++17', '-o', str(exe_file), str(source_file)],
                capture_output=True,
                text=True,
                timeout=timeout
            )

            if compile_result.returncode != 0:
                # Compilation failed - extract key error
                stderr = compile_result.stderr
                error_lines = [line for line in stderr.split('\n') if 'error:' in line.lower()]
                if error_lines:
                    first_error = error_lines[0]
                    # Clean up error message
                    if 'error:' in first_error:
                        error_msg = first_error.split('error:')[1].strip()
                    else:
                        error_msg = first_error.strip()
                    return '', 'Compilation Error', error_msg
                return '', 'Compilation Error', stderr.strip()

            # Run
            try:
                run_result = subprocess.run(
                    [str(exe_file)],
                    capture_output=True,
                    text=True,
                    timeout=timeout
                )
                return run_result.stdout.strip(), None, None
            except subprocess.TimeoutExpired:
                return '', 'Runtime Error', 'Execution timeout'
            except Exception as e:
                return '', 'Runtime Error', str(e)

    def generate_explanation(self, question: Question, answer: Answer) -> List[str]:
        """Generate detailed explanation points for the answer"""
        explanation = []
        code_lower = question.code.lower()

        if answer.compilation_error:
            # Detailed compilation error explanation
            error_detail = answer.error_details or ''

            if 'private' in error_detail.lower() or 'inaccessible' in error_detail.lower():
                explanation.append("**Compilation Error**: Attempting to access private member")
                explanation.append("Private members (default for `class`) cannot be accessed outside the class")
                explanation.append("The code tries to access `c.x` where `x` is private in class `C`")

            elif 'protected' in error_detail.lower():
                explanation.append("**Compilation Error**: Cannot access protected member from outside class hierarchy")
                explanation.append("Protected members are only accessible in the class and its derived classes")

            elif 'no member named' in error_detail.lower() or 'was not declared' in error_detail.lower():
                explanation.append("**Compilation Error**: Member or variable not found in current scope")
                explanation.append("The identifier being used is not accessible or doesn't exist")

            else:
                explanation.append("**Compilation Error**")
                if answer.error_details:
                    # Truncate long error messages
                    error_preview = answer.error_details[:150]
                    explanation.append(f"Error: {error_preview}")

        else:
            # Successful execution - provide concept-based explanation

            # Struct vs Class
            if 'struct' in code_lower and 'class' in code_lower:
                explanation.append("**Key Concept**: Struct vs Class default access")
                explanation.append("- `struct` members are **public** by default")
                explanation.append("- `class` members are **private** by default")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Private inheritance
            elif ': private' in question.code:
                explanation.append("**Key Concept**: Private inheritance")
                explanation.append("- Makes all base class members **inaccessible** from outside derived class")
                explanation.append("- Base members can still be used internally in derived class")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Protected inheritance
            elif ': protected' in question.code:
                explanation.append("**Key Concept**: Protected inheritance")
                explanation.append("- Base public/protected members become protected in derived class")
                explanation.append("- Restricts external access while maintaining inheritance hierarchy")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Virtual + private
            elif 'virtual' in code_lower and 'private' in code_lower:
                explanation.append("**Key Concept**: Private virtual functions")
                explanation.append("- Virtual functions work even when **private**")
                explanation.append("- Polymorphism applies when called through public interface")
                explanation.append("- The `call()` public method can invoke private `func()` polymorphically")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Friend function
            elif 'friend' in code_lower:
                explanation.append("**Key Concept**: Friend functions")
                explanation.append("- `friend` functions can access **all private members** of a class")
                explanation.append("- Breaks encapsulation intentionally for specific use cases")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Using declaration
            elif 'using' in code_lower and 'base::' in code_lower:
                explanation.append("**Key Concept**: `using` declaration")
                explanation.append("- Restores accessibility of privately inherited member")
                explanation.append("- Makes specific base class member public again in derived class")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # sizeof and EBO
            elif 'sizeof' in code_lower:
                if 'empty' in code_lower or 'Empty' in question.code:
                    explanation.append("**Key Concept**: Empty Base Optimization (EBO)")
                    explanation.append("- Empty class has size **1** (minimum for unique addressing)")
                    explanation.append("- When inherited, EBO may optimize away the empty base size")
                explanation.append("**Memory Layout**:")
                explanation.append("- Size determined by data members + alignment padding")
                explanation.append("- Access specifiers don't affect size")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Same class object access
            elif re.search(r'other\.\w+', question.code):
                explanation.append("**Key Concept**: Member function access to other objects")
                explanation.append("- Member functions can access **private members** of other objects of the **same class**")
                explanation.append("- Access control is per-class, not per-object")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Inheritance visibility
            elif 'derived' in code_lower and 'base' in code_lower:
                explanation.append("**Key Concept**: Inheritance and member access")
                explanation.append("- Derived classes inherit base class members")
                explanation.append("- Member visibility depends on inheritance type (public/protected/private)")
                if answer.output:
                    explanation.append(f"- Output: `{answer.output}`")

            # Generic success
            else:
                if answer.output:
                    explanation.append(f"**Output**: `{answer.output}`")
                    explanation.append("Code compiles and runs successfully")

        return explanation

    def format_answer_block(self, question: Question, answer: Answer) -> str:
        """Format the answer block to be inserted after the question"""
        lines = ["\n**Answer:**"]

        # Add output or error
        if answer.compilation_error:
            lines.append("```")
            lines.append("Compilation Error")
            lines.append("```")
        else:
            lines.append("```")
            lines.append(answer.output if answer.output else "(no output)")
            lines.append("```")

        # Add explanation points
        if answer.explanation:
            lines.append("")
            for point in answer.explanation:
                lines.append(point)

        lines.append("")  # Empty line after answer
        return '\n'.join(lines)

    def process_file(self) -> bool:
        """
        Process the entire file: extract questions, compile individually, add answers
        Returns True if file was modified
        """
        print(f"Processing: {self.file_path.name}")

        # Extract all questions
        questions = self.extract_questions()
        if not questions:
            print(f"  No questions found")
            return False

        print(f"  Found {len(questions)} questions")

        # Check which questions need answers
        questions_needing_answers = []
        for q in questions:
            # Look for "**Answer:**" after the question
            has_answer = False
            for i in range(q.start_line, min(q.end_line + 20, len(self.lines))):
                if i < len(self.lines) and '**Answer:**' in self.lines[i]:
                    has_answer = True
                    break

            if not has_answer:
                questions_needing_answers.append(q)

        if not questions_needing_answers:
            print(f"  All questions already have answers\n")
            return False

        print(f"  Processing {len(questions_needing_answers)} questions individually...")

        # Compile and run each question individually
        answers_to_add = []
        for q in questions_needing_answers:
            output, error_type, error_details = self.compile_and_run(q.code)

            answer = Answer(
                output=output,
                compilation_error=error_type,
                error_details=error_details,
                explanation=[]
            )
            answer.explanation = self.generate_explanation(q, answer)
            answers_to_add.append((q, answer))

            if error_type:
                print(f"    Q{q.number}: {error_type}")
            else:
                output_preview = output[:40].replace('\n', ' ') if output else '(no output)'
                print(f"    Q{q.number}: ✓ {output_preview}")

        # Insert answers in reverse order (so line numbers don't shift)
        new_lines = self.lines.copy()
        for q, answer in reversed(answers_to_add):
            # Find insertion point (after the code block)
            insert_line = q.end_line if q.end_line > 0 else len(new_lines)

            # Find the closing ``` of the code block
            for i in range(q.start_line, min(insert_line + 50, len(new_lines))):
                if i < len(new_lines) and new_lines[i].strip() == '```':
                    # Check if this is after the opening ```cpp
                    if i > q.start_line + 1:
                        insert_line = i + 1
                        break

            # Insert answer block
            answer_block = self.format_answer_block(q, answer)
            answer_lines = answer_block.split('\n')
            new_lines[insert_line:insert_line] = answer_lines

        # Write back to file
        self.file_path.write_text('\n'.join(new_lines))
        print(f"  ✓ Updated {len(answers_to_add)} answers\n")
        return True

def find_all_practice_files(root_dir: Path) -> List[Path]:
    """Find all *_practice.md files in the data directory"""
    practice_files = []
    for chapter_dir in sorted(root_dir.glob('chapter_*')):
        if chapter_dir.is_dir():
            practice_files.extend(sorted(chapter_dir.glob('*_practice.md')))
    return practice_files

def process_single_file(file_path: Path) -> Tuple[Path, bool, str]:
    """Process a single practice file (for parallel execution)"""
    try:
        processor = PracticeProcessor(file_path)
        modified = processor.process_file()
        return file_path, modified, ""
    except Exception as e:
        error_msg = f"ERROR: {str(e)}"
        print(f"  {file_path.name}: {error_msg}")
        import traceback
        traceback.print_exc()
        return file_path, False, error_msg

def main():
    parser = argparse.ArgumentParser(description='Add thorough answers to practice files')
    parser.add_argument('--test-file', type=str, help='Test on a single file')
    parser.add_argument('--parallel', type=int, default=8, help='Number of parallel workers (default: 8)')
    parser.add_argument('--sequential', action='store_true', help='Process files sequentially')
    args = parser.parse_args()

    root_dir = Path('/home/pankaj/cplusplus/proCplusplus/data')

    if args.test_file:
        # Test on single file
        file_path = Path(args.test_file)
        if not file_path.exists():
            print(f"Error: File not found: {file_path}")
            return 1
        processor = PracticeProcessor(file_path)
        processor.process_file()
        return 0

    # Find all practice files
    practice_files = find_all_practice_files(root_dir)
    print(f"Found {len(practice_files)} practice files")
    print(f"Using INDIVIDUAL compilation with {args.parallel} workers")
    print("=" * 70 + "\n")

    if args.sequential:
        # Sequential processing
        modified_count = 0
        for file_path in practice_files:
            processor = PracticeProcessor(file_path)
            if processor.process_file():
                modified_count += 1
        print("=" * 70)
        print(f"\n✓ Complete: {modified_count}/{len(practice_files)} files modified")
    else:
        # Parallel processing
        modified_count = 0
        errors = []

        with ThreadPoolExecutor(max_workers=args.parallel) as executor:
            futures = {executor.submit(process_single_file, f): f for f in practice_files}

            for future in as_completed(futures):
                file_path, modified, error = future.result()
                if modified:
                    modified_count += 1
                if error:
                    errors.append((file_path.name, error))

        print("=" * 70)
        print(f"\n✓ Complete: {modified_count}/{len(practice_files)} files modified")

        if errors:
            print(f"\n⚠ Errors encountered in {len(errors)} files:")
            for filename, error in errors:
                print(f"  - {filename}: {error}")

    return 0

if __name__ == '__main__':
    exit(main())
