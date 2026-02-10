"""
Learning Platform Backend API v3.0 - Multi-Catalog Support
Supports both C++ and ROS2 content catalogs
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

# Paths to processed data
BASE_DATA_DIR = Path(__file__).parent.parent.parent / 'processed_data'
USER_DATA_FILE = Path(__file__).parent / 'user_data_v3.json'

# ============================================================
# DATA LOADING
# ============================================================

def load_catalogs():
    """Load all available catalogs"""
    catalogs = {}

    # Load C++ catalog
    cpp_index_path = BASE_DATA_DIR / 'json_output' / 'master_index.json'
    if cpp_index_path.exists():
        with open(cpp_index_path, 'r', encoding='utf-8') as f:
            catalogs['cpp'] = {
                'master_index': json.load(f),
                'data_dir': BASE_DATA_DIR / 'json_output'
            }

    # Load ROS2 catalog
    ros2_index_path = BASE_DATA_DIR / 'json_output_ros2' / 'master_index.json'
    if ros2_index_path.exists():
        with open(ros2_index_path, 'r', encoding='utf-8') as f:
            catalogs['ros2'] = {
                'master_index': json.load(f),
                'data_dir': BASE_DATA_DIR / 'json_output_ros2'
            }

    return catalogs

def load_chapter(catalog, chapter_number):
    """Load a specific chapter by number from a catalog"""
    if catalog not in CATALOGS:
        return None

    data_dir = CATALOGS[catalog]['data_dir']
    chapter_files = list(data_dir.glob(f'chapter_{chapter_number}_*.json'))
    if chapter_files:
        with open(chapter_files[0], 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

# Load all catalogs at startup
CATALOGS = load_catalogs()

# Store active quizzes (in-memory, could be moved to database)
ACTIVE_QUIZZES = {}

# ============================================================
# USER DATA MANAGEMENT
# ============================================================

def load_user_data():
    """Load user progress data with spaced repetition"""
    if USER_DATA_FILE.exists():
        with open(USER_DATA_FILE, 'r') as f:
            return json.load(f)

    return {
        'progress': {},  # {catalog: {chapter_num: {topic_idx: {completed, score, last_reviewed, next_review}}}}
        'quiz_history': [],
        'bookmarks': [],
        'notes': {},
        'current_streak': 0,
        'longest_streak': 0,
        'last_active': None,
        'total_study_time': 0,
        'difficulty_performance': {
            'beginner': {'correct': 0, 'total': 0},
            'intermediate': {'correct': 0, 'total': 0},
            'advanced': {'correct': 0, 'total': 0},
            'expert': {'correct': 0, 'total': 0}
        },
        'concept_mastery': {},
        'weak_areas': [],
        'achievements': []
    }

def save_user_data(data):
    """Save user progress data"""
    with open(USER_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

USER_DATA = load_user_data()

# Initialize catalog progress if not exists
for catalog_name in CATALOGS.keys():
    if catalog_name not in USER_DATA['progress']:
        USER_DATA['progress'][catalog_name] = {}

# ============================================================
# API ENDPOINTS
# ============================================================

@app.route('/')
def serve():
    """Serve catalog browser"""
    return send_from_directory('templates', 'catalog_browser.html')

@app.route('/topic')
def serve_topic_viewer():
    """Serve topic viewer"""
    return send_from_directory('templates', 'topic_viewer.html')

@app.route('/react')
def serve_react():
    """Serve React frontend"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/health')
def health():
    """Health check endpoint"""
    total_chapters = sum(cat['master_index']['statistics']['total_chapters']
                         for cat in CATALOGS.values())
    total_topics = sum(cat['master_index']['statistics']['total_topics']
                       for cat in CATALOGS.values())

    return jsonify({
        'status': 'ok',
        'catalogs': len(CATALOGS),
        'total_chapters': total_chapters,
        'total_topics': total_topics
    })

@app.route('/api/catalogs')
def get_catalogs():
    """Get list of available catalogs"""
    catalog_list = []
    for name, data in CATALOGS.items():
        catalog_list.append({
            'name': name,
            'description': data['master_index']['description'],
            'total_chapters': data['master_index']['statistics']['total_chapters'],
            'total_topics': data['master_index']['statistics']['total_topics']
        })
    return jsonify({'catalogs': catalog_list})

