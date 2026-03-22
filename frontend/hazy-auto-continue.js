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
