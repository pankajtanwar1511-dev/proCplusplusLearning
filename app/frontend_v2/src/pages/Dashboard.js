import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Award, BookOpen } from 'lucide-react';

const Dashboard = ({ chapters }) => {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumbs */}
      <div className="text-sm text-primary-600 dark:text-primary-400 mb-8 font-medium">
        Catalog
      </div>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-5xl font-bold text-neutral-900 dark:text-white mb-6">
          C++ courses
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-4xl leading-relaxed">
          Master C++ from fundamentals to advanced topics. Build real-world skills with hands-on projects, quizzes, and interactive coding exercises.
        </p>
      </div>

      {/* Course Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {chapters.map((chapter) => {
          const topicCount = chapter.topics?.length || 0;
          const progress = chapter.progress || 0;

          return (
            <Link
              key={chapter.chapter_number}
              to={`/chapter/${chapter.chapter_number}`}
              className="group bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden hover:border-primary-500 hover:shadow-lg transition-all"
            >
              {/* Course Header */}
              <div className="p-6 border-b border-neutral-200 dark:border-neutral-700 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-neutral-800">
                <div className="flex items-start justify-between mb-3">
                  <span className="px-3 py-1 bg-white dark:bg-neutral-800 text-primary-600 text-xs font-semibold rounded-full border border-primary-200 dark:border-primary-800">
                    Free course
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm">
                    {chapter.chapter_number}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {chapter.title}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                  {chapter.description || 'Master essential C++ concepts with interactive lessons and quizzes'}
                </p>
              </div>

              {/* Course Info */}
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Skill level</div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white">Beginner</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Time</div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{topicCount * 2} hours</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">Lessons</span>
                    <span className="font-medium text-neutral-900 dark:text-white">{topicCount} lessons</span>
                  </div>
                  {progress > 0 && (
                    <>
                      <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {progress.toFixed(0)}% complete
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
  );
};

export default Dashboard;
