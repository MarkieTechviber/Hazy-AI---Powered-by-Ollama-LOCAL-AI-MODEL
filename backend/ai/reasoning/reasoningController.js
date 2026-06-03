'use strict';

const { shouldAskClarifyingQuestion } = require('./clarificationPolicy');

function buildReasoningProfile({ message, mode = 'chat', codeAnalysis = {}, projectContext = {}, safety = {} }) {
  const lower = String(message || '').toLowerCase();
  const codingTask = Boolean(codeAnalysis?.isCodingRequest) || mode === 'code' || mode === 'build';
  const highRisk = /\b(auth|payment|database|security|production|delete|overwrite|deploy)\b/i.test(lower);
  const reasoningLevel = !codingTask
    ? 'direct'
    : highRisk
      ? 'high_caution'
      : codeAnalysis?.complexity === 'complex'
        ? 'agentic'
        : codeAnalysis?.complexity === 'medium'
          ? 'structured'
          : 'light';

  const riskLevel = highRisk || (safety.flags || []).length ? 'high' : codingTask ? 'medium' : 'low';
  const needsProjectScan = codingTask;
  const needsPlan = codingTask && ['structured', 'agentic', 'high_caution'].includes(reasoningLevel);
  const needsVerification = codingTask;
  const clarification = shouldAskClarifyingQuestion({
    mode,
    codeAnalysis,
    projectContext,
    safety,
    latestMessage: message
  });

  return {
    taskType: codingTask ? 'coding' : 'general',
    userIntent: codeAnalysis?.codeType || 'general',
    reasoningLevel,
    riskLevel,
    needsQuestion: clarification.needsQuestion,
    question: clarification.question,
    needsProjectScan,
    needsPlan,
    needsVerification,
    allowedToExecute: false,
    confidence: Math.max(codeAnalysis?.confidence || 0, projectContext?.confidence || 0),
    assumption: projectContext?.primaryLanguage
      ? `This appears to be a ${projectContext.primaryLanguage} ${projectContext.projectType || 'project'} task.`
      : 'This appears to be a general request with no strong project signal yet.'
  };
}

module.exports = { buildReasoningProfile };
