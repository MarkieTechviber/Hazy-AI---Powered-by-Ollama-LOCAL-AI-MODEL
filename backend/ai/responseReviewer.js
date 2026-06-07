const { verifyCodeResponse } = require('./coding/codeVerifier');
const { evaluateReasoningResponse } = require('./reasoning/qualityEvaluator');

function stripPrivateReasoningBlocks(text) {
  const input = String(text || "");
  const tagPattern = /<\s*(\/?)\s*thinking\b[^>]*>/gi;
  let output = "";
  let depth = 0;
  let cursor = 0;
  let removed = false;
  let match;

  while ((match = tagPattern.exec(input)) !== null) {
    if (depth === 0) {
      output += input.slice(cursor, match.index);
    }

    const closing = Boolean(match[1]);
    if (closing) {
      if (depth > 0) depth -= 1;
      removed = true;
      cursor = tagPattern.lastIndex;
    } else {
      depth += 1;
      removed = true;
      cursor = tagPattern.lastIndex;
    }
  }

  if (depth === 0) {
    output += input.slice(cursor);
  }

  return {
    text: output.trim(),
    removed
  };
}

function reviewResponse(response, context) {
  const issues = [];
  let revised = String(response || "");

  if (!revised.trim()) {
    issues.push("empty_response");
  }

  const strippedReasoning = stripPrivateReasoningBlocks(revised);
  if (strippedReasoning.removed) {
    issues.push("private_reasoning_exposed");
    revised = strippedReasoning.text;
  }

  if (context.intent === "direct_answer" && revised.length > 900) {
    issues.push("too_long_for_direct_answer");
    revised = revised.slice(0, 900).trim();
  }

  if (/\bI know exactly how you feel\b/i.test(revised)) {
    issues.push("false_human_experience");
    revised = revised.replace(/I know exactly how you feel\.?\s*/i, "That makes sense as a hard thing to sit with. ");
  }

  if (/\b(?:I(?:'| a)m|I am)\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/i.test(revised)) {
    issues.push("self_ai_label");
    revised = revised.replace(/\b(?:I(?:'| a)m|I am)\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/gi, "I'm Hazy");
  }

  if (/\bas\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/i.test(revised)) {
    if (!issues.includes("self_ai_label")) issues.push("self_ai_label");
    revised = revised.replace(/\bas\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/gi, "as Hazy");
  }

  const questionCount = (revised.match(/\?/g) || []).length;
  if (questionCount > 2) {
    issues.push("too_many_questions");
  }

  if (context.intent === "venting" && /\b(you should|here's what to do|do this next)\b/i.test(revised)) {
    issues.push("too_solution_heavy");
  }

  if (/\bI(?:'| a)m always here for you\b/i.test(revised) || /\byou only need me\b/i.test(revised)) {
    issues.push("dependency_language");
    revised = revised.replace(/\bI(?:'| a)m always here for you\b/gi, "I can help you think this through");
  }

  if (context.taskType === 'coding') {
    const codeReview = verifyCodeResponse(revised, context);
    issues.push(...codeReview.issues);
  }

  const reasoningQuality = evaluateReasoningResponse(revised, context.reasoningTask || {
    taskType: context.taskType || 'general',
    shouldUseReasoning: false,
    shouldUseCalculator: context.taskType === 'math'
  });
  for (const issue of reasoningQuality.issues) {
    if (!issues.includes(issue)) issues.push(issue);
  }

  return {
    approved: issues.length === 0,
    issues,
    response: revised,
    reasoningQuality,
    needsRewrite: issues.some((issue) => ["false_human_experience", "too_solution_heavy", "dependency_language", "self_ai_label"].includes(issue))
  };
}

module.exports = { reviewResponse, stripPrivateReasoningBlocks };
