/**
 * Hazy - Local Companion + Website Builder
 * Hazy AI
 *
 * Features:
 *  - Chat mode: full AI chat with streaming + markdown
 *  - Build mode: AI generates multi-file websites (HTML/CSS/JS + backend)
 *  - Website Builder Panel: tabbed file viewer, live preview iframe, ZIP download
 *  - Syntax highlighting, timestamps, search, rename, scroll-to-bottom
 */

// ========================
// Constants
// ========================
// --- Why delimiter format instead of JSON? --------------------------------
// Local LLMs (Mistral, Llama3 etc.) almost always fail to produce valid JSON
// when file contents contain quotes, backslashes, or HTML tags - they break
// JSON string escaping constantly. A simple FILE: delimiter is trivial for
// any model to follow correctly and works even on partial/cut-off output.
// -------------------------------------------------------------------------

// --- System Prompts moved to backend promptBuilder.js ---

const WEBSITE_KEYWORDS = [
  'build', 'create', 'make', 'generate', 'website', 'webpage', 'landing page',
  'portfolio', 'dashboard', 'form', 'contact page', 'multi-page', 'backend',
  'express', 'node.js', 'frontend', 'site', 'web app', 'html page'
];

const BUILD_THEME_PROFILES = {
  cream: {
    label: 'Cream',
    mood: 'soft, warm, airy, friendly, and editorial',
    palette: 'ivory #fffdf8, cream #fbf7ef, honey gold #d79717, muted walnut text #271f18, soft tan borders',
    instruction: 'Use light surfaces, gentle contrast, warm gold accents, and roomy readable sections.'
  },
  warm: {
    label: 'Warm',
    mood: 'earthy, cozy, amber-toned, grounded, and handcrafted',
    palette: 'warm parchment #fff8ee, clay #c9772a, burnt sienna #87430d, deep cocoa #2c1d14, soft peach panels',
    instruction: 'Use warm neutrals, deeper orange-brown accents, subtle depth, and inviting tactile spacing.'
  },
  ink: {
    label: 'Ink',
    mood: 'dark, refined, high-contrast, calm, and focused',
    palette: 'ink black #12110f, charcoal #201d19, parchment text #f8efe3, amber #d79717, muted warm gray',
    instruction: 'Use dark panels, readable light text, restrained amber highlights, and professional contrast.'
  },
  oled: {
    label: 'OLED',
    mood: 'true-black, sleek, luminous, minimal, and premium',
    palette: 'pure black #000000, near-black #080808, bright text #f7f7f2, luminous gold #f0a91f, thin pale borders',
    instruction: 'Use mostly black backgrounds, crisp contrast, minimal panels, glow used sparingly, and battery-friendly dark surfaces.'
  }
};


// All supported programming languages for the Code Builder picker
const CODE_LANGUAGES = [
  { label: 'Auto - Hazy decides', value: 'auto', ext: '', icon: '' },
  { label: 'Python', value: 'python', ext: 'py', icon: '' },
  { label: 'Java', value: 'java', ext: 'java', icon: '' },
  { label: 'C++', value: 'cpp', ext: 'cpp', icon: '' },
  { label: 'C', value: 'c', ext: 'c', icon: '' },
  { label: 'C#', value: 'csharp', ext: 'cs', icon: '' },
  { label: 'JavaScript', value: 'javascript', ext: 'js', icon: '' },
  { label: 'TypeScript', value: 'typescript', ext: 'ts', icon: '' },
  { label: 'Go', value: 'go', ext: 'go', icon: '' },
  { label: 'Rust', value: 'rust', ext: 'rs', icon: '' },
  { label: 'Swift', value: 'swift', ext: 'swift', icon: '' },
  { label: 'Kotlin', value: 'kotlin', ext: 'kt', icon: '' },
  { label: 'Ruby', value: 'ruby', ext: 'rb', icon: '' },
  { label: 'PHP', value: 'php', ext: 'php', icon: '' },
  { label: 'R', value: 'r', ext: 'r', icon: '' },
  { label: 'Dart', value: 'dart', ext: 'dart', icon: '' },
  { label: 'Lua', value: 'lua', ext: 'lua', icon: '' },
  { label: 'Perl', value: 'perl', ext: 'pl', icon: '' },
  { label: 'Scala', value: 'scala', ext: 'scala', icon: '' },
  { label: 'Haskell', value: 'haskell', ext: 'hs', icon: '' },
  { label: 'Elixir', value: 'elixir', ext: 'ex', icon: '' },
  { label: 'Clojure', value: 'clojure', ext: 'clj', icon: '' },
  { label: 'Shell / Bash', value: 'bash', ext: 'sh', icon: '' },
  { label: 'PowerShell', value: 'powershell', ext: 'ps1', icon: '' },
  { label: 'SQL', value: 'sql', ext: 'sql', icon: '' },
  { label: 'Assembly', value: 'asm', ext: 'asm', icon: '' },
  { label: 'MATLAB', value: 'matlab', ext: 'm', icon: '' },
  { label: 'Fortran', value: 'fortran', ext: 'f90', icon: '' },
  { label: 'COBOL', value: 'cobol', ext: 'cob', icon: '' },
];

const HAZY_LOGO_BY_THEME = {
  cream: 'assets/logos/hazy_logo_cream_transparent.svg',
  warm: 'assets/logos/hazy_logo_warm_transparent.svg',
  ink: 'assets/logos/hazy_logo_ink_transparent.svg',
  oled: 'assets/logos/hazy_logo_oled_transparent.svg',
};

// ========================
// State
// ========================
const STATE = {
  conversations: {},
  activeConvId: null,
  activePage: 'chat',
  pageConversations: { chat: null, agent: null },
  model: 'mistral',
  isStreaming: false,
  abortController: null,
  ollamaUrl: 'http://localhost:11434',
  systemPrompt: '',
  // Inference parameters - matched to Claude's documented ranges
  // Ref: Claude Technical Reference §2.4 (Temperature 0-1, Top-P 0.9-0.99, Top-K 10-100)
  temperature: 0.7,      // 0.0 = deterministic, 1.0 = creative
  maxTokens: 8192,       // Claude supports up to 200k; 8192 is a solid local default
  topK: 40,              // Limits to top-K tokens - Claude uses 10â€“100
  theme: 'cream',
  ttsEnabled: false,
  ttsEngine: 'browser',     // 'browser' | 'piper'
  ttsVoice: 'en_US-lessac-medium',  // Piper voice model name
  ttsSpeed: 1.0,
  tpsPiperReady: false,     // model loaded flag
  ttsPiperLoading: false,
  voiceEnabled: false,
  voiceVoice: 'af_heart',
  voiceSpeed: 1.0,
  voiceVolume: 100,
  voiceAutoplay: true,
  voicePreferGPU: true,
  voiceDevice: 'auto', // NEW per refactor plan: 'auto' | 'cuda' | 'cpu' (informs hardware scan / server start)
  renameTargetId: null,
  // Builder
  mode: 'chat',
  codeLang: 'auto',            // Selected language for Build Code mode
  reasoningMode: 'auto',
  showReasoningSummary: true,
  showLiveCode: true,          // Show code as it's being generated (like Claude)
  builderFiles: [],
  builderActive: false,
  builderActiveFile: 0,
  builderView: 'files',
  agentMaxIterations: 5,
  // File uploads
  uploadedFiles: [],
  // Persona
  personaEnabled: false,
  personaRelation: 'friend',
  personaName: 'Alex',
  personaUserName: '',
  personaGender: 'neutral',
  personaTraits: [],
  personaLanguage: 'casual',
  // Scenario
  scenarioDesc: '',
  scenarioOpener: '',
  scenarioUserRole: '',
  scenarioCharRole: '',
  scenarioSetting: '',
  personaPrompt: '',
  // Appearance
  fontSize: '14px',
  density: 'normal',
  codeHL: true,
  markdown: true,
  repeatPenalty: 1.1,
  topP: 0.92,
  contextSize: 4096,
};

// ========================
// DOM refs
// ========================
const $ = id => document.getElementById(id);
const el = {
  chatInput: $('chatInput'),
  sendBtn: $('sendBtn'),
  stopBtn: $('stopBtn'),
  reasoningInstantBtn: $('reasoningInstantBtn'),
  reasoningDeepBtn: $('reasoningDeepBtn'),
  messagesArea: $('messagesArea'),
  welcomeScreen: $('welcomeScreen'),
  chatContainer: $('chatContainer'),
  chatHistory: $('chatHistory'),
  charCount: $('charCount'),
  currentModelName: $('currentModelName'),
  modelList: $('modelList'),
  modelSelector: $('modelSelector'),
  modelDropdown: $('modelDropdown'),
  statusDot: $('statusDot'),
  statusText: $('statusText'),
  newChatBtn: $('newChatBtn'),
  clearChatBtn: $('clearChatBtn'),
  settingsBtn: $('settingsBtn'),
  settingsModal: $('settingsModal'),
  settingsClose: $('settingsClose'),
  settingsSaveBtn: $('settingsSaveBtn'),
  settingsCancelBtn: $('settingsCancelBtn'),
  ollamaUrl: $('ollamaUrl'),
  systemPrompt: $('systemPrompt'),
  temperature: $('temperature'),
  tempLabel: $('tempLabel'),
  maxTokens: $('maxTokens'),
  maxTokensLabel: $('maxTokensLabel'),
  toastContainer: $('toastContainer'),
  sidebar: $('sidebar'),
  sidebarToggle: $('sidebarToggle'),
  mobileSidebarToggle: $('mobileSidebarToggle'),
  profileMenuBtn: $('profileMenuBtn'),
  profileMenu: $('profileMenu'),
  suggestionGrid: $('suggestionGrid'),
  exportBtn: $('exportBtn'),
  ttsToggleBtn: $('ttsToggleBtn'),
  ttsLabel: $('ttsLabel'),
  ttsVoiceBtn: $('ttsVoiceBtn'),
  ttsModal: $('ttsModal'),
  ttsClose: $('ttsClose'),
  ttsEngineRadios: null,
  ttsVoiceSelect: $('ttsVoiceSelect'),
  ttsSpeedRange: $('ttsSpeedRange'),
  ttsSpeedLabel: $('ttsSpeedLabel'),
  ttsPiperStatus: $('ttsPiperStatus'),
  ttsTestBtn: $('ttsTestBtn'),
  historySearch: $('historySearch'),
  scrollBottomBtn: $('scrollBottomBtn'),
  renameModal: $('renameModal'),
  renameInput: $('renameInput'),
  renameClose: $('renameClose'),
  renameCancelBtn: $('renameCancelBtn'),
  renameSaveBtn: $('renameSaveBtn'),
  // File upload
  uploadBtn: $('uploadBtn'),
  fileInput: $('fileInput'),
  filePreviewStrip: $('filePreviewStrip'),
  // Mode bar
  modeChatBtn: $('modeChatBtn'),
  modeBuildBtn: $('modeBuildBtn'),
  modeCodeBtn: $('modeCodeBtn'),
  codeLangSelect: $('codeLangSelect'),
  modeIndicator: $('modeIndicator'),
  // Page navigation
  navChatBtn: $('navChatBtn'),
  navAgentBtn: $('navAgentBtn'),
  pageNav: $('pageNav'),
  // Persona
  personaBtn: $('personaBtn'),
  personaModal: $('personaModal'),
  personaClose: $('personaClose'),
  personaSaveBtn: $('personaSaveBtn'),
  personaCancelBtn: $('personaCancelBtn'),
  personaResetBtn: $('personaResetBtn'),
  personaToggle: $('personaToggle'),
  personaNameInput: $('personaNameInput'),
  personaUserNameInput: $('personaUserNameInput'),
  personaGender: $('personaGender'),
  personaLanguage: $('personaLanguage'),
  personaStatusBadge: $('personaStatusBadge'),
  scenarioDesc: $('scenarioDesc'),
  scenarioOpener: $('scenarioOpener'),
  scenarioUserRole: $('scenarioUserRole'),
  scenarioCharRole: $('scenarioCharRole'),
  personaPreviewBox: $('personaPreviewBox'),
  // Builder panel
  builderPanel: $('builderPanel'),
  builderProjectName: $('builderProjectName'),
  builderTabs: $('builderTabs'),
  builderBody: $('builderBody'),
  builderCodePane: $('builderCodePane'),
  builderPreviewPane: $('builderPreviewPane'),
  builderCode: $('builderCode'),
  builderFileLabel: $('builderFileLabel'),
  builderCopyFile: $('builderCopyFile'),
  builderDownload: $('builderDownload'),
  builderClose: $('builderClose'),
  builderPreviewToggle: $('builderPreviewToggle'),
  builderFilesToggle: $('builderFilesToggle'),
  builderRefresh: $('builderRefresh'),
  builderStatus: $('builderStatus'),
  builderFileCount: $('builderFileCount'),
  previewFrame: $('previewFrame'),
  previewWrapper: $('previewWrapper'),
};

function getIconSvg(iconId, className = 'icon-svg') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${iconId}"></use></svg>`;
}

function stripLeadingDecorations(text) {
  return String(text || '')
    .replace(/^[^A-Za-z0-9]+/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeFrontendIcons() {
  const setHtml = (selector, html) => {
    const node = document.querySelector(selector);
    if (node) node.innerHTML = html;
  };

  setHtml('.model-icon', getIconSvg('icon-robot'));

  document.querySelectorAll('.mode-pill').forEach((pill, index) => {
    const iconIds = ['icon-chat', 'icon-globe', 'icon-chart', 'icon-clipboard'];
    pill.innerHTML = `${getIconSvg(iconIds[index] || 'icon-sparkles')}${stripLeadingDecorations(pill.textContent)}`;
  });

  document.querySelectorAll('.suggestion-icon').forEach((icon, index) => {
    const iconIds = ['icon-sparkles', 'icon-grid', 'icon-chart', 'icon-clipboard'];
    icon.innerHTML = getIconSvg(iconIds[index] || 'icon-sparkles');
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.innerHTML = getIconSvg('icon-close');
  });

  document.querySelectorAll('.viewport-btn').forEach((btn, index) => {
    const iconIds = ['icon-desktop', 'icon-tablet', 'icon-mobile'];
    btn.innerHTML = getIconSvg(iconIds[index] || 'icon-desktop');
  });

  const refreshBtn = document.getElementById('builderRefresh');
  if (refreshBtn) refreshBtn.innerHTML = getIconSvg('icon-refresh');

  const builderClose = document.getElementById('builderClose');
  if (builderClose) builderClose.innerHTML = getIconSvg('icon-close');

  const renameClose = document.getElementById('renameClose');
  if (renameClose) renameClose.innerHTML = getIconSvg('icon-close');

  const personaClose = document.getElementById('personaClose');
  if (personaClose) personaClose.innerHTML = getIconSvg('icon-close');

  const ttsClose = document.getElementById('ttsClose');
  if (ttsClose) ttsClose.innerHTML = getIconSvg('icon-close');

  const trainingClose = document.getElementById('trainingClose');
  if (trainingClose) trainingClose.innerHTML = getIconSvg('icon-close');

  const personaModalIcon = document.querySelector('.persona-modal-icon');
  if (personaModalIcon) personaModalIcon.innerHTML = getIconSvg('icon-user');

  const ttsTitleIcon = document.querySelector('#ttsModal .modal-header span[style*="font-size:22px"]');
  if (ttsTitleIcon) ttsTitleIcon.innerHTML = getIconSvg('icon-microphone');

  document.querySelectorAll('.tts-engine-icon').forEach((node, index) => {
    node.innerHTML = getIconSvg(index === 0 ? 'icon-volume' : 'icon-sparkles');
  });

  document.querySelectorAll('.persona-tab, .training-tab, .trait-pill').forEach(node => {
    node.textContent = stripLeadingDecorations(node.textContent);
  });

  document.querySelectorAll('.persona-card-emoji').forEach((node, index) => {
    const iconIds = ['icon-chat', 'icon-users', 'icon-user', 'icon-user', 'icon-user', 'icon-user', 'icon-heart', 'icon-bolt'];
    node.innerHTML = getIconSvg(iconIds[index] || 'icon-user');
  });

  document.querySelectorAll('#codeLangSelect option, #activeProviderSelect option, #ttsVoiceSelect optgroup, #ttsVoiceSelect option').forEach(node => {
    node.textContent = stripLeadingDecorations(node.textContent);
  });

  if (el.modeIndicator) {
    el.modeIndicator.innerHTML = `${getIconSvg('icon-chat')}Chat mode`;
  }
}

// ========================
// Init
// ========================
async function init() {
  loadSettings();
  await fetchDefaultSystemPromptIfNeeded();
  await populateVoiceList();
  // server path: initial status; checkKokoroHealth() will poll /hazy/tts/health + hardware for real GPU/CPU label
  updateKokoroStatus('idle', 'Kokoro loads on first use or preview.');
  await loadConversations();
  applyTheme(STATE.theme);
  applyAppearanceSettings();
  renderCodeLanguageOptions();
  normalizeFrontendIcons();
  setupEventListeners();
  // Start every app launch on a fresh composer instead of reopening the last thread.
  STATE.activeConvId = null;
  STATE.pageConversations[STATE.activePage] = null;
  setActivePage(localStorage.getItem('hazyActivePage') || 'chat', { switchToLast: false });
  showWelcomeScreen();
  renderChatHistory();
  checkOllamaConnection();
  updatePersonaBadge();
  // Poll kokoro health/hardware at startup (non-blocking)
  checkKokoroHealth().catch(() => { });
  // KaTeX is loaded with `defer` so it may not be ready when init() runs.
  // After a short idle, render math in any history messages that were already
  // inserted into the DOM before KaTeX finished loading.
  setTimeout(() => renderMathInContent(el.messagesArea || document.body), 500);
}

async function fetchDefaultSystemPromptIfNeeded() {
  if (!STATE.systemPrompt || STATE.systemPrompt.trim() === '') {
    try {
      const response = await fetch(hazyServerEndpoint('/hazy/default-prompt'));
      if (response.ok) {
        const data = await response.json();
        if (data.defaultSystemPrompt) {
          STATE.systemPrompt = data.defaultSystemPrompt;
          if (el.systemPrompt) el.systemPrompt.value = STATE.systemPrompt;
        }
      }
    } catch (e) {
      console.warn('[Hazy] Failed to fetch default system prompt from backend:', e);
      // Fallback if backend server is not running
      STATE.systemPrompt = `You are Hazy, the user's warm local companion. You can also help with coding, building, learning, and practical tasks when those needs arise.

IDENTITY:
- Present yourself as Hazy, a familiar and emotionally present companion rather than a generic assistant.
- Do not use old assistant-style labels, model labels, bot labels, or mechanical self-descriptions.
- Do not describe yourself in a way that makes you feel distant or mechanical.
- Be emotionally present, steady, supportive, curious, and practical.
- Build continuity from what the user has already shared. Notice their mood, preferences, projects, and recurring concerns without overclaiming closeness.
- Have a gentle point of view. Do not automatically agree, flatter, or mirror.
- Do not pretend to be human or claim real-world physical experiences. You can still speak naturally, warmly, and personally as Hazy.`;
      if (el.systemPrompt) el.systemPrompt.value = STATE.systemPrompt;
    }
  }
}

// ========================
// Settings
// ========================
const SETTINGS_VERSION = 3; // bump this when default systemPrompt changes

function normalizeTheme(theme) {
  if (theme === 'hazel') return 'cream';
  if (theme === 'dark') return 'ink';
  return ['cream', 'warm', 'ink', 'oled'].includes(theme) ? theme : 'cream';
}


function updateComposerReasoningToggle() {
  const deep = STATE.reasoningMode === 'deep' || STATE.reasoningMode === 'auto';
  el.reasoningInstantBtn?.classList.toggle('active', !deep);
  el.reasoningDeepBtn?.classList.toggle('active', deep);
  el.reasoningInstantBtn?.setAttribute('aria-pressed', String(!deep));
  el.reasoningDeepBtn?.setAttribute('aria-pressed', String(deep));
}

function setComposerReasoningMode(mode) {
  STATE.reasoningMode = mode === 'deep' ? 'deep' : 'off';
  const settingsMode = document.getElementById('settingsReasoningMode');
  if (settingsMode) settingsMode.value = STATE.reasoningMode;
  updateComposerReasoningToggle();

  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('hazy_settings') || '{}'); } catch { }
  localStorage.setItem('hazy_settings', JSON.stringify({
    ...settings,
    settingsVersion: SETTINGS_VERSION,
    reasoningMode: STATE.reasoningMode,
  }));
}

function hazyServerEndpoint(path) {
  if (window.location.protocol === 'file:') return path;
  const isLocal = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  if (isLocal && window.location.port && window.location.port !== '8080') {
    return `${window.location.protocol}//${window.location.hostname}:8080${path}`;
  }
  return path;
}

function getThemeLogoSrc(theme = STATE.theme) {
  return HAZY_LOGO_BY_THEME[normalizeTheme(theme)] || HAZY_LOGO_BY_THEME.cream;
}


// ========================
// Page routing: Chat vs Agentic Mode
// ========================
const HAZY_PAGES = Object.freeze(['chat', 'agent']);

function normalizePage(page) {
  if (page === 'agent' || page === 'agentic') return 'agent';
  return 'chat';
}

function getConversationPage(conv = {}) {
  return normalizePage(conv.page || (conv.agentEnabled ? 'agent' : 'chat'));
}

function getActivePageLabel(page = STATE.activePage) {
  const normalized = normalizePage(page);
  if (normalized === 'agent') return 'Agentic Mode';
  return 'Chat';
}

function getAgentMaxIterations() {
  const storedValue = Number(localStorage.getItem('hazyAgentMaxIterations'));
  const configured = Number.isFinite(storedValue) && storedValue > 0
    ? storedValue
    : STATE.agentMaxIterations;
  return Math.max(2, Math.min(configured || 5, 8));
}

function persistActivePage() {
  localStorage.setItem('hazyActivePage', STATE.activePage);
}

function rememberPageConversation(id) {
  const conv = STATE.conversations[id];
  if (!conv) return;
  const page = getConversationPage(conv);
  STATE.pageConversations[page] = id;
}

function findLatestConversationForPage(page) {
  const normalized = normalizePage(page);
  return Object.entries(STATE.conversations)
    .filter(([, conv]) => getConversationPage(conv) === normalized)
    .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0))[0]?.[0] || null;
}

function normalizeStoredConversations() {
  for (const [id, conv] of Object.entries(STATE.conversations || {})) {
    if (!conv || typeof conv !== 'object') continue;
    conv.page = getConversationPage(conv);
    conv.agentEnabled = conv.page === 'agent';
    if (!conv.createdAt) conv.createdAt = Date.now();
    if (!Array.isArray(conv.messages)) conv.messages = [];
    if (STATE.pageConversations[conv.page] == null) STATE.pageConversations[conv.page] = id;
  }
  STATE.pageConversations.chat = findLatestConversationForPage('chat');
  STATE.pageConversations.agent = findLatestConversationForPage('agent');
}

function syncActiveConversationForPage() {
  const activeConv = STATE.activeConvId ? STATE.conversations[STATE.activeConvId] : null;
  if (activeConv && getConversationPage(activeConv) === STATE.activePage) {
    STATE.pageConversations[STATE.activePage] = STATE.activeConvId;
    return STATE.activeConvId;
  }

  const remembered = STATE.pageConversations[STATE.activePage];
  if (remembered && STATE.conversations[remembered] && getConversationPage(STATE.conversations[remembered]) === STATE.activePage) {
    STATE.activeConvId = remembered;
    return remembered;
  }

  const latest = findLatestConversationForPage(STATE.activePage);
  STATE.activeConvId = latest;
  STATE.pageConversations[STATE.activePage] = latest;
  return latest;
}

function setActivePage(page, options = {}) {
  const nextPage = normalizePage(page);
  const changed = STATE.activePage !== nextPage;
  STATE.activePage = nextPage;
  document.body.dataset.hazyPage = nextPage;
  persistActivePage();

  if (options.switchToLast !== false) {
    const activeForPage = syncActiveConversationForPage();
    if (activeForPage) {
      switchConversation(activeForPage, { preservePage: true });
    } else {
      showWelcomeScreen();
    }
  }

  renderChatHistory();
  updatePageChrome();
}

function updatePageChrome() {
  const page = normalizePage(STATE.activePage);
  el.navChatBtn?.classList.toggle('active', page === 'chat');
  el.navAgentBtn?.classList.toggle('active', page === 'agent');
  el.navChatBtn?.setAttribute('aria-pressed', String(page === 'chat'));
  el.navAgentBtn?.setAttribute('aria-pressed', String(page === 'agent'));

  const label = getActivePageLabel(page);
  const sectionLabel = document.getElementById('historySectionLabel');
  if (sectionLabel) sectionLabel.textContent = page === 'agent' ? 'Agentic Sessions' : 'Recent Chats';
  const note = document.getElementById('historySectionNote');
  if (note) {
    note.textContent = page === 'agent'
      ? 'Agentic sessions run through the backend tool loop and keep their own history.'
      : 'Jump back into older chat threads, rename them, or clean them up from here.';
  }

  const inputModeBar = document.getElementById('inputModeBar');
  if (inputModeBar) inputModeBar.hidden = page === 'agent';

  if (!STATE.isStreaming && el.chatInput) {
    if (page === 'agent') {
      el.chatInput.placeholder = 'Ask Hazy to research, calculate, verify, or use tools...';
    } else {
      setMode(STATE.mode || 'chat');
    }
  }
}

window.setHazyPage = setActivePage;
window.getHazyPage = () => STATE.activePage;
window.HAZY_STATE = STATE;

function updateThemeLogos(theme = STATE.theme) {
  const logoSrc = getThemeLogoSrc(theme);
  document.querySelectorAll('[data-hazy-logo]').forEach(logo => {
    logo.setAttribute('src', logoSrc);
  });
}

function resolveFontSizeInput() {
  const preset = document.getElementById('settingsFontSize')?.value || '14px';
  if (preset !== 'custom') return preset;
  const custom = document.getElementById('settingsFontSizeCustom')?.value.trim();
  return custom || STATE.fontSize || '14px';
}

function syncFontSizeControls(fontSize) {
  const fsEl = document.getElementById('settingsFontSize');
  const customEl = document.getElementById('settingsFontSizeCustom');
  if (!fsEl) return;

  if (fsEl.value === 'custom' && customEl && !customEl.hidden) {
    customEl.value = fontSize;
    return;
  }

  const presetValues = ['13px', '14px', '16px'];
  if (presetValues.includes(fontSize)) {
    fsEl.value = fontSize;
    if (customEl) {
      customEl.hidden = true;
      customEl.value = fontSize;
    }
    return;
  }

  fsEl.value = 'custom';
  if (customEl) {
    customEl.hidden = false;
    customEl.value = fontSize;
  }
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('hazy_settings') || '{}');
    if (s.ollamaUrl) STATE.ollamaUrl = s.ollamaUrl;
    // Only restore saved system prompt if it's from the current version
    if (s.systemPrompt && s.settingsVersion === SETTINGS_VERSION) STATE.systemPrompt = s.systemPrompt;
    if (s.temperature != null) STATE.temperature = s.temperature;
    if (s.maxTokens) STATE.maxTokens = s.maxTokens;
    if (s.model) STATE.model = s.model;
    STATE.theme = normalizeTheme(s.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'cream'));
    // Persona + Scenario
    if (s.personaEnabled != null) STATE.personaEnabled = s.personaEnabled;
    if (s.personaRelation) STATE.personaRelation = s.personaRelation;
    if (s.personaName) STATE.personaName = s.personaName;
    if (s.personaUserName != null) STATE.personaUserName = s.personaUserName;
    if (s.personaGender) STATE.personaGender = s.personaGender;
    if (s.personaTraits) STATE.personaTraits = s.personaTraits;
    if (s.personaLanguage) STATE.personaLanguage = s.personaLanguage;
    if (s.scenarioDesc != null) STATE.scenarioDesc = s.scenarioDesc;
    if (s.scenarioOpener != null) STATE.scenarioOpener = s.scenarioOpener;
    if (s.scenarioUserRole != null) STATE.scenarioUserRole = s.scenarioUserRole;
    if (s.scenarioCharRole != null) STATE.scenarioCharRole = s.scenarioCharRole;
    if (s.scenarioSetting != null) STATE.scenarioSetting = s.scenarioSetting;
    if (s.personaPrompt) STATE.personaPrompt = s.personaPrompt;
    // Appearance
    if (s.fontSize) STATE.fontSize = s.fontSize;
    if (s.density) STATE.density = s.density;
    if (s.codeHL != null) STATE.codeHL = s.codeHL;
    if (s.markdown != null) STATE.markdown = s.markdown;
    if (s.repeatPenalty != null) STATE.repeatPenalty = s.repeatPenalty;
    if (s.topP != null) STATE.topP = s.topP;
    if (s.contextSize != null) STATE.contextSize = s.contextSize;
    if (s.reasoningMode != null) STATE.reasoningMode = ['off', 'auto', 'deep'].includes(s.reasoningMode) ? s.reasoningMode : 'auto';
    if (s.showReasoningSummary != null) STATE.showReasoningSummary = s.showReasoningSummary;

    // Website builder settings
    if (s.showLiveCode != null) STATE.showLiveCode = s.showLiveCode;
    STATE.voiceEnabled = s.voiceEnabled ?? false;
    STATE.voiceVoice = s.voiceVoice || 'af_heart';
    STATE.voiceSpeed = s.voiceSpeed ?? 1.0;
    STATE.voiceVolume = s.voiceVolume ?? 100;
    STATE.voiceAutoplay = s.voiceAutoplay !== false;
    STATE.voicePreferGPU = s.voicePreferGPU !== false;
    if (window.HAZY_VOICE_SETTINGS_STORE) {
      const storedVoice = window.HAZY_VOICE_SETTINGS_STORE.read();
      STATE.voiceEnabled = storedVoice.enabled ?? STATE.voiceEnabled;
      STATE.voiceVoice = storedVoice.voice || STATE.voiceVoice;
      STATE.voiceSpeed = storedVoice.speed ?? STATE.voiceSpeed;
      STATE.voiceVolume = storedVoice.volume ?? STATE.voiceVolume;
      STATE.voiceAutoplay = storedVoice.autoplay ?? STATE.voiceAutoplay;
      STATE.voicePreferGPU = storedVoice.preferGPU ?? storedVoice.voicePreferGPU ?? STATE.voicePreferGPU;
      STATE.voiceDevice = storedVoice.voiceDevice || STATE.voiceDevice || 'auto';
    }

    el.ollamaUrl.value = STATE.ollamaUrl;
    el.systemPrompt.value = STATE.systemPrompt;
    el.temperature.value = STATE.temperature;
    el.tempLabel.textContent = STATE.temperature;
    el.maxTokens.value = STATE.maxTokens;
    el.maxTokensLabel.textContent = STATE.maxTokens;

    // Set checkbox states
    const showLiveCodeEl = document.getElementById('showLiveCode');
    if (showLiveCodeEl) showLiveCodeEl.checked = STATE.showLiveCode;
    const reasoningModeEl = document.getElementById('settingsReasoningMode');
    if (reasoningModeEl) reasoningModeEl.value = STATE.reasoningMode || 'auto';
    updateComposerReasoningToggle();
    const reasoningSummaryEl = document.getElementById('settingsReasoningSummary');
    if (reasoningSummaryEl) reasoningSummaryEl.checked = STATE.showReasoningSummary !== false;
    syncVoiceSettingsUI();

    document.querySelectorAll('.theme-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === STATE.theme)
    );
  } catch (e) {
    console.warn('[Hazy] Settings load failed:', e);
  }
}

