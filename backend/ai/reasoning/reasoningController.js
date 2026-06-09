'use strict';

const { shouldAskClarifyingQuestion } = require('./clarificationPolicy');
const { classifyReasoningTask } = require('./taskClassifier');

const REASONING_MODES = new Set(['off', 'auto', 'deep']);
const EFFORT_BY_LEVEL = {
  direct: 'none',
  light: 'low',
  structured: 'medium',
  agentic: 'high',
  high_caution: 'high'
};
const BUDGET_BY_LEVEL = {
  direct: 0,
  light: 512,
  structured: 1536,
  agentic: 4096,
  high_caution: 4096
};

function normalizeReasoningMode(value) {
  return REASONING_MODES.has(value) ? value : 'auto';
}

function isSafetyHighRisk(safety = {}) {
  const risk = String(safety.riskLevel || '').toLowerCase();
  return Boolean((safety.flags || []).length)
    || ['high', 'critical', 'tier_2', 'tier_3', 'tier_4'].includes(risk)
    || /high|critical|danger|self_harm|violence|illegal/i.test(risk);
}

function detectHighRisk(text, safety = {}) {
  const explicitRisk = /\b(auth|payment|database|security|production|delete|overwrite|deploy|credential|token|secret|migration|schema)\b/i.test(text);
  return explicitRisk || isSafetyHighRisk(safety);
}

function buildPublicSummary({ reasoningLevel, needsProjectScan, needsPlan, needsVerification, riskLevel }) {
  const checked = ['intent'];
  if (needsPlan) checked.push('constraints');
  if (riskLevel === 'high') checked.push('risk');
  if (needsProjectScan) checked.push('project context');
  if (needsVerification) checked.push('verification');
  return `Hazy checked ${checked.join(', ')} before answering.`;
}

// FIX #1 — Replaced the deeply nested ternary chain with a named,
// readable decision function. Each branch is now independently testable
// and safe to extend without introducing silent precedence bugs.
function resolveReasoningLevel({ reasoningOff, highRisk, forcedDeep, codingTask, mode, codeAnalysis, reasoningTask }) {
  if (reasoningOff) return 'direct';
  if (highRisk) return 'high_caution';
  if (forcedDeep && codingTask) return 'agentic';
  if (mode === 'build') return 'structured';
  if (!codingTask) {
    return (forcedDeep || reasoningTask.shouldUseReasoning) ? 'structured' : 'direct';
  }
  const complexity = codeAnalysis?.complexity;
  if (complexity === 'complex') return 'agentic';
  if (complexity === 'medium') return 'structured';
  return 'light';
}

// FIX #2 — riskConflict now actively escalates behaviour instead of
// being silently discarded.  When keyword risk and safety-module risk
// disagree we (a) force at least a structured reasoning level,
// (b) inject a clarifying question if one hasn't already been set, and
// (c) surface the conflict in the returned profile so callers can log or
// alert.
function resolveRiskConflict({ riskConflict, reasoningLevel, clarification, message }) {
  if (!riskConflict) return { reasoningLevel, clarification };

  const escalated = (reasoningLevel === 'direct' || reasoningLevel === 'light')
    ? 'structured'
    : reasoningLevel;

  const escalatedClarification = clarification.needsQuestion
    ? clarification
    : {
        needsQuestion: true,
        question: 'I noticed a potential risk signal in your request that my safety layer flagged differently from the keywords. Can you confirm the intended scope or environment before I proceed?'
      };

  return { reasoningLevel: escalated, clarification: escalatedClarification };
}

