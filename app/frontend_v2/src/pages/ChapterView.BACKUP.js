import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BookOpen, Play, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { apiService } from '../utils/api';

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

      // Transform API data to match component expectations
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

      setChapter(transformedChapter);
    } catch (error) {
      console.error('Failed to load chapter:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="skeleton w-full max-w-4xl h-96"></div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-600 dark:text-neutral-400">Chapter not found</p>
      </div>
    );
  }

  const progress = chapter.progress || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Chapter Header */}
      <div className="card">
        <div className="flex items-start space-x-4 mb-6">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
            {chapterNum}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2 text-neutral-900 dark:text-neutral-50">
              {chapter.title}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              {chapter.description || 'Master the concepts with interactive learning'}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-neutral-600 dark:text-neutral-400">
            Chapter Progress
          </span>
          <span className="font-medium text-primary-600 dark:text-primary-400">
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Topics */}
      <div>
        <h2 className="text-2xl font-bold mb-6 text-neutral-900 dark:text-neutral-50">
          Topics ({chapter.topics?.length || 0})
        </h2>

        <div className="space-y-4">
          {chapter.topics?.map((topic, idx) => {
            const topicProgress = topic.progress || 0;
            const isCompleted = topicProgress === 100;

            return (
              <Link
                key={idx}
                to={`/topic/${chapterNum}/${idx}`}
                className="card card-hover group"
              >
                <div className="flex items-start space-x-4">
                  {/* Status Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {isCompleted ? (
                      <CheckCircle2 className="w-6 h-6 text-success-600 dark:text-success-400" />
                    ) : topicProgress > 0 ? (
                      <div className="w-6 h-6 rounded-full border-2 border-primary-600 relative">
                        <div
                          className="absolute inset-0 bg-primary-600 rounded-full transition-all"
                          style={{ clipPath: `inset(${100 - topicProgress}% 0 0 0)` }}
                        />
                      </div>
                    ) : (
                      <Circle className="w-6 h-6 text-neutral-300 dark:text-neutral-600" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {idx + 1}. {topic.title}
                      </h3>
                      <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:translate-x-1 transition-all flex-shrink-0 ml-4" />
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-4 text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                      {topic.theory_subsections > 0 && (
                        <span className="flex items-center space-x-1">
                          <BookOpen className="w-4 h-4" />
                          <span>{topic.theory_subsections} theory sections</span>
                        </span>
                      )}
                      {topic.code_examples > 0 && (
                        <span>{topic.code_examples} code examples</span>
                      )}
                      {topic.edge_cases > 0 && (
                        <span>{topic.edge_cases} edge cases</span>
                      )}
                      {topic.interview_qa > 0 && (
                        <span>{topic.interview_qa} interview questions</span>
                      )}
                    </div>

                    {/* Progress */}
                    {topicProgress > 0 && (
                      <>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-neutral-500 dark:text-neutral-500">
                            Progress
                          </span>
                          <span className="font-medium text-primary-600 dark:text-primary-400">
                            {topicProgress.toFixed(0)}%
                          </span>
                        </div>
                        <div className="progress-bar h-1.5">
                          <div
                            className="progress-fill"
                            style={{ width: `${topicProgress}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChapterView;
