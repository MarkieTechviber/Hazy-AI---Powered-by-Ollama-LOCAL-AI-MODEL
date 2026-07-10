'use strict';

const ToolInterface = require('./toolInterface');
const { PermanentError } = require('../errors');

class RunTerminalTool extends ToolInterface {
  get name() {
    return 'run_terminal';
  }

  get description() {
    return 'Runs a terminal command.';
  }

  get schema() {
    return {
      type: 'object',
      properties: {
        command: { type: 'string' }
      },
      required: ['command']
    };
  }

  get requiredPermissions() {
    return ['run_terminal'];
  }

  validate(args) {
    if (!args.command || typeof args.command !== 'string') {
      throw new PermanentError('Invalid argument: command must be a string');
    }
  }

  async execute(args) {
    // Placeholder execution implementation
    return { success: true };
  }
}

module.exports = new RunTerminalTool();
