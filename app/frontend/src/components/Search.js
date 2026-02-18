import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search as SearchIcon, BookOpen, Code, Brain, ArrowRight, X } from 'lucide-react';
import { search } from '../utils/api';
import './Search.css';

const Search = () => {
  const { catalog } = useParams();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper to create catalog-aware links
  const getTopicLink = (topicId) => {
    return catalog ? `/catalog/${catalog}/topic/${topicId}` : `/topics/${topicId}`;
  };

  const getQuizLink = (topicId) => {
    return catalog ? `/catalog/${catalog}/quiz/${topicId}` : `/quiz/${topicId}`;
  };

  const getTopicsLink = () => {
    return catalog ? `/catalog/${catalog}/topics` : '/topics';
  };

  const getCatalogTitle = () => {
    if (catalog === 'cpp') return 'C++ Master';
    if (catalog === 'ros2') return 'ROS 2 Master';
    return 'C++ Master';
  };

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (query.length >= 2) {
        performSearch();
      } else {
        setResults(null);
      }
    }, 300); // Debounce search

    return () => clearTimeout(delaySearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const performSearch = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await search(query);
      setResults(response.data);
    } catch (err) {
      setError('Failed to perform search');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults(null);
    setError(null);
  };

  const getTotalResults = () => {
    if (!results) return 0;
    return (
      (results.topics?.length || 0) +
      (results.examples?.length || 0) +
      (results.questions?.length || 0)
    );
  };

  return (
    <div className="search-page fade-in">
      <div className="search-header">
        <h1>Search {getCatalogTitle()}</h1>
        <p className="text-gray">
          Search topics, code examples, and quiz questions
        </p>
      </div>

      <div className="search-container">
        <div className="search-input-wrapper">
          <SearchIcon size={20} />
          <input
            type="text"
            placeholder="Search for topics, concepts, code examples..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button className="clear-search" onClick={clearSearch}>
              <X size={18} />
            </button>
          )}
        </div>

        {loading && (
          <div className="search-loading">
            <div className="spinner"></div>
            <p>Searching...</p>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            <p>{error}</p>
          </div>
        )}

        {results && !loading && (
          <div className="search-results">
            <div className="results-summary">
              <h3>
                {getTotalResults()} result{getTotalResults() !== 1 ? 's' : ''} found
              </h3>
              <p className="text-gray">for "{query}"</p>
            </div>

            {/* Topics Results */}
            {results.topics && results.topics.length > 0 && (
              <div className="results-section">
                <div className="results-section-header">
                  <BookOpen size={20} />
                  <h3>Topics</h3>
                  <span className="badge badge-primary">
                    {results.topics.length}
                  </span>
                </div>
                <div className="results-list">
                  {results.topics.map((topic, index) => (
                    <Link
                      key={index}
                      to={getTopicLink(topic.id)}
                      className="result-item"
                    >
                      <div className="result-icon topic">
                        <BookOpen size={20} />
                      </div>
                      <div className="result-content">
                        <h4>{highlightMatch(topic.title, query)}</h4>
                        <p>{highlightMatch(topic.description, query)}</p>
                        {topic.progress !== undefined && (
                          <div className="result-meta">
                            <span className={`badge badge-${topic.progress >= 80 ? 'success' : 'gray'}`}>
                              {topic.progress}% complete
                            </span>
                          </div>
                        )}
                      </div>
                      <ArrowRight size={18} className="result-arrow" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Code Examples Results */}
            {results.examples && results.examples.length > 0 && (
              <div className="results-section">
                <div className="results-section-header">
                  <Code size={20} />
                  <h3>Code Examples</h3>
                  <span className="badge badge-success">
                    {results.examples.length}
                  </span>
                </div>
                <div className="results-list">
                  {results.examples.map((example, index) => (
                    <Link
                      key={index}
                      to={getTopicLink(example.topic_id)}
                      className="result-item"
                    >
                      <div className="result-icon example">
                        <Code size={20} />
                      </div>
                      <div className="result-content">
                        <h4>{highlightMatch(example.title, query)}</h4>
                        <p>{highlightMatch(example.description, query)}</p>
                        {example.code && (
                          <pre className="result-code-preview">
                            <code>{example.code.substring(0, 100)}...</code>
                          </pre>
                        )}
                        <div className="result-meta">
                          <span className="text-sm text-gray">
                            From: {example.topic_title}
                          </span>
                        </div>
                      </div>
                      <ArrowRight size={18} className="result-arrow" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Questions Results */}
            {results.questions && results.questions.length > 0 && (
              <div className="results-section">
                <div className="results-section-header">
                  <Brain size={20} />
                  <h3>Quiz Questions</h3>
                  <span className="badge badge-warning">
                    {results.questions.length}
                  </span>
                </div>
                <div className="results-list">
                  {results.questions.map((question, index) => (
                    <Link
                      key={index}
                      to={getQuizLink(question.topic_id)}
                      className="result-item"
                    >
                      <div className="result-icon question">
                        <Brain size={20} />
                      </div>
                      <div className="result-content">
                        <h4>{highlightMatch(question.question, query)}</h4>
                        <div className="result-meta">
                          <span className="text-sm text-gray">
                            From: {question.topic_title}
                          </span>
                          <span className={`badge badge-${question.difficulty || 'medium'}`}>
                            {question.difficulty || 'medium'}
                          </span>
                        </div>
                      </div>
                      <ArrowRight size={18} className="result-arrow" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {getTotalResults() === 0 && (
              <div className="empty-state">
                <SearchIcon size={64} className="empty-state-icon" />
                <h3>No Results Found</h3>
                <p>Try different keywords or browse all topics</p>
                <Link to={getTopicsLink()} className="btn btn-primary">
                  <BookOpen size={18} />
                  Browse Topics
                </Link>
              </div>
            )}
          </div>
        )}

        {!query && !results && (
          <div className="search-empty-state">
            <SearchIcon size={64} className="empty-state-icon" />
            <h3>Start Searching</h3>
            <p>Enter at least 2 characters to search</p>
            <div className="search-suggestions">
              <p className="suggestions-title">Popular searches:</p>
              <div className="suggestions-list">
                <button onClick={() => setQuery('pointers')}>Pointers</button>
                <button onClick={() => setQuery('classes')}>Classes</button>
                <button onClick={() => setQuery('templates')}>Templates</button>
                <button onClick={() => setQuery('STL')}>STL</button>
                <button onClick={() => setQuery('memory')}>Memory Management</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to highlight matching text
const highlightMatch = (text, query) => {
  if (!text || !query) return text;

  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index}>{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
};

export default Search;