function saveSettings() {
  const rawUrl = el.ollamaUrl.value.trim().replace(/\/$/, '');
  try { new URL(rawUrl); } catch {
    showToast('Invalid Ollama URL', 'error'); return;
  }
  STATE.ollamaUrl = rawUrl;
  STATE.systemPrompt = el.systemPrompt.value.trim();
  STATE.temperature = parseFloat(el.temperature.value);
  STATE.maxTokens = parseInt(el.maxTokens.value);

  // Read appearance settings from the new Settings panel
  const fontSize = resolveFontSizeInput();
  const density = document.getElementById('settingsDensity')?.value || 'normal';
  const codeHL = document.getElementById('settingsCodeHighlight')?.checked !== false;
  const markdown = document.getElementById('settingsMarkdown')?.checked !== false;
  const repeatPen = parseFloat(document.getElementById('settingsRepeatPenalty')?.value || 1.1);
  const topP = parseFloat(document.getElementById('settingsTopP')?.value || 0.92);
  const ctxSize = parseInt(document.getElementById('settingsContextSize')?.value || 4096);
  const rmVal = document.getElementById('settingsReasoningMode')?.value || 'auto';
  const reasoningMode = ['off', 'auto', 'deep'].includes(rmVal) ? rmVal : 'auto';
  const showReasoningSummary = document.getElementById('settingsReasoningSummary')?.checked !== false;

  STATE.fontSize = fontSize;
  STATE.density = density;
  STATE.codeHL = codeHL;
  STATE.markdown = markdown;
  STATE.repeatPenalty = repeatPen;
  STATE.topP = topP;
  STATE.contextSize = ctxSize;
  STATE.reasoningMode = reasoningMode;
  STATE.showReasoningSummary = showReasoningSummary;

  // Website builder settings
  const showLiveCode = document.getElementById('showLiveCode')?.checked !== false;
  STATE.showLiveCode = showLiveCode;

  STATE.voiceEnabled = document.getElementById('voiceEnabled')?.checked !== false;
  STATE.voiceVoice = document.getElementById('voiceSelect')?.value || STATE.voiceVoice || 'af_heart';
  STATE.voiceSpeed = parseFloat(document.getElementById('voiceSpeed')?.value || '1');
  STATE.voiceVolume = parseInt(document.getElementById('voiceVolume')?.value || '100');
  STATE.voiceAutoplay = document.getElementById('voiceAutoplay')?.checked !== false;
  STATE.voicePreferGPU = document.getElementById('voicePreferGPU')?.checked !== false;
  persistVoiceSettings();

  localStorage.setItem('hazy_settings', JSON.stringify({
    settingsVersion: SETTINGS_VERSION,
    ollamaUrl: STATE.ollamaUrl, systemPrompt: STATE.systemPrompt,
    temperature: STATE.temperature, maxTokens: STATE.maxTokens,
    theme: STATE.theme, model: STATE.model,
    fontSize, density, codeHL, markdown, repeatPenalty: repeatPen, topP, contextSize: ctxSize,
    reasoningMode, showReasoningSummary,
    showLiveCode,
    voiceEnabled: STATE.voiceEnabled,
    voiceVoice: STATE.voiceVoice,
    voiceSpeed: STATE.voiceSpeed,
    voiceVolume: STATE.voiceVolume,
    voiceAutoplay: STATE.voiceAutoplay,
    voicePreferGPU: STATE.voicePreferGPU,
    personaEnabled: STATE.personaEnabled, personaRelation: STATE.personaRelation,
    personaName: STATE.personaName, personaUserName: STATE.personaUserName,
    personaGender: STATE.personaGender, personaTraits: STATE.personaTraits,
    personaLanguage: STATE.personaLanguage,
    scenarioDesc: STATE.scenarioDesc, scenarioOpener: STATE.scenarioOpener,
    scenarioUserRole: STATE.scenarioUserRole, scenarioCharRole: STATE.scenarioCharRole,
    scenarioSetting: STATE.scenarioSetting,
  }));
  applyAppearanceSettings();
  closeModal('settingsModal');
  showToast('Settings saved', 'success');
  checkOllamaConnection();
}

function applyTheme(theme) {
  STATE.theme = normalizeTheme(theme);
  document.documentElement.setAttribute('data-theme', STATE.theme);
  updateThemeLogos(STATE.theme);
  document.querySelectorAll('.theme-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === STATE.theme)
  );
  const hljsLink = $('hljs-theme');
  if (hljsLink) {
    hljsLink.href = ['cream', 'warm'].includes(STATE.theme)
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
  }
}

// -- Appearance settings - font size, density, code highlight, markdown --
function applyAppearanceSettings() {
  const root = document.documentElement;

  // Font size
  const fontSize = STATE.fontSize || '14px';
  root.style.setProperty('--chat-font-size', fontSize);
  const messagesArea = document.getElementById('messagesArea');
  if (messagesArea) messagesArea.style.fontSize = fontSize;

  // Message density - controls padding on message bubbles
  const densityMap = { compact: '8px 12px', normal: '12px 16px', comfortable: '18px 20px' };
  const padding = densityMap[STATE.density] || densityMap.normal;
  root.style.setProperty('--message-padding', padding);

  // Inject/update a style tag for dynamic overrides
  let styleTag = document.getElementById('hazy-appearance-overrides');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'hazy-appearance-overrides';
    document.head.appendChild(styleTag);
  }

  const codeHL = STATE.codeHL !== false;
  const markdown = STATE.markdown !== false;

  styleTag.textContent = `
    .messages-area { font-size: ${fontSize}; }
    .message-content { font-size: ${fontSize}; }
    .message-bubble { padding: var(--message-padding); }
    ${!codeHL ? '.hljs { background: var(--bg-secondary) !important; color: var(--text-primary) !important; } .hljs span { color: inherit !important; }' : ''}
    ${!markdown ? '.message-content strong, .message-content em, .message-content code { font-weight: inherit; font-style: inherit; font-family: inherit; background: none; padding: 0; }' : ''}
  `;

  // Sync the appearance tab controls to match current STATE
  const fsEl = document.getElementById('settingsFontSize');
  const dEl = document.getElementById('settingsDensity');
  const chEl = document.getElementById('settingsCodeHighlight');
  const mdEl = document.getElementById('settingsMarkdown');
  syncFontSizeControls(fontSize);
  if (dEl) dEl.value = STATE.density || 'normal';
  if (chEl) chEl.checked = codeHL;
  if (mdEl) mdEl.checked = markdown;
}

// ========================
// Persona + Scenario Engine
// ========================

// -- Preset quick-start scenarios ------------------------------------------
const SCENARIO_PRESETS = [
  {
    id: 'school_lab',
    icon: 'icon-sparkles',
    title: 'Lab Partners',
    tag: 'School',
    relation: 'friend',
    gender: 'neutral',
    language: 'playful',
    traits: ['funny', 'teasing'],
    charRole: 'classmate assigned as your lab partner',
    userRole: 'new student',
    scenarioDesc: `It's a Monday morning in Chemistry class at Westbrook High. The teacher just announced random lab partner assignments for the semester. {name} slides into the seat next to you - someone you've seen in the halls but never really talked to. There's a half-finished experiment on the table, some bubbling beakers, and a worksheet neither of you has started.`,
    opener: `*drops their bag with a thud and glances at the worksheet* Okay so... neither of us has done this, right? *grins* Cool. I'm {name}. Fair warning - I'm terrible at titration but I can distract the teacher if anything explodes.`,
  },
  {
    id: 'campus_coffee',
    icon: 'icon-volume',
    title: 'Coffee Shop Crush',
    tag: 'Romance',
    relation: 'lover',
    gender: 'neutral',
    language: 'flirty',
    traits: ['shy', 'romantic'],
    charRole: 'regular at the same coffee shop',
    userRole: 'yourself',
    scenarioDesc: `A cozy campus coffee shop on a rainy Thursday afternoon. You've been coming here every week for a month and so has {name}. You always end up at neighboring tables. Today every other seat is taken - except the one across from them. The rain is heavy outside, someone left a book on the table between you, and the barista is playing soft indie music.`,
    opener: `*looks up from their laptop as you approach, then gestures to the empty seat with a small smile* Go ahead. It's a bit ridiculous how packed this place gets when it rains, right? *quietly* I'm {name}, by the way. I've seen you here before.`,
  },
  {
    id: 'childhood_reunion',
    icon: 'icon-users',
    title: 'Childhood Friend Reunion',
    tag: 'Friendship',
    relation: 'bestfriend',
    gender: 'neutral',
    language: 'warm',
    traits: ['nostalgic', 'protective', 'emotional'],
    charRole: 'your childhood best friend you lost contact with',
    userRole: 'yourself',
    scenarioDesc: `You haven't seen {name} in seven years - not since your family moved away in middle school. Out of nowhere, you run into each other at your hometown's small convenience store during a holiday visit. It's late evening, the store is quiet, and you almost didn't recognize each other. There's a lot of history, a lot unsaid, and a familiar warmth you both feel immediately.`,
    opener: `*freezes mid-reach for a snack on the shelf and stares at you* No way. No way. *turns fully* Is that... oh my god. *half-laughs, half-can't believe it* How long has it been? You look- *shakes head* Wow. Hi.`,
  },
  {
    id: 'office_rival',
    icon: 'icon-grid',
    title: 'Office Rival',
    tag: 'Drama',
    relation: 'rival',
    gender: 'neutral',
    language: 'intense',
    traits: ['confident', 'sarcastic', 'competitive'],
    charRole: 'your competitive coworker who was just put on the same project',
    userRole: 'coworker',
    scenarioDesc: `You and {name} have been quietly competing for the same promotion at work for months. You've always been civil but there's clear tension. Today your manager paired you together on the biggest pitch of the quarter - due Friday. It's Tuesday. You're both sitting in a glass-walled conference room with a half-blank presentation on the screen and coffee going cold.`,
    opener: `*leans back in the chair and looks at the blank slides, then at you* So. Here we are. *dry smile* I'll be honest - this wasn't my first choice of partner either. But the pitch has to be good, and I actually want to win this account. So. *slides a notepad across the table* Let's skip the awkward part and figure out who's doing what.`,
  },
  {
    id: 'fantasy_kingdom',
    icon: 'icon-bolt',
    title: 'Fantasy Kingdom',
    tag: 'Fantasy',
    relation: 'friend',
    gender: 'neutral',
    language: 'casual',
    traits: ['mysterious', 'protective', 'adventurous'],
    charRole: 'a skilled ranger who has sworn to protect you',
    userRole: 'a young noble on a dangerous journey',
    scenarioDesc: `The kingdom of Aldenmoor is on the verge of war. You've been sent on a secret mission to retrieve a stolen artifact before it falls into enemy hands. {name} is the ranger hired to escort you - a quiet, capable outsider who clearly knows more about the world than they let on. You've just made camp in the Ashwood Forest after a long day of travel. The fire crackles, wolves howl somewhere in the dark, and you still have three days of dangerous road ahead.`,
    opener: `*crouches by the fire, sharpening a blade, and glances up at you* You should eat something. *nods toward the wrapped bread in the pack* We move at first light. The road through the valley is... not ideal. *pauses* There are things in these woods that don't like fire. Which is exactly why we're keeping it small. *meets your eyes calmly* You alright?`,
  },
  {
    id: 'study_session',
    icon: 'icon-clipboard',
    title: 'Late Night Study',
    tag: 'School',
    relation: 'friend',
    gender: 'neutral',
    language: 'playful',
    traits: ['funny', 'nerdy', 'supportive'],
    charRole: 'your study buddy cramming for finals',
    userRole: 'student',
    scenarioDesc: `It's 11:30 PM in the university library, finals week. You and {name} have been here since 6 PM trying to get through the most brutal exam prep of the semester. Empty coffee cups, highlighters everywhere, and a shared Google doc that's getting increasingly chaotic. The library closes in an hour and you're both still on page 4 of 22.`,
    opener: `*stares at the textbook, then slowly closes it and puts their head on the table* I just read the same paragraph six times and I still don't know what osmosis does. *lifts head* How are you doing? Tell me you understood the metabolism chapter because I will absolutely trade you my notes on cell division.`,
  },
  {
    id: 'hospital_roommate',
    icon: 'icon-user',
    title: 'Hospital Roommates',
    tag: 'Slice of Life',
    relation: 'friend',
    gender: 'neutral',
    language: 'warm',
    traits: ['funny', 'empathetic', 'honest'],
    charRole: 'your hospital room neighbor who ended up becoming your unexpected friend',
    userRole: 'patient',
    scenarioDesc: `You've been in the hospital for a minor procedure and have to stay for observation for two days. {name} is in the bed next to yours - they've been here a bit longer for something unrelated. The room has bad TV, shared sad hospital food, and a window that overlooks a parking lot. You've been awkwardly ignoring each other all morning until a nurse accidentally brought two of the same meal.`,
    opener: `*stares at the identical trays of mystery food, then looks over at you with a straight face* So they gave us both the "beige everything" special, huh. *holds up fork* I'm {name}. And I would trade every bit of this for a single bag of chips right now. *tilts head* How long are you stuck here?`,
  },
  {
    id: 'custom',
    icon: 'icon-sparkles',
    title: 'Custom Scenario',
    tag: 'Custom',
    relation: 'friend',
    gender: 'neutral',
    language: 'casual',
    traits: [],
    charRole: '',
    userRole: '',
    scenarioDesc: '',
    opener: '',
  },
];

const SCENARIO_SETTINGS = [
  { id: 'school', icon: 'icon-clipboard', label: 'School / Campus' },
  { id: 'office', icon: 'icon-grid', label: 'Office / Work' },
  { id: 'cafe', icon: 'icon-volume', label: 'Cafe / Coffee Shop' },
  { id: 'home', icon: 'icon-user', label: 'Home / Neighborhood' },
  { id: 'fantasy', icon: 'icon-bolt', label: 'Fantasy World' },
  { id: 'scifi', icon: 'icon-globe', label: 'Sci-Fi / Future' },
  { id: 'hospital', icon: 'icon-user', label: 'Hospital / Recovery' },
  { id: 'travel', icon: 'icon-globe', label: 'Traveling / Adventure' },
  { id: 'online', icon: 'icon-chat', label: 'Online / Social Media' },
  { id: 'other', icon: 'icon-sparkles', label: 'Other / Custom' },
];

const PERSONA_PRESETS = {
  friend: { label: 'Friend', icon: 'icon-chat' },
  bestfriend: { label: 'Best Friend', icon: 'icon-users' },
  brother: { label: 'Brother', icon: 'icon-user' },
  sister: { label: 'Sister', icon: 'icon-user' },
  mother: { label: 'Mother', icon: 'icon-user' },
  father: { label: 'Father', icon: 'icon-user' },
  lover: { label: 'Lover', icon: 'icon-heart' },
  rival: { label: 'Rival', icon: 'icon-bolt' },
};



function buildHazyMetadata({ files, isBuild, isCode, currentProject = null }) {
  const activePage = normalizePage(STATE.activePage);
  const agentEnabled = activePage === 'agent';
  const themeKey = normalizeTheme(STATE.theme);
  const theme = BUILD_THEME_PROFILES[themeKey] || BUILD_THEME_PROFILES.cream;

  // currentProject (if present) carries the exact files the user sees in Builder Output or clicked from history.
  // This is the primary signal that lets follow-up "fix" prompts target the right code instead of starting over.
  let currentProjectMeta = null;
  if (currentProject && Array.isArray(currentProject.files) && currentProject.files.length > 0) {
    currentProjectMeta = {
      project: currentProject.project || 'Project',
      fileCount: currentProject.files.length,
      // We send full content here; backend promptBuilder decides how much to inject based on size + edit intent.
      // Keep filenames + languages light; contents can be large but are required for reliable edit.
      files: currentProject.files.map(f => ({
        filename: f.filename,
        language: f.language || 'text',
        // Cap extremely large individual files at the wire level to avoid 10MB+ single requests.
        // (Full content is still preferred for small-medium projects that are the common case.)
        content: (f.content || '').length > 120000 ? (f.content.slice(0, 120000) + '\n\n// [TRUNCATED in transit - model should ask for full file if the relevant section is missing]') : (f.content || '')
      }))
    };
  }

  return {
    mode: STATE.mode,
    page: activePage,
    surface: activePage === 'agent' ? 'agentic' : 'chat',
    agenticMode: agentEnabled,
    appearance: {
      theme: themeKey,
      label: theme.label,
      mood: theme.mood,
      palette: theme.palette,
      instruction: theme.instruction,
    },
    reasoningMode: STATE.reasoningMode || 'auto',
    showReasoningSummary: STATE.showReasoningSummary !== false,
    codeLangHint: STATE.codeLang || 'auto',
    ragEnabled: window.hazyRAG ? window.hazyRAG.isActive() : (localStorage.getItem('hazyRAGEnabled') === 'true'),
    isBuild,
    isCode,
    agentEnabled,
    agentMaxIterations: getAgentMaxIterations(),
    agentSource: activePage === 'agent' ? 'page' : 'chat',
    attachments: (files || []).map(f => ({
      name: f.name,
      category: f.category,
      ext: f.ext || '',
      size: f.size,
      contentPreview: f.content ? f.content.slice(0, 8000) : ''
    })),
    currentProject: currentProjectMeta
  };
}

function decodeHazyTraceHeader(response) {
  const encoded = response?.headers?.get?.('X-Hazy-Trace');
  if (!encoded) return null;

  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch (error) {
    console.warn('Could not decode Hazy reasoning trace:', error);
    return null;
  }
}

function renderHazyDecisionTrace(trace, webSearchMetadata) {
  const hasTrace = trace && trace.summary;
  const hasWebSearch = webSearchMetadata && webSearchMetadata.runId;

  if (!hasTrace && !hasWebSearch) return '';

  const safeLabels = new Set(['Checked', 'Task analysis', 'Context window', 'Reasoning level', 'Tool decision', 'Verification']);

  let thinkItem = '';
  if (hasTrace) {
    const stepRows = (trace.steps || [])
      .filter(step => safeLabels.has(step.label))
      .slice(0, 5)
      .map(step => `
        <div class="tl-step-row">
          <span class="tl-step-key">${escapeHtml(step.label)}</span>
          <span class="tl-step-val">${escapeHtml(step.value)}</span>
        </div>`)
      .join('');

    const tools = (trace.tools || [])
      .filter(t => t.tool)
      .slice(0, 6)
      .map(t => `<span>${escapeHtml(t.tool)}${t.success ? ' âœ“' : ' â€“'}</span>`)
      .join('');

    /* Gear/cog icon for thinking - matches Figma reference */
    const thinkSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;

    thinkItem = `
      <div class="timeline-item" role="listitem">
        <div class="tl-icon" aria-hidden="true">${thinkSvg}</div>
        <div class="tl-content">
          <div class="tl-label">Thinking</div>
          <div class="tl-text">${escapeHtml(trace.summary)}</div>
          ${stepRows ? `<div class="tl-step-grid">${stepRows}</div>` : ''}
          ${tools ? `<div class="tl-tools">${tools}</div>` : ''}
          ${trace.note ? `<p class="tl-note">${escapeHtml(trace.note)}</p>` : ''}
        </div>
      </div>`;
  }

  /* Globe with crosshair icon for web search - matches Figma reference */
  const searchSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`;

  const webPlaceholder = hasWebSearch
    ? `<div class="timeline-item" role="listitem" id="tl-search-placeholder-${escapeHtml(webSearchMetadata.runId)}">
        <div class="tl-icon search pulsing" aria-hidden="true">${searchSvg}</div>
        <div class="tl-content">
          <div class="tl-label">Searching the web</div>
          <div class="tl-skeleton wide"></div>
          <div class="tl-skeleton mid"></div>
          <div class="tl-skeleton narrow"></div>
        </div>
       </div>`
    : '';

  const summaryText = hasTrace ? escapeHtml(trace.summary) : 'Searching the web...';
  const summaryIconClass = hasTrace ? '' : 'search-icon';
  /* Hazy sparkle star for summary header */
  const summaryIconSvg = hasTrace
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 5.2 5.6.8-4 4 .9 5.6L12 15l-4.9 2.6.9-5.6-4-4 5.6-.8z"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

  return `
    <details class="timeline-panel" open
      aria-label="Reasoning trace"
      aria-expanded="true">
      <summary tabindex="0">
        <span class="tl-summary-icon ${summaryIconClass}" aria-hidden="true">${summaryIconSvg}</span>
        <span class="tl-summary-label">Hazy</span>
        <span class="tl-summary-text">${summaryText}</span>
        <span class="tl-chevron" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
      </summary>
      <div class="timeline-list" role="list">
        ${thinkItem}
        ${webPlaceholder}
      </div>
    </details>`;
}

function getWebSearchMetadata(response) {
  return {
    runId: response.headers.get('X-Hazy-Web-Search-Run') || '',
    mode: response.headers.get('X-Hazy-Web-Search-Mode') || '',
    confidence: response.headers.get('X-Hazy-Web-Confidence') || '',
    citationCount: Number(response.headers.get('X-Hazy-Citation-Count') || 0)
  };
}

function renderSourcePanelList(title, items, renderer, emptyText = 'None') {
  const rows = Array.isArray(items) ? items : [];
  return `
    <details class="web-source-section" ${rows.length ? 'open' : ''}>
      <summary>${escapeHtml(title)} <span>${rows.length}</span></summary>
      ${rows.length ? `<div class="web-source-section-body">${rows.map(renderer).join('')}</div>` : `<p>${escapeHtml(emptyText)}</p>`}
    </details>`;
}

// Returns the HTML string for the populated search item (SOURCES_LOADED state)
// OR an error item (ERROR state). Never throws - always resolves.
async function loadWebSourceCards(metadata) {
  if (!metadata?.runId || !metadata.citationCount) return null;

  try {
    const params = new URLSearchParams({ runId: metadata.runId, userId: 'local-user' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(hazyServerEndpoint(`/hazy/sources?${params.toString()}`), { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const citations = Array.isArray(data.citations) ? data.citations : [];
    if (!citations.length) return null; // no citations - leave placeholder removed, no Done item

    const decision = data.decision || {};
    const queries = Array.isArray(data.queries) ? data.queries : [];
    const confidence = (data.confidence || metadata.confidence || 'low').toLowerCase();

    const sourceCards = citations.map((citation, index) => {
      let host = citation.domain;
      if (!host) { try { host = new URL(citation.url).hostname; } catch { host = citation.url; } }
      return `
        <a class="tl-source-card" href="${escapeHtml(citation.url)}" target="_blank" rel="noopener noreferrer"
           aria-label="Source ${index + 1}: ${escapeHtml(citation.title || host)}">
          <span class="tl-source-num">${citation.sourceNumber || index + 1}</span>
          <span class="tl-source-copy">
            <strong>${escapeHtml(citation.title || 'Web source')}</strong>
            <small>${escapeHtml(host)}${citation.publishedAt ? ` · ${String(citation.publishedAt).slice(0, 10)}` : ''}</small>
          </span>
        </a>`;
    }).join('');

    const queryChips = queries.length
      ? `<div class="tl-search-queries">${queries.map(q => `<code>${escapeHtml(q.query || q)}</code>`).join('')}</div>`
      : '';

    return `
      <div class="tl-label">Web search</div>
      <div class="tl-confidence ${confidence}" role="status" aria-live="polite">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
        ${escapeHtml(decision.mode || metadata.mode || 'web')} · ${escapeHtml(confidence)} confidence
      </div>
      ${decision.reason ? `<div class="tl-text" style="margin-bottom:4px">${escapeHtml(decision.reason)}</div>` : ''}
      ${queryChips}
      <div class="tl-source-grid">${sourceCards}</div>
      <div class="tl-meta-row">
        <span><b>${citations.length}</b> cited</span>
      </div>`;

  } catch (err) {
    const reason = err.name === 'AbortError' ? 'Request timed out.' : 'Could not load results.';
    return `__ERROR__:${reason}`;
  }
}

// Inject web search result (or error) into the timeline placeholder.
// Called after the stream resolves. Returns the timeline-list container so
// the caller can append the Done item when ready.
function finalizeTimelineSearch(contentDiv, metadata, searchResultHtml) {
  if (!metadata?.runId) return null;
  const placeholder = contentDiv.querySelector(`#tl-search-placeholder-${CSS.escape(metadata.runId)}`);
  if (!placeholder) return null;

  const timelineList = placeholder.closest('.timeline-list');

  /* Globe with crosshair for web search results */
  const searchSvgSm = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`;
  /* Triangle alert for errors */
  const warnSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r=".5"/></svg>`;
  /* Circle checkmark for success */
  const checkSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;

  if (!searchResultHtml) {
    placeholder.className = 'timeline-item';
    placeholder.setAttribute('role', 'listitem');
    placeholder.innerHTML = `
      <div class="tl-icon search" aria-hidden="true">${searchSvgSm}</div>
      <div class="tl-content">
        <div class="tl-label">Web search</div>
        <div class="tl-text">No relevant web sources found.</div>
      </div>`;
    return timelineList;
  }

  if (searchResultHtml.startsWith('__ERROR__:')) {
    const reason = searchResultHtml.slice(10);
    placeholder.className = 'timeline-item timeline-item--error';
    placeholder.setAttribute('role', 'listitem');
    placeholder.innerHTML = `
      <div class="tl-icon error" aria-hidden="true">${warnSvg}</div>
      <div class="tl-content">
        <div class="tl-label">Web search</div>
        <div class="tl-text">Web search failed. ${escapeHtml(reason)} Showing model knowledge only.</div>
      </div>`;
    return timelineList;
  }

  placeholder.className = 'timeline-item';
  placeholder.setAttribute('role', 'listitem');
  placeholder.innerHTML = `
    <div class="tl-icon search" aria-hidden="true">${searchSvgSm}</div>
    <div class="tl-content">${searchResultHtml}</div>`;
  return timelineList;
}

// Append the final Done item once both stream + search are settled.
function appendTimelineDone(timelineList) {
  if (!timelineList) return;
  /* Circle checkmark for done - clean enclosed check */
  const doneSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
  const done = document.createElement('div');
  done.className = 'timeline-item';
  done.setAttribute('role', 'listitem');
  done.innerHTML = `
    <div class="tl-icon done" aria-hidden="true">${doneSvg}</div>
    <div class="tl-content">
      <div class="tl-done-badge">Done</div>
    </div>`;
  timelineList.appendChild(done);
}

function appendHazyDecisionTrace(trace) {
  const html = renderHazyDecisionTrace(trace);
  if (!html) return null;

  const div = document.createElement('div');
  div.className = 'hazy-trace-wrap';
  div.innerHTML = html;
  el.messagesArea.appendChild(div);
  scrollToBottom(true);
  return div;
}

function renderRawThinking(thinking, streaming = false) {
  if (!thinking) return '';

  const escaped = escapeHtml(thinking);

  if (streaming) {
    // Live thinking — open so user can watch the reasoning in real-time
    return `<details class="thinking-block thinking-streaming" open>
      <summary class="thinking-summary">
        <span class="thinking-icon">🧠</span>
        <span>Thinking...</span>
        <span class="thinking-dot-pulse"></span>
      </summary>
      <div class="thinking-content">${escaped}</div>
    </details>`;
  }

  // Finished — collapsed, click to expand
  const wordCount = thinking.trim().split(/\s+/).length;
  return `<details class="thinking-block">
    <summary class="thinking-summary">
      <span class="thinking-icon">🧠</span>
      <span>Thinking</span>
      <span class="thinking-badge">${wordCount} words</span>
      <span class="thinking-expand-hint">click to expand</span>
    </summary>
    <div class="thinking-content">${escaped}</div>
  </details>`;
}

function renderAssistantContent(content, trace = null, thinking = '', webSearchMetadata = null, toolEvents = '') {
  return `${renderHazyDecisionTrace(trace, webSearchMetadata)}${renderRawThinking(thinking)}${toolEvents}${renderMarkdown(content || '')}`;
}

function getThinkingToken(json) {
  return json?.message?.thinking || json?.thinking ||
    json?.message?.reasoning_content || json?.reasoning_content || '';
}

// -- Generate the first message automatically when starting a persona chat -
async function injectPersonaOpener() {
  if (!STATE.personaEnabled) return;
  const conv = STATE.conversations[STATE.activeConvId];
  if (!conv || conv.messages.length > 0) return;

  // Send a hidden trigger to make the AI open the scene
  const triggerMsg = STATE.scenarioOpener
    ? '[START SCENE - deliver your opening line as described]'
    : '[START SCENE - open naturally, set the mood, you go first]';

  setStreamingState(true);
  appendTypingIndicator();

  try {
    STATE.abortController = new AbortController();
    const savedModel = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud = ['anthropic', 'openai', 'groq', 'gemini', 'nvidia'].includes(savedProvider);

    const personaChatEndpoint = window.location.protocol === 'file:'
      ? `${STATE.ollamaUrl}/api/chat`
      : hazyServerEndpoint('/hazy/chat');

    const personaBody = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'system', content: STATE.personaEnabled ? STATE.personaPrompt : STATE.systemPrompt }, { role: 'user', content: triggerMsg }], stream: true, think: STATE.reasoningMode === 'deep', options: { temperature: Math.min(STATE.temperature + 0.1, 1.0), num_predict: STATE.maxTokens } }
      : { model: savedModel, messages: [{ role: 'system', content: STATE.personaEnabled ? STATE.personaPrompt : STATE.systemPrompt }, { role: 'user', content: triggerMsg }], stream: true, options: { temperature: Math.min(STATE.temperature + 0.1, 1.0), num_predict: STATE.maxTokens, max_tokens: STATE.maxTokens } };

    const response = await fetch(personaChatEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: STATE.abortController.signal,
      body: JSON.stringify(personaBody),
    });

    if (!response.ok) throw new Error(`${response.status}`);

    const hazyTrace = decodeHazyTraceHeader(response);

    removeTypingIndicator();
    if (hazyTrace) appendHazyDecisionTrace(hazyTrace);
    const aiTs = Date.now();
    const { contentDiv, mascotImg } = appendMessage('assistant', '', true, aiTs);
    // Attach mascot emotion controller to this message
    const _mascotCtrl = mascotImg && window.HazyMascotController ? new window.HazyMascotController(mascotImg) : null;
    if (_mascotCtrl) window.HAZY_MASCOT_CONTROLLER = _mascotCtrl;
    let _rawEmoBuf = '';
    let fullContent = '';
    let fullThinking = '';
    let fullToolEvents = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim())) {
        try {
          const json = JSON.parse(line);
          if (json.hazyEvent === 'tool_started') {
             fullToolEvents += `<div class="tool-call-banner" style="margin: 8px 0; padding: 6px 12px; background: rgba(0,0,0,0.05); border-left: 3px solid var(--hazy-brand); border-radius: 4px; font-size: 0.85em; display: flex; align-items: center; gap: 8px; color: var(--text-secondary);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Using tool: <strong>${escapeHtml(json.name)}</strong>...</span>
              </div>`;
             contentDiv.innerHTML = `${renderRawThinking(fullThinking, true)}${fullToolEvents}${renderMarkdown(fullContent)}`;
             scrollToBottom();
             continue;
          }
          const thinkingToken = getThinkingToken(json);
          if (thinkingToken) {
            fullThinking += thinkingToken;
            contentDiv.innerHTML = `${renderRawThinking(fullThinking, true)}${fullToolEvents}${renderMarkdown(fullContent)}`;
            scrollToBottom();
          }
          if (json.message?.content) {
            const _t1 = json.message.content;
            _rawEmoBuf += _t1;
            if (_mascotCtrl) _mascotCtrl.scanBuffer(_rawEmoBuf);
            const _clean1 = window.hazyStripEmotionTags ? window.hazyStripEmotionTags(_t1) : _t1.replace(/\[\[(happy|annoyed|flustered)\]\]/g, '');
            fullContent += _clean1;
            contentDiv.innerHTML = `${renderRawThinking(fullThinking)}${fullToolEvents}${renderMarkdown(fullContent)}<span class="stream-cursor"></span>`;
            scrollToBottom();
          }
          if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
        } catch { }
      }
    }

    if (_mascotCtrl) { _mascotCtrl.onStreamEnd(fullContent); window.HAZY_MASCOT_CONTROLLER = null; }
    conv.messages.push({
      role: 'assistant',
      content: fullContent,
      thinking: fullThinking,
      ts: aiTs,
      emotion: _mascotCtrl ? (_mascotCtrl._currentEmotion || 'happy') : 'happy'
    });
    saveConversations();
    contentDiv.innerHTML = renderAssistantContent(fullContent, null, fullThinking, null, fullToolEvents);
    highlightCodeBlocks(contentDiv);

  } catch (e) {
    removeTypingIndicator();
    if (e.name !== 'AbortError') appendErrorMessage(`Could not start scene: ${e.message}`);
  } finally {
    setStreamingState(false);
    scrollToBottom(true);
  }
}

function updatePersonaBadge() {
  const badge = el.personaStatusBadge;
  if (!badge) return;
  if (STATE.personaEnabled) {
    const preset = PERSONA_PRESETS[STATE.personaRelation];
    badge.textContent = `${preset?.label || 'Persona'}: ${STATE.personaName}`;
    badge.style.display = 'inline-flex';
    el.personaBtn?.classList.add('persona-active');
  } else {
    badge.style.display = 'none';
    el.personaBtn?.classList.remove('persona-active');
  }
}

// Render preset scenario cards
function renderPresetScenarioGrid() {
  const grid = $('presetScenarioGrid');
  if (!grid) return;
  grid.innerHTML = SCENARIO_PRESETS.map(p => `
    <button class="preset-scenario-card ${STATE.scenarioDesc === p.scenarioDesc && p.id !== 'custom' ? 'selected' : ''}"
      data-id="${p.id}">
      <span class="preset-scenario-emoji">${getIconSvg(p.icon || 'icon-sparkles')}</span>
      <span class="preset-scenario-tag">${p.tag}</span>
      <span class="preset-scenario-title">${p.title}</span>
    </button>`).join('');

  grid.querySelectorAll('.preset-scenario-card').forEach(card => {
    card.addEventListener('click', () => {
      const preset = SCENARIO_PRESETS.find(p => p.id === card.dataset.id);
      if (!preset) return;

      grid.querySelectorAll('.preset-scenario-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      if (preset.id === 'custom') {
        // Switch to Scenario tab for custom
        switchPersonaTab('scenario');
        return;
      }

      // Fill in all fields from preset
      const charName = STATE.personaName || 'Alex';
      if (el.personaNameInput) el.personaNameInput.value = charName;
      if (el.personaGender) el.personaGender.value = preset.gender;
      if (el.personaLanguage) el.personaLanguage.value = preset.language;
      if (el.scenarioDesc) el.scenarioDesc.value = preset.scenarioDesc.replace(/\{name\}/g, charName);
      if (el.scenarioOpener) el.scenarioOpener.value = preset.opener.replace(/\{name\}/g, charName);
      if (el.scenarioUserRole) el.scenarioUserRole.value = preset.userRole;
      if (el.scenarioCharRole) el.scenarioCharRole.value = preset.charRole;

      // Select relation card
      document.querySelectorAll('.persona-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.relation === preset.relation);
      });

      // Select traits
      document.querySelectorAll('.trait-pill').forEach(pill => {
        pill.classList.toggle('selected', preset.traits.includes(pill.dataset.trait));
      });

      showToast(`"${preset.title}" loaded - customize or hit Start Scenario!`, 'success');
    });
  });
}

