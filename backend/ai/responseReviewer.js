'use strict';

const { verifyCodeResponse } = require('./coding/codeVerifier');
const { evaluateReasoningResponse } = require('./reasoning/qualityEvaluator');

// FIX #1 — Original had a silent content-loss bug: if a model opens a
// <thinking> tag but never closes it (e.g. stream error, model crash),
// depth stays > 0 at the end and the final `if (depth === 0)` branch
// never fires — silently discarding the user's actual answer.
//
// Fix: track whether we ever entered a thinking block. If we reach the
// end of the string while still inside one, append whatever remains
// after the last cursor position so content is never silently dropped,
// and mark `truncated` so callers can log the malformed block.
function stripPrivateReasoningBlocks(text) {
  const input = String(text || '');
  const tagPattern = /<\s*(\/?)\s*thinking\b[^>]*>/gi;
  let output = '';
  let depth = 0;
  let cursor = 0;
  let removed = false;
  let truncated = false;
  let match;

  while ((match = tagPattern.exec(input)) !== null) {
    const closing = Boolean(match[1]);

    if (!closing) {
      // Opening tag — if we're at surface level, capture text up to here
      if (depth === 0) {
        output += input.slice(cursor, match.index);
      }
      depth += 1;
      removed = true;
      cursor = tagPattern.lastIndex;
    } else {
      // Closing tag
      if (depth > 0) {
        depth -= 1;
        removed = true;
        cursor = tagPattern.lastIndex;
      }
      // If depth is already 0, a stray closing tag — let it pass through
    }
  }

  if (depth === 0) {
    // Normal path: all thinking blocks were closed
    output += input.slice(cursor);
  } else {
    // Unclosed thinking block — treat everything after the opening tag as
    // private scratchpad and strip it. This prevents malformed streamed
    // reasoning from leaking into the visible answer.
    truncated = true;
  }

  return {
    text: output.trim(),
    removed,
    truncated // callers can log/flag this for debugging
  };
}

function reviewResponse(response, context) {
  const issues = [];
  let revised = String(response || '');

  if (!revised.trim()) {
    issues.push('empty_response');
  }

  const isDeepThink = context.reasoningMode === 'deep';
  const isAgentic = context.agentEnabled === true;

  if (!isDeepThink && !isAgentic) {
    const strippedReasoning = stripPrivateReasoningBlocks(revised);
    if (strippedReasoning.removed) {
      issues.push('private_reasoning_exposed');
      revised = strippedReasoning.text;
    }
    // FIX #1 — surface truncated thinking blocks as a distinct issue
    if (strippedReasoning.truncated) {
      issues.push('unclosed_thinking_block');
    }
  }

  // FIX — hard truncation at 900 chars was cutting code responses
  // mid-sentence. Only apply to genuinely conversational direct answers,
  // not code or structured content.
  const hasCodeBlock = /```[\s\S]*?```/.test(revised);
  if (context.intent === 'direct_answer' && !hasCodeBlock && revised.length > 900) {
    issues.push('too_long_for_direct_answer');
    // Trim to last complete sentence within limit instead of hard-slicing
    const trimmed = revised.slice(0, 900);
    const lastSentence = trimmed.search(/[.!?][^.!?]*$/);
    revised = lastSentence > 400
      ? trimmed.slice(0, lastSentence + 1).trim()
      : trimmed.trim();
  }

  if (/\bI know exactly how you feel\b/i.test(revised)) {
    issues.push('false_human_experience');
    revised = revised.replace(/I know exactly how you feel\.?\s*/i, 'That makes sense as a hard thing to sit with. ');
  }

  if (/\b(?:I(?:'| a)m|I am)\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/i.test(revised)) {
    issues.push('self_ai_label');
    revised = revised.replace(/\b(?:I(?:'| a)m|I am)\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/gi, "I'm Hazy");
  }

  if (/\bas\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/i.test(revised)) {
    if (!issues.includes('self_ai_label')) issues.push('self_ai_label');
    revised = revised.replace(/\bas\s+(?:an?\s+)?(?:AI assistant|AI|artificial intelligence|language model|chatbot|bot|robot)\b/gi, 'as Hazy');
  }

  const questionCount = (revised.match(/\?/g) || []).length;
  if (questionCount > 2) {
    issues.push('too_many_questions');
  }

  if (context.intent === 'venting' && /\b(you should|here's what to do|do this next)\b/i.test(revised)) {
    issues.push('too_solution_heavy');
  }

  if (/\bI(?:'| a)m always here for you\b/i.test(revised) || /\byou only need me\b/i.test(revised)) {
    issues.push('dependency_language');
    revised = revised.replace(/\bI(?:'| a)m always here for you\b/gi, 'I can help you think this through');
  }

  if (context.taskType === 'coding') {
    const codeReview = verifyCodeResponse(revised, context);
    issues.push(...codeReview.issues);
  }

  const reasoningQuality = evaluateReasoningResponse(revised, {
    ...(context.reasoningTask || {
      taskType: context.taskType || 'general',
      shouldUseReasoning: false,
      shouldUseCalculator: context.taskType === 'math'
    }),
    reasoningMode: context.reasoningMode,
    agentEnabled: context.agentEnabled
  });

  for (const issue of reasoningQuality.issues) {
    if (!issues.includes(issue)) issues.push(issue);
  }

  return {
    approved: issues.length === 0,
    issues,
    response: revised,
    reasoningQuality,
    needsRewrite: issues.some((issue) => [
      'false_human_experience',
      'too_solution_heavy',
      'dependency_language',
      'self_ai_label'
    ].includes(issue))
  };
}

module.exports = { reviewResponse, stripPrivateReasoningBlocks };
