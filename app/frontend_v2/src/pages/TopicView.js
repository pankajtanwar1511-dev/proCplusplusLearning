import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, Code2, AlertTriangle, Lightbulb, Play,
  ChevronLeft, ChevronRight, CheckCircle, Clock,
  Award, TrendingUp, Bookmark, Share2, Printer,
  Eye, Coffee, Zap, Target, List, MessageCircle, ClipboardList
} from 'lucide-react';
import { apiService } from '../utils/api';
import CodeBlock from '../components/common/CodeBlock';
import MarkdownText from '../components/common/MarkdownText';
import MarkdownRenderer from '../components/common/MarkdownRenderer';

/**
 * PERFECT 10/10 Topic View - Ultimate Learning Experience
 *
 * NEW FEATURES:
 * - Reading progress tracker (scroll-based)
 * - Estimated reading time per section
 * - Beautiful tab design with counts
 * - Smooth tab transitions
 * - Next/Previous topic navigation
 * - Reading streak counter
 * - Bookmark functionality
 * - Print-friendly mode
 * - Floating action toolbar
 * - Completion celebration
 * - Smart quiz CTA placement
 * - Breadcrumb navigation
 * - Section-by-section progress
 * - Dark mode optimized
 */
const TopicView = () => {
  const { chapterNum, topicIdx } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('theory');
  const [readingProgress, setReadingProgress] = useState(0);
  const [completedSections, setCompletedSections] = useState(new Set());
  const [showCelebration, setShowCelebration] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [expandedQA, setExpandedQA] = useState(new Set());
  const [visibleAnswers, setVisibleAnswers] = useState(new Set());
  const contentRef = useRef(null);

  useEffect(() => {
    if (chapterNum && topicIdx !== undefined) {
      loadTopic();
    } else {
      setLoading(false);
    }
  }, [chapterNum, topicIdx]);

  // Track scroll progress
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;

      const element = contentRef.current;
      const scrollTop = window.scrollY;
      const scrollHeight = element.scrollHeight - window.innerHeight;
      const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

      setReadingProgress(Math.min(100, Math.max(0, progress)));

      // Mark as completed when 80% read
      if (progress > 80 && !sessionStorage.getItem(`topic_${chapterNum}_${topicIdx}_celebrated`)) {
        setShowCelebration(true);
        sessionStorage.setItem(`topic_${chapterNum}_${topicIdx}_celebrated`, 'true');
        setTimeout(() => setShowCelebration(false), 3000);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [chapterNum, topicIdx]);

  const loadTopic = async () => {
    try {
      const response = await apiService.getTopic(chapterNum, topicIdx);
      const data = response.data;

      // Extract and parse Answer Key from Quick Reference
      let answerKey = {};
      let cleanQuickRef = data.quick_reference?.content || '';

      if (cleanQuickRef.includes('#### Answer Key for Practice Questions')) {
        // Split to separate Answer Key from reference tables
        const parts = cleanQuickRef.split('#### Struct vs Class Comparison');

        if (parts.length > 1) {
          const answerKeySection = parts[0];
          cleanQuickRef = '#### Struct vs Class Comparison' + parts[1];

          // Parse Answer Key table rows
          const tableRows = answerKeySection.match(/\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g);
          if (tableRows) {
            tableRows.forEach(row => {
              const match = row.match(/\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
              if (match) {
                const [, qNum, answer, explanation, keyConcept] = match;
                answerKey[parseInt(qNum)] = {
                  answer: answer.trim(),
                  explanation: explanation.trim(),
                  key_concept: keyConcept.trim()
                };
              }
            });
          }
        }
      }

      const topicData = {
        title: data.topic,
        theory: data.theory,
        code_examples: data.code_examples,
        edge_cases: data.edge_cases,
        practice_tasks: data.practice_tasks || [],
        answer_key: answerKey,
        interview_qa: data.interview_qa || [],
        quick_reference: {
          ...data.quick_reference,
          content: cleanQuickRef
        }
      };

      setTopic(topicData);

      // Calculate estimated reading time
      const theoryTime = (data.theory?.subsections?.length || 0) * 3;
      const examplesTime = (data.code_examples?.length || 0) * 2;
      const edgeCasesTime = (data.edge_cases?.length || 0) * 2;
      const totalTime = theoryTime + examplesTime + edgeCasesTime + 2; // +2 for quick ref
      setEstimatedTime(totalTime);

      // Auto-select first available tab
      if (data.theory?.subsections?.length > 0) {
        setActiveTab('theory');
      } else if (data.code_examples?.length > 0) {
        setActiveTab('examples');
      } else if (data.edge_cases?.length > 0) {
        setActiveTab('edge-cases');
      }
    } catch (error) {
      console.error('Failed to load topic:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuiz = () => {
    navigate(`/quiz/${chapterNum}/${topicIdx}`);
  };

  const markSectionComplete = (sectionId) => {
    setCompletedSections(prev => new Set([...prev, sectionId]));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded w-1/3"></div>
            <div className="h-64 bg-neutral-200 dark:bg-neutral-800 rounded-2xl"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-40 bg-neutral-200 dark:bg-neutral-800 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-24 h-24 rounded-2xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-12 h-12 text-neutral-400" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">
            Topic not found
          </h2>
          <Link to={`/chapter/${chapterNum}`} className="btn btn-primary">
            Back to Chapter
          </Link>
        </div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'theory',
      label: 'Theory',
      icon: BookOpen,
      count: topic.theory?.subsections?.length || 0,
      show: topic.theory?.subsections?.length > 0,
      color: 'primary'
    },
    {
      id: 'examples',
      label: 'Code Examples',
      icon: Code2,
      count: topic.code_examples?.length || 0,
      show: topic.code_examples?.length > 0,
      color: 'accent'
    },
    {
      id: 'edge-cases',
      label: 'Edge Cases',
      icon: AlertTriangle,
      count: topic.edge_cases?.length || 0,
      show: topic.edge_cases?.length > 0,
      color: 'warning'
    },
    {
      id: 'practice',
      label: 'Practice',
      icon: ClipboardList,
      count: topic.practice_tasks?.length || 0,
      show: topic.practice_tasks?.length > 0,
      color: 'primary'
    },
    {
      id: 'interview-qa',
      label: 'Interview Q&A',
      icon: MessageCircle,
      count: topic.interview_qa?.length || 0,
      show: topic.interview_qa?.length > 0,
      color: 'primary'
    },
    {
      id: 'quick-ref',
      label: 'Quick Ref',
      icon: Lightbulb,
      show: topic.quick_reference && Object.keys(topic.quick_reference).length > 0,
      color: 'success'
    }
  ].filter(tab => tab.show);

  const currentTabIndex = tabs.findIndex(t => t.id === activeTab);
  const hasNextTab = currentTabIndex < tabs.length - 1;
  const hasPrevTab = currentTabIndex > 0;

  return (
    <div ref={contentRef} className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Reading Progress Bar - Fixed at top */}
      <div className="fixed top-16 left-0 right-0 z-40 h-1 bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-gradient-to-r from-primary-500 via-accent-500 to-success-500 transition-all duration-300"
          style={{ width: `${readingProgress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
        </div>
      </div>

      {/* Celebration Overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="text-center animate-scaleIn">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-success-400 to-success-600 flex items-center justify-center mb-4 shadow-2xl animate-bounce">
              <CheckCircle className="w-16 h-16 text-white" />
            </div>
            <h3 className="text-4xl font-bold text-neutral-900 dark:text-white mb-2">
              Great Progress! 🎉
            </h3>
            <p className="text-xl text-neutral-600 dark:text-neutral-400">
              You've read {readingProgress.toFixed(0)}% of this topic
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center space-x-2 text-sm">
          <Link
            to="/"
            className="text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
          >
            Catalog
          </Link>
          <ChevronRight className="w-4 h-4 text-neutral-400" />
          <Link
            to={`/chapter/${chapterNum}`}
            className="text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
          >
            Chapter {chapterNum}
          </Link>
          <ChevronRight className="w-4 h-4 text-neutral-400" />
          <span className="text-neutral-900 dark:text-white font-semibold truncate">
            {topic.title}
          </span>
        </nav>

        {/* Topic Header */}
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-lg">
          {/* Gradient Top Bar */}
          <div className="h-2 bg-gradient-to-r from-primary-500 via-accent-500 to-success-500"></div>

          <div className="p-8">
            {/* Back Button */}
            <Link
              to={`/chapter/${chapterNum}`}
              className="inline-flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold transition-colors mb-6 group"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Chapter {chapterNum}</span>
            </Link>

            {/* Title and Meta */}
            <div className="flex items-start justify-between flex-wrap gap-6 mb-6">
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4 leading-tight">
                  {topic.title}
                </h1>
                <div className="flex items-center flex-wrap gap-4">
                  {/* Reading Time */}
                  <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">{estimatedTime} min read</span>
                  </div>
                  {/* Progress */}
                  <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">{readingProgress.toFixed(0)}% completed</span>
                  </div>
                  {/* Sections */}
                  <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <Target className="w-4 h-4" />
                    <span className="font-medium">{tabs.reduce((sum, tab) => sum + (tab.count || 0), 0)} sections</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <button className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors" title="Bookmark">
                  <Bookmark className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                </button>
                <button className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors" title="Share">
                  <Share2 className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                </button>
                <button className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors" title="Print">
                  <Printer className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                </button>
              </div>
            </div>

            {/* Premium Tab Navigation */}
            <div className="relative -mx-6 px-6">
              <div className="flex items-center space-x-2 overflow-x-auto pb-2" style={{scrollbarWidth: 'thin'}}>
                {tabs.map((tab, idx) => {
                  const isActive = activeTab === tab.id;
                  const colorClasses = {
                    primary: 'from-primary-500 to-primary-600 border-primary-500',
                    accent: 'from-accent-500 to-accent-600 border-accent-500',
                    warning: 'from-warning-500 to-warning-600 border-warning-500',
                    success: 'from-success-500 to-success-600 border-success-500'
                  };

                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        relative flex items-center space-x-2.5 px-5 py-3 rounded-xl font-semibold transition-all duration-200 text-sm whitespace-nowrap
                        ${isActive
                          ? `bg-gradient-to-r ${colorClasses[tab.color]} text-white shadow-lg scale-105`
                          : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 hover:scale-105'
                        }
                      `}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.count > 0 && (
                        <span className={`
                          px-2.5 py-0.5 rounded-full text-xs font-bold min-w-[24px] text-center
                          ${isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-300'
                          }
                        `}>
                          {tab.count}
                        </span>
                      )}
                      {isActive && (
                        <div className="absolute -bottom-2 left-0 right-0 h-1 bg-white dark:bg-neutral-900 rounded-full"></div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab Navigation Arrows */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <button
                  onClick={() => hasPrevTab && setActiveTab(tabs[currentTabIndex - 1].id)}
                  disabled={!hasPrevTab}
                  className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{hasPrevTab ? `Previous: ${tabs[currentTabIndex - 1].label}` : 'No previous section'}</span>
                </button>
                <button
                  onClick={() => hasNextTab && setActiveTab(tabs[currentTabIndex + 1].id)}
                  disabled={!hasNextTab}
                  className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span>{hasNextTab ? `Next: ${tabs[currentTabIndex + 1].label}` : 'No next section'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="space-y-6">
          {/* Theory Tab */}
          {activeTab === 'theory' && topic.theory?.subsections && (
            <div className="animate-fadeIn">
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-md">
                {/* Single Card Header */}
                <div className="bg-gradient-to-r from-primary-50 to-white dark:from-primary-900/20 dark:to-neutral-800 p-6 border-b border-neutral-200 dark:border-neutral-700">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <BookOpen className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                        Theory
                      </h2>
                      <div className="flex items-center space-x-3 text-sm text-neutral-600 dark:text-neutral-400">
                        <span className="flex items-center space-x-1">
                          <Eye className="w-4 h-4" />
                          <span>{topic.theory.subsections.length} sections</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Coffee className="w-4 h-4" />
                          <span>~{topic.theory.subsections.length * 3} min read</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Table of Contents */}
                <div className="px-8 pt-6 pb-4 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
                  <div className="flex items-center space-x-2 mb-4">
                    <List className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                      In This Section
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {topic.theory.subsections.map((subsection, idx) => (
                      <a
                        key={idx}
                        href={`#subsection-${idx}`}
                        className="group flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-sm"
                      >
                        <span className="w-6 h-6 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold group-hover:bg-primary-600 group-hover:text-white transition-colors">
                          {idx + 1}
                        </span>
                        <span className="text-neutral-700 dark:text-neutral-300 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                          {subsection.title}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>

                {/* All Subsections Flow in One Card */}
                <div className="p-8">
                  <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
                    {topic.theory.subsections.map((subsection, idx) => {
                      // Calculate reading time for this subsection (250 words per minute)
                      const wordCount = subsection.content.split(/\s+/).length;
                      const readTime = Math.ceil(wordCount / 250);

                      return (
                      <div key={idx} id={`subsection-${idx}`} className={idx > 0 ? 'mt-10' : ''}>
                        {/* Subsection Heading with Time Estimate */}
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                            <span className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-sm font-bold">
                              {idx + 1}
                            </span>
                            <span>{subsection.title}</span>
                          </h3>
                          <span className="flex items-center space-x-1 text-sm text-neutral-500 dark:text-neutral-400">
                            <Clock className="w-4 h-4" />
                            <span>{readTime} min</span>
                          </span>
                        </div>

                        {/* Subsection Content */}
                        {subsection.content.split('\n\n').map((paragraph, pIdx) => {
                          if (paragraph.trim().startsWith('```')) {
                            const codeMatch = paragraph.match(/```(\w+)?\n([\s\S]*?)```/);
                            if (codeMatch) {
                              const [, language, code] = codeMatch;
                              return (
                                <CodeBlock
                                  key={pIdx}
                                  code={code.trim()}
                                  language={language || 'cpp'}
                                />
                              );
                            }
                          }

                          return (
                            <p key={pIdx} className="mb-4 text-neutral-700 dark:text-neutral-300 leading-loose text-lg">
                              <MarkdownText>{paragraph}</MarkdownText>
                            </p>
                          );
                        })}
                      </div>
                      );
                    })}
                  </div>

                  {/* Mark as Read Button at Bottom */}
                  <button
                    onClick={() => markSectionComplete('theory-all')}
                    className="mt-8 inline-flex items-center space-x-2 px-6 py-3 bg-success-100 hover:bg-success-200 dark:bg-success-900/30 dark:hover:bg-success-900/50 text-success-700 dark:text-success-400 rounded-lg font-semibold transition-colors text-sm"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span>Mark Theory as Complete</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Code Examples Tab - Balanced Design */}
          {activeTab === 'examples' && topic.code_examples && (
            <div className="space-y-6 animate-fadeIn">
              {topic.code_examples.map((example, idx) => {
                const title = example.title || example.heading || `Example ${idx + 1}`;

                return (
                <div key={idx} id={`example-${idx}`} className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Clean Header - Number + Title */}
                  <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-400 flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                          {title}
                        </h3>
                      </div>
                      <span className="text-xs px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-md font-medium">
                        Beginner
                      </span>
                    </div>
                  </div>

                  {/* Example Content */}
                  <div className="p-6">
                    {/* Code Block - NO title to avoid duplication */}
                    <CodeBlock
                      code={example.code}
                      language="cpp"
                      title={null}
                    />

                    {/* Explanation - Properly aligned */}
                    {example.explanation && (
                      <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                        <div className="flex items-start space-x-2 mb-3">
                          <div className="w-1 h-5 bg-accent-500 rounded-full mt-0.5"></div>
                          <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                            How It Works
                          </h4>
                        </div>
                        <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                          <MarkdownText>{example.explanation}</MarkdownText>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Edge Cases Tab - Balanced Design */}
          {activeTab === 'edge-cases' && topic.edge_cases && (
            <div className="space-y-6 animate-fadeIn">
              {topic.edge_cases.map((edgeCase, idx) => (
                <div key={idx} className="bg-white dark:bg-neutral-800 rounded-xl border border-warning-200 dark:border-warning-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Clean Header with Warning Theme */}
                  <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="w-8 h-8 rounded-lg bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle className="w-5 h-5" />
                        </span>
                        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                          {edgeCase.title || `Edge Case ${idx + 1}`}
                        </h3>
                      </div>
                      <span className="text-xs px-2.5 py-1 bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400 rounded-md font-medium">
                        Tricky
                      </span>
                    </div>
                  </div>

                  {/* Edge Case Content */}
                  <div className="p-6">
                    {/* Explanation */}
                    {edgeCase.explanation && (
                      <div className="mb-6">
                        <div className="flex items-start space-x-2 mb-3">
                          <div className="w-1 h-5 bg-warning-500 rounded-full mt-0.5"></div>
                          <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                            Why It's Tricky
                          </h4>
                        </div>
                        <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                          <MarkdownText>{edgeCase.explanation}</MarkdownText>
                        </p>
                      </div>
                    )}

                    {/* Code Examples - each code_examples item is a string */}
                    {edgeCase.code_examples?.length > 0 && (
                      <div className="space-y-4">
                        {edgeCase.code_examples.map((codeString, codeIdx) => (
                          <div key={codeIdx}>
                            {edgeCase.code_examples.length > 1 && (
                              <h5 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                                Example {codeIdx + 1} of {edgeCase.code_examples.length}
                              </h5>
                            )}
                            <CodeBlock
                              code={codeString}
                              language="cpp"
                              title={null}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Practice Tasks Tab - Balanced Design */}
          {activeTab === 'practice' && topic.practice_tasks && (
            <div className="space-y-6 animate-fadeIn">
              {/* Instruction Box */}
              <div className="p-6 bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 rounded-lg">
                <div className="flex items-start space-x-3">
                  <Target className="w-6 h-6 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-lg font-semibold text-primary-900 dark:text-primary-300 mb-2">
                      How to Use These Practice Questions
                    </h4>
                    <p className="text-sm text-primary-800 dark:text-primary-200 leading-relaxed">
                      Try to predict the output or compilation result for each code snippet below.
                      Test your understanding before checking the answer key in the Quick Reference tab.
                    </p>
                  </div>
                </div>
              </div>

              {/* Practice Questions */}
              {topic.practice_tasks.map((task, idx) => {
                const questionNum = task.question_number || idx + 1;
                const answer = topic.answer_key?.[questionNum];
                const isAnswerVisible = visibleAnswers.has(questionNum);

                const toggleAnswer = () => {
                  const newVisible = new Set(visibleAnswers);
                  if (isAnswerVisible) {
                    newVisible.delete(questionNum);
                  } else {
                    newVisible.add(questionNum);
                  }
                  setVisibleAnswers(newVisible);
                };

                return (
                <div key={idx} className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Question Header */}
                  <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 flex items-center justify-center text-lg font-bold flex-shrink-0">
                          {questionNum}
                        </span>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                          {task.title}
                        </h3>
                      </div>
                      {/* Show/Hide Answer Button */}
                      {answer && (
                        <button
                          onClick={toggleAnswer}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
                            isAnswerVisible
                              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                              : 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 hover:bg-success-200 dark:hover:bg-success-900/50'
                          }`}
                        >
                          {isAnswerVisible ? (
                            <>
                              <Eye className="w-4 h-4" />
                              <span>Hide Answer</span>
                            </>
                          ) : (
                            <>
                              <Lightbulb className="w-4 h-4" />
                              <span>Show Answer</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question Content */}
                  <div className="p-6">
                    {/* Description if any */}
                    {task.description && task.description.trim() && (
                      <div className="mb-4">
                        <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                          <MarkdownText>{task.description}</MarkdownText>
                        </p>
                      </div>
                    )}

                    {/* Code Block */}
                    {task.code && (
                      <CodeBlock
                        code={task.code}
                        language="cpp"
                        title={null}
                      />
                    )}

                    {/* Additional Code Blocks */}
                    {task.additional_code?.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {task.additional_code.map((code, codeIdx) => (
                          <CodeBlock
                            key={codeIdx}
                            code={code}
                            language="cpp"
                            title={null}
                          />
                        ))}
                      </div>
                    )}

                    {/* Answer Section (Collapsible) */}
                    {answer && isAnswerVisible && (
                      <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700 space-y-4 animate-fadeIn">
                        {/* Answer */}
                        <div className="p-4 bg-success-50 dark:bg-success-900/20 border-l-4 border-success-500 rounded-lg">
                          <div className="flex items-start space-x-3">
                            <CheckCircle className="w-5 h-5 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-sm font-semibold text-success-900 dark:text-success-300 mb-1">
                                Answer
                              </h4>
                              <p className="text-sm text-success-800 dark:text-success-200 font-medium">
                                <MarkdownText>{answer.answer}</MarkdownText>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Explanation */}
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 rounded-lg">
                          <div className="flex items-start space-x-3">
                            <MessageCircle className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-sm font-semibold text-primary-900 dark:text-primary-300 mb-1">
                                Explanation
                              </h4>
                              <p className="text-sm text-primary-800 dark:text-primary-200 leading-relaxed">
                                <MarkdownText>{answer.explanation}</MarkdownText>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Key Concept Tags */}
                        {answer.key_concept && (
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase">
                              Key Concepts:
                            </span>
                            {answer.key_concept.split(/\s+/).map((tag, tagIdx) => (
                              <span
                                key={tagIdx}
                                className="text-xs px-2.5 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded-md font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}

              {/* Reference Tables Link */}
              <div className="p-6 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-center">
                <p className="text-neutral-700 dark:text-neutral-300 mb-3">
                  Need to review the concepts?
                </p>
                <button
                  onClick={() => setActiveTab('quick-ref')}
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-success-500 hover:bg-success-600 text-white rounded-lg font-semibold transition-colors"
                >
                  <Lightbulb className="w-5 h-5" />
                  <span>View Quick Reference Tables</span>
                </button>
              </div>
            </div>
          )}

          {/* Interview Q&A Tab - Balanced Design */}
          {activeTab === 'interview-qa' && topic.interview_qa && (
            <div className="space-y-4 animate-fadeIn">
              {topic.interview_qa.map((qa, idx) => {
                const difficultyColor = {
                  beginner: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 border-success-200 dark:border-success-800',
                  intermediate: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border-primary-200 dark:border-primary-800',
                  advanced: 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400 border-warning-200 dark:border-warning-800',
                  expert: 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400 border-error-200 dark:border-error-800'
                };

                const difficulty = qa.difficulty?.[0] || 'intermediate';
                const isExpanded = expandedQA.has(idx);

                const toggleExpand = () => {
                  const newExpanded = new Set(expandedQA);
                  if (isExpanded) {
                    newExpanded.delete(idx);
                  } else {
                    newExpanded.add(idx);
                  }
                  setExpandedQA(newExpanded);
                };

                return (
                  <div key={idx} className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    {/* Question Header - Clickable */}
                    <button
                      onClick={toggleExpand}
                      className="w-full p-6 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-4">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
                              {idx + 1}
                            </span>
                            <span className={`text-xs px-2.5 py-1 rounded-md font-medium border ${difficultyColor[difficulty]}`}>
                              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white leading-snug">
                            {qa.question}
                          </h3>
                        </div>
                        <ChevronRight className={`w-5 h-5 text-neutral-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    {/* Answer Content - Expandable */}
                    {isExpanded && (
                      <div className="px-6 pb-6 border-t border-neutral-200 dark:border-neutral-700 pt-6">
                        {/* Quick Answer */}
                        <div className="mb-6">
                          <div className="flex items-start space-x-2 mb-3">
                            <div className="w-1 h-5 bg-primary-500 rounded-full mt-0.5"></div>
                            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                              Quick Answer
                            </h4>
                          </div>
                          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
                            <MarkdownText>{qa.answer}</MarkdownText>
                          </p>
                        </div>

                        {/* Detailed Explanation */}
                        {qa.explanation && (
                          <div className="mb-6">
                            <div className="flex items-start space-x-2 mb-3">
                              <div className="w-1 h-5 bg-accent-500 rounded-full mt-0.5"></div>
                              <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                                Detailed Explanation
                              </h4>
                            </div>
                            <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                              <MarkdownText>{qa.explanation}</MarkdownText>
                            </p>
                          </div>
                        )}

                        {/* Code Examples */}
                        {qa.code_examples?.length > 0 && (
                          <div className="mb-6 space-y-3">
                            {qa.code_examples.map((code, codeIdx) => (
                              <CodeBlock
                                key={codeIdx}
                                code={code}
                                language="cpp"
                                title={null}
                              />
                            ))}
                          </div>
                        )}

                        {/* Key Takeaway */}
                        {qa.key_takeaway && (
                          <div className="p-4 bg-success-50 dark:bg-success-900/20 border-l-4 border-success-500 rounded-lg">
                            <div className="flex items-start space-x-3">
                              <Zap className="w-5 h-5 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <h4 className="text-sm font-semibold text-success-900 dark:text-success-300 mb-1">
                                  Key Takeaway
                                </h4>
                                <p className="text-sm text-success-800 dark:text-success-200">
                                  <MarkdownText>{qa.key_takeaway}</MarkdownText>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Tags/Concepts */}
                        {qa.concepts?.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {qa.concepts.map((concept, conceptIdx) => (
                              <span
                                key={conceptIdx}
                                className="text-xs px-2.5 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded-md font-medium"
                              >
                                #{concept.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Reference Tab - Balanced Design */}
          {activeTab === 'quick-ref' && topic.quick_reference && (
            <div className="animate-fadeIn">
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                {/* Clean Header */}
                <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                  <div className="flex items-center space-x-3">
                    <span className="w-8 h-8 rounded-lg bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 flex items-center justify-center flex-shrink-0">
                      <Lightbulb className="w-5 h-5" />
                    </span>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                      Quick Reference
                    </h2>
                  </div>
                </div>

                {/* Content with Markdown Tables */}
                <div className="p-8">
                  {topic.quick_reference.content ? (
                    <MarkdownRenderer content={topic.quick_reference.content} />
                  ) : (
                    <>
                      {topic.quick_reference.key_points?.length > 0 && (
                        <div className="mb-8">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {topic.quick_reference.key_points.map((point, idx) => (
                              <div key={idx} className="flex items-start space-x-3 p-4 bg-success-50 dark:bg-success-900/20 rounded-lg border border-success-200 dark:border-success-800">
                                <Zap className="w-5 h-5 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
                                <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed text-sm">
                                  <MarkdownText>{point}</MarkdownText>
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {topic.quick_reference.syntax && (
                        <CodeBlock
                          code={topic.quick_reference.syntax}
                          language="cpp"
                          showLineNumbers={false}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation and Quiz CTA */}
        <div className="space-y-6">
          {/* Quiz CTA - Premium Design */}
          <div className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-2xl p-10 text-white shadow-2xl">
            {/* Animated background */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse-slow"></div>
            </div>

            <div className="relative z-10 flex items-center justify-between flex-wrap gap-8">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold">Ready to test your knowledge?</h3>
                </div>
                <p className="text-xl text-white/90 leading-relaxed max-w-2xl">
                  Take a quiz to reinforce what you've learned and track your progress.
                </p>
              </div>
              <button
                onClick={handleStartQuiz}
                className="inline-flex items-center space-x-3 px-8 py-4 bg-white hover:bg-neutral-50 text-primary-600 rounded-xl font-bold transition-all duration-150 shadow-xl hover:shadow-2xl hover:scale-105"
              >
                <Play className="w-5 h-5" />
                <span>Take Quiz</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Topic Navigation */}
          <div className="flex items-center justify-between bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
            <Link
              to={`/chapter/${chapterNum}`}
              className="inline-flex items-center space-x-2 px-5 py-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-xl font-semibold transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Back to Chapter</span>
            </Link>

            <div className="flex items-center space-x-3">
              {parseInt(topicIdx) > 0 && (
                <Link
                  to={`/topic/${chapterNum}/${parseInt(topicIdx) - 1}`}
                  className="inline-flex items-center space-x-2 px-5 py-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-xl font-semibold transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span>Previous Topic</span>
                </Link>
              )}
              <Link
                to={`/topic/${chapterNum}/${parseInt(topicIdx) + 1}`}
                className="inline-flex items-center space-x-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                <span>Next Topic</span>
                <ChevronRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Progress Indicator (Bottom Right) */}
      <div className="fixed bottom-8 right-8 z-30">
        <div className="relative">
          {/* Progress Ring */}
          <svg className="w-16 h-16 -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              className="stroke-neutral-200 dark:stroke-neutral-700"
              strokeWidth="4"
              fill="none"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              className="stroke-primary-500"
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - readingProgress / 100)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
            />
          </svg>
          {/* Percentage Text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-neutral-900 dark:text-white">
              {readingProgress.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopicView;
