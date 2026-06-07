'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { prepareChatRequest } = require('../orchestrator');

test('prepareChatRequest normalizes OpenAI reasoning metadata', () => {
  const { analysis, providerBody } = prepareChatRequest({
    model: 'openai/o3',
    hazy: {
      mode: 'code',
      reasoningMode: 'deep',
      showReasoningSummary: true
    },
    messages: [
      { role: 'user', content: 'Refactor this JavaScript app and verify the routing edge cases.' }
    ]
  });

  assert.equal(providerBody.hazyReasoning.nativeProvider, 'openai');
  assert.equal(providerBody.hazyReasoning.mode, 'deep');
  assert.equal(providerBody.hazyReasoning.level, 'agentic');
  assert.equal(providerBody.hazyReasoning.effort, 'high');
  assert.equal(providerBody.hazyReasoning.publicSummaryEnabled, true);
  assert.match(analysis.prompt, /Hazy extended reasoning policy/);
});

test('prepareChatRequest falls back to Hazy reasoning metadata for local providers', () => {
  const { providerBody } = prepareChatRequest({
    model: 'llama3.2',
    hazy: {
      mode: 'build',
      reasoningMode: 'auto',
      showReasoningSummary: true
    },
    messages: [
      { role: 'user', content: 'Build a small restaurant website with menu and booking sections.' }
    ]
  });

  assert.equal(providerBody.hazyReasoning.nativeProvider, 'hazy');
  assert.equal(providerBody.hazyReasoning.mode, 'auto');
  assert.equal(providerBody.hazyReasoning.level, 'structured');
  assert.equal(providerBody.hazyReasoning.effort, 'medium');
});

test('prepareChatRequest treats unknown provider strings as Hazy-managed reasoning', () => {
  const { providerBody } = prepareChatRequest({
    model: 'typo-provider/some-new-model',
    hazy: { mode: 'chat', reasoningMode: 'auto' },
    messages: [{ role: 'user', content: 'Explain this feature briefly.' }]
  });

  assert.equal(providerBody.hazyReasoning.nativeProvider, 'hazy');
  assert.equal(providerBody.hazyReasoning.mode, 'auto');
});

test('prepareChatRequest handles null or empty model values with default Hazy reasoning', () => {
  for (const model of [null, '']) {
    const { providerBody } = prepareChatRequest({
      model,
      hazy: { mode: 'chat', reasoningMode: 'auto' },
      messages: [{ role: 'user', content: 'Say hello.' }]
    });

    assert.equal(providerBody.hazyReasoning.nativeProvider, 'hazy');
    assert.equal(providerBody.hazyReasoning.level, 'direct');
  }
});

test('prepareChatRequest applies context-window management before provider routing', () => {
  const messages = [{ role: 'system', content: 'You are Hazy.' }];
  for (let index = 0; index < 18; index += 1) {
    messages.push({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index}: ${'long context '.repeat(180)}`
    });
  }
  messages.push({ role: 'user', content: 'Keep this latest request.' });

  const { analysis, providerBody } = prepareChatRequest({
    model: 'ollama/llama3.2',
    hazy: { mode: 'chat', reasoningMode: 'auto' },
    options: { num_ctx: 2048, num_predict: 512 },
    messages
  });

  assert.equal(providerBody.hazyContext.contextWindow, 2048);
  assert.equal(analysis.contextWindow.summaryAdded, true);
  assert.ok(providerBody.hazyContext.afterTokens <= providerBody.hazyContext.safeInputLimit);
  assert.match(
    providerBody.messages.map((message) => message.content).join('\n'),
    /Keep this latest request/
  );
});
