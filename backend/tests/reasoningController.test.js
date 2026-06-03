'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReasoningProfile } = require('../ai/reasoning/reasoningController');

test('buildReasoningProfile flags destructive requests for clarification', () => {
  const result = buildReasoningProfile({
    message: 'Delete old files and rewrite everything in this app.',
    mode: 'code',
    codeAnalysis: { isCodingRequest: true, codeType: 'refactor', complexity: 'complex', confidence: 74 },
    projectContext: { confidence: 60, primaryLanguage: 'javascript', projectType: 'web-app' },
    safety: { flags: [], riskLevel: 'tier_0' }
  });

  assert.equal(result.needsQuestion, true);
  assert.equal(result.reasoningLevel, 'high_caution');
});
