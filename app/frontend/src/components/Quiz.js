import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Brain,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trophy,
  Target,
  TrendingDown,
  ArrowRight,
  Home,
} from 'lucide-react';
import { generateQuiz, submitQuiz, getTopic } from '../utils/api';
import './Quiz.css';

const Quiz = () => {
  const { topicId } = useParams();
  const navigate = useNavigate();

  // Quiz state
  const [topic, setTopic] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes in seconds
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [results, setResults] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');

  useEffect(() => {
    loadTopic();
  }, [topicId]);

  useEffect(() => {
    if (quizStarted && !quizCompleted) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleSubmitQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [quizStarted, quizCompleted]);

  const loadTopic = async () => {
    try {
      const response = await getTopic(topicId);
      setTopic(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load topic:', err);
      setLoading(false);
    }
  };

  const startQuiz = async () => {
    try {
      setLoading(true);
      const response = await generateQuiz(topicId, difficulty, 10);
      setQuiz(response.data);
      setQuizStarted(true);
      setAnswers({});
      setCurrentQuestion(0);
      setTimeLeft(900);
    } catch (err) {
      console.error('Failed to generate quiz:', err);
      alert('Failed to generate quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionIndex, optionIndex) => {
    setAnswers({
      ...answers,
      [questionIndex]: optionIndex,
    });
  };

  const handleSubmitQuiz = async () => {
    try {
      setLoading(true);

      const formattedAnswers = quiz.questions.map((q, index) => ({
        question_id: q.id || index,
        selected_answer: answers[index] !== undefined ? answers[index] : -1,
      }));

      const response = await submitQuiz({
        topic_id: topicId,
        quiz_id: quiz.id,
        answers: formattedAnswers,
        time_taken: 900 - timeLeft,
      });

      setResults(response.data);
      setQuizCompleted(true);
    } catch (err) {
      console.error('Failed to submit quiz:', err);
      alert('Failed to submit quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const isQuestionAnswered = (index) => answers[index] !== undefined;

  const getAnsweredCount = () => Object.keys(answers).length;

  if (loading && !quiz) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading quiz...</p>
      </div>
    );
  }

  // Quiz Results View
  if (quizCompleted && results) {
    const score = results.score || 0;
    const passed = score >= 70;
    const correct = results.correct || 0;
    const total = results.total || quiz?.questions.length || 10;
    const weakConcepts = results.weak_concepts || [];
    const recommendations = results.recommendations || [];

    return (
      <div className="quiz-results fade-in">
        <div className="results-header">
          <div className={`results-icon ${passed ? 'success' : 'danger'}`}>
            {passed ? <Trophy size={48} /> : <XCircle size={48} />}
          </div>
          <h1>{passed ? 'Congratulations!' : 'Keep Practicing!'}</h1>
          <p className="results-subtitle">
            {passed
              ? 'You passed the quiz! Great job!'
              : 'You need more practice. Keep learning!'}
          </p>
        </div>

        <div className="results-stats">
          <div className="result-stat-card">
            <div className="result-stat-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
              <Target className="text-primary" size={32} />
            </div>
            <h3>{score}%</h3>
            <p>Your Score</p>
          </div>

          <div className="result-stat-card">
            <div className="result-stat-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
              <CheckCircle className="text-success" size={32} />
            </div>
            <h3>{correct}/{total}</h3>
            <p>Correct Answers</p>
          </div>

          <div className="result-stat-card">
            <div className="result-stat-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
              <Clock className="text-warning" size={32} />
            </div>
            <h3>{formatTime(results.time_taken || 0)}</h3>
            <p>Time Taken</p>
          </div>
        </div>

        <div className="results-details">
          {weakConcepts.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>
                  <TrendingDown size={20} className="text-danger" />
                  Areas to Improve
                </h3>
              </div>
              <ul className="weak-concepts-list">
                {weakConcepts.map((concept, index) => (
                  <li key={index}>
                    <AlertCircle size={18} className="text-warning" />
                    {concept}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>
                  <Brain size={20} className="text-primary" />
                  Recommendations
                </h3>
              </div>
              <ul className="recommendations-list">
                {recommendations.map((rec, index) => (
                  <li key={index}>
                    <ArrowRight size={18} className="text-primary" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="results-actions">
          <button
            className="btn btn-outline"
            onClick={() => {
              setQuizCompleted(false);
              setQuizStarted(false);
              setQuiz(null);
            }}
          >
            Try Again
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => navigate(`/topics/${topicId}`)}
          >
            Back to Topic
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/dashboard')}
          >
            <Home size={18} />
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Quiz Start View
  if (!quizStarted) {
    return (
      <div className="quiz-start fade-in">
        <div className="quiz-start-card">
          <div className="quiz-start-icon">
            <Brain size={64} />
          </div>

          <h1>Ready to Test Your Knowledge?</h1>
          <p className="quiz-start-subtitle">
            {topic?.title || 'C++ Quiz'}
          </p>

          <div className="quiz-settings">
            <div className="setting-group">
              <label>Difficulty Level</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="quiz-info-grid">
            <div className="quiz-info-item">
              <Brain size={24} />
              <p>10 Questions</p>
            </div>
            <div className="quiz-info-item">
              <Clock size={24} />
              <p>15 Minutes</p>
            </div>
            <div className="quiz-info-item">
              <CheckCircle size={24} />
              <p>70% to Pass</p>
            </div>
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={startQuiz}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                Generating Quiz...
              </>
            ) : (
              'Start Quiz'
            )}
          </button>

          <button
            className="btn btn-ghost"
            onClick={() => navigate(`/topics/${topicId}`)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Quiz In Progress View
  const question = quiz.questions[currentQuestion];
  const isLastQuestion = currentQuestion === quiz.questions.length - 1;
  const answeredCount = getAnsweredCount();

  return (
    <div className="quiz-container fade-in">
      {/* Quiz Header */}
      <div className="quiz-header">
        <div className="quiz-progress-info">
          <span className="question-counter">
            Question {currentQuestion + 1} of {quiz.questions.length}
          </span>
          <div className="quiz-timer">
            <Clock size={18} />
            <span className={timeLeft < 60 ? 'time-warning' : ''}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        <div className="quiz-progress-bar">
          <div
            className="quiz-progress-fill"
            style={{
              width: `${((currentQuestion + 1) / quiz.questions.length) * 100}%`,
            }}
          ></div>
        </div>
      </div>

      {/* Question Card */}
      <div className="question-card">
        <div className="question-header">
          <h2>Question {currentQuestion + 1}</h2>
          {isQuestionAnswered(currentQuestion) && (
            <span className="badge badge-success">
              <CheckCircle size={14} />
              Answered
            </span>
          )}
        </div>

        <p className="question-text">{question.question}</p>

        {question.code && (
          <pre className="question-code">
            <code className="language-cpp">{question.code}</code>
          </pre>
        )}

        <div className="options-list">
          {question.options.map((option, index) => (
            <button
              key={index}
              className={`option-button ${
                answers[currentQuestion] === index ? 'selected' : ''
              }`}
              onClick={() => handleAnswerSelect(currentQuestion, index)}
            >
              <div className="option-indicator">
                {String.fromCharCode(65 + index)}
              </div>
              <span className="option-text">{option.text || option}</span>
              {answers[currentQuestion] === index && (
                <CheckCircle size={20} className="option-check" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="quiz-navigation">
        <button
          className="btn btn-outline"
          onClick={() => setCurrentQuestion(currentQuestion - 1)}
          disabled={currentQuestion === 0}
        >
          <ChevronLeft size={18} />
          Previous
        </button>

        <div className="answered-status">
          {answeredCount} / {quiz.questions.length} answered
        </div>

        {isLastQuestion ? (
          <button
            className="btn btn-success"
            onClick={handleSubmitQuiz}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                Submitting...
              </>
            ) : (
              <>
                Submit Quiz
                <CheckCircle size={18} />
              </>
            )}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => setCurrentQuestion(currentQuestion + 1)}
          >
            Next
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {/* Question Navigator */}
      <div className="question-navigator">
        <p className="navigator-label">Quick Navigation</p>
        <div className="question-dots">
          {quiz.questions.map((_, index) => (
            <button
              key={index}
              className={`question-dot ${
                index === currentQuestion ? 'active' : ''
              } ${isQuestionAnswered(index) ? 'answered' : ''}`}
              onClick={() => setCurrentQuestion(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Quiz;
