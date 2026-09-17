'use strict';

const path = require("path");
const { detectEmotion } = require("../../empathy/emotionDetector");
const { detectIntent } = require("../../empathy/intentDetector");
const { classifyMessage } = require("../../empathy/messageClassifier");
const { detectSafety } = require("../../empathy/safetyDetector");
const { selectEmpathyStrategy } = require("../../empathy/empathyPolicy");
const { planResponse } = require("../../empathy/responsePlanner");
const { getToneProfile } = require("../../empathy/toneProfiles");
const { buildSystemPrompt } = require("../../ai/promptBuilder");
const { prepareProviderPayload } = require("../../ai/modelRouter");
const { reviewResponse } = require("../../ai/responseReviewer");
const { analyzeCodeRequest } = require("../../ai/coding/codeIntelligence");
const { scanProjectContext } = require("../../ai/coding/projectContextScanner");
const { buildReasoningProfile } = require("../../ai/reasoning/reasoningController");
const { MemoryManager } = require("../../memory/memoryManager");
const { HazyDatabase } = require("../../storage/hazyDatabase");
const { VectorSearch } = require("../../rag/vectorSearch");
const { OllamaEmbeddingService } = require("../../rag/embeddingService");
const { classifyAgentMode } = require("../../agent/agentTypes");
const { buildRuntimeContextBlock } = require("../../agent/promptPolicy");
const { defaultAgentRuntime, createToolContext } = require("../../agent/agentRuntime");

const { DATA_DIR: dataDir, CONFIG_DIR } = require('../../config/runtimePaths');
const MEMORY_ENABLED = process.env.HAZY_MEMORY_ENABLED !== '0';
const database = new HazyDatabase(path.join(dataDir, "hazy.db"));
const memoryManager = new MemoryManager(path.join(dataDir, "memory"), { database });
const vectorSearch = new VectorSearch(path.join(dataDir, "rag"), { embeddingService: new OllamaEmbeddingService({ baseUrl: require('../../config/runtimeConfig').loadConfig().providers.ollama.baseUrl }) });

const fs = require('fs');

const { loadConfig } = require('../../config/runtimeConfig');

async function searchIfNeeded(latestMessage, body, { force = false } = {}) {
  if (process.env.HAZY_OFFLINE === '1') return [];
  if (Array.isArray(body.hazy?.toolResults)) {
    return body.hazy.toolResults;
  }

  const { detectSearchDecision } = require('../../webSearch/searchRouter');
  const decision = detectSearchDecision(latestMessage, { forceSearch: force });
  if (decision.mode === 'none') {
    return [];
  }

  try {
    const { runDeterministicTools } = require('../../tools/toolRouter');
    const cfg = loadConfig();
    const tempBody = {
      ...body,
      messages: [{ role: 'user', content: latestMessage }],
      hazy: {
        ...(body.hazy || {}),
        forceWebSearch: force ? true : undefined
      }
    };
    const result = await runDeterministicTools({ body: tempBody, cfg });
    return result.toolResults || [];
  } catch (e) {
    console.warn('[Orchestrator] searchIfNeeded failed:', e.message);
    return [];
  }
}

function getLatestUserMessage(messages = []) {
  const reversed = [...messages].reverse();
  return reversed.find((message) => message?.role === "user")?.content || "";
}

function deriveProfileHints({ intentData, strategy }) {
  const hints = {};
  if (intentData.directnessPreference === "high") {
    hints.response_style = "direct";
  }
  if (strategy.mode) {
    hints.preferred_recent_tone = strategy.mode;
  }
  return hints;
}

