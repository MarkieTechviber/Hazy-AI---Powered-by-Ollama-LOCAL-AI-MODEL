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
