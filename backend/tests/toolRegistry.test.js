'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ToolRegistry } = require('../tools/toolRegistry');

test('ToolRegistry get returns a safe immutable snapshot', () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'demo',
    description: 'Demo tool',
    schema: { type: 'object' },
    execute: () => 'ok'
  });

  const tool = registry.get('demo');
  assert.equal(tool.name, 'demo');
  assert.throws(() => {
    tool.schema.type = 'mutated';
  }, /Cannot assign to read only property|read only|object is not extensible/);

  assert.equal(registry.get('demo').schema.type, 'object');
});

test('ToolRegistry list and get expose consistent metadata', () => {
  const registry = new ToolRegistry();
  registry.register({ name: 'demo', description: 'Demo tool', schema: { input: 'string' }, execute: () => 'ok' });

  const [listed] = registry.list();
  const fetched = registry.get('demo');

  assert.deepEqual(listed, {
    name: fetched.name,
    description: fetched.description,
    risk: fetched.risk,
    toolset: fetched.toolset,
    requiresConfirmation: fetched.requiresConfirmation,
    schema: fetched.schema
  });
  assert.equal(typeof fetched.execute, 'function');
});

test('ToolRegistry exposes only role-allowed model schemas', () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'admin.delete',
    risk: 'high_write',
    allowedRoles: ['admin'],
    schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false
    },
    execute: () => ({ ok: true })
  });

  assert.deepEqual(registry.getModelTools({ role: 'user' }), []);
  const [tool] = registry.getModelTools({ role: 'admin' });
  assert.equal(tool.name, 'admin.delete');
  assert.equal(tool.strict, true);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.equal(registry.get('admin.delete').requiresConfirmation, true);
});

test('ToolRegistry warns before overwriting an existing tool', () => {
  const registry = new ToolRegistry();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    registry.register({ name: 'demo', description: 'Old', execute: () => 'old' });
    registry.register({ name: 'demo', description: 'New', execute: () => 'new' });
  } finally {
    console.warn = originalWarn;
  }

  assert.match(warnings.join('\n'), /Replacing existing tool: demo/);
  assert.equal(registry.get('demo').description, 'New');
});
