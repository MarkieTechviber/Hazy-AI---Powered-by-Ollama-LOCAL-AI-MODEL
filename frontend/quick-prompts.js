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
    label: '💻 Write Code',
    prompt: 'Write production-ready, well-commented code for: ',
    description: 'Generate clean, documented code',
    category: 'code'
  },
  '/debug': {
    label: '🐛 Debug Code',
    prompt: 'Debug this code and fix all errors. Explain what was wrong:\n\n',
    description: 'Find and fix bugs',
    category: 'code'
  },
  '/refactor': {
    label: '♻️ Refactor Code',
    prompt: 'Refactor this code to be more efficient, readable, and maintainable:\n\n',
    description: 'Improve code quality',
    category: 'code'
  },
  '/review': {
    label: '👀 Code Review',
    prompt: 'Review this code for bugs, security issues, and best practices:\n\n',
    description: 'Professional code review',
    category: 'code'
  },
  '/test': {
    label: '🧪 Write Tests',
    prompt: 'Write comprehensive unit tests for this code:\n\n',
    description: 'Generate test cases',
    category: 'code'
  },

  // Explanation
  '/explain': {
    label: '📖 Explain Simply',
    prompt: 'Explain this concept in simple terms that anyone can understand: ',
    description: 'ELI5 explanation',
    category: 'learning'
  },
  '/deep': {
    label: '🔬 Deep Dive',
    prompt: 'Provide a detailed, technical explanation of: ',
    description: 'In-depth analysis',
    category: 'learning'
  },
  '/compare': {
    label: '⚖️ Compare',
    prompt: 'Compare and contrast these concepts with pros/cons: ',
    description: 'Side-by-side comparison',
    category: 'learning'
  },

  // Writing
  '/write': {
    label: '✍️ Write Content',
    prompt: 'Write professional, engaging content about: ',
    description: 'Content creation',
    category: 'writing'
  },
  '/improve': {
    label: '✨ Improve Writing',
    prompt: 'Improve this text for clarity, grammar, and impact:\n\n',
    description: 'Polish your writing',
    category: 'writing'
  },
  '/summarize': {
    label: '📝 Summarize',
    prompt: 'Provide a concise summary of:\n\n',
    description: 'Quick summary',
    category: 'writing'
  },
  '/translate': {
    label: '🌐 Translate',
    prompt: 'Translate this to [language]:\n\n',
    description: 'Language translation',
    category: 'writing'
  },

  // Business
  '/email': {
    label: '📧 Draft Email',
    prompt: 'Draft a professional email about: ',
    description: 'Email composition',
    category: 'business'
  },
  '/plan': {
    label: '📋 Create Plan',
    prompt: 'Create a detailed action plan for: ',
    description: 'Strategic planning',
    category: 'business'
  },
  '/analyze': {
    label: '📊 Analyze Data',
    prompt: 'Analyze this data and provide insights:\n\n',
    description: 'Data analysis',
    category: 'business'
  },

  // Creative
  '/brainstorm': {
    label: '💡 Brainstorm Ideas',
    prompt: 'Generate creative ideas for: ',
    description: 'Idea generation',
    category: 'creative'
  },
  '/story': {
    label: '📚 Write Story',
    prompt: 'Write a creative story about: ',
    description: 'Storytelling',
    category: 'creative'
  },

  // Problem Solving
  '/solve': {
    label: '🎯 Solve Problem',
    prompt: 'Help me solve this problem step-by-step: ',
    description: 'Problem-solving',
    category: 'problem'
  },
  '/optimize': {
    label: '⚡ Optimize',
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