@app.route('/api/<catalog>/overview')
def get_catalog_overview(catalog):
    """Get complete overview of a catalog"""
    if catalog not in CATALOGS:
        return jsonify({'error': 'Catalog not found'}), 404

    master_index = CATALOGS[catalog]['master_index']
    return jsonify({
        'catalog': catalog,
        'version': master_index['version'],
        'description': master_index['description'],
        'statistics': master_index['statistics'],
        'chapters': [{
            'number': chapter['chapter_number'],
            'name': chapter['chapter_name'],
            'topic_count': chapter['topic_count'],
            'topics': [{'topic': t['topic'], 'filename': t['filename']} for t in chapter['topics']]
        } for chapter in master_index['chapters']]
    })

@app.route('/api/<catalog>/chapters')
def get_catalog_chapters(catalog):
    """Get list of all chapters in a catalog with progress"""
    if catalog not in CATALOGS:
        return jsonify({'error': 'Catalog not found'}), 404

    master_index = CATALOGS[catalog]['master_index']
    chapters_list = []

    for chapter_info in master_index['statistics']['chapters_processed']:
        chapter_num = chapter_info['number']

        # Calculate progress
        user_progress = USER_DATA['progress'][catalog].get(str(chapter_num), {})
        completed_topics = sum(1 for t in user_progress.values() if t.get('completed', False))
        total_topics = chapter_info['topics']

        chapters_list.append({
            'number': chapter_num,
            'name': chapter_info['name'],
            'total_topics': total_topics,
            'completed_topics': completed_topics,
            'progress_percent': (completed_topics / total_topics * 100) if total_topics > 0 else 0
        })

    # Sort chapters by number
    chapters_list.sort(key=lambda x: x['number'])

    return jsonify({'catalog': catalog, 'chapters': chapters_list})

@app.route('/api/<catalog>/chapter/<int:chapter_num>')
def get_chapter_details(catalog, chapter_num):
    """Get detailed chapter information with all topics"""
    if catalog not in CATALOGS:
        return jsonify({'error': 'Catalog not found'}), 404

    chapter = load_chapter(catalog, chapter_num)

    if not chapter:
        return jsonify({'error': 'Chapter not found'}), 404

    # Add progress to each topic
    user_chapter_progress = USER_DATA['progress'][catalog].get(str(chapter_num), {})

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
        'catalog': catalog,
        'chapter_name': chapter['chapter_name'],
        'chapter_number': chapter['chapter_number'],
        'topic_count': chapter['topic_count'],
        'topics': topics_with_progress
    })

