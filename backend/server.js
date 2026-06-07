/**
 * Hazy Server v2 — Universal Multi-Provider AI Backend
 * ─────────────────────────────────────────────────────
 * Serves the frontend and proxies requests to:
 *   - Ollama (local models)
 *   - Anthropic (Claude)
 *   - OpenAI (GPT-4o, DALL-E, TTS)
 *   - Groq (fast inference)
 *   - Google Gemini
 *   - ElevenLabs (TTS)
 *   - Stability AI (images)
 *   - Ideogram (images)
 *   - fal.ai (images, video)
 *   - Suno (music)
 *   - Runway (video)
 *
 * API keys are read from: ../config/hazy-config.json
 * Keys NEVER reach the browser — all cloud calls go through this server.
 *
 * Requirements: Node 18+
 */

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const { prepareChatRequest, analyzeMessage, finalizeResponse, database, memoryManager } = require('./orchestrator');
const { createStreamResponseCollector } = require('./ai/streamResponseCollector');
const { runDeterministicTools } = require('./tools/toolRouter');
const { buildPublicReasoningTrace, encodeReasoningTrace } = require('./ai/reasoning/reasoningSummaryBuilder');
const { UsageStatsStore, createResponseTelemetry } = require('./stats/usageStats');
const { defaultAgentRuntime, createToolContext } = require('./agent/agentRuntime');
const { buildConfirmationMessage } = require('./agent/confirmationStore');
const { defaultWebSearchService } = require('./tools/webSearchTool');
const { SecretVault } = require('./security/secretVault');
const { runAgentTurn } = require('./agent/runAgentTurn');
const { createProviderAgentCaller } = require('./ai/providerAgentAdapter');

// ─────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────
const PORT         = process.env.PORT || 8080;
const HOST         = process.env.HOST || '127.0.0.1';
const CORS_ORIGIN  = process.env.HAZY_ALLOWED_ORIGIN || `http://${HOST}:${PORT}`;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const CONFIG_PATH  = path.join(__dirname, '..', 'config', 'hazy-config.json');
const REGISTRY_PATH= path.join(__dirname, '..', 'config', 'models-registry.json');
const CACHE_DIR    = path.join(__dirname, '..', 'cache');
const usageStatsStore = new UsageStatsStore(path.join(CACHE_DIR, 'hazy-engine', 'stats'));
const secretVault = new SecretVault(database);

// ─────────────────────────────────────────────────────
// Load config
// ─────────────────────────────────────────────────────
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('⚠  Could not load hazy-config.json:', e.message);
    return { providers: { ollama: { enabled: true, baseUrl: 'http://localhost:11434' } }, defaults: {} };
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const temporaryPath = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(cfg, null, 2));
  fs.renameSync(temporaryPath, CONFIG_PATH);
}

const PROVIDER_ENV_KEYS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openai_image: 'OPENAI_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  stability: 'STABILITY_API_KEY',
  elevenlabs: 'ELEVENLABS_API_KEY',
  ideogram: 'IDEOGRAM_API_KEY',
  fal: 'FAL_API_KEY',
  suno: 'SUNO_API_KEY',
  runway: 'RUNWAY_API_KEY'
};

function getProviderApiKey(provider, cfg = loadConfig()) {
  const name = String(provider || '').toLowerCase();
  const vaultKey = secretVault.get(name);
  if (vaultKey) return vaultKey;
  const configuredKey = cfg.providers?.[name]?.apiKey;
  if (configuredKey) return configuredKey;
  const envName = PROVIDER_ENV_KEYS[name];
  return envName ? (process.env[envName] || '') : '';
}

function migrateLegacyProviderSecrets() {
  const cfg = loadConfig();
  let changed = false;
  for (const [provider, settings] of Object.entries(cfg.providers || {})) {
    if (!settings?.apiKey) continue;
    secretVault.set(provider, settings.apiKey);
    delete settings.apiKey;
    settings.enabled = true;
    changed = true;
  }
  if (changed) {
    writeConfig(cfg);
    console.log('[Server] Migrated plaintext provider keys into the encrypted local vault.');
  }
}

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch { return {}; }
}

// ─────────────────────────────────────────────────────
// MIME types
// ─────────────────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.mjs':'application/javascript; charset=utf-8',
  '.json':'application/json', '.ico':'image/x-icon', '.png':'image/png',
  '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2',
  '.bin':'application/octet-stream', '.wasm':'application/wasm',
};

// ─────────────────────────────────────────────────────
// CORS headers
// ─────────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', [
      'X-Hazy-Emotion',
      'X-Hazy-Intent',
      'X-Hazy-Mode',
      'X-Hazy-Agent-Mode',
      'X-Hazy-Reasoning',
      'X-Hazy-Trace',
      'X-Hazy-Reasoning-Summary',
      'X-Hazy-Code-Language',
      'X-Hazy-Agent-Enabled',
      'X-Hazy-Agent-Steps',
      'X-Hazy-Agent-Limit-Reached',
      'X-Hazy-Confirmation-Required',
      'X-Hazy-Tool-Used',
      'X-Hazy-Web-Search-Run',
      'X-Hazy-Web-Confidence',
      'X-Hazy-Citation-Count'
    ].join(', '));
}

