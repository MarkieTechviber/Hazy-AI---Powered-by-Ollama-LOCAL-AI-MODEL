'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeCodeRequest } = require('../ai/coding/codeIntelligence');

test('analyzeCodeRequest detects explicit React/TypeScript request', () => {
  const result = analyzeCodeRequest('Build a login page in React with TypeScript and form validation.');

  assert.equal(result.isCodingRequest, true);
  assert.equal(result.language, 'typescript');
  assert.equal(result.codeType, 'frontend_ui');
  assert.ok(result.confidence >= 90);
});

test('analyzeCodeRequest falls back to project context language', () => {
  const result = analyzeCodeRequest(
    'Add a new route for listing projects.',
    [],
    null,
    { primaryLanguage: 'javascript', confidence: 82, frameworks: ['Node.js', 'Express.js'] }
  );

  assert.equal(result.isCodingRequest, true);
  assert.equal(result.language, 'javascript');
  assert.match(result.reason, /project context/i);
});

test('analyzeCodeRequest lowers confidence when language signals conflict', () => {
  const result = analyzeCodeRequest('Build this utility in Python and JavaScript.');

  assert.equal(result.isCodingRequest, true);
  assert.equal(result.conflictingSignals, true);
  assert.ok(result.confidence < 90);
  assert.ok(result.languageSignals.length >= 2);
  assert.match(result.reason, /conflicting/i);
});

test('analyzeCodeRequest stays non-coding below intent threshold', () => {
  const result = analyzeCodeRequest('Maybe search my notes and explain what they mean.');

  assert.equal(result.isCodingRequest, false);
});
