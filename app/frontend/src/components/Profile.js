import React, { useState } from 'react';
import {
  User,
  Mail,
  Calendar,
  Flame,
  Trophy,
  Target,
  Download,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Settings,
  Moon,
  Sun,
} from 'lucide-react';
import { updateUserProfile, resetProgress, exportData } from '../utils/api';
import './Profile.css';

const Profile = ({ user, onUserUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const [saving, setSaving] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [darkMode, setDarkMode] = useState(false);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      const response = await updateUserProfile(formData);
      onUserUpdate(response.data);
      setEditing(false);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await exportData();
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cpp-master-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Data exported successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to export data' });
      console.error(err);
    }
  };

  const handleResetProgress = async () => {
    try {
      setResetLoading(true);
      await resetProgress();
      setShowResetModal(false);
      setMessage({ type: 'success', text: 'Progress reset successfully!' });
      // Reload page to refresh data
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to reset progress' });
      console.error(err);
    } finally {
      setResetLoading(false);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    // In a real app, this would save to localStorage and apply theme
    setMessage({ type: 'info', text: 'Dark mode coming soon!' });
  };

  return (
    <div className="profile-page fade-in">
      <div className="profile-header">
        <h1>Profile & Settings</h1>
        <p className="text-gray">Manage your account and preferences</p>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type === 'error' ? 'danger' : message.type}`}>
          {message.type === 'success' && <CheckCircle size={18} />}
          {message.type === 'error' && <AlertTriangle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="profile-grid">
        {/* Profile Information Card */}
        <div className="card profile-card">
          <div className="card-header">
            <h3>
              <User size={20} />
              Profile Information
            </h3>
            {!editing && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
          </div>

          <div className="profile-avatar-section">
            <div className="profile-avatar-large">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>

          {editing ? (
            <div className="profile-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Your name"
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <div className="spinner"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditing(false);
                    setFormData({
                      name: user?.name || '',
                      email: user?.email || '',
                    });
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-info">
              <div className="info-item">
                <User size={18} />
                <div>
                  <p className="info-label">Name</p>
                  <p className="info-value">{user?.name || 'Not set'}</p>
                </div>
              </div>

              <div className="info-item">
                <Mail size={18} />
                <div>
                  <p className="info-label">Email</p>
                  <p className="info-value">{user?.email || 'Not set'}</p>
                </div>
              </div>

              <div className="info-item">
                <Calendar size={18} />
                <div>
                  <p className="info-label">Member Since</p>
                  <p className="info-value">
                    {user?.joined_date
                      ? new Date(user.joined_date).toLocaleDateString()
                      : 'Recently'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Card */}
        <div className="card stats-card">
          <div className="card-header">
            <h3>
              <Trophy size={20} />
              Your Statistics
            </h3>
          </div>

          <div className="stats-list">
            <div className="stat-item">
              <div className="stat-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                <Flame className="text-warning" size={24} />
              </div>
              <div>
                <p className="stat-value">{user?.streak || 0} days</p>
                <p className="stat-label">Current Streak</p>
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                <Target className="text-primary" size={24} />
              </div>
              <div>
                <p className="stat-value">{user?.completed_topics || 0}</p>
                <p className="stat-label">Topics Completed</p>
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                <Trophy className="text-success" size={24} />
              </div>
              <div>
                <p className="stat-value">{user?.quizzes_passed || 0}</p>
                <p className="stat-label">Quizzes Passed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="card settings-card">
          <div className="card-header">
            <h3>
              <Settings size={20} />
              Settings
            </h3>
          </div>

          <div className="settings-list">
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-icon">
                  {darkMode ? <Moon size={20} /> : <Sun size={20} />}
                </div>
                <div>
                  <p className="setting-title">Dark Mode</p>
                  <p className="setting-description">
                    Toggle dark mode for comfortable viewing
                  </p>
                </div>
              </div>
              <button
                className={`toggle-switch ${darkMode ? 'active' : ''}`}
                onClick={toggleDarkMode}
              >
                <span className="toggle-slider"></span>
              </button>
            </div>
          </div>
        </div>

        {/* Actions Card */}
        <div className="card actions-card">
          <div className="card-header">
            <h3>Data & Actions</h3>
          </div>

          <div className="actions-list">
            <button className="action-button" onClick={handleExportData}>
              <div className="action-icon primary">
                <Download size={20} />
              </div>
              <div className="action-info">
                <p className="action-title">Export Data</p>
                <p className="action-description">
                  Download all your progress and data as JSON
                </p>
              </div>
            </button>

            <button
              className="action-button danger"
              onClick={() => setShowResetModal(true)}
            >
              <div className="action-icon danger">
                <RotateCcw size={20} />
              </div>
              <div className="action-info">
                <p className="action-title">Reset Progress</p>
                <p className="action-description">
                  Clear all progress and start fresh (cannot be undone)
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <AlertTriangle size={32} className="text-danger" />
              <h3>Reset All Progress?</h3>
            </div>
            <div className="modal-body">
              <p>
                This will permanently delete all your progress, quiz scores, and
                notes. This action cannot be undone.
              </p>
              <p className="font-semibold">Are you sure you want to continue?</p>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                onClick={handleResetProgress}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <>
                    <div className="spinner"></div>
                    Resetting...
                  </>
                ) : (
                  'Yes, Reset Everything'
                )}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setShowResetModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
