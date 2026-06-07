'use strict';

const { formatToolResultForModel } = require('./promptPolicy');
const { buildConfirmationMessage } = require('./confirmationStore');

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
  maxSteps = 6
}) {
  if (typeof callModel !== 'function') throw new Error('runAgentTurn requires callModel.');
  const conversation = Array.isArray(input) ? [...input] : [];
  let toolCalls = 0;
  let blockedToolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let step = 1; step <= maxSteps; step += 1) {
    const response = await callModel({
      input: conversation,
      tools: allowedTools,
      toolChoice: 'auto',
      temperature: 0.2
    });
    inputTokens += Number(response.usage?.inputTokens || 0);
    outputTokens += Number(response.usage?.outputTokens || 0);

    if (response.type === 'final_answer') {
      return {
        finalText: String(response.text || ''),
        toolCalls,
        blockedToolCalls,
        confirmationRequired: false,
        limitReached: false,
        usage: usageTotals(inputTokens, outputTokens)
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

    for (const call of response.toolCalls) {
      toolCalls += 1;
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
          usage: usageTotals(inputTokens, outputTokens)
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
  }

  return {
    finalText: 'I could not complete that within the safe tool-step limit. Please narrow the request.',
    toolCalls,
    blockedToolCalls,
    confirmationRequired: false,
    limitReached: true,
    usage: usageTotals(inputTokens, outputTokens)
  };
}

module.exports = { runAgentTurn, usageTotals };
