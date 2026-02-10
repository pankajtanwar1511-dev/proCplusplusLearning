import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Grid,
  List,
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle,
  Circle,
  Clock,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { getTopics } from '../utils/api';
import './TopicsList.css';

const TopicsList = () => {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'completed', 'in-progress', 'not-started'
  const [sortBy, setSortBy] = useState('title'); // 'title', 'progress', 'difficulty'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      setLoading(true);
      const response = await getTopics();
      setTopics(response.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load topics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (progress) => {
    if (progress >= 80) return 'success';
    if (progress >= 60) return 'warning';
    if (progress > 0) return 'primary';
    return 'gray';
  };

  const getStatusText = (progress) => {
    if (progress >= 80) return 'Mastered';
    if (progress >= 60) return 'In Progress';
    if (progress > 0) return 'Started';
    return 'Not Started';
  };

  const getStatusIcon = (progress) => {
    if (progress >= 80) return <CheckCircle size={20} />;
    if (progress > 0) return <Clock size={20} />;
    return <Circle size={20} />;
  };

  const filteredTopics = topics
    .filter((topic) => {
      // Filter by status
      const progress = typeof topic.progress === 'object'
        ? (topic.progress?.quiz_score || 0)
        : (topic.progress || 0);
      if (filterStatus === 'completed' && progress < 80) return false;
      if (filterStatus === 'in-progress' && (progress === 0 || progress >= 80)) return false;
      if (filterStatus === 'not-started' && progress > 0) return false;

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          topic.title?.toLowerCase().includes(query) ||
          topic.description?.toLowerCase().includes(query)
        );
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'progress') {
        return (b.progress || 0) - (a.progress || 0);
      }
      if (sortBy === 'difficulty') {
        const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
        return (difficultyOrder[a.difficulty] || 2) - (difficultyOrder[b.difficulty] || 2);
      }
      return 0;
    });

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading topics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <BookOpen size={64} className="empty-state-icon" />
        <h3>Failed to Load Topics</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={loadTopics}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="topics-list fade-in">
      <div className="topics-header">
        <div>
          <h1>C++ Topics</h1>
          <p className="text-gray">
            {topics.length} topics available to master
          </p>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="topics-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-controls">
          <div className="filter-group">
            <Filter size={18} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Topics</option>
              <option value="not-started">Not Started</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="filter-group">
            <ArrowUpDown size={18} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="title">Sort by Title</option>
              <option value="progress">Sort by Progress</option>
              <option value="difficulty">Sort by Difficulty</option>
            </select>
          </div>

          <div className="view-toggle">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={18} />
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Topics Grid/List */}
      {filteredTopics.length > 0 ? (
        <div className={`topics-container ${viewMode}`}>
          {filteredTopics.map((topic) => {
            const progress = typeof topic.progress === 'object'
              ? (topic.progress?.quiz_score || 0)
              : (topic.progress || 0);
            const statusColor = getStatusColor(progress);

            return (
              <Link
                key={topic.id}
                to={`/topics/${topic.id}`}
                className="topic-card"
              >
                <div className="topic-card-header">
                  <div className={`topic-status ${statusColor}`}>
                    {getStatusIcon(progress)}
                  </div>
                  <span className={`badge badge-${statusColor}`}>
                    {getStatusText(progress)}
                  </span>
                </div>

                <h3 className="topic-title">{topic.title || 'Untitled Topic'}</h3>
                <p className="topic-description">
                  {topic.description || 'No description available'}
                </p>

                <div className="topic-meta">
                  <span className="difficulty">
                    <span
                      className={`difficulty-badge ${topic.difficulty || 'medium'}`}
                    >
                      {topic.difficulty || 'Medium'}
                    </span>
                  </span>
                  {topic.quiz_count && (
                    <span className="quiz-count">
                      {topic.quiz_count} questions
                    </span>
                  )}
                </div>

                <div className="topic-progress">
                  <div className="progress-label">
                    <span>Progress</span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${progress}%`,
                        background:
                          statusColor === 'success'
                            ? 'var(--success)'
                            : statusColor === 'warning'
                            ? 'var(--warning)'
                            : statusColor === 'primary'
                            ? 'var(--primary)'
                            : 'var(--gray)',
                      }}
                    ></div>
                  </div>
                </div>

                <div className="topic-footer">
                  <span className="learn-more">
                    Learn more
                    <ArrowRight size={16} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={64} className="empty-state-icon" />
          <h3>No Topics Found</h3>
          <p>Try adjusting your filters or search query</p>
        </div>
      )}
    </div>
  );
};

export default TopicsList;
