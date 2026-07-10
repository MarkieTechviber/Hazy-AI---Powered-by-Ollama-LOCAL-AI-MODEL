'use strict';

const path = require('path');
const fs = require('fs').promises;
const ToolInterface = require('./toolInterface');
const { PermanentError } = require('../errors');

class WriteFilesTool extends ToolInterface {
  get name() {
    return 'write_files';
  }

  get description() {
    return 'Creates or overwrites files on the disk.';
  }

  get schema() {
    return {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              code: { type: 'string' }
            },
            required: ['filename', 'code']
          }
        }
      },
      required: ['files']
    };
  }

  get requiredPermissions() {
    return ['write_files'];
  }

  validate(args) {
    if (!args.files || !Array.isArray(args.files)) {
      throw new PermanentError('Invalid argument: files must be an array');
    }
    
    // Prevent Path Traversal
    for (const file of args.files) {
      if (!file.filename) throw new PermanentError('Missing filename in file object');
      
      const normalized = path.normalize(file.filename);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        throw new PermanentError(`Security violation: Path traversal or absolute path detected (${file.filename})`);
      }
    }
  }

  async execute(args) {
    // Basic implementation for the tool execution.
    // In the future, this would do actual file writing.
    // Right now it just signals success as the AI Runtime hands off to the backend API anyway.
    return { success: true, count: args.files.length };
  }
}

module.exports = new WriteFilesTool();