function mergeResponseHeaders(res, extra = {}) {
  return {
    ...res.getHeaders(),
    ...extra
  };
}

function sanitizeProviderChunk(chunk) {
  return chunk.toString();
}

// ─────────────────────────────────────────────────────
// Read request body
// ─────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((res, rej) => {
    let data = '';
    const MAX = 50 * 1024 * 1024; // 50MB cap — prevents memory exhaustion
    req.on('data', chunk => {
      data += chunk;
      if (data.length > MAX) {
        rej(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { res(JSON.parse(data || '{}')); }
      catch { res({}); }
    });
    req.on('error', rej);
  });
}

// ─────────────────────────────────────────────────────
// Generic HTTPS request
// ─────────────────────────────────────────────────────
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ─────────────────────────────────────────────────────
// Stream proxy helper
// ─────────────────────────────────────────────────────
function streamProxy(reqOptions, requestBody, clientRes) {
  const mod = reqOptions.protocol === 'https:' ? https : http;
  const proxyReq = mod.request(reqOptions, proxyRes => {
    const shouldStream = requestBody?.stream !== false;
    clientRes.writeHead(proxyRes.statusCode, mergeResponseHeaders(clientRes, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': CORS_ORIGIN,
    }));
    if (!shouldStream) {
      let fullBody = '';
      proxyRes.on('data', chunk => { fullBody += chunk.toString(); });
      proxyRes.on('end', () => {
        clientRes.write(sanitizeProviderChunk(fullBody));
        clientRes.end();
      });
      return;
    }

    let lineBuffer = '';
    proxyRes.on('data', chunk => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();
      for (const line of lines) {
        clientRes.write(sanitizeProviderChunk(line) + '\n');
      }
    });
    proxyRes.on('end', () => {
      if (lineBuffer) clientRes.write(sanitizeProviderChunk(lineBuffer));
      clientRes.end();
    });
  });
  proxyReq.on('error', err => {
    if (!clientRes.headersSent) clientRes.writeHead(503, mergeResponseHeaders(clientRes, { 'Content-Type': 'application/json' }));
    clientRes.end(JSON.stringify({ error: err.message }));
  });
  if (requestBody) proxyReq.write(JSON.stringify(requestBody));
  proxyReq.end();
}

// ─────────────────────────────────────────────────────
// Convert unified Hazy message format → provider format
// ─────────────────────────────────────────────────────
function toAnthropicBody(body) {
  const model = (body.model || '').startsWith('anthropic/') ? body.model.slice('anthropic/'.length) : (body.model || 'claude-sonnet-4-5');
  const payload = {
    model,
    max_tokens: body.options?.max_tokens || body.max_tokens || 4096,
    stream: body.stream !== false,
    system: (body.messages || []).find(m => m.role === 'system')?.content || '',
    messages: (body.messages || []).filter(m => m.role !== 'system').map(m => ({
      role: m.role, content: m.content
    })),
    temperature: body.options?.temperature ?? 0.85,
  };
  if (body.hazyReasoning?.nativeProvider === 'anthropic' && body.hazyReasoning.reasoningMode !== 'off') {
    payload.thinking = {
      type: 'adaptive',
      display: body.hazyReasoning.publicSummaryEnabled ? 'summarized' : 'omitted'
    };
    if (body.hazyReasoning.effort && body.hazyReasoning.effort !== 'none') {
      payload.output_config = { effort: body.hazyReasoning.effort };
    }
  }
  return payload;
}

function toOpenAIBody(body) {
  const model = (body.model || '').startsWith('openai/') ? body.model.slice('openai/'.length) : (body.model || 'gpt-4o');
  const payload = {
    model,
    stream: body.stream !== false,
    max_tokens: body.options?.max_tokens || body.max_tokens || 4096,
    temperature: body.options?.temperature ?? 0.85,
    messages: (body.messages || []).map(m => ({ role: m.role, content: m.content })),
  };
  if (body.hazyReasoning?.nativeProvider === 'openai' && body.hazyReasoning.effort && body.hazyReasoning.effort !== 'none') {
    payload.reasoning_effort = body.hazyReasoning.effort;
  }
  return payload;
}

function toNvidiaBody(body) {
  const rawModel = (body.model || '').startsWith('nvidia/')
    ? body.model.slice('nvidia/'.length)
    : (body.model || 'nemotron-3-super-120b-a12b');
  return {
    model: rawModel.startsWith('nvidia/') ? rawModel : 'nvidia/' + rawModel,
    stream: body.stream !== false,
    max_tokens: body.options?.max_tokens || body.max_tokens || 4096,
    temperature: body.options?.temperature ?? 0.85,
    top_p: body.options?.top_p ?? body.top_p ?? 0.95,
    reasoning_budget: body.options?.reasoning_budget || body.reasoning_budget || undefined,
    chat_template_kwargs: body.chat_template_kwargs || body.options?.chat_template_kwargs || undefined,
    messages: (body.messages || []).map(m => ({ role: m.role, content: m.content })),
  };
}

