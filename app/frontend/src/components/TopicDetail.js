import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
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
  MessageSquare,
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

  // Read section from URL query parameter (e.g., ?section=practice)
  const urlParams = new URLSearchParams(window.location.search);
  // Interview Prep topics open on their Q&A tab by default.
  const urlSection = urlParams.get('section') || (catalog === 'interview' ? 'interview' : 'theory');

  // Determine back link based on whether we're in a catalog context
  // Add chapter parameter to preserve scroll position
  const getBackLink = () => {
    // Extract chapter number from topic id (e.g., "cpp_10_2" -> chapter 10)
    const parts = id?.split('_') || [];
    const chapterNum = parts.length >= 2 ? parts[1] : null;

    if (catalog) {
      return chapterNum
        ? `/catalog/${catalog}/topics?chapter=${chapterNum}`
        : `/catalog/${catalog}/topics`;
    }
    return chapterNum
      ? `/topics?chapter=${chapterNum}`
      : '/topics';
  };

  const backLink = getBackLink();

  const [topic, setTopic] = useState(null);
  const [activeTab, setActiveTab] = useState(urlSection); // Initialize from URL
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab-specific data
  const [theory, setTheory] = useState(null);
  const [examples, setExamples] = useState([]);
  const [notes, setNotes] = useState('');
  const [quizHistory, setQuizHistory] = useState([]);
  const [copiedCode, setCopiedCode] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const practiceContentRef = React.useRef(null);
  const theoryContentRef = React.useRef(null);
  const edgeCasesContentRef = React.useRef(null);

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

  // Simple C++ syntax highlighter
  const highlightCppCode = React.useCallback((code) => {
    if (!code || typeof code !== 'string') return code;

    // CRITICAL: HTML-escape first to prevent <iostream> being interpreted as HTML tag
    const escapeHtml = (str) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    // C++ keywords
    const keywords = /\b(int|double|float|char|bool|void|class|struct|public|private|protected|virtual|const|static|return|if|else|for|while|do|switch|case|break|continue|new|delete|this|nullptr|true|false|auto|using|namespace|std|include|define|ifdef|endif|typedef|typename|template|inline|friend|operator|explicit|mutable|volatile|extern|register|goto|sizeof|throw|try|catch|constexpr|decltype|noexcept|override|final|enum|union|unsigned|signed|short|long|wchar_t)\b/g;

    // Numbers
    const numbers = /\b(\d+\.?\d*[fFuUlL]?)\b/g;

    // Strings AND comments, matched together in a SINGLE linear left-to-right
    // pass over the RAW (un-escaped) code. This has to be one combined regex,
    // not separate sequential passes: if strings were protected first, a
    // quoted word used for emphasis INSIDE a comment (e.g. "the 'this'
    // pointer") would get replaced with a placeholder before the comment
    // regex ever runs -- the comment match would then swallow that
    // still-unresolved placeholder whole into its OWN saved span content,
    // which is frozen before the final restore pass ever substitutes the
    // inner placeholder back in, leaking literal "§§STRING0§§"-style text
    // onto the page. Matching both in one pass over the original text means
    // whichever construct (string, //, or /* */) starts earliest at a given
    // position wins outright, so no placeholder can ever end up nested
    // inside another.
    const stringsAndComments = /(\/\*[\s\S]*?\*\/)|(\/\/.*?)$|((["'])(?:(?=(\\?))\5.)*?\4)/gm;

    // Placeholder tokens are letters-fused-with-digits (not bare digits
    // between delimiters) on purpose: the numbers regex below is
    // `\b\d+\b`, and `§` counts as a non-word character, so a placeholder
    // like `§0§` would itself present a word-bounded digit run -- the
    // numbers pass would wrap just the "0" in its own <span>, corrupting
    // the exact-string token the restore step below searches for, and
    // silently leaving a mangled placeholder on the page.
    const savedMatches = [];
    let processedCode = code.replace(stringsAndComments, (match, mlComment, slComment) => {
      const idx = savedMatches.length;
      const cssClass = (mlComment !== undefined || slComment !== undefined) ? 'comment' : 'string';
      savedMatches.push(`<span class="${cssClass}">${escapeHtml(match)}</span>`);
      return `§PH${idx}HP§`;
    });

    // Only NOW escape whatever code is left (placeholders use § which
    // escapeHtml never touches, so they survive intact).
    processedCode = escapeHtml(processedCode);

    // Highlight keywords
    processedCode = processedCode.replace(keywords, '<span class="keyword">$&</span>');

    // Highlight numbers
    processedCode = processedCode.replace(numbers, '<span class="number">$1</span>');

    // Restore saved strings and comments
    savedMatches.forEach((item, idx) => {
      processedCode = processedCode.replace(`§PH${idx}HP§`, () => item);
    });

    return processedCode;
  }, []);

  const toggleAllAnswers = () => {
    if (practiceContentRef.current) {
      const allDetails = practiceContentRef.current.querySelectorAll('details');
      const newState = !showAllAnswers;

      allDetails.forEach(details => {
        details.open = newState;
      });

      setShowAllAnswers(newState);
    }
  };

  // Enhance markdown-rendered code blocks with copy buttons and syntax highlighting
  const enhanceCodeBlocks = React.useCallback((containerRef) => {
    if (!containerRef.current) return;

    const codeBlocks = containerRef.current.querySelectorAll('pre > code');

    codeBlocks.forEach((codeElement, index) => {
      const preElement = codeElement.parentElement;

      // Skip if already enhanced. Two checks on purpose: the wrapper-class
      // check catches normal re-runs, but the dataset flag is set
      // synchronously (before any DOM restructuring) so a second effect
      // invocation racing in before the wrapper exists yet (e.g. React
      // StrictMode's dev-mode double-invoke) still can't re-highlight
      // already-highlighted markup -- which would otherwise re-escape its
      // own output and leave literal "&#39;"-style text on screen.
      if (preElement.parentElement?.classList.contains('code-block-wrapper')) return;
      if (codeElement.dataset.highlighted === 'true') return;
      codeElement.dataset.highlighted = 'true';

      const code = codeElement.textContent;
      const codeId = `markdown-code-${index}`;

      // Apply syntax highlighting
      codeElement.innerHTML = highlightCppCode(code);

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      // Create copy button
      const copyButton = document.createElement('button');
      copyButton.className = 'copy-button';
      copyButton.setAttribute('data-code-id', codeId);
      copyButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Copy</span>
      `;

      copyButton.onclick = () => {
        navigator.clipboard.writeText(code);
        copyButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          copyButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          `;
        }, 2000);
      };

      // Replace pre with wrapper
      preElement.parentElement.insertBefore(wrapper, preElement);
      wrapper.appendChild(copyButton);
      wrapper.appendChild(preElement);
    });
  }, [highlightCppCode]);

  // Enhance code blocks when theory or edge cases content loads
  useEffect(() => {
    if (activeTab === 'theory' && theory) {
      setTimeout(() => enhanceCodeBlocks(theoryContentRef), 100);
    } else if (activeTab === 'edge-cases') {
      setTimeout(() => enhanceCodeBlocks(edgeCasesContentRef), 100);
    }
  }, [activeTab, theory, enhanceCodeBlocks]);

  // Update URL when tab changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    // Update URL query parameter to preserve tab on refresh
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('section', tabId);
    window.history.pushState({}, '', newUrl);
  };

  // Build quiz link dynamically with current section context
  const getQuizLink = () => {
    return catalog
      ? `/catalog/${catalog}/quiz/${id}?from=${activeTab}`
      : `/quiz/${id}?from=${activeTab}`;
  };

  const interviewTab = { id: 'interview', label: 'Interview Q&A', icon: MessageSquare };
  const tabs = [
    ...(catalog === 'interview' ? [interviewTab] : []),
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
            onClick={() => handleTabChange(tab.id)}
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
          <div className="theory-content" ref={theoryContentRef}>
            {theory ? (
              <>
                <div className="content-card">
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
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
                    to={getQuizLink()}
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
                      <code className="language-cpp" dangerouslySetInnerHTML={{ __html: highlightCppCode(example.code) }} />
                    </pre>
                  </div>

                  {Array.isArray(example.additional_code) && example.additional_code.map((extra, addIdx) => (
                    // A block is real code if it has C++ syntax (#include / ; / { }).
                    // Otherwise it's captured program output — show it as an Output box.
                    /#include|[;{}]/.test(extra) ? (
                      <div className="code-block-wrapper" key={`add-${addIdx}`}>
                        <button
                          className="copy-button"
                          onClick={() => copyToClipboard(extra, `example-${index}-add-${addIdx}`)}
                        >
                          {copiedCode === `example-${index}-add-${addIdx}` ? (
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
                          <code className="language-cpp" dangerouslySetInnerHTML={{ __html: highlightCppCode(extra) }} />
                        </pre>
                      </div>
                    ) : (
                      <div className="example-output" key={`add-${addIdx}`}>
                        <h4>Output:</h4>
                        <pre className="output-box">{extra}</pre>
                      </div>
                    )
                  ))}

                  {example.explanation && (
                    <div className="example-explanation">
                      <h4>Explanation:</h4>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                        {typeof example.explanation === 'string' ? example.explanation : ''}
                      </ReactMarkdown>
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
                to={getQuizLink()}
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
          <div className="edge-cases-content" ref={edgeCasesContentRef}>
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
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
                        <code className="language-cpp" dangerouslySetInnerHTML={{ __html: highlightCppCode(code) }} />
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
          <div className="practice-content" ref={practiceContentRef}>
            {topic.practice_tasks && topic.practice_tasks.length > 0 ? (
              <>
                <div className="practice-header-actions">
                  <button
                    className="btn btn-outline"
                    onClick={toggleAllAnswers}
                  >
                    {showAllAnswers ? (
                      <>
                        <CheckCircle size={18} />
                        Hide All Answers
                      </>
                    ) : (
                      <>
                        <CheckCircle size={18} />
                        Show All Answers
                      </>
                    )}
                  </button>
                </div>
                {topic.practice_tasks.map((task, index) => {
                  return (
                    <div key={index} className="example-card">
                      <div className="example-header">
                        <h3>
                          <Terminal size={20} style={{ display: 'inline', marginRight: '8px' }} />
                          {task.title || `Practice Task ${index + 1}`}
                        </h3>
                      </div>

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
                            <code className="language-cpp" dangerouslySetInnerHTML={{ __html: highlightCppCode(task.code) }} />
                          </pre>
                        </div>
                      )}

                      {task.expected_output && (
                        <div className="example-output">
                          <h4>Expected Output:</h4>
                          <pre className="output-box">{task.expected_output}</pre>
                        </div>
                      )}

                      {/* Don't show description for bug analysis format (has answer field) */}
                      {task.description && task.description.trim() &&
                       !task.answer &&
                       !task.description.trim().match(/^```(cpp|c\+\+)?$/i) && (
                        <div className="example-explanation">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {typeof task.description === 'string' ? task.description : ''}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Answer Section - Collapsible - Display full_content as-is */}
                      {task.full_content && (
                        <details className="practice-answer-section">
                          <summary className="practice-answer-toggle">
                            <CheckCircle size={16} />
                            Show Answer
                          </summary>
                          <div className="practice-answer-content">
                            <div className="markdown-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                {typeof task.full_content === 'string' ? task.full_content : ''}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="empty-state">
                <Terminal size={48} className="empty-state-icon" />
                <p>No practice tasks available yet</p>
              </div>
            )}
          </div>
        )}

        {/* Interview Q&A Tab (interview catalog): question first, full answer on reveal */}
        {activeTab === 'interview' && (
          <div className="practice-content" ref={practiceContentRef}>
            {topic.interview_qa && topic.interview_qa.length > 0 ? (
              <>
                <div className="practice-header-actions">
                  <button className="btn btn-outline" onClick={toggleAllAnswers}>
                    <CheckCircle size={18} />
                    {showAllAnswers ? 'Hide All Answers' : 'Show All Answers'}
                  </button>
                </div>
                {topic.interview_qa.map((qa, index) => {
                  const full = qa.full_content || '';
                  const cut = full.indexOf('**Answer:**');
                  const setup = cut > 0 ? full.slice(0, cut).trim() : '';
                  const reveal = cut > 0 ? full.slice(cut) : full;
                  return (
                  <div key={index} className="example-card">
                    <div className="example-header">
                      <h3>
                        <MessageSquare size={20} style={{ display: 'inline', marginRight: '8px' }} />
                        Q{qa.question_number || index + 1}.{' '}
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{ p: ({ children }) => <span>{children}</span> }}
                        >
                          {qa.question || ''}
                        </ReactMarkdown>
                      </h3>
                      {qa.difficulty && qa.difficulty.length > 0 && (
                        <div className="topic-badges">
                          {qa.difficulty.map((d) => (
                            <span key={d} className={`badge ${{ beginner: 'badge-success', intermediate: 'badge-warning', advanced: 'badge-danger' }[d] || 'badge-gray'}`}>{d}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {setup && (
                      <div className="example-explanation markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {setup}
                        </ReactMarkdown>
                      </div>
                    )}
                    <details className="practice-answer-section">
                      <summary className="practice-answer-toggle">
                        <CheckCircle size={16} />
                        Show Answer
                      </summary>
                      <div className="practice-answer-content">
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {(qa.full_content && reveal) ||
                              [qa.answer && `**Answer:**\n${qa.answer}`,
                               qa.explanation && `**Explanation:**\n${qa.explanation}`,
                               qa.key_takeaway && `**Key takeaway:** ${qa.key_takeaway}`]
                                .filter(Boolean).join('\n\n')}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </details>
                  </div>
                  );
                })}
              </>
            ) : (
              <div className="empty-state">
                <MessageSquare size={48} className="empty-state-icon" />
                <p>No interview questions available yet</p>
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
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
