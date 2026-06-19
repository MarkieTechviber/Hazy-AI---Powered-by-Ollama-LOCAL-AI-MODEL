'use strict';

const db = require('../infrastructure/database/db');
const cache = require('../infrastructure/cache/cache');
const { ProductionVectorSearch } = require('../infrastructure/database/vectorStore');
const { detectEmotion } = require('../../empathy/emotionDetector');
const { detectIntent } = require('../../empathy/intentDetector');
const { classifyMessage } = require('../../empathy/messageClassifier');
const { detectSafety } = require('../../empathy/safetyDetector');
const { selectEmpathyStrategy } = require('../../empathy/empathyPolicy');
const { planResponse } = require('../../empathy/responsePlanner');
const { getToneProfile } = require('../../empathy/toneProfiles');
const { buildSystemPrompt } = require('../../ai/promptBuilder');
const { prepareProviderPayload } = require('../../ai/modelRouter');
const { reviewResponse } = require('../../ai/responseReviewer');
const { analyzeCodeRequest } = require('../../ai/coding/codeIntelligence');
const { scanProjectContext } = require('../../ai/coding/projectContextScanner');
const { buildReasoningProfile } = require('../../ai/reasoning/reasoningController');
const { OllamaEmbeddingService } = require('../../rag/embeddingService');
const { classifyAgentMode } = require('../../agent/agentTypes');
const { buildRuntimeContextBlock } = require('../../agent/promptPolicy');
const { defaultAgentRuntime, createToolContext } = require('../../agent/agentRuntime');
const {
  extractMemoryCandidates,
  extractMemoryRemovals,
  makeKey,
  normalizeMemoryType
} = require('../../memory/memoryExtractor');

const vectorSearch = new ProductionVectorSearch({
  embeddingService: new OllamaEmbeddingService()
});

function getLatestUserMessage(messages = []) {
  const reversed = [...messages].reverse();
  return reversed.find((message) => message?.role === 'user')?.content || '';
}

function deriveProfileHints({ intentData, strategy }) {
  const hints = {};
  if (intentData.directnessPreference === 'high') {
    hints.response_style = 'direct';
  }
  if (strategy.mode) {
    hints.preferred_recent_tone = strategy.mode;
  }
  return hints;
}

async function getRelevantMemoryFromDB({ conversationId, userId, projectId, query }) {
  // 1. Fetch recent conversation context
  const turnsRes = await db.query(
    'SELECT role, content, analysis_json FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 40',
    [conversationId]
  );
  const turns = turnsRes.rows.map(r => ({
    role: r.role,
    content: r.content,
    analysis: r.analysis_json
  }));

  const summariesRes = await db.query(
    'SELECT summary FROM conversation_summaries WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  const summaries = summariesRes.rows.map(r => r.summary);

  // 2. Tokenize user query for memory search
  const cleanQuery = String(query || (turns.length ? turns[turns.length - 1].content : '')).toLowerCase();
  const queryTokens = cleanQuery.split(/[^a-z0-9]+/).filter(t => t.length >= 3);

  // 3. Search database memories
  const candidatesRes = await db.query(`
    SELECT id, conversation_id, type, key, value, confidence
    FROM memories
    WHERE user_id = $1
      AND status = 'active'
      AND (project_id = '' OR project_id = $2)
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      AND (type NOT IN ('project_fact', 'agent_plan', 'agent_step', 'failed_attempt', 'artifact_ref', 'unresolved_question') OR conversation_id = $3)
    ORDER BY
      CASE WHEN conversation_id = $4 THEN 0 ELSE 1 END,
      confidence DESC
    LIMIT 40
  `, [userId, projectId || '', conversationId, conversationId]);

  const scoreMemory = (memory) => {
    let score = Number(memory.confidence || 0) * 10;
    if (memory.conversation_id === conversationId) score += 3;
    if (!queryTokens.length) return score;
    const haystack = `${memory.type} ${memory.key} ${memory.value}`.toLowerCase();
    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 4;
    }
    return score;
  };

  const durable = candidatesRes.rows
    .map(memory => ({
      ...memory,
      relevanceScore: scoreMemory(memory)
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 8);

  // Update last used timestamp
  if (durable.length) {
    const ids = durable.map(d => d.id);
    await db.query('UPDATE memories SET last_used_at = CURRENT_TIMESTAMP WHERE id = ANY($1)', [ids]);
  }

  const memories = durable.map(item => ({
    id: item.id,
    type: item.type,
    summary: `${item.key}: ${item.value}`,
    confidence: item.confidence,
    relevanceScore: item.relevanceScore
  }));

  const conversationSummaries = summaries.slice(-2).map(summary => ({
    type: 'conversation_summary',
    summary
  }));

  const lastTurns = turns
    .filter(turn => ['user', 'assistant'].includes(turn.role))
    .slice(-6)
    .map(turn => ({
      type: 'recent_turn',
      summary: `${turn.role}: ${turn.content.slice(0, 180)}`
    }));

  return [...memories, ...conversationSummaries, ...lastTurns].slice(0, 12);
}

const fs = require('fs');

function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', '..', '..', 'config', 'hazy-config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { providers: { ollama: { enabled: true, baseUrl: 'http://localhost:11434' } }, defaults: {} };
  }
}

async function searchIfNeeded(latestMessage, body, { force = false } = {}) {
  if (body.hazy?.toolResults?.length) {
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
    console.warn('[Orchestrator Production] searchIfNeeded failed:', e.message);
    return [];
  }
}

