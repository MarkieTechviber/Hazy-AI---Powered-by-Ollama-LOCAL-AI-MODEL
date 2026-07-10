'use strict';

/**
 * Validates the parsed JSON against the expected schema for Hazy responses.
 * @param {Object} data 
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateJsonResponse(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Response is not a valid JSON object.'] };
  }

  if (data.content && typeof data.content !== 'string') {
    errors.push('"content" field must be a string.');
  }

  if (data.files) {
    if (!Array.isArray(data.files)) {
      errors.push('"files" field must be an array.');
    } else {
      data.files.forEach((file, idx) => {
        if (!file.filename || typeof file.filename !== 'string') {
          errors.push(`files[${idx}] must have a valid "filename" string.`);
        }
        if (typeof file.code !== 'string') {
          errors.push(`files[${idx}] must have a valid "code" string.`);
        }
      });
    }
  }

  if (data.commands && !Array.isArray(data.commands)) {
    errors.push('"commands" field must be an array of strings.');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateJsonResponse };
