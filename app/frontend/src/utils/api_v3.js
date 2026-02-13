import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// ============================================================
// Multi-Catalog API Methods (v3)
// ============================================================

// Health & Catalogs
export const getHealth = () => api.get('/health');
export const getCatalogs = () => api.get('/catalogs');

// Catalog Overview
export const getCatalogOverview = (catalog) => api.get(`/${catalog}/overview`);
export const getCatalogChapters = (catalog) => api.get(`/${catalog}/chapters`);
export const getCatalogStats = (catalog) => api.get(`/${catalog}/stats`);

// Chapter & Topics
export const getChapterDetails = (catalog, chapterNum) =>
  api.get(`/${catalog}/chapter/${chapterNum}`);

export const getTopicContent = (catalog, chapterNum, topicIdx) =>
  api.get(`/${catalog}/topic/${chapterNum}/${topicIdx}`);

// Overall Stats
export const getOverallStats = () => api.get('/stats');

// Notes (catalog-aware)
export const saveNote = (catalog, chapter, topic, note) =>
  api.post('/note', { catalog, chapter, topic, note });

export default api;
