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
const { prepareChatRequest, analyzeMessage, finalizeResponse, database, memoryManager, vectorSearch } = require('../../application/orchestrator');
const { OllamaEmbeddingService } = require('../../../rag/embeddingService');
const { ingestDocumentAsync } = require('../../../rag/documentIngestion');
const { buildTitlePrompt } = require('../../../ai/system_prompt/prompts');
const { createStreamResponseCollector } = require('../../../ai/streamResponseCollector');
const { runDeterministicTools } = require('../../../tools/toolRouter');
const { UsageStatsStore, createResponseTelemetry } = require('../../../stats/usageStats');
const { defaultAgentRuntime, createToolContext } = require('../../../agent/agentRuntime');
const { buildConfirmationMessage } = require('../../../agent/confirmationStore');
const { defaultWebSearchService } = require('../../../tools/webSearchTool');
const { defaultBrowserSystem } = require('../../../browser/browserTool');
const { SecretVault } = require('../../../security/secretVault');
const { runAgentTurn } = require('../../../agent/runAgentTurn');
const { createProviderAgentCaller } = require('../../../ai/providerAgentAdapter');
const { filterCitationsByResponse } = require('../../../webSearch/citationBuilder');
const os = require('os');
const guardrailService = require('../../application/guardrailService');
const { execSync, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ─────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────
const PORT         = process.env.PORT || 8080;
const HOST         = process.env.HOST || 'localhost';
// Support both localhost and 127.0.0.1 (Windows launcher + controller use localhost; avoids CORS mismatch on Origin vs ACAO).
const LOCAL_LOOPBACK_ORIGINS = ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080'];
const CORS_ORIGIN  = process.env.HAZY_ALLOWED_ORIGIN || `http://${HOST}:${PORT}`;
const FRONTEND_DIR = path.join(__dirname, '..', '..', '..', 'frontend');
const KOKORO_DIR   = path.join(__dirname, '..', '..', '..', 'kokoro');
const CONFIG_PATH  = path.join(__dirname, '..', '..', '..', 'config', 'hazy-config.json');
const REGISTRY_PATH= path.join(__dirname, '..', '..', '..', 'config', 'models-registry.json');
const CACHE_DIR    = path.join(__dirname, '..', '..', '..', 'cache');
const usageStatsStore = new UsageStatsStore(path.join(CACHE_DIR, 'hazy-engine', 'stats'));
const secretVault = new SecretVault(database);

const KOKORO_URL = process.env.KOKORO_URL || 'http://127.0.0.1:8880/v1/audio/speech';

function getKokoroHealthUrl() {
  // Derive health endpoint from KOKORO_URL (supports custom host/port, not just 127.0.0.1:8880).
  // Replaces the speech path with /health while preserving protocol/host/port.
  try {
    const u = new URL(KOKORO_URL);
    u.pathname = '/health';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return 'http://127.0.0.1:8880/health';
  }
}

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
  openrouter: 'OPENROUTER_API_KEY',
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
function getAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (origin && LOCAL_LOOPBACK_ORIGINS.includes(origin)) return origin;
  // Also allow if the request came from the same host string we are configured for
  if (origin && origin === `http://${HOST}:${PORT}`) return origin;
  return CORS_ORIGIN;
}

function setCORS(res, req) {
  const allowed = req ? getAllowedOrigin(req) : CORS_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', allowed);
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
      'X-Hazy-Citation-Count',
      'X-Hazy-Web-Search-Mode'
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

function createThinkingStreamTransformer(isDeepThinkOrAgentic) {
  let insideThinking = false;
  let tagBuffer = '';

  const transform = function(chunkStr) {
    if (!isDeepThinkOrAgentic) return chunkStr;

    const lines = chunkStr.split('\n');
    const outLines = [];

    for (const line of lines) {
      if (!line.trim()) {
        outLines.push(line);
        continue;
      }

      try {
        const json = JSON.parse(line);
        if (json.done) {
          if (tagBuffer) {
            const flushText = tagBuffer;
            tagBuffer = '';
            const dummy = { message: { content: insideThinking ? '' : flushText, thinking: insideThinking ? flushText : '' }, done: false };
            outLines.unshift(JSON.stringify(dummy));
          }
          outLines.push(line);
          continue;
        }

        let content = json.message?.content || '';
        if (!content) {
          outLines.push(line);
          continue;
        }

        let resultText = '';
        let resultThinking = '';

        let i = 0;
        const openTag = '<thinking>';
        const closeTag = '</thinking>';

        while (i < content.length) {
          const char = content[i];
          const nextBuffer = tagBuffer + char;
          const targetTag = insideThinking ? closeTag : openTag;

          if (targetTag.startsWith(nextBuffer)) {
            tagBuffer = nextBuffer;
            if (tagBuffer === targetTag) {
              insideThinking = !insideThinking;
              tagBuffer = '';
            }
            i++;
          } else {
            if (tagBuffer.length > 0) {
              const firstChar = tagBuffer[0];
              if (insideThinking) {
                resultThinking += firstChar;
              } else {
                resultText += firstChar;
              }
              tagBuffer = tagBuffer.slice(1);
            } else {
              if (insideThinking) {
                resultThinking += char;
              } else {
                resultText += char;
              }
              i++;
            }
          }
        }

        const updatedJson = { ...json };
        if (updatedJson.message) {
          updatedJson.message = { ...updatedJson.message };
          updatedJson.message.content = resultText;
          if (resultThinking) {
            updatedJson.message.thinking = (updatedJson.message.thinking || '') + resultThinking;
          }
        } else {
          updatedJson.content = resultText;
          if (resultThinking) {
            updatedJson.thinking = (updatedJson.thinking || '') + resultThinking;
          }
        }

        outLines.push(JSON.stringify(updatedJson));
      } catch (err) {
        outLines.push(line);
      }
    }

    return outLines.join('\n');
  };

  transform.flush = function() {
    if (tagBuffer) {
      const flushText = tagBuffer;
      tagBuffer = '';
      const dummy = { message: { content: insideThinking ? '' : flushText, thinking: insideThinking ? flushText : '' }, done: false };
      return JSON.stringify(dummy) + '\n';
    }
    return '';
  };

  return transform;
}

function safeArtifactChatId(chatId) {
  return String(chatId || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
}

async function collectArtifactProject(chatId, { maxFiles = 20, maxBytes = 200000 } = {}) {
  const safeChat = safeArtifactChatId(chatId);
  const base = path.resolve(CACHE_DIR, 'hazy-engine', 'artifacts', safeChat);
  const artifactsRoot = path.resolve(CACHE_DIR, 'hazy-engine', 'artifacts');
  const rootBase = artifactsRoot.endsWith(path.sep) ? artifactsRoot : artifactsRoot + path.sep;
  if (!base.startsWith(rootBase)) return null;
  
  try {
    await fs.promises.access(base);
  } catch {
    return null;
  }

  const files = [];
  const walk = async (dir, prefix = '') => {
    if (files.length >= maxFiles) return;
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) return;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, rel);
          continue;
        }
        const stat = await fs.promises.stat(full);
        if (!stat.isFile() || stat.size > maxBytes) continue;
        const content = await fs.promises.readFile(full, 'utf8');
        files.push({
          filename: rel,
          content,
          bytes: stat.size,
          path: `cache/hazy-engine/artifacts/${safeChat}/${rel}`
        });
      }
    } catch {
      // Ignore errors on specific subdirectories/files and continue walk
    }
  };

  try {
    await walk(base);
  } catch {
    return null;
  }

  if (!files.length) return null;
  return {
    project: 'Agent Artifacts',
    description: 'Files written by the agent tool loop.',
    source: 'agent_artifacts',
    chatId: safeChat,
    files
  };
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

  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  let max_tokens = body.options?.max_tokens || 2048;

  // Groq Rate Limit Safeguard:
  // Free tier models on Groq have a strict 6,000 TPM limit.
  // We dynamically clamp max_tokens so the total request size (prompt + max_tokens)
  // does not exceed 5,800 tokens, preventing immediate rate-limiting errors.
  if (model.includes('llama-3.1-8b') || model.includes('llama-3.3-70b') || model.includes('qwen3-32b')) {
    let charCount = 0;
    for (const msg of messages) {
      charCount += typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content || '').length;
    }
    const estimatedPromptTokens = Math.ceil(charCount / 4);
    if (estimatedPromptTokens + max_tokens > 5800) {
      max_tokens = Math.max(512, 5800 - estimatedPromptTokens);
    }
  }

  return {
    model,
    stream: body.stream !== false,
    max_tokens,
    temperature: body.options?.temperature ?? 0.85,
    messages,
  };
}