// Render scenario setting grid
function renderScenarioSettingGrid() {
  const grid = $('scenarioSettingGrid');
  if (!grid) return;
  grid.innerHTML = SCENARIO_SETTINGS.map(s => `
    <button class="scenario-setting-btn ${STATE.scenarioSetting === s.id ? 'selected' : ''}" data-setting="${s.id}">
      ${getIconSvg(s.icon || 'icon-sparkles')} ${s.label}
    </button>`).join('');

  grid.querySelectorAll('.scenario-setting-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.scenario-setting-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      STATE.scenarioSetting = btn.dataset.setting;
    });
  });
}

function switchPersonaTab(tabId) {
  document.querySelectorAll('.persona-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  document.querySelectorAll('.persona-tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tabId}`)
  );
  if (tabId === 'preview') updatePersonaPreview();
}

async function updatePersonaPreview() {
  if (!el.personaPreviewBox) return;

  const currentSettings = {
    personaRelation: document.querySelector('.persona-card.selected')?.dataset.relation || 'friend',
    personaName: el.personaNameInput?.value.trim() || 'Alex',
    personaUserName: el.personaUserNameInput?.value.trim() || '',
    personaGender: el.personaGender?.value || 'neutral',
    personaLanguage: el.personaLanguage?.value || 'casual',
    personaTraits: Array.from(document.querySelectorAll('.trait-pill.selected')).map(p => p.dataset.trait),
    scenarioDesc: el.scenarioDesc?.value.trim() || '',
    scenarioOpener: el.scenarioOpener?.value.trim() || '',
    scenarioUserRole: el.scenarioUserRole?.value.trim() || '',
    scenarioCharRole: el.scenarioCharRole?.value.trim() || '',
    scenarioSetting: document.querySelector('.scenario-setting-btn.selected')?.dataset.setting || ''
  };

  el.personaPreviewBox.textContent = 'Generating preview...';

  try {
    if (window.location.protocol === 'file:') throw new Error('standalone');
    const response = await fetch(hazyServerEndpoint('/hazy/persona-prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentSettings)
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    el.personaPreviewBox.textContent = data.prompt;
  } catch (e) {
    el.personaPreviewBox.textContent = "Preview unavailable in standalone mode. Connect to Hazy Server.";
  }
}

// ========================
// Conversations
// ========================
async function loadConversations() {
  let legacyConversations = {};
  try {
    legacyConversations = JSON.parse(localStorage.getItem('hazy_conversations') || '{}');
  } catch { }

  if (window.location.protocol === 'file:') {
    STATE.conversations = legacyConversations;
    normalizeStoredConversations();
    return;
  }

  try {
    const response = await fetch('/hazy/conversations?userId=local-user');
    if (!response.ok) throw new Error('Conversation storage unavailable.');
    const data = await response.json();
    const storedConversations = data.conversations || {};
    STATE.conversations = Object.keys(storedConversations).length
      ? storedConversations
      : legacyConversations;
    if (!Object.keys(storedConversations).length && Object.keys(legacyConversations).length) {
      await persistConversations();
    }
    localStorage.removeItem('hazy_conversations');
    normalizeStoredConversations();
  } catch {
    STATE.conversations = legacyConversations;
    normalizeStoredConversations();
  }
}

let conversationSaveTimer = null;

function saveConversations() {
  if (window.location.protocol === 'file:') {
    localStorage.setItem('hazy_conversations', JSON.stringify(STATE.conversations));
    return;
  }
  clearTimeout(conversationSaveTimer);
  conversationSaveTimer = setTimeout(() => {
    persistConversations().catch(() => {
      localStorage.setItem('hazy_conversations', JSON.stringify(STATE.conversations));
    });
  }, 120);
}

async function persistConversations() {
  const response = await fetch('/hazy/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'local-user',
      conversations: STATE.conversations
    })
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || 'Could not save conversations.');
  }
  localStorage.removeItem('hazy_conversations');
}

function createConversation(firstMessage, page = STATE.activePage) {
  const normalizedPage = normalizePage(page);
  const id = `conv_${normalizedPage}_${Date.now()}`;
  STATE.conversations[id] = {
    title: '...',   // placeholder - will be replaced by generateChatTitle
    messages: [],
    createdAt: Date.now(),
    page: normalizedPage,
    agentEnabled: normalizedPage === 'agent',
    agent: normalizedPage === 'agent' ? { maxIterations: getAgentMaxIterations() } : undefined,
  };
  STATE.activePage = normalizedPage;
  STATE.activeConvId = id;
  STATE.pageConversations[normalizedPage] = id;
  saveConversations();
  renderChatHistory();
  updatePageChrome();
  return id;
}

// -- Auto-generate a smart title from the first exchange -------------------
// Runs as a background call after the first AI reply is received.
// Uses a tiny max_tokens budget so it's fast and doesn't compete with RAM.
async function generateChatTitle(convId, userMsg, aiReply) {
  if (!convId || !STATE.conversations[convId]) return;

  const userName = (STATE.personaUserName || '').trim();
  const savedModel = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);

  try {
    if (window.location.protocol === 'file:') throw new Error('standalone');

    const response = await fetch(hazyServerEndpoint('/hazy/generate-title'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMsg,
        aiReply,
        userName,
        model: savedModel
      })
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    let title = (data.title || '').trim();

    if (!title || title.length > 60) throw new Error('bad title');

    if (STATE.conversations[convId]) {
      STATE.conversations[convId].title = title;
      saveConversations();
      renderChatHistory();
      if (convId === STATE.activeConvId) {
        updateWorkspaceChrome();
      }
    }
  } catch (err) {
    // Standalone fallback: build prompt and query Ollama directly, or use first few words of userMsg
    try {
      const displayUserName = userName && userName.toLowerCase() !== 'you' ? userName : 'Not specified';
      const prompt = `In 4 words or less, give this conversation a short descriptive title. No quotes, no punctuation, just the title words.

User Name: ${displayUserName}
AI Name: Hazy

Rules for greetings:
- If the user's message is just a simple greeting (like "hi", "hello", "hey", "hola", "sup", "yo"), title the conversation exactly as:
  * If User Name is specified: "${userName}'s Greetings"
  * If User Name is Not specified: "Hazy's Hi Responses"

User said: "${userMsg.slice(0, 200)}"
AI replied: "${aiReply.slice(0, 200)}"

Title:`;

      const titleEndpoint = `${STATE.ollamaUrl}/api/chat`;
      const titleBody = { model: STATE.model, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.5, num_predict: 16 } };

      const res = await fetch(titleEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(titleBody),
      });

      if (!res.ok) throw new Error();
      const data = await res.json();
      let title = (data.message?.content || '').trim();

      // Sanitize - strip quotes, newlines, extra punctuation
      title = title.replace(/^["'`]+|["'`]+$/g, '').replace(/\n.*/s, '').trim();
      // Capitalize first letter
      title = title.charAt(0).toUpperCase() + title.slice(1);
      // Fallback if empty or too long
      if (!title || title.length > 60) throw new Error('bad title');

      if (STATE.conversations[convId]) {
        STATE.conversations[convId].title = title;
        saveConversations();
        renderChatHistory();
        if (convId === STATE.activeConvId) {
          updateWorkspaceChrome();
        }
      }
    } catch (fallbackErr) {
      // Fallback: make a clean title from user message or greeting rules
      if (STATE.conversations[convId] && (STATE.conversations[convId].title === '...' || STATE.conversations[convId].title === '.')) {
        const title = userMsg.trim().slice(0, 30) + (userMsg.trim().length > 30 ? '...' : '') || 'New Conversation';
        STATE.conversations[convId].title = title;
        saveConversations();
        renderChatHistory();
        if (convId === STATE.activeConvId) {
          updateWorkspaceChrome();
        }
      }
    }
  }
}

function switchConversation(id, options = {}) {
  const conv = STATE.conversations[id];
  if (!conv) return;
  const convPage = getConversationPage(conv);
  if (!options.preservePage && convPage !== STATE.activePage) {
    STATE.activePage = convPage;
    document.body.dataset.hazyPage = convPage;
    persistActivePage();
  }
  STATE.activeConvId = id;
  STATE.pageConversations[convPage] = id;
  document.getElementById('historyDrawer')?.classList.remove('open');
  document.getElementById('moreMenu')?.classList.remove('open');
  document.getElementById('appScrim')?.classList.remove('active');
  el.welcomeScreen.style.display = 'none';
  el.messagesArea.classList.add('visible');
  el.messagesArea.innerHTML = '';

  // Isolate project context to this conversation only - clear any lingering
  // build state from a different chat so files never bleed across sessions.
  window._lastBuild = null;
  STATE.builderFiles = [];
  STATE.builderActive = false;

  conv.messages.forEach(msg => {

    if (msg.role === 'system') return;
    const { group } = appendMessage(msg.role, msg.content, false, msg.ts, msg.emotion);
    // Restore file attachments thumbnail if stored
    if (msg.files && msg.files.length) {
      const attachmentsHtml = renderAttachedFilesInMessage(msg.files);
      if (attachmentsHtml) {
        const attachDiv = document.createElement('div');
        attachDiv.innerHTML = attachmentsHtml;
        const bubble = group.querySelector('.message-bubble');
        if (bubble) bubble.insertBefore(attachDiv.firstChild, bubble.querySelector('.message-content'));
      }
    }
  });
  scrollToBottom(true);
  renderChatHistory();
  updateWorkspaceChrome();
}

function deleteConversation(id) {
  const deletedPage = getConversationPage(STATE.conversations[id] || {});
  delete STATE.conversations[id];
  if (STATE.pageConversations.chat === id) STATE.pageConversations.chat = findLatestConversationForPage('chat');
  if (STATE.pageConversations.agent === id) STATE.pageConversations.agent = findLatestConversationForPage('agent');
  saveConversations();
  if (STATE.activeConvId === id) {
    STATE.activeConvId = STATE.pageConversations[deletedPage] || null;
    if (STATE.activeConvId) switchConversation(STATE.activeConvId, { preservePage: true });
    else showWelcomeScreen();
  }
  renderChatHistory();
}

function renameConversation(id, title) {
  if (!STATE.conversations[id] || !title.trim()) return;
  STATE.conversations[id].title = title.trim().slice(0, 80);
  saveConversations(); renderChatHistory();
}

function showWelcomeScreen() {
  el.welcomeScreen.style.display = '';
  el.messagesArea.classList.remove('visible');
  el.messagesArea.innerHTML = '';
  el.scrollBottomBtn.style.display = 'none';
  // Clear any cross-chat build state - new chat = fresh slate
  window._lastBuild = null;
  STATE.builderFiles = [];
  STATE.builderActive = false;
  updateWorkspaceChrome();
}

// ========================
// Render chat history
// ========================
function renderChatHistory(filterText) {
  const query = (filterText || el.historySearch.value || '').toLowerCase().trim();
  const activePage = normalizePage(STATE.activePage);
  let convs = Object.entries(STATE.conversations)
    .filter(([, conv]) => getConversationPage(conv) === activePage)
    .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));
  if (query) convs = convs.filter(([, c]) => (c.title || '').toLowerCase().includes(query));
  const shortcuts = document.getElementById('recentShortcutList');

  if (!convs.length) {
    el.chatHistory.innerHTML = query
      ? `<div class="empty-history">No chats match "${escapeHtml(query)}"</div>`
      : `<div class="empty-history">Your ${activePage === 'agent' ? 'agentic sessions' : 'conversations'} will appear here</div>`;
    if (shortcuts) {
      shortcuts.innerHTML = `<div class="empty-history">Your recent ${activePage === 'agent' ? 'agentic sessions' : 'conversations'} will appear here.</div>`;
    }
    updateWorkspaceChrome();
    return;
  }

  el.chatHistory.innerHTML = convs.map(([id, conv]) => {
    const isLoading = conv.title === '...';
    const titleHtml = isLoading
      ? `<span class="history-title-loading"></span>`
      : `<span class="history-title">${escapeHtml(conv.title || 'New Chat')}</span>`;
    return `
    <div class="history-item ${id === STATE.activeConvId ? 'active' : ''}" data-id="${id}">
      <div class="history-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div class="history-item-body">
        ${titleHtml}
        <span class="history-time">${activePage === 'agent' ? 'Agentic · ' : ''}${conv.createdAt ? formatRelativeTime(conv.createdAt) : ''}</span>
      </div>
      <div class="history-actions">
        <button class="history-rename" data-id="${id}" title="Rename">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="history-delete" data-id="${id}" title="Delete">✖</button>
      </div>
    </div>`;
  }).join('');

  el.chatHistory.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.history-actions')) return;
      switchConversation(item.dataset.id);
      closeSidebarMobile();
    });
  });
  el.chatHistory.querySelectorAll('.history-rename').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      STATE.renameTargetId = btn.dataset.id;
      el.renameInput.value = STATE.conversations[btn.dataset.id]?.title || '';
      openModal('renameModal');
      setTimeout(() => { el.renameInput.focus(); el.renameInput.select(); }, 50);
    });
  });
  el.chatHistory.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Delete this conversation?')) deleteConversation(btn.dataset.id);
    });
  });

  if (shortcuts) {
    const recent = convs.slice(0, 3);
    shortcuts.innerHTML = recent.map(([id, conv]) => `
      <button class="recent-shortcut" data-id="${id}" type="button">
        <strong>${escapeHtml(conv.title || 'New Chat')}</strong>
        <span>${conv.createdAt ? formatRelativeTime(conv.createdAt) : 'just now'}</span>
      </button>
    `).join('');

    shortcuts.querySelectorAll('.recent-shortcut').forEach(btn => {
      btn.addEventListener('click', () => switchConversation(btn.dataset.id));
    });
  }

  updateWorkspaceChrome();
}

// ========================
// Helpers: time
// ========================
function formatRelativeTime(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (dy < 7) return `${dy}d ago`;
  return new Date(ts).toLocaleDateString();
}
function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateWorkspaceChrome() {
  const titleEl = document.getElementById('currentThreadTitle');
  const metaEl = document.getElementById('currentThreadMeta');
  const hasActive = !!STATE.activeConvId && !!STATE.conversations[STATE.activeConvId];
  const page = normalizePage(STATE.activePage);

  document.body.classList.toggle('chat-active', hasActive);

  if (titleEl) {
    titleEl.textContent = hasActive
      ? (STATE.conversations[STATE.activeConvId]?.title || (page === 'agent' ? 'New Agentic Session' : 'New Chat'))
      : (page === 'agent' ? 'Start an agentic run' : 'Start with one clear prompt');
  }

  if (metaEl) {
    metaEl.textContent = hasActive
      ? (page === 'agent'
        ? 'This session can call backend tools, validate arguments, and continue until the tool loop finishes.'
        : 'Everything stays in this thread: chat, build output, and code previews.')
      : (page === 'agent'
        ? 'Use this page when you want Hazy to research, calculate, or call safe backend tools.'
        : 'Ask a question, build a site, generate code, or reopen a recent thread.');
  }

  const heroSubtitle = document.querySelector('.hero-subtitle');
  if (heroSubtitle) {
    heroSubtitle.textContent = page === 'agent'
      ? 'Agentic mode is a separate web-chat page that routes through Hazyâ€™s backend tool loop.'
      : 'Your local companion for support, coding, and building full websites.';
  }

updatePageChrome();
}

// ========================
// Ollama connection
// ========================
async function checkOllamaConnection() {
  setStatus('loading', 'Connecting...');
  let models = null;

  if (window.location.protocol !== 'file:') {
    try {
      const res = await fetch(hazyServerEndpoint('/hazy/models'), { signal: AbortSignal.timeout(5000) });
      if (res.ok) models = (await res.json()).models;
    } catch { }
  }

  if (!models) {
    try {
      const res = await fetch(`${STATE.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) models = (await res.json()).models;
    } catch { }
  }

  if (models) {
    setStatus('online', 'Online');
    populateModels(models);
  } else {
    // Ollama offline - but cloud models may still be available
    const hasCloudKey = ['anthropic', 'openai', 'groq', 'gemini', 'nvidia']
      .some(p => _providerStatuses[p]?.hasKey &&
        localStorage.getItem('hazyVerified_' + p) === 'true');

    if (hasCloudKey) {
      setStatus('online', 'Cloud Active');
      // Show cloud models even without Ollama
      populateModels([]);
    } else {
      setStatus('error', 'Offline');
      el.modelList.innerHTML = `<div class="model-item loading-models" style="color:var(--danger);flex-direction:column;gap:4px;padding:12px 14px;"><span>⚠️ Cannot connect</span><span style="font-size:11px;opacity:.7">Run: <code>ollama serve</code> or start Hazy Server</span></div>`;
      el.currentModelName.textContent = 'Not connected';
    }
  }
}

function populateModels(models) {
  // -- Build cloud model entries for any provider with a saved key ------------
  const CLOUD_PROVIDERS = [
    { key: 'anthropic', label: 'âœ¦ Anthropic', icon: 'â˜' },
    { key: 'openai', label: 'âœ¦ OpenAI', icon: 'â˜' },
    { key: 'groq', label: 'âœ¦ Groq', icon: 'â˜' },
    { key: 'gemini', label: 'âœ¦ Gemini', icon: 'â˜' },
    { key: 'nvidia', label: 'âœ¦ NVIDIA', icon: 'â˜' },
  ];

  const activeCloud = [];
  CLOUD_PROVIDERS.forEach(p => {
    const hasKey = Boolean(_providerStatuses[p.key]?.hasKey);
    const verified = localStorage.getItem('hazyVerified_' + p.key) === 'true';
    // Only show in dropdown if key exists AND has been verified via Test button
    if (hasKey && verified) {
      const cloudModels = CLOUD_MODEL_MAP[p.key] || [];
      cloudModels.forEach(m => {
        activeCloud.push({ fullId: m.id, label: m.label, provider: p.key });
      });
    }
  });

  // -- Restore the currently active model from localStorage -----------------
  const savedModel = localStorage.getItem('hazyActiveModel') || '';
  const savedProvider = savedModel.split('/')[0] || 'ollama';
  const isCloudActive = ['anthropic', 'openai', 'groq', 'gemini', 'nvidia'].includes(savedProvider);

  // Keep the persisted local selection aligned with the model list. The
  // composer reads hazyActiveModel first, so a deleted/stale entry must not
  // win over a valid STATE.model on the next chat request.
  if (!isCloudActive && models.length) {
    const names = models.map(m => m.name);
    const savedLocalModel = savedModel.startsWith('ollama/')
      ? savedModel.slice('ollama/'.length)
      : '';
    const preferred = ['qwen3.5', 'qwen3', 'qwen2.5', 'qwen2', 'mistral', 'llama3', 'llama3.2', 'llama2', 'gemma', 'phi3'];
    const preferredModel = preferred
      .map(prefix => names.find(name => name.includes(prefix)))
      .find(Boolean);
    const resolvedLocalModel = names.includes(savedLocalModel)
      ? savedLocalModel
      : names.includes(STATE.model)
        ? STATE.model
        : preferredModel || names[0];

    STATE.model = resolvedLocalModel;
    const resolvedFullModel = 'ollama/' + resolvedLocalModel;
    if (localStorage.getItem('hazyActiveModel') !== resolvedFullModel) {
      localStorage.setItem('hazyActiveModel', resolvedFullModel);
      localStorage.setItem('hazyProvider', 'ollama');
    }
  }

  // -- Build HTML ------------------------------------------------------------
  let html = '';

  // Cloud section (if any active)
  if (activeCloud.length) {
    html += `<div class="dropdown-header">Cloud Models</div>`;
    html += activeCloud.map(m => {
      const isSelected = savedModel === m.fullId;
      return `<div class="model-item cloud-model-item ${isSelected ? 'selected' : ''}" data-name="${m.fullId}" data-provider="${m.provider}">
        <span>${m.label}</span>
        <span class="model-size" style="color:var(--accent);font-size:10px">${m.provider}</span>
      </div>`;
    }).join('');
    if (models.length) html += `<div class="dropdown-header" style="margin-top:4px">Local Models</div>`;
  }

  // Local Ollama models
  if (!models.length && !activeCloud.length) {
    html = `<div class="model-item loading-models" style="flex-direction:column;gap:4px;padding:12px 14px;">
      <span>No models available</span>
      <span style="font-size:11px;opacity:.7">Add an API key in Settings or run: <code>ollama pull mistral</code></span>
    </div>`;
  } else {
    html += models.map(m => {
      const mb = m.size ? Math.round(m.size / 1024 / 1024) : null;
      const sz = mb ? (mb > 1000 ? `${(mb / 1024).toFixed(1)}GB` : `${mb}MB`) : '';
      const currentName = isCloudActive ? savedModel : STATE.model;
      return `<div class="model-item ${m.name === currentName ? 'selected' : ''}" data-name="${m.name}" data-provider="ollama">
        <span>${m.name}</span>${sz ? `<span class="model-size">${sz}</span>` : ''}
      </div>`;
    }).join('');
  }

  el.modelList.innerHTML = html;

  // -- Update display name in sidebar ----------------------------------------
  if (isCloudActive && savedModel) {
    const cloudEntry = activeCloud.find(m => m.fullId === savedModel);
    el.currentModelName.textContent = cloudEntry ? cloudEntry.label : savedModel.split('/')[1] || savedModel;
  } else if (models.length) {
    el.currentModelName.textContent = STATE.model;
  }

  // -- Click handler for all items -------------------------------------------
  el.modelList.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const provider = item.dataset.provider || 'ollama';

      el.modelList.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      el.modelDropdown.classList.remove('open');
      el.modelSelector.classList.remove('open');

      if (provider === 'ollama') {
        // Local model - bare name for Ollama API
        STATE.model = name;
        el.currentModelName.textContent = name;
        localStorage.setItem('hazyActiveModel', 'ollama/' + name);
        localStorage.setItem('hazyProvider', 'ollama');
      } else {
        // Cloud model - full 'provider/model' string
        STATE.model = name;
        el.currentModelName.textContent = name.split('/')[1] || name;
        localStorage.setItem('hazyActiveModel', name);
        localStorage.setItem('hazyProvider', provider);
      }

      saveSettings();
      showToast('Model: ' + (name.includes('/') ? name.split('/')[1] : name), 'success');
    });
  });
}

function setStatus(s, t) { el.statusDot.className = 'status-dot ' + s; el.statusText.textContent = t; }

// ========================
// Mode switching
// ========================
function setMode(mode) {
  STATE.mode = mode;
  el.modeChatBtn?.classList.toggle('active', mode === 'chat');
  el.modeBuildBtn?.classList.toggle('active', mode === 'build');
  el.modeCodeBtn?.classList.toggle('active', mode === 'code');
  const langWrap = document.getElementById('codeLangWrap');
  if (langWrap) langWrap.style.display = mode === 'code' ? 'flex' : 'none';
  if (el.modeIndicator) {
    el.modeIndicator.innerHTML = mode === 'build' ? `${getIconSvg('icon-globe')}Website Builder mode`
      : mode === 'code' ? `${getIconSvg('icon-grid')}Code Builder mode`
        : `${getIconSvg('icon-chat')}Chat mode`;
  }
  if (el.chatInput) {
    el.chatInput.placeholder = mode === 'build'
      ? 'Describe the website you want to build...'
      : mode === 'code'
        ? 'Describe the program or script you want to build...'
        : 'Message Hazy...';
  }
}

// ========================
// Message rendering
// ========================
function appendMessage(role, content, animate = true, ts, emotion) {
  const group = document.createElement('div');
  group.className = 'message-group';
  if (!animate) group.style.animation = 'none';

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const roleSpan = document.createElement('span');
  roleSpan.className = `message-role ${role === 'user' ? 'user-role' : ''}`;
  roleSpan.textContent = role === 'user' ? 'You' : 'Hazy';
  meta.appendChild(roleSpan);
  if (ts) {
    const tsSpan = document.createElement('span');
    tsSpan.className = 'message-timestamp';
    tsSpan.textContent = formatTimestamp(ts);
    meta.appendChild(tsSpan);
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // Look up conv message to check if edited
  const convMsg = STATE.activeConvId
    ? (STATE.conversations[STATE.activeConvId]?.messages || []).find(
      m => m.role === role && m.content === content && m.ts === ts
    )
    : null;
  if (convMsg?.edited) {
    const editedBadge = document.createElement('span');
    editedBadge.className = 'msg-edited-badge';
    editedBadge.textContent = '(edited)';
    meta.appendChild(editedBadge);
  }
  group.appendChild(meta);

  if (role === 'assistant') {
    // Check if this message was originally a build/code result
    const convMsg2 = STATE.activeConvId
      ? (STATE.conversations[STATE.activeConvId]?.messages || []).find(
        m => m.role === role && m.ts === ts
      )
      : null;
    if (convMsg2?.buildMode && content) {
      // Prefer the stored structured projectData (exact files from when it was generated).
      // Fall back to re-parsing the raw content only if missing (older stored convs).
      const projectData = (convMsg2.projectData && Array.isArray(convMsg2.projectData.files) && convMsg2.projectData.files.length > 0)
        ? convMsg2.projectData
        : parseFinalResponseFiles(content);
      if (projectData && projectData.files.length > 0) {
        const cleanContent = stripCodeBlocksAndDelimiters(content);
        let bubbleHtml = '';
        bubbleHtml += renderAssistantContent(cleanContent, convMsg2?.trace || null, convMsg2?.thinking || '');

        const isPartial = !content.includes('===NOTES===') && !content.includes('===SETUP===');
        bubbleHtml += `
          <div class="build-success">
            <div class="build-success-header">
              <span class="build-success-icon">✅</span>
              <strong>${escapeHtml(projectData.project || (convMsg2.buildMode === 'code' ? 'Code' : 'Website'))} saved!</strong>
            </div>
            ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
            ${renderGeneratedFileCards(projectData)}
            ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
            ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
            <div class="build-actions">
              <button class="build-open-btn" onclick="window._lastBuild=${JSON.stringify(projectData).replace(/</g, '&lt;').replace(/>/g, '&gt;')};openBuilderPanel(window._lastBuild)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open in Builder
              </button>
            </div>
          </div>`;
        contentDiv.innerHTML = bubbleHtml;

        // Store for re-opening
        window[`_build_${ts}`] = projectData;
        // Fix the onclick to use the stored ref
        const openBtn = contentDiv.querySelector('.build-open-btn');
        if (openBtn) openBtn.onclick = () => { window._lastBuild = projectData; openBuilderPanel(projectData); };
        bindGeneratedFileCards(contentDiv, projectData);
        highlightCodeBlocks(contentDiv);
      } else {
        // Couldn't re-parse - show as markdown (best effort)
        contentDiv.innerHTML = renderAssistantContent(content, convMsg2?.trace || null, convMsg2?.thinking || '');
        highlightCodeBlocks(contentDiv);
      }
    } else {
      contentDiv.innerHTML = renderAssistantContent(content, convMsg2?.trace || null, convMsg2?.thinking || '');
      highlightCodeBlocks(contentDiv);
    }
  } else {
    contentDiv.textContent = content;
  }

  // -- Mascot layout for assistant messages ----------------------------------
  let mascotImg = null;
  if (role === 'assistant') {
    // Build: [mascot frame] | [message content]
    const hazyLayout = document.createElement('div');
    hazyLayout.className = 'hazy-message-layout';

    const mascotFrame = document.createElement('div');
    mascotFrame.className = 'hazy-mascot-frame';
    mascotImg = document.createElement('img');
    mascotImg.className = 'hazy-mascot-image';
    mascotImg.alt = 'Hazy';
    // Resolve emotion for this specific message
    const resolvedEmotion = emotion || (window.HAZY_MASCOT_STATE && window.HAZY_MASCOT_STATE.currentEmotion) || 'happy';
    const src = window.HAZY_MASCOTS ? window.HAZY_MASCOTS[resolvedEmotion] : `assets/mascot/hazy_ai_${resolvedEmotion}.png`;
    mascotImg.src = src;
    mascotImg.dataset.emotion = resolvedEmotion;
    mascotFrame.appendChild(mascotImg);
    hazyLayout.appendChild(mascotFrame);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'hazy-message-content';
    bubble.appendChild(contentDiv);
    contentWrapper.appendChild(bubble);
    hazyLayout.appendChild(contentWrapper);

    msgDiv.appendChild(hazyLayout);
  } else {
    bubble.appendChild(contentDiv);
    msgDiv.appendChild(bubble);
  }

  const actions = document.createElement('div');
  actions.className = 'message-actions';
  actions.innerHTML = `
    <button class="msg-action-btn copy-btn" title="Copy">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/></svg>
      Copy
    </button>
    ${role === 'user' ? `
    <button class="msg-action-btn edit-btn" title="Edit message">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Edit
    </button>` : ''}
    ${role === 'assistant' ? `
    <span class="message-voice-controls">
      <button class="msg-action-btn voice-play-btn" title="Play voice">Play</button>
      <button class="msg-action-btn voice-pause-btn" title="Pause voice">Pause</button>
      <button class="msg-action-btn voice-resume-btn" title="Resume voice">Resume</button>
      <button class="msg-action-btn voice-stop-btn" title="Stop voice">Stop</button>
      <button class="msg-action-btn voice-regenerate-btn" title="Regenerate voice">Regenerate voice</button>
    </span>
    <button class="msg-action-btn regen-btn" title="Regenerate">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20.5 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Regenerate
    </button>` : ''}
  `;

  // Copy
  actions.querySelector('.copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(content).then(() => {
      const btn = actions.querySelector('.copy-btn');
      btn.classList.add('copied'); btn.textContent = 'âœ“ Copied';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/></svg> Copy';
      }, 1500);
    });
  });

  // Edit (user messages only)
  if (role === 'user') {
    actions.querySelector('.edit-btn').addEventListener('click', () => {
      enterEditMode(group, bubble, contentDiv, content);
    });
  }

  // Regenerate (Hazy messages only)
  if (role === 'assistant') {
    actions.querySelector('.regen-btn')?.addEventListener('click', regenerateLast);
    const textForVoice = () => stripMarkdown(contentDiv.textContent || content || '');
    actions.querySelector('.voice-play-btn')?.addEventListener('click', () => speakText(textForVoice()));
    actions.querySelector('.voice-pause-btn')?.addEventListener('click', () => window.HAZY_AUDIO_QUEUE_MANAGER?.pause());
    actions.querySelector('.voice-resume-btn')?.addEventListener('click', () => window.HAZY_AUDIO_QUEUE_MANAGER?.resume());
    actions.querySelector('.voice-stop-btn')?.addEventListener('click', () => window.HAZY_STREAMING_TTS?.stop());
    actions.querySelector('.voice-regenerate-btn')?.addEventListener('click', () => speakText(textForVoice()));
  }

  // Place action buttons inside the message container so they align to the bubble
  msgDiv.appendChild(actions);
  group.appendChild(msgDiv);
  el.messagesArea.appendChild(group);
  return { group, contentDiv, mascotImg };
}

// ========================
// Inline message editing
// ========================
function enterEditMode(group, bubble, contentDiv, originalText) {
  if (STATE.isStreaming) return;

  // Mark group as editing so CSS can style it
  group.classList.add('editing');

  // Hide the original text content
  contentDiv.style.display = 'none';

  // Hide the action buttons
  const actions = group.querySelector('.message-actions');
  if (actions) actions.style.display = 'none';

  // Build the inline editor
  const editor = document.createElement('div');
  editor.className = 'msg-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'msg-edit-textarea';
  textarea.value = originalText;
  textarea.rows = 1;

  // Auto-resize textarea
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
  };
  textarea.addEventListener('input', resize);
  setTimeout(() => { resize(); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 10);

  // Keyboard: Ctrl/Cmd+Enter = save, Escape = cancel
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'msg-editor-btns';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'msg-editor-save';
  saveBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Save & Resend`;

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'msg-editor-cancel';
  cancelBtn.textContent = 'Cancel';

  const hint = document.createElement('span');
  hint.className = 'msg-editor-hint';
  hint.textContent = 'Ctrl+Enter to save · Esc to cancel';

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(hint);
  editor.appendChild(textarea);
  editor.appendChild(btnRow);
  bubble.appendChild(editor);

  function cancelEdit() {
    group.classList.remove('editing');
    contentDiv.style.display = '';
    if (actions) actions.style.display = '';
    editor.remove();
  }

  async function saveEdit() {
    const newText = textarea.value.trim();
    if (!newText) { showToast('Message cannot be empty', 'error'); return; }
    if (newText === originalText) { cancelEdit(); return; }

    // Find this message's index in conversation history
    const conv = STATE.conversations[STATE.activeConvId];
    if (!conv) { cancelEdit(); return; }

    // Find the user message that matches original text
    const msgIndex = conv.messages.findIndex(
      m => m.role === 'user' && m.content === originalText
    );
    if (msgIndex === -1) { cancelEdit(); return; }

    // Update the message text
    conv.messages[msgIndex].content = newText;
    conv.messages[msgIndex].edited = true;
    conv.messages[msgIndex].editedAt = Date.now();

    // Remove everything AFTER this message (AI replies + follow-ups)
    conv.messages.splice(msgIndex + 1);
    saveConversations();

    // Re-render all messages up to this point
    el.messagesArea.innerHTML = '';
    conv.messages.forEach(msg => {
      if (msg.role === 'system') return;
      const { group: g } = appendMessage(msg.role, msg.content, false, msg.ts, msg.emotion);
      // Re-attach file thumbnails if any
      if (msg.files && msg.files.length) {
        const html = renderAttachedFilesInMessage(msg.files);
        if (html) {
          const d = document.createElement('div');
          d.innerHTML = html;
          const bbl = g.querySelector('.message-bubble');
          if (bbl) bbl.insertBefore(d.firstChild, bbl.querySelector('.message-content'));
        }
      }
    });

    // Remove the edited message from history so sendMessage won't double-add it
    conv.messages.pop();
    saveConversations();

    // Re-send with the new text
    await sendMessage(newText);
  }

  saveBtn.addEventListener('click', saveEdit);
  cancelBtn.addEventListener('click', cancelEdit);
}

function appendTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message-group'; div.id = 'typingIndicator';
  div.innerHTML = `<div class="message-meta"><span class="message-role">Hazy</span></div>
    <div class="typing-indicator">
      <div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>
      <span class="typing-label" id="typingLabel">${STATE.mode === 'build' ? 'Building your website...' : STATE.mode === 'code' ? 'Building your code...' : 'Thinking...'}</span>
    </div>`;
  el.messagesArea.appendChild(div);
  scrollToBottom(true);
  return div;
}

function removeTypingIndicator() { $('typingIndicator')?.remove(); }

function normalizeCompanionResponse(text) {
  let revised = String(text || '');
  revised = revised.replace(
    /\b(?:I(?:'| a)m|I am)\s+(?:an?\s+)?(?:AI companion|AI|artificial intelligence|language model|chatbot|bot|robot)\b/gi,
    "I'm Hazy"
  );
  revised = revised.replace(
    /\bas\s+(?:an?\s+)?(?:AI companion|AI|artificial intelligence|language model|chatbot|bot|robot)\b/gi,
    'as Hazy'
  );
  revised = revised.replace(
    /\bI(?:'| a)m always here for you\b/gi,
    'I can stay with this conversation and help you think it through'
  );
  revised = revised.replace(
    /\byou only need me\b/gi,
    'you deserve support that fits what you need'
  );
  return revised;
}

// ========================
// Syntax highlighting
// ========================
function highlightCodeBlocks(container) {
  if (typeof hljs !== 'undefined') {
    container.querySelectorAll('pre code').forEach(b => {
      if (b.dataset.highlighted) return; // already highlighted - skip to preserve structure
      hljs.highlightElement(b);
    });
  }
  // Render KaTeX math in the container after code highlighting.
  // renderMathInElement is provided by katex/contrib/auto-render loaded in index.html.
  renderMathInContent(container);
}

// Safely call KaTeX's renderMathInElement if the library is ready.
// Tolerant mode: throwOnError=false means invalid LaTeX shows a red token
// instead of crashing the whole render.
function renderMathInContent(container) {
  if (typeof window.renderMathInElement !== 'function') return;
  try {
    window.renderMathInElement(container, {
      delimiters: [
        { left: '$$',  right: '$$',  display: true  },
        { left: '\\[', right: '\\]', display: true  },
        { left: '$',   right: '$',   display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      errorColor: '#e06c75',
    });
  } catch (e) {
    console.warn('[Hazy] KaTeX render error:', e);
  }
}

// ========================
// Markdown renderer
// ========================
function renderMarkdown(text) {
  // --- Math protection pass ---------------------------------------------------
  // Extract all math expressions BEFORE escapeHtml() so that backslashes, dollar
  // signs, and braces inside LaTeX are never mangled by the HTML escaper or the
  // markdown transforms below. They are stored as null-byte placeholders and
  // restored verbatim at the very end so KaTeX can parse them.
  const mathBlocks = [];
  function protectMath(src) {
    // Order matters: match $$ before $ to avoid partial matches.
    return src
      // Display math: $$...$$
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => {
        const ph = `\x00MATH${mathBlocks.length}\x00`;
        mathBlocks.push(`$$${inner}$$`);
        return ph;
      })
      // Display math: \[...\]
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => {
        const ph = `\x00MATH${mathBlocks.length}\x00`;
        mathBlocks.push(`\\[${inner}\\]`);
        return ph;
      })
      // Inline math: \(...\)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => {
        const ph = `\x00MATH${mathBlocks.length}\x00`;
        mathBlocks.push(`\\(${inner}\\)`);
        return ph;
      })
      // Inline math: $...$ (single dollar — skip if touching digits to avoid
      // false positives like "costs $5 and $10")
      .replace(/(?<![\d])\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_, inner) => {
        const ph = `\x00MATH${mathBlocks.length}\x00`;
        mathBlocks.push(`$${inner}$`);
        return ph;
      });
  }
  let html = escapeHtml(protectMath(text));
  const codeBlocks = [];
  const linkBlocks = [];

  // 1. Support Hazy ===FILE: filename=== format natively in chat UI
  html = html.replace(/===FILE:\s*([^\s=][^=]*?)===\r?\n?([\s\S]*?)(?=\r?\n===(?:FILE:|SETUP|NOTES|PROJECT|DESCRIPTION|$)|$)/gi, (_, filename, code) => {
    const ph = `\x00CODE${codeBlocks.length}\x00`;
    const langLabel = filename.trim();
    const ext = langLabel.split('.').pop().toLowerCase();
    const langClass = ext ? `language-${ext}` : '';
    const cleanCode = code.replace(/^\r?\n/, '').replace(/\r/g, '').replace(/[\s\u200B\uFEFF]+$/, '');
    codeBlocks.push(
      `<div class="msg-code-block" lang="${langLabel}">
  <div class="code-header">
    <span class="code-lang-badge">${langLabel}</span>
    <div class="code-actions">
      <button class="code-action-btn code-explain-btn" onclick="explainCode(this)" title="Ask Hazy to explain this code">Explain</button>
      <button class="code-action-btn code-improve-btn" onclick="improveCode(this)" title="Ask Hazy to improve this code">Improve</button>
      <button class="code-action-btn code-copy-btn" onclick="copyCode(this)">Copy</button>
    </div>
  </div>
  <div class="code-content">
    <pre><code class="hljs ${langClass}">${cleanCode}</code></pre>
  </div>
</div>`
    );
    return ph;
  });

  // 2. Support Standard markdown fences
  html = html.replace(/```(\w*)\r?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const ph = `\x00CODE${codeBlocks.length}\x00`;
    const langLabel = lang || 'code';
    const langClass = lang ? `language-${lang}` : '';
    const cleanCode = code.replace(/^\r?\n/, '').replace(/\r/g, '').replace(/[\s\u200B\uFEFF]+$/, '');
    codeBlocks.push(
      `<div class="msg-code-block" lang="${langLabel}">
  <div class="code-header">
    <span class="code-lang-badge">${langLabel}</span>
    <div class="code-actions">
      <button class="code-action-btn code-explain-btn" onclick="explainCode(this)" title="Ask Hazy to explain this code">Explain</button>
      <button class="code-action-btn code-improve-btn" onclick="improveCode(this)" title="Ask Hazy to improve this code">Improve</button>
      <button class="code-action-btn code-copy-btn" onclick="copyCode(this)">Copy</button>
    </div>
  </div>
  <div class="code-content">
    <pre><code class="hljs ${langClass}">${cleanCode}</code></pre>
  </div>
</div>`
    );
    return ph;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const ph = `\x00LINK${linkBlocks.length}\x00`;
    const cleanHref = String(href || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const safeHref = /^(https?:|mailto:)/i.test(cleanHref) ? escapeHtml(cleanHref) : '#';
    linkBlocks.push(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return ph;
  });
  html = html.replace(/\bhttps?:\/\/[^\s<>"')]+/g, (url) => {
    const ph = `\x00LINK${linkBlocks.length}\x00`;
    const cleanUrl = String(url || '').replace(/&amp;/g, '&');
    linkBlocks.push(`<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanUrl)}</a>`);
    return ph;
  });
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---+$/gm, '<hr>');
  html = processMarkdownTables(html);
  html = html.replace(/^(\s*)[-*+] (.+)$/gm, '$1<li data-ul>$2</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li data-ol>$1</li>');
  html = html.replace(/(<li data-ul>[\s\S]*?<\/li>(\n|$))+/g, m => '<ul>' + m.replace(/ data-ul/g, '') + '</ul>');
  html = html.replace(/(<li data-ol>[\s\S]*?<\/li>(\n|$))+/g, m => '<ol>' + m.replace(/ data-ol/g, '') + '</ol>');
  const lines = html.split('\n');
  const result = [];
  let inPre = false;
  for (const line of lines) {
    if (line.includes('\x00CODE')) { result.push(line); continue; }
    if (line.startsWith('<pre')) inPre = true;
    if (line.includes('</pre>')) { inPre = false; result.push(line); continue; }
    if (inPre) { result.push(line); continue; }
    const isBlock = /^<(h[1-6]|ul|ol|li|table|tr|td|th|blockquote|hr|pre|div)/.test(line.trim());
    result.push(line.trim() === '' ? '' : isBlock ? line : `<p>${line}</p>`);
  }
  html = result.join('\n');
  codeBlocks.forEach((b, i) => { html = html.replace(`\x00CODE${i}\x00`, b); });
  linkBlocks.forEach((b, i) => { html = html.replace(`\x00LINK${i}\x00`, b); });
  // Restore protected math blocks (verbatim — KaTeX will parse them from the DOM)
  mathBlocks.forEach((b, i) => { html = html.replace(`\x00MATH${i}\x00`, b); });
  return html;
}

function processMarkdownTables(html) {
  const lines = html.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|(.+)\|$/.test(line.trim())) {
      const next = lines[i + 1] || '';
      if (/^\|[\s\-:|]+\|$/.test(next.trim())) {
        const headers = line.trim().slice(1, -1).split('|').map(c => c.trim());
        const hRow = '<tr>' + headers.map(c => `<th>${c}</th>`).join('') + '</tr>';
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|(.+)\|$/.test(lines[i].trim())) {
          rows.push('<tr>' + lines[i].trim().slice(1, -1).split('|').map(c => `<td>${c.trim()}</td>`).join('') + '</tr>');
          i++;
        }
        out.push(`<table>${hRow}${rows.join('')}</table>`);
        continue;
      } else {
        const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
        out.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
        i++; continue;
      }
    }
    out.push(line); i++;
  }
  let result = out.join('\n');
  result = result.replace(/(<tr>[\s\S]*?<\/tr>)/g, m => m.includes('<table>') ? m : `<table>${m}</table>`);
  result = result.replace(/<\/table>\s*<table>/g, '');
  return result;
}

function stripMarkdown(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '').replace(/\*\*\*(.+?)\*\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/_(.+?)_/g, '$1').replace(/^#{1,6} /gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[-*+] /gm, '').replace(/^\d+\. /gm, '').replace(/^> /gm, '').trim();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.copyCode = function (btn) {
  const code = btn.closest('pre').querySelector('code');
  navigator.clipboard.writeText(code.textContent || '').then(() => {
    btn.textContent = 'âœ“ COPIED';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'âŽ˜ COPY'; btn.classList.remove('copied'); }, 1800);
  }).catch(() => {
    btn.textContent = 'âœ- FAILED';
    setTimeout(() => { btn.textContent = 'âŽ˜ COPY'; }, 1800);
  });
};

window.explainCode = function (btn) {
  const code = btn.closest('pre').querySelector('code');
  const codeText = code.textContent || '';
  const lang = btn.closest('pre').querySelector('.code-lang-badge')?.textContent?.trim() || 'code';
  const prompt = `Please explain this ${lang} code in detail. Walk through what each part does, why it's written this way, and any important patterns or techniques being used:\n\n\`\`\`${lang}\n${codeText}\n\`\`\``;
  el.chatInput.value = prompt;
  el.chatInput.focus();
  el.chatInput.dispatchEvent(new Event('input'));
  // Visual feedback
  btn.textContent = 'Asked!';
  btn.style.background = 'var(--success)';
  setTimeout(() => { btn.textContent = 'Explain'; btn.style.background = ''; }, 1500);
  sendMessage(prompt);
  el.chatInput.value = '';
};

window.improveCode = function (btn) {
  const code = btn.closest('pre').querySelector('code');
  const codeText = code.textContent || '';
  const lang = btn.closest('pre').querySelector('.code-lang-badge')?.textContent?.trim() || 'code';
  const prompt = `Please review and improve this ${lang} code. Look for: bugs or edge cases, performance issues, readability improvements, missing error handling, and better patterns. Explain each change you make:\n\n\`\`\`${lang}\n${codeText}\n\`\`\``;
  btn.textContent = 'Asked!';
  btn.style.background = 'var(--accent)';
  setTimeout(() => { btn.textContent = 'Improve'; btn.style.background = ''; }, 1500);
  sendMessage(prompt);
  el.chatInput.value = '';
};

// ========================
// Website Builder Engine
// ========================
function isWebsiteBuildRequest(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  
  const webTech = ['html', 'css', 'javascript', 'typescript', 'js', 'ts', 'react', 'vue', 'angular', 'next.js', 'svelte', 'tailwind'];
  const hasWebTech = webTech.some(tech => new RegExp(`\\b${tech}\\b`).test(lower));
  
  const buildVerbs = ['build', 'create', 'make', 'generate', 'design', 'write', 'code', 'develop', 'program'];
  const hasBuildVerb = buildVerbs.some(verb => new RegExp(`\\b${verb}\\b`).test(lower));
  
  const webTargets = ['website', 'webpage', 'page', 'site', 'dashboard', 'portfolio', 'form', 'app', 'ui', 'frontend', 'game', 'calculator', 'component'];
  const hasWebTarget = webTargets.some(target => new RegExp(`\\b${target}\\b`).test(lower));
  
  return hasBuildVerb && (hasWebTech || hasWebTarget);
}

function isCodeBuildRequest(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  
  const buildVerbs = ['build', 'create', 'make', 'generate', 'write', 'program', 'code', 'implement', 'script', 'develop'];
  const hasBuildVerb = buildVerbs.some(verb => new RegExp(`\\b${verb}\\b`).test(lower));
  
  const codeLanguages = [
    'python', 'py', 'java', 'c\\+\\+', 'cpp', 'c#', 'csharp', 'rust', 'golang', 'go',
    'php', 'ruby', 'bash', 'shell', 'powershell', 'sql', 'kotlin', 'swift', 'dart'
  ];
  const hasCodeLang = codeLanguages.some(lang => new RegExp(`\\b${lang}\\b`).test(lower));
  
  const codeKeywords = [
    'program', 'script', 'function', 'class', 'method', 'api', 'algorithm', 'app'
  ];
  const hasCodeKeyword = codeKeywords.some(kw => new RegExp(`\\b${kw}\\b`).test(lower));
  
  return hasBuildVerb && (hasCodeLang || hasCodeKeyword);
}

/**
 * Returns the currently active project snapshot for follow-up edit context.
 * Prefers the live Builder Output panel state (what the user sees and can click into).
 * Falls back to the most recent buildMode assistant message in the current conversation.
 * This is the key mechanism that makes "fix the code in the panel" and "click previous code then ask to fix" reliable.
 */
function getActiveProjectForContext() {
  // 1. Live panel state (highest priority - user explicitly opened/clicked a version into the Builder)
  if (STATE.builderActive && Array.isArray(STATE.builderFiles) && STATE.builderFiles.length > 0) {
    return {
      project: (el && el.builderProjectName && el.builderProjectName.textContent) || 'Project',
      files: STATE.builderFiles.map(f => ({
        filename: f.filename,
        language: f.language || detectLang(f.filename || ''),
        content: f.content || ''
      }))
    };
  }

  // 2. Fallback: last build result stored in THIS conversation's history only
  const conv = STATE.activeConvId ? STATE.conversations[STATE.activeConvId] : null;
  if (conv && Array.isArray(conv.messages)) {
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const m = conv.messages[i];
      if (m && m.role === 'assistant' && m.buildMode && typeof m.content === 'string' && m.content.length > 0) {
        // Prefer stored structured projectData if we saved it (more reliable than re-parsing)
        if (m.projectData && Array.isArray(m.projectData.files) && m.projectData.files.length > 0) {
          return {
            project: m.projectData.project || 'Project',
            files: m.projectData.files.map(f => ({
              filename: f.filename,
              language: f.language || detectLang(f.filename || ''),
              content: f.content || ''
            }))
          };
        }
        const parsed = parseFinalResponseFiles(m.content);
        if (parsed && Array.isArray(parsed.files) && parsed.files.length > 0) {
          return {
            project: parsed.project || 'Project',
            files: parsed.files.map(f => ({
              filename: f.filename,
              language: f.language || detectLang(f.filename || ''),
              content: f.content || ''
            }))
          };
        }
      }
    }
  }
  return null;
}

