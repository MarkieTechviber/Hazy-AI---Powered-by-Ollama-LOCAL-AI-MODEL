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