function toOpenRouterBody(body) {
  const model = (body.model || '').startsWith('openrouter/')
    ? body.model.slice('openrouter/'.length)
    : (body.model || 'google/gemini-2.5-flash-pro:free');
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
        let thinking = '';
        if (j.content_block?.type === 'thinking') {
          thinking = j.content_block.thinking || '';
        } else if (j.delta?.type === 'thinking_delta') {
          thinking = j.delta.thinking || '';
        }

        if (text) {
          clientRes.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
        }
        if (thinking) {
          clientRes.write(JSON.stringify({ message: { content: '', thinking: thinking }, done: false }) + '\n');
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
        const reasoning = j.choices?.[0]?.delta?.reasoning_content || '';
        if (text) {
          clientRes.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
        }
        if (reasoning) {
          clientRes.write(JSON.stringify({ message: { content: '', thinking: reasoning }, done: false }) + '\n');
        }
      } catch {}
    }
  });
  proxyRes.on('end', () => { clientRes.write(JSON.stringify({ done: true }) + '\n'); clientRes.end(); });
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/chat  — universal chat endpoint
// ─────────────────────────────────────────────────────
async function handleHazyChat(req, res, routeOptions = {}) {
  const originalBody = await readBody(req);

  const VALID_MODES = ['auto', 'deep', 'off'];
  if (!originalBody.hazy) {
    originalBody.hazy = {};
  }
  const reasoningMode = VALID_MODES.includes(originalBody.hazy.reasoningMode)
    ? originalBody.hazy.reasoningMode
    : 'auto';
  originalBody.hazy.reasoningMode = reasoningMode;

  const validation = guardrailService.validateRequest(originalBody);
  if (!validation.allowed) {
    setCORS(res);
    res.writeHead(validation.status || 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: validation.reason }));
    return;
  }

  if (routeOptions.forceAgent) {
    originalBody.hazy = {
      ...(originalBody.hazy || {}),
      page: 'agent',
      surface: 'agentic',
      agenticMode: true,
      agentEnabled: true
    };
  }
  const cfg  = loadConfig();
  const chatContext = createToolContext(originalBody);
  const requestedModel = originalBody.model || cfg.defaults?.textModel || 'ollama/llama3.2';
  const requestedProvider = requestedModel.split('/')[0];
  const requestedSurface = String(originalBody.hazy?.surface || originalBody.hazy?.page || '').toLowerCase();
  const agentRequested = originalBody.hazy?.agentEnabled === true
    || originalBody.hazy?.agenticMode === true
    || requestedSurface === 'agent'
    || requestedSurface === 'agentic';
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

  const prepared = await prepareChatRequest(body);
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
    // FIX Issue 3: After stream completes, filter webCitations to only sources
    // the model actually cited in its response ([SOURCE N] pattern).
    // Also detect hallucinated citation numbers and log a warning.
    if (webSearchResult?.citations?.length) {
      try {
        const { cited, hallucinated } = filterCitationsByResponse(webSearchResult.citations, responseText);
        // Overwrite in-place so any downstream header already set reflects the filtered count
        webSearchResult._citedCitations = cited;
        if (hallucinated.length) {
          console.warn(`[Hazy] Citation hallucination detected — model cited non-existent SOURCE(s): ${hallucinated.join(', ')}`);
        }
        if (webSearchResult.runId) {
          const userId = (prepared && prepared.userId) || 'local-user';
          defaultWebSearchService.store.updateCitations(webSearchResult.runId, userId, cited);
        }
      } catch (ce) {
        console.warn('[Hazy] Citation filter non-fatal:', ce.message);
      }
    }
  });
  const isDeepThink = prepared.analysis.reasoning?.reasoningMode === 'deep';
  const isAgentic = prepared.analysis.agentEnabled === true;
  const isDeepThinkOrAgentic = isDeepThink || isAgentic;
  const transformer = createThinkingStreamTransformer(isDeepThinkOrAgentic);

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  res.write = (chunk, ...args) => {
    const str = chunk.toString();
    const transformed = transformer(str);
    const buf = Buffer.from(transformed);
    telemetry.observe(buf);
    responseCollector.observe(buf);
    return originalWrite(buf, ...args);
  };
  res.end = (chunk, ...args) => {
    let buf = chunk;
    if (chunk) {
      const str = chunk.toString();
      const transformed = transformer(str);
      buf = Buffer.from(transformed);
      telemetry.observe(buf);
      responseCollector.observe(buf);
    }
    const finalFlush = transformer.flush();
    if (finalFlush) {
      originalWrite(Buffer.from(finalFlush));
    }
    responseCollector.finish();
    telemetry.finalize({ statusCode: res.statusCode });
    return originalEnd(buf, ...args);
  };


  setCORS(res, req);
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
  if (webSearchResult?.decision?.mode) res.setHeader('X-Hazy-Web-Search-Mode', webSearchResult.decision.mode);
  if (webSearchResult?.confidence || webSearchResult?.metrics?.confidence) {
    res.setHeader('X-Hazy-Web-Confidence', webSearchResult.confidence || webSearchResult.metrics.confidence);
  }
  if (webSearchResult?.citations) {
    // Use filtered (actually-cited) citations if available, else full list
    const activeCitations = webSearchResult._citedCitations || webSearchResult.citations;
    res.setHeader('X-Hazy-Citation-Count', String(activeCitations.length));
  }
  if (analysis.reasoning?.reasoningLevel) {
    res.setHeader('X-Hazy-Reasoning', analysis.reasoning.reasoningLevel);
  }

  if (analysis.codeAnalysis?.language) {
    res.setHeader('X-Hazy-Code-Language', analysis.codeAnalysis.language);
  }

  // NOTE: The needsQuestion/confirmation gate has been removed.
  // clarificationPolicy.js always returns { needsQuestion: false } and
  // resolveRiskConflict no longer injects questions. If this feature is
  // re-enabled in future, questions should be injected into the system
  // prompt rather than blocking the AI call with a hard return.


  if (agentLoopEnabled) {
    try {
      const agentCtx = createToolContext(originalBody, {
        services: {
          config: cfg,
          messages: providerBody.messages || [],
          planStore: defaultAgentRuntime.planStore,
          vectorSearch,
          embeddingService: new OllamaEmbeddingService()
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
        maxSteps,
        reasoningProfile: prepared.analysis?.reasoning || null
      });
      res.setHeader('X-Hazy-Agent-Steps', String(result.toolCalls));
      res.setHeader('X-Hazy-Agent-Limit-Reached', String(result.limitReached));
      res.setHeader('X-Hazy-Confirmation-Required', String(result.confirmationRequired));
      const workspaceActive = !!(result.performedToolCalls || []).some(tc => /artifact|fs|file|write/i.test((tc&&tc.name)||''));
      const artifactProject = workspaceActive ? await collectArtifactProject(agentCtx.chatId) : null;
      if (body.stream === false) {
        res.writeHead(200, mergeResponseHeaders(res, { 'Content-Type': 'application/json' }));
        // Scrub obvious leaks from highLevelText (final comms should be high-level only per rules; frontend sanitize is the main lock)
        const scrubbedHigh = String(result.finalText || '')
          .replace(/```[a-zA-Z0-9_-]*\n?[\s\S]*?```/g, '[code in workspace]')
          .replace(/```[\s\S]*$/g, '[truncated code in workspace]')
          .replace(/===(?:FILE|PROJECT|DESCRIPTION|END|CODE)===[\s\S]*?(?==={3}|$)/gi, '[files in artifacts]')
          .replace(/<pre[\s\S]*?>[\s\S]*?<\/pre>/gi, '[code block in workspace]')
          .replace(/<code[\s\S]{50,}?>(?:(?!<\/code>)[\s\S])*<\/code>/gi, '[code in workspace]')
          .replace(/(?:^|\n)( {4,}[^\n]+\n){3,}/g, '\n [indented code in workspace]\n')
          .replace(/(\b(function|const|let|var|class|def|impl|fn|public|private)\b[\s\S]{80,}?[\{\};])/g, '[code snippet in workspace]');
        // (enhanced to align with client strengthened sanitizeForChatBubble for consistency across agent paths/cases; non-agent build paths use frontend clean + isWorkspaceRelated which now prefers the flag)
        res.end(JSON.stringify({
          message: { content: scrubbedHigh },
          done: true,
          highLevelText: scrubbedHigh,
          workspaceActive,
          artifactProject,
          agent: {
            toolCalls: result.toolCalls,
            blockedToolCalls: result.blockedToolCalls,
            confirmationRequired: result.confirmationRequired,
            limitReached: result.limitReached,
            usage: result.usage,
            performedToolCalls: result.performedToolCalls || [],
            artifactProject
          }
        }));
        return;
      }
      res.writeHead(200, mergeResponseHeaders(res, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked'
      }));
      const scrubbedHigh = String(result.finalText || '')
        .replace(/```[a-zA-Z0-9_-]*\n?[\s\S]*?```/g, '[code in workspace]')
        .replace(/```[\s\S]*$/g, '[truncated code in workspace]')
        .replace(/===(?:FILE|PROJECT|DESCRIPTION|END|CODE)===[\s\S]*?(?==={3}|$)/gi, '[files in artifacts]')
        .replace(/<pre[\s\S]*?>[\s\S]*?<\/pre>/gi, '[code block in workspace]')
        .replace(/<code[\s\S]{50,}?>(?:(?!<\/code>)[\s\S])*<\/code>/gi, '[code in workspace]')
        .replace(/(?:^|\n)( {4,}[^\n]+\n){3,}/g, '\n [indented code in workspace]\n')
        .replace(/(\b(function|const|let|var|class|def|impl|fn|public|private)\b[\s\S]{80,}?[\{\};])/g, '[code snippet in workspace]');
      res.write(JSON.stringify({
        message: { content: scrubbedHigh },
        done: false,
        highLevelText: scrubbedHigh,
        workspaceActive,
        artifactProject,
        agent: {
          toolCalls: result.toolCalls,
          blockedToolCalls: result.blockedToolCalls,
          confirmationRequired: result.confirmationRequired,
          limitReached: result.limitReached,
          performedToolCalls: result.performedToolCalls || [],
          artifactProject
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
    const rMode = body.hazy?.reasoningMode || 'auto';
    const ollamaBody = {
      ...providerBody,
      model: modelId.replace('ollama/', ''),
      think: rMode === 'off' ? false : true,
    };
    const apiKey = getProviderApiKey('ollama', cfg);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = 'Bearer ' + apiKey;
      headers['X-Subscription-Token'] = apiKey;
    }
    if (ollamaUrl.username || ollamaUrl.password) {
      const auth = Buffer.from(`${ollamaUrl.username}:${ollamaUrl.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }
    if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
    if (req.headers['x-subscription-token']) headers['X-Subscription-Token'] = req.headers['x-subscription-token'];
    if (req.headers['x-api-key']) headers['X-Api-Key'] = req.headers['x-api-key'];
    if (req.headers['api-key']) headers['Api-Key'] = req.headers['api-key'];

    streamProxy({
      hostname: ollamaUrl.hostname,
      port: ollamaUrl.port ? Number(ollamaUrl.port) : (ollamaUrl.protocol === 'https:' ? 443 : 80),
      path: '/api/chat',
      method: 'POST',
      headers,
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

  // ── OpenRouter ──
  if (provider === 'openrouter') {
    const apiKey = getProviderApiKey('openrouter', cfg);
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'OpenRouter API key not set. Add it in Settings → AI Providers.' })); return; }
    const orBody = toOpenRouterBody(providerBody);
    const proxyReq = https.request({
      hostname: 'openrouter.ai', port: 443, path: '/api/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'Hazy AI' }
    }, proxyRes => streamOpenAIToOllamaFormat(proxyRes, res));
    proxyReq.on('error', err => { if (!res.headersSent) res.writeHead(503); res.end(JSON.stringify({ error: err.message })); });
    proxyReq.write(JSON.stringify(orBody));
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

  // Unknown provider (e.g. stale 'minimax-m3:cloud' from old localStorage or HTML default).
  // Do not kill chat for local users — fall back to ollama behavior so the request succeeds.
  console.warn('[Hazy] Unknown provider in /hazy/chat:', provider, '— falling back to ollama path');
  const ollamaUrl  = new URL(cfg.providers?.ollama?.baseUrl || 'http://localhost:11434');
  const rMode = body.hazy?.reasoningMode || 'auto';
  const ollamaBody = {
    ...providerBody,
    model: (modelId || 'ollama/llama3.2').replace(/^[a-zA-Z0-9_-]+\//, ''), // strip any prefix
    think: rMode === 'off' ? false : true,
  };
  const apiKey = getProviderApiKey('ollama', cfg);
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
    headers['X-Subscription-Token'] = apiKey;
  }
  if (ollamaUrl.username || ollamaUrl.password) {
    const auth = Buffer.from(`${ollamaUrl.username}:${ollamaUrl.password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }
  if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
  if (req.headers['x-subscription-token']) headers['X-Subscription-Token'] = req.headers['x-subscription-token'];
  if (req.headers['x-api-key']) headers['X-Api-Key'] = req.headers['x-api-key'];
  if (req.headers['api-key']) headers['Api-Key'] = req.headers['api-key'];

  streamProxy({
    hostname: ollamaUrl.hostname,
    port: ollamaUrl.port ? Number(ollamaUrl.port) : (ollamaUrl.protocol === 'https:' ? 443 : 80),
    path: '/api/chat',
    method: 'POST',
    headers,
    protocol: ollamaUrl.protocol,
  }, ollamaBody, res);
  return;
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/default-prompt — return default companion system prompt
// ─────────────────────────────────────────────────────
function handleDefaultPrompt(req, res) {
  setCORS(res, req);
  const { DEFAULT_SYSTEM_PROMPT } = require('../../../ai/promptBuilder');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT }));
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/persona-prompt — return constructed companion persona system prompt
// ─────────────────────────────────────────────────────
async function handlePersonaPrompt(req, res) {
  setCORS(res, req);
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const body = await readBody(req);
    const { buildPersonaPrompt } = require('../../../ai/promptBuilder');
    const prompt = buildPersonaPrompt(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ prompt }));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/write-workspace-files — write code blocks to hazy_outputs/
// ─────────────────────────────────────────────────────
async function handleWriteWorkspaceFiles(req, res) {
  setCORS(res, req);
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const body = await readBody(req);
    const files = body.files;
    if (!Array.isArray(files) || files.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'No files provided' }));
      return;
    }

    const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
    const outputsDir = path.join(workspaceRoot, 'hazy_outputs');
    await fs.promises.mkdir(outputsDir, { recursive: true });

    const results = [];
    for (const file of files) {
      if (!file.filename || typeof file.content !== 'string') continue;
      
      const safeSegments = file.filename
        .split(/[\\/]/)
        .filter(Boolean)
        .map(seg => seg.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200));

      if (safeSegments.length === 0) continue;

      const targetPath = path.resolve(outputsDir, ...safeSegments);
      const relative = path.relative(outputsDir, targetPath);
      
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        continue; // Traversal attempt blocked
      }

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, file.content, 'utf8');
      results.push(safeSegments.join('/'));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, savedFiles: results }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

// ─────────────────────────────────────────────────────
// ROUTE: /hazy/generate-title — return descriptive title for a conversation
// ─────────────────────────────────────────────────────
async function handleGenerateTitle(req, res) {
  setCORS(res, req);
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const body = await readBody(req);
    const userMsg = body.userMsg || '';
    const aiReply = body.aiReply || '';
    const userName = body.userName || '';
    const model = body.model || 'ollama/llama3.2';

    const prompt = buildTitlePrompt(userMsg, aiReply, userName);

    const messages = [{ role: 'user', content: prompt }];
    const cfg = loadConfig();
    const caller = createProviderAgentCaller({
      providerBody: { model, options: { max_tokens: 16 } },
      cfg,
      getApiKey: getProviderApiKey
    });

    const result = await caller({
      input: messages,
      tools: [],
      temperature: 0.5
    });

    let title = (result.text || '').trim();
    // Sanitize - strip quotes, newlines, extra punctuation
    title = title.replace(/^["'`]+|["'`]+$/g, '').replace(/\n.*/s, '').trim();
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ title }));
  } catch (err) {
    console.error('[Server] generateChatTitle failed:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
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
    const hasKey = Boolean(getProviderApiKey(key, cfg));
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
  const analysis = await analyzeMessage({
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


async function handleWebSearchHistory(req, res, parsed) {
  setCORS(res);
  const params = new URLSearchParams(parsed.query || '');
  const userId = params.get('userId') || 'local-user';
  const limit = Math.max(1, Math.min(50, Number(params.get('limit') || 20)));
  const runs = defaultWebSearchService.store.listRuns(userId, limit);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({ runs }));
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

async function handleBrowserAction(req, res) {
  setCORS(res);
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST required' }));
    return;
  }
  const body = await readBody(req);
  const ctx = createToolContext(body, {
    services: { config: loadConfig() },
    enabledToolsets: ['browser', 'safe_default']
  });
  const action = String(body.action || body.toolName || '').replace(/^browser\./, '');
  const toolName = action ? `browser.${action}` : '';
  const actionArgs = body.arguments || Object.fromEntries(
    Object.entries(body).filter(([key]) => !['action', 'toolName', 'callId', 'userId', 'conversationId', 'chatId', 'tenantId', 'hazy', 'enabledToolsets', 'disabledToolsets'].includes(key))
  );
  const result = await defaultAgentRuntime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: {
      id: body.callId || `browser:${ctx.requestId}`,
      name: toolName,
      arguments: actionArgs
    }
  });
  const statusCode = result.status === 'blocked' ? 400 : 200;
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify(result));
}

