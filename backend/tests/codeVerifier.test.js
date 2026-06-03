'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { verifyCodeResponse } = require('../ai/coding/codeVerifier');

test('verifyCodeResponse catches placeholders and missing setup', () => {
  const result = verifyCodeResponse('// TODO: implement later', {
    taskType: 'coding',
    codeType: 'general',
    language: 'javascript',
    userMessage: 'Build an API'
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('contains_placeholders'));
  assert.ok(result.issues.includes('missing_setup_guidance'));
});
