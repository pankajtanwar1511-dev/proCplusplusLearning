"""
C++ Master Pro - World-Class Learning Backend API v2.0
Optimized for the new processed JSON data structure
Features: Smart learning algorithms, spaced repetition, progress tracking
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
import os

app = Flask(__name__, static_folder='../frontend/build', static_url_path='')
CORS(app)

# Paths to new processed data
JSON_DATA_DIR = Path(__file__).parent.parent.parent / 'processed_data' / 'json_output'
USER_DATA_FILE = Path(__file__).parent / 'user_data_v2.json'

# ============================================================
# DATA LOADING
# ============================================================

def load_master_index():
    """Load the master index with all content"""
    with open(JSON_DATA_DIR / 'master_index.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def load_chapter(chapter_number):
    """Load a specific chapter by number"""
    chapter_files = list(JSON_DATA_DIR.glob(f'chapter_{chapter_number}_*.json'))
    if chapter_files:
        with open(chapter_files[0], 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

# Load master index at startup
MASTER_INDEX = load_master_index()

# ============================================================
# USER DATA MANAGEMENT
# ============================================================

def load_user_data():
    """Load user progress data with spaced repetition"""
    if USER_DATA_FILE.exists():
        with open(USER_DATA_FILE, 'r') as f:
            return json.load(f)

    return {
        'progress': {},  # {chapter_num: {topic_idx: {completed, score, last_reviewed, next_review}}}
        'quiz_history': [],  # List of quiz attempts
        'bookmarks': [],  # Bookmarked questions
        'notes': {},  # User notes per topic
        'current_streak': 0,
        'longest_streak': 0,
        'last_active': None,
        'total_study_time': 0,
        'difficulty_performance': {  # Track performance by difficulty
            'beginner': {'correct': 0, 'total': 0},
            'intermediate': {'correct': 0, 'total': 0},
            'advanced': {'correct': 0, 'total': 0},
            'expert': {'correct': 0, 'total': 0}
        },
        'concept_mastery': {},  # Track mastery of concepts
        'weak_areas': [],  # Concepts needing more practice
        'achievements': []
    }

def save_user_data(data):
    """Save user progress data"""
    with open(USER_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

USER_DATA = load_user_data()

# ============================================================
# LEARNING ALGORITHMS
# ============================================================

def calculate_next_review(performance_score):
    """Calculate next review date using spaced repetition"""
    # SM-2 algorithm simplified
    intervals = {
        'poor': 1,      # Review tomorrow
        'fair': 3,      # Review in 3 days
        'good': 7,      # Review in 1 week
        'excellent': 14 # Review in 2 weeks
    }

    if performance_score < 60:
        interval = intervals['poor']
    elif performance_score < 75:
        interval = intervals['fair']
    elif performance_score < 90:
        interval = intervals['good']
    else:
        interval = intervals['excellent']

    next_review = datetime.now() + timedelta(days=interval)
    return next_review.isoformat()

def get_recommended_questions(user_data, chapter_num, topic_idx, count=10):
    """Get recommended questions based on user performance"""
    chapter = load_chapter(chapter_num)
    if not chapter or topic_idx >= len(chapter['topics']):
        return []

    topic = chapter['topics'][topic_idx]
    questions = topic['interview_qa']

    # Get user's weak concepts
    weak_concepts = set(user_data.get('weak_areas', []))

    # Score questions based on difficulty and concepts
    scored_questions = []
    for q in questions:
        score = 0

        # Prioritize weak concepts
        if any(concept in weak_concepts for concept in q['concepts']):
            score += 10

        # Balance difficulty based on performance
        difficulty = q['difficulty'][0] if q['difficulty'] else 'intermediate'
        perf = user_data['difficulty_performance'].get(difficulty, {'correct': 0, 'total': 1})

        if perf['total'] > 0:
            accuracy = perf['correct'] / perf['total']

            # If struggling with a difficulty, prioritize it
            if accuracy < 0.6:
                if difficulty in ['beginner', 'intermediate']:
                    score += 5
            elif accuracy > 0.8:
                if difficulty in ['advanced', 'expert']:
                    score += 5

        scored_questions.append((score, q))

    # Sort by score and shuffle within score groups
    scored_questions.sort(key=lambda x: x[0], reverse=True)

    # Take top candidates and randomize
    top_candidates = scored_questions[:count * 2]
    random.shuffle(top_candidates)

    return [q for _, q in top_candidates[:count]]

# ============================================================
# API ENDPOINTS
# ============================================================

@app.route('/')
def serve():
    """Serve React frontend"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'total_chapters': MASTER_INDEX['statistics']['total_chapters'],
        'total_topics': MASTER_INDEX['statistics']['total_topics']
    })

