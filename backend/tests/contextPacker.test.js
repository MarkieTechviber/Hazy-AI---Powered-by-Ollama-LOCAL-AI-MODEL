'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  allocateSlotTokens,
  buildContextPack
} = require('../ai/context/contextPacker');

function repeated(label, count = 120) {
  return `${label} ${Array.from({ length: count }, (_, index) => `term${index}`).join(' ')}`;
}

test('allocator guarantees base budgets before distributing overflow', () => {
  const result = allocateSlotTokens({
    summary: 400,
    retrievedChunks: 1000,
    recentMessages: 900,
    toolResults: 700
  }, 1800, {
    summary: 300,
    retrievedChunks: 500,
    recentMessages: 600,
    toolResults: 200
  });

  assert.ok(result.adjusted.summary >= 300);
  assert.ok(result.adjusted.retrievedChunks >= 500);
  assert.ok(result.adjusted.recentMessages >= 600);
  assert.ok(result.adjusted.toolResults >= 200);
  assert.equal(Object.values(result.adjusted).reduce((sum, value) => sum + value, 0), 1800);
});

test('packer assembles slots in protected context order with current user last', () => {
  const result = buildContextPack({
    model: 'ollama/llama3.2',
    options: { num_ctx: 4096, num_predict: 512 },
    messages: [
      { role: 'system', content: 'Behavior instructions.' },
      { role: 'user', content: 'Earlier question.' },
      { role: 'assistant', content: 'Earlier answer.' },
      { role: 'system', content: '[Tool: search]\nTool evidence.', contextSlot: 'tool' },
      { role: 'user', content: 'Current question.' }
    ]
  }, {
    memory: [{ summary: 'response_style: concise', type: 'preference' }],
    summary: 'Earlier decisions were recorded.',
    retrievedChunks: [{ source: 'guide.md', text: 'Relevant document text.', score: 5 }]
  });

  assert.match(result.messages[0].content, /Behavior instructions/);
  assert.match(result.messages[0].content, /User Profile Memory/);
  assert.equal(result.messages[1].contextSlot, 'summary');
  assert.equal(result.messages[2].contextSlot, 'retrieved');
  assert.equal(result.messages.at(-1).content, 'Current question.');
  assert.equal(result.stats.overBudget, false);
});

test('packer keeps highest relevance chunks and drops lower scores first', () => {
  const result = buildContextPack({
    model: 'ollama/llama3.2',
    options: { num_ctx: 2048, num_predict: 512 },
    messages: [
      { role: 'system', content: 'Short system prompt.' },
      { role: 'user', content: 'Use the most relevant project context.' }
    ]
  }, {
    retrievedChunks: [
      { source: 'low.md', text: repeated('low', 700), score: 1 },
      { source: 'high.md', text: repeated('high', 700), score: 10 },
      { source: 'medium.md', text: repeated('medium', 700), score: 5 }
    ],
    budgetRatios: {
      summary: 0,
      retrievedChunks: 0.25,
      recentMessages: 0,
      toolResults: 0
    }
  });

  const packed = result.messages.map((message) => message.content).join('\n');
  assert.match(packed, /high\.md/);
  const dropped = result.stats.trimLog.filter((item) => item.action === 'DROP_LOW_RELEVANCE_CHUNK');
  assert.ok(dropped.some((item) => item.score === 1));
  assert.ok(!dropped.some((item) => item.score === 10));
});

test('packer summarizes old chat, preserves recent turns, and drops tool context before protected slots', () => {
  const messages = [
    { role: 'system', content: 'System policy.' },
    { role: 'system', content: `[Tool: web]\n${repeated('tool', 500)}`, contextSlot: 'tool' }
  ];
  for (let index = 0; index < 16; index += 1) {
    messages.push({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: repeated(`turn-${index}`, 70)
    });
  }
  messages.push({ role: 'user', content: 'Latest request survives.' });

  const result = buildContextPack({
    model: 'ollama/llama3.2',
    options: { num_ctx: 2048, num_predict: 512 },
    messages
  }, { keepRecentMessages: 4, summaryTokens: 180 });

  const combined = result.messages.map((message) => message.content).join('\n');
  assert.match(combined, /Conversation Summary/);
  assert.match(combined, /Latest request survives/);
  assert.ok(result.stats.trimLog.some((item) => item.action === 'SUMMARIZE_OLD_MESSAGES'));
  assert.ok(result.stats.trimLog.some((item) => item.action === 'DROP_TOOL_RESULT'));
  const actions = result.stats.trimLog.map((item) => item.action);
  const toolIndex = actions.indexOf('DROP_TOOL_RESULT');
  const chunkIndex = actions.indexOf('DROP_LOW_RELEVANCE_CHUNK');
  const messageIndex = actions.indexOf('DROP_OLD_MESSAGE');
  const summaryIndex = actions.indexOf('TRUNCATE_SUMMARY');
  if (chunkIndex >= 0) assert.ok(toolIndex < chunkIndex);
  if (messageIndex >= 0) assert.ok(toolIndex < messageIndex);
  if (summaryIndex >= 0) assert.ok(toolIndex < summaryIndex);
  assert.ok(result.stats.afterTokens <= result.stats.safeInputLimit);
});

test('budget report accounts for every packed slot', () => {
  const result = buildContextPack({
    model: 'openai/gpt-4o',
    options: { max_tokens: 2048 },
    messages: [
      { role: 'system', content: 'System.' },
      { role: 'user', content: 'Current.' }
    ]
  }, {
    memory: ['User prefers concise answers.'],
    retrievedChunks: [{ source: 'a.txt', text: 'Retrieved fact.', score: 2 }]
  });

  const report = result.stats.budgetReport;
  assert.ok(report.systemPrompt > 0);
  assert.ok(report.userMemory > 0);
  assert.ok(report.retrievedChunks > 0);
  assert.ok(report.userMessage > 0);
  assert.equal(report.total, result.stats.afterTokens);
});