async function analyzeMessage({ body, conversationId = "default", userId = "default" }) {
  const projectId = body.projectId || body.hazy?.projectId || "";
  const latestMessage = getLatestUserMessage(body.messages || []);
  const emotionData = detectEmotion(latestMessage);
  const intentData = detectIntent(latestMessage);
  const messageType = classifyMessage(latestMessage, intentData);
  const safety = detectSafety(latestMessage);
  const strategy = selectEmpathyStrategy({
    emotion: emotionData.emotion,
    intent: intentData.primaryIntent,
    intensity: emotionData.intensity,
    safety
  });
  const toneProfile = getToneProfile(strategy.mode);
  let memory = [];
  if (MEMORY_ENABLED) {
    try { memory = memoryManager.getRelevantMemory({ conversationId, userId, projectId, query: latestMessage }); }
    catch { console.warn('[Hazy] Memory retrieval unavailable.'); }
  }
  
  let ragContext = [];
  if (body.hazy?.ragEnabled !== false) {
    try {
      ragContext = await vectorSearch.searchAsync(latestMessage, {
        userId,
        projectId,
        fileIds: body.hazy?.selectedFileIds || body.fileIds,
        limit: body.hazy?.ragMaxChunks || 8,
        candidateLimit: body.hazy?.ragCandidateLimit || 30,
        minimumScore: body.hazy?.ragMinimumScore ?? 0.12
      });
    } catch (err) {
      console.warn('[Hazy] Retrieval unavailable; trying lexical fallback.');
      try { ragContext = vectorSearch.search(latestMessage, {
        userId,
        projectId,
        fileIds: body.hazy?.selectedFileIds || body.fileIds,
        limit: body.hazy?.ragMaxChunks || 8,
        candidateLimit: body.hazy?.ragCandidateLimit || 30,
        minimumScore: body.hazy?.ragMinimumScore ?? 0.12
      }); } catch { ragContext = []; }
    }
  }

  const agentEnabled = body.hazy?.agentEnabled === true
    || body.hazy?.agenticMode === true
    || String(body.hazy?.surface || body.hazy?.page || '').toLowerCase() === 'agent'
    || String(body.hazy?.surface || body.hazy?.page || '').toLowerCase() === 'agentic';

  const toolResults = await searchIfNeeded(latestMessage, body, { force: body.hazy?.forceWebSearch === true });
  const toolContext = createToolContext(body);
  const pendingConfirmation = defaultAgentRuntime.confirmations.findPending(toolContext);
  const currentPlan = defaultAgentRuntime.planStore
    ? defaultAgentRuntime.planStore.getPlan(toolContext.chatId)
    : null;
  const agentMode = classifyAgentMode({
    message: latestMessage,
    hasRetrievedContext: ragContext.length > 0,
    hasToolResults: toolResults.length > 0,
    pendingConfirmation,
    safety
  });
  const runtimeContext = buildRuntimeContextBlock(toolContext, {
    mode: agentMode,
    availableToolNames: defaultAgentRuntime.registry.list(toolContext).map((tool) => tool.name),
    pendingConfirmation,
    currentPlan
  });
  const userLangHint = body.hazy?.codeLangHint && body.hazy.codeLangHint !== "auto"
    ? body.hazy.codeLangHint
    : null;
  const currentProject = body.hazy?.currentProject || null;
  const projectContext = scanProjectContext({
    attachments: body.hazy?.attachments || [],
    messages: body.messages || [],
    currentProject
  });
  const codeAnalysis = analyzeCodeRequest(
    latestMessage,
    body.messages || [],
    userLangHint,
    projectContext,
    currentProject
  );
  const reasoning = buildReasoningProfile({
    message: latestMessage,
    mode: body.hazy?.mode || "chat",
    codeAnalysis,
    projectContext,
    safety,
    requestedMode: body.hazy?.reasoningMode || "auto",
    showSummary: body.hazy?.showReasoningSummary !== false
  });
  const responsePlan = planResponse({
    strategy,
    userNeed: emotionData.userNeed,
    toneProfile,
    memory: memory,
    ragContext: ragContext
  });

  const contextForPrompt = {
    messageType: messageType.messageType,
    emotion: emotionData.emotion,
    intensity: emotionData.intensity,
    intent: intentData.primaryIntent,
    userNeed: emotionData.userNeed,
    responseMode: strategy.mode,
    responsePlan,
    memory: memory,
    ragContext: ragContext,
    deferRetrievalToPacker: true,
    questionLimit: strategy.questionLimit,
    safety,
    reasoning,
    codeAnalysis,
    projectContext,
    currentProject,
    toolResults,
    agentMode,
    agentEnabled,
    runtimeContext,
    isBuild: body.hazy?.isBuild || false,
    isCode: body.hazy?.isCode || false,
    appearance: body.hazy?.appearance || null,
    codeLangHint: body.hazy?.codeLangHint || null,
    message: latestMessage,
    conversationHistory: body.messages || []
  };

  const prompt = buildSystemPrompt(contextForPrompt);

  return {
    projectId,
    latestMessage,
    emotionData,
    intentData,
    messageType,
    safety,
    strategy,
    toneProfile,
    memory,
    ragContext,
    toolResults,
    agentMode,
    agentEnabled,
    runtimeContext,
    pendingConfirmation,
    projectContext,
    currentProject,
    codeAnalysis,
    reasoning,
    responsePlan,
    prompt
  };
}

