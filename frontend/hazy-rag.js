/**
 * ============================================================================
 * HAZY RAG (Retrieval-Augmented Generation) SYSTEM
 * Feature #13 - Knowledge Base with Semantic Search
 * ============================================================================
 * 
 * FEATURES:
 * - Upload & process documents (PDF, TXT, MD, DOCX)
 * - Intelligent text chunking
 * - Semantic search with embeddings
 * - Context injection into prompts
 * - Knowledge base management UI
 * - IndexedDB storage
 * 
 * INSTALLATION:
 * 1. Add to index.html before closing </body>:
 *    <script src="hazy-rag.js"></script>
 * 2. Add to index.html in <head>:
 *    <link rel="stylesheet" href="hazy-rag.css">
 * 
 * ============================================================================
 */

(function() {
  'use strict';

  console.log('📚 HAZY RAG System v1.0 Loading...');

  // ============================================================================
  // INDEXEDDB SETUP
  // ============================================================================

  class RAGDatabase {
    constructor() {
      this.dbName = 'HazyRAG';
      this.version = 1;
      this.db = null;
    }

    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this.db = request.result;
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // Documents store
          if (!db.objectStoreNames.contains('documents')) {
            const docStore = db.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
            docStore.createIndex('name', 'name', { unique: false });
            docStore.createIndex('type', 'type', { unique: false });
            docStore.createIndex('uploadDate', 'uploadDate', { unique: false });
          }

          // Chunks store
          if (!db.objectStoreNames.contains('chunks')) {
            const chunkStore = db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
            chunkStore.createIndex('docId', 'docId', { unique: false });
            chunkStore.createIndex('embedding', 'embedding', { unique: false });
          }
        };
      });
    }

    async addDocument(doc) {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      return new Promise((resolve, reject) => {
        const request = store.add(doc);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async addChunk(chunk) {
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      return new Promise((resolve, reject) => {
        const request = store.add(chunk);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async getAllDocuments() {
      const transaction = this.db.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async getChunksByDocId(docId) {
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const index = store.index('docId');
      return new Promise((resolve, reject) => {
        const request = index.getAll(docId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async getAllChunks() {
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async deleteDocument(docId) {
      // Delete document and all its chunks
      const chunks = await this.getChunksByDocId(docId);
      
      const transaction = this.db.transaction(['documents', 'chunks'], 'readwrite');
      const docStore = transaction.objectStore('documents');
      const chunkStore = transaction.objectStore('chunks');

      // Delete document
      docStore.delete(docId);

      // Delete all chunks
      chunks.forEach(chunk => chunkStore.delete(chunk.id));

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
  }

  // ============================================================================
  // TEXT CHUNKING
  // ============================================================================

  class TextChunker {
    constructor(chunkSize = 500, overlap = 100) {
      this.chunkSize = chunkSize; // characters per chunk
      this.overlap = overlap;     // overlap between chunks
    }

    chunk(text) {
      const chunks = [];
      let start = 0;

      while (start < text.length) {
        let end = start + this.chunkSize;
        
        // Try to break at sentence boundary
        if (end < text.length) {
          const sentenceEnd = text.lastIndexOf('. ', end);
          if (sentenceEnd > start) {
            end = sentenceEnd + 1;
          }
        }

        const chunkText = text.slice(start, end).trim();
        if (chunkText.length > 0) {
          chunks.push({
            text: chunkText,
            start,
            end
          });
        }

        start = end - this.overlap;
      }

      return chunks;
    }

    smartChunk(text, metadata = {}) {
      // Enhanced chunking that respects paragraphs and sections
      const chunks = [];
      
      // Split by double newline (paragraphs)
      const paragraphs = text.split(/\n\n+/);
      let currentChunk = '';
      let chunkStart = 0;

      for (const para of paragraphs) {
        const trimmedPara = para.trim();
        if (!trimmedPara) continue;

        if ((currentChunk + trimmedPara).length > this.chunkSize && currentChunk.length > 0) {
          // Save current chunk
          chunks.push({
            text: currentChunk.trim(),
            start: chunkStart,
            end: chunkStart + currentChunk.length,
            ...metadata
          });
          
          // Start new chunk with overlap
          const words = currentChunk.split(' ');
          const overlapWords = words.slice(-Math.floor(this.overlap / 5));
          currentChunk = overlapWords.join(' ') + ' ' + trimmedPara;
          chunkStart += currentChunk.length - (overlapWords.join(' ').length + 1);
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
        }
      }

      // Add last chunk
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          start: chunkStart,
          end: chunkStart + currentChunk.length,
          ...metadata
        });
      }

      return chunks;
    }
  }

  // ============================================================================
  // SIMPLE EMBEDDING (TF-IDF + Cosine Similarity)
  // ============================================================================

  class SimpleEmbedder {
    constructor() {
      this.vocabulary = new Map();
      this.idf = new Map();
      this.documentCount = 0;
    }

    // Build vocabulary from all chunks
    buildVocabulary(texts) {
      this.documentCount = texts.length;
      const docFrequency = new Map();

      texts.forEach(text => {
        const words = this.tokenize(text);
        const uniqueWords = new Set(words);
        uniqueWords.forEach(word => {
          docFrequency.set(word, (docFrequency.get(word) || 0) + 1);
        });
      });

      // Calculate IDF
      docFrequency.forEach((freq, word) => {
        this.idf.set(word, Math.log(this.documentCount / freq));
        if (!this.vocabulary.has(word)) {
          this.vocabulary.set(word, this.vocabulary.size);
        }
      });
    }

    tokenize(text) {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2); // Remove very short words
    }

    // Convert text to TF-IDF vector
    embed(text) {
      const words = this.tokenize(text);
      const termFreq = new Map();
      
      // Calculate term frequency
      words.forEach(word => {
        termFreq.set(word, (termFreq.get(word) || 0) + 1);
      });

      // Create TF-IDF vector
      const vector = new Array(this.vocabulary.size).fill(0);
      
      termFreq.forEach((freq, word) => {
        const idx = this.vocabulary.get(word);
        if (idx !== undefined) {
          const tf = freq / words.length;
          const idf = this.idf.get(word) || 0;
          vector[idx] = tf * idf;
        }
      });

      return vector;
    }

    // Cosine similarity between two vectors
    cosineSimilarity(vec1, vec2) {
      let dotProduct = 0;
      let mag1 = 0;
      let mag2 = 0;

      for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        mag1 += vec1[i] * vec1[i];
        mag2 += vec2[i] * vec2[i];
      }

      mag1 = Math.sqrt(mag1);
      mag2 = Math.sqrt(mag2);

      if (mag1 === 0 || mag2 === 0) return 0;
      return dotProduct / (mag1 * mag2);
    }
  }

  // ============================================================================
  // RAG SYSTEM
  // ============================================================================

  class RAGSystem {
    constructor() {
      this.db = new RAGDatabase();
      this.chunker = new TextChunker(500, 100);
      this.embedder = new SimpleEmbedder();
      this.initialized = false;
      this.isEnabled = false;
    }

    async init() {
      if (window.location.protocol !== 'file:') {
        this.initialized = true;
        console.log('✅ RAG System initialized (using server-side storage)');
        return true;
      }
      try {
        await this.db.init();
        
        // Load existing chunks and rebuild vocabulary
        const chunks = await this.db.getAllChunks();
        if (chunks.length > 0) {
          const texts = chunks.map(c => c.text);
          this.embedder.buildVocabulary(texts);
        }
        
        this.initialized = true;
        console.log('✅ RAG System initialized');
        return true;
      } catch (error) {
        console.error('❌ RAG initialization failed:', error);
        return false;
      }
    }

    async processDocument(file) {
      try {
        // Extract text based on file type
        let text = '';
        const fileName = file.name;
        const fileType = file.type || this.getFileTypeFromName(fileName);

        if (fileType === 'application/pdf') {
          text = await this.extractPDFText(file);
        } else if (fileType.startsWith('text/') || fileName.endsWith('.md') || fileName.endsWith('.txt')) {
          text = await this.readTextFile(file);
        } else {
          throw new Error('Unsupported file type');
        }

        if (window.location.protocol !== 'file:') {
          const response = await fetch('/hazy/rag/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: fileName, content: text, type: fileType })
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Upload failed with status ${response.status}`);
          }
          const data = await response.json();
          return { success: true, docId: data.docId, chunkCount: data.chunkCount };
        }

        // Create document record (local IndexedDB pathway)
        const doc = {
          name: fileName,
          type: fileType,
          size: file.size,
          uploadDate: new Date().toISOString(),
          chunkCount: 0,
          content: text
        };

        const docId = await this.db.addDocument(doc);

        // Chunk the document
        const chunks = this.chunker.smartChunk(text, { docId });

        // Add chunks to database
        for (const chunk of chunks) {
          await this.db.addChunk({
            docId,
            text: chunk.text,
            start: chunk.start,
            end: chunk.end,
            embedding: null // Will be generated on search
          });
        }

        // Update document chunk count
        doc.id = docId;
        doc.chunkCount = chunks.length;

        // Rebuild vocabulary with new chunks
        const allChunks = await this.db.getAllChunks();
        const texts = allChunks.map(c => c.text);
        this.embedder.buildVocabulary(texts);

        console.log(`✅ Processed ${fileName}: ${chunks.length} chunks`);
        return { success: true, docId, chunkCount: chunks.length };

      } catch (error) {
        console.error('❌ Document processing failed:', error);
        return { success: false, error: error.message };
      }
    }

    async search(query, topK = 3) {
      try {
        const chunks = await this.db.getAllChunks();
        if (chunks.length === 0) {
          return [];
        }

        // Generate query embedding
        const queryEmbedding = this.embedder.embed(query);

        // Calculate similarities
        const results = chunks.map(chunk => {
          const chunkEmbedding = this.embedder.embed(chunk.text);
          const similarity = this.embedder.cosineSimilarity(queryEmbedding, chunkEmbedding);
          
          return {
            chunk,
            similarity
          };
        });

        // Sort by similarity and return top K
        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, topK);

      } catch (error) {
        console.error('❌ RAG search failed:', error);
        return [];
      }
    }

    async getContext(query, topK = 3) {
      const results = await this.search(query, topK);
      
      if (results.length === 0) {
        return '';
      }

      // Format context for injection
      let context = '=== KNOWLEDGE BASE CONTEXT ===\n\n';
      
      results.forEach((result, idx) => {
        context += `[Source ${idx + 1}] (Relevance: ${(result.similarity * 100).toFixed(1)}%)\n`;
        context += `${result.chunk.text}\n\n`;
      });

      context += '=== END KNOWLEDGE BASE ===\n\n';
      context += 'Use the above context to answer the following question:\n\n';

      return context;
    }

    async extractPDFText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            const typedArray = new Uint8Array(e.target.result);
            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
            let fullText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              const pageText = content.items.map(item => item.str).join(' ');
              fullText += pageText + '\n\n';
            }

            resolve(fullText);
          } catch (error) {
            reject(error);
          }
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
    }

    async readTextFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    }

    getFileTypeFromName(fileName) {
      const ext = fileName.split('.').pop().toLowerCase();
      const types = {
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'html': 'text/html',
        'json': 'application/json'
      };
      return types[ext] || 'text/plain';
    }

    async getDocuments() {
      if (window.location.protocol !== 'file:') {
        const response = await fetch('/hazy/rag/documents');
        if (!response.ok) throw new Error('Failed to fetch documents from server');
        return await response.json();
      }
      return await this.db.getAllDocuments();
    }

    async deleteDocument(docId) {
      if (window.location.protocol !== 'file:') {
        const response = await fetch('/hazy/rag/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: docId })
        });
        if (!response.ok) throw new Error('Failed to delete document on server');
        return;
      }
      await this.db.deleteDocument(docId);
      
      // Rebuild vocabulary
      const allChunks = await this.db.getAllChunks();
      if (allChunks.length > 0) {
        const texts = allChunks.map(c => c.text);
        this.embedder.buildVocabulary(texts);
      }
    }

    enable() {
      this.isEnabled = true;
      localStorage.setItem('hazyRAGEnabled', 'true');
    }

    disable() {
      this.isEnabled = false;
      localStorage.setItem('hazyRAGEnabled', 'false');
    }

    isActive() {
      return this.isEnabled && this.initialized;
    }
  }

  // ============================================================================
  // UI INTEGRATION
  // ============================================================================

  class RAGUI {
    constructor(ragSystem) {
      this.rag = ragSystem;
      this.modal = null;
    }

    init() {
      this.createUI();
      this.attachEventListeners();
      this.loadState();
    }

    createUI() {
      // Add RAG button to header
      const headerRight = document.querySelector('.header-right');
      if (!headerRight) return;

      const ragBtn = document.createElement('button');
      ragBtn.id = 'ragBtn';
      ragBtn.className = 'icon-btn';
      ragBtn.title = 'Knowledge Base (RAG)';
      ragBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>
        <span class="rag-indicator" id="ragIndicator"></span>
      `;
      
      headerRight.insertBefore(ragBtn, headerRight.firstChild);

      // Create RAG modal
      this.createModal();
    }

    createModal() {
      const modal = document.createElement('div');
      modal.id = 'ragModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content rag-modal-content">
          <div class="modal-header">
            <h2>📚 Knowledge Base (RAG)</h2>
            <button class="modal-close" id="ragCloseBtn">&times;</button>
          </div>
          
          <div class="modal-body">
            <!-- Enable Toggle -->
            <div class="rag-enable-section">
              <label class="toggle-label">
                <input type="checkbox" id="ragEnableToggle">
                <span>Enable RAG (inject knowledge into responses)</span>
              </label>
              <p class="help-text">When enabled, relevant document chunks will be added to your prompts automatically.</p>
            </div>

            <!-- Upload Section -->
            <div class="rag-upload-section">
              <h3>Upload Documents</h3>
              <div class="upload-area" id="ragUploadArea">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path d="M7 10l5-5m0 0l5 5m-5-5v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>Drop files here or click to browse</p>
                <p class="file-types">Supports: PDF, TXT, MD</p>
                <input type="file" id="ragFileInput" accept=".pdf,.txt,.md" multiple style="display: none;">
              </div>
            </div>

            <!-- Documents List -->
            <div class="rag-documents-section">
              <h3>Knowledge Base Documents (<span id="docCount">0</span>)</h3>
              <div id="ragDocumentsList" class="rag-documents-list"></div>
            </div>

            <!-- Stats -->
            <div class="rag-stats">
              <div class="stat-item">
                <span class="stat-label">Total Chunks:</span>
                <span class="stat-value" id="totalChunks">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Avg. Chunk Size:</span>
                <span class="stat-value" id="avgChunkSize">0</span>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.modal = modal;
    }

    attachEventListeners() {
      // Open modal
      document.getElementById('ragBtn')?.addEventListener('click', () => {
        this.openModal();
      });

      // Close modal
      document.getElementById('ragCloseBtn')?.addEventListener('click', () => {
        this.closeModal();
      });

      this.modal?.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });

      // Enable toggle
      document.getElementById('ragEnableToggle')?.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.rag.enable();
          this.updateIndicator();
          showToast('✅ RAG enabled - knowledge will be injected into prompts', 'success');
        } else {
          this.rag.disable();
          this.updateIndicator();
          showToast('RAG disabled', 'info');
        }
      });

      // File upload
      const uploadArea = document.getElementById('ragUploadArea');
      const fileInput = document.getElementById('ragFileInput');

      uploadArea?.addEventListener('click', () => fileInput?.click());

      fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        await this.uploadFiles(files);
        e.target.value = ''; // Reset input
      });

      // Drag & drop
      uploadArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });

      uploadArea?.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });

      uploadArea?.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        await this.uploadFiles(files);
      });
    }

    async uploadFiles(files) {
      for (const file of files) {
        showToast(`Processing ${file.name}...`, 'info');
        
        const result = await this.rag.processDocument(file);
        
        if (result.success) {
          showToast(`✅ ${file.name} - ${result.chunkCount} chunks created`, 'success');
        } else {
          showToast(`❌ ${file.name} failed: ${result.error}`, 'error');
        }
      }

      await this.refreshDocumentsList();
    }

    async refreshDocumentsList() {
      const documents = await this.rag.getDocuments();
      const listEl = document.getElementById('ragDocumentsList');
      const countEl = document.getElementById('docCount');
      
      if (!listEl || !countEl) return;

      countEl.textContent = documents.length;

      if (documents.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No documents yet. Upload some to get started!</p>';
        document.getElementById('totalChunks').textContent = '0';
        document.getElementById('avgChunkSize').textContent = '0';
        return;
      }

      // Calculate stats
      const totalChunks = documents.reduce((sum, doc) => sum + doc.chunkCount, 0);
      const totalSize = documents.reduce((sum, doc) => sum + doc.size, 0);
      const avgChunkSize = Math.round(totalSize / totalChunks);

      document.getElementById('totalChunks').textContent = totalChunks;
      document.getElementById('avgChunkSize').textContent = avgChunkSize + ' chars';

      // Render documents
      listEl.innerHTML = documents.map(doc => `
        <div class="rag-doc-item" data-doc-id="${doc.id}">
          <div class="doc-icon">📄</div>
          <div class="doc-info">
            <div class="doc-name">${this.escapeHtml(doc.name)}</div>
            <div class="doc-meta">
              ${this.formatFileSize(doc.size)} • 
              ${doc.chunkCount} chunks • 
              ${new Date(doc.uploadDate).toLocaleDateString()}
            </div>
          </div>
          <button class="doc-delete-btn" data-doc-id="${doc.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
        </div>
      `).join('');

      // Add delete handlers
      listEl.querySelectorAll('.doc-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const docId = window.location.protocol === 'file:' ? parseInt(btn.dataset.docId, 10) : btn.dataset.docId;
          if (confirm('Delete this document from knowledge base?')) {
            await this.rag.deleteDocument(docId);
            showToast('Document deleted', 'success');
            await this.refreshDocumentsList();
          }
        });
      });
    }

    openModal() {
      this.modal.classList.add('active');
      this.refreshDocumentsList();
    }

    closeModal() {
      this.modal.classList.remove('active');
    }

    loadState() {
      const enabled = localStorage.getItem('hazyRAGEnabled') === 'true';
      const toggle = document.getElementById('ragEnableToggle');
      if (toggle) toggle.checked = enabled;
      if (enabled) this.rag.enable();
      this.updateIndicator();
    }

    updateIndicator() {
      const indicator = document.getElementById('ragIndicator');
      if (!indicator) return;

      if (this.rag.isActive()) {
        indicator.classList.add('active');
        indicator.title = 'RAG Active';
      } else {
        indicator.classList.remove('active');
        indicator.title = 'RAG Inactive';
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
  }

  // ============================================================================
  // INTEGRATION WITH EXISTING CHAT
  // ============================================================================

  async function integrateRAG() {
    const ragSystem = new RAGSystem();
    await ragSystem.init();

    const ragUI = new RAGUI(ragSystem);
    ragUI.init();

    // Expose to global scope
    window.hazyRAG = ragSystem;
    window.hazyRAGUI = ragUI;

    // Hook into message sending
    const originalSendMessage = window.sendMessage;
    if (originalSendMessage) {
      window.sendMessage = async function(...args) {
        let userMessage = args[0];

        // If RAG is enabled and running locally/offline, inject context
        if (ragSystem.isActive() && window.location.protocol === 'file:') {
          const context = await ragSystem.getContext(userMessage, 3);
          if (context) {
            userMessage = context + userMessage;
            args[0] = userMessage;
          }
        }

        return originalSendMessage.apply(this, args);
      };
    }

    console.log('✅ RAG System fully integrated');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', integrateRAG);
  } else {
    integrateRAG();
  }

})();