async function handleBrowserControl(req, res, parsed) {
  setCORS(res);
  const params = new URLSearchParams(parsed.query || '');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const userId = body.userId || params.get('userId') || 'local-user';
  const sessionId = body.sessionId || params.get('sessionId');
  const command = String(body.command || params.get('command') || '').toLowerCase();
  let session = null;
  if (command === 'pause') session = await defaultBrowserSystem.sessionManager.pause(sessionId, { userId });
  if (command === 'resume') session = await defaultBrowserSystem.sessionManager.resume(sessionId, { userId });
  if (command === 'cancel') session = await defaultBrowserSystem.sessionManager.cancel(sessionId, { userId });
  if (command === 'close') session = await defaultBrowserSystem.sessionManager.close(sessionId, { userId });
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Browser session or command was not found.' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({ ok: true, session: defaultBrowserSystem.sessionManager.publicSession(session) }));
}

async function handleBrowserStatus(req, res, parsed) {
  setCORS(res);
  const params = new URLSearchParams(parsed.query || '');
  const userId = params.get('userId') || 'local-user';
  const sessionId = params.get('sessionId');
  const liveSessions = defaultBrowserSystem.sessionManager.listSessions(userId);
  const persistedSessions = defaultBrowserSystem.store.listSessions(userId, 30);
  const events = defaultBrowserSystem.store.listEvents({ userId, sessionId, limit: Number(params.get('limit') || 100) });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify({ liveSessions, persistedSessions, events }));
}

