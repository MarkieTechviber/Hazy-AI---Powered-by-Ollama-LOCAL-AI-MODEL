'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectIntent } = require('../empathy/intentDetector');
const { selectEmpathyStrategy } = require('../empathy/empathyPolicy');
const { planResponse } = require('../empathy/responsePlanner');
const { getToneProfile } = require('../empathy/toneProfiles');
const { createStreamResponseCollector } = require('../ai/streamResponseCollector');

test('ordinary conversation stays conversational instead of becoming a technical task', () => {
  const intent = detectIntent('I had such a strange day today');
  const strategy = selectEmpathyStrategy({
    emotion: 'neutral',
    intent: intent.primaryIntent,
    intensity: 'low',
    safety: { riskLevel: 'tier_0' }
  });
  const plan = planResponse({
    strategy,
    userNeed: 'connection',
    toneProfile: getToneProfile(strategy.mode),
    memory: [],
    ragContext: []
  });

  assert.equal(intent.primaryIntent, 'general_conversation');
  assert.equal(strategy.template, 'companion_conversation_response');
  assert.match(plan.outline.join('\n'), /Respond to the person/);
  assert.doesNotMatch(plan.outline.join('\n'), /Explain why it works/);
});

test('technical and emotional phrasing route to their matching response styles', () => {
  const technical = detectIntent('Can you explain closures?');
  const emotional = detectIntent('I feel exhausted and invisible');
  const emotionalStrategy = selectEmpathyStrategy({
    emotion: 'neutral',
    intent: emotional.primaryIntent,
    intensity: 'medium',
    safety: { riskLevel: 'tier_0' }
  });

  assert.equal(technical.primaryIntent, 'technical_question');
  assert.equal(emotional.primaryIntent, 'emotional_support');
  assert.equal(emotionalStrategy.template, 'emotional_support_response');
});

test('stream collector reconstructs a completed companion response once', () => {
  const completed = [];
  const collector = createStreamResponseCollector((text) => completed.push(text));

  collector.observe('{"message":{"content":"That sounds "},"done":false}\n');
  collector.observe('{"message":{"content":"like a lot."},"done":false}\n{"done":true}\n');
  collector.finish();
  collector.finish();

  assert.equal(collector.getResponseText(), 'That sounds like a lot.');
  assert.deepEqual(completed, ['That sounds like a lot.']);
});
