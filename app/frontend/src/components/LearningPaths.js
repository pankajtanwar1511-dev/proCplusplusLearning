import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Map,
  Clock,
  BookOpen,
  CheckCircle,
  ArrowRight,
  Target,
  Code,
  Briefcase,
  Zap,
  Award,
} from 'lucide-react';
import { getLearningPaths } from '../utils/api';
import './LearningPaths.css';

const LearningPaths = () => {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPaths();
  }, []);

  const loadPaths = async () => {
    try {
      setLoading(true);
      const response = await getLearningPaths();
      setPaths(response.data.paths || []);
      setError(null);
    } catch (err) {
      setError('Failed to load learning paths');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPathIcon = (type) => {
    switch (type) {
      case 'beginner':
        return <Target size={32} />;
      case 'interview':
        return <Briefcase size={32} />;
      case 'modern':
        return <Zap size={32} />;
      case 'advanced':
        return <Award size={32} />;
      default:
        return <Code size={32} />;
    }
  };

  const getPathColor = (type) => {
    switch (type) {
      case 'beginner':
        return 'success';
      case 'interview':
        return 'primary';
      case 'modern':
        return 'warning';
      case 'advanced':
        return 'danger';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading learning paths...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <Map size={64} className="empty-state-icon" />
        <h3>Failed to Load Learning Paths</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={loadPaths}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="learning-paths fade-in">
      <div className="paths-header">
        <div>
          <h1>Learning Paths</h1>
          <p className="text-gray">
            Structured learning journeys to master C++ step by step
          </p>
        </div>
      </div>

      {paths.length > 0 ? (
        <div className="paths-grid">
          {paths.map((path, index) => {
            const progress = path.progress || 0;
            const completedTopics = path.completed_topics || 0;
            const totalTopics = path.topics?.length || path.total_topics || 0;
            const pathColor = getPathColor(path.type);

            return (
              <div key={index} className={`path-card path-${pathColor}`}>
                <div className="path-card-header">
                  <div className={`path-icon ${pathColor}`}>
                    {getPathIcon(path.type)}
                  </div>
                  <span className={`badge badge-${pathColor}`}>
                    {path.difficulty || 'All Levels'}
                  </span>
                </div>

                <h2>{path.title}</h2>
                <p className="path-description">{path.description}</p>

                <div className="path-meta">
                  <div className="path-meta-item">
                    <BookOpen size={18} />
                    <span>{totalTopics} topics</span>
                  </div>
                  <div className="path-meta-item">
                    <Clock size={18} />
                    <span>{path.estimated_time || '4-6 weeks'}</span>
                  </div>
                </div>

                <div className="path-progress">
                  <div className="progress-label">
                    <span>Progress</span>
                    <span className="font-semibold">
                      {completedTopics}/{totalTopics}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                {path.topics && path.topics.length > 0 && (
                  <div className="path-topics">
                    <p className="topics-label">Topics Included:</p>
                    <ul className="topics-list">
                      {path.topics.slice(0, 5).map((topic, idx) => (
                        <li key={idx}>
                          <CheckCircle size={14} />
                          {topic.title || topic}
                        </li>
                      ))}
                      {path.topics.length > 5 && (
                        <li className="topics-more">
                          +{path.topics.length - 5} more topics
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                <Link
                  to={path.id ? `/learning-paths/${path.id}` : '/topics'}
                  className="path-action-btn"
                >
                  {progress > 0 ? 'Continue Path' : 'Start Path'}
                  <ArrowRight size={18} />
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Map size={64} className="empty-state-icon" />
          <h3>No Learning Paths Available</h3>
          <p>Learning paths are being prepared. Check back soon!</p>
          <Link to="/topics" className="btn btn-primary">
            <BookOpen size={18} />
            Browse All Topics
          </Link>
        </div>
      )}
    </div>
  );
};

export default LearningPaths;