async function handleBrowserEvents(req, res, parsed) {
  const params = new URLSearchParams(parsed.query || '');
  const userId = params.get('userId') || 'local-user';
  defaultBrowserSystem.streamer.attach(req, res, { store: defaultBrowserSystem.store, userId });
}

async function handleBrowserScreenshot(req, res, parsed) {
  setCORS(res);
  const params = new URLSearchParams(parsed.query || '');
  const userId = params.get('userId') || 'local-user';
  const sessionId = params.get('sessionId');
  const session = defaultBrowserSystem.sessionManager.getSession(sessionId, { userId });
  const screenshotPath = session?.screenshotPath;
  if (!screenshotPath || !fs.existsSync(screenshotPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Screenshot not found.' }));
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': CORS_ORIGIN
  });
  fs.createReadStream(screenshotPath).pipe(res);
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

  const apiKey = getProviderApiKey('ollama', cfg);
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
    headers['X-Subscription-Token'] = apiKey;
  }
  if (ollamaUrl.username || ollamaUrl.password) {
    const auth = Buffer.from(`${ollamaUrl.username}:${ollamaUrl.password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }
  if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
  if (req.headers['x-subscription-token']) headers['X-Subscription-Token'] = req.headers['x-subscription-token'];
  if (req.headers['x-api-key']) headers['X-Api-Key'] = req.headers['x-api-key'];
  if (req.headers['api-key']) headers['Api-Key'] = req.headers['api-key'];

  const requestModule = ollamaUrl.protocol === 'https:' ? https : http;
  const pullReq = requestModule.request({
    hostname: ollamaUrl.hostname,
    port: ollamaUrl.port ? Number(ollamaUrl.port) : (ollamaUrl.protocol === 'https:' ? 443 : 80),
    path: '/api/pull',
    method: 'POST',
    headers
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

  const apiKey = getProviderApiKey('ollama', cfg);
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
    headers['X-Subscription-Token'] = apiKey;
  }
  if (ollamaUrl.username || ollamaUrl.password) {
    const auth = Buffer.from(`${ollamaUrl.username}:${ollamaUrl.password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }
  if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
  if (req.headers['x-subscription-token']) headers['X-Subscription-Token'] = req.headers['x-subscription-token'];
  if (req.headers['x-api-key']) headers['X-Api-Key'] = req.headers['x-api-key'];
  if (req.headers['api-key']) headers['Api-Key'] = req.headers['api-key'];

  const requestModule = ollamaUrl.protocol === 'https:' ? https : http;
  const delReq = requestModule.request({
    hostname: ollamaUrl.hostname,
    port: ollamaUrl.port ? Number(ollamaUrl.port) : (ollamaUrl.protocol === 'https:' ? 443 : 80),
    path: '/api/delete',
    method: 'DELETE',
    headers
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
// ROUTE: Kokoro TTS server-offload proxy (plan: /hazy/tts, health, hardware)
// External kokoro-fastapi on 8880 does GPU inference; we proxy WAV blobs.
// Hardware scan uses nvidia-smi + os (adapted to CommonJS require style).
// ─────────────────────────────────────────────────────
async function handleHazyTTS(req, res) {
  setCORS(res);
  const body = await readBody(req);
  const { text, voice = 'af_heart', speed = 1.0 } = body || {};

  if (!text?.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(JSON.stringify({ error: 'No text provided' }));
    return;
  }

  // Minimal AbortSignal wiring (addresses server-side signal for hazy->kokoro):
  // Browser/client abort on /hazy/tts now propagates to cancel the upstream fetch to kokoro-fastapi (previously fire-and-forget).
  // Uses per-request AbortController + close listeners (raw http has no built-in req.signal like fetch Request).
  const ac = new AbortController();
  const abortUpstream = () => { try { ac.abort(); } catch (_) {} };
  req.on('close', abortUpstream);
  res.on('close', abortUpstream);

  try {
    const kokoroRes = await fetch(KOKORO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice,
        speed,
        response_format: 'wav'
      }),
      signal: ac.signal
    });

    if (!kokoroRes.ok) throw new Error(`Kokoro error: ${kokoroRes.status}`);

    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': CORS_ORIGIN
    });

    // Stream WAV bytes from kokoro server (fetch Response.body is web ReadableStream)
    // Guard against write after client disconnect or backpressure to avoid corrupting audio with error JSON (Issue 1/7 fix).
    const reader = kokoroRes.body.getReader();
    try {
      while (true) {
        if (res.destroyed || !res.writable) {
          try { reader.cancel(); } catch (_) {}
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (res.destroyed || !res.writable) {
          try { reader.cancel(); } catch (_) {}
          return;
        }
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (streamErr) {
      console.error('[TTS Proxy] stream error after headers:', streamErr.message);
      try { reader.cancel(); } catch (_) {}
      try { if (!res.destroyed) res.end(); } catch (_) {}
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      // Client aborted (stop button etc): silent clean, no 503/ toast on frontend.
      try { if (!res.destroyed && !res.headersSent) res.end(); } catch (_) {}
      return;
    }
    console.error('[TTS Proxy]', err.message);
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
      res.end(JSON.stringify({ error: 'Kokoro TTS unavailable', detail: err.message }));
    } else {
      // Headers already sent (audio started): end cleanly without appending JSON to WAV stream
      try { if (!res.destroyed) res.end(); } catch (_) {}
    }
  }
}

async function handleHazyTTSHealth(req, res) {
  setCORS(res);
  try {
    const healthUrl = getKokoroHealthUrl();
    const check = await fetch(healthUrl);
    const data = await check.json();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(JSON.stringify({ status: 'ok', kokoro: data }));
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(JSON.stringify({ status: 'unavailable' }));
  }
}

/** Pure helper for nvidia-smi output parsing (for tests + robustness; takes first GPU line for multi-GPU). */
function parseNvidiaSmi(smiRaw) {
  if (!smiRaw || typeof smiRaw !== 'string') return null;
  const firstLine = smiRaw.split(/\r?\n/)[0].trim();
  if (!firstLine) return null;
  const parts = firstLine.split(',').map(s => s.trim());
  const [gpuName, vramMBStr] = parts;
  const vramMB = parseInt(vramMBStr, 10);
  if (!gpuName || Number.isNaN(vramMB)) return null;
  return { gpu: gpuName, vramMB };
}

async function handleHazyHardware(req, res) {
  setCORS(res);
  const info = {
    platform: process.platform,
    cpuCores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalRAM: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
    freeRAM: Math.round(os.freemem() / 1024 / 1024 / 1024),   // GB
    gpu: null,
    cudaAvailable: false,
    recommendedDevice: 'cpu' // default fallback
  };

  // Try detect NVIDIA GPU via nvidia-smi (uses pure parseNvidiaSmi for multi-GPU + testability)
  try {
    const { stdout } = await execPromise(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
      { timeout: 3000 }
    );
    const smiRaw = stdout.trim();
    const parsed = parseNvidiaSmi(smiRaw);
    if (parsed) {
      info.gpu = parsed.gpu;
      info.vramMB = parsed.vramMB;
      info.cudaAvailable = true;
      info.recommendedDevice = 'cuda';
    } else if (smiRaw) {
      console.warn('[Hazy Hardware] nvidia-smi parse yielded invalid values, raw:', smiRaw);
    }
  } catch {
    // nvidia-smi not found or failed or parse error — CPU only
  }

  // Recommend CPU if VRAM is too low (under 2GB)
  if (info.cudaAvailable && info.vramMB < 2048) {
    info.recommendedDevice = 'cpu';
    info.gpuWarning = 'VRAM too low for GPU inference — falling back to CPU';
  }

  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
  res.end(JSON.stringify(info));
}

// ─────────────────────────────────────────────────────
// Health and Resource Monitoring
// ─────────────────────────────────────────────────────

let lastCpuTimes = null;

function getCpuUsage() {
  const cpus = os.cpus();
  if (!cpus || !cpus.length) return 0;
  let totalDiff = 0;
  let idleDiff = 0;
  if (lastCpuTimes && lastCpuTimes.length === cpus.length) {
    for (let i = 0; i < cpus.length; i++) {
      const start = lastCpuTimes[i].times;
      const end = cpus[i].times;
      const startTotal = start.user + start.nice + start.sys + start.idle + start.irq;
      const endTotal = end.user + end.nice + end.sys + end.idle + end.irq;
      totalDiff += (endTotal - startTotal);
      idleDiff += (end.idle - start.idle);
    }
  }
  lastCpuTimes = cpus;
  if (totalDiff <= 0) return 0;
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

let cachedGpuStats = null;
let lastGpuQueryTime = 0;

function parseDetailedNvidiaSmi(smiRaw) {
  if (!smiRaw || typeof smiRaw !== 'string') return null;
  const firstLine = smiRaw.split(/\r?\n/)[0].trim();
  if (!firstLine) return null;
  const parts = firstLine.split(',').map(s => s.trim());
  if (parts.length < 5) return null;

  const [name, utilStr, usedStr, totalStr, tempStr] = parts;
  const utilization = parseInt(utilStr, 10);
  const vramUsedMB = parseInt(usedStr, 10);
  const vramTotalMB = parseInt(totalStr, 10);
  const temperature = parseInt(tempStr, 10);

  if (!name || Number.isNaN(utilization) || Number.isNaN(vramUsedMB) || Number.isNaN(vramTotalMB) || Number.isNaN(temperature)) {
    return null;
  }

  return {
    name,
    utilization,
    vramUsedMB,
    vramTotalMB,
    temperature
  };
}

async function getGpuStats() {
  const now = Date.now();
  if (cachedGpuStats && (now - lastGpuQueryTime < 2000)) {
    return cachedGpuStats;
  }

  try {
    const { stdout } = await execPromise(
      'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits',
      { timeout: 1500 }
    );
    const parsed = parseDetailedNvidiaSmi(stdout.trim());
    if (parsed) {
      cachedGpuStats = parsed;
      lastGpuQueryTime = now;
      return parsed;
    }
  } catch (err) {
    // nvidia-smi failed or not present
  }

  cachedGpuStats = null;
  lastGpuQueryTime = now;
  return null;
}

function getAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(id) };
}