function toGroqBody(body) {
  // Strip only the leading 'groq/' prefix — keep rest of path intact
  // e.g. 'groq/meta-llama/llama-4-scout-17b-16e-instruct' → 'meta-llama/llama-4-scout-17b-16e-instruct'
  const model = (body.model || '').startsWith('groq/')
    ? body.model.slice('groq/'.length)
    : (body.model || 'llama-3.3-70b-versatile');
  return {
    model,
    stream: body.stream !== false,
    max_tokens: body.options?.max_tokens || 4096,
    temperature: body.options?.temperature ?? 0.85,
    messages: (body.messages || []).map(m => ({ role: m.role, content: m.content })),
  };
}

function toGeminiBody(body) {
  const msgs = (body.messages || []).filter(m => m.role !== 'system');
  const systemMsg = (body.messages || []).find(m => m.role === 'system');
  return {
    contents: msgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
    generationConfig: {
      temperature: body.options?.temperature ?? 0.85,
      maxOutputTokens: body.options?.max_tokens || 4096,
    }
  };
}

// Convert Anthropic SSE → Ollama-compatible NDJSON (so frontend doesn't need changes)
function streamAnthropicToOllamaFormat(proxyRes, clientRes) {
  // If Anthropic rejected the key, forward the real error status
  if (proxyRes.statusCode !== 200) {
    let errBody = '';
    proxyRes.on('data', c => errBody += c.toString());
    proxyRes.on('end', () => {
      let msg = 'Authentication failed';
      try { msg = JSON.parse(errBody)?.error?.message || msg; } catch {}
      clientRes.writeHead(proxyRes.statusCode, mergeResponseHeaders(clientRes, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN }));
      clientRes.end(JSON.stringify({ error: msg, status: proxyRes.statusCode }));
    });
    return;
  }
  clientRes.writeHead(200, mergeResponseHeaders(clientRes, {
    'Content-Type': 'application/x-ndjson',
    'Transfer-Encoding': 'chunked',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
  }));
  let buffer = '';
  proxyRes.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const text = j.delta?.text || j.delta?.content?.[0]?.text || '';
        if (text) {
          clientRes.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
        }
        if (j.type === 'message_stop') {
          clientRes.write(JSON.stringify({ done: true }) + '\n');
        }
      } catch {}
    }
  });
  proxyRes.on('end', () => {
    clientRes.write(JSON.stringify({ done: true }) + '\n');
    clientRes.end();
  });
}

