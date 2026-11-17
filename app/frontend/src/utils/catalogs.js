import { Code2, Radio, Briefcase, BookOpen } from 'lucide-react';

// Single place for per-catalog display settings.
// Add a new catalog here; the backend discovers its data automatically.
const CATALOGS = {
  cpp: {
    title: 'C++ Programming',
    shortTitle: 'C++ Master',
    learner: 'C++ Learner',
    icon: Code2,
    color: '#3b82f6',
  },
  ros2: {
    title: 'ROS 2 Robotics',
    shortTitle: 'ROS 2 Master',
    learner: 'ROS2 Learner',
    icon: Radio,
    color: '#10b981',
  },
  interview: {
    title: 'C++ Interview Prep',
    shortTitle: 'Interview Prep',
    learner: 'Interview Candidate',
    icon: Briefcase,
    color: '#f59e0b',
  },
};

const FALLBACK = {
  title: null,
  shortTitle: 'C++ Master',
  learner: 'C++ Learner',
  icon: BookOpen,
  color: '#8b5cf6',
};

export const getCatalogConfig = (name) => {
  const cfg = CATALOGS[name] || FALLBACK;
  return { ...cfg, title: cfg.title || (name ? name.toUpperCase() : '') };
};

export default CATALOGS;
