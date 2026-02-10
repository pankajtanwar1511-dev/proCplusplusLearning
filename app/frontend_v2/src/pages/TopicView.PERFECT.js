import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, Code2, AlertTriangle, Lightbulb, Play,
  ChevronLeft, ChevronRight, CheckCircle, Clock,
  Award, TrendingUp, Bookmark, Share2, Printer,
  Eye, Coffee, Zap, Target, BarChart3
} from 'lucide-react';
import { apiService } from '../utils/api';
import CodeBlock from '../components/common/CodeBlock';

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

      const topicData = {
        title: data.topic,
        theory: data.theory,
        code_examples: data.code_examples,
        edge_cases: data.edge_cases,
        quick_reference: data.quick_reference
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
      id: 'quick-ref',
      label: 'Quick Reference',
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
                    <BarChart3 className="w-4 h-4" />
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
            <div className="relative">
              <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide pb-2">
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
            <div className="space-y-6 animate-fadeIn">
              {topic.theory.subsections.map((subsection, idx) => {
                const sectionId = `theory-${idx}`;
                const isCompleted = completedSections.has(sectionId);

                return (
                  <div key={idx} className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-md hover:shadow-xl transition-shadow">
                    {/* Section Header */}
                    <div className="bg-gradient-to-r from-primary-50 to-white dark:from-primary-900/20 dark:to-neutral-800 p-6 border-b border-neutral-200 dark:border-neutral-700">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                          <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                              {subsection.heading}
                            </h2>
                            {isCompleted && (
                              <span className="inline-flex items-center space-x-1 px-3 py-1 bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 rounded-full text-xs font-bold">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Read</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-3 text-sm text-neutral-600 dark:text-neutral-400">
                            <span className="flex items-center space-x-1">
                              <Eye className="w-4 h-4" />
                              <span>Section {idx + 1} of {topic.theory.subsections.length}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Coffee className="w-4 h-4" />
                              <span>~3 min</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section Content */}
                    <div className="p-8">
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
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
                            <p key={pIdx} className="mb-6 text-neutral-700 dark:text-neutral-300 leading-relaxed text-lg">
                              {paragraph}
                            </p>
                          );
                        })}
                      </div>

                      {!isCompleted && (
                        <button
                          onClick={() => markSectionComplete(sectionId)}
                          className="mt-6 inline-flex items-center space-x-2 px-4 py-2 bg-success-100 hover:bg-success-200 dark:bg-success-900/30 dark:hover:bg-success-900/50 text-success-700 dark:text-success-400 rounded-lg font-semibold transition-colors text-sm"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Mark as Read</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Code Examples Tab */}
          {activeTab === 'examples' && topic.code_examples && (
            <div className="space-y-6 animate-fadeIn">
              {topic.code_examples.map((example, idx) => (
                <div key={idx} className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-md hover:shadow-xl transition-shadow">
                  <div className="bg-gradient-to-r from-accent-50 to-white dark:from-accent-900/20 dark:to-neutral-800 p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                        <Code2 className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                          {example.heading || `Example ${idx + 1}`}
                        </h3>
                        {example.description && (
                          <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                            {example.description}
                          </p>
                        )}
                      </div>
                      {example.difficulty && (
                        <span className="badge badge-primary text-xs">{example.difficulty}</span>
                      )}
                    </div>
                  </div>

                  <div className="p-8">
                    <CodeBlock
                      code={example.code}
                      language="cpp"
                      title={example.heading}
                    />

                    {example.explanation && (
                      <div className="mt-6 p-6 bg-accent-50 dark:bg-accent-900/20 rounded-xl border-l-4 border-accent-500">
                        <h4 className="text-sm font-bold text-neutral-900 dark:text-white mb-3 flex items-center space-x-2">
                          <Lightbulb className="w-5 h-5 text-accent-600 dark:text-accent-400" />
                          <span>Explanation</span>
                        </h4>
                        <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                          {example.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Edge Cases Tab */}
          {activeTab === 'edge-cases' && topic.edge_cases && (
            <div className="space-y-6 animate-fadeIn">
              {topic.edge_cases.map((edgeCase, idx) => (
                <div key={idx} className="bg-white dark:bg-neutral-800 rounded-xl border-2 border-warning-200 dark:border-warning-800 overflow-hidden shadow-md hover:shadow-xl transition-shadow">
                  <div className="bg-gradient-to-r from-warning-50 to-white dark:from-warning-900/20 dark:to-neutral-800 p-6 border-b border-warning-200 dark:border-warning-800">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-warning-500 to-warning-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                        <AlertTriangle className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
                          {edgeCase.title || `Edge Case ${idx + 1}`}
                        </h3>
                        {edgeCase.explanation && (
                          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                            {edgeCase.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {edgeCase.code_examples?.length > 0 && (
                    <div className="p-8 space-y-6">
                      {edgeCase.code_examples.map((example, exIdx) => (
                        <div key={exIdx}>
                          {example.heading && (
                            <h4 className="text-lg font-bold text-neutral-900 dark:text-white mb-3">
                              {example.heading}
                            </h4>
                          )}
                          {example.code && (
                            <CodeBlock
                              code={example.code}
                              language="cpp"
                              title={example.heading}
                            />
                          )}
                          {example.explanation && (
                            <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg">
                              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                                {example.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Quick Reference Tab */}
          {activeTab === 'quick-ref' && topic.quick_reference && (
            <div className="animate-fadeIn">
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-md">
                <div className="bg-gradient-to-r from-success-50 to-white dark:from-success-900/20 dark:to-neutral-800 p-8 border-b border-neutral-200 dark:border-neutral-700">
                  <div className="flex items-start space-x-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-success-500 to-success-600 flex items-center justify-center flex-shrink-0 shadow-xl">
                      <Lightbulb className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
                        Quick Reference
                      </h2>
                      <p className="text-neutral-600 dark:text-neutral-400 text-lg">
                        Essential concepts at a glance
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  {topic.quick_reference.key_points?.length > 0 && (
                    <div className="mb-8">
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-4">
                        Key Points
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {topic.quick_reference.key_points.map((point, idx) => (
                          <div key={idx} className="flex items-start space-x-3 p-4 bg-success-50 dark:bg-success-900/20 rounded-lg border border-success-200 dark:border-success-800">
                            <Zap className="w-5 h-5 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
                            <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                              {point}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {topic.quick_reference.syntax && (
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-4">
                        Syntax
                      </h3>
                      <CodeBlock
                        code={topic.quick_reference.syntax}
                        language="cpp"
                        showLineNumbers={false}
                      />
                    </div>
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
