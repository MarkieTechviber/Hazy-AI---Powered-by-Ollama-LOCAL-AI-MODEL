'use strict';

const { shouldAskClarifyingQuestion } = require('./clarificationPolicy');
const { classifyReasoningTask } = require('./taskClassifier');
const { 
  getRecommendedReasoningLevel, 
  getBudgetForLevel, 
  getEffortForLevel,
  REASONING_POLICY 
} = require('./reasoningPolicy');

// Phase 2 wiring
const qualityEvaluator = require('./qualityEvaluator');
const responseReviewer = require('../responseReviewer');

function getLoopReviewers() {
  return {
    evaluateReasoningResponse: qualityEvaluator.evaluateReasoningResponse,
    runSelfConsistency: qualityEvaluator.runSelfConsistency,
    reviewResponse: responseReviewer.reviewResponse
  };
}

const REASONING_MODES = new Set(['off', 'auto', 'deep']);

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
  const explicitRisk = /\b(payment\s+card|credit\s+card|production\s+deploy|drop\s+database|drop\s+table|rm\s+-rf|format\s+disk|wipe\s+drive|revoke\s+credential|rotate\s+secret|api[_-]?key\s+leak)\b/i.test(text);
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
  const reasoningTask = classifyReasoningTask(message, { isCodingRequest: codingTask });

  const explicitHighRisk = /\b(auth|payment|database|security|production|delete|overwrite|deploy|credential|token|secret|migration|schema)\b/i.test(lower);
  const safetyHighRisk = isSafetyHighRisk(safety);
  const highRisk = explicitHighRisk || safetyHighRisk;
  const riskConflict = explicitHighRisk !== safetyHighRisk;

  const reasoningMode = normalizeReasoningMode(requestedMode);
  const forcedDeep = reasoningMode === 'deep';
  const reasoningOff = reasoningMode === 'off' && !highRisk;

  // === RAW DATA LOGIC ===
  // Instead of long hardcoded if-else, we now call the policy
  let reasoningLevel = getRecommendedReasoningLevel({
    taskType: reasoningTask.taskType,
    mode,
    complexity: reasoningTask.complexity,
    riskLevel: highRisk ? 'high' : 'low',
    isHighRisk: highRisk
  });

  // Apply forced deep if user requested it
  if (forcedDeep && reasoningLevel !== 'high_caution') {
    reasoningLevel = 'agentic';
  }

  let clarification = shouldAskClarifyingQuestion({
    mode, codeAnalysis, projectContext, safety, latestMessage: message
  });

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
    effort: getEffortForLevel(reasoningLevel),
    budgetTokens: getBudgetForLevel(reasoningLevel),
    riskLevel,
    needsQuestion: clarification.needsQuestion,
    question: clarification.question,
    needsProjectScan,
    needsPlan: needsPlan || (!reasoningOff && reasoningTask.shouldUseReasoning),
    needsVerification: needsVerification || (!reasoningOff && reasoningTask.shouldUseCalculator),
    selfConsistencyRecommended: reasoningTask.selfConsistencyRecommended || false,
    publicSummaryEnabled: showSummary !== false && reasoningLevel !== 'direct',
    publicSummary: showSummary !== false && reasoningLevel !== 'direct'
      ? buildPublicSummary({ reasoningLevel, needsProjectScan, needsPlan, needsVerification, riskLevel })
      : '',
    privateReasoningPolicy: 'Do not expose raw chain-of-thought, scratchpad text, or <thinking> blocks.',
    allowedToExecute: false,
    riskConflict,
    riskConflictNote: riskConflict
      ? 'Keyword risk and safety-module risk disagreed. Reasoning level was escalated.'
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
  getLoopReviewers
};
