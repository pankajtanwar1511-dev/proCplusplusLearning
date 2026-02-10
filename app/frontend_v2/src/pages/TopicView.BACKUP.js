import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, Code2, AlertTriangle, Lightbulb, Play,
  ChevronLeft, ChevronRight, CheckCircle
} from 'lucide-react';
import { apiService } from '../utils/api';
import CodeBlock from '../components/common/CodeBlock';

const TopicView = () => {
  const { chapterNum, topicIdx } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('theory');

  useEffect(() => {
    if (chapterNum && topicIdx !== undefined) {
      loadTopic();
    } else {
      setLoading(false);
    }
  }, [chapterNum, topicIdx]);

  const loadTopic = async () => {
    try {
      const response = await apiService.getTopic(chapterNum, topicIdx);
      const data = response.data;

      // Transform the data to include title
      const topicData = {
        title: data.topic,
        theory: data.theory,
        code_examples: data.code_examples,
        edge_cases: data.edge_cases,
        quick_reference: data.quick_reference
      };

      setTopic(topicData);

      // Auto-select first available tab with content
      if (data.theory && data.theory.subsections && data.theory.subsections.length > 0) {
        setActiveTab('theory');
      } else if (data.code_examples && data.code_examples.length > 0) {
        setActiveTab('examples');
      } else if (data.edge_cases && data.edge_cases.length > 0) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">Topic not found</p>
        <Link to={`/chapter/${chapterNum}`} className="btn btn-primary">
          Back to Chapter
        </Link>
      </div>
    );
  }

  const tabs = [
    {
      id: 'theory',
      label: 'Theory',
      icon: BookOpen,
      count: topic.theory?.subsections?.length || 0,
      show: topic.theory && topic.theory.subsections && topic.theory.subsections.length > 0
    },
    {
      id: 'examples',
      label: 'Code Examples',
      icon: Code2,
      count: topic.code_examples?.length || 0,
      show: topic.code_examples && topic.code_examples.length > 0
    },
    {
      id: 'edge-cases',
      label: 'Edge Cases',
      icon: AlertTriangle,
      count: topic.edge_cases?.length || 0,
      show: topic.edge_cases && topic.edge_cases.length > 0
    },
    {
      id: 'quick-ref',
      label: 'Quick Reference',
      icon: Lightbulb,
      show: topic.quick_reference && Object.keys(topic.quick_reference).length > 0
    }
  ].filter(tab => tab.show);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="card">
        <Link
          to={`/chapter/${chapterNum}`}
          className="inline-flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Chapter {chapterNum}</span>
        </Link>

        <h1 className="text-3xl font-bold mb-4 text-neutral-900 dark:text-neutral-50">
          {topic.title || 'Topic'}
        </h1>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all text-sm
                ${activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
                }
              `}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`
                  px-2 py-0.5 rounded-full text-xs font-semibold
                  ${activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-300'
                  }
                `}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Progress Hint */}
        <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400 bg-primary-50 dark:bg-primary-900/20 px-4 py-2 rounded-lg">
          <CheckCircle className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          <span>Review all sections before taking the quiz for best results</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="space-y-6">
        {/* Theory Tab */}
        {activeTab === 'theory' && topic.theory && topic.theory.subsections && (
          <div className="space-y-6">
            {topic.theory.subsections.map((subsection, idx) => (
              <div key={idx} className="card">
                <div className="flex items-start space-x-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 flex-1">
                    {subsection.heading}
                  </h2>
                </div>

                <div className="prose prose-neutral dark:prose-invert max-w-none">
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
                      <p key={pIdx} className="mb-4 text-neutral-700 dark:text-neutral-300 leading-relaxed text-base">
                        {paragraph}
                      </p>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Code Examples Tab */}
        {activeTab === 'examples' && topic.code_examples && (
          <div className="space-y-6">
            {topic.code_examples.map((example, idx) => (
              <div key={idx} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                      <Code2 className="w-5 h-5 text-accent-600 dark:text-accent-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
                        {example.heading || `Example ${idx + 1}`}
                      </h3>
                      {example.description && (
                        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                          {example.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {example.difficulty && (
                    <span className="badge badge-primary text-xs ml-4 flex-shrink-0">
                      {example.difficulty}
                    </span>
                  )}
                </div>

                <CodeBlock
                  code={example.code}
                  language="cpp"
                  title={example.heading}
                />

                {example.explanation && (
                  <div className="mt-4 p-4 bg-accent-50 dark:bg-accent-900/20 rounded-lg border-l-4 border-accent-500">
                    <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2 flex items-center space-x-2">
                      <Lightbulb className="w-4 h-4 text-accent-600" />
                      <span>Explanation</span>
                    </h4>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      {example.explanation}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Edge Cases Tab */}
        {activeTab === 'edge-cases' && topic.edge_cases && (
          <div className="space-y-6">
            {topic.edge_cases.map((edgeCase, idx) => (
              <div key={idx} className="card border-l-4 border-warning-500">
                <div className="flex items-start space-x-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                    <AlertTriangle className="w-5 h-5 text-warning-600 dark:text-warning-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
                      {edgeCase.title || `Edge Case ${idx + 1}`}
                    </h3>
                    {edgeCase.explanation && (
                      <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                        {edgeCase.explanation}
                      </p>
                    )}
                  </div>
                </div>

                {edgeCase.code_examples && edgeCase.code_examples.length > 0 && (
                  <div className="space-y-4">
                    {edgeCase.code_examples.map((example, exIdx) => (
                      <div key={exIdx}>
                        {example.heading && (
                          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
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
                          <div className="mt-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
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
          <div className="card">
            <div className="flex items-start space-x-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
                  Quick Reference
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400">
                  Essential concepts at a glance
                </p>
              </div>
            </div>

            {topic.quick_reference.key_points && topic.quick_reference.key_points.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {topic.quick_reference.key_points.map((point, idx) => (
                  <div key={idx} className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                    <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed text-sm">
                      • {point}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {topic.quick_reference.syntax && (
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
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
        )}
      </div>

      {/* Bottom Navigation and Quiz CTA */}
      <div className="space-y-4">
        {/* Quiz CTA - Less prominent, at bottom */}
        <div className="card bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 border border-primary-200 dark:border-primary-800">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
                Ready to test your knowledge?
              </h3>
              <p className="text-neutral-700 dark:text-neutral-300 text-sm">
                Take a quiz to reinforce what you've learned
              </p>
            </div>
            <button
              onClick={handleStartQuiz}
              className="btn btn-primary flex items-center space-x-2"
            >
              <Play className="w-4 h-4" />
              <span>Take Quiz</span>
            </button>
          </div>
        </div>

        {/* Topic Navigation */}
        <div className="flex items-center justify-between">
          <Link
            to={`/chapter/${chapterNum}`}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Chapter</span>
          </Link>

          <div className="flex items-center space-x-2">
            {parseInt(topicIdx) > 0 && (
              <Link
                to={`/topic/${chapterNum}/${parseInt(topicIdx) - 1}`}
                className="btn btn-secondary"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
            )}
            <Link
              to={`/topic/${chapterNum}/${parseInt(topicIdx) + 1}`}
              className="btn btn-secondary"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopicView;