async function getOllamaStats(cfg) {
  const ollamaUrlStr = cfg.providers?.ollama?.baseUrl || 'http://localhost:11434';
  const stats = {
    status: 'offline',
    version: 'unknown',
    loadedModels: []
  };

  const tagAbort = getAbortSignal(1500);
  try {
    const versionRes = await fetch(`${ollamaUrlStr}/api/tags`, {
      signal: tagAbort.signal
    });
    if (versionRes.ok) {
      stats.status = 'online';
    }
  } catch (err) {
    return stats;
  } finally {
    tagAbort.cleanup();
  }

  const verAbort = getAbortSignal(1000);
  try {
    const versionCheck = await fetch(`${ollamaUrlStr}/api/version`, {
      signal: verAbort.signal
    });
    if (versionCheck.ok) {
      const vData = await versionCheck.json();
      stats.version = vData.version || 'unknown';
    }
  } catch {} finally {
    verAbort.cleanup();
  }

  const psAbort = getAbortSignal(1500);
  try {
    const psRes = await fetch(`${ollamaUrlStr}/api/ps`, {
      signal: psAbort.signal
    });
    if (psRes.ok) {
      const psData = await psRes.json();
      if (psData && Array.isArray(psData.models)) {
        stats.loadedModels = psData.models.map(m => {
          const size = Number(m.size) || 0;
          const vramSize = Number(m.size_vram) || 0;
          const gpuPercentage = size > 0 ? Math.round((vramSize / size) * 100) : 0;
          return {
            name: m.name,
            size,
            vramSize,
            gpuPercentage
          };
        });
      }
    }
  } catch (err) {
    // Non-fatal, just empty loaded models
  } finally {
    psAbort.cleanup();
  }

  return stats;
}

