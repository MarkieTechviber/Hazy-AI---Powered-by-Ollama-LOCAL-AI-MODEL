'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  wantsWebSearch,
  extractSearchQuery,
  isAgentEnabled,
  isBuildOrCodeRequest,
  formatToolContext,
  runDeterministicTools
} = require('../tools/toolRouter');

test('router searches only for public web evidence needs', () => {
  assert.equal(wantsWebSearch('What is the latest React release?'), true);
  assert.equal(wantsWebSearch('Verify this claim and cite sources.'), true);
  assert.equal(wantsWebSearch('Explain binary search in Python.'), false);
  assert.equal(wantsWebSearch('Search my uploaded notes.'), false);
  assert.equal(wantsWebSearch('Create code that calls a web search API later.'), false);
});

test('router extracts a general query without entertainment-specific rewriting', () => {
  assert.equal(extractSearchQuery('Please search online for latest Vite release notes'), 'for latest Vite release notes');
  assert.equal(extractSearchQuery('Find the official video for a product launch'), 'Find the official video for a product launch');
});

test('tool context contains packed sources and citation instructions', () => {
  const context = formatToolContext([{
    tool: 'web_search',
    runId: 'run-1',
    decision: { mode: 'technical_docs' },
    confidence: 'high',
    queries: [{ query: 'Node current release', intent: 'primary' }],
    contextText: '[SOURCE 1]\nTitle: Node Releases\nURL: https://nodejs.org/releases\nContent:\nCurrent release data.'
  }]);
  assert.match(context, /Cite inline with \[SOURCE N\]/);
  assert.match(context, /Search run ID: run-1/);
  assert.match(context, /\[SOURCE 1\]/);
});

test('deterministic routing injects backend evidence and never builds a canned direct answer', async () => {
  const result = await runDeterministicTools({
    body: {
      userId: 'u1',
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'What is the latest Vite release? Cite sources.' }]
    },
    cfg: {
      __testWebSearchResult: {
        success: true,
        runId: 'test-run',
        decision: { mode: 'official_only', freshnessRequired: true },
        query: 'latest Vite release',
        queries: [{ query: 'latest Vite release official documentation', intent: 'docs' }],
        contextText: '[SOURCE 1]\nTitle: Vite Releases\nURL: https://vite.dev/releases\nContent:\nRelease information.',
        citations: [{ sourceId: 's1', sourceNumber: 1, title: 'Vite Releases', url: 'https://vite.dev/releases' }],
        confidence: 'high',
        metrics: { confidence: 'high', citationCount: 1 }
      }
    }
  });

  assert.equal(result.agentEnabled, true);
  assert.equal(result.decisions[0].tool, 'web_search');
  assert.equal(result.toolResults[0].runId, 'test-run');
  assert.equal(result.directAnswer, undefined);
  assert.match(result.body.messages[0].content, /\[SOURCE 1\]/);
  assert.equal(result.body.hazy.webSearchRunId, 'test-run');
  assert.equal(result.body.hazy.webCitations.length, 1);
});

test('stable and local requests bypass web execution', async () => {
  const stable = await runDeterministicTools({
    body: { messages: [{ role: 'user', content: 'Explain closures in JavaScript.' }] }
  });
  const local = await runDeterministicTools({
    body: { messages: [{ role: 'user', content: 'Search my uploaded project files.' }] }
  });

  assert.deepEqual(stable.toolResults, []);
  assert.deepEqual(local.toolResults, []);
  assert.equal(stable.searchDecision.mode, 'none');
  assert.equal(local.searchDecision.mode, 'none');
});

test('agent metadata helpers remain compatible', () => {
  assert.equal(isAgentEnabled({ hazy: { agentEnabled: true } }), true);
  assert.equal(isBuildOrCodeRequest({ hazy: { mode: 'build' } }), true);
  assert.equal(isBuildOrCodeRequest({ hazy: { mode: 'chat' } }), false);
});
