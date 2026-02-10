import React, { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

const CodeBlock = ({ code, language = 'cpp', showLineNumbers = true, title = null }) => {
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  // Language badge colors
  const languageColors = {
    cpp: 'bg-blue-500',
    javascript: 'bg-yellow-500',
    python: 'bg-green-500',
    java: 'bg-red-500',
    typescript: 'bg-blue-600',
    html: 'bg-orange-500',
    css: 'bg-purple-500',
  };

  const languageColor = languageColors[language] || 'bg-neutral-500';

  return (
    <div className="code-block my-6 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-lg hover:shadow-2xl transition-shadow">
      {/* Header with Language Badge */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
        isDark
          ? 'bg-gradient-to-r from-neutral-800 to-neutral-900 border-neutral-700'
          : 'bg-gradient-to-r from-neutral-100 to-neutral-200 border-neutral-300'
      }`}>
        <div className="flex items-center space-x-3">
          <span className={`${languageColor} px-2 py-0.5 rounded text-xs font-bold text-white uppercase`}>
            {language}
          </span>
          {title && (
            <span className={`text-sm font-medium ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
              {title}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all text-sm hover:scale-105 ${
            isDark
              ? 'hover:bg-neutral-700 text-neutral-300 hover:text-white'
              : 'hover:bg-neutral-300 text-neutral-700 hover:text-neutral-900'
          }`}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-success-400" />
              <span className="font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code with Theme-Aware Styling */}
      <SyntaxHighlighter
        language={language}
        style={isDark ? vscDarkPlus : vs}
        showLineNumbers={showLineNumbers}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
          lineHeight: '1.75',
          fontFamily: 'JetBrains Mono, Fira Code, Consolas, Monaco, monospace',
          padding: '1.5rem',
          backgroundColor: isDark ? '#1e1e1e' : '#f6f8fa',
        }}
        lineNumberStyle={{
          minWidth: '3em',
          paddingRight: '1.5em',
          color: isDark ? '#6e7681' : '#57606a',
          userSelect: 'none',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'JetBrains Mono, Fira Code, Consolas, Monaco, monospace',
            textShadow: 'none',
            color: isDark ? undefined : '#24292f',
          }
        }}
        wrapLines={true}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;