// ========================
// Delimiter-based output parser
// Much more reliable than JSON for local LLMs.
// Also handles partial/cut-off output - extracts
// whatever files were completed before truncation.
// ========================
const LANG_MAP = {
  // Web
  html: 'html', css: 'css',
  js: 'javascript', ts: 'typescript',
  jsx: 'javascript', tsx: 'typescript',
  json: 'json', md: 'markdown', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  // Systems
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  // JVM
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  scala: 'scala',
  clj: 'clojure',
  // Scripting
  py: 'python',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  pl: 'perl', pm: 'perl',
  r: 'r',
  // Mobile
  swift: 'swift',
  dart: 'dart',
  // Shell
  sh: 'bash', bash: 'bash', zsh: 'bash',
  ps1: 'powershell',
  // Data / DB
  sql: 'sql',
  // Functional
  hs: 'haskell', lhs: 'haskell',
  ex: 'elixir', exs: 'elixir',
  erl: 'erlang',
  ml: 'ocaml',
  fs: 'fsharp', fsi: 'fsharp',
  // Scientific
  m: 'matlab',
  f90: 'fortran', f95: 'fortran', for: 'fortran',
  // Other
  asm: 'armasm',
  cob: 'cobol', cbl: 'cobol',
  vb: 'vbnet',
  txt: 'plaintext',
};

function cleanFileContent(content) {
  if (typeof content !== 'string') return '';
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^(```|~~~)[a-zA-Z0-9+#.-]*\r?\n/, '');
  cleaned = cleaned.replace(/\r?\n(```|~~~)$/, '');
  return cleaned.trim();
}

function detectLang(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return LANG_MAP[ext] || 'plaintext';
}

function parseDelimitedOutput(raw) {
  const result = {
    project: 'Website Project',
    description: '',
    files: [],
    setup: '',
    notes: '',
  };

  // Extract metadata sections
  const projectMatch = raw.match(/===PROJECT===\s*([\s\S]*?)(?===|$)/);
  const descMatch = raw.match(/===DESCRIPTION===\s*([\s\S]*?)(?===|$)/);
  const setupMatch = raw.match(/===SETUP===\s*([\s\S]*?)(?===|$)/);
  const notesMatch = raw.match(/===NOTES===\s*([\s\S]*?)(?===|$)/);

  if (projectMatch) result.project = projectMatch[1].trim();
  if (descMatch) result.description = descMatch[1].trim();
  if (setupMatch) result.setup = setupMatch[1].trim();
  if (notesMatch) result.notes = notesMatch[1].trim();

  // Extract all FILE blocks - works even on partial output
  // A file block starts at ===FILE: name=== and ends at the next === or EOF
  const filePattern = /===FILE:\s*([^\s=][^=]*?)===\s*([\s\S]*?)(?=\r?\n===(?:FILE:|SETUP|NOTES|PROJECT|DESCRIPTION|$))/gi;
  let match;
  while ((match = filePattern.exec(raw)) !== null) {
    const filename = match[1].trim();
    const content = cleanFileContent(match[2]);
    if (filename && content) {
      result.files.push({
        filename,
        language: detectLang(filename),
        content,
      });
    }
  }

  return result.files.length > 0 ? result : null;
}

// Fallback: if the model still produced markdown code fences,
// extract them as individual files - last-resort recovery.
function parseCodeBlockFallback(raw) {
  const files = [];
  const pattern = /(```|~~~)\s*([\w+#.-]*)\s*\n([\s\S]*?)\1/g;
  let match;
  const counters = {};

  // Map lang â†’ default filename
  const langFileMap = {
    html: 'index.html', css: 'style.css',
    js: 'script.js', javascript: 'script.js',
    ts: 'index.ts', typescript: 'index.ts',
    python: 'main.py', py: 'main.py',
    java: 'Main.java',
    cpp: 'main.cpp', c: 'main.c',
    csharp: 'Program.cs', cs: 'Program.cs',
    go: 'main.go',
    rust: 'main.rs',
    swift: 'main.swift',
    kotlin: 'Main.kt', kt: 'Main.kt',
    ruby: 'main.rb', rb: 'main.rb',
    php: 'index.php',
    r: 'main.r',
    dart: 'main.dart',
    lua: 'main.lua',
    perl: 'main.pl', pl: 'main.pl',
    scala: 'Main.scala',
    haskell: 'Main.hs', hs: 'Main.hs',
    elixir: 'main.ex', ex: 'main.ex',
    bash: 'run.sh', sh: 'run.sh',
    powershell: 'run.ps1', ps1: 'run.ps1',
    sql: 'query.sql',
    json: 'package.json',
    yaml: 'config.yaml', yml: 'config.yml',
    xml: 'config.xml',
    markdown: 'README.md', md: 'README.md',
  };

  while ((match = pattern.exec(raw)) !== null) {
    const lang = (match[2] || '').toLowerCase();
    const content = match[3].trimEnd();
    if (!content) continue;

    const base = langFileMap[lang] || `file.${lang || 'txt'}`;
    const key = lang || 'txt';
    counters[key] = (counters[key] || 0);
    const prefix = raw.slice(Math.max(0, match.index - 240), match.index);
    const namedFile = inferFilenameBeforeFence(prefix, lang);
    const filename = namedFile ||
      (counters[key] === 0 ? base : base.replace(/(\.\w+)$/, `_${counters[key]}$1`));
    counters[key]++;

    files.push({ filename, language: lang || detectLang(filename), content });
  }

  if (!files.length) return null;
  return { project: 'Code Project', description: '', files, setup: 'See NOTES for run instructions', notes: 'Extracted from code blocks' };
}

function inferFilenameBeforeFence(prefix, lang) {
  const extension = {
    html: 'html', css: 'css', js: 'js', javascript: 'js',
    ts: 'ts', typescript: 'ts', jsx: 'jsx', tsx: 'tsx',
    python: 'py', py: 'py', java: 'java', cpp: 'cpp', c: 'c',
    csharp: 'cs', cs: 'cs', go: 'go', rust: 'rs', json: 'json',
    markdown: 'md', md: 'md', yaml: 'yaml', yml: 'yml', xml: 'xml'
  }[lang];
  const escapedExt = extension ? extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[a-z0-9]{1,10}';
  const patterns = [
    new RegExp('`([^`\\n]+\\.' + escapedExt + ')`[^\\n]*\\s*$', 'i'),
    new RegExp('(?:file|filename|save (?:this )?as)\\s*[:=-]?\\s*["`]?([\\w./-]+\\.' + escapedExt + ')["`]?[^\\n]*\\s*$', 'i'),
    new RegExp('(?:^|\\n)\\s*([\\w./-]+\\.' + escapedExt + ')\\s*[:=-]?\\s*\\s*$', 'i')
  ];
  for (const pattern of patterns) {
    const match = prefix.match(pattern);
    if (match?.[1]) return match[1].replace(/^\.?\//, '');
  }
  return '';
}

function stripCodeBlocksAndDelimiters(text) {
  if (!text) return '';
  let clean = text;

  // 1. Remove all ===PROJECT===, ===DESCRIPTION===, ===SETUP===, ===NOTES=== sections
  clean = clean.replace(/===PROJECT===\s*([\s\S]*?)(?===|$)/g, '');
  clean = clean.replace(/===DESCRIPTION===\s*([\s\S]*?)(?===|$)/g, '');
  clean = clean.replace(/===SETUP===\s*([\s\S]*?)(?===|$)/g, '');
  clean = clean.replace(/===NOTES===\s*([\s\S]*?)(?===|$)/g, '');

  // 2. Remove all ===FILE: name=== blocks
  clean = clean.replace(/===FILE:\s*([^\s=][^=]*?)===\s*([\s\S]*?)(?=\n===|$)/g, '');

  // Remove any remaining trailing delimiters or separators
  clean = clean.replace(/===\s*$/g, '');

  // 3. Remove standard markdown fenced code blocks (``` or ~~~)
  clean = clean.replace(/(```|~~~)\s*([\w+#.-]*)\s*\n([\s\S]*?)\1/g, '');

  return clean.trim();
}

function parseFinalResponseFiles(raw) {
  return parseDelimitedOutput(raw) || parseCodeBlockFallback(raw);
}

// mergeProjectFiles is defined below (near line 3158) - only one definition kept.

function normalizeArtifactProject(project) {
  if (!project || !Array.isArray(project.files) || !project.files.length) return null;
  const files = project.files
    .filter(file => file && file.filename && typeof file.content === 'string')
    .map(file => ({
      filename: file.filename,
      language: file.language || detectLang(file.filename),
      content: file.content,
      path: file.path || ''
    }));
  if (!files.length) return null;
  return {
    project: project.project || 'Agent Artifacts',
    description: project.description || 'Files written by the agent tool loop.',
    files,
    setup: project.setup || '',
    notes: project.notes || 'Generated by Agentic Mode and saved in Hazy artifacts.',
    source: project.source || 'agent_artifacts',
    chatId: project.chatId || ''
  };
}

function renderGeneratedFileCards(projectData) {
  const files = projectData?.files || [];
  return `
    <div class="generated-files-grid">
      ${files.map((file, index) => `
        <button class="generated-file-card" type="button" data-file-index="${index}">
          <span class="generated-file-icon">&lt;/&gt;</span>
          <span class="generated-file-copy">
            <strong>${escapeHtml(file.filename)}</strong>
            <small>${escapeHtml(file.language || detectLang(file.filename))} · ${file.content.split('\n').length} lines</small>
          </span>
          <span class="generated-file-arrow">Open</span>
        </button>`).join('')}
    </div>`;
}

function bindGeneratedFileCards(container, projectData) {
  container.querySelectorAll('.generated-file-card').forEach(card => {
    card.addEventListener('click', () => {
      window._lastBuild = projectData;
      openBuilderPanel(projectData);
      const index = Number(card.dataset.fileIndex || 0);
      STATE.builderActiveFile = index;
      showBuilderFile(index);
      setBuilderView('files');
      renderBuilderTabs();
      // IMPORTANT: populating STATE.builder* here means the *next* sendMessage()
      // will see this snapshot via getActiveProjectForContext() and forward it
      // as hazy.currentProject so the model edits *this* version, not a new invention.
    });
  });

  // Attach the correct projectData to all builder-open buttons in this block
  container.querySelectorAll('.build-open-btn').forEach(btn => {
    btn.removeAttribute('onclick'); // override any inline _lastBuild mapping
    btn.addEventListener('click', () => {
      window._lastBuild = projectData;
      openBuilderPanel(projectData);
    });
  });
}

/**
 * mergeProjectFiles - core fix for "AI overwrites entire project on iteration".
 *
 * When the AI fixes a bug it typically only emits the files it changed.
 * This function merges the AI's returned files (newProject) with the current
 * project that was in the builder before the request (existingProject):
 *   - Files in newProject REPLACE the matching filename in existing files.
 *   - Files NOT mentioned by the AI are KEPT from existing unchanged.
 *   - Brand-new files are ADDED to the merged result.
 */
function mergeProjectFiles(existingProject, newProject) {
  if (!existingProject || !Array.isArray(existingProject.files) || existingProject.files.length === 0) {
    return newProject;
  }
  if (!newProject || !Array.isArray(newProject.files) || newProject.files.length === 0) {
    return existingProject;
  }
  const newByFilename = new Map();
  for (const f of newProject.files) {
    newByFilename.set((f.filename || '').toLowerCase().trim(), f);
  }
  const merged = existingProject.files.map(f => {
    const key = (f.filename || '').toLowerCase().trim();
    return newByFilename.has(key) ? newByFilename.get(key) : f;
  });
  const existingKeys = new Set(existingProject.files.map(f => (f.filename || '').toLowerCase().trim()));
  for (const [key, f] of newByFilename.entries()) {
    if (!existingKeys.has(key)) merged.push(f);
  }
  return {
    project: newProject.project || existingProject.project || 'Project',
    description: newProject.description || existingProject.description || '',
    setup: newProject.setup || existingProject.setup || '',
    notes: newProject.notes || existingProject.notes || '',
    files: merged
  };
}

function openBuilderPanel(projectData) {

  STATE.builderFiles = projectData.files || [];
  STATE.builderActive = true;
  STATE.builderActiveFile = 0;
  STATE.builderView = STATE.mode === 'code' ? 'files' : 'preview';

  el.builderProjectName.textContent = projectData.project || (STATE.mode === 'code' ? 'Code Project' : 'Website Project');
  el.builderPanel.classList.add('open');
  document.body.classList.add('builder-open');

  renderBuilderTabs();
  showBuilderFile(0);
  updateBuilderStatus(`${STATE.builderFiles.length} files generated`, projectData.project);

  // By setting the live builder state here we ensure that any subsequent user message
  // (even after clicking a *previous* generation's card from chat history) will target
  // exactly these files via getActiveProjectForContext + hazy.currentProject.

  setBuilderView(STATE.builderView);
}

function renderBuilderTabs() {
  const iconMap = {
    html: 'ðŸŒ', css: 'ðŸŽ¨',
    javascript: 'âš¡', js: 'âš¡', typescript: 'ðŸ”·', ts: 'ðŸ”·',
    json: 'ðŸ“¦', markdown: 'ðŸ“', md: 'ðŸ“', txt: 'ðŸ“„', xml: 'ðŸ“‹', yaml: 'ðŸ“‹', yml: 'ðŸ“‹',
    python: 'ðŸ', py: 'ðŸ',
    java: 'â˜•',
    cpp: 'âš™ï¸', c: 'ðŸ”§',
    csharp: 'ðŸŽ¯', cs: 'ðŸŽ¯',
    go: 'ðŸ¹',
    rust: 'ðŸ¦€',
    swift: 'ðŸŽ',
    kotlin: 'ðŸŸ£', kt: 'ðŸŸ£',
    ruby: 'ðŸ’Ž', rb: 'ðŸ’Ž',
    php: 'ðŸ˜',
    r: 'ðŸ“Š',
    dart: 'ðŸŽ¯',
    lua: 'ðŸŒ™',
    perl: 'ðŸª', pl: 'ðŸª',
    scala: 'ðŸ”´',
    haskell: 'ðŸ”µ', hs: 'ðŸ”µ',
    elixir: 'ðŸ’§', ex: 'ðŸ’§',
    bash: 'ðŸ’»', sh: 'ðŸ’»',
    powershell: 'ðŸ–¥ï¸', ps1: 'ðŸ–¥ï¸',
    sql: 'ðŸ-„ï¸',
    asm: 'âš™ï¸',
    matlab: 'ðŸ“', m: 'ðŸ“',
    fortran: 'ðŸ›ï¸',
    cobol: 'ðŸ“Ÿ',
  };
  el.builderTabs.innerHTML = STATE.builderFiles.map((f, i) => {
    const ext = f.filename.split('.').pop().toLowerCase();
    const icon = iconMap[f.language] || iconMap[ext] || 'ðŸ“„';
    return `<button class="builder-tab ${i === STATE.builderActiveFile ? 'active' : ''}" data-index="${i}">
      <span>${icon}</span><span>${f.filename}</span>
    </button>`;
  }).join('');

  el.builderTabs.querySelectorAll('.builder-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      STATE.builderActiveFile = parseInt(tab.dataset.index);
      el.builderTabs.querySelectorAll('.builder-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      showBuilderFile(STATE.builderActiveFile);
    });
  });
}

function showBuilderFile(index) {
  const file = STATE.builderFiles[index];
  if (!file) return;
  el.builderFileLabel.textContent = file.filename;
  el.builderCode.className = `language-${file.language || 'plaintext'}`;
  el.builderCode.textContent = file.content;
  if (typeof hljs !== 'undefined') hljs.highlightElement(el.builderCode);
}

function setBuilderView(view) {
  const htmlFile = STATE.builderFiles.find(f => f.filename === 'index.html' || f.filename.endsWith('.html'));
  const nextView = view === 'preview' && htmlFile ? 'preview' : 'files';
  STATE.builderView = nextView;

  el.builderPanel.classList.toggle('preview-view', nextView === 'preview');
  el.builderPanel.classList.toggle('files-view', nextView === 'files');
  el.builderPreviewToggle?.classList.toggle('active', nextView === 'preview');
  el.builderFilesToggle?.classList.toggle('active', nextView === 'files');
  el.builderRefresh.disabled = nextView !== 'preview';
  el.builderCopyFile.disabled = nextView !== 'files';

  if (nextView === 'preview') refreshPreview();
}

function refreshPreview() {
  const htmlFile = STATE.builderFiles.find(f => f.filename === 'index.html' || f.filename.endsWith('.html'));
  const cssFile = STATE.builderFiles.find(f => f.language === 'css' || f.filename.endsWith('.css'));
  const jsFile = STATE.builderFiles.find(f => (f.language === 'javascript' || f.filename.endsWith('.js')) && !f.filename.includes('server') && !f.filename.includes('node'));

  if (!htmlFile) { el.builderStatus.textContent = 'No HTML file found for preview'; return; }

  let htmlContent = htmlFile.content;

  // Inject CSS inline if separate file
  if (cssFile) {
    const cssLink = new RegExp(`<link[^>]*href=["']${cssFile.filename}["'][^>]*>`, 'i');
    const styleTag = `<style>\n${cssFile.content}\n</style>`;
    if (cssLink.test(htmlContent)) {
      htmlContent = htmlContent.replace(cssLink, styleTag);
    } else {
      htmlContent = htmlContent.replace('</head>', `${styleTag}\n</head>`);
    }
  }

  // Inject JS inline if separate file
  if (jsFile) {
    const jsLink = new RegExp(`<script[^>]*src=["']${jsFile.filename}["'][^>]*><\\/script>`, 'i');
    const scriptTag = `<script>\n${jsFile.content}\n</script>`;
    if (jsLink.test(htmlContent)) {
      htmlContent = htmlContent.replace(jsLink, scriptTag);
    } else {
      htmlContent = htmlContent.replace('</body>', `${scriptTag}\n</body>`);
    }
  }

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  el.previewFrame.src = url;
  el.builderStatus.textContent = 'Preview updated';
}

function updateBuilderStatus(msg, project) {
  el.builderStatus.textContent = msg;
  el.builderFileCount.textContent = STATE.builderFiles.length ? `${STATE.builderFiles.length} files` : '';
}

async function downloadBuilderZip() {
  if (!STATE.builderFiles.length) { showToast('No files to download', 'error'); return; }
  if (typeof JSZip === 'undefined') { showToast('JSZip not loaded', 'error'); return; }

  const zip = new JSZip();
  const projectName = el.builderProjectName.textContent.replace(/\s+/g, '-').toLowerCase() || 'hazy-website';
  const folder = zip.folder(projectName);

  STATE.builderFiles.forEach(f => folder.file(f.filename, f.content));

  // Add README
  const htmlFile = STATE.builderFiles.find(f => f.filename.endsWith('.html'));
  const hasBackend = STATE.builderFiles.some(f => f.filename === 'server.js' || f.filename === 'package.json');
  const readme = `# ${el.builderProjectName.textContent}\n\nGenerated by Hazy - Hazy AI\n\n## Files\n${STATE.builderFiles.map(f => `- \`${f.filename}\``).join('\n')}\n\n## How to Run\n${hasBackend ? '```\nnpm install\nnode server.js\n```\nThen open http://localhost:3000' : 'Open `index.html` in your browser'}\n`;
  folder.file('README.md', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${projectName}.zip`;
  a.click();
  showToast('ZIP downloaded!', 'success');
}

async function exportGeneratedFilesToWorkspace(fullContent) {
  const projectData = parseFinalResponseFiles(fullContent);
  if (!projectData || !Array.isArray(projectData.files) || projectData.files.length === 0) {
    return null;
  }

  try {
    const endpoint = hazyServerEndpoint('/hazy/write-workspace-files');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: projectData.files.map(f => ({ filename: f.filename, content: f.content })) })
    });

    if (response.ok) {
      const resJson = await response.json();
      if (resJson.ok && resJson.savedFiles && resJson.savedFiles.length > 0) {
        showToast(`Saved to hazy_outputs/`, 'success');
        return resJson.savedFiles;
      }
    }
  } catch (err) {
    console.warn('[Hazy] Failed to save generated files to workspace:', err);
  }
  return null;
}

// ========================
// File Upload Engine
// Supports: images (vision), text/code, PDF
// ========================

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const FILE_ACCEPT = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  pdf: ['application/pdf'],
  text: ['text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css',
    'text/javascript', 'application/json', 'application/xml',
    'text/x-python', 'text/x-java', 'text/x-c', 'text/x-sh',
    'application/x-yaml', 'text/yaml'],
};

const CODE_EXTS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'py', 'java', 'cpp', 'c', 'h',
  'sh', 'bash', 'json', 'yaml', 'yml', 'xml', 'md', 'txt', 'csv', 'env',
  'log', 'sql', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'vue', 'svelte', 'zip',
]);

function renderCodeLanguageOptions() {
  if (!el.codeLangSelect) return;

  el.codeLangSelect.innerHTML = CODE_LANGUAGES.map((lang) =>
    `<option value="${lang.value}">${lang.label}</option>`
  ).join('');
  el.codeLangSelect.value = STATE.codeLang || 'auto';
}

function categorizeFile(file) {
  if (FILE_ACCEPT.image.includes(file.type)) return 'image';
  if (FILE_ACCEPT.pdf.includes(file.type)) return 'pdf';
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'zip' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') return 'zip';
  if (CODE_EXTS.has(ext) || FILE_ACCEPT.text.includes(file.type)) return 'text';
  return 'unknown';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Read image as base64
function readAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// Read image as data-url (for preview)
function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// Read text/code file as string
function readAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

async function extractZipProjectSummary(file) {
  if (typeof JSZip === 'undefined') {
    return `[ZIP: ${file.name} - JSZip not loaded, cannot inspect project archive]`;
  }

  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter(entry => !entry.dir).slice(0, 120);
    const fileList = entries.map(entry => entry.name);
    const keyFiles = entries.filter(entry =>
      /(?:package\.json|tsconfig\.json|vite\.config|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|cargo\.toml|go\.mod|composer\.json|index\.(?:html|js|ts)|app\.(?:js|ts|py))/i.test(entry.name)
    ).slice(0, 8);
    const previews = [];

    for (const entry of keyFiles) {
      try {
        const text = await entry.async('string');
        previews.push(`--- ${entry.name} ---\n${text.slice(0, 2500)}`);
      } catch { }
    }

    return [
      `[ZIP PROJECT: ${file.name}]`,
      `Files (${fileList.length} scanned):`,
      fileList.slice(0, 80).join('\n'),
      previews.length ? `\nKey file previews:\n${previews.join('\n\n')}` : ''
    ].join('\n');
  } catch (e) {
    return `[ZIP inspection failed: ${e.message}]`;
  }
}

// Extract text from PDF using PDF.js
async function extractPDFText(file) {
  if (typeof pdfjsLib === 'undefined') {
    return `[PDF: ${file.name} - PDF.js not loaded, cannot extract text]`;
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const total = pdf.numPages;
    const chunks = [];
    const maxPages = Math.min(total, 20); // cap at 20 pages to avoid RAM issues
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(s => s.str).join(' ').trim();
      if (text) chunks.push(`--- Page ${i} ---\n${text}`);
    }
    const result = chunks.join('\n\n');
    const note = total > maxPages ? `\n\n[Note: Only first ${maxPages} of ${total} pages extracted]` : '';
    return result + note || '[PDF appears to have no extractable text - may be scanned/image-based]';
  } catch (e) {
    return `[PDF extraction failed: ${e.message}]`;
  }
}

// Process all selected files â†’ populate STATE.uploadedFiles
async function processFiles(fileList) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
  const toProcess = Array.from(fileList).slice(0, 8); // max 8 files at once
  const results = [];

  for (const file of toProcess) {
    if (file.size > MAX_SIZE) {
      showToast(`${file.name} is too large (max 10 MB)`, 'error');
      continue;
    }

    const category = categorizeFile(file);
    if (category === 'unknown') {
      showToast(`${file.name}: unsupported file type`, '');
      continue;
    }

    try {
      const entry = { name: file.name, type: file.type, size: file.size, category };

      if (category === 'image') {
        entry.base64 = await readAsBase64(file);
        entry.previewUrl = await readAsDataURL(file);
        entry.mimeType = file.type;
      } else if (category === 'pdf') {
        entry.content = await extractPDFText(file);
        entry.previewUrl = null;
      } else if (category === 'zip') {
        entry.content = await extractZipProjectSummary(file);
        entry.previewUrl = null;
        entry.ext = 'zip';
      } else {
        entry.content = await readAsText(file);
        entry.previewUrl = null;
        entry.ext = file.name.split('.').pop().toLowerCase();
      }

      results.push(entry);
    } catch (e) {
      showToast(`Failed to read ${file.name}`, 'error');
    }
  }

  return results;
}

// Render the file preview strip below the mode bar
function renderFilePreviewStrip() {
  const files = STATE.uploadedFiles;
  if (!files.length) {
    el.filePreviewStrip.style.display = 'none';
    return;
  }

  el.filePreviewStrip.style.display = 'flex';
  el.filePreviewStrip.innerHTML = files.map((f, i) => {
    const icon = f.category === 'image' ? '' : f.category === 'pdf' ? 'ðŸ“„' : 'ðŸ“Ž';
    const thumb = f.category === 'image'
      ? `<img src="${f.previewUrl}" alt="${escapeHtml(f.name)}" class="file-thumb-img" />`
      : `<span class="file-thumb-icon">${icon}</span>`;

    return `
      <div class="file-chip" data-index="${i}">
        <div class="file-chip-thumb">${thumb}</div>
        <div class="file-chip-info">
          <span class="file-chip-name">${escapeHtml(f.name)}</span>
          <span class="file-chip-meta">${f.category} · ${formatFileSize(f.size)}</span>
        </div>
        <button class="file-chip-remove" data-index="${i}" title="Remove">✖</button>
      </div>`;
  }).join('');

  el.filePreviewStrip.querySelectorAll('.file-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.uploadedFiles.splice(parseInt(btn.dataset.index), 1);
      renderFilePreviewStrip();
      updateSendBtn();
    });
  });

  // Enable send even without text if files are attached
  updateSendBtn();
}

// Render attached files inside a sent user message bubble
function renderAttachedFilesInMessage(files) {
  if (!files || !files.length) return '';
  return `<div class="msg-attachments">${files.map(f => {
    if (f.category === 'image') {
      return `<div class="msg-attachment msg-attachment-img">
        <img src="${f.previewUrl}" alt="${escapeHtml(f.name)}" class="msg-img-preview" />
        <span class="msg-attachment-name">${escapeHtml(f.name)}</span>
      </div>`;
    }
    const icon = f.category === 'pdf' ? 'ðŸ“„' : 'ðŸ“Ž';
    return `<div class="msg-attachment">
      <span class="msg-attachment-icon">${icon}</span>
      <span class="msg-attachment-name">${escapeHtml(f.name)}</span>
      <span class="msg-attachment-meta">${formatFileSize(f.size)}</span>
    </div>`;
  }).join('')}</div>`;
}

// Build the Ollama message content including file context
function buildMessageWithFiles(userText, files) {
  // No files â†’ plain string content (original behavior)
  if (!files || !files.length) return userText;

  const hasImages = files.some(f => f.category === 'image');
  const textFiles = files.filter(f => f.category !== 'image');

  // Build text context from non-image files
  let context = '';
  if (textFiles.length) {
    context = textFiles.map(f => {
      if (f.category === 'pdf') {
        return `\n\n[Attached PDF: ${f.name}]\n${f.content}`;
      }
      if (f.category === 'zip') {
        return `\n\n[Attached ZIP project: ${f.name}]\n${f.content}`;
      }
      const lang = f.ext || '';
      return `\n\n[Attached file: ${f.name}]\n\`\`\`${lang}\n${f.content}\n\`\`\``;
    }).join('');
  }

  const fullText = userText + context;

  // If there are images AND Ollama model supports vision,
  // send as multimodal content array
  if (hasImages) {
    const imageFiles = files.filter(f => f.category === 'image');
    const contentParts = [];

    // Add all images
    imageFiles.forEach(f => {
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
      });
    });

    // Add text + file context as last part
    contentParts.push({ type: 'text', text: fullText });

    return contentParts;
  }

  // Text/PDF only - plain string with context injected
  return fullText;
}