@app.route('/api/<catalog>/topic/<int:chapter_num>/<int:topic_idx>')
def get_topic_content(catalog, chapter_num, topic_idx):
    """Get complete topic content"""
    if catalog not in CATALOGS:
        return jsonify({'error': 'Catalog not found'}), 404

    chapter = load_chapter(catalog, chapter_num)

    if not chapter or topic_idx >= len(chapter['topics']):
        return jsonify({'error': 'Topic not found'}), 404

    topic = chapter['topics'][topic_idx]

    # Add user notes if any
    note_key = f"{catalog}_{chapter_num}_{topic_idx}"
    user_note = USER_DATA['notes'].get(note_key, '')

    return jsonify({
        'catalog': catalog,
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

@app.route('/api/<catalog>/stats')
def get_catalog_stats(catalog):
    """Get user statistics for a specific catalog"""
    if catalog not in CATALOGS:
        return jsonify({'error': 'Catalog not found'}), 404

    total_topics = CATALOGS[catalog]['master_index']['statistics']['total_topics']
    completed = sum(
        sum(1 for t in chapter_topics.values() if t.get('completed', False))
        for chapter_topics in USER_DATA['progress'][catalog].values()
    )

    # Calculate average score for this catalog
    catalog_quizzes = [q for q in USER_DATA['quiz_history'] if q.get('catalog') == catalog]
    recent_quizzes = catalog_quizzes[-20:]
    avg_score = sum(q['score'] for q in recent_quizzes) / len(recent_quizzes) if recent_quizzes else 0

    return jsonify({
        'catalog': catalog,
        'total_topics': total_topics,
        'completed_topics': completed,
        'completion_percent': (completed / total_topics * 100) if total_topics > 0 else 0,
        'average_score': round(avg_score, 1),
        'total_quizzes': len(catalog_quizzes)
    })

@app.route('/api/stats')
def get_overall_stats():
    """Get overall user statistics across all catalogs"""
    total_topics = sum(cat['master_index']['statistics']['total_topics']
                       for cat in CATALOGS.values())

    completed = sum(
        sum(sum(1 for t in chapter_topics.values() if t.get('completed', False))
            for chapter_topics in catalog_progress.values())
        for catalog_progress in USER_DATA['progress'].values()
    )

    # Calculate average score
    recent_quizzes = USER_DATA['quiz_history'][-20:]
    avg_score = sum(q['score'] for q in recent_quizzes) / len(recent_quizzes) if recent_quizzes else 0

    return jsonify({
        'total_topics': total_topics,
        'completed_topics': completed,
        'completion_percent': (completed / total_topics * 100) if total_topics > 0 else 0,
        'current_streak': USER_DATA['current_streak'],
        'longest_streak': USER_DATA['longest_streak'],
        'average_score': round(avg_score, 1),
        'total_quizzes': len(USER_DATA['quiz_history'])
    })

# ============================================================
# BACKWARD COMPATIBILITY ROUTES (for React frontend)
# ============================================================

@app.route('/api/overview')
def get_overview():
    """Get overview (legacy endpoint - returns catalog data)"""
    # Return C++ chapters for backward compatibility
    chapters_list = []
    if 'cpp' in CATALOGS:
        master_index = CATALOGS['cpp']['master_index']
        for chapter_info in master_index['statistics']['chapters_processed']:
            chapters_list.append({
                'number': chapter_info['number'],
                'name': chapter_info['name'],
                'topics': chapter_info['topics']
            })

    return jsonify({
        'catalogs': ['cpp', 'ros2'],
        'chapters': chapters_list
    })

@app.route('/api/dashboard')
def get_dashboard():
    """Get dashboard data (for React frontend compatibility)"""
    return jsonify({
        'stats': {
            'quizzesCompleted': len(USER_DATA['quiz_history']),
            'averageScore': round(sum(q['score'] for q in USER_DATA['quiz_history'][-20:]) / len(USER_DATA['quiz_history'][-20:]), 1) if USER_DATA['quiz_history'] else 0,
            'studyTime': '0h'
        },
        'weakAreas': [],
        'strongAreas': [],
        'recentQuizzes': USER_DATA['quiz_history'][-10:],
        'currentStreak': USER_DATA['current_streak'],
        'totalTopics': sum(cat['master_index']['statistics']['total_topics'] for cat in CATALOGS.values()),
        'completedTopics': sum(
            sum(sum(1 for t in chapter_topics.values() if t.get('completed', False))
                for chapter_topics in catalog_progress.values())
            for catalog_progress in USER_DATA['progress'].values()
        )
    })

@app.route('/api/learning-paths')
def get_learning_paths_api():
    """Get learning paths (for React frontend compatibility)"""
    return jsonify({
        'paths': []  # Empty for now, can be populated later
    })

@app.route('/api/topics')
def get_all_topics():
    """Get all topics from all chapters (for React frontend compatibility)"""
    all_topics = []

    # Include topics from all available catalogs
    for catalog_name in ['cpp', 'ros2']:
        if catalog_name not in CATALOGS:
            continue

        master_index = CATALOGS[catalog_name]['master_index']

        for chapter_info in master_index['chapters']:
            chapter_num = chapter_info['chapter_number']
            chapter = load_chapter(catalog_name, chapter_num)

            if chapter:
                for idx, topic in enumerate(chapter['topics']):
                    user_progress = USER_DATA['progress'][catalog_name].get(str(chapter_num), {}).get(str(idx), {})

                    all_topics.append({
                        'id': f"{catalog_name}_{chapter_num}_{idx}",
                        'title': topic['topic'],
                        'description': f"{catalog_name.upper()} - Chapter {chapter_num}: {chapter['chapter_name']}",
                        'difficulty': 'medium',  # Could be extracted from metadata
                        'quiz_count': len(topic['interview_qa']),
                        'progress': user_progress.get('score', 0)
                    })

    return jsonify(all_topics)

@app.route('/api/topics/<topic_id>')
def get_topic_by_id(topic_id):
    """Get topic by ID (for React frontend compatibility)"""
    # Parse topic_id format: "cpp_chapter_topic" or "ros2_chapter_topic"
    parts = topic_id.split('_')
    if len(parts) >= 3:
        catalog = parts[0]
        chapter_num = int(parts[1])
        topic_idx = int(parts[2])

        return get_topic_content(catalog, chapter_num, topic_idx)

    return jsonify({'error': 'Invalid topic ID'}), 404

@app.route('/api/topics/<topic_id>/theory')
def get_topic_theory_by_id(topic_id):
    """Get topic theory by ID (for React frontend compatibility)"""
    parts = topic_id.split('_')
    if len(parts) >= 3:
        catalog = parts[0]
        chapter_num = int(parts[1])
        topic_idx = int(parts[2])

        chapter = load_chapter(catalog, chapter_num)
        if not chapter or topic_idx >= len(chapter['topics']):
            return jsonify({'error': 'Topic not found'}), 404

        topic = chapter['topics'][topic_idx]
        # Return just the full_text string for markdown rendering
        theory_text = topic['theory'].get('full_text', '')
        return jsonify({'content': theory_text})

    return jsonify({'error': 'Invalid topic ID'}), 404

@app.route('/api/topics/<topic_id>/examples')
def get_topic_examples_by_id(topic_id):
    """Get topic examples by ID (for React frontend compatibility)"""
    parts = topic_id.split('_')
    if len(parts) >= 3:
        catalog = parts[0]
        chapter_num = int(parts[1])
        topic_idx = int(parts[2])

        chapter = load_chapter(catalog, chapter_num)
        if not chapter or topic_idx >= len(chapter['topics']):
            return jsonify({'error': 'Topic not found'}), 404

        topic = chapter['topics'][topic_idx]
        return jsonify({'examples': topic['code_examples']})

    return jsonify({'error': 'Invalid topic ID'}), 404

# ============================================================
# QUIZ ENDPOINTS
# ============================================================

@app.route('/api/quiz/generate', methods=['POST'])
def generate_quiz():
    """Generate a quiz from interview questions"""
    data = request.json
    topic_id = data.get('topic_id')  # Format: "catalog_chapter_topic"
    difficulty = data.get('difficulty', 'medium')
    count = data.get('count', 10)

    # Parse topic ID
    parts = topic_id.split('_')
    if len(parts) < 3:
        return jsonify({'error': 'Invalid topic ID'}), 400

    catalog = parts[0]
    chapter_num = int(parts[1])
    topic_idx = int(parts[2])

    if catalog not in CATALOGS:
        return jsonify({'error': 'Catalog not found'}), 404

    chapter = load_chapter(catalog, chapter_num)
    if not chapter or topic_idx >= len(chapter['topics']):
        return jsonify({'error': 'Topic not found'}), 404

    topic = chapter['topics'][topic_idx]
    questions_pool = topic.get('interview_qa', [])

    if len(questions_pool) == 0:
        return jsonify({'error': 'No questions available for this topic'}), 404

    # Randomly select questions
    import uuid
    selected_count = min(count, len(questions_pool))
    selected_questions = random.sample(questions_pool, selected_count)

    # Format questions for quiz - generate multiple choice options from answers
    formatted_questions = []
    for idx, q in enumerate(selected_questions):
        correct_answer_text = q.get('answer', 'No answer available')

        # Get wrong answers from other questions
        other_questions = [other_q for other_q in questions_pool if other_q != q]
        wrong_answers = []

        # Collect distinct wrong answers
        for other_q in other_questions:
            other_answer = other_q.get('answer', '')
            if other_answer and other_answer != correct_answer_text and other_answer not in wrong_answers:
                wrong_answers.append(other_answer)
                if len(wrong_answers) >= 3:
                    break

        # If we don't have enough wrong answers, add generic ones
        while len(wrong_answers) < 3:
            generic_answers = [
                "This is not the correct answer",
                "This approach would not work correctly",
                "This is a common misconception"
            ]
            for generic in generic_answers:
                if generic not in wrong_answers:
                    wrong_answers.append(generic)
                    if len(wrong_answers) >= 3:
                        break

        # Shuffle options and track correct answer position
        all_options = wrong_answers[:3] + [correct_answer_text]
        random.shuffle(all_options)
        correct_index = all_options.index(correct_answer_text)

        formatted_questions.append({
            'id': idx,
            'question': q.get('question', ''),
            'code': q.get('code_snippet', ''),
            'options': all_options,
            'correct_answer': correct_index,
            'explanation': q.get('explanation', '')
        })

    quiz_id = str(uuid.uuid4())

    # Store quiz for validation during submission
    ACTIVE_QUIZZES[quiz_id] = {
        'topic_id': topic_id,
        'questions': formatted_questions,
        'created_at': datetime.now()
    }

    # Remove correct answers from response (client shouldn't see them)
    client_questions = []
    for q in formatted_questions:
        client_q = q.copy()
        client_q.pop('correct_answer', None)
        client_q.pop('explanation', None)
        client_questions.append(client_q)

    return jsonify({
        'id': quiz_id,
        'topic_id': topic_id,
        'topic_title': topic['topic'],
        'difficulty': difficulty,
        'questions': client_questions,
        'time_limit': 900  # 15 minutes
    })

@app.route('/api/quiz/submit', methods=['POST'])
def submit_quiz():
    """Submit quiz answers and calculate score"""
    data = request.json
    topic_id = data.get('topic_id')
    quiz_id = data.get('quiz_id')
    answers = data.get('answers', [])
    time_taken = data.get('time_taken', 0)

    # Get stored quiz
    if quiz_id not in ACTIVE_QUIZZES:
        return jsonify({'error': 'Quiz not found or expired'}), 404

    stored_quiz = ACTIVE_QUIZZES[quiz_id]
    questions = stored_quiz['questions']

    # Parse topic ID
    parts = topic_id.split('_')
    if len(parts) < 3:
        return jsonify({'error': 'Invalid topic ID'}), 400

    catalog = parts[0]
    chapter_num = int(parts[1])
    topic_idx = int(parts[2])

    # Calculate score by validating answers
    correct_count = 0
    total_questions = len(questions)

    for answer in answers:
        question_id = answer.get('question_id')
        selected_answer = answer.get('selected_answer')

        if question_id < len(questions) and selected_answer >= 0:
            if questions[question_id]['correct_answer'] == selected_answer:
                correct_count += 1

    score = int((correct_count / total_questions * 100)) if total_questions > 0 else 0
    passed = score >= 70

    # Clean up stored quiz
    del ACTIVE_QUIZZES[quiz_id]

    # Update user progress
    if catalog not in USER_DATA['progress']:
        USER_DATA['progress'][catalog] = {}
    if str(chapter_num) not in USER_DATA['progress'][catalog]:
        USER_DATA['progress'][catalog][str(chapter_num)] = {}
    if str(topic_idx) not in USER_DATA['progress'][catalog][str(chapter_num)]:
        USER_DATA['progress'][catalog][str(chapter_num)][str(topic_idx)] = {
            'completed': False,
            'score': 0,
            'attempts': 0
        }

    topic_progress = USER_DATA['progress'][catalog][str(chapter_num)][str(topic_idx)]
    topic_progress['score'] = max(topic_progress.get('score', 0), score)
    topic_progress['attempts'] = topic_progress.get('attempts', 0) + 1
    if passed:
        topic_progress['completed'] = True

    # Add to quiz history
    USER_DATA['quiz_history'].append({
        'topic_id': topic_id,
        'catalog': catalog,
        'score': score,
        'correct': correct_count,
        'total': total_questions,
        'passed': passed,
        'time_taken': time_taken,
        'date': datetime.now().isoformat()
    })

    save_user_data(USER_DATA)

    return jsonify({
        'score': score,
        'correct': correct_count,
        'total': total_questions,
        'passed': passed,
        'time_taken': time_taken,
        'weak_concepts': [],  # Could be enhanced with analytics
        'recommendations': [
            'Review the theory section' if not passed else 'Great job! Try a harder difficulty',
            'Practice more code examples' if score < 80 else 'Move on to the next topic'
        ]
    })

@app.route('/api/quiz/history', methods=['GET'])
def get_quiz_history_endpoint():
    """Get quiz history"""
    topic_id = request.args.get('topic_id')

    if topic_id:
        history = [q for q in USER_DATA['quiz_history'] if q.get('topic_id') == topic_id]
    else:
        history = USER_DATA['quiz_history']

    return jsonify({'history': history[-20:]})  # Last 20 quizzes

# ============================================================
# RUN SERVER
# ============================================================

if __name__ == '__main__':
    print("="*60)
    print("Learning Platform API v3.0 - Multi-Catalog")
    print("="*60)
    for catalog_name, catalog_data in CATALOGS.items():
        stats = catalog_data['master_index']['statistics']
        print(f"  {catalog_name.upper()}: {stats['total_chapters']} chapters, {stats['total_topics']} topics")
    print(f"Starting server on http://localhost:5000")
    print("="*60)

    app.run(debug=True, host='0.0.0.0', port=5000)
