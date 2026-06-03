const { verifyCodeResponse } = require('./coding/codeVerifier');

function reviewResponse(response, context) {
  const issues = [];
  let revised = String(response || "");

  if (!revised.trim()) {
    issues.push("empty_response");
  }

  if (context.intent === "direct_answer" && revised.length > 900) {
    issues.push("too_long_for_direct_answer");
    revised = revised.slice(0, 900).trim();
  }

  if (/\bI know exactly how you feel\b/i.test(revised)) {
    issues.push("false_human_experience");
    revised = revised.replace(/I know exactly how you feel\.?\s*/i, "That makes sense as a hard thing to sit with. ");
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

  return {
    approved: issues.length === 0,
    issues,
    response: revised,
    needsRewrite: issues.some((issue) => ["false_human_experience", "too_solution_heavy", "dependency_language"].includes(issue))
  };
}

module.exports = { reviewResponse };
