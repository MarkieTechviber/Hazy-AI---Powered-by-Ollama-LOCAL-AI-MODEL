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

test('scanProjectContext handles empty attachments explicitly', () => {
  const result = scanProjectContext({ attachments: [], messages: [] });

  assert.equal(result.detectedStack, 'unknown');
  assert.equal(result.primaryLanguage, null);
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.conflictingSignals, false);
});

test('scanProjectContext reports conflicting language signals', () => {
  const result = scanProjectContext({
    attachments: [
      { name: 'app.py', ext: 'py', contentPreview: 'print("hello")' },
      { name: 'requirements.txt', contentPreview: 'fastapi\npytest' },
      { name: 'package.json', contentPreview: '{"dependencies":{"express":"^4.0.0"}}' },
      { name: 'server.js', ext: 'js', contentPreview: "const express = require('express');" }
    ],
    messages: []
  });

  assert.equal(result.primaryLanguage, 'javascript');
  assert.equal(result.conflictingSignals, true);
  assert.ok(result.languageSignals.some((item) => item.language === 'python'));
});

test('scanProjectContext detects monorepo structure', () => {
  const result = scanProjectContext({
    attachments: [
      { name: 'package.json', contentPreview: '{"workspaces":["packages/*"],"dependencies":{"vite":"^5.0.0"}}' },
      { name: 'packages/api/package.json', contentPreview: '{"dependencies":{"express":"^4.0.0"}}' }
    ],
    messages: []
  });

  assert.ok(result.frameworks.includes('Monorepo'));
  assert.match(result.detectedStack, /monorepo/);
  assert.ok(result.evidence.includes('package.json'));
});