async function gatherAllMetrics(cfg) {
  const cpuPercentage = getCpuUsage();
  const totalMemGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const freeMemGB = Math.round(os.freemem() / 1024 / 1024 / 1024);
  const usedMemGB = Math.max(0, totalMemGB - freeMemGB);
  const processMemoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const gpu = getGpuStats();
  const ollama = await getOllamaStats(cfg);

  return {
    timestamp: new Date().toISOString(),
    status: ollama.status === 'online' ? 'online' : 'offline',
    system: {
      cpuPercentage,
      ramTotalGB: totalMemGB,
      ramUsedGB: usedMemGB,
      processMemoryMB
    },
    gpu,
    ollama
  };
}

async function handleHazyMonitorStats(req, res) {
  setCORS(res);
  try {
    const cfg = loadConfig();
    const metrics = await gatherAllMetrics(cfg);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(JSON.stringify(metrics, null, 2));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(JSON.stringify({ error: 'Failed to gather metrics', detail: error.message }));
  }
}

async function handleHazyMonitorStream(req, res) {
  setCORS(res, req);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': CORS_ORIGIN
  });

  res.write(': keep-alive\n\n');

  const cfg = loadConfig();

  const sendTick = async () => {
    try {
      const metrics = await gatherAllMetrics(cfg);
      if (res.destroyed || !res.writable) {
        clearInterval(timerId);
        return;
      }
      res.write(`data: ${JSON.stringify(metrics)}\n\n`);
    } catch (err) {
      if (!res.destroyed && res.writable) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      }
    }
  };

  await sendTick();

  const timerId = setInterval(sendTick, 2000);

  const cleanup = () => {
    clearInterval(timerId);
    try { res.end(); } catch (_) {}
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
}

