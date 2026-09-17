'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OllamaEmbeddingService } = require('../rag/embeddingService');

const enabled = process.env.HAZY_OLLAMA_INTEGRATION === '1';

test('real Ollama generates a response without downloading a model', { skip: !enabled }, async () => {
  const base = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = (process.env.HAZY_MODEL || 'ollama/llama3.2:1b').replace(/^ollama\//, '');
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: 'Reply with the word OK.' }] })
  });
  assert.equal(response.ok, true, `Ollama returned ${response.status}; install the configured model before running this optional test.`);
  const data = await response.json();
  assert.equal(typeof data.message?.content, 'string');
  assert.ok(data.message.content.length > 0);
});

test('real Ollama embedding endpoint returns a finite normalized vector', { skip: !enabled }, async () => {
  const service = new OllamaEmbeddingService({
    model: process.env.HAZY_EMBEDDING_MODEL || 'embeddinggemma', timeoutMs: 30_000
  });
  const vector = await service.embed('Hazy optional integration check');
  assert.ok(vector.length > 1);
  assert.ok(vector.every(Number.isFinite));
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6);
});
