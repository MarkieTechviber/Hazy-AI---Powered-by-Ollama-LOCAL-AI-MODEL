'use strict';

const { formatToolResultForModel } = require('./promptPolicy');
const { buildConfirmationMessage } = require('./confirmationStore');
const { IterationBudget } = require('./iterationBudget');
const { getLoopReviewers } = require('../ai/reasoning/reasoningController');
const { defaultMemoryOrchestrator, stripAgentMemoryFences, extractPayloadForInjection } = require('../memory/memoryOrchestrator');
const { formatPlanForModel, planScopeKey } = require('./planStore');

const DEFAULT_TURN_TIMEOUT_MS = 5 * 60 * 1000; // FIX: 5-min overall turn cap — original had per-tool timeouts but no total cap

function usageTotals(inputTokens, outputTokens) {
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

// FIX: extracted syncMemory helper — original copy-pasted the same ~14 lines twice (final answer + exhausted paths).
// Now: single place to maintain; both paths just call this.
async function _syncMemory(memoryOrch, ctx, conversation, assistantText) {
  try {
    const mo = memoryOrch || defaultMemoryOrchestrator;
    if (!mo || typeof mo.syncAll !== 'function') return;
    let lastUserMsg = null;
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === 'user') { lastUserMsg = conversation[i]; break; }
    }
    await Promise.resolve(mo.syncAll(lastUserMsg ? lastUserMsg.content : '', assistantText, {
      conversationId: (ctx && ctx.chatId) || 'default',
      userId: (ctx && ctx.userId) || 'default',
      projectId: ctx?.projectId || '',
      messages: conversation
    }));
  } catch {
    // never block the loop on sync failure
  }
}

