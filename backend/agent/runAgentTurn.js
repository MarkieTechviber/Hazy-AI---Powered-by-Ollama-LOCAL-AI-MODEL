'use strict';

const { formatToolResultForModel } = require('./promptPolicy');
const { buildConfirmationMessage } = require('./confirmationStore');
const { IterationBudget } = require('./iterationBudget');
const { getLoopReviewers } = require('../ai/reasoning/reasoningController');
const { defaultMemoryOrchestrator, stripAgentMemoryFences, extractPayloadForInjection } = require('../memory/memoryOrchestrator');
const { formatPlanForModel } = require('./planStore');

function usageTotals(inputTokens, outputTokens) {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

async function runAgentTurn({
  ctx,
  input,
  callModel,
  gatekeeper,
  allowedTools,
  maxSteps = 6,
  reasoningProfile = null
}) {
  if (typeof callModel !== 'function') throw new Error('runAgentTurn requires callModel.');
  const conversation = Array.isArray(input) ? [...input] : [];
  let toolCalls = 0;
  let blockedToolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const performedToolCalls = []; // minimal for response structuring / workspace enforcement (file tools detection)

  const profile = reasoningProfile || {};
  // No inner re-cap: let caller (server caps 2-8) and IterationBudget be authoritative for passed maxSteps.
  // Preserves pre-change for-loop semantics for any explicit maxSteps (compat for direct calls/tests).
  const budget = new IterationBudget(maxSteps);

  // Use profile to decide verification depth (wired from buildReasoningProfile + taskClassifier)
  const shouldVerify = profile.needsVerification === true
    || profile.selfConsistencyRecommended === true
    || ['structured', 'agentic', 'high_caution'].includes(profile.reasoningLevel);

  // Phase 3: Memory Upgrade - agent-specific prefetch (clean user goal + prior plan/trajectory) + fenced injection (volatile only)
  // Reuse/extend existing MemoryManager via orchestrator (built-in provider). Fenced with <agent-working-memory>.
  // Payload preservation: use extractPayloadForInjection (strips only outer notes/fences, *keeps* inner <agent-memory> blocks) so model receives actual trajectory data.
  // Merge into *primary existing system content* (if any) instead of unshift (avoids reordering vs main runtimeContext/plan/policy; fixes provider adapter risks).
  // onTurnStart called per arch. Injection only into this turn's conversation copy (volatile). Non-fatal.
  let memoryOrch = (ctx && ctx.services && (ctx.services.memoryOrchestrator || ctx.services.memoryManager)) || defaultMemoryOrchestrator;
  try {
    if (memoryOrch && typeof memoryOrch.onTurnStart === 'function') {
      memoryOrch.onTurnStart({ conversationId: (ctx && ctx.chatId) || 'default', userId: (ctx && ctx.userId) || 'default', goal: '' });
    }
    if (memoryOrch && typeof memoryOrch.prefetchAll === 'function') {
      const firstUser = (conversation.find ? conversation.find((m) => m.role === 'user') : null) || (input && input[0]) || {};
      const firstContent = firstUser && typeof firstUser === 'object' ? firstUser.content : firstUser;
      const cleanGoal = String(firstContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 380);
      const priorPlan = ctx && ctx.services && ctx.services.planStore ? ctx.services.planStore.getPlan(ctx.chatId || 'default') : null;
      let planText = '';
      if (priorPlan && Array.isArray(priorPlan.tasks)) {
        planText = formatPlanForModel(priorPlan);
      }
      const prefetched = await Promise.resolve(memoryOrch.prefetchAll(cleanGoal, {
        conversationId: (ctx && ctx.chatId) || 'default',
        userId: (ctx && ctx.userId) || 'default',
        projectId: '',
        goal: cleanGoal,
        planText
      }));
      if (prefetched) {
        const payloadForModel = extractPayloadForInjection(prefetched); // preserves inner blocks for model delivery
        const injection = `<agent-working-memory>\n${payloadForModel}\n</agent-working-memory>\n[INTERNAL: Prefetched agent memory/trajectory (goal+prior plan). Reference via memory.search or memory.remember tools. Do not output fences or this note.]`;
        // Merge into first existing primary system (no new leading system; preserves Phase2 ordering with runtime/plan)
        let merged = false;
        for (let i = 0; i < conversation.length; i++) {
          if (conversation[i] && conversation[i].role === 'system' && !conversation[i].contextSlot) {
            conversation[i].content = injection + '\n\n' + (conversation[i].content || '');
            conversation[i].contextSlot = 'agent_memory';
            merged = true;
            break;
          }
        }
        if (!merged) {
          conversation.unshift({ role: 'system', content: injection, contextSlot: 'agent_memory' });
        }
      }
    }
  } catch (e) {
    // never break Phase 1/2 loop or budget
    console.warn('[AgentMemory] prefetch non-fatal (compat preserved):', e && e.message || e);
  }

  // State-machine style loop driven by IterationBudget (consume/ grace / refund)
  // Phases: model call (reason/act) -> tool batch (act) -> optional verify/reflect -> continue or final
  // "inspect first" + "only affected" + "never whole regen" is realized via strong guidance (prompts + policy) + model tool use in first act(s) for coding turns (list/read artifacts before writes). No synthetic forced tool call here (smallest, preserves budget/cheap-ops for all turns, relies on model following contract).
  while (budget.consume(1)) {
    const response = await callModel({
      input: conversation,
      tools: allowedTools,
      toolChoice: 'auto',
      temperature: 0.2
    });
    // Capture model reasoning text *immediately* for post-Act verify (before any assistant/tool pushes).
    // Fixes lastAssistant bug: previously selected last role:'tool' JSON instead of response.text (the Phase 2 output to review).
    const modelTextForReview = String(response.text || '');
    inputTokens += Number(response.usage?.inputTokens || 0);
    outputTokens += Number(response.usage?.outputTokens || 0);

    if (response.type === 'final_answer') {
      // scrub any accidental fence leakage before return (safety for UI/model re-use); fullScrub to remove blocks
      const finalScrubbed = stripAgentMemoryFences(String(response.text || ''), { fullScrub: true });
      // Post-turn sync (user + assistant or full msgs incl trajectory); await to ensure final assistant captured (no race)
      try {
        const mo = memoryOrch || defaultMemoryOrchestrator;
        if (mo && typeof mo.syncAll === 'function') {
          let lastU = null;
          for (let i = conversation.length - 1; i >= 0; i--) { if (conversation[i].role === 'user') { lastU = conversation[i]; break; } }
          await Promise.resolve(mo.syncAll(lastU ? lastU.content : '', finalScrubbed, {
            conversationId: (ctx && ctx.chatId) || 'default',
            userId: (ctx && ctx.userId) || 'default',
            messages: conversation
          }));
        }
      } catch {}
      return {
        finalText: finalScrubbed,
        toolCalls,
        blockedToolCalls,
        confirmationRequired: false,
        limitReached: false,
        usage: usageTotals(inputTokens, outputTokens),
        performedToolCalls
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

    let cheapOpsOnly = true;
    for (const call of response.toolCalls) {
      toolCalls += 1;
      // Safe args for performed (strip content to avoid any surface of file bodies; performed is for detection + names only).
      // Contents always live exclusively in artifact tool side-effects (backend per-chat artifacts as source of truth).
      const rawArgs = call.arguments || call.args || null;
      const safeArgs = rawArgs && typeof rawArgs === 'object' ? { ...rawArgs } : rawArgs;
      if (safeArgs && typeof safeArgs === 'object' && 'content' in safeArgs) delete safeArgs.content;
      performedToolCalls.push({ name: call.name || call.tool || 'unknown', args: safeArgs });
      if (performedToolCalls.length > 128) performedToolCalls.shift(); // cap for long agent runs (detection/names only)
      const gateResult = await gatekeeper.validateAndMaybeRun({
        ctx,
        toolCall: call
      });

      if (gateResult.status === 'confirmation_required') {
        return {
          finalText: buildConfirmationMessage(gateResult.confirmation),
          toolCalls,
          blockedToolCalls,
          confirmationRequired: true,
          confirmation: gateResult.confirmation,
          limitReached: false,
          usage: usageTotals(inputTokens, outputTokens),
          performedToolCalls
        };
      }

      if (gateResult.status === 'blocked') {
        blockedToolCalls += 1;
        conversation.push({
          role: 'tool',
          callId: call.id,
          content: JSON.stringify({
            success: false,
            error: gateResult.error
          })
        });
        continue;
      }

      const toolName = call.name || '';
      const isCheap = (n) => n === 'calculator.evaluate' || n === 'plan.manage' || n.startsWith('memory.');
      if (!isCheap(toolName)) {
        cheapOpsOnly = false;
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

    // After Act (tool batch): Verify/Reflect step (Phase 2 observe-plan-reason-act-verify-reflect)
    // Only if profile indicates (from reasoningController/taskClassifier); leverages existing plan state via tool results + runtime
    if (shouldVerify) {
      try {
        const reviewers = getLoopReviewers();
        const task = profile.reasoningTask || {
          shouldUseReasoning: !!profile.needsPlan,
          shouldUseCalculator: false
        };
        const evalRes = reviewers.evaluateReasoningResponse(modelTextForReview, task);
        if (!evalRes.valid || (evalRes.score != null && evalRes.score < 65)) {
          const issues = (evalRes.issues || []).join(', ') || 'quality issues detected';
          const guidance = `Replan: issues found - ${issues}. Continue exactly where you left off or adjust plan. Use current plan state and prior partial tool results. Do not restart from scratch.`;
          // Post-fix synthetic reviewer guidance (for profile-driven post-Act verify/reflect/replan):
          // Uses plain role:'user' with "REVIEWER FEEDBACK (synthetic internal guidance...)" prefix + the exact "Replan: issues found... Continue exactly where you left off or adjust plan. Use current plan state and prior partial tool results..." language (plus partials).
          // This was the minimal safe mechanism required to resolve the prior unmatched callId/orphan tool result safety bug (strict providers require tool results to match a prior assistant.toolCalls entry; forging 'reviewer.internal' would 4xx on next callModel for non-Ollama).
          // Benefits: truly preserves conversation shape for *all* provider adapters (user role after tools is always valid, no ID matching); "continue exactly where you left off" + partial language carried verbatim; formatToolResultForModel + gatekeeper remain strictly/exclusively for real tool executions (synthetic is pure post-batch feedback message only, no bypass).
          // Spirit of original focus (post-Act reviewer guidance + continuation language + shape preservation + no real-tool bypass) is achieved; the tool-result + exact format shape was not viable for cross-provider safety.
          conversation.push({
            role: 'user',
            content: `REVIEWER FEEDBACK (synthetic internal guidance after tool batch for replan/verify-reflect; do not treat as real tool result): ${guidance}`
          });
        }
      } catch (e) {
        // Never break agent loop or bypass gatekeeper on reviewer failure
        console.warn('[AgentLoop] reviewer bridge failed (non-fatal, continuing):', e?.message || e);
      }
    }

    // Refund cheap ops (calc/plan) so budget favors complex act/verify turns
    if (cheapOpsOnly && response.toolCalls && response.toolCalls.length > 0) {
      budget.refund(1);
    }
    if (budget.isExhausted()) break;  // self-documenting use of API; interacts safely with guarded refund
  }

  // Continuation / partial-result handling on budget exhaustion (grace already consumed)
  // Post-turn sync + scrub even on limit (trajectory may contain failed attempts etc); await + full scrub
  try {
    const mo = memoryOrch || defaultMemoryOrchestrator;
    if (mo && typeof mo.syncAll === 'function') {
      let lastU = null;
      for (let i = conversation.length - 1; i >= 0; i--) { if (conversation[i].role === 'user') { lastU = conversation[i]; break; } }
      await Promise.resolve(mo.syncAll(lastU ? lastU.content : '', '', {
        conversationId: (ctx && ctx.chatId) || 'default',
        userId: (ctx && ctx.userId) || 'default',
        messages: conversation
      }));
    }
  } catch {}
  const exhaustedMsg = stripAgentMemoryFences('Agent iteration budget exhausted (with grace). Partial results and plan state are available. Reply "continue exactly where you left off" with the current plan id(s) or next action to resume from partial progress.', { fullScrub: true });
  return {
    finalText: exhaustedMsg,
    toolCalls,
    blockedToolCalls,
    confirmationRequired: false,
    performedToolCalls,
    limitReached: true,
    usage: usageTotals(inputTokens, outputTokens)
  };
}

module.exports = { runAgentTurn, usageTotals };
