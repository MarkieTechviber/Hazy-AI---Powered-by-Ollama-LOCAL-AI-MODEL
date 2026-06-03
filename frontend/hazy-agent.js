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

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getActiveAgentModel() {
    return localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
  }

  function getProviderFromModel(model) {
    return (model || '').split('/')[0] || 'ollama';
  }

  function isCloudProvider(provider) {
    return ['anthropic', 'openai', 'groq', 'gemini'].includes(provider);
  }

  function buildAgentEndpoint() {
    return window.location.protocol === 'file:'
      ? `${STATE.ollamaUrl}/api/chat`
      : '/hazy/chat';
  }

  function isSafeCodeExpression(code) {
    if (typeof code !== 'string') return false;

    const trimmed = code.trim();
    if (!trimmed || trimmed.length > 400) return false;

    const blockedPatterns = [
      /\b(?:window|document|globalThis|self|parent|top|frames)\b/i,
      /\b(?:Function|eval|fetch|XMLHttpRequest|WebSocket|Worker|import)\b/i,
      /\b(?:localStorage|sessionStorage|indexedDB|navigator|location|history)\b/i,
      /\b(?:constructor|prototype|__proto__|this|new)\b/i,
      /[;={}]/,
      /=>/
    ];

    return blockedPatterns.every(pattern => !pattern.test(trimmed));
  }

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
      description: 'Evaluate small JavaScript expressions for math/data work only. This is intentionally restricted and is not a secure sandbox.',
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
          if (!isSafeCodeExpression(params.code)) {
            return {
              success: false,
              error: 'Only simple JavaScript expressions are allowed in code_executor.'
            };
          }

          const sandbox = {
            Math,
            Date,
            JSON,
            Array,
            Object,
            String,
            Number,
            Boolean
          };

          const func = new Function(
            ...Object.keys(sandbox),
            '"use strict"; return (' + params.code + ');'
          );
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

      return `You are Hazy, the user's local companion, and you have access to the following tools. When you need to use a tool, respond with a JSON object in this EXACT format:

{
  "thought": "Why I'm using this tool",
  "tool": "tool_name",
  "parameters": { "param": "value" }
}

After using a tool, you'll receive the result and can use another tool or provide a final answer.

AVAILABLE TOOLS:
${toolDescriptions}

IMPORTANT:
- Keep presenting yourself as Hazy, a companion who can help with support, thinking, and practical tasks.
- Do not use old assistant-style labels, model labels, bot labels, or mechanical self-descriptions.
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
      let iteration = 0;
      const messages = [{ role: 'user', content: userMessage }];

      // Add tool instructions to system prompt
      const agentPrompt = this.getToolsPrompt();
      const originalSystemPrompt = STATE.systemPrompt;
      STATE.systemPrompt = agentPrompt + '\n\n' + originalSystemPrompt;

      try {
        while (iteration < this.maxIterations) {
          iteration++;

          // Get Hazy response
          const response = await this.getAIResponse(messages);
          
          // Check if response contains a tool call
          const toolCall = this.parseToolCall(response);
          messages.push({ role: 'assistant', content: response });

          if (!toolCall) {
            // No tool call - this is the final answer
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
          messages.push({
            role: 'user',
            content: `Tool result for ${toolCall.tool}: ${JSON.stringify(toolResult)}\n\nContinue reasoning. If you need another tool, respond with JSON only. Otherwise provide the final answer.`
          });
        }

        // Max iterations reached
        return {
          useAgent: true,
          finalResponse: 'Agent reached maximum iterations. Here\'s what I found:\n\n' + 
                        this.summarizeToolCalls(),
          toolCalls: this.toolCallHistory
        };

      } catch (error) {
        console.error('Agent loop error:', error);
        return {
          useAgent: false,
          error: error.message
        };
      } finally {
        STATE.systemPrompt = originalSystemPrompt;
      }
    }

    async getAIResponse(messageInput) {
      const savedModel = getActiveAgentModel();
      const provider = getProviderFromModel(savedModel);
      const isCloud = isCloudProvider(provider);
      const apiKey = isCloud ? (localStorage.getItem('hazyKey_' + provider) || '') : '';
      const endpoint = buildAgentEndpoint();
      const messages = Array.isArray(messageInput)
        ? messageInput
        : [{ role: 'user', content: String(messageInput) }];

      const requestBody = {
        model: endpoint === '/hazy/chat' ? savedModel : STATE.model,
        apiKey: apiKey || undefined,
        messages: [
          { role: 'system', content: STATE.systemPrompt },
          ...messages
        ],
        stream: false,
        options: {
          temperature: STATE.temperature,
          num_predict: Math.min(STATE.maxTokens || 2048, 2048),
          max_tokens: Math.min(STATE.maxTokens || 2048, 2048),
          top_p: STATE.topP,
          top_k: STATE.topK,
          repeat_penalty: STATE.repeatPenalty,
          num_ctx: STATE.contextSize
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Agent request failed (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        return data.message?.content || data.choices?.[0]?.message?.content || '';
      }

      const rawText = await response.text();
      const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
      let combined = '';

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          combined += parsed.message?.content || '';
        } catch (error) {
          // Ignore malformed streaming fragments and keep best-effort output.
        }
      }

      return combined || rawText.trim();
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
        <div class="tool-thought">${escapeHtml(toolCall.thought)}</div>
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
          <pre>${escapeHtml(String(resultText))}</pre>
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
      const mountTarget = document.querySelector('.header-right')
        || document.querySelector('.input-mode-bar')
        || document.querySelector('.conversation-header')
        || document.querySelector('.topbar-actions');
      const agentBtn = document.getElementById('agentBtn') || document.createElement('button');
      const legacyIndicator = document.getElementById('agentIndicator');

      if (legacyIndicator && legacyIndicator.parentElement?.id === 'legacy-hooks') {
        legacyIndicator.remove();
      }

      agentBtn.className = 'icon-btn';
      agentBtn.title = 'Agent Mode';
      agentBtn.setAttribute('aria-label', 'Agent Mode');
      agentBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <span class="agent-indicator" id="agentIndicator"></span>
      `;

      if (mountTarget && !mountTarget.contains(agentBtn)) {
        mountTarget.appendChild(agentBtn);
      }

      this.createModal();
    }

    createModal() {
      const modal = document.createElement('div');
      modal.id = 'agentModal';
      modal.className = 'modal-overlay agent-modal-overlay';
      modal.innerHTML = `
        <div class="modal modal-compact agent-modal-content">
          <div class="modal-header">
            <h2>Agent Mode</h2>
            <button class="modal-close" id="agentCloseBtn" aria-label="Close Agent Mode">&times;</button>
          </div>
          
          <div class="modal-body modal-body-padded agent-modal-body">
            <!-- Enable Toggle -->
            <div class="agent-enable-section">
              <label class="toggle-label">
                <input type="checkbox" id="agentEnableToggle">
                <span>Enable Agent Mode</span>
              </label>
              <p class="help-text">When enabled, Hazy can use tools to search the web, perform calculations, and evaluate small JavaScript expressions. The code tool is intentionally restricted and is not a secure sandbox.</p>
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
      this.modal?.querySelector('#agentCloseBtn')?.addEventListener('click', () => {
        this.closeModal();
      });

      this.modal?.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });

      // Enable toggle
      this.modal?.querySelector('#agentEnableToggle')?.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.agent.enable();
          this.updateIndicator();
          showToast('Agent Mode enabled - Hazy can now use tools', 'success');
        } else {
          this.agent.disable();
          this.updateIndicator();
          showToast('Agent Mode disabled', 'info');
        }
      });

      // Max iterations
      this.modal?.querySelector('#agentMaxIterations')?.addEventListener('change', (e) => {
        this.agent.maxIterations = parseInt(e.target.value);
        localStorage.setItem('hazyAgentMaxIterations', e.target.value);
      });
    }

    openModal() {
      this.modal.classList.add('open');
      this.refreshToolsList();
      this.refreshHistory();
    }

    closeModal() {
      this.modal.classList.remove('open');
    }

    refreshToolsList() {
      const tools = this.agent.getToolsList();
      const listEl = this.modal?.querySelector('#agentToolsList');
      const countEl = this.modal?.querySelector('#toolCount');
      
      if (!listEl || !countEl) return;

      countEl.textContent = tools.length;

      listEl.innerHTML = tools.map(tool => `
        <div class="agent-tool-item">
          <div class="tool-icon">🔧</div>
          <div class="tool-info">
            <div class="tool-name">${escapeHtml(tool.name)}</div>
            <div class="tool-description">${escapeHtml(tool.description)}</div>
          </div>
        </div>
      `).join('');
    }

    refreshHistory() {
      const history = this.agent.toolCallHistory;
      const historyEl = this.modal?.querySelector('#agentHistory');
      
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
              ${call.result.success ? '✅' : '❌'} ${escapeHtml(String(call.result.result || call.result.error))}
            </div>
          </div>
        `;
      }).join('');
    }

    loadState() {
      const enabled = localStorage.getItem('hazyAgentEnabled') === 'true';
      const maxIterations = localStorage.getItem('hazyAgentMaxIterations') || '5';
      
      const toggle = this.modal?.querySelector('#agentEnableToggle');
      const iterInput = this.modal?.querySelector('#agentMaxIterations');
      
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
