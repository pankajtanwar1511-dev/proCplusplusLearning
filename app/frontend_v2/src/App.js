import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Dashboard from './pages/Dashboard';
import ChapterView from './pages/ChapterView';
import TopicView from './pages/TopicView';
import QuizView from './pages/QuizView';
import StatsView from './pages/StatsView';
import { apiService } from './utils/api';

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load chapters and theme preference
  useEffect(() => {
    loadChapters();
    loadThemePreference();
  }, []);

  // Apply theme class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const loadChapters = async () => {
    try {
      const response = await apiService.getOverview();
      const chaptersData = response.data.chapters || [];

      // Sort by chapter number
      chaptersData.sort((a, b) => a.number - b.number);

      // Transform API data to match component expectations
      const transformedChapters = chaptersData.map(chapter => {
        const title = chapter.name
          .replace(/chapter_\d+_/i, '')
          .replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        return {
          chapter_number: chapter.number,
          title: title,
          description: chapter.description || 'Master the concepts with interactive learning',
          topics: (chapter.topics || []).map((topic) => ({
            title: topic.topic || topic,
            progress: 0
          })),
          progress: 0
        };
      });

      console.log('Loaded chapters:', transformedChapters);
      setChapters(transformedChapters);
    } catch (error) {
      console.error('Failed to load chapters:', error);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  };

  const loadThemePreference = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setDarkMode(true);
    } else if (savedTheme === null) {
      // Default to system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
    }
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-neutral-600 dark:text-neutral-400">Loading C++ Master Pro...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-white dark:bg-neutral-900">
        <Navbar darkMode={darkMode} toggleTheme={toggleTheme} />

        <main className="pt-16">
          <Routes>
            <Route path="/" element={<Dashboard chapters={chapters} />} />
            <Route path="/chapter/:chapterNum" element={<ChapterView />} />
            <Route path="/topic/:chapterNum/:topicIdx" element={<TopicView />} />
            <Route path="/quiz/:chapterNum/:topicIdx" element={<QuizView />} />
            <Route path="/stats" element={<StatsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