function buildReasoningProfile({
  message,
  mode = 'chat',
  codeAnalysis = {},
  projectContext = {},
  safety = {},
  requestedMode = 'auto',
  showSummary = true
}) {
  const lower = String(message || '').toLowerCase();
  const codingTask = Boolean(codeAnalysis?.isCodingRequest) || mode === 'code' || mode === 'build';
  const reasoningTask = classifyReasoningTask(message, { isCodingRequest: codingTask });

  const explicitHighRisk = /\b(auth|payment|database|security|production|delete|overwrite|deploy|credential|token|secret|migration|schema)\b/i.test(lower);
  const safetyHighRisk = isSafetyHighRisk(safety);
  const highRisk = explicitHighRisk || safetyHighRisk;

  // FIX #2 — track the conflict so resolveRiskConflict can act on it
  const riskConflict = explicitHighRisk !== safetyHighRisk;

  const reasoningMode = normalizeReasoningMode(requestedMode);
  const forcedDeep = reasoningMode === 'deep';
  const reasoningOff = reasoningMode === 'off' && !highRisk;

  let reasoningLevel = resolveReasoningLevel({
    reasoningOff, highRisk, forcedDeep, codingTask, mode, codeAnalysis, reasoningTask
  });

  let clarification = shouldAskClarifyingQuestion({
    mode, codeAnalysis, projectContext, safety, latestMessage: message
  });

  // FIX #2 — apply conflict escalation
  ({ reasoningLevel, clarification } = resolveRiskConflict({
    riskConflict, reasoningLevel, clarification, message
  }));

  const riskLevel = highRisk || (safety.flags || []).length ? 'high' : codingTask ? 'medium' : 'low';
  const needsProjectScan = !reasoningOff && codingTask;
  const needsPlan = !reasoningOff && (forcedDeep || codingTask) && ['structured', 'agentic', 'high_caution'].includes(reasoningLevel);
  const needsVerification = !reasoningOff && (codingTask || highRisk);

  return {
    taskType: reasoningTask.taskType,
    reasoningTask,
    userIntent: codeAnalysis?.codeType || 'general',
    reasoningMode,
    reasoningLevel,
    effort: EFFORT_BY_LEVEL[reasoningLevel] || 'low',
    // FIX #1 (budget note) — budgetTokens is a meaningful hint for
    // providers that support thinking budgets (e.g. Claude extended
    // thinking, future Ollama thinking models). providerAgentAdapter
    // should read this field and map it to the provider's param.
    // For standard Ollama models it controls prompt verbosity instead.
    budgetTokens: BUDGET_BY_LEVEL[reasoningLevel] || 0,
    riskLevel,
    needsQuestion: clarification.needsQuestion,
    question: clarification.question,
    needsProjectScan,
    needsPlan: needsPlan || (!reasoningOff && reasoningTask.shouldUseReasoning),
    needsVerification: needsVerification || (!reasoningOff && reasoningTask.shouldUseCalculator),
    // FIX #3 — selfConsistencyRecommended is now surfaced at the top
    // level of the profile so the orchestrator can act on it directly
    // without digging into reasoningTask. Pair with qualityEvaluator's
    // runSelfConsistency() helper.
    selfConsistencyRecommended: reasoningTask.selfConsistencyRecommended || false,
    publicSummaryEnabled: showSummary !== false && reasoningLevel !== 'direct',
    publicSummary: showSummary !== false && reasoningLevel !== 'direct'
      ? buildPublicSummary({ reasoningLevel, needsProjectScan, needsPlan, needsVerification, riskLevel })
      : '',
    privateReasoningPolicy: 'Do not expose raw chain-of-thought, scratchpad text, or <thinking> blocks.',
    allowedToExecute: false,
    // FIX #2 — expose conflict for caller logging / alerting
    riskConflict,
    riskConflictNote: riskConflict
      ? 'Keyword risk and safety-module risk disagreed. Reasoning level was escalated and a clarifying question was injected.'
      : null,
    safetyDecision: safetyHighRisk ? 'safety_high_risk' : 'safety_low_risk',
    confidence: Math.max(codeAnalysis?.confidence || 0, projectContext?.confidence || 0),
    assumption: projectContext?.primaryLanguage
      ? `This appears to be a ${projectContext.primaryLanguage} ${projectContext.projectType || 'project'} task.`
      : 'This appears to be a general request with no strong project signal yet.'
  };
}

module.exports = {
  buildReasoningProfile,
  normalizeReasoningMode,
  isSafetyHighRisk,
  resolveReasoningLevel
};
