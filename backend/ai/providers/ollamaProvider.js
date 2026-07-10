'use strict';

const http = require('http');
const https = require('https');
const ProviderInterface = require('./providerInterface');
const { TransientError, PermanentError } = require('../errors');

class OllamaProvider extends ProviderInterface {
  constructor(config = {}) {
    super();
    this.config = config;
  }

  get name() {
    return 'ollama';
  }

  async getMetadata(modelId) {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    try {
      const showRes = await fetch(`${baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId.replace('ollama/', '') })
      });
      if (showRes.ok) {
        const data = await showRes.json();
        return { digest: data.digest || '' };
      }
    } catch (err) {
      console.warn(`[OllamaProvider] Failed to fetch digest for ${modelId}:`, err.message);
    }
    return {};
  }

  async executeStream({ modelId, payload = {}, onEvent, signal }) {
    return new Promise((resolve, reject) => {
      const ollamaUrl = new URL(this.config.baseUrl || 'http://localhost:11434');
      const canListenForAbort = Boolean(signal && typeof signal.addEventListener === 'function');
      const body = {
        model: modelId.replace('ollama/', ''),
        messages: payload.messages || [],
        stream: true
      };

      if (payload.options) body.options = payload.options;
      if (typeof payload.think === 'boolean') body.think = payload.think;
      if (payload.options && payload.options.format) body.format = payload.options.format;
      if (payload.format) body.format = payload.format;
      if (payload.tools && payload.tools.length > 0) body.tools = payload.tools;

      const bodyData = JSON.stringify(body);
      const options = {
        hostname: ollamaUrl.hostname,
        port: ollamaUrl.port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyData)
        }
      };

      const requestModule = ollamaUrl.protocol === 'https:' ? https : http;
      
      const req = requestModule.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', chunk => errorData += chunk);
          res.on('end', () => {
            if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 404) {
              reject(new PermanentError(`Ollama HTTP ${res.statusCode}: ${errorData}`));
            } else {
              reject(new TransientError(`Ollama HTTP ${res.statusCode}: ${errorData}`));
            }
          });
          return;
        }

        if (canListenForAbort) {
          signal.addEventListener('abort', () => {
            res.destroy();
            reject(new TransientError('Request aborted by user'));
          }, { once: true });
        }

        let fullText = '';
        let toolCallsRaw = [];
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          
          const lines = buffer.split('\n');
          buffer = lines.pop(); 

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              
              if (data.message) {
                if (data.message.thinking) {
                  if (onEvent) {
                    onEvent({ type: 'THINKING_DELTA', content: data.message.thinking });
                  }
                }
                if (data.message.content) {
                  fullText += data.message.content;
                  if (onEvent) {
                    onEvent({ type: 'TEXT_DELTA', content: data.message.content });
                  }
                }
                if (data.message.tool_calls) {
                  toolCallsRaw = data.message.tool_calls;
                  // For rich event streaming, simulate tool events based on payload parsing
                  // (Ollama sends them all at once at the end currently)
                  for (const toolCall of toolCallsRaw) {
                    if (onEvent) {
                      onEvent({ type: 'TOOL_CALL_STARTED', name: toolCall.function.name });
                      onEvent({ type: 'TOOL_ARGUMENT', chunk: JSON.stringify(toolCall.function.arguments) });
                      onEvent({ type: 'TOOL_FINISHED', name: toolCall.function.name });
                    }
                  }
                }
              }

              if (data.done && onEvent) {
                onEvent({ type: 'DONE' });
              }
            } catch (err) {
              console.warn('[OllamaProvider] JSON parse error on stream chunk', err.message);
            }
          }
        });

        res.on('error', (err) => {
           reject(new TransientError(`Ollama stream error: ${err.message}`));
        });

        res.on('end', () => {
          resolve({
            text: fullText,
            content: fullText,
            toolCalls: toolCallsRaw
          });
        });
      });

      req.on('error', (err) => {
         if (signal && signal.aborted) {
           reject(new TransientError('Request aborted by user'));
         } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
           reject(new TransientError(`Ollama connection error: ${err.message}`));
         } else {
           reject(new TransientError(err.message));
         }
      });

      if (canListenForAbort) {
        signal.addEventListener('abort', () => {
          req.destroy();
          reject(new TransientError('Request aborted by user'));
        }, { once: true });
      }

      req.write(bodyData);
      req.end();
    });
  }
}

module.exports = OllamaProvider;
