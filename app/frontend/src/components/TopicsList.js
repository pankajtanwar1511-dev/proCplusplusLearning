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
  const [selectedCatalog, setSelectedCatalog] = useState('all'); // 'all', 'cpp', 'ros2'

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

  // Format chapter name from slug
  const formatChapterName = (slug, chapterNum) => {
    // Chapter name mappings for better display
    const chapterNames = {
      // C++ Chapters
      'chapter_1_oops': 'Object-Oriented Programming (OOP)',
      'chapter_2_mamory_management': 'Memory Management',
      'chapter_3_smart_pointers': 'Smart Pointers',
      'chapter_4_reference_copying_moving': 'References, Copying & Moving',
      'chapter_5_operator_overloading': 'Operator Overloading',
      'chapter_6_type_system_casting': 'Type System & Casting',
      'chapter_7_templates_generics': 'Templates & Generics',
      'chapter_8_stl_containers_algorithms': 'STL Containers & Algorithms',
      'chapter_9_cpp11_features': 'C++11 Features',
      'chapter_10_raii_resource_management': 'RAII & Resource Management',
      'chapter_11_multithreading': 'Multithreading',
      'chapter_12_design_patterns': 'Design Patterns',
      'chapter_13_compile_time_magic': 'Compile-Time Programming',
      'chapter_14_low_level_tricky': 'Low-Level & Advanced Tricks',
      'chapter_15_cpp14_features': 'C++14 Features',
      'chapter_16_cpp17_features': 'C++17 Features',
      // ROS2 Chapters
      'chapter_1_fundamentals': 'ROS2 Fundamentals',
      'chapter_2_communication': 'Communication Patterns',
      'chapter_3_advanced_features': 'Advanced Features',
      'chapter_4_navigation': 'Navigation',
      'chapter_4_real_world_development': 'Real-World Development',
      'chapter_5_real_world': 'Real-World Applications',
      'chapter_5_robotics_applications': 'Robotics Applications',
      'chapter_6_advanced_production_systems': 'Advanced Production Systems'
    };

    return chapterNames[slug] || slug
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  // Group topics by catalog and chapter
  const groupTopicsByChapter = (topics) => {
    const groups = {};

    topics.forEach((topic) => {
      // Parse topic ID: "cpp_1_0" or "ros2_1_0"
      const parts = topic.id?.split('_') || [];
      if (parts.length < 3) return;

      const catalog = parts[0];
      const chapterNum = parseInt(parts[1]);
      const catalogKey = catalog.toUpperCase();
      const chapterKey = `${catalogKey}_Chapter_${chapterNum}`;

      if (!groups[chapterKey]) {
        // Extract chapter slug from description (format: "CPP - Chapter 1: chapter_name")
        const chapterSlug = topic.description?.split(': ')[1]?.trim();

        groups[chapterKey] = {
          catalog: catalogKey,
          chapterNum: chapterNum,
          chapterName: formatChapterName(chapterSlug, chapterNum),
          topics: []
        };
      }

      groups[chapterKey].topics.push(topic);
    });

    // Sort chapters by catalog then by chapter number
    return Object.values(groups).sort((a, b) => {
      if (a.catalog !== b.catalog) {
        return a.catalog.localeCompare(b.catalog);
      }
      return a.chapterNum - b.chapterNum;
    });
  };

  const filteredTopics = topics
    .filter((topic) => {
      // Filter by catalog
      if (selectedCatalog !== 'all') {
        const topicCatalog = topic.id?.split('_')[0];
        if (topicCatalog !== selectedCatalog) return false;
      }

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
    });

  const groupedChapters = groupTopicsByChapter(filteredTopics);

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
          <h1>Learning Topics</h1>
          <p className="text-gray">
            {topics.length} topics available • {filteredTopics.length} matching filters
          </p>
        </div>
      </div>

      {/* Catalog Switcher */}
      <div className="catalog-switcher">
        <button
          className={`catalog-btn ${selectedCatalog === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCatalog('all')}
        >
          All Topics
        </button>
        <button
          className={`catalog-btn ${selectedCatalog === 'cpp' ? 'active' : ''}`}
          onClick={() => setSelectedCatalog('cpp')}
        >
          C++ Programming
        </button>
        <button
          className={`catalog-btn ${selectedCatalog === 'ros2' ? 'active' : ''}`}
          onClick={() => setSelectedCatalog('ros2')}
        >
          ROS2 Robotics
        </button>
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

      {/* Topics Grouped by Chapters */}
      {groupedChapters.length > 0 ? (
        <div className="chapters-list">
          {groupedChapters.map((chapter) => (
            <div key={`${chapter.catalog}_${chapter.chapterNum}`} className="chapter-group">
              <div className="chapter-header">
                <h2>
                  <span className="catalog-badge">{chapter.catalog}</span>
                  Chapter {chapter.chapterNum}: {chapter.chapterName}
                </h2>
                <span className="topic-count">{chapter.topics.length} topics</span>
              </div>

              <div className={`topics-container ${viewMode}`}>
                {chapter.topics.map((topic) => {
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
                        {topic.description?.split(':')[0] || 'No description available'}
                      </p>

                      <div className="topic-meta">
                        <span className="difficulty">
                          <span
                            className={`difficulty-badge ${topic.difficulty || 'medium'}`}
                          >
                            {topic.difficulty || 'Medium'}
                          </span>
                        </span>
                        {topic.quiz_count > 0 && (
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
            </div>
          ))}
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
