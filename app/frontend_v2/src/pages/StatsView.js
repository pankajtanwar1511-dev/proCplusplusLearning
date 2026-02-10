import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Target, Award, Flame, Calendar, Clock,
  BarChart3, ChevronLeft
} from 'lucide-react';
import { apiService } from '../utils/api';

const StatsView = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await apiService.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="skeleton w-full max-w-6xl h-96"></div>
      </div>
    );
  }

  const difficultyPerformance = stats?.difficulty_performance || {};
  const weakAreas = stats?.weak_areas || [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="card">
        <Link
          to="/"
          className="inline-flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        <h1 className="text-3xl font-bold mb-2 text-neutral-900 dark:text-neutral-50">
          Learning Statistics
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Track your progress and identify areas for improvement
        </p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <Target className="w-8 h-8 text-primary-600" />
            <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Overall Accuracy
            </h3>
          </div>
          <div className="text-4xl font-bold text-gradient-primary">
            {(stats?.accuracy || 0).toFixed(1)}%
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <BarChart3 className="w-8 h-8 text-accent-600" />
            <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Total Questions
            </h3>
          </div>
          <div className="text-4xl font-bold text-neutral-900 dark:text-neutral-50">
            {stats?.total_questions || 0}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <Flame className="w-8 h-8 text-warning-500" />
            <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Current Streak
            </h3>
          </div>
          <div className="text-4xl font-bold text-neutral-900 dark:text-neutral-50">
            {stats?.current_streak || 0} days
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <Award className="w-8 h-8 text-success-600" />
            <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Topics Completed
            </h3>
          </div>
          <div className="text-4xl font-bold text-neutral-900 dark:text-neutral-50">
            {stats?.topics_completed || 0}/{stats?.total_topics || 32}
          </div>
        </div>
      </div>

      {/* Difficulty Performance */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 text-neutral-900 dark:text-neutral-50">
          Performance by Difficulty
        </h2>

        <div className="space-y-6">
          {['beginner', 'intermediate', 'advanced', 'expert'].map(level => {
            const performance = difficultyPerformance[level] || { accuracy: 0, total: 0 };
            const accuracy = performance.accuracy || 0;
            const total = performance.total || 0;

            const colorClass =
              level === 'beginner' ? 'success' :
              level === 'intermediate' ? 'primary' :
              level === 'advanced' ? 'warning' : 'danger';

            return (
              <div key={level}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className={`badge badge-${colorClass} capitalize`}>
                      {level}
                    </span>
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      {total} questions answered
                    </span>
                  </div>
                  <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    {accuracy.toFixed(1)}%
                  </span>
                </div>
                <div className="progress-bar h-3">
                  <div
                    className={`h-full bg-gradient-to-r from-${colorClass}-500 to-${colorClass}-600 transition-all duration-500 ease-out rounded-full`}
                    style={{ width: `${accuracy}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weak Areas */}
      {weakAreas.length > 0 && (
        <div className="card border-l-4 border-warning-500">
          <div className="flex items-start space-x-3 mb-6">
            <TrendingUp className="w-8 h-8 text-warning-600 flex-shrink-0 mt-1" />
            <div>
              <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-neutral-50">
                Areas for Improvement
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400">
                Focus on these concepts to improve your understanding
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weakAreas.map((area, idx) => (
              <div
                key={idx}
                className="p-4 bg-warning-50 dark:bg-warning-900/20 rounded-lg border border-warning-200 dark:border-warning-800"
              >
                <p className="font-medium text-warning-900 dark:text-warning-100">
                  {area}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Study Tips */}
      <div className="card bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20">
        <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-neutral-50">
          Learning Insights
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start space-x-3">
            <Calendar className="w-6 h-6 text-primary-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
                Spaced Repetition
              </h3>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                The system automatically schedules reviews based on your performance using the SM-2 algorithm for optimal retention.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Clock className="w-6 h-6 text-primary-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
                Adaptive Difficulty
              </h3>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Question difficulty adjusts based on your performance to keep you in the optimal learning zone.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Target className="w-6 h-6 text-primary-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
                Weak Area Focus
              </h3>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Concepts where you score below 60% are automatically prioritized in future quizzes.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Award className="w-6 h-6 text-primary-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
                Mastery Threshold
              </h3>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Topics are considered mastered at 70% accuracy, with 90%+ earning excellent status.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsView;
