'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPublicReasoningTrace,
  encodeReasoningTrace
} = require('../ai/reasoning/reasoningSummaryBuilder');

test('public trace exposes agent web-search routing without private reasoning', () => {
  const trace = buildPublicReasoningTrace({
    analysis: {
      reasoning: {
        taskType: 'general',
        userIntent: 'web_search',
        reasoningLevel: 'tool-assisted',
        riskLevel: 'low'
      }
    },
    toolRun: {
      agentEnabled: true,
      decisions: [{ tool: 'web_search', reason: 'detected web-search intent', query: 'MIRAI-E song' }],
      toolResults: [{
        tool: 'web_search',
        query: 'MIRAI-E song',
        success: true,
        providersTried: ['itunes', 'wikipedia'],
        results: [{ title: 'MIRAI-E', url: 'https://example.test/mirai-e' }]
      }]
    }
  });

  const stepMap = Object.fromEntries(trace.steps.map((step) => [step.label, step.value]));
  assert.equal(trace.title, 'HAZY DECISION TRACE');
  assert.equal(stepMap['Agent enabled'], 'yes');
  assert.equal(stepMap['Search query'], 'MIRAI-E song');
  assert.match(stepMap['Tool status'], /success/);
  assert.equal(stepMap['Model context'], 'answering with tool context');
  assert.match(encodeReasoningTrace(trace), /^[A-Za-z0-9_-]+$/);
});
