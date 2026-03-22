/**
 * UI Integration for Hazy Enhancements
 * Connects UI elements to enhancement modules
 */

// Global variables for current template fill
let currentTemplate = null;
let templateValues = {};

// ========================================
// MODAL FUNCTIONS
// ========================================

function openExportModal() {
  document.getElementById('exportModal').classList.add('show');
}

function openImportModal() {
  document.getElementById('importModal').classList.add('show');
}

function openTemplatesModal() {
  document.getElementById('templatesModal').classList.add('show');
  renderTemplates();
}

function openKnowledgeModal() {
  document.getElementById('knowledgeModal').classList.add('show');
  renderKnowledgeBase();
}

function openPerformanceModal() {
  document.getElementById('performanceModal').classList.add('show');
  renderPerformanceStats();
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

function exportCurrentChat(format) {
  if (!STATE.activeConvId) {
    showToast('No active conversation', 'error');
    return;
  }
  
  switch(format) {
    case 'json':
      ExportImportSystem.exportAsJSON(STATE.activeConvId);
      break;
    case 'markdown':
      ExportImportSystem.exportAsMarkdown(STATE.activeConvId);
      break;
    case 'html':
      ExportImportSystem.exportAsHTML(STATE.activeConvId);
      break;
  }
  
  document.getElementById('exportModal').classList.remove('show');
}

// ========================================
// IMPORT FUNCTIONS
// ========================================

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  if (!file.name.endsWith('.json')) {
    showToast('Please select a JSON file', 'error');
    return;
  }
  
  ExportImportSystem.importFromJSON(file);
  input.value = ''; // Reset input
  document.getElementById('importModal').classList.remove('show');
}

// ========================================
// TEMPLATE FUNCTIONS
// ========================================

function renderTemplates(category = 'all') {
  const grid = document.getElementById('templateGrid');
  if (!grid) return;
  
  const templates = category === 'all' 
    ? PromptTemplates.getAllTemplates()
    : PromptTemplates.getTemplatesByCategory(category);
  
  grid.innerHTML = templates.map(template => `
    <div class="template-card" onclick="selectTemplate('${template.id}')">
      <div class="template-card-header">
        <div class="template-name">${template.name}</div>
        <div class="template-category">${template.category}</div>
      </div>
      <div class="template-description">${template.description}</div>
      <div class="template-variables">
        ${template.variables.map(v => `<span class="template-variable">{{${v}}}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function filterTemplates(category) {
  renderTemplates(category);
  
  // Update button states
  document.querySelectorAll('.templates-modal .btn-secondary').forEach(btn => {
    btn.classList.toggle('active', 
      btn.textContent.trim() === category || 
      (category === 'all' && btn.textContent.trim() === 'All')
    );
  });
}

function selectTemplate(templateId) {
  currentTemplate = PromptTemplates.getTemplate(templateId);
  if (!currentTemplate) return;
  
  templateValues = {};
  
  // Show fill modal
  document.getElementById('templatesModal').classList.remove('show');
  document.getElementById('templateFillModal').classList.add('show');
  document.getElementById('templateFillTitle').textContent = currentTemplate.name;
  
  // Render form
  const form = document.getElementById('templateFillForm');
  form.innerHTML = currentTemplate.variables.map(variable => `
    <div class="template-variable-input">
      <label class="template-variable-label">${variable.replace('_', ' ')}</label>
      <textarea 
        class="template-variable-field" 
        id="template-var-${variable}"
        placeholder="Enter ${variable}..."
        oninput="templateValues['${variable}'] = this.value"
      ></textarea>
    </div>
  `).join('');
}

function useFilledTemplate() {
  if (!currentTemplate) return;
  
  const filledPrompt = PromptTemplates.fillTemplate(currentTemplate.id, templateValues);
  
  // Insert into chat input
  const chatInput = document.getElementById('chatInput');
  chatInput.value = filledPrompt;
  autoResize(chatInput);
  chatInput.focus();
  
  // Close modal
  document.getElementById('templateFillModal').classList.remove('show');
  showToast(`✅ Template "${currentTemplate.name}" applied`, 'success');
}

// ========================================
// KNOWLEDGE BASE FUNCTIONS
// ========================================

async function handleKnowledgeFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  try {
    let content = '';
    
    if (file.type === 'application/pdf') {
      // Extract text from PDF using PDF.js
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        content += pageText + '\n\n';
      }
    } else {
      // Read as text
      content = await file.text();
    }
    
    await KnowledgeBase.addDocument(file.name, content, file.type);
    renderKnowledgeBase();
    input.value = ''; // Reset
  } catch (error) {
    showToast('Error adding document: ' + error.message, 'error');
    console.error(error);
  }
}

