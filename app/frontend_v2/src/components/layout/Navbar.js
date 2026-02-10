import React from 'react';
import { Link } from 'react-router-dom';
import { Search, Sun, Moon } from 'lucide-react';

const Navbar = ({ darkMode, toggleTheme }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left - Logo */}
        <Link to="/" className="flex items-center space-x-2">
          <div className="text-2xl font-bold">
            <span className="text-neutral-900 dark:text-white">C++</span>
            <span className="text-primary-600">academy</span>
          </div>
        </Link>

        {/* Center - Navigation */}
        <div className="hidden md:flex items-center space-x-6">
          <Link to="/" className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white font-medium transition-colors">
            Catalog
          </Link>
          <Link to="/stats" className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white font-medium transition-colors">
            Resources
          </Link>
          <a href="#" className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white font-medium transition-colors">
            Community
          </a>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center space-x-4">
          <button
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            aria-label="Toggle theme"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            ) : (
              <Moon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            )}
          </button>

          <Link to="/login" className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white font-medium transition-colors">
            Log In
          </Link>

          <Link to="/signup" className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors">
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