@app.route('/api/overview')
def get_overview():
    """Get complete overview of all chapters and topics"""
    return jsonify({
        'version': MASTER_INDEX['version'],
        'description': MASTER_INDEX['description'],
        'statistics': MASTER_INDEX['statistics'],
        'chapters': [{
            'number': chapter['chapter_number'],
            'name': chapter['chapter_name'],
            'topic_count': chapter['topic_count'],
            'topics': [{'topic': t['topic'], 'filename': t['filename']} for t in chapter['topics']]
        } for chapter in MASTER_INDEX['chapters']]
    })

@app.route('/api/chapters')
def get_chapters():
    """Get list of all chapters with progress"""
    chapters_list = []

    for chapter_info in MASTER_INDEX['statistics']['chapters_processed']:
        chapter_num = chapter_info['number']

        # Calculate progress
        user_progress = USER_DATA['progress'].get(str(chapter_num), {})
        completed_topics = sum(1 for t in user_progress.values() if t.get('completed', False))
        total_topics = chapter_info['topics']

        chapters_list.append({
            'number': chapter_num,
            'name': chapter_info['name'],
            'total_topics': total_topics,
            'completed_topics': completed_topics,
            'progress_percent': (completed_topics / total_topics * 100) if total_topics > 0 else 0
        })

    return jsonify({'chapters': chapters_list})

@app.route('/api/chapter/<int:chapter_num>')
def get_chapter_details(chapter_num):
    """Get detailed chapter information with all topics"""
    chapter = load_chapter(chapter_num)

    if not chapter:
        return jsonify({'error': 'Chapter not found'}), 404

    # Add progress to each topic
    user_chapter_progress = USER_DATA['progress'].get(str(chapter_num), {})

    topics_with_progress = []
    for idx, topic in enumerate(chapter['topics']):
        topic_progress = user_chapter_progress.get(str(idx), {
            'completed': False,
            'score': 0,
            'attempts': 0,
            'last_reviewed': None,
            'next_review': None
        })

        topics_with_progress.append({
            'index': idx,
            'topic': topic['topic'],
            'filename': topic['filename'],
            'theory_count': len(topic['theory']['subsections']),
            'edge_cases_count': len(topic['edge_cases']),
            'examples_count': len(topic['code_examples']),
            'questions_count': len(topic['interview_qa']),
            'progress': topic_progress
        })

    return jsonify({
        'chapter_name': chapter['chapter_name'],
        'chapter_number': chapter['chapter_number'],
        'topic_count': chapter['topic_count'],
        'topics': topics_with_progress
    })

@app.route('/api/topic/<int:chapter_num>/<int:topic_idx>')
def get_topic_content(chapter_num, topic_idx):
    """Get complete topic content"""
    chapter = load_chapter(chapter_num)

    if not chapter or topic_idx >= len(chapter['topics']):
        return jsonify({'error': 'Topic not found'}), 404

    topic = chapter['topics'][topic_idx]

    # Add user notes if any
    note_key = f"{chapter_num}_{topic_idx}"
    user_note = USER_DATA['notes'].get(note_key, '')

    return jsonify({
        'topic': topic['topic'],
        'chapter_num': chapter_num,
        'topic_idx': topic_idx,
        'theory': topic['theory'],
        'edge_cases': topic['edge_cases'],
        'code_examples': topic['code_examples'],
        'practice_tasks': topic.get('practice_tasks', []),
        'interview_qa': topic.get('interview_qa', []),
        'quick_reference': topic['quick_reference'],
        'user_note': user_note,
        'stats': {
            'theory_subsections': len(topic['theory']['subsections']),
            'edge_cases': len(topic['edge_cases']),
            'code_examples': len(topic['code_examples']),
            'interview_questions': len(topic['interview_qa'])
        }
    })

