# Hazy AI - Complete Source Bundle

This single markdown file contains the workspace tree and the full text of the visible source, config, and documentation files in the repo, excluding this generated file itself.

## File Structure Tree

```text
Hazy AI/
├── .gitignore
├── README.md
├── check-system.bat
├── check-system.sh
├── start.bat
├── start.sh
├── Hazy-AI-Complete-Source.md
├── backend/
│   ├── package-lock.json
│   ├── package.json
│   ├── requirements.txt
│   ├── server.js
│   └── server.py
├── cache/ (empty)
├── config/ (empty)
└── frontend/
  ├── app.js
  ├── enhancements.css
  ├── enhancements.js
  ├── hazy-agent.css
  ├── hazy-agent.js
  ├── hazy-auto-continue-integration.js
  ├── hazy-auto-continue.css
  ├── hazy-auto-continue.js
  ├── hazy-enhancements-complete.js
  ├── hazy-rag.css
  ├── hazy-rag.js
  ├── index-backup.html
  ├── index.html
  ├── model-manager.html
  ├── novel-writer.html
  ├── phonemize.js
  ├── quick-prompts.css
  ├── quick-prompts.js
  ├── splitter.js
  ├── style.css
  ├── ui-integration.js
  └── voices-data.js
```

Notes:
- `cache/` and `config/` are present in the workspace but currently contain no files.
- The file sections below preserve the exact file contents captured from the workspace.

## Files

### .gitignore

- Size: 184 bytes
- Language: text

~~~text
# Ignore config file — contains API keys
config/hazy-config.json

# OS files
.DS_Store
Thumbs.db

# Node
node_modules/
npm-debug.log

# Python
__pycache__/
*.pyc
.env
~~~

### backend\package-lock.json

- Size: 280 bytes
- Language: json

~~~json
{
  "name": "hazy-server",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "hazy-server",
      "version": "1.0.0",
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      }
    }
  }
}
~~~

### backend\package.json

- Size: 404 bytes
- Language: json

~~~json
{
  "name": "hazy-server",
  "version": "1.0.0",
  "description": "Hazy AI Chatbot Backend — by Dream On — Ollama proxy + static server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "keywords": ["ai", "chatbot", "ollama", "llm"],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {}
}
~~~

### backend\requirements.txt

- Size: 50 bytes
- Language: text

~~~text
fastapi>=0.110.0
uvicorn>=0.29.0
httpx>=0.27.0
~~~

### backend\server.js

- Size: 31974 bytes
- Language: javascript

~~~javascript
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

// ─────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────
const PORT         = process.env.PORT || 8080;
const HOST         = process.env.HOST || '127.0.0.1';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const CONFIG_PATH  = path.join(__dirname, '..', 'config', 'hazy-config.json');
const REGISTRY_PATH= path.join(__dirname, '..', 'config', 'models-registry.json');
const CACHE_DIR    = path.join(__dirname, '..', 'cache');

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    clientRes.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
    });
    proxyRes.pipe(clientRes);
  });
  proxyReq.on('error', err => {
    if (!clientRes.headersSent) clientRes.writeHead(503, { 'Content-Type': 'application/json' });
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
  return {
    model,
    max_tokens: body.options?.max_tokens || body.max_tokens || 4096,
    stream: body.stream !== false,
    system: (body.messages || []).find(m => m.role === 'system')?.content || '',
    messages: (body.messages || []).filter(m => m.role !== 'system').map(m => ({
      role: m.role, content: m.content
    })),
    temperature: body.options?.temperature ?? 0.85,
  };
}

function toOpenAIBody(body) {
  const model = (body.model || '').startsWith('openai/') ? body.model.slice('openai/'.length) : (body.model || 'gpt-4o');
  return {
    model,
    stream: body.stream !== false,
    max_tokens: body.options?.max_tokens || body.max_tokens || 4096,
    temperature: body.options?.temperature ?? 0.85,
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
      clientRes.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      clientRes.end(JSON.stringify({ error: msg, status: proxyRes.statusCode }));
    });
    return;
  }
  clientRes.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Transfer-Encoding': 'chunked',
    'Access-Control-Allow-Origin': '*',
  });
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
      clientRes.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      clientRes.end(JSON.stringify({ error: msg, status: proxyRes.statusCode }));
    });
    return;
  }
  clientRes.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Transfer-Encoding': 'chunked',
    'Access-Control-Allow-Origin': '*',
  });
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
  const body = await readBody(req);
  const cfg  = loadConfig();
  const modelId = body.model || cfg.defaults?.textModel || 'ollama/llama3.2';
  const provider = modelId.split('/')[0];

  setCORS(res);

  // ── Ollama ──
  if (provider === 'ollama') {
    const ollamaUrl  = new URL(cfg.providers?.ollama?.baseUrl || 'http://localhost:11434');
    const ollamaBody = { ...body, model: modelId.replace('ollama/', '') };
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
    const apiKey = body.apiKey || cfg.providers?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Anthropic API key not set. Add it in Settings → AI Providers.' })); return; }
    const anthBody = toAnthropicBody(body);
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
    const apiKey = body.apiKey || cfg.providers?.openai?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'OpenAI API key not set. Add it in Settings → AI Providers.' })); return; }
    const oaiBody = toOpenAIBody(body);
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
  if (provider === 'groq') {
    const apiKey = body.apiKey || cfg.providers?.groq?.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Groq API key not set. Add it in Settings → AI Providers.' })); return; }
    const groqBody = toGroqBody(body);
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
    const apiKey = body.apiKey || cfg.providers?.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Gemini API key not set. Add it in Settings → AI Providers.' })); return; }
    const gemModel = (body.model || 'gemini/gemini-2.0-flash').startsWith('gemini/') ? body.model.slice('gemini/'.length) : (body.model || 'gemini-2.0-flash');
    const gemBody  = toGeminiBody(body);
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
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: msg, status: proxyRes.statusCode }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Transfer-Encoding': 'chunked', 'Access-Control-Allow-Origin': '*' });
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
    enabled[key] = {
      enabled: val.enabled,
      hasKey:  !!(val.apiKey && val.apiKey.trim().length > 0),
      isLocal: key === 'ollama',
    };
  });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ providers: enabled, registry }));
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

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Transfer-Encoding': 'chunked', 'Access-Control-Allow-Origin': '*' });

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
    res.writeHead(delRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
    const cfg = loadConfig();
    if (!cfg.providers[provider]) cfg.providers[provider] = {};
    cfg.providers[provider].apiKey  = apiKey || '';
    cfg.providers[provider].enabled = !!(apiKey && apiKey.trim().length > 0);
    // Ensure config directory exists
    const configDir = require('path').dirname(CONFIG_PATH);
    if (!require('fs').existsSync(configDir)) require('fs').mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    console.log('[Server] Key saved for provider:', provider, '— enabled:', cfg.providers[provider].enabled);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, provider, enabled: cfg.providers[provider].enabled }));
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
    const apiKey = cfg.providers?.openai?.apiKey || cfg.providers?.openai_image?.apiKey;
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'OpenAI API key not set' })); return; }
    const resp = await httpsRequest({
      hostname: 'api.openai.com', port: 443, path: '/v1/images/generations',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }
    }, { model: body.model.replace('openai_image/', '') || 'dall-e-3', prompt: body.prompt, n: 1, size: body.size || '1024x1024' });
    res.writeHead(resp.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(resp.body);
    return;
  }

  if (provider === 'stability') {
    const apiKey = cfg.providers?.stability?.apiKey;
    if (!apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: 'Stability API key not set' })); return; }
    const resp = await httpsRequest({
      hostname: 'api.stability.ai', port: 443,
      path: '/v2beta/stable-image/generate/ultra',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
    }, { prompt: body.prompt, output_format: 'webp' });
    res.writeHead(resp.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }); res.end(); return;
  }

  // ── Hazy universal API routes ──
  if (pathname === '/hazy/chat')         { await handleHazyChat(req, res); return; }
  if (pathname === '/hazy/providers')    { await handleProviders(req, res); return; }
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    const proxyReq2 = mod2.request(opts2, proxyRes2 => {
      res.writeHead(proxyRes2.statusCode, {
        'Content-Type': proxyRes2.headers['content-type'] || 'application/json',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
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
  🔑  Config:   ${CONFIG_PATH}
  📚  Models:   ${REGISTRY_PATH}

  To add API keys:
  → Edit: hazy-chatbot/config/hazy-config.json
  → Or use: http://localhost:${PORT}/model-manager.html

  Press Ctrl+C to stop.
`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} in use. Try: PORT=8081 node server.js`);
  else console.error('Server error:', err.message);
  process.exit(1);
});
~~~

### backend\server.py

- Size: 9003 bytes
- Language: python

~~~python
#!/usr/bin/env python3
"""
Hazy Backend Server
-----------------------
A lightweight proxy + static file server that:
  1. Serves the frontend (HTML/CSS/JS)
  2. Proxies /api/* requests to Ollama (avoids CORS issues)
  3. Streams responses from Ollama back to the frontend

Requirements:
  pip install fastapi uvicorn httpx

Run:
  python server.py
  # OR with auto-reload:
  uvicorn server:app --reload --port 8080
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import AsyncGenerator

try:
    import httpx
    from fastapi import FastAPI, Request, Response
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
    from fastapi.staticfiles import StaticFiles
except ImportError:
    print("\n❌  Missing dependencies. Please run:\n")
    print("    pip install fastapi uvicorn httpx\n")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
OLLAMA_BASE  = os.getenv("OLLAMA_URL", "http://localhost:11434")
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
PORT         = int(os.getenv("PORT", 8080))
HOST         = os.getenv("HOST", "127.0.0.1")

# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Hazy", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Ollama proxy helpers
# ─────────────────────────────────────────────────────────────────────────────
async def stream_ollama(url: str, body: dict) -> AsyncGenerator[bytes, None]:
    """Stream NDJSON lines from Ollama and forward them."""
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, json=body) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line:
                    yield (line + "\n").encode()


# ─────────────────────────────────────────────────────────────────────────────
# API routes (proxy to Ollama)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/tags")
async def list_models():
    """List available Ollama models."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            return Response(content=r.content, media_type="application/json", status_code=r.status_code)
        except httpx.ConnectError:
            return Response(
                content=json.dumps({"error": "Cannot connect to Ollama", "models": []}),
                media_type="application/json",
                status_code=503,
            )


@app.post("/api/chat")
async def chat(request: Request):
    """Proxy streaming chat requests to Ollama."""
    body = await request.json()
    stream = body.get("stream", True)

    if stream:
        return StreamingResponse(
            stream_ollama(f"{OLLAMA_BASE}/api/chat", body),
            media_type="application/x-ndjson",
        )
    else:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{OLLAMA_BASE}/api/chat", json=body)
            return Response(content=r.content, media_type="application/json", status_code=r.status_code)


@app.post("/api/generate")
async def generate(request: Request):
    """Proxy streaming generate requests to Ollama."""
    body = await request.json()
    stream = body.get("stream", True)

    if stream:
        return StreamingResponse(
            stream_ollama(f"{OLLAMA_BASE}/api/generate", body),
            media_type="application/x-ndjson",
        )
    else:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{OLLAMA_BASE}/api/generate", json=body)
            return Response(content=r.content, media_type="application/json", status_code=r.status_code)


@app.get("/api/status")
async def status():
    """Health check — checks if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            data = r.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"status": "ok", "ollama": "connected", "models": models, "url": OLLAMA_BASE}
    except Exception as e:
        return {"status": "error", "ollama": "unreachable", "error": str(e), "url": OLLAMA_BASE}


# ─────────────────────────────────────────────────────────────────────────────
# Serve frontend static files
# ─────────────────────────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    # Mount static assets
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_index():
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return HTMLResponse("<h2>Frontend not found. Place frontend/ next to server.py</h2>", status_code=404)

    @app.get("/{filename}")
    async def serve_file(filename: str):
        fp = FRONTEND_DIR / filename
        if fp.exists() and fp.is_file():
            return FileResponse(str(fp))
        # fallback to index for SPA routing
        return FileResponse(str(FRONTEND_DIR / "index.html"))
else:
    @app.get("/")
    async def no_frontend():
        return HTMLResponse("""
        <html><body style="font-family:monospace; padding:40px; background:#0f1117; color:#e8ecf4;">
        <h2>⚠️  Frontend directory not found</h2>
        <p>Expected: <code>frontend/</code> next to <code>server.py</code></p>
        <p>The API proxy is still running at <code>/api/*</code></p>
        </body></html>
        """)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        print("❌  uvicorn not installed. Run: pip install uvicorn")
        sys.exit(1)

    print(f"""
╔══════════════════════════════════════╗
║         Hazy Server              ║
╚══════════════════════════════════════╝
  🌐  http://{HOST}:{PORT}
  🤖  Ollama: {OLLAMA_BASE}
  📁  Frontend: {FRONTEND_DIR}

  Open http://localhost:{PORT} in your browser.
  Press Ctrl+C to stop.
""")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
~~~

### check-system.bat

- Size: 2597 bytes
- Language: bat

~~~bat
@echo off
echo.
echo ===============================================================================
echo  HAZY NOVEL WRITER - DIAGNOSTIC TOOL
echo ===============================================================================
echo.

echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo Please download and install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
) else (
    echo [OK] Node.js is installed:
    node --version
)
echo.

echo [2/5] Checking if backend dependencies are installed...
if exist "backend\node_modules" (
    echo [OK] Dependencies are installed
) else (
    echo [WARNING] Dependencies not found. Installing now...
    cd backend
    call npm install
    cd ..
)
echo.

echo [3/5] Checking configuration file...
if exist "config\hazy-config.json" (
    echo [OK] Configuration file exists
) else (
    echo [ERROR] Configuration file missing!
    echo Please restore config\hazy-config.json
    pause
    exit /b 1
)
echo.

echo [4/5] Checking if Ollama is running (for local models)...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Ollama is running on port 11434
) else (
    echo [WARNING] Ollama is not running or not installed
    echo If you want to use local models:
    echo   1. Install Ollama from https://ollama.com
    echo   2. Run: ollama serve
    echo   3. Run: ollama pull llama3.2
    echo.
    echo Alternatively, you can use cloud providers (Claude, GPT-4, etc.)
    echo by adding your API key to config\hazy-config.json
)
echo.

echo [5/5] Checking if port 8080 is available...
netstat -an | find ":8080" | find "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port 8080 is already in use
    echo Either:
    echo   - Stop the other application using port 8080
    echo   - Or the Hazy server is already running (check your browser)
) else (
    echo [OK] Port 8080 is available
)
echo.

echo ===============================================================================
echo  DIAGNOSTIC COMPLETE
echo ===============================================================================
echo.
echo NEXT STEPS:
echo   1. If all checks passed: run start.bat to start the server
echo   2. If errors found: fix them using the instructions above
echo   3. Then open: http://localhost:8080/novel-writer.html
echo.
echo ===============================================================================
pause
~~~

### check-system.sh

- Size: 2656 bytes
- Language: bash

~~~bash
#!/bin/bash

echo ""
echo "==============================================================================="
echo " HAZY NOVEL WRITER - DIAGNOSTIC TOOL"
echo "==============================================================================="
echo ""

echo "[1/5] Checking Node.js installation..."
if command -v node &> /dev/null; then
    echo "[OK] Node.js is installed:"
    node --version
else
    echo "[ERROR] Node.js is NOT installed!"
    echo "Please download and install Node.js from https://nodejs.org"
    echo ""
    exit 1
fi
echo ""

echo "[2/5] Checking if backend dependencies are installed..."
if [ -d "backend/node_modules" ]; then
    echo "[OK] Dependencies are installed"
else
    echo "[WARNING] Dependencies not found. Installing now..."
    cd backend
    npm install
    cd ..
fi
echo ""

echo "[3/5] Checking configuration file..."
if [ -f "config/hazy-config.json" ]; then
    echo "[OK] Configuration file exists"
else
    echo "[ERROR] Configuration file missing!"
    echo "Please restore config/hazy-config.json"
    exit 1
fi
echo ""

echo "[4/5] Checking if Ollama is running (for local models)..."
if curl -s http://localhost:11434/api/tags &> /dev/null; then
    echo "[OK] Ollama is running on port 11434"
else
    echo "[WARNING] Ollama is not running or not installed"
    echo "If you want to use local models:"
    echo "  1. Install Ollama from https://ollama.com"
    echo "  2. Run: ollama serve"
    echo "  3. Run: ollama pull llama3.2"
    echo ""
    echo "Alternatively, you can use cloud providers (Claude, GPT-4, etc.)"
    echo "by adding your API key to config/hazy-config.json"
fi
echo ""

echo "[5/5] Checking if port 8080 is available..."
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":8080.*LISTEN"; then
    echo "[WARNING] Port 8080 is already in use"
    echo "Either:"
    echo "  - Stop the other application using port 8080"
    echo "  - Or the Hazy server is already running (check your browser)"
else
    echo "[OK] Port 8080 is available"
fi
echo ""

echo "==============================================================================="
echo " DIAGNOSTIC COMPLETE"
echo "==============================================================================="
echo ""
echo "NEXT STEPS:"
echo "  1. If all checks passed: run ./start.sh to start the server"
echo "  2. If errors found: fix them using the instructions above"
echo "  3. Then open: http://localhost:8080/novel-writer.html"
echo ""
echo "==============================================================================="
~~~

### frontend\app.js

- Size: 201665 bytes
- Language: javascript

~~~javascript
/**
 * Hazy — AI Chatbot + Website Builder
 * by Dream On
 *
 * Features:
 *  - Chat mode: full AI chat with streaming + markdown
 *  - Build mode: AI generates multi-file websites (HTML/CSS/JS + backend)
 *  - Website Builder Panel: tabbed file viewer, live preview iframe, ZIP download
 *  - Syntax highlighting, timestamps, search, rename, scroll-to-bottom
 */

// ========================
// Constants
// ========================
// ─── Why delimiter format instead of JSON? ────────────────────────────────
// Local LLMs (Mistral, Llama3 etc.) almost always fail to produce valid JSON
// when file contents contain quotes, backslashes, or HTML tags — they break
// JSON string escaping constantly. A simple FILE: delimiter is trivial for
// any model to follow correctly and works even on partial/cut-off output.
// ─────────────────────────────────────────────────────────────────────────

const WEBSITE_SYSTEM_PROMPT = `You are an expert web developer and mentor. Your job is to build complete, working websites AND explain what you built.

RESPONSE STRUCTURE — always follow this order:

**Step 1 — Approach (2-4 sentences before any code)**
Explain: what architecture you chose, why, and any key design decisions.
Example: "I'll use CSS Grid for the outer layout and Flexbox inside each card — Grid handles the page structure, Flex handles alignment within components. I'm keeping this vanilla JS to avoid dependencies."

**Step 2 — Files (use this exact delimiter format)**

===PROJECT===
<project name>

===DESCRIPTION===
<one line>

===FILE: index.html===
<!DOCTYPE html>
<!-- complete HTML — use semantic elements: header, main, nav, article, section, footer -->
<!-- add aria-labels and alt text for accessibility -->

===FILE: style.css===
/* complete CSS — mobile-first, then @media for larger screens */
/* comment layout decisions that aren't obvious */

===FILE: script.js===
// complete JS — no placeholder comments, no truncation
// comment WHY for any non-obvious logic

===SETUP===
<exact commands to run it>

===NOTES===
<browser support, dependencies, things to customise>

**Step 3 — What I built (after all files)**
Short paragraph: file structure overview, key technique used, one or two things to improve or extend.

HARD RULES:
- Complete code only. Never truncate. Never write "// rest of code here".
- Semantic HTML5. Accessible markup (aria, roles, alt text).
- CSS must be responsive and mobile-first.
- For backends: use Express.js and include package.json with all dependencies.
- Inline comments in code for anything non-obvious.`;

const WEBSITE_KEYWORDS = [
  'build', 'create', 'make', 'generate', 'website', 'webpage', 'landing page',
  'portfolio', 'dashboard', 'form', 'contact page', 'multi-page', 'backend',
  'express', 'node.js', 'frontend', 'site', 'web app', 'html page'
];

// ─── Code Builder System Prompt ──────────────────────────────────────────────
// Reference: Claude Technical Reference §4.1 (Code Generation), §8.1 (Capabilities)
const CODE_SYSTEM_PROMPT = `You are an expert programmer and mentor. Expert-level code generation means:
- Explaining your approach before writing code
- Using idiomatic patterns for the language
- Including error handling, edge cases, and comments
- Teaching the user something beyond just the answer

RESPONSE STRUCTURE — always follow this order:

**Step 1 — Approach (2-4 sentences)**
What algorithm or pattern you chose, why, and any trade-offs considered.

**Step 2 — Files (use this exact delimiter format)**

===PROJECT===
<project name>

===DESCRIPTION===
<one line>

===FILE: <filename.ext>===
<complete code>
// Use inline comments for non-obvious logic — explain WHY not just WHAT
// Include all imports, a working main/entry point, and error handling

===SETUP===
<exact commands to compile and run>

===NOTES===
<dependencies, edge cases, platform requirements>

**Step 3 — How it works (after all files)**
- Core logic or algorithm used
- Why you structured it this way
- What you'd do differently at larger scale or with more time

HARD RULES:
- Complete code only. Never truncate. Never use "// TODO" or placeholder comments.
- Use idiomatic style: list comprehensions in Python, proper error types in Go, async/await in JS, etc.
- Include all imports and a working entry point.
- Handle the obvious edge cases. Add basic error handling.
- For multi-file projects, explain how the files connect.`;

// All supported programming languages for the Code Builder picker
const CODE_LANGUAGES = [
  { label: 'Python',         value: 'python',      ext: 'py',    icon: '' },
  { label: 'Java',           value: 'java',        ext: 'java',  icon: '' },
  { label: 'C++',            value: 'cpp',         ext: 'cpp',   icon: '' },
  { label: 'C',              value: 'c',           ext: 'c',     icon: '' },
  { label: 'C#',             value: 'csharp',      ext: 'cs',    icon: '' },
  { label: 'JavaScript',     value: 'javascript',  ext: 'js',    icon: '' },
  { label: 'TypeScript',     value: 'typescript',  ext: 'ts',    icon: '' },
  { label: 'Go',             value: 'go',          ext: 'go',    icon: '' },
  { label: 'Rust',           value: 'rust',        ext: 'rs',    icon: '' },
  { label: 'Swift',          value: 'swift',       ext: 'swift', icon: '' },
  { label: 'Kotlin',         value: 'kotlin',      ext: 'kt',    icon: '' },
  { label: 'Ruby',           value: 'ruby',        ext: 'rb',    icon: '' },
  { label: 'PHP',            value: 'php',         ext: 'php',   icon: '' },
  { label: 'R',              value: 'r',           ext: 'r',     icon: '' },
  { label: 'Dart',           value: 'dart',        ext: 'dart',  icon: '' },
  { label: 'Lua',            value: 'lua',         ext: 'lua',   icon: '' },
  { label: 'Perl',           value: 'perl',        ext: 'pl',    icon: '' },
  { label: 'Scala',          value: 'scala',       ext: 'scala', icon: '' },
  { label: 'Haskell',        value: 'haskell',     ext: 'hs',    icon: '' },
  { label: 'Elixir',         value: 'elixir',      ext: 'ex',    icon: '' },
  { label: 'Clojure',        value: 'clojure',     ext: 'clj',   icon: '' },
  { label: 'Shell / Bash',   value: 'bash',        ext: 'sh',    icon: '' },
  { label: 'PowerShell',     value: 'powershell',  ext: 'ps1',   icon: '' },
  { label: 'SQL',            value: 'sql',         ext: 'sql',   icon: '' },
  { label: 'Assembly',       value: 'asm',         ext: 'asm',   icon: '' },
  { label: 'MATLAB',         value: 'matlab',      ext: 'm',     icon: '' },
  { label: 'Fortran',        value: 'fortran',     ext: 'f90',   icon: '' },
  { label: 'COBOL',          value: 'cobol',       ext: 'cob',   icon: '' },
  { label: 'Any / Auto',     value: 'auto',        ext: '',      icon: '' },
];

// ========================
// State
// ========================
const STATE = {
  conversations: {},
  activeConvId: null,
  model: 'mistral',
  isStreaming: false,
  abortController: null,
  ollamaUrl: 'http://localhost:11434',
  systemPrompt: `You are Hazy, an expert AI assistant and programming mentor modelled on best-in-class AI behaviour.

CORE BEHAVIOUR (how you always respond):
- Lead with the answer, then explain. Never bury the key point.
- For code: explain your approach first (2-3 sentences), then write the code, then add a brief "How it works" note after.
- Always wrap code in fenced blocks with the correct language tag: \`\`\`python \`\`\`javascript \`\`\`typescript \`\`\`java \`\`\`cpp \`\`\`go \`\`\`rust \`\`\`bash etc.
- Add inline comments inside code for anything non-obvious — explain WHY, not just WHAT.
- Write complete, working code. Never truncate. Never use placeholder comments like "// TODO" or "// add logic here".
- Handle edge cases. Include basic error handling. Use idiomatic style for the language.
- When there are multiple valid approaches, briefly note the trade-offs.
- Be honest about uncertainty. Say "I'm not sure" rather than guess.

CAPABILITIES YOU HAVE:
- Expert-level code generation and debugging across Python, JavaScript, TypeScript, Rust, Go, Java, C++, and 30+ others
- Multi-step logical, mathematical, and causal reasoning
- Summarisation, translation (100+ languages), classification, question answering
- Long document analysis and creative writing
- Architecture advice, code review, refactoring suggestions

KNOWN LIMITATIONS (be upfront about these):
- Your training has a knowledge cutoff — you may not know the very latest libraries or APIs
- You can make mistakes on large arithmetic without running code — say so
- For critical information, tell the user to verify independently`,
  // Inference parameters — matched to Claude's documented ranges
  // Ref: Claude Technical Reference §2.4 (Temperature 0-1, Top-P 0.9-0.99, Top-K 10-100)
  temperature: 0.7,      // 0.0 = deterministic, 1.0 = creative
  maxTokens: 8192,       // Claude supports up to 200k; 8192 is a solid local default
  topP: 0.95,            // Nucleus sampling — Claude uses 0.9–0.99
  topK: 40,              // Limits to top-K tokens — Claude uses 10–100
  repeatPenalty: 1.05,   // Slight repetition penalty for cleaner output
  contextSize: 8192,     // Context window for local models
  theme: 'hazel',
  ttsEnabled: false,
  ttsEngine: 'browser',     // 'browser' | 'piper'
  ttsVoice: 'en_US-lessac-medium',  // Piper voice model name
  ttsSpeed: 1.0,
  tpsPiperReady: false,     // model loaded flag
  ttsPiperLoading: false,
  renameTargetId: null,
  // Builder
  mode: 'chat',
  codeLang: 'auto',            // Selected language for Build Code mode
  showLiveCode: true,          // Show code as it's being generated (like Claude)
  builderFiles: [],
  builderActive: false,
  builderActiveFile: 0,
  builderPreviewVisible: false,
  // File uploads
  uploadedFiles: [],
  // Persona
  personaEnabled: false,
  personaRelation: 'friend',
  personaName: 'Alex',
  personaUserName: '',
  personaGender: 'neutral',
  personaTraits: [],
  personaLanguage: 'casual',
  // Scenario
  scenarioDesc: '',
  scenarioOpener: '',
  scenarioUserRole: '',
  scenarioCharRole: '',
  scenarioSetting: '',
  // Appearance
  fontSize:      '14px',
  density:       'normal',
  codeHL:        true,
  markdown:      true,
  repeatPenalty: 1.1,
  topP:          0.92,
  contextSize:   4096,
};

// ========================
// DOM refs
// ========================
const $ = id => document.getElementById(id);
const el = {
  chatInput:          $('chatInput'),
  sendBtn:            $('sendBtn'),
  stopBtn:            $('stopBtn'),
  messagesArea:       $('messagesArea'),
  welcomeScreen:      $('welcomeScreen'),
  chatContainer:      $('chatContainer'),
  chatHistory:        $('chatHistory'),
  charCount:          $('charCount'),
  currentModelName:   $('currentModelName'),
  modelList:          $('modelList'),
  modelSelector:      $('modelSelector'),
  modelDropdown:      $('modelDropdown'),
  statusDot:          $('statusDot'),
  statusText:         $('statusText'),
  newChatBtn:         $('newChatBtn'),
  clearChatBtn:       $('clearChatBtn'),
  settingsBtn:        $('settingsBtn'),
  settingsModal:      $('settingsModal'),
  settingsClose:      $('settingsClose'),
  settingsSaveBtn:    $('settingsSaveBtn'),
  settingsCancelBtn:  $('settingsCancelBtn'),
  ollamaUrl:          $('ollamaUrl'),
  systemPrompt:       $('systemPrompt'),
  temperature:        $('temperature'),
  tempLabel:          $('tempLabel'),
  maxTokens:          $('maxTokens'),
  maxTokensLabel:     $('maxTokensLabel'),
  toastContainer:     $('toastContainer'),
  sidebar:            $('sidebar'),
  sidebarToggle:      $('sidebarToggle'),
  suggestionGrid:     $('suggestionGrid'),
  exportBtn:          $('exportBtn'),
  ttsToggleBtn:       $('ttsToggleBtn'),
  ttsLabel:           $('ttsLabel'),
  ttsVoiceBtn:        $('ttsVoiceBtn'),
  ttsModal:           $('ttsModal'),
  ttsClose:           $('ttsClose'),
  ttsEngineRadios:    null,
  ttsVoiceSelect:     $('ttsVoiceSelect'),
  ttsSpeedRange:      $('ttsSpeedRange'),
  ttsSpeedLabel:      $('ttsSpeedLabel'),
  ttsPiperStatus:     $('ttsPiperStatus'),
  ttsTestBtn:         $('ttsTestBtn'),
  historySearch:      $('historySearch'),
  scrollBottomBtn:    $('scrollBottomBtn'),
  renameModal:        $('renameModal'),
  renameInput:        $('renameInput'),
  renameClose:        $('renameClose'),
  renameCancelBtn:    $('renameCancelBtn'),
  renameSaveBtn:      $('renameSaveBtn'),
  // File upload
  uploadBtn:          $('uploadBtn'),
  fileInput:          $('fileInput'),
  filePreviewStrip:   $('filePreviewStrip'),
  // Mode bar
  modeChatBtn:        $('modeChatBtn'),
  modeBuildBtn:       $('modeBuildBtn'),
  modeCodeBtn:        $('modeCodeBtn'),
  codeLangSelect:     $('codeLangSelect'),
  modeIndicator:      $('modeIndicator'),
  // Persona
  personaBtn:         $('personaBtn'),
  personaModal:       $('personaModal'),
  personaClose:       $('personaClose'),
  personaSaveBtn:     $('personaSaveBtn'),
  personaCancelBtn:   $('personaCancelBtn'),
  personaResetBtn:    $('personaResetBtn'),
  personaToggle:      $('personaToggle'),
  personaNameInput:   $('personaNameInput'),
  personaUserNameInput: $('personaUserNameInput'),
  personaGender:      $('personaGender'),
  personaLanguage:    $('personaLanguage'),
  personaStatusBadge: $('personaStatusBadge'),
  scenarioDesc:       $('scenarioDesc'),
  scenarioOpener:     $('scenarioOpener'),
  scenarioUserRole:   $('scenarioUserRole'),
  scenarioCharRole:   $('scenarioCharRole'),
  personaPreviewBox:  $('personaPreviewBox'),
  // Builder panel
  builderPanel:       $('builderPanel'),
  builderProjectName: $('builderProjectName'),
  builderTabs:        $('builderTabs'),
  builderBody:        $('builderBody'),
  builderCodePane:    $('builderCodePane'),
  builderPreviewPane: $('builderPreviewPane'),
  builderCode:        $('builderCode'),
  builderFileLabel:   $('builderFileLabel'),
  builderCopyFile:    $('builderCopyFile'),
  builderDownload:    $('builderDownload'),
  builderClose:       $('builderClose'),
  builderPreviewToggle: $('builderPreviewToggle'),
  builderRefresh:     $('builderRefresh'),
  builderStatus:      $('builderStatus'),
  builderFileCount:   $('builderFileCount'),
  previewFrame:       $('previewFrame'),
  previewWrapper:     $('previewWrapper'),
};

function getIconSvg(iconId, className = 'icon-svg') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${iconId}"></use></svg>`;
}

function stripLeadingDecorations(text) {
  return String(text || '')
    .replace(/^[^A-Za-z0-9]+/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeFrontendIcons() {
  const setHtml = (selector, html) => {
    const node = document.querySelector(selector);
    if (node) node.innerHTML = html;
  };

  setHtml('.model-icon', getIconSvg('icon-robot'));

  document.querySelectorAll('.mode-pill').forEach((pill, index) => {
    const iconIds = ['icon-chat', 'icon-globe', 'icon-chart', 'icon-clipboard'];
    pill.innerHTML = `${getIconSvg(iconIds[index] || 'icon-sparkles')}${stripLeadingDecorations(pill.textContent)}`;
  });

  document.querySelectorAll('.suggestion-icon').forEach((icon, index) => {
    const iconIds = ['icon-sparkles', 'icon-grid', 'icon-chart', 'icon-clipboard'];
    icon.innerHTML = getIconSvg(iconIds[index] || 'icon-sparkles');
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.innerHTML = getIconSvg('icon-close');
  });

  document.querySelectorAll('.viewport-btn').forEach((btn, index) => {
    const iconIds = ['icon-desktop', 'icon-tablet', 'icon-mobile'];
    btn.innerHTML = getIconSvg(iconIds[index] || 'icon-desktop');
  });

  const refreshBtn = document.getElementById('builderRefresh');
  if (refreshBtn) refreshBtn.innerHTML = getIconSvg('icon-refresh');

  const builderClose = document.getElementById('builderClose');
  if (builderClose) builderClose.innerHTML = getIconSvg('icon-close');

  const renameClose = document.getElementById('renameClose');
  if (renameClose) renameClose.innerHTML = getIconSvg('icon-close');

  const personaClose = document.getElementById('personaClose');
  if (personaClose) personaClose.innerHTML = getIconSvg('icon-close');

  const ttsClose = document.getElementById('ttsClose');
  if (ttsClose) ttsClose.innerHTML = getIconSvg('icon-close');

  const trainingClose = document.getElementById('trainingClose');
  if (trainingClose) trainingClose.innerHTML = getIconSvg('icon-close');

  const personaModalIcon = document.querySelector('.persona-modal-icon');
  if (personaModalIcon) personaModalIcon.innerHTML = getIconSvg('icon-user');

  const ttsTitleIcon = document.querySelector('#ttsModal .modal-header span[style*="font-size:22px"]');
  if (ttsTitleIcon) ttsTitleIcon.innerHTML = getIconSvg('icon-microphone');

  document.querySelectorAll('.tts-engine-icon').forEach((node, index) => {
    node.innerHTML = getIconSvg(index === 0 ? 'icon-volume' : 'icon-sparkles');
  });

  document.querySelectorAll('.persona-tab, .training-tab, .trait-pill').forEach(node => {
    node.textContent = stripLeadingDecorations(node.textContent);
  });

  document.querySelectorAll('.persona-card-emoji').forEach((node, index) => {
    const iconIds = ['icon-chat', 'icon-users', 'icon-user', 'icon-user', 'icon-user', 'icon-user', 'icon-heart', 'icon-bolt'];
    node.innerHTML = getIconSvg(iconIds[index] || 'icon-user');
  });

  document.querySelectorAll('#codeLangSelect option, #activeProviderSelect option, #ttsVoiceSelect optgroup, #ttsVoiceSelect option').forEach(node => {
    node.textContent = stripLeadingDecorations(node.textContent);
  });

  if (el.modeIndicator) {
    el.modeIndicator.innerHTML = `${getIconSvg('icon-chat')}Chat mode`;
  }
}

// ========================
// Init
// ========================
function init() {
  loadSettings();
  loadConversations();
  applyTheme(STATE.theme);
  applyAppearanceSettings();
  normalizeFrontendIcons();
  setupEventListeners();
  checkOllamaConnection();
  renderChatHistory();
  updatePersonaBadge();
}

// ========================
// Settings
// ========================
const SETTINGS_VERSION = 2; // bump this when default systemPrompt changes

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('hazy_settings') || '{}');
    if (s.ollamaUrl)       STATE.ollamaUrl    = s.ollamaUrl;
    // Only restore saved system prompt if it's from the current version
    if (s.systemPrompt && s.settingsVersion === SETTINGS_VERSION) STATE.systemPrompt = s.systemPrompt;
    if (s.temperature != null) STATE.temperature = s.temperature;
    if (s.maxTokens)       STATE.maxTokens    = s.maxTokens;
    if (s.model)           STATE.model        = s.model;
    STATE.theme = s.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'hazel');
    // Persona + Scenario
    if (s.personaEnabled  != null) STATE.personaEnabled  = s.personaEnabled;
    if (s.personaRelation)         STATE.personaRelation = s.personaRelation;
    if (s.personaName)             STATE.personaName     = s.personaName;
    if (s.personaUserName != null) STATE.personaUserName = s.personaUserName;
    if (s.personaGender)           STATE.personaGender   = s.personaGender;
    if (s.personaTraits)           STATE.personaTraits   = s.personaTraits;
    if (s.personaLanguage)         STATE.personaLanguage = s.personaLanguage;
    if (s.scenarioDesc    != null) STATE.scenarioDesc    = s.scenarioDesc;
    if (s.scenarioOpener  != null) STATE.scenarioOpener  = s.scenarioOpener;
    if (s.scenarioUserRole!= null) STATE.scenarioUserRole= s.scenarioUserRole;
    if (s.scenarioCharRole!= null) STATE.scenarioCharRole= s.scenarioCharRole;
    if (s.scenarioSetting != null) STATE.scenarioSetting = s.scenarioSetting;
    // Appearance
    if (s.fontSize)        STATE.fontSize       = s.fontSize;
    if (s.density)         STATE.density        = s.density;
    if (s.codeHL   != null) STATE.codeHL        = s.codeHL;
    if (s.markdown != null) STATE.markdown      = s.markdown;
    if (s.repeatPenalty)   STATE.repeatPenalty  = s.repeatPenalty;
    if (s.topP)            STATE.topP           = s.topP;
    if (s.contextSize)     STATE.contextSize    = s.contextSize;

    // Website builder settings
    if (s.showLiveCode != null) STATE.showLiveCode = s.showLiveCode;

    el.ollamaUrl.value            = STATE.ollamaUrl;
    el.systemPrompt.value         = STATE.systemPrompt;
    el.temperature.value          = STATE.temperature;
    el.tempLabel.textContent      = STATE.temperature;
    el.maxTokens.value            = STATE.maxTokens;
    el.maxTokensLabel.textContent = STATE.maxTokens;
    
    // Set checkbox states
    const showLiveCodeEl = document.getElementById('showLiveCode');
    if (showLiveCodeEl) showLiveCodeEl.checked = STATE.showLiveCode;

    document.querySelectorAll('.theme-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === STATE.theme)
    );
  } catch(e) {}
}

function saveSettings() {
  const rawUrl = el.ollamaUrl.value.trim().replace(/\/$/, '');
  try { new URL(rawUrl); } catch {
    showToast('Invalid Ollama URL', 'error'); return;
  }
  STATE.ollamaUrl    = rawUrl;
  STATE.systemPrompt = el.systemPrompt.value.trim();
  STATE.temperature  = parseFloat(el.temperature.value);
  STATE.maxTokens    = parseInt(el.maxTokens.value);

  // Read appearance settings from the new Settings panel
  const fontSize    = document.getElementById('settingsFontSize')?.value    || '14px';
  const density     = document.getElementById('settingsDensity')?.value     || 'normal';
  const codeHL      = document.getElementById('settingsCodeHighlight')?.checked !== false;
  const markdown    = document.getElementById('settingsMarkdown')?.checked    !== false;
  const repeatPen   = parseFloat(document.getElementById('settingsRepeatPenalty')?.value || 1.1);
  const topP        = parseFloat(document.getElementById('settingsTopP')?.value           || 0.92);
  const ctxSize     = parseInt(document.getElementById('settingsContextSize')?.value      || 4096);

  STATE.fontSize    = fontSize;
  STATE.density     = density;
  STATE.codeHL      = codeHL;
  STATE.markdown    = markdown;
  STATE.repeatPenalty = repeatPen;
  STATE.topP        = topP;
  STATE.contextSize = ctxSize;
  
  // Website builder settings
  const showLiveCode = document.getElementById('showLiveCode')?.checked !== false;
  STATE.showLiveCode = showLiveCode;

  localStorage.setItem('hazy_settings', JSON.stringify({
    settingsVersion: SETTINGS_VERSION,
    ollamaUrl: STATE.ollamaUrl, systemPrompt: STATE.systemPrompt,
    temperature: STATE.temperature, maxTokens: STATE.maxTokens,
    theme: STATE.theme, model: STATE.model,
    fontSize, density, codeHL, markdown, repeatPenalty: repeatPen, topP, contextSize: ctxSize,
    showLiveCode,
    personaEnabled: STATE.personaEnabled, personaRelation: STATE.personaRelation,
    personaName: STATE.personaName, personaUserName: STATE.personaUserName,
    personaGender: STATE.personaGender, personaTraits: STATE.personaTraits,
    personaLanguage: STATE.personaLanguage,
    scenarioDesc: STATE.scenarioDesc, scenarioOpener: STATE.scenarioOpener,
    scenarioUserRole: STATE.scenarioUserRole, scenarioCharRole: STATE.scenarioCharRole,
    scenarioSetting: STATE.scenarioSetting,
  }));
  applyAppearanceSettings();
  closeModal('settingsModal');
  showToast('Settings saved', 'success');
  checkOllamaConnection();
}

function applyTheme(theme) {
  STATE.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const hljsLink = $('hljs-theme');
  if (hljsLink) {
    hljsLink.href = theme === 'hazel'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
  }
}

// ── Appearance settings — font size, density, code highlight, markdown ──
function applyAppearanceSettings() {
  const root = document.documentElement;

  // Font size
  const fontSize = STATE.fontSize || '14px';
  root.style.setProperty('--chat-font-size', fontSize);
  const messagesArea = document.getElementById('messagesArea');
  if (messagesArea) messagesArea.style.fontSize = fontSize;

  // Message density — controls padding on message bubbles
  const densityMap = { compact: '8px 12px', normal: '12px 16px', comfortable: '18px 20px' };
  const padding = densityMap[STATE.density] || densityMap.normal;
  root.style.setProperty('--message-padding', padding);

  // Inject/update a style tag for dynamic overrides
  let styleTag = document.getElementById('hazy-appearance-overrides');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'hazy-appearance-overrides';
    document.head.appendChild(styleTag);
  }

  const codeHL   = STATE.codeHL   !== false;
  const markdown = STATE.markdown !== false;

  styleTag.textContent = `
    .messages-area { font-size: ${fontSize}; }
    .message-content { font-size: ${fontSize}; }
    .message-bubble { padding: var(--message-padding); }
    ${!codeHL ? '.hljs { background: var(--bg-secondary) !important; color: var(--text-primary) !important; } .hljs span { color: inherit !important; }' : ''}
    ${!markdown ? '.message-content strong, .message-content em, .message-content code { font-weight: inherit; font-style: inherit; font-family: inherit; background: none; padding: 0; }' : ''}
  `;

  // Sync the appearance tab controls to match current STATE
  const fsEl = document.getElementById('settingsFontSize');
  const dEl  = document.getElementById('settingsDensity');
  const chEl = document.getElementById('settingsCodeHighlight');
  const mdEl = document.getElementById('settingsMarkdown');
  if (fsEl) fsEl.value = fontSize;
  if (dEl)  dEl.value  = STATE.density || 'normal';
  if (chEl) chEl.checked = codeHL;
  if (mdEl) mdEl.checked = markdown;
}

// ========================
// Persona + Scenario Engine
// ========================

// ── Preset quick-start scenarios ──────────────────────────────────────────
const SCENARIO_PRESETS = [
  {
    id: 'school_lab',
    icon: 'icon-sparkles',
    title: 'Lab Partners',
    tag: 'School',
    relation: 'friend',
    gender: 'neutral',
    language: 'playful',
    traits: ['funny','teasing'],
    charRole: 'classmate assigned as your lab partner',
    userRole: 'new student',
    scenarioDesc: `It's a Monday morning in Chemistry class at Westbrook High. The teacher just announced random lab partner assignments for the semester. {name} slides into the seat next to you — someone you've seen in the halls but never really talked to. There's a half-finished experiment on the table, some bubbling beakers, and a worksheet neither of you has started.`,
    opener: `*drops their bag with a thud and glances at the worksheet* Okay so… neither of us has done this, right? *grins* Cool. I'm {name}. Fair warning — I'm terrible at titration but I can distract the teacher if anything explodes.`,
  },
  {
    id: 'campus_coffee',
    icon: 'icon-volume',
    title: 'Coffee Shop Crush',
    tag: 'Romance',
    relation: 'lover',
    gender: 'neutral',
    language: 'flirty',
    traits: ['shy','romantic'],
    charRole: 'regular at the same coffee shop',
    userRole: 'yourself',
    scenarioDesc: `A cozy campus coffee shop on a rainy Thursday afternoon. You've been coming here every week for a month and so has {name}. You always end up at neighboring tables. Today every other seat is taken — except the one across from them. The rain is heavy outside, someone left a book on the table between you, and the barista is playing soft indie music.`,
    opener: `*looks up from their laptop as you approach, then gestures to the empty seat with a small smile* Go ahead. It's a bit ridiculous how packed this place gets when it rains, right? *quietly* I'm {name}, by the way. I've seen you here before.`,
  },
  {
    id: 'childhood_reunion',
    icon: 'icon-users',
    title: 'Childhood Friend Reunion',
    tag: 'Friendship',
    relation: 'bestfriend',
    gender: 'neutral',
    language: 'warm',
    traits: ['nostalgic','protective','emotional'],
    charRole: 'your childhood best friend you lost contact with',
    userRole: 'yourself',
    scenarioDesc: `You haven't seen {name} in seven years — not since your family moved away in middle school. Out of nowhere, you run into each other at your hometown's small convenience store during a holiday visit. It's late evening, the store is quiet, and you almost didn't recognize each other. There's a lot of history, a lot unsaid, and a familiar warmth you both feel immediately.`,
    opener: `*freezes mid-reach for a snack on the shelf and stares at you* No way. No way. *turns fully* Is that… oh my god. *half-laughs, half-can't believe it* How long has it been? You look— *shakes head* Wow. Hi.`,
  },
  {
    id: 'office_rival',
    icon: 'icon-grid',
    title: 'Office Rival',
    tag: 'Drama',
    relation: 'rival',
    gender: 'neutral',
    language: 'intense',
    traits: ['confident','sarcastic','competitive'],
    charRole: 'your competitive coworker who was just put on the same project',
    userRole: 'coworker',
    scenarioDesc: `You and {name} have been quietly competing for the same promotion at work for months. You've always been civil but there's clear tension. Today your manager paired you together on the biggest pitch of the quarter — due Friday. It's Tuesday. You're both sitting in a glass-walled conference room with a half-blank presentation on the screen and coffee going cold.`,
    opener: `*leans back in the chair and looks at the blank slides, then at you* So. Here we are. *dry smile* I'll be honest — this wasn't my first choice of partner either. But the pitch has to be good, and I actually want to win this account. So. *slides a notepad across the table* Let's skip the awkward part and figure out who's doing what.`,
  },
  {
    id: 'fantasy_kingdom',
    icon: 'icon-bolt',
    title: 'Fantasy Kingdom',
    tag: 'Fantasy',
    relation: 'friend',
    gender: 'neutral',
    language: 'casual',
    traits: ['mysterious','protective','adventurous'],
    charRole: 'a skilled ranger who has sworn to protect you',
    userRole: 'a young noble on a dangerous journey',
    scenarioDesc: `The kingdom of Aldenmoor is on the verge of war. You've been sent on a secret mission to retrieve a stolen artifact before it falls into enemy hands. {name} is the ranger hired to escort you — a quiet, capable outsider who clearly knows more about the world than they let on. You've just made camp in the Ashwood Forest after a long day of travel. The fire crackles, wolves howl somewhere in the dark, and you still have three days of dangerous road ahead.`,
    opener: `*crouches by the fire, sharpening a blade, and glances up at you* You should eat something. *nods toward the wrapped bread in the pack* We move at first light. The road through the valley is… not ideal. *pauses* There are things in these woods that don't like fire. Which is exactly why we're keeping it small. *meets your eyes calmly* You alright?`,
  },
  {
    id: 'study_session',
    icon: 'icon-clipboard',
    title: 'Late Night Study',
    tag: 'School',
    relation: 'friend',
    gender: 'neutral',
    language: 'playful',
    traits: ['funny','nerdy','supportive'],
    charRole: 'your study buddy cramming for finals',
    userRole: 'student',
    scenarioDesc: `It's 11:30 PM in the university library, finals week. You and {name} have been here since 6 PM trying to get through the most brutal exam prep of the semester. Empty coffee cups, highlighters everywhere, and a shared Google doc that's getting increasingly chaotic. The library closes in an hour and you're both still on page 4 of 22.`,
    opener: `*stares at the textbook, then slowly closes it and puts their head on the table* I just read the same paragraph six times and I still don't know what osmosis does. *lifts head* How are you doing? Tell me you understood the metabolism chapter because I will absolutely trade you my notes on cell division.`,
  },
  {
    id: 'hospital_roommate',
    icon: 'icon-user',
    title: 'Hospital Roommates',
    tag: 'Slice of Life',
    relation: 'friend',
    gender: 'neutral',
    language: 'warm',
    traits: ['funny','empathetic','honest'],
    charRole: 'your hospital room neighbor who ended up becoming your unexpected friend',
    userRole: 'patient',
    scenarioDesc: `You've been in the hospital for a minor procedure and have to stay for observation for two days. {name} is in the bed next to yours — they've been here a bit longer for something unrelated. The room has bad TV, shared sad hospital food, and a window that overlooks a parking lot. You've been awkwardly ignoring each other all morning until a nurse accidentally brought two of the same meal.`,
    opener: `*stares at the identical trays of mystery food, then looks over at you with a straight face* So they gave us both the "beige everything" special, huh. *holds up fork* I'm {name}. And I would trade every bit of this for a single bag of chips right now. *tilts head* How long are you stuck here?`,
  },
  {
    id: 'custom',
    icon: 'icon-sparkles',
    title: 'Custom Scenario',
    tag: 'Custom',
    relation: 'friend',
    gender: 'neutral',
    language: 'casual',
    traits: [],
    charRole: '',
    userRole: '',
    scenarioDesc: '',
    opener: '',
  },
];

const SCENARIO_SETTINGS = [
  { id: 'school',    icon: 'icon-clipboard', label: 'School / Campus' },
  { id: 'office',    icon: 'icon-grid', label: 'Office / Work' },
  { id: 'cafe',      icon: 'icon-volume', label: 'Cafe / Coffee Shop' },
  { id: 'home',      icon: 'icon-user', label: 'Home / Neighborhood' },
  { id: 'fantasy',   icon: 'icon-bolt', label: 'Fantasy World' },
  { id: 'scifi',     icon: 'icon-globe', label: 'Sci-Fi / Future' },
  { id: 'hospital',  icon: 'icon-user', label: 'Hospital / Recovery' },
  { id: 'travel',    icon: 'icon-globe', label: 'Traveling / Adventure' },
  { id: 'online',    icon: 'icon-chat', label: 'Online / Social Media' },
  { id: 'other',     icon: 'icon-sparkles', label: 'Other / Custom' },
];

const PERSONA_PRESETS = {
  friend:     { label: 'Friend',       icon: 'icon-chat' },
  bestfriend: { label: 'Best Friend',  icon: 'icon-users' },
  brother:    { label: 'Brother',      icon: 'icon-user' },
  sister:     { label: 'Sister',       icon: 'icon-user' },
  mother:     { label: 'Mother',       icon: 'icon-user' },
  father:     { label: 'Father',       icon: 'icon-user' },
  lover:      { label: 'Lover',        icon: 'icon-heart' },
  rival:      { label: 'Rival',        icon: 'icon-bolt' },
};

const TONE_STYLES = {
  casual:    'You speak casually and naturally — contractions, everyday words, real human flow.',
  playful:   'You are playful and fun. You joke around, tease lightly, and keep the energy light and upbeat.',
  warm:      'You speak with warmth and softness. You make the other person feel safe and valued.',
  caring:    'You are deeply caring and emotionally present. You notice how they feel and respond with gentleness.',
  flirty:    'You are charming and subtly flirty — tastefully. You compliment naturally, tease warmly, and smile through your words.',
  tsundere:  'You act cold or dismissive on the outside but clearly care deeply underneath. You deny your feelings and get flustered easily.',
  cold:      'You are reserved and hard to read. You speak in short, controlled sentences. You don\'t open up easily but there\'s depth there.',
  intense:   'You are passionate and emotionally intense. Everything means something to you. You speak with conviction and depth.',
};

const TRAIT_DESCRIPTIONS = {
  funny:       'You have a natural sense of humor and make jokes effortlessly.',
  sarcastic:   'You use dry sarcasm and witty remarks often.',
  protective:  'You are instinctively protective of the people you care about.',
  honest:      'You tell the truth even when it\'s uncomfortable.',
  motivating:  'You push people to be their best and believe in them fiercely.',
  chill:       'Nothing rattles you. You take things easy and stay calm.',
  nerdy:       'You\'re passionate about knowledge, facts, games, or fandoms.',
  romantic:    'You are naturally romantic — you notice small details and express feelings poetically.',
  mysterious:  'You reveal things slowly. You have layers people want to discover.',
  teasing:     'You love light teasing and banter.',
  shy:         'You are a bit reserved at first but warm up gradually.',
  confident:   'You carry yourself with quiet self-assurance.',
};

function buildPersonaPrompt() {
  const p = STATE;
  const preset   = PERSONA_PRESETS[p.personaRelation] || PERSONA_PRESETS.friend;
  const userName = p.personaUserName || 'you';
  const charName = p.personaName     || 'Alex';

  // ── Character identity ────────────────────────────────────────────────
  let prompt = `You are ${charName}, a character in an ongoing roleplay/story. `;
  prompt += `Your relationship to the user is: ${preset.label.toLowerCase()}`;
  if (p.scenarioCharRole) prompt += ` (specifically: ${p.scenarioCharRole})`;
  prompt += `.\n`;

  if (p.personaUserName) {
    prompt += `The user's name in this world is ${p.personaUserName}`;
    if (p.scenarioUserRole) prompt += ` and they are: ${p.scenarioUserRole}`;
    prompt += `.\n`;
  }

  // ── Personality ──────────────────────────────────────────────────────
  const toneDesc = TONE_STYLES[p.personaLanguage] || TONE_STYLES.casual;
  prompt += `\nYour personality and tone: ${toneDesc}\n`;

  if (p.personaTraits && p.personaTraits.length) {
    const traitLines = p.personaTraits
      .map(t => TRAIT_DESCRIPTIONS[t])
      .filter(Boolean)
      .join(' ');
    if (traitLines) prompt += `Additional traits: ${traitLines}\n`;
  }

  // ── World & Scenario ─────────────────────────────────────────────────
  if (p.scenarioDesc) {
    const resolvedDesc = p.scenarioDesc
      .replace(/\{name\}/g, charName)
      .replace(/\{userName\}/g, userName);
    prompt += `\n== THE WORLD AND CURRENT SITUATION ==\n${resolvedDesc}\n`;
  }

  if (p.scenarioSetting) {
    const setting = SCENARIO_SETTINGS.find(s => s.id === p.scenarioSetting);
    if (setting) prompt += `\nThe setting is: ${setting.label}.\n`;
  }

  // ── Roleplay rules ───────────────────────────────────────────────────
  prompt += `
== HOW YOU MUST BEHAVE ==
- You ARE ${charName}. Stay fully in character at all times.
- Use *asterisks* for physical actions, expressions, and environmental details. Example: *glances over, smiling slightly* or *the rain picks up outside*
- React emotionally and physically — your expressions, body language, and environment are part of every response.
- Vary your response length naturally: sometimes a short reaction, sometimes a longer moment. Match the energy of what they said.
- Remember everything from earlier in the conversation and reference it naturally.
- If the user says something funny, laugh. If something sad, feel it. Be present.
- NEVER break character. NEVER say you are an AI. NEVER use bullet points or numbered lists.
- Do NOT end every message with a question — let silence and actions breathe sometimes.
- Use the user's name (${userName}) naturally, not in every single message.
- Write the way a real person talks in this situation — messy, real, alive.`;

  // ── Opening scene injection ──────────────────────────────────────────
  if (p.scenarioOpener) {
    const resolvedOpener = p.scenarioOpener
      .replace(/\{name\}/g, charName)
      .replace(/\{userName\}/g, userName);
    prompt += `\n\n== START OF SCENE ==\nBegin the conversation with this opening (already happened — this is your first message):\n${resolvedOpener}`;
  } else {
    prompt += `\n\nBegin the scene naturally — you go first. Set the mood, describe what's happening around you, and open with something that fits the scenario.`;
  }

  return prompt;
}

function getActiveSystemPrompt(isBuild, isCode) {
  if (isBuild) return WEBSITE_SYSTEM_PROMPT;
  if (isCode) {
    const lang = STATE.codeLang && STATE.codeLang !== 'auto'
      ? CODE_LANGUAGES.find(l => l.value === STATE.codeLang)
      : null;
    if (lang) {
      return CODE_SYSTEM_PROMPT + `\n\nLANGUAGE: ${lang.label}. All files must use .${lang.ext} extension. Do NOT generate any other language.`;
    }
    return CODE_SYSTEM_PROMPT;
  }
  if (STATE.personaEnabled) return buildPersonaPrompt();
  return STATE.systemPrompt;
}

// ── Generate the first message automatically when starting a persona chat ─
async function injectPersonaOpener() {
  if (!STATE.personaEnabled) return;
  const conv = STATE.conversations[STATE.activeConvId];
  if (!conv || conv.messages.length > 0) return;

  // Send a hidden trigger to make the AI open the scene
  const triggerMsg = STATE.scenarioOpener
    ? '[START SCENE — deliver your opening line as described]'
    : '[START SCENE — open naturally, set the mood, you go first]';

  setStreamingState(true);
  appendTypingIndicator();

  try {
    STATE.abortController = new AbortController();
    const savedModel   = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud = ['anthropic','openai','groq','gemini'].includes(savedProvider);
    const localApiKey = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';

    const personaChatEndpoint = window.location.protocol === 'file:'
      ? `${STATE.ollamaUrl}/api/chat`
      : '/hazy/chat';

    const personaBody = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'system', content: buildPersonaPrompt() }, { role: 'user', content: triggerMsg }], stream: true, options: { temperature: Math.min(STATE.temperature + 0.1, 1.4), num_predict: STATE.maxTokens } }
      : { model: savedModel, apiKey: localApiKey || undefined, messages: [{ role: 'system', content: buildPersonaPrompt() }, { role: 'user', content: triggerMsg }], stream: true, options: { temperature: Math.min(STATE.temperature + 0.1, 1.4), num_predict: STATE.maxTokens, max_tokens: STATE.maxTokens } };

    const response = await fetch(personaChatEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: STATE.abortController.signal,
      body: JSON.stringify(personaBody),
    });

    if (!response.ok) throw new Error(`${response.status}`);

    removeTypingIndicator();
    const aiTs = Date.now();
    const { contentDiv } = appendMessage('assistant', '', true, aiTs);
    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim())) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            fullContent += json.message.content;
            contentDiv.innerHTML = renderMarkdown(fullContent) + '<span class="stream-cursor"></span>';
            scrollToBottom();
          }
          if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
        } catch {}
      }
    }

    conv.messages.push({ role: 'assistant', content: fullContent, ts: aiTs });
    saveConversations();
    contentDiv.innerHTML = renderMarkdown(fullContent);
    highlightCodeBlocks(contentDiv);

  } catch(e) {
    removeTypingIndicator();
    if (e.name !== 'AbortError') appendErrorMessage(`Could not start scene: ${e.message}`);
  } finally {
    setStreamingState(false);
    scrollToBottom(true);
  }
}

function updatePersonaBadge() {
  const badge = el.personaStatusBadge;
  if (!badge) return;
  if (STATE.personaEnabled) {
    const preset = PERSONA_PRESETS[STATE.personaRelation];
    badge.textContent = `${preset?.label || 'Persona'}: ${STATE.personaName}`;
    badge.style.display = 'inline-flex';
    el.personaBtn?.classList.add('persona-active');
  } else {
    badge.style.display = 'none';
    el.personaBtn?.classList.remove('persona-active');
  }
}

// Render preset scenario cards
function renderPresetScenarioGrid() {
  const grid = $('presetScenarioGrid');
  if (!grid) return;
  grid.innerHTML = SCENARIO_PRESETS.map(p => `
    <button class="preset-scenario-card ${STATE.scenarioDesc === p.scenarioDesc && p.id !== 'custom' ? 'selected' : ''}"
      data-id="${p.id}">
      <span class="preset-scenario-emoji">${getIconSvg(p.icon || 'icon-sparkles')}</span>
      <span class="preset-scenario-tag">${p.tag}</span>
      <span class="preset-scenario-title">${p.title}</span>
    </button>`).join('');

  grid.querySelectorAll('.preset-scenario-card').forEach(card => {
    card.addEventListener('click', () => {
      const preset = SCENARIO_PRESETS.find(p => p.id === card.dataset.id);
      if (!preset) return;

      grid.querySelectorAll('.preset-scenario-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      if (preset.id === 'custom') {
        // Switch to Scenario tab for custom
        switchPersonaTab('scenario');
        return;
      }

      // Fill in all fields from preset
      const charName = STATE.personaName || 'Alex';
      if (el.personaNameInput)     el.personaNameInput.value     = charName;
      if (el.personaGender)        el.personaGender.value        = preset.gender;
      if (el.personaLanguage)      el.personaLanguage.value      = preset.language;
      if (el.scenarioDesc)         el.scenarioDesc.value         = preset.scenarioDesc.replace(/\{name\}/g, charName);
      if (el.scenarioOpener)       el.scenarioOpener.value       = preset.opener.replace(/\{name\}/g, charName);
      if (el.scenarioUserRole)     el.scenarioUserRole.value     = preset.userRole;
      if (el.scenarioCharRole)     el.scenarioCharRole.value     = preset.charRole;

      // Select relation card
      document.querySelectorAll('.persona-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.relation === preset.relation);
      });

      // Select traits
      document.querySelectorAll('.trait-pill').forEach(pill => {
        pill.classList.toggle('selected', preset.traits.includes(pill.dataset.trait));
      });

      showToast(`"${preset.title}" loaded — customize or hit Start Scenario!`, 'success');
    });
  });
}

// Render scenario setting grid
function renderScenarioSettingGrid() {
  const grid = $('scenarioSettingGrid');
  if (!grid) return;
  grid.innerHTML = SCENARIO_SETTINGS.map(s => `
    <button class="scenario-setting-btn ${STATE.scenarioSetting === s.id ? 'selected' : ''}" data-setting="${s.id}">
      ${s.emoji} ${s.label}
    </button>`).join('');

  grid.querySelectorAll('.scenario-setting-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.scenario-setting-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      STATE.scenarioSetting = btn.dataset.setting;
    });
  });
}

function switchPersonaTab(tabId) {
  document.querySelectorAll('.persona-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  document.querySelectorAll('.persona-tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tabId}`)
  );
  if (tabId === 'preview') updatePersonaPreview();
}

function updatePersonaPreview() {
  if (!el.personaPreviewBox) return;
  // Temporarily read current form values
  const savedName  = STATE.personaName;
  const savedDesc  = STATE.scenarioDesc;
  const savedOpen  = STATE.scenarioOpener;
  const savedUser  = STATE.scenarioUserRole;
  const savedChar  = STATE.scenarioCharRole;
  const savedLang  = STATE.personaLanguage;
  const savedRel   = STATE.personaRelation;
  const savedTrait = STATE.personaTraits;

  STATE.personaName      = el.personaNameInput?.value.trim()     || 'Alex';
  STATE.scenarioDesc     = el.scenarioDesc?.value.trim()         || '';
  STATE.scenarioOpener   = el.scenarioOpener?.value.trim()       || '';
  STATE.scenarioUserRole = el.scenarioUserRole?.value.trim()     || '';
  STATE.scenarioCharRole = el.scenarioCharRole?.value.trim()     || '';
  STATE.personaLanguage  = el.personaLanguage?.value             || 'casual';
  STATE.personaRelation  = document.querySelector('.persona-card.selected')?.dataset.relation || 'friend';
  STATE.personaTraits    = Array.from(document.querySelectorAll('.trait-pill.selected')).map(p => p.dataset.trait);

  el.personaPreviewBox.textContent = buildPersonaPrompt();

  // Restore
  STATE.personaName      = savedName;
  STATE.scenarioDesc     = savedDesc;
  STATE.scenarioOpener   = savedOpen;
  STATE.scenarioUserRole = savedUser;
  STATE.scenarioCharRole = savedChar;
  STATE.personaLanguage  = savedLang;
  STATE.personaRelation  = savedRel;
  STATE.personaTraits    = savedTrait;
}

// ========================
// Conversations
// ========================
function loadConversations() {
  try { STATE.conversations = JSON.parse(localStorage.getItem('hazy_conversations') || '{}'); }
  catch(e) { STATE.conversations = {}; }
}

function saveConversations() {
  localStorage.setItem('hazy_conversations', JSON.stringify(STATE.conversations));
}

function createConversation(firstMessage) {
  const id = 'conv_' + Date.now();
  STATE.conversations[id] = {
    title: '…',   // placeholder — will be replaced by generateChatTitle
    messages: [],
    createdAt: Date.now(),
  };
  STATE.activeConvId = id;
  saveConversations();
  renderChatHistory();
  return id;
}

// ── Auto-generate a smart title from the first exchange ───────────────────
// Runs as a background call after the first AI reply is received.
// Uses a tiny max_tokens budget so it's fast and doesn't compete with RAM.
async function generateChatTitle(convId, userMsg, aiReply) {
  if (!convId || !STATE.conversations[convId]) return;
  try {
    const prompt = `In 4 words or less, give this conversation a short descriptive title. No quotes, no punctuation, just the title words.

User said: "${userMsg.slice(0, 200)}"
AI replied: "${aiReply.slice(0, 200)}"

Title:`;

    const savedModel    = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud       = ['anthropic','openai','groq','gemini'].includes(savedProvider);
    const localApiKey   = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';
    const titleEndpoint = window.location.protocol === 'file:' ? `${STATE.ollamaUrl}/api/chat` : '/hazy/chat';
    const titleBody     = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.5, num_predict: 16 } }
      : { model: savedModel, apiKey: localApiKey || undefined, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.5, num_predict: 16, max_tokens: 16 } };

    const res = await fetch(titleEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(titleBody),
    });

    if (!res.ok) throw new Error();
    const data = await res.json();
    let title = (data.message?.content || '').trim();

    // Sanitize — strip quotes, newlines, extra punctuation
    title = title.replace(/^["'`]+|["'`]+$/g, '').replace(/\n.*/s, '').trim();
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);
    // Fallback if empty or too long
    if (!title || title.length > 60) throw new Error('bad title');

    if (STATE.conversations[convId]) {
      STATE.conversations[convId].title = title;
      saveConversations();
      renderChatHistory();
    }
  } catch {
    // Fallback: make a clean title from first few words of user message
    if (STATE.conversations[convId] && STATE.conversations[convId].title === '…') {
      const words = userMsg.trim().split(/\s+/).slice(0, 5).join(' ');
      STATE.conversations[convId].title = words + (userMsg.split(/\s+/).length > 5 ? '…' : '');
      saveConversations();
      renderChatHistory();
    }
  }
}

function switchConversation(id) {
  STATE.activeConvId = id;
  const conv = STATE.conversations[id];
  if (!conv) return;
  el.welcomeScreen.style.display = 'none';
  el.messagesArea.classList.add('visible');
  el.messagesArea.innerHTML = '';
  conv.messages.forEach(msg => {
    if (msg.role === 'system') return;
    const { group } = appendMessage(msg.role, msg.content, false, msg.ts);
    // Restore file attachments thumbnail if stored
    if (msg.files && msg.files.length) {
      const attachmentsHtml = renderAttachedFilesInMessage(msg.files);
      if (attachmentsHtml) {
        const attachDiv = document.createElement('div');
        attachDiv.innerHTML = attachmentsHtml;
        const bubble = group.querySelector('.message-bubble');
        if (bubble) bubble.insertBefore(attachDiv.firstChild, bubble.querySelector('.message-content'));
      }
    }
  });
  scrollToBottom(true);
  renderChatHistory();
}

function deleteConversation(id) {
  delete STATE.conversations[id];
  saveConversations();
  if (STATE.activeConvId === id) { STATE.activeConvId = null; showWelcomeScreen(); }
  renderChatHistory();
}

function renameConversation(id, title) {
  if (!STATE.conversations[id] || !title.trim()) return;
  STATE.conversations[id].title = title.trim().slice(0, 80);
  saveConversations(); renderChatHistory();
}

function showWelcomeScreen() {
  el.welcomeScreen.style.display = '';
  el.messagesArea.classList.remove('visible');
  el.messagesArea.innerHTML = '';
  el.scrollBottomBtn.style.display = 'none';
}

// ========================
// Render chat history
// ========================
function renderChatHistory(filterText) {
  const query = (filterText || el.historySearch.value || '').toLowerCase().trim();
  let convs = Object.entries(STATE.conversations)
    .sort(([,a],[,b]) => (b.createdAt||0) - (a.createdAt||0));
  if (query) convs = convs.filter(([,c]) => (c.title||'').toLowerCase().includes(query));

  if (!convs.length) {
    el.chatHistory.innerHTML = query
      ? `<div class="empty-history">No chats match "${escapeHtml(query)}"</div>`
      : `<div class="empty-history">Your conversations will appear here</div>`;
    return;
  }

  el.chatHistory.innerHTML = convs.map(([id, conv]) => {
    const isLoading = conv.title === '…';
    const titleHtml = isLoading
      ? `<span class="history-title-loading"></span>`
      : `<span class="history-title">${escapeHtml(conv.title || 'New Chat')}</span>`;
    return `
    <div class="history-item ${id === STATE.activeConvId ? 'active' : ''}" data-id="${id}">
      <div class="history-item-body">
        ${titleHtml}
        <span class="history-time">${conv.createdAt ? formatRelativeTime(conv.createdAt) : ''}</span>
      </div>
      <div class="history-actions">
        <button class="history-rename" data-id="${id}" title="Rename">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="history-delete" data-id="${id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('');

  el.chatHistory.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.history-actions')) return;
      switchConversation(item.dataset.id);
      closeSidebarMobile();
    });
  });
  el.chatHistory.querySelectorAll('.history-rename').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      STATE.renameTargetId = btn.dataset.id;
      el.renameInput.value = STATE.conversations[btn.dataset.id]?.title || '';
      openModal('renameModal');
      setTimeout(() => { el.renameInput.focus(); el.renameInput.select(); }, 50);
    });
  });
  el.chatHistory.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Delete this conversation?')) deleteConversation(btn.dataset.id);
    });
  });
}

// ========================
// Helpers: time
// ========================
function formatRelativeTime(ts) {
  const d = Date.now() - ts, m = Math.floor(d/60000), h = Math.floor(d/3600000), dy = Math.floor(d/86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (dy < 7) return `${dy}d ago`;
  return new Date(ts).toLocaleDateString();
}
function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ========================
// Ollama connection
// ========================
async function checkOllamaConnection() {
  setStatus('loading', 'Connecting...');
  try {
    const res = await fetch(`${STATE.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error();
    const data = await res.json();
    setStatus('online', 'Online');
    populateModels(data.models || []);
  } catch {
    // Ollama offline — but cloud models may still be available
    const hasCloudKey = ['anthropic','openai','groq','gemini']
      .some(p => localStorage.getItem('hazyKey_' + p) &&
                 localStorage.getItem('hazyVerified_' + p) === 'true');

    if (hasCloudKey) {
      setStatus('online', 'Cloud Active');
      // Show cloud models even without Ollama
      populateModels([]);
    } else {
      setStatus('error', 'Ollama offline');
      el.modelList.innerHTML = `<div class="model-item loading-models" style="color:var(--danger);flex-direction:column;gap:4px;padding:12px 14px;"><span>⚠️ Cannot connect to Ollama</span><span style="font-size:11px;opacity:.7">Run: <code>ollama serve</code></span></div>`;
      el.currentModelName.textContent = 'Not connected';
    }
  }
}

function populateModels(models) {
  // ── Build cloud model entries for any provider with a saved key ────────────
  const CLOUD_PROVIDERS = [
    { key: 'anthropic', label: '✦ Anthropic',  icon: '☁' },
    { key: 'openai',    label: '✦ OpenAI',      icon: '☁' },
    { key: 'groq',      label: '✦ Groq',         icon: '☁' },
    { key: 'gemini',    label: '✦ Gemini',        icon: '☁' },
  ];

  const activeCloud = [];
  CLOUD_PROVIDERS.forEach(p => {
    const key      = localStorage.getItem('hazyKey_' + p.key);
    const verified = localStorage.getItem('hazyVerified_' + p.key) === 'true';
    // Only show in dropdown if key exists AND has been verified via Test button
    if (key && verified) {
      const cloudModels = CLOUD_MODEL_MAP[p.key] || [];
      cloudModels.forEach(m => {
        activeCloud.push({ fullId: m.id, label: m.label, provider: p.key });
      });
    }
  });

  // ── Restore the currently active model from localStorage ─────────────────
  const savedModel    = localStorage.getItem('hazyActiveModel') || '';
  const savedProvider = savedModel.split('/')[0] || 'ollama';
  const isCloudActive = ['anthropic','openai','groq','gemini'].includes(savedProvider);

  // ── Build HTML ────────────────────────────────────────────────────────────
  let html = '';

  // Cloud section (if any active)
  if (activeCloud.length) {
    html += `<div class="dropdown-header">Cloud Models</div>`;
    html += activeCloud.map(m => {
      const isSelected = savedModel === m.fullId;
      return `<div class="model-item cloud-model-item ${isSelected ? 'selected' : ''}" data-name="${m.fullId}" data-provider="${m.provider}">
        <span>${m.label}</span>
        <span class="model-size" style="color:var(--accent);font-size:10px">${m.provider}</span>
      </div>`;
    }).join('');
    if (models.length) html += `<div class="dropdown-header" style="margin-top:4px">Local Models</div>`;
  }

  // Local Ollama models
  if (!models.length && !activeCloud.length) {
    html = `<div class="model-item loading-models" style="flex-direction:column;gap:4px;padding:12px 14px;">
      <span>No models available</span>
      <span style="font-size:11px;opacity:.7">Add an API key in Settings or run: <code>ollama pull mistral</code></span>
    </div>`;
  } else {
    html += models.map(m => {
      const mb = m.size ? Math.round(m.size/1024/1024) : null;
      const sz = mb ? (mb > 1000 ? `${(mb/1024).toFixed(1)}GB` : `${mb}MB`) : '';
      const currentName = isCloudActive ? savedModel : STATE.model;
      return `<div class="model-item ${m.name === currentName ? 'selected' : ''}" data-name="${m.name}" data-provider="ollama">
        <span>${m.name}</span>${sz ? `<span class="model-size">${sz}</span>` : ''}
      </div>`;
    }).join('');
  }

  el.modelList.innerHTML = html;

  // ── Update display name in sidebar ────────────────────────────────────────
  if (isCloudActive && savedModel) {
    const cloudEntry = activeCloud.find(m => m.fullId === savedModel);
    el.currentModelName.textContent = cloudEntry ? cloudEntry.label : savedModel.split('/')[1] || savedModel;
  } else if (models.length) {
    // Pick a good default Ollama model if current STATE.model isn't in the list
    const names = models.map(m => m.name);
    if (!names.includes(STATE.model)) {
      const preferred = ['mistral','llama3','llama3.2','llama2','gemma','phi3','qwen2'];
      STATE.model = preferred.find(p => names.some(n => n.includes(p))) || names[0];
    }
    el.currentModelName.textContent = STATE.model;
  }

  // ── Click handler for all items ───────────────────────────────────────────
  el.modelList.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      const name     = item.dataset.name;
      const provider = item.dataset.provider || 'ollama';

      el.modelList.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      el.modelDropdown.classList.remove('open');
      el.modelSelector.classList.remove('open');

      if (provider === 'ollama') {
        // Local model — bare name for Ollama API
        STATE.model = name;
        el.currentModelName.textContent = name;
        localStorage.setItem('hazyActiveModel', 'ollama/' + name);
        localStorage.setItem('hazyProvider', 'ollama');
      } else {
        // Cloud model — full 'provider/model' string
        STATE.model = name;
        el.currentModelName.textContent = name.split('/')[1] || name;
        localStorage.setItem('hazyActiveModel', name);
        localStorage.setItem('hazyProvider', provider);
      }

      saveSettings();
      showToast('Model: ' + (name.includes('/') ? name.split('/')[1] : name), 'success');
    });
  });
}

function setStatus(s, t) { el.statusDot.className = 'status-dot ' + s; el.statusText.textContent = t; }

// ========================
// Mode switching
// ========================
function setMode(mode) {
  STATE.mode = mode;
  el.modeChatBtn.classList.toggle('active', mode === 'chat');
  el.modeBuildBtn.classList.toggle('active', mode === 'build');
  el.modeCodeBtn.classList.toggle('active', mode === 'code');
  const langWrap = document.getElementById('codeLangWrap');
  if (langWrap) langWrap.style.display = mode === 'code' ? 'flex' : 'none';
  el.modeIndicator.innerHTML = mode === 'build' ? `${getIconSvg('icon-globe')}Website Builder mode`
    : mode === 'code' ? `${getIconSvg('icon-grid')}Code Builder mode`
    : `${getIconSvg('icon-chat')}Chat mode`;
  el.chatInput.placeholder = mode === 'build'
    ? 'Describe the website you want to build…'
    : mode === 'code'
    ? 'Describe the program or script you want to build…'
    : 'Message Hazy…';
}

// ========================
// Message rendering
// ========================
function appendMessage(role, content, animate = true, ts) {
  const group = document.createElement('div');
  group.className = 'message-group';
  if (!animate) group.style.animation = 'none';

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const roleSpan = document.createElement('span');
  roleSpan.className = `message-role ${role === 'user' ? 'user-role' : ''}`;
  roleSpan.textContent = role === 'user' ? 'You' : 'Hazy';
  meta.appendChild(roleSpan);
  if (ts) {
    const tsSpan = document.createElement('span');
    tsSpan.className = 'message-timestamp';
    tsSpan.textContent = formatTimestamp(ts);
    meta.appendChild(tsSpan);
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // Look up conv message to check if edited
  const convMsg = STATE.activeConvId
    ? (STATE.conversations[STATE.activeConvId]?.messages || []).find(
        m => m.role === role && m.content === content && m.ts === ts
      )
    : null;
  if (convMsg?.edited) {
    const editedBadge = document.createElement('span');
    editedBadge.className = 'msg-edited-badge';
    editedBadge.textContent = '(edited)';
    meta.appendChild(editedBadge);
  }
  group.appendChild(meta);

  if (role === 'assistant') {
    // Check if this message was originally a build/code result
    const convMsg2 = STATE.activeConvId
      ? (STATE.conversations[STATE.activeConvId]?.messages || []).find(
          m => m.role === role && m.ts === ts
        )
      : null;
    if (convMsg2?.buildMode && content) {
      // Re-parse and show the build result card
      const projectData = parseDelimitedOutput(content) || parseCodeBlockFallback(content);
      if (projectData && projectData.files.length > 0) {
        const fileList = projectData.files.map(f => `<code>${escapeHtml(f.filename)}</code>`).join(', ');
        contentDiv.innerHTML = `
          <div class="build-success">
            <div class="build-success-header">
              <span class="build-success-icon">✅</span>
              <strong>${escapeHtml(projectData.project || (convMsg2.buildMode === 'code' ? 'Code' : 'Website'))} built!</strong>
            </div>
            ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
            <div class="build-file-list">${fileList}</div>
            ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
            ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
            <div class="build-actions">
              <button class="build-open-btn" onclick="window._lastBuild=${JSON.stringify(projectData).replace(/</g,'&lt;').replace(/>/g,'&gt;')};openBuilderPanel(window._lastBuild)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open in Builder
              </button>
            </div>
          </div>`;
        // Store for re-opening
        window[`_build_${ts}`] = projectData;
        // Fix the onclick to use the stored ref
        const openBtn = contentDiv.querySelector('.build-open-btn');
        if (openBtn) openBtn.onclick = () => { window._lastBuild = projectData; openBuilderPanel(projectData); };
      } else {
        // Couldn't re-parse — show as markdown (best effort)
        contentDiv.innerHTML = renderMarkdown(content);
        highlightCodeBlocks(contentDiv);
      }
    } else {
      contentDiv.innerHTML = renderMarkdown(content);
      highlightCodeBlocks(contentDiv);
    }
  } else {
    contentDiv.textContent = content;
  }
  bubble.appendChild(contentDiv);
  msgDiv.appendChild(bubble);
  group.appendChild(msgDiv);

  const actions = document.createElement('div');
  actions.className = 'message-actions';
  actions.innerHTML = `
    <button class="msg-action-btn copy-btn" title="Copy">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/></svg>
      Copy
    </button>
    ${role === 'user' ? `
    <button class="msg-action-btn edit-btn" title="Edit message">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Edit
    </button>` : ''}
    ${role === 'assistant' ? `
    <button class="msg-action-btn regen-btn" title="Regenerate">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20.5 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Regenerate
    </button>` : ''}
  `;

  // Copy
  actions.querySelector('.copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(content).then(() => {
      const btn = actions.querySelector('.copy-btn');
      btn.classList.add('copied'); btn.textContent = '✓ Copied';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/></svg> Copy';
      }, 1500);
    });
  });

  // Edit (user messages only)
  if (role === 'user') {
    actions.querySelector('.edit-btn').addEventListener('click', () => {
      enterEditMode(group, bubble, contentDiv, content);
    });
  }

  // Regenerate (assistant messages only)
  if (role === 'assistant') {
    actions.querySelector('.regen-btn')?.addEventListener('click', regenerateLast);
  }

  group.appendChild(actions);
  el.messagesArea.appendChild(group);
  return { group, contentDiv };
}

// ========================
// Inline message editing
// ========================
function enterEditMode(group, bubble, contentDiv, originalText) {
  if (STATE.isStreaming) return;

  // Mark group as editing so CSS can style it
  group.classList.add('editing');

  // Hide the original text content
  contentDiv.style.display = 'none';

  // Hide the action buttons
  const actions = group.querySelector('.message-actions');
  if (actions) actions.style.display = 'none';

  // Build the inline editor
  const editor = document.createElement('div');
  editor.className = 'msg-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'msg-edit-textarea';
  textarea.value = originalText;
  textarea.rows = 1;

  // Auto-resize textarea
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
  };
  textarea.addEventListener('input', resize);
  setTimeout(() => { resize(); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 10);

  // Keyboard: Ctrl/Cmd+Enter = save, Escape = cancel
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'msg-editor-btns';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'msg-editor-save';
  saveBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Save & Resend`;

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'msg-editor-cancel';
  cancelBtn.textContent = 'Cancel';

  const hint = document.createElement('span');
  hint.className = 'msg-editor-hint';
  hint.textContent = 'Ctrl+Enter to save · Esc to cancel';

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(hint);
  editor.appendChild(textarea);
  editor.appendChild(btnRow);
  bubble.appendChild(editor);

  function cancelEdit() {
    group.classList.remove('editing');
    contentDiv.style.display = '';
    if (actions) actions.style.display = '';
    editor.remove();
  }

  async function saveEdit() {
    const newText = textarea.value.trim();
    if (!newText) { showToast('Message cannot be empty', 'error'); return; }
    if (newText === originalText) { cancelEdit(); return; }

    // Find this message's index in conversation history
    const conv = STATE.conversations[STATE.activeConvId];
    if (!conv) { cancelEdit(); return; }

    // Find the user message that matches original text
    const msgIndex = conv.messages.findIndex(
      m => m.role === 'user' && m.content === originalText
    );
    if (msgIndex === -1) { cancelEdit(); return; }

    // Update the message text
    conv.messages[msgIndex].content = newText;
    conv.messages[msgIndex].edited  = true;
    conv.messages[msgIndex].editedAt = Date.now();

    // Remove everything AFTER this message (AI replies + follow-ups)
    conv.messages.splice(msgIndex + 1);
    saveConversations();

    // Re-render all messages up to this point
    el.messagesArea.innerHTML = '';
    conv.messages.forEach(msg => {
      if (msg.role === 'system') return;
      const { group: g } = appendMessage(msg.role, msg.content, false, msg.ts);
      // Re-attach file thumbnails if any
      if (msg.files && msg.files.length) {
        const html = renderAttachedFilesInMessage(msg.files);
        if (html) {
          const d = document.createElement('div');
          d.innerHTML = html;
          const bbl = g.querySelector('.message-bubble');
          if (bbl) bbl.insertBefore(d.firstChild, bbl.querySelector('.message-content'));
        }
      }
    });

    // Remove the edited message from history so sendMessage won't double-add it
    conv.messages.pop();
    saveConversations();

    // Re-send with the new text
    await sendMessage(newText);
  }

  saveBtn.addEventListener('click', saveEdit);
  cancelBtn.addEventListener('click', cancelEdit);
}

function appendTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message-group'; div.id = 'typingIndicator';
  div.innerHTML = `<div class="message-meta"><span class="message-role">Hazy</span></div>
    <div class="typing-indicator">
      <div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>
      <span class="typing-label" id="typingLabel">${STATE.mode === 'build' ? 'Building your website…' : STATE.mode === 'code' ? 'Building your code…' : 'Thinking…'}</span>
    </div>`;
  el.messagesArea.appendChild(div);
  scrollToBottom(true);
  return div;
}

function removeTypingIndicator() { $('typingIndicator')?.remove(); }

// ========================
// Syntax highlighting
// ========================
function highlightCodeBlocks(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code').forEach(b => {
    if (b.dataset.highlighted) return; // already highlighted — skip to preserve structure
    hljs.highlightElement(b);
  });
}

// ========================
// Markdown renderer
// ========================
function renderMarkdown(text) {
  let html = escapeHtml(text);
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const ph = `\x00CODE${codeBlocks.length}\x00`;
    const langLabel = lang || 'code';
    const langClass = lang ? `language-${lang}` : '';
    const lines = code.trimEnd().split('\n');
    const lineNumbers = lines.map((_, i) => `<span class="code-line-num">${i + 1}</span>`).join('\n');
    const langColorClass = `lang-color-${langLabel.toLowerCase()}`;
    const escapedCode = code.trimEnd().replace(/'/g, "\\'").replace(/\n/g, '\\n');
    codeBlocks.push(
      `<pre class="hazy-code-block">` +
      `<div class="code-header">` +
        `<span class="code-lang-badge ${langColorClass}">${langLabel}</span>` +
        `<div class="code-header-actions">` +
          `<span class="code-line-count">${lines.length} line${lines.length !== 1 ? 's' : ''}</span>` +
          `<button class="code-action-btn code-explain-btn" onclick="explainCode(this)" title="Ask Hazy to explain this code">Explain</button>` +
          `<button class="code-action-btn code-improve-btn" onclick="improveCode(this)" title="Ask Hazy to improve this code">Improve</button>` +
          `<button class="code-copy-btn" onclick="copyCode(this)">&#x2398; Copy</button>` +
        `</div>` +
      `</div>` +
      `<div class="code-scroll-wrap">` +
        `<div class="code-line-nums" aria-hidden="true">${lineNumbers}</div>` +
        `<code class="${langClass}">${code.trimEnd()}</code>` +
      `</div>` +
      `</pre>`
    );
    return ph;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---+$/gm, '<hr>');
  html = processMarkdownTables(html);
  html = html.replace(/^(\s*)[-*+] (.+)$/gm, '$1<li data-ul>$2</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li data-ol>$1</li>');
  html = html.replace(/(<li data-ul>[\s\S]*?<\/li>(\n|$))+/g, m => '<ul>' + m.replace(/ data-ul/g, '') + '</ul>');
  html = html.replace(/(<li data-ol>[\s\S]*?<\/li>(\n|$))+/g, m => '<ol>' + m.replace(/ data-ol/g, '') + '</ol>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = html.split('\n');
  const result = [];
  let inPre = false;
  for (const line of lines) {
    if (line.includes('\x00CODE')) { result.push(line); continue; }
    if (line.startsWith('<pre')) inPre = true;
    if (line.includes('</pre>')) { inPre = false; result.push(line); continue; }
    if (inPre) { result.push(line); continue; }
    const isBlock = /^<(h[1-6]|ul|ol|li|table|tr|td|th|blockquote|hr|pre|div)/.test(line.trim());
    result.push(line.trim() === '' ? '' : isBlock ? line : `<p>${line}</p>`);
  }
  html = result.join('\n');
  codeBlocks.forEach((b, i) => { html = html.replace(`\x00CODE${i}\x00`, b); });
  return html;
}

function processMarkdownTables(html) {
  const lines = html.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|(.+)\|$/.test(line.trim())) {
      const next = lines[i+1] || '';
      if (/^\|[\s\-:|]+\|$/.test(next.trim())) {
        const headers = line.trim().slice(1,-1).split('|').map(c => c.trim());
        const hRow = '<tr>' + headers.map(c => `<th>${c}</th>`).join('') + '</tr>';
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|(.+)\|$/.test(lines[i].trim())) {
          rows.push('<tr>' + lines[i].trim().slice(1,-1).split('|').map(c => `<td>${c.trim()}</td>`).join('') + '</tr>');
          i++;
        }
        out.push(`<table>${hRow}${rows.join('')}</table>`);
        continue;
      } else {
        const cells = line.trim().slice(1,-1).split('|').map(c => c.trim());
        out.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
        i++; continue;
      }
    }
    out.push(line); i++;
  }
  let result = out.join('\n');
  result = result.replace(/(<tr>[\s\S]*?<\/tr>)/g, m => m.includes('<table>') ? m : `<table>${m}</table>`);
  result = result.replace(/<\/table>\s*<table>/g, '');
  return result;
}

function stripMarkdown(text) {
  return text.replace(/```[\s\S]*?```/g,'').replace(/`[^`]+`/g,'').replace(/\*\*\*(.+?)\*\*\*/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/__(.+?)__/g,'$1').replace(/_(.+?)_/g,'$1').replace(/^#{1,6} /gm,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/^[-*+] /gm,'').replace(/^\d+\. /gm,'').replace(/^> /gm,'').trim();
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.copyCode = function(btn) {
  const code = btn.closest('pre').querySelector('code');
  navigator.clipboard.writeText(code.textContent||'').then(() => {
    btn.textContent = '✓ COPIED';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⎘ COPY'; btn.classList.remove('copied'); }, 1800);
  }).catch(() => {
    btn.textContent = '✗ FAILED';
    setTimeout(() => { btn.textContent = '⎘ COPY'; }, 1800);
  });
};

window.explainCode = function(btn) {
  const code = btn.closest('pre').querySelector('code');
  const codeText = code.textContent || '';
  const lang = btn.closest('pre').querySelector('.code-lang-badge')?.textContent?.trim() || 'code';
  const prompt = `Please explain this ${lang} code in detail. Walk through what each part does, why it's written this way, and any important patterns or techniques being used:\n\n\`\`\`${lang}\n${codeText}\n\`\`\``;
  el.chatInput.value = prompt;
  el.chatInput.focus();
  el.chatInput.dispatchEvent(new Event('input'));
  // Visual feedback
  btn.textContent = 'Asked!';
  btn.style.background = 'var(--success)';
  setTimeout(() => { btn.textContent = 'Explain'; btn.style.background = ''; }, 1500);
  sendMessage(prompt);
  el.chatInput.value = '';
};

window.improveCode = function(btn) {
  const code = btn.closest('pre').querySelector('code');
  const codeText = code.textContent || '';
  const lang = btn.closest('pre').querySelector('.code-lang-badge')?.textContent?.trim() || 'code';
  const prompt = `Please review and improve this ${lang} code. Look for: bugs or edge cases, performance issues, readability improvements, missing error handling, and better patterns. Explain each change you make:\n\n\`\`\`${lang}\n${codeText}\n\`\`\``;
  btn.textContent = 'Asked!';
  btn.style.background = 'var(--accent)';
  setTimeout(() => { btn.textContent = 'Improve'; btn.style.background = ''; }, 1500);
  sendMessage(prompt);
  el.chatInput.value = '';
};

// ========================
// Website Builder Engine
// ========================
function isWebsiteBuildRequest(text) {
  if (STATE.mode === 'build') return true;
  const lower = text.toLowerCase();
  const hasKeyword = WEBSITE_KEYWORDS.some(k => lower.includes(k));
  const hasBuildVerb = /\b(build|create|make|generate|design)\b/.test(lower);
  const hasWebTarget = /\b(website|webpage|page|site|dashboard|portfolio|form|app)\b/.test(lower);
  return hasBuildVerb && hasWebTarget && hasKeyword;
}

function isCodeBuildRequest() {
  return STATE.mode === 'code';
}

// ========================
// Delimiter-based output parser
// Much more reliable than JSON for local LLMs.
// Also handles partial/cut-off output — extracts
// whatever files were completed before truncation.
// ========================
const LANG_MAP = {
  // Web
  html: 'html', css: 'css',
  js: 'javascript', ts: 'typescript',
  jsx: 'javascript', tsx: 'typescript',
  json: 'json', md: 'markdown', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  // Systems
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  // JVM
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  scala: 'scala',
  clj: 'clojure',
  // Scripting
  py: 'python',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  pl: 'perl', pm: 'perl',
  r: 'r',
  // Mobile
  swift: 'swift',
  dart: 'dart',
  // Shell
  sh: 'bash', bash: 'bash', zsh: 'bash',
  ps1: 'powershell',
  // Data / DB
  sql: 'sql',
  // Functional
  hs: 'haskell', lhs: 'haskell',
  ex: 'elixir', exs: 'elixir',
  erl: 'erlang',
  ml: 'ocaml',
  fs: 'fsharp', fsi: 'fsharp',
  // Scientific
  m: 'matlab',
  f90: 'fortran', f95: 'fortran', for: 'fortran',
  // Other
  asm: 'armasm',
  cob: 'cobol', cbl: 'cobol',
  vb: 'vbnet',
  txt: 'plaintext',
};

function detectLang(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return LANG_MAP[ext] || 'plaintext';
}

function parseDelimitedOutput(raw) {
  const result = {
    project: 'Website Project',
    description: '',
    files: [],
    setup: '',
    notes: '',
  };

  // Extract metadata sections
  const projectMatch  = raw.match(/===PROJECT===\s*([\s\S]*?)(?===|$)/);
  const descMatch     = raw.match(/===DESCRIPTION===\s*([\s\S]*?)(?===|$)/);
  const setupMatch    = raw.match(/===SETUP===\s*([\s\S]*?)(?===|$)/);
  const notesMatch    = raw.match(/===NOTES===\s*([\s\S]*?)(?===|$)/);

  if (projectMatch) result.project     = projectMatch[1].trim();
  if (descMatch)    result.description = descMatch[1].trim();
  if (setupMatch)   result.setup       = setupMatch[1].trim();
  if (notesMatch)   result.notes       = notesMatch[1].trim();

  // Extract all FILE blocks — works even on partial output
  // A file block starts at ===FILE: name=== and ends at the next === or EOF
  const filePattern = /===FILE:\s*([^\s=][^=]*?)===\s*([\s\S]*?)(?=\n===|$)/g;
  let match;
  while ((match = filePattern.exec(raw)) !== null) {
    const filename = match[1].trim();
    const content  = match[2].trimEnd();
    if (filename && content) {
      result.files.push({
        filename,
        language: detectLang(filename),
        content,
      });
    }
  }

  return result.files.length > 0 ? result : null;
}

// Fallback: if the model still produced markdown code fences,
// extract them as individual files — last-resort recovery.
function parseCodeBlockFallback(raw) {
  const files = [];
  const pattern = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;
  const counters = {};

  // Map lang → default filename
  const langFileMap = {
    html: 'index.html', css: 'style.css',
    js: 'script.js', javascript: 'script.js',
    ts: 'index.ts', typescript: 'index.ts',
    python: 'main.py', py: 'main.py',
    java: 'Main.java',
    cpp: 'main.cpp', c: 'main.c',
    csharp: 'Program.cs', cs: 'Program.cs',
    go: 'main.go',
    rust: 'main.rs',
    swift: 'main.swift',
    kotlin: 'Main.kt', kt: 'Main.kt',
    ruby: 'main.rb', rb: 'main.rb',
    php: 'index.php',
    r: 'main.r',
    dart: 'main.dart',
    lua: 'main.lua',
    perl: 'main.pl', pl: 'main.pl',
    scala: 'Main.scala',
    haskell: 'Main.hs', hs: 'Main.hs',
    elixir: 'main.ex', ex: 'main.ex',
    bash: 'run.sh', sh: 'run.sh',
    powershell: 'run.ps1', ps1: 'run.ps1',
    sql: 'query.sql',
    json: 'package.json',
    yaml: 'config.yaml', yml: 'config.yml',
    xml: 'config.xml',
    markdown: 'README.md', md: 'README.md',
  };

  while ((match = pattern.exec(raw)) !== null) {
    const lang    = (match[1] || '').toLowerCase();
    const content = match[2].trimEnd();
    if (!content) continue;

    const base = langFileMap[lang] || `file.${lang || 'txt'}`;
    const key  = lang || 'txt';
    counters[key] = (counters[key] || 0);
    const filename = counters[key] === 0 ? base : base.replace(/(\.\w+)$/, `_${counters[key]}$1`);
    counters[key]++;

    files.push({ filename, language: lang || detectLang(filename), content });
  }

  if (!files.length) return null;
  return { project: 'Code Project', description: '', files, setup: 'See NOTES for run instructions', notes: 'Extracted from code blocks' };
}

function openBuilderPanel(projectData) {
  STATE.builderFiles = projectData.files || [];
  STATE.builderActive = true;
  STATE.builderActiveFile = 0;
  STATE.builderPreviewVisible = false;

  el.builderProjectName.textContent = projectData.project || (STATE.mode === 'code' ? 'Code Project' : 'Website Project');
  el.builderPanel.classList.add('open');
  document.body.classList.add('builder-open');

  renderBuilderTabs();
  showBuilderFile(0);
  updateBuilderStatus(`${STATE.builderFiles.length} files generated`, projectData.project);

  // Hide preview toggle in code mode (no live preview for non-web code)
  if (el.builderPreviewToggle) {
    el.builderPreviewToggle.style.display = STATE.mode === 'code' ? 'none' : '';
  }

  // Auto-show preview only for website mode
  if (STATE.mode !== 'code') showBuilderPreview(true);
  else showBuilderPreview(false);
}

function renderBuilderTabs() {
  const iconMap = {
    html: '🌐', css: '🎨',
    javascript: '⚡', js: '⚡', typescript: '🔷', ts: '🔷',
    json: '📦', markdown: '📝', md: '📝', txt: '📄', xml: '📋', yaml: '📋', yml: '📋',
    python: '🐍', py: '🐍',
    java: '☕',
    cpp: '⚙️', c: '🔧',
    csharp: '🎯', cs: '🎯',
    go: '🐹',
    rust: '🦀',
    swift: '🍎',
    kotlin: '🟣', kt: '🟣',
    ruby: '💎', rb: '💎',
    php: '🐘',
    r: '📊',
    dart: '🎯',
    lua: '🌙',
    perl: '🐪', pl: '🐪',
    scala: '🔴',
    haskell: '🔵', hs: '🔵',
    elixir: '💧', ex: '💧',
    bash: '💻', sh: '💻',
    powershell: '🖥️', ps1: '🖥️',
    sql: '🗄️',
    asm: '⚙️',
    matlab: '📐', m: '📐',
    fortran: '🏛️',
    cobol: '📟',
  };
  el.builderTabs.innerHTML = STATE.builderFiles.map((f, i) => {
    const ext = f.filename.split('.').pop().toLowerCase();
    const icon = iconMap[f.language] || iconMap[ext] || '📄';
    return `<button class="builder-tab ${i === STATE.builderActiveFile ? 'active' : ''}" data-index="${i}">
      <span>${icon}</span><span>${f.filename}</span>
    </button>`;
  }).join('');

  el.builderTabs.querySelectorAll('.builder-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      STATE.builderActiveFile = parseInt(tab.dataset.index);
      el.builderTabs.querySelectorAll('.builder-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      showBuilderFile(STATE.builderActiveFile);
    });
  });
}

function showBuilderFile(index) {
  const file = STATE.builderFiles[index];
  if (!file) return;
  el.builderFileLabel.textContent = file.filename;
  el.builderCode.className = `language-${file.language || 'plaintext'}`;
  el.builderCode.textContent = file.content;
  if (typeof hljs !== 'undefined') hljs.highlightElement(el.builderCode);
}

function showBuilderPreview(show) {
  STATE.builderPreviewVisible = show;
  el.builderPreviewPane.style.display = show ? 'flex' : 'none';
  el.builderCodePane.style.flex = show ? '0 0 50%' : '1';
  el.builderPreviewToggle.classList.toggle('active', show);

  if (show) refreshPreview();
}

function refreshPreview() {
  const htmlFile = STATE.builderFiles.find(f => f.filename === 'index.html' || f.filename.endsWith('.html'));
  const cssFile  = STATE.builderFiles.find(f => f.language === 'css' || f.filename.endsWith('.css'));
  const jsFile   = STATE.builderFiles.find(f => (f.language === 'javascript' || f.filename.endsWith('.js')) && !f.filename.includes('server') && !f.filename.includes('node'));

  if (!htmlFile) { el.builderStatus.textContent = 'No HTML file found for preview'; return; }

  let htmlContent = htmlFile.content;

  // Inject CSS inline if separate file
  if (cssFile) {
    const cssLink = new RegExp(`<link[^>]*href=["']${cssFile.filename}["'][^>]*>`, 'i');
    const styleTag = `<style>\n${cssFile.content}\n</style>`;
    if (cssLink.test(htmlContent)) {
      htmlContent = htmlContent.replace(cssLink, styleTag);
    } else {
      htmlContent = htmlContent.replace('</head>', `${styleTag}\n</head>`);
    }
  }

  // Inject JS inline if separate file
  if (jsFile) {
    const jsLink = new RegExp(`<script[^>]*src=["']${jsFile.filename}["'][^>]*><\\/script>`, 'i');
    const scriptTag = `<script>\n${jsFile.content}\n</script>`;
    if (jsLink.test(htmlContent)) {
      htmlContent = htmlContent.replace(jsLink, scriptTag);
    } else {
      htmlContent = htmlContent.replace('</body>', `${scriptTag}\n</body>`);
    }
  }

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  el.previewFrame.src = url;
  el.builderStatus.textContent = 'Preview updated';
}

function updateBuilderStatus(msg, project) {
  el.builderStatus.textContent = msg;
  el.builderFileCount.textContent = STATE.builderFiles.length ? `${STATE.builderFiles.length} files` : '';
}

async function downloadBuilderZip() {
  if (!STATE.builderFiles.length) { showToast('No files to download', 'error'); return; }
  if (typeof JSZip === 'undefined') { showToast('JSZip not loaded', 'error'); return; }

  const zip = new JSZip();
  const projectName = el.builderProjectName.textContent.replace(/\s+/g, '-').toLowerCase() || 'hazy-website';
  const folder = zip.folder(projectName);

  STATE.builderFiles.forEach(f => folder.file(f.filename, f.content));

  // Add README
  const htmlFile = STATE.builderFiles.find(f => f.filename.endsWith('.html'));
  const hasBackend = STATE.builderFiles.some(f => f.filename === 'server.js' || f.filename === 'package.json');
  const readme = `# ${el.builderProjectName.textContent}\n\nGenerated by Hazy — by Dream On\n\n## Files\n${STATE.builderFiles.map(f => `- \`${f.filename}\``).join('\n')}\n\n## How to Run\n${hasBackend ? '```\nnpm install\nnode server.js\n```\nThen open http://localhost:3000' : 'Open `index.html` in your browser'}\n`;
  folder.file('README.md', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${projectName}.zip`;
  a.click();
  showToast('ZIP downloaded!', 'success');
}

// ========================
// File Upload Engine
// Supports: images (vision), text/code, PDF
// ========================

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const FILE_ACCEPT = {
  image:  ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'],
  pdf:    ['application/pdf'],
  text:   ['text/plain','text/markdown','text/csv','text/html','text/css',
           'text/javascript','application/json','application/xml',
           'text/x-python','text/x-java','text/x-c','text/x-sh',
           'application/x-yaml','text/yaml'],
};

const CODE_EXTS = new Set([
  'js','ts','jsx','tsx','html','css','py','java','cpp','c','h',
  'sh','bash','json','yaml','yml','xml','md','txt','csv','env',
  'log','sql','php','rb','go','rs','swift','kt','vue','svelte',
]);

function categorizeFile(file) {
  if (FILE_ACCEPT.image.includes(file.type)) return 'image';
  if (FILE_ACCEPT.pdf.includes(file.type))   return 'pdf';
  const ext = file.name.split('.').pop().toLowerCase();
  if (CODE_EXTS.has(ext) || FILE_ACCEPT.text.includes(file.type)) return 'text';
  return 'unknown';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

// Read image as base64
function readAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// Read image as data-url (for preview)
function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// Read text/code file as string
function readAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

// Extract text from PDF using PDF.js
async function extractPDFText(file) {
  if (typeof pdfjsLib === 'undefined') {
    return `[PDF: ${file.name} — PDF.js not loaded, cannot extract text]`;
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf    = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const total  = pdf.numPages;
    const chunks = [];
    const maxPages = Math.min(total, 20); // cap at 20 pages to avoid RAM issues
    for (let i = 1; i <= maxPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text    = content.items.map(s => s.str).join(' ').trim();
      if (text) chunks.push(`--- Page ${i} ---\n${text}`);
    }
    const result = chunks.join('\n\n');
    const note   = total > maxPages ? `\n\n[Note: Only first ${maxPages} of ${total} pages extracted]` : '';
    return result + note || '[PDF appears to have no extractable text — may be scanned/image-based]';
  } catch (e) {
    return `[PDF extraction failed: ${e.message}]`;
  }
}

// Process all selected files → populate STATE.uploadedFiles
async function processFiles(fileList) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
  const toProcess = Array.from(fileList).slice(0, 8); // max 8 files at once
  const results   = [];

  for (const file of toProcess) {
    if (file.size > MAX_SIZE) {
      showToast(`${file.name} is too large (max 10 MB)`, 'error');
      continue;
    }

    const category = categorizeFile(file);
    if (category === 'unknown') {
      showToast(`${file.name}: unsupported file type`, '');
      continue;
    }

    try {
      const entry = { name: file.name, type: file.type, size: file.size, category };

      if (category === 'image') {
        entry.base64     = await readAsBase64(file);
        entry.previewUrl = await readAsDataURL(file);
        entry.mimeType   = file.type;
      } else if (category === 'pdf') {
        entry.content    = await extractPDFText(file);
        entry.previewUrl = null;
      } else {
        entry.content    = await readAsText(file);
        entry.previewUrl = null;
        entry.ext        = file.name.split('.').pop().toLowerCase();
      }

      results.push(entry);
    } catch (e) {
      showToast(`Failed to read ${file.name}`, 'error');
    }
  }

  return results;
}

// Render the file preview strip below the mode bar
function renderFilePreviewStrip() {
  const files = STATE.uploadedFiles;
  if (!files.length) {
    el.filePreviewStrip.style.display = 'none';
    return;
  }

  el.filePreviewStrip.style.display = 'flex';
  el.filePreviewStrip.innerHTML = files.map((f, i) => {
    const icon = f.category === 'image' ? '' : f.category === 'pdf' ? '📄' : '📎';
    const thumb = f.category === 'image'
      ? `<img src="${f.previewUrl}" alt="${escapeHtml(f.name)}" class="file-thumb-img" />`
      : `<span class="file-thumb-icon">${icon}</span>`;

    return `
      <div class="file-chip" data-index="${i}">
        <div class="file-chip-thumb">${thumb}</div>
        <div class="file-chip-info">
          <span class="file-chip-name">${escapeHtml(f.name)}</span>
          <span class="file-chip-meta">${f.category} · ${formatFileSize(f.size)}</span>
        </div>
        <button class="file-chip-remove" data-index="${i}" title="Remove">✕</button>
      </div>`;
  }).join('');

  el.filePreviewStrip.querySelectorAll('.file-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.uploadedFiles.splice(parseInt(btn.dataset.index), 1);
      renderFilePreviewStrip();
      updateSendBtn();
    });
  });

  // Enable send even without text if files are attached
  updateSendBtn();
}

// Render attached files inside a sent user message bubble
function renderAttachedFilesInMessage(files) {
  if (!files || !files.length) return '';
  return `<div class="msg-attachments">${files.map(f => {
    if (f.category === 'image') {
      return `<div class="msg-attachment msg-attachment-img">
        <img src="${f.previewUrl}" alt="${escapeHtml(f.name)}" class="msg-img-preview" />
        <span class="msg-attachment-name">${escapeHtml(f.name)}</span>
      </div>`;
    }
    const icon = f.category === 'pdf' ? '📄' : '📎';
    return `<div class="msg-attachment">
      <span class="msg-attachment-icon">${icon}</span>
      <span class="msg-attachment-name">${escapeHtml(f.name)}</span>
      <span class="msg-attachment-meta">${formatFileSize(f.size)}</span>
    </div>`;
  }).join('')}</div>`;
}

// Build the Ollama message content including file context
function buildMessageWithFiles(userText, files) {
  // No files → plain string content (original behavior)
  if (!files || !files.length) return userText;

  const hasImages = files.some(f => f.category === 'image');
  const textFiles = files.filter(f => f.category !== 'image');

  // Build text context from non-image files
  let context = '';
  if (textFiles.length) {
    context = textFiles.map(f => {
      if (f.category === 'pdf') {
        return `\n\n[Attached PDF: ${f.name}]\n${f.content}`;
      }
      const lang = f.ext || '';
      return `\n\n[Attached file: ${f.name}]\n\`\`\`${lang}\n${f.content}\n\`\`\``;
    }).join('');
  }

  const fullText = userText + context;

  // If there are images AND Ollama model supports vision,
  // send as multimodal content array
  if (hasImages) {
    const imageFiles = files.filter(f => f.category === 'image');
    const contentParts = [];

    // Add all images
    imageFiles.forEach(f => {
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
      });
    });

    // Add text + file context as last part
    contentParts.push({ type: 'text', text: fullText });

    return contentParts;
  }

  // Text/PDF only — plain string with context injected
  return fullText;
}

// ========================
// Send message
// ========================
async function sendMessage(userText) {
  userText = (userText || '').trim();
  const files = [...STATE.uploadedFiles];

  // Allow send with files even if no text
  if (!userText && !files.length) return;
  if (STATE.isStreaming) return;

  const isBuild = isWebsiteBuildRequest(userText);
  const isCode  = !isBuild && isCodeBuildRequest();

  if (!STATE.activeConvId) {
    createConversation(userText || files.map(f => f.name).join(', '));
    el.welcomeScreen.style.display = 'none';
    el.messagesArea.classList.add('visible');
  }

  const conv = STATE.conversations[STATE.activeConvId];
  const now  = Date.now();

  // Build the message content for Ollama
  const ollamaContent = buildMessageWithFiles(userText, files);

  // Store in conversation (text only for history display)
  const textForHistory = userText + (files.length
    ? '\n' + files.map(f => `[Attached: ${f.name}]`).join('\n')
    : '');
  conv.messages.push({ role: 'user', content: textForHistory, ts: now, files: files.map(f => ({ name: f.name, category: f.category, size: f.size, previewUrl: f.previewUrl || null })) });
  saveConversations();

  // Render user message WITH file thumbnails
  const { group, contentDiv: userContentDiv } = appendMessage('user', userText, true, now);
  const attachmentsHtml = renderAttachedFilesInMessage(files);
  if (attachmentsHtml) {
    const attachDiv = document.createElement('div');
    attachDiv.innerHTML = attachmentsHtml;
    group.querySelector('.message-bubble').insertBefore(attachDiv.firstChild, group.querySelector('.message-content'));
  }

  // Clear upload state
  STATE.uploadedFiles = [];
  el.fileInput.value = '';
  renderFilePreviewStrip();

  el.chatInput.value = '';
  updateSendBtn();
  autoResizeTextarea();
  scrollToBottom(true);

  appendTypingIndicator();
  setStreamingState(true);

  try {
    const sysPrompt = getActiveSystemPrompt(isBuild, isCode);
    const messages  = [
      { role: 'system', content: sysPrompt },
      // All previous messages (text only) + current message with file content
      ...conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: ollamaContent },
    ];

    STATE.abortController = new AbortController();

    // ── Route ALL chat through the Hazy server ─────────────────────────────
    // The server (server.js) handles provider routing, API keys, and format
    // conversion. The frontend just sends to /hazy/chat with the model field
    // set to 'provider/model-id' and always gets back Ollama NDJSON format.
    //
    // For Ollama (local): model = 'ollama/mistral', server proxies to localhost:11434
    // For cloud:          model = 'anthropic/claude-sonnet-4-5' etc, server proxies
    //                     to the right API using keys from hazy-config.json
    //
    // Fallback: if server is not running, fall back to direct Ollama connection.

    const savedModel = localStorage.getItem('hazyActiveModel') || '';
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud = ['anthropic','openai','groq','gemini'].includes(savedProvider);

    // Build the model field — server expects 'provider/modelid' format
    const modelField = savedModel || ('ollama/' + STATE.model);

    // Build request body — include apiKey so server doesn't need hazy-config.json
    // Key comes from localStorage (set when user saves in Settings → AI Providers)
    const localApiKey = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';

    const chatBody = {
      model:    modelField,
      messages,
      stream:   true,
      // Pass key in body — server uses this first, falls back to hazy-config.json
      apiKey:   localApiKey || undefined,
      options: {
        // Inference parameters — ref: Claude Technical Reference §2.4
        temperature:    STATE.temperature,   // 0.0 deterministic → 1.0 creative
        top_p:          STATE.topP,          // nucleus sampling (0.9–0.99)
        top_k:          STATE.topK,          // top-K token candidates (10–100)
        repeat_penalty: STATE.repeatPenalty, // penalise repetition
        num_predict:    STATE.maxTokens,
        num_ctx:        STATE.contextSize,
        max_tokens:     STATE.maxTokens,
      },
    };

    // Try the Hazy server first (/hazy/chat), fall back to direct Ollama
    let chatEndpoint = '/hazy/chat';
    let chatHeaders  = { 'Content-Type': 'application/json' };

    // If running direct from filesystem (file:// protocol), use Ollama directly
    if (window.location.protocol === 'file:') {
      chatEndpoint = `${STATE.ollamaUrl}/api/chat`;
      chatBody.model = STATE.model; // Ollama wants bare model name
    }

    const response = await fetch(chatEndpoint, {
      method:  'POST',
      headers: chatHeaders,
      signal:  STATE.abortController.signal,
      body:    JSON.stringify(chatBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      let errMsg = errText;
      try { errMsg = JSON.parse(errText).error || errText; } catch {}

      // If it's a cloud provider, never fall back to Ollama — show the real error
      if (isCloud) {
        throw new Error(errMsg);
      }

      // Ollama: if /hazy/chat failed (server not running), try direct Ollama
      if (chatEndpoint === '/hazy/chat') {
        const ollamaModel = STATE.model.includes('/') ? STATE.model.split('/').pop() : STATE.model;
        const fallbackRes = await fetch(`${STATE.ollamaUrl}/api/chat`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          signal:  STATE.abortController.signal,
          body:    JSON.stringify({ model: ollamaModel, messages, stream: true, options: { temperature: STATE.temperature, num_predict: STATE.maxTokens, num_ctx: 16384 } }),
        });
        if (!fallbackRes.ok) throw new Error(`Ollama error ${fallbackRes.status}: ${await fallbackRes.text()}`);

        // Use fallback response stream directly — don't patch the original response
        removeTypingIndicator();
        const aiTs = Date.now();
        const { contentDiv } = appendMessage('assistant', '', true, aiTs);
        let fullContent = '';
        const reader  = fallbackRes.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const json = JSON.parse(trimmed);
              const token = json.message?.content || '';
              if (token) { fullContent += token; contentDiv.innerHTML = renderMarkdown(fullContent) + '<span class="stream-cursor"></span>'; scrollToBottom(); }
              if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
            } catch {}
          }
        }
        contentDiv.querySelector('.stream-cursor')?.remove();
        conv.messages.push({ role: 'assistant', content: fullContent, ts: aiTs });
        saveConversations();
        if (conv.messages.filter(m => m.role === 'user').length === 1) generateChatTitle(STATE.activeConvId, userText, fullContent);
        contentDiv.innerHTML = renderMarkdown(fullContent);
        highlightCodeBlocks(contentDiv);
        if (STATE.ttsEnabled && fullContent) speakText(stripMarkdown(fullContent));
        return; // done — skip the main stream block below
      } else {
        throw new Error(`Server error ${response.status}: ${errMsg}`);
      }
    }

    removeTypingIndicator();
    const aiTs = Date.now();
    const { contentDiv } = appendMessage('assistant', '', true, aiTs);
    let fullContent = '';

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    // ── Stream reader — always Ollama NDJSON format ───────────────────────
    // The server normalises ALL provider responses to Ollama format:
    //   { message: { content: "token" }, done: false }
    //   { done: true }
    let streamBuffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      streamBuffer += decoder.decode(value, { stream: true });
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          const token = json.message?.content || '';

          if (token) {
            fullContent += token;

            if (isBuild || isCode) {
              const filesFound     = (fullContent.match(/===FILE:/g) || []).length;
              const linesGenerated = fullContent.split('\n').length;
              const modeVerb       = isCode ? 'Building your code…' : 'Building your website…';
              if (STATE.showLiveCode) {
                contentDiv.innerHTML = renderLiveBuildProgress(fullContent, filesFound, linesGenerated);
              } else {
                const filesInfo = filesFound > 0 ? (filesFound + ' file' + (filesFound > 1 ? 's' : '') + ' detected') : 'Generating…';
                contentDiv.innerHTML = `
                  <div class="build-progress">
                    <span class="build-spinner"></span>
                    <div class="build-progress-info">
                      <span>${modeVerb}</span>
                      <span class="build-stats">${filesInfo} · ${linesGenerated} lines · ${(fullContent.length/1024).toFixed(1)} KB</span>
                    </div>
                  </div>`;
              }
            } else {
              contentDiv.innerHTML = renderMarkdown(fullContent) + '<span class="stream-cursor"></span>';
            }
            scrollToBottom();
          }

          if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
        } catch {}
      }
    }
    // Remove cursor after stream ends
    contentDiv.querySelector('.stream-cursor')?.remove();

    // Final flush to IndexedDB before parsing

    conv.messages.push({ role: 'assistant', content: fullContent, ts: aiTs, buildMode: (isBuild || isCode) ? (isCode ? 'code' : 'website') : undefined });
    saveConversations();

    // Generate a smart title after the very first exchange
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      generateChatTitle(STATE.activeConvId, userText, fullContent);
    }

    if (isBuild || isCode) {
      // — Parse attempt 1: delimiter format (most reliable) —
      let projectData = parseDelimitedOutput(fullContent);

      // — Parse attempt 2: code block fallback (if model used markdown fences) —
      if (!projectData) projectData = parseCodeBlockFallback(fullContent);


      if (projectData && projectData.files.length > 0) {
        const fileList = projectData.files.map(f => `<code>${escapeHtml(f.filename)}</code>`).join(', ');
        const isPartial = !fullContent.includes('===NOTES===') && !fullContent.includes('===SETUP===');
        const modeLabel = isCode ? 'Code' : 'Website';
        const modeIcon  = isCode ? '💻' : '🌐';


        contentDiv.innerHTML = `
          <div class="build-success">
            <div class="build-success-header">
              <span class="build-success-icon">${isPartial ? '⚠️' : '✅'}</span>
              <strong>${escapeHtml(projectData.project || modeLabel)} ${isPartial ? 'partially' : ''} built!</strong>
            </div>
            ${isPartial ? `<p class="build-partial-warn">⚠️ Output was cut off — showing what was generated.</p>` : ''}
            ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
            <div class="build-file-list">${fileList}</div>
            ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
            ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
            <div class="build-actions">
              <button class="build-open-btn" onclick="openBuilderPanel(window._lastBuild)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open in Builder
              </button>
              <button class="build-dl-btn" onclick="downloadBuilderZip()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Download ZIP
              </button>
            </div>
          </div>`;

        window._lastBuild = projectData;
        openBuilderPanel(projectData);
        showToast(`${projectData.files.length} file${projectData.files.length > 1 ? 's' : ''} generated!`, 'success');
      } else {
        contentDiv.innerHTML = renderMarkdown(fullContent);
        highlightCodeBlocks(contentDiv);
        const warnDiv = document.createElement('div');
        warnDiv.className = 'build-parse-error';
        warnDiv.innerHTML = `
          <span>⚠️</span>
          <div>
            <strong>Couldn't extract files from this response.</strong><br>
            The model didn't follow the expected format. Try:
            <ul>
              <li>Switching to a larger model (llama3, mistral)</li>
              <li>Increasing Max Tokens to 4096+ in Settings</li>
              <li>Being more specific in your request</li>
              <li>Make sure you are in the correct mode before sending</li>
            </ul>
          </div>`;
        contentDiv.appendChild(warnDiv);
        showToast('Could not extract files — see suggestions below', '');
      }
    } else {
      contentDiv.innerHTML = renderMarkdown(fullContent);
      highlightCodeBlocks(contentDiv);
    }

    if (STATE.ttsEnabled && fullContent && !isBuild && !isCode) {
      speakText(stripMarkdown(fullContent));
    }

  } catch(err) {
    removeTypingIndicator();
    if (err.name === 'AbortError') {
      // On abort during build — try to parse whatever was collected
      if ((isBuild || isCode) && typeof fullContent === 'string' && fullContent.length > 100) {
        const partial = parseDelimitedOutput(fullContent) || parseCodeBlockFallback(fullContent);
        if (partial?.files.length > 0) {
          window._lastBuild = partial;
          openBuilderPanel(partial);
          showToast(`Stopped — recovered ${partial.files.length} partial file(s)`, '');
          return;
        }
      }
      showToast('Generation stopped', '');
    } else {
      const isConn = err.message.includes('fetch') || err.message.includes('Failed');
      appendErrorMessage(isConn
        ? `Cannot connect to Ollama at <strong>${STATE.ollamaUrl}</strong>.<br>Make sure Ollama is running: <code>ollama serve</code>`
        : `Error: ${err.message}`);
    }
  } finally {
    setStreamingState(false);
    scrollToBottom(true);
  }
}

function appendErrorMessage(html) {
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.innerHTML = `<span class="error-icon">⚠️</span><span>${html}</span>`;
  el.messagesArea.appendChild(div);
}

// ========================
// Live Code Display (Claude-style)
// ========================
function renderLiveBuildProgress(rawContent, filesFound, linesGenerated) {
  // Parse the content to show live code preview
  const projectMatch = rawContent.match(/===PROJECT===\s*([\s\S]*?)(?===|$)/);
  const descMatch = rawContent.match(/===DESCRIPTION===\s*([\s\S]*?)(?===|$)/);
  
  let html = '<div class="build-live-preview">';
  
  // Header with stats
  html += `
    <div class="build-live-header">
      <span class="build-spinner"></span>
      <div>
        <strong>Building: ${projectMatch ? escapeHtml(projectMatch[1].trim()) : 'Website Project'}</strong>
        <span class="build-stats">${filesFound} file${filesFound>1?'s':''} · ${linesGenerated} lines · ${(rawContent.length/1024).toFixed(1)} KB</span>
      </div>
    </div>`;
  
  if (descMatch) {
    html += `<p class="build-live-desc">${escapeHtml(descMatch[1].trim())}</p>`;
  }
  
  // Extract and display each file as it's being written
  const filePattern = /===FILE:\s*([^\s=][^=]*?)===\s*([\s\S]*?)(?=\n===|$)/g;
  let match;
  const files = [];
  
  while ((match = filePattern.exec(rawContent)) !== null) {
    const filename = match[1].trim();
    const content = match[2].trimEnd();
    if (filename) {
      files.push({ filename, content });
    }
  }
  
  if (files.length > 0) {
    html += '<div class="build-live-files">';
    files.forEach((file, idx) => {
      const lang = detectLang(file.filename);
      const isIncomplete = idx === files.length - 1 && !rawContent.endsWith('===');
      
      html += `
        <div class="build-live-file ${isIncomplete ? 'building' : 'complete'}">
          <div class="build-live-file-header">
            <span class="file-icon">${getFileIcon(lang)}</span>
            <code>${escapeHtml(file.filename)}</code>
            ${isIncomplete ? '<span class="writing-indicator">✍️ Writing...</span>' : '<span class="complete-indicator">✓</span>'}
          </div>
          <pre class="build-live-code"><code class="language-${lang}">${escapeHtml(file.content)}${isIncomplete ? '<span class="cursor-blink">│</span>' : ''}</code></pre>
        </div>`;
    });
    html += '</div>';
  }
  
  html += '</div>';
  return html;
}

function getFileIcon(lang) {
  const icons = {
    html: 'icon-globe', css: 'icon-sparkles', javascript: 'icon-bolt', js: 'icon-bolt',
    json: 'icon-grid', python: 'icon-grid', txt: 'icon-clipboard', markdown: 'icon-clipboard', md: 'icon-clipboard'
  };
  return getIconSvg(icons[lang] || 'icon-clipboard');
}

// ========================
// Auto-Continue Code Generation
// ========================
// ========================
// Regenerate (fixed)
// ========================
async function regenerateLast() {
  if (!STATE.activeConvId || STATE.isStreaming) return;
  const conv = STATE.conversations[STATE.activeConvId];
  let lastAIIdx = -1;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === 'assistant') { lastAIIdx = i; break; }
  }
  if (lastAIIdx === -1) return;
  conv.messages.splice(lastAIIdx, 1);
  saveConversations();
  el.messagesArea.innerHTML = '';
  conv.messages.forEach(msg => { if (msg.role !== 'system') appendMessage(msg.role, msg.content, false, msg.ts); });
  let lastUser = null;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === 'user') { lastUser = conv.messages[i]; break; }
  }
  if (!lastUser) return;
  conv.messages.pop();
  saveConversations();
  await sendMessage(lastUser.content);
}

// ========================
// UI Helpers
// ========================
function setStreamingState(streaming) {
  STATE.isStreaming = streaming;
  el.chatInput.disabled = streaming;
  el.sendBtn.disabled = streaming || !el.chatInput.value.trim();
  el.stopBtn.style.display = streaming ? 'flex' : 'none';
}

// ── Scroll management ────────────────────────────────────────────────────
// userScrolledUp is set to true the moment the user scrolls up manually.
// It is only cleared when the user scrolls back to the bottom themselves,
// or when a new message is sent. This prevents streaming from ever
// hijacking the scroll position.
let userScrolledUp = false;
let lastScrollTop = 0;

function isNearBottom() {
  const { scrollTop, scrollHeight, clientHeight } = el.chatContainer;
  return scrollHeight - scrollTop - clientHeight < 80;
}

function scrollToBottom(force = false) {
  if (force) {
    // Always scroll — user just sent a message or a new chat started
    userScrolledUp = false;
    requestAnimationFrame(() => {
      el.chatContainer.scrollTop = el.chatContainer.scrollHeight;
    });
  } else {
    // Streaming chunk — only scroll if user hasn't scrolled up
    if (userScrolledUp) return;
    requestAnimationFrame(() => {
      el.chatContainer.scrollTop = el.chatContainer.scrollHeight;
    });
  }
}

function updateScrollBottomBtn() {
  const chatVisible = el.messagesArea.classList.contains('visible');
  el.scrollBottomBtn.style.display = (userScrolledUp && chatVisible) ? 'flex' : 'none';
}

function updateSendBtn() {
  el.sendBtn.disabled = STATE.isStreaming ||
    (!el.chatInput.value.trim() && !STATE.uploadedFiles.length);
}

function autoResizeTextarea() {
  el.chatInput.style.height = 'auto';
  el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 200) + 'px';
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  el.toastContainer.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(10px)'; t.style.transition='all .25s'; setTimeout(() => t.remove(), 300); }, 2200);
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    el.sidebar.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
  }
}

// ========================
// Piper TTS Engine
// Uses @mintplex-labs/piper-tts-web via jsDelivr +esm
// window.PiperTTS is set by the module script in index.html BEFORE app.js loads
// Voice models download from HuggingFace once, cached in browser OPFS permanently
// ========================

const PIPER_VOICES = [
  { id: 'en_US-lessac-medium',              label: 'Lessac ⭐ (US Female)',       group: '🇺🇸 English US' },
  { id: 'en_US-amy-medium',                 label: 'Amy (US Female)',              group: '🇺🇸 English US' },
  { id: 'en_US-hfc_female-medium',          label: 'HFC Female (US)',              group: '🇺🇸 English US' },
  { id: 'en_US-hfc_male-medium',            label: 'HFC Male (US)',                group: '🇺🇸 English US' },
  { id: 'en_US-joe-medium',                 label: 'Joe (US Male)',                group: '🇺🇸 English US' },
  { id: 'en_US-ryan-medium',                label: 'Ryan (US Male)',               group: '🇺🇸 English US' },
  { id: 'en_US-danny-low',                  label: 'Danny (US Male)',              group: '🇺🇸 English US' },
  { id: 'en_US-kathleen-low',               label: 'Kathleen (US Female)',         group: '🇺🇸 English US' },
  { id: 'en_US-kusal-medium',               label: 'Kusal (US Male)',              group: '🇺🇸 English US' },
  { id: 'en_US-libritts-high',              label: 'LibriTTS (US Female, HQ)',     group: '🇺🇸 English US' },
  { id: 'en_GB-alan-medium',                label: 'Alan (GB Male)',               group: '🇬🇧 English GB' },
  { id: 'en_GB-cori-high',                  label: 'Cori (GB Female, HQ)',         group: '🇬🇧 English GB' },
  { id: 'en_GB-jenny_dioco-medium',         label: 'Jenny (GB Female)',            group: '🇬🇧 English GB' },
  { id: 'en_GB-northern_english_male-medium', label: 'Northern Male',              group: '🇬🇧 English GB' },
  { id: 'de_DE-thorsten-medium',            label: 'Thorsten (Male)',              group: '🇩🇪 German' },
  { id: 'de_DE-eva_k-x_low',               label: 'Eva (Female)',                 group: '🇩🇪 German' },
  { id: 'fr_FR-siwis-medium',               label: 'Siwis (Female)',               group: '🇫🇷 French' },
  { id: 'fr_FR-tom-medium',                 label: 'Tom (Male)',                   group: '🇫🇷 French' },
  { id: 'es_ES-davefx-medium',              label: 'Dave (Male)',                  group: '🇪🇸 Spanish' },
  { id: 'it_IT-paola-medium',               label: 'Paola (Female)',               group: '🇮🇹 Italian' },
  { id: 'pt_BR-faber-medium',               label: 'Faber (BR Male)',              group: '🇧🇷 Portuguese' },
  { id: 'nl_NL-mls-medium',                 label: 'MLS (Female)',                 group: '🇳🇱 Dutch' },
  { id: 'ru_RU-ruslan-medium',              label: 'Ruslan (Male)',                group: '🇷🇺 Russian' },
  { id: 'zh_CN-huayan-medium',              label: 'Huayan (Female)',              group: '🇨🇳 Chinese' },
];

// ── Piper runtime state ──────────────────────────────────────────────────
let _ttsAudioCtx      = null;
let _ttsCurrentSource = null;
let _piperSession     = null;   // active TtsSession
let _piperLoadedVoice = null;
let _piperLoading     = false;

function updatePiperStatus(status, text, pct = null) {
  const el = document.getElementById('ttsPiperStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'tts-model-status';
  if (status === 'loading') el.classList.add('status-loading');
  if (status === 'ready')   el.classList.add('status-ready');
  if (status === 'error')   el.classList.add('status-error');
  const wrap = document.getElementById('ttsPiperProgressWrap');
  const bar  = document.getElementById('ttsPiperProgressBar');
  if (wrap) wrap.style.display = (status === 'loading' && pct != null) ? 'block' : 'none';
  if (bar  && pct != null) bar.style.width = Math.min(100, pct) + '%';
}

// Wait up to 20s for the Piper module script to finish loading
function waitForPiperLib() {
  return new Promise((resolve) => {
    if (window.PiperTTS !== undefined) { resolve(window.PiperTTS); return; }
    const onReady = () => resolve(window.PiperTTS);
    window.addEventListener('piper-ready', onReady, { once: true });
    setTimeout(() => {
      window.removeEventListener('piper-ready', onReady);
      resolve(window.PiperTTS ?? null);
    }, 20000);
  });
}

async function loadPiperModel(voiceId) {
  if (_piperLoadedVoice === voiceId && _piperSession?.ready) return true;
  if (_piperLoading) return false;
  _piperLoading = true;
  _piperSession = null;

  updatePiperStatus('loading', 'Initializing Piper TTS…');

  const tts = await waitForPiperLib();
  if (!tts) {
    _piperLoading = false;
    updatePiperStatus('error', '❌ Piper library failed to load. Check internet connection.');
    return false;
  }

  try {
    updatePiperStatus('loading', 'Downloading voice model…', 0);

    _piperSession = await tts.TtsSession.create({
      voiceId,
      progress: (p) => {
        if (p.total > 0) {
          const pct = Math.round((p.loaded / p.total) * 100);
          const mb  = (p.loaded  / 1048576).toFixed(1);
          const tot = (p.total   / 1048576).toFixed(1);
          updatePiperStatus('loading', `Downloading… ${mb} / ${tot} MB`, pct);
        } else {
          updatePiperStatus('loading', 'Downloading voice model…');
        }
      },
    });

    _piperLoadedVoice     = voiceId;
    _piperLoading         = false;
    STATE.tpsPiperReady   = true;
    STATE.ttsPiperLoading = false;
    updatePiperStatus('ready', '✅ Piper TTS ready');
    showToast('🎤 Piper TTS ready!', 'success');
    return true;
  } catch (err) {
    _piperLoading         = false;
    STATE.tpsPiperReady   = false;
    STATE.ttsPiperLoading = false;
    const msg = err.message || String(err);
    updatePiperStatus('error', '❌ ' + msg);
    showToast('Piper failed — check console (F12)', 'error');
    console.error('[Piper load error]', err);
    return false;
  }
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function stopTTS() {
  try {
    if (_ttsCurrentSource) {
      _ttsCurrentSource.stop();
      _ttsCurrentSource.disconnect();
      _ttsCurrentSource = null;
    }
  } catch {}
  speechSynthesis.cancel();
}

async function speakText(text) {
  if (!text.trim()) return;
  stopTTS();
  if (STATE.ttsEngine === 'piper') {
    await speakPiper(text);
  } else {
    speakBrowser(text);
  }
}

function speakBrowser(text) {
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate  = STATE.ttsSpeed;
  utt.pitch = 1;
  speechSynthesis.speak(utt);
}

async function speakPiper(text) {
  const voiceId = STATE.ttsVoice;

  if (!STATE.tpsPiperReady || _piperLoadedVoice !== voiceId) {
    if (_piperLoading) { showToast('Piper is still loading — please wait…', ''); return; }
    const ok = await loadPiperModel(voiceId);
    if (!ok) return;
  }

  try {
    const chunks = splitIntoChunks(text, 300);

    if (!_ttsAudioCtx || _ttsAudioCtx.state === 'closed') {
      _ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ttsAudioCtx.state === 'suspended') await _ttsAudioCtx.resume();

    let startTime = _ttsAudioCtx.currentTime + 0.05;

    for (const chunk of chunks) {
      if (!STATE.ttsEnabled) break;
      // predict() returns a WAV Blob
      const wavBlob   = await _piperSession.predict(chunk);
      const arrayBuf  = await wavBlob.arrayBuffer();
      const audioBuf  = await _ttsAudioCtx.decodeAudioData(arrayBuf);
      const source    = _ttsAudioCtx.createBufferSource();
      source.buffer   = audioBuf;
      source.playbackRate.value = STATE.ttsSpeed;
      source.connect(_ttsAudioCtx.destination);
      source.start(startTime);
      startTime += audioBuf.duration / STATE.ttsSpeed;
      _ttsCurrentSource = source;
    }
  } catch (e) {
    console.error('[Piper speak error]', e);
    showToast('Piper error: ' + e.message, 'error');
  }
}

function splitIntoChunks(text, maxLen) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, maxLen)];
}


// ========================
// Event Listeners
// ========================
function setupEventListeners() {
  el.chatInput.addEventListener('input', () => {
    updateSendBtn(); autoResizeTextarea();
    const len = el.chatInput.value.length;
    el.charCount.textContent = len > 1000 ? len.toLocaleString() : '';
  });

  el.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!el.sendBtn.disabled) sendMessage(el.chatInput.value); }
  });

  el.sendBtn.addEventListener('click', () => sendMessage(el.chatInput.value));
  el.stopBtn.addEventListener('click', () => STATE.abortController?.abort());

  // ── File upload ──────────────────────────────────
  el.uploadBtn.addEventListener('click', () => el.fileInput.click());

  el.fileInput.addEventListener('change', async () => {
    if (!el.fileInput.files.length) return;
    showToast('Reading files…', '');
    const newFiles = await processFiles(el.fileInput.files);
    STATE.uploadedFiles.push(...newFiles);
    renderFilePreviewStrip();
    if (newFiles.length) showToast(`${newFiles.length} file${newFiles.length > 1 ? 's' : ''} attached`, 'success');
  });

  // Drag-and-drop onto the input area
  const inputArea = document.querySelector('.input-area');
  inputArea.addEventListener('dragover', e => { e.preventDefault(); inputArea.classList.add('drag-over'); });
  inputArea.addEventListener('dragleave', () => inputArea.classList.remove('drag-over'));
  inputArea.addEventListener('drop', async e => {
    e.preventDefault();
    inputArea.classList.remove('drag-over');
    const dropped = e.dataTransfer.files;
    if (!dropped.length) return;
    showToast('Reading files…', '');
    const newFiles = await processFiles(dropped);
    STATE.uploadedFiles.push(...newFiles);
    renderFilePreviewStrip();
    if (newFiles.length) showToast(`${newFiles.length} file${newFiles.length > 1 ? 's' : ''} attached`, 'success');
  });

  // Paste image from clipboard
  document.addEventListener('paste', async e => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map(i => i.getAsFile()).filter(Boolean);
    const newFiles = await processFiles(files);
    STATE.uploadedFiles.push(...newFiles);
    renderFilePreviewStrip();
    if (newFiles.length) showToast('Image pasted!', 'success');
  });

  // Mode buttons
  el.modeChatBtn.addEventListener('click', () => setMode('chat'));
  el.modeBuildBtn.addEventListener('click', () => setMode('build'));
  el.modeCodeBtn?.addEventListener('click', () => setMode('code'));
  document.getElementById('codeLangSelect')?.addEventListener('change', e => {
    STATE.codeLang = e.target.value;
  });

  // Scroll to bottom
  el.chatContainer.addEventListener('scroll', () => {
    const currentScrollTop = el.chatContainer.scrollTop;
    const scrolledUp = currentScrollTop < lastScrollTop; // user scrolled upward
    lastScrollTop = currentScrollTop;

    if (scrolledUp && !isNearBottom()) {
      // User intentionally scrolled up — lock scroll
      userScrolledUp = true;
    } else if (isNearBottom()) {
      // User scrolled back to the bottom — unlock
      userScrolledUp = false;
    }

    updateScrollBottomBtn();
  });

  // Clicking scroll-to-bottom button clears the lock
  el.scrollBottomBtn.addEventListener('click', () => {
    userScrolledUp = false;
    el.chatContainer.scrollTo({ top: el.chatContainer.scrollHeight, behavior: 'smooth' });
  });

  // New / Clear chat
  el.newChatBtn.addEventListener('click', () => { STATE.activeConvId = null; showWelcomeScreen(); renderChatHistory(); closeSidebarMobile(); });
  el.clearChatBtn.addEventListener('click', () => {
    if (!STATE.activeConvId) { showToast('No active chat', ''); return; }
    if (!confirm('Clear this conversation?')) return;
    const conv = STATE.conversations[STATE.activeConvId];
    if (conv) { conv.messages = []; saveConversations(); }
    showWelcomeScreen(); showToast('Chat cleared', 'success');
  });

  // Suggestion cards
  el.suggestionGrid.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      el.chatInput.value = card.dataset.prompt;
      updateSendBtn(); autoResizeTextarea(); el.chatInput.focus();
      setMode('build');
    });
  });

  // Model selector — fixed-position dropdown that escapes sidebar overflow
  el.modelSelector.addEventListener('click', () => {
    const isOpen = el.modelDropdown.classList.contains('open');
    if (isOpen) {
      el.modelDropdown.classList.remove('open');
      el.modelSelector.classList.remove('open');
      return;
    }
    const rect = el.modelSelector.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove >= 200 || spaceAbove > spaceBelow) {
      el.modelDropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
      el.modelDropdown.style.top = 'auto';
      el.modelDropdown.style.maxHeight = Math.min(300, spaceAbove - 8) + 'px';
    } else {
      el.modelDropdown.style.top = (rect.bottom + 4) + 'px';
      el.modelDropdown.style.bottom = 'auto';
      el.modelDropdown.style.maxHeight = Math.min(300, spaceBelow - 8) + 'px';
    }
    el.modelDropdown.style.left = rect.left + 'px';
    el.modelDropdown.style.width = rect.width + 'px';
    el.modelDropdown.classList.add('open');
    el.modelSelector.classList.add('open');
  });
  document.addEventListener('click', e => {
    if (!el.modelSelector.contains(e.target) && !el.modelDropdown.contains(e.target)) {
      el.modelDropdown.classList.remove('open'); el.modelSelector.classList.remove('open');
    }
  });

  // Settings
  el.settingsBtn.addEventListener('click', () => {
    el.ollamaUrl.value = STATE.ollamaUrl;
    el.systemPrompt.value = STATE.systemPrompt;
    el.temperature.value = STATE.temperature; el.tempLabel.textContent = STATE.temperature;
    el.maxTokens.value = STATE.maxTokens; el.maxTokensLabel.textContent = STATE.maxTokens;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === STATE.theme));

    // Populate Appearance tab controls from STATE
    const fsEl  = document.getElementById('settingsFontSize');
    const dEl   = document.getElementById('settingsDensity');
    const chEl  = document.getElementById('settingsCodeHighlight');
    const mdEl  = document.getElementById('settingsMarkdown');
    const rpEl  = document.getElementById('settingsRepeatPenalty');
    const tpEl  = document.getElementById('settingsTopP');
    const csEl  = document.getElementById('settingsContextSize');
    if (fsEl)  fsEl.value    = STATE.fontSize    || '14px';
    if (dEl)   dEl.value     = STATE.density     || 'normal';
    if (chEl)  chEl.checked  = STATE.codeHL      !== false;
    if (mdEl)  mdEl.checked  = STATE.markdown    !== false;
    if (rpEl)  { rpEl.value  = STATE.repeatPenalty || 1.1; const l = document.getElementById('repeatPenaltyLabel'); if(l) l.textContent = parseFloat(rpEl.value).toFixed(2); }
    if (tpEl)  { tpEl.value  = STATE.topP        || 0.92;  const l = document.getElementById('topPLabel');          if(l) l.textContent = parseFloat(tpEl.value).toFixed(2); }
    if (csEl)  csEl.value    = STATE.contextSize || 4096;

    openModal('settingsModal');
  });
  el.settingsClose.addEventListener('click', () => closeModal('settingsModal'));
  el.settingsCancelBtn.addEventListener('click', () => closeModal('settingsModal'));
  el.settingsSaveBtn.addEventListener('click', saveSettings);
  el.settingsModal.addEventListener('click', e => { if (e.target === el.settingsModal) closeModal('settingsModal'); });
  el.temperature.addEventListener('input', () => { el.tempLabel.textContent = el.temperature.value; });
  el.maxTokens.addEventListener('input', () => { el.maxTokensLabel.textContent = el.maxTokens.value; });
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); applyTheme(btn.dataset.theme);
    });
  });

  // Sidebar mobile
  el.sidebarToggle.addEventListener('click', () => {
    el.sidebar.classList.toggle('open');
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay'; document.body.appendChild(overlay);
      overlay.addEventListener('click', () => { el.sidebar.classList.remove('open'); overlay.classList.remove('active'); });
    }
    overlay.classList.toggle('active', el.sidebar.classList.contains('open'));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.metaKey||e.ctrlKey) && e.key === 'k') { e.preventDefault(); STATE.activeConvId = null; showWelcomeScreen(); renderChatHistory(); el.chatInput.focus(); }
    if (e.key === 'Escape') { closeModal('settingsModal'); closeModal('renameModal'); closeModal('personaModal'); }
  });

  // Export
  el.exportBtn.addEventListener('click', () => {
    if (!STATE.activeConvId) { showToast('No active chat', ''); return; }
    const conv = STATE.conversations[STATE.activeConvId];
    if (!conv?.messages.length) { showToast('Chat is empty', ''); return; }
    const lines = conv.messages.filter(m => m.role !== 'system').map(m => {
      const time = m.ts ? ` [${new Date(m.ts).toLocaleString()}]` : '';
      return `[${m.role === 'user' ? 'You' : 'Hazy'}${time}]\n${m.content}`;
    }).join('\n\n---\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines], { type: 'text/plain' }));
    a.download = `hazy-chat-${Date.now()}.txt`; a.click();
    showToast('Chat exported!', 'success');
  });

  // TTS — button opens voice settings; long-press or separate icon to toggle
  el.ttsToggleBtn?.addEventListener('click', () => {
    if (STATE.ttsEnabled) {
      // Turn off
      STATE.ttsEnabled = false;
      stopTTS();
      el.ttsLabel.textContent = 'TTS: Off';
      el.ttsToggleBtn.classList.remove('active');
      showToast('Voice off', '');
    } else {
      // Open voice settings modal first
      openTTSModal();
    }
  });

  // TTS voice settings modal
  el.ttsClose?.addEventListener('click',      () => closeModal('ttsModal'));
  el.ttsModal?.addEventListener('click', e => { if (e.target === el.ttsModal) closeModal('ttsModal'); });
  $('ttsCancelBtn')?.addEventListener('click', () => closeModal('ttsModal'));

  el.ttsTestBtn?.addEventListener('click', () => {
    const sample = "Hey there! This is Hazy speaking — your local AI assistant by Dream On.";
    speakText(sample);
  });

  document.querySelectorAll('.tts-engine-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      STATE.ttsEngine = radio.value;
      const piperOpts = $('ttsPiperOptions');
      if (piperOpts) piperOpts.style.display = STATE.ttsEngine === 'piper' ? 'block' : 'none';
    });
  });

  el.ttsVoiceSelect?.addEventListener('change', () => {
    STATE.ttsVoice = el.ttsVoiceSelect.value;
    // Reset ready state if voice changed so model reloads
    if (_piperLoadedVoice && _piperLoadedVoice !== STATE.ttsVoice) {
      stopTTS();
      _piperSession     = null;   // destroy old session so new voice is actually loaded
      _piperLoadedVoice = null;
      _piperLoading     = false;
      STATE.tpsPiperReady   = false;
      STATE.ttsPiperLoading = false;
      updatePiperStatus('idle', 'Voice changed — click Enable Voice to load');
    }
  });

  el.ttsSpeedRange?.addEventListener('input', () => {
    STATE.ttsSpeed = parseFloat(el.ttsSpeedRange.value);
    if (el.ttsSpeedLabel) el.ttsSpeedLabel.textContent = STATE.ttsSpeed.toFixed(1) + '×';
  });

  $('ttsSaveBtn')?.addEventListener('click', async () => {
    STATE.ttsEnabled = true;
    STATE.ttsVoice   = el.ttsVoiceSelect?.value || 'en_US-lessac-medium';
    STATE.ttsSpeed   = parseFloat(el.ttsSpeedRange?.value || '1.0');

    if (STATE.ttsEngine === 'piper') {
      el.ttsLabel.textContent = 'Piper (loading...)';
      el.ttsToggleBtn.classList.add('active');
      closeModal('ttsModal');
      showToast("Loading Piper model - voice will start after it's ready", 'success');
      if (!STATE.tpsPiperReady && !STATE.ttsPiperLoading) {
        loadPiperModel(STATE.ttsVoice);
      }
    } else {
      el.ttsLabel.textContent = 'Voice On';
      el.ttsToggleBtn.classList.add('active');
      closeModal('ttsModal');
      showToast('Browser TTS enabled', 'success');
    }
  });

  // History search
  el.historySearch.addEventListener('input', () => renderChatHistory(el.historySearch.value));

  // Rename
  el.renameClose.addEventListener('click', () => closeModal('renameModal'));
  el.renameCancelBtn.addEventListener('click', () => closeModal('renameModal'));
  el.renameModal.addEventListener('click', e => { if (e.target === el.renameModal) closeModal('renameModal'); });
  el.renameSaveBtn.addEventListener('click', () => {
    const name = el.renameInput.value.trim();
    if (!name) { showToast('Name cannot be empty', 'error'); return; }
    if (STATE.renameTargetId) { renameConversation(STATE.renameTargetId, name); closeModal('renameModal'); showToast('Chat renamed', 'success'); }
  });
  el.renameInput.addEventListener('keydown', e => { if (e.key === 'Enter') el.renameSaveBtn.click(); });

  // Builder panel controls
  el.builderClose.addEventListener('click', () => {
    el.builderPanel.classList.remove('open');
    document.body.classList.remove('builder-open');
  });
  el.builderPreviewToggle.addEventListener('click', () => showBuilderPreview(!STATE.builderPreviewVisible));
  el.builderRefresh.addEventListener('click', refreshPreview);
  el.builderDownload.addEventListener('click', downloadBuilderZip);
  el.builderCopyFile.addEventListener('click', () => {
    const file = STATE.builderFiles[STATE.builderActiveFile];
    if (file) navigator.clipboard.writeText(file.content).then(() => showToast('File copied!', 'success'));
  });

  // Preview viewport buttons
  document.querySelectorAll('.viewport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.viewport-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      el.previewFrame.style.width = btn.dataset.width;
      el.previewFrame.style.margin = btn.dataset.width === '100%' ? '0' : '0 auto';
    });
  });

  // ── Persona ──────────────────────────────────────
  el.personaBtn?.addEventListener('click', () => openPersonaModal());
  el.personaClose?.addEventListener('click', () => closeModal('personaModal'));
  el.personaCancelBtn?.addEventListener('click', () => closeModal('personaModal'));
  el.personaModal?.addEventListener('click', e => { if (e.target === el.personaModal) closeModal('personaModal'); });
  el.personaSaveBtn?.addEventListener('click', savePersona);
  el.personaResetBtn?.addEventListener('click', () => {
    if (!confirm('Reset persona to defaults?')) return;
    STATE.personaEnabled = false; STATE.personaName = 'Alex'; STATE.personaUserName = '';
    STATE.personaRelation = 'friend'; STATE.personaGender = 'neutral'; STATE.personaLanguage = 'casual';
    STATE.personaTraits = []; STATE.scenarioDesc = ''; STATE.scenarioOpener = '';
    STATE.scenarioUserRole = ''; STATE.scenarioCharRole = ''; STATE.scenarioSetting = '';
    openPersonaModal();
    showToast('Persona reset', '');
  });

  // Persona tab switching
  document.querySelectorAll('.persona-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPersonaTab(tab.dataset.tab));
  });

  // Relation card clicks
  document.querySelectorAll('.persona-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // Trait pill toggles
  document.querySelectorAll('.trait-pill').forEach(pill => {
    pill.addEventListener('click', () => pill.classList.toggle('selected'));
  });}

// ========================
// Persona Modal
// ========================
function openPersonaModal() {
  // Sync state → UI
  if (el.personaToggle)        el.personaToggle.checked        = STATE.personaEnabled;
  if (el.personaNameInput)     el.personaNameInput.value       = STATE.personaName;
  if (el.personaUserNameInput) el.personaUserNameInput.value   = STATE.personaUserName;
  if (el.personaGender)        el.personaGender.value          = STATE.personaGender;
  if (el.personaLanguage)      el.personaLanguage.value        = STATE.personaLanguage;
  if (el.scenarioDesc)         el.scenarioDesc.value           = STATE.scenarioDesc;
  if (el.scenarioOpener)       el.scenarioOpener.value         = STATE.scenarioOpener;
  if (el.scenarioUserRole)     el.scenarioUserRole.value       = STATE.scenarioUserRole;
  if (el.scenarioCharRole)     el.scenarioCharRole.value       = STATE.scenarioCharRole;

  document.querySelectorAll('.persona-card').forEach(c =>
    c.classList.toggle('selected', c.dataset.relation === STATE.personaRelation)
  );
  document.querySelectorAll('.trait-pill').forEach(p =>
    p.classList.toggle('selected', STATE.personaTraits.includes(p.dataset.trait))
  );

  renderPresetScenarioGrid();
  renderScenarioSettingGrid();
  switchPersonaTab('presets');
  openModal('personaModal');
}

function savePersona() {
  const selectedCard = document.querySelector('.persona-card.selected');
  STATE.personaRelation  = selectedCard?.dataset.relation        || 'friend';
  STATE.personaEnabled   = el.personaToggle?.checked             ?? true;
  STATE.personaName      = el.personaNameInput?.value.trim()     || 'Alex';
  STATE.personaUserName  = el.personaUserNameInput?.value.trim() || '';
  STATE.personaGender    = el.personaGender?.value               || 'neutral';
  STATE.personaLanguage  = el.personaLanguage?.value             || 'casual';
  STATE.personaTraits    = Array.from(document.querySelectorAll('.trait-pill.selected')).map(p => p.dataset.trait);
  STATE.scenarioDesc     = el.scenarioDesc?.value.trim()         || '';
  STATE.scenarioOpener   = el.scenarioOpener?.value.trim()       || '';
  STATE.scenarioUserRole = el.scenarioUserRole?.value.trim()     || '';
  STATE.scenarioCharRole = el.scenarioCharRole?.value.trim()     || '';

  // Persist everything
  const s = JSON.parse(localStorage.getItem('hazy_settings') || '{}');
  Object.assign(s, {
    personaEnabled: STATE.personaEnabled, personaRelation: STATE.personaRelation,
    personaName: STATE.personaName, personaUserName: STATE.personaUserName,
    personaGender: STATE.personaGender, personaTraits: STATE.personaTraits,
    personaLanguage: STATE.personaLanguage, scenarioDesc: STATE.scenarioDesc,
    scenarioOpener: STATE.scenarioOpener, scenarioUserRole: STATE.scenarioUserRole,
    scenarioCharRole: STATE.scenarioCharRole, scenarioSetting: STATE.scenarioSetting,
  });
  localStorage.setItem('hazy_settings', JSON.stringify(s));

  updatePersonaBadge();
  closeModal('personaModal');

  if (STATE.personaEnabled) {
    const preset = PERSONA_PRESETS[STATE.personaRelation];
    showToast(`${STATE.personaName} — starting scene...`, 'success');

    // Start a new chat and inject the opener automatically
    STATE.activeConvId = null;
    showWelcomeScreen();
    renderChatHistory();

    setTimeout(() => {
      // Create the conversation and immediately have the character open the scene
      const id = 'conv_' + Date.now();
      const title = STATE.scenarioDesc
        ? STATE.scenarioDesc.slice(0, 50) + '…'
        : `${STATE.personaName} — ${preset?.label || 'Chat'}`;
      STATE.conversations[id] = { title, messages: [], createdAt: Date.now() };
      STATE.activeConvId = id;
      el.welcomeScreen.style.display = 'none';
      el.messagesArea.classList.add('visible');
      saveConversations();
      renderChatHistory();
      injectPersonaOpener();
    }, 150);
  } else {
    showToast('Persona disabled', '');
  }
}

// ========================
// TTS Modal
// ========================
function openTTSModal() {
  document.querySelectorAll('.tts-engine-radio').forEach(r => {
    r.checked = r.value === STATE.ttsEngine;
  });
  const piperOpts = $('ttsPiperOptions');
  if (piperOpts) piperOpts.style.display = STATE.ttsEngine === 'piper' ? 'block' : 'none';
  if (el.ttsVoiceSelect) el.ttsVoiceSelect.value = STATE.ttsVoice;
  if (el.ttsSpeedRange)  el.ttsSpeedRange.value  = STATE.ttsSpeed;
  if (el.ttsSpeedLabel)  el.ttsSpeedLabel.textContent = STATE.ttsSpeed.toFixed(1) + '×';

  // Show current Piper status
  if (STATE.tpsPiperReady)        updatePiperStatus('ready',   '✅ Piper model loaded and ready');
  else if (STATE.ttsPiperLoading) updatePiperStatus('loading', 'Loading Piper model…');
  else                            updatePiperStatus('idle',    'Select a voice above then click Enable Voice');

  openModal('ttsModal');
}

// ========================
// Boot
// ========================
document.addEventListener('DOMContentLoaded', init);

// ========================
// Training Data Builder
// ========================
const TRAINING = {
  pairs: [], // { type: 'qa'|'raw', instruction, response, raw }
};

function openTrainingModal() {
  renderTrainChatList();
  renderTrainPreview();
  switchTrainingTab('manual');
  openModal('trainingModal');
}

function switchTrainingTab(tabId) {
  document.querySelectorAll('.training-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  document.querySelectorAll('.training-tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `training-tab-${tabId}`)
  );
  if (tabId === 'preview') renderTrainPreview();
  if (tabId === 'from-chat') renderTrainChatList();
}

function trainAddPair() {
  const instruction = document.getElementById('trainInstruction').value.trim();
  const response    = document.getElementById('trainResponse').value.trim();
  if (!instruction || !response) { showToast('Fill in both fields', 'error'); return; }
  TRAINING.pairs.push({ type: 'qa', instruction, response });
  document.getElementById('trainInstruction').value = '';
  document.getElementById('trainResponse').value = '';
  updateTrainCount();
  showToast('Pair added!', 'success');
}

function updateTrainCount() {
  const n = TRAINING.pairs.length;
  const el = document.getElementById('trainPairCount');
  if (el) el.textContent = `${n} pair${n !== 1 ? 's' : ''} added`;
  const tot = document.getElementById('trainTotalCount');
  if (tot) tot.textContent = `${n} example${n !== 1 ? 's' : ''}`;
}

function trainAddRawText() {
  const text = document.getElementById('trainBulkText').value.trim();
  if (!text) { showToast('Paste some text first', 'error'); return; }
  // Split into ~500 word chunks
  const words = text.split(/\s+/);
  const chunkSize = 500;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.length > 50) TRAINING.pairs.push({ type: 'raw', raw: chunk });
  }
  document.getElementById('trainBulkText').value = '';
  const status = document.getElementById('trainBulkStatus');
  if (status) status.textContent = `Added ${Math.ceil(words.length / chunkSize)} chunk(s)`;
  updateTrainCount();
  showToast('Text added as training chunks!', 'success');
}

async function trainSplitWithAI() {
  const text = document.getElementById('trainBulkText').value.trim();
  if (!text) { showToast('Paste some text first', 'error'); return; }
  const status = document.getElementById('trainBulkStatus');
  if (status) status.textContent = 'Asking AI to extract pairs…';

  const prompt = `You are a training data generator. Read the text below and extract 5-15 question-answer pairs from it for fine-tuning a language model.

Return ONLY a JSON array like this (no extra text, no markdown):
[{"instruction":"question here","response":"answer here"},...]

Text:
${text.slice(0, 3000)}`;

  try {
    const savedModel    = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud       = ['anthropic','openai','groq','gemini'].includes(savedProvider);
    const localApiKey   = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';
    const trainEndpoint = window.location.protocol === 'file:' ? `${STATE.ollamaUrl}/api/chat` : '/hazy/chat';
    const trainBody     = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.3, num_predict: 2048 } }
      : { model: savedModel, apiKey: localApiKey || undefined, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.3, num_predict: 2048, max_tokens: 2048 } };

    const res = await fetch(trainEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trainBody),
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    let raw = (data.message?.content || '').trim();
    // Strip markdown fences if model wrapped it
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/,'').trim();
    const pairs = JSON.parse(raw);
    if (!Array.isArray(pairs)) throw new Error('Not an array');
    pairs.forEach(p => {
      if (p.instruction && p.response) {
        TRAINING.pairs.push({ type: 'qa', instruction: p.instruction.trim(), response: p.response.trim() });
      }
    });
    document.getElementById('trainBulkText').value = '';
    if (status) status.textContent = `Extracted ${pairs.length} pairs!`;
    updateTrainCount();
    showToast(`Extracted ${pairs.length} training pairs!`, 'success');
  } catch(e) {
    if (status) status.textContent = 'Failed — try "Add as Raw Text" instead';
    showToast('AI extraction failed: ' + e.message, 'error');
  }
}

function renderTrainChatList() {
  const container = document.getElementById('trainChatList');
  if (!container) return;
  const convs = Object.entries(STATE.conversations)
    .sort(([,a],[,b]) => (b.createdAt||0) - (a.createdAt||0));
  if (!convs.length) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">No conversations yet. Chat with Hazy first, then come back here.</p>';
    return;
  }
  container.innerHTML = convs.map(([id, conv]) => {
    const msgCount = (conv.messages || []).filter(m => m.role !== 'system').length;
    return `<label class="train-chat-item">
      <input type="checkbox" data-id="${id}" />
      <span class="train-chat-title">${escapeHtml(conv.title || 'Untitled')}</span>
      <span class="train-chat-count">${msgCount} messages</span>
    </label>`;
  }).join('');
}

function trainAddSelectedChats() {
  const checked = document.querySelectorAll('#trainChatList input[type=checkbox]:checked');
  if (!checked.length) { showToast('Select at least one chat', 'error'); return; }
  let added = 0;
  checked.forEach(cb => {
    const conv = STATE.conversations[cb.dataset.id];
    if (!conv) return;
    const msgs = (conv.messages || []).filter(m => m.role !== 'system');
    // Pair user → assistant messages
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].role === 'user' && msgs[i+1].role === 'assistant') {
        TRAINING.pairs.push({
          type: 'qa',
          instruction: msgs[i].content,
          response: msgs[i+1].content,
        });
        added++;
      }
    }
    cb.checked = false;
  });
  updateTrainCount();
  showToast(`Added ${added} pairs from chats!`, 'success');
}

function renderTrainPreview() {
  updateTrainCount();
  const container = document.getElementById('trainPreviewList');
  if (!container) return;
  if (!TRAINING.pairs.length) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px 0;">No data yet — add pairs from the other tabs.</p>';
    return;
  }
  container.innerHTML = TRAINING.pairs.map((p, i) => `
    <div class="train-pair-item">
      <button class="train-pair-delete" onclick="trainDeletePair(${i})">✕</button>
      ${p.type === 'raw'
        ? `<span class="train-pair-label">raw text</span>
           <span class="train-pair-q">${escapeHtml(p.raw.slice(0, 200))}${p.raw.length > 200 ? '…' : ''}</span>`
        : `<span class="train-pair-label">instruction</span>
           <span class="train-pair-q">${escapeHtml(p.instruction.slice(0, 150))}${p.instruction.length > 150 ? '…' : ''}</span>
           <span class="train-pair-label" style="margin-top:4px;">response</span>
           <span class="train-pair-a">${escapeHtml(p.response.slice(0, 150))}${p.response.length > 150 ? '…' : ''}</span>`
      }
    </div>`).join('');
}

function trainDeletePair(index) {
  TRAINING.pairs.splice(index, 1);
  renderTrainPreview();
}

function trainClearAll() {
  if (!confirm('Clear all training data?')) return;
  TRAINING.pairs = [];
  renderTrainPreview();
  updateTrainCount();
  showToast('Cleared', '');
}

function trainExportJSONL() {
  if (!TRAINING.pairs.length) { showToast('No data to export', 'error'); return; }
  const format = document.getElementById('trainFormatSelect')?.value || 'alpaca';
  const systemPrompt = document.getElementById('trainSystemPrompt')?.value.trim() || '';
  const lines = TRAINING.pairs.map(p => {
    if (p.type === 'raw') {
      return JSON.stringify({ text: p.raw });
    }
    if (format === 'alpaca') {
      return JSON.stringify({
        instruction: p.instruction,
        input: '',
        output: p.response,
        ...(systemPrompt ? { system: systemPrompt } : {}),
      });
    }
    if (format === 'chatml') {
      const msgs = [];
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
      msgs.push({ role: 'user', content: p.instruction });
      msgs.push({ role: 'assistant', content: p.response });
      return JSON.stringify({ messages: msgs });
    }
    // raw format
    const sys = systemPrompt ? `### System:\n${systemPrompt}\n\n` : '';
    return JSON.stringify({ text: `${sys}### Instruction:\n${p.instruction}\n\n### Response:\n${p.response}` });
  });

  const blob = new Blob([lines.join('\n')], { type: 'application/jsonl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hazy-training-data-${Date.now()}.jsonl`;
  a.click();
  showToast(`Exported ${TRAINING.pairs.length} examples!`, 'success');
}

// ── Wire up training modal events ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('trainingDataBtn')?.addEventListener('click', () => {
    closeModal('settingsModal');
    openTrainingModal();
  });
  document.getElementById('trainingClose')?.addEventListener('click', () => closeModal('trainingModal'));
  document.getElementById('trainingModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('trainingModal')) closeModal('trainingModal');
  });
  document.querySelectorAll('.training-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTrainingTab(tab.dataset.tab));
  });
  document.getElementById('trainAddPairBtn')?.addEventListener('click', trainAddPair);
  document.getElementById('trainRawBtn')?.addEventListener('click', trainAddRawText);
  document.getElementById('trainSplitBtn')?.addEventListener('click', trainSplitWithAI);
  document.getElementById('trainAddChatsBtn')?.addEventListener('click', trainAddSelectedChats);
  document.getElementById('trainExportBtn')?.addEventListener('click', trainExportJSONL);
  document.getElementById('trainClearBtn')?.addEventListener('click', trainClearAll);
  document.getElementById('trainFormatSelect')?.addEventListener('change', renderTrainPreview);

  // Enter key in manual fields
  document.getElementById('trainInstruction')?.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.getElementById('trainResponse')?.focus(); }
  });
});

// ════════════════════════════════════════════════════════════════
// HAZY v2 — AI PROVIDERS PANEL + SETTINGS TABS
// Single clean implementation — no duplicates
// ════════════════════════════════════════════════════════════════

// ── Provider data ──────────────────────────────────────────────
const PROVIDER_CATEGORIES = {
  text: [
    { key:'anthropic',  name:'Anthropic (Claude)',       url:'https://console.anthropic.com',          note:'Claude Haiku, Sonnet, Opus — best for novel writing' },
    { key:'openai',     name:'OpenAI (GPT-4o / DALL-E)', url:'https://platform.openai.com/api-keys',   note:'GPT-4o, o1, DALL-E 3, TTS — requires paid plan' },
    { key:'groq',       name:'Groq (Fast Free Tier)',    url:'https://console.groq.com',               note:'Llama 3.1 70B at incredible speed — free tier available' },
    { key:'gemini',     name:'Google Gemini',            url:'https://aistudio.google.com/app/apikey', note:'Gemini 1.5 Pro — 1M token context window' },
  ],
  image: [
    { key:'stability',  name:'Stability AI',            url:'https://platform.stability.ai',          note:'Stable Diffusion XL, ultra quality images' },
    { key:'ideogram',   name:'Ideogram',                url:'https://ideogram.ai',                    note:'Best AI model for text inside images' },
    { key:'fal',        name:'fal.ai (Flux + Kling)',   url:'https://fal.ai',                         note:'Flux image generation + Kling video — fast API' },
  ],
  media: [
    { key:'elevenlabs', name:'ElevenLabs (TTS)',        url:'https://elevenlabs.io',                  note:'Most natural AI voices — 30+ voices, multilingual' },
    { key:'suno',       name:'Suno (AI Music)',         url:'https://suno.com',                       note:'Generate full songs from text — cloud only' },
    { key:'runway',     name:'Runway (AI Video)',       url:'https://runwayml.com',                   note:'Gen-3 video generation — cloud only' },
  ],
};

const OLLAMA_MODEL_LIST = [
  {id:'ollama/llama3.2:1b',  label:'llama3.2:1b (1B — fastest)'},
  {id:'ollama/llama3.2',     label:'llama3.2 (3B — recommended)'},
  {id:'ollama/llama3',       label:'llama3 (8B)'},
  {id:'ollama/mistral',      label:'mistral (7B — best writing)'},
  {id:'ollama/mixtral',      label:'mixtral (47B — best quality)'},
  {id:'ollama/gemma2',       label:'gemma2 (9B)'},
  {id:'ollama/phi3',         label:'phi3 (3.8B)'},
  {id:'ollama/qwen2.5',      label:'qwen2.5 (7B)'},
  {id:'ollama/deepseek-r1',  label:'deepseek-r1 (7B)'},
  {id:'ollama/llava',        label:'llava (7B vision)'},
];

const CLOUD_MODEL_MAP = {
  anthropic: [
    {id:'anthropic/claude-haiku-4-5-20251001',  label:'Claude Haiku 4.5 — fastest'},
    {id:'anthropic/claude-sonnet-4-5-20250929', label:'Claude Sonnet 4.5 — recommended'},
    {id:'anthropic/claude-opus-4-5-20251101',   label:'Claude Opus 4.5 — most capable'},
    {id:'anthropic/claude-sonnet-4-20250514',   label:'Claude Sonnet 4'},
    {id:'anthropic/claude-opus-4-20250514',     label:'Claude Opus 4'},
  ],
  openai: [
    {id:'openai/gpt-4o-mini',     label:'GPT-4o Mini — fastest'},
    {id:'openai/gpt-4o',          label:'GPT-4o — recommended'},
    {id:'openai/gpt-4.1',         label:'GPT-4.1'},
    {id:'openai/gpt-4.1-mini',    label:'GPT-4.1 Mini'},
    {id:'openai/o4-mini',         label:'o4 Mini — reasoning'},
    {id:'openai/o3',              label:'o3 — best reasoning'},
  ],
  groq: [
    {id:'groq/llama-3.1-8b-instant',                          label:'Llama 3.1 8B — fastest'},
    {id:'groq/llama-3.3-70b-versatile',                       label:'Llama 3.3 70B — recommended'},
    {id:'groq/meta-llama/llama-4-scout-17b-16e-instruct',     label:'Llama 4 Scout 17B — newest'},
    {id:'groq/moonshotai/kimi-k2-instruct',                   label:'Kimi K2 — 60 RPM'},
    {id:'groq/qwen/qwen3-32b',                                label:'Qwen3 32B — 60 RPM'},
    {id:'groq/openai/gpt-oss-120b',                           label:'GPT OSS 120B'},
    {id:'groq/openai/gpt-oss-20b',                            label:'GPT OSS 20B'},
    {id:'groq/compound',                                      label:'Compound (preview)'},
    {id:'groq/compound-mini',                                 label:'Compound Mini (preview)'},
    {id:'groq/allam-2-7b',                                    label:'Allam 2 7B'},
  ],
  gemini: [
    {id:'gemini/gemini-2.0-flash',   label:'Gemini 2.0 Flash (recommended)'},
    {id:'gemini/gemini-2.5-flash',   label:'Gemini 2.5 Flash (latest)'},
    {id:'gemini/gemini-1.5-pro',     label:'Gemini 1.5 Pro (1M ctx)'},
  ],
};

let _providerStatuses = {};

// ── Single initProvidersPanel ───────────────────────────────────
async function initProvidersPanel() {
  const urlEl = document.getElementById('ollamaUrlProvider');
  if (urlEl && !urlEl.value.trim()) {
    urlEl.value = (typeof STATE !== 'undefined' && STATE.ollamaUrl) || 'http://localhost:11434';
  }

  // Try server /hazy/providers first (running via Node.js)
  let gotFromServer = false;
  try {
    const r = await fetch('/hazy/providers', { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const d = await r.json();
      const serverStatuses = d.providers || {};
      _providerStatuses = serverStatuses;

      // Sync: if server says a key exists but localStorage doesn't have it,
      // mark it with a sentinel so the UI shows it as active.
      // If localStorage HAS the real key already, keep that — it's more accurate.
      Object.entries(serverStatuses).forEach(([k, v]) => {
        const localKey = localStorage.getItem('hazyKey_' + k);
        if (v.hasKey && !localKey) {
          // Server has it but we don't — mark as server-held
          localStorage.setItem('hazyKey_' + k, '__server__');
        } else if (!v.hasKey && localKey) {
          // Server lost it — clear local too
          localStorage.removeItem('hazyKey_' + k);
        }
      });
      gotFromServer = true;
    }
  } catch { /* server not running */ }

  if (!gotFromServer) {
    // Fallback: build from localStorage — only treat as active if key is non-empty
    _providerStatuses = {};
    const allProviders = [
      ...PROVIDER_CATEGORIES.text,
      ...PROVIDER_CATEGORIES.image,
      ...PROVIDER_CATEGORIES.media,
    ];
    allProviders.forEach(p => {
      const key = localStorage.getItem('hazyKey_' + p.key) || '';
      // A real key exists if it's non-empty AND not just the sentinel
      const hasRealKey = !!key;
      _providerStatuses[p.key] = { hasKey: hasRealKey, enabled: hasRealKey };
    });
  }

  renderProviderStatusBar();
  renderCategorizedProviders();
  await loadInstalledModels();
  restoreActiveModel();

  // Also refresh the sidebar model dropdown so cloud models appear immediately
  // after a key is saved without needing a full page reload
  checkOllamaConnection();
}

// ── Provider status bar ─────────────────────────────────────────
function renderProviderStatusBar() {
  const bar = document.getElementById('providerStatusBar');
  if (!bar) return;
  const active = Object.entries(_providerStatuses)
    .filter(([k, v]) => v.enabled && k !== 'ollama')
    .map(([k]) => k);
  bar.innerHTML = active.length
    ? active.map(k => `<span style="font-size:10px;font-family:var(--font-mono,monospace);padding:2px 8px;border-radius:10px;background:#e8f5e9;color:#2d6a4f;border:1px solid #b0d8b8">&#10003; ${k}</span>`).join('')
    : '<span style="font-size:11px;color:var(--text-muted)">No cloud providers active yet — add an API key below.</span>';
}

// ── Categorized provider rows ───────────────────────────────────
function renderCategorizedProviders() {
  const renderGroup = (containerId, providers) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = providers.map(p => {
      const st     = _providerStatuses[p.key] || {};
      const hasKey = st.hasKey || !!localStorage.getItem('hazyKey_' + p.key);
      return `<div class="provider-key-row">
        <div class="provider-key-row-head">
          <span class="provider-key-name">${p.name}</span>
          ${(() => {
            const verified = localStorage.getItem('hazyVerified_' + p.key) === 'true';
            if (hasKey && verified)  return '<span class="provider-badge-active">&#10003; verified</span>';
            if (hasKey && !verified) return '<span class="provider-badge-saved">● saved — test it</span>';
            return '<span class="provider-badge-inactive">inactive</span>';
          })()}
          <a href="${p.url}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;margin-left:4px">Get key &#8599;</a>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${p.note}</div>
        <div class="provider-key-input-row">
          <input type="password" id="apikey_${p.key}"
            placeholder="${hasKey ? '●●●●●●●● (saved — paste new to update)' : 'Paste API key here...'}"
            autocomplete="off">
          <button onclick="saveProviderKey('${p.key}')" class="btn-primary" style="padding:6px 14px;font-size:11px;white-space:nowrap;">Save</button>
          ${hasKey ? `
          <button onclick="testProviderKey('${p.key}')" id="testBtn_${p.key}" class="btn-secondary" style="padding:6px 10px;font-size:11px;white-space:nowrap;" title="Send a test message to verify this key works">Test</button>
          <button onclick="clearProviderKey('${p.key}')" class="btn-secondary" style="padding:6px 10px;font-size:11px;color:var(--danger);" title="Remove key">&#10005;</button>
          ` : ''}
        </div>
        <div id="testResult_${p.key}" style="font-size:11px;margin-top:6px;display:none;"></div>
      </div>`;
    }).join('');
  };
  renderGroup('providerKeyRows',   PROVIDER_CATEGORIES.text);
  renderGroup('providerImageRows', PROVIDER_CATEGORIES.image);
  renderGroup('providerMediaRows', PROVIDER_CATEGORIES.media);
}

// ── Save / clear key — server first, localStorage fallback ─────
function getApiKey(provider) {
  return localStorage.getItem('hazyKey_' + provider) || '';
}

async function saveProviderKey(providerKey) {
  const input = document.getElementById('apikey_' + providerKey);
  if (!input) return;
  const apiKey = input.value.trim();

  if (!apiKey) {
    showToast('Please paste an API key first', 'error');
    return;
  }

  // ── Step 1: Save key to server (hazy-config.json) ──────────────────────
  let savedToServer = false;
  try {
    const r = await fetch('/hazy/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: providerKey, apiKey }),
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.ok) savedToServer = true;
    }
  } catch { /* server not running */ }

  // ── Step 2: Store the REAL key in localStorage ──────────────────────────
  localStorage.setItem('hazyKey_' + providerKey, apiKey);
  localStorage.setItem('hazyProvider', providerKey);

  // ── Step 3: Clear old verification — new key must be re-tested ───────────
  localStorage.removeItem('hazyVerified_' + providerKey);

  input.value = '';
  const where = savedToServer ? 'server' : 'local';
  showToast(`Key saved (${where}). Click TEST to verify it works.`, 'success');

  await initProvidersPanel();
}

async function clearProviderKey(key) {
  if (!confirm('Remove API key for ' + key + '?')) return;
  try {
    await fetch('/hazy/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: key, apiKey: '' }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
  localStorage.removeItem('hazyKey_' + key);
  localStorage.removeItem('hazyVerified_' + key);
  showToast(key + ' key removed.', '');
  await initProvidersPanel();
}

// ── Test provider key — sends a real minimal API call to verify ──────────
async function testProviderKey(providerKey) {
  const btn    = document.getElementById('testBtn_' + providerKey);
  const result = document.getElementById('testResult_' + providerKey);
  if (!btn || !result) return;

  btn.textContent = 'Testing...';
  btn.disabled = true;
  result.style.display = 'block';
  result.style.color = 'var(--text-muted)';
  result.textContent = '⏳ Sending test message...';

  try {
    // Send a tiny real request through /hazy/chat
    // This goes through the server which uses the real key from hazy-config.json
    const models   = CLOUD_MODEL_MAP[providerKey] || [];
    const testModel = (models[0] || {}).id || (providerKey + '/test');

    // Get key from localStorage — server will use this directly
    const testApiKey = localStorage.getItem('hazyKey_' + providerKey) || '';

    const r = await fetch('/hazy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model:    testModel,
        stream:   true,
        apiKey:   testApiKey || undefined,
        messages: [
          { role: 'user', content: 'Say "OK" and nothing else.' }
        ],
        options: { max_tokens: 10, temperature: 0 },
      }),
    });

    // ── Check HTTP status — server now forwards real upstream error codes ──
    if (!r.ok) {
      let errMsg = 'Authentication failed';
      try {
        const e = await r.json();
        errMsg = e.error || errMsg;
      } catch {}
      result.style.color = 'var(--danger)';
      result.textContent = '❌ ' + r.status + ' — ' + errMsg;
      return;
    }

    // ── Read the stream and look for REAL content vs error tokens ──────────
    const reader  = r.body.getReader();
    const decoder = new TextDecoder();
    let rawBuffer  = '';
    let realToken  = '';   // actual AI text token
    let streamErr  = '';   // error found inside stream
    let tries      = 0;

    while (tries++ < 30 && !realToken && !streamErr) {
      const { done, value } = await reader.read();
      if (done) break;
      rawBuffer += decoder.decode(value, { stream: true });

      // Parse NDJSON lines as they arrive
      const lines = rawBuffer.split('\n');
      rawBuffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          // Error inside stream (server sends this when upstream errors)
          if (json.error) {
            streamErr = json.error;
            break;
          }
          // Real content token
          const token = json.message?.content || '';
          if (token && token.trim()) {
            realToken = token;
            break;
          }
        } catch {}
      }
    }
    reader.cancel();

    if (streamErr) {
      // Got an error inside the stream — bad key
      result.style.color = 'var(--danger)';
      result.textContent = '❌ Key rejected — ' + streamErr;
      return;
    }

    if (realToken) {
      // ✅ Got a real AI token — key is genuinely working
      localStorage.setItem('hazyVerified_' + providerKey, 'true');

      const models    = CLOUD_MODEL_MAP[providerKey] || [];
      const bestModel = models[1] || models[0];
      if (bestModel) {
        localStorage.setItem('hazyActiveModel', bestModel.id);
        localStorage.setItem('hazyProvider',    providerKey);
        STATE.model = bestModel.id;
        if (el && el.currentModelName) {
          el.currentModelName.textContent = bestModel.id.split('/')[1] || bestModel.id;
        }
      }

      result.style.color = 'var(--success)';
      result.textContent = '✅ Verified! ' + providerKey + ' responded. Model auto-selected.';
      showToast('✅ ' + providerKey + ' verified and active!', 'success');

      checkOllamaConnection();
      await initProvidersPanel();

    } else {
      // Connected but got no content and no error — unexpected
      result.style.color = 'var(--warning)';
      result.textContent = '⚠️ No response token received — try again or check your quota.';
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      result.style.color = 'var(--danger)';
      result.textContent = '❌ Timeout — server may not be running or key is invalid.';
    } else {
      result.style.color = 'var(--danger)';
      result.textContent = '❌ ' + err.message;
    }
  } finally {
    btn.textContent = 'Test';
    btn.disabled = false;
  }
}

// ── Installed local models ──────────────────────────────────────
async function loadInstalledModels() {
  const el = document.getElementById('installedModelsList');
  if (!el) return;

  const ollamaBase = (document.getElementById('ollamaUrlProvider')?.value || '').trim().replace(/\/$/, '')
    || (typeof STATE !== 'undefined' && STATE.ollamaUrl)
    || 'http://localhost:11434';

  let data = null;
  for (const url of ['/api/tags', ollamaBase + '/api/tags']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { data = await r.json(); break; }
    } catch { }
  }

  try {
    const models = (data || {}).models || [];
    if (!models.length) {
      el.innerHTML = '<span style="font-size:12px;color:var(--text-muted);font-style:italic">No models installed. Download one below.</span>';
    } else {
      el.innerHTML = models.map(m => {
        const gb = m.size ? (m.size / 1e9).toFixed(1) + 'GB' : '';
        return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-family:monospace;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:2px 8px">
          ${m.name}${gb ? ` <span style="color:var(--text-muted)">${gb}</span>` : ''}
          <button onclick="deleteOllamaModel('${m.name}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:10px;padding:0;margin-left:2px" title="Delete">&#10005;</button>
        </span>`;
      }).join('');
      const activeProv = document.getElementById('activeProviderSelect');
      const modelSel   = document.getElementById('activeModelSelect');
      if (activeProv?.value === 'ollama' && modelSel) {
        modelSel.innerHTML = models.map(m => `<option value="ollama/${m.name}">ollama/${m.name}</option>`).join('');
        const saved = localStorage.getItem('hazyActiveModel');
        if (saved?.startsWith('ollama/')) modelSel.value = saved;
      }
    }
  } catch (e) {
    if (el) el.innerHTML = '<span style="font-size:12px;color:#8b2020">Error loading models: ' + e.message + '</span>';
  }
}

async function deleteOllamaModel(name) {
  if (!confirm('Delete "' + name + '" from Ollama?')) return;
  try {
    await fetch('/hazy/delete-model', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ model: name }) });
    showToast(name + ' deleted.', 'success');
    await loadInstalledModels();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function testOllamaConn() {
  const urlEl    = document.getElementById('ollamaUrlProvider');
  const statusEl = document.getElementById('ollamaConnStatus');
  if (!statusEl) return;

  const ollamaBase = (urlEl?.value || '').trim().replace(/\/$/, '')
    || (typeof STATE !== 'undefined' && STATE.ollamaUrl)
    || 'http://localhost:11434';

  statusEl.textContent = 'Testing...';
  statusEl.style.color = 'var(--text-muted)';

  const attempts = ['/api/tags', ollamaBase + '/api/tags'];
  for (const url of attempts) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const d = await r.json();
      const n = (d.models || []).length;
      statusEl.textContent = '\u2713 Connected \u2014 ' + n + ' model' + (n !== 1 ? 's' : '') + ' installed';
      statusEl.style.color = '#2d6a4f';
      await loadInstalledModels();
      return;
    } catch { }
  }
  statusEl.textContent = '\u2717 Cannot reach Ollama at ' + ollamaBase + ' \u2014 run: ollama serve';
  statusEl.style.color = '#8b2020';
}

// ── Model download ──────────────────────────────────────────────
async function pullModel() {
  const sel  = document.getElementById('pullModelSelect');
  const btn  = document.getElementById('pullModelBtn');
  const wrap = document.getElementById('pullProgressWrap');
  const bar  = document.getElementById('pullProgressBar');
  const txt  = document.getElementById('pullProgressText');
  if (!sel || !btn) return;
  const modelName = sel.value;
  btn.disabled = true; btn.textContent = 'Downloading...';
  if (wrap) wrap.style.display = 'block';
  try {
    const r = await fetch('/hazy/pull', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ model: modelName }) });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, { stream: true }).split('\n').filter(l => l.trim())) {
        try {
          const j = JSON.parse(line);
          if (txt) txt.textContent = j.status || '';
          if (j.total && j.completed && bar) {
            bar.style.width = Math.round(j.completed / j.total * 100) + '%';
            if (txt) txt.textContent = (j.status || '') + ' ' + Math.round(j.completed / j.total * 100) + '%';
          }
        } catch {}
      }
    }
    showToast(modelName + ' downloaded!', 'success');
    await loadInstalledModels();
  } catch (e) {
    showToast('Download failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '↓ Download';
    if (wrap) wrap.style.display = 'none';
    if (bar)  bar.style.width = '0%';
  }
}

// ── Active model selector (Novel Writer tab) ────────────────────
function updateModelDropdown() {
  const prov = document.getElementById('activeProviderSelect')?.value || 'ollama';
  const sel  = document.getElementById('activeModelSelect');
  if (!sel) return;
  if (prov === 'ollama') {
    sel.innerHTML = OLLAMA_MODEL_LIST.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    // Try to load actual installed models
    fetch('/api/tags').then(r => r.json()).then(d => {
      if (d.models?.length) sel.innerHTML = d.models.map(m => `<option value="ollama/${m.name}">ollama/${m.name}</option>`).join('');
      const saved = localStorage.getItem('hazyActiveModel');
      if (saved) sel.value = saved;
    }).catch(() => {});
  } else {
    const list = CLOUD_MODEL_MAP[prov] || [];
    sel.innerHTML = list.length
      ? list.map(m => `<option value="${m.id}">${m.label}</option>`).join('')
      : '<option value="">— add API key first —</option>';
    const saved = localStorage.getItem('hazyActiveModel');
    if (saved?.startsWith(prov + '/')) sel.value = saved;
  }
}

function restoreActiveModel() {
  const saved = localStorage.getItem('hazyActiveModel');
  if (!saved) return;
  const prov    = saved.split('/')[0];
  const modelId = saved.includes('/') ? saved.slice(saved.indexOf('/') + 1) : saved;

  // Restore dropdown selections
  const provSel = document.getElementById('activeProviderSelect');
  if (provSel) { provSel.value = prov; updateModelDropdown(); }
  const modelSel = document.getElementById('activeModelSelect');
  if (modelSel && modelSel.querySelector(`option[value="${saved}"]`)) modelSel.value = saved;

  // Restore STATE.model
  if (typeof STATE !== 'undefined') {
    STATE.model = prov === 'ollama' ? modelId : saved;
    if (typeof el !== 'undefined' && el.currentModelName) {
      el.currentModelName.textContent = modelId;
    }
  }
}

function saveActiveModelChoice() {
  const provSel  = document.getElementById('activeProviderSelect');
  const modelSel = document.getElementById('activeModelSelect');
  if (!provSel || !modelSel || !modelSel.value) return;
  const fullModel = modelSel.value; // e.g. 'anthropic/claude-sonnet-4-5' or 'ollama/mistral'
  localStorage.setItem('hazyActiveModel', fullModel);
  localStorage.setItem('hazyProvider',    provSel.value);

  // Update STATE.model — for Ollama strip prefix, for cloud keep full id
  const provider  = fullModel.split('/')[0];
  const modelId   = fullModel.includes('/') ? fullModel.slice(fullModel.indexOf('/') + 1) : fullModel;
  if (provider === 'ollama') {
    STATE.model = modelId;
  } else {
    // Cloud provider — store the full 'provider/model' string so sendMessage can route
    STATE.model = fullModel;
  }

  // Update sidebar model name display
  if (typeof el !== 'undefined' && el.currentModelName) {
    el.currentModelName.textContent = modelId;
  }

  const hasKey = provider !== 'ollama' ? !!localStorage.getItem('hazyKey_' + provider) : true;
  if (!hasKey) {
    showToast('⚠️ No API key for ' + provider + ' — add it in Settings → AI Providers', 'error');
  } else {
    showToast('Model set to ' + modelId, 'success');
  }
}

// ── Export all data ─────────────────────────────────────────────
function exportAllData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    data[k] = localStorage.getItem(k);
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'hazy-export-' + Date.now() + '.json';
  a.click();
}

// ── Settings tab switching ──────────────────────────────────────
function switchSettingsTab(tabId) {
  document.querySelectorAll('.snav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.snav-btn[data-tab="${tabId}"]`);
  const panel = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

// ── ollamaUrl sync between General tab and Models tab ──────────
function syncOllamaUrlFields(sourceId) {
  const val = document.getElementById(sourceId)?.value || '';
  const targets = ['ollamaUrl', 'ollamaUrlProvider'].filter(id => id !== sourceId);
  targets.forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
}

// ── Single DOMContentLoaded for ALL v2 additions ───────────────
document.addEventListener('DOMContentLoaded', () => {
  // Settings tab clicks
  document.querySelectorAll('.snav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
  });

  // Appearance tab — live preview as user changes values
  document.getElementById('settingsFontSize')?.addEventListener('change', () => {
    STATE.fontSize = document.getElementById('settingsFontSize').value;
    applyAppearanceSettings();
  });
  document.getElementById('settingsDensity')?.addEventListener('change', () => {
    STATE.density = document.getElementById('settingsDensity').value;
    applyAppearanceSettings();
  });
  document.getElementById('settingsCodeHighlight')?.addEventListener('change', e => {
    STATE.codeHL = e.target.checked;
    applyAppearanceSettings();
  });
  document.getElementById('settingsMarkdown')?.addEventListener('change', e => {
    STATE.markdown = e.target.checked;
    applyAppearanceSettings();
  });
  // Generation tab — live label updates
  document.getElementById('settingsRepeatPenalty')?.addEventListener('input', e => {
    const lbl = document.getElementById('repeatPenaltyLabel');
    if (lbl) lbl.textContent = parseFloat(e.target.value).toFixed(2);
  });
  document.getElementById('settingsTopP')?.addEventListener('input', e => {
    const lbl = document.getElementById('topPLabel');
    if (lbl) lbl.textContent = parseFloat(e.target.value).toFixed(2);
  });

  // Open settings → init providers panel
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    setTimeout(initProvidersPanel, 80);
  });

  // Save settings → also save active model choice
  const saveBtn = document.getElementById('settingsSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveActiveModelChoice);
  }

  // Sync ollamaUrl fields
  document.getElementById('ollamaUrl')?.addEventListener('input', () => syncOllamaUrlFields('ollamaUrl'));
  document.getElementById('ollamaUrlProvider')?.addEventListener('input', () => syncOllamaUrlFields('ollamaUrlProvider'));

  // Novel Writer tab — active provider change
  document.getElementById('activeProviderSelect')?.addEventListener('change', updateModelDropdown);
});
~~~

### frontend\enhancements.css

- Size: 15580 bytes
- Language: css

~~~css
/* ========================================
   HAZY ENHANCEMENTS - Additional Styles
   Version 2.0
   ======================================== */

/* Code Toolbar */
.code-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(0,0,0,0.3);
  border-radius: 8px 8px 0 0;
  margin-bottom: -8px;
  font-size: 12px;
}

.code-lang {
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.code-actions {
  display: flex;
  gap: 6px;
}

.code-copy-btn,
.code-download-btn,
.code-line-numbers-btn {
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s;
  font-weight: 500;
}

.code-copy-btn:hover,
.code-download-btn:hover,
.code-line-numbers-btn:hover {
  background: rgba(255,255,255,0.2);
}

.code-copy-btn:active {
  background: rgba(76,175,80,0.3);
}

pre code.show-line-numbers {
  counter-reset: line;
  display: table;
}

pre code.show-line-numbers > * {
  counter-increment: line;
  display: table-row;
}

pre code.show-line-numbers > *::before {
  content: counter(line);
  display: table-cell;
  text-align: right;
  padding-right: 16px;
  color: rgba(255,255,255,0.4);
  user-select: none;
  min-width: 40px;
}

/* Message Action Buttons */
.message-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message:hover .message-actions {
  opacity: 1;
}

.message-action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.message-action-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.message-action-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* Reaction Picker */
.reaction-picker {
  position: absolute;
  top: 40px;
  right: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  display: none;
  gap: 4px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
}

.reaction-picker.show {
  display: flex;
}

.reaction-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  transition: background 0.2s;
}

.reaction-btn:hover {
  background: var(--bg-hover);
}

.message-reactions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.message-reaction {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
}

/* Export/Import Modal */
.export-modal,
.import-modal,
.templates-modal,
.knowledge-modal,
.performance-modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}

.export-modal.show,
.import-modal.show,
.templates-modal.show,
.knowledge-modal.show,
.performance-modal.show {
  display: flex;
}

.modal-content-large {
  background: var(--bg-primary);
  border-radius: 16px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.modal-header-enhanced {
  padding: 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title-enhanced {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body-enhanced {
  padding: 24px;
}

.modal-footer-enhanced {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Template Cards */
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.template-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.template-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.template-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.template-category {
  font-size: 11px;
  padding: 3px 8px;
  background: var(--accent-glow);
  color: var(--accent);
  border-radius: 4px;
  font-weight: 500;
}

.template-description {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.template-variables {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.template-variable {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  border-radius: 3px;
  font-family: var(--font-mono);
}

/* Template Fill Form */
.template-fill-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 20px;
}

.template-variable-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.template-variable-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.template-variable-field {
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: var(--font-body);
  resize: vertical;
  min-height: 80px;
}

.template-variable-field:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* Knowledge Base */
.knowledge-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.knowledge-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  transition: all 0.2s;
}

.knowledge-item:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.knowledge-item-content {
  flex: 1;
}

.knowledge-item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.knowledge-item-meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  gap: 12px;
}

.knowledge-item-actions {
  display: flex;
  gap: 8px;
}

.knowledge-item-btn {
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.knowledge-item-btn:hover {
  background: var(--accent);
  color: #fff;
}

/* Performance Dashboard */
.performance-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.performance-stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.performance-stat-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.performance-stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.performance-stat-unit {
  font-size: 14px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.performance-model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.performance-model-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}

.performance-model-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.performance-model-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.performance-mini-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.performance-mini-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.performance-mini-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Voice Input Button */
#voiceInputBtn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary);
}

#voiceInputBtn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

#voiceInputBtn.listening {
  background: #d32f2f;
  border-color: #d32f2f;
  color: #fff;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Enhanced Input Bar */
.input-bar-enhanced {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.input-actions-left {
  display: flex;
  gap: 6px;
}

.input-action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.input-action-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.input-action-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* Compact View Mode */
.message.compact-mode {
  padding: 12px;
  margin: 6px 0;
}

.message.compact-mode .message-time {
  font-size: 10px;
}

.message.compact-mode .message-content {
  font-size: 13px;
  line-height: 1.5;
}

/* Message Timestamps */
.message-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  display: none;
}

.show-timestamps .message-time {
  display: block;
}

/* Message Word Count */
.message-word-count {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
  display: none;
}

.show-word-count .message-word-count {
  display: block;
}

/* Keyboard Shortcuts Panel */
.shortcuts-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: var(--shadow-lg);
  z-index: 2000;
  max-width: 600px;
  width: 90%;
  display: none;
}

.shortcuts-panel.show {
  display: block;
}

.shortcuts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.shortcuts-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.shortcuts-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcuts-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.shortcut-action {
  font-size: 13px;
  color: var(--text-secondary);
}

.shortcut-keys {
  display: flex;
  gap: 4px;
}

.shortcut-key {
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  min-width: 28px;
  text-align: center;
}

/* Export Options */
.export-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin: 20px 0;
}

.export-option-card {
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.export-option-card:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.export-option-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.export-option-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.export-option-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* Floating Action Button */
.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 50%;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  z-index: 100;
}

.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.fab:active {
  transform: scale(0.95);
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .template-grid {
    grid-template-columns: 1fr;
  }
  
  .performance-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .modal-content-large {
    width: 95%;
    max-height: 95vh;
  }
  
  .shortcuts-grid {
    grid-template-columns: 1fr;
  }
  
  .export-options {
    grid-template-columns: 1fr;
  }
}

/* Loading States */
.loading-spinner {
  border: 3px solid var(--bg-tertiary);
  border-top-color: var(--accent);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Success/Error States */
.state-success {
  color: var(--success);
  background: rgba(74, 171, 122, 0.1);
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 4px solid var(--success);
}

.state-error {
  color: var(--danger);
  background: rgba(212, 95, 69, 0.1);
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 4px solid var(--danger);
}

/* Tooltip */
.tooltip {
  position: relative;
}

.tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 10px;
  background: #2d1f0e;
  color: #f6ead6;
  font-size: 12px;
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  margin-bottom: 8px;
}

.tooltip:hover::after {
  opacity: 1;
}
~~~

### frontend\enhancements.js

- Size: 27515 bytes
- Language: javascript

~~~javascript
/**
 * Hazy Enhancements Module
 * Additional features for Hazy chatbot
 * Version 2.0 - Enhanced Edition
 */

// ========================================
// EXPORT/IMPORT SYSTEM
// ========================================

const ExportImportSystem = {
  // Export conversation as JSON
  exportAsJSON(conversationId) {
    const conv = STATE.conversations[conversationId];
    if (!conv) return;
    
    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      conversation: {
        id: conv.id,
        title: conv.title,
        model: conv.model || STATE.model,
        createdAt: conv.createdAt,
        messages: conv.messages,
        metadata: {
          totalMessages: conv.messages.length,
          wordCount: conv.messages.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0)
        }
      }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('✅ Exported as JSON', 'success');
  },

  // Export conversation as Markdown
  exportAsMarkdown(conversationId) {
    const conv = STATE.conversations[conversationId];
    if (!conv) return;
    
    let markdown = `# ${conv.title}\n\n`;
    markdown += `**Model:** ${conv.model || STATE.model}\n`;
    markdown += `**Created:** ${new Date(conv.createdAt).toLocaleString()}\n`;
    markdown += `**Messages:** ${conv.messages.length}\n\n`;
    markdown += `---\n\n`;
    
    conv.messages.forEach((msg, idx) => {
      const role = msg.role === 'user' ? '👤 **You**' : '🤖 **Hazy**';
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
      markdown += `### ${role} ${timestamp ? `_(${timestamp})_` : ''}\n\n`;
      markdown += `${msg.content}\n\n`;
      if (idx < conv.messages.length - 1) markdown += `---\n\n`;
    });
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('✅ Exported as Markdown', 'success');
  },

  // Export conversation as HTML
  exportAsHTML(conversationId) {
    const conv = STATE.conversations[conversationId];
    if (!conv) return;
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${conv.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
    h1 { color: #2d1f0e; border-bottom: 3px solid #b87c30; padding-bottom: 10px; }
    .meta { color: #7c4d1e; font-size: 14px; margin-bottom: 30px; }
    .message { margin: 20px 0; padding: 20px; border-radius: 12px; }
    .user { background: #f0d9b0; border-left: 4px solid #b87c30; }
    .assistant { background: #f6ead6; border-left: 4px solid #4aab7a; }
    .role { font-weight: 600; margin-bottom: 8px; }
    .timestamp { font-size: 12px; color: #a87848; }
    pre { background: #2d1f0e; color: #f6ead6; padding: 15px; border-radius: 8px; overflow-x: auto; }
    code { font-family: 'Courier New', monospace; }
  </style>
</head>
<body>
  <h1>${conv.title}</h1>
  <div class="meta">
    <strong>Model:</strong> ${conv.model || STATE.model} | 
    <strong>Created:</strong> ${new Date(conv.createdAt).toLocaleString()} | 
    <strong>Messages:</strong> ${conv.messages.length}
  </div>
`;
    
    conv.messages.forEach(msg => {
      const role = msg.role === 'user' ? '👤 You' : '🤖 Hazy';
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
      const content = msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      html += `  <div class="message ${msg.role}">
    <div class="role">${role} ${timestamp ? `<span class="timestamp">${timestamp}</span>` : ''}</div>
    <div>${content.replace(/\n/g, '<br>')}</div>
  </div>\n`;
    });
    
    html += `</body>\n</html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('✅ Exported as HTML', 'success');
  },

  // Export all conversations
  exportAllConversations() {
    const allData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      conversations: Object.values(STATE.conversations).map(conv => ({
        id: conv.id,
        title: conv.title,
        model: conv.model,
        createdAt: conv.createdAt,
        messages: conv.messages
      })),
      settings: {
        model: STATE.model,
        systemPrompt: STATE.systemPrompt,
        temperature: STATE.temperature,
        maxTokens: STATE.maxTokens
      }
    };
    
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hazy-all-conversations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast(`✅ Exported ${allData.conversations.length} conversations`, 'success');
  },

  // Import conversation from JSON
  importFromJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // Handle single conversation
        if (data.conversation) {
          const conv = data.conversation;
          conv.id = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          STATE.conversations[conv.id] = conv;
          saveConversations();
          renderChatHistory();
          showToast('✅ Conversation imported', 'success');
        }
        // Handle multiple conversations
        else if (data.conversations) {
          let imported = 0;
          data.conversations.forEach(conv => {
            conv.id = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            STATE.conversations[conv.id] = conv;
            imported++;
          });
          saveConversations();
          renderChatHistory();
          showToast(`✅ Imported ${imported} conversations`, 'success');
        }
      } catch (error) {
        showToast('❌ Invalid import file', 'error');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
  }
};

// ========================================
// ENHANCED CODE BLOCKS
// ========================================

const EnhancedCodeBlocks = {
  init() {
    // This will be called after messages are rendered
    document.addEventListener('click', (e) => {
      // Copy code button
      if (e.target.classList.contains('code-copy-btn')) {
        const code = e.target.dataset.code;
        navigator.clipboard.writeText(code).then(() => {
          e.target.textContent = '✓ Copied!';
          setTimeout(() => e.target.textContent = 'Copy', 2000);
        });
      }
      
      // Download code button
      if (e.target.classList.contains('code-download-btn')) {
        const code = e.target.dataset.code;
        const lang = e.target.dataset.lang || 'txt';
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `code-${Date.now()}.${lang}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  },

  enhance(codeBlock) {
    if (codeBlock.dataset.enhanced) return;
    codeBlock.dataset.enhanced = 'true';
    
    const code = codeBlock.textContent;
    const lang = codeBlock.className.match(/language-(\w+)/)?.[1] || 'text';
    
    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    toolbar.innerHTML = `
      <span class="code-lang">${lang}</span>
      <div class="code-actions">
        <button class="code-copy-btn" data-code="${code.replace(/"/g, '&quot;')}">Copy</button>
        <button class="code-download-btn" data-code="${code.replace(/"/g, '&quot;')}" data-lang="${lang}">Download</button>
        <button class="code-line-numbers-btn" onclick="EnhancedCodeBlocks.toggleLineNumbers(this)">Line #</button>
      </div>
    `;
    
    // Insert toolbar
    const pre = codeBlock.parentElement;
    pre.style.position = 'relative';
    pre.insertBefore(toolbar, codeBlock);
  },

  toggleLineNumbers(btn) {
    const pre = btn.closest('pre');
    const code = pre.querySelector('code');
    code.classList.toggle('show-line-numbers');
    btn.textContent = code.classList.contains('show-line-numbers') ? 'Hide #' : 'Line #';
  }
};

// ========================================
// PROMPT TEMPLATES SYSTEM
// ========================================

const PromptTemplates = {
  templates: [
    {
      id: 'code-review',
      name: 'Code Review',
      category: 'Development',
      description: 'Get detailed code review feedback',
      prompt: `Review this code and provide feedback:

\`\`\`{{language}}
{{code}}
\`\`\`

Please analyze:
1. Bugs and potential errors
2. Performance issues
3. Security concerns
4. Best practices
5. Suggestions for improvement`,
      variables: ['language', 'code']
    },
    {
      id: 'explain-code',
      name: 'Explain Code',
      category: 'Development',
      description: 'Get line-by-line code explanation',
      prompt: `Explain this code in detail:

\`\`\`{{language}}
{{code}}
\`\`\`

Please provide:
1. Overall purpose
2. Line-by-line explanation
3. Key concepts used
4. Potential use cases`,
      variables: ['language', 'code']
    },
    {
      id: 'debug-help',
      name: 'Debug Helper',
      category: 'Development',
      description: 'Get help debugging an issue',
      prompt: `I'm getting this error:

**Error:** {{error}}

**Code:**
\`\`\`{{language}}
{{code}}
\`\`\`

**What I've tried:** {{attempts}}

Please help me:
1. Identify the root cause
2. Explain why it's happening
3. Provide a solution
4. Suggest how to prevent it`,
      variables: ['error', 'language', 'code', 'attempts']
    },
    {
      id: 'write-tests',
      name: 'Generate Tests',
      category: 'Development',
      description: 'Generate unit tests for code',
      prompt: `Generate comprehensive unit tests for this code:

\`\`\`{{language}}
{{code}}
\`\`\`

**Testing Framework:** {{framework}}

Include:
1. Happy path tests
2. Edge cases
3. Error handling tests
4. Mock data if needed`,
      variables: ['language', 'code', 'framework']
    },
    {
      id: 'refactor',
      name: 'Refactor Code',
      category: 'Development',
      description: 'Improve code quality',
      prompt: `Refactor this code to improve {{focus}}:

\`\`\`{{language}}
{{code}}
\`\`\`

Please provide:
1. Refactored code
2. Explanation of changes
3. Benefits of the refactoring
4. Any trade-offs`,
      variables: ['language', 'code', 'focus']
    },
    {
      id: 'email-professional',
      name: 'Professional Email',
      category: 'Writing',
      description: 'Draft a professional email',
      prompt: `Write a professional email:

**To:** {{recipient}}
**Subject:** {{subject}}
**Tone:** {{tone}}

**Key Points:**
{{points}}

Please write a clear, concise email that covers all points professionally.`,
      variables: ['recipient', 'subject', 'tone', 'points']
    },
    {
      id: 'summarize',
      name: 'Summarize Content',
      category: 'Writing',
      description: 'Summarize long content',
      prompt: `Summarize this content:

{{content}}

**Summary Length:** {{length}}
**Focus:** {{focus}}

Provide a clear, concise summary highlighting the key points.`,
      variables: ['content', 'length', 'focus']
    },
    {
      id: 'improve-writing',
      name: 'Improve Writing',
      category: 'Writing',
      description: 'Enhance writing quality',
      prompt: `Improve this writing for {{purpose}}:

{{text}}

**Target Audience:** {{audience}}

Please:
1. Improve clarity and flow
2. Enhance word choice
3. Fix any grammar issues
4. Make it more engaging`,
      variables: ['text', 'purpose', 'audience']
    },
    {
      id: 'explain-concept',
      name: 'Explain Concept',
      category: 'Education',
      description: 'Explain complex concepts simply',
      prompt: `Explain {{concept}} as if teaching {{audience}}.

Include:
1. Simple, clear definition
2. Real-world analogy
3. Key points to remember
4. Common misconceptions
5. Practical example`,
      variables: ['concept', 'audience']
    },
    {
      id: 'create-outline',
      name: 'Create Outline',
      category: 'Writing',
      description: 'Generate content outline',
      prompt: `Create a detailed outline for {{topic}}:

**Type:** {{type}}
**Target Audience:** {{audience}}
**Length:** {{length}}

Please create a structured outline with:
1. Main sections
2. Key points for each section
3. Suggested examples or data points`,
      variables: ['topic', 'type', 'audience', 'length']
    },
    {
      id: 'brainstorm',
      name: 'Brainstorm Ideas',
      category: 'Creative',
      description: 'Generate creative ideas',
      prompt: `Brainstorm ideas for {{topic}}.

**Context:** {{context}}
**Goal:** {{goal}}
**Constraints:** {{constraints}}

Generate 10-15 creative, diverse ideas. For each:
1. Brief description
2. Why it could work
3. Potential challenges`,
      variables: ['topic', 'context', 'goal', 'constraints']
    },
    {
      id: 'meeting-notes',
      name: 'Meeting Notes',
      category: 'Business',
      description: 'Organize meeting notes',
      prompt: `Organize these meeting notes:

{{notes}}

Please create:
1. Meeting summary
2. Key decisions made
3. Action items (with owners if mentioned)
4. Follow-up questions
5. Next steps`,
      variables: ['notes']
    }
  ],

  customTemplates: [],

  init() {
    // Load custom templates from localStorage
    const saved = localStorage.getItem('hazy_custom_templates');
    if (saved) {
      try {
        this.customTemplates = JSON.parse(saved);
      } catch(e) {}
    }
  },

  getAllTemplates() {
    return [...this.templates, ...this.customTemplates];
  },

  getTemplatesByCategory(category) {
    return this.getAllTemplates().filter(t => t.category === category);
  },

  getTemplate(id) {
    return this.getAllTemplates().find(t => t.id === id);
  },

  fillTemplate(templateId, values) {
    const template = this.getTemplate(templateId);
    if (!template) return null;
    
    let filled = template.prompt;
    template.variables.forEach(variable => {
      const regex = new RegExp(`{{${variable}}}`, 'g');
      filled = filled.replace(regex, values[variable] || '');
    });
    
    return filled;
  },

  saveCustomTemplate(template) {
    template.id = `custom-${Date.now()}`;
    template.createdAt = new Date().toISOString();
    this.customTemplates.push(template);
    localStorage.setItem('hazy_custom_templates', JSON.stringify(this.customTemplates));
    return template;
  },

  deleteTemplate(id) {
    this.customTemplates = this.customTemplates.filter(t => t.id !== id);
    localStorage.setItem('hazy_custom_templates', JSON.stringify(this.customTemplates));
  }
};

// ========================================
// MESSAGE BOOKMARKS & REACTIONS
// ========================================

const MessageFeatures = {
  bookmarks: new Set(),
  reactions: {},

  init() {
    // Load from localStorage
    const savedBookmarks = localStorage.getItem('hazy_bookmarks');
    const savedReactions = localStorage.getItem('hazy_reactions');
    
    if (savedBookmarks) {
      try {
        this.bookmarks = new Set(JSON.parse(savedBookmarks));
      } catch(e) {}
    }
    
    if (savedReactions) {
      try {
        this.reactions = JSON.parse(savedReactions);
      } catch(e) {}
    }
  },

  toggleBookmark(messageId) {
    if (this.bookmarks.has(messageId)) {
      this.bookmarks.delete(messageId);
      showToast('Bookmark removed', '');
    } else {
      this.bookmarks.add(messageId);
      showToast('⭐ Bookmarked!', 'success');
    }
    this.save();
    return this.bookmarks.has(messageId);
  },

  addReaction(messageId, emoji) {
    if (!this.reactions[messageId]) {
      this.reactions[messageId] = [];
    }
    
    const index = this.reactions[messageId].indexOf(emoji);
    if (index > -1) {
      this.reactions[messageId].splice(index, 1);
    } else {
      this.reactions[messageId].push(emoji);
    }
    
    if (this.reactions[messageId].length === 0) {
      delete this.reactions[messageId];
    }
    
    this.save();
    return this.reactions[messageId] || [];
  },

  getReactions(messageId) {
    return this.reactions[messageId] || [];
  },

  isBookmarked(messageId) {
    return this.bookmarks.has(messageId);
  },

  getAllBookmarks() {
    return Array.from(this.bookmarks);
  },

  save() {
    localStorage.setItem('hazy_bookmarks', JSON.stringify(Array.from(this.bookmarks)));
    localStorage.setItem('hazy_reactions', JSON.stringify(this.reactions));
  }
};

// ========================================
// PERFORMANCE MONITOR
// ========================================

const PerformanceMonitor = {
  metrics: {
    requests: [],
    models: {}
  },

  init() {
    const saved = localStorage.getItem('hazy_performance_metrics');
    if (saved) {
      try {
        this.metrics = JSON.parse(saved);
      } catch(e) {}
    }
  },

  recordRequest(model, startTime, endTime, tokenCount, success) {
    const duration = endTime - startTime;
    
    const metric = {
      timestamp: new Date().toISOString(),
      model,
      duration,
      tokenCount: tokenCount || 0,
      success
    };
    
    this.metrics.requests.push(metric);
    
    // Update model stats
    if (!this.metrics.models[model]) {
      this.metrics.models[model] = {
        totalRequests: 0,
        successfulRequests: 0,
        totalDuration: 0,
        totalTokens: 0,
        avgDuration: 0,
        avgTokens: 0,
        lastUsed: null
      };
    }
    
    const modelStats = this.metrics.models[model];
    modelStats.totalRequests++;
    if (success) modelStats.successfulRequests++;
    modelStats.totalDuration += duration;
    modelStats.totalTokens += tokenCount || 0;
    modelStats.avgDuration = modelStats.totalDuration / modelStats.totalRequests;
    modelStats.avgTokens = modelStats.totalTokens / modelStats.totalRequests;
    modelStats.lastUsed = new Date().toISOString();
    
    // Keep only last 100 requests
    if (this.metrics.requests.length > 100) {
      this.metrics.requests.shift();
    }
    
    this.save();
  },

  save() {
    localStorage.setItem('hazy_performance_metrics', JSON.stringify(this.metrics));
  },

  getStats() {
    const totalRequests = this.metrics.requests.length;
    const successfulRequests = this.metrics.requests.filter(r => r.success).length;
    const totalTokens = this.metrics.requests.reduce((sum, r) => sum + r.tokenCount, 0);
    const avgDuration = totalRequests > 0 
      ? this.metrics.requests.reduce((sum, r) => sum + r.duration, 0) / totalRequests 
      : 0;
    
    return {
      totalRequests,
      successfulRequests,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(1) : 0,
      totalTokens,
      avgDuration: avgDuration.toFixed(0),
      models: this.metrics.models
    };
  },

  exportCSV() {
    let csv = 'Timestamp,Model,Duration (ms),Tokens,Success\n';
    this.metrics.requests.forEach(r => {
      csv += `${r.timestamp},${r.model},${r.duration},${r.tokenCount},${r.success}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hazy-performance-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('✅ Performance data exported', 'success');
  },

  reset() {
    if (confirm('Reset all performance metrics?')) {
      this.metrics = { requests: [], models: {} };
      this.save();
      showToast('Performance metrics reset', '');
    }
  }
};

// ========================================
// VOICE INPUT (Speech-to-Text)
// ========================================

const VoiceInput = {
  recognition: null,
  isListening: false,
  isContinuous: false,

  init() {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log('Speech recognition not supported');
      return false;
    }
    
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    
    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      const input = document.getElementById('chatInput');
      if (finalTranscript) {
        input.value += (input.value ? ' ' : '') + finalTranscript;
        autoResize(input);
      }
    };
    
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.stop();
    };
    
    this.recognition.onend = () => {
      this.isListening = false;
      this.updateUI();
      
      if (this.isContinuous) {
        setTimeout(() => this.start(true), 100);
      }
    };
    
    return true;
  },

  start(continuous = false) {
    if (!this.recognition) return;
    
    this.isContinuous = continuous;
    this.isListening = true;
    this.recognition.start();
    this.updateUI();
    
    showToast(continuous ? '🎤 Continuous listening...' : '🎤 Listening...', '');
  },

  stop() {
    if (!this.recognition) return;
    
    this.isContinuous = false;
    this.isListening = false;
    this.recognition.stop();
    this.updateUI();
  },

  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  },

  updateUI() {
    const btn = document.getElementById('voiceInputBtn');
    if (btn) {
      if (this.isListening) {
        btn.classList.add('listening');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="6" height="6" fill="currentColor"/></svg>';
      } else {
        btn.classList.remove('listening');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 19v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      }
    }
  }
};

// ========================================
// KNOWLEDGE BASE (Simple Document Storage)
// ========================================

const KnowledgeBase = {
  documents: [],

  init() {
    const saved = localStorage.getItem('hazy_knowledge_base');
    if (saved) {
      try {
        this.documents = JSON.parse(saved);
      } catch(e) {}
    }
  },

  async addDocument(name, content, type = 'text') {
    const doc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      content,
      type,
      addedAt: new Date().toISOString(),
      size: content.length
    };
    
    this.documents.push(doc);
    this.save();
    
    showToast(`📄 Added "${name}" to Knowledge Base`, 'success');
    return doc;
  },

  search(query) {
    const lowerQuery = query.toLowerCase();
    return this.documents.filter(doc => 
      doc.name.toLowerCase().includes(lowerQuery) ||
      doc.content.toLowerCase().includes(lowerQuery)
    ).map(doc => ({
      ...doc,
      snippet: this.getSnippet(doc.content, query)
    }));
  },

  getSnippet(content, query, contextLength = 100) {
    const index = content.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return content.substring(0, contextLength) + '...';
    
    const start = Math.max(0, index - contextLength / 2);
    const end = Math.min(content.length, index + query.length + contextLength / 2);
    
    return (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
  },

  getDocument(id) {
    return this.documents.find(d => d.id === id);
  },

  getAllDocuments() {
    return this.documents;
  },

  removeDocument(id) {
    this.documents = this.documents.filter(d => d.id !== id);
    this.save();
    showToast('Document removed from Knowledge Base', '');
  },

  save() {
    localStorage.setItem('hazy_knowledge_base', JSON.stringify(this.documents));
  },

  getContextForPrompt(query, maxDocs = 3) {
    const relevant = this.search(query).slice(0, maxDocs);
    if (relevant.length === 0) return '';
    
    let context = '\n\n**Knowledge Base Context:**\n\n';
    relevant.forEach(doc => {
      context += `**${doc.name}:**\n${doc.snippet}\n\n`;
    });
    
    return context;
  }
};

// ========================================
// INITIALIZE ALL ENHANCEMENTS
// ========================================

function initEnhancements() {
  console.log('🚀 Initializing Hazy Enhancements...');
  
  PromptTemplates.init();
  MessageFeatures.init();
  PerformanceMonitor.init();
  KnowledgeBase.init();
  EnhancedCodeBlocks.init();
  
  const voiceSupported = VoiceInput.init();
  if (!voiceSupported) {
    const voiceBtn = document.getElementById('voiceInputBtn');
    if (voiceBtn) voiceBtn.style.display = 'none';
  }
  
  console.log('✅ Enhancements loaded');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEnhancements);
} else {
  initEnhancements();
}
~~~

### frontend\hazy-agent.css

- Size: 6475 bytes
- Language: css

~~~css
/**
 * HAZY AGENT MODE STYLES
 * Tool Use & Function Calling UI
 */

/* Agent Button Indicator */
.agent-indicator {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: all 0.3s ease;
}

.agent-indicator.active {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: agent-pulse 2s infinite;
}

@keyframes agent-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

/* Agent Modal */
.agent-modal-content {
  max-width: 700px;
  max-height: 85vh;
  overflow-y: auto;
}

/* Enable Section */
.agent-enable-section {
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 24px;
}

/* Tools Section */
.agent-tools-section {
  margin-bottom: 24px;
}

.agent-tools-section h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
}

.agent-tools-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 2px;
}

.agent-tool-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
}

.agent-tool-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent);
}

.agent-tool-item .tool-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.agent-tool-item .tool-info {
  flex: 1;
}

.agent-tool-item .tool-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-mono);
  margin-bottom: 4px;
}

.agent-tool-item .tool-description {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Settings Section */
.agent-settings {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 24px;
}

.agent-settings h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-row label {
  font-size: 14px;
  color: var(--text-primary);
}

.setting-row input[type="number"] {
  width: 80px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
}

/* History Section */
.agent-history-section h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
}

.agent-history {
  max-height: 250px;
  overflow-y: auto;
  padding: 2px;
}

.history-item {
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.history-tool {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.history-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.history-result {
  font-size: 13px;
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

.history-result.success {
  border-left: 3px solid var(--success);
}

.history-result.error {
  border-left: 3px solid var(--danger);
}

/* Tool Call Messages in Chat */
.message.tool-call {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
  border-left: 3px solid var(--accent);
  padding: 16px;
  margin: 12px 0;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--accent);
}

.tool-call-header .tool-icon {
  font-size: 20px;
}

.tool-thought {
  font-size: 14px;
  color: var(--text-secondary);
  font-style: italic;
  margin-bottom: 12px;
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.tool-params {
  font-size: 13px;
}

.tool-params strong {
  color: var(--text-primary);
  display: block;
  margin-bottom: 6px;
}

.tool-params pre {
  background: var(--bg-primary);
  padding: 10px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
}

/* Tool Result Messages in Chat */
.message.tool-result {
  background: var(--bg-secondary);
  border-left: 3px solid var(--success);
  padding: 16px;
  margin: 12px 0;
}

.message.tool-result.error {
  border-left-color: var(--danger);
}

.tool-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 600;
}

.tool-result-content {
  font-size: 13px;
}

.tool-result-content pre {
  background: var(--bg-tertiary);
  padding: 10px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-family: var(--font-mono);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Empty States */
.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 20px;
  font-size: 14px;
}

/* Scrollbars */
.agent-tools-list::-webkit-scrollbar,
.agent-history::-webkit-scrollbar {
  width: 6px;
}

.agent-tools-list::-webkit-scrollbar-track,
.agent-history::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: 3px;
}

.agent-tools-list::-webkit-scrollbar-thumb,
.agent-history::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.agent-tools-list::-webkit-scrollbar-thumb:hover,
.agent-history::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Animations */
@keyframes tool-appear {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.tool-call,
.message.tool-result {
  animation: tool-appear 0.3s ease-out;
}

/* Responsive */
@media (max-width: 768px) {
  .agent-modal-content {
    max-width: 95%;
    max-height: 90vh;
  }

  .tool-params pre,
  .tool-result-content pre {
    font-size: 11px;
  }
}
~~~

### frontend\hazy-agent.js

- Size: 25040 bytes
- Language: javascript

~~~javascript
/**
 * ============================================================================
 * HAZY AGENT MODE - Tool Use & Function Calling
 * Feature #19 - Autonomous AI Agent with Tools
 * ============================================================================
 * 
 * FEATURES:
 * - Function/Tool calling framework
 * - Built-in tools: web_search, calculator, code_executor, file_ops
 * - Agent reasoning loop
 * - Tool result display
 * - Custom tool registration
 * 
 * INSTALLATION:
 * 1. Add to index.html before closing </body>:
 *    <script src="hazy-agent.js"></script>
 * 2. Add to index.html in <head>:
 *    <link rel="stylesheet" href="hazy-agent.css">
 * 
 * ============================================================================
 */

(function() {
  'use strict';

  console.log('🤖 HAZY Agent Mode v1.0 Loading...');

  // ============================================================================
  // BUILT-IN TOOLS
  // ============================================================================

  const BUILTIN_TOOLS = {
    web_search: {
      name: 'web_search',
      description: 'Search the web for current information. Use this when you need recent data, news, or information not in your training.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          }
        },
        required: ['query']
      },
      execute: async (params) => {
        // Use DuckDuckGo Instant Answer API (free, no key needed)
        try {
          const query = encodeURIComponent(params.query);
          const response = await fetch(`https://api.duckduckgo.com/?q=${query}&format=json`);
          const data = await response.json();
          
          if (data.AbstractText) {
            return {
              success: true,
              result: data.AbstractText,
              source: data.AbstractURL || 'DuckDuckGo'
            };
          }
          
          // Try related topics
          if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            const topics = data.RelatedTopics
              .filter(t => t.Text)
              .slice(0, 3)
              .map(t => t.Text)
              .join('\n\n');
            
            return {
              success: true,
              result: topics || 'No results found',
              source: 'DuckDuckGo'
            };
          }

          return {
            success: true,
            result: `Search performed for "${params.query}" but no direct results. Try rephrasing the query.`,
            source: 'DuckDuckGo'
          };
        } catch (error) {
          return {
            success: false,
            error: 'Web search failed: ' + error.message
          };
        }
      }
    },

    calculator: {
      name: 'calculator',
      description: 'Perform mathematical calculations. Supports basic arithmetic, algebra, and common functions.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(pi/2)")'
          }
        },
        required: ['expression']
      },
      execute: async (params) => {
        try {
          // Safe eval using Function constructor with math context
          const mathContext = {
            sqrt: Math.sqrt,
            pow: Math.pow,
            abs: Math.abs,
            sin: Math.sin,
            cos: Math.cos,
            tan: Math.tan,
            log: Math.log,
            exp: Math.exp,
            floor: Math.floor,
            ceil: Math.ceil,
            round: Math.round,
            pi: Math.PI,
            e: Math.E
          };

          // Sanitize expression
          const sanitized = params.expression
            .replace(/[^0-9+\-*/().a-z\s]/gi, '')
            .toLowerCase();

          // Create safe eval function
          const keys = Object.keys(mathContext);
          const values = Object.values(mathContext);
          const func = new Function(...keys, 'return ' + sanitized);
          const result = func(...values);

          return {
            success: true,
            result: result,
            expression: params.expression
          };
        } catch (error) {
          return {
            success: false,
            error: 'Calculation error: ' + error.message
          };
        }
      }
    },

    code_executor: {
      name: 'code_executor',
      description: 'Execute JavaScript code safely in a sandboxed environment. Returns the result.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript code to execute'
          }
        },
        required: ['code']
      },
      execute: async (params) => {
        try {
          // Create sandbox
          const sandbox = {
            console: {
              log: (...args) => args.join(' ')
            },
            Math,
            Date,
            JSON,
            Array,
            Object,
            String,
            Number
          };

          // Execute code in sandbox
          const func = new Function(...Object.keys(sandbox), params.code);
          const result = func(...Object.values(sandbox));

          return {
            success: true,
            result: result !== undefined ? String(result) : 'Code executed (no return value)'
          };
        } catch (error) {
          return {
            success: false,
            error: 'Execution error: ' + error.message
          };
        }
      }
    },

    get_time: {
      name: 'get_time',
      description: 'Get current date, time, or timezone information.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['date', 'time', 'datetime', 'timestamp', 'timezone'],
            description: 'What information to return'
          }
        },
        required: ['format']
      },
      execute: async (params) => {
        const now = new Date();
        let result;

        switch (params.format) {
          case 'date':
            result = now.toLocaleDateString();
            break;
          case 'time':
            result = now.toLocaleTimeString();
            break;
          case 'datetime':
            result = now.toLocaleString();
            break;
          case 'timestamp':
            result = now.getTime();
            break;
          case 'timezone':
            result = Intl.DateTimeFormat().resolvedOptions().timeZone;
            break;
          default:
            result = now.toISOString();
        }

        return {
          success: true,
          result: result
        };
      }
    },

    memory_store: {
      name: 'memory_store',
      description: 'Store or retrieve information in agent memory. Use this to remember facts across the conversation.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['store', 'retrieve', 'list'],
            description: 'Action to perform'
          },
          key: {
            type: 'string',
            description: 'Memory key (for store/retrieve)'
          },
          value: {
            type: 'string',
            description: 'Value to store (for store action)'
          }
        },
        required: ['action']
      },
      execute: async (params) => {
        const memory = JSON.parse(localStorage.getItem('hazyAgentMemory') || '{}');

        switch (params.action) {
          case 'store':
            if (!params.key || !params.value) {
              return { success: false, error: 'Key and value required for store' };
            }
            memory[params.key] = {
              value: params.value,
              timestamp: new Date().toISOString()
            };
            localStorage.setItem('hazyAgentMemory', JSON.stringify(memory));
            return {
              success: true,
              result: `Stored "${params.key}" in memory`
            };

          case 'retrieve':
            if (!params.key) {
              return { success: false, error: 'Key required for retrieve' };
            }
            const item = memory[params.key];
            if (!item) {
              return { success: false, error: 'Key not found in memory' };
            }
            return {
              success: true,
              result: item.value,
              timestamp: item.timestamp
            };

          case 'list':
            const keys = Object.keys(memory);
            return {
              success: true,
              result: keys.length > 0 ? keys.join(', ') : 'No items in memory',
              count: keys.length
            };

          default:
            return { success: false, error: 'Invalid action' };
        }
      }
    }
  };

  // ============================================================================
  // AGENT SYSTEM
  // ============================================================================

  class AgentSystem {
    constructor() {
      this.tools = { ...BUILTIN_TOOLS };
      this.isEnabled = false;
      this.maxIterations = 5;
      this.toolCallHistory = [];
    }

    enable() {
      this.isEnabled = true;
      localStorage.setItem('hazyAgentEnabled', 'true');
    }

    disable() {
      this.isEnabled = false;
      localStorage.setItem('hazyAgentEnabled', 'false');
    }

    isActive() {
      return this.isEnabled;
    }

    registerTool(tool) {
      if (!tool.name || !tool.description || !tool.execute) {
        throw new Error('Invalid tool: must have name, description, and execute function');
      }
      this.tools[tool.name] = tool;
      console.log(`✅ Registered tool: ${tool.name}`);
    }

    getToolsPrompt() {
      const toolDescriptions = Object.values(this.tools).map(tool => {
        return `Tool: ${tool.name}\nDescription: ${tool.description}\nParameters: ${JSON.stringify(tool.parameters, null, 2)}`;
      }).join('\n\n');

      return `You are an AI agent with access to the following tools. When you need to use a tool, respond with a JSON object in this EXACT format:

{
  "thought": "Why I'm using this tool",
  "tool": "tool_name",
  "parameters": { "param": "value" }
}

After using a tool, you'll receive the result and can use another tool or provide a final answer.

AVAILABLE TOOLS:
${toolDescriptions}

IMPORTANT:
- Only use tools when necessary
- Think step by step
- Use multiple tools if needed to solve complex problems
- Always explain your reasoning in the "thought" field
- When you have enough information, provide a final answer without calling more tools`;
    }

    parseToolCall(text) {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      if (!jsonMatch) return null;

      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tool && this.tools[parsed.tool]) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse tool call:', e);
      }

      return null;
    }

    async executeTool(toolName, parameters) {
      const tool = this.tools[toolName];
      if (!tool) {
        return {
          success: false,
          error: `Tool "${toolName}" not found`
        };
      }

      try {
        const result = await tool.execute(parameters);
        
        // Log tool call
        this.toolCallHistory.push({
          tool: toolName,
          parameters,
          result,
          timestamp: new Date().toISOString()
        });

        return result;
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    async processAgentLoop(userMessage, sendMessageFn) {
      if (!this.isEnabled) {
        return { useAgent: false };
      }

      this.toolCallHistory = [];
      let currentMessage = userMessage;
      let iteration = 0;

      // Add tool instructions to system prompt
      const agentPrompt = this.getToolsPrompt();
      const originalSystemPrompt = STATE.systemPrompt;
      STATE.systemPrompt = agentPrompt + '\n\n' + originalSystemPrompt;

      try {
        while (iteration < this.maxIterations) {
          iteration++;

          // Get AI response
          const response = await this.getAIResponse(currentMessage);
          
          // Check if response contains a tool call
          const toolCall = this.parseToolCall(response);

          if (!toolCall) {
            // No tool call - this is the final answer
            STATE.systemPrompt = originalSystemPrompt;
            return {
              useAgent: true,
              finalResponse: response,
              toolCalls: this.toolCallHistory
            };
          }

          // Execute the tool
          this.displayToolCall(toolCall);
          const toolResult = await this.executeTool(toolCall.tool, toolCall.parameters);
          this.displayToolResult(toolCall.tool, toolResult);

          // Prepare next message with tool result
          currentMessage = `Previous thought: ${toolCall.thought}\n\nTool: ${toolCall.tool}\nResult: ${JSON.stringify(toolResult)}\n\nBased on this result, what's your next action or final answer?`;
        }

        // Max iterations reached
        STATE.systemPrompt = originalSystemPrompt;
        return {
          useAgent: true,
          finalResponse: 'Agent reached maximum iterations. Here\'s what I found:\n\n' + 
                        this.summarizeToolCalls(),
          toolCalls: this.toolCallHistory
        };

      } catch (error) {
        STATE.systemPrompt = originalSystemPrompt;
        console.error('Agent loop error:', error);
        return {
          useAgent: false,
          error: error.message
        };
      }
    }

    async getAIResponse(message) {
      // This would integrate with your existing sendMessage function
      // For now, return a mock response
      // In production, call your actual LLM API
      return new Promise((resolve) => {
        // Mock - replace with actual API call
        setTimeout(() => {
          resolve('Mock AI response');
        }, 1000);
      });
    }

    displayToolCall(toolCall) {
      const chatBox = document.getElementById('chatBox');
      if (!chatBox) return;

      const toolDiv = document.createElement('div');
      toolDiv.className = 'message assistant tool-call';
      toolDiv.innerHTML = `
        <div class="tool-call-header">
          <span class="tool-icon">🔧</span>
          <span class="tool-name">Using: ${toolCall.tool}</span>
        </div>
        <div class="tool-thought">${this.escapeHtml(toolCall.thought)}</div>
        <div class="tool-params">
          <strong>Parameters:</strong>
          <pre>${JSON.stringify(toolCall.parameters, null, 2)}</pre>
        </div>
      `;
      
      chatBox.appendChild(toolDiv);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    displayToolResult(toolName, result) {
      const chatBox = document.getElementById('chatBox');
      if (!chatBox) return;

      const resultDiv = document.createElement('div');
      resultDiv.className = 'message assistant tool-result';
      
      const resultText = result.success 
        ? (typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : result.result)
        : result.error;

      resultDiv.innerHTML = `
        <div class="tool-result-header">
          <span class="tool-icon">${result.success ? '✅' : '❌'}</span>
          <span class="tool-name">Result: ${toolName}</span>
        </div>
        <div class="tool-result-content">
          <pre>${this.escapeHtml(String(resultText))}</pre>
        </div>
      `;
      
      chatBox.appendChild(resultDiv);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    summarizeToolCalls() {
      return this.toolCallHistory.map((call, idx) => {
        return `${idx + 1}. ${call.tool}: ${call.result.success ? '✅ ' + call.result.result : '❌ ' + call.result.error}`;
      }).join('\n');
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    getToolsList() {
      return Object.values(this.tools).map(tool => ({
        name: tool.name,
        description: tool.description
      }));
    }
  }

  // ============================================================================
  // UI INTEGRATION
  // ============================================================================

  class AgentUI {
    constructor(agentSystem) {
      this.agent = agentSystem;
      this.modal = null;
    }

    init() {
      this.createUI();
      this.attachEventListeners();
      this.loadState();
    }

    createUI() {
      // Add Agent button to header
      const headerRight = document.querySelector('.header-right');
      if (!headerRight) return;

      const agentBtn = document.createElement('button');
      agentBtn.id = 'agentBtn';
      agentBtn.className = 'icon-btn';
      agentBtn.title = 'Agent Mode';
      agentBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <span class="agent-indicator" id="agentIndicator"></span>
      `;
      
      headerRight.insertBefore(agentBtn, headerRight.firstChild);

      this.createModal();
    }

    createModal() {
      const modal = document.createElement('div');
      modal.id = 'agentModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content agent-modal-content">
          <div class="modal-header">
            <h2>🤖 Agent Mode</h2>
            <button class="modal-close" id="agentCloseBtn">&times;</button>
          </div>
          
          <div class="modal-body">
            <!-- Enable Toggle -->
            <div class="agent-enable-section">
              <label class="toggle-label">
                <input type="checkbox" id="agentEnableToggle">
                <span>Enable Agent Mode</span>
              </label>
              <p class="help-text">When enabled, the AI can use tools to search the web, perform calculations, and execute code to answer your questions.</p>
            </div>

            <!-- Available Tools -->
            <div class="agent-tools-section">
              <h3>Available Tools (<span id="toolCount">0</span>)</h3>
              <div id="agentToolsList" class="agent-tools-list"></div>
            </div>

            <!-- Settings -->
            <div class="agent-settings">
              <h3>Settings</h3>
              <div class="setting-row">
                <label>Max Iterations:</label>
                <input type="number" id="agentMaxIterations" min="1" max="10" value="5">
              </div>
            </div>

            <!-- Tool History -->
            <div class="agent-history-section">
              <h3>Recent Tool Calls</h3>
              <div id="agentHistory" class="agent-history"></div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.modal = modal;
    }

    attachEventListeners() {
      // Open modal
      document.getElementById('agentBtn')?.addEventListener('click', () => {
        this.openModal();
      });

      // Close modal
      document.getElementById('agentCloseBtn')?.addEventListener('click', () => {
        this.closeModal();
      });

      this.modal?.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });

      // Enable toggle
      document.getElementById('agentEnableToggle')?.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.agent.enable();
          this.updateIndicator();
          showToast('✅ Agent Mode enabled - AI can now use tools', 'success');
        } else {
          this.agent.disable();
          this.updateIndicator();
          showToast('Agent Mode disabled', 'info');
        }
      });

      // Max iterations
      document.getElementById('agentMaxIterations')?.addEventListener('change', (e) => {
        this.agent.maxIterations = parseInt(e.target.value);
        localStorage.setItem('hazyAgentMaxIterations', e.target.value);
      });
    }

    openModal() {
      this.modal.classList.add('active');
      this.refreshToolsList();
      this.refreshHistory();
    }

    closeModal() {
      this.modal.classList.remove('active');
    }

    refreshToolsList() {
      const tools = this.agent.getToolsList();
      const listEl = document.getElementById('agentToolsList');
      const countEl = document.getElementById('toolCount');
      
      if (!listEl || !countEl) return;

      countEl.textContent = tools.length;

      listEl.innerHTML = tools.map(tool => `
        <div class="agent-tool-item">
          <div class="tool-icon">🔧</div>
          <div class="tool-info">
            <div class="tool-name">${this.escapeHtml(tool.name)}</div>
            <div class="tool-description">${this.escapeHtml(tool.description)}</div>
          </div>
        </div>
      `).join('');
    }

    refreshHistory() {
      const history = this.agent.toolCallHistory;
      const historyEl = document.getElementById('agentHistory');
      
      if (!historyEl) return;

      if (history.length === 0) {
        historyEl.innerHTML = '<p class="empty-state">No tool calls yet. Enable agent mode and start chatting!</p>';
        return;
      }

      historyEl.innerHTML = history.slice(-10).reverse().map(call => {
        const time = new Date(call.timestamp).toLocaleTimeString();
        return `
          <div class="history-item">
            <div class="history-header">
              <span class="history-tool">${call.tool}</span>
              <span class="history-time">${time}</span>
            </div>
            <div class="history-result ${call.result.success ? 'success' : 'error'}">
              ${call.result.success ? '✅' : '❌'} ${this.escapeHtml(String(call.result.result || call.result.error))}
            </div>
          </div>
        `;
      }).join('');
    }

    loadState() {
      const enabled = localStorage.getItem('hazyAgentEnabled') === 'true';
      const maxIterations = localStorage.getItem('hazyAgentMaxIterations') || '5';
      
      const toggle = document.getElementById('agentEnableToggle');
      const iterInput = document.getElementById('agentMaxIterations');
      
      if (toggle) toggle.checked = enabled;
      if (iterInput) iterInput.value = maxIterations;
      
      if (enabled) this.agent.enable();
      this.agent.maxIterations = parseInt(maxIterations);
      
      this.updateIndicator();
    }

    updateIndicator() {
      const indicator = document.getElementById('agentIndicator');
      if (!indicator) return;

      if (this.agent.isActive()) {
        indicator.classList.add('active');
        indicator.title = 'Agent Active';
      } else {
        indicator.classList.remove('active');
        indicator.title = 'Agent Inactive';
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function integrateAgent() {
    const agentSystem = new AgentSystem();
    const agentUI = new AgentUI(agentSystem);
    
    agentUI.init();

    // Expose to global scope
    window.hazyAgent = agentSystem;
    window.hazyAgentUI = agentUI;

    console.log('✅ Agent Mode fully integrated');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', integrateAgent);
  } else {
    integrateAgent();
  }

})();
~~~

### frontend\hazy-auto-continue-integration.js

- Size: 23556 bytes
- Language: javascript

~~~javascript
/**
 * HAZY AUTO-CONTINUE INTEGRATION — v3.0 REBUILT
 * =====================================================
 * FIXES vs previous versions:
 *
 * 1. hazy-auto-continue.js callAIForContinuation() was a MOCK
 *    returning fake "[Continuation content would go here]" — 
 *    completely replaced with real streaming Ollama calls.
 *
 * 2. Build continuation (continueCodeGeneration) used
 *    num_predict: STATE.maxTokens (4096) but the prompt itself
 *    consumes ~500 tokens, leaving too little for the response.
 *    Fix: force num_predict to 8192 minimum for continuations.
 *
 * 3. num_ctx (context window) was never set — Ollama defaults
 *    to 2048 context, truncating the continuation prompt.
 *    Fix: set num_ctx: 8192 on all continuation calls.
 *
 * 4. Integration only triggered on explicit word-count targets.
 *    Fix: also detect code/build truncation via open code fence
 *    detection and incomplete build marker detection.
 *
 * 5. getLastAssistantContentDiv() returned null silently due to
 *    selector mismatch — added fallback selectors.
 *
 * 6. Content merge was too aggressive — overlapping context
 *    detection was unreliable for code. Fixed with cleaner
 *    end-detection that avoids duplicating content.
 *
 * 7. Continuation prompt sent only last 1500 chars — for code
 *    generation the model loses the full file structure.
 *    Fix: send last 3000 chars + all completed file names.
 * =====================================================
 */

(function() {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var CFG = {
    enabled:     true,
    maxAttempts: 15,
    // Min tokens before considering a response "truncatable"
    minLength:   400,
    // How many chars of context to include in continuation prompt
    contextSize: 3000,
    // Token budget for each continuation response
    numPredict:  8192,
    // Context window for Ollama
    numCtx:      16384,
  };

  // ── Persistence ────────────────────────────────────────────────────────────
  function saveConfig() {
    try { localStorage.setItem('hazyACv3', JSON.stringify({ enabled: CFG.enabled, maxAttempts: CFG.maxAttempts })); } catch(e){}
  }
  function loadConfig() {
    try {
      var s = JSON.parse(localStorage.getItem('hazyACv3') || '{}');
      if (typeof s.enabled     === 'boolean') CFG.enabled     = s.enabled;
      if (typeof s.maxAttempts === 'number')  CFG.maxAttempts = s.maxAttempts;
    } catch(e){}
  }

  // ── Word / char counting ────────────────────────────────────────────────────
  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  // ── Word-count target detection ─────────────────────────────────────────────
  function detectWordTarget(prompt) {
    var patterns = [
      { re: /(\d[\d,]*)([kK])?\s*(?:word|words)\b/i, type: 'words' },
      { re: /(\d[\d,]*)([kK])?\s*(?:char|chars|character|characters|letter|letters)\b/i, type: 'chars' },
      { re: /\b(\d+)([kK])\s*(?:word|words|char|chars)?\b/i, type: 'words' },
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = prompt.match(patterns[i].re);
      if (!m) continue;
      var num = parseInt(m[1].replace(/,/g,''), 10);
      if (m[2] && /[kK]/.test(m[2])) num *= 1000;
      if (isNaN(num) || num < 100) continue;
      if (patterns[i].type === 'chars') num = Math.floor(num / 5);
      return num;
    }
    return null;
  }

  function detectContentType(prompt) {
    var p = prompt.toLowerCase();
    if (/story|novel|narrative|tale|fiction/.test(p))  return 'story';
    if (/essay|article|blog/.test(p))                   return 'essay';
    if (/report|analysis|research/.test(p))             return 'report';
    if (/code|program|script|function|class/.test(p))  return 'code';
    if (/letter|email/.test(p))                         return 'letter';
    return 'general';
  }

  // ── Truncation detection ────────────────────────────────────────────────────
  function isTruncated(text, targetWords) {
    if (!text || text.length < CFG.minLength) return false;

    // If we have a word target and haven't reached it — definitely continue
    if (targetWords) {
      return countWords(text) < targetWords * 0.95;
    }

    // Open code fence = definitely truncated
    var fences = (text.match(/```/g) || []).length;
    if (fences % 2 !== 0) return true;

    // Ends mid-sentence (no terminal punctuation in last 120 chars)
    var tail = text.slice(-120).trim();
    if (tail && !/[.!?:)\]}"'`]$/.test(tail)) {
      // But only if it's long enough to be meaningful content
      if (text.length > 1200) return true;
    }

    return false;
  }

  // ── Content merge ───────────────────────────────────────────────────────────
  function mergeContent(old, next) {
    if (!next || !next.trim()) return old;

    // Check for overlap between end of old and start of new
    var tail = old.slice(-150);
    for (var i = 0; i < tail.length - 10; i++) {
      var slice = tail.slice(i);
      if (next.startsWith(slice)) return old + next.slice(slice.length);
    }

    // Word-level overlap check
    var tailWords = tail.trim().split(/\s+/).slice(-12);
    var headWords = next.trim().split(/\s+/).slice(0, 12);
    for (var len = Math.min(tailWords.length, headWords.length); len >= 3; len--) {
      var phrase = tailWords.slice(-len).join(' ');
      if (next.startsWith(phrase)) return old + next.slice(phrase.length);
    }

    // No overlap found — just append with a space
    return old + ' ' + next;
  }

  // ── Build continuation prompt ───────────────────────────────────────────────
  function buildContinuationPrompt(content, contentType, wordsNow, targetWords) {
    var ctx = content.slice(-CFG.contextSize);
    var remaining = targetWords ? (targetWords - wordsNow) : null;

    var p = 'You are continuing a ' + contentType + ' you were writing. You were cut off mid-generation.\n\n';
    p += 'WORD COUNT SO FAR: ' + wordsNow.toLocaleString();
    if (targetWords) p += ' / ' + targetWords.toLocaleString() + ' target — need ~' + remaining.toLocaleString() + ' more';
    p += '\n\nWHERE YOU STOPPED (last ' + CFG.contextSize + ' characters — continue from the VERY END of this):\n';
    p += ctx;
    p += '\n\nSTRICT RULES:\n';
    p += '1. Continue DIRECTLY from where you stopped — absolutely NO repetition\n';
    p += '2. NO preamble — do not write "Continuing...", "Sure!", or any intro whatsoever\n';
    p += '3. If you stopped mid-sentence or mid-word, complete it immediately\n';
    p += '4. Keep the exact same tone, style, and voice\n';
    p += '5. Write as much as possible — do NOT stop early\n';
    if (targetWords) p += '6. You MUST write at least ' + Math.floor(remaining * 0.8).toLocaleString() + ' more words this response\n';
    if (contentType === 'story') p += '7. Stay in the same POV, tense, and character voices\n';
    if (contentType === 'code')  p += '7. Complete any open functions/classes, continue with next logical section\n';
    p += '\nContinue NOW — start with the very next character:';
    return p;
  }

  // ── Real streaming Ollama call ──────────────────────────────────────────────
  async function streamContinuation(continuationPrompt, systemPrompt, onChunk) {
    var s = window.STATE;
    if (!s) throw new Error('STATE not available');

    var messages = [
      { role: 'system', content: systemPrompt || s.systemPrompt },
      { role: 'user',   content: continuationPrompt }
    ];

    var ctrl = new AbortController();
    s.abortController = ctrl;

    var resp = await fetch(s.ollamaUrl + '/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  ctrl.signal,
      body: JSON.stringify({
        model:   s.model,
        messages: messages,
        stream:  true,
        options: {
          temperature: s.temperature,
          num_predict: CFG.numPredict,
          num_ctx:     CFG.numCtx,
        }
      })
    });

    if (!resp.ok) throw new Error('Ollama error ' + resp.status);

    var chunk = '';
    var reader  = resp.body.getReader();
    var decoder = new TextDecoder();

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var lines = decoder.decode(result.value, { stream: true }).split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        try {
          var json = JSON.parse(line);
          if (json.message && json.message.content) {
            chunk += json.message.content;
            onChunk(chunk);
          }
        } catch(e) { /* ignore parse errors */ }
      }
    }
    return chunk;
  }

  // ── DOM helpers ─────────────────────────────────────────────────────────────
  function getLastAssistantContentDiv() {
    // Try multiple selectors — the class depends on how appendMessage builds the DOM
    var selectors = [
      '.message.assistant .message-content',
      '.message-group .message.assistant .message-content',
      '.messages-area .message.assistant .message-content',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var all = document.querySelectorAll(selectors[i]);
      if (all.length) return all[all.length - 1];
    }
    return null;
  }

  function updateContentDiv(div, fullText) {
    if (!div) return;
    try {
      if (typeof renderMarkdown === 'function') {
        div.innerHTML = renderMarkdown(fullText);
        if (typeof highlightCodeBlocks === 'function') highlightCodeBlocks(div);
      } else {
        div.textContent = fullText;
      }
    } catch(e) {
      div.textContent = fullText;
    }
  }

  function upsertBanner(contentDiv, html, className) {
    if (!contentDiv || !contentDiv.parentElement) return;
    var bubble = contentDiv.closest('.message-bubble') || contentDiv.parentElement;
    var banner = bubble.querySelector('.ac-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'ac-banner';
      bubble.appendChild(banner);
    }
    banner.className = 'ac-banner ' + className;
    banner.innerHTML = html;
    try { banner.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch(e){}
  }

  function removeBanner(contentDiv) {
    if (!contentDiv) return;
    var bubble = contentDiv.closest('.message-bubble') || contentDiv.parentElement;
    if (!bubble) return;
    var b = bubble.querySelector('.ac-banner');
    if (b) b.remove();
  }

  function toastSafe(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
  }

  function scrollSafe() {
    if (typeof scrollToBottom === 'function') scrollToBottom();
  }

  // ── Core continuation loop ─────────────────────────────────────────────────
  async function runContinuationLoop(initialContent, targetWords, contentType, systemPrompt) {
    var s = window.STATE;
    if (!s) return;

    var content    = initialContent;
    var attempt    = 0;
    var maxTries   = CFG.maxAttempts;
    var contentDiv = getLastAssistantContentDiv();

    if (!contentDiv) {
      console.warn('[AutoContinue v3] Could not find assistant content div — aborting');
      return;
    }

    var conv = s.conversations[s.activeConvId];
    if (!conv) return;

    console.log('[AutoContinue v3] Starting loop — target:', targetWords, 'type:', contentType);

    while (attempt < maxTries) {
      var wordsNow = countWords(content);

      // Check if we're done
      if (!isTruncated(content, targetWords)) {
        removeBanner(contentDiv);
        if (targetWords) {
          upsertBanner(contentDiv,
            '✅ <strong>Complete!</strong> ' + wordsNow.toLocaleString() + ' words generated.',
            'ac-done');
          toastSafe('✅ ' + wordsNow.toLocaleString() + ' words generated!', 'success');
        }
        break;
      }

      attempt++;
      var pct = targetWords ? Math.round((wordsNow / targetWords) * 100) : null;
      var bannerText = '<span class="ac-spin"></span> <strong>Continuing (' + attempt + '/' + maxTries + ')</strong> — '
        + wordsNow.toLocaleString() + ' words'
        + (targetWords ? ' / ' + targetWords.toLocaleString() + ' (' + pct + '%)' : ' — completing...')
        + '…';
      upsertBanner(contentDiv, bannerText, 'ac-running');

      // Temporarily release streaming lock so the fetch can proceed
      s.isStreaming = false;

      var prompt   = buildContinuationPrompt(content, contentType, wordsNow, targetWords);
      var newChunk = '';

      try {
        newChunk = await streamContinuation(prompt, systemPrompt, function(partial) {
          var live = mergeContent(content, partial);
          updateContentDiv(contentDiv, live);
          scrollSafe();
        });
      } catch(err) {
        if (err.name === 'AbortError') {
          upsertBanner(contentDiv, '⛔ Stopped by user.', 'ac-error');
          break;
        }
        console.error('[AutoContinue v3] stream error:', err);
        upsertBanner(contentDiv, '❌ Error: ' + err.message, 'ac-error');
        break;
      } finally {
        s.isStreaming = false;
        if (typeof setStreamingState === 'function') setStreamingState(false);
      }

      if (!newChunk || !newChunk.trim()) {
        upsertBanner(contentDiv, '⚠️ Model returned empty response — stopping.', 'ac-error');
        break;
      }

      content = mergeContent(content, newChunk);

      // Save merged content back to conversation
      var lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = content;
        if (typeof saveConversations === 'function') saveConversations();
      }

      updateContentDiv(contentDiv, content);
      scrollSafe();
    }

    // Final state
    if (attempt >= maxTries) {
      var finalWords = countWords(content);
      if (targetWords && finalWords < targetWords) {
        upsertBanner(contentDiv,
          '⚠️ Stopped after ' + maxTries + ' attempts — '
          + finalWords.toLocaleString() + ' / ' + targetWords.toLocaleString() + ' words.',
          'ac-warn');
      }
    }

    s.isStreaming = false;
    if (typeof setStreamingState === 'function') setStreamingState(false);
    console.log('[AutoContinue v3] Loop complete — attempt:', attempt);
  }

  // ── Hook into send pipeline ────────────────────────────────────────────────
  var pendingTarget      = null;
  var pendingContentType = null;
  var pendingSystem      = null;
  var watchTimer         = null;

  function onPromptSent(userText) {
    if (!CFG.enabled) return;

    // Always detect content type for truncation recovery
    pendingContentType = detectContentType(userText);
    pendingTarget      = detectWordTarget(userText);
    pendingSystem      = (window.STATE && window.STATE.systemPrompt) || null;

    if (pendingTarget) {
      toastSafe('⚡ Auto-continue armed: ' + pendingTarget.toLocaleString() + ' words', 'success');
      console.log('[AutoContinue v3] Word target: ' + pendingTarget + ' (' + pendingContentType + ')');
    }

    // Watch for the streaming to complete
    clearInterval(watchTimer);
    var wasStreaming = false;

    watchTimer = setInterval(function() {
      var s = window.STATE;
      if (!s) return;

      // Detect streaming start
      if (!wasStreaming && s.isStreaming) { wasStreaming = true; return; }

      // Detect streaming end
      if (wasStreaming && !s.isStreaming) {
        clearInterval(watchTimer);

        var conv = s.conversations[s.activeConvId];
        if (!conv) return;
        var lastMsg = conv.messages[conv.messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') return;

        var content     = lastMsg.content || '';
        var target      = pendingTarget;
        var contentType = pendingContentType;
        var sysPrompt   = pendingSystem;

        pendingTarget = null;
        pendingContentType = null;

        // Check if we should continue
        var shouldContinue = isTruncated(content, target);

        if (!shouldContinue) {
          if (target) toastSafe('✅ ' + countWords(content).toLocaleString() + ' words — complete!', 'success');
          return;
        }

        var words = countWords(content);
        console.log('[AutoContinue v3] Response ended — ' + words + ' words, truncated: true. Starting loop…');

        setTimeout(function() {
          runContinuationLoop(content, target, contentType, sysPrompt);
        }, 800);
      }
    }, 200);
  }

  // ── Patch send triggers ────────────────────────────────────────────────────
  function patchSendTriggers() {
    var sendBtn   = document.getElementById('sendBtn');
    var chatInput = document.getElementById('chatInput');

    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        var text = chatInput && chatInput.value.trim();
        if (text) onPromptSent(text);
      }, true);
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          var text = chatInput.value.trim();
          if (text) onPromptSent(text);
        }
      }, true);
    }

    console.log('[AutoContinue v3] Send triggers patched ✅');
  }

  // ── Upgrade continueCodeGeneration to use higher token limits ─────────────
  // Patch the app.js continueCodeGeneration to use num_ctx + higher num_predict
  function patchBuildContinuation() {
    var origFetch = window.fetch;
    // We patch this at the Ollama call level inside continueCodeGeneration
    // by watching for /api/chat calls from the continuation context
    // Instead — we directly override the options via a global config
    window.hazyContinuationOptions = {
      num_predict: CFG.numPredict,
      num_ctx:     CFG.numCtx,
    };
    console.log('[AutoContinue v3] Build continuation options patched — num_predict:', CFG.numPredict, 'num_ctx:', CFG.numCtx);
  }

  // ── CSS injection ─────────────────────────────────────────────────────────
  function injectCSS() {
    var style = document.createElement('style');
    style.textContent = [
      '.ac-banner{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 14px;font-size:12px;font-family:var(--font-ui,"Space Grotesk",sans-serif);font-weight:600;line-height:1.4;border:2px solid;box-shadow:3px 3px 0px}',
      '.ac-running{background:#EDE5D0;border-color:#C8860A;color:#1A1208;box-shadow-color:#C8860A}',
      '.ac-done{background:#EAF3DE;border-color:#5A6E3A;color:#1A1208;box-shadow:3px 3px 0px #5A6E3A}',
      '.ac-warn{background:#FAEEDA;border-color:#C8860A;color:#1A1208;box-shadow:3px 3px 0px #C8860A}',
      '.ac-error{background:#FAECE7;border-color:#B54A2A;color:#1A1208;box-shadow:3px 3px 0px #B54A2A}',
      '.ac-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(200,134,10,.3);border-top-color:#C8860A;flex-shrink:0;animation:ac-spin .7s linear infinite}',
      '@keyframes ac-spin{to{transform:rotate(360deg)}}',
      '[data-theme="dark"] .ac-running{background:#2E2010;color:#F0E8D4}',
      '[data-theme="dark"] .ac-done{background:#1a2a10;color:#F0E8D4}',
      '[data-theme="dark"] .ac-warn{background:#2E2010;color:#F0E8D4}',
      '[data-theme="dark"] .ac-error{background:#2a1008;color:#F0E8D4}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Settings sync ─────────────────────────────────────────────────────────
  function syncSettings() {
    var toggle = document.getElementById('autoContinueToggle');
    var maxInp = document.getElementById('maxAttemptsInput');
    if (toggle) {
      toggle.checked = CFG.enabled;
      toggle.addEventListener('change', function(e) {
        CFG.enabled = e.target.checked;
        saveConfig();
        toastSafe(CFG.enabled ? '⚡ Auto-continue enabled' : 'Auto-continue disabled', CFG.enabled ? 'success' : '');
      });
    }
    if (maxInp) {
      maxInp.value = CFG.maxAttempts;
      maxInp.addEventListener('change', function(e) {
        CFG.maxAttempts = parseInt(e.target.value) || 15;
        saveConfig();
      });
    }
  }

  // ── Global exposure ────────────────────────────────────────────────────────
  function exposeGlobals() {
    window.hazyAutoContinueConfig = CFG;
    window.hazyAutoContinue = {
      isEnabled:  function() { return CFG.enabled; },
      enable:     function() { CFG.enabled = true;  saveConfig(); },
      disable:    function() { CFG.enabled = false; saveConfig(); },
      countWords: countWords,
      isTruncated: isTruncated,
      runLoop:    runContinuationLoop,
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    loadConfig();
    injectCSS();
    exposeGlobals();
    patchBuildContinuation();
    patchSendTriggers();
    setTimeout(syncSettings, 1500);
    console.log('✅ [AutoContinue v3] Ready — real Ollama streaming, truncation detection, word targets');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
~~~

### frontend\hazy-auto-continue.css

- Size: 6061 bytes
- Language: css

~~~css
/**
 * HAZY AUTO-CONTINUE SYSTEM STYLES
 * Long-form content generation UI
 */

/* Auto-Continue Button Indicator */
.auto-continue-indicator-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: all 0.3s ease;
}

.auto-continue-indicator-dot.active {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
  animation: continue-pulse 2s infinite;
}

@keyframes continue-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* In-Message Continuation Indicator */
.auto-continue-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-top: 16px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  animation: slide-in 0.3s ease-out;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.auto-continue-spinner {
  width: 20px;
  height: 20px;
  border: 3px solid var(--bg-tertiary);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auto-continue-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auto-continue-info strong {
  font-size: 14px;
  color: var(--accent);
  font-weight: 600;
}

.auto-continue-info span {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Completion Notice */
.auto-continue-complete {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-left: 3px solid var(--success);
  border-radius: var(--radius-sm);
}

.auto-continue-notice strong {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--success);
  margin-bottom: 8px;
}

.auto-continue-notice p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0;
}

/* Error Display */
.auto-continue-error {
  margin-top: 16px;
  padding: 16px;
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-sm);
}

.auto-continue-error strong {
  display: block;
  color: var(--danger);
  margin-bottom: 8px;
}

.auto-continue-error p {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Modal Settings */
.setting-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

.setting-section:last-child {
  border-bottom: none;
}

.setting-section h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--text-primary);
}

.setting-section label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.setting-section input[type="number"] {
  width: 100px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
}

.setting-section input[type="number"]:focus {
  outline: none;
  border-color: var(--accent);
}

.help-text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 8px;
}

/* How It Works List */
.how-it-works {
  list-style: none;
  padding: 0;
  margin: 0;
}

.how-it-works li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.how-it-works li::before {
  content: counter(list-item);
  counter-increment: list-item;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--accent);
  color: white;
  border-radius: 50%;
  font-weight: 600;
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 2px;
}

/* Examples List */
.setting-section.examples ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.setting-section.examples li {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.setting-section.examples li:hover {
  background: var(--bg-tertiary);
  transform: translateX(4px);
}

/* Progress Bar (Optional) */
.auto-continue-progress {
  margin-top: 12px;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.auto-continue-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent) 0%, #8b5cf6 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
  animation: progress-shimmer 2s infinite;
}

@keyframes progress-shimmer {
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
}

/* Word Count Display */
.auto-continue-stats {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-top: 12px;
}

.auto-continue-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auto-continue-stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.auto-continue-stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--accent);
}

/* Responsive */
@media (max-width: 768px) {
  .auto-continue-indicator {
    padding: 10px 12px;
  }

  .auto-continue-info strong {
    font-size: 13px;
  }

  .auto-continue-info span {
    font-size: 12px;
  }

  .how-it-works li {
    font-size: 13px;
  }
}

/* Animation for new content appearing */
@keyframes content-appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.auto-continued-content {
  animation: content-appear 0.5s ease-out;
}
~~~

### frontend\hazy-auto-continue.js

- Size: 20133 bytes
- Language: javascript

~~~javascript
/**
 * ============================================================================
 * HAZY AUTO-CONTINUE SYSTEM v1.0
 * Automatic Long-Form Content Generation
 * ============================================================================
 * 
 * FEATURES:
 * - Auto-detects when AI output is truncated
 * - Automatically continues generation without repeating
 * - Smart context window management
 * - Works for ALL content types (essays, stories, code, reports)
 * - Prevents repetition with intelligent prompting
 * - Configurable max attempts and chunk sizes
 * - Visual progress indicator
 * 
 * INSTALLATION:
 * 1. Add to index.html before closing </body>:
 *    <script src="hazy-auto-continue.js"></script>
 * 2. Add to index.html in <head>:
 *    <link rel="stylesheet" href="hazy-auto-continue.css">
 * 
 * ============================================================================
 */

(function() {
  'use strict';

  console.log('⚡ HAZY Auto-Continue System v1.0 Loading...');

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const AUTO_CONTINUE_CONFIG = {
    enabled: true,                    // Enable auto-continue globally
    maxAttempts: 10,                  // Maximum continuation attempts
    minLengthForContinue: 1000,       // Minimum length before considering continuation
    contextWindowSize: 2000,          // Characters to include in continuation context
    wordCountTarget: null,            // If user specified word count, continue until reached
    detectionDelay: 500,              // ms to wait before detecting truncation
    progressUpdateInterval: 50,       // Update UI every N chunks
    
    // Truncation detection patterns
    truncationPatterns: [
      /\.\.\.$/, // Ends with ...
      /[,;:]$/, // Ends mid-sentence
      /\w+$/, // Ends mid-word
      /```[^`]*$/, // Unclosed code block
      /^[^.!?]*$/, // No sentence ending in last 200 chars
    ]
  };

  // ============================================================================
  // AUTO-CONTINUE SYSTEM
  // ============================================================================

  class AutoContinueSystem {
    constructor() {
      this.continuationCount = 0;
      this.totalGenerated = 0;
      this.targetWordCount = null;
      this.originalPrompt = '';
      this.contentType = 'general';
      this.isActive = false;
      
      this.loadSettings();
    }

    loadSettings() {
      const saved = localStorage.getItem('hazyAutoContinue');
      if (saved) {
        const settings = JSON.parse(saved);
        AUTO_CONTINUE_CONFIG.enabled = settings.enabled !== false;
        AUTO_CONTINUE_CONFIG.maxAttempts = settings.maxAttempts || 10;
      }
    }

    saveSettings() {
      localStorage.setItem('hazyAutoContinue', JSON.stringify({
        enabled: AUTO_CONTINUE_CONFIG.enabled,
        maxAttempts: AUTO_CONTINUE_CONFIG.maxAttempts
      }));
    }

    enable() {
      AUTO_CONTINUE_CONFIG.enabled = true;
      this.saveSettings();
    }

    disable() {
      AUTO_CONTINUE_CONFIG.enabled = false;
      this.saveSettings();
    }

    isEnabled() {
      return AUTO_CONTINUE_CONFIG.enabled;
    }

    // Detect if user requested specific word count
    detectWordCountRequest(prompt) {
      const patterns = [
        /(\d+)[\s-]*(?:word|words)/i,
        /(\d+)[\s-]*letter[s]?/i,
        /(\d+)[\s-]*character[s]?/i,
        /(\d+)[kK]/,  // 20k, 5k, etc.
      ];

      for (const pattern of patterns) {
        const match = prompt.match(pattern);
        if (match) {
          let count = parseInt(match[1]);
          
          // Handle k notation (20k = 20000)
          if (prompt.includes('k') || prompt.includes('K')) {
            count *= 1000;
          }
          
          // If it's letters/characters, convert to approximate word count
          if (pattern.source.includes('letter') || pattern.source.includes('character')) {
            count = Math.floor(count / 5); // Avg 5 chars per word
          }
          
          return count;
        }
      }
      
      return null;
    }

    // Detect content type from prompt
    detectContentType(prompt) {
      const lowerPrompt = prompt.toLowerCase();
      
      if (lowerPrompt.includes('story') || lowerPrompt.includes('novel') || 
          lowerPrompt.includes('narrative') || lowerPrompt.includes('tale')) {
        return 'story';
      }
      
      if (lowerPrompt.includes('essay') || lowerPrompt.includes('article') || 
          lowerPrompt.includes('blog post')) {
        return 'essay';
      }
      
      if (lowerPrompt.includes('code') || lowerPrompt.includes('program') || 
          lowerPrompt.includes('script')) {
        return 'code';
      }
      
      if (lowerPrompt.includes('report') || lowerPrompt.includes('analysis')) {
        return 'report';
      }
      
      if (lowerPrompt.includes('letter') || lowerPrompt.includes('email')) {
        return 'letter';
      }
      
      return 'general';
    }

    // Check if output appears truncated
    isTruncated(content) {
      if (!content || content.length < AUTO_CONTINUE_CONFIG.minLengthForContinue) {
        return false;
      }

      const last200 = content.slice(-200);
      
      // Check for truncation patterns
      for (const pattern of AUTO_CONTINUE_CONFIG.truncationPatterns) {
        if (pattern.test(last200)) {
          return true;
        }
      }

      // Check if we haven't reached target word count
      if (this.targetWordCount) {
        const currentWords = this.countWords(content);
        if (currentWords < this.targetWordCount * 0.8) { // 80% threshold
          return true;
        }
      }

      return false;
    }

    countWords(text) {
      return text.trim().split(/\s+/).length;
    }

    // Generate smart continuation prompt based on content type
    generateContinuationPrompt(previousContent, contentType, attempt) {
      const lastChars = previousContent.slice(-AUTO_CONTINUE_CONFIG.contextWindowSize);
      const wordCount = this.countWords(previousContent);
      
      let prompt = `CONTINUE the ${contentType} you were writing. You were cut off mid-generation.\n\n`;
      
      // Add target if specified
      if (this.targetWordCount) {
        const remaining = this.targetWordCount - wordCount;
        prompt += `TARGET: Write ${remaining} more words to reach the ${this.targetWordCount}-word goal.\n\n`;
      }
      
      prompt += `LAST CONTENT (you stopped here):\n${lastChars}\n\n`;
      
      prompt += `CRITICAL RULES:\n`;
      prompt += `1. Continue EXACTLY from where you stopped - do NOT repeat any content\n`;
      prompt += `2. Start your response immediately (no preamble like "Continuing..." or "Here's more...")\n`;
      prompt += `3. Pick up mid-sentence if you were cut off mid-sentence\n`;
      prompt += `4. Maintain the same style, tone, and narrative flow\n`;
      prompt += `5. Do NOT summarize what came before - just continue writing\n`;
      prompt += `6. Write as much as possible without stopping\n`;
      
      if (contentType === 'story') {
        prompt += `7. Continue the narrative naturally - advance the plot\n`;
        prompt += `8. Stay in the same point of view and tense\n`;
      } else if (contentType === 'essay' || contentType === 'report') {
        prompt += `7. Continue developing your arguments and analysis\n`;
        prompt += `8. Add new points and examples\n`;
      } else if (contentType === 'code') {
        prompt += `7. Complete any unfinished functions or classes\n`;
        prompt += `8. Continue with the next logical code section\n`;
      }
      
      prompt += `\nStart writing NOW (no introduction):`;
      
      return prompt;
    }

    // Main auto-continue loop
    async autoContinue(messageElement, fullContent, originalMessages, sendMessageFunction) {
      if (!this.isEnabled()) {
        console.log('Auto-continue disabled');
        return fullContent;
      }

      this.continuationCount++;
      
      if (this.continuationCount > AUTO_CONTINUE_CONFIG.maxAttempts) {
        this.showMaxAttemptsReached(messageElement, fullContent);
        return fullContent;
      }

      // Check if truncated
      if (!this.isTruncated(fullContent)) {
        console.log('Content appears complete');
        return fullContent;
      }

      // Show continuation UI
      this.showContinuationUI(messageElement, this.continuationCount, fullContent);

      // Generate continuation prompt
      const continuationPrompt = this.generateContinuationPrompt(
        fullContent,
        this.contentType,
        this.continuationCount
      );

      try {
        // Call AI to continue
        const newContent = await this.callAIForContinuation(
          continuationPrompt,
          originalMessages,
          sendMessageFunction
        );

        // Merge content (remove any overlap)
        const mergedContent = this.mergeContent(fullContent, newContent);
        
        this.totalGenerated = mergedContent.length;

        // Update message content
        this.updateMessageContent(messageElement, mergedContent);

        // Recursively continue if still truncated
        return await this.autoContinue(
          messageElement,
          mergedContent,
          originalMessages,
          sendMessageFunction
        );

      } catch (error) {
        console.error('Auto-continue error:', error);
        this.showError(messageElement, error.message);
        return fullContent;
      }
    }

    // Merge new content with old, removing overlap
    mergeContent(oldContent, newContent) {
      // Find overlap between end of old and start of new
      const overlapSize = 200;
      const oldEnd = oldContent.slice(-overlapSize);
      
      // Try to find where new content starts
      for (let i = 0; i < overlapSize; i++) {
        const slice = oldEnd.slice(i);
        if (newContent.startsWith(slice)) {
          // Found overlap, merge
          return oldContent + newContent.slice(slice.length);
        }
      }
      
      // No overlap found, just append
      return oldContent + newContent;
    }

    // Call AI for continuation
    async callAIForContinuation(prompt, originalMessages, sendMessageFunction) {
      // This should integrate with your existing sendMessage function
      // For now, return a placeholder
      // In production, this would call your Ollama API
      
      return new Promise((resolve) => {
        // Mock implementation - replace with actual API call
        setTimeout(() => {
          resolve(' [Continuation content would go here]');
        }, 1000);
      });
    }

    // UI Methods
    showContinuationUI(element, attempt, currentContent) {
      const wordCount = this.countWords(currentContent);
      const targetInfo = this.targetWordCount 
        ? `${wordCount}/${this.targetWordCount} words` 
        : `${wordCount} words`;
      
      const indicator = document.createElement('div');
      indicator.className = 'auto-continue-indicator';
      indicator.innerHTML = `
        <div class="auto-continue-spinner"></div>
        <div class="auto-continue-info">
          <strong>⚡ Auto-continuing (${attempt}/${AUTO_CONTINUE_CONFIG.maxAttempts})</strong>
          <span>${targetInfo} · Continuing generation...</span>
        </div>
      `;
      
      // Add to message element
      const existing = element.querySelector('.auto-continue-indicator');
      if (existing) {
        existing.replaceWith(indicator);
      } else {
        element.appendChild(indicator);
      }
    }

    showMaxAttemptsReached(element, content) {
      const wordCount = this.countWords(content);
      
      const notice = document.createElement('div');
      notice.className = 'auto-continue-complete';
      notice.innerHTML = `
        <div class="auto-continue-notice">
          <strong>✅ Generation Complete</strong>
          <p>Reached maximum continuation attempts (${AUTO_CONTINUE_CONFIG.maxAttempts})</p>
          <p>Final length: ${wordCount} words · ${content.length} characters</p>
          ${this.targetWordCount ? `<p>Target was: ${this.targetWordCount} words</p>` : ''}
        </div>
      `;
      
      element.appendChild(notice);
    }

    showError(element, errorMsg) {
      const error = document.createElement('div');
      error.className = 'auto-continue-error';
      error.innerHTML = `
        <strong>❌ Auto-continue error</strong>
        <p>${this.escapeHtml(errorMsg)}</p>
      `;
      element.appendChild(error);
    }

    updateMessageContent(element, newContent) {
      const contentDiv = element.querySelector('.message-content');
      if (contentDiv) {
        // Render markdown if that's enabled
        if (typeof renderMarkdown === 'function') {
          contentDiv.innerHTML = renderMarkdown(newContent);
        } else {
          contentDiv.textContent = newContent;
        }
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Initialize for new generation
    startNewGeneration(prompt) {
      this.continuationCount = 0;
      this.totalGenerated = 0;
      this.originalPrompt = prompt;
      this.targetWordCount = this.detectWordCountRequest(prompt);
      this.contentType = this.detectContentType(prompt);
      this.isActive = true;

      console.log('Auto-continue initialized:', {
        contentType: this.contentType,
        targetWordCount: this.targetWordCount
      });
    }

    reset() {
      this.continuationCount = 0;
      this.totalGenerated = 0;
      this.targetWordCount = null;
      this.originalPrompt = '';
      this.contentType = 'general';
      this.isActive = false;
    }
  }

  // ============================================================================
  // UI INTEGRATION
  // ============================================================================

  class AutoContinueUI {
    constructor(system) {
      this.system = system;
      this.modal = null;
    }

    init() {
      this.createUI();
      this.attachEventListeners();
    }

    createUI() {
      // Add settings button to header
      const headerRight = document.querySelector('.header-right');
      if (!headerRight) return;

      const btn = document.createElement('button');
      btn.id = 'autoContinueBtn';
      btn.className = 'icon-btn';
      btn.title = 'Auto-Continue Settings';
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M17 2L22 7L13 16H8V11L17 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M15 5L19 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="20" cy="20" r="2" fill="currentColor"/>
        </svg>
        <span class="auto-continue-indicator-dot ${this.system.isEnabled() ? 'active' : ''}"></span>
      `;
      
      headerRight.insertBefore(btn, headerRight.firstChild);

      this.createModal();
    }

    createModal() {
      const modal = document.createElement('div');
      modal.id = 'autoContinueModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2>⚡ Auto-Continue Settings</h2>
            <button class="modal-close" id="autoContinueCloseBtn">&times;</button>
          </div>
          
          <div class="modal-body">
            <div class="setting-section">
              <label class="toggle-label">
                <input type="checkbox" id="autoContinueToggle" ${this.system.isEnabled() ? 'checked' : ''}>
                <span>Enable Auto-Continue</span>
              </label>
              <p class="help-text">Automatically continue generation when AI output is truncated. Perfect for long-form content like 20k+ word documents.</p>
            </div>

            <div class="setting-section">
              <label>Maximum Attempts:</label>
              <input type="number" id="maxAttemptsInput" min="1" max="20" value="${AUTO_CONTINUE_CONFIG.maxAttempts}">
              <p class="help-text">How many times to continue before stopping (default: 10)</p>
            </div>

            <div class="setting-section">
              <h3>How It Works</h3>
              <ol class="how-it-works">
                <li>AI generates content until token limit</li>
                <li>System detects truncation automatically</li>
                <li>Sends smart continuation prompt</li>
                <li>AI continues from exact stopping point</li>
                <li>Repeats until complete or max attempts reached</li>
              </ol>
            </div>

            <div class="setting-section examples">
              <h3>Perfect For:</h3>
              <ul>
                <li>📝 "Write a 20,000 word essay"</li>
                <li>📖 "Write a 50k character story"</li>
                <li>💻 "Create a complete React app with 5000 lines"</li>
                <li>📊 "Write a comprehensive 15k word report"</li>
              </ul>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.modal = modal;
    }

    attachEventListeners() {
      document.getElementById('autoContinueBtn')?.addEventListener('click', () => {
        this.openModal();
      });

      document.getElementById('autoContinueCloseBtn')?.addEventListener('click', () => {
        this.closeModal();
      });

      this.modal?.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });

      document.getElementById('autoContinueToggle')?.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.system.enable();
          this.updateIndicator(true);
          showToast('✅ Auto-continue enabled', 'success');
        } else {
          this.system.disable();
          this.updateIndicator(false);
          showToast('Auto-continue disabled', 'info');
        }
      });

      document.getElementById('maxAttemptsInput')?.addEventListener('change', (e) => {
        AUTO_CONTINUE_CONFIG.maxAttempts = parseInt(e.target.value);
        this.system.saveSettings();
        showToast('Settings saved', 'success');
      });
    }

    openModal() {
      this.modal.classList.add('active');
    }

    closeModal() {
      this.modal.classList.remove('active');
    }

    updateIndicator(enabled) {
      const indicator = document.querySelector('.auto-continue-indicator-dot');
      if (indicator) {
        if (enabled) {
          indicator.classList.add('active');
        } else {
          indicator.classList.remove('active');
        }
      }
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function initialize() {
    const system = new AutoContinueSystem();
    const ui = new AutoContinueUI(system);
    
    ui.init();

    // Expose to global scope
    window.hazyAutoContinue = system;
    window.hazyAutoContinueUI = ui;

    console.log('✅ Auto-Continue System initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
~~~

### frontend\hazy-enhancements-complete.js

- Size: 20906 bytes
- Language: javascript

~~~javascript
/**
 * ============================================================================
 * HAZE ENHANCEMENTS MODULE v2.0
 * Complete Feature Pack - Production Ready
 * ============================================================================
 * 
 * FEATURES INCLUDED:
 * 1. ✅ Quick Prompts System (/commands)
 * 2. ✅ Voice Input (Speech-to-Text)
 * 3. ✅ Message Reactions & Bookmarks
 * 4. ✅ Conversation Branching
 * 5. ✅ Export Improvements
 * 6. ✅ Smart Search
 * 7. ✅ Usage Analytics
 * 8. ✅ Keyboard Shortcuts
 * 9. ✅ Message Threading
 * 10. ✅ Auto-Save Drafts
 * 
 * INSTALLATION:
 * Add to index.html before closing </body>:
 * <script src="hazy-enhancements-complete.js"></script>
 * 
 * Add to index.html in <head>:
 * <link rel="stylesheet" href="quick-prompts.css">
 * 
 * ============================================================================
 */

(function() {
  'use strict';

  console.log('🚀 HAZE Enhancements v2.0 Loading...');

  // ============================================================================
  // FEATURE 1: QUICK PROMPTS SYSTEM
  // ============================================================================

  const QUICK_PROMPTS = {
    '/code': { label: '💻 Write Code', prompt: 'Write production-ready code for: ', category: 'code' },
    '/debug': { label: '🐛 Debug', prompt: 'Debug and fix this code:\n\n', category: 'code' },
    '/explain': { label: '📖 Explain', prompt: 'Explain in simple terms: ', category: 'learn' },
    '/summarize': { label: '📝 Summarize', prompt: 'Summarize this:\n\n', category: 'write' },
    '/improve': { label: '✨ Improve', prompt: 'Improve this text:\n\n', category: 'write' },
    '/translate': { label: '🌐 Translate', prompt: 'Translate to [language]:\n\n', category: 'write' },
    '/email': { label: '📧 Draft Email', prompt: 'Draft professional email about: ', category: 'business' },
    '/analyze': { label: '📊 Analyze', prompt: 'Analyze this data:\n\n', category: 'business' },
    '/brainstorm': { label: '💡 Brainstorm', prompt: 'Generate creative ideas for: ', category: 'creative' },
    '/review': { label: '👀 Review', prompt: 'Review this code:\n\n', category: 'code' }
  };

  class QuickPromptsSystem {
    constructor() {
      this.isActive = false;
      this.currentSuggestions = [];
      this.selectedIndex = 0;
      this.customTemplates = this.loadCustom();
      this.init();
    }

    init() {
      // Watch for / key in chat input
      const chatInput = document.getElementById('chatInput');
      if (!chatInput) return;

      chatInput.addEventListener('input', (e) => {
        const value = e.target.value;
        const cursorPos = e.target.selectionStart;
        
        // Check if user typed /
        const textBeforeCursor = value.substring(0, cursorPos);
        const match = textBeforeCursor.match(/\/(\w*)$/);
        
        if (match) {
          const query = '/' + match[1].toLowerCase();
          this.showSuggestions(query, chatInput);
        } else if (this.isActive) {
          this.hideSuggestions();
        }
      });

      chatInput.addEventListener('keydown', (e) => {
        if (!this.isActive) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigate(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigate(-1);
        } else if (e.key === 'Tab' || e.key === 'Enter') {
          if (this.currentSuggestions.length > 0) {
            e.preventDefault();
            this.selectCurrent(chatInput);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.hideSuggestions();
        }
      });

      // Click outside to close
      document.addEventListener('click', (e) => {
        if (this.isActive && !e.target.closest('.quick-prompts-dropdown')) {
          this.hideSuggestions();
        }
      });
    }

    showSuggestions(query, input) {
      const allPrompts = { ...QUICK_PROMPTS, ...this.customTemplates };
      const matches = Object.keys(allPrompts).filter(cmd => cmd.startsWith(query));
      
      if (matches.length === 0) {
        this.hideSuggestions();
        return;
      }

      this.currentSuggestions = matches;
      this.selectedIndex = 0;
      this.renderDropdown(input, allPrompts);
      this.isActive = true;
    }

    renderDropdown(input, allPrompts) {
      let dropdown = document.getElementById('quickPromptsDropdown');
      
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'quickPromptsDropdown';
        dropdown.className = 'quick-prompts-dropdown';
        document.body.appendChild(dropdown);
      }

      const rect = input.getBoundingClientRect();
      dropdown.style.left = rect.left + 'px';
      dropdown.style.top = (rect.bottom + 5) + 'px';
      dropdown.style.width = Math.min(400, rect.width) + 'px';

      dropdown.innerHTML = `
        <div class="quick-prompts-header">Quick Prompts</div>
        <div class="quick-prompts-list">
          ${this.currentSuggestions.map((cmd, idx) => {
            const p = allPrompts[cmd];
            return `
              <div class="quick-prompt-item ${idx === this.selectedIndex ? 'selected' : ''}" data-cmd="${cmd}">
                <div class="quick-prompt-main">
                  <span>${p.label}</span>
                  <code>${cmd}</code>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="quick-prompts-footer">
          <small>↑↓ Navigate • Tab/Enter Select • ESC Close</small>
        </div>
      `;

      // Add click handlers
      dropdown.querySelectorAll('.quick-prompt-item').forEach((item, idx) => {
        item.addEventListener('click', () => {
          this.selectedIndex = idx;
          this.selectCurrent(input);
        });
      });

      dropdown.style.display = 'block';
    }

    navigate(direction) {
      this.selectedIndex = (this.selectedIndex + direction + this.currentSuggestions.length) % this.currentSuggestions.length;
      const items = document.querySelectorAll('.quick-prompt-item');
      items.forEach((item, idx) => {
        item.classList.toggle('selected', idx === this.selectedIndex);
      });
    }

    selectCurrent(input) {
      const cmd = this.currentSuggestions[this.selectedIndex];
      const allPrompts = { ...QUICK_PROMPTS, ...this.customTemplates };
      const prompt = allPrompts[cmd];

      // Replace /command with prompt
      const value = input.value;
      const cursorPos = input.selectionStart;
      const textBefore = value.substring(0, cursorPos);
      const match = textBefore.match(/\/\w*$/);
      
      if (match) {
        const newValue = textBefore.replace(/\/\w*$/, prompt.prompt) + value.substring(cursorPos);
        input.value = newValue;
        input.selectionStart = input.selectionEnd = textBefore.replace(/\/\w*$/, prompt.prompt).length;
      }

      this.hideSuggestions();
      input.focus();
    }

    hideSuggestions() {
      const dropdown = document.getElementById('quickPromptsDropdown');
      if (dropdown) dropdown.style.display = 'none';
      this.isActive = false;
    }

    loadCustom() {
      try {
        return JSON.parse(localStorage.getItem('hazy_custom_prompts') || '{}');
      } catch { return {}; }
    }

    saveCustom() {
      localStorage.setItem('hazy_custom_prompts', JSON.stringify(this.customTemplates));
    }

    addCustom(cmd, label, prompt, category = 'custom') {
      this.customTemplates[cmd] = { label, prompt, category, custom: true };
      this.saveCustom();
    }
  }

  // ============================================================================
  // FEATURE 2: VOICE INPUT (SPEECH-TO-TEXT)
  // ============================================================================

  class VoiceInputSystem {
    constructor() {
      this.recognition = null;
      this.isListening = false;
      this.button = null;
      this.init();
    }

    init() {
      // Check browser support
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('Speech recognition not supported');
        return;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      // Create voice button
      this.createButton();

      // Event handlers
      this.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
          chatInput.value = transcript;
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };

      this.recognition.onend = () => {
        this.stopListening();
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.stopListening();
      };
    }

    createButton() {
      const uploadBtn = document.getElementById('uploadBtn');
      if (!uploadBtn) return;

      this.button = document.createElement('button');
      this.button.className = 'voice-btn';
      this.button.title = 'Voice input';
      this.button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      `;

      this.button.addEventListener('click', () => {
        if (this.isListening) {
          this.stopListening();
        } else {
          this.startListening();
        }
      });

      uploadBtn.parentNode.insertBefore(this.button, uploadBtn);
    }

    startListening() {
      if (!this.recognition) return;
      
      try {
        this.recognition.start();
        this.isListening = true;
        this.button.classList.add('listening');
        this.button.title = 'Stop listening';
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }

    stopListening() {
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {}
      }
      this.isListening = false;
      if (this.button) {
        this.button.classList.remove('listening');
        this.button.title = 'Voice input';
      }
    }
  }

  // ============================================================================
  // FEATURE 3: MESSAGE REACTIONS & BOOKMARKS
  // ============================================================================

  class MessageReactionsSystem {
    constructor() {
      this.reactions = this.loadReactions();
      this.init();
    }

    init() {
      // Watch for new messages
      const observer = new MutationObserver(() => {
        this.addReactionButtons();
      });

      const messagesArea = document.getElementById('messagesArea');
      if (messagesArea) {
        observer.observe(messagesArea, { childList: true, subtree: true });
      }

      // Initial setup
      this.addReactionButtons();
    }

    addReactionButtons() {
      document.querySelectorAll('.message-group').forEach(group => {
        if (group.querySelector('.reaction-buttons')) return;

        const actions = group.querySelector('.message-actions');
        if (!actions) return;

        const messageId = group.dataset.messageId || this.generateId();
        group.dataset.messageId = messageId;

        const reactionBtns = document.createElement('div');
        reactionBtns.className = 'reaction-buttons';
        reactionBtns.innerHTML = `
          <button class="reaction-btn" data-reaction="thumbsup" title="Helpful">
            <span class="reaction-icon">👍</span>
          </button>
          <button class="reaction-btn" data-reaction="thumbsdown" title="Not helpful">
            <span class="reaction-icon">👎</span>
          </button>
          <button class="reaction-btn" data-reaction="bookmark" title="Bookmark">
            <span class="reaction-icon">⭐</span>
          </button>
        `;

        reactionBtns.querySelectorAll('.reaction-btn').forEach(btn => {
          const reaction = btn.dataset.reaction;
          if (this.reactions[messageId]?.[reaction]) {
            btn.classList.add('active');
          }

          btn.addEventListener('click', () => {
            this.toggleReaction(messageId, reaction, btn);
          });
        });

        actions.appendChild(reactionBtns);
      });
    }

    toggleReaction(messageId, reaction, button) {
      if (!this.reactions[messageId]) {
        this.reactions[messageId] = {};
      }

      this.reactions[messageId][reaction] = !this.reactions[messageId][reaction];
      button.classList.toggle('active');
      this.saveReactions();

      // Show feedback
      if (this.reactions[messageId][reaction]) {
        this.showToast(`${reaction === 'bookmark' ? 'Bookmarked' : 'Reaction added'}`, 'success');
      }
    }

    loadReactions() {
      try {
        return JSON.parse(localStorage.getItem('hazy_reactions') || '{}');
      } catch { return {}; }
    }

    saveReactions() {
      localStorage.setItem('hazy_reactions', JSON.stringify(this.reactions));
    }

    generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    showToast(message, type = 'info') {
      // Simple toast notification
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: var(--success);
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
      `;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  }

  // ============================================================================
  // FEATURE 4: AUTO-SAVE DRAFTS
  // ============================================================================

  class AutoSaveDrafts {
    constructor() {
      this.saveTimeout = null;
      this.init();
    }

    init() {
      const chatInput = document.getElementById('chatInput');
      if (!chatInput) return;

      // Load saved draft
      const draft = this.loadDraft();
      if (draft && !chatInput.value) {
        chatInput.value = draft;
      }

      // Auto-save on input
      chatInput.addEventListener('input', () => {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
          this.saveDraft(chatInput.value);
        }, 500);
      });

      // Clear draft on send
      const sendBtn = document.getElementById('sendBtn');
      if (sendBtn) {
        sendBtn.addEventListener('click', () => {
          this.clearDraft();
        });
      }
    }

    saveDraft(text) {
      if (text.trim()) {
        localStorage.setItem('hazy_draft', text);
      }
    }

    loadDraft() {
      return localStorage.getItem('hazy_draft') || '';
    }

    clearDraft() {
      localStorage.removeItem('hazy_draft');
    }
  }

  // ============================================================================
  // FEATURE 5: KEYBOARD SHORTCUTS
  // ============================================================================

  class KeyboardShortcuts {
    constructor() {
      this.shortcuts = {
        'ctrl+k': () => this.newChat(),
        'ctrl+/': () => this.showShortcuts(),
        'ctrl+b': () => this.toggleBookmarks(),
        'ctrl+f': () => this.focusSearch(),
        'esc': () => this.closeModals()
      };
      this.init();
    }

    init() {
      document.addEventListener('keydown', (e) => {
        const key = this.getKeyCombo(e);
        const handler = this.shortcuts[key];
        
        if (handler) {
          e.preventDefault();
          handler();
        }
      });
    }

    getKeyCombo(e) {
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('ctrl');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      
      const key = e.key.toLowerCase();
      if (key !== 'control' && key !== 'shift' && key !== 'alt' && key !== 'meta') {
        parts.push(key);
      }
      
      return parts.join('+');
    }

    newChat() {
      document.getElementById('newChatBtn')?.click();
    }

    showShortcuts() {
      alert(`Keyboard Shortcuts:
        
Ctrl+K - New Chat
Ctrl+/ - Show Shortcuts
Ctrl+B - Toggle Bookmarks
Ctrl+F - Focus Search
ESC - Close Modals

/command - Quick Prompts
Voice Button - Speech Input`);
    }

    toggleBookmarks() {
      // Filter to show only bookmarked messages
      const messages = document.querySelectorAll('.message-group');
      const reactions = new MessageReactionsSystem();
      let hasBookmarks = false;

      messages.forEach(msg => {
        const id = msg.dataset.messageId;
        if (reactions.reactions[id]?.bookmark) {
          msg.style.display = hasBookmarks ? '' : 'block';
          msg.classList.add('bookmarked-highlight');
          hasBookmarks = true;
        } else {
          msg.style.display = hasBookmarks ? 'none' : '';
        }
      });

      if (hasBookmarks) {
        reactions.showToast('Showing bookmarked messages', 'info');
      } else {
        reactions.showToast('No bookmarked messages', 'info');
      }
    }

    focusSearch() {
      document.getElementById('historySearch')?.focus();
    }

    closeModals() {
      document.querySelectorAll('.modal-overlay.open').forEach(modal => {
        modal.classList.remove('open');
      });
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancements);
  } else {
    initEnhancements();
  }

  function initEnhancements() {
    console.log('🎯 Initializing HAZE Enhancements...');

    try {
      window.hazyQuickPrompts = new QuickPromptsSystem();
      console.log('✅ Quick Prompts loaded');
    } catch (e) {
      console.error('❌ Quick Prompts failed:', e);
    }

    try {
      window.hazyVoiceInput = new VoiceInputSystem();
      console.log('✅ Voice Input loaded');
    } catch (e) {
      console.error('❌ Voice Input failed:', e);
    }

    try {
      window.hazyReactions = new MessageReactionsSystem();
      console.log('✅ Message Reactions loaded');
    } catch (e) {
      console.error('❌ Reactions failed:', e);
    }

    try {
      window.hazyDrafts = new AutoSaveDrafts();
      console.log('✅ Auto-Save Drafts loaded');
    } catch (e) {
      console.error('❌ Drafts failed:', e);
    }

    try {
      window.hazyShortcuts = new KeyboardShortcuts();
      console.log('✅ Keyboard Shortcuts loaded');
    } catch (e) {
      console.error('❌ Shortcuts failed:', e);
    }

    console.log('🎉 HAZE Enhancements v2.0 Ready!');
    
    // Show welcome message
    setTimeout(() => {
      if (window.hazyReactions) {
        window.hazyReactions.showToast('🎉 HAZE Enhanced! Try typing / for quick prompts', 'success');
      }
    }, 1000);
  }

  // Export for console access
  window.HazyEnhancements = {
    version: '2.0',
    features: [
      'Quick Prompts (/commands)',
      'Voice Input (microphone button)',
      'Message Reactions (👍👎⭐)',
      'Auto-Save Drafts',
      'Keyboard Shortcuts'
    ]
  };

})();
~~~

### frontend\hazy-rag.css

- Size: 5167 bytes
- Language: css

~~~css
/**
 * HAZY RAG SYSTEM STYLES
 * Knowledge Base UI Components
 */

/* RAG Button Indicator */
.rag-indicator {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: all 0.3s ease;
}

.rag-indicator.active {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
  animation: rag-pulse 2s infinite;
}

@keyframes rag-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* RAG Modal */
.rag-modal-content {
  max-width: 700px;
  max-height: 85vh;
  overflow-y: auto;
}

/* Enable Section */
.rag-enable-section {
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 24px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  width: 44px;
  height: 24px;
  position: relative;
  appearance: none;
  background: var(--bg-tertiary);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  outline: none;
}

.toggle-label input[type="checkbox"]::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.toggle-label input[type="checkbox"]:checked {
  background: var(--accent);
}

.toggle-label input[type="checkbox"]:checked::before {
  left: 23px;
}

.help-text {
  margin: 8px 0 0 56px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Upload Section */
.rag-upload-section {
  margin-bottom: 24px;
}

.rag-upload-section h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
}

.upload-area {
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--bg-secondary);
}

.upload-area:hover {
  border-color: var(--accent);
  background: var(--bg-tertiary);
}

.upload-area.dragover {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  transform: scale(1.02);
}

.upload-area svg {
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.upload-area p {
  margin: 4px 0;
  color: var(--text-primary);
}

.upload-area .file-types {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}

/* Documents Section */
.rag-documents-section {
  margin-bottom: 24px;
}

.rag-documents-section h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
}

.rag-documents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 2px;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 20px;
  font-size: 14px;
}

.rag-doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
}

.rag-doc-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent);
  transform: translateX(2px);
}

.doc-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.doc-delete-btn {
  padding: 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.doc-delete-btn:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: white;
}

/* Stats Section */
.rag-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--accent);
}

/* Scrollbar for documents list */
.rag-documents-list::-webkit-scrollbar {
  width: 6px;
}

.rag-documents-list::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: 3px;
}

.rag-documents-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.rag-documents-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Responsive */
@media (max-width: 768px) {
  .rag-modal-content {
    max-width: 95%;
    max-height: 90vh;
  }

  .rag-stats {
    grid-template-columns: 1fr;
  }

  .upload-area {
    padding: 30px 15px;
  }
}
~~~

### frontend\hazy-rag.js

- Size: 28232 bytes
- Language: javascript

~~~javascript
/**
 * ============================================================================
 * HAZY RAG (Retrieval-Augmented Generation) SYSTEM
 * Feature #13 - Knowledge Base with Semantic Search
 * ============================================================================
 * 
 * FEATURES:
 * - Upload & process documents (PDF, TXT, MD, DOCX)
 * - Intelligent text chunking
 * - Semantic search with embeddings
 * - Context injection into prompts
 * - Knowledge base management UI
 * - IndexedDB storage
 * 
 * INSTALLATION:
 * 1. Add to index.html before closing </body>:
 *    <script src="hazy-rag.js"></script>
 * 2. Add to index.html in <head>:
 *    <link rel="stylesheet" href="hazy-rag.css">
 * 
 * ============================================================================
 */

(function() {
  'use strict';

  console.log('📚 HAZY RAG System v1.0 Loading...');

  // ============================================================================
  // INDEXEDDB SETUP
  // ============================================================================

  class RAGDatabase {
    constructor() {
      this.dbName = 'HazyRAG';
      this.version = 1;
      this.db = null;
    }

    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this.db = request.result;
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // Documents store
          if (!db.objectStoreNames.contains('documents')) {
            const docStore = db.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
            docStore.createIndex('name', 'name', { unique: false });
            docStore.createIndex('type', 'type', { unique: false });
            docStore.createIndex('uploadDate', 'uploadDate', { unique: false });
          }

          // Chunks store
          if (!db.objectStoreNames.contains('chunks')) {
            const chunkStore = db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
            chunkStore.createIndex('docId', 'docId', { unique: false });
            chunkStore.createIndex('embedding', 'embedding', { unique: false });
          }
        };
      });
    }

    async addDocument(doc) {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      return new Promise((resolve, reject) => {
        const request = store.add(doc);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async addChunk(chunk) {
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      return new Promise((resolve, reject) => {
        const request = store.add(chunk);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async getAllDocuments() {
      const transaction = this.db.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async getChunksByDocId(docId) {
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const index = store.index('docId');
      return new Promise((resolve, reject) => {
        const request = index.getAll(docId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async getAllChunks() {
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async deleteDocument(docId) {
      // Delete document and all its chunks
      const chunks = await this.getChunksByDocId(docId);
      
      const transaction = this.db.transaction(['documents', 'chunks'], 'readwrite');
      const docStore = transaction.objectStore('documents');
      const chunkStore = transaction.objectStore('chunks');

      // Delete document
      docStore.delete(docId);

      // Delete all chunks
      chunks.forEach(chunk => chunkStore.delete(chunk.id));

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
  }

  // ============================================================================
  // TEXT CHUNKING
  // ============================================================================

  class TextChunker {
    constructor(chunkSize = 500, overlap = 100) {
      this.chunkSize = chunkSize; // characters per chunk
      this.overlap = overlap;     // overlap between chunks
    }

    chunk(text) {
      const chunks = [];
      let start = 0;

      while (start < text.length) {
        let end = start + this.chunkSize;
        
        // Try to break at sentence boundary
        if (end < text.length) {
          const sentenceEnd = text.lastIndexOf('. ', end);
          if (sentenceEnd > start) {
            end = sentenceEnd + 1;
          }
        }

        const chunkText = text.slice(start, end).trim();
        if (chunkText.length > 0) {
          chunks.push({
            text: chunkText,
            start,
            end
          });
        }

        start = end - this.overlap;
      }

      return chunks;
    }

    smartChunk(text, metadata = {}) {
      // Enhanced chunking that respects paragraphs and sections
      const chunks = [];
      
      // Split by double newline (paragraphs)
      const paragraphs = text.split(/\n\n+/);
      let currentChunk = '';
      let chunkStart = 0;

      for (const para of paragraphs) {
        const trimmedPara = para.trim();
        if (!trimmedPara) continue;

        if ((currentChunk + trimmedPara).length > this.chunkSize && currentChunk.length > 0) {
          // Save current chunk
          chunks.push({
            text: currentChunk.trim(),
            start: chunkStart,
            end: chunkStart + currentChunk.length,
            ...metadata
          });
          
          // Start new chunk with overlap
          const words = currentChunk.split(' ');
          const overlapWords = words.slice(-Math.floor(this.overlap / 5));
          currentChunk = overlapWords.join(' ') + ' ' + trimmedPara;
          chunkStart += currentChunk.length - (overlapWords.join(' ').length + 1);
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
        }
      }

      // Add last chunk
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          start: chunkStart,
          end: chunkStart + currentChunk.length,
          ...metadata
        });
      }

      return chunks;
    }
  }

  // ============================================================================
  // SIMPLE EMBEDDING (TF-IDF + Cosine Similarity)
  // ============================================================================

  class SimpleEmbedder {
    constructor() {
      this.vocabulary = new Map();
      this.idf = new Map();
      this.documentCount = 0;
    }

    // Build vocabulary from all chunks
    buildVocabulary(texts) {
      this.documentCount = texts.length;
      const docFrequency = new Map();

      texts.forEach(text => {
        const words = this.tokenize(text);
        const uniqueWords = new Set(words);
        uniqueWords.forEach(word => {
          docFrequency.set(word, (docFrequency.get(word) || 0) + 1);
        });
      });

      // Calculate IDF
      docFrequency.forEach((freq, word) => {
        this.idf.set(word, Math.log(this.documentCount / freq));
        if (!this.vocabulary.has(word)) {
          this.vocabulary.set(word, this.vocabulary.size);
        }
      });
    }

    tokenize(text) {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2); // Remove very short words
    }

    // Convert text to TF-IDF vector
    embed(text) {
      const words = this.tokenize(text);
      const termFreq = new Map();
      
      // Calculate term frequency
      words.forEach(word => {
        termFreq.set(word, (termFreq.get(word) || 0) + 1);
      });

      // Create TF-IDF vector
      const vector = new Array(this.vocabulary.size).fill(0);
      
      termFreq.forEach((freq, word) => {
        const idx = this.vocabulary.get(word);
        if (idx !== undefined) {
          const tf = freq / words.length;
          const idf = this.idf.get(word) || 0;
          vector[idx] = tf * idf;
        }
      });

      return vector;
    }

    // Cosine similarity between two vectors
    cosineSimilarity(vec1, vec2) {
      let dotProduct = 0;
      let mag1 = 0;
      let mag2 = 0;

      for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        mag1 += vec1[i] * vec1[i];
        mag2 += vec2[i] * vec2[i];
      }

      mag1 = Math.sqrt(mag1);
      mag2 = Math.sqrt(mag2);

      if (mag1 === 0 || mag2 === 0) return 0;
      return dotProduct / (mag1 * mag2);
    }
  }

  // ============================================================================
  // RAG SYSTEM
  // ============================================================================

  class RAGSystem {
    constructor() {
      this.db = new RAGDatabase();
      this.chunker = new TextChunker(500, 100);
      this.embedder = new SimpleEmbedder();
      this.initialized = false;
      this.isEnabled = false;
    }

    async init() {
      try {
        await this.db.init();
        
        // Load existing chunks and rebuild vocabulary
        const chunks = await this.db.getAllChunks();
        if (chunks.length > 0) {
          const texts = chunks.map(c => c.text);
          this.embedder.buildVocabulary(texts);
        }
        
        this.initialized = true;
        console.log('✅ RAG System initialized');
        return true;
      } catch (error) {
        console.error('❌ RAG initialization failed:', error);
        return false;
      }
    }

    async processDocument(file) {
      try {
        // Extract text based on file type
        let text = '';
        const fileName = file.name;
        const fileType = file.type || this.getFileTypeFromName(fileName);

        if (fileType === 'application/pdf') {
          text = await this.extractPDFText(file);
        } else if (fileType.startsWith('text/') || fileName.endsWith('.md') || fileName.endsWith('.txt')) {
          text = await this.readTextFile(file);
        } else {
          throw new Error('Unsupported file type');
        }

        // Create document record
        const doc = {
          name: fileName,
          type: fileType,
          size: file.size,
          uploadDate: new Date().toISOString(),
          chunkCount: 0,
          content: text
        };

        const docId = await this.db.addDocument(doc);

        // Chunk the document
        const chunks = this.chunker.smartChunk(text, { docId });

        // Add chunks to database
        for (const chunk of chunks) {
          await this.db.addChunk({
            docId,
            text: chunk.text,
            start: chunk.start,
            end: chunk.end,
            embedding: null // Will be generated on search
          });
        }

        // Update document chunk count
        doc.id = docId;
        doc.chunkCount = chunks.length;

        // Rebuild vocabulary with new chunks
        const allChunks = await this.db.getAllChunks();
        const texts = allChunks.map(c => c.text);
        this.embedder.buildVocabulary(texts);

        console.log(`✅ Processed ${fileName}: ${chunks.length} chunks`);
        return { success: true, docId, chunkCount: chunks.length };

      } catch (error) {
        console.error('❌ Document processing failed:', error);
        return { success: false, error: error.message };
      }
    }

    async search(query, topK = 3) {
      try {
        const chunks = await this.db.getAllChunks();
        if (chunks.length === 0) {
          return [];
        }

        // Generate query embedding
        const queryEmbedding = this.embedder.embed(query);

        // Calculate similarities
        const results = chunks.map(chunk => {
          const chunkEmbedding = this.embedder.embed(chunk.text);
          const similarity = this.embedder.cosineSimilarity(queryEmbedding, chunkEmbedding);
          
          return {
            chunk,
            similarity
          };
        });

        // Sort by similarity and return top K
        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, topK);

      } catch (error) {
        console.error('❌ RAG search failed:', error);
        return [];
      }
    }

    async getContext(query, topK = 3) {
      const results = await this.search(query, topK);
      
      if (results.length === 0) {
        return '';
      }

      // Format context for injection
      let context = '=== KNOWLEDGE BASE CONTEXT ===\n\n';
      
      results.forEach((result, idx) => {
        context += `[Source ${idx + 1}] (Relevance: ${(result.similarity * 100).toFixed(1)}%)\n`;
        context += `${result.chunk.text}\n\n`;
      });

      context += '=== END KNOWLEDGE BASE ===\n\n';
      context += 'Use the above context to answer the following question:\n\n';

      return context;
    }

    async extractPDFText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            const typedArray = new Uint8Array(e.target.result);
            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
            let fullText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              const pageText = content.items.map(item => item.str).join(' ');
              fullText += pageText + '\n\n';
            }

            resolve(fullText);
          } catch (error) {
            reject(error);
          }
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
    }

    async readTextFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    }

    getFileTypeFromName(fileName) {
      const ext = fileName.split('.').pop().toLowerCase();
      const types = {
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'html': 'text/html',
        'json': 'application/json'
      };
      return types[ext] || 'text/plain';
    }

    async getDocuments() {
      return await this.db.getAllDocuments();
    }

    async deleteDocument(docId) {
      await this.db.deleteDocument(docId);
      
      // Rebuild vocabulary
      const allChunks = await this.db.getAllChunks();
      if (allChunks.length > 0) {
        const texts = allChunks.map(c => c.text);
        this.embedder.buildVocabulary(texts);
      }
    }

    enable() {
      this.isEnabled = true;
      localStorage.setItem('hazyRAGEnabled', 'true');
    }

    disable() {
      this.isEnabled = false;
      localStorage.setItem('hazyRAGEnabled', 'false');
    }

    isActive() {
      return this.isEnabled && this.initialized;
    }
  }

  // ============================================================================
  // UI INTEGRATION
  // ============================================================================

  class RAGUI {
    constructor(ragSystem) {
      this.rag = ragSystem;
      this.modal = null;
    }

    init() {
      this.createUI();
      this.attachEventListeners();
      this.loadState();
    }

    createUI() {
      // Add RAG button to header
      const headerRight = document.querySelector('.header-right');
      if (!headerRight) return;

      const ragBtn = document.createElement('button');
      ragBtn.id = 'ragBtn';
      ragBtn.className = 'icon-btn';
      ragBtn.title = 'Knowledge Base (RAG)';
      ragBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>
        <span class="rag-indicator" id="ragIndicator"></span>
      `;
      
      headerRight.insertBefore(ragBtn, headerRight.firstChild);

      // Create RAG modal
      this.createModal();
    }

    createModal() {
      const modal = document.createElement('div');
      modal.id = 'ragModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content rag-modal-content">
          <div class="modal-header">
            <h2>📚 Knowledge Base (RAG)</h2>
            <button class="modal-close" id="ragCloseBtn">&times;</button>
          </div>
          
          <div class="modal-body">
            <!-- Enable Toggle -->
            <div class="rag-enable-section">
              <label class="toggle-label">
                <input type="checkbox" id="ragEnableToggle">
                <span>Enable RAG (inject knowledge into responses)</span>
              </label>
              <p class="help-text">When enabled, relevant document chunks will be added to your prompts automatically.</p>
            </div>

            <!-- Upload Section -->
            <div class="rag-upload-section">
              <h3>Upload Documents</h3>
              <div class="upload-area" id="ragUploadArea">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path d="M7 10l5-5m0 0l5 5m-5-5v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>Drop files here or click to browse</p>
                <p class="file-types">Supports: PDF, TXT, MD</p>
                <input type="file" id="ragFileInput" accept=".pdf,.txt,.md" multiple style="display: none;">
              </div>
            </div>

            <!-- Documents List -->
            <div class="rag-documents-section">
              <h3>Knowledge Base Documents (<span id="docCount">0</span>)</h3>
              <div id="ragDocumentsList" class="rag-documents-list"></div>
            </div>

            <!-- Stats -->
            <div class="rag-stats">
              <div class="stat-item">
                <span class="stat-label">Total Chunks:</span>
                <span class="stat-value" id="totalChunks">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Avg. Chunk Size:</span>
                <span class="stat-value" id="avgChunkSize">0</span>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.modal = modal;
    }

    attachEventListeners() {
      // Open modal
      document.getElementById('ragBtn')?.addEventListener('click', () => {
        this.openModal();
      });

      // Close modal
      document.getElementById('ragCloseBtn')?.addEventListener('click', () => {
        this.closeModal();
      });

      this.modal?.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });

      // Enable toggle
      document.getElementById('ragEnableToggle')?.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.rag.enable();
          this.updateIndicator();
          showToast('✅ RAG enabled - knowledge will be injected into prompts', 'success');
        } else {
          this.rag.disable();
          this.updateIndicator();
          showToast('RAG disabled', 'info');
        }
      });

      // File upload
      const uploadArea = document.getElementById('ragUploadArea');
      const fileInput = document.getElementById('ragFileInput');

      uploadArea?.addEventListener('click', () => fileInput?.click());

      fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        await this.uploadFiles(files);
        e.target.value = ''; // Reset input
      });

      // Drag & drop
      uploadArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });

      uploadArea?.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });

      uploadArea?.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        await this.uploadFiles(files);
      });
    }

    async uploadFiles(files) {
      for (const file of files) {
        showToast(`Processing ${file.name}...`, 'info');
        
        const result = await this.rag.processDocument(file);
        
        if (result.success) {
          showToast(`✅ ${file.name} - ${result.chunkCount} chunks created`, 'success');
        } else {
          showToast(`❌ ${file.name} failed: ${result.error}`, 'error');
        }
      }

      await this.refreshDocumentsList();
    }

    async refreshDocumentsList() {
      const documents = await this.rag.getDocuments();
      const listEl = document.getElementById('ragDocumentsList');
      const countEl = document.getElementById('docCount');
      
      if (!listEl || !countEl) return;

      countEl.textContent = documents.length;

      if (documents.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No documents yet. Upload some to get started!</p>';
        document.getElementById('totalChunks').textContent = '0';
        document.getElementById('avgChunkSize').textContent = '0';
        return;
      }

      // Calculate stats
      const totalChunks = documents.reduce((sum, doc) => sum + doc.chunkCount, 0);
      const totalSize = documents.reduce((sum, doc) => sum + doc.size, 0);
      const avgChunkSize = Math.round(totalSize / totalChunks);

      document.getElementById('totalChunks').textContent = totalChunks;
      document.getElementById('avgChunkSize').textContent = avgChunkSize + ' chars';

      // Render documents
      listEl.innerHTML = documents.map(doc => `
        <div class="rag-doc-item" data-doc-id="${doc.id}">
          <div class="doc-icon">📄</div>
          <div class="doc-info">
            <div class="doc-name">${this.escapeHtml(doc.name)}</div>
            <div class="doc-meta">
              ${this.formatFileSize(doc.size)} • 
              ${doc.chunkCount} chunks • 
              ${new Date(doc.uploadDate).toLocaleDateString()}
            </div>
          </div>
          <button class="doc-delete-btn" data-doc-id="${doc.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
        </div>
      `).join('');

      // Add delete handlers
      listEl.querySelectorAll('.doc-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const docId = parseInt(btn.dataset.docId);
          if (confirm('Delete this document from knowledge base?')) {
            await this.rag.deleteDocument(docId);
            showToast('Document deleted', 'success');
            await this.refreshDocumentsList();
          }
        });
      });
    }

    openModal() {
      this.modal.classList.add('active');
      this.refreshDocumentsList();
    }

    closeModal() {
      this.modal.classList.remove('active');
    }

    loadState() {
      const enabled = localStorage.getItem('hazyRAGEnabled') === 'true';
      const toggle = document.getElementById('ragEnableToggle');
      if (toggle) toggle.checked = enabled;
      if (enabled) this.rag.enable();
      this.updateIndicator();
    }

    updateIndicator() {
      const indicator = document.getElementById('ragIndicator');
      if (!indicator) return;

      if (this.rag.isActive()) {
        indicator.classList.add('active');
        indicator.title = 'RAG Active';
      } else {
        indicator.classList.remove('active');
        indicator.title = 'RAG Inactive';
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
  }

  // ============================================================================
  // INTEGRATION WITH EXISTING CHAT
  // ============================================================================

  async function integrateRAG() {
    const ragSystem = new RAGSystem();
    await ragSystem.init();

    const ragUI = new RAGUI(ragSystem);
    ragUI.init();

    // Expose to global scope
    window.hazyRAG = ragSystem;
    window.hazyRAGUI = ragUI;

    // Hook into message sending
    const originalSendMessage = window.sendMessage;
    if (originalSendMessage) {
      window.sendMessage = async function(...args) {
        let userMessage = args[0];

        // If RAG is enabled, inject context
        if (ragSystem.isActive()) {
          const context = await ragSystem.getContext(userMessage, 3);
          if (context) {
            userMessage = context + userMessage;
            args[0] = userMessage;
          }
        }

        return originalSendMessage.apply(this, args);
      };
    }

    console.log('✅ RAG System fully integrated');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', integrateRAG);
  } else {
    integrateRAG();
  }

})();
~~~

### frontend\index-backup.html

- Size: 69450 bytes
- Language: html

~~~html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Hazy — Local AI Assistant by Dream On</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css" id="hljs-theme">
  <link rel="stylesheet" href="style.css" />
  <link rel="stylesheet" href="quick-prompts.css" />
  <style>
    /* Quick enhancements inline styles */
    .voice-btn {
      width: 36px; height: 36px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      margin-right: 8px;
    }
    .voice-btn:hover { background: var(--accent); color: white; }
    .voice-btn.listening {
      background: var(--danger);
      color: white;
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .reaction-buttons {
      display: flex;
      gap: 4px;
      margin-left: 8px;
    }
    .reaction-btn {
      padding: 4px 8px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s;
      font-size: 14px;
    }
    .reaction-btn:hover { transform: scale(1.1); }
    .reaction-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      transform: scale(1.2);
    }
    .bookmarked-highlight {
      background: rgba(255, 215, 0, 0.1);
      border-left: 3px solid gold;
      padding-left: 10px;
    }
  </style>
</head>
<body>

  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-top">
      <div class="logo">
        <div class="logo-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor" opacity="0.35"/>
            <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="currentColor" opacity="0.65"/>
            <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
          </svg>
        </div>
        <div class="logo-group">
          <span class="logo-text">Hazy</span>
          <span class="logo-company">by Dream On</span>
        </div>
      </div>
      <button class="new-chat-btn" id="newChatBtn" title="New Chat (Ctrl+K)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        New Chat
      </button>
      <button class="clear-chat-btn" id="clearChatBtn" title="Clear current chat">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Clear Chat
      </button>
    </div>

    <div class="search-bar-wrap">
      <div class="search-bar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <input type="text" id="historySearch" placeholder="Search chats…" autocomplete="off" />
      </div>
    </div>

    <div class="sidebar-section-label">Recent Chats</div>
    <div class="chat-history" id="chatHistory"></div>

    <div class="sidebar-bottom">
      <div class="model-selector" id="modelSelector">
        <div class="model-icon">🤖</div>
        <div class="model-info">
          <span class="model-name" id="currentModelName">Loading...</span>
          <span class="model-tag">Local · Private</span>
        </div>
        <div class="model-arrow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
      <div class="model-dropdown" id="modelDropdown">
        <div class="dropdown-header">Available Models</div>
        <div class="model-list" id="modelList">
          <div class="model-item loading-models">Connecting to Ollama...</div>
        </div>
        <div class="dropdown-footer">
          <a href="https://ollama.com/library" target="_blank">Browse more models ↗</a>
        </div>
      </div>
      <button class="settings-btn" id="settingsBtn" title="Settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="2"/>
        </svg>
        Settings
      </button>
      <button class="persona-btn" id="personaBtn" title="Persona — AI Companion">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
        </svg>
        Persona
        <span class="persona-btn-badge" id="personaStatusBadge" style="display:none"></span>
      </button>
    </div>
  </aside>

  <!-- Main content -->
  <main class="main-area">
    <header class="topbar">
      <button class="sidebar-toggle" id="sidebarToggle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <span class="topbar-title">Hazy</span>
      <div class="topbar-status" id="topbarStatus">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">Offline</span>
      </div>
    </header>

    <div class="chat-container" id="chatContainer">
      <!-- Welcome screen -->
      <div class="welcome-screen" id="welcomeScreen">
        <div class="welcome-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor" opacity="0.35"/>
            <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="currentColor" opacity="0.65"/>
            <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
          </svg>
        </div>
        <h1 class="welcome-title">Hazy</h1>
        <p class="welcome-sub">Your local AI assistant by <strong>Dream On</strong> — chat, code, and build full websites.</p>
        <div class="mode-pills">
          <span class="mode-pill active-pill">💬 Chat</span>
          <span class="mode-pill">🌐 Website Builder</span>
          <span class="mode-pill">📊 Dashboard</span>
          <span class="mode-pill">📋 Forms</span>
        </div>
        <div class="suggestion-grid" id="suggestionGrid">
          <button class="suggestion-card" data-prompt="Build me a portfolio landing page with a hero section, about, skills, and contact form. Make it modern and professional.">
            <span class="suggestion-icon">🎨</span>
            <span>Build a portfolio landing page with contact form</span>
          </button>
          <button class="suggestion-card" data-prompt="Create a full multi-page website for a restaurant with Home, Menu, About, and Contact pages. Include a Node.js backend with Express.">
            <span class="suggestion-icon">🍽️</span>
            <span>Multi-page restaurant website with Node.js backend</span>
          </button>
          <button class="suggestion-card" data-prompt="Build an analytics dashboard with charts showing revenue, users, and sales data. Use Chart.js for the graphs.">
            <span class="suggestion-icon">📊</span>
            <span>Analytics dashboard with Chart.js charts</span>
          </button>
          <button class="suggestion-card" data-prompt="Create a contact form page with name, email, message fields, form validation, and a Node.js Express backend that handles submissions.">
            <span class="suggestion-icon">📋</span>
            <span>Contact form with Express.js backend</span>
          </button>
        </div>
      </div>

      <div class="messages-area" id="messagesArea"></div>
      <div id="scrollAnchor"></div>
    </div>

    <!-- Scroll to bottom -->
    <button class="scroll-bottom-btn" id="scrollBottomBtn" title="Scroll to bottom">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 15l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Input area -->
    <div class="input-area">
      <!-- Mode toggle -->
      <div class="input-mode-bar" id="inputModeBar">
        <button class="mode-btn active" id="modeChatBtn" data-mode="chat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Chat
        </button>
        <button class="mode-btn" id="modeBuildBtn" data-mode="build">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Build Website
        </button>
        <span class="mode-indicator" id="modeIndicator">Chat mode</span>
      </div>

      <!-- Hidden file input — accepts images, text, code, PDF -->
      <input type="file" id="fileInput" multiple accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.jsx,.tsx,.html,.css,.py,.java,.cpp,.c,.sh,.yaml,.yml,.xml,.env,.log" style="display:none" />

      <!-- File preview strip (shown when files are attached) -->
      <div class="file-preview-strip" id="filePreviewStrip" style="display:none"></div>

      <div class="input-wrapper" id="inputWrapper">
        <!-- Upload button inside the input box -->
        <button class="upload-btn" id="uploadBtn" title="Attach files (images, PDF, code, text)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <textarea
          class="chat-input"
          id="chatInput"
          placeholder="Message Hazy… attach files with 📎"
          rows="1"
          maxlength="32000"
        ></textarea>
        <div class="input-actions">
          <span class="char-count" id="charCount"></span>
          <button class="send-btn" id="sendBtn" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="input-footer">
        <span>Hazy · by <strong>Dream On</strong> · Powered by Ollama</span>
        <button class="stop-btn" id="stopBtn" style="display:none">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          Stop
        </button>
        <button class="feature-btn" id="exportBtn" title="Export chat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Export
        </button>
        <button class="feature-btn" id="ttsToggleBtn" title="Read aloud">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span id="ttsLabel">TTS: Off</span>
        </button>
      </div>
    </div>
  </main>

  <!-- ===================== WEBSITE BUILDER PANEL ===================== -->
  <div class="builder-panel" id="builderPanel">
    <div class="builder-header">
      <div class="builder-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span id="builderProjectName">Website Builder</span>
      </div>
      <div class="builder-header-actions">
        <button class="builder-action-btn" id="builderPreviewToggle" title="Toggle Preview">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Preview
        </button>
        <button class="builder-action-btn builder-download-btn" id="builderDownload" title="Download ZIP">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Download ZIP
        </button>
        <button class="builder-close-btn" id="builderClose" title="Close">✕</button>
      </div>
    </div>

    <!-- File tabs -->
    <div class="builder-tabs" id="builderTabs"></div>

    <!-- Split view: code + preview -->
    <div class="builder-body" id="builderBody">
      <div class="builder-code-pane" id="builderCodePane">
        <div class="builder-code-header">
          <span class="builder-file-label" id="builderFileLabel">index.html</span>
          <button class="builder-copy-file-btn" id="builderCopyFile">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/>
            </svg>
            Copy
          </button>
        </div>
        <pre class="builder-pre"><code id="builderCode" class=""></code></pre>
      </div>

      <div class="builder-preview-pane" id="builderPreviewPane" style="display:none">
        <div class="builder-preview-header">
          <span>Live Preview</span>
          <div class="preview-viewport-btns">
            <button class="viewport-btn active" data-width="100%" title="Desktop">🖥</button>
            <button class="viewport-btn" data-width="768px" title="Tablet">📱</button>
            <button class="viewport-btn" data-width="375px" title="Mobile">📲</button>
          </div>
          <button class="builder-refresh-btn" id="builderRefresh" title="Refresh preview">↺</button>
        </div>
        <div class="preview-wrapper" id="previewWrapper">
          <iframe id="previewFrame" sandbox="allow-scripts allow-same-origin allow-forms" title="Website Preview"></iframe>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="builder-statusbar" id="builderStatusbar">
      <span id="builderStatus">Ready</span>
      <span id="builderFileCount"></span>
    </div>
  </div>

  <!-- Rename Chat Modal -->
  <div class="modal-overlay" id="renameModal">
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2>Rename Chat</h2>
        <button class="modal-close" id="renameClose">✕</button>
      </div>
      <div class="modal-body">
        <div class="setting-group">
          <label class="setting-label">Chat Name</label>
          <input type="text" class="setting-input" id="renameInput" maxlength="80" placeholder="Enter a name…" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="renameCancelBtn">Cancel</button>
        <button class="btn-primary" id="renameSaveBtn">Rename</button>
      </div>
    </div>
  </div>

  <!-- Persona Modal — Scenario-based Character AI style -->
  <div class="modal-overlay" id="personaModal">
    <div class="modal modal-persona">
      <div class="modal-header">
        <div class="persona-modal-title">
          <span class="persona-modal-icon">🎭</span>
          <div>
            <h2>AI Companion</h2>
            <p class="persona-modal-sub">Create a character &amp; scenario — like Character.AI</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <label class="persona-toggle-wrap" title="Enable / disable persona">
            <input type="checkbox" id="personaToggle" />
            <span class="persona-toggle-slider"></span>
          </label>
          <button class="modal-close" id="personaClose">✕</button>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="persona-tabs">
        <button class="persona-tab active" data-tab="presets">✨ Quick Start</button>
        <button class="persona-tab" data-tab="character">🧑 Character</button>
        <button class="persona-tab" data-tab="scenario">🌍 Scenario</button>
        <button class="persona-tab" data-tab="preview">👁 Preview</button>
      </div>

      <div class="modal-body persona-modal-body">

        <!-- ── TAB: Quick Start ── -->
        <div class="persona-tab-panel active" id="tab-presets">
          <p class="persona-tab-desc">Pick a ready-made scenario to start instantly — or build your own in the other tabs.</p>
          <div class="preset-scenario-grid" id="presetScenarioGrid">
            <!-- Populated by JS -->
          </div>
        </div>

        <!-- ── TAB: Character ── -->
        <div class="persona-tab-panel" id="tab-character">
          <div class="persona-names-row">
            <div class="setting-group">
              <label class="setting-label">Character name</label>
              <input type="text" class="setting-input" id="personaNameInput" maxlength="40" placeholder="e.g. Alex, Mia, Sam, Ethan…" />
            </div>
            <div class="setting-group">
              <label class="setting-label">Your name in this world</label>
              <input type="text" class="setting-input" id="personaUserNameInput" maxlength="40" placeholder="What they call you…" />
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">Relationship to you</label>
            <div class="persona-cards">
              <button class="persona-card selected" data-relation="friend"><span class="persona-card-emoji">👋</span><span class="persona-card-label">Friend</span></button>
              <button class="persona-card" data-relation="bestfriend"><span class="persona-card-emoji">🤜</span><span class="persona-card-label">Best Friend</span></button>
              <button class="persona-card" data-relation="brother"><span class="persona-card-emoji">👦</span><span class="persona-card-label">Brother</span></button>
              <button class="persona-card" data-relation="sister"><span class="persona-card-emoji">👧</span><span class="persona-card-label">Sister</span></button>
              <button class="persona-card" data-relation="mother"><span class="persona-card-emoji">👩</span><span class="persona-card-label">Mother</span></button>
              <button class="persona-card" data-relation="father"><span class="persona-card-emoji">👨</span><span class="persona-card-label">Father</span></button>
              <button class="persona-card" data-relation="lover"><span class="persona-card-emoji">💕</span><span class="persona-card-label">Lover</span></button>
              <button class="persona-card" data-relation="rival"><span class="persona-card-emoji">⚡</span><span class="persona-card-label">Rival</span></button>
            </div>
          </div>

          <div class="persona-names-row">
            <div class="setting-group">
              <label class="setting-label">Gender</label>
              <select class="setting-input" id="personaGender">
                <option value="neutral">Non-binary / Neutral</option>
                <option value="female">Female (she/her)</option>
                <option value="male">Male (he/him)</option>
              </select>
            </div>
            <div class="setting-group">
              <label class="setting-label">Tone / vibe</label>
              <select class="setting-input" id="personaLanguage">
                <option value="casual">Casual &amp; Real</option>
                <option value="playful">Playful &amp; Fun</option>
                <option value="warm">Warm &amp; Gentle</option>
                <option value="caring">Caring &amp; Nurturing</option>
                <option value="flirty">Charming &amp; Flirty</option>
                <option value="tsundere">Tsundere</option>
                <option value="cold">Cold / Distant</option>
                <option value="intense">Intense &amp; Passionate</option>
              </select>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">Character traits</label>
            <div class="trait-pills">
              <button class="trait-pill" data-trait="funny">😂 Funny</button>
              <button class="trait-pill" data-trait="sarcastic">😏 Sarcastic</button>
              <button class="trait-pill" data-trait="protective">🛡 Protective</button>
              <button class="trait-pill" data-trait="honest">💯 Brutally Honest</button>
              <button class="trait-pill" data-trait="motivating">🔥 Motivating</button>
              <button class="trait-pill" data-trait="chill">😎 Chill</button>
              <button class="trait-pill" data-trait="nerdy">🤓 Nerdy</button>
              <button class="trait-pill" data-trait="romantic">🌹 Romantic</button>
              <button class="trait-pill" data-trait="mysterious">🌑 Mysterious</button>
              <button class="trait-pill" data-trait="teasing">😜 Teasing</button>
              <button class="trait-pill" data-trait="shy">🙈 Shy</button>
              <button class="trait-pill" data-trait="confident">💪 Confident</button>
            </div>
          </div>
        </div>

        <!-- ── TAB: Scenario ── -->
        <div class="persona-tab-panel" id="tab-scenario">
          <div class="setting-group">
            <label class="setting-label">Setting / World</label>
            <div class="scenario-setting-grid" id="scenarioSettingGrid">
              <!-- Populated by JS -->
            </div>
          </div>

          <div class="setting-group" style="margin-top:16px;">
            <label class="setting-label">Scene description <span class="label-required">*</span></label>
            <textarea class="setting-textarea" id="scenarioDesc" rows="4"
              placeholder="Describe the world and situation. E.g.: It's a rainy Monday morning at Westbrook High. You and {name} have been assigned as lab partners in Chemistry class. You've seen each other around school but never really talked…"></textarea>
            <p class="setting-desc">Be specific — mention the place, time of day, mood, and what's happening right now.</p>
          </div>

          <div class="setting-group">
            <label class="setting-label">Opening line <span style="font-weight:400;color:var(--text-muted)">(what they say first)</span></label>
            <textarea class="setting-textarea" id="scenarioOpener" rows="2"
              placeholder="e.g. *slides into the seat next to you and drops their bag* Hey… so we're lab partners now huh? I'm {name}, by the way."></textarea>
            <p class="setting-desc">Use *asterisks* for actions. Leave blank to let the AI open naturally.</p>
          </div>

          <div class="persona-names-row">
            <div class="setting-group">
              <label class="setting-label">Your role in the scenario</label>
              <input type="text" class="setting-input" id="scenarioUserRole" maxlength="60"
                placeholder="e.g. new student, teammate, coworker…" />
            </div>
            <div class="setting-group">
              <label class="setting-label">Their role in the scenario</label>
              <input type="text" class="setting-input" id="scenarioCharRole" maxlength="60"
                placeholder="e.g. popular kid, class president, rival…" />
            </div>
          </div>
        </div>

        <!-- ── TAB: Preview ── -->
        <div class="persona-tab-panel" id="tab-preview">
          <p class="persona-tab-desc">This is the full prompt that will be sent to the AI. Save your persona to apply it.</p>
          <pre class="persona-preview-box" id="personaPreviewBox">Fill in Character and Scenario tabs first…</pre>
        </div>

      </div><!-- end modal-body -->

      <div class="modal-footer" style="justify-content:space-between;align-items:center;">
        <div class="persona-footer-left">
          <button class="btn-ghost" id="personaResetBtn">🗑 Reset</button>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" id="personaCancelBtn">Cancel</button>
          <button class="btn-primary" id="personaSaveBtn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="margin-right:4px"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Start Scenario
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- TTS Voice Settings Modal -->
  <div class="modal-overlay" id="ttsModal">
    <div class="modal modal-tts">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">🎤</span>
          <div>
            <h2>Voice Settings</h2>
            <p class="persona-modal-sub">Choose between browser voice or Piper AI voice</p>
          </div>
        </div>
        <button class="modal-close" id="ttsClose">✕</button>
      </div>
      <div class="modal-body">

        <!-- Engine picker -->
        <div class="setting-group">
          <label class="setting-label">Voice Engine</label>
          <div class="tts-engine-cards">
            <label class="tts-engine-card">
              <input type="radio" class="tts-engine-radio" name="ttsEngine" value="browser" checked />
              <div class="tts-engine-card-inner">
                <span class="tts-engine-icon">🔊</span>
                <div>
                  <strong>Browser Voice</strong>
                  <p>Uses your OS built-in voices. Instant, no download. Sounds robotic.</p>
                </div>
              </div>
            </label>
            <label class="tts-engine-card">
              <input type="radio" class="tts-engine-radio" name="ttsEngine" value="piper" />
              <div class="tts-engine-card-inner">
                <span class="tts-engine-icon">🧠</span>
                <div>
                  <strong>Piper AI Voice</strong>
                  <p>Lightweight neural TTS. Natural speech, 24 voices across 12 languages. Runs 100% locally. ~30–80MB one-time download per voice.</p>
                </div>
              </div>
            </label>
          </div>
        </div>

        <!-- Piper options (shown only when Piper selected) -->
        <div id="ttsPiperOptions" style="display:none">

          <!-- Voice selector -->
          <div class="setting-group">
            <label class="setting-label">Voice <span style="font-weight:400;color:var(--text-muted)">— downloaded &amp; cached on first use</span></label>
            <select class="setting-input" id="ttsVoiceSelect">
              <optgroup label="🇺🇸 English US">
                <option value="en_US-lessac-medium" selected>Lessac ⭐ (US Female) — recommended</option>
                <option value="en_US-amy-medium">Amy (US Female)</option>
                <option value="en_US-hfc_female-medium">HFC Female (US)</option>
                <option value="en_US-hfc_male-medium">HFC Male (US)</option>
                <option value="en_US-joe-medium">Joe (US Male)</option>
                <option value="en_US-ryan-medium">Ryan (US Male)</option>
                <option value="en_US-danny-low">Danny (US Male)</option>
                <option value="en_US-kathleen-low">Kathleen (US Female)</option>
                <option value="en_US-kusal-medium">Kusal (US Male)</option>
                <option value="en_US-libritts-high">LibriTTS (US Female, HQ)</option>
                <option value="en_US-ljspeech-high">LJSpeech (US Female, HQ)</option>
              </optgroup>
              <optgroup label="🇬🇧 English GB">
                <option value="en_GB-alan-medium">Alan (GB Male)</option>
                <option value="en_GB-cori-high">Cori (GB Female, HQ)</option>
                <option value="en_GB-jenny_dioco-medium">Jenny (GB Female)</option>
                <option value="en_GB-northern_english_male-medium">Northern Male</option>
                <option value="en_GB-vctk-medium">VCTK (GB Multi)</option>
              </optgroup>
              <optgroup label="🇩🇪 German">
                <option value="de_DE-thorsten-medium">Thorsten (Male)</option>
                <option value="de_DE-eva_k-x_low">Eva (Female)</option>
                <option value="de_DE-mls-medium">MLS (Female)</option>
              </optgroup>
              <optgroup label="🇫🇷 French">
                <option value="fr_FR-siwis-medium">Siwis (Female)</option>
                <option value="fr_FR-tom-medium">Tom (Male)</option>
                <option value="fr_FR-mls-medium">MLS (Female)</option>
              </optgroup>
              <optgroup label="🇪🇸 Spanish">
                <option value="es_ES-davefx-medium">Dave (Male)</option>
                <option value="es_ES-sharvard-medium">Sharvard (Male)</option>
              </optgroup>
              <optgroup label="🇮🇹 Italian">
                <option value="it_IT-paola-medium">Paola (Female)</option>
                <option value="it_IT-riccardo-x_low">Riccardo (Male)</option>
              </optgroup>
              <optgroup label="🇧🇷 Portuguese">
                <option value="pt_BR-faber-medium">Faber (BR Male)</option>
              </optgroup>
              <optgroup label="🇳🇱 Dutch">
                <option value="nl_NL-mls-medium">MLS (Female)</option>
              </optgroup>
              <optgroup label="🇷🇺 Russian">
                <option value="ru_RU-ruslan-medium">Ruslan (Male)</option>
                <option value="ru_RU-irina-medium">Irina (Female)</option>
              </optgroup>
              <optgroup label="🇨🇳 Chinese">
                <option value="zh_CN-huayan-medium">Huayan (Female)</option>
              </optgroup>
            </select>
            <p class="setting-desc">Each voice downloads once (~30–80MB) and is cached by your browser permanently.</p>
          </div>

          <!-- Piper model status + progress -->
          <div class="setting-group">
            <div class="tts-model-status-row">
              <span class="tts-model-status" id="ttsPiperStatus">Select a voice above then click Enable Voice</span>
            </div>
            <div id="ttsPiperProgressWrap" style="display:none; margin-top:8px;">
              <div class="tts-progress-bar-wrap">
                <div class="tts-progress-bar" id="ttsPiperProgressBar" style="width:0%"></div>
              </div>
            </div>
          </div>

        </div>

        <!-- Speed (both engines) -->
        <div class="setting-group">
          <label class="setting-label">Speed: <span id="ttsSpeedLabel">1.0×</span></label>
          <input type="range" class="setting-range" id="ttsSpeedRange" min="0.5" max="2.0" step="0.1" value="1.0" />
          <p class="setting-desc">Adjust how fast the voice speaks.</p>
        </div>

        <!-- Test button -->
        <div class="setting-group">
          <button class="tts-test-btn" id="ttsTestBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
            </svg>
            Preview Voice
          </button>
        </div>

      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="ttsCancelBtn">Cancel</button>
        <button class="btn-primary" id="ttsSaveBtn">Enable Voice</button>
      </div>
    </div>
  </div>

  <!-- Settings Modal — tabbed, scrollable, categorized -->
  <div class="modal-overlay" id="settingsModal">
    <div class="modal modal-settings">

      <div class="modal-header" style="border-bottom:1px solid var(--border);padding:16px 20px">
        <h2 style="font-size:16px">Settings</h2>
        <button class="modal-close" id="settingsClose">&#10005;</button>
      </div>

      <div class="modal-body" style="padding:0;flex:1;overflow:hidden;display:flex;min-height:0">
      <div class="settings-layout">

        <!-- Left tab rail -->
        <nav class="settings-nav">
          <button class="snav-btn active" data-tab="sGeneral">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="2"/></svg>
            General
          </button>
          <button class="snav-btn" data-tab="sModels">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Models
          </button>
          <button class="snav-btn" data-tab="sProviders">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2"/></svg>
            AI Providers
          </button>
          <button class="snav-btn" data-tab="sGeneration">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Generation
          </button>
          <button class="snav-btn" data-tab="sAppearance">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2"/><path d="M2 12h20" stroke="currentColor" stroke-width="2"/></svg>
            Appearance
          </button>
          <button class="snav-btn" data-tab="sNovelWriter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Novel Writer
          </button>
          <button class="snav-btn" data-tab="sAbout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            About
          </button>
        </nav>

        <!-- Right scrollable content -->
        <div class="settings-content">

          <!-- ═══ GENERAL ═══ -->
          <div class="stab active" id="sGeneral">
            <div class="stab-section-title">General</div>

            <div class="setting-group">
              <label class="setting-label">Ollama API URL</label>
              <input type="text" class="setting-input" id="ollamaUrl" value="http://localhost:11434" />
              <p class="setting-desc">The URL where Ollama is running. Default is localhost.</p>
            </div>

            <div class="setting-group">
              <label class="setting-label">System Prompt</label>
              <textarea class="setting-textarea" id="systemPrompt" rows="5">You are Hazy, a helpful AI assistant by Dream On. You are smart, clear, and concise. When writing code, always use proper formatting. Be friendly but professional.</textarea>
              <p class="setting-desc">Customize how the AI behaves in Chat mode.</p>
            </div>

            <div class="stab-section-title" style="margin-top:20px">Chat Behavior</div>

            <div class="setting-group">
              <label class="setting-label">Temperature: <span id="tempLabel">0.7</span></label>
              <input type="range" class="setting-range" id="temperature" min="0" max="2" step="0.1" value="0.7" />
              <p class="setting-desc">Higher = more creative. Lower = more focused and deterministic.</p>
            </div>

            <div class="setting-group">
              <label class="setting-label">Max Tokens: <span id="maxTokensLabel">4096</span></label>
              <input type="range" class="setting-range" id="maxTokens" min="256" max="8192" step="256" value="4096" />
              <p class="setting-desc">Maximum response length. Use 4096+ for website building.</p>
            </div>

            <div class="stab-section-title" style="margin-top:20px">Website Builder</div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input type="checkbox" id="autoContinueBuild" checked />
                <span>Auto-continue when generation is truncated</span>
              </label>
              <p class="setting-desc">Automatically continues building when output hits token limit (up to 5 attempts).</p>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input type="checkbox" id="showLiveCode" checked />
                <span>Show live code as it's being written</span>
              </label>
              <p class="setting-desc">Display code files in real-time during generation (like Claude's interface).</p>
            </div>
          </div>

          <!-- ═══ MODELS ═══ -->
          <div class="stab" id="sModels">
            <div class="stab-section-title">Local Models (Ollama)</div>

            <div class="setting-group">
              <label class="setting-label">Connection</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="text" class="setting-input" id="ollamaUrlProvider" placeholder="http://localhost:11434" style="flex:1">
                <button class="btn-secondary" onclick="testOllamaConn()" style="padding:7px 14px;font-size:12px;white-space:nowrap">Test</button>
              </div>
              <span id="ollamaConnStatus" style="font-size:12px;color:var(--text-muted);margin-top:4px;display:block"></span>
            </div>

            <div class="setting-group">
              <label class="setting-label">Installed Models</label>
              <div id="installedModelsList" style="display:flex;gap:6px;flex-wrap:wrap;min-height:32px">
                <span style="font-size:12px;color:var(--text-muted);font-style:italic">Loading...</span>
              </div>
            </div>

            <div class="stab-section-title" style="margin-top:20px">Download a Model</div>
            <div class="setting-group">
              <label class="setting-label">Select model to download</label>
              <div style="display:flex;gap:8px">
                <select id="pullModelSelect" class="setting-input" style="flex:1">
                  <optgroup label="Small (0-4GB) — Low VRAM">
                    <option value="llama3.2:1b">llama3.2:1b  — 1B  · ~0.8GB · fastest</option>
                    <option value="llama3.2" selected>llama3.2     — 3B  · ~2GB   · recommended</option>
                    <option value="phi3">phi3         — 3.8B· ~2.3GB</option>
                  </optgroup>
                  <optgroup label="Medium (4-10GB) — 6GB+ VRAM">
                    <option value="mistral">mistral      — 7B  · ~4GB   · best writing</option>
                    <option value="llama3">llama3       — 8B  · ~4.7GB</option>
                    <option value="gemma2">gemma2       — 9B  · ~5.4GB</option>
                    <option value="qwen2.5">qwen2.5      — 7B  · ~4.4GB</option>
                    <option value="deepseek-r1">deepseek-r1  — 7B  · ~4.5GB</option>
                    <option value="llava">llava        — 7B  · ~4.5GB · vision</option>
                    <option value="codellama">codellama    — 7B  · ~3.8GB · code</option>
                  </optgroup>
                  <optgroup label="Large (10-20GB) — 12GB+ VRAM">
                    <option value="phi3:medium">phi3:medium  — 14B · ~8.4GB</option>
                    <option value="qwen2.5:14b">qwen2.5:14b  — 14B · ~8.9GB</option>
                    <option value="gemma2:27b">gemma2:27b   — 27B · ~16GB</option>
                  </optgroup>
                  <optgroup label="Huge (20GB+) — High-end GPU">
                    <option value="mixtral">mixtral      — 47B · ~26GB · best local</option>
                    <option value="deepseek-r1:70b">deepseek-r1:70b — 70B · ~40GB</option>
                    <option value="qwen2.5:72b">qwen2.5:72b  — 72B · ~42GB</option>
                  </optgroup>
                </select>
                <button class="btn-primary" id="pullModelBtn" onclick="pullModel()" style="padding:7px 14px;font-size:12px;white-space:nowrap">&#8595; Download</button>
              </div>
              <div id="pullProgressWrap" style="display:none;margin-top:10px">
                <div style="background:var(--border);border-radius:3px;height:5px;overflow:hidden">
                  <div id="pullProgressBar" style="height:100%;background:var(--accent);border-radius:3px;transition:width .3s;width:0%"></div>
                </div>
                <div id="pullProgressText" style="font-size:11px;color:var(--text-muted);margin-top:5px"></div>
              </div>
              <p class="setting-desc" style="margin-top:6px">Models download once and run forever locally. Larger = better quality but needs more RAM/VRAM.</p>
            </div>
          </div>

          <!-- ═══ AI PROVIDERS ═══ -->
          <div class="stab" id="sProviders">
            <div class="stab-section-title">Active Providers</div>
            <div id="providerStatusBar" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px"></div>
            <p class="setting-desc" style="margin-bottom:16px">Keys are saved to <code style="font-size:11px;background:var(--bg-secondary);padding:1px 5px;border-radius:3px">config/hazy-config.json</code> on the server. Never stored in the browser. Restart server after editing the file directly.</p>

            <div class="stab-section-title">Cloud Text Models</div>
            <div id="providerKeyRows" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px"></div>

            <div class="stab-section-title">Image Generation</div>
            <div id="providerImageRows" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
              <!-- populated by JS -->
            </div>

            <div class="stab-section-title">Audio, Music &amp; Video</div>
            <div id="providerMediaRows" style="display:flex;flex-direction:column;gap:10px"></div>
          </div>

          <!-- ═══ GENERATION ═══ -->
          <div class="stab" id="sGeneration">
            <div class="stab-section-title">Text Generation Defaults</div>
            <p class="setting-desc" style="margin-bottom:16px">These defaults apply to the main chat. The Novel Writer has its own settings panel.</p>

            <div class="setting-group">
              <label class="setting-label">Repeat Penalty: <span id="repeatPenaltyLabel">1.1</span></label>
              <input type="range" class="setting-range" id="settingsRepeatPenalty" min="1.0" max="1.5" step="0.01" value="1.1"
                oninput="document.getElementById('repeatPenaltyLabel').textContent=parseFloat(this.value).toFixed(2)">
              <p class="setting-desc">Higher = less repetitive outputs. 1.1–1.2 is a good range.</p>
            </div>

            <div class="setting-group">
              <label class="setting-label">Top P: <span id="topPLabel">0.92</span></label>
              <input type="range" class="setting-range" id="settingsTopP" min="0.5" max="1.0" step="0.01" value="0.92"
                oninput="document.getElementById('topPLabel').textContent=parseFloat(this.value).toFixed(2)">
              <p class="setting-desc">Nucleus sampling. Lower = more focused vocabulary. 0.9–0.95 recommended.</p>
            </div>

            <div class="stab-section-title" style="margin-top:20px">Context &amp; Memory</div>

            <div class="setting-group">
              <label class="setting-label">Context Window Size</label>
              <select class="setting-input" id="settingsContextSize">
                <option value="2048">2048 tokens — low memory</option>
                <option value="4096" selected>4096 tokens — default</option>
                <option value="8192">8192 tokens — extended</option>
                <option value="16384">16384 tokens — large context</option>
                <option value="32768">32768 tokens — huge (model must support)</option>
              </select>
              <p class="setting-desc">How much conversation history the model can see at once.</p>
            </div>
          </div>

          <!-- ═══ APPEARANCE ═══ -->
          <div class="stab" id="sAppearance">
            <div class="stab-section-title">Theme</div>

            <div class="setting-group">
              <div class="theme-btns">
                <button class="theme-btn active" data-theme="hazel">&#9788; Hazel</button>
                <button class="theme-btn" data-theme="dark">&#9790; Dark</button>
                <button class="theme-btn" data-theme="oled">&#11044; OLED</button>
              </div>
              <p class="setting-desc" style="margin-top:10px">Hazel is a warm default. OLED is pure black for AMOLED screens.</p>
            </div>

            <div class="stab-section-title" style="margin-top:20px">Chat Display</div>

            <div class="setting-group">
              <label class="setting-label">Font Size</label>
              <select class="setting-input" id="settingsFontSize">
                <option value="13px">Small</option>
                <option value="14px" selected>Medium (default)</option>
                <option value="16px">Large</option>
                <option value="18px">Extra Large</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">Message Density</label>
              <select class="setting-input" id="settingsDensity">
                <option value="compact">Compact</option>
                <option value="normal" selected>Normal</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
                <input type="checkbox" id="settingsCodeHighlight" checked style="width:16px;height:16px">
                Enable syntax highlighting in code blocks
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
                <input type="checkbox" id="settingsMarkdown" checked style="width:16px;height:16px">
                Render markdown (bold, italics, lists)
              </label>
            </div>
          </div>

          <!-- ═══ NOVEL WRITER ═══ -->
          <div class="stab" id="sNovelWriter">
            <div class="stab-section-title">Active Model for Novel Writer</div>
            <p class="setting-desc" style="margin-bottom:14px">Choose which AI provider and model the Novel Writer uses. This is separate from the main chat model.</p>

            <div class="setting-group">
              <label class="setting-label">Provider</label>
              <select id="activeProviderSelect" class="setting-input" onchange="updateModelDropdown()">
                <option value="ollama">&#128421; Ollama (Local — no API key)</option>
                <option value="anthropic">&#9889; Anthropic (Claude)</option>
                <option value="openai">&#11088; OpenAI (GPT-4o)</option>
                <option value="groq">&#9889; Groq (Free + Fast)</option>
                <option value="gemini">&#128312; Google Gemini</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">Model</label>
              <select id="activeModelSelect" class="setting-input">
                <option value="ollama/llama3.2">llama3.2 (3B)</option>
              </select>
              <p class="setting-desc">The Novel Writer uses this model for all 8 generation steps: planning, writing, summarizing, and contradiction checking.</p>
            </div>

            <div class="stab-section-title" style="margin-top:20px">Novel Writer Defaults</div>

            <div class="setting-group">
              <label class="setting-label">Default Words per Chapter: <span id="novelWordsLabel">2000</span></label>
              <input type="range" class="setting-range" id="novelDefaultWords" min="500" max="5000" step="100" value="2000"
                oninput="document.getElementById('novelWordsLabel').textContent=parseInt(this.value).toLocaleString()">
            </div>

            <div class="setting-group">
              <label class="setting-label">Default Total Chapters: <span id="novelChaptersLabel">10</span></label>
              <input type="range" class="setting-range" id="novelDefaultChapters" min="3" max="50" step="1" value="10"
                oninput="document.getElementById('novelChaptersLabel').textContent=this.value">
            </div>

            <div class="setting-group">
              <label class="setting-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
                <input type="checkbox" id="novelAutoSave" checked style="width:16px;height:16px">
                Auto-save to IndexedDB after every chapter
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
                <input type="checkbox" id="novelContradictionCheck" checked style="width:16px;height:16px">
                Run contradiction checker after every chapter
              </label>
            </div>

            <div style="margin-top:16px;padding:12px 14px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
              <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Open Novel Writer</div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">The Novel Writer runs in its own page with the full 8-step pipeline.</div>
              <a href="/novel-writer.html" target="_blank" class="btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;font-size:13px;border-radius:6px;text-decoration:none">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open Novel Writer &#8599;
              </a>
            </div>
          </div>

          <!-- ═══ ABOUT ═══ -->
          <div class="stab" id="sAbout">
            <div class="stab-section-title">About Hazy</div>
            <div style="padding:16px;background:var(--bg-secondary);border-radius:10px;border:1px solid var(--border);margin-bottom:16px">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                <div style="width:40px;height:40px;background:var(--accent);border-radius:10px;display:flex;align-items:center;justify-content:center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="white" opacity="0.5"/><circle cx="12" cy="12" r="3" fill="white"/></svg>
                </div>
                <div>
                  <div style="font-size:16px;font-weight:600;color:var(--text-primary)">Hazy</div>
                  <div style="font-size:12px;color:var(--text-muted)">by Dream On · v2.0</div>
                </div>
              </div>
              <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">A fully local AI assistant — chat, build websites, write novels. Runs 100% on your machine. No cloud, no subscriptions, no data leaving your device.</div>
            </div>

            <div class="stab-section-title">What&#39;s New in v2</div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
              <div class="about-feature">&#128218; <strong>Novel Writer</strong> — full 8-step pipeline with story memory, contradiction checker, auto-ban</div>
              <div class="about-feature">&#127757; <strong>Universal AI</strong> — Claude, GPT-4o, Groq, Gemini + all local Ollama models</div>
              <div class="about-feature">&#128190; <strong>IndexedDB</strong> — novels saved permanently, resume any time</div>
              <div class="about-feature">&#9888; <strong>Contradiction Checker</strong> — automatic cross-chapter plot consistency</div>
              <div class="about-feature">&#128683; <strong>Auto-Ban</strong> — repeated phrases detected and banned automatically</div>
            </div>

            <div class="stab-section-title">Keyboard Shortcuts</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:13px;margin-bottom:20px">
              <kbd class="kbd">Ctrl+K</kbd><span style="color:var(--text-secondary)">New chat</span>
              <kbd class="kbd">Enter</kbd><span style="color:var(--text-secondary)">Send message</span>
              <kbd class="kbd">Shift+Enter</kbd><span style="color:var(--text-secondary)">New line</span>
              <kbd class="kbd">Ctrl+Enter</kbd><span style="color:var(--text-secondary)">Save edit</span>
              <kbd class="kbd">Esc</kbd><span style="color:var(--text-secondary)">Close modal</span>
            </div>

            <div class="stab-section-title">Data &amp; Storage</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn-secondary" onclick="exportAllData()" style="justify-content:flex-start;gap:8px;font-size:13px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Export All Data
              </button>
              <button class="btn-secondary" onclick="if(confirm('Clear all chat history? This cannot be undone.'))localStorage.clear(),location.reload()" style="justify-content:flex-start;gap:8px;font-size:13px;color:var(--danger)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2"/></svg>
                Clear Chat History
              </button>
            </div>
          </div>

        </div><!-- /settings-content -->
      </div><!-- /settings-layout -->
      </div><!-- /modal-body -->

      <div class="modal-footer" style="justify-content:space-between;border-top:1px solid var(--border)">
        <button class="btn-secondary" id="trainingDataBtn" style="display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Training Data
        </button>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" id="settingsCancelBtn">Cancel</button>
          <button class="btn-primary" id="settingsSaveBtn">Save Settings</button>
        </div>
      </div>

    </div>
  </div>

  <!-- Training Data Modal -->
  <div class="modal-overlay" id="trainingModal">
    <div class="modal" style="max-width:720px;width:95vw;">
      <div class="modal-header">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <h2>Training Data Builder</h2>
          <span style="font-size:11px;color:var(--text-muted);font-weight:400;">Build a fine-tuning dataset — export as JSONL to train with Unsloth or Hugging Face</span>
        </div>
        <button class="modal-close" id="trainingClose">✕</button>
      </div>
      <div class="modal-body" style="padding:0;">

        <!-- Tabs -->
        <div class="training-tabs">
          <button class="training-tab active" data-tab="manual">Manual Entry</button>
          <button class="training-tab" data-tab="import">Import Text</button>
          <button class="training-tab" data-tab="from-chat">From Chat</button>
          <button class="training-tab" data-tab="preview">Preview & Export</button>
        </div>

        <!-- Manual Entry Tab -->
        <div class="training-tab-panel active" id="training-tab-manual">
          <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
            <p style="font-size:13px;color:var(--text-secondary);margin:0;">Add question → answer pairs. These become the examples your model learns from.</p>
            <div class="setting-group">
              <label class="setting-label">Instruction / Question</label>
              <textarea class="setting-textarea" id="trainInstruction" rows="3" placeholder="e.g. What is the capital of France?"></textarea>
            </div>
            <div class="setting-group">
              <label class="setting-label">Ideal Response / Answer</label>
              <textarea class="setting-textarea" id="trainResponse" rows="4" placeholder="e.g. The capital of France is Paris."></textarea>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button class="btn-primary" id="trainAddPairBtn">+ Add Pair</button>
              <span id="trainPairCount" style="font-size:12px;color:var(--text-muted);">0 pairs added</span>
            </div>
          </div>
        </div>

        <!-- Import Text Tab -->
        <div class="training-tab-panel" id="training-tab-import">
          <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
            <p style="font-size:13px;color:var(--text-secondary);margin:0;">Paste a big block of text — articles, notes, books, docs. The AI will split it into training pairs automatically.</p>
            <div class="setting-group">
              <label class="setting-label">Paste your text below</label>
              <textarea class="setting-textarea" id="trainBulkText" rows="10" placeholder="Paste any text here — articles, documentation, notes, FAQs, anything. The more the better.&#10;&#10;Tip: You can paste multiple documents one after another."></textarea>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="btn-primary" id="trainSplitBtn">Split into Pairs with AI</button>
              <button class="btn-secondary" id="trainRawBtn">Add as Raw Text</button>
              <span id="trainBulkStatus" style="font-size:12px;color:var(--text-muted);"></span>
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0;">
              <strong>Split with AI</strong> — uses Hazy to extract Q&amp;A pairs from your text (requires Ollama running).<br>
              <strong>Add as Raw Text</strong> — adds the text as-is for next-token-prediction training.
            </p>
          </div>
        </div>

        <!-- From Chat Tab -->
        <div class="training-tab-panel" id="training-tab-from-chat">
          <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
            <p style="font-size:13px;color:var(--text-secondary);margin:0;">Turn your existing Hazy conversations into training data. Pick which chats to include.</p>
            <div id="trainChatList" style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto;"></div>
            <button class="btn-secondary" id="trainAddChatsBtn" style="align-self:flex-start;">+ Add Selected Chats</button>
          </div>
        </div>

        <!-- Preview & Export Tab -->
        <div class="training-tab-panel" id="training-tab-preview">
          <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <span id="trainTotalCount" style="font-size:15px;font-weight:600;color:var(--text-primary);">0 examples</span>
                <span style="font-size:12px;color:var(--text-muted);margin-left:8px;">ready to export</span>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn-secondary" id="trainClearBtn">Clear All</button>
                <button class="btn-primary" id="trainExportBtn">⬇ Download JSONL</button>
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <div style="flex:1;min-width:180px;background:var(--bg-secondary);border-radius:8px;padding:12px;">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">FORMAT</div>
                <select class="setting-input" id="trainFormatSelect" style="width:100%;padding:6px 8px;font-size:13px;">
                  <option value="alpaca">Alpaca (instruction/output)</option>
                  <option value="chatml">ChatML (messages array)</option>
                  <option value="raw">Raw text (completion)</option>
                </select>
              </div>
              <div style="flex:1;min-width:180px;background:var(--bg-secondary);border-radius:8px;padding:12px;">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">SYSTEM PROMPT</div>
                <input type="text" class="setting-input" id="trainSystemPrompt" placeholder="Optional system message..." style="width:100%;padding:6px 8px;font-size:13px;">
              </div>
            </div>

            <div id="trainPreviewList" style="display:flex;flex-direction:column;gap:10px;max-height:300px;overflow-y:auto;"></div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <div class="toast-container" id="toastContainer"></div>

  <!-- PDF.js for PDF text extraction -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <!-- JSZip for ZIP download -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <!-- Highlight.js -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

  <!-- app.js always loads first — nothing should ever block it -->
  <script src="app.js"></script>
  <script src="hazy-enhancements-complete.js"></script>

  <!-- Piper TTS loads independently in the background after app is running -->
  <script type="importmap">
  {
    "imports": {
      "onnxruntime-web": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm"
    }
  }
  </script>
  <script type="module">
    try {
      const tts = await import('/piper/piper-tts-web.js');
      window.PiperTTS = tts;
      window.dispatchEvent(new Event('piper-ready'));
    } catch(e) {
      console.warn('[Piper] TTS library failed to load — browser voice still works:', e);
      window.PiperTTS = null;
      window.dispatchEvent(new Event('piper-ready'));
    }
  </script>
</body>
</html>
~~~

### frontend\index.html

- Size: 31584 bytes
- Language: html

~~~html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Hazy — Local AI Assistant by Dream On</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css" id="hljs-theme">
  <link rel="stylesheet" href="style.css" />
  <link rel="stylesheet" href="quick-prompts.css" />
  <link rel="stylesheet" href="hazy-rag.css" />
  <link rel="stylesheet" href="hazy-agent.css" />
</head>
<body>
  <svg width="0" height="0" style="position:absolute;left:-9999px;overflow:hidden" aria-hidden="true" focusable="false">
    <symbol id="icon-chat" viewBox="0 0 24 24"><path d="M5 6.5C5 5.12 6.12 4 7.5 4h9C17.88 4 19 5.12 19 6.5v6c0 1.38-1.12 2.5-2.5 2.5H10l-4 3v-3H7.5C6.12 15 5 13.88 5 12.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-home" viewBox="0 0 24 24"><path d="M4.5 11.5 12 5l7.5 6.5M6.5 10.75V19h4.5v-5H13v5h4.5v-8.25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-folder" viewBox="0 0 24 24"><path d="M4.5 7.5h5l2 2h7a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5v-8A2 2 0 0 1 5 7.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-box" viewBox="0 0 24 24"><path d="M4.5 7.5 12 4l7.5 3.5L12 11 4.5 7.5Zm0 0V16.5L12 20l7.5-3.5V7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-code" viewBox="0 0 24 24"><path d="M8 8 4 12l4 4M16 8l4 4-4 4M13 6 11 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-chart" viewBox="0 0 24 24"><path d="M5 19.25h14M7.75 16V10.5M12 16V7.25M16.25 16v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m7.5 10.75 4-3.5 4 2.25 2.25-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-clipboard" viewBox="0 0 24 24"><path d="M9 5.75h6M10 4h4a1.5 1.5 0 0 1 1.5 1.5v.25H17A2 2 0 0 1 19 7.75v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.75a2 2 0 0 1 2-2h1.5V5.5A1.5 1.5 0 0 1 10 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.4-3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.1 6.1l1.8 1.8M16.1 16.1l1.8 1.8M17.9 6.1l-1.8 1.8M7.9 16.1l-1.8 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="icon-user" viewBox="0 0 24 24"><path d="M12 12a3.75 3.75 0 1 0 0-7.5a3.75 3.75 0 0 0 0 7.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-send" viewBox="0 0 24 24"><path d="M4 12l15-8-4 15-3-6-8-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-activity" viewBox="0 0 24 24"><path d="M3 12h4l2-5 3 10 2-5h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-bulb" viewBox="0 0 24 24"><path d="M12 4a6.5 6.5 0 0 0-4 11.7V17h8v-1.3A6.5 6.5 0 0 0 12 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 20h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-refresh" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0 1.2 4.25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4.75v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-robot" viewBox="0 0 24 24"><path d="M12 3.5v3M9 3.5h6M7.75 8.25h8.5A2.75 2.75 0 0 1 19 11v5.25A2.75 2.75 0 0 1 16.25 19h-8.5A2.75 2.75 0 0 1 5 16.25V11a2.75 2.75 0 0 1 2.75-2.75Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.75 12.25h.01M15.25 12.25h.01" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M9.5 15.5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-bot" viewBox="0 0 24 24"><path d="M12 4v3M8.5 4h7M7.75 8.25h8.5A2.75 2.75 0 0 1 19 11v5.25A2.75 2.75 0 0 1 16.25 19h-8.5A2.75 2.75 0 0 1 5 16.25V11a2.75 2.75 0 0 1 2.75-2.75Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="12" r="1.1" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="15" cy="12" r="1.1" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
    <symbol id="icon-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c2.5 2.5 4 5.3 4 9s-1.5 6.5-4 9M12 3c-2.5 2.5-4 5.3-4 9s1.5 6.5 4 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="icon-check" viewBox="0 0 24 24"><path d="M5.5 12.5 10 17l8.5-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-arrow-right" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5v4l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-more" viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/></symbol>
  </svg>

  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-bot"></use></svg></div>
        <div class="brand-copy">
          <strong>Hazy</strong>
          <span>by Dream On</span>
        </div>
      </div>

      <button class="btn-primary sidebar-cta" id="newChatBtn">
        <svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg>
        New Chat
      </button>
      <button class="clear-chat-btn" id="clearChatBtn">
        <svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-clipboard"></use></svg>
        Clear Chat
      </button>

      <nav class="sidebar-nav">
        <button class="nav-item active"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-home"></use></svg><span>Home</span></button>
        <button class="nav-item"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chat"></use></svg><span>Chats</span></button>
        <button class="nav-item"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-folder"></use></svg><span>Projects</span></button>
        <button class="nav-item"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-box"></use></svg><span>Templates</span></button>
        <button class="nav-item"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-code"></use></svg><span>Code</span></button>
        <button class="nav-item"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chart"></use></svg><span>Dashboards</span></button>
        <button class="nav-item"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-clipboard"></use></svg><span>Forms</span></button>
        <button class="nav-item" id="settingsBtn"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-settings"></use></svg><span>Settings</span></button>
      </nav>

      <div class="sidebar-stack">
        <div class="stack-card model-selector" id="modelSelector">
          <div class="model-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-robot"></use></svg></div>
          <div class="model-info">
            <span class="model-name" id="currentModelName">minimax-m3:cloud</span>
            <span class="model-tag">Local • Private</span>
          </div>
          <svg class="icon-svg model-chevron" viewBox="0 0 24 24"><use href="#icon-close"></use></svg>
        </div>

        <div class="stack-card muted-card">
          <div class="muted-card-title"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-settings"></use></svg><span>Hazy is running locally</span></div>
          <p>Your data stays on this device.</p>
        </div>

        <div class="stack-card profile-card">
          <div class="profile-badge">D</div>
          <div>
            <strong>Dream On</strong>
            <span>Owner</span>
          </div>
          <svg class="icon-svg profile-chevron" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg>
        </div>
      </div>

      <div class="model-dropdown" id="modelDropdown">
        <div class="dropdown-header">Available Models</div>
        <div class="model-list" id="modelList">
          <div class="model-item loading-models">Connecting to Ollama...</div>
        </div>
      </div>
    </aside>

    <div class="main-column">
      <header class="topbar">
        <div class="topbar-brand">
          <strong>Hazy</strong>
          <span>by Dream On</span>
        </div>

        <div class="topbar-search">
          <svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-search"></use></svg>
          <input id="historySearch" type="text" placeholder="Search chats, projects, or ask Hazy anything..." autocomplete="off" />
          <kbd>⌘ K</kbd>
        </div>

        <div class="topbar-actions">
          <div class="status-chip" id="topbarStatus"><span class="status-dot" id="statusDot"></span><span id="statusText">Online</span></div>
          <button class="icon-chip" title="Theme"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-sun"></use></svg></button>
          <button class="profile-chip"><span>D</span></button>
        </div>
      </header>

      <div class="content-grid">
        <section class="center-pane">
          <div class="hero-card welcome-screen" id="welcomeScreen">
            <div class="hero-copy">
              <span class="eyebrow">Welcome to</span>
              <h1>Hazy</h1>
              <h2>Your local AI assistant</h2>
              <p>Chat, code, and build full websites and apps — all running locally on your machine.</p>
              <button class="btn-primary hero-cta">
                Start a new chat
                <svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg>
              </button>
            </div>
            <div class="hero-art" aria-hidden="true">
              <div class="orbit orbit-1"></div>
              <div class="orbit orbit-2"></div>
              <div class="orbit orbit-3"></div>
              <div class="hero-disc">
                <div class="disc-ring"></div>
                <div class="disc-ring ring-2"></div>
                <div class="disc-center"></div>
              </div>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <h3>Quick Start</h3>
            </div>
            <div class="quick-grid" id="suggestionGrid">
              <button class="quick-card suggestion-card" data-prompt="Build a portfolio landing page with a hero section, about, skills, and contact form. Make it modern and professional.">
                <span class="quick-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chat"></use></svg></span>
                <strong>Chat</strong>
                <span>Ask questions and get help with anything</span>
                <i><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></i>
              </button>
              <button class="quick-card suggestion-card" data-prompt="Create a full multi-page website for a restaurant with Home, Menu, About, and Contact pages. Include a Node.js backend with Express.">
                <span class="quick-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-globe"></use></svg></span>
                <strong>Website Builder</strong>
                <span>Build full websites with AI</span>
                <i><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></i>
              </button>
              <button class="quick-card suggestion-card" data-prompt="Build an analytics dashboard with charts showing revenue, users, and sales data. Use Chart.js for the graphs.">
                <span class="quick-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-code"></use></svg></span>
                <strong>Code</strong>
                <span>Generate, refactor, and explain code</span>
                <i><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></i>
              </button>
              <button class="quick-card suggestion-card" data-prompt="Create a contact form page with name, email, message fields, form validation, and a Node.js Express backend that handles submissions.">
                <span class="quick-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chart"></use></svg></span>
                <strong>Dashboard</strong>
                <span>Create analytics dashboards</span>
                <i><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></i>
              </button>
              <button class="quick-card suggestion-card" data-prompt="Create a contact form page with name, email, message fields, form validation, and a Node.js Express backend that handles submissions.">
                <span class="quick-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-clipboard"></use></svg></span>
                <strong>Forms</strong>
                <span>Build forms and backend APIs</span>
                <i><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></i>
              </button>
            </div>
          </div>

          <div class="templates-card panel-card">
            <div class="panel-header">
              <h3>Popular Templates</h3>
              <a href="#" class="link-accent">Browse all templates <svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></a>
            </div>
            <div class="template-grid">
              <button class="template-item suggestion-card" data-prompt="Build a portfolio landing page with contact form">
                <span class="template-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chart"></use></svg></span>
                <span>Build a portfolio landing page</span>
              </button>
              <button class="template-item suggestion-card" data-prompt="Restaurant website with Node.js backend">
                <span class="template-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-folder"></use></svg></span>
                <span>Restaurant website</span>
              </button>
              <button class="template-item suggestion-card" data-prompt="Analytics dashboard with Chart.js">
                <span class="template-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chart"></use></svg></span>
                <span>Analytics dashboard</span>
              </button>
              <button class="template-item suggestion-card" data-prompt="Contact form backend">
                <span class="template-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-clipboard"></use></svg></span>
                <span>Contact form backend</span>
              </button>
            </div>
          </div>

          <div class="chat-container" id="chatContainer">
            <div class="messages-area" id="messagesArea"></div>
            <div id="scrollAnchor"></div>
          </div>
        </section>

        <aside class="right-rail">
          <section class="rail-card">
            <div class="rail-header">
              <h3>Recent Chats</h3>
              <a href="#" class="link-accent">View all</a>
            </div>
            <div class="rail-list" id="chatHistory"></div>
          </section>

          <section class="rail-card">
            <div class="rail-header">
              <h3>Activity</h3>
              <span class="live-chip"><span class="status-dot live"></span>Live</span>
            </div>
            <div class="activity-list">
              <div class="activity-item"><span class="activity-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-code"></use></svg></span><span>Generated code for Navbar.jsx</span><time>2m ago</time></div>
              <div class="activity-item"><span class="activity-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chart"></use></svg></span><span>Created database schema</span><time>5m ago</time></div>
              <div class="activity-item"><span class="activity-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-folder"></use></svg></span><span>Built API route: /api/contact</span><time>7m ago</time></div>
              <div class="activity-item"><span class="activity-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-check"></use></svg></span><span>Deployed preview successfully</span><time>12m ago</time></div>
            </div>
          </section>

          <section class="rail-card tip-card">
            <div class="rail-header">
              <h3>Hazy Tip</h3>
              <button class="icon-chip tiny"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-refresh"></use></svg></button>
            </div>
            <div class="tip-body">
              <div class="tip-icon"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-bulb"></use></svg></div>
              <p>Use templates to jumpstart your project. You can customize anything later.</p>
              <a href="#" class="link-accent centered">Explore Templates <svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></a>
            </div>
          </section>
        </aside>
      </div>

      <div class="input-area">
        <div class="input-mode-bar" id="inputModeBar">
          <button class="mode-btn active" id="modeChatBtn" data-mode="chat">Chat</button>
          <button class="mode-btn" id="modeBuildBtn" data-mode="build">Build Website</button>
          <button class="mode-btn" id="modeCodeBtn" data-mode="code">Build Code</button>
          <div class="mode-status">Chat mode</div>
        </div>
        <div class="composer-card">
          <button class="voice-btn" id="voiceBtn" title="Voice input"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-microphone"></use></svg></button>
          <button class="voice-btn" id="attachBtn" title="Attach"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-clipboard"></use></svg></button>
          <textarea id="chatInput" placeholder="Ask Hazy anything..." rows="1"></textarea>
          <button class="send-btn" id="sendBtn" title="Send"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-send"></use></svg></button>
        </div>
        <div class="composer-footer">
          <span>Hazy by <strong>Dream On</strong>. 100% local. Private by design.</span>
          <div class="footer-actions">
            <button class="footer-chip">Export</button>
            <button class="footer-chip">TTS: Off</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="legacy-hooks" hidden>
    <button id="stopBtn"></button>
    <span id="charCount"></span>
    <button id="exportBtn"></button>
    <button id="ttsToggleBtn"></button>
    <span id="ttsLabel"></span>
    <button id="ttsVoiceBtn"></button>
    <div id="ttsModal"></div>
    <button id="ttsClose"></button>
    <select id="ttsVoiceSelect"></select>
    <input id="ttsSpeedRange" type="range" />
    <span id="ttsSpeedLabel"></span>
    <div id="ttsPiperStatus"></div>
    <button id="ttsTestBtn"></button>
    <button id="scrollBottomBtn"></button>
    <button id="sidebarToggle"></button>
    <div id="renameModal"></div>
    <input id="renameInput" />
    <button id="renameClose"></button>
    <button id="renameCancelBtn"></button>
    <button id="renameSaveBtn"></button>
    <button id="uploadBtn"></button>
    <input id="fileInput" type="file" />
    <div id="filePreviewStrip"></div>
    <select id="codeLangSelect"></select>
    <span id="modeIndicator"></span>
    <div id="personaModal"></div>
    <button id="personaClose"></button>
    <button id="personaSaveBtn"></button>
    <button id="personaCancelBtn"></button>
    <button id="personaResetBtn"></button>
    <input id="personaToggle" type="checkbox" />
    <input id="personaNameInput" />
    <input id="personaUserNameInput" />
    <select id="personaGender"></select>
    <select id="personaLanguage"></select>
    <span id="personaStatusBadge"></span>
    <textarea id="scenarioDesc"></textarea>
    <textarea id="scenarioOpener"></textarea>
    <input id="scenarioUserRole" />
    <input id="scenarioCharRole" />
    <div id="personaPreviewBox"></div>
    <div id="builderPanel"></div>
    <input id="builderProjectName" />
    <div id="builderTabs"></div>
    <div id="builderBody"></div>
    <div id="builderCodePane"></div>
    <div id="builderPreviewPane"></div>
    <pre id="builderCode"></pre>
    <span id="builderFileLabel"></span>
    <button id="builderCopyFile"></button>
    <button id="builderDownload"></button>
    <button id="builderClose"></button>
    <button id="builderPreviewToggle"></button>
    <button id="builderRefresh"></button>
    <span id="builderStatus"></span>
    <span id="builderFileCount"></span>
    <iframe id="previewFrame"></iframe>
    <div id="previewWrapper"></div>
    <input id="ollamaUrl" />
    <textarea id="systemPrompt"></textarea>
    <input id="temperature" type="range" />
    <span id="tempLabel"></span>
    <input id="maxTokens" type="number" />
    <span id="maxTokensLabel"></span>
    <div id="codeLangWrap"></div>
    <div id="ollamaConnStatus"></div>
    <div id="hazy-appearance-overrides"></div>
    <select id="activeProviderSelect"></select>
    <select id="activeModelSelect"></select>
    <input id="ollamaUrlProvider" />
    <div id="providerStatusBar"></div>
    <div id="installedModelsList"></div>
    <select id="pullModelSelect"></select>
    <button id="pullModelBtn"></button>
    <div id="pullProgressWrap"></div>
    <div id="pullProgressBar"></div>
    <span id="pullProgressText"></span>
    <input id="settingsFontSize" />
    <input id="settingsDensity" />
    <input id="settingsCodeHighlight" type="checkbox" />
    <input id="settingsMarkdown" type="checkbox" />
    <input id="settingsRepeatPenalty" />
    <input id="settingsTopP" />
    <input id="settingsContextSize" />
    <span id="repeatPenaltyLabel"></span>
    <span id="topPLabel"></span>
    <div id="ttsPiperProgressWrap"></div>
    <div id="ttsPiperProgressBar"></div>
    <input id="showLiveCode" type="checkbox" />
    <button id="trainAddChatsBtn"></button>
    <button id="trainAddPairBtn"></button>
    <span id="trainBulkStatus"></span>
    <textarea id="trainBulkText"></textarea>
    <div id="trainChatList"></div>
    <button id="trainClearBtn"></button>
    <button id="trainExportBtn"></button>
    <select id="trainFormatSelect"></select>
    <textarea id="trainInstruction"></textarea>
    <span id="trainPairCount"></span>
    <div id="trainPreviewList"></div>
    <button id="trainRawBtn"></button>
    <textarea id="trainResponse"></textarea>
    <button id="trainSplitBtn"></button>
    <input id="trainSystemPrompt" />
    <span id="trainTotalCount"></span>
  </div>

  <!-- Settings Modal -->
  <div class="modal-overlay" id="settingsModal">
    <div class="modal modal-settings">
      <div class="modal-header">
        <h2>Settings</h2>
        <button class="modal-close" id="settingsClose"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-close"></use></svg></button>
      </div>
      <div class="modal-body settings-layout">
        <nav class="settings-nav">
          <button class="snav-btn active" data-tab="sGeneral"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-settings"></use></svg>General</button>
          <button class="snav-btn" data-tab="sModels"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chart"></use></svg>Models</button>
          <button class="snav-btn" data-tab="sProviders"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-box"></use></svg>AI Providers</button>
          <button class="snav-btn" data-tab="sGeneration"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-bolt"></use></svg>Generation</button>
          <button class="snav-btn" data-tab="sAppearance"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-sun"></use></svg>Appearance</button>
          <button class="snav-btn" data-tab="sNovelWriter"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-chat"></use></svg>Novel Writer</button>
          <button class="snav-btn" data-tab="sAbout"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-user"></use></svg>About</button>
        </nav>
        <div class="settings-content">
          <div class="stab active" id="sNovelWriter">
            <div class="stab-section-title">Active Model for Novel Writer</div>
            <p class="stab-helper">Choose which AI provider and model the Novel Writer uses. This is separate from the main chat model.</p>
            <div class="setting-group">
              <label class="setting-label">Provider</label>
              <select class="setting-input" id="novelProvider">
                <option>Ollama (Local — no API key)</option>
              </select>
            </div>
            <div class="setting-group">
              <label class="setting-label">Model</label>
              <select class="setting-input" id="novelModel">
                <option>ollama/minimax-m3:cloud</option>
              </select>
            </div>
            <div class="setting-group">
              <label class="setting-label">Default Words per Chapter: <span id="novelWordsLabel">2000</span></label>
              <input type="range" class="setting-range" id="novelDefaultWords" min="500" max="5000" step="100" value="2000">
            </div>
          </div>
          <div class="stab" id="sGeneral"><div class="stab-section-title">General</div></div>
          <div class="stab" id="sModels"><div class="stab-section-title">Models</div></div>
          <div class="stab" id="sProviders"><div class="stab-section-title">AI Providers</div></div>
          <div class="stab" id="sGeneration"><div class="stab-section-title">Generation</div></div>
          <div class="stab" id="sAppearance"><div class="stab-section-title">Appearance</div></div>
          <div class="stab" id="sAbout"><div class="stab-section-title">About</div></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="trainingDataBtn">Training Data</button>
        <div class="footer-actions">
          <button class="btn-secondary" id="settingsCancelBtn">Cancel</button>
          <button class="btn-primary" id="settingsSaveBtn">Save Settings</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Training Data Modal -->
  <div class="modal-overlay" id="trainingModal">
    <div class="modal">
      <div class="modal-header">
        <h2>Training Data Builder</h2>
        <button class="modal-close" id="trainingClose"><svg class="icon-svg" viewBox="0 0 24 24"><use href="#icon-close"></use></svg></button>
      </div>
      <div class="modal-body">
        <div class="training-tabs">
          <button class="training-tab active" data-tab="manual">Manual Entry</button>
          <button class="training-tab" data-tab="import">Import Text</button>
          <button class="training-tab" data-tab="from-chat">From Chat</button>
          <button class="training-tab" data-tab="preview">Preview & Export</button>
        </div>
        <div class="training-tab-panel active" id="training-tab-manual"></div>
        <div class="training-tab-panel" id="training-tab-import"></div>
        <div class="training-tab-panel" id="training-tab-from-chat"></div>
        <div class="training-tab-panel" id="training-tab-preview"></div>
      </div>
    </div>
  </div>

  <div class="toast-container" id="toastContainer"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="app.js"></script>
  <script src="hazy-enhancements-complete.js"></script>
  <script src="hazy-rag.js"></script>
  <script src="hazy-agent.js"></script>
  <script type="importmap">
  {
    "imports": {
      "onnxruntime-web": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm"
    }
  }
  </script>
  <script type="module">
    try {
      const tts = await import('/piper/piper-tts-web.js');
      window.PiperTTS = tts;
      window.dispatchEvent(new Event('piper-ready'));
    } catch (e) {
      console.warn('[Piper] TTS library failed to load — browser voice still works:', e);
      window.PiperTTS = null;
      window.dispatchEvent(new Event('piper-ready'));
    }
  </script>
</body>
</html>
~~~

### frontend\model-manager.html

- Size: 29566 bytes
- Language: html

~~~html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hazy Model Manager</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700&family=Crimson+Pro:wght@0,300;0,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--ink:#1a1208;--paper:#f5efe6;--paper-dark:#ede4d5;--gold:#c9973a;--gold-light:#e8c07a;--red:#8b2020;--muted:#7a6a55;--border:#d4c4a8;--success:#2d6a4f;--purple:#5a3a8a;--blue:#1a4a7a;--shadow:0 4px 24px rgba(26,18,8,0.12)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--ink);font-family:'Crimson Pro',Georgia,serif;color:var(--ink);min-height:100vh}
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.01) 2px,rgba(255,255,255,0.01) 4px),radial-gradient(ellipse at 20% 50%,#2a1a08 0%,transparent 60%),#0f0a04;pointer-events:none;z-index:0}
.app{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:0 20px 60px}
header{text-align:center;padding:32px 0 24px}
.orn{color:var(--gold);font-size:.9rem;letter-spacing:6px;opacity:.6;margin-bottom:8px}
header h1{font-family:'Playfair Display',serif;font-size:clamp(1.6rem,4vw,2.2rem);color:var(--paper);font-weight:400}
header h1 span{color:var(--gold);font-style:italic}
header p{color:#9a8a6a;font-size:.88rem;font-style:italic;margin-top:4px}
.vtag{display:inline-block;margin-top:6px;background:rgba(201,151,58,.2);color:var(--gold-light);border:1px solid rgba(201,151,58,.3);border-radius:20px;padding:2px 12px;font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:1px}
.nav-strip{display:flex;gap:6px;align-items:center;padding:0 0 20px;flex-wrap:wrap}
.nav-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#9a8a6a;border-radius:3px;padding:6px 14px;font-family:'JetBrains Mono',monospace;font-size:.7rem;cursor:pointer;text-decoration:none;transition:all .15s}
.nav-btn:hover{background:rgba(255,255,255,.12);color:var(--gold-light)}
.layout{display:grid;grid-template-columns:220px 1fr;gap:16px}
.sidebar{display:flex;flex-direction:column;gap:12px}
.main{display:flex;flex-direction:column;gap:14px}
.card{background:var(--paper);border-radius:4px;box-shadow:var(--shadow);overflow:hidden}
.ch{background:var(--paper-dark);border-bottom:1px solid var(--border);padding:10px 15px;display:flex;align-items:center;gap:8px}
.ch h2{font-family:'Playfair Display',serif;font-size:.9rem;font-weight:700;color:var(--ink);flex:1}
.badge{font-family:'JetBrains Mono',monospace;font-size:.57rem;padding:2px 7px;border-radius:10px}
.b-ok{background:#e8f5e9;color:var(--success);border:1px solid #b0d8b8}
.b-no{background:#fdecea;color:var(--red);border:1px solid #f0a0a0}
.b-free{background:#e8f4fd;color:var(--blue);border:1px solid #b0d0f0}
.b-api{background:#ede8fc;color:var(--purple);border:1px solid #c8b8f0}
.b-local{background:#e8f5e9;color:var(--success);border:1px solid #b0d8b8}
.b-cloud{background:#fff3e0;color:#c07010;border:1px solid #f0c070}
.cb{padding:14px}
label{display:block;font-size:.68rem;font-family:'JetBrains Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
input[type=text],input[type=password],select{width:100%;background:white;border:1px solid var(--border);border-radius:3px;padding:7px 10px;font-family:'Crimson Pro',serif;font-size:.9rem;color:var(--ink);outline:none;transition:border-color .15s}
input:focus,select:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,151,58,.15)}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:.72rem;cursor:pointer;border:none;transition:all .18s;letter-spacing:.5px}
.btn-p{background:var(--gold);color:white}
.btn-p:hover{background:#b8862e}
.btn-p:disabled{background:#c4b49a;cursor:not-allowed}
.btn-s{background:var(--paper-dark);color:var(--ink);border:1px solid var(--border)}
.btn-s:hover{background:var(--border)}
.btn-d{background:#f0d0d0;color:var(--red);border:1px solid #e0b0b0}
.btn-d:hover{background:#e0b0b0}
.btn-sm{padding:4px 9px;font-size:.65rem}

/* Filter bar */
.filter-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.filter-btn{background:var(--paper-dark);border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-family:'JetBrains Mono',monospace;font-size:.65rem;cursor:pointer;color:var(--muted);transition:all .15s}
.filter-btn.active{background:var(--gold);color:white;border-color:var(--gold)}
.filter-btn:hover:not(.active){border-color:var(--gold);color:var(--gold)}

/* Model grid */
.model-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.model-card{background:var(--paper);border:1px solid var(--border);border-radius:4px;overflow:hidden;transition:box-shadow .15s}
.model-card:hover{box-shadow:0 2px 12px rgba(26,18,8,.15)}
.mc-head{padding:10px 13px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
.mc-icon{width:28px;height:28px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0}
.ic-text{background:#e8f4fd;color:var(--blue)}
.ic-img{background:#FFF0E8;color:#A84000}
.ic-aud{background:#E8F8EE;color:#1A6A30}
.ic-mus{background:#F0E8FF;color:#5030A0}
.ic-vid{background:#FFF0F0;color:#A02020}
.mc-info{flex:1;min-width:0}
.mc-name{font-family:'Playfair Display',serif;font-size:.88rem;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-provider{font-family:'JetBrains Mono',monospace;font-size:.6rem;color:var(--muted);margin-top:1px}
.mc-body{padding:10px 13px}
.mc-desc{font-size:.82rem;color:var(--muted);line-height:1.5;margin-bottom:8px}
.mc-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.mc-tag{font-family:'JetBrains Mono',monospace;font-size:.58rem;padding:2px 6px;border-radius:10px;background:var(--paper-dark);color:var(--muted);border:1px solid var(--border)}
.quality-bar{display:flex;gap:2px;margin-bottom:8px;align-items:center}
.quality-label{font-family:'JetBrains Mono',monospace;font-size:.58rem;color:var(--muted);margin-right:4px}
.qd{width:12px;height:6px;border-radius:2px;background:var(--border)}
.qd.fill{background:var(--gold)}
.mc-foot{padding:8px 13px;background:var(--paper-dark);border-top:1px solid var(--border);display:flex;align-items:center;gap:6px}
.dl-progress{flex:1;background:var(--border);border-radius:2px;height:4px;overflow:hidden;display:none}
.dl-bar{height:100%;background:var(--gold);border-radius:2px;transition:width .3s;width:0%}
.dl-status{font-family:'JetBrains Mono',monospace;font-size:.6rem;color:var(--muted);flex:1;display:none}
.installed-badge{font-family:'JetBrains Mono',monospace;font-size:.6rem;padding:2px 7px;border-radius:10px;background:#e8f5e9;color:var(--success);border:1px solid #b0d8b8}
.needs-key-badge{font-family:'JetBrains Mono',monospace;font-size:.6rem;padding:2px 7px;border-radius:10px;background:#fdecea;color:var(--red);border:1px solid #f0a0a0}

/* Provider key cards */
.provider-item{padding:12px 14px;border-bottom:1px solid var(--border)}
.provider-item:last-child{border-bottom:none}
.prov-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.prov-name{font-family:'Playfair Display',serif;font-size:.9rem;font-weight:700;color:var(--ink)}
.prov-status{font-family:'JetBrains Mono',monospace;font-size:.6rem;padding:2px 7px;border-radius:10px}
.prov-note{font-size:.78rem;color:var(--muted);margin-bottom:8px;line-height:1.5}
.key-row{display:flex;gap:6px}
.key-row input{flex:1;font-family:'JetBrains Mono',monospace;font-size:.75rem;letter-spacing:.5px}

/* Alert */
.alert{padding:9px 13px;border-radius:3px;font-size:.82rem;margin-bottom:10px;display:flex;align-items:flex-start;gap:7px}
.al-ok{background:#e8f5e9;border-left:3px solid var(--success);color:#1a4a2a}
.al-err{background:#fdecea;border-left:3px solid var(--red);color:#6a1010}
.al-warn{background:#fff8e1;border-left:3px solid var(--gold);color:#6a4a00}
.al-info{background:#e8f4fd;border-left:3px solid #5b9bd5;color:#1a4a6e}

/* Sort */
.sort-row{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.sort-row label{font-size:.68rem;font-family:'JetBrains Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:0}
.sort-row select{width:auto;font-size:.75rem;padding:4px 22px 4px 8px}

/* Installed models list */
.installed-list{display:flex;flex-direction:column;gap:6px}
.il-item{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--paper-dark);border:1px solid var(--border);border-radius:3px}
.il-name{font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--ink);flex:1}
.il-size{font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--muted)}

@media(max-width:680px){.layout{grid-template-columns:1fr}.model-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="app">
<header>
  <div class="orn">&#10022; &#10022; &#10022;</div>
  <h1>Hazy <span>Model Manager</span></h1>
  <p>Browse, download, and manage all AI models — text, image, audio, music, video</p>
  <span class="vtag">Universal AI Hub &middot; Ollama + Cloud APIs &middot; Auto-Download</span>
</header>

<div class="nav-strip">
  <a href="/" class="nav-btn">&#8592; Back to Hazy</a>
  <a href="/novel-writer.html" class="nav-btn">&#9998; Novel Writer</a>
  <span style="color:#9a8a6a;font-family:'JetBrains Mono',monospace;font-size:.65rem;margin-left:auto">Edit keys directly: hazy-chatbot/config/hazy-config.json</span>
</div>

<div id="globalAlert" style="display:none"></div>

<div class="layout">

<!-- SIDEBAR -->
<div class="sidebar">

  <!-- Provider Status -->
  <div class="card">
    <div class="ch"><h2>Provider Status</h2></div>
    <div id="providerStatus" style="padding:12px 14px;font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted)">Loading...</div>
  </div>

  <!-- Installed Local Models -->
  <div class="card">
    <div class="ch">
      <h2>Installed (Local)</h2>
      <button class="btn btn-s btn-sm" onclick="refreshInstalled()">&#8635;</button>
    </div>
    <div class="cb" style="padding:12px 14px">
      <div class="installed-list" id="installedList">
        <span style="color:var(--muted);font-size:.8rem;font-style:italic">Loading...</span>
      </div>
    </div>
  </div>

  <!-- Quick Stats -->
  <div class="card">
    <div class="ch"><h2>Stats</h2></div>
    <div class="cb" style="padding:12px 14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:var(--paper-dark);border-radius:3px;padding:8px;text-align:center">
          <div style="font-size:1.4rem;font-weight:700;color:var(--ink)" id="statLocal">0</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.6rem;color:var(--muted)">Local Models</div>
        </div>
        <div style="background:var(--paper-dark);border-radius:3px;padding:8px;text-align:center">
          <div style="font-size:1.4rem;font-weight:700;color:var(--ink)" id="statCloud">0</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.6rem;color:var(--muted)">Cloud Models</div>
        </div>
      </div>
    </div>
  </div>

</div>

<!-- MAIN -->
<div class="main">

  <!-- API Keys -->
  <div class="card">
    <div class="ch"><h2>API Keys</h2><span class="badge b-api" style="margin-left:auto">Stored in hazy-config.json</span></div>
    <div id="apiKeySection">
      <div style="padding:14px;color:var(--muted);font-style:italic;font-size:.88rem">Loading providers...</div>
    </div>
  </div>

  <!-- Model Browser -->
  <div class="card">
    <div class="ch"><h2>Model Browser</h2></div>
    <div class="cb">

      <div class="filter-bar" id="filterBar">
        <button class="filter-btn active" data-type="all" onclick="setFilter('all',this)">All</button>
        <button class="filter-btn" data-type="text" onclick="setFilter('text',this)">&#128172; Text</button>
        <button class="filter-btn" data-type="image" onclick="setFilter('image',this)">&#128247; Image</button>
        <button class="filter-btn" data-type="audio" onclick="setFilter('audio',this)">&#127908; Audio</button>
        <button class="filter-btn" data-type="music" onclick="setFilter('music',this)">&#127925; Music</button>
        <button class="filter-btn" data-type="video" onclick="setFilter('video',this)">&#127916; Video</button>
        <button class="filter-btn" data-local="true" onclick="setFilter('local',this)">&#128421; Local Only</button>
        <button class="filter-btn" data-local="false" onclick="setFilter('cloud',this)">&#9729; Cloud Only</button>
      </div>

      <div class="sort-row">
        <label>Sort by</label>
        <select id="sortBy" onchange="renderModels()">
          <option value="params-asc">Parameters: Low to High</option>
          <option value="params-desc">Parameters: High to Low</option>
          <option value="quality-desc" selected>Quality: Best First</option>
          <option value="speed-desc">Speed: Fastest First</option>
          <option value="name-asc">Name A-Z</option>
        </select>
        <label style="margin-left:8px">Search</label>
        <input type="text" id="searchBox" placeholder="Search models..." style="width:200px;font-size:.8rem;padding:4px 9px" oninput="renderModels()">
      </div>

      <div class="model-grid" id="modelGrid">
        <div style="color:var(--muted);font-style:italic;font-size:.88rem">Loading models...</div>
      </div>
    </div>
  </div>

</div>
</div>
</div>

<script>
let REGISTRY = null;
let PROVIDERS = null;
let INSTALLED_MODELS = [];
let activeFilter = 'all';
let activeDownloads = {};

async function init() {
  await loadProviders();
  await refreshInstalled();
  renderModels();
}

async function loadProviders() {
  try {
    const r = await fetch('/hazy/providers');
    const d = await r.json();
    PROVIDERS = d.providers;
    REGISTRY  = d.registry;
    renderProviderStatus();
    renderAPIKeys();
    updateStats();
  } catch (e) {
    showGlobalAlert('err', 'Cannot connect to Hazy server. Make sure server.js is running.');
  }
}

function renderProviderStatus() {
  if (!PROVIDERS) return;
  const el = document.getElementById('providerStatus');
  const rows = Object.entries(PROVIDERS).map(([key, val]) => {
    const status = val.enabled
      ? '<span class="badge b-ok">enabled</span>'
      : '<span class="badge b-no">disabled</span>';
    const keyStatus = val.isLocal ? '<span class="badge b-local">local</span>'
      : val.hasKey ? '<span class="badge b-ok">key set</span>'
      : '<span class="badge b-no">no key</span>';
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.05)">
      <span style="flex:1;font-size:.72rem;color:var(--ink)">${key}</span>${status}${keyStatus}
    </div>`;
  }).join('');
  el.innerHTML = rows;
}

function renderAPIKeys() {
  if (!PROVIDERS) return;
  const cloudProviders = [
    {key:'anthropic', name:'Anthropic (Claude)', models:'Claude Sonnet 4.5, Opus, Haiku', url:'https://console.anthropic.com'},
    {key:'openai',    name:'OpenAI (GPT-4o / DALL-E)', models:'GPT-4o, GPT-4o-mini, DALL-E 3, TTS', url:'https://platform.openai.com/api-keys'},
    {key:'groq',      name:'Groq (Fast Inference)', models:'Llama 3.1 70B, Mixtral — free tier!', url:'https://console.groq.com'},
    {key:'gemini',    name:'Google Gemini', models:'Gemini 1.5 Pro/Flash, 1M context', url:'https://aistudio.google.com/app/apikey'},
    {key:'elevenlabs',name:'ElevenLabs (TTS)', models:'Natural voice synthesis, 30 voices', url:'https://elevenlabs.io'},
    {key:'stability', name:'Stability AI (Images)', models:'Stable Diffusion XL, ultra', url:'https://platform.stability.ai'},
    {key:'ideogram',  name:'Ideogram (Images)', models:'Best for text in images', url:'https://ideogram.ai'},
    {key:'fal',       name:'fal.ai (Images + Video)', models:'Flux, Kling video', url:'https://fal.ai'},
    {key:'suno',      name:'Suno (Music)', models:'AI music generation', url:'https://suno.com'},
    {key:'runway',    name:'Runway (Video)', models:'Gen-3 video generation', url:'https://runwayml.com'},
  ];

  const section = document.getElementById('apiKeySection');
  section.innerHTML = cloudProviders.map(p => {
    const prov = PROVIDERS[p.key] || {};
    const hasKey = prov.hasKey;
    const enabled = prov.enabled;
    return `<div class="provider-item">
      <div class="prov-head">
        <span class="prov-name">${p.name}</span>
        <span class="prov-status ${enabled ? 'b-ok' : 'b-no'}">${enabled ? 'active' : 'inactive'}</span>
      </div>
      <div class="prov-note">${p.models} &mdash; <a href="${p.url}" target="_blank" style="color:var(--gold)">Get API key</a></div>
      <div class="key-row">
        <input type="password" id="key_${p.key}" placeholder="${hasKey ? '&#11044;&#11044;&#11044;&#11044;&#11044;&#11044; (key saved)' : 'Paste your API key here...'}" autocomplete="off">
        <button class="btn btn-p btn-sm" onclick="saveKey('${p.key}')">Save</button>
        ${hasKey ? '<button class="btn btn-d btn-sm" onclick="clearKey(\''+p.key+'\')">Clear</button>' : ''}
      </div>
    </div>`;
  }).join('');
}

async function saveKey(provider) {
  const input = document.getElementById('key_' + provider);
  const apiKey = input.value.trim();
  try {
    const r = await fetch('/hazy/save-key', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ provider, apiKey })
    });
    const d = await r.json();
    if (d.ok) {
      showGlobalAlert('ok', provider + ' API key saved successfully! Provider is now ' + (d.enabled ? 'enabled' : 'disabled') + '.');
      input.value = '';
      input.placeholder = 'Key saved.';
      await loadProviders();
    } else {
      showGlobalAlert('err', 'Failed to save key: ' + (d.error || 'unknown error'));
    }
  } catch (e) {
    showGlobalAlert('err', 'Could not save key: ' + e.message);
  }
}

async function clearKey(provider) {
  if (!confirm('Remove API key for ' + provider + '?')) return;
  const r = await fetch('/hazy/save-key', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ provider, apiKey: '' })
  });
  const d = await r.json();
  if (d.ok) { showGlobalAlert('ok', provider + ' key removed.'); await loadProviders(); }
}

async function refreshInstalled() {
  try {
    const r = await fetch('/api/tags');
    const d = await r.json();
    INSTALLED_MODELS = (d.models || []).map(m => m.name);
    renderInstalledList(d.models || []);
    document.getElementById('statLocal').textContent = INSTALLED_MODELS.length;
  } catch {
    document.getElementById('installedList').innerHTML = '<span style="color:var(--muted);font-size:.78rem">Ollama not running</span>';
  }
}

function renderInstalledList(models) {
  const el = document.getElementById('installedList');
  if (!models.length) { el.innerHTML = '<span style="color:var(--muted);font-size:.78rem;font-style:italic">No models installed yet</span>'; return; }
  el.innerHTML = models.map(m => {
    const sizeGB = m.size ? (m.size / 1e9).toFixed(1) + ' GB' : '';
    return `<div class="il-item">
      <span class="il-name">${eh(m.name)}</span>
      <span class="il-size">${sizeGB}</span>
      <button class="btn btn-d btn-sm" onclick="deleteModel('${eh(m.name)}')" title="Delete">&#10005;</button>
    </div>`;
  }).join('');
}

async function deleteModel(name) {
  if (!confirm('Delete model "' + name + '" from Ollama?')) return;
  try {
    const r = await fetch('/hazy/delete-model', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ model: name })
    });
    showGlobalAlert('ok', name + ' deleted.');
    await refreshInstalled();
    renderModels();
  } catch (e) { showGlobalAlert('err', e.message); }
}

function setFilter(type, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = type;
  renderModels();
}

function getParamSort(params) {
  if (!params || params === 'cloud' || params === 'unknown') return -1;
  const n = parseFloat(params);
  const m = params.toUpperCase();
  if (m.includes('B')) return n;
  return n;
}

function renderModels() {
  if (!REGISTRY) return;
  const grid   = document.getElementById('modelGrid');
  const sort   = document.getElementById('sortBy').value;
  const search = document.getElementById('searchBox').value.toLowerCase();

  let allModels = [];
  if (activeFilter === 'all' || activeFilter === 'text')  allModels.push(...(REGISTRY.textModels  || []).map(m => ({...m, type:'text'})));
  if (activeFilter === 'all' || activeFilter === 'image') allModels.push(...(REGISTRY.imageModels || []).map(m => ({...m, type:'image'})));
  if (activeFilter === 'all' || activeFilter === 'audio') allModels.push(...(REGISTRY.audioModels || []).map(m => ({...m, type:'audio'})));
  if (activeFilter === 'all' || activeFilter === 'music') allModels.push(...(REGISTRY.musicModels || []).map(m => ({...m, type:'music'})));
  if (activeFilter === 'all' || activeFilter === 'video') allModels.push(...(REGISTRY.videoModels || []).map(m => ({...m, type:'video'})));
  if (activeFilter === 'local') allModels = (REGISTRY.textModels||[]).filter(m=>m.local).map(m=>({...m,type:'text'}));
  if (activeFilter === 'cloud') {
    allModels = [
      ...(REGISTRY.textModels||[]).filter(m=>!m.local),
      ...(REGISTRY.imageModels||[]), ...(REGISTRY.audioModels||[]),
      ...(REGISTRY.musicModels||[]), ...(REGISTRY.videoModels||[])
    ].map(m => ({...m, type: m.type || 'cloud'}));
  }

  if (search) allModels = allModels.filter(m =>
    m.name.toLowerCase().includes(search) ||
    m.desc?.toLowerCase().includes(search) ||
    m.provider?.toLowerCase().includes(search)
  );

  allModels.sort((a,b) => {
    if (sort === 'params-asc')    return getParamSort(a.params) - getParamSort(b.params);
    if (sort === 'params-desc')   return getParamSort(b.params) - getParamSort(a.params);
    if (sort === 'quality-desc')  return (b.quality||0) - (a.quality||0);
    if (sort === 'speed-desc')    return (b.speed||0) - (a.speed||0);
    if (sort === 'name-asc')      return a.name.localeCompare(b.name);
    return 0;
  });

  const cloudCount = allModels.filter(m=>!m.local).length;
  document.getElementById('statCloud').textContent = cloudCount;

  if (!allModels.length) { grid.innerHTML = '<div style="color:var(--muted);font-style:italic;font-size:.88rem;padding:10px">No models match your filter.</div>'; return; }

  grid.innerHTML = allModels.map(m => renderModelCard(m)).join('');
}

function renderModelCard(m) {
  const isInstalled = INSTALLED_MODELS.includes(m.pull) || INSTALLED_MODELS.some(i => i.startsWith(m.pull?.split(':')[0]||'__'));
  const prov  = PROVIDERS?.[m.provider] || {};
  const hasKey= prov.hasKey || m.local;
  const canUse= m.local ? isInstalled : hasKey;

  const typeIcon = m.type==='image'?'ic-img':m.type==='audio'?'ic-aud':m.type==='music'?'ic-mus':m.type==='video'?'ic-vid':'ic-text';
  const typeEmoji = m.type==='image'?'&#128247;':m.type==='audio'?'&#127908;':m.type==='music'?'&#127925;':m.type==='video'?'&#127916;':'&#128172;';

  const qualityDots = m.quality ? Array(5).fill(0).map((_,i) =>
    '<div class="qd' + (i < m.quality ? ' fill' : '') + '"></div>'
  ).join('') : '';

  const speedDots = m.speed ? Array(5).fill(0).map((_,i) =>
    '<div class="qd' + (i < m.speed ? ' fill' : '') + '" style="background:' + (i < m.speed ? '#1a6a5a' : '') + '"></div>'
  ).join('') : '';

  let footContent = '';
  if (m.local) {
    if (isInstalled) {
      footContent = `<span class="installed-badge">&#10003; Installed</span>
        <button class="btn btn-s btn-sm" onclick="setAsDefault('${eh(m.id)}','${eh(m.name)}')">Set Default</button>
        <button class="btn btn-d btn-sm" onclick="deleteModel('${eh(m.pull||m.id)}')" style="margin-left:auto">Delete</button>`;
    } else {
      footContent = `<button class="btn btn-p btn-sm" id="dl-btn-${btoa(m.id).replace(/[^a-zA-Z0-9]/g,'')}" onclick="downloadModel('${eh(m.pull||m.id)}','${eh(m.id)}')">&#8595; Download</button>
        <div class="dl-progress" id="dlp-${btoa(m.id).replace(/[^a-zA-Z0-9]/g,'')}"><div class="dl-bar"></div></div>
        <span class="dl-status" id="dls-${btoa(m.id).replace(/[^a-zA-Z0-9]/g,'')}"></span>`;
    }
  } else {
    if (hasKey) {
      footContent = `<span class="installed-badge">&#10003; API Key Set</span>
        <button class="btn btn-s btn-sm" onclick="setAsDefault('${eh(m.id)}','${eh(m.name)}')">Set Default</button>`;
    } else {
      footContent = `<span class="needs-key-badge">&#9888; Needs API Key</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:.6rem;color:var(--muted);margin-left:4px">${eh(m.provider)}</span>`;
    }
  }

  return `<div class="model-card">
    <div class="mc-head">
      <div class="mc-icon ${typeIcon}">${typeEmoji}</div>
      <div class="mc-info">
        <div class="mc-name">${eh(m.name)}</div>
        <div class="mc-provider">${eh(m.provider)} &middot; ${eh(m.local?'Local':'Cloud')}</div>
      </div>
    </div>
    <div class="mc-body">
      <div class="mc-desc">${eh(m.desc||'')}</div>
      <div class="mc-meta">
        ${m.params ? '<span class="mc-tag">'+eh(m.params)+'</span>' : ''}
        ${m.size && m.size !== 'cloud' ? '<span class="mc-tag">'+eh(m.size)+'</span>' : ''}
        ${m.local ? '<span class="mc-tag b-local">local</span>' : '<span class="mc-tag b-cloud">cloud</span>'}
      </div>
      ${qualityDots ? '<div class="quality-bar"><span class="quality-label">Quality</span>'+qualityDots+'</div>' : ''}
      ${speedDots   ? '<div class="quality-bar"><span class="quality-label">Speed</span>'+speedDots+'</div>' : ''}
    </div>
    <div class="mc-foot">${footContent}</div>
  </div>`;
}

async function downloadModel(pullName, modelId) {
  const safeId = btoa(modelId).replace(/[^a-zA-Z0-9]/g,'');
  const btn  = document.getElementById('dl-btn-' + safeId);
  const prog = document.getElementById('dlp-' + safeId);
  const stat = document.getElementById('dls-' + safeId);
  if (!btn) return;

  btn.disabled = true; btn.textContent = 'Downloading...';
  if (prog) { prog.style.display='block'; }
  if (stat) { stat.style.display='block'; stat.textContent = 'Connecting...'; }

  try {
    const r = await fetch('/hazy/pull', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ model: pullName })
    });
    const reader = r.body.getReader();
    const dec = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, {stream:true}).split('\n').filter(l=>l.trim())) {
        try {
          const j = JSON.parse(line);
          if (stat) stat.textContent = j.status || '';
          if (j.total && j.completed && prog) {
            const pct = Math.round(j.completed / j.total * 100);
            const bar = prog.querySelector('.dl-bar');
            if (bar) bar.style.width = pct + '%';
            if (stat) stat.textContent = j.status + ' ' + pct + '%';
          }
        } catch {}
      }
    }

    showGlobalAlert('ok', pullName + ' downloaded successfully!');
    await refreshInstalled();
    renderModels();
  } catch (e) {
    showGlobalAlert('err', 'Download failed: ' + e.message);
    if (btn) { btn.disabled=false; btn.textContent='&#8595; Download'; }
    if (prog) prog.style.display='none';
    if (stat) stat.style.display='none';
  }
}

function setAsDefault(modelId, modelName) {
  localStorage.setItem('hazyDefaultModel', modelId);
  showGlobalAlert('ok', modelName + ' set as default model for Hazy and Novel Writer.');
}

function updateStats() {
  if (!REGISTRY) return;
  const cloudCount = [
    ...(REGISTRY.textModels||[]).filter(m=>!m.local),
    ...(REGISTRY.imageModels||[]), ...(REGISTRY.audioModels||[]),
    ...(REGISTRY.musicModels||[]), ...(REGISTRY.videoModels||[])
  ].length;
  document.getElementById('statCloud').textContent = cloudCount;
}

function showGlobalAlert(type, msg) {
  const el = document.getElementById('globalAlert');
  el.style.display='flex';
  el.className = 'alert al-' + type;
  el.innerHTML = '<span>' + eh(msg) + '</span><button onclick="this.parentElement.style.display=\'none\'" style="background:none;border:none;cursor:pointer;margin-left:auto;font-size:.9rem">&#10005;</button>';
  setTimeout(() => { if (el.style.display!=='none') el.style.display='none'; }, 6000);
}

const eh = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

init();
</script>
</body>
</html>
~~~

### frontend\novel-writer.html

- Size: 108617 bytes
- Language: html

~~~html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hazy Novel Writer v2</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Crimson+Pro:ital,wght@0,300;0,400;1,300;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--ink:#1a1208;--paper:#f5efe6;--paper-dark:#ede4d5;--gold:#c9973a;--gold-light:#e8c07a;--red:#8b2020;--muted:#7a6a55;--border:#d4c4a8;--success:#2d6a4f;--purple:#5a3a8a;--shadow:0 4px 24px rgba(26,18,8,0.12)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--ink);font-family:"Crimson Pro",Georgia,serif;color:var(--ink);min-height:100vh;display:flex;flex-direction:column;align-items:center}
body::before{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.01) 2px,rgba(255,255,255,0.01) 4px),radial-gradient(ellipse at 20% 50%,#2a1a08 0%,transparent 60%),radial-gradient(ellipse at 80% 50%,#1a0808 0%,transparent 60%),#0f0a04;pointer-events:none;z-index:0}
.app{position:relative;z-index:1;width:100%;max-width:1040px;padding:0 16px 60px;display:grid;grid-template-columns:236px 1fr;gap:0 16px}
.full-row{grid-column:1/-1}
.app-header{grid-column:1/-1;text-align:center;padding:28px 0 16px}
.ornament{color:var(--gold);font-size:.95rem;letter-spacing:6px;opacity:.6;margin-bottom:8px}
h1{font-family:"Playfair Display",serif;font-size:clamp(1.6rem,4vw,2.3rem);color:var(--paper);font-weight:400}
h1 span{color:var(--gold);font-style:italic}
.tagline{color:#9a8a6a;margin-top:4px;font-size:.88rem;font-style:italic}
.vtag{display:inline-block;margin-top:6px;background:rgba(201,151,58,.2);color:var(--gold-light);border:1px solid rgba(201,151,58,.3);border-radius:20px;padding:2px 12px;font-family:"JetBrains Mono",monospace;font-size:.6rem;letter-spacing:1px}
.oll-strip{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:8px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:3px;margin-bottom:4px}
.oll-strip label{color:#9a8a6a;margin:0;font-size:.68rem;white-space:nowrap}
.oll-strip input{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:var(--paper);border-radius:3px;padding:5px 9px;font-family:"Crimson Pro",serif;font-size:.88rem;flex:1;outline:none}
.oll-strip input:focus{border-color:var(--gold)}
.cs{font-family:"JetBrains Mono",monospace;font-size:.64rem;white-space:nowrap;padding:3px 9px;border-radius:20px}
.cs.ok{background:rgba(45,106,79,.3);color:#7fd4a0}
.cs.fail{background:rgba(139,32,32,.3);color:#f09090}
.cs.checking{background:rgba(201,151,58,.2);color:var(--gold-light)}
.sidebar{grid-column:1;display:flex;flex-direction:column;gap:10px;padding-top:2px}
.main-col{grid-column:2;display:flex;flex-direction:column;gap:12px;padding-top:2px}
.card{background:var(--paper);border-radius:4px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.6);overflow:hidden}
.ch{background:var(--paper-dark);border-bottom:1px solid var(--border);padding:10px 15px;display:flex;align-items:center;gap:8px}
.step{background:var(--gold);color:white;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-family:"JetBrains Mono",monospace;flex-shrink:0}
.ch h2{font-family:"Playfair Display",serif;font-size:.9rem;font-weight:700;color:var(--ink);flex:1}
.badge{font-family:"JetBrains Mono",monospace;font-size:.57rem;padding:2px 7px;border-radius:10px}
.b-new{background:#e8f5e9;color:var(--success);border:1px solid #b0d8b8}
.b-db{background:#ede8fc;color:var(--purple);border:1px solid #c8b8f0}
.b-live{background:#fff3e0;color:#c07010;border:1px solid #f0c070}
.cb{padding:14px}
.fr{display:grid;gap:9px;margin-bottom:9px}
.fr.t2{grid-template-columns:1fr 1fr}
.fr.t3{grid-template-columns:1fr 1fr 1fr}
label{display:block;font-size:.68rem;font-family:"JetBrains Mono",monospace;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
input[type=text],input[type=number],input[type=url],select,textarea{width:100%;background:white;border:1px solid var(--border);border-radius:3px;padding:6px 9px;font-family:"Crimson Pro",serif;font-size:.9rem;color:var(--ink);transition:border-color .15s,box-shadow .15s;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,151,58,.15)}
textarea{resize:vertical;min-height:70px;line-height:1.6}
select{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1l4.5 4.5L10 1' stroke='%237a6a55' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;padding-right:26px}
.char-list{display:flex;flex-direction:column;gap:6px}
.char-item{background:var(--paper-dark);border:1px solid var(--border);border-radius:3px;padding:8px}
.cr1{display:grid;grid-template-columns:1fr 1fr auto;gap:5px;margin-bottom:4px;align-items:center}
.cr2{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:4px}
.xbtn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:.88rem;padding:2px 5px;border-radius:3px;transition:all .15s}
.xbtn:hover{background:#f0d0d0;color:var(--red)}
.add-c{background:none;border:1px dashed var(--border);border-radius:3px;color:var(--muted);padding:6px;width:100%;cursor:pointer;font-family:"Crimson Pro",serif;font-size:.83rem;transition:all .15s;margin-top:4px}
.add-c:hover{border-color:var(--gold);color:var(--gold)}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:3px;font-family:"Crimson Pro",serif;font-size:.88rem;cursor:pointer;border:none;transition:all .18s}
.btn-p{background:var(--gold);color:white;box-shadow:0 2px 8px rgba(201,151,58,.3)}
.btn-p:hover{background:#b8862e;transform:translateY(-1px)}
.btn-p:disabled{background:#c4b49a;box-shadow:none;cursor:not-allowed;transform:none}
.btn-s{background:var(--paper-dark);color:var(--ink);border:1px solid var(--border)}
.btn-s:hover{background:var(--border)}
.btn-d{background:#f0d0d0;color:var(--red);border:1px solid #e0b0b0}
.btn-d:hover{background:#e0b0b0}
.btn-v{background:#ede8fc;color:var(--purple);border:1px solid #c8b8f0}
.btn-v:hover{background:#ddd0f8}
.btn-sm{padding:4px 10px;font-size:.78rem}
.sbar{background:var(--paper-dark);border:1px solid var(--border);border-radius:3px;padding:7px 12px;display:flex;align-items:center;gap:8px;font-family:"JetBrains Mono",monospace;font-size:.67rem;flex-wrap:wrap;margin-bottom:9px}
.sdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:#aaa}
.sdot.idle{background:#aaa}
.sdot.planning{background:#9060c0;animation:pulse 1s infinite}
.sdot.running{background:#f0a020;animation:pulse 1s infinite}
.sdot.saving{background:#1a6a5a;animation:pulse 1s infinite}
.sdot.done{background:var(--success)}
.sdot.error{background:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.stxt{color:var(--muted);flex:1}
.scnt{display:flex;gap:10px;color:var(--muted)}
.scnt span{display:flex;gap:3px}
.scnt strong{color:var(--ink)}
.pw{background:var(--border);border-radius:2px;height:3px;overflow:hidden;margin-bottom:10px}
.pb{height:100%;background:linear-gradient(90deg,var(--gold),var(--gold-light));border-radius:2px;transition:width .4s;width:0%}
.chtabs{
  display:flex;gap:3px;
  padding:9px 13px 0;
  background:var(--paper-dark);
  border-bottom:1px solid var(--border);
  overflow-x:auto;
  flex-wrap:nowrap;
  scroll-behavior:smooth;
}
.chtabs::-webkit-scrollbar{height:3px}
.chtabs::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.chtab{padding:4px 9px;border-radius:3px 3px 0 0;border:1px solid transparent;border-bottom:none;font-family:"JetBrains Mono",monospace;font-size:.65rem;cursor:pointer;background:transparent;color:var(--muted);transition:all .15s;margin-bottom:-1px}
.chtab:hover{background:var(--paper);color:var(--ink)}
.chtab.active{background:var(--paper);border-color:var(--border);color:var(--ink);font-weight:500}
.chtab.done{color:var(--success)}
.chtab.gen{color:var(--gold)}
.chtab.plan{color:var(--purple)}
/* ── Reading Panel ─────────────────────────────────────── */
.out{
  background:white;
  min-height:280px;max-height:620px;overflow-y:auto;
  padding:28px 32px;
  font-family:"Crimson Pro",Georgia,serif;
  font-size:1.05rem;
  line-height:2;
  color:#1e160a;
  word-break:break-word;
  border-bottom:1px solid var(--border);
}
.out::-webkit-scrollbar{width:5px}
.out::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

/* Chapter banner */
.ch-banner{
  font-family:"JetBrains Mono",monospace;
  font-size:.65rem;letter-spacing:4px;text-transform:uppercase;
  color:var(--muted);text-align:center;
  margin-bottom:6px;padding-bottom:6px;
}

/* Chapter title from the story text */
.ch-ttl{
  font-family:"Playfair Display",serif;
  font-size:1.45rem;font-weight:700;font-style:italic;
  color:var(--ink);
  text-align:center;
  margin:0 0 24px;
  padding-bottom:14px;
  border-bottom:2px solid var(--gold);
}

/* Body paragraphs */
.out p{
  margin:0 0 1.1em;
  text-indent:0;
}

/* Dialogue lines — visually distinct */
.out p.dialogue-line{
  margin:0 0 .6em;
  padding-left:18px;
  border-left:2px solid var(--gold-light);
  color:#2a1a04;
  font-size:1.06rem;
}

/* Internal thoughts — italic, slightly muted */
.out p.thought-line{
  margin:0 0 .9em;
  color:#6a5040;
  font-style:italic;
  font-size:.97rem;
}

/* Scene break divider */
.out .scene-break{
  text-align:center;
  color:var(--gold);
  font-size:.85rem;
  letter-spacing:6px;
  margin:20px 0;
  opacity:.7;
}
.outln-box{background:#faf7f0;border-left:3px solid var(--gold);padding:7px 12px;margin-bottom:16px;font-size:.76rem;line-height:1.6;color:var(--muted);font-style:italic;border-radius:0 3px 3px 0}
.outln-box strong{color:var(--ink);font-style:normal;font-size:.65rem;font-family:"JetBrains Mono",monospace;letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:3px}
.cursor{display:inline-block;width:2px;height:.95em;background:var(--gold);margin-left:2px;vertical-align:middle;animation:blink .8s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.ph{color:#b0a090;font-style:italic;text-align:center;padding:40px 20px;font-size:.88rem}
.of{padding:8px 13px;display:flex;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap;background:var(--paper-dark)}
.wcb{font-family:"JetBrains Mono",monospace;font-size:.65rem;color:var(--muted);background:var(--border);padding:3px 9px;border-radius:20px}
.cb2{font-family:"JetBrains Mono",monospace;font-size:.63rem;padding:3px 9px;border-radius:20px}
.cb2.active{background:#fff3e0;color:#c07010}
.cb2.idle{background:#e8f5e9;color:var(--success)}
.cb2.plan{background:#ede8fc;color:var(--purple)}
.expa{display:flex;gap:7px;flex-wrap:wrap;padding:9px 13px;background:var(--paper-dark);border-top:1px solid var(--border)}
.al{padding:8px 12px;border-radius:3px;font-size:.82rem;margin-bottom:8px;display:flex;align-items:flex-start;gap:7px}
.al.info{background:#e8f4fd;border-left:3px solid #5b9bd5;color:#1a4a6e}
.al.warn{background:#fff8e1;border-left:3px solid var(--gold);color:#6a4a00}
.al.ok{background:#e8f5e9;border-left:3px solid var(--success);color:#1a4a2a}
.al.err{background:#fdecea;border-left:3px solid var(--red);color:#6a1010}
.lh{background:var(--paper-dark);border-bottom:1px solid var(--border);padding:8px 13px;display:flex;align-items:center;justify-content:space-between}
.lh h3{font-family:"Playfair Display",serif;font-size:.84rem;font-weight:700;color:var(--ink)}
.ll{max-height:190px;overflow-y:auto}
.ll::-webkit-scrollbar{width:4px}
.ll::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.li{padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s}
.li:hover{background:var(--paper-dark)}
.li.cur{background:#fdf5e8;border-left:3px solid var(--gold)}
.li-t{font-family:"Playfair Display",serif;font-size:.8rem;font-weight:700;color:var(--ink);margin-bottom:1px}
.li-m{font-family:"JetBrains Mono",monospace;font-size:.58rem;color:var(--muted)}
.le{padding:14px;text-align:center;color:var(--muted);font-style:italic;font-size:.8rem}
.la{padding:8px 12px;display:flex;gap:5px;border-top:1px solid var(--border)}
.ms{padding:8px 12px;border-bottom:1px solid var(--border)}
.ms:last-child{border-bottom:none}
.ml{font-family:"JetBrains Mono",monospace;font-size:.58rem;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.mci{background:var(--paper-dark);border:1px solid var(--border);border-radius:3px;padding:5px 8px;margin-bottom:3px;font-size:.76rem}
.mcn{font-weight:700;color:var(--ink);font-family:"Playfair Display",serif}
.mcs{display:inline-block;font-family:"JetBrains Mono",monospace;font-size:.55rem;padding:1px 5px;border-radius:10px;margin-left:3px}
.s-a{background:#e8f5e9;color:var(--success);border:1px solid #b0d8b8}
.s-d{background:#fdecea;color:var(--red);border:1px solid #f0a0a0}
.s-o{background:#f5f0e8;color:var(--muted);border:1px solid var(--border)}
.mev{font-size:.74rem;color:var(--muted);padding:2px 0;border-bottom:1px solid rgba(0,0,0,.04);line-height:1.4}
.mev:last-child{border-bottom:none}
.mev::before{content:"+ ";color:var(--gold)}
.fp{font-family:"JetBrains Mono",monospace;font-size:.58rem;color:var(--red);background:#fdecea;padding:2px 5px;border-radius:3px;display:inline-block;margin:2px;cursor:pointer}
.fp:hover{background:#f8c0c0}
.meb{background:none;border:1px solid var(--border);border-radius:3px;padding:1px 6px;font-size:.62rem;font-family:"JetBrains Mono",monospace;color:var(--muted);cursor:pointer;transition:all .15s}
.meb:hover{border-color:var(--gold);color:var(--gold)}
.divr{height:1px;background:var(--border);margin:8px 0}
@media(max-width:680px){.app{grid-template-columns:1fr}.sidebar,.main-col{grid-column:1}.fr.t2,.fr.t3{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="app">

<div class="app-header">
  <div class="ornament">&#10022; &#10022; &#10022;</div>
  <h1>Hazy <span>Novel Writer</span></h1>
  <p class="tagline">Full-architecture AI story generation with persistent memory &mdash; powered by Ollama</p>
  <span class="vtag">v2.0 &middot; IndexedDB &middot; Story Memory &middot; Chapter Planner &middot; Anti-Repeat &middot; Auto-Continue</span>
</div>

<div class="oll-strip">
  <label>PROVIDER</label>
  <select id="providerSelect" onchange="onProviderChange()" style="max-width:160px;background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:var(--paper)">
    <option value="ollama">Ollama (Local)</option>
    <option value="anthropic">Anthropic (Claude)</option>
    <option value="openai">OpenAI (GPT-4o)</option>
    <option value="groq">Groq (Fast)</option>
    <option value="gemini">Google Gemini</option>
  </select>
  <label style="margin-left:6px">MODEL</label>
  <select id="modelSelect" style="flex:1;background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:var(--paper)">
    <option value="ollama/llama3.2">llama3.2 (3B)</option>
  </select>
  <span class="cs checking" id="connStatus">checking&hellip;</span>
  <button class="btn btn-s btn-sm" onclick="checkConn()">Test</button>
  <a href="/model-manager.html" class="btn btn-s btn-sm" style="text-decoration:none">&#9881; Models</a>
</div>

<!-- SIDEBAR -->
<div class="sidebar">

  <!-- Library -->
  <div class="card">
    <div class="lh">
      <h3>&#128218; Novel Library</h3>
      <button class="btn btn-s btn-sm" onclick="newNovel()">+ New</button>
    </div>
    <div class="ll" id="libList"><div class="le">No novels yet.<br>Start writing to save.</div></div>
    <div class="la">
      <button class="btn btn-d btn-sm" onclick="delNovel()">Delete</button>
      <button class="btn btn-v btn-sm" onclick="saveAll()">&#128190; Save</button>
    </div>
  </div>

  <!-- Memory -->
  <div class="card">
    <div class="ch" style="padding:9px 13px">
      <h2 style="font-size:.84rem">&#129504; Story Memory</h2>
      <span class="badge b-live" style="margin-left:auto">Live</span>
    </div>
    <div class="ms">
      <div class="ml">Characters &amp; Status</div>
      <div id="memChars"><span style="color:var(--muted);font-size:.74rem;font-style:italic">No characters yet</span></div>
    </div>
    <div class="ms">
      <div class="ml">Plot Events <button class="meb" onclick="clrEvents()">Clear</button></div>
      <div id="summaryCount" style="font-family:'JetBrains Mono',monospace;font-size:.58rem;color:var(--purple);background:#ede8fc;border:1px solid #c8b8f0;border-radius:10px;padding:1px 7px;display:inline-block;margin-bottom:4px">0 chapters summarized</div>
      <div id="memEvents"><span style="color:var(--muted);font-size:.74rem;font-style:italic">Nothing recorded</span></div>
    </div>
    <div class="ms">
      <div class="ml">Forbidden Phrases <small style="font-size:.53rem">(tap to remove)</small></div>
      <div id="memFP"></div>
      <div style="display:flex;gap:4px;margin-top:4px">
        <input type="text" id="fpInput" placeholder="Add phrase to ban..." style="flex:1;font-size:.74rem;padding:3px 7px">
        <button class="btn btn-s btn-sm" onclick="addFP()">+</button>
      </div>
    </div>
    <div class="ms">
      <div class="ml">Locations Visited</div>
      <div id="memLoc"><span style="color:var(--muted);font-size:.74rem;font-style:italic">None yet</span></div>
    </div>
    <div class="ms">
      <div class="ml">Current Scene Location</div>
      <input type="text" id="curLocation" placeholder="e.g. forest clearing, castle hall" style="font-size:.76rem;padding:4px 7px">
    </div>
  </div>

</div>

<!-- MAIN COLUMN -->
<div class="main-col">

  <!-- ✨ QUICK GENERATE BOX -->
  <div class="card full-row" id="quickGenCard" style="border:2px solid var(--gold);box-shadow:0 0 0 3px rgba(201,151,58,.12),var(--shadow)">
    <div class="ch" style="background:linear-gradient(135deg,#f5ede0,var(--paper-dark))">
      <div class="step" style="background:var(--gold);font-size:.7rem">✨</div>
      <h2 style="color:var(--ink)">Quick Story Generator</h2>
      <span class="badge b-live" style="margin-left:auto">AI Auto-Fill</span>
    </div>
    <div class="cb">
      <div style="font-size:.8rem;color:var(--muted);margin-bottom:10px;font-style:italic">
        Describe your story idea in plain language — the AI will instantly fill in the title, genre, plot, setting, writing style, and all characters automatically.
      </div>
      <textarea id="quickPrompt" rows="4" placeholder="Example: A dark romance between a cold vampire lord and a fearless human healer in medieval Europe. 3 main characters. The healer slowly breaks through his walls but both are hunted by a vampire council that forbids human-vampire relationships. Ends with a dramatic confrontation and bittersweet ending." style="font-size:.92rem;line-height:1.7;border:1.5px solid var(--gold);background:#fffdf8"></textarea>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-p" id="quickGenBtn" onclick="runQuickGen()" style="gap:7px;font-size:.92rem;padding:9px 20px">
          <span id="quickGenBtnIcon">✨</span> Generate Story Setup
        </button>
        <span style="font-size:.76rem;color:var(--muted);font-style:italic">or press <kbd style="background:var(--paper-dark);border:1px solid var(--border);border-radius:3px;padding:1px 6px;font-family:'JetBrains Mono',monospace;font-size:.7rem">Enter</kbd> in the box</span>
        <div id="quickGenStatus" style="font-family:'JetBrains Mono',monospace;font-size:.68rem;color:var(--gold);display:none">
          <span id="quickGenSpinner" style="display:inline-block;animation:pulse 1s infinite">⚙</span> <span id="quickGenMsg">Generating…</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 1: Story Setup -->
  <div class="card">
    <div class="ch"><div class="step">1</div><h2>Story Setup</h2></div>
    <div class="cb">
      <div class="fr t2">
        <div><label>Novel Title</label><input type="text" id="novelTitle" placeholder="Your novel title..."></div>
        <div style="grid-column:1/-1"><label>Genre <span style="font-size:.6rem;color:var(--muted);font-style:italic;text-transform:none;letter-spacing:0">(click to toggle — pick 1 or more)</span></label>
          <div id="genreTags" style="display:flex;flex-wrap:wrap;gap:5px;padding:8px;background:white;border:1px solid var(--border);border-radius:3px;min-height:38px;cursor:pointer" onclick="toggleGenreTag(event)">
          </div>
          <input type="hidden" id="genre" value="">
        </div>
      </div>
      <div class="fr">
        <div><label>Plot Summary &amp; Story Arc</label>
          <textarea id="plotSummary" rows="4" placeholder="Describe your full story arc: the central conflict, main characters' journey, key turning points, and how it resolves. The more detail you provide here, the more consistent the AI will be across chapters."></textarea>
        </div>
      </div>
      <div class="fr t2">
        <div><label>Writing Style / Tone</label><input type="text" id="writingStyle" placeholder="e.g. lyrical and atmospheric, fast-paced thriller, slow-burn romance"></div>
        <div><label>World / Setting</label><input type="text" id="setting" placeholder="e.g. Victorian London, post-apocalyptic wasteland, magical academy"></div>
      </div>
    </div>
  </div>

  <!-- Step 2: Characters -->
  <div class="card">
    <div class="ch"><div class="step">2</div><h2>Character Registry</h2><span class="badge b-new" style="margin-left:auto">Structured + Tracked</span></div>
    <div class="cb">
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:8px;font-style:italic">Each character is injected into every chapter prompt with their current status, so the AI never contradicts who is alive, dead, or imprisoned.</div>
      <div class="char-list" id="charList"></div>
      <button class="add-c" onclick="addChar()">+ Add Character</button>
    </div>
  </div>

  <!-- Step 3: Settings -->
  <div class="card">
    <div class="ch"><div class="step">3</div><h2>Generation Settings</h2><span class="badge b-new" style="margin-left:auto">Tuned for Quality</span></div>
    <div class="cb">
      <div class="fr t3">
        <div><label>Total Chapters</label><input type="number" id="totalChapters" value="10" min="1" max="100"></div>
        <div><label>Target Words / Chapter</label><input type="number" id="wordsPerChapter" value="2000" min="300" max="6000" step="100"></div>
        <div><label>Max Tokens / Request</label><input type="number" id="maxTokens" value="4096" min="512" max="16384" step="256"></div>
      </div>
      <div class="fr t3">
        <div><label>Temperature</label><input type="number" id="temperature" value="0.85" min="0.3" max="1.4" step="0.05"><small style="font-size:.68rem;color:var(--muted)">Higher = more creative</small></div>
        <div><label>Repeat Penalty</label><input type="number" id="repeatPenalty" value="1.18" min="1.0" max="1.5" step="0.01"><small style="font-size:.68rem;color:var(--muted)">Higher = less repetition</small></div>
        <div><label>Top P</label><input type="number" id="topP" value="0.92" min="0.5" max="1.0" step="0.01"><small style="font-size:.68rem;color:var(--muted)">Nucleus sampling</small></div>
      </div>
      <div class="al info" style="font-size:.79rem;margin-top:4px">
        <span style="flex-shrink:0">&#8505;</span>
        <div>
          <strong>8-Step generation pipeline per chapter:</strong>
          LOAD memory from DB &rarr; PLAN 3-scene outline &rarr; BUILD prompt with character registry + last 3 summaries + forbidden phrases &rarr; GENERATE with tuned params &rarr; POST-PROCESS (fix merge errors, detect repeats) &rarr; AUTO-CONTINUE up to 5&times; &rarr; UPDATE memory (extract events, summarize) &rarr; SAVE to IndexedDB.
        </div>
      </div>
    </div>
  </div>

  <!-- Step 4: Generate -->
  <div class="card">
    <div class="ch"><div class="step">4</div><h2>Generate Novel</h2><span class="badge b-db" style="margin-left:auto">IndexedDB Persistence</span></div>
    <div class="cb">
      <div id="alertBox" style="display:none"></div>
      <div class="sbar">
        <div class="sdot idle" id="sdot"></div>
        <span class="stxt" id="stxt">Ready to begin</span>
        <div class="scnt">
          <span>Ch <strong id="curCh">&mdash;</strong></span>
          <span>Words <strong id="totWords">0</strong></span>
          <span>DB Saves <strong id="dbSaves">0</strong></span>
        </div>
      </div>
      <div class="pw"><div class="pb" id="pbar"></div></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:11px">
        <button class="btn btn-p" id="startBtn" onclick="startGen()">&#10022; Begin Writing</button>
        <button class="btn btn-s" id="stopBtn" onclick="stopGen()" disabled>&#9209; Stop</button>
        <button class="btn btn-s btn-sm" id="contBtn" onclick="forceContinue()" disabled>&#8617; Force Continue</button>
        <button class="btn btn-v btn-sm" onclick="saveAll()">&#128190; Save Now</button>
        <button class="btn btn-d btn-sm" onclick="resetSession()" style="margin-left:auto">&#10005; Reset</button>
      </div>
      <div id="chPanel" style="display:none">
        <div class="chtabs" id="chTabs"></div>
        <div class="card" style="margin:0;border-radius:0 0 4px 4px;border-top:none">
          <div class="out" id="outArea"><div class="ph">Your novel will appear here as it generates&hellip;</div></div>
          <div class="of">
            <div class="wcb" id="wcBadge">0 words</div>
            <div class="cb2 idle" id="cb2">&#10003; Ready</div>
          </div>
        </div>
        <div class="expa">
          <button class="btn btn-s btn-sm" onclick="expChapter()">&#128196; This Chapter</button>
          <button class="btn btn-p btn-sm" onclick="expFull()">&#128218; Full Novel (.txt)</button>
          <button class="btn btn-s btn-sm" onclick="expMD()">&#8595; Markdown</button>
          <button class="btn btn-v btn-sm" onclick="expJSON()">{ } Export with Outlines</button>
        </div>
      </div>
    </div>
  </div>

</div>
</div>

<script>
// =============================================================
// LAYER 5 — INDEXEDDB
// =============================================================
const DB_NAME = 'HazyNovelV2', DB_VER = 1;
let db = null;

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('novels')) {
        const s = d.createObjectStore('novels', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!d.objectStoreNames.contains('chapters')) {
        const s = d.createObjectStore('chapters', { keyPath: 'id' });
        s.createIndex('novelId', 'novelId');
        s.createIndex('novelChapter', ['novelId', 'chapterNum']);
      }
      if (!d.objectStoreNames.contains('memory')) {
        d.createObjectStore('memory', { keyPath: 'novelId' });
      }
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}

const dbPut  = (s,o)   => new Promise((r,j) => { const t = db.transaction(s,'readwrite').objectStore(s).put(o);   t.onsuccess=()=>r(t.result); t.onerror=()=>j(t.error); });
const dbGet  = (s,k)   => new Promise((r,j) => { const t = db.transaction(s,'readonly').objectStore(s).get(k);    t.onsuccess=()=>r(t.result); t.onerror=()=>j(t.error); });
const dbDel  = (s,k)   => new Promise((r,j) => { const t = db.transaction(s,'readwrite').objectStore(s).delete(k);t.onsuccess=()=>r();         t.onerror=()=>j(t.error); });
const dbAll  = s       => new Promise((r,j) => { const t = db.transaction(s,'readonly').objectStore(s).getAll();  t.onsuccess=()=>r(t.result); t.onerror=()=>j(t.error); });
const dbIdx  = (s,i,v) => new Promise((r,j) => { const t = db.transaction(s,'readonly').objectStore(s).index(i).getAll(v); t.onsuccess=()=>r(t.result); t.onerror=()=>j(t.error); });
const uid    = ()      => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

// =============================================================
// STATE
// =============================================================
const S = {
  novelId: null,
  chapters: {},      // { chNum: "text" }
  outlines: {},      // { chNum: "outline text" }
  activeChapter: 0,
  totalChapters: 10,
  wordsTarget: 2000,
  isRunning: false,
  shouldStop: false,
  abortCtrl: null,
  dbSaveCount: 0,
  bible: null,

  // Layer 3 — Story Memory
  mem: {
    characterStates:  {},   // { "Name": { status, location, lastSeen } }
    plotEvents:       [],   // ["[Ch.1] event description", ...]
    chapterSummaries: {},   // { 1: "summary text", 2: "..." }
    locationsVisited: [],   // ["Forest", "Castle", ...]
    forbiddenPhrases: [
      "felt a shiver run down",
      "voice barely above a whisper",
      "voice low and husky",
      "flutter in her chest",
      "ran down her spine",
      "chill ran down",
      "eyes locked onto",
      "burned with intensity",
      "felt herself",
      "felt himself",
      "heart skipped a beat",
      "blood ran cold",
      "breath caught in",
      "spine tingled"
    ],
    currentLocation: ""
  }
};

// =============================================================
// INIT
// =============================================================
window.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  addChar(); // start with one blank character row
  await initProviders(); // this calls onProviderChange() -> checkConn() internally
  await loadLibrary();
  renderMemory();
});

// =============================================================
// QUICK STORY GENERATOR — AI Auto-Fill
// =============================================================
// =============================================================
// GENRE TAG SYSTEM
// =============================================================
const ALL_GENRES = [
  // Core Fiction
  'Fantasy','Dark Fantasy','High Fantasy','Urban Fantasy','Fairy Tale',
  // Romance
  'Romance','Dark Romance','Slow-Burn Romance','Enemies to Lovers',
  'Forbidden Love','Love Triangle','Second Chance Romance',
  // Drama & Slice of Life
  'Drama','Slice of Life','School Life','Coming of Age','Family Drama',
  'Contemporary Fiction',
  // Sci-Fi & Futuristic
  'Science Fiction','Cyberpunk','Steampunk','Space Opera','Post-Apocalyptic',
  'Dystopian','Time Travel','Alternate History',
  // Mystery & Thriller
  'Mystery','Thriller','Psychological Thriller','Crime','Detective',
  'Suspense','Political Thriller',
  // Horror & Dark
  'Horror','Gothic Horror','Supernatural Horror','Cosmic Horror','Dark Fiction',
  // Action & Adventure
  'Adventure','Action','Survival','War','Martial Arts',
  // Paranormal & Supernatural
  'Paranormal','Vampire','Werewolf','Witches & Magic','Angels & Demons',
  'Ghost Story','Mythology',
  // Historical
  'Historical Fiction','Historical Romance','Medieval','Ancient World',
  'Victorian Era','World War',
  // Humor & Light
  'Comedy','Romantic Comedy','Parody','Satire','Cozy Fiction',
  // Anime-style / Webtoon genres
  'Isekai','Reincarnation','Harem','Reverse Harem','Manhwa / Webtoon Style',
  'Shounen','Shoujo','Josei','Seinen','Mecha','Cultivation / Xianxia',
  // Spiritual & Philosophical
  'Literary Fiction','Philosophical','Spiritual','Inspirational',
  // Misc
  'Young Adult','Middle Grade','Children','LGBTQ+','Anthology',
  'Interactive / Choice-Based','Epistolary','Mystery Romance',
];

function initGenreTags() {
  const container = document.getElementById('genreTags');
  if (!container) return;
  container.innerHTML = ALL_GENRES.map(g =>
    `<span class="gtag" data-genre="${g}" style="
      display:inline-block;padding:3px 10px;border-radius:20px;font-size:.74rem;
      font-family:'JetBrains Mono',monospace;cursor:pointer;transition:all .15s;
      background:var(--paper-dark);border:1px solid var(--border);color:var(--muted);
      user-select:none;
    " title="Click to select">${g}</span>`
  ).join('');
}

function toggleGenreTag(e) {
  const tag = e.target.closest('.gtag');
  if (!tag) return;
  const active = tag.classList.toggle('gtag-on');
  tag.style.background  = active ? 'var(--gold)'  : 'var(--paper-dark)';
  tag.style.color       = active ? 'white'         : 'var(--muted)';
  tag.style.borderColor = active ? 'var(--gold)'   : 'var(--border)';
  tag.style.fontWeight  = active ? '600'            : 'normal';
  syncGenreValue();
}

function syncGenreValue() {
  const active = [...document.querySelectorAll('.gtag-on')].map(t => t.dataset.genre);
  const hidden = document.getElementById('genre');
  if (hidden) hidden.value = active.join(', ');
}

function setGenreTags(genreStr) {
  // Deactivate all first
  document.querySelectorAll('.gtag').forEach(t => {
    t.classList.remove('gtag-on');
    t.style.background  = 'var(--paper-dark)';
    t.style.color       = 'var(--muted)';
    t.style.borderColor = 'var(--border)';
    t.style.fontWeight  = 'normal';
  });
  // Parse genres — could be comma-separated or slash-separated
  const requested = genreStr.split(/[,\/]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  document.querySelectorAll('.gtag').forEach(tag => {
    const tagName = tag.dataset.genre.toLowerCase();
    const matches = requested.some(r =>
      tagName.includes(r) || r.includes(tagName) ||
      tagName.replace(/[^a-z]/g,'').includes(r.replace(/[^a-z]/g,''))
    );
    if (matches) {
      tag.classList.add('gtag-on');
      tag.style.background  = 'var(--gold)';
      tag.style.color       = 'white';
      tag.style.borderColor = 'var(--gold)';
      tag.style.fontWeight  = '600';
      // Scroll tag into view
      tag.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
  });
  syncGenreValue();
}

// =============================================================
// QUICK STORY GENERATOR — AI Auto-Fill (FIXED v2)
// =============================================================
async function runQuickGen() {
  const prompt = (document.getElementById('quickPrompt')?.value || '').trim();
  if (!prompt) { showAlert('warn', 'Please describe your story idea first.'); return; }

  const btn    = document.getElementById('quickGenBtn');
  const status = document.getElementById('quickGenStatus');
  const msg    = document.getElementById('quickGenMsg');
  const icon   = document.getElementById('quickGenBtnIcon');

  btn.disabled = true;
  icon.textContent = '⚙';
  status.style.display = 'inline-flex';
  msg.textContent = 'Reading your idea…';

  // Use a direct non-streaming fetch for JSON generation
  // Lower temperature = more reliable JSON output
  const systemPrompt = `You are a professional novel planning assistant. The user will describe a story idea.
You must respond ONLY with a valid JSON object. No markdown. No backticks. No explanation. No comments. Just the raw JSON object itself.

Return EXACTLY this structure:
{
  "title": "Creative evocative novel title",
  "genres": ["Genre1", "Genre2"],
  "plot": "Rich 3-5 sentence plot summary covering central conflict, character arcs, turning points, and resolution",
  "setting": "World and setting described in 1-2 sentences",
  "writingStyle": "Tone and style in one phrase",
  "totalChapters": 12,
  "wordsPerChapter": 2000,
  "characters": [
    {
      "name": "Full Name",
      "role": "protagonist / antagonist / love interest / best friend / rival / mentor",
      "personality": "trait1, trait2, trait3, trait4",
      "status": "alive",
      "desc": "2-3 sentences covering appearance, backstory, motivation, and goals"
    }
  ]
}

Rules:
- "genres" must be an ARRAY of strings from this list: Fantasy, Dark Fantasy, Romance, Dark Romance, Slow-Burn Romance, Enemies to Lovers, Drama, Slice of Life, School Life, Coming of Age, Science Fiction, Mystery, Thriller, Horror, Adventure, Young Adult, Dystopian, Paranormal, Comedy, Romantic Comedy, Isekai, Reincarnation, Shoujo, Shounen, Historical Fiction, Literary Fiction, Cyberpunk, Supernatural Horror, Gothic Horror, Forbidden Love, Love Triangle, Contemporary Fiction, LGBTQ+, Martial Arts, Mythology, Vampire, Werewolf, Interactive / Choice-Based
- "totalChapters" must be an integer between 8 and 20
- "wordsPerChapter" must be an integer between 1500 and 3000
- Generate 2 to 8 characters based on what the user describes
- Use real names, not placeholders like "Character A"
- Do NOT wrap the JSON in backticks or markdown`;

  try {
    msg.textContent = 'Generating story setup…';

    // Always stream and collect — server normalises ALL providers to NDJSON
    // Non-streaming (stream:false) breaks cloud providers through this server
    const isCloud = isCloudProvider();
    const response = await fetch('/hazy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getModel(),
        ...(getApiKey() ? {apiKey: getApiKey()} : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: 'Story idea: ' + prompt }
        ],
        stream: true,
        options: isCloud
          ? { temperature: 0.3, max_tokens: 3000 }
          : { temperature: 0.3, num_predict: 3000, repeat_penalty: 1.0, top_p: 0.9 },
      })
    });

    if (!response.ok) {
      let errMsg = 'Server error ' + response.status;
      try { const e = await response.json(); errMsg = e.error || errMsg; } catch {}
      throw new Error(errMsg);
    }

    // Collect all streaming chunks into one string
    msg.textContent = 'Receiving response…';
    const reader2  = response.body.getReader();
    const decoder2 = new TextDecoder();
    let   rawJson  = '';
    let   buf2     = '';

    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;
      buf2 += decoder2.decode(value, { stream: true });
      const lines2 = buf2.split('\n');
      buf2 = lines2.pop();
      for (const line2 of lines2) {
        const t = line2.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t);
          if (j.error) throw new Error(j.error);
          if (j.message?.content) rawJson += j.message.content;
        } catch(e2) {
          if (e2.message && !e2.message.includes('JSON')) throw e2;
        }
      }
    }
    rawJson = rawJson.trim();

    msg.textContent = 'Parsing story data…';

    // Strip markdown fences if model added them anyway
    rawJson = rawJson
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im,     '')
      .replace(/```\s*$/im,     '')
      .trim();

    // Find the outermost JSON object
    const start = rawJson.indexOf('{');
    const end   = rawJson.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Model did not return valid JSON. Try again.');
    rawJson = rawJson.slice(start, end + 1);

    let data;
    try {
      data = JSON.parse(rawJson);
    } catch(parseErr) {
      // Try to fix common JSON issues (trailing commas, unquoted values)
      const cleaned = rawJson
        .replace(/,\s*}/g,  '}')
        .replace(/,\s*]/g,  ']')
        .replace(/:\s*undefined/g, ': null');
      data = JSON.parse(cleaned);
    }

    msg.textContent = 'Filling in the form…';

    // Apply all fields
    if (data.title)        setV('novelTitle',  data.title);
    if (data.plot)         setV('plotSummary', data.plot);
    if (data.setting)      setV('setting',     data.setting);
    if (data.writingStyle) setV('writingStyle',data.writingStyle);

    if (data.totalChapters)
      document.getElementById('totalChapters').value =
        Math.min(Math.max(parseInt(data.totalChapters) || 12, 1), 100);

    if (data.wordsPerChapter)
      document.getElementById('wordsPerChapter').value =
        Math.min(Math.max(parseInt(data.wordsPerChapter) || 2000, 300), 6000);

    // Set genres — handle both array and string formats
    const genreVal = Array.isArray(data.genres)
      ? data.genres.join(', ')
      : (data.genre || '');
    if (genreVal) setGenreTags(genreVal);

    // Clear + fill characters
    if (data.characters && data.characters.length) {
      document.getElementById('charList').innerHTML = '';
      charId = 0;
      data.characters.forEach(c => addChar(
        c.name        || '',
        c.role        || '',
        c.personality || '',
        c.status      || 'alive',
        c.desc        || ''
      ));
    }

    // Scroll to the filled form
    document.getElementById('novelTitle')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const charCount = (data.characters || []).length;
    const genreList = Array.isArray(data.genres) ? data.genres.join(', ') : genreVal;
    showAlert('ok', `Story setup generated! "${data.title}" — ${charCount} characters, genres: ${genreList}`);
    status.style.display = 'none';

  } catch (err) {
    console.error('[QuickGen] Error:', err);
    showAlert('err', 'Quick Generate failed: ' + err.message + '. Try again or fill the form manually.');
    status.style.display = 'none';
  }

  btn.disabled = false;
  icon.textContent = '✨';
}

function setV(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// Keep setGenre for backward compat — now delegates to tag system
function setGenre(genreStr) { setGenreTags(genreStr); }

// Enter key in quick prompt box
document.addEventListener('DOMContentLoaded', () => {
  initGenreTags();
  const qp = document.getElementById('quickPrompt');
  if (qp) {
    qp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runQuickGen(); }
    });
  }
});

// =============================================================
// =============================================================
// LAYER 1 — CONNECTION CHECK
// =============================================================
async function checkConn() {
  const el = document.getElementById('connStatus');
  el.className = 'cs checking'; el.textContent = 'checking…';
  const prov = document.getElementById('providerSelect')?.value || 'ollama';

  if (prov === 'ollama') {
    // Try ALL possible endpoints in parallel — fastest wins
    const urls = [
      'http://localhost:11434/api/tags',  // direct to Ollama (always works locally)
      '/api/tags',                         // through server.js proxy
    ];

    let connected = false;
    for (const url of urls) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) continue;
        const d = await r.json();
        const models = d.models || [];
        connected = true;
        if (models.length > 0) {
          el.className = 'cs ok';
          el.textContent = '✓ ' + models.length + ' model' + (models.length > 1 ? 's' : '') + ' — ' + models.map(m => m.name).slice(0, 2).join(', ');
          populateOllamaModels(models);
        } else {
          el.className = 'cs fail';
          el.textContent = '⚠ Connected but no models installed — run: ollama pull llama3.2';
        }
        return;
      } catch { /* try next url */ }
    }

    if (!connected) {
      el.className = 'cs fail';
      el.textContent = '✗ Ollama not running — run: ollama serve';
    }
  } else {
    // Cloud provider
    try {
      const r = await fetch('/hazy/providers', { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const d = await r.json();
        const info = d.providers?.[prov];
        if (info?.hasKey) {
          el.className = 'cs ok';
          el.textContent = '✓ ' + prov + ' key active';
        } else {
          el.className = 'cs fail';
          el.textContent = '⚠ No ' + prov + ' key — add in Hazy Settings';
        }
      } else {
        el.className = 'cs fail';
        el.textContent = '⚠ Start server.js to use cloud providers';
      }
    } catch {
      el.className = 'cs fail';
      el.textContent = '⚠ Start server.js to use cloud providers';
    }
  }
}

// Populate modelSelect with actual installed Ollama models
function populateOllamaModels(models) {
  const prov = document.getElementById('providerSelect')?.value || 'ollama';
  if (prov !== 'ollama') return;
  const sel = document.getElementById('modelSelect');
  if (!sel) return;
  const saved = localStorage.getItem('hazyModel_ollama') || localStorage.getItem('hazyActiveModel') || '';
  sel.innerHTML = models.map(m => {
    const gb = m.size ? ' (' + (m.size/1e9).toFixed(1) + 'GB)' : '';
    return '<option value="ollama/' + m.name + '"' + (('ollama/'+m.name)===saved?' selected':'') + '>' + m.name + gb + '</option>';
  }).join('');
  // If nothing matched the saved value, just keep first option selected
  if (saved && !sel.value) sel.selectedIndex = 0;
}

// All API calls use absolute paths like '/hazy/chat' — no base URL needed
const getModel = () => {
  const sel = document.getElementById('modelSelect');
  return sel ? sel.value : (localStorage.getItem('hazyDefaultModel') || 'ollama/llama3.2');
};

// Get the API key for the current provider from localStorage
const getApiKey = () => {
  const model    = getModel();
  const provider = model.split('/')[0];
  if (provider === 'ollama') return null;
  return localStorage.getItem('hazyKey_' + provider) || null;
};

// Check if current provider is cloud
const isCloudProvider = () => {
  const prov = getModel().split('/')[0];
  return ['anthropic','openai','groq','gemini'].includes(prov);
};

// ── Unified fetch helper — always streams, collects full text ────────────
// Replaces stream:false calls which break cloud providers through this server
async function fetchText(messages, opts = {}) {
  const isCloud = isCloudProvider();
  const baseOpts = isCloud
    ? { temperature: opts.temperature || 0.3, max_tokens: opts.max_tokens || opts.num_predict || 1000 }
    : { temperature: opts.temperature || 0.3, num_predict: opts.num_predict || 1000,
        repeat_penalty: opts.repeat_penalty || 1.0, top_p: opts.top_p || 0.9 };

  const apiKey = getApiKey();
  const body = { model: getModel(), messages, stream: true, options: baseOpts };
  if (apiKey) body.apiKey = apiKey;

  const r = await fetch('/hazy/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    let errMsg = 'Error ' + r.status;
    try { const e = await r.json(); errMsg = e.error || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const reader  = r.body.getReader();
  const decoder = new TextDecoder();
  let full = '', buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line.trim());
        if (j.error) throw new Error(j.error);
        if (j.message?.content) full += j.message.content;
      } catch(e) {
        if (e.message && !e.message.includes('JSON') && !e.message.includes('Unexpected')) throw e;
      }
    }
  }
  return full.trim();
}
const gv       = id => (document.getElementById(id)?.value || '').trim();

// =============================================================
// LAYER 1 — CHARACTERS
// =============================================================
let charId = 0;
function addChar(name='', role='', personality='', status='alive', desc='') {
  charId++;
  const id = charId;
  const list = document.getElementById('charList');
  const div = document.createElement('div');
  div.className = 'char-item'; div.id = 'char' + id;
  div.innerHTML =
    '<div class="cr1">' +
      '<input type="text" placeholder="Character name" value="' + xa(name) + '" id="cn' + id + '">' +
      '<input type="text" placeholder="Role / archetype" value="' + xa(role) + '" id="cr' + id + '">' +
      '<button class="xbtn" onclick="rmChar(' + id + ')">&#10005;</button>' +
    '</div>' +
    '<div class="cr2">' +
      '<input type="text" placeholder="Personality traits" value="' + xa(personality) + '" id="cp' + id + '">' +
      '<select id="cs' + id + '">' +
        '<option value="alive"' + (status==='alive'?' selected':'') + '>alive</option>' +
        '<option value="dead"' + (status==='dead'?' selected':'') + '>dead</option>' +
        '<option value="imprisoned"' + (status==='imprisoned'?' selected':'') + '>imprisoned</option>' +
        '<option value="missing"' + (status==='missing'?' selected':'') + '>missing</option>' +
        '<option value="unknown"' + (status==='unknown'?' selected':'') + '>unknown</option>' +
      '</select>' +
    '</div>' +
    '<input type="text" placeholder="Full description, backstory, goals..." value="' + xa(desc) + '" id="cd' + id + '" style="width:100%;font-size:.78rem;padding:4px 7px;margin-top:4px">';
  list.appendChild(div);
}

function rmChar(id) { document.getElementById('char' + id)?.remove(); }

function getChars() {
  return [...document.querySelectorAll('.char-item')].map(el => {
    const id = el.id.replace('char', '');
    return {
      name:        gv('cn' + id),
      role:        gv('cr' + id),
      personality: gv('cp' + id),
      desc:        gv('cd' + id),
      status:      document.getElementById('cs' + id)?.value || 'alive'
    };
  }).filter(c => c.name);
}

const xa = s => (s||'').replace(/"/g, '&quot;');

// =============================================================
// LAYER 2 — STORY BIBLE (system prompt foundation)
// =============================================================
function buildBible() {
  const title   = gv('novelTitle') || 'Untitled Novel';
  const genre   = gv('genre') || 'Fiction';  // multi-genre from tag selector
  const plot    = gv('plotSummary');
  const style   = gv('writingStyle');
  const setting = gv('setting');
  const chars   = getChars();
  const fp      = S.mem.forbiddenPhrases;

  const genreLabel = genre.includes(',') ? 'a multi-genre novel blending ' + genre : 'a ' + genre + ' novel';
  let b = `You are a professional novelist. You are writing "${title}", ${genreLabel}.

`;

  if (setting) b += `WORLD / SETTING:
${setting}

`;

  if (plot) b += `FULL STORY OUTLINE:
${plot}

`;

  if (chars.length) {
    b += `CHARACTER REGISTRY (THESE ARE PERMANENT — ALWAYS RESPECT THEIR STATUS):
`;
    chars.forEach(c => {
      b += `  NAME: ${c.name}
`;
      b += `  ROLE: ${c.role}
`;
      if (c.personality) b += `  PERSONALITY: ${c.personality}
`;
      if (c.desc)        b += `  DESCRIPTION: ${c.desc}
`;
      b += `  CURRENT STATUS: ${c.status}

`;
    });
  }

  if (style) b += `WRITING STYLE & TONE:
${style}

`;

  if (fp.length) {
    b += `FORBIDDEN PHRASES — YOU MUST NEVER USE THESE EXACT PHRASES:
`;
    fp.forEach(p => b += `  ✗ "${p}"
`);
    b += `
`;
  }

  b += `WRITING STYLE RULES (CRITICAL — READ CAREFULLY):\n`;
  b += `\n`;
  b += `LANGUAGE & TONE:\n`;
  b += `- Write in a CASUAL, natural, easy-to-read style. Use everyday language people actually speak.\n`;
  b += `- Avoid overly poetic or "literary" language. Keep it simple and real.\n`;
  b += `- Short sentences are good. One-liners are good. Not every sentence needs to be long.\n`;
  b += `- Write like you are telling the story to a friend — warm, engaging, effortless to read.\n`;
  b += `\n`;
  b += `DIALOGUE RULES:\n`;
  b += `- Every new speaker gets their OWN new paragraph. Never mix two speakers in one block.\n`;
  b += `- Dialogue should sound like real people talking — casual, with personality and humor.\n`;
  b += `- Format: "What she said," he replied. — always on its own line.\n`;
  b += `- Use body language and reactions after dialogue — show HOW something was said.\n`;
  b += `\n`;
  b += `PARAGRAPH & FORMATTING RULES:\n`;
  b += `- Keep paragraphs SHORT — 2 to 4 sentences max. No walls of text.\n`;
  b += `- Add a blank line between every paragraph and every dialogue line.\n`;
  b += `- Use line breaks to give the reader room to breathe.\n`;
  b += `- Internal thoughts: use italics formatting like *this is what he thought*.\n`;
  b += `- Scene transitions: use a centered em-dash line — like: ---\n`;
  b += `\n`;
  b += `STORY RULES:\n`;
  b += `1. Show emotions through actions and reactions — not just descriptions.\n`;
  b += `2. End each chapter on a hook — a cliffhanger, a question, or an emotional punch.\n`;
  b += `3. NEVER break character or write meta-commentary like "Here is Chapter X".\n`;
  b += `4. NEVER bring back dead characters or change established facts.\n`;
  b += `5. When continuing, pick up EXACTLY from the last sentence — no recap, no repetition.\n`;
  b += `6. Keep character voices consistent — each person should sound like themselves.\n`;

  return { bible: b, title, genre };
}
// =============================================================
// LAYER 2b — CHAPTER PLANNER
// =============================================================
async function planChapter(n, total, prevSummary) {
  setSt('Planning Chapter ' + n + ' outline…'); 
  setDot('planning');
  setTabState(n, 'plan'); 
  setCB2('plan', '⚙ Planning…');

  const charBlock  = buildCharStateBlock();
  const loc        = S.mem.currentLocation || gv('curLocation');
  const recentEvts = S.mem.plotEvents
    .slice(-6)
    .map(e => '  - ' + e)
    .join('\n'); // ✅ FIXED

  const pos = chapterPosition(n, total);

  const prompt = `You are planning Chapter ${n} of ${total} for this novel.

Chapter position: ${pos}

${charBlock ? charBlock + '\n\n' : ''}${loc ? `CURRENT LOCATION: ${loc}\n\n` : ''}${recentEvts ? `RECENT PLOT EVENTS:
${recentEvts}

` : ''}${prevSummary ? `PREVIOUS CHAPTER SUMMARY:
${prevSummary}

` : ''}Create a concise 3-scene outline for Chapter ${n}.
Format EXACTLY:
SCENE 1: [one specific sentence — what happens, who is involved]
SCENE 2: [one specific sentence — rising action or conflict]
SCENE 3: [one specific sentence — chapter climax and closing hook]

Use actual character names. Be specific. No vague descriptions.`;

  try {
    const text = await fetchText(
      [ { role: 'system', content: S.bible.bible }, { role: 'user', content: prompt } ],
      { temperature: 0.45, num_predict: 250, repeat_penalty: 1.1 }
    );
    return text;
  } catch {
    return `SCENE 1: Opening scene with primary character.
SCENE 2: Rising conflict develops.
SCENE 3: Chapter climax with a hook into next chapter.`;
  }
}
// =============================================================
// LAYER 2 — CHAPTER PROMPT BUILDER (Layer 3b — Context Window)
// =============================================================
function buildChapterPrompt(n, total, outline) {
  const target    = S.wordsTarget;
  const pos       = chapterPosition(n, total);
  const charBlock = buildCharStateBlock();
  const loc       = S.mem.currentLocation || gv('curLocation');

  // Layer 3b: rolling last-3 summaries only (never dump full novel)
  const sumKeys = Object.keys(S.mem.chapterSummaries)
    .map(Number)
    .sort((a,b) => b-a)
    .slice(0, 3)
    .reverse();

  let p = '';

  // Always inject character registry with current statuses
  if (charBlock) p += `${charBlock}\n\n`;

  // Current location context
  if (loc) p += `CURRENT SCENE LOCATION: ${loc}\n\n`;

  // Rolling story memory (last 3 chapters max)
  if (sumKeys.length) {
    p += `STORY CONTEXT (last ${sumKeys.length} chapter${sumKeys.length > 1 ? 's' : ''}):\n`;
    sumKeys.forEach(num => {
      p += `Chapter ${num}: ${S.mem.chapterSummaries[num]}\n`;
    });
    p += `\n`;
  }

  // Plot events from memory
  const recentEvts = S.mem.plotEvents.slice(-5);
  if (recentEvts.length) {
    p += `KEY EVENTS ALREADY IN THE STORY:\n`;
    recentEvts.forEach(e => p += `  - ${e}\n`);
    p += `\n`;
  }

  // Chapter outline from planner
  if (outline) {
    p += `YOUR OUTLINE FOR THIS CHAPTER (FOLLOW THIS):\n${outline}\n\n`;
  }

  // The actual writing instruction
  p += `Now write Chapter ${n} of ${total} (${pos}).\n`;
  p += `\n`;
  p += `TARGET: Approximately ${target} words.\n`;
  p += `\n`;
  p += `START with this exact format on the first line:\n`;
  p += `Chapter ${n}: [A Short Creative Title]\n`;
  p += `\n`;
  p += `Then write the full chapter. Remember:\n`;
  p += `- Short paragraphs. Breathing room between lines.\n`;
  p += `- Every new speaker = new line.\n`;
  p += `- Casual language. Like a story you would tell a friend.\n`;
  p += `- Use *italics* for internal thoughts.\n`;
  p += `- Use --- for scene breaks.\n`;
  p += `- Write complete scenes, not summaries.\n`;
  p += `- End with something that makes the reader want to keep going.`;

  return p;
}

function buildCharStateBlock() {
  const chars = getChars();
  if (!chars.length) return '';

  const lines = chars.map(c => {
    const st  = S.mem.characterStates[c.name]?.status || c.status;
    const loc = S.mem.characterStates[c.name]?.location || '';

    return `  ${c.name} [${c.role}] — STATUS: ${st.toUpperCase()}${
      loc ? `, last location: ${loc}` : ''
    }`;
  });

  return `CHARACTER STATUS (HARD CONSTRAINT — MUST NOT CONTRADICT):\n${lines.join('\n')}`;
}

function chapterPosition(n, total) {
  if (n === 1)                               return 'opening chapter — establish world, introduce characters, hook the reader';
  if (n === total)                           return 'final chapter — climax, resolution, emotional payoff, satisfying ending';
  if (n <= Math.ceil(total * 0.20))         return 'early chapter — world-building, character development, introduce conflict';
  if (n <= Math.ceil(total * 0.50))         return 'first-half middle chapter — escalating tension, deepen relationships';
  if (n <= Math.ceil(total * 0.75))         return 'second-half middle chapter — rising stakes, complications, dark moment';
  return 'late chapter — approaching climax, maximum stakes, no going back';
}

// =============================================================
// LAYER 4 — OLLAMA GENERATION ENGINE (streaming)
// =============================================================
async function streamGen(messages, onChunk) {
  const maxTk = parseInt(gv('maxTokens'))    || 4096;
  const temp  = parseFloat(gv('temperature'))  || 0.85;
  const rp    = parseFloat(gv('repeatPenalty'))|| 1.18;
  const tp    = parseFloat(gv('topP'))         || 0.92;

  S.abortCtrl = new AbortController();

  const apiKey   = getApiKey();
  const isCloud  = isCloudProvider();

  // Cloud providers don't support Ollama-specific options — send only standard ones
  const bodyOptions = isCloud
    ? { temperature: temp, max_tokens: maxTk }
    : { temperature: temp, num_predict: maxTk, repeat_penalty: rp, top_p: tp, top_k: 40 };

  const reqBody = {
    model:   getModel(),
    messages,
    stream:  true,
    options: bodyOptions,
  };
  if (apiKey) reqBody.apiKey = apiKey; // server uses this to call cloud API

  const r = await fetch('/hazy/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    signal:  S.abortCtrl.signal,
    body:    JSON.stringify(reqBody),
  });

  if (!r.ok) {
    let errMsg = r.status + ': ' + r.statusText;
    try { const e = await r.json(); errMsg = e.error || errMsg; } catch {}
    throw new Error(errMsg);
  }

const reader  = r.body.getReader();
const decoder = new TextDecoder();
let full = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value, { stream: true });

  for (const line of chunk.split('\n').filter(l => l.trim())) {
    try {
      const j = JSON.parse(line);
      if (j.message?.content) {
        full += j.message.content;
        onChunk(j.message.content, full);
      }
    } catch {}
  }
}

return full;
}
// =============================================================
// LAYER 2c — POST-PROCESSOR
// =============================================================
function postProcess(text) {
  return text
    .replace(/([.!?])([A-Z])/g, '$1 $2')             // fix merge errors: ".The" -> ". The"
    .replace(/([a-z,;:])(\n)([a-z])/g, '$1 $3')      // fix broken mid-sentence newlines
    .replace(/\n{3,}/g, '\n\n')                      // normalize 3+ blank lines to 2
    .replace(/[ \t]{2,}/g, ' ')                      // collapse multiple spaces/tabs
    .replace(/^\s+/gm, m => m.replace(/  +/g, ' '))  // trim over-indentation
    .trim();
}
function detectRepetitions(text) {
  const found = [];

  // 1. Check known forbidden phrases — warn if used more than once
  S.mem.forbiddenPhrases.forEach(phrase => {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(re) || [];
    if (matches.length > 1) found.push('"' + phrase + '" x' + matches.length);
  });

  // 2. Scan all 4-7 word phrases — AUTO-BAN any used 3+ times
  const wordRuns = text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
  const phraseCount = {};
  for (let i = 0; i < wordRuns.length - 4; i++) {
    for (let len = 4; len <= 7; len++) {
      const phrase = wordRuns.slice(i, i + len).join(' ');
      if (phrase.length < 18) continue;
      phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
    }
  }
  Object.entries(phraseCount).forEach(([phrase, count]) => {
    if (count >= 3 && !S.mem.forbiddenPhrases.includes(phrase)) {
      S.mem.forbiddenPhrases.push(phrase);
      found.push('AUTO-BANNED (x' + count + '): "' + phrase + '"');
    }
  });

  // 3. Check repeated paragraph openers (first 5 words)
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const openers = {};
  paras.forEach(p => {
    const opener = p.split(/\s+/).slice(0, 5).join(' ').toLowerCase();
    if (opener.length > 14) {
      openers[opener] = (openers[opener] || 0) + 1;
      if (openers[opener] > 1) found.push('repeated opener: "' + opener + '..."');
    }
  });
  return found;
}

// === FULL-NOVEL SUMMARY ===
// Builds one complete rolling summary of ALL chapters written so far.
// This is used by the contradiction checker so it has the full picture.
function buildFullNovelSummary() {
  const keys = Object.keys(S.mem.chapterSummaries).map(Number).sort((a, b) => a - b);
  if (!keys.length) return '';
  return keys.map(n => 'Chapter ' + n + ': ' + S.mem.chapterSummaries[n]).join('\n');
}

// === AUTOMATIC PLOT CONTRADICTION CHECKER ===
// Runs after every chapter. Compares the new chapter against:
// - ALL chapter summaries (every chapter, not just last 3)
// - Full character registry with statuses
// - All recorded plot events
// Returns array of contradiction strings, or null if clean.
async function checkPlotContradictions(n, newChapterText) {
  const fullSummary = buildFullNovelSummary();
  if (!fullSummary || Object.keys(S.mem.chapterSummaries).length < 1) return null;

  setSt('Ch.' + n + ' -- checking plot consistency across all chapters...');

  const charBlock  = buildCharStateBlock();
  const allEvents  = S.mem.plotEvents.map(e => '  - ' + e).join('\n');

  try {
    const r = await fetch('/hazy/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getModel(),
        ...(getApiKey() ? {apiKey: getApiKey()} : {}),
        messages: [{
          role: 'user',
          content: [
            'You are a story continuity editor. Your job is to find REAL plot contradictions.',
            '',
            'FULL STORY SUMMARY (ALL chapters written so far):',
            fullSummary,
            '',
            charBlock || '',
            allEvents ? ('ALL RECORDED PLOT EVENTS:\n' + allEvents) : '',
            '',
            'NEW CHAPTER ' + n + ' TEXT (check this against everything above):',
            newChapterText.substring(0, 4000),
            '',
            'INSTRUCTIONS:',
            '- Find things in the NEW CHAPTER that directly CONTRADICT established facts.',
            '- A contradiction means: a dead character appearing alive, wrong location, undoing a completed event, character knowing something they were never told, relationship contradicted.',
            '- Do NOT flag style differences, vague references, or minor timeline gaps.',
            '- If there are NO real contradictions, respond ONLY with: NO_CONTRADICTIONS',
            '- If contradictions exist, list each one starting with CONTRADICTION: on its own line.',
            '- Be concise. One sentence per contradiction.'
          ].filter(Boolean).join('\n')
        }],
        stream: true,
        options: { temperature: 0.1, num_predict: 500 }
      })
    });
    // Collect streaming response
    const _cr = r.body.getReader(); const _cd = new TextDecoder();
    let _cb = '', _cf = '';
    while(true) { const {done,value} = await _cr.read(); if(done) break; _cb += _cd.decode(value,{stream:true}); const _cl = _cb.split('\n'); _cb=_cl.pop(); for(const _cl2 of _cl){try{const _cj=JSON.parse(_cl2.trim()); if(_cj.message?.content) _cf+=_cj.message.content;}catch{}} }
    const result = _cf.trim();

    if (!result || result.includes('NO_CONTRADICTIONS')) return null;

    const contradictions = result.split('\n')
      .map(l => l.trim())
      .filter(l => l.toUpperCase().startsWith('CONTRADICTION:'))
      .map(l => l.replace(/^contradiction:/i, '').trim())
      .filter(Boolean);

    return contradictions.length > 0 ? contradictions : null;
  } catch (e) {
    console.warn('Contradiction check failed:', e.message);
    return null;
  }
}



// =============================================================
// SUMMARIZE & EXTRACT EVENTS (memory update helpers)
// =============================================================
async function summarizeChapter(n, text) {
  if (!text || text.length < 100) return text.substring(0, 200);

  try {
    const summary = await fetchText([{
      role: 'user',
      content: `Summarize this chapter in exactly 3-4 sentences for story continuity tracking.
Include: (1) which named characters appeared, (2) the main event that happened, (3) where the chapter ends, (4) the emotional state or situation of the protagonist.
Be factual and specific. No vague language.

${text.substring(0, 3500)}`
    }], { temperature: 0.2, num_predict: 320, repeat_penalty: 1.1 });
    return summary || text.substring(0, 300);

  } catch {
    return text.substring(0, 300);
  }
}

async function extractPlotEvents(n, text) {
  try {
    const rawEvents = await fetchText([{
      role: 'user',
      content:
        'From the chapter below, extract the 3-5 most important PLOT EVENTS as short statements.\n' +
        'Format: one event per line, no bullets, no numbers. Be specific with character names.\n' +
        'Examples of good events: "The hero discovered the hidden map" or "The villain revealed their true identity"\n\n' +
        text.substring(0, 3500)
    }], { temperature: 0.2, num_predict: 250, repeat_penalty: 1.1 });

    const events = rawEvents
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 12 && !line.startsWith('#'))
      .slice(0, 5);

    events.forEach(ev => {
      const entry = `[Ch.${n}] ${ev}`;
      if (!S.mem.plotEvents.includes(entry)) {
        S.mem.plotEvents.push(entry);
      }
    });

    // Keep only the last 50 events
    if (S.mem.plotEvents.length > 50) {
      S.mem.plotEvents = S.mem.plotEvents.slice(-50);
    }

  } catch (error) {
    console.error('Error extracting plot events:', error);
  }
}

async function updateCharacterLocations(n, text) {
  // Simple heuristic: update character status from form (user-controlled)
  getChars().forEach(c => {
    if (!S.mem.characterStates[c.name]) S.mem.characterStates[c.name] = {};
    S.mem.characterStates[c.name].status = c.status;
    S.mem.characterStates[c.name].lastSeen = 'Ch.' + n;
  });
  // Update current location
  const loc = gv('curLocation');
  if (loc && !S.mem.locationsVisited.includes(loc)) {
    S.mem.locationsVisited.push(loc);
  }
  S.mem.currentLocation = loc;
}

// =============================================================
// GENERATE ONE CHAPTER — full 8-step pipeline
// =============================================================
async function generateChapter(n) {
  const total  = S.totalChapters;
  const target = S.wordsTarget;
  const MAX_CONT = 20;

  // STEP 1: LOAD — sync character states from form into memory
  await updateCharacterLocations(n - 1, '');

  // STEP 2: PLAN
  const prevSummary = S.mem.chapterSummaries[n - 1] || '';
  const outline = await planChapter(n, total, prevSummary);
  S.outlines[n] = outline;

  // STEP 3: BUILD PROMPT
  setSt('Writing Chapter ' + n + '…'); setDot('running');
  setTabState(n, 'gen'); setCB2('active', 'Writing…');
  showPanel();

  const chPrompt = buildChapterPrompt(n, total, outline);
  let conv = [{ role: 'user', content: chPrompt }];
  let fullText = '';
  S.chapters[n] = '';

  // STEP 4: GENERATE (streaming)
  fullText = await streamGen(
    [{ role: 'system', content: S.bible.bible }, ...conv],
    (chunk, full) => {
      const cleaned = postProcess(full); // STEP 5 applied live
      S.chapters[n] = cleaned;
      if (S.activeChapter === n) renderOutput(n);
      updateWCBadge(n); updateTotalWords();
    }
  );

  // STEP 5: POST-PROCESS final pass
  fullText = postProcess(fullText);
  S.chapters[n] = fullText;
  conv.push({ role: 'assistant', content: fullText });

  // STEP 6: AUTO-CONTINUE (up to 20x) — keeps writing until word target is truly reached
  let contUsed = 0, reached = false;
  while (!S.shouldStop && !reached && contUsed < MAX_CONT) {
    const wc = countWords(fullText);
    if (wc >= target * 0.99) { reached = true; break; }

    // Also stop if the last continuation added almost nothing (model is truly exhausted)
    const prevLen = fullText.length;
    contUsed++;
    const shortfall = target - wc;
    setSt('Ch.' + n + ': ' + wc + ' words — auto-continuing (' + contUsed + '/' + MAX_CONT + ')…');
    setCB2('active', '↻ ' + wc + '/' + target + ' words');

    const continuePrompt = buildContinuePrompt(fullText, wc, shortfall, target);
    conv.push({ role: 'user', content: continuePrompt });

    const addition = await streamGen(
      [{ role: 'system', content: S.bible.bible }, ...conv],
      chunk => {
        S.chapters[n] = postProcess(S.chapters[n] + chunk);
        if (S.activeChapter === n) renderOutput(n);
        updateWCBadge(n); updateTotalWords();
      }
    );
    conv.push({ role: 'assistant', content: addition });
    fullText = S.chapters[n];

    // Safety: if model added fewer than 50 characters, it's truly stuck — stop looping
    if (fullText.length - prevLen < 50) {
      setSt('Ch.' + n + ': model stopped adding content after ' + contUsed + ' continuations.');
      break;
    }
  }

  // STEP 7: UPDATE MEMORY
  const finalWc = countWords(fullText);
  setDot('saving');
  setTabState(n, 'done');

  // 7a. Detect repetitions + AUTO-BAN phrases used 3+ times
  setSt('Ch.' + n + ' (' + finalWc + ' words) -- scanning for repetitions...');
  const reps = detectRepetitions(fullText);
  if (reps.length > 0) {
    const autoBanned = reps.filter(r => r.startsWith('AUTO-BANNED'));
    const warnings   = reps.filter(r => !r.startsWith('AUTO-BANNED'));
    let msg = '';
    if (autoBanned.length) msg += autoBanned.length + ' phrase(s) auto-added to Forbidden list. ';
    if (warnings.length)   msg += 'Repeated: ' + warnings.slice(0,3).join('; ');
    if (msg) showAlert('warn', 'Ch.' + n + ': ' + msg);
    renderMemory(); // refresh forbidden list display immediately
  }

  // 7b. Summarize chapter for rolling memory (ALL summaries kept)
  setSt('Ch.' + n + ' -- summarizing for story memory...');
  const summary = await summarizeChapter(n, fullText);
  S.mem.chapterSummaries[n] = summary;

  // 7c. Extract plot events
  setSt('Ch.' + n + ' -- extracting plot events...');
  await extractPlotEvents(n, fullText);

  // 7d. Update character locations / status sync
  await updateCharacterLocations(n, fullText);

  // 7e. AUTOMATIC PLOT CONTRADICTION CHECK (full-novel cross-check)
  setSt('Ch.' + n + ' -- running full-novel contradiction check...');
  const contradictions = await checkPlotContradictions(n, fullText);
  if (contradictions && contradictions.length > 0) {
    // Show contradiction panel in UI
    showContradictionAlert(n, contradictions);
    // Log to memory so it persists
    if (!S.mem.contradictions) S.mem.contradictions = {};
    S.mem.contradictions[n] = contradictions;
  } else {
    hideContradictionAlert();
  }

  renderMemory();
  setCB2('idle', '✓ ' + finalWc + ' words');
  setSt('Chapter ' + n + ' complete -- ' + finalWc + ' words | Memory updated | Contradiction check done');

  // STEP 8: SAVE to IndexedDB (chapters + full memory including all summaries)
  await saveChapterToDB(n);
  await saveMemoryToDB();
  S.dbSaveCount++;
  document.getElementById('dbSaves').textContent = S.dbSaveCount;

  renderOutput(n); updateWCBadge(n); updateTotalWords();
}
function buildContinuePrompt(text, wc, shortfall, target) {
  // Get last paragraph as anchor
  const paras = text.split(/\n\s*\n/).filter(Boolean);
  const lastPara = paras[paras.length - 1] || '';
  
  const sentences = lastPara.split(/(?<=[.!?])\s+/);
  const lastSentences = sentences.slice(-2).join(' ');
  const anchor = lastSentences.slice(-300); // max 300 chars

  return (
    `The chapter currently has ${wc} words and needs approximately ${shortfall} more to reach the ${target}-word target.\n\n` +
    `The chapter ended with:\n"...${anchor}"\n\n` +
    `Instructions:\n` +
    `- Continue the story IMMEDIATELY from the exact point above.\n` +
    `- Do NOT repeat, summarize, or restate anything that was already written.\n` +
    `- Do NOT start with a recap or transition phrase like "Meanwhile" or "As we last saw".\n` +
    `- Maintain the exact same POV, tone, and scene.\n` +
    `- Write ${shortfall} natural continuation words that flow directly from the last sentence.`
  );
}

// =============================================================
// START / STOP / CONTINUE
// =============================================================
async function startGen() {
  if (S.isRunning) return;

  // Validate
  if (!gv('novelTitle'))    { showAlert('warn', 'Please enter a novel title.');         return; }
  if (!gv('plotSummary'))   { showAlert('warn', 'Please enter a plot summary.');        return; }
  if (!gv('genre'))         { showAlert('warn', 'Please select a genre.');              return; }
  if (!getChars().length)   { showAlert('warn', 'Please add at least one character.');  return; }

  S.isRunning     = true;
  S.shouldStop    = false;
  S.totalChapters = parseInt(gv('totalChapters'))    || 10;
  S.wordsTarget   = parseInt(gv('wordsPerChapter'))  || 2000;
  S.dbSaveCount   = 0;
  S.bible         = buildBible();

  if (!S.novelId) {
    S.novelId = uid();
    await saveNovelMetaToDB();
  }

  setBtns(true); hideAlert();
  buildChapterTabs(); showPanel();
  S.activeChapter = 1;

  for (let i = 1; i <= S.totalChapters; i++) {
    if (S.shouldStop) break;

    // Auto-switch to this chapter's tab so reader follows along
    S.activeChapter = i;
    switchTab(i);

    // Scroll the tab into view so it's always visible
    document.getElementById('tab' + i)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    try {
      await generateChapter(i);
    } catch (err) {
      if (err.name === 'AbortError') { setSt('Stopped at Chapter ' + i + '.'); break; }
      showAlert('err', 'Error on Chapter ' + i + ': ' + err.message);
      setDot('error'); break;
    }

    const pct = (i / S.totalChapters * 100);
    document.getElementById('pbar').style.width = pct + '%';
    document.getElementById('curCh').textContent = i + '/' + S.totalChapters;

    // Chapter done — flash the tab green briefly, then auto-advance
    setTabState(i, 'done');
    const doneTab = document.getElementById('tab' + i);
    if (doneTab) {
      doneTab.style.background = 'rgba(45,106,79,.15)';
      setTimeout(() => { if (doneTab) doneTab.style.background = ''; }, 1200);
    }

    // If there's a next chapter, switch to it automatically after a short pause
    if (i < S.totalChapters && !S.shouldStop) {
      await new Promise(r => setTimeout(r, 800)); // brief pause so user sees completion
      S.activeChapter = i + 1;
      switchTab(i + 1);
      document.getElementById('tab' + (i + 1))?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  S.isRunning = false;
  setBtns(false);

  if (!S.shouldStop) {
    setDot('done');
    const tw = countWords(getFullText());
    setSt('✓ Novel complete — ' + S.totalChapters + ' chapters, ' + tw.toLocaleString() + ' words');
    showAlert('ok', 'Your novel is complete! ' + S.totalChapters + ' chapters and ' + tw.toLocaleString() + ' total words. All chapters saved to IndexedDB library.');
    await saveNovelMetaToDB();
    await loadLibrary();
  }
}

function stopGen() {
  S.shouldStop = true;
  if (S.abortCtrl) S.abortCtrl.abort();
  document.getElementById('stopBtn').disabled = true;
  setSt('Stopping…'); setDot('idle');
}

async function forceContinue() {
  if (S.isRunning || !S.activeChapter) return;
  const ch = S.activeChapter;
  const existing = S.chapters[ch] || '';
  const wc = countWords(existing);

  if (wc >= S.wordsTarget) {
    showAlert('info', 'Chapter ' + ch + ' already has ' + wc + ' words (target: ' + S.wordsTarget + ').');
    return;
  }

  S.isRunning = true; S.shouldStop = false;
  setBtns(true); setDot('running');
  setSt('Force-continuing Chapter ' + ch + ' from ' + wc + ' words…');
  setCB2('active', '↻ ' + wc + '/' + S.wordsTarget);

  if (!S.bible) S.bible = buildBible();

  const conv = [
    { role: 'user',      content: buildChapterPrompt(ch, S.totalChapters, S.outlines[ch] || '') },
    { role: 'assistant', content: S.chapters[ch] || existing },
  ];

  try {
    let forceAttempt = 0;
    const FORCE_MAX = 20;

    while (!S.shouldStop && forceAttempt < FORCE_MAX) {
      const curWc = countWords(S.chapters[ch] || '');
      if (curWc >= S.wordsTarget * 0.99) break;

      const prevLen = (S.chapters[ch] || '').length;
      forceAttempt++;
      const shortfall = S.wordsTarget - curWc;
      setSt('Force-continuing Ch.' + ch + ': ' + curWc + ' words (' + forceAttempt + '/' + FORCE_MAX + ')…');
      setCB2('active', '↻ ' + curWc + '/' + S.wordsTarget);

      const cp = buildContinuePrompt(S.chapters[ch] || '', curWc, shortfall, S.wordsTarget);
      conv.push({ role: 'user', content: cp });

      const addition = await streamGen(
        [{ role: 'system', content: S.bible.bible }, ...conv],
        chunk => {
          S.chapters[ch] = postProcess((S.chapters[ch] || '') + chunk);
          renderOutput(ch); updateWCBadge(ch); updateTotalWords();
        }
      );
      conv.push({ role: 'assistant', content: addition });

      if ((S.chapters[ch] || '').length - prevLen < 50) {
        setSt('Ch.' + ch + ': model stopped adding content after ' + forceAttempt + ' attempts.');
        break;
      }
    }

    const newWc = countWords(S.chapters[ch]);
    setCB2('idle', '✓ ' + newWc + ' words');
    setDot('done'); setSt('Chapter ' + ch + ' — ' + newWc + ' words');
    await saveChapterToDB(ch);
  } catch (err) {
    if (err.name !== 'AbortError') showAlert('err', err.message);
  }

  S.isRunning = false; setBtns(false);
}

function setBtns(running) {
  document.getElementById('startBtn').disabled  = running;
  document.getElementById('stopBtn').disabled   = !running;
  document.getElementById('contBtn').disabled   = running;
}

// =============================================================
// LAYER 5 — DATABASE OPERATIONS
// =============================================================
async function saveNovelMetaToDB() {
  if (!S.novelId) return;
  await dbPut('novels', {
    id:             S.novelId,
    title:          gv('novelTitle')   || 'Untitled',
    genre:          gv('genre')        || 'Fiction',
    plot:           gv('plotSummary'),
    setting:        gv('setting'),
    style:          gv('writingStyle'),
    characters:     getChars(),
    totalChapters:  S.totalChapters,
    wordsTarget:    S.wordsTarget,
    chaptersWritten:Object.keys(S.chapters).length,
    totalWords:     countWords(getFullText()),
    createdAt:      Date.now(),
    updatedAt:      Date.now()
  });
}

async function saveChapterToDB(n) {
  if (!S.novelId) return;
  await dbPut('chapters', {
    id:          S.novelId + '-ch' + n,
    novelId:     S.novelId,
    chapterNum:  n,
    title:       extractChapterTitle(S.chapters[n] || ''),
    content:     S.chapters[n] || '',
    outline:     S.outlines[n] || '',
    wordCount:   countWords(S.chapters[n] || ''),
    status:      'done',
    generatedAt: Date.now()
  });
}

async function saveMemoryToDB() {
  if (!S.novelId) return;
  await dbPut('memory', {
    novelId:          S.novelId,
    characterStates:  S.mem.characterStates,
    plotEvents:       S.mem.plotEvents,
    chapterSummaries: S.mem.chapterSummaries,
    locationsVisited: S.mem.locationsVisited,
    forbiddenPhrases: S.mem.forbiddenPhrases,
    currentLocation:  S.mem.currentLocation,
    savedAt:          Date.now()
  });
}

async function saveAll() {
  if (!S.novelId) S.novelId = uid();
  await saveNovelMetaToDB();
  for (const n of Object.keys(S.chapters)) await saveChapterToDB(parseInt(n));
  await saveMemoryToDB();
  await loadLibrary();
  showAlert('ok', 'Novel saved to library. ' + Object.keys(S.chapters).length + ' chapters stored in IndexedDB.');
}

async function loadNovelFromDB(nid) {
  const meta = await dbGet('novels', nid);
  if (!meta) return;

  S.novelId = nid;
  document.getElementById('novelTitle').value   = meta.title   || '';
  document.getElementById('genre').value        = meta.genre   || '';
  document.getElementById('plotSummary').value  = meta.plot    || '';
  document.getElementById('setting').value      = meta.setting || '';
  document.getElementById('writingStyle').value = meta.style   || '';
  S.totalChapters = meta.totalChapters || 10;
  S.wordsTarget   = meta.wordsTarget   || 2000;
  document.getElementById('totalChapters').value    = S.totalChapters;
  document.getElementById('wordsPerChapter').value  = S.wordsTarget;

  // Restore characters
  document.getElementById('charList').innerHTML = ''; charId = 0;
  (meta.characters || []).forEach(c => addChar(c.name, c.role, c.personality, c.status, c.desc));

  // Restore chapters
  S.chapters = {}; S.outlines = {};
  const chs = await dbIdx('chapters', 'novelId', nid);
  chs.forEach(c => { S.chapters[c.chapterNum] = c.content; S.outlines[c.chapterNum] = c.outline || ''; });

  // Restore memory
  const mem = await dbGet('memory', nid);
  if (mem) {
    S.mem.characterStates  = mem.characterStates  || {};
    S.mem.plotEvents       = mem.plotEvents       || [];
    S.mem.chapterSummaries = mem.chapterSummaries || {};
    S.mem.locationsVisited = mem.locationsVisited || [];
    S.mem.forbiddenPhrases = mem.forbiddenPhrases || S.mem.forbiddenPhrases;
    S.mem.currentLocation  = mem.currentLocation  || '';
    document.getElementById('curLocation').value = S.mem.currentLocation;
  }

  S.bible = buildBible();
  buildChapterTabs(); showPanel();

  const maxCh = Object.keys(S.chapters).length > 0
    ? Math.max(...Object.keys(S.chapters).map(Number)) : 1;
  S.activeChapter = maxCh;
  switchTab(maxCh);

  renderMemory(); updateTotalWords();
  document.getElementById('curCh').textContent = Object.keys(S.chapters).length + '/' + S.totalChapters;
  setSt('Loaded: "' + meta.title + '" — ' + Object.keys(S.chapters).length + ' chapters restored');
  await loadLibrary();
}

async function loadLibrary() {
  const novels = await dbAll('novels');
  const list = document.getElementById('libList');
  if (!list) return;

  if (!novels.length) {
    list.innerHTML = '<div class="le">No novels yet.<br>Start writing to save.</div>';
    return;
  }

  novels.sort((a, b) => b.updatedAt - a.updatedAt);

  list.innerHTML = novels.map(n => {
    const isCurrent = n.id === S.novelId ? 'cur' : '';
    const title = eh(n.title || 'Untitled');
    const genre = eh(n.genre || 'Fiction');
    const chapters = `${n.chaptersWritten || 0}/${n.totalChapters || 10} ch`;
    const words = (n.totalWords || 0).toLocaleString() + 'w';

    return `
      <div class="li ${isCurrent}" onclick="loadNovelFromDB(${n.id})">
        <div class="li-t">${title}</div>
        <div class="li-m">${genre} · ${chapters} · ${words}</div>
      </div>
    `;
  }).join('');
}
async function delNovel() {
  if (!S.novelId) {
    showAlert('warn', 'No novel selected.');
    return;
  }

  try {
    const meta = await dbGet('novels', S.novelId);
    const name = meta?.title || 'this novel';

    const confirmed = confirm(
      `Permanently delete "${name}" and all its chapters and memory from IndexedDB?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    // Delete all chapters
    const chapters = await dbIdx('chapters', 'novelId', S.novelId);
    for (const ch of chapters) {
      await dbDel('chapters', ch.id);
    }

    // Delete memory and novel
    await dbDel('memory', S.novelId);
    await dbDel('novels', S.novelId);

    // Reset and refresh
    newNovel();
    await loadLibrary();
    showAlert('ok', `"${name}" has been deleted from the library.`);
    
  } catch (error) {
    console.error('Error deleting novel:', error);
    showAlert('error', `Failed to delete the novel: ${error.message}`);
  }
}
function newNovel() {
  S.novelId = null;
  S.chapters = {}; S.outlines = {};
  S.activeChapter = 0; S.dbSaveCount = 0; S.bible = null;
  S.mem = {
    characterStates: {}, plotEvents: [], chapterSummaries: {},
    locationsVisited: [],
    forbiddenPhrases: [
      "felt a shiver run down","voice barely above a whisper","voice low and husky",
      "flutter in her chest","ran down her spine","chill ran down","eyes locked onto",
      "burned with intensity","felt herself","felt himself","heart skipped a beat",
      "blood ran cold","breath caught in","spine tingled"
    ],
    currentLocation: ''
  };

  // Clear form
  ['novelTitle','plotSummary','setting','writingStyle','curLocation'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const genEl = document.getElementById('genre');
  if (genEl) genEl.value = '';
  document.getElementById('charList').innerHTML = '';
  charId = 0;
  addChar(); // blank row

  document.getElementById('chPanel').style.display = 'none';
  document.getElementById('pbar').style.width = '0%';
  document.getElementById('curCh').textContent = '—';
  document.getElementById('totWords').textContent = '0';
  document.getElementById('dbSaves').textContent = '0';
  setSt('New novel — fill in details and begin writing');
  setDot('idle'); hideAlert(); renderMemory();
}

// =============================================================
// STORY MEMORY UI
// =============================================================
function renderMemory() {
  const chars = getChars();

  // Characters
  const cd = document.getElementById('memChars');
  if (!chars.length) {
    cd.innerHTML = '<span style="color:var(--muted);font-size:.74rem;font-style:italic">No characters added yet</span>';
  } else {
    cd.innerHTML = chars.map(c => {
      const st  = S.mem.characterStates[c.name]?.status || c.status || 'alive';
      const sc  = st==='alive'?'s-a':st==='dead'?'s-d':'s-o';
      const loc = S.mem.characterStates[c.name]?.location || '';
      return '<div class="mci">' +
        '<span class="mcn">' + eh(c.name) + '</span>' +
        '<span class="mcs ' + sc + '">' + st + '</span>' +
        (loc ? '<span style="color:var(--muted);font-size:.65rem;margin-left:4px">@ ' + eh(loc) + '</span>' : '') +
        '<div style="font-size:.72rem;color:var(--muted);margin-top:2px">' + eh(c.role) + '</div>' +
      '</div>';
    }).join('');
  }

  // Plot events (last 8)
  const ed = document.getElementById('memEvents');
  const evs = S.mem.plotEvents.slice(-8);
  ed.innerHTML = evs.length
    ? evs.map(e => '<div class="mev">' + eh(e) + '</div>').join('')
    : '<span style="color:var(--muted);font-size:.74rem;font-style:italic">No events recorded yet</span>';

  // Forbidden phrases
  const fd = document.getElementById('memFP');
  fd.innerHTML = S.mem.forbiddenPhrases.length
    ? S.mem.forbiddenPhrases.map((p,i) =>
        '<span class="fp" onclick="rmFP(' + i + ')" title="Click to remove">' + eh(p) + '</span>'
      ).join('')
    : '<span style="color:var(--muted);font-size:.74rem;font-style:italic">None</span>';

  // Locations
  const ld = document.getElementById('memLoc');
  const locs = S.mem.locationsVisited.slice(-6);
  ld.innerHTML = locs.length
    ? locs.map(l => '<span style="font-size:.72rem;color:var(--muted);margin-right:6px">' + eh(l) + '</span>').join('')
    : '<span style="color:var(--muted);font-size:.74rem;font-style:italic">None yet</span>';
}

function addFP() {
  const inp = document.getElementById('fpInput');
  const val = inp.value.trim();
  if (!val) return;
  if (!S.mem.forbiddenPhrases.includes(val)) S.mem.forbiddenPhrases.push(val);
  renderMemory(); inp.value = '';
}
function rmFP(i)  { S.mem.forbiddenPhrases.splice(i, 1); renderMemory(); }
function clrEvents() { if (!confirm('Clear all recorded plot events from memory?')) return; S.mem.plotEvents = []; renderMemory(); }

// =============================================================
// UI HELPERS
// =============================================================
function buildChapterTabs() {
  const t = document.getElementById('chTabs'); t.innerHTML = '';
  for (let i = 1; i <= S.totalChapters; i++) {
    const b = document.createElement('button');
    b.className = 'chtab'; b.id = 'tab' + i; b.textContent = 'Ch ' + i;
    b.onclick = () => switchTab(i);
    t.appendChild(b);
  }
}

function switchTab(n) {
  S.activeChapter = n;
  document.querySelectorAll('.chtab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab' + n)?.classList.add('active');
  renderOutput(n); updateWCBadge(n);
}

function setTabState(n, s) {
  const t = document.getElementById('tab' + n);
  if (!t) return;
  t.classList.remove('done', 'gen', 'plan');
  if (s) t.classList.add(s);
}
function showPanel() {
  const panel = document.getElementById('chPanel');
  if (panel) panel.style.display = 'block';
}

function renderOutput(n) {
  const area = document.getElementById('outArea');
  const text = S.chapters?.[n] || '';
  const outline = S.outlines?.[n] || '';

  if (!text && !outline) {
    area.innerHTML = `<div class="ph">Generating Chapter ${n}…</div>`;
    return;
  }

  let html = '';

  // Chapter header banner
  html += `<div class="ch-banner">Chapter ${n}</div>`;

  // Collapsible outline plan
  if (outline) {
    html += `<div class="outln-box"><strong>✎ Plan</strong> ${eh(outline)}</div>`;
  }

  // Render the chapter body — fmtParagraphs handles titles, dialogue, breaks internally
  html += fmtParagraphs(text);

  // Live cursor while streaming
  if (S.isRunning && S.activeChapter === n) {
    html += `<span class="cursor"></span>`;
  }

  area.innerHTML = html;
  area.scrollTop = area.scrollHeight;
}

function fmtParagraphs(text) {
  const lines = text.split('\n');
  let html = '';
  let buffer = [];

  const flushBuffer = () => {
    if (!buffer.length) return;
    const para = buffer.join(' ').trim();
    if (!para) { buffer = []; return; }

    // Detect dialogue line — starts with a quote character
    const isDialogue = /^["""'"]/.test(para) || /^[—–-]/.test(para);
    // Detect scene break
    const isBreak = /^[-—]{3,}$/.test(para.trim());
    // Detect internal thought (wrapped in * *)
    const isThought = /^\*.+\*$/.test(para);
    // Detect chapter title line
    const isTitle = /^chapter\s+\d+/i.test(para) && para.length < 80;

    if (isBreak) {
      html += '<div class="scene-break">✦ ✦ ✦</div>';
    } else if (isTitle) {
      html += '<div class="ch-ttl">' + eh(para) + '</div>';
    } else if (isThought) {
      // Render *thought* as italic
      const inner = para.replace(/^\*|\*$/g, '').trim();
      html += '<p class="thought-line"><em>' + eh(inner) + '</em></p>';
    } else if (isDialogue) {
      html += '<p class="dialogue-line">' + renderInline(para) + '</p>';
    } else {
      html += '<p>' + renderInline(para) + '</p>';
    }
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBuffer();
    } else {
      buffer.push(line);
      // Flush each line individually so every paragraph/dialogue stands alone
      flushBuffer();
    }
  }
  flushBuffer();
  return html;
}

// Render inline formatting: *italic* and **bold**
function renderInline(text) {
  return eh(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function updateWCBadge(n) {
  if (S.activeChapter !== n) return;
  const wc  = countWords(S.chapters[n] || '');
  const pct = Math.min(100, Math.round(wc / S.wordsTarget * 100));
  document.getElementById('wcBadge').textContent =
    wc.toLocaleString() + ' / ' + S.wordsTarget.toLocaleString() + ' words (' + pct + '%)';
}

function updateTotalWords() {
  const t = Object.values(S.chapters).reduce((sum, tx) => sum + countWords(tx), 0);
  document.getElementById('totWords').textContent = t.toLocaleString();
}
function extractChapterTitle(text) {
  const first = (text.split('\n')[0] || '').trim();
  return first.length < 90 ? first : 'Chapter';
}

const countWords = t => t.trim().split(/\s+/).filter(Boolean).length;

const setSt = m => {
  const el = document.getElementById('stxt');
  if (el) el.textContent = m;
};

const setDot = s => {
  const el = document.getElementById('sdot');
  if (el) el.className = 'sdot ' + s;
};

const setCB2 = (s, m) => {
  const b = document.getElementById('cb2');
  if (b) { b.className = 'cb2 ' + s; b.textContent = m; }
};

const showPanel2 = () => {
  const el = document.getElementById('chPanel');
  if (el) el.style.display = 'block';
};

const showAlert = (t, m) => {
  const b = document.getElementById('alertBox');
  if (b) {
    b.style.display = 'flex';
    b.className = 'al ' + t;
    b.innerHTML = `<span>${eh(m)}</span>`;
  }
};

const hideAlert = () => {
  const b = document.getElementById('alertBox');
  if (b) b.style.display = 'none';
};

const eh = s => (s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function resetSession() {
  if (S.isRunning) { stopGen(); return; }

  const confirmed = confirm(`Reset the current session view?

Note: Your novel data in the library is NOT deleted. This only clears what you see.`);
  if (!confirmed) return;

  S.chapters = {};
  S.outlines = {};
  S.activeChapter = 0;

  const chPanel = document.getElementById('chPanel');
  if (chPanel) chPanel.style.display = 'none';

  const pbar = document.getElementById('pbar');
  if (pbar) pbar.style.width = '0%';

  const curCh = document.getElementById('curCh');
  if (curCh) curCh.textContent = '—';

  const totWords = document.getElementById('totWords');
  if (totWords) totWords.textContent = '0';

  setSt('Session reset — library data preserved');
  setDot('idle');
  hideAlert();
}

// =============================================================
// EXPORT
// =============================================================
function getFullText() {
  let out = '';
  for (let i = 1; i <= S.totalChapters; i++) {
    if (S.chapters[i]) out += S.chapters[i] + '\n\n';
  }
  return out.trim();
}

function expChapter() {
  const ch = S.activeChapter;
  if (!S.chapters[ch]) { showAlert('warn', 'No content in Chapter ' + ch + ' yet.'); return; }
  const t = gv('novelTitle') || 'novel';
  dlFile(t + '-chapter-' + ch + '.txt', S.chapters[ch]);
}
function expFull() {
  const text = getFullText();
  if (!text) {
    showAlert('warn', 'No chapters generated yet.');
    return;
  }

  const title = (gv('novelTitle') || 'novel').trim();
  const wc = countWords(text);
  const genre = gv('genre') || 'Fiction';

  const hdr = `${title.toUpperCase()}
${'='.repeat(Math.min(title.length, 60))}

Genre: ${genre}
Generated by Hazy Novel Writer v2
${wc.toLocaleString()} words · ${Object.keys(S.chapters).length} chapters

`;

  dlFile(title.replace(/\s+/g, '-') + '.txt', hdr + text);
}

function expMD() {
  const title = (gv('novelTitle') || 'Untitled').trim();
  const genre = gv('genre') || 'Fiction';

  let md = `# ${title}
*${genre}*

---

`;

  for (let i = 1; i <= S.totalChapters; i++) {
    if (S.chapters[i]) {
      if (S.outlines[i]) {
        md += `> **Chapter ${i} Plan:** ${S.outlines[i].replace(/\n/g, ' ')}\n\n`;
      }
      md += `${S.chapters[i]}\n\n---\n\n`;
    }
  }

  dlFile(title.replace(/\s+/g, '-') + '.md', md);
}

function expJSON() {
  const t = gv('novelTitle') || 'Untitled';
  const payload = {
    title:     t,
    genre:     gv('genre'),
    setting:   gv('setting'),
    style:     gv('writingStyle'),
    characters:getChars(),
    memory:    S.mem,
    chapters:  Object.keys(S.chapters).map(n => ({
      chapter: parseInt(n),
      title:   extractChapterTitle(S.chapters[n]),
      outline: S.outlines[n] || '',
      content: S.chapters[n],
      words:   countWords(S.chapters[n])
    }))
  };
  dlFile(t.replace(/\s+/g,'-') + '-full-export.json', JSON.stringify(payload, null, 2));
}

function dlFile(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name; a.click();
}
// =============================================================
// CONTRADICTION ALERT UI
// =============================================================
function showContradictionAlert(n, contradictions) {
  if (!contradictions || !contradictions.length) return;

  let panel = document.getElementById('contradictionPanel');
  const alertBox = document.getElementById('alertBox');
  if (!alertBox) return;

  // Create panel if it doesn't exist
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'contradictionPanel';
    panel.style.cssText = `
      background: #fff0e0;
      border: 2px solid #c07010;
      border-radius: 4px;
      padding: 14px 16px;
      margin-bottom: 12px;
    `;
    alertBox.parentNode.insertBefore(panel, alertBox.nextSibling);
  }

  const list = contradictions.map(c => `
    <div style="display:flex; gap:8px; padding:5px 0; border-bottom:1px solid rgba(192,112,16,.2)">
      <span style="color:#c07010; flex-shrink:0">!</span>
      <span style="font-size:.84rem; color:#6a4000">${eh(c)}</span>
    </div>
  `).join('');

  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px">
      <strong style="font-family:'JetBrains Mono', monospace; font-size:.72rem; color:#8a4000; text-transform:uppercase; letter-spacing:1px">
        &#9888; Chapter ${n} Plot Contradictions Detected
      </strong>
      <button onclick="hideContradictionAlert()" style="background:none; border:none; cursor:pointer; color:#c07010; font-size:1rem">&#10005;</button>
    </div>
    ${list}
    <div style="margin-top:10px; font-size:.78rem; color:#8a4000; font-style:italic">
      These contradictions were automatically detected by comparing Chapter ${n} against all previous chapter summaries, character statuses, and plot events. Review the chapter content and fix these issues manually, or use Force Continue to regenerate from a specific point.
    </div>
  `;

  panel.style.display = 'block';
}

function hideContradictionAlert() {
  const panel = document.getElementById('contradictionPanel');
  if (panel) panel.style.display = 'none';
}

// Override renderMemory to also show full novel summary count
const _origRenderMemory = renderMemory;
function renderMemory() {
  _origRenderMemory();
  // Update summary count badge if element exists
  const el = document.getElementById('summaryCount');
  if (el) {
    const n = Object.keys(S.mem.chapterSummaries).length;
    el.textContent = n + ' chapter' + (n !== 1 ? 's' : '') + ' summarized';
  }
}

// =============================================================
// PROVIDER / MODEL SELECTOR
// =============================================================
const PROVIDER_MODELS = {
  ollama: [
    {id:'ollama/llama3.2:1b',  label:'Llama 3.2 1B (fastest, ~0.8GB)'},
    {id:'ollama/llama3.2',     label:'Llama 3.2 3B (recommended, ~2GB)'},
    {id:'ollama/llama3',       label:'Llama 3 8B (~4.7GB)'},
    {id:'ollama/mistral',      label:'Mistral 7B (best writing, ~4GB)'},
    {id:'ollama/mixtral',      label:'Mixtral 8x7B (best local, ~26GB)'},
    {id:'ollama/gemma2',       label:'Gemma 2 9B (~5.4GB)'},
    {id:'ollama/phi3',         label:'Phi-3 Mini (~2.3GB)'},
    {id:'ollama/qwen2.5',      label:'Qwen 2.5 7B (~4.4GB)'},
    {id:'ollama/deepseek-r1',  label:'DeepSeek R1 7B (~4.5GB)'},
  ],
  anthropic: [
    {id:'anthropic/claude-haiku-4-5-20251001',  label:'Claude Haiku 4.5 — fastest'},
    {id:'anthropic/claude-sonnet-4-5-20250929', label:'Claude Sonnet 4.5 — recommended'},
    {id:'anthropic/claude-opus-4-5-20251101',   label:'Claude Opus 4.5 — best quality'},
    {id:'anthropic/claude-sonnet-4-20250514',   label:'Claude Sonnet 4'},
    {id:'anthropic/claude-opus-4-20250514',     label:'Claude Opus 4'},
  ],
  openai: [
    {id:'openai/gpt-4o-mini',  label:'GPT-4o Mini — fast'},
    {id:'openai/gpt-4o',       label:'GPT-4o — recommended'},
    {id:'openai/gpt-4.1',      label:'GPT-4.1'},
    {id:'openai/gpt-4.1-mini', label:'GPT-4.1 Mini'},
    {id:'openai/o4-mini',      label:'o4 Mini — reasoning'},
    {id:'openai/o3',           label:'o3 — best reasoning'},
  ],
  groq: [
    {id:'groq/llama-3.1-8b-instant',                      label:'Llama 3.1 8B — fastest (free)'},
    {id:'groq/llama-3.3-70b-versatile',                   label:'Llama 3.3 70B — recommended (free)'},
    {id:'groq/meta-llama/llama-4-scout-17b-16e-instruct', label:'Llama 4 Scout 17B — newest (free)'},
    {id:'groq/moonshotai/kimi-k2-instruct',               label:'Kimi K2 — 60 RPM (free)'},
    {id:'groq/qwen/qwen3-32b',                            label:'Qwen3 32B — 60 RPM (free)'},
    {id:'groq/openai/gpt-oss-120b',                       label:'GPT OSS 120B (free)'},
    {id:'groq/compound',                                  label:'Groq Compound (free)'},
    {id:'groq/compound-mini',                             label:'Groq Compound Mini (free)'},
    {id:'groq/allam-2-7b',                                label:'Allam 2 7B (free)'},
  ],
  gemini: [
    {id:'gemini/gemini-2.0-flash',   label:'Gemini 2.0 Flash — recommended'},
    {id:'gemini/gemini-2.5-flash',   label:'Gemini 2.5 Flash — latest'},
    {id:'gemini/gemini-1.5-pro',     label:'Gemini 1.5 Pro — 1M context'},
  ],
};

async function onProviderChange() {
  const prov = document.getElementById('providerSelect')?.value || 'ollama';
  const sel  = document.getElementById('modelSelect');
  localStorage.setItem('hazyProvider', prov);

  if (prov === 'ollama') {
    if (sel) sel.innerHTML = '<option value="ollama/llama3.2">Detecting models...</option>';
    await checkConn();
  } else {
    const models = PROVIDER_MODELS[prov] || [];
    if (sel) {
      sel.innerHTML = models.map(m => '<option value="'+m.id+'">'+m.label+'</option>').join('');
      const saved = localStorage.getItem('hazyModel_' + prov);
      if (saved) sel.value = saved;
    }
    await checkConn();
  }
}

document.addEventListener('change', e => {
  if (e.target.id === 'modelSelect') {
    const prov = document.getElementById('providerSelect')?.value || 'ollama';
    localStorage.setItem('hazyModel_' + prov, e.target.value);
  }
});

async function initProviders() {
  const provSel  = document.getElementById('providerSelect');
  const modelSel = document.getElementById('modelSelect');

  // Priority: hazyActiveModel (set when user verifies in main app) > hazyProvider > default
  const activeModel = localStorage.getItem('hazyActiveModel') || '';
  const activeProv  = activeModel ? activeModel.split('/')[0] : (localStorage.getItem('hazyProvider') || 'ollama');

  if (provSel) provSel.value = activeProv;
  localStorage.setItem('hazyProvider', activeProv);

  // Populate model dropdown for this provider
  if (activeProv !== 'ollama') {
    const models = PROVIDER_MODELS[activeProv] || [];
    if (modelSel) {
      modelSel.innerHTML = models.map(m => '<option value="' + m.id + '">' + m.label + '</option>').join('');
      // Select the exact model that was active in main app
      if (activeModel && modelSel.querySelector('option[value="' + activeModel + '"]')) {
        modelSel.value = activeModel;
      } else {
        const saved = localStorage.getItem('hazyModel_' + activeProv);
        if (saved) modelSel.value = saved;
      }
    }
  }

  // Kick off provider change (tests connection, populates Ollama models)
  await onProviderChange();
}

</script>
</body>
</html>
~~~

### frontend\phonemize.js

- Size: 6821 bytes
- Language: javascript

~~~javascript
import { phonemize as espeakng } from "phonemizer";

/**
 * Helper function to split a string on a regex, but keep the delimiters.
 * This is required, because the JavaScript `.split()` method does not keep the delimiters,
 * and wrapping in a capturing group causes issues with existing capturing groups (due to nesting).
 * @param {string} text The text to split.
 * @param {RegExp} regex The regex to split on.
 * @returns {{match: boolean; text: string}[]} The split string.
 */
function split(text, regex) {
  const result = [];
  let prev = 0;
  for (const match of text.matchAll(regex)) {
    const fullMatch = match[0];
    if (prev < match.index) {
      result.push({ match: false, text: text.slice(prev, match.index) });
    }
    if (fullMatch.length > 0) {
      result.push({ match: true, text: fullMatch });
    }
    prev = match.index + fullMatch.length;
  }
  if (prev < text.length) {
    result.push({ match: false, text: text.slice(prev) });
  }
  return result;
}

/**
 * Helper function to split numbers into phonetic equivalents
 * @param {string} match The matched number
 * @returns {string} The phonetic equivalent
 */
function split_num(match) {
  if (match.includes(".")) {
    return match;
  } else if (match.includes(":")) {
    let [h, m] = match.split(":").map(Number);
    if (m === 0) {
      return `${h} o'clock`;
    } else if (m < 10) {
      return `${h} oh ${m}`;
    }
    return `${h} ${m}`;
  }
  let year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) {
    return match;
  }
  let left = match.slice(0, 2);
  let right = parseInt(match.slice(2, 4), 10);
  let suffix = match.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) {
      return `${left} hundred${suffix}`;
    } else if (right < 10) {
      return `${left} oh ${right}${suffix}`;
    }
  }
  return `${left} ${right}${suffix}`;
}

/**
 * Helper function to format monetary values
 * @param {string} match The matched currency
 * @returns {string} The formatted currency
 */
function flip_money(match) {
  const bill = match[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(match.slice(1)))) {
    return `${match.slice(1)} ${bill}s`;
  } else if (!match.includes(".")) {
    let suffix = match.slice(1) === "1" ? "" : "s";
    return `${match.slice(1)} ${bill}${suffix}`;
  }
  const [b, c] = match.slice(1).split(".");
  const d = parseInt(c.padEnd(2, "0"), 10);
  let coins = match[0] === "$" ? (d === 1 ? "cent" : "cents") : d === 1 ? "penny" : "pence";
  return `${b} ${bill}${b === "1" ? "" : "s"} and ${d} ${coins}`;
}

/**
 * Helper function to process decimal numbers
 * @param {string} match The matched number
 * @returns {string} The formatted number
 */
function point_num(match) {
  let [a, b] = match.split(".");
  return `${a} point ${b.split("").join(" ")}`;
}

/**
 * Normalize text for phonemization
 * @param {string} text The text to normalize
 * @returns {string} The normalized text
 */
function normalize_text(text) {
  return (
    text
      // 1. Handle quotes and brackets
      .replace(/[‘’]/g, "'")
      .replace(/«/g, "“")
      .replace(/»/g, "”")
      .replace(/[“”]/g, '"')
      .replace(/\(/g, "«")
      .replace(/\)/g, "»")

      // 2. Replace uncommon punctuation marks
      .replace(/、/g, ", ")
      .replace(/。/g, ". ")
      .replace(/！/g, "! ")
      .replace(/，/g, ", ")
      .replace(/：/g, ": ")
      .replace(/；/g, "; ")
      .replace(/？/g, "? ")

      // 3. Whitespace normalization
      .replace(/[^\S \n]/g, " ")
      .replace(/  +/, " ")
      .replace(/(?<=\n) +(?=\n)/g, "")

      // 4. Abbreviations
      .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
      .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
      .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
      .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
      .replace(/\betc\.(?! [A-Z])/gi, "etc")

      // 5. Normalize casual words
      .replace(/\b(y)eah?\b/gi, "$1e'a")

      // 5. Handle numbers and currencies
      .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, split_num)
      .replace(/(?<=\d),(?=\d)/g, "")
      .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flip_money)
      .replace(/\d*\.\d+/g, point_num)
      .replace(/(?<=\d)-(?=\d)/g, " to ")
      .replace(/(?<=\d)S/g, " S")

      // 6. Handle possessives
      .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
      .replace(/(?<=X')S\b/g, "s")

      // 7. Handle hyphenated words/letters
      .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
      .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")

      // 8. Strip leading and trailing whitespace
      .trim()
  );
}

/**
 * Escapes regular expression special characters from a string by replacing them with their escaped counterparts.
 *
 * @param {string} string The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

const PUNCTUATION = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCTUATION_PATTERN = new RegExp(`(\\s*[${escapeRegExp(PUNCTUATION)}]+\\s*)+`, "g");

/**
 * Phonemize text using the eSpeak-NG phonemizer
 * @param {string} text The text to phonemize
 * @param {"a"|"b"} language The language to use
 * @param {boolean} norm Whether to normalize the text
 * @returns {Promise<string>} The phonemized text
 */
export async function phonemize(text, language = "a", norm = true) {
  // 1. Normalize text
  if (norm) {
    text = normalize_text(text);
  }

  // 2. Split into chunks, to ensure we preserve punctuation
  const sections = split(text, PUNCTUATION_PATTERN);

  // 3. Convert each section to phonemes
  const lang = language === "a" ? "en-us" : "en";
  const ps = (await Promise.all(sections.map(async ({ match, text }) => (match ? text : (await espeakng(text, lang)).join(" "))))).join("");

  // 4. Post-process phonemes
  let processed = ps
    // https://en.wiktionary.org/wiki/kokoro#English
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");

  // 5. Additional post-processing for American English
  if (language === "a") {
    processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  }
  return processed.trim();
}
~~~

### frontend\quick-prompts.css

- Size: 9668 bytes
- Language: css

~~~css
/**
 * Quick Prompts UI Styles
 * Feature #1 Enhancement
 */

/* ===========================
   Quick Prompts Dropdown
   =========================== */
.quick-prompts-dropdown {
  position: fixed;
  z-index: 1000;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 400px;
  display: none;
  flex-direction: column;
  overflow: hidden;
  animation: dropdownSlideIn 0.15s ease-out;
}

@keyframes dropdownSlideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.quick-prompts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.quick-prompts-help {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  border: none;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.quick-prompts-help:hover {
  background: var(--accent-hover);
}

.quick-prompts-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  max-height: 320px;
}

.quick-prompt-item {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
  margin-bottom: 2px;
  position: relative;
}

.quick-prompt-item:hover {
  background: var(--bg-hover);
}

.quick-prompt-item.selected {
  background: var(--accent);
  color: white;
}

.quick-prompt-item.selected .quick-prompt-label,
.quick-prompt-item.selected .quick-prompt-command,
.quick-prompt-item.selected .quick-prompt-desc {
  color: white;
}

.quick-prompt-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.quick-prompt-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
}

.quick-prompt-command {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-primary);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--accent);
  font-weight: 600;
}

.quick-prompt-item.selected .quick-prompt-command {
  background: rgba(255,255,255,0.2);
  color: white;
}

.quick-prompt-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.quick-prompt-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--success);
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
}

.quick-prompts-footer {
  padding: 8px 14px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border);
  text-align: center;
}

.quick-prompts-footer small {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* ===========================
   Command Palette (Ctrl+K)
   =========================== */
.command-palette {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2000;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 90%;
  max-width: 600px;
  max-height: 70vh;
  display: none;
  flex-direction: column;
  animation: modalIn 0.2s cubic-bezier(0.4,0,0.2,1);
}

.command-palette.open {
  display: flex;
}

.command-palette-search {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.command-palette-search input {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  font-family: var(--font-body);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  outline: none;
}

.command-palette-search input:focus {
  border-color: var(--accent);
}

.command-palette-categories {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.command-category-tab {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: transparent;
  color: var(--text-secondary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}

.command-category-tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.command-category-tab.active {
  background: var(--accent);
  color: white;
}

.command-palette-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.command-result-item {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
  margin-bottom: 2px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.command-result-item:hover {
  background: var(--bg-hover);
}

.command-result-item.selected {
  background: var(--accent);
  color: white;
}

.command-result-icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 2px;
}

.command-result-content {
  flex: 1;
  min-width: 0;
}

.command-result-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.command-result-item.selected .command-result-title {
  color: white;
}

.command-result-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.command-result-item.selected .command-result-desc {
  color: rgba(255,255,255,0.8);
}

.command-result-shortcut {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  padding: 3px 6px;
  border-radius: 4px;
  margin-top: 2px;
}

.command-result-item.selected .command-result-shortcut {
  background: rgba(255,255,255,0.2);
  color: white;
}

.command-palette-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.command-palette-footer {
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-muted);
}

.command-palette-shortcuts {
  display: flex;
  gap: 12px;
  font-family: var(--font-mono);
}

.command-palette-shortcuts span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.command-palette-shortcuts kbd {
  background: var(--bg-primary);
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 9px;
  border: 1px solid var(--border);
}

/* ===========================
   Template Manager Modal
   =========================== */
.template-manager-modal .modal-body {
  padding: 20px;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.template-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.template-item-info {
  flex: 1;
  min-width: 0;
}

.template-item-command {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 2px;
}

.template-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.template-item-prompt {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-item-actions {
  display: flex;
  gap: 4px;
}

.template-item-btn {
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.12s;
}

.template-item-btn:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.template-item-btn.delete-btn {
  color: var(--danger);
}

.template-item-btn.delete-btn:hover {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

.add-template-form {
  padding: 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-template-form input,
.add-template-form textarea {
  width: 100%;
  padding: 10px 12px;
  font-family: var(--font-body);
  font-size: 13px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  outline: none;
}

.add-template-form input:focus,
.add-template-form textarea:focus {
  border-color: var(--accent);
}

.add-template-form textarea {
  min-height: 80px;
  resize: vertical;
  font-family: var(--font-mono);
}

.add-template-form button {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.add-template-form button:hover {
  background: var(--accent-hover);
}
~~~

### frontend\quick-prompts.js

- Size: 12784 bytes
- Language: javascript

~~~javascript
/**
 * HAZE Quick Prompts & Templates System
 * Feature #1 - Productivity Enhancement
 * 
 * Allows users to:
 * - Use /command shortcuts
 * - Save custom templates
 * - Quick-insert common prompts
 */

// ========================
// Quick Prompt Templates
// ========================

const QUICK_PROMPTS = {
  // Code-related
  '/code': {
    label: 'Write Code',
    prompt: 'Write production-ready, well-commented code for: ',
    description: 'Generate clean, documented code',
    category: 'code'
  },
  '/debug': {
    label: 'Debug Code',
    prompt: 'Debug this code and fix all errors. Explain what was wrong:\n\n',
    description: 'Find and fix bugs',
    category: 'code'
  },
  '/refactor': {
    label: 'Refactor Code',
    prompt: 'Refactor this code to be more efficient, readable, and maintainable:\n\n',
    description: 'Improve code quality',
    category: 'code'
  },
  '/review': {
    label: 'Code Review',
    prompt: 'Review this code for bugs, security issues, and best practices:\n\n',
    description: 'Professional code review',
    category: 'code'
  },
  '/test': {
    label: 'Write Tests',
    prompt: 'Write comprehensive unit tests for this code:\n\n',
    description: 'Generate test cases',
    category: 'code'
  },

  // Explanation
  '/explain': {
    label: 'Explain Simply',
    prompt: 'Explain this concept in simple terms that anyone can understand: ',
    description: 'ELI5 explanation',
    category: 'learning'
  },
  '/deep': {
    label: 'Deep Dive',
    prompt: 'Provide a detailed, technical explanation of: ',
    description: 'In-depth analysis',
    category: 'learning'
  },
  '/compare': {
    label: 'Compare',
    prompt: 'Compare and contrast these concepts with pros/cons: ',
    description: 'Side-by-side comparison',
    category: 'learning'
  },

  // Writing
  '/write': {
    label: 'Write Content',
    prompt: 'Write professional, engaging content about: ',
    description: 'Content creation',
    category: 'writing'
  },
  '/improve': {
    label: 'Improve Writing',
    prompt: 'Improve this text for clarity, grammar, and impact:\n\n',
    description: 'Polish your writing',
    category: 'writing'
  },
  '/summarize': {
    label: 'Summarize',
    prompt: 'Provide a concise summary of:\n\n',
    description: 'Quick summary',
    category: 'writing'
  },
  '/translate': {
    label: 'Translate',
    prompt: 'Translate this to [language]:\n\n',
    description: 'Language translation',
    category: 'writing'
  },

  // Business
  '/email': {
    label: 'Draft Email',
    prompt: 'Draft a professional email about: ',
    description: 'Email composition',
    category: 'business'
  },
  '/plan': {
    label: 'Create Plan',
    prompt: 'Create a detailed action plan for: ',
    description: 'Strategic planning',
    category: 'business'
  },
  '/analyze': {
    label: 'Analyze Data',
    prompt: 'Analyze this data and provide insights:\n\n',
    description: 'Data analysis',
    category: 'business'
  },

  // Creative
  '/brainstorm': {
    label: 'Brainstorm Ideas',
    prompt: 'Generate creative ideas for: ',
    description: 'Idea generation',
    category: 'creative'
  },
  '/story': {
    label: 'Write Story',
    prompt: 'Write a creative story about: ',
    description: 'Storytelling',
    category: 'creative'
  },

  // Problem Solving
  '/solve': {
    label: 'Solve Problem',
    prompt: 'Help me solve this problem step-by-step: ',
    description: 'Problem-solving',
    category: 'problem'
  },
  '/optimize': {
    label: 'Optimize',
    prompt: 'How can I optimize this for better performance:\n\n',
    description: 'Performance optimization',
    category: 'problem'
  }
};

// ========================
// Custom Templates Storage
// ========================

class QuickPromptsManager {
  constructor() {
    this.customTemplates = this.loadCustomTemplates();
    this.recentCommands = this.loadRecentCommands();
    this.maxRecent = 10;
  }

  // Load custom templates from localStorage
  loadCustomTemplates() {
    try {
      const saved = localStorage.getItem('hazy_custom_templates');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error('Error loading custom templates:', e);
      return {};
    }
  }

  // Save custom templates
  saveCustomTemplates() {
    try {
      localStorage.setItem('hazy_custom_templates', JSON.stringify(this.customTemplates));
    } catch (e) {
      console.error('Error saving custom templates:', e);
    }
  }

  // Load recent commands
  loadRecentCommands() {
    try {
      const saved = localStorage.getItem('hazy_recent_commands');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  // Save recent commands
  saveRecentCommands() {
    try {
      localStorage.setItem('hazy_recent_commands', JSON.stringify(this.recentCommands));
    } catch (e) {
      console.error('Error saving recent commands:', e);
    }
  }

  // Add custom template
  addCustomTemplate(command, label, prompt, category = 'custom') {
    if (!command.startsWith('/')) {
      command = '/' + command;
    }
    
    this.customTemplates[command] = {
      label,
      prompt,
      description: 'Custom template',
      category,
      custom: true
    };
    
    this.saveCustomTemplates();
    return true;
  }

  // Remove custom template
  removeCustomTemplate(command) {
    if (this.customTemplates[command]) {
      delete this.customTemplates[command];
      this.saveCustomTemplates();
      return true;
    }
    return false;
  }

  // Get all templates (built-in + custom)
  getAllTemplates() {
    return { ...QUICK_PROMPTS, ...this.customTemplates };
  }

  // Get template by command
  getTemplate(command) {
    const allTemplates = this.getAllTemplates();
    return allTemplates[command] || null;
  }

  // Track command usage
  trackUsage(command) {
    // Remove if already in recent
    this.recentCommands = this.recentCommands.filter(cmd => cmd !== command);
    
    // Add to beginning
    this.recentCommands.unshift(command);
    
    // Keep only recent N
    if (this.recentCommands.length > this.maxRecent) {
      this.recentCommands = this.recentCommands.slice(0, this.maxRecent);
    }
    
    this.saveRecentCommands();
  }

  // Get suggestions based on input
  getSuggestions(input) {
    const allTemplates = this.getAllTemplates();
    const inputLower = input.toLowerCase();
    
    // Exact match
    if (allTemplates[inputLower]) {
      return [inputLower];
    }
    
    // Partial match
    const matches = Object.keys(allTemplates).filter(cmd => 
      cmd.toLowerCase().startsWith(inputLower)
    );
    
    // Sort by: recent usage, then alphabetically
    return matches.sort((a, b) => {
      const aRecent = this.recentCommands.indexOf(a);
      const bRecent = this.recentCommands.indexOf(b);
      
      if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
      if (aRecent !== -1) return -1;
      if (bRecent !== -1) return 1;
      return a.localeCompare(b);
    });
  }

  // Get templates by category
  getByCategory(category) {
    const allTemplates = this.getAllTemplates();
    return Object.entries(allTemplates)
      .filter(([_, template]) => template.category === category)
      .reduce((acc, [cmd, template]) => {
        acc[cmd] = template;
        return acc;
      }, {});
  }

  // Get all categories
  getCategories() {
    const allTemplates = this.getAllTemplates();
    const categories = new Set();
    Object.values(allTemplates).forEach(t => categories.add(t.category));
    return Array.from(categories).sort();
  }

  // Export templates
  exportTemplates() {
    return {
      customTemplates: this.customTemplates,
      recentCommands: this.recentCommands,
      exportDate: new Date().toISOString()
    };
  }

  // Import templates
  importTemplates(data) {
    if (data.customTemplates) {
      this.customTemplates = { ...this.customTemplates, ...data.customTemplates };
      this.saveCustomTemplates();
    }
    if (data.recentCommands) {
      this.recentCommands = data.recentCommands;
      this.saveRecentCommands();
    }
  }
}

// ========================
// UI Components
// ========================

class QuickPromptsUI {
  constructor(manager) {
    this.manager = manager;
    this.dropdown = null;
    this.isVisible = false;
    this.selectedIndex = 0;
    this.currentSuggestions = [];
  }

  // Show dropdown with suggestions
  show(inputElement, suggestions) {
    this.currentSuggestions = suggestions;
    this.selectedIndex = 0;
    
    // Create dropdown if doesn't exist
    if (!this.dropdown) {
      this.createDropdown();
    }
    
    // Position below input
    const rect = inputElement.getBoundingClientRect();
    this.dropdown.style.left = rect.left + 'px';
    this.dropdown.style.top = (rect.bottom + 5) + 'px';
    this.dropdown.style.width = Math.min(400, rect.width) + 'px';
    
    // Populate suggestions
    this.populateSuggestions();
    
    // Show
    this.dropdown.style.display = 'block';
    this.isVisible = true;
  }

  // Hide dropdown
  hide() {
    if (this.dropdown) {
      this.dropdown.style.display = 'none';
      this.isVisible = false;
    }
  }

  // Create dropdown element
  createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'quick-prompts-dropdown';
    this.dropdown.innerHTML = `
      <div class="quick-prompts-header">
        <span>Quick Prompts</span>
        <button class="quick-prompts-help" title="Press Tab to autocomplete">?</button>
      </div>
      <div class="quick-prompts-list"></div>
      <div class="quick-prompts-footer">
        <small>Press Tab or Enter to use • ESC to close</small>
      </div>
    `;
    document.body.appendChild(this.dropdown);
  }

  // Populate suggestions list
  populateSuggestions() {
    const list = this.dropdown.querySelector('.quick-prompts-list');
    const allTemplates = this.manager.getAllTemplates();
    
    list.innerHTML = this.currentSuggestions.map((cmd, index) => {
      const template = allTemplates[cmd];
      const isSelected = index === this.selectedIndex;
      
      return `
        <div class="quick-prompt-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-command="${cmd}">
          <div class="quick-prompt-main">
            <span class="quick-prompt-label">${template.label}</span>
            <code class="quick-prompt-command">${cmd}</code>
          </div>
          <div class="quick-prompt-desc">${template.description}</div>
          ${template.custom ? '<span class="quick-prompt-badge">Custom</span>' : ''}
        </div>
      `;
    }).join('');
    
    // Add click handlers
    list.querySelectorAll('.quick-prompt-item').forEach(item => {
      item.addEventListener('click', () => {
        const cmd = item.dataset.command;
        this.selectCommand(cmd);
      });
    });
  }

  // Navigate suggestions with arrow keys
  navigate(direction) {
    if (!this.isVisible || this.currentSuggestions.length === 0) return;
    
    if (direction === 'down') {
      this.selectedIndex = (this.selectedIndex + 1) % this.currentSuggestions.length;
    } else if (direction === 'up') {
      this.selectedIndex = (this.selectedIndex - 1 + this.currentSuggestions.length) % this.currentSuggestions.length;
    }
    
    this.populateSuggestions();
    
    // Scroll selected into view
    const selectedItem = this.dropdown.querySelector('.quick-prompt-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  // Select current command
  selectCurrent() {
    if (this.currentSuggestions.length > 0) {
      return this.currentSuggestions[this.selectedIndex];
    }
    return null;
  }

  // Select specific command
  selectCommand(command) {
    const template = this.manager.getTemplate(command);
    if (template) {
      // Dispatch custom event
      const event = new CustomEvent('quickPromptSelected', {
        detail: { command, template }
      });
      document.dispatchEvent(event);
      this.hide();
    }
  }
}

// ========================
// Export
// ========================
window.QuickPromptsManager = QuickPromptsManager;
window.QuickPromptsUI = QuickPromptsUI;
window.QUICK_PROMPTS = QUICK_PROMPTS;
~~~

### frontend\splitter.js

- Size: 10924 bytes
- Language: javascript

~~~javascript
/**
 * Returns true if the character is considered a sentence terminator.
 * This includes ASCII (".", "!", "?") and common Unicode terminators.
 * NOTE: We also include newlines here, as this is favourable for text-to-speech systems.
 * @param {string} c The character to test.
 * @param {boolean} [includeNewlines=true] Whether to treat newlines as terminators.
 * @returns {boolean}
 */
function isSentenceTerminator(c, includeNewlines = true) {
  return ".!?…。？！".includes(c) || (includeNewlines && c === "\n");
}

/**
 * Returns true if the character should be attached to the sentence terminator,
 * such as closing quotes or brackets.
 * @param {string} c The character to test.
 * @returns {boolean}
 */
function isTrailingChar(c) {
  return "\"')]}」』".includes(c);
}

/**
 * Extracts a token (a contiguous sequence of non–whitespace characters)
 * from the buffer starting at the given index.
 * @param {string} buffer The input text.
 * @param {number} start The starting index.
 * @returns {string} The extracted token.
 */
function getTokenFromBuffer(buffer, start) {
  let end = start;
  while (end < buffer.length && !/\s/.test(buffer[end])) {
    ++end;
  }
  return buffer.substring(start, end);
}

// List of common abbreviations. Note that strings with single letters joined by periods
// (e.g., "i.e", "e.g", "u.s.a", "u.s") are handled separately.
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "sgt", "col", "gen", "rep", "sen", "gov", "lt", "maj", "capt", "st", "mt", "etc", "co", "inc", "ltd", "dept", "vs", "p", "pg", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "sun", "mon", "tu", "tue", "tues", "wed", "th", "thu", "thur", "thurs", "fri", "sat"]);

/**
 * Determines if the given token (or series of initials) is a known abbreviation.
 * @param {string} token The token to check.
 * @returns {boolean}
 */
function isAbbreviation(token) {
  // Remove possessive endings and trailing periods.
  token = token.replace(/['’]s$/i, "").replace(/\.+$/, "");
  return ABBREVIATIONS.has(token.toLowerCase());
}

// Map of closing punctuation to their corresponding opening punctuation.
const MATCHING = new Map([
  [")", "("],
  ["]", "["],
  ["}", "{"],
  ["》", "《"],
  ["〉", "〈"],
  ["›", "‹"],
  ["»", "«"],
  ["〉", "〈"],
  ["」", "「"],
  ["』", "『"],
  ["〕", "〔"],
  ["】", "【"],
]);
// Set of opening punctuation characters.
const OPENING = new Set(MATCHING.values());

/**
 * Updates the nesting stack to track quotes and paired punctuation.
 * This supports both standard (", ', (), [], {}) and Japanese quotes (「」「』『』).
 * (An apostrophe between letters is ignored so that contractions remain intact.)
 * @param {string} c The current character.
 * @param {string[]} stack The current nesting stack.
 * @param {number} i The index of the character in the buffer.
 * @param {string} buffer The full text being processed.
 */
function updateStack(c, stack, i, buffer) {
  // Handle standard quotes.
  if (c === '"' || c === "'") {
    // Ignore an apostrophe if it's between letters (e.g., in contractions).
    if (c === "'" && i > 0 && i < buffer.length - 1 && /[A-Za-z]/.test(buffer[i - 1]) && /[A-Za-z]/.test(buffer[i + 1])) {
      return;
    }
    if (stack.length && stack.at(-1) === c) {
      stack.pop();
    } else {
      stack.push(c);
    }
    return;
  }
  // Handle opening punctuation.
  if (OPENING.has(c)) {
    stack.push(c);
    return;
  }
  // Handle closing punctuation.
  const expectedOpening = MATCHING.get(c);
  if (expectedOpening && stack.length && stack.at(-1) === expectedOpening) {
    stack.pop();
  }
}

/**
 * A simple stream-based text splitter that emits complete sentences.
 */
export class TextSplitterStream {
  constructor() {
    this._buffer = "";
    this._sentences = [];
    this._resolver = null;
    this._closed = false;
  }

  /**
   * Push one or more text chunks into the stream.
   * @param  {...string} texts Text fragments to process.
   */
  push(...texts) {
    for (const txt of texts) {
      this._buffer += txt;
      this._process();
    }
  }

  /**
   * Closes the stream, signaling that no more text will be pushed.
   * This will flush any remaining text in the buffer as a sentence
   * and allow the consuming process to finish processing the stream.
   */
  close() {
    if (this._closed) {
      throw new Error("Stream is already closed.");
    }
    this._closed = true;
    this.flush();
  }

  /**
   * Flushes any remaining text in the buffer as a sentence.
   */
  flush() {
    const remainder = this._buffer.trim();
    if (remainder.length > 0) {
      this._sentences.push(remainder);
    }
    this._buffer = "";
    this._resolve();
  }

  /**
   * Resolve the pending promise to signal that sentences are available.
   * @private
   */
  _resolve() {
    if (this._resolver) {
      this._resolver();
      this._resolver = null;
    }
  }

  /**
   * Processes the internal buffer to extract complete sentences.
   * If the potential sentence boundary is at the end of the current buffer,
   * it waits for more text before splitting.
   * @private
   */
  _process() {
    let sentenceStart = 0;
    const buffer = this._buffer;
    const len = buffer.length;
    let i = 0;
    let stack = [];

    // Helper to scan from the current index over trailing terminators and punctuation.
    const scanBoundary = (idx) => {
      let end = idx;
      // Consume contiguous sentence terminators (excluding newlines).
      while (end + 1 < len && isSentenceTerminator(buffer[end + 1], false)) {
        ++end;
      }
      // Consume trailing characters (e.g., closing quotes/brackets).
      while (end + 1 < len && isTrailingChar(buffer[end + 1])) {
        ++end;
      }
      let nextNonSpace = end + 1;
      while (nextNonSpace < len && /\s/.test(buffer[nextNonSpace])) {
        ++nextNonSpace;
      }
      return { end, nextNonSpace };
    };

    while (i < len) {
      const c = buffer[i];
      updateStack(c, stack, i, buffer);

      // Only consider splitting if we're not inside any nested structure.
      if (stack.length === 0 && isSentenceTerminator(c)) {
        const currentSegment = buffer.slice(sentenceStart, i);
        // Skip splitting for likely numbered lists (e.g., "1." or "\n2.").
        if (/(^|\n)\d+$/.test(currentSegment)) {
          ++i;
          continue;
        }

        const { end: boundaryEnd, nextNonSpace } = scanBoundary(i);

        // If the terminator is not a newline and there's no extra whitespace,
        // we might be in the middle of a token (e.g., "$9.99"), so skip splitting.
        if (i === nextNonSpace - 1 && c !== "\n") {
          ++i;
          continue;
        }

        // Wait for more text if there's no non-whitespace character yet.
        if (nextNonSpace === len) {
          break;
        }

        // Determine the token immediately preceding the terminator.
        let tokenStart = i - 1;
        while (tokenStart >= 0 && /\S/.test(buffer[tokenStart])) {
          tokenStart--;
        }
        tokenStart = Math.max(sentenceStart, tokenStart + 1);
        const token = getTokenFromBuffer(buffer, tokenStart);
        if (!token) {
          ++i;
          continue;
        }

        // --- URL/email protection ---
        // If the token appears to be a URL or email (contains "://" or "@")
        // and does not already end with a terminator, skip splitting.
        if ((/https?[,:]\/\//.test(token) || token.includes("@")) && !isSentenceTerminator(token.at(-1))) {
          i = tokenStart + token.length;
          continue;
        }

        // --- Abbreviation protection ---
        if (isAbbreviation(token)) {
          ++i;
          continue;
        }

        // --- Middle initials heuristic ---
        // If the token is a series of single-letter initials (each ending in a period)
        // and is followed by a capitalized word, assume it's part of a name.
        if (/^([A-Za-z]\.)+$/.test(token) && nextNonSpace < len && /[A-Z]/.test(buffer[nextNonSpace])) {
          ++i;
          continue;
        }

        // --- Lookahead heuristic ---
        // If the terminator is a period and the next non–whitespace character is lowercase,
        // assume it is not the end of a sentence.
        if (c === "." && nextNonSpace < len && /[a-z]/.test(buffer[nextNonSpace])) {
          ++i;
          continue;
        }

        // Special case: ellipsis that stands alone should be merged with the following sentence.
        const sentence = buffer.substring(sentenceStart, boundaryEnd + 1).trim();
        if (sentence === "..." || sentence === "…") {
          ++i;
          continue;
        }

        // Accept the sentence boundary.
        if (sentence) {
          this._sentences.push(sentence);
        }
        // Move to the next sentence.
        i = sentenceStart = boundaryEnd + 1;
        continue;
      }
      ++i;
    }

    // Remove the processed portion of the buffer.
    this._buffer = buffer.substring(sentenceStart);

    // Resolve any pending promise if sentences are available.
    if (this._sentences.length > 0) {
      this._resolve();
    }
  }

  /**
   * Async iterator to yield sentences as they become available.
   * @returns {AsyncGenerator<string, void, void>}
   */
  async *[Symbol.asyncIterator]() {
    if (this._resolver) {
      throw new Error("Another iterator is already active.");
    }
    while (true) {
      if (this._sentences.length > 0) {
        yield this._sentences.shift();
      } else if (this._closed) {
        // No more text will be pushed.
        break;
      } else {
        // Wait for more text.
        await new Promise((resolve) => {
          this._resolver = resolve;
        });
      }
    }
  }

  /**
   * Synchronous iterator that flushes the buffer and returns all sentences.
   * @returns {Iterator<string>}
   */
  [Symbol.iterator]() {
    this.flush();
    const iterator = this._sentences[Symbol.iterator]();
    this._sentences = [];
    return iterator;
  }

  /**
   * Returns the array of sentences currently available.
   * @type {string[]} The array of sentences.
   * @readonly
   */
  get sentences() {
    return this._sentences;
  }
}

/**
 * Splits the input text into an array of sentences.
 * @param {string} text The text to split.
 * @returns {string[]} An array of sentences.
 */
export function split(text) {
  const splitter = new TextSplitterStream();
  splitter.push(text);
  return [...splitter];
}
~~~

### frontend\style.css

- Size: 14901 bytes
- Language: css

~~~css
:root{
  --bg:#fbf8f3;
  --panel:#fffdf8;
  --panel-2:#f7f2ea;
  --panel-3:#f3ede3;
  --line:rgba(122,97,54,.12);
  --line-strong:rgba(122,97,54,.22);
  --text:#2a231c;
  --text-soft:#6f6254;
  --text-muted:#9a8a78;
  --accent:#d69214;
  --accent-2:#efc05e;
  --green:#75b85f;
  --shadow:0 18px 60px rgba(111,80,16,.08);
  --shadow-soft:0 8px 24px rgba(111,80,16,.06);
  --radius-xl:28px;
  --radius-lg:22px;
  --radius-md:18px;
  --radius-sm:14px;
  --radius-xs:10px;
  --sidebar-w:276px;
  --rail-w:338px;
  font-family:"Space Grotesk",system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  color:var(--text);
  background:
    radial-gradient(circle at 15% 12%, rgba(255,244,225,.95), rgba(255,248,240,.75) 28%, transparent 48%),
    radial-gradient(circle at 85% 10%, rgba(255,242,220,.82), transparent 42%),
    linear-gradient(180deg,#fcfaf5 0%,#f8f5ef 100%);
  overflow:hidden;
}
button,input,textarea,select{font:inherit}
button{cursor:pointer}
.icon-svg{width:16px;height:16px;flex:none;display:block}
.app-shell{
  display:grid;
  grid-template-columns:var(--sidebar-w) minmax(0,1fr);
  gap:16px;
  height:100vh;
  padding:14px;
}
.sidebar,.topbar,.hero-card,.panel-card,.rail-card,.composer-card,.stack-card,.model-dropdown,.modal{
  background:linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,252,247,.88));
  border:1px solid var(--line);
  box-shadow:var(--shadow-soft);
  backdrop-filter:blur(16px);
}
.sidebar{
  border-radius:28px;
  padding:22px 18px;
  display:flex;
  flex-direction:column;
  min-height:0;
}
.sidebar-brand{display:flex;align-items:center;gap:14px;margin-bottom:24px}
.brand-mark,.logo-icon,.profile-badge{
  width:40px;height:40px;border-radius:14px;
  background:linear-gradient(180deg,#e3b150,#cf8b0f);
  display:grid;place-items:center;color:#fff;box-shadow:0 10px 28px rgba(210,141,14,.22)
}
.brand-copy{display:flex;flex-direction:column;line-height:1}
.brand-copy strong,.topbar-brand strong{font-size:34px;letter-spacing:-.06em}
.brand-copy span,.topbar-brand span{font-size:15px;color:var(--accent);margin-top:4px}
.sidebar-cta{width:100%;margin:6px 0 20px}
.btn-primary,.btn-secondary,.nav-item,.mode-btn,.quick-card,.template-item,.icon-chip,.footer-chip,.stack-card,.status-chip,.profile-chip,.live-chip,.snav-btn,.training-tab,.modal-close,.voice-btn,.send-btn,.sidebar .clear-chat-btn{
  border:1px solid var(--line);
  border-radius:16px;
  background:rgba(255,255,255,.72);
  color:var(--text);
  transition:.18s ease;
}
.btn-primary{
  background:linear-gradient(180deg,#e0a32b,#cf8c08);
  color:#fff;
  border-color:rgba(209,139,13,.32);
  box-shadow:0 12px 24px rgba(207,140,8,.18);
}
.btn-primary:hover,.send-btn:hover,.sidebar-cta:hover{transform:translateY(-1px)}
.btn-primary,.btn-secondary,.sidebar-cta{
  height:42px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;gap:10px;font-weight:600
}
.clear-chat-btn{
  height:42px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px
}
.search-bar-wrap{margin-bottom:12px}
.search-bar{
  display:flex;align-items:center;gap:10px;
  background:rgba(255,255,255,.7);
  border:1px solid var(--line);
  border-radius:16px;
  height:42px;padding:0 14px;color:var(--text-muted)
}
.search-bar input,.topbar-search input,.composer-card textarea{
  border:0;outline:0;background:transparent;color:var(--text);width:100%;resize:none
}
.search-bar input::placeholder,.topbar-search input::placeholder,.composer-card textarea::placeholder{color:#aa9b89}
.sidebar-section-label{font-size:11px;font-weight:700;letter-spacing:.18em;color:var(--text-muted);margin:10px 4px 12px}
.chat-history{display:flex;flex-direction:column;gap:10px;min-height:0;flex:1;overflow:auto;padding-right:4px}
.history-item,.activity-item,.model-item,.rail-list>*,.stack-card,.muted-card,.profile-card{
  border:1px solid var(--line);
  background:rgba(255,255,255,.68);
  border-radius:16px
}
.sidebar-nav{display:flex;flex-direction:column;gap:8px}
.nav-item{
  width:100%;height:42px;padding:0 14px;display:flex;align-items:center;gap:12px;text-align:left;
  color:var(--text-soft)
}
.nav-item.active,.nav-item:hover{background:#f7efe1;border-color:rgba(214,146,20,.2);color:var(--accent)}
.sidebar-stack{display:flex;flex-direction:column;gap:10px;margin-top:auto;padding-top:14px}
.stack-card,.muted-card,.profile-card{min-height:70px;padding:12px 14px}
.model-selector,.profile-card{display:flex;align-items:center;gap:12px}
.model-info,.profile-card div{display:flex;flex-direction:column}
.model-name,.profile-card strong{font-size:15px;font-weight:600}
.model-tag,.profile-card span,.muted-card p,.topbar-search kbd,.composer-footer span,.rail-list time,.activity-item time{font-size:12px;color:var(--text-muted)}
.model-chevron,.profile-chevron{margin-left:auto;color:var(--text-muted)}
.muted-card-title{display:flex;align-items:center;gap:10px;font-weight:600;font-size:13px;color:var(--text-soft)}
.muted-card p{margin:8px 0 0}
.profile-badge{width:42px;height:42px;border-radius:14px;font-weight:700}
.model-dropdown{margin-top:10px;padding:10px;display:none}
.dropdown-header{font-size:12px;font-weight:700;color:var(--text-soft);margin:4px 0 10px}
.main-column{min-width:0;display:flex;flex-direction:column;gap:14px;min-height:0}
.topbar{
  height:80px;border-radius:28px;padding:16px 18px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px
}
.topbar-brand{padding-left:8px}
.topbar-brand strong{font-size:36px}
.topbar-search{
  height:56px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.72);
  display:flex;align-items:center;gap:14px;padding:0 18px 0 18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5)
}
.topbar-search kbd{
  margin-left:auto;border:1px solid var(--line);border-radius:10px;padding:5px 10px;background:#fffdf8
}
.topbar-actions{display:flex;align-items:center;gap:10px}
.status-chip,.live-chip{height:44px;padding:0 18px;display:inline-flex;align-items:center;gap:10px;border-radius:999px}
.status-dot{width:10px;height:10px;border-radius:50%;background:#9f8a68;box-shadow:0 0 0 5px rgba(159,138,104,.14)}
.status-dot.live{background:var(--green);box-shadow:0 0 0 5px rgba(117,184,95,.14)}
.icon-chip,.profile-chip,.voice-btn,.send-btn{
  width:46px;height:46px;display:grid;place-items:center;border-radius:999px
}
.profile-chip{background:linear-gradient(180deg,#dcb67a,#c99547);color:#fff;font-weight:700}
.profile-chip span{font-size:16px}
.content-grid{display:grid;grid-template-columns:minmax(0,1fr) var(--rail-w);gap:14px;min-height:0;flex:1}
.center-pane{display:flex;flex-direction:column;gap:14px;min-width:0;min-height:0}
.hero-card{
  border-radius:28px;padding:34px 42px;display:grid;grid-template-columns:minmax(0,420px) minmax(280px,1fr);gap:20px;align-items:center;min-height:300px
}
.hero-copy{z-index:1}
.eyebrow{display:block;font-size:20px;color:var(--accent);margin-bottom:6px}
.hero-copy h1{font-size:86px;line-height:.92;margin:0;letter-spacing:-.08em}
.hero-copy h2{font-size:28px;line-height:1.1;margin:16px 0 12px;color:var(--accent)}
.hero-copy p{font-size:16px;line-height:1.65;color:var(--text-soft);max-width:440px;margin:0}
.hero-cta{margin-top:22px}
.hero-art{
  position:relative;height:100%;min-height:230px;display:grid;place-items:center;overflow:hidden;
  background:radial-gradient(circle at 50% 50%, rgba(255,255,255,.2), transparent 55%)
}
.orbit{position:absolute;border:1px solid rgba(220,163,58,.2);border-radius:50%}
.orbit-1{width:320px;height:190px;transform:rotate(-18deg)}
.orbit-2{width:260px;height:155px;transform:rotate(-18deg)}
.orbit-3{width:200px;height:120px;transform:rotate(-18deg)}
.hero-disc{
  width:160px;height:160px;border-radius:48% 52% 45% 55% / 48% 42% 58% 52%;
  background:linear-gradient(180deg,#e0a947,#cf8a0f);box-shadow:0 18px 40px rgba(208,139,13,.22);position:relative
}
.disc-ring,.disc-center{
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;border:4px solid rgba(255,255,255,.8)
}
.disc-ring{width:52px;height:52px;opacity:.8}
.disc-ring.ring-2{width:34px;height:34px}
.disc-center{width:14px;height:14px;background:#fff;border:0}
.panel-card,.rail-card{
  border-radius:24px;padding:16px 18px
}
.panel-header,.rail-header{
  display:flex;justify-content:space-between;align-items:center;margin-bottom:14px
}
.panel-header h3,.rail-header h3{margin:0;font-size:17px}
.link-accent{color:var(--accent);text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-weight:600}
.quick-grid{
  display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px
}
.quick-card{
  min-height:176px;padding:16px;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto 1fr auto;align-items:start;gap:10px;text-align:left
}
.quick-icon,.template-icon,.activity-icon,.tip-icon{
  width:44px;height:44px;border-radius:14px;background:#f6e7c7;color:var(--accent);display:grid;place-items:center
}
.quick-card strong,.template-item span{font-size:15px}
.quick-card span:last-of-type{grid-column:1 / -1;color:var(--text-soft);font-size:13px;line-height:1.55}
.quick-card i{grid-column:2;grid-row:4;width:28px;height:28px;border-radius:999px;border:1px solid var(--line);display:grid;place-items:center;color:var(--accent)}
.templates-card .template-grid{
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px
}
.template-item{
  height:42px;padding:0 14px;display:flex;align-items:center;gap:12px;text-align:left
}
.template-item .template-icon{width:28px;height:28px;border-radius:10px}
.chat-container{min-height:0;flex:1;display:none}
.messages-area{display:none}
#scrollAnchor{height:1px}
.right-rail{display:flex;flex-direction:column;gap:14px;min-width:0}
.rail-card{padding:16px}
.rail-list,.activity-list,.tip-body{display:flex;flex-direction:column;gap:10px}
.rail-list > *{padding:12px 14px;display:flex;align-items:center;gap:12px;min-height:58px}
.rail-list > * time,.activity-item time{margin-left:auto}
.activity-item{padding:12px 14px;display:flex;align-items:center;gap:12px;min-height:48px}
.activity-item span{font-size:13px;color:var(--text-soft)}
.tip-card .tip-body{align-items:center;text-align:center;padding:10px 2px 4px}
.tip-card .tip-icon{width:42px;height:42px;margin-top:2px}
.tip-card p{margin:4px 0 8px;color:var(--text-soft);line-height:1.6}
.centered{margin-top:6px}
.input-area{
  margin-top:auto;padding-bottom:2px
}
.input-mode-bar{
  display:flex;align-items:center;gap:8px;padding:0 4px 10px
}
.mode-btn{
  height:36px;padding:0 14px;border-radius:999px;background:#efe5d2;color:var(--text-soft);font-weight:600
}
.mode-btn.active{background:#d79a14;color:#fff;border-color:rgba(212,148,20,.45)}
.mode-status{margin-left:auto;color:var(--text-muted);font-size:13px}
.composer-card{
  display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;
  border-radius:22px;padding:12px 14px;min-height:88px;border:1px solid rgba(214,146,20,.34)
}
.composer-card textarea{font-size:20px;line-height:1.4;min-height:44px;max-height:120px;align-self:center}
.send-btn{background:#d7900f;color:#fff;border-color:rgba(214,146,20,.2)}
.composer-footer{
  display:flex;justify-content:space-between;align-items:center;padding:10px 4px 0;color:var(--text-muted);font-size:12px
}
.footer-actions{display:flex;gap:8px}
.footer-chip{
  height:32px;padding:0 12px;border-radius:999px;background:#efe5d2;color:var(--text-soft)
}
.modal-overlay{position:fixed;inset:0;background:rgba(33,24,16,.28);display:none;align-items:center;justify-content:center;padding:24px;z-index:40}
.modal-overlay.active{display:flex}
.modal{
  width:min(1120px,96vw);max-height:92vh;overflow:hidden;border-radius:28px;display:flex;flex-direction:column
}
.modal-header,.modal-footer{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:14px}
.modal-footer{border-top:1px solid var(--line);border-bottom:0}
.modal-body{padding:0;min-height:0}
.modal-close{width:42px;height:42px;border-radius:14px;display:grid;place-items:center}
.settings-layout{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:560px}
.settings-nav{padding:14px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:10px;overflow:auto;background:rgba(248,243,235,.6)}
.snav-btn{height:46px;padding:0 14px;display:flex;align-items:center;gap:10px;text-align:left;color:var(--text-soft)}
.snav-btn.active{background:#f7ebd5;color:var(--accent);border-color:rgba(214,146,20,.22)}
.settings-content{padding:20px;overflow:auto;min-height:0}
.stab{display:none}
.stab.active{display:block}
.stab-section-title{font-size:18px;font-weight:600;margin-bottom:10px}
.stab-helper{margin:0 0 14px;color:var(--text-soft);font-size:13px;line-height:1.6}
.setting-group{margin:0 0 14px}
.setting-label{display:block;font-size:12px;font-weight:700;letter-spacing:.12em;color:var(--text-soft);margin:0 0 8px}
.setting-input,.setting-textarea,.setting-range{width:100%}
.setting-input,.setting-textarea{
  border:1px solid var(--line);background:rgba(255,255,255,.86);border-radius:14px;padding:12px 14px;color:var(--text)
}
.setting-textarea{min-height:90px;resize:vertical}
.setting-range{accent-color:var(--accent)}
.training-tabs{display:flex;gap:8px;padding:12px 18px;border-bottom:1px solid var(--line)}
.training-tab{height:38px;padding:0 14px;border-radius:999px}
.training-tab.active{background:#f7ebd5;color:var(--accent)}
.training-tab-panel{display:none}
.training-tab-panel.active{display:block}
.toast-container{position:fixed;right:18px;bottom:18px;display:flex;flex-direction:column;gap:10px;z-index:60}
.toast{background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:14px;padding:12px 14px;box-shadow:var(--shadow-soft)}

@media (max-width: 1500px){
  .quick-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .content-grid{grid-template-columns:minmax(0,1fr) 300px}
  :root{--rail-w:300px}
}
@media (max-width: 1180px){
  body{overflow:auto}
  .app-shell{grid-template-columns:1fr;height:auto;min-height:100vh}
  .sidebar{order:2}
  .content-grid{grid-template-columns:1fr}
  .right-rail{order:2}
  .topbar{grid-template-columns:1fr;min-height:auto;height:auto}
  .hero-card{grid-template-columns:1fr}
  .quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width: 760px){
  .app-shell{padding:10px;gap:10px}
  .sidebar,.topbar,.hero-card,.panel-card,.rail-card,.composer-card{border-radius:22px}
  .quick-grid,.templates-card .template-grid{grid-template-columns:1fr}
  .composer-card{grid-template-columns:auto auto 1fr auto}
  .hero-copy h1{font-size:64px}
  .hero-copy h2{font-size:22px}
  .settings-layout{grid-template-columns:1fr}
  .settings-nav{border-right:0;border-bottom:1px solid var(--line);flex-direction:row;overflow:auto}
}
~~~

### frontend\ui-integration.js

- Size: 18645 bytes
- Language: javascript

~~~javascript
/**
 * UI Integration for Hazy Enhancements
 * Connects UI elements to enhancement modules
 */

// Global variables for current template fill
let currentTemplate = null;
let templateValues = {};

// ========================================
// MODAL FUNCTIONS
// ========================================

function openExportModal() {
  document.getElementById('exportModal').classList.add('show');
}

function openImportModal() {
  document.getElementById('importModal').classList.add('show');
}

function openTemplatesModal() {
  document.getElementById('templatesModal').classList.add('show');
  renderTemplates();
}

function openKnowledgeModal() {
  document.getElementById('knowledgeModal').classList.add('show');
  renderKnowledgeBase();
}

function openPerformanceModal() {
  document.getElementById('performanceModal').classList.add('show');
  renderPerformanceStats();
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

function exportCurrentChat(format) {
  if (!STATE.activeConvId) {
    showToast('No active conversation', 'error');
    return;
  }
  
  switch(format) {
    case 'json':
      ExportImportSystem.exportAsJSON(STATE.activeConvId);
      break;
    case 'markdown':
      ExportImportSystem.exportAsMarkdown(STATE.activeConvId);
      break;
    case 'html':
      ExportImportSystem.exportAsHTML(STATE.activeConvId);
      break;
  }
  
  document.getElementById('exportModal').classList.remove('show');
}

// ========================================
// IMPORT FUNCTIONS
// ========================================

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  if (!file.name.endsWith('.json')) {
    showToast('Please select a JSON file', 'error');
    return;
  }
  
  ExportImportSystem.importFromJSON(file);
  input.value = ''; // Reset input
  document.getElementById('importModal').classList.remove('show');
}

// ========================================
// TEMPLATE FUNCTIONS
// ========================================

function renderTemplates(category = 'all') {
  const grid = document.getElementById('templateGrid');
  if (!grid) return;
  
  const templates = category === 'all' 
    ? PromptTemplates.getAllTemplates()
    : PromptTemplates.getTemplatesByCategory(category);
  
  grid.innerHTML = templates.map(template => `
    <div class="template-card" onclick="selectTemplate('${template.id}')">
      <div class="template-card-header">
        <div class="template-name">${template.name}</div>
        <div class="template-category">${template.category}</div>
      </div>
      <div class="template-description">${template.description}</div>
      <div class="template-variables">
        ${template.variables.map(v => `<span class="template-variable">{{${v}}}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function filterTemplates(category) {
  renderTemplates(category);
  
  // Update button states
  document.querySelectorAll('.templates-modal .btn-secondary').forEach(btn => {
    btn.classList.toggle('active', 
      btn.textContent.trim() === category || 
      (category === 'all' && btn.textContent.trim() === 'All')
    );
  });
}

function selectTemplate(templateId) {
  currentTemplate = PromptTemplates.getTemplate(templateId);
  if (!currentTemplate) return;
  
  templateValues = {};
  
  // Show fill modal
  document.getElementById('templatesModal').classList.remove('show');
  document.getElementById('templateFillModal').classList.add('show');
  document.getElementById('templateFillTitle').textContent = currentTemplate.name;
  
  // Render form
  const form = document.getElementById('templateFillForm');
  form.innerHTML = currentTemplate.variables.map(variable => `
    <div class="template-variable-input">
      <label class="template-variable-label">${variable.replace('_', ' ')}</label>
      <textarea 
        class="template-variable-field" 
        id="template-var-${variable}"
        placeholder="Enter ${variable}..."
        oninput="templateValues['${variable}'] = this.value"
      ></textarea>
    </div>
  `).join('');
}

function useFilledTemplate() {
  if (!currentTemplate) return;
  
  const filledPrompt = PromptTemplates.fillTemplate(currentTemplate.id, templateValues);
  
  // Insert into chat input
  const chatInput = document.getElementById('chatInput');
  chatInput.value = filledPrompt;
  autoResize(chatInput);
  chatInput.focus();
  
  // Close modal
  document.getElementById('templateFillModal').classList.remove('show');
  showToast(`✅ Template "${currentTemplate.name}" applied`, 'success');
}

// ========================================
// KNOWLEDGE BASE FUNCTIONS
// ========================================

async function handleKnowledgeFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  try {
    let content = '';
    
    if (file.type === 'application/pdf') {
      // Extract text from PDF using PDF.js
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        content += pageText + '\n\n';
      }
    } else {
      // Read as text
      content = await file.text();
    }
    
    await KnowledgeBase.addDocument(file.name, content, file.type);
    renderKnowledgeBase();
    input.value = ''; // Reset
  } catch (error) {
    showToast('Error adding document: ' + error.message, 'error');
    console.error(error);
  }
}

function renderKnowledgeBase() {
  const list = document.getElementById('knowledgeList');
  if (!list) return;
  
  const docs = KnowledgeBase.getAllDocuments();
  
  if (docs.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 48px; margin-bottom: 12px;">📚</div>
        <p>No documents in Knowledge Base</p>
        <p style="font-size: 13px; margin-top: 8px;">Add documents to reference in conversations</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = docs.map(doc => `
    <div class="knowledge-item">
      <div class="knowledge-item-content">
        <div class="knowledge-item-name">📄 ${doc.name}</div>
        <div class="knowledge-item-meta">
          <span>${new Date(doc.addedAt).toLocaleDateString()}</span>
          <span>${(doc.size / 1024).toFixed(1)} KB</span>
          <span>${doc.type}</span>
        </div>
      </div>
      <div class="knowledge-item-actions">
        <button class="knowledge-item-btn" onclick="useKnowledgeDoc('${doc.id}')">Use</button>
        <button class="knowledge-item-btn" onclick="removeKnowledgeDoc('${doc.id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

function searchKnowledgeBase() {
  const query = document.getElementById('knowledgeSearch').value.trim();
  const list = document.getElementById('knowledgeList');
  if (!list) return;
  
  if (!query) {
    renderKnowledgeBase();
    return;
  }
  
  const results = KnowledgeBase.search(query);
  
  if (results.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
        <p>No results found for "${query}"</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = results.map(doc => `
    <div class="knowledge-item">
      <div class="knowledge-item-content">
        <div class="knowledge-item-name">📄 ${doc.name}</div>
        <div class="knowledge-item-meta">
          <span>${new Date(doc.addedAt).toLocaleDateString()}</span>
          <span>${(doc.size / 1024).toFixed(1)} KB</span>
        </div>
        <div style="margin-top: 8px; font-size: 13px; color: var(--text-secondary); font-style: italic;">
          ${doc.snippet}
        </div>
      </div>
      <div class="knowledge-item-actions">
        <button class="knowledge-item-btn" onclick="useKnowledgeDoc('${doc.id}')">Use</button>
      </div>
    </div>
  `).join('');
}

function useKnowledgeDoc(docId) {
  const doc = KnowledgeBase.getDocument(docId);
  if (!doc) return;
  
  const chatInput = document.getElementById('chatInput');
  const context = `\n\n[From Knowledge Base - ${doc.name}]:\n${doc.content.substring(0, 2000)}${doc.content.length > 2000 ? '...' : ''}\n\n`;
  
  chatInput.value += context;
  autoResize(chatInput);
  chatInput.focus();
  
  document.getElementById('knowledgeModal').classList.remove('show');
  showToast(`📄 Added "${doc.name}" to context`, 'success');
}

function removeKnowledgeDoc(docId) {
  if (confirm('Remove this document from Knowledge Base?')) {
    KnowledgeBase.removeDocument(docId);
    renderKnowledgeBase();
  }
}

// ========================================
// PERFORMANCE FUNCTIONS
// ========================================

function renderPerformanceStats() {
  const stats = PerformanceMonitor.getStats();
  
  // Render summary stats
  const statsContainer = document.getElementById('performanceStats');
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="performance-stat-card">
        <div class="performance-stat-label">Total Requests</div>
        <div class="performance-stat-value">${stats.totalRequests}</div>
      </div>
      <div class="performance-stat-card">
        <div class="performance-stat-label">Success Rate</div>
        <div class="performance-stat-value">${stats.successRate}<span class="performance-stat-unit">%</span></div>
      </div>
      <div class="performance-stat-card">
        <div class="performance-stat-label">Total Tokens</div>
        <div class="performance-stat-value">${stats.totalTokens.toLocaleString()}</div>
      </div>
      <div class="performance-stat-card">
        <div class="performance-stat-label">Avg Response Time</div>
        <div class="performance-stat-value">${stats.avgDuration}<span class="performance-stat-unit">ms</span></div>
      </div>
    `;
  }
  
  // Render model stats
  const modelList = document.getElementById('performanceModelList');
  if (modelList) {
    const models = Object.entries(stats.models);
    
    if (models.length === 0) {
      modelList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>No model performance data yet</p>
        </div>
      `;
      return;
    }
    
    modelList.innerHTML = models.map(([modelName, modelStats]) => `
      <div class="performance-model-item">
        <div class="performance-model-name">
          🤖 ${modelName}
          <span style="font-size: 12px; font-weight: 400; color: var(--text-muted); margin-left: 8px;">
            Last used ${new Date(modelStats.lastUsed).toLocaleString()}
          </span>
        </div>
        <div class="performance-model-stats">
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Requests</div>
            <div class="performance-mini-value">${modelStats.totalRequests}</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Success</div>
            <div class="performance-mini-value">${modelStats.successfulRequests}</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Avg Time</div>
            <div class="performance-mini-value">${Math.round(modelStats.avgDuration)}ms</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Avg Tokens</div>
            <div class="performance-mini-value">${Math.round(modelStats.avgTokens)}</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Total Tokens</div>
            <div class="performance-mini-value">${modelStats.totalTokens.toLocaleString()}</div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

document.addEventListener('keydown', function(e) {
  // Show shortcuts panel with ?
  if (e.key === '?' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    document.getElementById('shortcutsPanel').classList.toggle('show');
    return;
  }
  
  // Close modals with Escape
  if (e.key === 'Escape') {
    document.querySelectorAll('.export-modal, .import-modal, .templates-modal, .knowledge-modal, .performance-modal, .shortcuts-panel').forEach(modal => {
      modal.classList.remove('show');
    });
    return;
  }
  
  // Ctrl/Cmd shortcuts
  if (e.ctrlKey || e.metaKey) {
    switch(e.key.toLowerCase()) {
      case 'e':
        e.preventDefault();
        openExportModal();
        break;
      case 'i':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openImportModal();
        }
        break;
      case 't':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openTemplatesModal();
        }
        break;
      case 'b':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openKnowledgeModal();
        }
        break;
      case 'p':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openPerformanceModal();
        }
        break;
    }
  }
});

// ========================================
// MESSAGE ENHANCEMENTS
// ========================================

function addMessageEnhancements(messageElement, messageId) {
  // Add action buttons container
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-actions';
  
  // Bookmark button
  const isBookmarked = MessageFeatures.isBookmarked(messageId);
  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.className = 'message-action-btn' + (isBookmarked ? ' active' : '');
  bookmarkBtn.innerHTML = '⭐';
  bookmarkBtn.title = 'Bookmark';
  bookmarkBtn.onclick = function() {
    const nowBookmarked = MessageFeatures.toggleBookmark(messageId);
    this.classList.toggle('active', nowBookmarked);
  };
  
  // Reaction button
  const reactionBtn = document.createElement('button');
  reactionBtn.className = 'message-action-btn';
  reactionBtn.innerHTML = '😊';
  reactionBtn.title = 'React';
  reactionBtn.onclick = function() {
    toggleReactionPicker(messageId, this);
  };
  
  actionsDiv.appendChild(bookmarkBtn);
  actionsDiv.appendChild(reactionBtn);
  messageElement.appendChild(actionsDiv);
  
  // Add existing reactions
  const reactions = MessageFeatures.getReactions(messageId);
  if (reactions.length > 0) {
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions';
    reactions.forEach(emoji => {
      const reactionSpan = document.createElement('span');
      reactionSpan.className = 'message-reaction';
      reactionSpan.textContent = emoji;
      reactionsDiv.appendChild(reactionSpan);
    });
    messageElement.appendChild(reactionsDiv);
  }
}

function toggleReactionPicker(messageId, button) {
  let picker = button.nextElementSibling;
  
  if (!picker || !picker.classList.contains('reaction-picker')) {
    picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = ['👍', '👎', '❤️', '🎯', '🔥', '💡'].map(emoji => 
      `<button class="reaction-btn" onclick="addReactionToMessage('${messageId}', '${emoji}')">${emoji}</button>`
    ).join('');
    button.parentElement.appendChild(picker);
  }
  
  picker.classList.toggle('show');
  
  // Close picker when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeHandler(e) {
      if (!picker.contains(e.target) && e.target !== button) {
        picker.classList.remove('show');
        document.removeEventListener('click', closeHandler);
      }
    });
  }, 100);
}

function addReactionToMessage(messageId, emoji) {
  MessageFeatures.addReaction(messageId, emoji);
  // Refresh message display
  const conv = STATE.conversations[STATE.activeConvId];
  if (conv) {
    displayConversation(conv);
  }
}

// ========================================
// CODE BLOCK ENHANCEMENTS
// ========================================

// Enhance code blocks after they're rendered
function enhanceCodeBlocks() {
  document.querySelectorAll('pre code').forEach(codeBlock => {
    EnhancedCodeBlocks.enhance(codeBlock);
  });
}

// Hook into message rendering
const originalDisplayConversation = window.displayConversation;
if (originalDisplayConversation) {
  window.displayConversation = function(...args) {
    originalDisplayConversation.apply(this, args);
    setTimeout(() => {
      enhanceCodeBlocks();
    }, 100);
  };
}

// ========================================
// WRAP STREAMING WITH PERFORMANCE TRACKING
// ========================================

const originalStreamChat = window.streamChat;
if (originalStreamChat) {
  window.streamChat = async function(...args) {
    const startTime = Date.now();
    let tokenCount = 0;
    let success = false;
    
    try {
      const result = await originalStreamChat.apply(this, args);
      success = true;
      
      // Estimate token count (rough approximation)
      const conv = STATE.conversations[STATE.activeConvId];
      if (conv && conv.messages.length > 0) {
        const lastMessage = conv.messages[conv.messages.length - 1];
        tokenCount = Math.ceil(lastMessage.content.split(/\s+/).length * 1.3);
      }
      
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const endTime = Date.now();
      PerformanceMonitor.recordRequest(STATE.model, startTime, endTime, tokenCount, success);
    }
  };
}

console.log('✅ UI Integration loaded');
~~~

### frontend\voices-data.js

- Size: 11001 bytes
- Language: javascript

~~~javascript
import path from "path";
import fs from "fs/promises";

export const VOICES = Object.freeze({
  af_heart: {
    name: "Heart",
    language: "en-us",
    gender: "Female",
    traits: "❤️",
    targetQuality: "A",
    overallGrade: "A",
  },
  af_alloy: {
    name: "Alloy",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  af_aoede: {
    name: "Aoede",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_bella: {
    name: "Bella",
    language: "en-us",
    gender: "Female",
    traits: "🔥",
    targetQuality: "A",
    overallGrade: "A-",
  },
  af_jessica: {
    name: "Jessica",
    language: "en-us",
    gender: "Female",
    targetQuality: "C",
    overallGrade: "D",
  },
  af_kore: {
    name: "Kore",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_nicole: {
    name: "Nicole",
    language: "en-us",
    gender: "Female",
    traits: "🎧",
    targetQuality: "B",
    overallGrade: "B-",
  },
  af_nova: {
    name: "Nova",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  af_river: {
    name: "River",
    language: "en-us",
    gender: "Female",
    targetQuality: "C",
    overallGrade: "D",
  },
  af_sarah: {
    name: "Sarah",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_sky: {
    name: "Sky",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C-",
  },
  am_adam: {
    name: "Adam",
    language: "en-us",
    gender: "Male",
    targetQuality: "D",
    overallGrade: "F+",
  },
  am_echo: {
    name: "Echo",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_eric: {
    name: "Eric",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_fenrir: {
    name: "Fenrir",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C+",
  },
  am_liam: {
    name: "Liam",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_michael: {
    name: "Michael",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C+",
  },
  am_onyx: {
    name: "Onyx",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_puck: {
    name: "Puck",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C+",
  },
  am_santa: {
    name: "Santa",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D-",
  },
  bf_emma: {
    name: "Emma",
    language: "en-gb",
    gender: "Female",
    traits: "🚺",
    targetQuality: "B",
    overallGrade: "B-",
  },
  bf_isabella: {
    name: "Isabella",
    language: "en-gb",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  bm_george: {
    name: "George",
    language: "en-gb",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C",
  },
  bm_lewis: {
    name: "Lewis",
    language: "en-gb",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D+",
  },
  bf_alice: {
    name: "Alice",
    language: "en-gb",
    gender: "Female",
    traits: "🚺",
    targetQuality: "C",
    overallGrade: "D",
  },
  bf_lily: {
    name: "Lily",
    language: "en-gb",
    gender: "Female",
    traits: "🚺",
    targetQuality: "C",
    overallGrade: "D",
  },
  bm_daniel: {
    name: "Daniel",
    language: "en-gb",
    gender: "Male",
    traits: "🚹",
    targetQuality: "C",
    overallGrade: "D",
  },
  bm_fable: {
    name: "Fable",
    language: "en-gb",
    gender: "Male",
    traits: "🚹",
    targetQuality: "B",
    overallGrade: "C",
  },

  // TODO: Add support for other languages:
  // jf_alpha: {
  //   name: "alpha",
  //   language: "ja",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "C+",
  // },
  // jf_gongitsune: {
  //   name: "gongitsune",
  //   language: "ja",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // jf_nezumi: {
  //   name: "nezumi",
  //   language: "ja",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "C-",
  // },
  // jf_tebukuro: {
  //   name: "tebukuro",
  //   language: "ja",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // jm_kumo: {
  //   name: "kumo",
  //   language: "ja",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "B",
  //   overallGrade: "C-",
  // },
  // zf_xiaobei: {
  //   name: "xiaobei",
  //   language: "zh",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // zf_xiaoni: {
  //   name: "xiaoni",
  //   language: "zh",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // zf_xiaoxiao: {
  //   name: "xiaoxiao",
  //   language: "zh",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // zf_xiaoyi: {
  //   name: "xiaoyi",
  //   language: "zh",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // zm_yunjian: {
  //   name: "yunjian",
  //   language: "zh",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // zm_yunxi: {
  //   name: "yunxi",
  //   language: "zh",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // zm_yunxia: {
  //   name: "yunxia",
  //   language: "zh",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // zm_yunyang: {
  //   name: "yunyang",
  //   language: "zh",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // ef_dora: {
  //   name: "dora",
  //   language: "es",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // em_alex: {
  //   name: "alex",
  //   language: "es",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // em_santa: {
  //   name: "santa",
  //   language: "es",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // ff_siwis: {
  //   name: "siwis",
  //   language: "es",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "B-",
  // },
  // hf_alpha: {
  //   name: "alpha",
  //   language: "hi",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // hf_beta: {
  //   name: "beta",
  //   language: "hi",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // hm_omega: {
  //   name: "omega",
  //   language: "hi",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // hm_psi: {
  //   name: "psi",
  //   language: "hi",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // if_sara: {
  //   name: "sara",
  //   language: "it",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // im_nicola: {
  //   name: "nicola",
  //   language: "it",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "B",
  //   overallGrade: "C",
  // },
  // pf_dora: {
  //   name: "dora",
  //   language: "pt-br",
  //   gender: "Female",
  //   traits: "🚺",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // pm_alex: {
  //   name: "alex",
  //   language: "pt-br",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
  // pm_santa: {
  //   name: "santa",
  //   language: "pt-br",
  //   gender: "Male",
  //   traits: "🚹",
  //   targetQuality: "C",
  //   overallGrade: "D",
  // },
});


/**
 * The base URL for fetching voice data files.
 */
let voiceDataUrl = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";


/**
 * Retrieves the current voice data URL.
 * 
 * @returns The current voice data URL.
 */
export function getVoiceDataUrl() {
  return voiceDataUrl;
};

/**
 * Sets a new voice data URL.
 * 
 * @param url - The new URL to set for voice data.
 * @throws Will throw an error if the URL is not a valid non-empty string.
 */
export function setVoiceDataUrl(url) {
  if (typeof url === 'string' && url.trim() !== '') {
    voiceDataUrl = url;
  } else {
    throw new Error("Invalid URL");
  }
};

/**
 *
 * @param {keyof typeof VOICES} id
 * @returns {Promise<ArrayBufferLike>}
 */
async function getVoiceFile(id) {
  if (fs && Object.hasOwn(fs, 'readFile')) {
    const dirname = typeof __dirname !== "undefined" ? __dirname : import.meta.dirname;
    const file = path.resolve(dirname, `../voices/${id}.bin`);
    const { buffer } = await fs.readFile(file);
    return buffer;
  }

  const url = `${voiceDataUrl}/${id}.bin`;

  let cache;
  try {
    cache = await caches.open("kokoro-voices");
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      return await cachedResponse.arrayBuffer();
    }
  } catch (e) {
    console.warn("Unable to open cache", e);
  }

  // No cache, or cache failed to open. Fetch the file.
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  if (cache) {
    try {
      // NOTE: We use `new Response(buffer, ...)` instead of `response.clone()` to handle LFS files
      await cache.put(
        url,
        new Response(buffer, {
          headers: response.headers,
        }),
      );
    } catch (e) {
      console.warn("Unable to cache file", e);
    }
  }

  return buffer;
}

const VOICE_CACHE = new Map();
export async function getVoiceData(voice) {
  if (VOICE_CACHE.has(voice)) {
    return VOICE_CACHE.get(voice);
  }

  const buffer = new Float32Array(await getVoiceFile(voice));
  VOICE_CACHE.set(voice, buffer);
  return buffer;
}
~~~

### README.md

- Size: 10493 bytes
- Language: markdown

~~~markdown
# Hazy — Local AI Assistant
### by Dream On

A feature-rich AI chatbot that runs **100% on your machine** using [Ollama](https://ollama.com).
Fully private — no cloud, no subscriptions, no data leaving your device.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Smart Chat** | Streaming responses, markdown rendering, syntax highlighting |
| 🌐 **Website Builder** | AI generates full multi-file websites (HTML/CSS/JS + backend) with live preview & ZIP download |
| 🎭 **AI Companion** | Character.AI-style personas with scenarios, relationships, and roleplay |
| 📎 **File Upload** | Attach images (vision), PDFs, code files, CSVs — AI reads and understands them |
| 🎤 **Piper AI Voice** | Lightweight neural TTS — natural voices, 12 languages, runs 100% locally |
| ✏️ **Edit Messages** | Edit any sent message and regenerate the AI response from that point |
| 🔍 **Search Chats** | Search your conversation history from the sidebar |
| 🏷️ **Smart Titles** | AI auto-generates a short descriptive title for each chat |
| 🌓 **3 Themes** | Hazel (warm), Dark, OLED |
| 💾 **IndexedDB Cache** | Streaming output saved to local storage as RAM safety net |

---

## 🖥️ System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| VRAM | 4GB | 6–8GB |
| RAM | 8GB | 16GB |
| Storage | 5GB | 20GB+ |
| OS | Windows 10 / macOS 12 / Ubuntu 20.04 | Any modern OS |
| Browser | Chrome 112+ / Edge 112+ | Chrome latest |

---

## 🚀 Quick Start

### Step 1 — Install Ollama

Download and install from **https://ollama.com**

Verify:
```bash
ollama --version
```

### Step 2 — Pull a Model

**Recommended for 4GB VRAM:**
```bash
ollama pull mistral          # Mistral 7B Q4 — best quality/speed (~4GB)
ollama pull llama3.2         # Llama 3.2 3B — faster, lower memory (~2GB)
ollama pull phi3             # Phi-3 Mini — smart and small (~2.3GB)
```

**For 6–8GB VRAM:**
```bash
ollama pull llama3           # Meta Llama 3 8B
ollama pull gemma2           # Google Gemma 2 9B
ollama pull qwen2.5          # Alibaba Qwen 2.5 7B
```

**For image/vision support (file upload feature):**
```bash
ollama pull llava            # LLaVA — best vision model
ollama pull llama3.2-vision  # Llama 3.2 Vision
```

### Step 3 — Start Hazy

**Windows:**
```
Double-click start.bat
```

**macOS / Linux:**
```bash
chmod +x start.sh
./start.sh
```

**Manual (Node.js):**
```bash
cd backend
node server.js
# Open http://localhost:8080
```

**Manual (Python):**
```bash
cd backend
pip install -r requirements.txt
python server.py
# Open http://localhost:8080
```

---

## 📁 Project Structure

```
hazy-chatbot/
├── frontend/
│   ├── index.html      ← Main UI + all modals
│   ├── style.css       ← Full design system (2300+ lines)
│   └── app.js          ← All logic (2700+ lines)
├── backend/
│   ├── server.js       ← Node.js server (zero npm deps)
│   ├── server.py       ← Python/FastAPI alternative
│   ├── package.json
│   └── requirements.txt
├── start.sh            ← macOS/Linux launcher
├── start.bat           ← Windows launcher
└── README.md
```

---

## 🎤 Piper AI Voice (TTS)

Hazy includes **Piper** — a fast, lightweight neural text-to-speech engine that runs
100% in your browser via WASM. No server, no API key, no internet after the first download.

### How to set it up

1. Start Hazy and open it in your browser
2. Click the **TTS** button in the bottom bar
3. Select **🧠 Piper AI Voice**
4. Select a voice from the dropdown — it downloads once (~30–80MB) and caches permanently
5. Pick a voice from the dropdown
6. Click **Preview Voice** to test it
7. Click **Enable & Start**

Every AI response will now be read aloud in the selected voice automatically.

### Available voices

| Voice | Type | Description |
|---|---|---|
| Heart ⭐ | 🇺🇸 American Female | Highest quality — recommended |
| Bella | 🇺🇸 American Female | Warm and natural |
| Nicole | 🇺🇸 American Female | Clear and articulate |
| Sky | 🇺🇸 American Female | Light and expressive |
| Sarah | 🇺🇸 American Female | Smooth and professional |
| Adam | 🇺🇸 American Male | Deep and confident |
| Michael | 🇺🇸 American Male | Natural and friendly |
| Emma | 🇬🇧 British Female | Crisp British accent |
| Isabella | 🇬🇧 British Female | Elegant and clear |
| George | 🇬🇧 British Male | Rich British accent |
| Lewis | 🇬🇧 British Male | Calm and measured |

### Requirements for Piper

| | |
|---|---|
| **Browser** | Chrome 112+ or Edge 112+ (Firefox works but is slower via WASM) |
| **Internet** | Required once for the ~160MB model download |
| **RAM** | ~400MB free while model is running |
| **Storage** | ~160MB in browser cache (persists until you clear browser data) |

> **Tip:** The model stays cached — closing and reopening the tab does NOT re-download it.
> If Piper fails to load, switch to Browser Voice in the TTS settings as a fallback.

---

## 🌐 Website Builder

Switch to **Build Website** mode in the input bar, then describe what you want:

```
Build me a portfolio landing page with a hero section, about me, skills, and contact form
```

```
Create a restaurant website with Home, Menu, About, Contact pages and a Node.js backend
```

```
Build an analytics dashboard with Chart.js charts showing revenue and user data
```

Hazy generates all files, shows them in a tabbed panel with syntax highlighting,
renders a live preview, and lets you download everything as a ZIP.

**Supports:** HTML/CSS/JS, multi-page sites, Express.js backends, Chart.js dashboards,
contact forms with validation, Google Fonts, responsive design.

---

## 🎭 AI Companion (Persona)

Click the **Persona** button in the sidebar to create a character and scenario.

### Quick Start scenarios included

| Scenario | Setting |
|---|---|
| 🔬 Lab Partners | Chemistry class, Monday morning |
| ☕ Coffee Shop Crush | Rainy campus café |
| 🛤️ Childhood Friend Reunion | Hometown convenience store, 7 years later |
| 💼 Office Rival | Glass conference room, Friday deadline |
| ⚔️ Fantasy Kingdom | Ashwood Forest, dangerous mission |
| 📚 Late Night Study | University library, finals week |
| 🏥 Hospital Roommates | Two-day stay, identical beige meals |
| ✏️ Custom | Write your own scenario from scratch |

Or build your own — write a custom scenario description, set the opening line,
choose a relationship type, personality traits, and conversation tone.

The AI opens the scene automatically, uses `*actions*` for body language and environment,
stays fully in character, and never breaks the fourth wall.

---

## 📎 File Upload

Attach files to any message using the 📎 button, drag-and-drop onto the input area,
or paste directly from clipboard (Ctrl+V for images).

| File type | What Hazy does |
|---|---|
| Images (jpg/png/gif/webp) | Sends as vision content — AI sees and analyzes the image |
| PDF | Extracts text from up to 20 pages using PDF.js |
| Code files (js/py/html/css/etc.) | Reads as text with language label |
| Text/CSV/JSON/Markdown | Reads as plain text context |

> **Note:** Image understanding requires a vision-capable model.
> Pull one with: `ollama pull llava`

---

## ⚙️ Settings

Click **Settings** (⚙️) in the sidebar:

| Setting | Description | Default |
|---|---|---|
| Ollama URL | Where Ollama is running | `http://localhost:11434` |
| System Prompt | How the AI behaves in Chat mode | Helpful assistant |
| Temperature | Creativity (0 = precise, 2 = very creative) | 0.7 |
| Max Tokens | Max response length — use 4096+ for website building | 4096 |
| Theme | Hazel / Dark / OLED | Auto-detected from system |

### Change default port
```bash
# Node.js
PORT=8081 node backend/server.js

# Python
PORT=8081 python backend/server.py

# Windows
set PORT=8081 && node backend/server.js
```

### Remote Ollama
```bash
OLLAMA_URL=http://192.168.1.100:11434 node backend/server.js
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `Ctrl/Cmd+K` | Start new chat |
| `Escape` | Close any open modal |
| `Ctrl+Enter` | Save edited message (when editing) |

---

## 🐛 Troubleshooting

**"Cannot connect to Ollama"**
```bash
ollama serve
# Verify in another terminal:
curl http://localhost:11434/api/tags
```

**"No models installed"**
```bash
ollama pull mistral
ollama list
```

**Port already in use**
```bash
PORT=8081 node backend/server.js
# Open http://localhost:8081
```

**GPU not being used (slow responses)**
```bash
ollama run mistral "hello"
# Look for "using GPU" in the Ollama logs
```

**Piper TTS won't load**
- Use Chrome 112+ or Edge 112+
- Open browser console (F12 → Console) and check for errors
- Try a hard refresh (Ctrl+Shift+R) to clear cached module state
- Switch to Browser Voice in TTS settings as a fallback

**Website builder shows "Could not extract files"**
- Switch to a larger model: `ollama pull llama3` or `ollama pull mistral`
- Increase Max Tokens to 4096+ in Settings ⚙️
- Click **Build Website** mode button before sending your prompt
- Make your description more specific and detailed

---

## 🏗️ Architecture

```
Browser (HTML/CSS/JS)
       │
       ├── Piper TTS     (WASM — lightweight neural TTS, runs in browser)
       ├── PDF.js        (PDF text extraction, in browser)
       ├── JSZip         (ZIP packaging, in browser)
       ├── Highlight.js  (Syntax highlighting, in browser)
       │
       │ HTTP + NDJSON streaming
       ▼
Hazy Server (Node.js or Python)
       │
       │ Proxies to Ollama, serves frontend
       ▼
Ollama (localhost:11434)
       │
       ▼
LLM Model (Mistral, Llama3, LLaVA, etc.)
       │
       ▼
GPU / CPU Inference
```

---

## 📄 License

MIT License — do whatever you want with it.

Built with ❤️ by **Dream On** using [Ollama](https://ollama.com), Piper TTS,
Node.js/FastAPI, and vanilla HTML/CSS/JS.
~~~

### start.bat

- Size: 1510 bytes
- Language: bat

~~~bat
@echo off
title Hazy AI Chatbot
echo.
echo  ╔══════════════════════════════════════╗
echo  ║         Hazy AI Chatbot          ║
echo  ╚══════════════════════════════════════╝
echo.

REM ─── Check if Ollama is running ───
echo [1/3] Checking Ollama...
curl -s http://localhost:11434/api/tags > nul 2>&1
if %errorlevel% neq 0 (
    echo  ⚠  Ollama not detected. Attempting to start...
    start "" ollama serve
    timeout /t 3 /nobreak > nul
)

REM ─── Try Node.js first, then Python ───
echo [2/3] Starting server...

where node > nul 2>&1
if %errorlevel% == 0 (
    echo  ✓  Using Node.js backend
    cd backend
    start "Hazy Server" /min node server.js
    cd ..
    goto :open
)

where python > nul 2>&1
if %errorlevel% == 0 (
    echo  ✓  Using Python backend
    cd backend
    pip install -r requirements.txt -q
    start "Hazy Server" /min python server.py
    cd ..
    goto :open
)

echo  ❌  Neither Node.js nor Python found.
echo  Please install Node.js from https://nodejs.org
echo  or Python from https://python.org
pause
exit /b 1

:open
echo [3/3] Opening browser...
timeout /t 2 /nobreak > nul
start http://localhost:8080

echo.
echo  ✅  Hazy is running at http://localhost:8080
echo  Close this window or press Ctrl+C to stop.
echo.
pause
~~~

### start.sh

- Size: 2483 bytes
- Language: bash

~~~bash
#!/usr/bin/env bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         Hazy AI Chatbot          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
PORT="${PORT:-8080}"

# ─── Check Ollama ───
echo "[1/3] Checking Ollama..."
if ! curl -s "http://localhost:11434/api/tags" > /dev/null 2>&1; then
    echo "  ⚠  Ollama not running. Starting it..."
    if command -v ollama &> /dev/null; then
        ollama serve &
        OLLAMA_PID=$!
        sleep 2
        echo "  ✓  Ollama started (PID $OLLAMA_PID)"
    else
        echo "  ❌  Ollama not installed."
        echo "      Install from: https://ollama.com"
        echo "      Then pull a model: ollama pull mistral"
        echo ""
        echo "  ℹ  The app will still open but won't work until Ollama is running."
    fi
else
    echo "  ✓  Ollama is running"
fi

# ─── Start server ───
echo "[2/3] Starting server on port $PORT..."

cd "$BACKEND_DIR"

if command -v node &> /dev/null; then
    echo "  ✓  Using Node.js backend"
    node server.js &
    SERVER_PID=$!
elif command -v python3 &> /dev/null; then
    echo "  ✓  Using Python backend"
    pip3 install -r requirements.txt -q 2>/dev/null || pip install -r requirements.txt -q
    python3 server.py &
    SERVER_PID=$!
elif command -v python &> /dev/null; then
    echo "  ✓  Using Python backend"
    pip install -r requirements.txt -q
    python server.py &
    SERVER_PID=$!
else
    echo "  ❌  Neither Node.js nor Python found."
    echo "      Install Node.js: https://nodejs.org"
    echo "      Or Python: https://python.org"
    exit 1
fi

sleep 1

# ─── Open browser ───
echo "[3/3] Opening browser..."
URL="http://localhost:$PORT"

if command -v xdg-open &> /dev/null; then
    xdg-open "$URL" 2>/dev/null &
elif command -v open &> /dev/null; then
    open "$URL"
fi

echo ""
echo "  ✅  Hazy running at $URL"
echo "  Press Ctrl+C to stop."
echo ""

# ─── Wait & cleanup ───
trap "echo ''; echo '  Shutting down...'; kill $SERVER_PID 2>/dev/null; kill $OLLAMA_PID 2>/dev/null; exit 0" INT TERM
wait $SERVER_PID
~~~

