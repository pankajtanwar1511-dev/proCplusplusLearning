/**
 * API utility functions for C++ Master Pro
 * Handles all backend communication
 */

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for logging (development only)
if (process.env.NODE_ENV === 'development') {
  api.interceptors.request.use(
    (config) => {
      console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`);
      return config;
    },
    (error) => {
      console.error('[API Request Error]', error);
      return Promise.reject(error);
    }
  );
}

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error
      console.error('[API Error]', error.response.status, error.response.data);
    } else if (error.request) {
      // Request made but no response
      console.error('[API Error] No response received', error.request);
    } else {
      // Error setting up request
      console.error('[API Error]', error.message);
    }
    return Promise.reject(error);
  }
);

// API functions
export const apiService = {
  // Health check
  health: () => api.get('/health'),

  // Overview
  getOverview: () => api.get('/overview'),

  // Chapters
  getChapters: () => api.get('/chapters'),
  getChapter: (chapterNum) => api.get(`/chapter/${chapterNum}`),

  // Topics
  getTopic: (chapterNum, topicIdx) =>
    api.get(`/topic/${chapterNum}/${topicIdx}`),

  // Quiz
  getQuiz: (chapterNum, topicIdx, params = {}) =>
    api.get(`/quiz/${chapterNum}/${topicIdx}`, { params }),

  checkAnswer: (chapterNum, topicIdx, questionId, answer) =>
    api.post(`/quiz/${chapterNum}/${topicIdx}/answer/${questionId}`, { answer }),

  // Progress
  updateProgress: (data) => api.post('/progress', data),

  // Stats
  getStats: () => api.get('/stats'),

  // Search
  search: (query, type = 'all') =>
    api.get('/search', { params: { q: query, type } }),

  // Bookmarks
  toggleBookmark: (chapter, topic, questionId) =>
    api.post('/bookmark', { chapter, topic, question_id: questionId }),

  // Notes
  saveNote: (chapter, topic, note) =>
    api.post('/note', { chapter, topic, note }),
};

export default apiService;