async function analyzeMessage({ body, conversationId = 'default', userId = 'default' }) {
  const projectId = body.projectId || body.hazy?.projectId || '';
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

  const memory = await getRelevantMemoryFromDB({ conversationId, userId, projectId, query: latestMessage });
  
  let ragContext = [];
  if (body.hazy?.ragEnabled !== false) {
    try {
      ragContext = await vectorSearch.searchAsync(latestMessage, {
        userId,
        fileIds: body.hazy?.selectedFileIds || body.fileIds,
        limit: body.hazy?.ragMaxChunks || 8,
      });
    } catch (err) {
      console.warn('[Hazy Production] Semantic search failed:', err.message);
    }
  }

  const agentEnabled = body.hazy?.agentEnabled === true
    || body.hazy?.agenticMode === true
    || String(body.hazy?.surface || body.hazy?.page || '').toLowerCase() === 'agent'
    || String(body.hazy?.surface || body.hazy?.page || '').toLowerCase() === 'agentic';

  const toolResults = await searchIfNeeded(latestMessage, body, { force: agentEnabled });
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
  const userLangHint = body.hazy?.codeLangHint && body.hazy.codeLangHint !== 'auto'
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
    mode: body.hazy?.mode || 'chat',
    codeAnalysis,
    projectContext,
    safety,
    requestedMode: body.hazy?.reasoningMode || 'auto',
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
  const conversationId = body.conversationId || 'default';
  const userId = body.userId || 'default';
  const analysis = await analyzeMessage({ body, conversationId, userId });

  // Get active summaries from DB
  const summariesRes = await db.query(
    'SELECT summary FROM conversation_summaries WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 2',
    [conversationId]
  );
  const summaries = summariesRes.rows.map(r => r.summary);

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
        summary: summaries.join('\n\n'),
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
    taskType: analysis.reasoning?.taskType || 'general',
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
        taskContext,
        code: codeToSave,
        language
      });
      review.filePath = filePath;
      review.response = `[Updated in workspace: ${filePath}]\n\n` + review.response;
    } catch (err) {
      console.warn('[Orchestrator Production] agentFileManager failed:', err.message);
    }
  }

  // Record turn in PostgreSQL
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Ensure Conversation exists
    await client.query(`
      INSERT INTO conversations(id, user_id, project_id, created_at, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        project_id = CASE WHEN excluded.project_id != '' THEN excluded.project_id ELSE conversations.project_id END,
        updated_at = CURRENT_TIMESTAMP
    `, [conversationId, userId, analysis.projectId || '']);

    // Insert user and assistant messages
    const userMsgRes = await client.query(`
      INSERT INTO messages(conversation_id, user_id, role, content, created_at)
      VALUES ($1, $2, 'user', $3, CURRENT_TIMESTAMP)
      RETURNING id
    `, [conversationId, userId, userMessage]);
    
    const userMessageId = userMsgRes.rows[0].id;

    await client.query(`
      INSERT INTO messages(conversation_id, user_id, role, content, analysis_json, created_at)
      VALUES ($1, $2, 'assistant', $3, $4, CURRENT_TIMESTAMP)
    `, [conversationId, userId, review.response, JSON.stringify({
      emotion: analysis.emotionData.emotion,
      intent: analysis.intentData.primaryIntent,
      mode: analysis.strategy.mode
    })]);

    // Handle memory removals and additions
    const removals = extractMemoryRemovals(userMessage);
    if (removals.length) {
      for (const r of removals) {
        await client.query(
          "UPDATE memories SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND (key LIKE $2 OR value ILIKE $3)",
          [userId, `%${makeKey(r.target)}%`, `%${r.target}%`]
        );
      }
    } else {
      for (const candidate of extractMemoryCandidates(userMessage)) {
        const key = makeKey(candidate.key || candidate.value);
        const expiresAt = candidate.expiresAt ? new Date(candidate.expiresAt) : null;
        await client.query(`
          INSERT INTO memories(
            user_id, project_id, conversation_id, type, key, value,
            confidence, sensitivity, source_message_id, status, created_at, updated_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $10)
          ON CONFLICT(user_id, project_id, type, key) DO UPDATE SET
            value = CASE WHEN excluded.confidence >= memories.confidence OR memories.status = 'disabled' THEN excluded.value ELSE memories.value END,
            confidence = GREATEST(memories.confidence, excluded.confidence),
            sensitivity = CASE WHEN memories.sensitivity = 'personal' OR excluded.sensitivity = 'personal' THEN 'personal' ELSE excluded.sensitivity END,
            status = 'active',
            updated_at = CURRENT_TIMESTAMP,
            expires_at = CASE WHEN excluded.confidence >= memories.confidence OR memories.status = 'disabled' THEN excluded.expires_at ELSE memories.expires_at END
        `, [
          userId,
          analysis.projectId || '',
          conversationId,
          normalizeMemoryType(candidate.type),
          key,
          candidate.value,
          candidate.confidence || 0.5,
          candidate.sensitivity || 'normal',
          userMessageId,
          expiresAt
        ]);
      }
    }

    // Invalidate preferences cache in Redis
    await cache.del(`hazy:user:${userId}:preferences`);
    await cache.del(`hazy:chat:${conversationId}:history`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Orchestrator] recordTurn transaction failed:', err.message);
  } finally {
    client.release();
  }

  return review;
}

module.exports = {
  analyzeMessage,
  prepareChatRequest,
  finalizeResponse,
  db,
  cache,
  vectorSearch
};
