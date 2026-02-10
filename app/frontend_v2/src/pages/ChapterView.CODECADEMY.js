import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BookOpen, Play, CheckCircle2, Circle, ArrowRight,
  Code2, AlertTriangle, MessageSquare, ChevronLeft,
  Trophy, Clock
} from 'lucide-react';
import { apiService } from '../utils/api';

/**
 * Codecademy-Inspired Chapter View
 * Features:
 * - Beautiful topic cards with stats
 * - Visual progress indicators
 * - Better hover states
 * - Icons for each content type
 * - Completion status badges
 * - Smooth animations
 */
const ChapterView = () => {
  const { chapterNum } = useParams();
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (chapterNum) {
      loadChapter();
    } else {
      setLoading(false);
    }
  }, [chapterNum]);

  const loadChapter = async () => {
    if (!chapterNum) {
      setLoading(false);
      return;
    }

    try {
      const response = await apiService.getChapter(chapterNum);
      const data = response.data;

      // Transform API data
      const transformedChapter = {
        chapter_number: data.chapter_number,
        title: data.chapter_name
          .replace(/chapter_\d+_/i, '')
          .replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        description: 'Master the concepts with interactive learning',
        topics: (data.topics || []).map(topic => ({
          title: topic.topic,
          progress: topic.progress?.completed ? 100 : (topic.progress?.score || 0),
          theory_subsections: topic.theory_count || 0,
          code_examples: topic.examples_count || 0,
          edge_cases: topic.edge_cases_count || 0,
          interview_qa: topic.questions_count || 0
        })),
        progress: 0
      };

      // Calculate overall progress
      const completedTopics = transformedChapter.topics.filter(t => t.progress === 100).length;
      transformedChapter.progress = transformedChapter.topics.length > 0
        ? (completedTopics / transformedChapter.topics.length) * 100
        : 0;

      setChapter(transformedChapter);
    } catch (error) {
      console.error('Failed to load chapter:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-48 bg-neutral-200 dark:bg-neutral-800 rounded-2xl"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-neutral-200 dark:bg-neutral-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-6">
          <BookOpen className="w-10 h-10 text-neutral-400" />
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
          Chapter not found
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          The chapter you're looking for doesn't exist or hasn't been loaded yet.
        </p>
        <Link to="/" className="inline-flex items-center px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-all duration-150 shadow-md hover:shadow-lg hover:-translate-y-0.5">
          Back to Catalog
        </Link>
      </div>
    );
  }

  const progress = chapter.progress || 0;
  const completedTopics = chapter.topics?.filter(t => t.progress === 100).length || 0;
  const totalTopics = chapter.topics?.length || 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      {/* Back Navigation */}
      <Link
        to="/"
        className="inline-flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold transition-colors duration-150"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back to Catalog</span>
      </Link>

      {/* Chapter Header - Codecademy Style */}
      <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-md">
        {/* Top Section with Gradient */}
        <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 p-8 text-white">
          {/* Background Pattern (optional decoration) */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl transform translate-x-32 -translate-y-32"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl transform -translate-x-48 translate-y-48"></div>
          </div>

          {/* Content */}
          <div className="relative z-10 flex items-start space-x-6">
            {/* Chapter Number Badge */}
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center flex-shrink-0 shadow-xl">
              <span className="text-4xl font-bold">{chapterNum}</span>
            </div>

            {/* Chapter Info */}
            <div className="flex-1">
              <div className="mb-2">
                <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-xs font-bold rounded-full border border-white/30">
                  Chapter {chapterNum}
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-3 leading-tight">
                {chapter.title}
              </h1>
              <p className="text-xl text-white/90 leading-relaxed">
                {chapter.description || 'Master the concepts with interactive learning'}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="p-8 border-t border-neutral-200 dark:border-neutral-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Completed Topics */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-success-600 dark:text-success-400" />
              </div>
              <div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Completed</div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {completedTopics}/{totalTopics}
                </div>
              </div>
            </div>

            {/* Progress Percentage */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Progress</div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {progress.toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Estimated Time */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
                <Clock className="w-6 h-6 text-accent-600 dark:text-accent-400" />
              </div>
              <div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Time</div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {totalTopics * 2}h
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600 dark:text-neutral-400 font-medium">
                Chapter Progress
              </span>
              <span className="font-bold text-primary-600 dark:text-primary-400">
                {progress.toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-600 to-primary-700 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Topics Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Topics ({totalTopics})
          </h2>
          {completedTopics > 0 && (
            <span className="text-sm text-neutral-600 dark:text-neutral-400 font-medium">
              {completedTopics} completed
            </span>
          )}
        </div>

        {/* Topics List */}
        <div className="space-y-4">
          {chapter.topics?.map((topic, idx) => {
            const topicProgress = topic.progress || 0;
            const isCompleted = topicProgress === 100;
            const isInProgress = topicProgress > 0 && topicProgress < 100;

            return (
              <Link
                key={idx}
                to={`/topic/${chapterNum}/${idx}`}
                className="group block bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden hover:border-primary-500 dark:hover:border-primary-600 hover:shadow-xl transition-all duration-150 hover:-translate-y-0.5"
              >
                <div className="p-6">
                  <div className="flex items-start space-x-4">
                    {/* Status Icon */}
                    <div className="flex-shrink-0 mt-1">
                      {isCompleted ? (
                        <div className="w-10 h-10 rounded-xl bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-success-600 dark:text-success-400" />
                        </div>
                      ) : isInProgress ? (
                        <div className="w-10 h-10 rounded-xl border-2 border-primary-600 dark:border-primary-500 bg-white dark:bg-neutral-800 flex items-center justify-center relative overflow-hidden">
                          <div
                            className="absolute inset-0 bg-primary-600/20"
                            style={{ height: `${topicProgress}%`, bottom: 0, top: 'auto' }}
                          />
                          <Circle className="w-5 h-5 text-primary-600 dark:text-primary-400 relative z-10" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 flex items-center justify-center">
                          <Circle className="w-5 h-5 text-neutral-300 dark:text-neutral-600" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Title Row */}
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-snug pr-4">
                          {idx + 1}. {topic.title}
                        </h3>
                        <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {/* Theory */}
                        {topic.theory_subsections > 0 && (
                          <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
                            <BookOpen className="w-4 h-4 text-neutral-400" />
                            <span className="font-medium">{topic.theory_subsections} theory</span>
                          </div>
                        )}

                        {/* Code Examples */}
                        {topic.code_examples > 0 && (
                          <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
                            <Code2 className="w-4 h-4 text-neutral-400" />
                            <span className="font-medium">{topic.code_examples} examples</span>
                          </div>
                        )}

                        {/* Edge Cases */}
                        {topic.edge_cases > 0 && (
                          <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
                            <AlertTriangle className="w-4 h-4 text-neutral-400" />
                            <span className="font-medium">{topic.edge_cases} edge cases</span>
                          </div>
                        )}

                        {/* Interview Questions */}
                        {topic.interview_qa > 0 && (
                          <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
                            <MessageSquare className="w-4 h-4 text-neutral-400" />
                            <span className="font-medium">{topic.interview_qa} questions</span>
                          </div>
                        )}
                      </div>

                      {/* Progress Bar (only if in progress) */}
                      {isInProgress && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                              Progress
                            </span>
                            <span className="font-bold text-primary-600 dark:text-primary-400">
                              {topicProgress.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary-600 to-primary-700 rounded-full transition-all duration-500"
                              style={{ width: `${topicProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Completed Badge */}
                      {isCompleted && (
                        <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 rounded-full text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completed</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom CTA - Start Learning */}
      {progress === 0 && totalTopics > 0 && (
        <div className="bg-gradient-to-br from-primary-50 to-beige-50 dark:from-primary-900/10 dark:to-neutral-800 rounded-2xl border border-primary-200 dark:border-primary-900/30 p-8">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                Ready to start learning?
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Begin with the first topic and work your way through {totalTopics} comprehensive lessons.
              </p>
            </div>
            <Link
              to={`/topic/${chapterNum}/0`}
              className="inline-flex items-center space-x-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold transition-all duration-150 shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              <Play className="w-5 h-5" />
              <span>Start First Topic</span>
            </Link>
          </div>
        </div>
      )}

      {/* Continue Learning CTA */}
      {progress > 0 && progress < 100 && (
        <div className="bg-gradient-to-br from-primary-50 to-beige-50 dark:from-primary-900/10 dark:to-neutral-800 rounded-2xl border border-primary-200 dark:border-primary-900/30 p-8">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                Keep up the momentum!
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                You're {progress.toFixed(0)}% through this chapter. Continue where you left off.
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Link
                to="/"
                className="inline-flex items-center space-x-2 px-5 py-3 bg-white dark:bg-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-xl font-semibold transition-all duration-150 border border-neutral-200 dark:border-neutral-600"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>All Chapters</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterView;
