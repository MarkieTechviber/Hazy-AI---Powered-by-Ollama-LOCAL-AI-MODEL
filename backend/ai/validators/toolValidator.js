'use strict';

const toolRegistry = require('../tools/toolRegistry');
const { PermanentError } = require('../errors');

/**
 * Validates parsed model responses.
 * Delegates tool-specific validation to the Tool instance.
 */
function validateToolPayload(payload) {
  if (!payload) return;

  const validateCall = (name, args) => {
    const tool = toolRegistry.getTool(name);
    if (!tool) {
      throw new PermanentError(`Unknown tool requested by model: ${name}`);
    }
    
    // Delegate validation
    tool.validate(args);
  };

  // Check tool calls
  if (payload.toolCalls && Array.isArray(payload.toolCalls)) {
    for (const call of payload.toolCalls) {
      const name = call.function?.name;
      const args = call.function?.arguments;
      if (name) validateCall(name, args);
    }
  }

  // Check legacy JSON format mappings (if any)
  if (payload.files && Array.isArray(payload.files)) {
    validateCall('write_files', { files: payload.files });
  }
  
  if (payload.commands && Array.isArray(payload.commands)) {
    for (const cmd of payload.commands) {
      validateCall('run_terminal', { command: cmd });
    }
  }
}

module.exports = { validateToolPayload };
