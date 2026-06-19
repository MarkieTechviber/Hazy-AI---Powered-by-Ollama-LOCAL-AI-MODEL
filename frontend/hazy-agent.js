/**
 * ============================================================================
 * HAZY AGENT MODE - Tool Use & Function Calling
 * Feature #19 - Autonomous AI Agent with Tools
 * ============================================================================
 * 
 * FEATURES:
 * - Function/Tool calling framework
 * - Browser-local tools: calculator, code_executor, file_ops
 * - Web search is owned by the backend search pipeline
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
    return ['anthropic', 'openai', 'groq', 'gemini', 'nvidia'].includes(provider);
  }

  function buildAgentEndpoint() {
    return window.location.protocol === 'file:'
      ? `${STATE.ollamaUrl}/api/chat`
      : '/hazy/agent';
  }

  async function callBackendTool(toolName, args) {
    const response = await fetch('/hazy/tool-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'local-user',
        conversationId: STATE.activeConvId || 'default',
        toolName,
        arguments: args
      })
    });
    const result = await response.json();
    if (!response.ok || result.status === 'blocked') {
      throw new Error(result.error?.message || result.error || 'Tool call was rejected.');
    }
    return result.result;
  }

  // ============================================================================
  // BUILT-IN TOOLS
  // ============================================================================

  const BUILTIN_TOOLS = {
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
          const result = await callBackendTool('calculator.evaluate', {
            expression: params.expression
          });
          return {
            success: true,
            result: result?.data?.value ?? result,
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
      execute: async () => ({
        success: false,
        error: 'Browser code execution is disabled. A future isolated sandbox service is required.'
      })
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
      if (document.getElementById('pageNav') && typeof window.setHazyPage === 'function') {
        window.setHazyPage('agent');
      }
    }

    disable() {
      this.isEnabled = false;
      localStorage.setItem('hazyAgentEnabled', 'false');
      if (document.getElementById('pageNav') && typeof window.setHazyPage === 'function' && this.isActive()) {
        window.setHazyPage('chat');
      }
    }

    isActive() {
      if (document.getElementById('pageNav')) {
        if (typeof window.getHazyPage === 'function') return window.getHazyPage() === 'agent';
        return document.body?.dataset?.hazyPage === 'agent';
      }
      return this.isEnabled;
    }

    registerTool(tool) {
      if (!tool.name || !tool.description || !tool.execute) {
        throw new Error('Invalid tool: must have name, description, and execute function');
      }
      this.tools[tool.name] = tool;
      console.log(`✅ Registered tool: ${tool.name}`);
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
      // Hazy is page-driven now: the sidebar owns Chat vs Agentic Mode.
      // Keep this module only as a tool registry/legacy compatibility layer.
      if (document.getElementById('pageNav')) {
        const legacyIndicator = document.getElementById('agentIndicator');
        if (legacyIndicator) legacyIndicator.remove();
        return;
      }

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
      if (!this.modal && typeof window.setHazyPage === 'function') {
        window.setHazyPage('agent');
        return;
      }
      this.modal?.classList.add('open');
      this.refreshToolsList();
      this.refreshHistory();
    }

    closeModal() {
      this.modal?.classList.remove('open');
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
      const pageDriven = Boolean(document.getElementById('pageNav'));
      const enabled = pageDriven ? this.agent.isActive() : localStorage.getItem('hazyAgentEnabled') === 'true';
      const maxIterations = localStorage.getItem('hazyAgentMaxIterations') || '5';
      
      const toggle = this.modal?.querySelector('#agentEnableToggle');
      const iterInput = this.modal?.querySelector('#agentMaxIterations');
      
      if (toggle) toggle.checked = enabled;
      if (iterInput) iterInput.value = maxIterations;
      
      if (!pageDriven && enabled) this.agent.enable();
      this.agent.maxIterations = parseInt(maxIterations, 10) || 5;
      
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
