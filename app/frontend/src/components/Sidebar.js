import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  BookOpen,
  Map,
  Search,
  User,
  Menu,
  X,
  Code2,
  Flame,
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ isOpen, onToggle, user }) => {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/topics', icon: BookOpen, label: 'Topics' },
    { path: '/learning-paths', icon: Map, label: 'Learning Paths' },
    { path: '/search', icon: Search, label: 'Search' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Code2 size={32} />
            {isOpen && <span className="logo-text">C++ Master</span>}
          </div>
          <button className="sidebar-toggle" onClick={onToggle}>
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {isOpen && user && (
          <div className="user-info">
            <div className="user-avatar">
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="user-details">
              <p className="user-name">{user.name || 'User'}</p>
              {user.streak > 0 && (
                <div className="user-streak">
                  <Flame size={14} />
                  <span>{user.streak} day streak</span>
                </div>
              )}
            </div>
          </div>
        )}

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <item.icon size={20} />
              {isOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {isOpen && (
          <div className="sidebar-footer">
            <p className="version">Version 1.0.0</p>
            <p className="copyright">&copy; 2025 C++ Master</p>
          </div>
        )}
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
};

export default Sidebar;
