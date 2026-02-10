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

// API Methods

// Dashboard
export const getDashboard = () => api.get('/dashboard');

// Topics
export const getTopics = () => api.get('/topics');
export const getTopic = (id) => api.get(`/topics/${id}`);
export const getTopicTheory = (id) => api.get(`/topics/${id}/theory`);
export const getTopicExamples = (id) => api.get(`/topics/${id}/examples`);

// Quiz
export const generateQuiz = (topicId, difficulty = 'medium', count = 10) =>
  api.post('/quiz/generate', { topic_id: topicId, difficulty, count });

export const submitQuiz = (quizData) => api.post('/quiz/submit', quizData);

export const getQuizHistory = (topicId = null) => {
  const params = topicId ? { topic_id: topicId } : {};
  return api.get('/quiz/history', { params });
};

// Learning Paths
export const getLearningPaths = () => api.get('/learning-paths');
export const getLearningPath = (id) => api.get(`/learning-paths/${id}`);

// Search
export const search = (query) => api.get('/search', { params: { q: query } });

// Notes
export const getNotes = (topicId) => api.get(`/notes/${topicId}`);
export const saveNotes = (topicId, content) =>
  api.post(`/notes/${topicId}`, { content });

// Progress
export const updateProgress = (progressData) =>
  api.post('/progress/update', progressData);

export const markTheoryRead = (topicId) =>
  api.post('/progress/update', {
    topic_id: topicId,
    action: 'theory_read',
  });

export const markExampleViewed = (topicId, exampleId) =>
  api.post('/progress/update', {
    topic_id: topicId,
    action: 'example_viewed',
    example_id: exampleId,
  });

// User/Profile
export const getUserProfile = () => api.get('/profile');
export const updateUserProfile = (profileData) =>
  api.put('/profile', profileData);

export const resetProgress = () => api.post('/profile/reset');
export const exportData = () => api.get('/profile/export');

// Statistics
export const getStatistics = () => api.get('/statistics');
export const getWeakAreas = () => api.get('/statistics/weak-areas');
export const getStrongAreas = () => api.get('/statistics/strong-areas');

export default api;
