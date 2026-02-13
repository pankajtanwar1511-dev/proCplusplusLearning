import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code2, Radio, BookOpen, TrendingUp, ArrowRight, Cpu } from 'lucide-react';
import './MainSelection.css';

const MainSelection = () => {
  const navigate = useNavigate();
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCatalogs();
  }, []);

  const loadCatalogs = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/catalogs');
      const data = await response.json();
      setCatalogs(data.catalogs || []);
    } catch (error) {
      console.error('Failed to load catalogs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCatalogIcon = (name) => {
    if (name === 'cpp') return Code2;
    if (name === 'ros2') return Radio;
    return BookOpen;
  };

  const getCatalogColor = (name) => {
    if (name === 'cpp') return '#3b82f6'; // Blue
    if (name === 'ros2') return '#10b981'; // Green
    return '#8b5cf6'; // Purple
  };

  const getCatalogTitle = (name) => {
    if (name === 'cpp') return 'C++ Programming';
    if (name === 'ros2') return 'ROS 2 Robotics';
    return name.toUpperCase();
  };

  const handleCatalogSelect = (catalogName) => {
    navigate(`/catalog/${catalogName}/dashboard`);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading catalogs...</p>
      </div>
    );
  }

  return (
    <div className="main-selection fade-in">
      <div className="selection-header">
        <h1>Welcome to Your Learning Platform</h1>
        <p className="subtitle">Choose your learning path and start mastering technology</p>
      </div>

      <div className="catalogs-grid">
        {catalogs.map((catalog) => {
          const Icon = getCatalogIcon(catalog.name);
          const color = getCatalogColor(catalog.name);
          const title = getCatalogTitle(catalog.name);

          return (
            <div
              key={catalog.name}
              className="catalog-card"
              onClick={() => handleCatalogSelect(catalog.name)}
              style={{ borderColor: color }}
            >
              <div className="catalog-icon" style={{ backgroundColor: `${color}15` }}>
                <Icon size={48} style={{ color }} />
              </div>

              <h2 className="catalog-title">{title}</h2>
              <p className="catalog-description">{catalog.description}</p>

              <div className="catalog-stats">
                <div className="stat-item">
                  <BookOpen size={20} style={{ color }} />
                  <span>{catalog.total_chapters} Chapters</span>
                </div>
                <div className="stat-item">
                  <TrendingUp size={20} style={{ color }} />
                  <span>{catalog.total_topics} Topics</span>
                </div>
              </div>

              <button className="catalog-action" style={{ backgroundColor: color }}>
                Start Learning
                <ArrowRight size={20} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="features-section">
        <h3>Why Choose Our Platform?</h3>
        <div className="features-grid">
          <div className="feature-item">
            <Cpu size={24} className="feature-icon" />
            <h4>Expert-Curated Content</h4>
            <p>Learn from industry-standard materials</p>
          </div>
          <div className="feature-item">
            <TrendingUp size={24} className="feature-icon" />
            <h4>Track Your Progress</h4>
            <p>Monitor your learning journey</p>
          </div>
          <div className="feature-item">
            <BookOpen size={24} className="feature-icon" />
            <h4>Comprehensive Topics</h4>
            <p>From basics to advanced concepts</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainSelection;