async function prepareChatRequest(body = {}) {
  const conversationId = body.conversationId || "default";
  const userId = body.userId || "default";
  body = { ...body, options: { num_ctx: Number(process.env.HAZY_CONTEXT_SIZE) || 4096, ...body.options }, hazy: { ragMaxChunks: Number(process.env.HAZY_RAG_CHUNKS) || 8, ...body.hazy } };
  const analysis = await analyzeMessage({ body, conversationId, userId });
  let conversation = { summaries: [] };
  try { conversation = memoryManager.getConversation(conversationId, userId, analysis.projectId); } catch { /* Chat can proceed without optional history. */ }
  const providerBody = prepareProviderPayload({
    ...body,
    hazy: {
      ...(body.hazy || {}),
      contextPacking: {
        memory: analysis.memory.filter((item) =>
          !['agent_plan', 'agent_step', 'failed_attempt', 'artifact_ref', 'unresolved_question'].includes(item.type)
        ),
        agentMemory: analysis.memory.filter((item) =>
          ['agent_plan', 'agent_step', 'failed_attempt', 'artifact_ref', 'unresolved_question'].includes(item.type)
        ),
        summary: (conversation.summaries || []).slice(-2).join('\n\n'),
        retrievedChunks: analysis.ragContext
      }
    }
  }, analysis.prompt);
  analysis.contextWindow = providerBody.hazyContext;
  const provider = String(providerBody.model || '').split('/')[0];
  const nativeProvider = ['anthropic', 'openai'].includes(provider) ? provider : 'hazy';
  providerBody.hazyReasoning = {
    mode: analysis.reasoning?.reasoningMode || 'auto',
    reasoningMode: analysis.reasoning?.reasoningMode || 'auto',
    level: analysis.reasoning?.reasoningLevel || 'direct',
    effort: analysis.reasoning?.effort || 'none',
    budgetTokens: analysis.reasoning?.budgetTokens || 0,
    nativeProvider,
    publicSummaryEnabled: Boolean(analysis.reasoning?.publicSummaryEnabled)
  };

  return {
    conversationId,
    userId,
    analysis,
    providerBody
  };
}

async function finalizeResponse({ conversationId, userId, userMessage, responseText, analysis }) {
  const review = reviewResponse(responseText, {
    intent: analysis.intentData.primaryIntent,
    emotion: analysis.emotionData.emotion,
    intensity: analysis.emotionData.intensity,
    taskType: analysis.reasoning?.taskType || "general",
    reasoningTask: analysis.reasoning?.reasoningTask,
    codeType: analysis.codeAnalysis?.codeType,
    language: analysis.codeAnalysis?.language,
    userMessage,
    reasoningMode: analysis.reasoning?.reasoningMode || 'auto',
    agentEnabled: analysis.agentEnabled === true
  });

  // Gap 3: Agentic File Creation
  const isAgentic = analysis.agentEnabled === true;
  if (isAgentic && analysis.codeAnalysis?.isCodingRequest) {
    try {
      const agentFileManager = require('../../agent/agentFileManager');
      const codeMatch = responseText.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/);
      const codeToSave = codeMatch ? codeMatch[1] : responseText;
      const taskContext = analysis.codeAnalysis.codeType || analysis.intentData?.primaryIntent || 'coding-task';
      const language = analysis.codeAnalysis.language || 'javascript';

      const filePath = await agentFileManager.writeOrUpdate({
        conversationId,
        userId,
        projectId: analysis.projectId || '',
        taskContext,
        code: codeToSave,
        language
      });
      review.filePath = filePath;
      review.response = `[Updated in workspace: ${filePath}]\n\n` + review.response;
    } catch (err) {
      console.warn('[Orchestrator] agentFileManager failed:', err.message);
    }
  }

  if (MEMORY_ENABLED) memoryManager.recordTurn({
    conversationId,
    userId,
    projectId: analysis.projectId || "",
    userMessage,
    finalResponse: review.response,
    analysis: {
      emotion: analysis.emotionData.emotion,
      intent: analysis.intentData.primaryIntent,
      mode: analysis.strategy.mode
    },
    profileHints: deriveProfileHints({ intentData: analysis.intentData, strategy: analysis.strategy })
  });

  return review;
}

module.exports = {
  analyzeMessage,
  prepareChatRequest,
  finalizeResponse,
  database,
  memoryManager,
  vectorSearch
};
