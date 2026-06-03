'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { scanProjectContext } = require('../ai/coding/projectContextScanner');

test('scanProjectContext detects node/vite stack from attachments', () => {
  const result = scanProjectContext({
    attachments: [
      { name: 'package.json', contentPreview: '{"dependencies":{"react":"^18.0.0","vite":"^5.0.0"}}' },
      { name: 'src/app.js', ext: 'js', contentPreview: "import React from 'react';" }
    ],
    messages: []
  });

  assert.equal(result.primaryLanguage, 'javascript');
  assert.ok(result.frameworks.includes('Node.js'));
  assert.ok(result.frameworks.includes('React'));
});
