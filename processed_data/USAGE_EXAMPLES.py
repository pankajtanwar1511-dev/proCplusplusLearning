#!/usr/bin/env python3
"""
Example usage patterns for the C++ Learning JSON data

This file demonstrates various ways to load and use the processed JSON content
in your learning application.
"""

import json
from pathlib import Path
from typing import List, Dict, Any


# Base path to JSON files
JSON_DIR = Path(__file__).parent / 'json_output'


# ============================================================================
# Example 1: Load Master Index
# ============================================================================
def load_master_index() -> Dict[str, Any]:
    """Load the master index with all chapters and topics."""
    with open(JSON_DIR / 'master_index.json', 'r', encoding='utf-8') as f:
        return json.load(f)


def print_content_overview():
    """Print an overview of all available content."""
    master = load_master_index()

    print("=" * 70)
    print("C++ LEARNING CONTENT OVERVIEW")
    print("=" * 70)
    print(f"Version: {master['version']}")
    print(f"Total Chapters: {master['statistics']['total_chapters']}")
    print(f"Total Topics: {master['statistics']['total_topics']}")
    print("\nChapter Breakdown:")
    print("-" * 70)

    for chapter_info in master['statistics']['chapters_processed']:
        print(f"  Chapter {chapter_info['number']:2d}: {chapter_info['name']:40s} ({chapter_info['topics']} topics)")


# ============================================================================
# Example 2: Load Specific Chapter
# ============================================================================
def load_chapter(chapter_number: int) -> Dict[str, Any]:
    """Load a specific chapter by number."""
    # Find the chapter file
    chapter_files = list(JSON_DIR.glob(f'chapter_{chapter_number}_*.json'))

    if not chapter_files:
        raise FileNotFoundError(f"Chapter {chapter_number} not found")

    with open(chapter_files[0], 'r', encoding='utf-8') as f:
        return json.load(f)


def get_chapter_topics(chapter_number: int) -> List[str]:
    """Get list of all topic names in a chapter."""
    chapter = load_chapter(chapter_number)
    return [topic['topic'] for topic in chapter['topics']]


# ============================================================================
# Example 3: Filter Questions by Difficulty
# ============================================================================
def get_questions_by_difficulty(difficulty: str = 'beginner') -> List[Dict[str, Any]]:
    """
    Get all interview questions of a specific difficulty level.

    Args:
        difficulty: 'beginner', 'intermediate', 'advanced', or 'expert'

    Returns:
        List of questions with metadata
    """
    master = load_master_index()
    questions = []

    for chapter in master['chapters']:
        for topic in chapter['topics']:
            for qa in topic['interview_qa']:
                if difficulty in qa['difficulty']:
                    questions.append({
                        'chapter': chapter['chapter_name'],
                        'topic': topic['topic'],
                        'question': qa['question'],
                        'answer': qa['answer'],
                        'explanation': qa['explanation'],
                        'concepts': qa['concepts'],
                        'code_examples': qa['code_examples']
                    })

    return questions


# ============================================================================
# Example 4: Search by Concept/Tag
# ============================================================================
def search_by_concept(concept: str) -> List[Dict[str, Any]]:
    """
    Search for all questions related to a specific concept.

    Args:
        concept: e.g., 'inheritance', 'polymorphism', 'move_semantics'

    Returns:
        List of matching questions
    """
    master = load_master_index()
    results = []

    concept_lower = concept.lower()

    for chapter in master['chapters']:
        for topic in chapter['topics']:
            for qa in topic['interview_qa']:
                # Search in concepts and category tags
                all_tags = qa['concepts'] + qa['category']
                if any(concept_lower in tag.lower() for tag in all_tags):
                    results.append({
                        'chapter': chapter['chapter_number'],
                        'topic': topic['topic'],
                        'question': qa['question'],
                        'difficulty': qa['difficulty'],
                        'concepts': qa['concepts']
                    })

    return results


# ============================================================================
# Example 5: Get Code Examples
# ============================================================================
def get_code_examples(chapter_number: int, topic_index: int = 0) -> List[Dict[str, Any]]:
    """
    Get all code examples from a specific topic.

    Args:
        chapter_number: Chapter number (1-10)
        topic_index: Topic index within chapter (0-based)

    Returns:
        List of code examples with explanations
    """
    chapter = load_chapter(chapter_number)

    if topic_index >= len(chapter['topics']):
        raise IndexError(f"Topic index {topic_index} out of range")

    topic = chapter['topics'][topic_index]
    return topic['code_examples']


# ============================================================================
# Example 6: Generate Quiz
# ============================================================================
def generate_quiz(num_questions: int = 10, difficulty: str = 'beginner') -> List[Dict[str, Any]]:
    """
    Generate a random quiz with specified parameters.

    Args:
        num_questions: Number of questions to include
        difficulty: Difficulty level filter

    Returns:
        List of quiz questions
    """
    import random

    questions = get_questions_by_difficulty(difficulty)

    if len(questions) < num_questions:
        print(f"Warning: Only {len(questions)} questions available for difficulty '{difficulty}'")
        num_questions = len(questions)

    quiz = random.sample(questions, num_questions)

    return [{
        'id': i + 1,
        'question': q['question'],
        'topic': q['topic'],
        'answer': q['answer'],
        'explanation': q['explanation']
    } for i, q in enumerate(quiz)]