// ─────────────────────────────────────────────────────
// RAG Handlers (Document Ingestion and Vector Index Management)
// ─────────────────────────────────────────────────────
async function handleRagDocuments(req, res) {
  setCORS(res);
  try {
    const chunks = vectorSearch.readIndex() || [];
    const docsMap = new Map();
    for (const chunk of chunks) {
      const fileId = chunk.fileId || 'unknown';
      if (!docsMap.has(fileId)) {
        docsMap.set(fileId, {
          id: fileId,
          name: chunk.filename || 'Document',
          type: chunk.sourceType || 'text/plain',
          addedAt: chunk.createdAt || new Date().toISOString(),
          uploadDate: chunk.createdAt || new Date().toISOString(),
          chunkCount: 0,
          size: 0
        });
      }
      const doc = docsMap.get(fileId);
      doc.chunkCount += 1;
      doc.size += (chunk.text || '').length;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify(Array.from(docsMap.values())));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify({ error: 'Failed to list RAG documents', detail: err.message }));
  }
}

async function handleRagUpload(req, res) {
  setCORS(res);
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  try {
    const body = await readBody(req);
    const { filename, content, type } = body;
    if (!filename || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
      res.end(JSON.stringify({ error: 'filename and content required' }));
      return;
    }
    
    // Attempt semantic embedding, fallback to lexical-only if embedding service throws
    let result;
    try {
      result = await ingestDocumentAsync(filename, {
        userId: 'local-user',
        text: content,
        sourceType: type === 'application/pdf' ? 'pdf' : (filename.endsWith('.md') ? 'md' : 'txt'),
        filename,
        embeddingService: new OllamaEmbeddingService()
      });
    } catch (e) {
      console.warn('[Server RAG] Embedding failed during ingestion, falling back to lexical-only:', e.message);
      result = await ingestDocumentAsync(filename, {
        userId: 'local-user',
        text: content,
        sourceType: type === 'application/pdf' ? 'pdf' : (filename.endsWith('.md') ? 'md' : 'txt'),
        filename
      });
    }

    await vectorSearch.addDocumentsAsync(result.chunks);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify({ success: true, docId: result.fileId, chunkCount: result.totalChunks }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify({ error: 'Failed to upload document', detail: err.message }));
  }
}

