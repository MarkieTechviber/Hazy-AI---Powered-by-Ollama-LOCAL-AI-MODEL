'use strict';

function shouldAskClarifyingQuestion({ mode, codeAnalysis, projectContext, safety, latestMessage }) {
  const message = String(latestMessage || '').toLowerCase();
  const riskFlags = safety?.flags || [];
  const languageConfidence = codeAnalysis?.confidence ?? 0;
  const hasProjectContext = (projectContext?.confidence || 0) >= 20;
  const complexTask = codeAnalysis?.complexity === 'complex';
  const destructive = /\b(delete|remove|rewrite everything|overwrite|drop database|wipe)\b/i.test(message);
  const execution = /\b(run|execute|install|migrate|deploy|delete files?)\b/i.test(message);
  const sensitive = ['auth', 'payment', 'database', 'security'].some((term) => message.includes(term));

  if (destructive) {
    return {
      needsQuestion: true,
      question: 'Before I change anything destructive, do you want me to preserve the existing files and behavior, or replace them completely?'
    };
  }

  if (execution) {
    return {
      needsQuestion: true,
      question: 'Before I take any run/install/execute action, do you want code changes only, or do you also want me to execute commands after the patch is ready?'
    };
  }

  if ((sensitive || riskFlags.length > 0) && !hasProjectContext) {
    return {
      needsQuestion: true,
      question: 'This change touches a higher-risk area. Can you share the relevant project files or confirm the target stack before I generate a patch?'
    };
  }

  if ((mode === 'code' || codeAnalysis?.isCodingRequest) && complexTask && languageConfidence < 50 && !hasProjectContext) {
    return {
      needsQuestion: true,
      question: 'I can do this, but the target stack is still unclear. Should I assume the current project stack, or do you want a specific language/framework?'
    };
  }

  return {
    needsQuestion: false,
    question: null
  };
}

module.exports = { shouldAskClarifyingQuestion };
