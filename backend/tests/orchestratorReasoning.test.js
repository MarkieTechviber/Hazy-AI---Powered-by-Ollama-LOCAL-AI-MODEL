'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { prepareChatRequest } = require('../orchestrator');

test('prepareChatRequest normalizes OpenAI reasoning metadata', async () => {
  const { analysis, providerBody } = await prepareChatRequest({
    model: 'openai/o3',
    hazy: {
      mode: 'code',
      reasoningMode: 'deep',
      showReasoningSummary: false
    },
    messages: [
      { role: 'user', content: 'Refactor this JavaScript app and verify the routing edge cases.' }
    ]
  });

  assert.equal(providerBody.hazyReasoning.nativeProvider, 'openai');
  assert.equal(providerBody.hazyReasoning.mode, 'deep');
  assert.equal(providerBody.hazyReasoning.level, 'agentic');
  assert.equal(providerBody.hazyReasoning.effort, 'high');
  assert.equal(providerBody.hazyReasoning.publicSummaryEnabled, false);
  assert.match(analysis.prompt, /Hazy extended reasoning policy/);
});

test('prepareChatRequest falls back to Hazy reasoning metadata for local providers', async () => {
  const { providerBody } = await prepareChatRequest({
    model: 'llama3.2',
    hazy: {
      mode: 'build',
      reasoningMode: 'auto',
      showReasoningSummary: false
    },
    messages: [
      { role: 'user', content: 'Build a small restaurant website with menu and booking sections.' }
    ]
  });

  assert.equal(providerBody.hazyReasoning.nativeProvider, 'hazy');
  assert.equal(providerBody.hazyReasoning.mode, 'auto');
  assert.equal(providerBody.hazyReasoning.level, 'light');
  assert.equal(providerBody.hazyReasoning.effort, 'low');
});

test('prepareChatRequest treats unknown provider strings as Hazy-managed reasoning', async () => {
  const { providerBody } = await prepareChatRequest({
    model: 'typo-provider/some-new-model',
    hazy: { mode: 'chat', reasoningMode: 'auto' },
    messages: [{ role: 'user', content: 'Explain this feature briefly.' }]
  });

  assert.equal(providerBody.hazyReasoning.nativeProvider, 'hazy');
  assert.equal(providerBody.hazyReasoning.mode, 'auto');
});

test('prepareChatRequest handles null or empty model values with default Hazy reasoning', async () => {
  for (const model of [null, '']) {
    const { providerBody } = await prepareChatRequest({
      model,
      hazy: { mode: 'chat', reasoningMode: 'auto' },
      messages: [{ role: 'user', content: 'Say hello.' }]
    });

    assert.equal(providerBody.hazyReasoning.nativeProvider, 'hazy');
    assert.equal(providerBody.hazyReasoning.level, 'light');
  }
});

test('prepareChatRequest applies context-window management before provider routing', async () => {
  const messages = [{ role: 'system', content: 'You are Hazy.' }];
  for (let index = 0; index < 18; index += 1) {
    messages.push({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index}: ${'long context '.repeat(180)}`
    });
  }
  messages.push({ role: 'user', content: 'Keep this latest request.' });

  const { analysis, providerBody } = await prepareChatRequest({
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
