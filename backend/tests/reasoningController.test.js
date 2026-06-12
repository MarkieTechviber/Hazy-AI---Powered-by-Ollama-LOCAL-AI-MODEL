'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReasoningProfile } = require('../ai/reasoning/reasoningController');

test('buildReasoningProfile does not ask for clarification on destructive requests', () => {
  const result = buildReasoningProfile({
    message: 'Delete old files and rewrite everything in this app.',
    mode: 'code',
    codeAnalysis: { isCodingRequest: true, codeType: 'refactor', complexity: 'complex', confidence: 74 },
    projectContext: { confidence: 60, primaryLanguage: 'javascript', projectType: 'web-app' },
    safety: { flags: [], riskLevel: 'tier_0' }
  });

  assert.equal(result.needsQuestion, false);
  assert.equal(result.reasoningLevel, 'high_caution');
});

test('buildReasoningProfile keeps simple emotional chat direct', () => {
  const result = buildReasoningProfile({
    message: 'I feel tired today, can you stay with me a bit?',
    mode: 'chat',
    codeAnalysis: { isCodingRequest: false },
    projectContext: {},
    safety: { flags: [], riskLevel: 'tier_0' },
    requestedMode: 'auto'
  });

  assert.equal(result.reasoningMode, 'auto');
  assert.equal(result.reasoningLevel, 'direct');
  assert.equal(result.publicSummaryEnabled, false);
});

test('buildReasoningProfile routes website builds through structured reasoning', () => {
  const result = buildReasoningProfile({
    message: 'Build me a portfolio website with projects and contact form.',
    mode: 'build',
    codeAnalysis: { isCodingRequest: true, codeType: 'website', complexity: 'medium', confidence: 80 },
    projectContext: { confidence: 70, primaryLanguage: 'javascript', projectType: 'web-app' },
    safety: { flags: [], riskLevel: 'tier_0' },
    requestedMode: 'auto'
  });

  assert.equal(result.reasoningLevel, 'structured');
  assert.equal(result.needsPlan, true);
  assert.equal(result.needsProjectScan, true);
  assert.equal(result.publicSummaryEnabled, true);
});

test('buildReasoningProfile upgrades complex coding work to agentic', () => {
  const result = buildReasoningProfile({
    message: 'Refactor the app architecture and fix the failing build.',
    mode: 'code',
    codeAnalysis: { isCodingRequest: true, codeType: 'refactor', complexity: 'complex', confidence: 82 },
    projectContext: { confidence: 76, primaryLanguage: 'javascript', projectType: 'web-app' },
    safety: { flags: [], riskLevel: 'tier_0' },
    requestedMode: 'auto'
  });

  assert.equal(result.reasoningLevel, 'agentic');
  assert.equal(result.effort, 'high');
  assert.equal(result.needsVerification, true);
});

test('buildReasoningProfile respects off mode unless risk is high', () => {
  const simple = buildReasoningProfile({
    message: 'Explain what this button does.',
    mode: 'chat',
    codeAnalysis: { isCodingRequest: false },
    projectContext: {},
    safety: { flags: [], riskLevel: 'tier_0' },
    requestedMode: 'off'
  });
  const risky = buildReasoningProfile({
    message: 'Delete the production database.',
    mode: 'chat',
    codeAnalysis: { isCodingRequest: false },
    projectContext: {},
    safety: { flags: [], riskLevel: 'tier_0' },
    requestedMode: 'off'
  });

  assert.equal(simple.reasoningLevel, 'direct');
  assert.equal(simple.effort, 'none');
  assert.equal(risky.reasoningLevel, 'high_caution');
  assert.equal(risky.effort, 'high');
});

test('buildReasoningProfile lets safety detector win when text heuristic disagrees', () => {
  const result = buildReasoningProfile({
    message: 'Can you help me with this normal-looking request?',
    mode: 'chat',
    codeAnalysis: { isCodingRequest: false },
    projectContext: {},
    safety: { flags: ['self_harm'], riskLevel: 'tier_3' },
    requestedMode: 'off'
  });

  assert.equal(result.reasoningLevel, 'high_caution');
  assert.equal(result.riskLevel, 'high');
  assert.equal(result.riskConflict, true);
  assert.equal(result.safetyDecision, 'safety_high_risk');
});