function streamOpenAIToOllamaFormat(proxyRes, clientRes) {
  // If OpenAI/Groq rejected the key, forward the real error
  if (proxyRes.statusCode !== 200) {
    let errBody = '';
    proxyRes.on('data', c => errBody += c.toString());
    proxyRes.on('end', () => {
      let msg = 'Authentication failed';
      try { msg = JSON.parse(errBody)?.error?.message || msg; } catch {}
      clientRes.writeHead(proxyRes.statusCode, mergeResponseHeaders(clientRes, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN }));
      clientRes.end(JSON.stringify({ error: msg, status: proxyRes.statusCode }));
    });
    return;
  }
  clientRes.writeHead(200, mergeResponseHeaders(clientRes, {
    'Content-Type': 'application/x-ndjson',
    'Transfer-Encoding': 'chunked',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
  }));
  let buffer = '';
  proxyRes.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') { clientRes.write(JSON.stringify({ done: true }) + '\n'); continue; }
      try {
        const j = JSON.parse(data);
        const text = j.choices?.[0]?.delta?.content || '';
        if (text) clientRes.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
      } catch {}
    }
  });
  proxyRes.on('end', () => { clientRes.write(JSON.stringify({ done: true }) + '\n'); clientRes.end(); });
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/chat  — universal chat endpoint
// ─────────────────────────────────────────────────────
async function handleHazyChat(req, res) {
  const originalBody = await readBody(req);
  const cfg  = loadConfig();
  const chatContext = createToolContext(originalBody);
  const requestedModel = originalBody.model || cfg.defaults?.textModel || 'ollama/llama3.2';
  const requestedProvider = requestedModel.split('/')[0];
  const agentRequested = originalBody.hazy?.agentEnabled === true;
  const agentLoopEnabled = agentRequested
    && ['ollama', 'anthropic', 'openai', 'groq', 'nvidia'].includes(requestedProvider);
  const chatLimit = defaultAgentRuntime.rateLimiter.consume(
    `chat:${chatContext.userId}`,
    { limit: 30, windowMs: 60_000 }
  );
  if (!chatLimit.allowed) {
    setCORS(res);
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    res.end(JSON.stringify({ error: 'Too many chat turns. Please wait and try again.' }));
    return;
  }

  // Agent Mode is routed here, not through a fragile frontend-only loop.
  // If the user asks for web/current/online information while Agent Mode is on,
  // Hazy gathers tool context before the model sees the request.
  const toolRun = agentLoopEnabled
    ? { body: originalBody, agentEnabled: true, toolResults: [] }
    : await runDeterministicTools({ body: originalBody, cfg });
  const body = toolRun.body;

  const prepared = prepareChatRequest(body);
  const analysis = prepared.analysis;
  const providerBody = prepared.providerBody;
  const modelId = providerBody.model || cfg.defaults?.textModel || 'ollama/llama3.2';
  const provider = modelId.split('/')[0];
  const telemetry = createResponseTelemetry({
    store: usageStatsStore,
    userId: prepared.userId,
    chatId: prepared.conversationId,
    model: modelId,
    contextStats: providerBody.hazyContext,
    allowedChunkIds: providerBody.hazyContext?.allowedChunkIds || [],
    averageChunkScore: providerBody.hazyContext?.averageChunkScore || 0
  });
  const shouldRecordConversation = Boolean(originalBody.conversationId && originalBody.userId);
  const responseCollector = createStreamResponseCollector((responseText) => {
    if (!shouldRecordConversation) return;
    try {
      finalizeResponse({
        conversationId: prepared.conversationId,
        userId: prepared.userId,
        userMessage: analysis.latestMessage,
        responseText,
        analysis
      });
    } catch (error) {
      console.warn('[Hazy] Could not finalize companion memory:', error.message);
    }
  });
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  res.write = (chunk, ...args) => {
    telemetry.observe(chunk);
    responseCollector.observe(chunk);
    return originalWrite(chunk, ...args);
  };
  res.end = (chunk, ...args) => {
    telemetry.observe(chunk);
    responseCollector.observe(chunk);
    responseCollector.finish();
    telemetry.finalize({ statusCode: res.statusCode });
    return originalEnd(chunk, ...args);
  };

  const publicTrace = analysis.reasoning?.publicSummaryEnabled
    ? buildPublicReasoningTrace({ analysis, toolRun })
    : null;
  setCORS(res);
  res.setHeader('X-Hazy-Emotion', analysis.emotionData.emotion);
  res.setHeader('X-Hazy-Intent', analysis.intentData.primaryIntent);
  res.setHeader('X-Hazy-Mode', analysis.strategy.mode);
  res.setHeader('X-Hazy-Agent-Mode', analysis.agentMode || 'chat');
  res.setHeader('X-Hazy-Agent-Enabled', String(Boolean(toolRun.agentEnabled)));
  if (toolRun.toolResults?.length) {
    res.setHeader('X-Hazy-Tool-Used', toolRun.toolResults.map((item) => item.tool).join(','));
  }
  const webSearchResult = toolRun.toolResults?.find((item) => item.tool === 'web_search');
  if (webSearchResult?.runId) res.setHeader('X-Hazy-Web-Search-Run', webSearchResult.runId);
  if (webSearchResult?.confidence || webSearchResult?.metrics?.confidence) {
    res.setHeader('X-Hazy-Web-Confidence', webSearchResult.confidence || webSearchResult.metrics.confidence);
  }
  if (webSearchResult?.citations) {
    res.setHeader('X-Hazy-Citation-Count', String(webSearchResult.citations.length));
  }
  if (analysis.reasoning?.reasoningLevel) {
    res.setHeader('X-Hazy-Reasoning', analysis.reasoning.reasoningLevel);
  }
  if (publicTrace) {
    res.setHeader('X-Hazy-Trace', encodeReasoningTrace(publicTrace));
    res.setHeader('X-Hazy-Reasoning-Summary', analysis.reasoning.publicSummary || publicTrace.summary);
  }
  if (analysis.codeAnalysis?.language) {
    res.setHeader('X-Hazy-Code-Language', analysis.codeAnalysis.language);
  }

  if (analysis.reasoning?.needsQuestion && analysis.reasoning.question) {
    if (body.stream === false) {
      res.writeHead(200, mergeResponseHeaders(res, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN }));
      res.end(JSON.stringify({ message: { content: analysis.reasoning.question }, done: true }));
      return;
    }

    res.writeHead(200, mergeResponseHeaders(res, { 'Content-Type': 'application/x-ndjson', 'Transfer-Encoding': 'chunked', 'Access-Control-Allow-Origin': CORS_ORIGIN }));
    res.write(JSON.stringify({ message: { content: analysis.reasoning.question }, done: false }) + '\n');
    res.write(JSON.stringify({ done: true }) + '\n');
    res.end();
    return;
  }

  if (agentLoopEnabled) {
    try {
      const agentCtx = createToolContext(originalBody, {
        services: {
          config: cfg,
          messages: providerBody.messages || []
        }
      });
      const maxSteps = Math.max(2, Math.min(
        Number(originalBody.hazy?.agentMaxIterations || 5),
        8
      ));
      const result = await runAgentTurn({
        ctx: agentCtx,
        input: providerBody.messages || [],
        callModel: createProviderAgentCaller({
          providerBody,
          cfg,
          getApiKey: getProviderApiKey
        }),
        gatekeeper: defaultAgentRuntime.gatekeeper,
        allowedTools: defaultAgentRuntime.registry.getModelTools(agentCtx),
        maxSteps
      });
      res.setHeader('X-Hazy-Agent-Steps', String(result.toolCalls));
      res.setHeader('X-Hazy-Agent-Limit-Reached', String(result.limitReached));
      res.setHeader('X-Hazy-Confirmation-Required', String(result.confirmationRequired));
      if (body.stream === false) {
        res.writeHead(200, mergeResponseHeaders(res, { 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({
          message: { content: result.finalText },
          done: true,
          agent: {
            toolCalls: result.toolCalls,
            blockedToolCalls: result.blockedToolCalls,
            confirmationRequired: result.confirmationRequired,
            limitReached: result.limitReached,
            usage: result.usage
          }
        }));
        return;
      }
      res.writeHead(200, mergeResponseHeaders(res, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked'
      }));
      res.write(JSON.stringify({
        message: { content: result.finalText },
        done: false,
        agent: {
          toolCalls: result.toolCalls,
          blockedToolCalls: result.blockedToolCalls,
          confirmationRequired: result.confirmationRequired,
          limitReached: result.limitReached
        }
      }) + '\n');
      res.write(JSON.stringify({ done: true }) + '\n');
      res.end();
      return;
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(error.statusCode || 502, mergeResponseHeaders(res, {
          'Content-Type': 'application/json'
        }));
      }
      res.end(JSON.stringify({ error: `Agent run failed: ${error.message}` }));
      return;
    }
  }

  // ── Ollama ──
  if (provider === 'ollama') {
    const ollamaUrl  = new URL(cfg.providers?.ollama?.baseUrl || 'http://localhost:11434');
    const reasoningMode = body.hazy?.reasoningMode || 'auto';
    const ollamaBody = {
      ...providerBody,
      model: modelId.replace('ollama/', ''),
      think: reasoningMode === 'off' ? false : true,
    };
    streamProxy({
      hostname: ollamaUrl.hostname,
      port: ollamaUrl.port || 80,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      protocol: ollamaUrl.protocol,
    }, ollamaBody, res);
    return;
  }

  // ── Anthropic ──
  if (provider === 'anthropic') {
    const apiKey = getProviderApiKey('anthropic', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Anthropic API key not set. Add it in Settings → AI Providers.' })); return; }
    const anthBody = toAnthropicBody(providerBody);
    const proxyReq = https.request({
      hostname: 'api.anthropic.com', port: 443, path: '/v1/messages',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    }, proxyRes => streamAnthropicToOllamaFormat(proxyRes, res));
    proxyReq.on('error', err => { if (!res.headersSent) res.writeHead(503); res.end(JSON.stringify({ error: err.message })); });
    proxyReq.write(JSON.stringify(anthBody));
    proxyReq.end();
    return;
  }

  // ── OpenAI ──
  if (provider === 'openai') {
    const apiKey = getProviderApiKey('openai', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'OpenAI API key not set. Add it in Settings → AI Providers.' })); return; }
    const oaiBody = toOpenAIBody(providerBody);
    const proxyReq = https.request({
      hostname: 'api.openai.com', port: 443, path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }
    }, proxyRes => streamOpenAIToOllamaFormat(proxyRes, res));
    proxyReq.on('error', err => { if (!res.headersSent) res.writeHead(503); res.end(JSON.stringify({ error: err.message })); });
    proxyReq.write(JSON.stringify(oaiBody));
    proxyReq.end();
    return;
  }

  // ── Groq ──
  if (provider === 'nvidia') {
    const apiKey = getProviderApiKey('nvidia', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'NVIDIA API key not set. Add it in Settings -> AI Providers.' })); return; }
    const nvidiaBody = toNvidiaBody(providerBody);
    const nvidiaUrl = new URL(cfg.providers?.nvidia?.baseUrl || 'https://integrate.api.nvidia.com/v1');
    const proxyReq = https.request({
      hostname: nvidiaUrl.hostname,
      port: nvidiaUrl.port || 443,
      path: (nvidiaUrl.pathname.replace(/\/$/, '') || '/v1') + '/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }
    }, proxyRes => streamOpenAIToOllamaFormat(proxyRes, res));
    proxyReq.on('error', err => { if (!res.headersSent) res.writeHead(503); res.end(JSON.stringify({ error: err.message })); });
    proxyReq.write(JSON.stringify(nvidiaBody));
    proxyReq.end();
    return;
  }

  if (provider === 'groq') {
    const apiKey = getProviderApiKey('groq', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Groq API key not set. Add it in Settings → AI Providers.' })); return; }
    const groqBody = toGroqBody(providerBody);
    const proxyReq = https.request({
      hostname: 'api.groq.com', port: 443, path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }
    }, proxyRes => streamOpenAIToOllamaFormat(proxyRes, res));
    proxyReq.on('error', err => { if (!res.headersSent) res.writeHead(503); res.end(JSON.stringify({ error: err.message })); });
    proxyReq.write(JSON.stringify(groqBody));
    proxyReq.end();
    return;
  }

  // ── Gemini ──
  if (provider === 'gemini') {
    const apiKey = getProviderApiKey('gemini', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Gemini API key not set. Add it in Settings → AI Providers.' })); return; }
    const gemModel = (providerBody.model || 'gemini/gemini-2.0-flash').startsWith('gemini/') ? providerBody.model.slice('gemini/'.length) : (providerBody.model || 'gemini-2.0-flash');
    const gemBody  = toGeminiBody(providerBody);
    // Gemini uses SSE stream
    const proxyReq = https.request({
      hostname: 'generativelanguage.googleapis.com', port: 443,
      path: '/v1beta/models/' + gemModel + ':streamGenerateContent?alt=sse&key=' + apiKey,
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    }, proxyRes => {
      // If Gemini rejected the key, forward the real error
      if (proxyRes.statusCode !== 200) {
        let errBody = '';
        proxyRes.on('data', c => errBody += c.toString());
        proxyRes.on('end', () => {
          let msg = 'Invalid API key';
          try {
            const parsed = JSON.parse(errBody);
            msg = parsed?.error?.message || parsed?.[0]?.error?.message || msg;
          } catch {}
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
          res.end(JSON.stringify({ error: msg, status: proxyRes.statusCode }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Transfer-Encoding': 'chunked', 'Access-Control-Allow-Origin': CORS_ORIGIN });
      let buf = '';
      proxyRes.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            // Check for error inside the SSE stream
            if (j.error) {
              res.write(JSON.stringify({ error: j.error.message || 'API error', done: true }) + '\n');
              return;
            }
            const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) res.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
          } catch {}
        }
      });
      proxyRes.on('end', () => { res.write(JSON.stringify({ done: true }) + '\n'); res.end(); });
    });
    proxyReq.on('error', err => { if (!res.headersSent) res.writeHead(503); res.end(JSON.stringify({ error: err.message })); });
    proxyReq.write(JSON.stringify(gemBody));
    proxyReq.end();
    return;
  }

  res.writeHead(400); res.end(JSON.stringify({ error: 'Unknown provider: ' + provider }));
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/providers — return enabled providers + models
// ─────────────────────────────────────────────────────
async function handleProviders(req, res) {
  setCORS(res);
  const cfg      = loadConfig();
  const registry = loadRegistry();
  const enabled  = {};
  Object.entries(cfg.providers || {}).forEach(([key, val]) => {
    const hasKey = key === 'ollama' || Boolean(getProviderApiKey(key, cfg));
    enabled[key] = {
      enabled: key === 'ollama' ? val.enabled !== false : Boolean(val.enabled && hasKey),
      hasKey,
      isLocal: key === 'ollama',
    };
  });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({ providers: enabled, registry }));
}

