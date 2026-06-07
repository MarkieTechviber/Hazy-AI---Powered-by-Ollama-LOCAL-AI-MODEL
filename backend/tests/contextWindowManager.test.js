'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estimateTokens,
  countMessagesTokens,
  resolveContextBudget,
  summarizeMessages,
  compressToolContent,
  buildManagedContext,
  applyContextWindow
} = require('../ai/context/contextWindowManager');

function longText(label, words = 180) {
  return `${label} ${Array.from({ length: words }, (_, index) => `word${index}`).join(' ')}`;
}

test('estimates tokens for strings and message arrays', () => {
  assert.ok(estimateTokens('A short sentence.') > 0);
  assert.ok(countMessagesTokens([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' }
  ]) >= 10);
});

test('uses Ollama num_ctx and reserves bounded output space', () => {
  const budget = resolveContextBudget({
    model: 'ollama/llama3.2',
    options: { num_ctx: 4096, num_predict: 4096 }
  });

  assert.equal(budget.contextWindow, 4096);
  assert.equal(budget.reservedOutputTokens, 1024);
  assert.equal(budget.safetyBuffer, 205);
  assert.equal(budget.safeInputLimit, 2867);
});

test('does not apply Ollama num_ctx to cloud providers', () => {
  const budget = resolveContextBudget({
    model: 'openai/gpt-4o',
    options: { num_ctx: 4096, max_tokens: 2048 }
  });

  assert.equal(budget.contextWindow, 128000);
});

test('keeps full context when the request is below budget', () => {
  const body = {
    model: 'ollama/llama3.2',
    options: { num_ctx: 4096, num_predict: 512 },
    messages: [
      { role: 'system', content: 'System instructions.' },
      { role: 'user', content: 'Hello.' }
    ]
  };
  const result = buildManagedContext(body);

  assert.equal(result.messages.length, 2);
  assert.equal(result.stats.trimmedMessageCount, 0);
  assert.equal(result.stats.summaryAdded, false);
});

test('summarizes older messages while preserving important constraints and latest user turn', () => {
  const messages = [{ role: 'system', content: 'You are Hazy.' }];
  for (let index = 0; index < 14; index += 1) {
    messages.push({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: longText(`turn-${index}`, 120)
    });
  }
  messages.splice(3, 0, {
    role: 'user',
    content: 'Important: always use formal English for this project.'
  });
  messages.push({
    role: 'user',
    content: 'This is the latest request and it must survive context reduction.'
  });

  const result = buildManagedContext({
    model: 'ollama/llama3.2',
    options: { num_ctx: 2048, num_predict: 512 },
    messages
  }, { keepRecentMessages: 4, summaryTokens: 240 });

  const combined = result.messages.map((message) => message.content).join('\n');
  assert.match(combined, /always use formal English/i);
  assert.match(combined, /latest request and it must survive/i);
  assert.match(combined, /Conversation Summary - Earlier Context/);
  assert.equal(result.stats.summaryAdded, true);
  assert.ok(result.stats.trimmedMessageCount > 0);
  assert.ok(result.stats.afterTokens <= result.stats.safeInputLimit);
});

test('summary generation is deterministic and bounded', () => {
  const summary = summarizeMessages([
    { role: 'user', content: longText('first', 200) },
    { role: 'assistant', content: longText('second', 200) }
  ], 100);

  assert.match(summary, /Conversation Summary/);
  assert.ok(estimateTokens(summary) <= 120);
});

test('compresses oversized tool output while retaining URLs and status fields', () => {
  const raw = [
    'Status: success',
    'Title: Official documentation',
    'URL: https://example.test/docs',
    'Source: Example',
    ...Array.from({ length: 100 }, (_, index) => `Snippet ${index}: ${longText('detail', 20)}`)
  ].join('\n');
  const result = compressToolContent('web_search', raw, 120);

  assert.equal(result.compressed, true);
  assert.match(result.content, /https:\/\/example\.test\/docs/);
  assert.match(result.content, /Status: success/);
  assert.ok(result.tokens <= 140);
});

test('applyContextWindow attaches provider diagnostics without mutating the input', () => {
  const body = {
    model: 'openai/gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }]
  };
  const result = applyContextWindow(body);

  assert.equal(body.hazyContext, undefined);
  assert.equal(result.hazyContext.contextWindow, 128000);
  assert.equal(result.messages[0].content, 'Hello');
});
