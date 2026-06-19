'use strict';

const { evaluateArithmetic } = require('../ai/reasoning/calculator');

function register(registry) {
  registry.register({
    name: 'calculator.evaluate',
    description: 'Evaluate a basic arithmetic expression without running arbitrary code.',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        expression: { type: 'string', minLength: 1, maxLength: 300 }
      },
      required: ['expression'],
      additionalProperties: false
    },
    execute: ({ expression }) => ({
      ok: true,
      data: { expression, value: evaluateArithmetic(expression) }
    })
  });
}

module.exports = { register };