@app.route('/api/quiz/<int:chapter_num>/<int:topic_idx>')
def get_quiz(chapter_num, topic_idx):
    """Generate a quiz for a specific topic"""
    count = request.args.get('count', 10, type=int)
    difficulty = request.args.get('difficulty', 'all')

    chapter = load_chapter(chapter_num)

    if not chapter or topic_idx >= len(chapter['topics']):
        return jsonify({'error': 'Topic not found'}), 404

    topic = chapter['topics'][topic_idx]
    questions = topic['interview_qa']

    # Filter by difficulty if specified
    if difficulty != 'all':
        questions = [q for q in questions if difficulty in q['difficulty']]

    # Use smart recommendation or random selection
    if len(USER_DATA['quiz_history']) > 5:  # If user has history, use smart selection
        selected_questions = get_recommended_questions(USER_DATA, chapter_num, topic_idx, count)
    else:
        # Random selection for new users
        selected_questions = random.sample(questions, min(count, len(questions)))

    # Remove answers for quiz mode
    quiz_questions = []
    for i, q in enumerate(selected_questions):
        quiz_questions.append({
            'id': i,
            'question': q['question'],
            'difficulty': q['difficulty'],
            'concepts': q['concepts'],
            'category': q['category'],
            'has_code': len(q['code_examples']) > 0
        })

    return jsonify({
        'chapter_num': chapter_num,
        'topic_idx': topic_idx,
        'topic_name': topic['topic'],
        'questions': quiz_questions,
        'total_questions': len(questions)
    })

@app.route('/api/quiz/<int:chapter_num>/<int:topic_idx>/answer/<int:question_id>', methods=['POST'])
def check_answer(chapter_num, topic_idx, question_id):
    """Check user's answer and provide feedback"""
    user_answer = request.json.get('answer', '')

    chapter = load_chapter(chapter_num)
    if not chapter or topic_idx >= len(chapter['topics']):
        return jsonify({'error': 'Topic not found'}), 404

    topic = chapter['topics'][topic_idx]

    if question_id >= len(topic['interview_qa']):
        return jsonify({'error': 'Question not found'}), 404

    question = topic['interview_qa'][question_id]

    return jsonify({
        'correct_answer': question['answer'],
        'explanation': question['explanation'],
        'key_takeaway': question['key_takeaway'],
        'code_examples': question['code_examples']
    })

@app.route('/api/progress', methods=['POST'])
def update_progress():
    """Update user progress after quiz or study session"""
    data = request.json
    chapter_num = str(data['chapter_num'])
    topic_idx = str(data['topic_idx'])
    score = data.get('score', 0)

    # Initialize chapter progress if not exists
    if chapter_num not in USER_DATA['progress']:
        USER_DATA['progress'][chapter_num] = {}

    # Update topic progress
    if topic_idx not in USER_DATA['progress'][chapter_num]:
        USER_DATA['progress'][chapter_num][topic_idx] = {
            'completed': False,
            'score': 0,
            'attempts': 0,
            'last_reviewed': None,
            'next_review': None
        }

    topic_progress = USER_DATA['progress'][chapter_num][topic_idx]
    topic_progress['attempts'] += 1
    topic_progress['score'] = max(topic_progress['score'], score)
    topic_progress['last_reviewed'] = datetime.now().isoformat()
    topic_progress['next_review'] = calculate_next_review(score)

    if score >= 70:
        topic_progress['completed'] = True

    # Update difficulty performance
    difficulty = data.get('difficulty', 'intermediate')
    if difficulty in USER_DATA['difficulty_performance']:
        USER_DATA['difficulty_performance'][difficulty]['total'] += 1
        if score >= 70:
            USER_DATA['difficulty_performance'][difficulty]['correct'] += 1

    # Update quiz history
    USER_DATA['quiz_history'].append({
        'chapter': chapter_num,
        'topic': topic_idx,
        'score': score,
        'timestamp': datetime.now().isoformat()
    })

    # Update streak
    USER_DATA['last_active'] = datetime.now().isoformat()

    save_user_data(USER_DATA)

    return jsonify({'success': True, 'progress': topic_progress})

