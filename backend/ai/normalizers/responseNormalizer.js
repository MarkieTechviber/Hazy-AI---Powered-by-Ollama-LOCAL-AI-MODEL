'use strict';

/**
 * Ensures that all strategies return the exact same object shape to the AI Runtime.
 * @param {Object} data
 * @param {string} data.content - The conversational text response
 * @param {Array<{filename: string, code: string, language?: string}>} data.files - Array of files to generate
 * @param {Array<string>} [data.commands] - Terminal commands to run
 * @param {Array<string>} [data.warnings] - Parsing warnings or errors during extraction
 * @param {Object} [data.metadata] - Strategy and performance metrics
 * @returns {Object} Normalized response
 */
function normalizeResponse(data) {
  return {
    type: 'normalized_response',
    content: typeof data.content === 'string' ? data.content.trim() : '',
    files: Array.isArray(data.files) ? data.files.map(f => ({
      filename: f.filename || 'untitled',
      code: f.code || '',
      language: f.language || 'text'
    })) : [],
    commands: Array.isArray(data.commands) ? data.commands : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    metadata: data.metadata || {}
  };
}

module.exports = { normalizeResponse };