// FIX: deduplication helper — original could let the model call the same tool with the same args
// twice in one batch (double-spend on writes, double-charge on paid APIs).
function deduplicateToolCalls(toolCalls) {
  const seen = new Set();
  return toolCalls.filter((call) => {
    const fingerprint = `${call.name || call.tool}::${JSON.stringify(call.arguments || call.args || {})}`;
    if (seen.has(fingerprint)) {
      console.warn('[AgentLoop] duplicate tool call suppressed:', call.name);
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

async function runAgentTurn({
  ctx,
  input,
  callModel,
  gatekeeper,
  allowedTools,
  maxSteps = 6,
  reasoningProfile = null,
  turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS  // FIX: exposed as param so tests can shrink it
}) {
  if (typeof callModel !== 'function') throw new Error('runAgentTurn requires callModel.');

  // The provider call and the loop share one deadline. A loop-only check is not
  // enough because a stalled provider request can otherwise occupy the turn forever.
  const effectiveTurnTimeoutMs = Math.max(1, Math.min(Number(turnTimeoutMs) || DEFAULT_TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS));
  const turnDeadline = Date.now() + effectiveTurnTimeoutMs;
  const isTurnExpired = () => Date.now() > turnDeadline;

  const conversation = Array.isArray(input) ? [...input] : [];
  let toolCalls = 0;
  let blockedToolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const performedToolCalls = [];

  const profile = reasoningProfile || {};
  const budget = new IterationBudget(maxSteps);

  const shouldVerify = profile.needsVerification === true
    || profile.selfConsistencyRecommended === true
    || ['structured', 'agentic', 'high_caution'].includes(profile.reasoningLevel);

  // Phase 3: Memory prefetch
  let memoryOrch = (ctx && ctx.services && (ctx.services.memoryOrchestrator || ctx.services.memoryManager)) || defaultMemoryOrchestrator;
  try {
    if (memoryOrch && typeof memoryOrch.onTurnStart === 'function') {
      memoryOrch.onTurnStart({
        conversationId: (ctx && ctx.chatId) || 'default',
        userId: (ctx && ctx.userId) || 'default',
        goal: ''
      });
    }
    if (memoryOrch && typeof memoryOrch.prefetchAll === 'function') {
      const firstUser = conversation.find?.((m) => m.role === 'user') || input?.[0] || {};
      const firstContent = firstUser && typeof firstUser === 'object' ? firstUser.content : firstUser;
      const cleanGoal = String(firstContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 380);
      const priorPlan = ctx?.services?.planStore ? ctx.services.planStore.getPlan(planScopeKey(ctx)) : null;
      const planText = priorPlan && Array.isArray(priorPlan.tasks) ? formatPlanForModel(priorPlan) : '';

      const prefetched = await Promise.resolve(memoryOrch.prefetchAll(cleanGoal, {
        conversationId: (ctx && ctx.chatId) || 'default',
        userId: (ctx && ctx.userId) || 'default',
        projectId: ctx?.projectId || '',
        goal: cleanGoal,
        planText
      }));

      if (prefetched) {
        const payloadForModel = extractPayloadForInjection(prefetched);
        const injection = `<agent-working-memory>\n${payloadForModel}\n</agent-working-memory>\n[INTERNAL: Prefetched agent memory/trajectory. Reference via memory.search or memory.remember. Do not output fences.]`;
        let merged = false;
        for (let i = 0; i < conversation.length; i++) {
          if (conversation[i]?.role === 'system' && !conversation[i].contextSlot) {
            conversation[i].content = injection + '\n\n' + (conversation[i].content || '');
            conversation[i].contextSlot = 'agent_memory';
            merged = true;
            break;
          }
        }
        if (!merged) conversation.unshift({ role: 'system', content: injection, contextSlot: 'agent_memory' });
      }
    }
  } catch (e) {
    console.warn('[AgentMemory] prefetch non-fatal:', e?.message || e);
  }

  while (budget.consume(1, 'model_turn')) {
    // FIX: check overall turn deadline before each model call
    if (isTurnExpired()) {
      console.warn('[AgentLoop] turn deadline exceeded, breaking loop early');
      break;
    }

    const remainingMs = Math.max(1, turnDeadline - Date.now());
    const abortController = new AbortController();
    let deadlineTimer;
    const deadlinePromise = new Promise((_, reject) => {
      deadlineTimer = setTimeout(() => {
        reject(Object.assign(new Error('Agent turn timed out.'), { code: 'AGENT_TURN_TIMEOUT' }));
        abortController.abort();
      }, remainingMs);
    });

    let response;
    try {
      response = await Promise.race([
        Promise.resolve(callModel({
          input: conversation,
          tools: allowedTools,
          toolChoice: 'auto',
          temperature: 0.2,
          signal: abortController.signal,
          timeoutMs: remainingMs
        })),
        deadlinePromise
      ]);
    } finally {
      clearTimeout(deadlineTimer);
    }

    const modelTextForReview = String(response.text || '');
    inputTokens += Number(response.usage?.inputTokens || 0);
    outputTokens += Number(response.usage?.outputTokens || 0);

    if (response.type === 'final_answer') {
      const finalScrubbed = stripAgentMemoryFences(String(response.text || ''), { fullScrub: true });
      await _syncMemory(memoryOrch, ctx, conversation, finalScrubbed);
      return {
        finalText: finalScrubbed,
        toolCalls,
        blockedToolCalls,
        confirmationRequired: false,
        limitReached: false,
        usage: usageTotals(inputTokens, outputTokens),
        performedToolCalls,
        budgetSummary: budget.summary()
      };
    }

    if (response.type !== 'tool_calls' || !Array.isArray(response.toolCalls)) {
      throw new Error('Model adapter returned an unsupported agent response.');
    }

    conversation.push({
      role: 'assistant',
      content: String(response.text || ''),
      toolCalls: response.toolCalls
    });

    // FIX: deduplicate tool calls before execution — model can hallucinate duplicate calls in one batch
    const uniqueToolCalls = deduplicateToolCalls(response.toolCalls);

    for (const call of uniqueToolCalls) {
      toolCalls += 1;

      const rawArgs = call.arguments || call.args || null;
      const safeArgs = rawArgs && typeof rawArgs === 'object' ? { ...rawArgs } : rawArgs;
      if (safeArgs && typeof safeArgs === 'object' && 'content' in safeArgs) delete safeArgs.content;
      performedToolCalls.push({ name: call.name || call.tool || 'unknown', args: safeArgs });
      if (performedToolCalls.length > 128) performedToolCalls.shift();

      const gateResult = await gatekeeper.validateAndMaybeRun({ ctx, toolCall: call });

      if (gateResult.status === 'confirmation_required') {
        return {
          finalText: buildConfirmationMessage(gateResult.confirmation),
          toolCalls,
          blockedToolCalls,
          confirmationRequired: true,
          confirmation: gateResult.confirmation,
          limitReached: false,
          usage: usageTotals(inputTokens, outputTokens),
          performedToolCalls,
          budgetSummary: budget.summary()
        };
      }

      if (gateResult.status === 'blocked') {
        blockedToolCalls += 1;
        conversation.push({
          role: 'tool',
          callId: call.id,
          content: JSON.stringify({ success: false, error: gateResult.error })
        });
        continue;
      }

      conversation.push({
        role: 'tool',
        callId: call.id,
        content: formatToolResultForModel({
          toolName: call.name,
          callId: call.id,
          result: gateResult.result
        }).content
      });
    }

    // FIX: skip verify on last budget step — original pushed a reviewer message even when the budget
    // was exhausted, wasting the final message slot and potentially confusing the model.
    if (shouldVerify && budget.remaining() > 0 && !isTurnExpired()) {
      try {
        const reviewers = getLoopReviewers();
        const task = profile.reasoningTask || { shouldUseReasoning: !!profile.needsPlan, shouldUseCalculator: false };
        const evalRes = reviewers.evaluateReasoningResponse(modelTextForReview, task);
        if (!evalRes.valid || (evalRes.score != null && evalRes.score < 65)) {
          const issues = (evalRes.issues || []).join(', ') || 'quality issues detected';
          conversation.push({
            role: 'user',
            content: `REVIEWER FEEDBACK (synthetic internal guidance after tool batch for replan/verify-reflect; do not treat as real tool result): Replan: issues found - ${issues}. Continue exactly where you left off or adjust plan. Use current plan state and prior partial tool results. Do not restart from scratch.`
          });
        }
      } catch (e) {
        console.warn('[AgentLoop] reviewer bridge failed (non-fatal):', e?.message || e);
      }
    }

    // Every model turn consumes budget. Tool cost does not change how many times
    // untrusted model output is allowed to drive the loop.
    if (budget.isExhausted()) break;
  }

  // Budget exhausted (or turn timeout) — sync memory and return partial result
  await _syncMemory(memoryOrch, ctx, conversation, '');
  const exhaustedMsg = stripAgentMemoryFences(
    'Agent iteration budget exhausted (with grace). Partial results and plan state are available. Reply "continue exactly where you left off" with the current plan id(s) or next action to resume from partial progress.',
    { fullScrub: true }
  );

  return {
    finalText: exhaustedMsg,
    toolCalls,
    blockedToolCalls,
    confirmationRequired: false,
    performedToolCalls,
    limitReached: true,
    usage: usageTotals(inputTokens, outputTokens),
    budgetSummary: budget.summary()  // FIX: expose budget summary so callers can log/alert on exhaustion patterns
  };
}

module.exports = { runAgentTurn, usageTotals };
