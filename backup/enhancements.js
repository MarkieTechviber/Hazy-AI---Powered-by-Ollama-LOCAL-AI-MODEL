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
