import React from 'react';
import MarkdownText from './MarkdownText';

/**
 * Enhanced Markdown Renderer for Quick Reference
 * Supports: headings, tables, code blocks, lists, bold, italic
 */
const MarkdownRenderer = ({ content }) => {
  if (!content) return null;

  const parseMarkdownContent = (text) => {
    const elements = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Skip empty lines
      if (!line.trim()) {
        i++;
        continue;
      }

      // Headings (#### Title)
      if (line.startsWith('####')) {
        const title = line.replace(/^####\s*/, '').trim();
        elements.push(
          <h4 key={`h4-${i}`} className="text-lg font-bold text-neutral-900 dark:text-white mt-8 mb-4 first:mt-0">
            {title}
          </h4>
        );
        i++;
        continue;
      }

      // Tables (detect by | characters)
      if (line.includes('|')) {
        const tableLines = [];
        let j = i;

        // Collect all table lines
        while (j < lines.length && lines[j].includes('|')) {
          tableLines.push(lines[j]);
          j++;
        }

        if (tableLines.length > 0) {
          elements.push(renderTable(tableLines, `table-${i}`));
          i = j;
          continue;
        }
      }

      // Code blocks (```)
      if (line.startsWith('```')) {
        const codeLines = [];
        i++; // Skip opening ```

        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }

        if (codeLines.length > 0) {
          elements.push(
            <pre key={`code-${i}`} className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-lg overflow-x-auto my-4">
              <code className="text-sm font-mono text-neutral-800 dark:text-neutral-200">
                {codeLines.join('\n')}
              </code>
            </pre>
          );
        }
        i++; // Skip closing ```
        continue;
      }

      // Regular paragraphs
      elements.push(
        <p key={`p-${i}`} className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
          <MarkdownText>{line}</MarkdownText>
        </p>
      );
      i++;
    }

    return elements;
  };

  const renderTable = (tableLines, key) => {
    if (tableLines.length < 2) return null;

    // Parse table
    const rows = tableLines.map(line =>
      line.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0)
    );

    // First row is header, second is separator, rest are data
    const headers = rows[0];
    const dataRows = rows.slice(2); // Skip separator row

    return (
      <div key={key} className="my-6 overflow-x-auto">
        <table className="min-w-full border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
          <thead className="bg-neutral-100 dark:bg-neutral-800">
            <tr>
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left text-sm font-semibold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-700"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-neutral-800">
            {dataRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <MarkdownText>{cell}</MarkdownText>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="markdown-content">
      {parseMarkdownContent(content)}
    </div>
  );
};

export default MarkdownRenderer;