@app.route('/api/stats')
def get_user_stats():
    """Get user statistics and analytics"""
    total_topics = MASTER_INDEX['statistics']['total_topics']
    completed = sum(
        sum(1 for t in chapter_topics.values() if t.get('completed', False))
        for chapter_topics in USER_DATA['progress'].values()
    )

    # Calculate average score
    recent_quizzes = USER_DATA['quiz_history'][-20:]  # Last 20 quizzes
    avg_score = sum(q['score'] for q in recent_quizzes) / len(recent_quizzes) if recent_quizzes else 0

    # Get difficulty breakdown
    difficulty_stats = {}
    for diff, perf in USER_DATA['difficulty_performance'].items():
        if perf['total'] > 0:
            difficulty_stats[diff] = {
                'accuracy': (perf['correct'] / perf['total']) * 100,
                'total_attempted': perf['total']
            }

    return jsonify({
        'total_topics': total_topics,
        'completed_topics': completed,
        'completion_percent': (completed / total_topics * 100) if total_topics > 0 else 0,
        'current_streak': USER_DATA['current_streak'],
        'longest_streak': USER_DATA['longest_streak'],
        'average_score': round(avg_score, 1),
        'total_quizzes': len(USER_DATA['quiz_history']),
        'difficulty_performance': difficulty_stats,
        'weak_areas': USER_DATA.get('weak_areas', [])[:5]  # Top 5 weak areas
    })

@app.route('/api/search')
def search_content():
    """Search across all content"""
    query = request.args.get('q', '').lower()
    search_type = request.args.get('type', 'all')  # all, questions, topics, concepts

    results = []

    for chapter in MASTER_INDEX['chapters']:
        for topic_idx, topic in enumerate(chapter['topics']):
            # Search in topic title
            if search_type in ['all', 'topics'] and query in topic['topic'].lower():
                results.append({
                    'type': 'topic',
                    'chapter': chapter['chapter_number'],
                    'topic_idx': topic_idx,
                    'title': topic['topic'],
                    'match': 'title'
                })

            # Search in questions
            if search_type in ['all', 'questions']:
                for q_idx, q in enumerate(topic['interview_qa']):
                    if query in q['question'].lower() or query in q['answer'].lower():
                        results.append({
                            'type': 'question',
                            'chapter': chapter['chapter_number'],
                            'topic_idx': topic_idx,
                            'question': q['question'],
                            'difficulty': q['difficulty'],
                            'match': 'content'
                        })

            # Search in concepts
            if search_type in ['all', 'concepts']:
                for q in topic['interview_qa']:
                    if any(query in concept.lower() for concept in q['concepts']):
                        results.append({
                            'type': 'concept',
                            'chapter': chapter['chapter_number'],
                            'topic_idx': topic_idx,
                            'topic_name': topic['topic'],
                            'concepts': [c for c in q['concepts'] if query in c.lower()]
                        })

    # Remove duplicates and limit results
    unique_results = list({json.dumps(r, sort_keys=True): r for r in results}.values())

    return jsonify({'results': unique_results[:50]})  # Limit to 50 results

@app.route('/api/bookmark', methods=['POST'])
def toggle_bookmark():
    """Bookmark a question"""
    data = request.json
    bookmark_id = f"{data['chapter']}_{data['topic']}_{data['question_id']}"

    if bookmark_id in USER_DATA['bookmarks']:
        USER_DATA['bookmarks'].remove(bookmark_id)
        bookmarked = False
    else:
        USER_DATA['bookmarks'].append(bookmark_id)
        bookmarked = True

    save_user_data(USER_DATA)

    return jsonify({'bookmarked': bookmarked})

@app.route('/api/note', methods=['POST'])
def save_note():
    """Save a note for a topic"""
    data = request.json
    note_key = f"{data['chapter']}_{data['topic']}"
    USER_DATA['notes'][note_key] = data['note']
    save_user_data(USER_DATA)

    return jsonify({'success': True})

# ============================================================
# RUN SERVER
# ============================================================

if __name__ == '__main__':
    print("="*60)
    print("C++ Master Pro - Learning API v2.0")
    print("="*60)
    print(f"Loaded {MASTER_INDEX['statistics']['total_chapters']} chapters")
    print(f"Loaded {MASTER_INDEX['statistics']['total_topics']} topics")
    print(f"Starting server on http://localhost:5000")
    print("="*60)

    app.run(debug=True, host='0.0.0.0', port=5000)
