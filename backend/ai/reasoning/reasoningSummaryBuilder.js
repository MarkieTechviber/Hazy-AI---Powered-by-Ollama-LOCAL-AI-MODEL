'use strict';

function safeJoin(values, fallback = 'none') {
  const clean = (values || []).filter(Boolean).map((value) => String(value));
  return clean.length ? clean.join(', ') : fallback;
}

function truncate(value, max = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function buildToolSummary(toolResults, toolDecisions) {
  if (toolResults.length) {
    return toolResults.map((item) => {
      const count = Array.isArray(item.results) ? item.results.length : 0;
      const status = item.success ? `${count} result(s)` : 'failed or no useful result';
      const query = item.query ? ` for "${truncate(item.query, 60)}"` : '';
      return `${item.tool}: ${status}${query}`;
    }).join(' | ');
  }

  return safeJoin(
    toolDecisions.map((item) => `${item.tool}: ${item.reason}`),
    'No tool needed'
  );
}

function buildPublicReasoningTrace({ analysis = {}, toolRun = {} } = {}) {
  const reasoning = analysis.reasoning || {};
  const code = analysis.codeAnalysis || {};
  const project = analysis.projectContext || {};
  const safety = analysis.safety || {};
  const contextWindow = analysis.contextWindow || {};
  const toolResults = Array.isArray(toolRun.toolResults) ? toolRun.toolResults : [];
  const toolDecisions = Array.isArray(toolRun.decisions) ? toolRun.decisions : [];

  const isCoding = Boolean(code.isCodingRequest);
  const agentEnabled = Boolean(toolRun.agentEnabled);
  const webDecision = toolDecisions.find((item) => item && item.tool === 'web_search') || {};
  const webResult = toolResults.find((item) => item && item.tool === 'web_search') || {};
  const searchQuery = webResult.query || webDecision.query || 'none';
  const providersTried = webResult.providersTried || [];
  const webResultCount = Array.isArray(webResult.results) ? webResult.results.length : 0;
  const hasToolContext = toolResults.some((item) => Array.isArray(item.results) && item.results.length > 0);
  const toolStatus = webResult.tool
    ? `${webResult.success ? 'success' : 'failed or weak'} (${webResultCount} result(s); providers: ${safeJoin(providersTried)})`
    : 'no web search tool run';

  const steps = [
    {
      label: 'Checked',
      value: reasoning.publicSummary || 'Hazy checked the request before answering.'
    },
    {
      label: 'Route',
      value: `${reasoning.taskType || (isCoding ? 'coding' : 'general')} -> ${reasoning.userIntent || code.codeType || 'general'}`
    },
    {
      label: 'Task analysis',
      value: reasoning.reasoningTask
        ? `${reasoning.reasoningTask.complexity} | confidence ${reasoning.reasoningTask.confidence}% | calculator ${reasoning.reasoningTask.shouldUseCalculator ? 'on' : 'off'}`
        : 'general request'
    },
    {
      label: 'Agent enabled',
      value: agentEnabled ? 'yes' : 'no'
    },
    {
      label: 'Tool decision',
      value: buildToolSummary(toolResults, toolDecisions)
    },
    {
      label: 'Search query',
      value: truncate(searchQuery, 140)
    },
    {
      label: 'Tool status',
      value: toolStatus
    },
    {
      label: 'Reasoning level',
      value: `${reasoning.reasoningLevel || 'direct'} | effort ${reasoning.effort || 'none'} | risk ${reasoning.riskLevel || safety.riskLevel || 'low'}`
    },
    {
      label: 'Model context',
      value: hasToolContext
        ? 'answering with tool context'
        : 'answering without successful tool result context'
    },
    {
      label: 'Context window',
      value: contextWindow.safeInputLimit
        ? `${contextWindow.afterTokens || 0}/${contextWindow.safeInputLimit} input tokens | ${contextWindow.trimLog?.length || contextWindow.trimmedMessageCount || 0} packing action(s) | ${contextWindow.packedSlots?.retrievedChunks || 0} retrieved chunk(s)`
        : 'context budget unavailable'
    },
    {
      label: 'Code intelligence',
      value: isCoding
        ? `${code.languageLabel || code.language || 'auto'} | ${code.confidence ?? 0}% | ${code.complexity || 'unknown'} | ${code.codeType || 'general'}`
        : 'not a coding-specialized turn'
    },
    {
      label: 'Project context',
      value: `${project.detectedStack || 'unknown'} | language ${project.primaryLanguage || 'unknown'} | evidence ${safeJoin((project.evidence || []).slice(0, 4), 'none')}`
    },
    {
      label: 'Question gate',
      value: reasoning.needsQuestion
        ? `ask before proceeding: ${truncate(reasoning.question, 130)}`
        : 'proceed without extra question'
    },
    {
      label: 'Verification',
      value: reasoning.needsVerification ? 'code/output review enabled' : 'normal response review only'
    }
  ];

  return {
    title: 'HAZY REASONING SUMMARY',
    summary: hasToolContext
      ? 'Tool context was gathered before answering.'
      : (reasoning.publicSummary || reasoning.assumption || 'Request routed without successful tool result context.'),
    steps,
    tools: toolResults.map((item) => ({
      tool: item.tool,
      query: item.query,
      success: Boolean(item.success),
      resultCount: Array.isArray(item.results) ? item.results.length : 0,
      providersTried: item.providersTried || []
    })),
    note: 'Safe public summary only. Private reasoning is not shown or stored.'
  };
}

function encodeReasoningTrace(trace) {
  try {
    return Buffer.from(JSON.stringify(trace), 'utf8').toString('base64url');
  } catch {
    return '';
  }
}

module.exports = {
  buildPublicReasoningTrace,
  encodeReasoningTrace
};
