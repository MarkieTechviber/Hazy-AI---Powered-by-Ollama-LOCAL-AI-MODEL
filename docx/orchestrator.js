const path = require("path");
const { detectEmotion } = require("./empathy/emotionDetector");
const { detectIntent } = require("./empathy/intentDetector");
const { classifyMessage } = require("./empathy/messageClassifier");
const { detectSafety } = require("./empathy/safetyDetector");
const { selectEmpathyStrategy } = require("./empathy/empathyPolicy");
const { planResponse } = require("./empathy/responsePlanner");
const { getToneProfile } = require("./empathy/toneProfiles");
const { buildSystemPrompt } = require("./ai/promptBuilder");
const { prepareProviderPayload } = require("./ai/modelRouter");
const { reviewResponse } = require("./ai/responseReviewer");
const { analyzeCodeRequest } = require("./ai/coding/codeIntelligence");
const { scanProjectContext } = require("./ai/coding/projectContextScanner");
const { buildReasoningProfile } = require("./ai/reasoning/reasoningController");
const { MemoryManager } = require("./memory/memoryManager");
const { HazyDatabase } = require("./storage/hazyDatabase");
const { VectorSearch } = require("./rag/vectorSearch");
const { OllamaEmbeddingService } = require("./rag/embeddingService");
const { classifyAgentMode } = require("./agent/agentTypes");
const { buildRuntimeContextBlock } = require("./agent/promptPolicy");
const { defaultAgentRuntime, createToolContext } = require("./agent/agentRuntime");

const dataDir = path.join(__dirname, "..", "cache", "hazy-engine");
const database = new HazyDatabase(path.join(dataDir, "hazy.db"));
const memoryManager = new MemoryManager(path.join(dataDir, "memory"), { database });
const vectorSearch = new VectorSearch(path.join(dataDir, "rag"), { embeddingService: new OllamaEmbeddingService() });

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

function analyzeMessage({ body, conversationId = "default", userId = "default" }) {
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
  const memory = memoryManager.getRelevantMemory({ conversationId, userId, projectId });
  const ragContext = vectorSearch.search(latestMessage, {
    userId,
    fileIds: body.hazy?.selectedFileIds || body.fileIds,
    limit: body.hazy?.ragMaxChunks || 8,
    candidateLimit: body.hazy?.ragCandidateLimit || 30,
    minimumScore: body.hazy?.ragMinimumScore ?? 0.12
  });
  const toolResults = Array.isArray(body.hazy?.toolResults) ? body.hazy.toolResults : [];
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
    questionLimit: strategy.questionLimit,
    safety,
    reasoning,
    codeAnalysis,
    projectContext,
    currentProject,   // passed through so promptBuilder can emit the exact "CURRENT PROJECT FILES" block for edits
    toolResults,
    agentMode,
    runtimeContext
  };

  console.log('[Hazy] currentProject present for prompt:', Boolean(contextForPrompt.currentProject), contextForPrompt.currentProject?.files?.length || 0);

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

function prepareChatRequest(body = {}) {
  const conversationId = body.conversationId || "default";
  const userId = body.userId || "default";
  const analysis = analyzeMessage({ body, conversationId, userId });
  const conversation = memoryManager.getConversation(conversationId);
  const providerBody = prepareProviderPayload({
    ...body,
    hazy: {
      ...(body.hazy || {}),
      contextPacking: {
        memory: analysis.memory.filter((item) =>
          item.type === 'preference' || item.type === 'project_fact'
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

function finalizeResponse({ conversationId, userId, userMessage, responseText, analysis }) {
  const review = reviewResponse(responseText, {
    intent: analysis.intentData.primaryIntent,
    emotion: analysis.emotionData.emotion,
    intensity: analysis.emotionData.intensity,
    taskType: analysis.reasoning?.taskType || "general",
    reasoningTask: analysis.reasoning?.reasoningTask,
    codeType: analysis.codeAnalysis?.codeType,
    language: analysis.codeAnalysis?.language,
    userMessage
  });

  memoryManager.recordTurn({
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
  memoryManager
};
