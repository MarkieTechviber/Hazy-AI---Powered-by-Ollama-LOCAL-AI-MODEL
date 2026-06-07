'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSystemPrompt } = require('../ai/promptBuilder');

function baseContext(overrides = {}) {
  return {
    messageType: 'task',
    emotion: 'neutral',
    intensity: 'low',
    intent: 'direct_answer',
    userNeed: 'help',
    responseMode: 'direct',
    responsePlan: { outline: ['Answer clearly.'] },
    memory: [],
    ragContext: [],
    toolResults: [],
    questionLimit: 1,
    safety: { riskLevel: 'tier_0', flags: [] },
    codeAnalysis: { isCodingRequest: false },
    projectContext: {},
    ...overrides
  };
}

function sections(prompt) {
  return Array.from(prompt.matchAll(/^([^:\n]+):$/gm)).map((match) => match[1]);
}

test('buildSystemPrompt includes Hazy reasoning controls without raw chain-of-thought exposure', () => {
  const prompt = buildSystemPrompt(baseContext({
    reasoning: {
      reasoningMode: 'auto',
      taskType: 'coding',
      userIntent: 'website',
      reasoningLevel: 'structured',
      effort: 'medium',
      budgetTokens: 1536,
      riskLevel: 'medium',
      needsProjectScan: true,
      needsPlan: true,
      needsVerification: true,
      publicSummaryEnabled: true,
      assumption: 'This appears to be a JavaScript web-app task.'
    },
    codeAnalysis: {
      isCodingRequest: true,
      language: 'javascript',
      languageLabel: 'JavaScript',
      confidence: 82,
      codeType: 'website',
      complexity: 'medium',
      frameworks: []
    },
    projectContext: {
      detectedStack: 'node',
      primaryLanguage: 'javascript',
      projectType: 'web-app',
      frameworks: [],
      evidence: ['package.json']
    }
  }));

  assert.match(prompt, /Hazy extended reasoning policy/);
  assert.match(prompt, /Reasoning level: structured/);
  assert.match(prompt, /Effort: medium/);
  assert.match(prompt, /Public summary: on/);
  assert.match(prompt, /never expose chain-of-thought/i);
  assert.match(prompt, /<thinking>/);
  assert.match(prompt, /scratchpad/i);
});

test('buildSystemPrompt marks public summary off when disabled', () => {
  const prompt = buildSystemPrompt(baseContext({
    reasoning: {
      reasoningMode: 'deep',
      taskType: 'general',
      userIntent: 'general',
      reasoningLevel: 'structured',
      effort: 'medium',
      budgetTokens: 1536,
      riskLevel: 'low',
      needsProjectScan: false,
      needsPlan: true,
      needsVerification: false,
      publicSummaryEnabled: false,
      assumption: 'General request.'
    }
  }));

  assert.match(prompt, /Public summary: off/);
  assert.match(prompt, /The visible answer must contain only the helpful final response/);
});

test('buildSystemPrompt keeps required operational sections', () => {
  const prompt = buildSystemPrompt(baseContext({
    toolResults: [{
      tool: 'web_search',
      success: false,
      query: 'current docs',
      results: []
    }]
  }));

  const sectionNames = sections(prompt);
  assert.ok(sectionNames.includes('Current turn context'));
  assert.ok(sectionNames.includes('Tool context summary'));
  assert.ok(sectionNames.includes('Tool usage instruction'));
  assert.ok(sectionNames.includes('Reasoning control'));
  assert.ok(sectionNames.includes('Operational reply guidance'));
  assert.match(prompt, /web_search: no useful result for "current docs"/);
});