function renderKnowledgeBase() {
  const list = document.getElementById('knowledgeList');
  if (!list) return;
  
  const docs = KnowledgeBase.getAllDocuments();
  
  if (docs.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 48px; margin-bottom: 12px;">📚</div>
        <p>No documents in Knowledge Base</p>
        <p style="font-size: 13px; margin-top: 8px;">Add documents to reference in conversations</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = docs.map(doc => `
    <div class="knowledge-item">
      <div class="knowledge-item-content">
        <div class="knowledge-item-name">📄 ${doc.name}</div>
        <div class="knowledge-item-meta">
          <span>${new Date(doc.addedAt).toLocaleDateString()}</span>
          <span>${(doc.size / 1024).toFixed(1)} KB</span>
          <span>${doc.type}</span>
        </div>
      </div>
      <div class="knowledge-item-actions">
        <button class="knowledge-item-btn" onclick="useKnowledgeDoc('${doc.id}')">Use</button>
        <button class="knowledge-item-btn" onclick="removeKnowledgeDoc('${doc.id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

function searchKnowledgeBase() {
  const query = document.getElementById('knowledgeSearch').value.trim();
  const list = document.getElementById('knowledgeList');
  if (!list) return;
  
  if (!query) {
    renderKnowledgeBase();
    return;
  }
  
  const results = KnowledgeBase.search(query);
  
  if (results.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
        <p>No results found for "${query}"</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = results.map(doc => `
    <div class="knowledge-item">
      <div class="knowledge-item-content">
        <div class="knowledge-item-name">📄 ${doc.name}</div>
        <div class="knowledge-item-meta">
          <span>${new Date(doc.addedAt).toLocaleDateString()}</span>
          <span>${(doc.size / 1024).toFixed(1)} KB</span>
        </div>
        <div style="margin-top: 8px; font-size: 13px; color: var(--text-secondary); font-style: italic;">
          ${doc.snippet}
        </div>
      </div>
      <div class="knowledge-item-actions">
        <button class="knowledge-item-btn" onclick="useKnowledgeDoc('${doc.id}')">Use</button>
      </div>
    </div>
  `).join('');
}

function useKnowledgeDoc(docId) {
  const doc = KnowledgeBase.getDocument(docId);
  if (!doc) return;
  
  const chatInput = document.getElementById('chatInput');
  const context = `\n\n[From Knowledge Base - ${doc.name}]:\n${doc.content.substring(0, 2000)}${doc.content.length > 2000 ? '...' : ''}\n\n`;
  
  chatInput.value += context;
  autoResize(chatInput);
  chatInput.focus();
  
  document.getElementById('knowledgeModal').classList.remove('show');
  showToast(`📄 Added "${doc.name}" to context`, 'success');
}

function removeKnowledgeDoc(docId) {
  if (confirm('Remove this document from Knowledge Base?')) {
    KnowledgeBase.removeDocument(docId);
    renderKnowledgeBase();
  }
}

// ========================================
// PERFORMANCE FUNCTIONS
// ========================================

function renderPerformanceStats() {
  const stats = PerformanceMonitor.getStats();
  
  // Render summary stats
  const statsContainer = document.getElementById('performanceStats');
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="performance-stat-card">
        <div class="performance-stat-label">Total Requests</div>
        <div class="performance-stat-value">${stats.totalRequests}</div>
      </div>
      <div class="performance-stat-card">
        <div class="performance-stat-label">Success Rate</div>
        <div class="performance-stat-value">${stats.successRate}<span class="performance-stat-unit">%</span></div>
      </div>
      <div class="performance-stat-card">
        <div class="performance-stat-label">Total Tokens</div>
        <div class="performance-stat-value">${stats.totalTokens.toLocaleString()}</div>
      </div>
      <div class="performance-stat-card">
        <div class="performance-stat-label">Avg Response Time</div>
        <div class="performance-stat-value">${stats.avgDuration}<span class="performance-stat-unit">ms</span></div>
      </div>
    `;
  }
  
  // Render model stats
  const modelList = document.getElementById('performanceModelList');
  if (modelList) {
    const models = Object.entries(stats.models);
    
    if (models.length === 0) {
      modelList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>No model performance data yet</p>
        </div>
      `;
      return;
    }
    
    modelList.innerHTML = models.map(([modelName, modelStats]) => `
      <div class="performance-model-item">
        <div class="performance-model-name">
          🤖 ${modelName}
          <span style="font-size: 12px; font-weight: 400; color: var(--text-muted); margin-left: 8px;">
            Last used ${new Date(modelStats.lastUsed).toLocaleString()}
          </span>
        </div>
        <div class="performance-model-stats">
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Requests</div>
            <div class="performance-mini-value">${modelStats.totalRequests}</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Success</div>
            <div class="performance-mini-value">${modelStats.successfulRequests}</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Avg Time</div>
            <div class="performance-mini-value">${Math.round(modelStats.avgDuration)}ms</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Avg Tokens</div>
            <div class="performance-mini-value">${Math.round(modelStats.avgTokens)}</div>
          </div>
          <div class="performance-mini-stat">
            <div class="performance-mini-label">Total Tokens</div>
            <div class="performance-mini-value">${modelStats.totalTokens.toLocaleString()}</div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

document.addEventListener('keydown', function(e) {
  // Show shortcuts panel with ?
  if (e.key === '?' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    document.getElementById('shortcutsPanel').classList.toggle('show');
    return;
  }
  
  // Close modals with Escape
  if (e.key === 'Escape') {
    document.querySelectorAll('.export-modal, .import-modal, .templates-modal, .knowledge-modal, .performance-modal, .shortcuts-panel').forEach(modal => {
      modal.classList.remove('show');
    });
    return;
  }
  
  // Ctrl/Cmd shortcuts
  if (e.ctrlKey || e.metaKey) {
    switch(e.key.toLowerCase()) {
      case 'e':
        e.preventDefault();
        openExportModal();
        break;
      case 'i':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openImportModal();
        }
        break;
      case 't':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openTemplatesModal();
        }
        break;
      case 'b':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openKnowledgeModal();
        }
        break;
      case 'p':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          openPerformanceModal();
        }
        break;
    }
  }
});

