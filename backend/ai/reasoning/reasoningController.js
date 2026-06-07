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
  const reasoningTask = classifyReasoningTask(message, {
    isCodingRequest: codingTask
  });
  const explicitHighRisk = /\b(auth|payment|database|security|production|delete|overwrite|deploy|credential|token|secret|migration|schema)\b/i.test(lower);
  const safetyHighRisk = isSafetyHighRisk(safety);
  const highRisk = explicitHighRisk || safetyHighRisk;
  const riskConflict = explicitHighRisk !== safetyHighRisk;
  const reasoningMode = normalizeReasoningMode(requestedMode);
  const forcedDeep = reasoningMode === 'deep';
  const reasoningOff = reasoningMode === 'off' && !highRisk;
  const reasoningLevel = reasoningOff
    ? 'direct'
    : highRisk
      ? 'high_caution'
      : forcedDeep && codingTask
        ? 'agentic'
        : mode === 'build'
          ? 'structured'
          : !codingTask
            ? (forcedDeep || reasoningTask.shouldUseReasoning ? 'structured' : 'direct')
            : codeAnalysis?.complexity === 'complex'
              ? 'agentic'
              : codeAnalysis?.complexity === 'medium'
                ? 'structured'
                : 'light';

  const riskLevel = highRisk || (safety.flags || []).length ? 'high' : codingTask ? 'medium' : 'low';
  const needsProjectScan = !reasoningOff && codingTask;
  const needsPlan = !reasoningOff && (forcedDeep || codingTask) && ['structured', 'agentic', 'high_caution'].includes(reasoningLevel);
  const needsVerification = !reasoningOff && (codingTask || highRisk);
  const clarification = shouldAskClarifyingQuestion({
    mode,
    codeAnalysis,
    projectContext,
    safety,
    latestMessage: message
  });

  return {
    taskType: reasoningTask.taskType,
    reasoningTask,
    userIntent: codeAnalysis?.codeType || 'general',
    reasoningMode,
    reasoningLevel,
    effort: EFFORT_BY_LEVEL[reasoningLevel] || 'low',
    budgetTokens: BUDGET_BY_LEVEL[reasoningLevel] || 0,
    riskLevel,
    needsQuestion: clarification.needsQuestion,
    question: clarification.question,
    needsProjectScan,
    needsPlan: needsPlan || (!reasoningOff && reasoningTask.shouldUseReasoning),
    needsVerification: needsVerification || (!reasoningOff && reasoningTask.shouldUseCalculator),
    publicSummaryEnabled: showSummary !== false && reasoningLevel !== 'direct',
    publicSummary: showSummary !== false && reasoningLevel !== 'direct'
      ? buildPublicSummary({ reasoningLevel, needsProjectScan, needsPlan, needsVerification, riskLevel })
      : '',
    privateReasoningPolicy: 'Do not expose raw chain-of-thought, scratchpad text, or <thinking> blocks.',
    allowedToExecute: false,
    riskConflict,
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
  isSafetyHighRisk
};
