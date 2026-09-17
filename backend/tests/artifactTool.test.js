'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { ToolRegistry } = require('../tools/toolRegistry');

test('artifact.write tool verification and traversal guard', async () => {
  const registry = new ToolRegistry();
  const artifactToolMod = require('../tools/artifactTool');
  artifactToolMod.register(registry);
  const tool = registry.get('artifact.write');

  assert.ok(tool);
  assert.equal(tool.name, 'artifact.write');

  const ctx = {
    chatId: 'test_chat_id_' + Date.now(),
    userId: 'user_123'
  };

  // 1. Write works
  const writeRes = await tool.execute({
    filename: 'test_artifact.txt',
    content: 'hello world',
    action: 'write'
  }, ctx);

  assert.equal(writeRes.ok, true);
  assert.ok(writeRes.data.path.includes('test_artifact.txt'));

  // 2. Read works
  const readRes = await tool.execute({
    filename: 'test_artifact.txt',
    action: 'read'
  }, ctx);

  assert.equal(readRes.ok, true);
  assert.equal(readRes.data.content, 'hello world');

  // 3. Directory traversal is blocked
  const traversalRes = await tool.execute({
    filename: '../../escaped.txt',
    content: 'bad content',
    action: 'write'
  }, ctx);

  assert.equal(traversalRes.ok, false);
  assert.equal(traversalRes.error.code, 'PATH_TRAVERSAL');

  // Cleanup
  const artifactsRoot = require('../config/runtimePaths').ARTIFACTS_DIR;
  const base = path.resolve(artifactsRoot, ctx.chatId);
  try {
    await fsp.rm(base, { recursive: true, force: true });
  } catch {}
});