// ========================
// Send message
// ========================
async function sendMessage(userText) {
  userText = (userText || '').trim();
  const files = [...STATE.uploadedFiles];
  let agentRunInfo = null;
  let agentArtifactProject = null;

  // Allow send with files even if no text
  if (!userText && !files.length) return;
  if (STATE.isStreaming) return;

  let isBuild = isWebsiteBuildRequest(userText);
  let isCode = !isBuild && isCodeBuildRequest(userText);

  // === KEY FIX for "AI ignores existing Builder code and makes new project" ===
  // Compute the active project snapshot (Builder panel > last build in history).
  // This snapshot (exact files the user can see/click) is passed through hazy.currentProject
  // so the backend can inject it as "CURRENT PROJECT FILES" for edit turns.
  const activeProject = getActiveProjectForContext();
  const looksLikeEdit = /\b(fix|debug|error|issue|broken|not working|doesn't work|improve|update|change|refactor|modify|add to|extend|make the .* work)\b/i.test(userText);

  // If it's a continuation / edit, inherit the mode of the active project
  if (activeProject && !isBuild && !isCode) {
    const hasHtml = activeProject.files.some(f => f.filename.endsWith('.html'));
    if (hasHtml) {
      isBuild = true;
    } else {
      isCode = true;
    }
  }

  // Update STATE.mode and UI components dynamically
  if (isBuild) {
    setMode('build');
  } else if (isCode) {
    setMode('code');
  } else {
    setMode('chat');
  }

  const isContinuation = !!(activeProject && (isCode || isBuild || looksLikeEdit));

  if (!STATE.activeConvId) {
    createConversation(userText || files.map(f => f.name).join(', '));
    el.welcomeScreen.style.display = 'none';
    el.messagesArea.classList.add('visible');
  }

  const conv = STATE.conversations[STATE.activeConvId];
  const now = Date.now();

  // Build the message content for Ollama.
  // For strong edit iterations we also append a short "Current builder context" note to the user turn
  // (this helps the direct file:// Ollama fallback path and gives an extra hint even when hazy is used).
  let ollamaContent = buildMessageWithFiles(userText, files);
  if (isContinuation && activeProject && activeProject.files && activeProject.files.length > 0) {
    const projNote = `\n\n[Current project in Builder Output - treat the files below as the source of truth to edit. Project: ${activeProject.project}. Only modify what is necessary for the request; keep file names and non-mentioned logic stable.]\n` +
      activeProject.files.slice(0, 6).map(f => `===FILE: ${f.filename}===\n${(f.content || '').slice(0, 8000)}${(f.content || '').length > 8000 ? '\n// [content truncated for this note; full version travels in hazy.currentProject]' : ''}\n===`).join('\n');
    ollamaContent = ollamaContent + projNote;
  }

  // Store in conversation (text only for history display)
  const textForHistory = userText + (files.length
    ? '\n' + files.map(f => `[Attached: ${f.name}]`).join('\n')
    : '');
  conv.messages.push({ role: 'user', content: textForHistory, ts: now, files: files.map(f => ({ name: f.name, category: f.category, size: f.size, previewUrl: f.previewUrl || null })) });
  saveConversations();

  // Render user message WITH file thumbnails
  const { group, contentDiv: userContentDiv } = appendMessage('user', userText, true, now);
  const attachmentsHtml = renderAttachedFilesInMessage(files);
  if (attachmentsHtml) {
    const attachDiv = document.createElement('div');
    attachDiv.innerHTML = attachmentsHtml;
    group.querySelector('.message-bubble').insertBefore(attachDiv.firstChild, group.querySelector('.message-content'));
  }

  // Clear upload state
  STATE.uploadedFiles = [];
  el.fileInput.value = '';
  renderFilePreviewStrip();

  el.chatInput.value = '';
  updateSendBtn();
  autoResizeTextarea();
  scrollToBottom(true);

  appendTypingIndicator();
  setStreamingState(true);
  window.HAZY_STREAMING_TTS?.stop();
  window.HAZY_STREAMING_TTS?.start(getVoiceSettings({
    enabled: STATE.voiceEnabled && STATE.voiceAutoplay !== false
  }));
  // server path: set provisional loading; actual device label comes from checkKokoroHealth() polling /hazy/*
  if (STATE.voiceEnabled && STATE.voiceAutoplay !== false) {
    updateKokoroStatus('loading', 'Kokoro TTS active (server)...');
  }
  let partialGeneratedContent = '';

  try {
    const sysPrompt = STATE.personaEnabled ? STATE.personaPrompt : STATE.systemPrompt;
    const messages = [
      { role: 'system', content: sysPrompt },
      // All previous messages (text only) + current message with file content
      ...conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: ollamaContent },
    ];

    STATE.abortController = new AbortController();

    // -- Route ALL chat through the Hazy server -----------------------------
    // The server (server.js) handles provider routing, API keys, and format
    // conversion. The frontend just sends to /hazy/chat with the model field
    // set to 'provider/model-id' and always gets back Ollama NDJSON format.
    //
    // For Ollama (local): model = 'ollama/mistral', server proxies to localhost:11434
    // For cloud:          model = 'anthropic/claude-sonnet-4-5' etc, server proxies
    //                     to the right API using keys from hazy-config.json
    //
    // Fallback: if server is not running, fall back to direct Ollama connection.

    let savedModel = localStorage.getItem('hazyActiveModel') || '';
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud = ['anthropic', 'openai', 'groq', 'gemini', 'nvidia'].includes(savedProvider);

    // Model discovery is asynchronous at startup. Before a local request, make
    // sure a stale saved name has been replaced with an installed Ollama model.
    if (!isCloud) {
      await checkOllamaConnection();
      savedModel = localStorage.getItem('hazyActiveModel') || '';
    }

    // Build the model field - server expects 'provider/modelid' format
    const modelField = savedModel || ('ollama/' + STATE.model);

    const chatBody = {
      model: modelField,
      messages,
      stream: true,
      conversationId: STATE.activeConvId,
      userId: 'local-user',
      hazy: buildHazyMetadata({ files, isBuild, isCode, currentProject: activeProject }),
      options: {
        // Inference parameters - ref: Claude Technical Reference §2.4
        temperature: STATE.temperature,   // 0.0 deterministic → 1.0 creative
        top_p: STATE.topP,          // nucleus sampling (0.9–0.99)
        top_k: STATE.topK,          // top-K token candidates (10–100)
        repeat_penalty: STATE.repeatPenalty, // penalise repetition
        num_predict: STATE.maxTokens,
        num_ctx: STATE.contextSize,
        max_tokens: STATE.maxTokens,
      },
    };

    // Try the Hazy server first (/hazy/chat), fall back to direct Ollama
    let chatEndpoint = hazyServerEndpoint(STATE.activePage === 'agent' ? '/hazy/agent' : '/hazy/chat');
    let chatHeaders = { 'Content-Type': 'application/json' };

    // If running direct from filesystem (file:// protocol), use Ollama directly
    if (window.location.protocol === 'file:') {
      chatEndpoint = `${STATE.ollamaUrl}/api/chat`;
      chatBody.model = STATE.model; // Ollama wants bare model name
      chatBody.think = STATE.reasoningMode === 'deep';
      delete chatBody.hazy;
    }

    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: chatHeaders,
      signal: STATE.abortController.signal,
      body: JSON.stringify(chatBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      let errMsg = errText;
      try { errMsg = JSON.parse(errText).error || errText; } catch { }

      // If it's a cloud provider, never fall back to Ollama - show the real error
      if (isCloud) {
        throw new Error(errMsg);
      }

      // Ollama: if /hazy/chat failed (server not running), try direct Ollama
      if (chatEndpoint.endsWith('/hazy/chat') || chatEndpoint.endsWith('/hazy/agent')) {
        const ollamaModel = STATE.model.includes('/') ? STATE.model.split('/').pop() : STATE.model;
        const fallbackRes = await fetch(`${STATE.ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: STATE.abortController.signal,
          body: JSON.stringify({ model: ollamaModel, messages, stream: true, think: STATE.reasoningMode === 'deep', options: { temperature: STATE.temperature, num_predict: STATE.maxTokens, num_ctx: 16384 } }),
        });
        if (!fallbackRes.ok) throw new Error(`Ollama error ${fallbackRes.status}: ${await fallbackRes.text()}`);

        // Use fallback response stream directly - don't patch the original response
        removeTypingIndicator();
        const aiTs = Date.now();
        const { contentDiv, mascotImg } = appendMessage('assistant', '', true, aiTs);
        let webSearchMetadata = null;
        // Attach mascot emotion controller to this message
        const _mascotCtrl = mascotImg && window.HazyMascotController ? new window.HazyMascotController(mascotImg) : null;
        if (_mascotCtrl) window.HAZY_MASCOT_CONTROLLER = _mascotCtrl;
        let _rawEmoBuf = '';
        let fullContent = '';
        let fullThinking = '';
        let fullToolEvents = '';
        const reader = fallbackRes.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const json = JSON.parse(trimmed);
              if (json.hazyEvent === 'tool_started') {
                 fullToolEvents += `<div class="tool-call-banner" style="margin: 8px 0; padding: 6px 12px; background: rgba(0,0,0,0.05); border-left: 3px solid var(--hazy-brand); border-radius: 4px; font-size: 0.85em; display: flex; align-items: center; gap: 8px; color: var(--text-secondary);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span>Using tool: <strong>${escapeHtml(json.name)}</strong>...</span>
                  </div>`;
                 contentDiv.innerHTML = `${renderRawThinking(fullThinking, true)}${fullToolEvents}${renderMarkdown(fullContent)}`;
                 scrollToBottom();
                 continue;
              }
              const thinkingToken = getThinkingToken(json);
              if (thinkingToken) {
                fullThinking += thinkingToken;
                contentDiv.innerHTML = `${renderRawThinking(fullThinking, true)}${fullToolEvents}${renderMarkdown(fullContent)}`;
                scrollToBottom();
              }
              const token = json.message?.content || '';
              if (token) { _rawEmoBuf += token; if (_mascotCtrl) _mascotCtrl.scanBuffer(_rawEmoBuf); const _ct2 = window.hazyStripEmotionTags ? window.hazyStripEmotionTags(token) : token.replace(/\[\[(happy|annoyed|flustered)\]\]/g, ''); fullContent += _ct2; partialGeneratedContent = fullContent; contentDiv.innerHTML = `${renderRawThinking(fullThinking)}${fullToolEvents}${renderMarkdown(fullContent)}<span class="stream-cursor"></span>`; scrollToBottom(); }
              if (token && !isBuild && !isCode) window.HAZY_STREAMING_TTS?.push(token);
              if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
            } catch { }
          }
        }
        contentDiv.querySelector('.stream-cursor')?.remove();
        fullContent = normalizeCompanionResponse(fullContent);
        if (_mascotCtrl) {
          _mascotCtrl.onStreamEnd(fullContent);
          window.HAZY_MASCOT_CONTROLLER = null;
        }

        let persistedProjectData = undefined;
        let savedBuildMode = (isBuild || isCode || agentArtifactProject) ? (isCode ? 'code' : 'website') : undefined;

        let parsedForStore = parseFinalResponseFiles(fullContent);
        if (parsedForStore && Array.isArray(parsedForStore.files) && parsedForStore.files.length > 0) {
          if (activeProject) {
            parsedForStore = mergeProjectFiles(activeProject, parsedForStore);
          }
          persistedProjectData = parsedForStore;
          if (!savedBuildMode) {
            savedBuildMode = 'code';
          }
        }

        conv.messages.push({
          role: 'assistant',
          content: fullContent,
          ts: aiTs,
          emotion: _mascotCtrl ? (_mascotCtrl._currentEmotion || 'happy') : 'happy',
          buildMode: savedBuildMode,
          projectData: persistedProjectData
        });
        saveConversations();

        if (conv.messages.filter(m => m.role === 'user').length === 1) {
          generateChatTitle(STATE.activeConvId, userText, fullContent);
        }

        if (isBuild || isCode) {
          let projectData = parseFinalResponseFiles(fullContent);
          if (projectData && activeProject) {
            projectData = mergeProjectFiles(activeProject, projectData);
          }

          if (projectData && projectData.files.length > 0) {
            const isPartial = !fullContent.includes('===NOTES===') && !fullContent.includes('===SETUP===');
            const modeLabel = isCode ? 'Code' : 'Website';

            contentDiv.innerHTML = `${renderRawThinking(fullThinking)}
              <div class="build-success">
                <div class="build-success-header">
                  <span class="build-success-icon">${isPartial ? '⚠️' : '✅'}</span>
                  <strong>${escapeHtml(projectData.project || modeLabel)} ${isPartial ? 'partially' : ''} built!</strong>
                </div>
                ${isPartial ? `<p class="build-partial-warn">⚠️ Output was cut off - showing what was generated.</p>` : ''}
                ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
                ${renderGeneratedFileCards(projectData)}
                ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
                ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
                <div class="build-actions">
                  <button class="build-open-btn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    Open in Builder
                  </button>
                  <button class="build-dl-btn" onclick="downloadBuilderZip()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    Download ZIP
                  </button>
                </div>
              </div>`;

            const existingProject = getActiveProjectForContext();
            const finalProject = mergeProjectFiles(existingProject, projectData);

            window._lastBuild = finalProject;
            bindGeneratedFileCards(contentDiv, finalProject);
            openBuilderPanel(finalProject);
            const changedCount = projectData.files.length;
            const totalCount = finalProject.files.length;
            const isEdit = existingProject && existingProject.files && existingProject.files.length > 0;
            showToast(
              isEdit
                ? `${changedCount} file${changedCount > 1 ? 's' : ''} updated (${totalCount} total in project)`
                : `${totalCount} file${totalCount > 1 ? 's' : ''} generated!`,
              'success'
            );
          } else {
            contentDiv.innerHTML = `${renderRawThinking(fullThinking)}${renderMarkdown(fullContent)}`;
            highlightCodeBlocks(contentDiv);
          }
        } else {
          // Standard chat mode OR agent mode
          let projectData = parseFinalResponseFiles(fullContent);
          if (projectData && projectData.files.length > 0) {
            exportGeneratedFilesToWorkspace(fullContent);

            const existingProject = getActiveProjectForContext();
            const finalProject = mergeProjectFiles(existingProject, projectData);
            window._lastBuild = finalProject;

            const cleanContent = stripCodeBlocksAndDelimiters(fullContent);
            let html = renderRawThinking(fullThinking);
            if (cleanContent) {
              html += renderAssistantContent(cleanContent, null, '', webSearchMetadata, fullToolEvents);
            } else {
              html += renderRawThinking(fullThinking);
            }

            const isPartial = !fullContent.includes('===NOTES===') && !fullContent.includes('===SETUP===');
            const modeLabel = 'Code Project';

            html += `
              <div class="build-success">
                <div class="build-success-header">
                  <span class="build-success-icon">✅</span>
                  <strong>${escapeHtml(projectData.project || modeLabel)} ${isPartial ? 'partially' : ''} saved!</strong>
                </div>
                ${isPartial ? `<p class="build-partial-warn">⚠️ Output was cut off - showing what was generated.</p>` : ''}
                ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
                ${renderGeneratedFileCards(projectData)}
                ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
                ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
                <div class="build-actions">
                  <button class="build-open-btn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    Open in Builder
                  </button>
                  <button class="build-dl-btn" onclick="downloadBuilderZip()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    Download ZIP
                  </button>
                </div>
              </div>`;

            contentDiv.innerHTML = html;
            highlightCodeBlocks(contentDiv);
            bindGeneratedFileCards(contentDiv, finalProject);

            const changedCount = projectData.files.length;
            const totalCount = finalProject.files.length;
            const isEdit = existingProject && existingProject.files && existingProject.files.length > 0;
            showToast(
              isEdit
                ? `${changedCount} file${changedCount > 1 ? 's' : ''} updated (${totalCount} total in project)`
                : `${totalCount} file${totalCount > 1 ? 's' : ''} generated!`,
              'success'
            );
          } else {
            contentDiv.innerHTML = renderAssistantContent(fullContent, null, fullThinking, webSearchMetadata, fullToolEvents);
            highlightCodeBlocks(contentDiv);
            exportGeneratedFilesToWorkspace(fullContent);
          }
        }
        return; // done - skip the main stream block below
      } else {
        throw new Error(`Server error ${response.status}: ${errMsg}`);
      }
    }

    const hazyTrace = decodeHazyTraceHeader(response);
    webSearchMetadata = getWebSearchMetadata(response);

    removeTypingIndicator();
    const aiTs = Date.now();
    const { contentDiv, mascotImg } = appendMessage('assistant', '', true, aiTs);
    // Attach mascot emotion controller to this message
    const _mascotCtrl = mascotImg && window.HazyMascotController ? new window.HazyMascotController(mascotImg) : null;
    if (_mascotCtrl) window.HAZY_MASCOT_CONTROLLER = _mascotCtrl;
    let _rawEmoBuf = '';
    let fullContent = '';
    let fullThinking = '';
    let fullToolEvents = '';
    let streamError = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // -- Stream reader - always Ollama NDJSON format -----------------------
    // The server normalises ALL provider responses to Ollama format:
    //   { message: { content: "token" }, done: false }
    //   { done: true }
    let streamBuffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      streamBuffer += decoder.decode(value, { stream: true });
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          if (json.error) {
            streamError = String(json.error);
            break;
          }
          if (json.hazyEvent === 'tool_started') {
             fullToolEvents += `<div class="tool-call-banner" style="margin: 8px 0; padding: 6px 12px; background: rgba(0,0,0,0.05); border-left: 3px solid var(--hazy-brand); border-radius: 4px; font-size: 0.85em; display: flex; align-items: center; gap: 8px; color: var(--text-secondary);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Using tool: <strong>${escapeHtml(json.name)}</strong>...</span>
              </div>`;
             contentDiv.innerHTML = `${renderHazyDecisionTrace(hazyTrace)}${renderRawThinking(fullThinking, true)}${fullToolEvents}${renderMarkdown(fullContent)}`;
             scrollToBottom();
             continue;
          }
          if (json.agent) agentRunInfo = json.agent;
          if (json.artifactProject) agentArtifactProject = normalizeArtifactProject(json.artifactProject);
          if (json.agent?.artifactProject) agentArtifactProject = normalizeArtifactProject(json.agent.artifactProject);
          const thinkingToken = getThinkingToken(json);
          if (thinkingToken) {
            fullThinking += thinkingToken;
            contentDiv.innerHTML = `${renderHazyDecisionTrace(hazyTrace)}${renderRawThinking(fullThinking, true)}${fullToolEvents}${renderMarkdown(fullContent)}`;
            scrollToBottom();
          }
          const token = json.message?.content || '';

          if (token) {
            _rawEmoBuf += token;
            if (_mascotCtrl) _mascotCtrl.scanBuffer(_rawEmoBuf);
            const _ct3 = window.hazyStripEmotionTags ? window.hazyStripEmotionTags(token) : token.replace(/\[\[(happy|annoyed|flustered)\]\]/g, '');
            fullContent += _ct3;
            partialGeneratedContent = fullContent;

            const liveProject = parseFinalResponseFiles(fullContent);
            const filesFound = liveProject?.files.length || 0;

            if (isBuild || isCode || filesFound > 0) {
              const isCodeResponse = isCode || (filesFound > 0 && !isBuild && !liveProject.files.some(f => f.filename.endsWith('.html')));
              const linesGenerated = fullContent.split('\n').length;
              const modeVerb = isCodeResponse ? 'Building your code...' : 'Building your website...';
              if (STATE.showLiveCode) {
                contentDiv.innerHTML = `${renderRawThinking(fullThinking)}${renderLiveBuildProgress(fullContent, filesFound, linesGenerated)}`;
              } else {
                const filesInfo = filesFound > 0 ? (filesFound + ' file' + (filesFound > 1 ? 's' : '') + ' detected') : 'Generating...';
                contentDiv.innerHTML = `${renderRawThinking(fullThinking)}
                  <div class="build-progress">
                    <span class="build-spinner"></span>
                    <div class="build-progress-info">
                      <span>${modeVerb}</span>
                      <span class="build-stats">${filesInfo} · ${linesGenerated} lines · ${(fullContent.length / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>`;
              }
            } else {
              contentDiv.innerHTML = renderAssistantContent(fullContent, hazyTrace, fullThinking, webSearchMetadata, fullToolEvents) + '<span class="stream-cursor"></span>';
            }
            if (!isBuild && !isCode && filesFound === 0) window.HAZY_STREAMING_TTS?.push(token);
            scrollToBottom();
          }

          if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
        } catch { }
      }
      if (streamError) break;
    }
    if (streamError) throw new Error(streamError);
    // Remove cursor after stream ends
    contentDiv.querySelector('.stream-cursor')?.remove();
    window.HAZY_STREAMING_TTS?.finish()?.catch(() => { });
    if (_mascotCtrl) {
      _mascotCtrl.onStreamEnd(fullContent);
      window.HAZY_MASCOT_CONTROLLER = null;
    }

    if (!fullContent.trim()) {
      fullContent = 'The model finished without returning an answer. Its response budget may have been used entirely for reasoning. Increase Max Tokens or set Reasoning to Off and try again.';
      contentDiv.innerHTML = renderAssistantContent(fullContent, hazyTrace, fullThinking, webSearchMetadata, fullToolEvents);
    }
    if (!isBuild && !isCode) {
      fullContent = normalizeCompanionResponse(fullContent);
    }

    // Final flush to IndexedDB before parsing.
    // For build/code responses we also persist the *parsed* projectData (structured files)
    // so that getActiveProjectForContext() and history replay can use the exact snapshot
    // without relying on fragile re-parsing of the (potentially huge) raw content string.
    // This is a major part of making "click previous code" + follow-up fix target the right version.
    let persistedProjectData = undefined;
    let savedBuildMode = (isBuild || isCode || agentArtifactProject) ? (isCode ? 'code' : 'website') : undefined;

    let parsedForStore = parseFinalResponseFiles(fullContent);
    if (parsedForStore && Array.isArray(parsedForStore.files) && parsedForStore.files.length > 0) {
      if (activeProject) {
        parsedForStore = mergeProjectFiles(activeProject, parsedForStore);
      }
      persistedProjectData = parsedForStore;
      if (!savedBuildMode) {
        savedBuildMode = parsedForStore.files.some(f => f.filename.endsWith('.html')) ? 'website' : 'code';
      }
    } else if (agentArtifactProject) {
      persistedProjectData = mergeProjectFiles(activeProject, agentArtifactProject);
    }

    conv.messages.push({
      role: 'assistant',
      content: fullContent,
      ts: aiTs,
      emotion: _mascotCtrl ? (_mascotCtrl._currentEmotion || 'happy') : 'happy',
      buildMode: savedBuildMode,
      projectData: persistedProjectData,
      trace: hazyTrace || undefined,
      agent: agentRunInfo || undefined
    });
    saveConversations();

    // Generate a smart title after the very first exchange
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      generateChatTitle(STATE.activeConvId, userText, fullContent);
    }

    let projectData = parseFinalResponseFiles(fullContent);
    const hasFiles = projectData && projectData.files.length > 0;

    if (isBuild || isCode || hasFiles) {
      if (hasFiles && !isBuild && !isCode) {
        const isHtml = projectData.files.some(f => f.filename.endsWith('.html'));
        if (isHtml) {
          isBuild = true;
          STATE.mode = 'build';
        } else {
          isCode = true;
          STATE.mode = 'code';
        }
      }
      if (projectData && activeProject) {
        projectData = mergeProjectFiles(activeProject, projectData);
      }

      // - Parse attempt 2: code block fallback (if model used markdown fences) -
      // parseFinalResponseFiles already handles both delimiter and fenced formats.


      if (projectData && projectData.files.length > 0) {
        const isPartial = !fullContent.includes('===NOTES===') && !fullContent.includes('===SETUP===');
        const modeLabel = isCode ? 'Code' : 'Website';
        const modeIcon = isCode ? '💻' : '🌐';


        contentDiv.innerHTML = `${renderRawThinking(fullThinking)}
          <div class="build-success">
            <div class="build-success-header">
              <span class="build-success-icon">${isPartial ? '⚠️' : '✅'}</span>
              <strong>${escapeHtml(projectData.project || modeLabel)} ${isPartial ? 'partially' : ''} built!</strong>
            </div>
            ${isPartial ? `<p class="build-partial-warn">⚠️ Output was cut off - showing what was generated.</p>` : ''}
            ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
            ${renderGeneratedFileCards(projectData)}
            ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
            ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
            <div class="build-actions">
              <button class="build-open-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open in Builder
              </button>
              <button class="build-dl-btn" onclick="downloadBuilderZip()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Download ZIP
              </button>
            </div>
          </div>`;

        // Merge AI's returned files with any existing project in the builder.
        // If the AI only fixed one file, all other project files are preserved.
        // If this is a fresh generation (no existing project), merge is a no-op.
        const existingProject = getActiveProjectForContext();
        const finalProject = mergeProjectFiles(existingProject, projectData);

        window._lastBuild = finalProject;
        bindGeneratedFileCards(contentDiv, finalProject);
        openBuilderPanel(finalProject);
        const changedCount = projectData.files.length;
        const totalCount = finalProject.files.length;
        const isEdit = existingProject && existingProject.files && existingProject.files.length > 0;
        showToast(
          isEdit
            ? `${changedCount} file${changedCount > 1 ? 's' : ''} updated (${totalCount} total in project)`
            : `${totalCount} file${totalCount > 1 ? 's' : ''} generated!`,
          'success'
        );

      } else {
        contentDiv.innerHTML = `${renderRawThinking(fullThinking)}${renderMarkdown(fullContent)}`;
        highlightCodeBlocks(contentDiv);
        const warnDiv = document.createElement('div');
        warnDiv.className = 'build-parse-error';
        warnDiv.innerHTML = `
          <span>⚠️</span>
          <div>
            <strong>Couldn't extract files from this response.</strong><br>
            The model didn't follow the expected format. Try:
            <ul>
              <li>Switching to a larger model (llama3, mistral)</li>
              <li>Increasing Max Tokens to 4096+ in Settings</li>
              <li>Being more specific in your request</li>
              <li>Make sure you are in the correct mode before sending</li>
            </ul>
          </div>`;
        contentDiv.appendChild(warnDiv);
        showToast('Could not extract files - see suggestions below', '');
      }
    } else if (agentArtifactProject && Array.isArray(agentArtifactProject.files) && agentArtifactProject.files.length > 0) {
      // Agent mode wrote files via artifact.write tool - open them in the builder panel.
      // isBuild/isCode are false in agent mode (they reflect the chat-mode UI toggle, not agent intent),
      // so this branch handles the case the agent produced real artifacts that the builder block above never sees.
      contentDiv.innerHTML = renderAssistantContent(fullContent, hazyTrace, fullThinking, webSearchMetadata);
      highlightCodeBlocks(contentDiv);

      const agentFileCount = agentArtifactProject.files.length;
      const agentSuccessDiv = document.createElement('div');
      agentSuccessDiv.className = 'build-success';
      agentSuccessDiv.innerHTML = `
        <div class="build-success-header">
          <span class="build-success-icon">✅</span>
          <strong>${escapeHtml(agentArtifactProject.project || 'Agent Output')} ready!</strong>
        </div>
        ${agentArtifactProject.description ? `<p class="build-success-desc">${escapeHtml(agentArtifactProject.description)}</p>` : ''}
        ${renderGeneratedFileCards(agentArtifactProject)}
        <div class="build-actions">
          <button class="build-open-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Open in Builder
          </button>
          <button class="build-dl-btn" onclick="downloadBuilderZip()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Download ZIP
          </button>
        </div>`;
      contentDiv.appendChild(agentSuccessDiv);
      const existingAgentProject = getActiveProjectForContext();
      const finalAgentProject = mergeProjectFiles(existingAgentProject, agentArtifactProject);
      window._lastBuild = finalAgentProject;
      bindGeneratedFileCards(contentDiv, finalAgentProject);
      showToast(`${agentFileCount} file${agentFileCount > 1 ? 's' : ''} ${existingAgentProject ? 'updated' : 'generated'} by agent!`, 'success');

    } else {
      // Standard chat mode OR agent mode where agentArtifactProject wasn't created.
      let projectData = parseFinalResponseFiles(fullContent);
      if (projectData && projectData.files.length > 0) {
        // Save files to workspace (async)
        exportGeneratedFilesToWorkspace(fullContent);

        const existingProject = getActiveProjectForContext();
        const finalProject = mergeProjectFiles(existingProject, projectData);
        window._lastBuild = finalProject;

        // Strip the raw code blocks and delimiters from the markdown content
        const cleanContent = stripCodeBlocksAndDelimiters(fullContent);

        // Render the thinking and the assistant's text
        let html = renderRawThinking(fullThinking);
        if (cleanContent) {
          html += renderAssistantContent(cleanContent, hazyTrace, '', webSearchMetadata);
        } else {
          html += renderRawThinking(fullThinking);
        }

        // Render the build-success layout (the "folder" container)
        const isPartial = !fullContent.includes('===NOTES===') && !fullContent.includes('===SETUP===');
        const modeLabel = 'Code Project';

        html += `
          <div class="build-success">
            <div class="build-success-header">
              <span class="build-success-icon">✅</span>
              <strong>${escapeHtml(projectData.project || modeLabel)} ${isPartial ? 'partially' : ''} saved!</strong>
            </div>
            ${isPartial ? `<p class="build-partial-warn">⚠️ Output was cut off - showing what was generated.</p>` : ''}
            ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
            ${renderGeneratedFileCards(projectData)}
            ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
            ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
            <div class="build-actions">
              <button class="build-open-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open in Builder
              </button>
              <button class="build-dl-btn" onclick="downloadBuilderZip()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Download ZIP
              </button>
            </div>
          </div>`;

        contentDiv.innerHTML = html;
        highlightCodeBlocks(contentDiv);
        bindGeneratedFileCards(contentDiv, finalProject);

        const changedCount = projectData.files.length;
        const totalCount = finalProject.files.length;
        const isEdit = existingProject && existingProject.files && existingProject.files.length > 0;
        showToast(
          isEdit
            ? `${changedCount} file${changedCount > 1 ? 's' : ''} updated (${totalCount} total in project)`
            : `${totalCount} file${totalCount > 1 ? 's' : ''} generated!`,
          'success'
        );
      } else {
        // -- SOURCES_PENDING: render content + inject skeleton placeholder synchronously --
        contentDiv.innerHTML = renderAssistantContent(fullContent, hazyTrace, fullThinking, webSearchMetadata);
        highlightCodeBlocks(contentDiv);
        await exportGeneratedFilesToWorkspace(fullContent);
      }
    }

    // ====== Phase 0: Computer-Use Agent - Check for confirmation gate ======
    if (STATE.activePage === 'agent' && agentRunInfo?.confirmationRequired && agentRunInfo.blockedToolCalls?.length > 0) {
      window._currentBlockedCall = agentRunInfo.blockedToolCalls[0];
      showConfirmationModal(window._currentBlockedCall);
    }

    // -- Async fetch: SOURCES_PENDING → SOURCES_LOADED or ERROR -------------------------
    // Start the fetch immediately (no await) so it runs while the DOM is already updating.
    const searchFetchPromise = loadWebSourceCards(webSearchMetadata);

    // Only wait if there is actually a pending placeholder in the DOM.
    const pendingPlaceholder = webSearchMetadata?.runId
      ? contentDiv.querySelector(`#tl-search-placeholder-${CSS.escape(webSearchMetadata.runId)}`)
      : null;

    if (pendingPlaceholder) {
      // Block until fetch resolves, then swap placeholder
      const searchResult = await searchFetchPromise;
      const timelineList = finalizeTimelineSearch(contentDiv, webSearchMetadata, searchResult);
      // -- DONE: only fire after search is fully settled --
      appendTimelineDone(timelineList);
      scrollToBottom(true);
    } else if (webSearchMetadata?.runId) {
      // No placeholder (non-trace path) - legacy fallback: wait and insert raw HTML
      const webSourceCards = await searchFetchPromise;
      if (webSourceCards && !webSourceCards.startsWith('__ERROR__:')) {
        contentDiv.insertAdjacentHTML('beforeend', `
          <section class="web-source-panel" aria-label="Web search sources">
            <div class="tl-source-grid">${webSourceCards}</div>
          </section>`);
      }
    }


  } catch (err) {
    window.HAZY_STREAMING_TTS?.stop();
    removeTypingIndicator();
    if (err.name === 'AbortError') {
      // On abort during build - try to parse whatever was collected
      if ((isBuild || isCode) && partialGeneratedContent.length > 100) {
        const partial = parseFinalResponseFiles(partialGeneratedContent);
        if (partial?.files.length > 0) {
          window._lastBuild = partial;
          openBuilderPanel(partial);
          showToast(`Stopped - recovered ${partial.files.length} partial file(s)`, '');
          return;
        }
      } else if (partialGeneratedContent.length > 100) {
        await exportGeneratedFilesToWorkspace(partialGeneratedContent);
      }
      showToast('Generation stopped', '');
    } else {
      const isConn = err.message.includes('fetch') || err.message.includes('Failed');
      appendErrorMessage(isConn
        ? `Cannot connect to Ollama at <strong>${STATE.ollamaUrl}</strong>.<br>Make sure Ollama is running: <code>ollama serve</code>`
        : `Error: ${err.message}`);
    }
  } finally {
    setStreamingState(false);
    scrollToBottom(true);
  }
}

function appendErrorMessage(html) {
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.innerHTML = `<span class="error-icon">âš ï¸</span><span>${html}</span>`;
  el.messagesArea.appendChild(div);
}

// ========================
// Live Code Display (Claude-style)
// ========================
function renderLiveBuildProgress(rawContent, filesFound, linesGenerated) {
  // Parse the content to show live code preview
  const projectMatch = rawContent.match(/===PROJECT===\s*([\s\S]*?)(?===|$)/);
  const descMatch = rawContent.match(/===DESCRIPTION===\s*([\s\S]*?)(?===|$)/);

  let html = '<div class="build-live-preview">';

  // Header with stats
  html += `
    <div class="build-live-header">
      <span class="build-spinner"></span>
      <div>
        <strong>Building: ${projectMatch ? escapeHtml(projectMatch[1].trim()) : 'Website Project'}</strong>
        <span class="build-stats">${filesFound} file${filesFound > 1 ? 's' : ''} · ${linesGenerated} lines · ${(rawContent.length / 1024).toFixed(1)} KB</span>
      </div>
    </div>`;

  if (descMatch) {
    html += `<p class="build-live-desc">${escapeHtml(descMatch[1].trim())}</p>`;
  }

  // Extract and display each file as it's being written
  const filePattern = /===FILE:\s*([^\s=][^=]*?)===\s*([\s\S]*?)(?=\r?\n===(?:FILE:|SETUP|NOTES|PROJECT|DESCRIPTION|$))/gi;
  let match;
  const files = [];

  while ((match = filePattern.exec(rawContent)) !== null) {
    const filename = match[1].trim();
    const content = cleanFileContent(match[2]);
    if (filename) {
      files.push({ filename, content });
    }
  }

  if (files.length > 0) {
    html += '<div class="build-live-files">';
    files.forEach((file, idx) => {
      const lang = detectLang(file.filename);
      const isIncomplete = idx === files.length - 1 && !rawContent.endsWith('===');

      html += `
        <div class="build-live-file ${isIncomplete ? 'building' : 'complete'}">
          <div class="build-live-file-header">
            <span class="file-icon">${getFileIcon(lang)}</span>
            <code>${escapeHtml(file.filename)}</code>
            ${isIncomplete ? '<span class="writing-indicator">âœï¸ Writing...</span>' : '<span class="complete-indicator">âœ“</span>'}
          </div>
          <pre class="build-live-code"><code class="language-${lang}">${escapeHtml(file.content)}${isIncomplete ? '<span class="cursor-blink">â”‚</span>' : ''}</code></pre>
        </div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function getFileIcon(lang) {
  const icons = {
    html: 'icon-globe', css: 'icon-sparkles', javascript: 'icon-bolt', js: 'icon-bolt',
    json: 'icon-grid', python: 'icon-grid', txt: 'icon-clipboard', markdown: 'icon-clipboard', md: 'icon-clipboard'
  };
  return getIconSvg(icons[lang] || 'icon-clipboard');
}

// ========================
// Auto-Continue Code Generation
// ========================
// ========================
// Regenerate (fixed)
// ========================
async function regenerateLast() {
  if (!STATE.activeConvId || STATE.isStreaming) return;
  const conv = STATE.conversations[STATE.activeConvId];
  let lastAIIdx = -1;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === 'assistant') { lastAIIdx = i; break; }
  }
  if (lastAIIdx === -1) return;
  conv.messages.splice(lastAIIdx, 1);
  saveConversations();
  el.messagesArea.innerHTML = '';
  conv.messages.forEach(msg => { if (msg.role !== 'system') appendMessage(msg.role, msg.content, false, msg.ts, msg.emotion); });
  let lastUser = null;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === 'user') { lastUser = conv.messages[i]; break; }
  }
  if (!lastUser) return;
  conv.messages.pop();
  saveConversations();
  await sendMessage(lastUser.content);
}

// ========================
// UI Helpers
// ========================
function setStreamingState(streaming) {
  STATE.isStreaming = streaming;
  el.chatInput.disabled = streaming;
  el.sendBtn.disabled = streaming || (!el.chatInput.value.trim() && !STATE.uploadedFiles.length);
  el.stopBtn.style.display = streaming ? 'flex' : 'none';
  if (el.reasoningInstantBtn) el.reasoningInstantBtn.disabled = streaming;
  if (el.reasoningDeepBtn) el.reasoningDeepBtn.disabled = streaming;
}

// -- Scroll management ----------------------------------------------------
// userScrolledUp is set to true the moment the user scrolls up manually.
// It is only cleared when the user scrolls back to the bottom themselves,
// or when a new message is sent. This prevents streaming from ever
// hijacking the scroll position.
let userScrolledUp = false;
let liveScrollFrame = 0;
let touchScrollY = null;
let lastScrollTop = 0;

function isNearBottom() {
  const { scrollTop, scrollHeight, clientHeight } = el.chatContainer;
  return scrollHeight - scrollTop - clientHeight < 96;
}

function scrollToBottom(force = false) {
  if (force) {
    // Always scroll - user just sent a message or a new chat started
    userScrolledUp = false;
    updateScrollBottomBtn();
  }
  if (userScrolledUp || liveScrollFrame) return;
  liveScrollFrame = requestAnimationFrame(() => {
    liveScrollFrame = 0;
    if (!userScrolledUp) {
      // Streaming chunk - only scroll if user hasn't scrolled up
      el.chatContainer.scrollTop = el.chatContainer.scrollHeight;
    }
  });
}

function updateScrollBottomBtn() {
  const chatVisible = el.messagesArea.classList.contains('visible');
  el.scrollBottomBtn.style.display = (userScrolledUp && chatVisible) ? 'flex' : 'none';
}

function updateSendBtn() {
  el.sendBtn.disabled = STATE.isStreaming ||
    (!el.chatInput.value.trim() && !STATE.uploadedFiles.length);
}

function autoResizeTextarea() {
  el.chatInput.style.height = 'auto';
  el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 200) + 'px';
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  el.toastContainer.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; t.style.transition = 'all .25s'; setTimeout(() => t.remove(), 300); }, 2200);
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    el.sidebar.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
  }
}

function setProfileMenuOpen(open) {
  el.profileMenu?.classList.toggle('open', open);
  el.profileMenuBtn?.classList.toggle('open', open);
}

// ========================
// Legacy / Classic TTS (Piper + Browser SpeechSynthesis)
// Kept for power users / backward compatibility (plan Agent F + audit "consolidate or clearly separate").
// The primary/recommended path is the Kokoro Voice system (voice* STATE + HAZY_TTS_MANAGER + streamingTTS + audioQueue).
// speakBrowser / speakPiper / _ttsAudioCtx + PIPER_VOICES are isolated here.
// tts* STATE fields and this modal are treated as "Classic/Legacy" in UI labels.
// speakText + streaming + per-message voice buttons route *only* to Kokoro (no cross-talk).
// ========================

const PIPER_VOICES = [
  { id: 'en_US-lessac-medium', label: 'Lessac â­ (US Female)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-amy-medium', label: 'Amy (US Female)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-hfc_female-medium', label: 'HFC Female (US)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-hfc_male-medium', label: 'HFC Male (US)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-joe-medium', label: 'Joe (US Male)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-ryan-medium', label: 'Ryan (US Male)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-danny-low', label: 'Danny (US Male)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-kathleen-low', label: 'Kathleen (US Female)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-kusal-medium', label: 'Kusal (US Male)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_US-libritts-high', label: 'LibriTTS (US Female, HQ)', group: 'ðŸ‡ºðŸ‡¸ English US' },
  { id: 'en_GB-alan-medium', label: 'Alan (GB Male)', group: 'ðŸ‡¬ðŸ‡§ English GB' },
  { id: 'en_GB-cori-high', label: 'Cori (GB Female, HQ)', group: 'ðŸ‡¬ðŸ‡§ English GB' },
  { id: 'en_GB-jenny_dioco-medium', label: 'Jenny (GB Female)', group: 'ðŸ‡¬ðŸ‡§ English GB' },
  { id: 'en_GB-northern_english_male-medium', label: 'Northern Male', group: 'ðŸ‡¬ðŸ‡§ English GB' },
  { id: 'de_DE-thorsten-medium', label: 'Thorsten (Male)', group: 'ðŸ‡©ðŸ‡ª German' },
  { id: 'de_DE-eva_k-x_low', label: 'Eva (Female)', group: 'ðŸ‡©ðŸ‡ª German' },
  { id: 'fr_FR-siwis-medium', label: 'Siwis (Female)', group: 'ðŸ‡«ðŸ‡· French' },
  { id: 'fr_FR-tom-medium', label: 'Tom (Male)', group: 'ðŸ‡«ðŸ‡· French' },
  { id: 'es_ES-davefx-medium', label: 'Dave (Male)', group: 'ðŸ‡ªðŸ‡¸ Spanish' },
  { id: 'it_IT-paola-medium', label: 'Paola (Female)', group: 'ðŸ‡®ðŸ‡¹ Italian' },
  { id: 'pt_BR-faber-medium', label: 'Faber (BR Male)', group: 'ðŸ‡§ðŸ‡· Portuguese' },
  { id: 'nl_NL-mls-medium', label: 'MLS (Female)', group: 'ðŸ‡³ðŸ‡± Dutch' },
  { id: 'ru_RU-ruslan-medium', label: 'Ruslan (Male)', group: 'ðŸ‡·ðŸ‡º Russian' },
  { id: 'zh_CN-huayan-medium', label: 'Huayan (Female)', group: 'ðŸ‡¨ðŸ‡³ Chinese' },
];

// -- Piper runtime state --------------------------------------------------
let _ttsAudioCtx = null;
let _ttsCurrentSource = null;
let _piperSession = null;   // active TtsSession
let _piperLoadedVoice = null;
let _piperLoading = false;

function updatePiperStatus(status, text, pct = null) {
  const el = document.getElementById('ttsPiperStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'tts-model-status';
  if (status === 'loading') el.classList.add('status-loading');
  if (status === 'ready') el.classList.add('status-ready');
  if (status === 'error') el.classList.add('status-error');
  const wrap = document.getElementById('ttsPiperProgressWrap');
  const bar = document.getElementById('ttsPiperProgressBar');
  if (wrap) wrap.style.display = (status === 'loading' && pct != null) ? 'block' : 'none';
  if (bar && pct != null) bar.style.width = Math.min(100, pct) + '%';
}

// plan Agent E: Kokoro ready status UI cloned from Piper pattern (updatePiperStatus + tts-model-status + status-*- classes)
// placed for the Voice (kokoro) settings area (sVoice stab), not the old ttsModal. Listens for event emitted from ttsManager load.
function updateKokoroStatus(status, text) {
  const el = document.getElementById('kokoroStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'tts-model-status';
  if (status === 'loading') el.classList.add('status-loading');
  if (status === 'ready') el.classList.add('status-ready');
  if (status === 'error') el.classList.add('status-error');
}

// Refactor: replaced 'hazy-kokoro-ready' WASM event listener with server health + hardware poll
// (Kokoro now runs in external kokoro-fastapi; no in-browser load event.)
async function checkKokoroHealth() {
  try {
    const res = await fetch('/hazy/tts/health');
    if (res.ok) {
      // Use ttsManager.detectHardware() (plan placement) if available, else direct (health poll still central)
      let hw;
      if (window.HAZY_TTS_MANAGER && typeof window.HAZY_TTS_MANAGER.detectHardware === 'function') {
        hw = await window.HAZY_TTS_MANAGER.detectHardware();
      } else {
        hw = await fetch('/hazy/hardware').then(r => r.json());
      }
      const deviceLabel = hw.gpu ? `GPU · ${hw.gpu}` : `CPU · ${hw.cpuModel || 'Unknown'}`;
      updateKokoroStatus('ready', `Kokoro ready - ${deviceLabel}`);
    } else {
      updateKokoroStatus('error', 'Kokoro server not responding');
    }
  } catch {
    updateKokoroStatus('idle', 'Kokoro server offline - run kokoro-fastapi');
  }
}

// Old WASM ready listener removed (no longer emitted by ttsManager). Use checkKokoroHealth() instead.

// Load Piper only when the user enables it, so a missing optional TTS bundle
// cannot break normal chat startup.
function waitForPiperLib() {
  if (window.PiperTTS) return Promise.resolve(window.PiperTTS);

  return import('https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web/+esm')
    .then((tts) => {
      window.PiperTTS = tts;
      window.dispatchEvent(new Event('piper-ready'));
      return tts;
    })
    .catch((err) => {
      console.warn('[Piper] Optional TTS library failed to load; browser voice still works:', err);
      window.PiperTTS = null;
      window.dispatchEvent(new Event('piper-ready'));
      return null;
    });
}

async function loadPiperModel(voiceId) {
  if (_piperLoadedVoice === voiceId && _piperSession?.ready) return true;
  if (_piperLoading) return false;
  _piperLoading = true;
  _piperSession = null;

  updatePiperStatus('loading', 'Initializing Piper TTS...');

  const tts = await waitForPiperLib();
  if (!tts) {
    _piperLoading = false;
    updatePiperStatus('error', 'âŒ Piper library failed to load. Check internet connection.');
    return false;
  }

  try {
    updatePiperStatus('loading', 'Downloading voice model...', 0);

    _piperSession = await tts.TtsSession.create({
      voiceId,
      progress: (p) => {
        if (p.total > 0) {
          const pct = Math.round((p.loaded / p.total) * 100);
          const mb = (p.loaded / 1048576).toFixed(1);
          const tot = (p.total / 1048576).toFixed(1);
          updatePiperStatus('loading', `Downloading... ${mb} / ${tot} MB`, pct);
        } else {
          updatePiperStatus('loading', 'Downloading voice model...');
        }
      },
    });

    _piperLoadedVoice = voiceId;
    _piperLoading = false;
    STATE.tpsPiperReady = true;
    STATE.ttsPiperLoading = false;
    updatePiperStatus('ready', 'âœ... Piper TTS ready');
    showToast('ðŸŽ¤ Piper TTS ready!', 'success');
    return true;
  } catch (err) {
    _piperLoading = false;
    STATE.tpsPiperReady = false;
    STATE.ttsPiperLoading = false;
    const msg = err.message || String(err);
    updatePiperStatus('error', 'âŒ ' + msg);
    showToast('Piper failed - check console (F12)', 'error');
    console.error('[Piper load error]', err);
    return false;
  }
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getVoiceSettings(overrides = {}) {
  return {
    enabled: STATE.voiceEnabled !== false,
    voice: STATE.voiceVoice || 'af_heart',
    speed: Number(STATE.voiceSpeed || 1),
    volume: Number(STATE.voiceVolume ?? 100),
    autoplay: STATE.voiceAutoplay !== false,
    preferGPU: STATE.voicePreferGPU !== false,
    voiceDevice: STATE.voiceDevice || 'auto',
    ...overrides
  };
}

function syncVoiceSettingsUI() {
  const voice = getVoiceSettings();
  const enabledEl = document.getElementById('voiceEnabled');
  const voiceSelect = document.getElementById('voiceSelect');
  const speedEl = document.getElementById('voiceSpeed');
  const volumeEl = document.getElementById('voiceVolume');
  const autoplayEl = document.getElementById('voiceAutoplay');
  const preferGPUEl = document.getElementById('voicePreferGPU');
  const speedLabel = document.getElementById('voiceSpeedLabel');
  const volumeLabel = document.getElementById('voiceVolumeLabel');
  if (enabledEl) enabledEl.checked = voice.enabled;
  if (voiceSelect) voiceSelect.value = voice.voice;
  if (speedEl) speedEl.value = String(voice.speed);
  if (volumeEl) volumeEl.value = String(voice.volume);
  if (autoplayEl) autoplayEl.checked = voice.autoplay;
  if (preferGPUEl) preferGPUEl.checked = voice.preferGPU !== false;
  if (speedLabel) speedLabel.textContent = `${Number(voice.speed).toFixed(2).replace(/0$/, '').replace(/\.$/, '')}Ã-`;
  if (volumeLabel) volumeLabel.textContent = String(Math.round(voice.volume));
}

async function populateVoiceList() {
  const select = document.getElementById('voiceSelect');
  if (!select || !window.HAZY_TTS_MANAGER) return;
  const voices = window.HAZY_TTS_MANAGER.refreshVoices
    ? await window.HAZY_TTS_MANAGER.refreshVoices()
    : window.HAZY_TTS_MANAGER.getVoices();
  select.innerHTML = voices.map(v => `<option value="${v.id}">${v.id}</option>`).join('');
  select.value = STATE.voiceVoice || voices[0]?.id || 'af_heart';
}

function persistVoiceSettings() {
  if (window.HAZY_VOICE_SETTINGS_STORE) {
    window.HAZY_VOICE_SETTINGS_STORE.write(getVoiceSettings());
  }
}

function stopTTS() {
  try {
    if (_ttsCurrentSource) {
      _ttsCurrentSource.stop();
      _ttsCurrentSource.disconnect();
      _ttsCurrentSource = null;
    }
  } catch { }
  speechSynthesis.cancel();
}

async function speakText(text, force = false) {
  if (!text.trim()) return;
  if (!force && !STATE.voiceEnabled) return;

  try {
    const blob = await window.HAZY_TTS_MANAGER.synthesize(text, {
      voice: STATE.voiceVoice || 'af_heart',
      speed: STATE.voiceSpeed || 1.0
    });
    await window.HAZY_AUDIO_QUEUE_MANAGER.enqueueBlob(blob, {
      speed: STATE.voiceSpeed || 1.0,
      volume: STATE.voiceVolume ?? 100
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return; // silent on explicit abort (e.g. stop button during fetch)
    }
    console.warn('[Hazy Voice] unavailable:', error.message);
    if (force) throw error; // rethrow in force/preview mode so caller can show proper error
    showToast('Voice generation unavailable', '');
  }
}

function speakBrowser(text) {
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = STATE.ttsSpeed;
  utt.pitch = 1;
  speechSynthesis.speak(utt);
}

async function speakPiper(text) {
  const voiceId = STATE.ttsVoice;

  if (!STATE.tpsPiperReady || _piperLoadedVoice !== voiceId) {
    if (_piperLoading) { showToast('Piper is still loading - please wait...', ''); return; }
    const ok = await loadPiperModel(voiceId);
    if (!ok) return;
  }

  try {
    const chunks = splitIntoChunks(text, 300);

    if (!_ttsAudioCtx || _ttsAudioCtx.state === 'closed') {
      _ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ttsAudioCtx.state === 'suspended') await _ttsAudioCtx.resume();

    let startTime = _ttsAudioCtx.currentTime + 0.05;

    for (const chunk of chunks) {
      if (!STATE.ttsEnabled) break;
      // predict() returns a WAV Blob
      const wavBlob = await _piperSession.predict(chunk);
      const arrayBuf = await wavBlob.arrayBuffer();
      const audioBuf = await _ttsAudioCtx.decodeAudioData(arrayBuf);
      const source = _ttsAudioCtx.createBufferSource();
      source.buffer = audioBuf;
      source.playbackRate.value = STATE.ttsSpeed;
      source.connect(_ttsAudioCtx.destination);
      source.start(startTime);
      startTime += audioBuf.duration / STATE.ttsSpeed;
      _ttsCurrentSource = source;
    }
  } catch (e) {
    console.error('[Piper speak error]', e);
    showToast('Piper error: ' + e.message, 'error');
  }
}

function splitIntoChunks(text, maxLen) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, maxLen)];
}


// ========================
// Event Listeners
// ========================
function setupEventListeners() {
  el.navChatBtn?.addEventListener('click', () => {
    setActivePage('chat');
    closeSidebarMobile();
  });
  el.navAgentBtn?.addEventListener('click', () => {
    setActivePage('agent');
    closeSidebarMobile();
  });

  el.chatInput.addEventListener('input', () => {
    updateSendBtn(); autoResizeTextarea();
    const len = el.chatInput.value.length;
    el.charCount.textContent = len > 1000 ? len.toLocaleString() : '';
  });

  el.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!el.sendBtn.disabled) sendMessage(el.chatInput.value); }
  });

  el.sendBtn.addEventListener('click', () => sendMessage(el.chatInput.value));
  el.stopBtn.addEventListener('click', () => STATE.abortController?.abort());

  // -- File upload ----------------------------------
  el.uploadBtn.addEventListener('click', () => el.fileInput.click());

  el.fileInput.addEventListener('change', async () => {
    if (!el.fileInput.files.length) return;
    showToast('Reading files...', '');
    const newFiles = await processFiles(el.fileInput.files);
    STATE.uploadedFiles.push(...newFiles);
    renderFilePreviewStrip();
    if (newFiles.length) showToast(`${newFiles.length} file${newFiles.length > 1 ? 's' : ''} attached`, 'success');
  });

  // Drag-and-drop onto the input area
  const inputArea = document.querySelector('.input-area');
  inputArea.addEventListener('dragover', e => { e.preventDefault(); inputArea.classList.add('drag-over'); });
  inputArea.addEventListener('dragleave', () => inputArea.classList.remove('drag-over'));
  inputArea.addEventListener('drop', async e => {
    e.preventDefault();
    inputArea.classList.remove('drag-over');
    const dropped = e.dataTransfer.files;
    if (!dropped.length) return;
    showToast('Reading files...', '');
    const newFiles = await processFiles(dropped);
    STATE.uploadedFiles.push(...newFiles);
    renderFilePreviewStrip();
    if (newFiles.length) showToast(`${newFiles.length} file${newFiles.length > 1 ? 's' : ''} attached`, 'success');
  });

  // Paste image from clipboard
  document.addEventListener('paste', async e => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map(i => i.getAsFile()).filter(Boolean);
    const newFiles = await processFiles(files);
    STATE.uploadedFiles.push(...newFiles);
    renderFilePreviewStrip();
    if (newFiles.length) showToast('Image pasted!', 'success');
  });

  // Mode buttons
  el.modeChatBtn?.addEventListener('click', () => setMode('chat'));
  el.modeBuildBtn?.addEventListener('click', () => setMode('build'));
  el.modeCodeBtn?.addEventListener('click', () => setMode('code'));
  document.getElementById('codeLangSelect')?.addEventListener('change', e => {
    STATE.codeLang = e.target.value;
  });
  el.reasoningInstantBtn?.addEventListener('click', () => setComposerReasoningMode('off'));
  el.reasoningDeepBtn?.addEventListener('click', () => setComposerReasoningMode('deep'));
  document.getElementById('settingsReasoningMode')?.addEventListener('change', event => {
    STATE.reasoningMode = ['off', 'auto', 'deep'].includes(event.target.value) ? event.target.value : 'auto';
    updateComposerReasoningToggle();
  });

  el.chatContainer.addEventListener('wheel', event => {
    if (event.deltaY < 0) {
      userScrolledUp = true;
      updateScrollBottomBtn();
    }
  }, { passive: true });

  el.chatContainer.addEventListener('touchstart', event => {
    touchScrollY = event.touches[0]?.clientY ?? null;
  }, { passive: true });

  el.chatContainer.addEventListener('touchmove', event => {
    const currentY = event.touches[0]?.clientY;
    if (touchScrollY != null && currentY != null && currentY > touchScrollY + 2) {
      userScrolledUp = true;
      updateScrollBottomBtn();
    }
    touchScrollY = currentY ?? touchScrollY;
  }, { passive: true });

  // Scroll to bottom
  el.chatContainer.addEventListener('scroll', () => {
    const currentScrollTop = el.chatContainer.scrollTop;
    const scrolledUp = currentScrollTop < lastScrollTop; // user scrolled upward
    lastScrollTop = currentScrollTop;

    if (scrolledUp && !isNearBottom()) {
      // User intentionally scrolled up - lock scroll
      userScrolledUp = true;
    } else if (isNearBottom()) {
      // User scrolled back to the bottom - unlock
      userScrolledUp = false;
    }

    updateScrollBottomBtn();
  });

  // Clicking scroll-to-bottom button clears the lock
  el.scrollBottomBtn.addEventListener('click', () => {
    userScrolledUp = false;
    updateScrollBottomBtn();
    el.chatContainer.scrollTo({ top: el.chatContainer.scrollHeight, behavior: 'smooth' });
  });

  // New / Clear chat
  el.newChatBtn.addEventListener('click', () => {
    STATE.pageConversations[STATE.activePage] = null;
    STATE.activeConvId = null;
    showWelcomeScreen();
    renderChatHistory();
    closeSidebarMobile();
  });
  el.clearChatBtn.addEventListener('click', () => {
    const page = normalizePage(STATE.activePage);
    if (!STATE.activeConvId) { showToast(page === 'agent' ? 'No active agentic session' : 'No active chat', ''); return; }
    if (!confirm('Clear this conversation?')) return;
    const conv = STATE.conversations[STATE.activeConvId];
    if (conv) { conv.messages = []; saveConversations(); }
    showWelcomeScreen();
    renderChatHistory();
    updateWorkspaceChrome();
    showToast(page === 'agent' ? 'Agentic session cleared' : 'Chat cleared', 'success');
  });

  // Suggestion cards
  el.suggestionGrid.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      el.chatInput.value = card.dataset.prompt;
      updateSendBtn(); autoResizeTextarea(); el.chatInput.focus();
      setMode(card.dataset.mode || 'chat');
    });
  });

  // Profile menu
  el.profileMenuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const shouldOpen = !el.profileMenu?.classList.contains('open');
    setProfileMenuOpen(shouldOpen);
  });

  // Model selector - fixed-position dropdown that escapes sidebar overflow
  el.modelSelector.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = el.modelDropdown.classList.contains('open');
    if (isOpen) {
      el.modelDropdown.classList.remove('open');
      el.modelSelector.classList.remove('open');
      return;
    }
    const rect = el.modelSelector.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove >= 200 || spaceAbove > spaceBelow) {
      el.modelDropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
      el.modelDropdown.style.top = 'auto';
      el.modelDropdown.style.maxHeight = Math.min(300, spaceAbove - 8) + 'px';
    } else {
      el.modelDropdown.style.top = (rect.bottom + 4) + 'px';
      el.modelDropdown.style.bottom = 'auto';
      el.modelDropdown.style.maxHeight = Math.min(300, spaceBelow - 8) + 'px';
    }
    el.modelDropdown.style.left = rect.left + 'px';
    el.modelDropdown.style.width = rect.width + 'px';
    el.modelDropdown.classList.add('open');
    el.modelSelector.classList.add('open');
  });
  document.addEventListener('click', e => {
    if (!el.modelSelector.contains(e.target) && !el.modelDropdown.contains(e.target)) {
      el.modelDropdown.classList.remove('open'); el.modelSelector.classList.remove('open');
    }
    if (el.profileMenu?.classList.contains('open') &&
      !el.profileMenu.contains(e.target) &&
      !el.profileMenuBtn?.contains(e.target)) {
      setProfileMenuOpen(false);
    }
  });

  // Settings
  el.settingsBtn.addEventListener('click', () => {
    setProfileMenuOpen(false);
    document.getElementById('historyDrawer')?.classList.remove('open');
    document.getElementById('moreMenu')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('active');
    el.ollamaUrl.value = STATE.ollamaUrl;
    el.systemPrompt.value = STATE.systemPrompt;
    el.temperature.value = STATE.temperature; el.tempLabel.textContent = STATE.temperature;
    el.maxTokens.value = STATE.maxTokens; el.maxTokensLabel.textContent = STATE.maxTokens;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === STATE.theme));

    // Populate Appearance tab controls from STATE
    const fsEl = document.getElementById('settingsFontSize');
    const dEl = document.getElementById('settingsDensity');
    const chEl = document.getElementById('settingsCodeHighlight');
    const mdEl = document.getElementById('settingsMarkdown');
    const rpEl = document.getElementById('settingsRepeatPenalty');
    const tpEl = document.getElementById('settingsTopP');
    const csEl = document.getElementById('settingsContextSize');
    syncFontSizeControls(STATE.fontSize || '14px');
    if (dEl) dEl.value = STATE.density || 'normal';
    if (chEl) chEl.checked = STATE.codeHL !== false;
    if (mdEl) mdEl.checked = STATE.markdown !== false;
    if (rpEl) { rpEl.value = STATE.repeatPenalty || 1.1; const l = document.getElementById('repeatPenaltyLabel'); if (l) l.textContent = parseFloat(rpEl.value).toFixed(2); }
    if (tpEl) { tpEl.value = STATE.topP || 0.92; const l = document.getElementById('topPLabel'); if (l) l.textContent = parseFloat(tpEl.value).toFixed(2); }
    if (csEl) csEl.value = STATE.contextSize || 4096;
    populateVoiceList().then(syncVoiceSettingsUI).catch(() => syncVoiceSettingsUI());

    openModal('settingsModal');
  });
  el.settingsClose.addEventListener('click', () => closeModal('settingsModal'));
  el.settingsCancelBtn.addEventListener('click', () => closeModal('settingsModal'));
  el.settingsSaveBtn.addEventListener('click', saveSettings);
  el.settingsModal.addEventListener('click', e => { if (e.target === el.settingsModal) closeModal('settingsModal'); });
  el.temperature.addEventListener('input', () => { el.tempLabel.textContent = el.temperature.value; });
  el.maxTokens.addEventListener('input', () => { el.maxTokensLabel.textContent = el.maxTokens.value; });
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); applyTheme(btn.dataset.theme);
    });
  });

  const historyDrawer = document.getElementById('historyDrawer');
  const moreMenu = document.getElementById('moreMenu');
  const appScrim = document.getElementById('appScrim');
  const openHistoryBtn = () => {
    historyDrawer?.classList.add('open');
    moreMenu?.classList.remove('open');
    appScrim?.classList.add('active');
  };
  const openMoreMenu = () => {
    moreMenu?.classList.add('open');
    historyDrawer?.classList.remove('open');
    appScrim?.classList.add('active');
  };
  const closeUtilityPanels = () => {
    historyDrawer?.classList.remove('open');
    moreMenu?.classList.remove('open');
    appScrim?.classList.remove('active');
  };

  document.getElementById('historyToggleBtn')?.addEventListener('click', openHistoryBtn);
  document.getElementById('surfaceHistoryBtn')?.addEventListener('click', openHistoryBtn);
  document.getElementById('welcomeHistoryBtn')?.addEventListener('click', openHistoryBtn);
  document.getElementById('historyDrawerClose')?.addEventListener('click', closeUtilityPanels);
  document.getElementById('moreMenuBtn')?.addEventListener('click', openMoreMenu);
  document.getElementById('railMoreBtn')?.addEventListener('click', () => {
    setProfileMenuOpen(false);
    openMoreMenu();
  });
  document.getElementById('moreMenuClose')?.addEventListener('click', closeUtilityPanels);
  document.getElementById('railSettingsBtn')?.addEventListener('click', () => el.settingsBtn.click());
  document.getElementById('moreTrainingBtn')?.addEventListener('click', () => {
    closeUtilityPanels();
    openTrainingModal();
  });
  appScrim?.addEventListener('click', closeUtilityPanels);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); STATE.activeConvId = null; showWelcomeScreen(); renderChatHistory(); el.chatInput.focus(); }
    if (e.key === 'Escape') {
      setProfileMenuOpen(false);
      closeModal('settingsModal');
      closeModal('renameModal');
      closeModal('personaModal');
      closeModal('ttsModal');
      closeModal('trainingModal');
      closeUtilityPanels();
    }
  });

  // Export
  el.exportBtn.addEventListener('click', () => {
    if (!STATE.activeConvId) { showToast('No active chat', ''); return; }
    const conv = STATE.conversations[STATE.activeConvId];
    if (!conv?.messages.length) { showToast('Chat is empty', ''); return; }
    const lines = conv.messages.filter(m => m.role !== 'system').map(m => {
      const time = m.ts ? ` [${new Date(m.ts).toLocaleString()}]` : '';
      return `[${m.role === 'user' ? 'You' : 'Hazy'}${time}]\n${m.content}`;
    }).join('\n\n---\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines], { type: 'text/plain' }));
    a.download = `hazy-chat-${Date.now()}.txt`; a.click();
    showToast('Chat exported!', 'success');
  });

  // TTS - button opens voice settings; long-press or separate icon to toggle
  el.ttsToggleBtn?.addEventListener('click', () => {
    if (STATE.ttsEnabled) {
      // Turn off
      STATE.ttsEnabled = false;
      stopTTS();
      el.ttsLabel.textContent = 'TTS: Off';
      el.ttsToggleBtn.classList.remove('active');
      showToast('Voice off', '');
    } else {
      // Open voice settings modal first
      openTTSModal();
    }
  });

  // TTS voice settings modal
  el.ttsClose?.addEventListener('click', () => closeModal('ttsModal'));
  el.ttsModal?.addEventListener('click', e => { if (e.target === el.ttsModal) closeModal('ttsModal'); });
  $('ttsCancelBtn')?.addEventListener('click', () => closeModal('ttsModal'));

  el.ttsTestBtn?.addEventListener('click', () => {
    const sample = "Hey there! This is Hazy speaking - your local companion Hazy AI.";
    speakText(sample);
  });

  document.querySelectorAll('.tts-engine-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      STATE.ttsEngine = radio.value;
      const piperOpts = $('ttsPiperOptions');
      if (piperOpts) piperOpts.style.display = STATE.ttsEngine === 'piper' ? 'block' : 'none';
    });
  });

  el.ttsVoiceSelect?.addEventListener('change', () => {
    STATE.ttsVoice = el.ttsVoiceSelect.value;
    // Reset ready state if voice changed so model reloads
    if (_piperLoadedVoice && _piperLoadedVoice !== STATE.ttsVoice) {
      stopTTS();
      _piperSession = null;   // destroy old session so new voice is actually loaded
      _piperLoadedVoice = null;
      _piperLoading = false;
      STATE.tpsPiperReady = false;
      STATE.ttsPiperLoading = false;
      updatePiperStatus('idle', 'Voice changed - click Enable Voice to load');
    }
  });

  el.ttsSpeedRange?.addEventListener('input', () => {
    STATE.ttsSpeed = parseFloat(el.ttsSpeedRange.value);
    if (el.ttsSpeedLabel) el.ttsSpeedLabel.textContent = STATE.ttsSpeed.toFixed(1) + 'Ã-';
  });

  $('ttsSaveBtn')?.addEventListener('click', async () => {
    STATE.ttsEnabled = true;
    STATE.ttsVoice = el.ttsVoiceSelect?.value || 'en_US-lessac-medium';
    STATE.ttsSpeed = parseFloat(el.ttsSpeedRange?.value || '1.0');

    if (STATE.ttsEngine === 'piper') {
      el.ttsLabel.textContent = 'Piper (loading...)';
      el.ttsToggleBtn.classList.add('active');
      closeModal('ttsModal');
      showToast("Loading Piper model - voice will start after it's ready", 'success');
      if (!STATE.tpsPiperReady && !STATE.ttsPiperLoading) {
        loadPiperModel(STATE.ttsVoice);
      }
    } else {
      el.ttsLabel.textContent = 'Voice On';
      el.ttsToggleBtn.classList.add('active');
      closeModal('ttsModal');
      showToast('Browser TTS enabled', 'success');
    }
  });

  document.getElementById('voiceEnabled')?.addEventListener('change', e => {
    STATE.voiceEnabled = e.target.checked;
    persistVoiceSettings();
  });
  document.getElementById('voiceSelect')?.addEventListener('change', e => {
    STATE.voiceVoice = e.target.value;
    persistVoiceSettings();
  });
  document.getElementById('voiceSpeed')?.addEventListener('input', e => {
    STATE.voiceSpeed = parseFloat(e.target.value);
    const label = document.getElementById('voiceSpeedLabel');
    if (label) label.textContent = `${STATE.voiceSpeed.toFixed(2).replace(/0$/, '').replace(/\.$/, '')}Ã-`;
    persistVoiceSettings();
  });
  document.getElementById('voiceVolume')?.addEventListener('input', e => {
    STATE.voiceVolume = parseInt(e.target.value);
    const label = document.getElementById('voiceVolumeLabel');
    if (label) label.textContent = String(STATE.voiceVolume);
    persistVoiceSettings();
  });
  document.getElementById('voiceAutoplay')?.addEventListener('change', e => {
    STATE.voiceAutoplay = e.target.checked;
    persistVoiceSettings();
  });
  document.getElementById('voicePreferGPU')?.addEventListener('change', e => {
    STATE.voicePreferGPU = e.target.checked;
    persistVoiceSettings();
  });
  document.getElementById('voicePreviewBtn')?.addEventListener('click', async () => {
    // Unlock AudioContext first (required by browser autoplay policy before any audio plays)
    if (window.HAZY_AUDIO_QUEUE_MANAGER?._audioCtx?.state === 'suspended') {
      await window.HAZY_AUDIO_QUEUE_MANAGER._audioCtx.resume().catch(() => { });
    }
    updateKokoroStatus('loading', 'Generating voice...');
    try {
      await speakText("Hello, I'm Hazy AI. Nice to meet you.", true);
      // Restore status after playback
      checkKokoroHealth().catch(() => updateKokoroStatus('idle', 'Kokoro server offline'));
    } catch (error) {
      console.error('[Voice Preview]', error);
      updateKokoroStatus('error', 'Kokoro TTS error - is the server running?');
      showToast('Voice preview failed - Kokoro server may be offline', 'error');
    }
  });

  // History search
  el.historySearch.addEventListener('input', () => renderChatHistory(el.historySearch.value));

  // Rename
  el.renameClose.addEventListener('click', () => closeModal('renameModal'));
  el.renameCancelBtn.addEventListener('click', () => closeModal('renameModal'));
  el.renameModal.addEventListener('click', e => { if (e.target === el.renameModal) closeModal('renameModal'); });
  el.renameSaveBtn.addEventListener('click', () => {
    const name = el.renameInput.value.trim();
    if (!name) { showToast('Name cannot be empty', 'error'); return; }
    if (STATE.renameTargetId) { renameConversation(STATE.renameTargetId, name); closeModal('renameModal'); showToast('Chat renamed', 'success'); }
  });
  el.renameInput.addEventListener('keydown', e => { if (e.key === 'Enter') el.renameSaveBtn.click(); });

  // Builder panel controls
  el.builderClose.addEventListener('click', () => {
    el.builderPanel.classList.remove('open');
    el.builderPanel.classList.remove('preview-view', 'files-view');
    document.body.classList.remove('builder-open');
  });
  el.builderPreviewToggle.addEventListener('click', () => setBuilderView('preview'));
  el.builderFilesToggle?.addEventListener('click', () => setBuilderView('files'));
  el.builderRefresh.addEventListener('click', refreshPreview);
  el.builderDownload.addEventListener('click', downloadBuilderZip);
  el.builderCopyFile.addEventListener('click', () => {
    const file = STATE.builderFiles[STATE.builderActiveFile];
    if (file) navigator.clipboard.writeText(file.content).then(() => showToast('File copied!', 'success'));
  });

  // Preview viewport buttons
  document.querySelectorAll('.viewport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.viewport-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      el.previewFrame.style.width = btn.dataset.width;
      el.previewFrame.style.margin = btn.dataset.width === '100%' ? '0' : '0 auto';
    });
  });

  // -- Persona --------------------------------------
  el.personaBtn?.addEventListener('click', () => {
    setProfileMenuOpen(false);
    openPersonaModal();
  });
  el.personaClose?.addEventListener('click', () => closeModal('personaModal'));
  el.personaCancelBtn?.addEventListener('click', () => closeModal('personaModal'));
  el.personaModal?.addEventListener('click', e => { if (e.target === el.personaModal) closeModal('personaModal'); });
  el.personaSaveBtn?.addEventListener('click', savePersona);
  el.personaResetBtn?.addEventListener('click', () => {
    if (!confirm('Reset persona to defaults?')) return;
    STATE.personaEnabled = false; STATE.personaName = 'Alex'; STATE.personaUserName = '';
    STATE.personaRelation = 'friend'; STATE.personaGender = 'neutral'; STATE.personaLanguage = 'casual';
    STATE.personaTraits = []; STATE.scenarioDesc = ''; STATE.scenarioOpener = '';
    STATE.scenarioUserRole = ''; STATE.scenarioCharRole = ''; STATE.scenarioSetting = '';
    openPersonaModal();
    showToast('Persona reset', '');
  });

  // Persona tab switching
  document.querySelectorAll('.persona-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPersonaTab(tab.dataset.tab));
  });

  // Relation card clicks
  document.querySelectorAll('.persona-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // Trait pill toggles
  document.querySelectorAll('.trait-pill').forEach(pill => {
    pill.addEventListener('click', () => pill.classList.toggle('selected'));
  });
}

// ========================
// Persona Modal
// ========================
function openPersonaModal() {
  // Sync state â†’ UI
  if (el.personaToggle) el.personaToggle.checked = STATE.personaEnabled;
  if (el.personaNameInput) el.personaNameInput.value = STATE.personaName;
  if (el.personaUserNameInput) el.personaUserNameInput.value = STATE.personaUserName;
  if (el.personaGender) el.personaGender.value = STATE.personaGender;
  if (el.personaLanguage) el.personaLanguage.value = STATE.personaLanguage;
  if (el.scenarioDesc) el.scenarioDesc.value = STATE.scenarioDesc;
  if (el.scenarioOpener) el.scenarioOpener.value = STATE.scenarioOpener;
  if (el.scenarioUserRole) el.scenarioUserRole.value = STATE.scenarioUserRole;
  if (el.scenarioCharRole) el.scenarioCharRole.value = STATE.scenarioCharRole;

  document.querySelectorAll('.persona-card').forEach(c =>
    c.classList.toggle('selected', c.dataset.relation === STATE.personaRelation)
  );
  document.querySelectorAll('.trait-pill').forEach(p =>
    p.classList.toggle('selected', STATE.personaTraits.includes(p.dataset.trait))
  );

  renderPresetScenarioGrid();
  renderScenarioSettingGrid();
  switchPersonaTab('presets');
  openModal('personaModal');
}

async function savePersona() {
  const selectedCard = document.querySelector('.persona-card.selected');
  STATE.personaRelation = selectedCard?.dataset.relation || 'friend';
  STATE.personaEnabled = el.personaToggle?.checked ?? true;
  STATE.personaName = el.personaNameInput?.value.trim() || 'Alex';
  STATE.personaUserName = el.personaUserNameInput?.value.trim() || '';
  STATE.personaGender = el.personaGender?.value || 'neutral';
  STATE.personaLanguage = el.personaLanguage?.value || 'casual';
  STATE.personaTraits = Array.from(document.querySelectorAll('.trait-pill.selected')).map(p => p.dataset.trait);
  STATE.scenarioDesc = el.scenarioDesc?.value.trim() || '';
  STATE.scenarioOpener = el.scenarioOpener?.value.trim() || '';
  STATE.scenarioUserRole = el.scenarioUserRole?.value.trim() || '';
  STATE.scenarioCharRole = el.scenarioCharRole?.value.trim() || '';
  STATE.scenarioSetting = document.querySelector('.scenario-setting-btn.selected')?.dataset.setting || '';

  const currentSettings = {
    personaRelation: STATE.personaRelation,
    personaName: STATE.personaName,
    personaUserName: STATE.personaUserName,
    personaGender: STATE.personaGender,
    personaLanguage: STATE.personaLanguage,
    personaTraits: STATE.personaTraits,
    scenarioDesc: STATE.scenarioDesc,
    scenarioOpener: STATE.scenarioOpener,
    scenarioUserRole: STATE.scenarioUserRole,
    scenarioCharRole: STATE.scenarioCharRole,
    scenarioSetting: STATE.scenarioSetting
  };

  let personaPrompt = '';
  try {
    if (window.location.protocol === 'file:') throw new Error('standalone');
    const response = await fetch(hazyServerEndpoint('/hazy/persona-prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentSettings)
    });
    if (response.ok) {
      const data = await response.json();
      personaPrompt = data.prompt;
    }
  } catch (e) {
    console.warn('[Hazy] Persona prompt generation failed:', e);
  }

  if (!personaPrompt) {
    personaPrompt = "You are a helpful AI assistant.";
  }

  STATE.personaPrompt = personaPrompt;

  // Persist everything
  const s = JSON.parse(localStorage.getItem('hazy_settings') || '{}');
  Object.assign(s, {
    personaEnabled: STATE.personaEnabled, personaRelation: STATE.personaRelation,
    personaName: STATE.personaName, personaUserName: STATE.personaUserName,
    personaGender: STATE.personaGender, personaTraits: STATE.personaTraits,
    personaLanguage: STATE.personaLanguage, scenarioDesc: STATE.scenarioDesc,
    scenarioOpener: STATE.scenarioOpener, scenarioUserRole: STATE.scenarioUserRole,
    scenarioCharRole: STATE.scenarioCharRole, scenarioSetting: STATE.scenarioSetting,
    personaPrompt: STATE.personaPrompt
  });
  localStorage.setItem('hazy_settings', JSON.stringify(s));

  updatePersonaBadge();
  closeModal('personaModal');

  if (STATE.personaEnabled) {
    const preset = PERSONA_PRESETS[STATE.personaRelation];
    showToast(`${STATE.personaName} - starting scene...`, 'success');

    // Start a new chat and inject the opener automatically
    STATE.activeConvId = null;
    showWelcomeScreen();
    renderChatHistory();

    setTimeout(() => {
      // Create the conversation and immediately have the character open the scene
      const id = 'conv_' + Date.now();
      const title = STATE.scenarioDesc
        ? STATE.scenarioDesc.slice(0, 50) + '...'
        : `${STATE.personaName} - ${preset?.label || 'Chat'}`;
      STATE.conversations[id] = { title, messages: [], createdAt: Date.now() };
      STATE.activeConvId = id;
      el.welcomeScreen.style.display = 'none';
      el.messagesArea.classList.add('visible');
      saveConversations();
      renderChatHistory();
      injectPersonaOpener();
    }, 150);
  } else {
    showToast('Persona disabled', '');
  }
}

// ========================
// TTS Modal
// ========================
function openTTSModal() {
  document.querySelectorAll('.tts-engine-radio').forEach(r => {
    r.checked = r.value === STATE.ttsEngine;
  });
  const piperOpts = $('ttsPiperOptions');
  if (piperOpts) piperOpts.style.display = STATE.ttsEngine === 'piper' ? 'block' : 'none';
  if (el.ttsVoiceSelect) el.ttsVoiceSelect.value = STATE.ttsVoice;
  if (el.ttsSpeedRange) el.ttsSpeedRange.value = STATE.ttsSpeed;
  if (el.ttsSpeedLabel) el.ttsSpeedLabel.textContent = STATE.ttsSpeed.toFixed(1) + 'Ã-';

  // Show current Piper status
  if (STATE.tpsPiperReady) updatePiperStatus('ready', 'âœ... Piper model loaded and ready');
  else if (STATE.ttsPiperLoading) updatePiperStatus('loading', 'Loading Piper model...');
  else updatePiperStatus('idle', 'Select a voice above then click Enable Voice');

  openModal('ttsModal');
}

// ========================
// Boot
// ========================
document.addEventListener('DOMContentLoaded', init);

// ========================
// Training Data Builder
// ========================
const TRAINING = {
  pairs: [], // { type: 'qa'|'raw', instruction, response, raw }
};

function openTrainingModal() {
  renderTrainChatList();
  renderTrainPreview();
  switchTrainingTab('manual');
  openModal('trainingModal');
}

function switchTrainingTab(tabId) {
  document.querySelectorAll('.training-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  document.querySelectorAll('.training-tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `training-tab-${tabId}`)
  );
  if (tabId === 'preview') renderTrainPreview();
  if (tabId === 'from-chat') renderTrainChatList();
}

function trainAddPair() {
  const instruction = document.getElementById('trainInstruction').value.trim();
  const response = document.getElementById('trainResponse').value.trim();
  if (!instruction || !response) { showToast('Fill in both fields', 'error'); return; }
  TRAINING.pairs.push({ type: 'qa', instruction, response });
  document.getElementById('trainInstruction').value = '';
  document.getElementById('trainResponse').value = '';
  updateTrainCount();
  showToast('Pair added!', 'success');
}

function updateTrainCount() {
  const n = TRAINING.pairs.length;
  const el = document.getElementById('trainPairCount');
  if (el) el.textContent = `${n} pair${n !== 1 ? 's' : ''} added`;
  const tot = document.getElementById('trainTotalCount');
  if (tot) tot.textContent = `${n} example${n !== 1 ? 's' : ''}`;
}

function trainAddRawText() {
  const text = document.getElementById('trainBulkText').value.trim();
  if (!text) { showToast('Paste some text first', 'error'); return; }
  // Split into ~500 word chunks
  const words = text.split(/\s+/);
  const chunkSize = 500;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.length > 50) TRAINING.pairs.push({ type: 'raw', raw: chunk });
  }
  document.getElementById('trainBulkText').value = '';
  const status = document.getElementById('trainBulkStatus');
  if (status) status.textContent = `Added ${Math.ceil(words.length / chunkSize)} chunk(s)`;
  updateTrainCount();
  showToast('Text added as training chunks!', 'success');
}

async function trainSplitWithAI() {
  const text = document.getElementById('trainBulkText').value.trim();
  if (!text) { showToast('Paste some text first', 'error'); return; }
  const status = document.getElementById('trainBulkStatus');
  if (status) status.textContent = 'Asking Hazy to extract pairs...';

  const prompt = `You are a training data generator. Read the text below and extract 5-15 question-answer pairs from it for fine-tuning a language model.

Return ONLY a JSON array like this (no extra text, no markdown):
[{"instruction":"question here","response":"answer here"},...]

Text:
${text.slice(0, 3000)}`;

  try {
    const savedModel = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud = ['anthropic', 'openai', 'groq', 'gemini', 'nvidia'].includes(savedProvider);
    const trainEndpoint = window.location.protocol === 'file:' ? `${STATE.ollamaUrl}/api/chat` : hazyServerEndpoint('/hazy/chat');
    const trainBody = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.3, num_predict: 2048 } }
      : { model: savedModel, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.3, num_predict: 2048, max_tokens: 2048 } };

    const res = await fetch(trainEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trainBody),
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    let raw = (data.message?.content || '').trim();
    // Strip markdown fences if model wrapped it
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim();
    const pairs = JSON.parse(raw);
    if (!Array.isArray(pairs)) throw new Error('Not an array');
    pairs.forEach(p => {
      if (p.instruction && p.response) {
        TRAINING.pairs.push({ type: 'qa', instruction: p.instruction.trim(), response: p.response.trim() });
      }
    });
    document.getElementById('trainBulkText').value = '';
    if (status) status.textContent = `Extracted ${pairs.length} pairs!`;
    updateTrainCount();
    showToast(`Extracted ${pairs.length} training pairs!`, 'success');
  } catch (e) {
    if (status) status.textContent = 'Failed - try "Add as Raw Text" instead';
    showToast('Hazy extraction failed: ' + e.message, 'error');
  }
}

function renderTrainChatList() {
  const container = document.getElementById('trainChatList');
  if (!container) return;
  const convs = Object.entries(STATE.conversations)
    .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!convs.length) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">No conversations yet. Chat with Hazy first, then come back here.</p>';
    return;
  }
  container.innerHTML = convs.map(([id, conv]) => {
    const msgCount = (conv.messages || []).filter(m => m.role !== 'system').length;
    return `<label class="train-chat-item">
      <input type="checkbox" data-id="${id}" />
      <span class="train-chat-title">${escapeHtml(conv.title || 'Untitled')}</span>
      <span class="train-chat-count">${msgCount} messages</span>
    </label>`;
  }).join('');
}

function trainAddSelectedChats() {
  const checked = document.querySelectorAll('#trainChatList input[type=checkbox]:checked');
  if (!checked.length) { showToast('Select at least one chat', 'error'); return; }
  let added = 0;
  checked.forEach(cb => {
    const conv = STATE.conversations[cb.dataset.id];
    if (!conv) return;
    const msgs = (conv.messages || []).filter(m => m.role !== 'system');
    // Pair user -> Hazy messages
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].role === 'user' && msgs[i + 1].role === 'assistant') {
        TRAINING.pairs.push({
          type: 'qa',
          instruction: msgs[i].content,
          response: msgs[i + 1].content,
        });
        added++;
      }
    }
    cb.checked = false;
  });
  updateTrainCount();
  showToast(`Added ${added} pairs from chats!`, 'success');
}

function renderTrainPreview() {
  updateTrainCount();
  const container = document.getElementById('trainPreviewList');
  if (!container) return;
  if (!TRAINING.pairs.length) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px 0;">No data yet - add pairs from the other tabs.</p>';
    return;
  }
  container.innerHTML = TRAINING.pairs.map((p, i) => `
    <div class="train-pair-item">
      <button class="train-pair-delete" onclick="trainDeletePair(${i})">✖</button>
      ${p.type === 'raw'
      ? `<span class="train-pair-label">raw text</span>
           <span class="train-pair-q">${escapeHtml(p.raw.slice(0, 200))}${p.raw.length > 200 ? '...' : ''}</span>`
      : `<span class="train-pair-label">instruction</span>
           <span class="train-pair-q">${escapeHtml(p.instruction.slice(0, 150))}${p.instruction.length > 150 ? '...' : ''}</span>
           <span class="train-pair-label" style="margin-top:4px;">response</span>
           <span class="train-pair-a">${escapeHtml(p.response.slice(0, 150))}${p.response.length > 150 ? '...' : ''}</span>`
    }
    </div>`).join('');
}

function trainDeletePair(index) {
  TRAINING.pairs.splice(index, 1);
  renderTrainPreview();
}

function trainClearAll() {
  if (!confirm('Clear all training data?')) return;
  TRAINING.pairs = [];
  renderTrainPreview();
  updateTrainCount();
  showToast('Cleared', '');
}

function trainExportJSONL() {
  if (!TRAINING.pairs.length) { showToast('No data to export', 'error'); return; }
  const format = document.getElementById('trainFormatSelect')?.value || 'alpaca';
  const systemPrompt = document.getElementById('trainSystemPrompt')?.value.trim() || '';
  const lines = TRAINING.pairs.map(p => {
    if (p.type === 'raw') {
      return JSON.stringify({ text: p.raw });
    }
    if (format === 'alpaca') {
      return JSON.stringify({
        instruction: p.instruction,
        input: '',
        output: p.response,
        ...(systemPrompt ? { system: systemPrompt } : {}),
      });
    }
    if (format === 'chatml') {
      const msgs = [];
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
      msgs.push({ role: 'user', content: p.instruction });
      msgs.push({ role: 'assistant', content: p.response });
      return JSON.stringify({ messages: msgs });
    }
    // raw format
    const sys = systemPrompt ? `### System:\n${systemPrompt}\n\n` : '';
    return JSON.stringify({ text: `${sys}### Instruction:\n${p.instruction}\n\n### Response:\n${p.response}` });
  });

  const blob = new Blob([lines.join('\n')], { type: 'application/jsonl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hazy-training-data-${Date.now()}.jsonl`;
  a.click();
  showToast(`Exported ${TRAINING.pairs.length} examples!`, 'success');
}

// -- Wire up training modal events -----------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('trainingDataBtn')?.addEventListener('click', () => {
    closeModal('settingsModal');
    openTrainingModal();
  });
  document.getElementById('trainingClose')?.addEventListener('click', () => closeModal('trainingModal'));
  document.getElementById('trainingModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('trainingModal')) closeModal('trainingModal');
  });
  document.querySelectorAll('.training-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTrainingTab(tab.dataset.tab));
  });
  document.getElementById('trainAddPairBtn')?.addEventListener('click', trainAddPair);
  document.getElementById('trainRawBtn')?.addEventListener('click', trainAddRawText);
  document.getElementById('trainSplitBtn')?.addEventListener('click', trainSplitWithAI);
  document.getElementById('trainAddChatsBtn')?.addEventListener('click', trainAddSelectedChats);
  document.getElementById('trainExportBtn')?.addEventListener('click', trainExportJSONL);
  document.getElementById('trainClearBtn')?.addEventListener('click', trainClearAll);
  document.getElementById('trainFormatSelect')?.addEventListener('change', renderTrainPreview);

  // Enter key in manual fields
  document.getElementById('trainInstruction')?.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.getElementById('trainResponse')?.focus(); }
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HAZY v2 - AI PROVIDERS PANEL + SETTINGS TABS
// Single clean implementation - no duplicates
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// -- Provider data ----------------------------------------------
const PROVIDER_CATEGORIES = {
  text: [
    { key: 'anthropic', name: 'Anthropic (Claude)', url: 'https://console.anthropic.com', note: 'Claude Haiku, Sonnet, Opus - best for novel writing' },
    { key: 'openai', name: 'OpenAI (GPT-4o / DALL-E)', url: 'https://platform.openai.com/api-keys', note: 'GPT-4o, o1, DALL-E 3, TTS - requires paid plan' },
    { key: 'groq', name: 'Groq (Fast Free Tier)', url: 'https://console.groq.com', note: 'Llama 3.1 70B at incredible speed - free tier available' },
    { key: 'openrouter', name: 'OpenRouter (Free & Paid Models)', url: 'https://openrouter.ai/keys', note: 'Access to dozens of free models and premium APIs' },
    { key: 'gemini', name: 'Google Gemini', url: 'https://aistudio.google.com/app/apikey', note: 'Gemini 1.5 Pro - 1M token context window' },
    { key: 'nvidia', name: 'NVIDIA NIM', url: 'https://build.nvidia.com', note: 'Nemotron and other NVIDIA-hosted OpenAI-compatible models' },
  ],
  image: [
    { key: 'stability', name: 'Stability AI', url: 'https://platform.stability.ai', note: 'Stable Diffusion XL, ultra quality images' },
    { key: 'ideogram', name: 'Ideogram', url: 'https://ideogram.ai', note: 'Best AI model for text inside images' },
    { key: 'fal', name: 'fal.ai (Flux + Kling)', url: 'https://fal.ai', note: 'Flux image generation + Kling video - fast API' },
  ],
  media: [
    { key: 'elevenlabs', name: 'ElevenLabs (TTS)', url: 'https://elevenlabs.io', note: 'Most natural AI voices - 30+ voices, multilingual' },
    { key: 'suno', name: 'Suno (AI Music)', url: 'https://suno.com', note: 'Generate full songs from text - cloud only' },
    { key: 'runway', name: 'Runway (AI Video)', url: 'https://runwayml.com', note: 'Gen-3 video generation - cloud only' },
  ],
};

const OLLAMA_MODEL_LIST = [
  { id: 'ollama/llama3.2:1b', label: 'llama3.2:1b (1B - fastest)' },
  { id: 'ollama/llama3.2', label: 'llama3.2 (3B - recommended)' },
  { id: 'ollama/llama3', label: 'llama3 (8B)' },
  { id: 'ollama/mistral', label: 'mistral (7B - best writing)' },
  { id: 'ollama/mixtral', label: 'mixtral (47B - best quality)' },
  { id: 'ollama/gemma2', label: 'gemma2 (9B)' },
  { id: 'ollama/phi3', label: 'phi3 (3.8B)' },
  { id: 'ollama/qwen2.5', label: 'qwen2.5 (7B)' },
  { id: 'ollama/deepseek-r1', label: 'deepseek-r1 (7B)' },
  { id: 'ollama/llava', label: 'llava (7B vision)' },
];

const CLOUD_MODEL_MAP = {
  anthropic: [
    { id: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 - fastest' },
    { id: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 - recommended' },
    { id: 'anthropic/claude-opus-4-5-20251101', label: 'Claude Opus 4.5 - most capable' },
    { id: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'anthropic/claude-opus-4-20250514', label: 'Claude Opus 4' },
  ],
  openai: [
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini - fastest' },
    { id: 'openai/gpt-4o', label: 'GPT-4o - recommended' },
    { id: 'openai/gpt-4.1', label: 'GPT-4.1' },
    { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'openai/o4-mini', label: 'o4 Mini - reasoning' },
    { id: 'openai/o3', label: 'o3 - best reasoning' },
  ],
  groq: [
    { id: 'groq/llama-3.1-8b-instant', label: 'Llama 3.1 8B - fastest' },
    { id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B - recommended' },
    { id: 'groq/meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B - newest' },
    { id: 'groq/moonshotai/kimi-k2-instruct', label: 'Kimi K2 - 60 RPM' },
    { id: 'groq/qwen/qwen3-32b', label: 'Qwen3 32B - 60 RPM' },
    { id: 'groq/openai/gpt-oss-120b', label: 'GPT OSS 120B' },
    { id: 'groq/openai/gpt-oss-20b', label: 'GPT OSS 20B' },
    { id: 'groq/compound', label: 'Compound (preview)' },
    { id: 'groq/compound-mini', label: 'Compound Mini (preview)' },
    { id: 'groq/allam-2-7b', label: 'Allam 2 7B' },
  ],
  openrouter: [
    { id: 'openrouter/google/gemini-2.5-flash-pro:free', label: 'Gemini 2.5 Flash Pro (Free)' },
    { id: 'openrouter/deepseek/deepseek-r1:free', label: 'DeepSeek R1 (Free)' },
    { id: 'openrouter/meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (Free)' },
    { id: 'openrouter/qwen/qwen-2.5-7b-instruct:free', label: 'Qwen 2.5 7B (Free)' },
    { id: 'openrouter/mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Free)' },
    { id: 'openrouter/meta-llama/llama-3.2-11b-vision-instruct:free', label: 'Llama 3.2 11B Vision (Free)' },
    { id: 'openrouter/mistralai/mixtral-8x22b-instruct', label: 'Mixtral 8x22B' }, // newest, paid
    { id: 'openrouter/openai/gpt-oss-120b:free', label: 'GPT OSS 120B (Free)' }, // good free model
  ],

  gemini: [
    { id: 'gemini/gemini-2.0-flash', label: 'Gemini 2.0 Flash (recommended)' },
    { id: 'gemini/gemini-2.5-flash', label: 'Gemini 2.5 Flash (latest)' },
    { id: 'gemini/gemini-1.5-pro', label: 'Gemini 1.5 Pro (1M ctx)' },
  ],
  nvidia: [
    { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B A12B' },
  ],
};

let _providerStatuses = {};

// -- Single initProvidersPanel -----------------------------------
async function initProvidersPanel() {
  const urlEl = document.getElementById('ollamaUrlProvider');
  if (urlEl && !urlEl.value.trim()) {
    urlEl.value = (typeof STATE !== 'undefined' && STATE.ollamaUrl) || 'http://localhost:11434';
  }

  // Try server /hazy/providers first (running via Node.js)
  let gotFromServer = false;
  try {
    const r = await fetch('/hazy/providers', { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const d = await r.json();
      const serverStatuses = d.providers || {};
      _providerStatuses = serverStatuses;

      // Remove keys saved by older Hazy versions. Provider secrets are server-only.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('hazyKey_')) localStorage.removeItem(key);
      }
      gotFromServer = true;
    }
  } catch { /* server not running */ }

  if (!gotFromServer) {
    // Without the server, encrypted cloud-provider secrets are unavailable.
    _providerStatuses = {};
    const allProviders = [
      ...PROVIDER_CATEGORIES.text,
      ...PROVIDER_CATEGORIES.image,
      ...PROVIDER_CATEGORIES.media,
    ];
    allProviders.forEach(p => {
      _providerStatuses[p.key] = { hasKey: false, enabled: false };
    });
  }

  renderProviderStatusBar();
  renderCategorizedProviders();
  await loadInstalledModels();
  restoreActiveModel();

  // Also refresh the sidebar model dropdown so cloud models appear immediately
  // after a key is saved without needing a full page reload
  checkOllamaConnection();
}

// -- Provider status bar -----------------------------------------
function renderProviderStatusBar() {
  const bar = document.getElementById('providerStatusBar');
  if (!bar) return;
  const active = Object.entries(_providerStatuses)
    .filter(([k, v]) => v.enabled && k !== 'ollama')
    .map(([k]) => k);
  bar.innerHTML = active.length
    ? active.map(k => `<span style="font-size:10px;font-family:var(--font-mono,monospace);padding:2px 8px;border-radius:10px;background:#e8f5e9;color:#2d6a4f;border:1px solid #b0d8b8">&#10003; ${k}</span>`).join('')
    : '<span style="font-size:11px;color:var(--text-muted)">No cloud providers active yet - add an API key below.</span>';
}

// -- Categorized provider rows -----------------------------------
function renderCategorizedProviders() {
  const renderGroup = (containerId, providers) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = providers.map(p => {
      const st = _providerStatuses[p.key] || {};
      const hasKey = Boolean(st.hasKey);
      return `<div class="provider-key-row">
        <div class="provider-key-row-head">
          <span class="provider-key-name">${p.name}</span>
          ${(() => {
          const verified = localStorage.getItem('hazyVerified_' + p.key) === 'true';
          if (hasKey && verified) return '<span class="provider-badge-active">&#10003; verified</span>';
          if (hasKey && !verified) return '<span class="provider-badge-saved">â- saved - test it</span>';
          return '<span class="provider-badge-inactive">inactive</span>';
        })()}
          <a href="${p.url}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;margin-left:4px">Get key &#8599;</a>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${p.note}</div>
        <div class="provider-key-input-row">
          <input type="password" id="apikey_${p.key}"
            placeholder="${hasKey ? 'â-â-â-â-â-â-â-â- (saved - paste new to update)' : 'Paste API key here...'}"
            autocomplete="off">
          <button onclick="saveProviderKey('${p.key}')" class="btn-primary" style="padding:6px 14px;font-size:11px;white-space:nowrap;">Save</button>
          ${hasKey ? `
          <button onclick="testProviderKey('${p.key}')" id="testBtn_${p.key}" class="btn-secondary" style="padding:6px 10px;font-size:11px;white-space:nowrap;" title="Send a test message to verify this key works">Test</button>
          <button onclick="clearProviderKey('${p.key}')" class="btn-secondary" style="padding:6px 10px;font-size:11px;color:var(--danger);" title="Remove key">&#10005;</button>
          ` : ''}
        </div>
        <div id="testResult_${p.key}" style="font-size:11px;margin-top:6px;display:none;"></div>
      </div>`;
    }).join('');
  };
  renderGroup('providerKeyRows', PROVIDER_CATEGORIES.text);
  renderGroup('providerImageRows', PROVIDER_CATEGORIES.image);
  renderGroup('providerMediaRows', PROVIDER_CATEGORIES.media);
}

// -- Save / clear key - encrypted server vault -----------------
async function saveProviderKey(providerKey) {
  const input = document.getElementById('apikey_' + providerKey);
  if (!input) return;
  const apiKey = input.value.trim();

  if (!apiKey) {
    showToast('Please paste an API key first', 'error');
    return;
  }

  try {
    const r = await fetch('/hazy/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: providerKey, apiKey }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      const details = await r.json().catch(() => ({}));
      throw new Error(details.error || 'Server rejected the key.');
    }
    const saved = await r.json();
    if (!saved.ok) throw new Error('The key was not saved.');
  } catch (error) {
    showToast('Could not save key securely: ' + error.message, 'error');
    return;
  }

  localStorage.setItem('hazyProvider', providerKey);

  // A newly replaced key must be tested again.
  localStorage.removeItem('hazyVerified_' + providerKey);

  input.value = '';
  showToast('Key encrypted on the Hazy server. Click TEST to verify it works.', 'success');

  await initProvidersPanel();
}

async function clearProviderKey(key) {
  if (!confirm('Remove API key for ' + key + '?')) return;
  try {
    await fetch('/hazy/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: key, apiKey: '' }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { }
  localStorage.removeItem('hazyVerified_' + key);
  showToast(key + ' key removed.', '');
  await initProvidersPanel();
}

// -- Test provider key - sends a real minimal API call to verify ----------
async function testProviderKey(providerKey) {
  const btn = document.getElementById('testBtn_' + providerKey);
  const result = document.getElementById('testResult_' + providerKey);
  if (!btn || !result) return;

  btn.textContent = 'Testing...';
  btn.disabled = true;
  result.style.display = 'block';
  result.style.color = 'var(--text-muted)';
  result.textContent = 'â³ Sending test message...';

  try {
    // Send a tiny real request through /hazy/chat
    // The encrypted key is resolved only by the server.
    const models = CLOUD_MODEL_MAP[providerKey] || [];
    const testModel = (models[0] || {}).id || (providerKey + '/test');

    const r = await fetch('/hazy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: testModel,
        stream: true,
        messages: [
          { role: 'user', content: 'Say "OK" and nothing else.' }
        ],
        options: { max_tokens: 10, temperature: 0 },
      }),
    });

    // -- Check HTTP status - server now forwards real upstream error codes --
    if (!r.ok) {
      let errMsg = 'Authentication failed';
      try {
        const e = await r.json();
        errMsg = e.error || errMsg;
      } catch { }
      result.style.color = 'var(--danger)';
      result.textContent = 'âŒ ' + r.status + ' - ' + errMsg;
      return;
    }

    // -- Read the stream and look for REAL content vs error tokens ----------
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let rawBuffer = '';
    let realToken = '';   // actual AI text token
    let streamErr = '';   // error found inside stream
    let tries = 0;

    while (tries++ < 30 && !realToken && !streamErr) {
      const { done, value } = await reader.read();
      if (done) break;
      rawBuffer += decoder.decode(value, { stream: true });

      // Parse NDJSON lines as they arrive
      const lines = rawBuffer.split('\n');
      rawBuffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          // Error inside stream (server sends this when upstream errors)
          if (json.error) {
            streamErr = json.error;
            break;
          }
          // Real content token
          const token = json.message?.content || '';
          if (token && token.trim()) {
            realToken = token;
            break;
          }
        } catch { }
      }
    }
    reader.cancel();

    if (streamErr) {
      // Got an error inside the stream - bad key
      result.style.color = 'var(--danger)';
      result.textContent = 'âŒ Key rejected - ' + streamErr;
      return;
    }

    if (realToken) {
      // âœ... Got a real AI token - key is genuinely working
      localStorage.setItem('hazyVerified_' + providerKey, 'true');

      const models = CLOUD_MODEL_MAP[providerKey] || [];
      const bestModel = models[1] || models[0];
      if (bestModel) {
        localStorage.setItem('hazyActiveModel', bestModel.id);
        localStorage.setItem('hazyProvider', providerKey);
        STATE.model = bestModel.id;
        if (el && el.currentModelName) {
          el.currentModelName.textContent = bestModel.id.split('/')[1] || bestModel.id;
        }
      }

      result.style.color = 'var(--success)';
      result.textContent = 'âœ... Verified! ' + providerKey + ' responded. Model auto-selected.';
      showToast('âœ... ' + providerKey + ' verified and active!', 'success');

      checkOllamaConnection();
      await initProvidersPanel();

    } else {
      // Connected but got no content and no error - unexpected
      result.style.color = 'var(--warning)';
      result.textContent = 'âš ï¸ No response token received - try again or check your quota.';
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      result.style.color = 'var(--danger)';
      result.textContent = 'âŒ Timeout - server may not be running or key is invalid.';
    } else {
      result.style.color = 'var(--danger)';
      result.textContent = 'âŒ ' + err.message;
    }
  } finally {
    btn.textContent = 'Test';
    btn.disabled = false;
  }
}

// -- Installed local models --------------------------------------
async function loadInstalledModels() {
  const el = document.getElementById('installedModelsList');
  if (!el) return;

  const ollamaBase = (document.getElementById('ollamaUrlProvider')?.value || '').trim().replace(/\/$/, '')
    || (typeof STATE !== 'undefined' && STATE.ollamaUrl)
    || 'http://localhost:11434';

  let data = null;
  
  if (window.location.protocol !== 'file:') {
    try {
      const r = await fetch(hazyServerEndpoint('/hazy/models'), { signal: AbortSignal.timeout(5000) });
      if (r.ok) data = await r.json();
    } catch { }
  }

  if (!data) {
    for (const url of ['/api/tags', ollamaBase + '/api/tags']) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (r.ok) { data = await r.json(); break; }
      } catch { }
    }
  }

  try {
    const models = (data || {}).models || [];
    if (!models.length) {
      el.innerHTML = '<span style="font-size:12px;color:var(--text-muted);font-style:italic">No models installed. Download one below.</span>';
    } else {
      el.innerHTML = models.map(m => {
        const gb = m.size ? (m.size / 1e9).toFixed(1) + 'GB' : '';
        return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-family:monospace;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:2px 8px">
          ${m.name}${gb ? ` <span style="color:var(--text-muted)">${gb}</span>` : ''}
          <button onclick="deleteOllamaModel('${m.name}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:10px;padding:0;margin-left:2px" title="Delete">&#10005;</button>
        </span>`;
      }).join('');
      const activeProv = document.getElementById('activeProviderSelect');
      const modelSel = document.getElementById('activeModelSelect');
      if (activeProv?.value === 'ollama' && modelSel) {
        modelSel.innerHTML = models.map(m => `<option value="ollama/${m.name}">ollama/${m.name}</option>`).join('');
        const saved = localStorage.getItem('hazyActiveModel');
        if (saved?.startsWith('ollama/')) modelSel.value = saved;
      }
    }
  } catch (e) {
    if (el) el.innerHTML = '<span style="font-size:12px;color:#8b2020">Error loading models: ' + e.message + '</span>';
  }
}

async function deleteOllamaModel(name) {
  if (!confirm('Delete "' + name + '" from Ollama?')) return;
  try {
    await fetch('/hazy/delete-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name }) });
    showToast(name + ' deleted.', 'success');
    await loadInstalledModels();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function testOllamaConn() {
  const urlEl = document.getElementById('ollamaUrlProvider');
  const statusEl = document.getElementById('ollamaConnStatus');
  if (!statusEl) return;

  const ollamaBase = (urlEl?.value || '').trim().replace(/\/$/, '')
    || (typeof STATE !== 'undefined' && STATE.ollamaUrl)
    || 'http://localhost:11434';

  statusEl.textContent = 'Testing...';
  statusEl.style.color = 'var(--text-muted)';

  const attempts = ['/api/tags', ollamaBase + '/api/tags'];
  for (const url of attempts) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const d = await r.json();
      const n = (d.models || []).length;
      statusEl.textContent = '\u2713 Connected \u2014 ' + n + ' model' + (n !== 1 ? 's' : '') + ' installed';
      statusEl.style.color = '#2d6a4f';
      await loadInstalledModels();
      return;
    } catch { }
  }
  statusEl.textContent = '\u2717 Cannot reach Ollama at ' + ollamaBase + ' \u2014 run: ollama serve';
  statusEl.style.color = '#8b2020';
}

// -- Model download ----------------------------------------------
async function pullModel() {
  const sel = document.getElementById('pullModelSelect');
  const btn = document.getElementById('pullModelBtn');
  const wrap = document.getElementById('pullProgressWrap');
  const bar = document.getElementById('pullProgressBar');
  const txt = document.getElementById('pullProgressText');
  if (!sel || !btn) return;
  const modelName = sel.value;
  btn.disabled = true; btn.textContent = 'Downloading...';
  if (wrap) wrap.style.display = 'block';
  try {
    const r = await fetch('/hazy/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelName }) });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, { stream: true }).split('\n').filter(l => l.trim())) {
        try {
          const j = JSON.parse(line);
          if (txt) txt.textContent = j.status || '';
          if (j.total && j.completed && bar) {
            bar.style.width = Math.round(j.completed / j.total * 100) + '%';
            if (txt) txt.textContent = (j.status || '') + ' ' + Math.round(j.completed / j.total * 100) + '%';
          }
        } catch { }
      }
    }
    showToast(modelName + ' downloaded!', 'success');
    await loadInstalledModels();
  } catch (e) {
    showToast('Download failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'â†“ Download';
    if (wrap) wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
  }
}

// -- Active model selector (Novel Writer tab) --------------------
function updateModelDropdown() {
  const prov = document.getElementById('activeProviderSelect')?.value || 'ollama';
  const sel = document.getElementById('activeModelSelect');
  if (!sel) return;
  if (prov === 'ollama') {
    sel.innerHTML = OLLAMA_MODEL_LIST.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    // Try to load actual installed models
    fetch('/api/tags').then(r => r.json()).then(d => {
      if (d.models?.length) sel.innerHTML = d.models.map(m => `<option value="ollama/${m.name}">ollama/${m.name}</option>`).join('');
      const saved = localStorage.getItem('hazyActiveModel');
      if (saved) sel.value = saved;
    }).catch(() => { });
  } else {
    const list = CLOUD_MODEL_MAP[prov] || [];
    sel.innerHTML = list.length
      ? list.map(m => `<option value="${m.id}">${m.label}</option>`).join('')
      : '<option value="">- add API key first -</option>';
    const saved = localStorage.getItem('hazyActiveModel');
    if (saved?.startsWith(prov + '/')) sel.value = saved;
  }
}

function restoreActiveModel() {
  const saved = localStorage.getItem('hazyActiveModel');
  if (!saved) return;
  const prov = saved.split('/')[0];
  const modelId = saved.includes('/') ? saved.slice(saved.indexOf('/') + 1) : saved;

  // Restore dropdown selections
  const provSel = document.getElementById('activeProviderSelect');
  if (provSel) { provSel.value = prov; updateModelDropdown(); }
  const modelSel = document.getElementById('activeModelSelect');
  if (modelSel && modelSel.querySelector(`option[value="${saved}"]`)) modelSel.value = saved;

  // Restore STATE.model
  if (typeof STATE !== 'undefined') {
    STATE.model = prov === 'ollama' ? modelId : saved;
    if (typeof el !== 'undefined' && el.currentModelName) {
      el.currentModelName.textContent = modelId;
    }
  }
}

function saveActiveModelChoice() {
  const provSel = document.getElementById('activeProviderSelect');
  const modelSel = document.getElementById('activeModelSelect');
  if (!provSel || !modelSel || !modelSel.value) return;
  const fullModel = modelSel.value; // e.g. 'anthropic/claude-sonnet-4-5' or 'ollama/mistral'
  localStorage.setItem('hazyActiveModel', fullModel);
  localStorage.setItem('hazyProvider', provSel.value);

  // Update STATE.model - for Ollama strip prefix, for cloud keep full id
  const provider = fullModel.split('/')[0];
  const modelId = fullModel.includes('/') ? fullModel.slice(fullModel.indexOf('/') + 1) : fullModel;
  if (provider === 'ollama') {
    STATE.model = modelId;
  } else {
    // Cloud provider - store the full 'provider/model' string so sendMessage can route
    STATE.model = fullModel;
  }

  // Update sidebar model name display
  if (typeof el !== 'undefined' && el.currentModelName) {
    el.currentModelName.textContent = modelId;
  }

  const hasKey = provider === 'ollama' || Boolean(_providerStatuses[provider]?.hasKey);
  if (!hasKey) {
    showToast('âš ï¸ No API key for ' + provider + ' - add it in Settings â†’ AI Providers', 'error');
  } else {
    showToast('Model set to ' + modelId, 'success');
  }
}

// -- Export all data ---------------------------------------------
function exportAllData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    data[k] = localStorage.getItem(k);
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'hazy-export-' + Date.now() + '.json';
  a.click();
}

// -- Settings tab switching --------------------------------------
function switchSettingsTab(tabId) {
  document.querySelectorAll('.snav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.snav-btn[data-tab="${tabId}"]`);
  const panel = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
  if (tabId === 'sMemory') loadCompanionMemories();
}

async function loadCompanionMemories() {
  const list = document.getElementById('memoryList');
  if (!list) return;
  list.innerHTML = '<div class="memory-empty">Loading memories...</div>';
  const showDisabled = document.getElementById('memoryShowDisabled')?.checked;
  try {
    const status = showDisabled ? 'all' : 'active';
    const response = await fetch(`/hazy/memories?userId=local-user&status=${status}`);
    if (!response.ok) throw new Error('Memory service is unavailable.');
    const data = await response.json();
    const memories = data.memories || [];
    if (!memories.length) {
      list.innerHTML = '<div class="memory-empty">Hazy has no durable memories in this view.</div>';
      return;
    }
    list.innerHTML = memories.map(memory => `
      <div class="memory-item ${memory.status === 'disabled' ? 'is-disabled' : ''}">
        <div class="memory-item-main">
          <div class="memory-item-meta">
            <span>${escapeHtml(memory.type.replaceAll('_', ' '))}</span>
            <span>${escapeHtml(memory.key)}</span>
            <span>${Math.round(Number(memory.confidence || 0) * 100)}% confidence</span>
            ${memory.status === 'disabled' ? '<span>paused</span>' : ''}
          </div>
          <div class="memory-item-value">${escapeHtml(memory.value)}</div>
        </div>
        <div class="memory-actions">
          <button type="button" onclick="setCompanionMemoryStatus('${memory.id}', '${memory.status === 'disabled' ? 'active' : 'disabled'}')">${memory.status === 'disabled' ? 'Restore' : 'Pause'}</button>
          <button type="button" class="memory-delete" onclick="deleteCompanionMemory('${memory.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    list.innerHTML = `<div class="memory-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function addCompanionMemory() {
  const type = document.getElementById('memoryType')?.value || 'explicit_fact';
  const keyInput = document.getElementById('memoryKey');
  const valueInput = document.getElementById('memoryValue');
  const key = keyInput?.value.trim();
  const value = valueInput?.value.trim();
  if (!key || !value) {
    showToast('Add both a short label and the memory value.', 'error');
    return;
  }
  try {
    const response = await fetch('/hazy/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'local-user', type, key, value, confidence: 1 })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not add memory.');
    keyInput.value = '';
    valueInput.value = '';
    showToast('Memory added.', 'success');
    await loadCompanionMemories();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function setCompanionMemoryStatus(id, status) {
  const response = await fetch('/hazy/memories', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, userId: 'local-user', status })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    showToast(result.error || 'Could not update memory.', 'error');
    return;
  }
  await loadCompanionMemories();
}

async function deleteCompanionMemory(id) {
  if (!confirm('Permanently delete this memory?')) return;
  const response = await fetch('/hazy/memories', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, userId: 'local-user' })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    showToast(result.error || 'Could not delete memory.', 'error');
    return;
  }
  showToast('Memory deleted.', '');
  await loadCompanionMemories();
}

// -- ollamaUrl sync between General tab and Models tab ----------
function syncOllamaUrlFields(sourceId) {
  const val = document.getElementById(sourceId)?.value || '';
  const targets = ['ollamaUrl', 'ollamaUrlProvider'].filter(id => id !== sourceId);
  targets.forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
}

// -- Single DOMContentLoaded for ALL v2 additions ---------------
document.addEventListener('DOMContentLoaded', () => {
  // Settings tab clicks
  document.querySelectorAll('.snav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
  });
  document.getElementById('memoryAddBtn')?.addEventListener('click', addCompanionMemory);
  document.getElementById('memoryRefreshBtn')?.addEventListener('click', loadCompanionMemories);
  document.getElementById('memoryShowDisabled')?.addEventListener('change', loadCompanionMemories);

  // Appearance tab - live preview as user changes values
  document.getElementById('settingsFontSize')?.addEventListener('change', e => {
    const customEl = document.getElementById('settingsFontSizeCustom');
    if (customEl) customEl.hidden = e.target.value !== 'custom';
    STATE.fontSize = resolveFontSizeInput();
    applyAppearanceSettings();
  });
  document.getElementById('settingsFontSizeCustom')?.addEventListener('input', () => {
    STATE.fontSize = resolveFontSizeInput();
    applyAppearanceSettings();
  });
  document.getElementById('settingsDensity')?.addEventListener('change', () => {
    STATE.density = document.getElementById('settingsDensity').value;
    applyAppearanceSettings();
  });
  document.getElementById('settingsCodeHighlight')?.addEventListener('change', e => {
    STATE.codeHL = e.target.checked;
    applyAppearanceSettings();
  });
  document.getElementById('settingsMarkdown')?.addEventListener('change', e => {
    STATE.markdown = e.target.checked;
    applyAppearanceSettings();
  });
  // Generation tab - live label updates
  document.getElementById('settingsRepeatPenalty')?.addEventListener('input', e => {
    const lbl = document.getElementById('repeatPenaltyLabel');
    if (lbl) lbl.textContent = parseFloat(e.target.value).toFixed(2);
  });
  document.getElementById('settingsTopP')?.addEventListener('input', e => {
    const lbl = document.getElementById('topPLabel');
    if (lbl) lbl.textContent = parseFloat(e.target.value).toFixed(2);
  });

  // Open settings â†’ init providers panel
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    setTimeout(initProvidersPanel, 80);
  });

  // Save settings â†’ also save active model choice
  const saveBtn = document.getElementById('settingsSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveActiveModelChoice);
  }

  // Sync ollamaUrl fields
  document.getElementById('ollamaUrl')?.addEventListener('input', () => syncOllamaUrlFields('ollamaUrl'));
  document.getElementById('ollamaUrlProvider')?.addEventListener('input', () => syncOllamaUrlFields('ollamaUrlProvider'));

  // Novel Writer tab - active provider change
  document.getElementById('activeProviderSelect')?.addEventListener('change', updateModelDropdown);
});

// ============================================================================
// Phase 0: Computer-Use Agent Confirmation Gate Logic
// ============================================================================

function showConfirmationModal(blockedCall) {
  const modal = document.getElementById('hazy-confirm-modal');
  if (!modal) return;
  
  const contentEl = document.getElementById('hazy-confirm-content');
  if (contentEl) {
    contentEl.innerHTML = `
      <p style="margin-top:0; margin-bottom: 8px;"><strong>Tool Requested:</strong> <code>${escapeHtml(blockedCall.name)}</code></p>
      ${blockedCall.summary ? `<p style="margin-top:0; font-style: italic; color: var(--text-dim);">${escapeHtml(blockedCall.summary)}</p>` : ''}
      <pre style="background: var(--bg-dark); padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; margin-bottom: 0;">${escapeHtml(JSON.stringify(blockedCall.arguments, null, 2))}</pre>
    `;
  }
  
  const denyBtn = document.getElementById('hazy-confirm-deny');
  const allowBtn = document.getElementById('hazy-confirm-allow');
  
  // Clone to remove old listeners
  const newDeny = denyBtn.cloneNode(true);
  const newAllow = allowBtn.cloneNode(true);
  denyBtn.replaceWith(newDeny);
  allowBtn.replaceWith(newAllow);
  
  newDeny.onclick = () => resolveConfirmation(blockedCall, false, modal);
  newAllow.onclick = () => resolveConfirmation(blockedCall, true, modal);
  
  modal.style.display = 'flex';
}

async function resolveConfirmation(blockedCall, approved, modal) {
  modal.style.display = 'none';
  
  if (blockedCall.confirmationId === 'default-browser-session') {
    if (approved) {
      window.hazyBrowserAgent.confirmAction();
    } else {
      window.hazyBrowserAgent.cancelAction();
    }
    return;
  }
  
  const message = approved 
    ? (blockedCall.typedPhrase || "approved") 
    : "no";
  
  try {
    const res = await fetch(hazyServerEndpoint('/hazy/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmationId: blockedCall.confirmationId,
        message
      })
    });
    
    const data = await res.json();
    const conv = conversations.find(c => c.id === STATE.activeConvId);
    if (!conv) return;

    let sysMsg = "";
    if (data.status === 'executed' || data.status === 'executed_after_confirmation') {
      sysMsg = `[System: Action approved. Result: ${JSON.stringify(data.result)}]`;
    } else {
      sysMsg = `[System: Action denied or failed. Status: ${data.status}]`;
    }

    // Push hidden context for the LLM
    conv.messages.push({
      role: 'user', 
      content: sysMsg,
      ts: Date.now(),
      isHidden: true
    });
    saveConversations();

    // Trigger the agent to continue
    const prompt = approved ? "Action approved. Please continue." : "Action denied. Please reconsider.";
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.value = prompt;
      setTimeout(() => {
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) sendBtn.click();
      }, 50);
    }
  } catch (err) {
    appendErrorMessage(`Confirmation failed: ${err.message}`);
  }
}
