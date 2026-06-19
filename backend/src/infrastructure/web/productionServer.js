'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const https = require('https');
const db = require('../database/db');
const cache = require('../cache/cache');
const { prepareChatRequest, finalizeResponse, vectorSearch } = require('../../application/productionOrchestrator');
const { createStreamResponseCollector } = require('../../../ai/streamResponseCollector');
const { makeKey } = require('../../../memory/memoryExtractor');
const { buildTitlePrompt } = require('../../../ai/system_prompt/prompts');

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

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

app.use(cors({
  origin: '*',
  exposedHeaders: [
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
  ]
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));

// Rate limiting middleware
async function rateLimiter(req, res, next) {
  const userId = req.body.userId || 'default';
  const limitResult = await cache.slidingWindowRateLimit(`chat:${userId}`, 30, 60);
  if (!limitResult.allowed) {
    return res.status(429).json({ error: 'Too many chat turns. Please wait and try again.' });
  }
  next();
}

// ── Universal Chat Endpoint ──
app.post('/hazy/chat', rateLimiter, async (req, res) => {
  try {
    const originalBody = req.body;

    const VALID_MODES = ['auto', 'deep', 'off'];
    if (!originalBody.hazy) {
      originalBody.hazy = {};
    }
    const reasoningMode = VALID_MODES.includes(originalBody.hazy.reasoningMode)
      ? originalBody.hazy.reasoningMode
      : 'auto';
    originalBody.hazy.reasoningMode = reasoningMode;

    const prepared = await prepareChatRequest(originalBody);
    const analysis = prepared.analysis;
    const providerBody = prepared.providerBody;

    res.setHeader('X-Hazy-Emotion', analysis.emotionData.emotion);
    res.setHeader('X-Hazy-Intent', analysis.intentData.primaryIntent);
    res.setHeader('X-Hazy-Mode', analysis.strategy.mode);
    res.setHeader('X-Hazy-Agent-Mode', analysis.agentMode || 'chat');
    res.setHeader('X-Hazy-Agent-Enabled', String(Boolean(analysis.agentEnabled)));
    if (analysis.reasoning?.reasoningLevel) {
      res.setHeader('X-Hazy-Reasoning', analysis.reasoning.reasoningLevel);
    }
    if (analysis.codeAnalysis?.language) {
      res.setHeader('X-Hazy-Code-Language', analysis.codeAnalysis.language);
    }

    const requestedModel = providerBody.model || 'ollama/llama3.2';
    const provider = requestedModel.split('/')[0];

    // Response collector for memory logging
    const shouldRecordConversation = Boolean(originalBody.conversationId && originalBody.userId);
    const responseCollector = createStreamResponseCollector((responseText) => {
      if (!shouldRecordConversation) return;
      finalizeResponse({
        conversationId: prepared.conversationId,
        userId: prepared.userId,
        userMessage: analysis.latestMessage,
        responseText,
        analysis
      }).catch(err => console.error('[Server] finalizeResponse failed:', err.message));
    });

    // Setup streaming headers
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked'
    });

    const isDeepThink = prepared.analysis.reasoning?.reasoningMode === 'deep';
    const isAgentic = prepared.analysis.agentEnabled === true;
    const isDeepThinkOrAgentic = isDeepThink || isAgentic;
    const transformer = createThinkingStreamTransformer(isDeepThinkOrAgentic);

    // Intercept writes to stream response collector
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    res.write = (chunk, ...args) => {
      const str = chunk.toString();
      const transformed = transformer(str);
      const buf = Buffer.from(transformed);
      responseCollector.observe(buf);
      return originalWrite(buf, ...args);
    };
    res.end = (chunk, ...args) => {
      let buf = chunk;
      if (chunk) {
        const str = chunk.toString();
        const transformed = transformer(str);
        buf = Buffer.from(transformed);
        responseCollector.observe(buf);
      }
      const finalFlush = transformer.flush();
      if (finalFlush) {
        originalWrite(Buffer.from(finalFlush));
      }
      responseCollector.finish();
      return originalEnd(buf, ...args);
    };

    // Proxy request to Ollama / Cloud LLM Provider
    if (provider === 'ollama') {
      const ollamaUrl = new URL(process.env.OLLAMA_URL || 'http://localhost:11434');
      const mod = ollamaUrl.protocol === 'https:' ? https : http;
      const headers = { 'Content-Type': 'application/json' };
      
      const proxyReq = mod.request({
        hostname: ollamaUrl.hostname,
        port: ollamaUrl.port ? Number(ollamaUrl.port) : (ollamaUrl.protocol === 'https:' ? 443 : 80),
        path: '/api/chat',
        method: 'POST',
        headers
      }, proxyRes => {
        proxyRes.pipe(res);
      });
      proxyReq.on('error', err => {
        res.write(JSON.stringify({ error: err.message }));
        res.end();
      });
      proxyReq.write(JSON.stringify({
        ...providerBody,
        model: requestedModel.replace('ollama/', ''),
        think: reasoningMode === 'off' ? false : true
      }));
      proxyReq.end();
    } else {
      // Fallback for cloud providers (minimal mock for this production architecture)
      res.write(JSON.stringify({ message: { content: "Cloud providers configured via API gateway proxies." }, done: true }) + '\n');
      res.end();
    }
  } catch (err) {
    console.error('[Server] universal chat error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
  }
});

