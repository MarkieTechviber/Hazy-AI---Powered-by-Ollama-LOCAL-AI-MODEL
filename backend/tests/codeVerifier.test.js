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

test('verifyCodeResponse accepts valid runnable JavaScript response', () => {
  const result = verifyCodeResponse(
    '===FILE: index.js===\nfunction add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\n\n===SETUP===\nRun: node index.js',
    {
      taskType: 'coding',
      codeType: 'utility',
      language: 'javascript',
      userMessage: 'Build a small add function'
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('verifyCodeResponse handles empty string input', () => {
  const result = verifyCodeResponse('', {
    taskType: 'coding',
    codeType: 'utility',
    language: 'javascript'
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('empty_code_response'));
});

test('verifyCodeResponse catches likely syntax errors', () => {
  const result = verifyCodeResponse(
    '```js\nfunction broken() {\n  console.log("missing close");\n```\n\nRun: node index.js',
    {
      taskType: 'coding',
      codeType: 'utility',
      language: 'javascript'
    }
  );

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('likely_syntax_error'));
});

test('verifyCodeResponse catches wrong language output', () => {
  const result = verifyCodeResponse(
    '```js\nconst value = 42;\nconsole.log(value);\n```\n\nRun: node index.js',
    {
      taskType: 'coding',
      codeType: 'utility',
      language: 'python'
    }
  );

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('language_mismatch'));
});
