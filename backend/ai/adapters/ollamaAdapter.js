'use strict';

const http = require('http');
const https = require('https');

/**
 * Creates a fetchFn adapter for Ollama that streams chunks back via onChunk
 * and resolves with the final full response object.
 * 
 * @param {Object} config - Provider configuration
 * @returns {Function} fetchFn compatible with AIRuntime
 */
function createOllamaAdapter(config) {
  return function fetchFn({ messages, format, tools, onChunk }) {
    return new Promise((resolve, reject) => {
      const ollamaUrl = new URL(config.baseUrl || 'http://localhost:11434');
      const body = {
        model: config.model.replace('ollama/', ''),
        messages,
        stream: true
      };

      if (format) body.format = format;
      if (tools && tools.length > 0) body.tools = tools;

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
          res.on('end', () => reject(new Error(`Ollama HTTP ${res.statusCode}: ${errorData}`)));
          return;
        }

        let fullText = '';
        let toolCallsRaw = [];
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          
          // Process NDJSON stream
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              
              if (data.message) {
                if (data.message.content) {
                  fullText += data.message.content;
                  if (onChunk) {
                    // Send NDJSON format expected by UI
                    onChunk(JSON.stringify({ message: { content: data.message.content }, done: false }) + '\n');
                  }
                }
                if (data.message.tool_calls) {
                  toolCallsRaw = data.message.tool_calls;
                }
              }

              if (data.done) {
                if (onChunk) {
                  onChunk(JSON.stringify({ done: true }) + '\n');
                }
              }
            } catch (err) {
              console.warn('[OllamaAdapter] JSON parse error on stream chunk', err.message);
            }
          }
        });

        res.on('end', () => {
          resolve({
            text: fullText,
            content: fullText,
            toolCalls: toolCallsRaw
          });
        });
      });

      req.on('error', reject);
      req.write(bodyData);
      req.end();
    });
  };
}

module.exports = { createOllamaAdapter };
