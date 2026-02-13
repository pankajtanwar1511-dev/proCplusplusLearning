import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  Code,
  Brain,
  Edit3,
  CheckCircle,
  Copy,
  Check,
  ArrowLeft,
  Play,
  Trophy,
  Clock,
  AlertTriangle,
  Terminal,
  FileText,
} from 'lucide-react';
// Removed Prism.js to avoid compatibility issues
// Using simple CSS-based syntax highlighting instead
import {
  getTopic,
  getTopicTheory,
  getTopicExamples,
  getNotes,
  saveNotes,
  markTheoryRead,
  getQuizHistory,
} from '../utils/api';
import './TopicDetail.css';

const TopicDetail = () => {
  const { id, catalog } = useParams();
  const navigate = useNavigate();

  // Determine back link based on whether we're in a catalog context
  const backLink = catalog ? `/catalog/${catalog}/topics` : '/topics';
  const quizLink = catalog ? `/catalog/${catalog}/quiz/${id}` : `/quiz/${id}`;

  const [topic, setTopic] = useState(null);
  const [activeTab, setActiveTab] = useState('theory');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab-specific data
  const [theory, setTheory] = useState(null);
  const [examples, setExamples] = useState([]);
  const [notes, setNotes] = useState('');
  const [quizHistory, setQuizHistory] = useState([]);
  const [copiedCode, setCopiedCode] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');

  const loadTopic = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await getTopic(id);
      setTopic(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load topic');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadTabData = React.useCallback(async () => {
    try {
      if (activeTab === 'theory' && !theory) {
        const response = await getTopicTheory(id);
        setTheory(response.data);
      } else if (activeTab === 'examples' && examples.length === 0) {
        const response = await getTopicExamples(id);
        setExamples(response.data.examples || []);
      } else if (activeTab === 'notes' && notes === '') {
        const response = await getNotes(id);
        setNotes(response.data.content || '');
      } else if (activeTab === 'quiz' && quizHistory.length === 0) {
        const response = await getQuizHistory(id);
        setQuizHistory(response.data.history || []);
      }
    } catch (err) {
      console.error('Failed to load tab data:', err);
    }
  }, [activeTab, id, theory, examples.length, notes, quizHistory.length]);

  useEffect(() => {
    loadTopic();
  }, [loadTopic]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const handleMarkTheoryRead = async () => {
    try {
      await markTheoryRead(id);
      // Reload topic to update progress
      loadTopic();
    } catch (err) {
      console.error('Failed to mark theory as read:', err);
    }
  };

  const handleSaveNotes = async () => {
    try {
      setSaveStatus('saving');
      await saveNotes(id, notes);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to save notes:', err);
    }
  };

  const copyToClipboard = (code, index) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(index);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const tabs = [
    { id: 'theory', label: 'Theory', icon: BookOpen },
    { id: 'edge-cases', label: 'Edge Cases', icon: AlertTriangle },
    { id: 'examples', label: 'Code Examples', icon: Code },
    { id: 'practice', label: 'Practice Tasks', icon: Terminal },
    { id: 'quiz', label: 'Quiz', icon: Brain },
    { id: 'reference', label: 'Quick Reference', icon: FileText },
    { id: 'notes', label: 'My Notes', icon: Edit3 },
  ];

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading topic...</p>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="empty-state">
        <BookOpen size={64} className="empty-state-icon" />
        <h3>Topic Not Found</h3>
        <p>{error || 'The requested topic could not be found'}</p>
        <Link to={backLink} className="btn btn-primary">
          <ArrowLeft size={18} />
          Back to Topics
        </Link>
      </div>
    );
  }

  const progress = topic.progress || 0;

  return (
    <div className="topic-detail fade-in">
      {/* Header */}
      <div className="topic-detail-header">
        <button className="btn btn-ghost" onClick={() => navigate(backLink)}>
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="topic-info">
          <h1>{topic.title}</h1>
          <p className="topic-subtitle">{topic.description}</p>

          <div className="topic-badges">
            <span className={`badge badge-${topic.difficulty || 'medium'}`}>
              {topic.difficulty || 'Medium'}
            </span>
            <span className="badge badge-gray">
              {topic.quiz_count || 0} questions
            </span>
          </div>

          <div className="topic-progress-header">
            <div className="progress-info">
              <span>Your Progress</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Theory Tab */}
        {activeTab === 'theory' && (
          <div className="theory-content">
            {theory ? (
              <>
                <div className="content-card">
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {typeof theory === 'string' ? theory : (theory.content || '')}
                    </ReactMarkdown>
                  </div>
                </div>

                <div className="theory-actions">
                  <button
                    className="btn btn-success"
                    onClick={handleMarkTheoryRead}
                  >
                    <CheckCircle size={18} />
                    Mark as Read
                  </button>
                  <Link
                    to={quizLink}
                    className="btn btn-primary"
                  >
                    <Brain size={18} />
                    Take Quiz
                  </Link>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <BookOpen size={48} className="empty-state-icon" />
                <p>Theory content is being prepared...</p>
              </div>
            )}
          </div>
        )}

        {/* Examples Tab */}
        {activeTab === 'examples' && (
          <div className="examples-content">
            {examples.length > 0 ? (
              examples.map((example, index) => (
                <div key={index} className="example-card">
                  <div className="example-header">
                    <h3>{example.title || `Example ${index + 1}`}</h3>
                    {example.description && (
                      <p className="example-description">{example.description}</p>
                    )}
                  </div>

                  <div className="code-block-wrapper">
                    <button
                      className="copy-button"
                      onClick={() => copyToClipboard(example.code, index)}
                    >
                      {copiedCode === index ? (
                        <>
                          <Check size={16} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          Copy
                        </>
                      )}
                    </button>
                    <pre>
                      <code className="language-cpp">
                        {example.code}
                      </code>
                    </pre>
                  </div>

                  {example.explanation && (
                    <div className="example-explanation">
                      <h4>Explanation:</h4>
                      <p>{example.explanation}</p>
                    </div>
                  )}

                  {example.output && (
                    <div className="example-output">
                      <h4>Output:</h4>
                      <pre className="output-box">{example.output}</pre>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Code size={48} className="empty-state-icon" />
                <p>No code examples available yet</p>
              </div>
            )}
          </div>
        )}

        {/* Quiz Tab */}
        {activeTab === 'quiz' && (
          <div className="quiz-content">
            <div className="quiz-intro-card">
              <div className="quiz-intro-icon">
                <Brain size={48} />
              </div>
              <h2>Test Your Knowledge</h2>
              <p>
                Take a quiz to test your understanding of {topic.title}.
                Quizzes adapt to your performance and help identify weak areas.
              </p>

              <div className="quiz-stats">
                <div className="quiz-stat">
                  <Trophy size={24} className="text-warning" />
                  <div>
                    <p className="stat-value">{topic.quiz_count || 10}</p>
                    <p className="stat-label">Questions</p>
                  </div>
                </div>
                <div className="quiz-stat">
                  <Clock size={24} className="text-primary" />
                  <div>
                    <p className="stat-value">15 min</p>
                    <p className="stat-label">Duration</p>
                  </div>
                </div>
                <div className="quiz-stat">
                  <CheckCircle size={24} className="text-success" />
                  <div>
                    <p className="stat-value">70%</p>
                    <p className="stat-label">Pass Score</p>
                  </div>
                </div>
              </div>

              <Link
                to={quizLink}
                className="btn btn-primary btn-lg"
              >
                <Play size={18} />
                Start Quiz
              </Link>
            </div>

            {/* Quiz History */}
            {quizHistory.length > 0 && (
              <div className="quiz-history-section">
                <h3>Recent Attempts</h3>
                <div className="quiz-history-list">
                  {quizHistory.map((quiz, index) => (
                    <div key={index} className="quiz-history-item">
                      <div className="quiz-history-info">
                        <p className="quiz-date">
                          {new Date(quiz.date).toLocaleDateString()}
                        </p>
                        <p className="quiz-score-large">{quiz.score}%</p>
                      </div>
                      <div className="quiz-history-details">
                        <span className={`badge ${quiz.passed ? 'badge-success' : 'badge-danger'}`}>
                          {quiz.passed ? 'Passed' : 'Failed'}
                        </span>
                        <span className="text-sm text-gray">
                          {quiz.correct}/{quiz.total} correct
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edge Cases Tab */}
        {activeTab === 'edge-cases' && (
          <div className="edge-cases-content">
            {topic.edge_cases && topic.edge_cases.length > 0 ? (
              topic.edge_cases.map((edgeCase, index) => (
                <div key={index} className="example-card">
                  <div className="example-header">
                    <h3>
                      <AlertTriangle size={20} style={{ display: 'inline', marginRight: '8px' }} />
                      Edge Case {index + 1}: {edgeCase.title}
                    </h3>
                  </div>

                  {edgeCase.explanation && (
                    <div className="example-explanation">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {typeof edgeCase.explanation === 'string' ? edgeCase.explanation : ''}
                      </ReactMarkdown>
                    </div>
                  )}

                  {edgeCase.code_examples && edgeCase.code_examples.length > 0 && edgeCase.code_examples.map((code, codeIdx) => (
                    <div key={codeIdx} className="code-block-wrapper">
                      <button
                        className="copy-button"
                        onClick={() => copyToClipboard(code, `edge-${index}-${codeIdx}`)}
                      >
                        {copiedCode === `edge-${index}-${codeIdx}` ? (
                          <>
                            <Check size={16} />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={16} />
                            Copy
                          </>
                        )}
                      </button>
                      <pre>
                        <code className="language-cpp">{code}</code>
                      </pre>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <AlertTriangle size={48} className="empty-state-icon" />
                <p>No edge cases documented yet</p>
              </div>
            )}
          </div>
        )}

        {/* Practice Tasks Tab */}
        {activeTab === 'practice' && (
          <div className="practice-content">
            {topic.practice_tasks && topic.practice_tasks.length > 0 ? (
              topic.practice_tasks.map((task, index) => (
                <div key={index} className="example-card">
                  <div className="example-header">
                    <h3>
                      <Terminal size={20} style={{ display: 'inline', marginRight: '8px' }} />
                      {task.title || `Practice Task ${index + 1}`}
                    </h3>
                  </div>

                  {task.description && (
                    <div className="example-explanation">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {typeof task.description === 'string' ? task.description : ''}
                      </ReactMarkdown>
                    </div>
                  )}

                  {task.code && (
                    <div className="code-block-wrapper">
                      <button
                        className="copy-button"
                        onClick={() => copyToClipboard(task.code, `practice-${index}`)}
                      >
                        {copiedCode === `practice-${index}` ? (
                          <>
                            <Check size={16} />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={16} />
                            Copy
                          </>
                        )}
                      </button>
                      <pre>
                        <code className="language-cpp">{task.code}</code>
                      </pre>
                    </div>
                  )}

                  {task.expected_output && (
                    <div className="example-output">
                      <h4>Expected Output:</h4>
                      <pre className="output-box">{task.expected_output}</pre>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Terminal size={48} className="empty-state-icon" />
                <p>No practice tasks available yet</p>
              </div>
            )}
          </div>
        )}

        {/* Quick Reference Tab */}
        {activeTab === 'reference' && (
          <div className="reference-content">
            {topic.quick_reference && topic.quick_reference.content ? (
              <div className="content-card">
                <div className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {typeof topic.quick_reference.content === 'string' ? topic.quick_reference.content : ''}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <FileText size={48} className="empty-state-icon" />
                <p>No quick reference available yet</p>
              </div>
            )}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="notes-content">
            <div className="notes-editor">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write your personal notes here..."
                rows={15}
              />
              <div className="notes-actions">
                <button
                  className={`btn ${saveStatus === 'saved' ? 'btn-success' : 'btn-primary'}`}
                  onClick={handleSaveNotes}
                  disabled={saveStatus === 'saving'}
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div>
                      Saving...
                    </>
                  ) : saveStatus === 'saved' ? (
                    <>
                      <Check size={18} />
                      Saved!
                    </>
                  ) : (
                    <>
                      <Edit3 size={18} />
                      Save Notes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicDetail;
