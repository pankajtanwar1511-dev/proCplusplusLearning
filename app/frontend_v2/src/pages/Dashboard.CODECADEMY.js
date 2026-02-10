import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Award, BookOpen, ArrowRight, Star } from 'lucide-react';

/**
 * Codecademy-Inspired Dashboard
 * Features:
 * - Clean, spacious card design
 * - Consistent 16px border radius
 * - Subtle shadows and hover effects
 * - 150ms transitions (Codecademy standard)
 * - Better visual hierarchy
 */
const Dashboard = ({ chapters }) => {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Breadcrumb Navigation */}
      <div className="text-sm text-primary-600 dark:text-primary-400 mb-8 font-semibold">
        Catalog
      </div>

      {/* Page Header - Codecademy style */}
      <div className="mb-16">
        <h1 className="text-5xl md:text-6xl font-bold text-neutral-900 dark:text-white mb-8 tracking-tight leading-tight">
          C++ courses
        </h1>
        <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-3xl leading-relaxed">
          Master C++ from fundamentals to advanced topics. Build real-world skills with hands-on projects, quizzes, and interactive coding exercises.
        </p>
      </div>

      {/* Course Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {chapters.map((chapter) => {
          const topicCount = chapter.topics?.length || 0;
          const progress = chapter.progress || 0;
          const isStarted = progress > 0;
          const isCompleted = progress === 100;

          return (
            <Link
              key={chapter.chapter_number}
              to={`/chapter/${chapter.chapter_number}`}
              className="group bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden hover:border-primary-500 dark:hover:border-primary-600 hover:shadow-xl transition-all duration-150 hover:-translate-y-1 active:translate-y-0 active:shadow-lg"
            >
              {/* Course Header */}
              <div className="p-6 border-b border-neutral-100 dark:border-neutral-700 bg-gradient-to-br from-neutral-50 via-white to-white dark:from-neutral-800 dark:via-neutral-800 dark:to-neutral-800">
                <div className="flex items-start justify-between mb-5">
                  {/* Badge */}
                  <span className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-neutral-700 text-primary-600 dark:text-primary-400 text-xs font-bold rounded-full border border-neutral-200 dark:border-neutral-600 shadow-sm">
                    Free course
                  </span>

                  {/* Chapter Number Badge */}
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center text-white font-bold text-base shadow-md group-hover:shadow-lg transition-shadow duration-150">
                    {chapter.chapter_number}
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-150 leading-snug min-h-[3.5rem]">
                  {chapter.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                  {chapter.description || 'Master essential C++ concepts with interactive lessons and quizzes'}
                </p>
              </div>

              {/* Course Info */}
              <div className="p-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5 font-semibold uppercase tracking-wide">
                      Skill level
                    </div>
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">
                      Beginner
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5 font-semibold uppercase tracking-wide">
                      Time
                    </div>
                    <div className="text-sm font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <Clock className="w-4 h-4 text-neutral-400" />
                      <span>{topicCount * 2} hours</span>
                    </div>
                  </div>
                </div>

                {/* Lessons Count & Progress */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <BookOpen className="w-4 h-4 text-neutral-400" />
                      <span className="text-neutral-600 dark:text-neutral-400 font-semibold">
                        {topicCount} lessons
                      </span>
                    </div>
                    {isStarted && (
                      <span className="font-bold text-primary-600 dark:text-primary-400">
                        {progress.toFixed(0)}% complete
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {isStarted && (
                    <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-600 to-primary-700 transition-all duration-500 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  {/* Status Badge */}
                  {!isStarted && (
                    <div className="flex items-center space-x-2 text-xs text-neutral-500 dark:text-neutral-400 pt-2">
                      <Star className="w-4 h-4" />
                      <span className="font-medium">Start learning today</span>
                    </div>
                  )}

                  {isCompleted && (
                    <div className="flex items-center space-x-2 text-xs text-success-600 dark:text-success-400 pt-2">
                      <Award className="w-4 h-4" />
                      <span className="font-semibold">Completed</span>
                    </div>
                  )}
                </div>

                {/* CTA Arrow - appears on hover */}
                <div className="mt-6 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <span className="text-sm font-semibold text-primary-600 dark:text-primary-400 flex items-center space-x-1">
                    <span>View course</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-150" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Empty State */}
      {chapters.length === 0 && (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-neutral-400" />
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
            No courses available
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
            Courses will appear here once they are loaded. Please check back soon.
          </p>
        </div>
      )}

      {/* Learning Path Info - Optional Bottom Section */}
      {chapters.length > 0 && (
        <div className="mt-20 p-8 bg-gradient-to-br from-primary-50 to-beige-50 dark:from-primary-900/10 dark:to-neutral-800 rounded-2xl border border-primary-100 dark:border-primary-900/30">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-neutral-900 dark:text-white mb-4">
              Your learning journey starts here
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed">
              Our C++ curriculum is designed to take you from beginner to advanced developer.
              Each course builds on previous concepts, ensuring a solid foundation.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2 text-sm text-neutral-700 dark:text-neutral-300">
                <BookOpen className="w-5 h-5 text-primary-600" />
                <span className="font-semibold">{chapters.reduce((sum, ch) => sum + (ch.topics?.length || 0), 0)} total lessons</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-neutral-700 dark:text-neutral-300">
                <Clock className="w-5 h-5 text-primary-600" />
                <span className="font-semibold">{chapters.length * 10} hours of content</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-neutral-700 dark:text-neutral-300">
                <Award className="w-5 h-5 text-primary-600" />
                <span className="font-semibold">Certificate upon completion</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
