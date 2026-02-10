import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  BookOpen,
  Trophy,
  Target,
  Flame,
  Clock,
  Award,
  ArrowRight,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { getDashboard } from '../utils/api';
import './Dashboard.css';

const Dashboard = ({ user }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await getDashboard();
      setData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <XCircle size={64} className="empty-state-icon" />
        <h3>Oops! Something went wrong</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={loadDashboard}>
          Try Again
        </button>
      </div>
    );
  }

  const {
    stats = {},
    weakAreas = [],
    strongAreas = [],
    recentQuizzes = [],
    currentStreak = 0,
    totalTopics = 17,
    completedTopics = 0,
  } = data || {};

  const overallProgress = totalTopics > 0 ? (completedTopics / totalTopics) * 100 : 0;

  return (
    <div className="dashboard fade-in">
      {/* Welcome Section */}
      <div className="dashboard-header">
        <div>
          <h1>Welcome back, {user?.name || 'Learner'}!</h1>
          <p className="text-gray">Let's continue your C++ mastery journey</p>
        </div>
        <div className="quick-actions">
          <Link to="/topics" className="btn btn-primary">
            <BookOpen size={18} />
            Continue Learning
          </Link>
          <Link to="/quiz/random" className="btn btn-outline">
            <Target size={18} />
            Quick Quiz
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <Trophy className="text-primary" size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Overall Progress</p>
            <h3 className="stat-value">{Math.round(overallProgress)}%</h3>
            <p className="stat-detail">
              {completedTopics} of {totalTopics} topics mastered
            </p>
          </div>
          <div className="progress-bar" style={{ marginTop: '1rem' }}>
            <div
              className="progress-bar-fill"
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <Flame className="text-warning" size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Current Streak</p>
            <h3 className="stat-value">{currentStreak}</h3>
            <p className="stat-detail">
              {currentStreak > 0 ? 'Keep it going!' : 'Start your streak today!'}
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <CheckCircle className="text-success" size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Quizzes Completed</p>
            <h3 className="stat-value">{stats.quizzesCompleted || 0}</h3>
            <p className="stat-detail">
              Avg score: {stats.averageScore || 0}%
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
            <Clock style={{ color: '#8B5CF6' }} size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Study Time</p>
            <h3 className="stat-value">{stats.studyTime || '0h'}</h3>
            <p className="stat-detail">This week</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Weak Areas */}
        <div className="card">
          <div className="card-header">
            <h3>
              <TrendingDown size={20} className="text-danger" />
              Needs Improvement
            </h3>
            <span className="badge badge-danger">{weakAreas.length}</span>
          </div>
          <div className="areas-list">
            {weakAreas.length > 0 ? (
              weakAreas.slice(0, 5).map((area, index) => (
                <Link
                  key={index}
                  to={`/topics/${area.id}`}
                  className="area-item weak"
                >
                  <div className="area-info">
                    <h4>{area.title || area.name}</h4>
                    <p>Score: {area.score}%</p>
                  </div>
                  <div className="area-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${area.score}%`,
                          background: 'var(--danger)',
                        }}
                      ></div>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-gray" />
                </Link>
              ))
            ) : (
              <div className="empty-state-small">
                <CheckCircle size={32} className="text-success" />
                <p>Great job! No weak areas identified.</p>
              </div>
            )}
          </div>
        </div>

        {/* Strong Areas */}
        <div className="card">
          <div className="card-header">
            <h3>
              <TrendingUp size={20} className="text-success" />
              Mastered Topics
            </h3>
            <span className="badge badge-success">{strongAreas.length}</span>
          </div>
          <div className="areas-list">
            {strongAreas.length > 0 ? (
              strongAreas.slice(0, 5).map((area, index) => (
                <Link
                  key={index}
                  to={`/topics/${area.id}`}
                  className="area-item strong"
                >
                  <div className="area-info">
                    <h4>{area.title || area.name}</h4>
                    <p>Score: {area.score}%</p>
                  </div>
                  <div className="area-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${area.score}%`,
                          background: 'var(--success)',
                        }}
                      ></div>
                    </div>
                  </div>
                  <Award size={18} className="text-success" />
                </Link>
              ))
            ) : (
              <div className="empty-state-small">
                <Target size={32} className="text-gray" />
                <p>Complete quizzes to identify your strengths!</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Quiz History */}
        <div className="card full-width">
          <div className="card-header">
            <h3>
              <Clock size={20} className="text-primary" />
              Recent Quiz Activity
            </h3>
          </div>
          <div className="quiz-history">
            {recentQuizzes.length > 0 ? (
              <div className="quiz-table">
                {recentQuizzes.map((quiz, index) => (
                  <div key={index} className="quiz-row">
                    <div className="quiz-topic">
                      <h4>{quiz.topic}</h4>
                      <p className="text-sm text-gray">
                        {new Date(quiz.date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="quiz-stats">
                      <span className="quiz-score">
                        {quiz.score}%
                      </span>
                      <span
                        className={`badge ${
                          quiz.passed ? 'badge-success' : 'badge-danger'
                        }`}
                      >
                        {quiz.passed ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    <div className="quiz-details">
                      <span className="text-sm text-gray">
                        {quiz.correct}/{quiz.total} correct
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-small">
                <Target size={32} className="text-gray" />
                <p>No quiz history yet. Take your first quiz to get started!</p>
                <Link to="/topics" className="btn btn-primary btn-sm">
                  <BookOpen size={16} />
                  Browse Topics
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