# ============================================================================
# Example 7: Get Learning Path
# ============================================================================
def get_learning_path() -> List[Dict[str, Any]]:
    """
    Generate a structured learning path through all topics.

    Returns:
        Ordered list of chapters and topics for progressive learning
    """
    master = load_master_index()
    learning_path = []

    for chapter in master['chapters']:
        chapter_entry = {
            'chapter_number': chapter['chapter_number'],
            'chapter_name': chapter['chapter_name'],
            'topics': []
        }

        for topic in chapter['topics']:
            # Count content for each topic
            topic_entry = {
                'topic_name': topic['topic'],
                'has_theory': len(topic['theory']['subsections']) > 0,
                'edge_cases_count': len(topic['edge_cases']),
                'examples_count': len(topic['code_examples']),
                'questions_count': len(topic['interview_qa']),
                'practice_count': len(topic['practice_tasks'])
            }
            chapter_entry['topics'].append(topic_entry)

        learning_path.append(chapter_entry)

    return learning_path


# ============================================================================
# Example 8: Get Statistics
# ============================================================================
def get_content_statistics() -> Dict[str, Any]:
    """Get detailed statistics about the content."""
    master = load_master_index()

    stats = {
        'total_chapters': 0,
        'total_topics': 0,
        'total_questions': 0,
        'total_examples': 0,
        'total_edge_cases': 0,
        'questions_by_difficulty': {
            'beginner': 0,
            'intermediate': 0,
            'advanced': 0,
            'expert': 0
        },
        'questions_by_chapter': {}
    }

    for chapter in master['chapters']:
        stats['total_chapters'] += 1
        stats['total_topics'] += len(chapter['topics'])

        chapter_questions = 0

        for topic in chapter['topics']:
            stats['total_examples'] += len(topic['code_examples'])
            stats['total_edge_cases'] += len(topic['edge_cases'])
            stats['total_questions'] += len(topic['interview_qa'])
            chapter_questions += len(topic['interview_qa'])

            # Count by difficulty
            for qa in topic['interview_qa']:
                for difficulty in qa['difficulty']:
                    if difficulty in stats['questions_by_difficulty']:
                        stats['questions_by_difficulty'][difficulty] += 1

        stats['questions_by_chapter'][chapter['chapter_name']] = chapter_questions

    return stats


# ============================================================================
# DEMO: Run examples
# ============================================================================
if __name__ == '__main__':
    print("\n" + "=" * 70)
    print("C++ LEARNING JSON DATA - USAGE EXAMPLES")
    print("=" * 70 + "\n")

    # Example 1: Overview
    print("Example 1: Content Overview")
    print("-" * 70)
    print_content_overview()

    # Example 2: Chapter topics
    print("\n\nExample 2: Topics in Chapter 1 (OOP)")
    print("-" * 70)
    topics = get_chapter_topics(1)
    for i, topic in enumerate(topics, 1):
        print(f"  {i}. {topic}")

    # Example 3: Beginner questions
    print("\n\nExample 3: Sample Beginner Questions")
    print("-" * 70)
    beginner_qs = get_questions_by_difficulty('beginner')
    print(f"Total beginner questions: {len(beginner_qs)}")
    print("\nFirst 3 questions:")
    for i, q in enumerate(beginner_qs[:3], 1):
        print(f"\n  {i}. {q['question']}")
        print(f"     Topic: {q['topic']}")
        print(f"     Concepts: {', '.join(q['concepts'][:3])}")

    # Example 4: Search by concept
    print("\n\nExample 4: Search for 'inheritance' questions")
    print("-" * 70)
    inheritance_qs = search_by_concept('inheritance')
    print(f"Found {len(inheritance_qs)} questions about inheritance")
    if inheritance_qs:
        print(f"\nSample: {inheritance_qs[0]['question'][:80]}...")

    # Example 5: Code examples
    print("\n\nExample 5: Code Examples from Chapter 1, Topic 1")
    print("-" * 70)
    examples = get_code_examples(1, 0)
    print(f"Total code examples: {len(examples)}")
    if examples:
        print(f"\nFirst example: {examples[0]['title']}")
        print(f"Code preview: {examples[0]['code'][:100]}...")

    # Example 6: Generate quiz
    print("\n\nExample 6: Generate a Sample Quiz")
    print("-" * 70)
    quiz = generate_quiz(5, 'beginner')
    print(f"Generated quiz with {len(quiz)} questions")
    for q in quiz:
        print(f"\n  Q{q['id']}: {q['question'][:60]}...")

    # Example 7: Learning path
    print("\n\nExample 7: Learning Path Overview")
    print("-" * 70)
    path = get_learning_path()
    for chapter in path[:3]:  # First 3 chapters
        print(f"\nChapter {chapter['chapter_number']}: {chapter['chapter_name']}")
        print(f"  Topics: {len(chapter['topics'])}")
        total_questions = sum(t['questions_count'] for t in chapter['topics'])
        print(f"  Total questions: {total_questions}")

    # Example 8: Statistics
    print("\n\nExample 8: Content Statistics")
    print("-" * 70)
    stats = get_content_statistics()
    print(f"Total Chapters: {stats['total_chapters']}")
    print(f"Total Topics: {stats['total_topics']}")
    print(f"Total Questions: {stats['total_questions']}")
    print(f"Total Code Examples: {stats['total_examples']}")
    print(f"Total Edge Cases: {stats['total_edge_cases']}")
    print(f"\nQuestions by Difficulty:")
    for difficulty, count in stats['questions_by_difficulty'].items():
        print(f"  {difficulty.capitalize():12s}: {count:3d}")

    print("\n" + "=" * 70)
    print("END OF EXAMPLES")
    print("=" * 70 + "\n")
