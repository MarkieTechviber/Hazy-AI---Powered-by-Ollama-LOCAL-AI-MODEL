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
      contextWindow: {
        afterTokens: 1200,
        safeInputLimit: 3000,
        trimmedMessageCount: 4,
        summaryAdded: true
      },
      reasoning: {
        taskType: 'general',
        userIntent: 'web_search',
        reasoningLevel: 'structured',
        effort: 'medium',
        riskLevel: 'low',
        publicSummary: 'Hazy checked intent, constraints, verification before answering.',
        needsVerification: true
      }
    },
    toolRun: {
      agentEnabled: true,
      decisions: [{ tool: 'web_search', reason: 'fresh release information requested', query: 'latest runtime release' }],
      toolResults: [{
        tool: 'web_search',
        query: 'latest runtime release',
        success: true,
        providersTried: ['brave', 'wikipedia'],
        results: [{ title: 'Runtime release notes', url: 'https://example.test/release-notes' }]
      }]
    }
  });

  const stepMap = Object.fromEntries(trace.steps.map((step) => [step.label, step.value]));
  assert.equal(trace.title, 'HAZY REASONING SUMMARY');
  assert.equal(stepMap.Checked, 'Hazy checked intent, constraints, verification before answering.');
  assert.equal(stepMap['Agent enabled'], 'yes');
  assert.equal(stepMap['Search query'], 'latest runtime release');
  assert.match(stepMap['Tool status'], /success/);
  assert.equal(stepMap['Model context'], 'answering with tool context');
  assert.match(stepMap['Context window'], /1200\/3000 input tokens/);
  assert.match(stepMap['Context window'], /4 packing action/);
  assert.match(stepMap['Reasoning level'], /structured \| effort medium \| risk low/);
  assert.match(trace.note, /Private reasoning is not shown or stored/);
  assert.match(encodeReasoningTrace(trace), /^[A-Za-z0-9_-]+$/);
});

test('encodeReasoningTrace round-trips through base64url JSON decode', () => {
  const trace = {
    title: 'HAZY REASONING SUMMARY',
    summary: 'Checked route.',
    steps: [{ label: 'Route', value: 'general -> direct_answer' }],
    tools: [],
    note: 'Safe public summary only.'
  };

  const encoded = encodeReasoningTrace(trace);
  const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

  assert.deepEqual(decoded, trace);
});
