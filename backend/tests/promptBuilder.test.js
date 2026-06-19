'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSystemPrompt, buildPersonaPrompt } = require('../ai/promptBuilder');

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
  assert.match(prompt, /do not expose internal reasoning/i);
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

test('buildSystemPrompt includes Chat Mode instructions when agentic is off and reasoningMode is not deep', () => {
  const prompt = buildSystemPrompt(baseContext({
    agentEnabled: false,
    reasoning: { reasoningMode: 'auto' }
  }));

  assert.match(prompt, /You are in Chat Mode\. Think like a senior assistant/);
  assert.match(prompt, /Do NOT output any reasoning block, thinking block, scratchpad, or <thinking> block\./);
  assert.match(prompt, /No files or folders must be touched\./);
});

test('buildSystemPrompt includes Deep Think Mode instructions when agentic is off and reasoningMode is deep', () => {
  const prompt = buildSystemPrompt(baseContext({
    agentEnabled: false,
    reasoning: { reasoningMode: 'deep' }
  }));

  assert.match(prompt, /You are in Deep Think Mode\. Think like a senior engineer/);
  assert.match(prompt, /Before replying, output a <thinking> block/);
  assert.match(prompt, /Do NOT create or modify any files or folders\./);
});

test('buildSystemPrompt includes Agentic Mode instructions when agentic is enabled', () => {
  const prompt = buildSystemPrompt(baseContext({
    agentEnabled: true,
    reasoning: { reasoningMode: 'deep' }
  }));

  assert.match(prompt, /You are in Agentic Mode\. Act as a senior autonomous engineer/);
  assert.match(prompt, /Before acting, output a <thinking> block/);
  assert.match(prompt, /Code lives in created, named, editable files in the workspace/);
});

test('buildSystemPrompt includes companion emotion tag instructions', () => {
  const prompt = buildSystemPrompt(baseContext());
  assert.match(prompt, /Companion emotion tags/);
  assert.match(prompt, /\[\[happy\]\]/);
  assert.match(prompt, /\[\[annoyed\]\]/);
  assert.match(prompt, /\[\[flustered\]\]/);
});
test('buildPersonaPrompt interpolates values correctly', () => {
  const p = {
    personaRelation: 'bestfriend',
    personaName: 'Charlie',
    personaUserName: 'Jordan',
    personaLanguage: 'playful',
    personaTraits: ['funny', 'sarcastic'],
    scenarioDesc: 'Jordan and {name} are coding a project together.',
    scenarioSetting: 'school',
    scenarioCharRole: 'coding buddy',
    scenarioUserRole: 'novice coder',
    scenarioOpener: 'Hey {userName}, ready to write some code?'
  };

  const prompt = buildPersonaPrompt(p);

  assert.match(prompt, /You are Charlie, a character in an ongoing roleplay\/story\./);
  assert.match(prompt, /Your relationship to the user is: best friend \(specifically: coding buddy\)\./);
  assert.match(prompt, /The user's name in this world is Jordan and they are: novice coder\./);
  assert.match(prompt, /Your personality and tone: You are playful/);
  assert.match(prompt, /natural sense of humor/);
  assert.match(prompt, /dry sarcasm/);
  assert.match(prompt, /Jordan and Charlie are coding a project together\./);
  assert.match(prompt, /The setting is: School \/ Campus\./);
  assert.match(prompt, /Hey Jordan, ready to write some code\?/);
});