async function handleAnalyze(req, res) {
  setCORS(res);
  const body = await readBody(req);
  const analysis = analyzeMessage({
    body,
    conversationId: body.conversationId || 'default',
    userId: body.userId || 'default'
  });

  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({
    emotion: analysis.emotionData,
    intent: analysis.intentData,
    messageType: analysis.messageType,
    safety: analysis.safety,
    strategy: analysis.strategy,
    toneProfile: analysis.toneProfile,
    responsePlan: analysis.responsePlan,
    memory: analysis.memory,
    ragContext: analysis.ragContext
    ,
    agentMode: analysis.agentMode,
    availableTools: defaultAgentRuntime.registry.list(createToolContext(body))
  }, null, 2));
}

async function handleMemories(req, res, parsed) {
  setCORS(res);
  const params = new URLSearchParams(parsed.query || '');
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const memories = memoryManager.listMemories({
        userId: params.get('userId') || 'local-user',
        projectId: params.has('projectId') ? params.get('projectId') : undefined,
        status: params.get('status') || 'active',
        limit: params.get('limit') || 100
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ memories }));
      return;
    }

    const body = await readBody(req);
    const userId = body.userId || params.get('userId') || 'local-user';
    if (method === 'POST') {
      const memory = memoryManager.upsertMemory({
        ...body,
        userId,
        confidence: body.confidence ?? 1,
        type: body.type || 'explicit_fact'
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ memory }));
      return;
    }

    if (method === 'PATCH') {
      const updated = memoryManager.setMemoryStatus(body.id, userId, body.status);
      res.writeHead(updated ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(updated ? { ok: true } : { error: 'Memory not found.' }));
      return;
    }

    if (method === 'DELETE') {
      const id = body.id || params.get('id');
      const deleted = memoryManager.deleteMemory(id, userId);
      res.writeHead(deleted ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(deleted ? { ok: true } : { error: 'Memory not found.' }));
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unsupported method.' }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleConversations(req, res, parsed) {
  setCORS(res);
  const params = new URLSearchParams(parsed.query || '');
  const method = req.method || 'GET';
  try {
    if (method === 'GET') {
      const userId = params.get('userId') || 'local-user';
      const conversations = memoryManager.listConversationStates(userId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversations }));
      return;
    }

    const body = await readBody(req);
    const userId = body.userId || params.get('userId') || 'local-user';
    if (method === 'POST') {
      memoryManager.saveConversationStates(body.conversations || {}, userId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (method === 'DELETE') {
      const conversationId = body.conversationId || params.get('conversationId');
      const deleted = memoryManager.deleteConversationState(conversationId, userId);
      res.writeHead(deleted ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(deleted ? { ok: true } : { error: 'Conversation not found.' }));
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unsupported method.' }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleTools(req, res) {
  setCORS(res);
  const body = req.method === 'POST' ? await readBody(req) : {};
  const ctx = createToolContext(body);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({
    tools: defaultAgentRuntime.registry.list(ctx),
    pendingConfirmation: defaultAgentRuntime.confirmations.findPending(ctx)
  }));
}

async function handleAgentConfirmation(req, res) {
  setCORS(res);
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST required' }));
    return;
  }

  const body = await readBody(req);
  const ctx = createToolContext(body, {
    services: { config: loadConfig() }
  });
  const result = await defaultAgentRuntime.gatekeeper.resolveConfirmation({
    ctx,
    confirmationId: body.confirmationId,
    message: body.message
  });

  const statusCode = ['not_found', 'forbidden'].includes(result.status) ? 404 : 200;
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({
    ...result,
    confirmationMessage: result.confirmation && result.status === 'invalid_confirmation'
      ? buildConfirmationMessage(result.confirmation)
      : undefined
  }));
}

