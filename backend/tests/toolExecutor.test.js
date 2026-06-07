'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ToolExecutor } = require('../tools/toolExecutor');
const { ToolRegistry } = require('../tools/toolRegistry');

test('ToolExecutor returns executable tool result', async () => {
  const registry = new ToolRegistry();
  registry.register({ name: 'echo', execute: (args) => ({ echoed: args.value }) });
  const executor = new ToolExecutor(registry);

  assert.deepEqual(await executor.execute('echo', { value: 'hello' }), { echoed: 'hello' });
});

test('ToolExecutor standardizes unknown tool errors', async () => {
  const executor = new ToolExecutor(new ToolRegistry());

  await assert.rejects(
    () => executor.execute('missing'),
    (error) => error.code === 'unknown_tool' && error.tool === 'missing'
  );
});

test('ToolExecutor times out slow tools', async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'slow',
    execute: () => new Promise((resolve) => setTimeout(() => resolve('late'), 50))
  });
  const executor = new ToolExecutor(registry, { timeoutMs: 5 });

  await assert.rejects(
    () => executor.execute('slow'),
    (error) => error.code === 'tool_timeout' && error.tool === 'slow'
  );
});

test('ToolExecutor retries before returning standardized failure', async () => {
  const registry = new ToolRegistry();
  let attempts = 0;
  registry.register({
    name: 'flaky',
    execute: () => {
      attempts += 1;
      throw new Error('boom');
    }
  });
  const executor = new ToolExecutor(registry, { retries: 1 });

  await assert.rejects(
    () => executor.execute('flaky'),
    (error) => error.code === 'tool_execution_failed' && error.tool === 'flaky'
  );
  assert.equal(attempts, 2);
});