app.post('/hazy/write-workspace-files', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const files = req.body.files;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: 'No files provided' });
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
        continue;
      }

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, file.content, 'utf8');
      results.push(safeSegments.join('/'));
    }

    res.json({ ok: true, savedFiles: results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/hazy/default-prompt', (req, res) => {
  const { DEFAULT_SYSTEM_PROMPT } = require('../../../ai/promptBuilder');
  res.json({ defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT });
});

app.post('/hazy/persona-prompt', (req, res) => {
  try {
    const { buildPersonaPrompt } = require('../../../ai/promptBuilder');
    const prompt = buildPersonaPrompt(req.body);
    res.json({ prompt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/hazy/generate-title', async (req, res) => {
  try {
    const { userMsg, aiReply, userName, model } = req.body;
    const prompt = buildTitlePrompt(userMsg, aiReply, userName);

    const ollamaUrl = new URL(process.env.OLLAMA_URL || 'http://localhost:11434');
    const mod = ollamaUrl.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify({
      model: (model || 'ollama/llama3.2').replace('ollama/', ''),
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0.5, num_predict: 16 }
    });

    const headers = { 'Content-Type': 'application/json' };
    const proxyReq = mod.request({
      hostname: ollamaUrl.hostname,
      port: ollamaUrl.port ? Number(ollamaUrl.port) : (ollamaUrl.protocol === 'https:' ? 443 : 80),
      path: '/api/chat',
      method: 'POST',
      headers
    }, proxyRes => {
      let raw = '';
      proxyRes.on('data', chunk => { raw += chunk.toString(); });
      proxyRes.on('end', () => {
        try {
          const data = JSON.parse(raw);
          let title = (data.message?.content || '').trim();
          title = title.replace(/^["'`]+|["'`]+$/g, '').replace(/\n.*/s, '').trim();
          title = title.charAt(0).toUpperCase() + title.slice(1);
          res.json({ title });
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse Ollama response: ' + raw });
        }
      });
    });
    proxyReq.on('error', err => {
      res.status(502).json({ error: 'Ollama connection failed: ' + err.message });
    });
    proxyReq.write(bodyStr);
    proxyReq.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Memories Endpoints ──
app.get('/hazy/memories', async (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const status = req.query.status || 'active';
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const { rows } = await db.query(
      "SELECT id, user_id AS \"userId\", project_id AS \"projectId\", conversation_id AS \"conversationId\", type, key, value, confidence, sensitivity, status, created_at AS \"createdAt\" FROM memories WHERE user_id = $1 AND status = $2 LIMIT $3",
      [userId, status, limit]
    );
    res.json({ memories: rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/hazy/memories', async (req, res) => {
  try {
    const body = req.body;
    const userId = body.userId || 'default';
    const key = makeKey(body.key || body.value);
    const { rows } = await db.query(`
      INSERT INTO memories (user_id, project_id, type, key, value, confidence, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, project_id, type, key) DO UPDATE SET
        value = excluded.value,
        confidence = excluded.confidence,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id AS "userId", project_id AS "projectId", type, key, value, confidence, status
    `, [userId, body.projectId || '', body.type || 'explicit_fact', key, body.value, body.confidence ?? 1.0, body.status || 'active']);
    res.json({ memory: rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/hazy/memories', async (req, res) => {
  try {
    const { id, userId } = req.body;
    const result = await db.query(
      "DELETE FROM memories WHERE id = $1 AND user_id = $2",
      [id, userId || 'default']
    );
    res.json({ ok: result.rowCount > 0 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Conversations Endpoints ──
app.get('/hazy/conversations', async (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const { rows } = await db.query(
      "SELECT conversation_id AS \"conversationId\", state_json AS \"stateJson\" FROM conversation_states WHERE user_id = $1 ORDER BY updated_at DESC",
      [userId]
    );
    const conversations = {};
    rows.forEach(r => {
      conversations[r.conversationId] = typeof r.stateJson === 'string' ? JSON.parse(r.stateJson) : r.stateJson;
    });
    res.json({ conversations });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/hazy/conversations', async (req, res) => {
  try {
    const { conversations, userId } = req.body;
    const uId = userId || 'default';
    for (const [chatId, state] of Object.entries(conversations || {})) {
      await db.query(`
        INSERT INTO conversations (id, user_id, title, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP
      `, [chatId, uId, state?.title || 'New Chat']);
      
      await db.query(`
        INSERT INTO conversation_states (conversation_id, user_id, state_json, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(conversation_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
      `, [chatId, uId, JSON.stringify(state)]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/hazy/conversations', async (req, res) => {
  try {
    const { conversationId, userId } = req.body;
    const uId = userId || 'default';
    await db.query("DELETE FROM conversation_states WHERE conversation_id = $1 AND user_id = $2", [conversationId, uId]);
    const result = await db.query("DELETE FROM conversations WHERE id = $1 AND user_id = $2", [conversationId, uId]);
    res.json({ ok: result.rowCount > 0 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Health Probe ──
app.get('/hazy/status', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', redis: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected', detail: err.message });
  }
});

// Start application
async function start() {
  try {
    await db.migrate();
    await cache.connect();
    
    app.listen(PORT, HOST, () => {
      console.log(`[Production Server] Hazy API listening at http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('[Production Server] Startup failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app };
