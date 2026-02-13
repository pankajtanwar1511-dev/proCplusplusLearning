import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MainSelection from './components/MainSelection';
import CatalogDashboard from './components/CatalogDashboard';
import Dashboard from './components/Dashboard';
import TopicsList from './components/TopicsList';
import TopicDetail from './components/TopicDetail';
import Quiz from './components/Quiz';
import LearningPaths from './components/LearningPaths';
import Search from './components/Search';
import Profile from './components/Profile';
import { getUserProfile } from './utils/api';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    console.log('🚀 APP.JS VERSION: 2025-02-11-LATEST - NO loadChapters function exists in this version');
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const response = await getUserProfile();
      setUser(response.data);
    } catch (error) {
      // If profile endpoint doesn't exist, use default user
      // Determine user name based on current catalog context
      const pathMatch = window.location.pathname.match(/^\/catalog\/(\w+)/);
      const catalog = pathMatch ? pathMatch[1] : null;
      const userName = catalog === 'ros2' ? 'ROS2 Learner' : 'C++ Learner';

      setUser({
        name: userName,
        email: 'learner@cppmaster.com',
        streak: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading C++ Master...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Main Selection Screen - No Sidebar */}
        <Route path="/" element={<MainSelection />} />

        {/* Catalog-Based Routes - With Sidebar */}
        <Route
          path="/catalog/:catalog/*"
          element={
            <div className="app">
              <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} user={user} />
              <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
                <Routes>
                  <Route path="dashboard" element={<CatalogDashboard user={user} />} />
                  <Route path="chapters" element={<TopicsList />} />
                  <Route path="topics" element={<TopicsList />} />
                  <Route path="chapter/:chapterId" element={<TopicsList />} />
                  <Route path="topic/:id" element={<TopicDetail />} />
                  <Route path="quiz/:topicId" element={<Quiz />} />
                  <Route path="search" element={<Search />} />
                  <Route path="profile" element={<Profile user={user} onUserUpdate={setUser} />} />
                </Routes>
              </main>
            </div>
          }
        />

        {/* Legacy Routes - With Sidebar (backward compatibility) */}
        <Route
          path="/*"
          element={
            <div className="app">
              <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} user={user} />
              <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard user={user} />} />
                  <Route path="/topics" element={<TopicsList />} />
                  <Route path="/topics/:id" element={<TopicDetail />} />
                  <Route path="/quiz/:topicId" element={<Quiz />} />
                  <Route path="/learning-paths" element={<LearningPaths />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/profile" element={<Profile user={user} onUserUpdate={setUser} />} />
                </Routes>
              </main>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
