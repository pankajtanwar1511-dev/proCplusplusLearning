import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Trophy,
  Target,
  Flame,
  Clock,
  ArrowRight,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Code2,
  Radio,
} from 'lucide-react';
import './Dashboard.css';

const CatalogDashboard = ({ user }) => {
  const { catalog } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catalogInfo, setCatalogInfo] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

      // Load catalog info
      const catalogsResponse = await fetch(`${API_URL}/api/catalogs`);
      const catalogsData = await catalogsResponse.json();
      const currentCatalog = catalogsData.catalogs.find(c => c.name === catalog);
      setCatalogInfo(currentCatalog);

      // Load catalog-specific stats
      const statsResponse = await fetch(`${API_URL}/api/${catalog}/stats`);
      const statsData = await statsResponse.json();

      // Load chapters
      const chaptersResponse = await fetch(`${API_URL}/api/${catalog}/chapters`);
      const chaptersData = await chaptersResponse.json();

      // Load all topics
      const topicsResponse = await fetch(`${API_URL}/api/topics`);
      const topicsData = await topicsResponse.json();

      // Filter topics for this catalog and group by chapter
      const catalogTopics = topicsData.filter(t => t.id.startsWith(`${catalog}_`));

      // Group topics by chapter number
      const topicsByChapter = {};
      catalogTopics.forEach(topic => {
        const parts = topic.id.split('_');
        const chapterNum = parseInt(parts[1]);
        if (!topicsByChapter[chapterNum]) {
          topicsByChapter[chapterNum] = [];
        }
        topicsByChapter[chapterNum].push(topic);
      });

      // Load quiz history
      const historyResponse = await fetch(`${API_URL}/api/quiz/history`);
      const historyData = await historyResponse.json();

      // Filter quizzes for this catalog
      const catalogQuizzes = historyData.history.filter(q => q.catalog === catalog);

      setData({
        stats: statsData,
        chapters: chaptersData.chapters,
        topicsByChapter: topicsByChapter,
        recentQuizzes: catalogQuizzes.slice(-10),
        weakAreas: [],
        strongAreas: [],
      });
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [catalog]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const getCatalogTitle = () => {
    if (catalog === 'cpp') return 'C++ Programming';
    if (catalog === 'ros2') return 'ROS 2 Robotics';
    return catalog.toUpperCase();
  };

  const getCatalogIcon = () => {
    if (catalog === 'cpp') return Code2;
    if (catalog === 'ros2') return Radio;
    return BookOpen;
  };

  const getCatalogColor = () => {
    if (catalog === 'cpp') return '#3b82f6';
    if (catalog === 'ros2') return '#10b981';
    return '#8b5cf6';
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
    chapters = [],
    topicsByChapter = {},
    recentQuizzes = [],
  } = data || {};

  const CatalogIcon = getCatalogIcon();
  const catalogColor = getCatalogColor();
  const completedTopics = stats.completed_topics || 0;
  const totalTopics = stats.total_topics || 0;
  const overallProgress = stats.completion_percent || 0;

  return (
    <div className="dashboard fade-in">
      {/* Back Button */}
      <button
        className="back-button"
        onClick={() => navigate('/')}
        style={{ marginBottom: '1rem' }}
      >
        <ArrowLeft size={18} />
        Back to Catalogs
      </button>

      {/* Welcome Section */}
      <div className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              padding: '1rem',
              borderRadius: '1rem',
              backgroundColor: `${catalogColor}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CatalogIcon size={32} style={{ color: catalogColor }} />
          </div>
          <div>
            <h1>{getCatalogTitle()} Dashboard</h1>
            <p className="text-gray">Master {getCatalogTitle()} step by step</p>
          </div>
        </div>
        <div className="quick-actions">
          <Link to={`/catalog/${catalog}/chapters`} className="btn btn-primary">
            <BookOpen size={18} />
            Browse Chapters
          </Link>
          <Link to={`/catalog/${catalog}/topics`} className="btn btn-outline">
            <Target size={18} />
            All Topics
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: `${catalogColor}15` }}>
            <Trophy style={{ color: catalogColor }} size={24} />
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
              style={{ width: `${overallProgress}%`, backgroundColor: catalogColor }}
            ></div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <Flame className="text-warning" size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Current Streak</p>
            <h3 className="stat-value">{user?.streak || 0}</h3>
            <p className="stat-detail">
              {user?.streak > 0 ? 'Keep it going!' : 'Start your streak today!'}
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <CheckCircle className="text-success" size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Quizzes Completed</p>
            <h3 className="stat-value">{stats.total_quizzes || 0}</h3>
            <p className="stat-detail">
              Avg score: {stats.average_score || 0}%
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
            <BookOpen style={{ color: '#8B5CF6' }} size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Chapters</p>
            <h3 className="stat-value">{catalogInfo?.total_chapters || 0}</h3>
            <p className="stat-detail">Available to learn</p>
          </div>
        </div>
      </div>

      {/* Chapters Progress */}
      <div className="dashboard-grid">
        <div className="card full-width">
          <div className="card-header">
            <h3>
              <BookOpen size={20} className="text-primary" />
              Chapters Progress
            </h3>
          </div>
          <div className="chapters-progress" style={{ padding: '1rem' }}>
            {chapters.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {chapters.map((chapter) => {
                  const chapterTopics = topicsByChapter[chapter.number] || [];

                  return (
                    <div key={chapter.number} style={{
                      border: '2px solid var(--border)',
                      borderRadius: '0.75rem',
                      padding: '1rem',
                      background: `linear-gradient(135deg, ${catalogColor}08 0%, ${catalogColor}03 100%)`,
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                    }}>
                      {/* Chapter Header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.75rem',
                        paddingBottom: '0.75rem',
                        borderBottom: '1.5px solid var(--border)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '0.5rem',
                            backgroundColor: `${catalogColor}15`,
                            color: catalogColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                            fontWeight: '700',
                            border: `1px solid ${catalogColor}30`
                          }}>
                            {chapter.number}
                          </div>
                          <div>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text)' }}>
                              {chapter.name}
                            </h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                              {chapter.completed_topics} / {chapter.total_topics} topics • {Math.round(chapter.progress_percent)}%
                            </p>
                          </div>
                        </div>
                        <Link
                          to={`/catalog/${catalog}/chapter/${chapter.number}`}
                          style={{
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.375rem',
                            backgroundColor: `${catalogColor}15`,
                            color: catalogColor,
                            textDecoration: 'none',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            transition: 'all 0.2s',
                            border: `1px solid ${catalogColor}30`
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = catalogColor;
                            e.currentTarget.style.color = 'white';
                            e.currentTarget.style.borderColor = catalogColor;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = `${catalogColor}15`;
                            e.currentTarget.style.color = catalogColor;
                            e.currentTarget.style.borderColor = `${catalogColor}30`;
                          }}
                        >
                          View
                          <ArrowRight size={14} />
                        </Link>
                      </div>

                      {/* Chapter Total Progress Bar */}
                      <div style={{
                        marginTop: '0.75rem',
                        padding: '0.75rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.5)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border)'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.5rem'
                        }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text)' }}>
                            Chapter Progress
                          </span>
                          <span style={{
                            fontSize: '0.875rem',
                            fontWeight: '700',
                            color: chapter.progress_percent >= 80 ? 'var(--success)' :
                                   chapter.progress_percent >= 60 ? 'var(--warning)' :
                                   chapter.progress_percent > 0 ? catalogColor : 'var(--text-secondary)'
                          }}>
                            {Math.round(chapter.progress_percent)}%
                          </span>
                        </div>
                        <div style={{
                          width: '100%',
                          height: '6px',
                          backgroundColor: 'var(--border)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${chapter.progress_percent}%`,
                            height: '100%',
                            background: chapter.progress_percent >= 80 ? 'var(--success)' :
                                       chapter.progress_percent >= 60 ? 'var(--warning)' :
                                       chapter.progress_percent > 0 ? `linear-gradient(90deg, ${catalogColor} 0%, ${catalogColor}cc 100%)` : 'var(--gray)',
                            transition: 'width 0.5s ease'
                          }}></div>
                        </div>
                      </div>

                      {/* Topic Cards Grid */}
                      {chapterTopics.length > 0 && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: '0.75rem',
                          marginTop: '0.75rem'
                        }}>
                          {chapterTopics.map((topic) => (
                            <Link
                              key={topic.id}
                              to={`/catalog/${catalog}/topic/${topic.id}`}
                              style={{
                                display: 'block',
                                padding: '0.75rem',
                                border: `1.5px solid ${catalogColor}30`,
                                borderRadius: '0.5rem',
                                background: `linear-gradient(135deg, ${catalogColor}08 0%, ${catalogColor}03 50%, #ffffff 100%)`,
                                textDecoration: 'none',
                                transition: 'all 0.2s',
                                boxShadow: `0 1px 3px ${catalogColor}10`
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = `${catalogColor}60`;
                                e.currentTarget.style.borderWidth = '2px';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = `0 4px 8px ${catalogColor}20`;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = `${catalogColor}30`;
                                e.currentTarget.style.borderWidth = '1.5px';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = `0 1px 3px ${catalogColor}10`;
                              }}
                            >
                              <div style={{
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--text)',
                                marginBottom: '0.5rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                minHeight: '2rem',
                                lineHeight: '1rem'
                              }}>
                                {topic.title}
                              </div>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                alignItems: 'center',
                                marginBottom: '0.375rem'
                              }}>
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: '700',
                                  color: topic.progress >= 80 ? '#10b981' :
                                         topic.progress >= 60 ? '#f59e0b' :
                                         topic.progress > 0 ? catalogColor : '#9ca3af'
                                }}>
                                  {topic.progress}%
                                </span>
                              </div>
                              <div style={{
                                width: '100%',
                                height: '4px',
                                backgroundColor: `${catalogColor}15`,
                                borderRadius: '2px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${topic.progress}%`,
                                  height: '100%',
                                  background: topic.progress >= 80 ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)' :
                                             topic.progress >= 60 ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)' :
                                             topic.progress > 0 ? `linear-gradient(90deg, ${catalogColor} 0%, ${catalogColor}cc 100%)` : '#d1d5db',
                                  transition: 'width 0.3s ease'
                                }}></div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state-small">
                <BookOpen size={32} className="text-gray" />
                <p>No chapters available yet.</p>
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
                      <h4>Quiz #{recentQuizzes.length - index}</h4>
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
                <Link to={`/catalog/${catalog}/chapters`} className="btn btn-primary btn-sm">
                  <BookOpen size={16} />
                  Start Learning
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogDashboard;
