import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Sun, Moon, Menu, X, ChevronDown } from 'lucide-react';

/**
 * Codecademy-Inspired Navigation Bar
 * Features:
 * - Sticky header (5rem height on desktop)
 * - Better logo design
 * - Hover states with underline animation
 * - Search modal integration
 * - Mobile hamburger menu
 * - Smooth transitions (150ms)
 */
const Navbar = ({ darkMode, toggleTheme }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isActivePath = (path) => {
    return location.pathname === path;
  };

  const NavLink = ({ to, children, external = false }) => {
    const isActive = isActivePath(to);
    const baseClasses = "relative py-2 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold transition-colors duration-150";
    const activeClasses = isActive ? "text-primary-600 dark:text-primary-400" : "";

    const linkContent = (
      <>
        {children}
        {/* Underline animation */}
        <span className={`absolute bottom-0 left-0 w-full h-0.5 bg-primary-600 dark:bg-primary-400 transform origin-left transition-transform duration-150 ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></span>
      </>
    );

    if (external) {
      return (
        <a href={to} className={`${baseClasses} ${activeClasses} group`}>
          {linkContent}
        </a>
      );
    }

    return (
      <Link to={to} className={`${baseClasses} ${activeClasses} group`}>
        {linkContent}
      </Link>
    );
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Left - Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            {/* Icon Badge */}
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-md group-hover:shadow-lg transition-all duration-150 group-hover:scale-105">
              <span className="text-white font-bold text-base">C++</span>
            </div>

            {/* Brand Text */}
            <div className="hidden sm:block text-2xl font-bold tracking-tight">
              <span className="text-neutral-900 dark:text-white">C++</span>
              <span className="text-primary-600 dark:text-primary-400">academy</span>
            </div>
          </Link>

          {/* Center - Navigation Links (Desktop) */}
          <div className="hidden md:flex items-center space-x-10">
            <NavLink to="/">Catalog</NavLink>
            <NavLink to="/stats">Resources</NavLink>
            <NavLink to="/community" external>Community</NavLink>

            {/* Dropdown example - Can be enhanced */}
            {/* <div className="relative group">
              <button className="flex items-center space-x-1 py-2 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold transition-colors duration-150">
                <span>More</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div> */}
          </div>

          {/* Right - Actions */}
          <div className="flex items-center space-x-3">
            {/* Search Button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all duration-150 hover:shadow-sm"
              aria-label="Search"
            >
              <Search className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all duration-150 hover:shadow-sm"
              aria-label="Toggle theme"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              ) : (
                <Moon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              )}
            </button>

            {/* Auth Buttons - Desktop */}
            <div className="hidden sm:flex items-center space-x-3 ml-3">
              <Link
                to="/login"
                className="inline-flex items-center px-4 py-2.5 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold transition-colors duration-150 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Log In
              </Link>

              <Link
                to="/signup"
                className="inline-flex items-center px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-all duration-150 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md"
              >
                Sign Up
              </Link>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all duration-150"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-neutral-700 dark:text-neutral-300" />
              ) : (
                <Menu className="w-6 h-6 text-neutral-700 dark:text-neutral-300" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 animate-slideDown">
            <div className="px-6 py-6 space-y-4">
              {/* Mobile Nav Links */}
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-3 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold transition-colors"
              >
                Catalog
              </Link>
              <Link
                to="/stats"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-3 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold transition-colors"
              >
                Resources
              </Link>
              <a
                href="#"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-3 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold transition-colors"
              >
                Community
              </a>

              {/* Mobile Auth Buttons */}
              <div className="pt-4 space-y-3 border-t border-neutral-200 dark:border-neutral-800">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full px-4 py-3 text-center text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold transition-colors rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Log In
                </Link>

                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full px-4 py-3 text-center bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors shadow-md"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Search Modal - Simple version */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-24 animate-fadeIn"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center space-x-4">
                <Search className="w-6 h-6 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search courses, topics, or concepts..."
                  className="flex-1 text-lg bg-transparent border-none outline-none text-neutral-900 dark:text-white placeholder-neutral-400"
                  autoFocus
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 font-medium"
                >
                  ESC
                </button>
              </div>
            </div>

            {/* Search Results Placeholder */}
            <div className="p-8 text-center">
              <p className="text-neutral-500 dark:text-neutral-400">
                Start typing to search...
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