async function handleToolCall(req, res) {
  setCORS(res);
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST required' }));
    return;
  }

  const body = await readBody(req);
  const ctx = createToolContext(body, {
    services: { config: loadConfig() }
  });
  const result = await defaultAgentRuntime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: {
      id: body.callId || `api:${ctx.requestId}`,
      name: body.toolName,
      arguments: body.arguments || {}
    }
  });
  const statusCode = result.status === 'blocked' ? 400 : 200;
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({
    ...result,
    confirmationMessage: result.status === 'confirmation_required'
      ? buildConfirmationMessage(result.confirmation)
      : undefined
  }));
}

async function handleWebSearch(req, res) {
  setCORS(res);
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST required' }));
    return;
  }
  const body = await readBody(req);
  const result = await defaultWebSearchService.search({
    userMessage: body.userMessage || body.query || '',
    messages: body.messages || [],
    cfg: loadConfig(),
    userId: body.userId || 'local-user',
    chatId: body.conversationId || body.chatId || 'default',
    messageId: body.messageId,
    forceSearch: body.forceSearch,
    maxContextTokens: body.maxContextTokens
  });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify(result));
}

async function handleWebSources(req, res, parsed) {
  setCORS(res);
  const params = new URLSearchParams(parsed.query || '');
  const runId = params.get('runId');
  const userId = params.get('userId') || 'local-user';
  const sources = defaultWebSearchService.store.getSources(runId, userId);
  if (!sources) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Search sources were not found.' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify(sources));
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/pull — auto-download Ollama model
// ─────────────────────────────────────────────────────
async function handlePull(req, res) {
  setCORS(res);
  const body      = await readBody(req);
  const modelName = body.model;
  if (!modelName) { res.writeHead(400); res.end(JSON.stringify({ error: 'model required' })); return; }

  const cfg      = loadConfig();
  const ollamaUrl= new URL(cfg.providers?.ollama?.baseUrl || 'http://localhost:11434');

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Transfer-Encoding': 'chunked', 'Access-Control-Allow-Origin': CORS_ORIGIN });

  const pullReq = http.request({
    hostname: ollamaUrl.hostname,
    port: ollamaUrl.port || 80,
    path: '/api/pull',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, pullRes => {
    pullRes.pipe(res);
  });
  pullReq.on('error', err => res.end(JSON.stringify({ error: err.message })));
  pullReq.write(JSON.stringify({ name: modelName, stream: true }));
  pullReq.end();
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/delete-model — delete local Ollama model
// ─────────────────────────────────────────────────────
async function handleDeleteModel(req, res) {
  setCORS(res);
  const body = await readBody(req);
  const cfg  = loadConfig();
  const ollamaUrl = new URL(cfg.providers?.ollama?.baseUrl || 'http://localhost:11434');
  const delReq = http.request({
    hostname: ollamaUrl.hostname, port: ollamaUrl.port || 80,
    path: '/api/delete', method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  }, delRes => {
    res.writeHead(delRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    delRes.pipe(res);
  });
  delReq.on('error', err => { res.writeHead(503); res.end(JSON.stringify({ error: err.message })); });
  delReq.write(JSON.stringify({ name: body.model }));
  delReq.end();
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/save-key — save API key to config file
// ─────────────────────────────────────────────────────
async function handleSaveKey(req, res) {
  setCORS(res);
  try {
    const body = await readBody(req);
    const { provider, apiKey } = body;
    if (!provider) { res.writeHead(400); res.end(JSON.stringify({ error: 'provider required' })); return; }
    const providerName = String(provider).toLowerCase();
    const cfg = loadConfig();
    if (!cfg.providers) cfg.providers = {};
    if (!cfg.providers[providerName]) cfg.providers[providerName] = {};
    const enabled = secretVault.set(providerName, apiKey || '');
    delete cfg.providers[providerName].apiKey;
    cfg.providers[providerName].enabled = enabled;
    // Ensure config directory exists
    writeConfig(cfg);
    console.log('[Server] Encrypted key updated for provider:', providerName, 'enabled:', enabled);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(JSON.stringify({ ok: true, provider: providerName, enabled }));
  } catch (e) {
    res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
  }
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/image — image generation proxy
// ─────────────────────────────────────────────────────
async function handleImage(req, res) {
  setCORS(res);
  const body     = await readBody(req);
  const cfg      = loadConfig();
  const provider = (body.model || '').split('/')[0];

  if (provider === 'openai_image') {
    const apiKey = getProviderApiKey('openai', cfg) || getProviderApiKey('openai_image', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'OpenAI API key not set' })); return; }
    const resp = await httpsRequest({
      hostname: 'api.openai.com', port: 443, path: '/v1/images/generations',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }
    }, { model: body.model.replace('openai_image/', '') || 'dall-e-3', prompt: body.prompt, n: 1, size: body.size || '1024x1024' });
    res.writeHead(resp.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(resp.body);
    return;
  }

  if (provider === 'stability') {
    const apiKey = getProviderApiKey('stability', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Stability API key not set' })); return; }
    const resp = await httpsRequest({
      hostname: 'api.stability.ai', port: 443,
      path: '/v2beta/stable-image/generate/ultra',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
    }, { prompt: body.prompt, output_format: 'webp' });
    res.writeHead(resp.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(resp.body);
    return;
  }

  res.writeHead(400); res.end(JSON.stringify({ error: 'Unknown image provider: ' + provider }));
}

// ─────────────────────────────────────────────────────
// Static file serving
// ─────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (ext && ext !== '.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const index = path.join(FRONTEND_DIR, 'index.html');
      fs.readFile(index, (err2, d2) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d2);
      }); return;
    }
    res.writeHead(200, { 'Content-Type': mime }); res.end(data);
  });
}

