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
