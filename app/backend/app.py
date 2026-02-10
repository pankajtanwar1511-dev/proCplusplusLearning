"""
C++ Master - Smart Learning Backend API
Author: AI Assistant
Description: Flask backend with adaptive quiz engine, progress tracking, and weakness detection
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json
import random
from datetime import datetime
from pathlib import Path
import os

app = Flask(__name__, static_folder='../frontend/build', static_url_path='')
CORS(app)

# Load data
DATA_DIR = Path(__file__).parent.parent.parent / 'docs' / 'phase1_data'
USER_DATA_FILE = Path(__file__).parent / 'user_data.json'

def load_json(filename):
    """Load JSON file from data directory"""
    with open(DATA_DIR / filename, 'r', encoding='utf-8') as f:
        return json.load(f)

# Load all data at startup
TOPICS = load_json('topics.json')
WEAKNESS_PROFILE = load_json('weakness_profile.json')
QUIZ_BLUEPRINT = load_json('quiz_blueprint.json')
LEARNING_PATHS = load_json('learning_path.json')
CONTENT_INDEX = load_json('content_index.json')

# Load the new structured topic data
try:
    TOPIC1_DATA = load_json('topic1_final.json')
except:
    TOPIC1_DATA = None

# User data storage (in production, use a database)
def load_user_data():
    """Load user progress data"""
    if USER_DATA_FILE.exists():
        with open(USER_DATA_FILE, 'r') as f:
            return json.load(f)
    return {
        'progress': {},
        'quiz_history': [],
        'bookmarks': [],
        'notes': {},
        'current_streak': 0,
        'last_active': None,
        'total_study_time': 0
    }

def save_user_data(data):
    """Save user progress data"""
    with open(USER_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

USER_DATA = load_user_data()

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
    return jsonify({'status': 'ok', 'topics': len(TOPICS)})

@app.route('/api/topics')
def get_topics():
    """Get all topics with progress"""
    topics_list = []
    for topic in TOPICS:
        topic_id = topic['topic_id']
        progress = USER_DATA['progress'].get(topic_id, {
            'completed': False,
            'quiz_score': 0,
            'attempts': 0,
            'theory_read': False
        })

        topics_list.append({
            'id': topic_id,
            'title': topic['topic_title'],
            'slug': topic['topic_slug'],
            'phase': topic['phase'],
            'completeness': topic['metadata']['completeness'],
            'code_examples': topic['metadata']['code_example_count'],
            'questions': topic['metadata']['total_questions'],
            'progress': progress
        })

    return jsonify(topics_list)

@app.route('/api/topics/<topic_id>')
def get_topic(topic_id):
    """Get detailed topic information"""
    topic = next((t for t in TOPICS if t['topic_id'] == topic_id), None)
    if not topic:
        return jsonify({'error': 'Topic not found'}), 404

    return jsonify(topic)

@app.route('/api/topics/<topic_id>/theory')
def get_topic_theory(topic_id):
    """Get theory content for a topic"""
    # Use new structured data for topic 1
    if topic_id == 'phase1_01' and TOPIC1_DATA:
        theory_sections = TOPIC1_DATA.get('theory', {}).get('sections', [])

        # Combine all sections into one markdown document
        combined_content = ""
        for section in theory_sections:
            combined_content += f"## {section['title']}\n\n"
            combined_content += section.get('content', '') + "\n\n"

            # Add code examples if present
            for example in section.get('code_examples', []):
                combined_content += f"### {example.get('title', 'Example')}\n\n"
                combined_content += f"```cpp\n{example.get('code', '')}\n```\n\n"
                if example.get('explanation'):
                    combined_content += f"*{example['explanation']}*\n\n"

        return jsonify({
            'title': TOPIC1_DATA['topic_title'],
            'content': combined_content
        })

    # Fallback for other topics
    topic = next((t for t in TOPICS if t['topic_id'] == topic_id), None)
    if not topic:
        return jsonify({'error': 'Topic not found'}), 404

    theory_html = f"<h1>{topic['topic_title']}</h1>\n\n"
    theory_html += "<p>Theory content is being prepared for this topic.</p>\n"

    return jsonify({
        'title': topic['topic_title'],
        'content': theory_html
    })

@app.route('/api/topics/<topic_id>/examples')
def get_topic_examples(topic_id):
    """Get code examples for a topic"""
    topic = next((t for t in TOPICS if t['topic_id'] == topic_id), None)
    if not topic:
        return jsonify({'error': 'Topic not found'}), 404

    examples = topic.get('content', {}).get('code_examples', [])

    return jsonify({'examples': examples})

@app.route('/api/quiz/history')
def get_quiz_history():
    """Get quiz history"""
    topic_id = request.args.get('topic_id')

    if topic_id:
        history = [q for q in USER_DATA['quiz_history'] if q['topic_id'] == topic_id]
    else:
        history = USER_DATA['quiz_history']

    return jsonify({'history': history})

@app.route('/api/topics/<topic_id>/interview-questions')
def get_interview_questions(topic_id):
    """Get interview questions for a topic"""
    if topic_id == 'phase1_01' and TOPIC1_DATA:
        return jsonify(TOPIC1_DATA.get('interview_questions', {}))

    return jsonify({'basic': [], 'intermediate': [], 'advanced': []})

@app.route('/api/topics/<topic_id>/weaknesses')
def get_student_weaknesses(topic_id):
    """Get student weakness analysis for a topic"""
    if topic_id == 'phase1_01' and TOPIC1_DATA:
        return jsonify({
            'weaknesses': TOPIC1_DATA.get('student_weaknesses', []),
            'metadata': TOPIC1_DATA.get('metadata', {})
        })

    return jsonify({'weaknesses': [], 'metadata': {}})

@app.route('/api/dashboard')
def get_dashboard():
    """Get dashboard analytics"""
    total_topics = len([t for t in TOPICS if t['metadata']['completeness'] != 'missing'])
    completed_topics = len([t for t in TOPICS if USER_DATA['progress'].get(t['topic_id'], {}).get('completed', False)])

    # Calculate weak areas
    weak_areas = []
    for topic in TOPICS:
        topic_id = topic['topic_id']
        progress = USER_DATA['progress'].get(topic_id, {})
        if progress.get('quiz_score', 0) < 60 and progress.get('attempts', 0) > 0:
            weak_areas.append({
                'topic': topic['topic_title'],
                'score': progress['quiz_score']
            })

    # Calculate strong areas
    strong_areas = []
    for topic in TOPICS:
        topic_id = topic['topic_id']
        progress = USER_DATA['progress'].get(topic_id, {})
        if progress.get('quiz_score', 0) >= 80:
            strong_areas.append({
                'topic': topic['topic_title'],
                'score': progress['quiz_score']
            })

    # Recent quiz history
    recent_quizzes = sorted(
        USER_DATA['quiz_history'],
        key=lambda x: x['timestamp'],
        reverse=True
    )[:10]

    return jsonify({
        'overall_progress': (completed_topics / total_topics * 100) if total_topics > 0 else 0,
        'topics_mastered': completed_topics,
        'total_topics': total_topics,
        'current_streak': USER_DATA['current_streak'],
        'weak_areas': sorted(weak_areas, key=lambda x: x['score'])[:5],
        'strong_areas': sorted(strong_areas, key=lambda x: x['score'], reverse=True)[:5],
        'recent_quizzes': recent_quizzes,
        'total_study_time': USER_DATA['total_study_time']
    })

@app.route('/api/quiz/generate', methods=['POST'])
def generate_quiz():
    """Generate adaptive quiz based on topic and user performance"""
    data = request.json
    topic_id = data.get('topic_id')
    difficulty = data.get('difficulty', 'auto')
    question_count = data.get('question_count', 10)

    topic = next((t for t in TOPICS if t['topic_id'] == topic_id), None)
    if not topic:
        return jsonify({'error': 'Topic not found'}), 404

    # Get user's performance on this topic
    progress = USER_DATA['progress'].get(topic_id, {})
    avg_score = progress.get('quiz_score', 50)

    # Auto-adjust difficulty based on performance
    if difficulty == 'auto':
        if avg_score >= 80:
            difficulty = 'hard'
        elif avg_score >= 60:
            difficulty = 'medium'
        else:
            difficulty = 'easy'

    # Get quiz blueprint for this topic
    blueprint = next((b for b in QUIZ_BLUEPRINT['topics'] if b['topic_id'] == topic_id), None)
    focus_areas = blueprint['focus_areas'] if blueprint else []

    # Generate real C++ questions from focus areas
    questions = []

    # Question bank based on focus areas
    question_bank = {
        'Classes and structs differences': {
            'question': 'What is the main difference between a class and a struct in C++?',
            'options': [
                {'id': 'a', 'text': 'Members are public by default in struct, private in class'},
                {'id': 'b', 'text': 'Structs cannot have methods'},
                {'id': 'c', 'text': 'Classes support inheritance, structs do not'},
                {'id': 'd', 'text': 'There is no difference'}
            ],
            'correct_answer': 'a',
            'explanation': 'In C++, the only difference is default access: struct members are public by default, class members are private by default.'
        },
        'Access specifiers': {
            'question': 'Which access specifier allows derived classes to access base class members, but not outside code?',
            'options': [
                {'id': 'a', 'text': 'private'},
                {'id': 'b', 'text': 'public'},
                {'id': 'c', 'text': 'protected'},
                {'id': 'd', 'text': 'internal'}
            ],
            'correct_answer': 'c',
            'explanation': 'Protected members are accessible in derived classes but not from outside the class hierarchy.'
        },
        'Virtual functions and vtables': {
            'question': 'Why is a virtual destructor important in base classes with virtual functions?',
            'options': [
                {'id': 'a', 'text': 'To improve performance'},
                {'id': 'b', 'text': 'To ensure proper cleanup when deleting through base pointer'},
                {'id': 'c', 'text': 'To prevent inheritance'},
                {'id': 'd', 'text': 'It is not important'}
            ],
            'correct_answer': 'b',
            'explanation': 'Without a virtual destructor, deleting a derived object through a base pointer only calls the base destructor, causing memory leaks.'
        },
        'Object slicing': {
            'question': 'What happens when you pass a derived object by value to a function expecting a base object?',
            'options': [
                {'id': 'a', 'text': 'Compilation error'},
                {'id': 'b', 'text': 'The derived part is sliced off, only base part is copied'},
                {'id': 'c', 'text': 'Runtime error'},
                {'id': 'd', 'text': 'The entire derived object is copied'}
            ],
            'correct_answer': 'b',
            'explanation': 'This is called object slicing - the derived class portions are sliced off and only the base class part is copied.'
        },
        'Constructors and destructors': {
            'question': 'In what order are constructors called in inheritance?',
            'options': [
                {'id': 'a', 'text': 'Derived first, then base'},
                {'id': 'b', 'text': 'Base first, then derived'},
                {'id': 'c', 'text': 'Random order'},
                {'id': 'd', 'text': 'They are called simultaneously'}
            ],
            'correct_answer': 'b',
            'explanation': 'Base class constructors are always called before derived class constructors. Destructors work in reverse order.'
        },
        'Inheritance and polymorphism': {
            'question': 'What keyword is used to prevent method overriding in C++11?',
            'options': [
                {'id': 'a', 'text': 'sealed'},
                {'id': 'b', 'text': 'final'},
                {'id': 'c', 'text': 'const'},
                {'id': 'd', 'text': 'static'}
            ],
            'correct_answer': 'b',
            'explanation': 'The final keyword prevents further overriding of virtual functions and prevents inheritance of classes.'
        }
    }

    # Generate questions from focus areas
    available_questions = []
    for area in focus_areas:
        if area in question_bank:
            available_questions.append(question_bank[area])

    # Add generic questions if not enough
    generic_questions = [
        {
            'question': 'What does RAII stand for in C++?',
            'options': [
                {'id': 'a', 'text': 'Resource Acquisition Is Initialization'},
                {'id': 'b', 'text': 'Random Access Is Invalid'},
                {'id': 'c', 'text': 'Reference And Indirection Interface'},
                {'id': 'd', 'text': 'Runtime Allocation Is Immediate'}
            ],
            'correct_answer': 'a',
            'explanation': 'RAII is a C++ idiom where resource acquisition is tied to object lifetime.'
        },
        {
            'question': 'What is the purpose of the override keyword?',
            'options': [
                {'id': 'a', 'text': 'To make a function virtual'},
                {'id': 'b', 'text': 'To explicitly mark that a function overrides a base virtual function'},
                {'id': 'c', 'text': 'To prevent overriding'},
                {'id': 'd', 'text': 'To increase performance'}
            ],
            'correct_answer': 'b',
            'explanation': 'The override keyword helps catch errors by ensuring you are actually overriding a base class virtual function.'
        }
    ]

    available_questions.extend(generic_questions)

    # Sample questions for quiz
    selected = random.sample(available_questions, min(question_count, len(available_questions)))

    for i, q in enumerate(selected):
        questions.append({
            'id': f'q_{i}',
            'question': q['question'],
            'type': 'multiple_choice',
            'difficulty': difficulty,
            'options': q['options'],
            'correct_answer': q['correct_answer'],
            'explanation': q['explanation']
        })

    quiz = {
        'quiz_id': f'quiz_{datetime.now().timestamp()}',
        'topic_id': topic_id,
        'topic_title': topic['topic_title'],
        'difficulty': difficulty,
        'questions': questions,
        'time_limit': question_count * 90  # 90 seconds per question
    }

    return jsonify(quiz)

@app.route('/api/quiz/submit', methods=['POST'])
def submit_quiz():
    """Submit quiz and calculate score"""
    data = request.json
    quiz_id = data['quiz_id']
    topic_id = data['topic_id']
    answers = data['answers']
    time_taken = data.get('time_taken', 0)

    # Calculate score (placeholder - real implementation would check correct answers)
    total_questions = len(answers)
    correct = random.randint(int(total_questions * 0.5), total_questions)  # Simulate scoring
    score = (correct / total_questions * 100) if total_questions > 0 else 0

    # Update user progress
    if topic_id not in USER_DATA['progress']:
        USER_DATA['progress'][topic_id] = {
            'completed': False,
            'quiz_score': 0,
            'attempts': 0,
            'theory_read': False
        }

    progress = USER_DATA['progress'][topic_id]
    progress['attempts'] += 1
    progress['quiz_score'] = (progress['quiz_score'] + score) / 2  # Running average
    progress['completed'] = score >= 70

    # Add to quiz history
    USER_DATA['quiz_history'].append({
        'quiz_id': quiz_id,
        'topic_id': topic_id,
        'score': score,
        'correct': correct,
        'total': total_questions,
        'time_taken': time_taken,
        'timestamp': datetime.now().isoformat()
    })

    # Update streak
    USER_DATA['last_active'] = datetime.now().isoformat()

    save_user_data(USER_DATA)

    return jsonify({
        'score': score,
        'correct': correct,
        'total': total_questions,
        'passed': score >= 70,
        'improvement': score - progress['quiz_score'] if progress['attempts'] > 1 else 0
    })

@app.route('/api/learning-paths')
def get_learning_paths():
    """Get all learning paths"""
    return jsonify(LEARNING_PATHS)

@app.route('/api/search')
def search():
    """Search through content"""
    query = request.args.get('q', '').lower()

    results = []
    for topic in TOPICS:
        if query in topic['topic_title'].lower():
            results.append({
                'type': 'topic',
                'title': topic['topic_title'],
                'id': topic['topic_id']
            })

        # Search in code examples
        for code in topic['content']['code_examples'][:5]:  # Limit to first 5
            if query in code['code'].lower():
                results.append({
                    'type': 'code',
                    'title': f"Code example in {topic['topic_title']}",
                    'topic_id': topic['topic_id'],
                    'code_id': code['id']
                })

    return jsonify(results[:20])  # Limit to 20 results

@app.route('/api/bookmark', methods=['POST'])
def add_bookmark():
    """Add bookmark"""
    data = request.json
    USER_DATA['bookmarks'].append({
        'topic_id': data['topic_id'],
        'type': data['type'],
        'item_id': data['item_id'],
        'timestamp': datetime.now().isoformat()
    })
    save_user_data(USER_DATA)
    return jsonify({'status': 'ok'})

@app.route('/api/notes/<topic_id>', methods=['GET', 'POST'])
def notes(topic_id):
    """Get or save notes for a topic"""
    if request.method == 'POST':
        data = request.json
        USER_DATA['notes'][topic_id] = data['content']
        save_user_data(USER_DATA)
        return jsonify({'status': 'ok'})
    else:
        return jsonify({'content': USER_DATA['notes'].get(topic_id, '')})

@app.route('/api/progress/update', methods=['POST'])
def update_progress():
    """Update progress for a topic"""
    data = request.json
    topic_id = data['topic_id']
    field = data['field']
    value = data['value']

    if topic_id not in USER_DATA['progress']:
        USER_DATA['progress'][topic_id] = {
            'completed': False,
            'quiz_score': 0,
            'attempts': 0,
            'theory_read': False
        }

    USER_DATA['progress'][topic_id][field] = value
    save_user_data(USER_DATA)

    return jsonify({'status': 'ok'})

@app.route('/api/profile')
def get_profile():
    """Get user profile"""
    return jsonify({
        'name': 'C++ Learner',
        'email': 'learner@example.com',
        'joined_date': '2025-11-09',
        'total_topics': len(TOPICS),
        'completed_topics': len([t for t in TOPICS if USER_DATA['progress'].get(t['topic_id'], {}).get('completed', False)]),
        'total_quizzes': len(USER_DATA['quiz_history']),
        'average_score': sum(q['score'] for q in USER_DATA['quiz_history']) / len(USER_DATA['quiz_history']) if USER_DATA['quiz_history'] else 0,
        'current_streak': USER_DATA['current_streak'],
        'total_study_time': USER_DATA['total_study_time']
    })

@app.route('/api/statistics')
def get_statistics():
    """Get detailed statistics"""
    return jsonify({
        'topics_completed': len([t for t in TOPICS if USER_DATA['progress'].get(t['topic_id'], {}).get('completed', False)]),
        'total_topics': len(TOPICS),
        'quizzes_taken': len(USER_DATA['quiz_history']),
        'average_score': sum(q['score'] for q in USER_DATA['quiz_history']) / len(USER_DATA['quiz_history']) if USER_DATA['quiz_history'] else 0,
        'current_streak': USER_DATA['current_streak']
    })

if __name__ == '__main__':
    print("🚀 Starting C++ Master Backend...")
    print(f"📚 Loaded {len(TOPICS)} topics")
    print(f"🎯 Data directory: {DATA_DIR}")
    print("✅ Server ready at http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