// ─────────────────────────────────────────────────────
// Main server
// ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
  const parsed   = url.parse(req.url);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }); res.end(); return;
  }

  // ── Hazy universal API routes ──
  if (pathname === '/hazy/chat')         { await handleHazyChat(req, res); return; }
  if (pathname === '/hazy/analyze')      { await handleAnalyze(req, res); return; }
  if (pathname === '/hazy/tools')        { await handleTools(req, res); return; }
  if (pathname === '/hazy/tool-call')    { await handleToolCall(req, res); return; }
  if (pathname === '/hazy/confirm')      { await handleAgentConfirmation(req, res); return; }
  if (pathname === '/hazy/search')       { await handleWebSearch(req, res); return; }
  if (pathname === '/hazy/sources')      { await handleWebSources(req, res, parsed); return; }
  if (pathname === '/hazy/providers')    { await handleProviders(req, res); return; }
  if (pathname === '/hazy/memories')     { await handleMemories(req, res, parsed); return; }
  if (pathname === '/hazy/conversations'){ await handleConversations(req, res, parsed); return; }
  if (pathname === '/hazy/pull')         { await handlePull(req, res); return; }
  if (pathname === '/hazy/delete-model') { await handleDeleteModel(req, res); return; }
  if (pathname === '/hazy/save-key')     { await handleSaveKey(req, res); return; }
  if (pathname === '/hazy/image')        { await handleImage(req, res); return; }

  // ── Legacy Ollama proxy (keeps existing Hazy chat working unchanged) ──
  // Directly pipes req body to Ollama — no body buffering needed
  if (pathname.startsWith('/api/')) {
    const cfg2 = loadConfig();
    const oUrl = new URL(cfg2.providers?.ollama?.baseUrl || 'http://localhost:11434');
    const mod2 = oUrl.protocol === 'https:' ? https : http;
    const opts2 = {
      hostname: oUrl.hostname,
      port:     oUrl.port || (oUrl.protocol === 'https:' ? 443 : 80),
      path:     pathname + (parsed.search || ''),
      method:   req.method,
      headers:  { 'Content-Type': 'application/json' },
    };
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    const proxyReq2 = mod2.request(opts2, proxyRes2 => {
      res.writeHead(proxyRes2.statusCode, {
        'Content-Type': proxyRes2.headers['content-type'] || 'application/json',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': CORS_ORIGIN,
      });
      proxyRes2.pipe(res);
    });
    proxyReq2.setTimeout(8000, () => {
      proxyReq2.destroy(new Error('Ollama request timed out'));
    });
    proxyReq2.on('error', err2 => {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cannot connect to Ollama: ' + err2.message }));
    });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq2);
    } else {
      proxyReq2.end();
    }
    return;
  }

  // ── Static files ──
  let filePath = pathname === '/' ? path.join(FRONTEND_DIR, 'index.html') : path.join(FRONTEND_DIR, pathname);
  // Security: resolve symlinks and normalise before comparing — prevents path traversal
  const resolvedFilePath   = path.resolve(filePath);
  const resolvedFrontendDir = path.resolve(FRONTEND_DIR);
  if (!resolvedFilePath.startsWith(resolvedFrontendDir + path.sep) && resolvedFilePath !== resolvedFrontendDir) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  serveStatic(res, resolvedFilePath);
  } catch (err) {
    console.error('[Server] Unhandled error:', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error: ' + err.message }));
    }
  }
});

// Ensure config and cache dirs exist on startup
try {
  const configDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(CACHE_DIR))  fs.mkdirSync(CACHE_DIR,  { recursive: true });
  migrateLegacyProviderSecrets();
} catch(e) { console.warn('⚠  Could not create dirs:', e.message); }

server.listen(PORT, HOST, () => {
  const cfg = loadConfig();
  const enabledProviders = Object.entries(cfg.providers || {})
    .filter(([,v]) => v.enabled).map(([k]) => k).join(', ') || 'ollama only';

  console.log(`
╔════════════════════════════════════════════╗
║        Hazy Server v2 — Universal AI       ║
╚════════════════════════════════════════════╝
  🌐  http://${HOST}:${PORT}
  🤖  Providers: ${enabledProviders}
  📁  Frontend: ${FRONTEND_DIR}
  🔑  Secrets:  encrypted local vault
  📚  Models:   ${REGISTRY_PATH}

  To add API keys:
  → Open Settings → AI Providers

  Press Ctrl+C to stop.
`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} in use. Try: PORT=8081 node server.js`);
  else console.error('Server error:', err.message);
  process.exit(1);
});