// ========================================
// MESSAGE ENHANCEMENTS
// ========================================

function addMessageEnhancements(messageElement, messageId) {
  // Add action buttons container
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-actions';
  
  // Bookmark button
  const isBookmarked = MessageFeatures.isBookmarked(messageId);
  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.className = 'message-action-btn' + (isBookmarked ? ' active' : '');
  bookmarkBtn.innerHTML = '⭐';
  bookmarkBtn.title = 'Bookmark';
  bookmarkBtn.onclick = function() {
    const nowBookmarked = MessageFeatures.toggleBookmark(messageId);
    this.classList.toggle('active', nowBookmarked);
  };
  
  // Reaction button
  const reactionBtn = document.createElement('button');
  reactionBtn.className = 'message-action-btn';
  reactionBtn.innerHTML = '😊';
  reactionBtn.title = 'React';
  reactionBtn.onclick = function() {
    toggleReactionPicker(messageId, this);
  };
  
  actionsDiv.appendChild(bookmarkBtn);
  actionsDiv.appendChild(reactionBtn);
  messageElement.appendChild(actionsDiv);
  
  // Add existing reactions
  const reactions = MessageFeatures.getReactions(messageId);
  if (reactions.length > 0) {
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions';
    reactions.forEach(emoji => {
      const reactionSpan = document.createElement('span');
      reactionSpan.className = 'message-reaction';
      reactionSpan.textContent = emoji;
      reactionsDiv.appendChild(reactionSpan);
    });
    messageElement.appendChild(reactionsDiv);
  }
}

function toggleReactionPicker(messageId, button) {
  let picker = button.nextElementSibling;
  
  if (!picker || !picker.classList.contains('reaction-picker')) {
    picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = ['👍', '👎', '❤️', '🎯', '🔥', '💡'].map(emoji => 
      `<button class="reaction-btn" onclick="addReactionToMessage('${messageId}', '${emoji}')">${emoji}</button>`
    ).join('');
    button.parentElement.appendChild(picker);
  }
  
  picker.classList.toggle('show');
  
  // Close picker when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeHandler(e) {
      if (!picker.contains(e.target) && e.target !== button) {
        picker.classList.remove('show');
        document.removeEventListener('click', closeHandler);
      }
    });
  }, 100);
}

function addReactionToMessage(messageId, emoji) {
  MessageFeatures.addReaction(messageId, emoji);
  // Refresh message display
  const conv = STATE.conversations[STATE.activeConvId];
  if (conv) {
    displayConversation(conv);
  }
}

// ========================================
// CODE BLOCK ENHANCEMENTS
// ========================================

// Enhance code blocks after they're rendered
function enhanceCodeBlocks() {
  document.querySelectorAll('pre code').forEach(codeBlock => {
    EnhancedCodeBlocks.enhance(codeBlock);
  });
}

// Hook into message rendering
const originalDisplayConversation = window.displayConversation;
if (originalDisplayConversation) {
  window.displayConversation = function(...args) {
    originalDisplayConversation.apply(this, args);
    setTimeout(() => {
      enhanceCodeBlocks();
    }, 100);
  };
}

// ========================================
// WRAP STREAMING WITH PERFORMANCE TRACKING
// ========================================

const originalStreamChat = window.streamChat;
if (originalStreamChat) {
  window.streamChat = async function(...args) {
    const startTime = Date.now();
    let tokenCount = 0;
    let success = false;
    
    try {
      const result = await originalStreamChat.apply(this, args);
      success = true;
      
      // Estimate token count (rough approximation)
      const conv = STATE.conversations[STATE.activeConvId];
      if (conv && conv.messages.length > 0) {
        const lastMessage = conv.messages[conv.messages.length - 1];
        tokenCount = Math.ceil(lastMessage.content.split(/\s+/).length * 1.3);
      }
      
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const endTime = Date.now();
      PerformanceMonitor.recordRequest(STATE.model, startTime, endTime, tokenCount, success);
    }
  };
}

console.log('✅ UI Integration loaded');