async function handleRagDelete(req, res) {
  setCORS(res);
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  try {
    const body = await readBody(req);
    const { fileId } = body;
    if (!fileId) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
      res.end(JSON.stringify({ error: 'fileId required' }));
      return;
    }
    const count = vectorSearch.deleteFile(fileId, 'local-user');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify({ success: true, deletedChunks: count }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) });
    res.end(JSON.stringify({ error: 'Failed to delete document', detail: err.message }));
  }
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
    const allowed = getAllowedOrigin(req);
    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }); res.end(); return;
  }

  // ── Hazy universal API routes ──
  if (pathname === '/hazy/default-prompt') { handleDefaultPrompt(req, res); return; }
  if (pathname === '/hazy/persona-prompt') { await handlePersonaPrompt(req, res); return; }
  if (pathname === '/hazy/generate-title') { await handleGenerateTitle(req, res); return; }
  if (pathname === '/hazy/write-workspace-files') { await handleWriteWorkspaceFiles(req, res); return; }
  if (pathname === '/hazy/chat')         { await handleHazyChat(req, res); return; }
  if (pathname === '/hazy/agent')        { await handleHazyChat(req, res, { forceAgent: true }); return; }
  if (pathname === '/hazy/analyze')      { await handleAnalyze(req, res); return; }
  if (pathname === '/hazy/tools')        { await handleTools(req, res); return; }
  if (pathname === '/hazy/tool-call')    { await handleToolCall(req, res); return; }
  if (pathname === '/hazy/confirm')      { await handleAgentConfirmation(req, res); return; }
  if (pathname === '/hazy/search')       { await handleWebSearch(req, res); return; }
  if (pathname === '/hazy/sources')      { await handleWebSources(req, res, parsed); return; }
  if (pathname === '/hazy/search-history'){ await handleWebSearchHistory(req, res, parsed); return; }
  if (pathname === '/hazy/browser/action'){ await handleBrowserAction(req, res); return; }
  if (pathname === '/hazy/browser/control'){ await handleBrowserControl(req, res, parsed); return; }
  if (pathname === '/hazy/browser/status'){ await handleBrowserStatus(req, res, parsed); return; }
  if (pathname === '/hazy/browser/events'){ await handleBrowserEvents(req, res, parsed); return; }
  if (pathname === '/hazy/browser/screenshot'){ await handleBrowserScreenshot(req, res, parsed); return; }
  if (pathname === '/hazy/providers')    { await handleProviders(req, res); return; }
  if (pathname === '/hazy/memories')     { await handleMemories(req, res, parsed); return; }
  if (pathname === '/hazy/conversations'){ await handleConversations(req, res, parsed); return; }
  if (pathname === '/hazy/pull')         { await handlePull(req, res); return; }
  if (pathname === '/hazy/delete-model') { await handleDeleteModel(req, res); return; }
  if (pathname === '/hazy/save-key')     { await handleSaveKey(req, res); return; }
  if (pathname === '/hazy/image')        { await handleImage(req, res); return; }
  if (pathname === '/hazy/tts')          { await handleHazyTTS(req, res); return; }
  if (pathname === '/hazy/tts/health')   { await handleHazyTTSHealth(req, res); return; }
  if (pathname === '/hazy/hardware')     { await handleHazyHardware(req, res); return; }
  if (pathname === '/hazy/monitor/stats') { await handleHazyMonitorStats(req, res); return; }
  if (pathname === '/hazy/monitor/stream') { await handleHazyMonitorStream(req, res); return; }
  if (pathname === '/hazy/rag/documents') { await handleRagDocuments(req, res); return; }
  if (pathname === '/hazy/rag/upload')    { await handleRagUpload(req, res); return; }
  if (pathname === '/hazy/rag/delete')    { await handleRagDelete(req, res); return; }

  // ── Phase 5 manual verification checklist (from plan + review Issue 13) ──
  // External kokoro-fastapi only (manual user step, no auto-clone/launcher per constraints).
  // Units (no external needed): node --test backend/tests/server_hazy_tts.test.js
  // 1. /hazy/hardware returns GPU/CPU + vram + recommendedDevice (nvidia-smi or fallback cpu).
  // 2. /hazy/tts/health returns {status:'ok', kokoro:...} (derives from KOKORO_URL, not hardcoded).
  // 3. curl POST :8880/v1/audio/speech (or /hazy/tts after start) produces playable .wav .
  // 4. Chat voice: streaming words play as LLM responds; full settings respected on all paths.
  // 5. Buttons/preview: direct speakText -> synthesize -> enqueueBlob(blob, {speed,volume}).
  // 6. Stop/interrupt: aborts (client signal now propagates to hazy->kokoro fetch in JS; queue clean).
  // 7. DevTools: no WASM/vendored kokoro loads; only /hazy/tts returning audio/wav.
  // 8. CPU/low-VRAM fallback + multi-GPU parse (first line) + RAM (psutil or platform) work.
  // See test header for copy-paste commands + abort limitation note (browser->hazy cancellable; server proxy to kokoro is best-effort on py).
  // See also: backend/tests/server_hazy_tts.test.js (parse + url + shape) and plan Phase 5.

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
  if (pathname.startsWith('/kokoro/')) {
    const kokoroPath = path.resolve(path.join(KOKORO_DIR, pathname.slice('/kokoro/'.length)));
    const resolvedKokoroDir = path.resolve(KOKORO_DIR);
    if (!kokoroPath.startsWith(resolvedKokoroDir + path.sep) && kokoroPath !== resolvedKokoroDir) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    serveStatic(res, kokoroPath);
    return;
  }

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

// Attach error listener unconditionally (even on require for tests + manual .listen later).
// Only the .listen() + startup banner stay inside the FORCE/require.main guard (per testability fix).
server.on('error', (err) => {
  console.error('[Server] HTTP server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} already in use. Use PORT= env or stop conflicting process.`);
  }
});

// Ensure config and cache dirs exist on startup
try {
  const configDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(CACHE_DIR))  fs.mkdirSync(CACHE_DIR,  { recursive: true });
  migrateLegacyProviderSecrets();
} catch(e) { console.warn('⚠  Could not create dirs:', e.message); }

// Only auto-listen when run directly (node server.js) or explicitly forced.
// Allows `require('../server')` in tests without binding port / side effects.
if (require.main === module || process.env.FORCE_SERVER_LISTEN === '1') {
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
} // end if (require.main === module || FORCE...)

// Test exports for server_hazy_tts.test.js (pure helpers + health url derivation; handlers exercised via mocks in test).
// Requiring this module no longer auto-binds the listen port.
if (typeof module !== 'undefined' && module.exports) {
  module.exports.getKokoroHealthUrl = getKokoroHealthUrl;
  module.exports.parseNvidiaSmi = parseNvidiaSmi;
  module.exports.parseDetailedNvidiaSmi = parseDetailedNvidiaSmi;
  module.exports.getCpuUsage = getCpuUsage;
  module.exports.getGpuStats = getGpuStats;
  module.exports.getOllamaStats = getOllamaStats;
  module.exports.gatherAllMetrics = gatherAllMetrics;
}
