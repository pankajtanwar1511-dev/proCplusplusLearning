import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, BarChart3, ChevronLeft, ChevronRight,
  CheckCircle2, Circle
} from 'lucide-react';

const Sidebar = ({ chapters, isOpen, onClose, isCollapsed, onToggleCollapse }) => {
  const location = useLocation();
  const [expandedChapter, setExpandedChapter] = useState(null);

  const toggleChapter = (chapterNum) => {
    setExpandedChapter(expandedChapter === chapterNum ? null : chapterNum);
  };

  const isActive = (path) => location.pathname === path;
  const isChapterActive = (chapterNum) => location.pathname.includes(`/chapter/${chapterNum}`) || location.pathname.includes(`/topic/${chapterNum}`);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-16 bottom-0 z-40
          bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800
          transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-16' : 'w-64'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          overflow-y-auto overflow-x-hidden
        `}
      >
        {/* Toggle Button - Desktop only */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex absolute -right-3 top-6 w-6 h-6 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-full items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-sm z-50"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
          )}
        </button>

        <div className="py-6">
          {/* Main Navigation */}
          <nav className="space-y-1 px-3 mb-8">
            <Link
              to="/"
              className={`
                flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all group
                ${isActive('/')
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }
                ${isCollapsed ? 'justify-center' : ''}
              `}
              title={isCollapsed ? 'Dashboard' : ''}
            >
              <Home className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium">Dashboard</span>}
            </Link>

            <Link
              to="/stats"
              className={`
                flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all group
                ${isActive('/stats')
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }
                ${isCollapsed ? 'justify-center' : ''}
              `}
              title={isCollapsed ? 'Statistics' : ''}
            >
              <BarChart3 className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium">Statistics</span>}
            </Link>
          </nav>

          {/* Course Content - Expanded View */}
          {!isCollapsed && (
            <>
              <div className="px-6 mb-3">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Course Content
                </h3>
              </div>

              <nav className="space-y-0.5 px-3">
                {chapters.map((chapter) => {
                  const isExpanded = expandedChapter === chapter.chapter_number;
                  const isChapterPath = isChapterActive(chapter.chapter_number);
                  const progress = chapter.progress || 0;

                  return (
                    <div key={chapter.chapter_number}>
                      <button
                        onClick={() => toggleChapter(chapter.chapter_number)}
                        className={`
                          w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left
                          ${isChapterPath && !isExpanded
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }
                        `}
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 w-6 h-6 rounded bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                            <span className="text-xs font-bold text-white">
                              {chapter.chapter_number}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {chapter.title}
                            </div>
                            {progress > 0 && (
                              <div className="flex items-center space-x-2 mt-1">
                                <div className="flex-1 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                  {progress.toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </button>

                      {/* Topics - Expanded */}
                      {isExpanded && chapter.topics && (
                        <div className="mt-1 mb-2 ml-9 space-y-0.5 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3">
                          {chapter.topics.map((topic, idx) => {
                            const topicPath = `/topic/${chapter.chapter_number}/${idx}`;
                            const topicProgress = topic.progress || 0;

                            return (
                              <Link
                                key={idx}
                                to={topicPath}
                                className={`
                                  flex items-start space-x-2 px-2 py-2 rounded-lg transition-all text-sm group
                                  ${isActive(topicPath)
                                    ? 'bg-primary-600 text-white shadow-sm'
                                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200'
                                  }
                                `}
                              >
                                {topicProgress >= 100 ? (
                                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-success-500" />
                                ) : (
                                  <Circle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isActive(topicPath) ? 'text-white' : ''}`} />
                                )}
                                <span className="flex-1 leading-snug">{topic.title}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </>
          )}

          {/* Collapsed View - Chapter Numbers */}
          {isCollapsed && (
            <nav className="space-y-2 px-3">
              {chapters.map((chapter) => {
                const progress = chapter.progress || 0;
                return (
                  <Link
                    key={chapter.chapter_number}
                    to={`/chapter/${chapter.chapter_number}`}
                    className={`
                      relative flex items-center justify-center w-10 h-10 rounded-lg transition-all
                      ${isChapterActive(chapter.chapter_number)
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }
                    `}
                    title={chapter.title}
                  >
                    <span className="text-sm font-bold">{chapter.chapter_number}</span>
                    {progress > 0 && progress < 100 && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    {progress >= 100 && (
                      <CheckCircle2 className="absolute -top-1 -right-1 w-4 h-4 text-success-500 bg-white dark:bg-neutral-900 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
