import React from 'react';

/**
 * Enhanced Markdown Text Renderer
 * Supports: **bold**, *italic*, `code`, [links](url)
 * Fixed: No longer duplicates text
 * No auto-highlighting - use backticks for code keywords
 */
const MarkdownText = ({ children, className = '' }) => {
  if (!children) return null;

  const parseMarkdown = (text) => {
    const elements = [];
    let remainingText = text;
    let key = 0;

    // Process in order: code (explicit), bold, italic, links, keywords (auto)
    const patterns = [
      {
        regex: /\*\*([^*]+)\*\*/,
        component: 'strong',
        className: 'font-bold text-neutral-900 dark:text-white'
      },
      {
        regex: /\*([^*]+)\*/,
        component: 'em',
        className: 'italic'
      },
      {
        regex: /`([^`]+)`/,
        component: 'code',
        className: 'px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-primary-600 dark:text-primary-400 rounded font-mono text-sm'
      },
      {
        regex: /\[([^\]]+)\]\(([^)]+)\)/,
        component: 'a',
        className: 'text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline'
      }
    ];

    // Function to recursively parse text
    const parseText = (str) => {
      if (!str) return [];

      const result = [];

      // Try each pattern
      for (const pattern of patterns) {
        const match = str.match(pattern.regex);

        if (match) {
          const beforeMatch = str.substring(0, match.index);
          const afterMatch = str.substring(match.index + match[0].length);

          // Add text before match
          if (beforeMatch) {
            result.push(...parseText(beforeMatch));
          }

          // Add formatted element
          if (pattern.component === 'a') {
            result.push(
              <a
                key={`link-${key++}`}
                href={match[2]}
                className={pattern.className}
                target="_blank"
                rel="noopener noreferrer"
              >
                {match[1]}
              </a>
            );
          } else {
            const Component = pattern.component;
            result.push(
              <Component key={`${pattern.component}-${key++}`} className={pattern.className}>
                {match[1]}
              </Component>
            );
          }

          // Recursively parse text after match
          if (afterMatch) {
            result.push(...parseText(afterMatch));
          }

          return result;
        }
      }

      // No matches found, return plain text
      return [<span key={`text-${key++}`}>{str}</span>];
    };

    return parseText(text);
  };

  return (
    <span className={className}>
      {parseMarkdown(children)}
    </span>
  );
};

export default MarkdownText;
