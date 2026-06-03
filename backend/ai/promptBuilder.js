function buildSystemPrompt(context) {
  const {
    messageType,
    emotion,
    intensity,
    intent,
    userNeed,
    responseMode,
    responsePlan,
    memory = [],
    ragContext = [],
    toolResults = [],
    questionLimit = 1,
    safety = { riskLevel: "tier_0", flags: [] },
    reasoning = null,
    codeAnalysis = null,
    projectContext = null
  } = context;

  const memoryBlock = memory.length
    ? memory.map((item) => `- ${item.summary || item.value || item}`).join("\n")
    : "- No durable memory needed for this turn.";

  const ragBlock = ragContext.length
    ? ragContext.map((item) => `- ${item.summary || item.text || item}`).join("\n")
    : "- No external retrieval context.";

  const toolBlock = toolResults.length
    ? toolResults.map((item) => {
        const count = Array.isArray(item.results) ? item.results.length : 0;
        return `- ${item.tool}: ${item.success ? `${count} result(s)` : 'no useful result'}${item.query ? ` for "${item.query}"` : ''}`;
      }).join("\n")
    : "- No tool results for this turn.";
  const toolInstructionBlock = toolResults.length
    ? `Tool results were gathered before model generation. Use the provided tool context as the source for this turn. Do not say you cannot browse, cannot search, or cannot access current information; instead, answer from the tool context and clearly mention if the results are weak, incomplete, or failed.`
    : `No tool context was gathered for this turn.`;

  const planBlock = (responsePlan?.outline || [])
    .map((line) => `- ${line}`)
    .join("\n");

  const safetyFlags = safety.flags.length ? safety.flags.join(", ") : "none";
  const reasoningBlock = reasoning
    ? [
        `- Task type: ${reasoning.taskType}`,
        `- User intent: ${reasoning.userIntent}`,
        `- Reasoning level: ${reasoning.reasoningLevel}`,
        `- Risk level: ${reasoning.riskLevel}`,
        `- Project scan: ${reasoning.needsProjectScan ? 'on' : 'off'}`,
        `- Verification: ${reasoning.needsVerification ? 'on' : 'off'}`,
        `- Assumption: ${reasoning.assumption}`
      ].join("\n")
    : "- No special reasoning profile.";
  const codingBlock = codeAnalysis?.isCodingRequest
    ? [
        `- Language: ${codeAnalysis.languageLabel || codeAnalysis.language || 'auto'}`,
        `- Confidence: ${codeAnalysis.confidence}%`,
        `- Code task: ${codeAnalysis.codeType}`,
        `- Complexity: ${codeAnalysis.complexity}`,
        `- Frameworks: ${(codeAnalysis.frameworks || []).join(", ") || 'none detected'}`
      ].join("\n")
    : "- Not a coding-specialized turn.";
  const projectBlock = projectContext
    ? [
        `- Detected stack: ${projectContext.detectedStack || 'unknown'}`,
        `- Primary language: ${projectContext.primaryLanguage || 'unknown'}`,
        `- Frameworks: ${(projectContext.frameworks || []).join(", ") || 'none detected'}`,
        `- Project type: ${projectContext.projectType || 'unknown'}`,
        `- Evidence: ${(projectContext.evidence || []).join(", ") || 'none'}`
      ].join("\n")
    : "- No project context.";

  return `Use the user's existing system prompt, persona, and active mode instructions as the primary source of behavior, identity, tone, and boundaries.

Do not replace or re-interpret the user's chosen persona. Treat the guidance below as secondary turn-level support only.

Current turn context:
- Message type: ${messageType}
- User emotion: ${emotion}
- Intensity: ${intensity}
- Intent: ${intent}
- User need: ${userNeed}
- Response mode: ${responseMode}
- Safety risk: ${safety.riskLevel}
- Safety flags: ${safetyFlags}

Response plan:
${planBlock}

Relevant memory:
${memoryBlock}

Relevant context:
${ragBlock}

Tool context summary:
${toolBlock}

Tool usage instruction:
${toolInstructionBlock}

Reasoning control:
${reasoningBlock}

Coding context:
${codingBlock}

Project context:
${projectBlock}

Operational reply guidance:
- Preserve the user's chosen style and role; only adapt delivery for this specific turn.
- If they need support, acknowledge before solving.
- If they need a direct answer, lead with the answer.
- Ask at most ${questionLimit} focused question(s).
- Be specific, concrete, and proportionate.
- Be transparent when uncertain.
- Do not reveal private chain-of-thought. If helpful, give only a short reasoning summary.
`;
}

module.exports = { buildSystemPrompt };
