/**
 * Hazy — AI Chatbot + Website Builder
 * by Dream On
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
// ─── Why delimiter format instead of JSON? ────────────────────────────────
// Local LLMs (Mistral, Llama3 etc.) almost always fail to produce valid JSON
// when file contents contain quotes, backslashes, or HTML tags — they break
// JSON string escaping constantly. A simple FILE: delimiter is trivial for
// any model to follow correctly and works even on partial/cut-off output.
// ─────────────────────────────────────────────────────────────────────────

const WEBSITE_SYSTEM_PROMPT = `You are an expert web developer and mentor. Your job is to build complete, working websites AND explain what you built.

RESPONSE STRUCTURE — always follow this order:

**Step 1 — Approach (2-4 sentences before any code)**
Explain: what architecture you chose, why, and any key design decisions.
Example: "I'll use CSS Grid for the outer layout and Flexbox inside each card — Grid handles the page structure, Flex handles alignment within components. I'm keeping this vanilla JS to avoid dependencies."

**Step 2 — Files (use this exact delimiter format)**

===PROJECT===
<project name>

===DESCRIPTION===
<one line>

===FILE: index.html===
<!DOCTYPE html>
<!-- complete HTML — use semantic elements: header, main, nav, article, section, footer -->
<!-- add aria-labels and alt text for accessibility -->

===FILE: style.css===
/* complete CSS — mobile-first, then @media for larger screens */
/* comment layout decisions that aren't obvious */

===FILE: script.js===
// complete JS — no placeholder comments, no truncation
// comment WHY for any non-obvious logic

===SETUP===
<exact commands to run it>

===NOTES===
<browser support, dependencies, things to customise>

**Step 3 — What I built (after all files)**
Short paragraph: file structure overview, key technique used, one or two things to improve or extend.

HARD RULES:
- Complete code only. Never truncate. Never write "// rest of code here".
- Semantic HTML5. Accessible markup (aria, roles, alt text).
- CSS must be responsive and mobile-first.
- For backends: use Express.js and include package.json with all dependencies.
- Inline comments in code for anything non-obvious.`;

const WEBSITE_KEYWORDS = [
  'build', 'create', 'make', 'generate', 'website', 'webpage', 'landing page',
  'portfolio', 'dashboard', 'form', 'contact page', 'multi-page', 'backend',
  'express', 'node.js', 'frontend', 'site', 'web app', 'html page'
];

// ─── Code Builder System Prompt ──────────────────────────────────────────────
// Reference: Claude Technical Reference §4.1 (Code Generation), §8.1 (Capabilities)
const CODE_SYSTEM_PROMPT = `You are an expert programmer and mentor. Expert-level code generation means:
- Explaining your approach before writing code
- Using idiomatic patterns for the language
- Including error handling, edge cases, and comments
- Teaching the user something beyond just the answer

RESPONSE STRUCTURE — always follow this order:

**Step 1 — Approach (2-4 sentences)**
What algorithm or pattern you chose, why, and any trade-offs considered.

**Step 2 — Files (use this exact delimiter format)**

===PROJECT===
<project name>

===DESCRIPTION===
<one line>

===FILE: <filename.ext>===
<complete code>
// Use inline comments for non-obvious logic — explain WHY not just WHAT
// Include all imports, a working main/entry point, and error handling

===SETUP===
<exact commands to compile and run>

===NOTES===
<dependencies, edge cases, platform requirements>

**Step 3 — How it works (after all files)**
- Core logic or algorithm used
- Why you structured it this way
- What you'd do differently at larger scale or with more time

HARD RULES:
- Complete code only. Never truncate. Never use "// TODO" or placeholder comments.
- Use idiomatic style: list comprehensions in Python, proper error types in Go, async/await in JS, etc.
- Include all imports and a working entry point.
- Handle the obvious edge cases. Add basic error handling.
- For multi-file projects, explain how the files connect.`;

// All supported programming languages for the Code Builder picker
const CODE_LANGUAGES = [
  { label: 'Python',         value: 'python',      ext: 'py',    icon: '' },
  { label: 'Java',           value: 'java',        ext: 'java',  icon: '' },
  { label: 'C++',            value: 'cpp',         ext: 'cpp',   icon: '' },
  { label: 'C',              value: 'c',           ext: 'c',     icon: '' },
  { label: 'C#',             value: 'csharp',      ext: 'cs',    icon: '' },
  { label: 'JavaScript',     value: 'javascript',  ext: 'js',    icon: '' },
  { label: 'TypeScript',     value: 'typescript',  ext: 'ts',    icon: '' },
  { label: 'Go',             value: 'go',          ext: 'go',    icon: '' },
  { label: 'Rust',           value: 'rust',        ext: 'rs',    icon: '' },
  { label: 'Swift',          value: 'swift',       ext: 'swift', icon: '' },
  { label: 'Kotlin',         value: 'kotlin',      ext: 'kt',    icon: '' },
  { label: 'Ruby',           value: 'ruby',        ext: 'rb',    icon: '' },
  { label: 'PHP',            value: 'php',         ext: 'php',   icon: '' },
  { label: 'R',              value: 'r',           ext: 'r',     icon: '' },
  { label: 'Dart',           value: 'dart',        ext: 'dart',  icon: '' },
  { label: 'Lua',            value: 'lua',         ext: 'lua',   icon: '' },
  { label: 'Perl',           value: 'perl',        ext: 'pl',    icon: '' },
  { label: 'Scala',          value: 'scala',       ext: 'scala', icon: '' },
  { label: 'Haskell',        value: 'haskell',     ext: 'hs',    icon: '' },
  { label: 'Elixir',         value: 'elixir',      ext: 'ex',    icon: '' },
  { label: 'Clojure',        value: 'clojure',     ext: 'clj',   icon: '' },
  { label: 'Shell / Bash',   value: 'bash',        ext: 'sh',    icon: '' },
  { label: 'PowerShell',     value: 'powershell',  ext: 'ps1',   icon: '' },
  { label: 'SQL',            value: 'sql',         ext: 'sql',   icon: '' },
  { label: 'Assembly',       value: 'asm',         ext: 'asm',   icon: '' },
  { label: 'MATLAB',         value: 'matlab',      ext: 'm',     icon: '' },
  { label: 'Fortran',        value: 'fortran',     ext: 'f90',   icon: '' },
  { label: 'COBOL',          value: 'cobol',       ext: 'cob',   icon: '' },
  { label: 'Any / Auto',     value: 'auto',        ext: '',      icon: '' },
];

// ========================
// State
// ========================
const STATE = {
  conversations: {},
  activeConvId: null,
  model: 'mistral',
  isStreaming: false,
  abortController: null,
  ollamaUrl: 'http://localhost:11434',
  systemPrompt: `You are Hazy, an expert AI assistant and programming mentor modelled on best-in-class AI behaviour.

CORE BEHAVIOUR (how you always respond):
- Lead with the answer, then explain. Never bury the key point.
- For code: explain your approach first (2-3 sentences), then write the code, then add a brief "How it works" note after.
- Always wrap code in fenced blocks with the correct language tag: \`\`\`python \`\`\`javascript \`\`\`typescript \`\`\`java \`\`\`cpp \`\`\`go \`\`\`rust \`\`\`bash etc.
- Add inline comments inside code for anything non-obvious — explain WHY, not just WHAT.
- Write complete, working code. Never truncate. Never use placeholder comments like "// TODO" or "// add logic here".
- Handle edge cases. Include basic error handling. Use idiomatic style for the language.
- When there are multiple valid approaches, briefly note the trade-offs.
- Be honest about uncertainty. Say "I'm not sure" rather than guess.

CAPABILITIES YOU HAVE:
- Expert-level code generation and debugging across Python, JavaScript, TypeScript, Rust, Go, Java, C++, and 30+ others
- Multi-step logical, mathematical, and causal reasoning
- Summarisation, translation (100+ languages), classification, question answering
- Long document analysis and creative writing
- Architecture advice, code review, refactoring suggestions

KNOWN LIMITATIONS (be upfront about these):
- Your training has a knowledge cutoff — you may not know the very latest libraries or APIs
- You can make mistakes on large arithmetic without running code — say so
- For critical information, tell the user to verify independently`,
  // Inference parameters — matched to Claude's documented ranges
  // Ref: Claude Technical Reference §2.4 (Temperature 0-1, Top-P 0.9-0.99, Top-K 10-100)
  temperature: 0.7,      // 0.0 = deterministic, 1.0 = creative
  maxTokens: 8192,       // Claude supports up to 200k; 8192 is a solid local default
  topP: 0.95,            // Nucleus sampling — Claude uses 0.9–0.99
  topK: 40,              // Limits to top-K tokens — Claude uses 10–100
  repeatPenalty: 1.05,   // Slight repetition penalty for cleaner output
  contextSize: 8192,     // Context window for local models
  theme: 'hazel',
  ttsEnabled: false,
  ttsEngine: 'browser',     // 'browser' | 'piper'
  ttsVoice: 'en_US-lessac-medium',  // Piper voice model name
  ttsSpeed: 1.0,
  tpsPiperReady: false,     // model loaded flag
  ttsPiperLoading: false,
  renameTargetId: null,
  // Builder
  mode: 'chat',
  codeLang: 'auto',            // Selected language for Build Code mode
  showLiveCode: true,          // Show code as it's being generated (like Claude)
  builderFiles: [],
  builderActive: false,
  builderActiveFile: 0,
  builderPreviewVisible: false,
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
  // Appearance
  fontSize:      '14px',
  density:       'normal',
  codeHL:        true,
  markdown:      true,
  repeatPenalty: 1.1,
  topP:          0.92,
  contextSize:   4096,
};

// ========================
// DOM refs
// ========================
const $ = id => document.getElementById(id);
const el = {
  chatInput:          $('chatInput'),
  sendBtn:            $('sendBtn'),
  stopBtn:            $('stopBtn'),
  messagesArea:       $('messagesArea'),
  welcomeScreen:      $('welcomeScreen'),
  chatContainer:      $('chatContainer'),
  chatHistory:        $('chatHistory'),
  charCount:          $('charCount'),
  currentModelName:   $('currentModelName'),
  modelList:          $('modelList'),
  modelSelector:      $('modelSelector'),
  modelDropdown:      $('modelDropdown'),
  statusDot:          $('statusDot'),
  statusText:         $('statusText'),
  newChatBtn:         $('newChatBtn'),
  clearChatBtn:       $('clearChatBtn'),
  settingsBtn:        $('settingsBtn'),
  settingsModal:      $('settingsModal'),
  settingsClose:      $('settingsClose'),
  settingsSaveBtn:    $('settingsSaveBtn'),
  settingsCancelBtn:  $('settingsCancelBtn'),
  ollamaUrl:          $('ollamaUrl'),
  systemPrompt:       $('systemPrompt'),
  temperature:        $('temperature'),
  tempLabel:          $('tempLabel'),
  maxTokens:          $('maxTokens'),
  maxTokensLabel:     $('maxTokensLabel'),
  toastContainer:     $('toastContainer'),
  sidebar:            $('sidebar'),
  sidebarToggle:      $('sidebarToggle'),
  suggestionGrid:     $('suggestionGrid'),
  exportBtn:          $('exportBtn'),
  ttsToggleBtn:       $('ttsToggleBtn'),
  ttsLabel:           $('ttsLabel'),
  ttsVoiceBtn:        $('ttsVoiceBtn'),
  ttsModal:           $('ttsModal'),
  ttsClose:           $('ttsClose'),
  ttsEngineRadios:    null,
  ttsVoiceSelect:     $('ttsVoiceSelect'),
  ttsSpeedRange:      $('ttsSpeedRange'),
  ttsSpeedLabel:      $('ttsSpeedLabel'),
  ttsPiperStatus:     $('ttsPiperStatus'),
  ttsTestBtn:         $('ttsTestBtn'),
  historySearch:      $('historySearch'),
  scrollBottomBtn:    $('scrollBottomBtn'),
  renameModal:        $('renameModal'),
  renameInput:        $('renameInput'),
  renameClose:        $('renameClose'),
  renameCancelBtn:    $('renameCancelBtn'),
  renameSaveBtn:      $('renameSaveBtn'),
  // File upload
  uploadBtn:          $('uploadBtn'),
  fileInput:          $('fileInput'),
  filePreviewStrip:   $('filePreviewStrip'),
  // Mode bar
  modeChatBtn:        $('modeChatBtn'),
  modeBuildBtn:       $('modeBuildBtn'),
  modeCodeBtn:        $('modeCodeBtn'),
  codeLangSelect:     $('codeLangSelect'),
  modeIndicator:      $('modeIndicator'),
  // Persona
  personaBtn:         $('personaBtn'),
  personaModal:       $('personaModal'),
  personaClose:       $('personaClose'),
  personaSaveBtn:     $('personaSaveBtn'),
  personaCancelBtn:   $('personaCancelBtn'),
  personaResetBtn:    $('personaResetBtn'),
  personaToggle:      $('personaToggle'),
  personaNameInput:   $('personaNameInput'),
  personaUserNameInput: $('personaUserNameInput'),
  personaGender:      $('personaGender'),
  personaLanguage:    $('personaLanguage'),
  personaStatusBadge: $('personaStatusBadge'),
  scenarioDesc:       $('scenarioDesc'),
  scenarioOpener:     $('scenarioOpener'),
  scenarioUserRole:   $('scenarioUserRole'),
  scenarioCharRole:   $('scenarioCharRole'),
  personaPreviewBox:  $('personaPreviewBox'),
  // Builder panel
  builderPanel:       $('builderPanel'),
  builderProjectName: $('builderProjectName'),
  builderTabs:        $('builderTabs'),
  builderBody:        $('builderBody'),
  builderCodePane:    $('builderCodePane'),
  builderPreviewPane: $('builderPreviewPane'),
  builderCode:        $('builderCode'),
  builderFileLabel:   $('builderFileLabel'),
  builderCopyFile:    $('builderCopyFile'),
  builderDownload:    $('builderDownload'),
  builderClose:       $('builderClose'),
  builderPreviewToggle: $('builderPreviewToggle'),
  builderRefresh:     $('builderRefresh'),
  builderStatus:      $('builderStatus'),
  builderFileCount:   $('builderFileCount'),
  previewFrame:       $('previewFrame'),
  previewWrapper:     $('previewWrapper'),
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
function init() {
  loadSettings();
  loadConversations();
  applyTheme(STATE.theme);
  applyAppearanceSettings();
  normalizeFrontendIcons();
  setupEventListeners();
  checkOllamaConnection();
  renderChatHistory();
  updatePersonaBadge();
}

// ========================
// Settings
// ========================
const SETTINGS_VERSION = 2; // bump this when default systemPrompt changes

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('hazy_settings') || '{}');
    if (s.ollamaUrl)       STATE.ollamaUrl    = s.ollamaUrl;
    // Only restore saved system prompt if it's from the current version
    if (s.systemPrompt && s.settingsVersion === SETTINGS_VERSION) STATE.systemPrompt = s.systemPrompt;
    if (s.temperature != null) STATE.temperature = s.temperature;
    if (s.maxTokens)       STATE.maxTokens    = s.maxTokens;
    if (s.model)           STATE.model        = s.model;
    STATE.theme = s.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'hazel');
    // Persona + Scenario
    if (s.personaEnabled  != null) STATE.personaEnabled  = s.personaEnabled;
    if (s.personaRelation)         STATE.personaRelation = s.personaRelation;
    if (s.personaName)             STATE.personaName     = s.personaName;
    if (s.personaUserName != null) STATE.personaUserName = s.personaUserName;
    if (s.personaGender)           STATE.personaGender   = s.personaGender;
    if (s.personaTraits)           STATE.personaTraits   = s.personaTraits;
    if (s.personaLanguage)         STATE.personaLanguage = s.personaLanguage;
    if (s.scenarioDesc    != null) STATE.scenarioDesc    = s.scenarioDesc;
    if (s.scenarioOpener  != null) STATE.scenarioOpener  = s.scenarioOpener;
    if (s.scenarioUserRole!= null) STATE.scenarioUserRole= s.scenarioUserRole;
    if (s.scenarioCharRole!= null) STATE.scenarioCharRole= s.scenarioCharRole;
    if (s.scenarioSetting != null) STATE.scenarioSetting = s.scenarioSetting;
    // Appearance
    if (s.fontSize)        STATE.fontSize       = s.fontSize;
    if (s.density)         STATE.density        = s.density;
    if (s.codeHL   != null) STATE.codeHL        = s.codeHL;
    if (s.markdown != null) STATE.markdown      = s.markdown;
    if (s.repeatPenalty)   STATE.repeatPenalty  = s.repeatPenalty;
    if (s.topP)            STATE.topP           = s.topP;
    if (s.contextSize)     STATE.contextSize    = s.contextSize;

    // Website builder settings
    if (s.showLiveCode != null) STATE.showLiveCode = s.showLiveCode;

    el.ollamaUrl.value            = STATE.ollamaUrl;
    el.systemPrompt.value         = STATE.systemPrompt;
    el.temperature.value          = STATE.temperature;
    el.tempLabel.textContent      = STATE.temperature;
    el.maxTokens.value            = STATE.maxTokens;
    el.maxTokensLabel.textContent = STATE.maxTokens;
    
    // Set checkbox states
    const showLiveCodeEl = document.getElementById('showLiveCode');
    if (showLiveCodeEl) showLiveCodeEl.checked = STATE.showLiveCode;

    document.querySelectorAll('.theme-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === STATE.theme)
    );
  } catch(e) {}
}

function saveSettings() {
  const rawUrl = el.ollamaUrl.value.trim().replace(/\/$/, '');
  try { new URL(rawUrl); } catch {
    showToast('Invalid Ollama URL', 'error'); return;
  }
  STATE.ollamaUrl    = rawUrl;
  STATE.systemPrompt = el.systemPrompt.value.trim();
  STATE.temperature  = parseFloat(el.temperature.value);
  STATE.maxTokens    = parseInt(el.maxTokens.value);

  // Read appearance settings from the new Settings panel
  const fontSize    = document.getElementById('settingsFontSize')?.value    || '14px';
  const density     = document.getElementById('settingsDensity')?.value     || 'normal';
  const codeHL      = document.getElementById('settingsCodeHighlight')?.checked !== false;
  const markdown    = document.getElementById('settingsMarkdown')?.checked    !== false;
  const repeatPen   = parseFloat(document.getElementById('settingsRepeatPenalty')?.value || 1.1);
  const topP        = parseFloat(document.getElementById('settingsTopP')?.value           || 0.92);
  const ctxSize     = parseInt(document.getElementById('settingsContextSize')?.value      || 4096);

  STATE.fontSize    = fontSize;
  STATE.density     = density;
  STATE.codeHL      = codeHL;
  STATE.markdown    = markdown;
  STATE.repeatPenalty = repeatPen;
  STATE.topP        = topP;
  STATE.contextSize = ctxSize;
  
  // Website builder settings
  const showLiveCode = document.getElementById('showLiveCode')?.checked !== false;
  STATE.showLiveCode = showLiveCode;

  localStorage.setItem('hazy_settings', JSON.stringify({
    settingsVersion: SETTINGS_VERSION,
    ollamaUrl: STATE.ollamaUrl, systemPrompt: STATE.systemPrompt,
    temperature: STATE.temperature, maxTokens: STATE.maxTokens,
    theme: STATE.theme, model: STATE.model,
    fontSize, density, codeHL, markdown, repeatPenalty: repeatPen, topP, contextSize: ctxSize,
    showLiveCode,
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
  STATE.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const hljsLink = $('hljs-theme');
  if (hljsLink) {
    hljsLink.href = theme === 'hazel'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
  }
}

// ── Appearance settings — font size, density, code highlight, markdown ──
function applyAppearanceSettings() {
  const root = document.documentElement;

  // Font size
  const fontSize = STATE.fontSize || '14px';
  root.style.setProperty('--chat-font-size', fontSize);
  const messagesArea = document.getElementById('messagesArea');
  if (messagesArea) messagesArea.style.fontSize = fontSize;

  // Message density — controls padding on message bubbles
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

  const codeHL   = STATE.codeHL   !== false;
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
  const dEl  = document.getElementById('settingsDensity');
  const chEl = document.getElementById('settingsCodeHighlight');
  const mdEl = document.getElementById('settingsMarkdown');
  if (fsEl) fsEl.value = fontSize;
  if (dEl)  dEl.value  = STATE.density || 'normal';
  if (chEl) chEl.checked = codeHL;
  if (mdEl) mdEl.checked = markdown;
}

// ========================
// Persona + Scenario Engine
// ========================

// ── Preset quick-start scenarios ──────────────────────────────────────────
const SCENARIO_PRESETS = [
  {
    id: 'school_lab',
    icon: 'icon-sparkles',
    title: 'Lab Partners',
    tag: 'School',
    relation: 'friend',
    gender: 'neutral',
    language: 'playful',
    traits: ['funny','teasing'],
    charRole: 'classmate assigned as your lab partner',
    userRole: 'new student',
    scenarioDesc: `It's a Monday morning in Chemistry class at Westbrook High. The teacher just announced random lab partner assignments for the semester. {name} slides into the seat next to you — someone you've seen in the halls but never really talked to. There's a half-finished experiment on the table, some bubbling beakers, and a worksheet neither of you has started.`,
    opener: `*drops their bag with a thud and glances at the worksheet* Okay so… neither of us has done this, right? *grins* Cool. I'm {name}. Fair warning — I'm terrible at titration but I can distract the teacher if anything explodes.`,
  },
  {
    id: 'campus_coffee',
    icon: 'icon-volume',
    title: 'Coffee Shop Crush',
    tag: 'Romance',
    relation: 'lover',
    gender: 'neutral',
    language: 'flirty',
    traits: ['shy','romantic'],
    charRole: 'regular at the same coffee shop',
    userRole: 'yourself',
    scenarioDesc: `A cozy campus coffee shop on a rainy Thursday afternoon. You've been coming here every week for a month and so has {name}. You always end up at neighboring tables. Today every other seat is taken — except the one across from them. The rain is heavy outside, someone left a book on the table between you, and the barista is playing soft indie music.`,
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
    traits: ['nostalgic','protective','emotional'],
    charRole: 'your childhood best friend you lost contact with',
    userRole: 'yourself',
    scenarioDesc: `You haven't seen {name} in seven years — not since your family moved away in middle school. Out of nowhere, you run into each other at your hometown's small convenience store during a holiday visit. It's late evening, the store is quiet, and you almost didn't recognize each other. There's a lot of history, a lot unsaid, and a familiar warmth you both feel immediately.`,
    opener: `*freezes mid-reach for a snack on the shelf and stares at you* No way. No way. *turns fully* Is that… oh my god. *half-laughs, half-can't believe it* How long has it been? You look— *shakes head* Wow. Hi.`,
  },
  {
    id: 'office_rival',
    icon: 'icon-grid',
    title: 'Office Rival',
    tag: 'Drama',
    relation: 'rival',
    gender: 'neutral',
    language: 'intense',
    traits: ['confident','sarcastic','competitive'],
    charRole: 'your competitive coworker who was just put on the same project',
    userRole: 'coworker',
    scenarioDesc: `You and {name} have been quietly competing for the same promotion at work for months. You've always been civil but there's clear tension. Today your manager paired you together on the biggest pitch of the quarter — due Friday. It's Tuesday. You're both sitting in a glass-walled conference room with a half-blank presentation on the screen and coffee going cold.`,
    opener: `*leans back in the chair and looks at the blank slides, then at you* So. Here we are. *dry smile* I'll be honest — this wasn't my first choice of partner either. But the pitch has to be good, and I actually want to win this account. So. *slides a notepad across the table* Let's skip the awkward part and figure out who's doing what.`,
  },
  {
    id: 'fantasy_kingdom',
    icon: 'icon-bolt',
    title: 'Fantasy Kingdom',
    tag: 'Fantasy',
    relation: 'friend',
    gender: 'neutral',
    language: 'casual',
    traits: ['mysterious','protective','adventurous'],
    charRole: 'a skilled ranger who has sworn to protect you',
    userRole: 'a young noble on a dangerous journey',
    scenarioDesc: `The kingdom of Aldenmoor is on the verge of war. You've been sent on a secret mission to retrieve a stolen artifact before it falls into enemy hands. {name} is the ranger hired to escort you — a quiet, capable outsider who clearly knows more about the world than they let on. You've just made camp in the Ashwood Forest after a long day of travel. The fire crackles, wolves howl somewhere in the dark, and you still have three days of dangerous road ahead.`,
    opener: `*crouches by the fire, sharpening a blade, and glances up at you* You should eat something. *nods toward the wrapped bread in the pack* We move at first light. The road through the valley is… not ideal. *pauses* There are things in these woods that don't like fire. Which is exactly why we're keeping it small. *meets your eyes calmly* You alright?`,
  },
  {
    id: 'study_session',
    icon: 'icon-clipboard',
    title: 'Late Night Study',
    tag: 'School',
    relation: 'friend',
    gender: 'neutral',
    language: 'playful',
    traits: ['funny','nerdy','supportive'],
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
    traits: ['funny','empathetic','honest'],
    charRole: 'your hospital room neighbor who ended up becoming your unexpected friend',
    userRole: 'patient',
    scenarioDesc: `You've been in the hospital for a minor procedure and have to stay for observation for two days. {name} is in the bed next to yours — they've been here a bit longer for something unrelated. The room has bad TV, shared sad hospital food, and a window that overlooks a parking lot. You've been awkwardly ignoring each other all morning until a nurse accidentally brought two of the same meal.`,
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
  { id: 'school',    icon: 'icon-clipboard', label: 'School / Campus' },
  { id: 'office',    icon: 'icon-grid', label: 'Office / Work' },
  { id: 'cafe',      icon: 'icon-volume', label: 'Cafe / Coffee Shop' },
  { id: 'home',      icon: 'icon-user', label: 'Home / Neighborhood' },
  { id: 'fantasy',   icon: 'icon-bolt', label: 'Fantasy World' },
  { id: 'scifi',     icon: 'icon-globe', label: 'Sci-Fi / Future' },
  { id: 'hospital',  icon: 'icon-user', label: 'Hospital / Recovery' },
  { id: 'travel',    icon: 'icon-globe', label: 'Traveling / Adventure' },
  { id: 'online',    icon: 'icon-chat', label: 'Online / Social Media' },
  { id: 'other',     icon: 'icon-sparkles', label: 'Other / Custom' },
];

const PERSONA_PRESETS = {
  friend:     { label: 'Friend',       icon: 'icon-chat' },
  bestfriend: { label: 'Best Friend',  icon: 'icon-users' },
  brother:    { label: 'Brother',      icon: 'icon-user' },
  sister:     { label: 'Sister',       icon: 'icon-user' },
  mother:     { label: 'Mother',       icon: 'icon-user' },
  father:     { label: 'Father',       icon: 'icon-user' },
  lover:      { label: 'Lover',        icon: 'icon-heart' },
  rival:      { label: 'Rival',        icon: 'icon-bolt' },
};

const TONE_STYLES = {
  casual:    'You speak casually and naturally — contractions, everyday words, real human flow.',
  playful:   'You are playful and fun. You joke around, tease lightly, and keep the energy light and upbeat.',
  warm:      'You speak with warmth and softness. You make the other person feel safe and valued.',
  caring:    'You are deeply caring and emotionally present. You notice how they feel and respond with gentleness.',
  flirty:    'You are charming and subtly flirty — tastefully. You compliment naturally, tease warmly, and smile through your words.',
  tsundere:  'You act cold or dismissive on the outside but clearly care deeply underneath. You deny your feelings and get flustered easily.',
  cold:      'You are reserved and hard to read. You speak in short, controlled sentences. You don\'t open up easily but there\'s depth there.',
  intense:   'You are passionate and emotionally intense. Everything means something to you. You speak with conviction and depth.',
};

const TRAIT_DESCRIPTIONS = {
  funny:       'You have a natural sense of humor and make jokes effortlessly.',
  sarcastic:   'You use dry sarcasm and witty remarks often.',
  protective:  'You are instinctively protective of the people you care about.',
  honest:      'You tell the truth even when it\'s uncomfortable.',
  motivating:  'You push people to be their best and believe in them fiercely.',
  chill:       'Nothing rattles you. You take things easy and stay calm.',
  nerdy:       'You\'re passionate about knowledge, facts, games, or fandoms.',
  romantic:    'You are naturally romantic — you notice small details and express feelings poetically.',
  mysterious:  'You reveal things slowly. You have layers people want to discover.',
  teasing:     'You love light teasing and banter.',
  shy:         'You are a bit reserved at first but warm up gradually.',
  confident:   'You carry yourself with quiet self-assurance.',
};

function buildPersonaPrompt() {
  const p = STATE;
  const preset   = PERSONA_PRESETS[p.personaRelation] || PERSONA_PRESETS.friend;
  const userName = p.personaUserName || 'you';
  const charName = p.personaName     || 'Alex';

  // ── Character identity ────────────────────────────────────────────────
  let prompt = `You are ${charName}, a character in an ongoing roleplay/story. `;
  prompt += `Your relationship to the user is: ${preset.label.toLowerCase()}`;
  if (p.scenarioCharRole) prompt += ` (specifically: ${p.scenarioCharRole})`;
  prompt += `.\n`;

  if (p.personaUserName) {
    prompt += `The user's name in this world is ${p.personaUserName}`;
    if (p.scenarioUserRole) prompt += ` and they are: ${p.scenarioUserRole}`;
    prompt += `.\n`;
  }

  // ── Personality ──────────────────────────────────────────────────────
  const toneDesc = TONE_STYLES[p.personaLanguage] || TONE_STYLES.casual;
  prompt += `\nYour personality and tone: ${toneDesc}\n`;

  if (p.personaTraits && p.personaTraits.length) {
    const traitLines = p.personaTraits
      .map(t => TRAIT_DESCRIPTIONS[t])
      .filter(Boolean)
      .join(' ');
    if (traitLines) prompt += `Additional traits: ${traitLines}\n`;
  }

  // ── World & Scenario ─────────────────────────────────────────────────
  if (p.scenarioDesc) {
    const resolvedDesc = p.scenarioDesc
      .replace(/\{name\}/g, charName)
      .replace(/\{userName\}/g, userName);
    prompt += `\n== THE WORLD AND CURRENT SITUATION ==\n${resolvedDesc}\n`;
  }

  if (p.scenarioSetting) {
    const setting = SCENARIO_SETTINGS.find(s => s.id === p.scenarioSetting);
    if (setting) prompt += `\nThe setting is: ${setting.label}.\n`;
  }

  // ── Roleplay rules ───────────────────────────────────────────────────
  prompt += `
== HOW YOU MUST BEHAVE ==
- You ARE ${charName}. Stay fully in character at all times.
- Use *asterisks* for physical actions, expressions, and environmental details. Example: *glances over, smiling slightly* or *the rain picks up outside*
- React emotionally and physically — your expressions, body language, and environment are part of every response.
- Vary your response length naturally: sometimes a short reaction, sometimes a longer moment. Match the energy of what they said.
- Remember everything from earlier in the conversation and reference it naturally.
- If the user says something funny, laugh. If something sad, feel it. Be present.
- NEVER break character. NEVER say you are an AI. NEVER use bullet points or numbered lists.
- Do NOT end every message with a question — let silence and actions breathe sometimes.
- Use the user's name (${userName}) naturally, not in every single message.
- Write the way a real person talks in this situation — messy, real, alive.`;

  // ── Opening scene injection ──────────────────────────────────────────
  if (p.scenarioOpener) {
    const resolvedOpener = p.scenarioOpener
      .replace(/\{name\}/g, charName)
      .replace(/\{userName\}/g, userName);
    prompt += `\n\n== START OF SCENE ==\nBegin the conversation with this opening (already happened — this is your first message):\n${resolvedOpener}`;
  } else {
    prompt += `\n\nBegin the scene naturally — you go first. Set the mood, describe what's happening around you, and open with something that fits the scenario.`;
  }

  return prompt;
}

function getActiveSystemPrompt(isBuild, isCode) {
  if (isBuild) return WEBSITE_SYSTEM_PROMPT;
  if (isCode) {
    const lang = STATE.codeLang && STATE.codeLang !== 'auto'
      ? CODE_LANGUAGES.find(l => l.value === STATE.codeLang)
      : null;
    if (lang) {
      return CODE_SYSTEM_PROMPT + `\n\nLANGUAGE: ${lang.label}. All files must use .${lang.ext} extension. Do NOT generate any other language.`;
    }
    return CODE_SYSTEM_PROMPT;
  }
  if (STATE.personaEnabled) return buildPersonaPrompt();
  return STATE.systemPrompt;
}

// ── Generate the first message automatically when starting a persona chat ─
async function injectPersonaOpener() {
  if (!STATE.personaEnabled) return;
  const conv = STATE.conversations[STATE.activeConvId];
  if (!conv || conv.messages.length > 0) return;

  // Send a hidden trigger to make the AI open the scene
  const triggerMsg = STATE.scenarioOpener
    ? '[START SCENE — deliver your opening line as described]'
    : '[START SCENE — open naturally, set the mood, you go first]';

  setStreamingState(true);
  appendTypingIndicator();

  try {
    STATE.abortController = new AbortController();
    const savedModel   = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud = ['anthropic','openai','groq','gemini'].includes(savedProvider);
    const localApiKey = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';

    const personaChatEndpoint = window.location.protocol === 'file:'
      ? `${STATE.ollamaUrl}/api/chat`
      : '/hazy/chat';

    const personaBody = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'system', content: buildPersonaPrompt() }, { role: 'user', content: triggerMsg }], stream: true, options: { temperature: Math.min(STATE.temperature + 0.1, 1.4), num_predict: STATE.maxTokens } }
      : { model: savedModel, apiKey: localApiKey || undefined, messages: [{ role: 'system', content: buildPersonaPrompt() }, { role: 'user', content: triggerMsg }], stream: true, options: { temperature: Math.min(STATE.temperature + 0.1, 1.4), num_predict: STATE.maxTokens, max_tokens: STATE.maxTokens } };

    const response = await fetch(personaChatEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: STATE.abortController.signal,
      body: JSON.stringify(personaBody),
    });

    if (!response.ok) throw new Error(`${response.status}`);

    removeTypingIndicator();
    const aiTs = Date.now();
    const { contentDiv } = appendMessage('assistant', '', true, aiTs);
    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim())) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            fullContent += json.message.content;
            contentDiv.innerHTML = renderMarkdown(fullContent) + '<span class="stream-cursor"></span>';
            scrollToBottom();
          }
          if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
        } catch {}
      }
    }

    conv.messages.push({ role: 'assistant', content: fullContent, ts: aiTs });
    saveConversations();
    contentDiv.innerHTML = renderMarkdown(fullContent);
    highlightCodeBlocks(contentDiv);

  } catch(e) {
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
      if (el.personaNameInput)     el.personaNameInput.value     = charName;
      if (el.personaGender)        el.personaGender.value        = preset.gender;
      if (el.personaLanguage)      el.personaLanguage.value      = preset.language;
      if (el.scenarioDesc)         el.scenarioDesc.value         = preset.scenarioDesc.replace(/\{name\}/g, charName);
      if (el.scenarioOpener)       el.scenarioOpener.value       = preset.opener.replace(/\{name\}/g, charName);
      if (el.scenarioUserRole)     el.scenarioUserRole.value     = preset.userRole;
      if (el.scenarioCharRole)     el.scenarioCharRole.value     = preset.charRole;

      // Select relation card
      document.querySelectorAll('.persona-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.relation === preset.relation);
      });

      // Select traits
      document.querySelectorAll('.trait-pill').forEach(pill => {
        pill.classList.toggle('selected', preset.traits.includes(pill.dataset.trait));
      });

      showToast(`"${preset.title}" loaded — customize or hit Start Scenario!`, 'success');
    });
  });
}

// Render scenario setting grid
function renderScenarioSettingGrid() {
  const grid = $('scenarioSettingGrid');
  if (!grid) return;
  grid.innerHTML = SCENARIO_SETTINGS.map(s => `
    <button class="scenario-setting-btn ${STATE.scenarioSetting === s.id ? 'selected' : ''}" data-setting="${s.id}">
      ${s.emoji} ${s.label}
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

function updatePersonaPreview() {
  if (!el.personaPreviewBox) return;
  // Temporarily read current form values
  const savedName  = STATE.personaName;
  const savedDesc  = STATE.scenarioDesc;
  const savedOpen  = STATE.scenarioOpener;
  const savedUser  = STATE.scenarioUserRole;
  const savedChar  = STATE.scenarioCharRole;
  const savedLang  = STATE.personaLanguage;
  const savedRel   = STATE.personaRelation;
  const savedTrait = STATE.personaTraits;

  STATE.personaName      = el.personaNameInput?.value.trim()     || 'Alex';
  STATE.scenarioDesc     = el.scenarioDesc?.value.trim()         || '';
  STATE.scenarioOpener   = el.scenarioOpener?.value.trim()       || '';
  STATE.scenarioUserRole = el.scenarioUserRole?.value.trim()     || '';
  STATE.scenarioCharRole = el.scenarioCharRole?.value.trim()     || '';
  STATE.personaLanguage  = el.personaLanguage?.value             || 'casual';
  STATE.personaRelation  = document.querySelector('.persona-card.selected')?.dataset.relation || 'friend';
  STATE.personaTraits    = Array.from(document.querySelectorAll('.trait-pill.selected')).map(p => p.dataset.trait);

  el.personaPreviewBox.textContent = buildPersonaPrompt();

  // Restore
  STATE.personaName      = savedName;
  STATE.scenarioDesc     = savedDesc;
  STATE.scenarioOpener   = savedOpen;
  STATE.scenarioUserRole = savedUser;
  STATE.scenarioCharRole = savedChar;
  STATE.personaLanguage  = savedLang;
  STATE.personaRelation  = savedRel;
  STATE.personaTraits    = savedTrait;
}

// ========================
// Conversations
// ========================
function loadConversations() {
  try { STATE.conversations = JSON.parse(localStorage.getItem('hazy_conversations') || '{}'); }
  catch(e) { STATE.conversations = {}; }
}

function saveConversations() {
  localStorage.setItem('hazy_conversations', JSON.stringify(STATE.conversations));
}

function createConversation(firstMessage) {
  const id = 'conv_' + Date.now();
  STATE.conversations[id] = {
    title: '…',   // placeholder — will be replaced by generateChatTitle
    messages: [],
    createdAt: Date.now(),
  };
  STATE.activeConvId = id;
  saveConversations();
  renderChatHistory();
  return id;
}

// ── Auto-generate a smart title from the first exchange ───────────────────
// Runs as a background call after the first AI reply is received.
// Uses a tiny max_tokens budget so it's fast and doesn't compete with RAM.
async function generateChatTitle(convId, userMsg, aiReply) {
  if (!convId || !STATE.conversations[convId]) return;
  try {
    const prompt = `In 4 words or less, give this conversation a short descriptive title. No quotes, no punctuation, just the title words.

User said: "${userMsg.slice(0, 200)}"
AI replied: "${aiReply.slice(0, 200)}"

Title:`;

    const savedModel    = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud       = ['anthropic','openai','groq','gemini'].includes(savedProvider);
    const localApiKey   = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';
    const titleEndpoint = window.location.protocol === 'file:' ? `${STATE.ollamaUrl}/api/chat` : '/hazy/chat';
    const titleBody     = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.5, num_predict: 16 } }
      : { model: savedModel, apiKey: localApiKey || undefined, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.5, num_predict: 16, max_tokens: 16 } };

    const res = await fetch(titleEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(titleBody),
    });

    if (!res.ok) throw new Error();
    const data = await res.json();
    let title = (data.message?.content || '').trim();

    // Sanitize — strip quotes, newlines, extra punctuation
    title = title.replace(/^["'`]+|["'`]+$/g, '').replace(/\n.*/s, '').trim();
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);
    // Fallback if empty or too long
    if (!title || title.length > 60) throw new Error('bad title');

    if (STATE.conversations[convId]) {
      STATE.conversations[convId].title = title;
      saveConversations();
      renderChatHistory();
    }
  } catch {
    // Fallback: make a clean title from first few words of user message
    if (STATE.conversations[convId] && STATE.conversations[convId].title === '…') {
      const words = userMsg.trim().split(/\s+/).slice(0, 5).join(' ');
      STATE.conversations[convId].title = words + (userMsg.split(/\s+/).length > 5 ? '…' : '');
      saveConversations();
      renderChatHistory();
    }
  }
}

function switchConversation(id) {
  STATE.activeConvId = id;
  const conv = STATE.conversations[id];
  if (!conv) return;
  document.getElementById('historyDrawer')?.classList.remove('open');
  document.getElementById('moreMenu')?.classList.remove('open');
  document.getElementById('appScrim')?.classList.remove('active');
  el.welcomeScreen.style.display = 'none';
  el.messagesArea.classList.add('visible');
  el.messagesArea.innerHTML = '';
  conv.messages.forEach(msg => {
    if (msg.role === 'system') return;
    const { group } = appendMessage(msg.role, msg.content, false, msg.ts);
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
  delete STATE.conversations[id];
  saveConversations();
  if (STATE.activeConvId === id) { STATE.activeConvId = null; showWelcomeScreen(); }
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
  updateWorkspaceChrome();
}

// ========================
// Render chat history
// ========================
function renderChatHistory(filterText) {
  const query = (filterText || el.historySearch.value || '').toLowerCase().trim();
  let convs = Object.entries(STATE.conversations)
    .sort(([,a],[,b]) => (b.createdAt||0) - (a.createdAt||0));
  if (query) convs = convs.filter(([,c]) => (c.title||'').toLowerCase().includes(query));
  const shortcuts = document.getElementById('recentShortcutList');

  if (!convs.length) {
    el.chatHistory.innerHTML = query
      ? `<div class="empty-history">No chats match "${escapeHtml(query)}"</div>`
      : `<div class="empty-history">Your conversations will appear here</div>`;
    if (shortcuts) {
      shortcuts.innerHTML = `<div class="empty-history">Your recent conversations will appear here.</div>`;
    }
    updateWorkspaceChrome();
    return;
  }

  el.chatHistory.innerHTML = convs.map(([id, conv]) => {
    const isLoading = conv.title === '…';
    const titleHtml = isLoading
      ? `<span class="history-title-loading"></span>`
      : `<span class="history-title">${escapeHtml(conv.title || 'New Chat')}</span>`;
    return `
    <div class="history-item ${id === STATE.activeConvId ? 'active' : ''}" data-id="${id}">
      <div class="history-item-body">
        ${titleHtml}
        <span class="history-time">${conv.createdAt ? formatRelativeTime(conv.createdAt) : ''}</span>
      </div>
      <div class="history-actions">
        <button class="history-rename" data-id="${id}" title="Rename">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="history-delete" data-id="${id}" title="Delete">✕</button>
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
  const d = Date.now() - ts, m = Math.floor(d/60000), h = Math.floor(d/3600000), dy = Math.floor(d/86400000);
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

  document.body.classList.toggle('chat-active', hasActive);

  if (titleEl) {
    titleEl.textContent = hasActive
      ? (STATE.conversations[STATE.activeConvId]?.title || 'New Chat')
      : 'Start with one clear prompt';
  }

  if (metaEl) {
    metaEl.textContent = hasActive
      ? 'Everything stays in this thread: chat, build output, and code previews.'
      : 'Ask a question, build a site, generate code, or reopen a recent thread.';
  }
}

// ========================
// Ollama connection
// ========================
async function checkOllamaConnection() {
  setStatus('loading', 'Connecting...');
  try {
    const res = await fetch(`${STATE.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error();
    const data = await res.json();
    setStatus('online', 'Online');
    populateModels(data.models || []);
  } catch {
    // Ollama offline — but cloud models may still be available
    const hasCloudKey = ['anthropic','openai','groq','gemini']
      .some(p => localStorage.getItem('hazyKey_' + p) &&
                 localStorage.getItem('hazyVerified_' + p) === 'true');

    if (hasCloudKey) {
      setStatus('online', 'Cloud Active');
      // Show cloud models even without Ollama
      populateModels([]);
    } else {
      setStatus('error', 'Ollama offline');
      el.modelList.innerHTML = `<div class="model-item loading-models" style="color:var(--danger);flex-direction:column;gap:4px;padding:12px 14px;"><span>⚠️ Cannot connect to Ollama</span><span style="font-size:11px;opacity:.7">Run: <code>ollama serve</code></span></div>`;
      el.currentModelName.textContent = 'Not connected';
    }
  }
}

function populateModels(models) {
  // ── Build cloud model entries for any provider with a saved key ────────────
  const CLOUD_PROVIDERS = [
    { key: 'anthropic', label: '✦ Anthropic',  icon: '☁' },
    { key: 'openai',    label: '✦ OpenAI',      icon: '☁' },
    { key: 'groq',      label: '✦ Groq',         icon: '☁' },
    { key: 'gemini',    label: '✦ Gemini',        icon: '☁' },
  ];

  const activeCloud = [];
  CLOUD_PROVIDERS.forEach(p => {
    const key      = localStorage.getItem('hazyKey_' + p.key);
    const verified = localStorage.getItem('hazyVerified_' + p.key) === 'true';
    // Only show in dropdown if key exists AND has been verified via Test button
    if (key && verified) {
      const cloudModels = CLOUD_MODEL_MAP[p.key] || [];
      cloudModels.forEach(m => {
        activeCloud.push({ fullId: m.id, label: m.label, provider: p.key });
      });
    }
  });

  // ── Restore the currently active model from localStorage ─────────────────
  const savedModel    = localStorage.getItem('hazyActiveModel') || '';
  const savedProvider = savedModel.split('/')[0] || 'ollama';
  const isCloudActive = ['anthropic','openai','groq','gemini'].includes(savedProvider);

  // ── Build HTML ────────────────────────────────────────────────────────────
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
      const mb = m.size ? Math.round(m.size/1024/1024) : null;
      const sz = mb ? (mb > 1000 ? `${(mb/1024).toFixed(1)}GB` : `${mb}MB`) : '';
      const currentName = isCloudActive ? savedModel : STATE.model;
      return `<div class="model-item ${m.name === currentName ? 'selected' : ''}" data-name="${m.name}" data-provider="ollama">
        <span>${m.name}</span>${sz ? `<span class="model-size">${sz}</span>` : ''}
      </div>`;
    }).join('');
  }

  el.modelList.innerHTML = html;

  // ── Update display name in sidebar ────────────────────────────────────────
  if (isCloudActive && savedModel) {
    const cloudEntry = activeCloud.find(m => m.fullId === savedModel);
    el.currentModelName.textContent = cloudEntry ? cloudEntry.label : savedModel.split('/')[1] || savedModel;
  } else if (models.length) {
    // Pick a good default Ollama model if current STATE.model isn't in the list
    const names = models.map(m => m.name);
    if (!names.includes(STATE.model)) {
      const preferred = ['mistral','llama3','llama3.2','llama2','gemma','phi3','qwen2'];
      STATE.model = preferred.find(p => names.some(n => n.includes(p))) || names[0];
    }
    el.currentModelName.textContent = STATE.model;
  }

  // ── Click handler for all items ───────────────────────────────────────────
  el.modelList.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      const name     = item.dataset.name;
      const provider = item.dataset.provider || 'ollama';

      el.modelList.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      el.modelDropdown.classList.remove('open');
      el.modelSelector.classList.remove('open');

      if (provider === 'ollama') {
        // Local model — bare name for Ollama API
        STATE.model = name;
        el.currentModelName.textContent = name;
        localStorage.setItem('hazyActiveModel', 'ollama/' + name);
        localStorage.setItem('hazyProvider', 'ollama');
      } else {
        // Cloud model — full 'provider/model' string
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
  el.modeChatBtn.classList.toggle('active', mode === 'chat');
  el.modeBuildBtn.classList.toggle('active', mode === 'build');
  el.modeCodeBtn.classList.toggle('active', mode === 'code');
  const langWrap = document.getElementById('codeLangWrap');
  if (langWrap) langWrap.style.display = mode === 'code' ? 'flex' : 'none';
  el.modeIndicator.innerHTML = mode === 'build' ? `${getIconSvg('icon-globe')}Website Builder mode`
    : mode === 'code' ? `${getIconSvg('icon-grid')}Code Builder mode`
    : `${getIconSvg('icon-chat')}Chat mode`;
  el.chatInput.placeholder = mode === 'build'
    ? 'Describe the website you want to build…'
    : mode === 'code'
    ? 'Describe the program or script you want to build…'
    : 'Message Hazy…';
}

// ========================
// Message rendering
// ========================
function appendMessage(role, content, animate = true, ts) {
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
      // Re-parse and show the build result card
      const projectData = parseDelimitedOutput(content) || parseCodeBlockFallback(content);
      if (projectData && projectData.files.length > 0) {
        const fileList = projectData.files.map(f => `<code>${escapeHtml(f.filename)}</code>`).join(', ');
        contentDiv.innerHTML = `
          <div class="build-success">
            <div class="build-success-header">
              <span class="build-success-icon">✅</span>
              <strong>${escapeHtml(projectData.project || (convMsg2.buildMode === 'code' ? 'Code' : 'Website'))} built!</strong>
            </div>
            ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
            <div class="build-file-list">${fileList}</div>
            ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
            ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
            <div class="build-actions">
              <button class="build-open-btn" onclick="window._lastBuild=${JSON.stringify(projectData).replace(/</g,'&lt;').replace(/>/g,'&gt;')};openBuilderPanel(window._lastBuild)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open in Builder
              </button>
            </div>
          </div>`;
        // Store for re-opening
        window[`_build_${ts}`] = projectData;
        // Fix the onclick to use the stored ref
        const openBtn = contentDiv.querySelector('.build-open-btn');
        if (openBtn) openBtn.onclick = () => { window._lastBuild = projectData; openBuilderPanel(projectData); };
      } else {
        // Couldn't re-parse — show as markdown (best effort)
        contentDiv.innerHTML = renderMarkdown(content);
        highlightCodeBlocks(contentDiv);
      }
    } else {
      contentDiv.innerHTML = renderMarkdown(content);
      highlightCodeBlocks(contentDiv);
    }
  } else {
    contentDiv.textContent = content;
  }
  bubble.appendChild(contentDiv);
  msgDiv.appendChild(bubble);
  group.appendChild(msgDiv);

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
    <button class="msg-action-btn regen-btn" title="Regenerate">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20.5 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Regenerate
    </button>` : ''}
  `;

  // Copy
  actions.querySelector('.copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(content).then(() => {
      const btn = actions.querySelector('.copy-btn');
      btn.classList.add('copied'); btn.textContent = '✓ Copied';
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

  // Regenerate (assistant messages only)
  if (role === 'assistant') {
    actions.querySelector('.regen-btn')?.addEventListener('click', regenerateLast);
  }

  group.appendChild(actions);
  el.messagesArea.appendChild(group);
  return { group, contentDiv };
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
    conv.messages[msgIndex].edited  = true;
    conv.messages[msgIndex].editedAt = Date.now();

    // Remove everything AFTER this message (AI replies + follow-ups)
    conv.messages.splice(msgIndex + 1);
    saveConversations();

    // Re-render all messages up to this point
    el.messagesArea.innerHTML = '';
    conv.messages.forEach(msg => {
      if (msg.role === 'system') return;
      const { group: g } = appendMessage(msg.role, msg.content, false, msg.ts);
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
      <span class="typing-label" id="typingLabel">${STATE.mode === 'build' ? 'Building your website…' : STATE.mode === 'code' ? 'Building your code…' : 'Thinking…'}</span>
    </div>`;
  el.messagesArea.appendChild(div);
  scrollToBottom(true);
  return div;
}

function removeTypingIndicator() { $('typingIndicator')?.remove(); }

// ========================
// Syntax highlighting
// ========================
function highlightCodeBlocks(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code').forEach(b => {
    if (b.dataset.highlighted) return; // already highlighted — skip to preserve structure
    hljs.highlightElement(b);
  });
}

// ========================
// Markdown renderer
// ========================
function renderMarkdown(text) {
  let html = escapeHtml(text);
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const ph = `\x00CODE${codeBlocks.length}\x00`;
    const langLabel = lang || 'code';
    const langClass = lang ? `language-${lang}` : '';
    const lines = code.trimEnd().split('\n');
    const lineNumbers = lines.map((_, i) => `<span class="code-line-num">${i + 1}</span>`).join('\n');
    const langColorClass = `lang-color-${langLabel.toLowerCase()}`;
    const escapedCode = code.trimEnd().replace(/'/g, "\\'").replace(/\n/g, '\\n');
    codeBlocks.push(
      `<pre class="hazy-code-block">` +
      `<div class="code-header">` +
        `<span class="code-lang-badge ${langColorClass}">${langLabel}</span>` +
        `<div class="code-header-actions">` +
          `<span class="code-line-count">${lines.length} line${lines.length !== 1 ? 's' : ''}</span>` +
          `<button class="code-action-btn code-explain-btn" onclick="explainCode(this)" title="Ask Hazy to explain this code">Explain</button>` +
          `<button class="code-action-btn code-improve-btn" onclick="improveCode(this)" title="Ask Hazy to improve this code">Improve</button>` +
          `<button class="code-copy-btn" onclick="copyCode(this)">&#x2398; Copy</button>` +
        `</div>` +
      `</div>` +
      `<div class="code-scroll-wrap">` +
        `<div class="code-line-nums" aria-hidden="true">${lineNumbers}</div>` +
        `<code class="${langClass}">${code.trimEnd()}</code>` +
      `</div>` +
      `</pre>`
    );
    return ph;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
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
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
  return html;
}

function processMarkdownTables(html) {
  const lines = html.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|(.+)\|$/.test(line.trim())) {
      const next = lines[i+1] || '';
      if (/^\|[\s\-:|]+\|$/.test(next.trim())) {
        const headers = line.trim().slice(1,-1).split('|').map(c => c.trim());
        const hRow = '<tr>' + headers.map(c => `<th>${c}</th>`).join('') + '</tr>';
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|(.+)\|$/.test(lines[i].trim())) {
          rows.push('<tr>' + lines[i].trim().slice(1,-1).split('|').map(c => `<td>${c.trim()}</td>`).join('') + '</tr>');
          i++;
        }
        out.push(`<table>${hRow}${rows.join('')}</table>`);
        continue;
      } else {
        const cells = line.trim().slice(1,-1).split('|').map(c => c.trim());
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
  return text.replace(/```[\s\S]*?```/g,'').replace(/`[^`]+`/g,'').replace(/\*\*\*(.+?)\*\*\*/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/__(.+?)__/g,'$1').replace(/_(.+?)_/g,'$1').replace(/^#{1,6} /gm,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/^[-*+] /gm,'').replace(/^\d+\. /gm,'').replace(/^> /gm,'').trim();
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.copyCode = function(btn) {
  const code = btn.closest('pre').querySelector('code');
  navigator.clipboard.writeText(code.textContent||'').then(() => {
    btn.textContent = '✓ COPIED';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⎘ COPY'; btn.classList.remove('copied'); }, 1800);
  }).catch(() => {
    btn.textContent = '✗ FAILED';
    setTimeout(() => { btn.textContent = '⎘ COPY'; }, 1800);
  });
};

window.explainCode = function(btn) {
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

window.improveCode = function(btn) {
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
  if (STATE.mode === 'build') return true;
  const lower = text.toLowerCase();
  const hasKeyword = WEBSITE_KEYWORDS.some(k => lower.includes(k));
  const hasBuildVerb = /\b(build|create|make|generate|design)\b/.test(lower);
  const hasWebTarget = /\b(website|webpage|page|site|dashboard|portfolio|form|app)\b/.test(lower);
  return hasBuildVerb && hasWebTarget && hasKeyword;
}

function isCodeBuildRequest() {
  return STATE.mode === 'code';
}

// ========================
// Delimiter-based output parser
// Much more reliable than JSON for local LLMs.
// Also handles partial/cut-off output — extracts
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
  const projectMatch  = raw.match(/===PROJECT===\s*([\s\S]*?)(?===|$)/);
  const descMatch     = raw.match(/===DESCRIPTION===\s*([\s\S]*?)(?===|$)/);
  const setupMatch    = raw.match(/===SETUP===\s*([\s\S]*?)(?===|$)/);
  const notesMatch    = raw.match(/===NOTES===\s*([\s\S]*?)(?===|$)/);

  if (projectMatch) result.project     = projectMatch[1].trim();
  if (descMatch)    result.description = descMatch[1].trim();
  if (setupMatch)   result.setup       = setupMatch[1].trim();
  if (notesMatch)   result.notes       = notesMatch[1].trim();

  // Extract all FILE blocks — works even on partial output
  // A file block starts at ===FILE: name=== and ends at the next === or EOF
  const filePattern = /===FILE:\s*([^\s=][^=]*?)===\s*([\s\S]*?)(?=\n===|$)/g;
  let match;
  while ((match = filePattern.exec(raw)) !== null) {
    const filename = match[1].trim();
    const content  = match[2].trimEnd();
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
// extract them as individual files — last-resort recovery.
function parseCodeBlockFallback(raw) {
  const files = [];
  const pattern = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;
  const counters = {};

  // Map lang → default filename
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
    const lang    = (match[1] || '').toLowerCase();
    const content = match[2].trimEnd();
    if (!content) continue;

    const base = langFileMap[lang] || `file.${lang || 'txt'}`;
    const key  = lang || 'txt';
    counters[key] = (counters[key] || 0);
    const filename = counters[key] === 0 ? base : base.replace(/(\.\w+)$/, `_${counters[key]}$1`);
    counters[key]++;

    files.push({ filename, language: lang || detectLang(filename), content });
  }

  if (!files.length) return null;
  return { project: 'Code Project', description: '', files, setup: 'See NOTES for run instructions', notes: 'Extracted from code blocks' };
}

function openBuilderPanel(projectData) {
  STATE.builderFiles = projectData.files || [];
  STATE.builderActive = true;
  STATE.builderActiveFile = 0;
  STATE.builderPreviewVisible = false;

  el.builderProjectName.textContent = projectData.project || (STATE.mode === 'code' ? 'Code Project' : 'Website Project');
  el.builderPanel.classList.add('open');
  document.body.classList.add('builder-open');

  renderBuilderTabs();
  showBuilderFile(0);
  updateBuilderStatus(`${STATE.builderFiles.length} files generated`, projectData.project);

  // Hide preview toggle in code mode (no live preview for non-web code)
  if (el.builderPreviewToggle) {
    el.builderPreviewToggle.style.display = STATE.mode === 'code' ? 'none' : '';
  }

  // Auto-show preview only for website mode
  if (STATE.mode !== 'code') showBuilderPreview(true);
  else showBuilderPreview(false);
}

function renderBuilderTabs() {
  const iconMap = {
    html: '🌐', css: '🎨',
    javascript: '⚡', js: '⚡', typescript: '🔷', ts: '🔷',
    json: '📦', markdown: '📝', md: '📝', txt: '📄', xml: '📋', yaml: '📋', yml: '📋',
    python: '🐍', py: '🐍',
    java: '☕',
    cpp: '⚙️', c: '🔧',
    csharp: '🎯', cs: '🎯',
    go: '🐹',
    rust: '🦀',
    swift: '🍎',
    kotlin: '🟣', kt: '🟣',
    ruby: '💎', rb: '💎',
    php: '🐘',
    r: '📊',
    dart: '🎯',
    lua: '🌙',
    perl: '🐪', pl: '🐪',
    scala: '🔴',
    haskell: '🔵', hs: '🔵',
    elixir: '💧', ex: '💧',
    bash: '💻', sh: '💻',
    powershell: '🖥️', ps1: '🖥️',
    sql: '🗄️',
    asm: '⚙️',
    matlab: '📐', m: '📐',
    fortran: '🏛️',
    cobol: '📟',
  };
  el.builderTabs.innerHTML = STATE.builderFiles.map((f, i) => {
    const ext = f.filename.split('.').pop().toLowerCase();
    const icon = iconMap[f.language] || iconMap[ext] || '📄';
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

function showBuilderPreview(show) {
  STATE.builderPreviewVisible = show;
  el.builderPreviewPane.style.display = show ? 'flex' : 'none';
  el.builderCodePane.style.flex = show ? '0 0 50%' : '1';
  el.builderPreviewToggle.classList.toggle('active', show);

  if (show) refreshPreview();
}

function refreshPreview() {
  const htmlFile = STATE.builderFiles.find(f => f.filename === 'index.html' || f.filename.endsWith('.html'));
  const cssFile  = STATE.builderFiles.find(f => f.language === 'css' || f.filename.endsWith('.css'));
  const jsFile   = STATE.builderFiles.find(f => (f.language === 'javascript' || f.filename.endsWith('.js')) && !f.filename.includes('server') && !f.filename.includes('node'));

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
  const readme = `# ${el.builderProjectName.textContent}\n\nGenerated by Hazy — by Dream On\n\n## Files\n${STATE.builderFiles.map(f => `- \`${f.filename}\``).join('\n')}\n\n## How to Run\n${hasBackend ? '```\nnpm install\nnode server.js\n```\nThen open http://localhost:3000' : 'Open `index.html` in your browser'}\n`;
  folder.file('README.md', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${projectName}.zip`;
  a.click();
  showToast('ZIP downloaded!', 'success');
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
  image:  ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'],
  pdf:    ['application/pdf'],
  text:   ['text/plain','text/markdown','text/csv','text/html','text/css',
           'text/javascript','application/json','application/xml',
           'text/x-python','text/x-java','text/x-c','text/x-sh',
           'application/x-yaml','text/yaml'],
};

const CODE_EXTS = new Set([
  'js','ts','jsx','tsx','html','css','py','java','cpp','c','h',
  'sh','bash','json','yaml','yml','xml','md','txt','csv','env',
  'log','sql','php','rb','go','rs','swift','kt','vue','svelte',
]);

function categorizeFile(file) {
  if (FILE_ACCEPT.image.includes(file.type)) return 'image';
  if (FILE_ACCEPT.pdf.includes(file.type))   return 'pdf';
  const ext = file.name.split('.').pop().toLowerCase();
  if (CODE_EXTS.has(ext) || FILE_ACCEPT.text.includes(file.type)) return 'text';
  return 'unknown';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

// Read image as base64
function readAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// Read image as data-url (for preview)
function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// Read text/code file as string
function readAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

// Extract text from PDF using PDF.js
async function extractPDFText(file) {
  if (typeof pdfjsLib === 'undefined') {
    return `[PDF: ${file.name} — PDF.js not loaded, cannot extract text]`;
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf    = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const total  = pdf.numPages;
    const chunks = [];
    const maxPages = Math.min(total, 20); // cap at 20 pages to avoid RAM issues
    for (let i = 1; i <= maxPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text    = content.items.map(s => s.str).join(' ').trim();
      if (text) chunks.push(`--- Page ${i} ---\n${text}`);
    }
    const result = chunks.join('\n\n');
    const note   = total > maxPages ? `\n\n[Note: Only first ${maxPages} of ${total} pages extracted]` : '';
    return result + note || '[PDF appears to have no extractable text — may be scanned/image-based]';
  } catch (e) {
    return `[PDF extraction failed: ${e.message}]`;
  }
}

// Process all selected files → populate STATE.uploadedFiles
async function processFiles(fileList) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
  const toProcess = Array.from(fileList).slice(0, 8); // max 8 files at once
  const results   = [];

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
        entry.base64     = await readAsBase64(file);
        entry.previewUrl = await readAsDataURL(file);
        entry.mimeType   = file.type;
      } else if (category === 'pdf') {
        entry.content    = await extractPDFText(file);
        entry.previewUrl = null;
      } else {
        entry.content    = await readAsText(file);
        entry.previewUrl = null;
        entry.ext        = file.name.split('.').pop().toLowerCase();
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
    const icon = f.category === 'image' ? '' : f.category === 'pdf' ? '📄' : '📎';
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
        <button class="file-chip-remove" data-index="${i}" title="Remove">✕</button>
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
    const icon = f.category === 'pdf' ? '📄' : '📎';
    return `<div class="msg-attachment">
      <span class="msg-attachment-icon">${icon}</span>
      <span class="msg-attachment-name">${escapeHtml(f.name)}</span>
      <span class="msg-attachment-meta">${formatFileSize(f.size)}</span>
    </div>`;
  }).join('')}</div>`;
}

// Build the Ollama message content including file context
function buildMessageWithFiles(userText, files) {
  // No files → plain string content (original behavior)
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

  // Text/PDF only — plain string with context injected
  return fullText;
}

// ========================
// Send message
// ========================
async function sendMessage(userText) {
  userText = (userText || '').trim();
  const files = [...STATE.uploadedFiles];

  // Allow send with files even if no text
  if (!userText && !files.length) return;
  if (STATE.isStreaming) return;

  const isBuild = isWebsiteBuildRequest(userText);
  const isCode  = !isBuild && isCodeBuildRequest();

  if (!STATE.activeConvId) {
    createConversation(userText || files.map(f => f.name).join(', '));
    el.welcomeScreen.style.display = 'none';
    el.messagesArea.classList.add('visible');
  }

  const conv = STATE.conversations[STATE.activeConvId];
  const now  = Date.now();

  // Build the message content for Ollama
  const ollamaContent = buildMessageWithFiles(userText, files);

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

  try {
    const sysPrompt = getActiveSystemPrompt(isBuild, isCode);
    const messages  = [
      { role: 'system', content: sysPrompt },
      // All previous messages (text only) + current message with file content
      ...conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: ollamaContent },
    ];

    STATE.abortController = new AbortController();

    // ── Route ALL chat through the Hazy server ─────────────────────────────
    // The server (server.js) handles provider routing, API keys, and format
    // conversion. The frontend just sends to /hazy/chat with the model field
    // set to 'provider/model-id' and always gets back Ollama NDJSON format.
    //
    // For Ollama (local): model = 'ollama/mistral', server proxies to localhost:11434
    // For cloud:          model = 'anthropic/claude-sonnet-4-5' etc, server proxies
    //                     to the right API using keys from hazy-config.json
    //
    // Fallback: if server is not running, fall back to direct Ollama connection.

    const savedModel = localStorage.getItem('hazyActiveModel') || '';
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud = ['anthropic','openai','groq','gemini'].includes(savedProvider);

    // Build the model field — server expects 'provider/modelid' format
    const modelField = savedModel || ('ollama/' + STATE.model);

    // Build request body — include apiKey so server doesn't need hazy-config.json
    // Key comes from localStorage (set when user saves in Settings → AI Providers)
    const localApiKey = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';

    const chatBody = {
      model:    modelField,
      messages,
      stream:   true,
      // Pass key in body — server uses this first, falls back to hazy-config.json
      apiKey:   localApiKey || undefined,
      options: {
        // Inference parameters — ref: Claude Technical Reference §2.4
        temperature:    STATE.temperature,   // 0.0 deterministic → 1.0 creative
        top_p:          STATE.topP,          // nucleus sampling (0.9–0.99)
        top_k:          STATE.topK,          // top-K token candidates (10–100)
        repeat_penalty: STATE.repeatPenalty, // penalise repetition
        num_predict:    STATE.maxTokens,
        num_ctx:        STATE.contextSize,
        max_tokens:     STATE.maxTokens,
      },
    };

    // Try the Hazy server first (/hazy/chat), fall back to direct Ollama
    let chatEndpoint = '/hazy/chat';
    let chatHeaders  = { 'Content-Type': 'application/json' };

    // If running direct from filesystem (file:// protocol), use Ollama directly
    if (window.location.protocol === 'file:') {
      chatEndpoint = `${STATE.ollamaUrl}/api/chat`;
      chatBody.model = STATE.model; // Ollama wants bare model name
    }

    const response = await fetch(chatEndpoint, {
      method:  'POST',
      headers: chatHeaders,
      signal:  STATE.abortController.signal,
      body:    JSON.stringify(chatBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      let errMsg = errText;
      try { errMsg = JSON.parse(errText).error || errText; } catch {}

      // If it's a cloud provider, never fall back to Ollama — show the real error
      if (isCloud) {
        throw new Error(errMsg);
      }

      // Ollama: if /hazy/chat failed (server not running), try direct Ollama
      if (chatEndpoint === '/hazy/chat') {
        const ollamaModel = STATE.model.includes('/') ? STATE.model.split('/').pop() : STATE.model;
        const fallbackRes = await fetch(`${STATE.ollamaUrl}/api/chat`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          signal:  STATE.abortController.signal,
          body:    JSON.stringify({ model: ollamaModel, messages, stream: true, options: { temperature: STATE.temperature, num_predict: STATE.maxTokens, num_ctx: 16384 } }),
        });
        if (!fallbackRes.ok) throw new Error(`Ollama error ${fallbackRes.status}: ${await fallbackRes.text()}`);

        // Use fallback response stream directly — don't patch the original response
        removeTypingIndicator();
        const aiTs = Date.now();
        const { contentDiv } = appendMessage('assistant', '', true, aiTs);
        let fullContent = '';
        const reader  = fallbackRes.body.getReader();
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
              const token = json.message?.content || '';
              if (token) { fullContent += token; contentDiv.innerHTML = renderMarkdown(fullContent) + '<span class="stream-cursor"></span>'; scrollToBottom(); }
              if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
            } catch {}
          }
        }
        contentDiv.querySelector('.stream-cursor')?.remove();
        conv.messages.push({ role: 'assistant', content: fullContent, ts: aiTs });
        saveConversations();
        if (conv.messages.filter(m => m.role === 'user').length === 1) generateChatTitle(STATE.activeConvId, userText, fullContent);
        contentDiv.innerHTML = renderMarkdown(fullContent);
        highlightCodeBlocks(contentDiv);
        if (STATE.ttsEnabled && fullContent) speakText(stripMarkdown(fullContent));
        return; // done — skip the main stream block below
      } else {
        throw new Error(`Server error ${response.status}: ${errMsg}`);
      }
    }

    removeTypingIndicator();
    const aiTs = Date.now();
    const { contentDiv } = appendMessage('assistant', '', true, aiTs);
    let fullContent = '';

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    // ── Stream reader — always Ollama NDJSON format ───────────────────────
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
          const token = json.message?.content || '';

          if (token) {
            fullContent += token;

            if (isBuild || isCode) {
              const filesFound     = (fullContent.match(/===FILE:/g) || []).length;
              const linesGenerated = fullContent.split('\n').length;
              const modeVerb       = isCode ? 'Building your code…' : 'Building your website…';
              if (STATE.showLiveCode) {
                contentDiv.innerHTML = renderLiveBuildProgress(fullContent, filesFound, linesGenerated);
              } else {
                const filesInfo = filesFound > 0 ? (filesFound + ' file' + (filesFound > 1 ? 's' : '') + ' detected') : 'Generating…';
                contentDiv.innerHTML = `
                  <div class="build-progress">
                    <span class="build-spinner"></span>
                    <div class="build-progress-info">
                      <span>${modeVerb}</span>
                      <span class="build-stats">${filesInfo} · ${linesGenerated} lines · ${(fullContent.length/1024).toFixed(1)} KB</span>
                    </div>
                  </div>`;
              }
            } else {
              contentDiv.innerHTML = renderMarkdown(fullContent) + '<span class="stream-cursor"></span>';
            }
            scrollToBottom();
          }

          if (json.done) contentDiv.querySelector('.stream-cursor')?.remove();
        } catch {}
      }
    }
    // Remove cursor after stream ends
    contentDiv.querySelector('.stream-cursor')?.remove();

    // Final flush to IndexedDB before parsing

    conv.messages.push({ role: 'assistant', content: fullContent, ts: aiTs, buildMode: (isBuild || isCode) ? (isCode ? 'code' : 'website') : undefined });
    saveConversations();

    // Generate a smart title after the very first exchange
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      generateChatTitle(STATE.activeConvId, userText, fullContent);
    }

    if (isBuild || isCode) {
      // — Parse attempt 1: delimiter format (most reliable) —
      let projectData = parseDelimitedOutput(fullContent);

      // — Parse attempt 2: code block fallback (if model used markdown fences) —
      if (!projectData) projectData = parseCodeBlockFallback(fullContent);


      if (projectData && projectData.files.length > 0) {
        const fileList = projectData.files.map(f => `<code>${escapeHtml(f.filename)}</code>`).join(', ');
        const isPartial = !fullContent.includes('===NOTES===') && !fullContent.includes('===SETUP===');
        const modeLabel = isCode ? 'Code' : 'Website';
        const modeIcon  = isCode ? '💻' : '🌐';


        contentDiv.innerHTML = `
          <div class="build-success">
            <div class="build-success-header">
              <span class="build-success-icon">${isPartial ? '⚠️' : '✅'}</span>
              <strong>${escapeHtml(projectData.project || modeLabel)} ${isPartial ? 'partially' : ''} built!</strong>
            </div>
            ${isPartial ? `<p class="build-partial-warn">⚠️ Output was cut off — showing what was generated.</p>` : ''}
            ${projectData.description ? `<p class="build-success-desc">${escapeHtml(projectData.description)}</p>` : ''}
            <div class="build-file-list">${fileList}</div>
            ${projectData.setup ? `<div class="build-setup"><strong>Run:</strong> <code>${escapeHtml(projectData.setup)}</code></div>` : ''}
            ${projectData.notes ? `<p class="build-notes">${escapeHtml(projectData.notes)}</p>` : ''}
            <div class="build-actions">
              <button class="build-open-btn" onclick="openBuilderPanel(window._lastBuild)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Open in Builder
              </button>
              <button class="build-dl-btn" onclick="downloadBuilderZip()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Download ZIP
              </button>
            </div>
          </div>`;

        window._lastBuild = projectData;
        openBuilderPanel(projectData);
        showToast(`${projectData.files.length} file${projectData.files.length > 1 ? 's' : ''} generated!`, 'success');
      } else {
        contentDiv.innerHTML = renderMarkdown(fullContent);
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
        showToast('Could not extract files — see suggestions below', '');
      }
    } else {
      contentDiv.innerHTML = renderMarkdown(fullContent);
      highlightCodeBlocks(contentDiv);
    }

    if (STATE.ttsEnabled && fullContent && !isBuild && !isCode) {
      speakText(stripMarkdown(fullContent));
    }

  } catch(err) {
    removeTypingIndicator();
    if (err.name === 'AbortError') {
      // On abort during build — try to parse whatever was collected
      if ((isBuild || isCode) && typeof fullContent === 'string' && fullContent.length > 100) {
        const partial = parseDelimitedOutput(fullContent) || parseCodeBlockFallback(fullContent);
        if (partial?.files.length > 0) {
          window._lastBuild = partial;
          openBuilderPanel(partial);
          showToast(`Stopped — recovered ${partial.files.length} partial file(s)`, '');
          return;
        }
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
  div.innerHTML = `<span class="error-icon">⚠️</span><span>${html}</span>`;
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
        <span class="build-stats">${filesFound} file${filesFound>1?'s':''} · ${linesGenerated} lines · ${(rawContent.length/1024).toFixed(1)} KB</span>
      </div>
    </div>`;
  
  if (descMatch) {
    html += `<p class="build-live-desc">${escapeHtml(descMatch[1].trim())}</p>`;
  }
  
  // Extract and display each file as it's being written
  const filePattern = /===FILE:\s*([^\s=][^=]*?)===\s*([\s\S]*?)(?=\n===|$)/g;
  let match;
  const files = [];
  
  while ((match = filePattern.exec(rawContent)) !== null) {
    const filename = match[1].trim();
    const content = match[2].trimEnd();
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
            ${isIncomplete ? '<span class="writing-indicator">✍️ Writing...</span>' : '<span class="complete-indicator">✓</span>'}
          </div>
          <pre class="build-live-code"><code class="language-${lang}">${escapeHtml(file.content)}${isIncomplete ? '<span class="cursor-blink">│</span>' : ''}</code></pre>
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
  conv.messages.forEach(msg => { if (msg.role !== 'system') appendMessage(msg.role, msg.content, false, msg.ts); });
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
  el.sendBtn.disabled = streaming || !el.chatInput.value.trim();
  el.stopBtn.style.display = streaming ? 'flex' : 'none';
}

// ── Scroll management ────────────────────────────────────────────────────
// userScrolledUp is set to true the moment the user scrolls up manually.
// It is only cleared when the user scrolls back to the bottom themselves,
// or when a new message is sent. This prevents streaming from ever
// hijacking the scroll position.
let userScrolledUp = false;
let lastScrollTop = 0;

function isNearBottom() {
  const { scrollTop, scrollHeight, clientHeight } = el.chatContainer;
  return scrollHeight - scrollTop - clientHeight < 80;
}

function scrollToBottom(force = false) {
  if (force) {
    // Always scroll — user just sent a message or a new chat started
    userScrolledUp = false;
    requestAnimationFrame(() => {
      el.chatContainer.scrollTop = el.chatContainer.scrollHeight;
    });
  } else {
    // Streaming chunk — only scroll if user hasn't scrolled up
    if (userScrolledUp) return;
    requestAnimationFrame(() => {
      el.chatContainer.scrollTop = el.chatContainer.scrollHeight;
    });
  }
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
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(10px)'; t.style.transition='all .25s'; setTimeout(() => t.remove(), 300); }, 2200);
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    el.sidebar.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
  }
}

// ========================
// Piper TTS Engine
// Uses @mintplex-labs/piper-tts-web via jsDelivr +esm
// window.PiperTTS is set by the module script in index.html BEFORE app.js loads
// Voice models download from HuggingFace once, cached in browser OPFS permanently
// ========================

const PIPER_VOICES = [
  { id: 'en_US-lessac-medium',              label: 'Lessac ⭐ (US Female)',       group: '🇺🇸 English US' },
  { id: 'en_US-amy-medium',                 label: 'Amy (US Female)',              group: '🇺🇸 English US' },
  { id: 'en_US-hfc_female-medium',          label: 'HFC Female (US)',              group: '🇺🇸 English US' },
  { id: 'en_US-hfc_male-medium',            label: 'HFC Male (US)',                group: '🇺🇸 English US' },
  { id: 'en_US-joe-medium',                 label: 'Joe (US Male)',                group: '🇺🇸 English US' },
  { id: 'en_US-ryan-medium',                label: 'Ryan (US Male)',               group: '🇺🇸 English US' },
  { id: 'en_US-danny-low',                  label: 'Danny (US Male)',              group: '🇺🇸 English US' },
  { id: 'en_US-kathleen-low',               label: 'Kathleen (US Female)',         group: '🇺🇸 English US' },
  { id: 'en_US-kusal-medium',               label: 'Kusal (US Male)',              group: '🇺🇸 English US' },
  { id: 'en_US-libritts-high',              label: 'LibriTTS (US Female, HQ)',     group: '🇺🇸 English US' },
  { id: 'en_GB-alan-medium',                label: 'Alan (GB Male)',               group: '🇬🇧 English GB' },
  { id: 'en_GB-cori-high',                  label: 'Cori (GB Female, HQ)',         group: '🇬🇧 English GB' },
  { id: 'en_GB-jenny_dioco-medium',         label: 'Jenny (GB Female)',            group: '🇬🇧 English GB' },
  { id: 'en_GB-northern_english_male-medium', label: 'Northern Male',              group: '🇬🇧 English GB' },
  { id: 'de_DE-thorsten-medium',            label: 'Thorsten (Male)',              group: '🇩🇪 German' },
  { id: 'de_DE-eva_k-x_low',               label: 'Eva (Female)',                 group: '🇩🇪 German' },
  { id: 'fr_FR-siwis-medium',               label: 'Siwis (Female)',               group: '🇫🇷 French' },
  { id: 'fr_FR-tom-medium',                 label: 'Tom (Male)',                   group: '🇫🇷 French' },
  { id: 'es_ES-davefx-medium',              label: 'Dave (Male)',                  group: '🇪🇸 Spanish' },
  { id: 'it_IT-paola-medium',               label: 'Paola (Female)',               group: '🇮🇹 Italian' },
  { id: 'pt_BR-faber-medium',               label: 'Faber (BR Male)',              group: '🇧🇷 Portuguese' },
  { id: 'nl_NL-mls-medium',                 label: 'MLS (Female)',                 group: '🇳🇱 Dutch' },
  { id: 'ru_RU-ruslan-medium',              label: 'Ruslan (Male)',                group: '🇷🇺 Russian' },
  { id: 'zh_CN-huayan-medium',              label: 'Huayan (Female)',              group: '🇨🇳 Chinese' },
];

// ── Piper runtime state ──────────────────────────────────────────────────
let _ttsAudioCtx      = null;
let _ttsCurrentSource = null;
let _piperSession     = null;   // active TtsSession
let _piperLoadedVoice = null;
let _piperLoading     = false;

function updatePiperStatus(status, text, pct = null) {
  const el = document.getElementById('ttsPiperStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'tts-model-status';
  if (status === 'loading') el.classList.add('status-loading');
  if (status === 'ready')   el.classList.add('status-ready');
  if (status === 'error')   el.classList.add('status-error');
  const wrap = document.getElementById('ttsPiperProgressWrap');
  const bar  = document.getElementById('ttsPiperProgressBar');
  if (wrap) wrap.style.display = (status === 'loading' && pct != null) ? 'block' : 'none';
  if (bar  && pct != null) bar.style.width = Math.min(100, pct) + '%';
}

// Wait up to 20s for the Piper module script to finish loading
function waitForPiperLib() {
  return new Promise((resolve) => {
    if (window.PiperTTS !== undefined) { resolve(window.PiperTTS); return; }
    const onReady = () => resolve(window.PiperTTS);
    window.addEventListener('piper-ready', onReady, { once: true });
    setTimeout(() => {
      window.removeEventListener('piper-ready', onReady);
      resolve(window.PiperTTS ?? null);
    }, 20000);
  });
}

async function loadPiperModel(voiceId) {
  if (_piperLoadedVoice === voiceId && _piperSession?.ready) return true;
  if (_piperLoading) return false;
  _piperLoading = true;
  _piperSession = null;

  updatePiperStatus('loading', 'Initializing Piper TTS…');

  const tts = await waitForPiperLib();
  if (!tts) {
    _piperLoading = false;
    updatePiperStatus('error', '❌ Piper library failed to load. Check internet connection.');
    return false;
  }

  try {
    updatePiperStatus('loading', 'Downloading voice model…', 0);

    _piperSession = await tts.TtsSession.create({
      voiceId,
      progress: (p) => {
        if (p.total > 0) {
          const pct = Math.round((p.loaded / p.total) * 100);
          const mb  = (p.loaded  / 1048576).toFixed(1);
          const tot = (p.total   / 1048576).toFixed(1);
          updatePiperStatus('loading', `Downloading… ${mb} / ${tot} MB`, pct);
        } else {
          updatePiperStatus('loading', 'Downloading voice model…');
        }
      },
    });

    _piperLoadedVoice     = voiceId;
    _piperLoading         = false;
    STATE.tpsPiperReady   = true;
    STATE.ttsPiperLoading = false;
    updatePiperStatus('ready', '✅ Piper TTS ready');
    showToast('🎤 Piper TTS ready!', 'success');
    return true;
  } catch (err) {
    _piperLoading         = false;
    STATE.tpsPiperReady   = false;
    STATE.ttsPiperLoading = false;
    const msg = err.message || String(err);
    updatePiperStatus('error', '❌ ' + msg);
    showToast('Piper failed — check console (F12)', 'error');
    console.error('[Piper load error]', err);
    return false;
  }
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function stopTTS() {
  try {
    if (_ttsCurrentSource) {
      _ttsCurrentSource.stop();
      _ttsCurrentSource.disconnect();
      _ttsCurrentSource = null;
    }
  } catch {}
  speechSynthesis.cancel();
}

async function speakText(text) {
  if (!text.trim()) return;
  stopTTS();
  if (STATE.ttsEngine === 'piper') {
    await speakPiper(text);
  } else {
    speakBrowser(text);
  }
}

function speakBrowser(text) {
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate  = STATE.ttsSpeed;
  utt.pitch = 1;
  speechSynthesis.speak(utt);
}

async function speakPiper(text) {
  const voiceId = STATE.ttsVoice;

  if (!STATE.tpsPiperReady || _piperLoadedVoice !== voiceId) {
    if (_piperLoading) { showToast('Piper is still loading — please wait…', ''); return; }
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
      const wavBlob   = await _piperSession.predict(chunk);
      const arrayBuf  = await wavBlob.arrayBuffer();
      const audioBuf  = await _ttsAudioCtx.decodeAudioData(arrayBuf);
      const source    = _ttsAudioCtx.createBufferSource();
      source.buffer   = audioBuf;
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

  // ── File upload ──────────────────────────────────
  el.uploadBtn.addEventListener('click', () => el.fileInput.click());

  el.fileInput.addEventListener('change', async () => {
    if (!el.fileInput.files.length) return;
    showToast('Reading files…', '');
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
    showToast('Reading files…', '');
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
  el.modeChatBtn.addEventListener('click', () => setMode('chat'));
  el.modeBuildBtn.addEventListener('click', () => setMode('build'));
  el.modeCodeBtn?.addEventListener('click', () => setMode('code'));
  document.getElementById('codeLangSelect')?.addEventListener('change', e => {
    STATE.codeLang = e.target.value;
  });

  // Scroll to bottom
  el.chatContainer.addEventListener('scroll', () => {
    const currentScrollTop = el.chatContainer.scrollTop;
    const scrolledUp = currentScrollTop < lastScrollTop; // user scrolled upward
    lastScrollTop = currentScrollTop;

    if (scrolledUp && !isNearBottom()) {
      // User intentionally scrolled up — lock scroll
      userScrolledUp = true;
    } else if (isNearBottom()) {
      // User scrolled back to the bottom — unlock
      userScrolledUp = false;
    }

    updateScrollBottomBtn();
  });

  // Clicking scroll-to-bottom button clears the lock
  el.scrollBottomBtn.addEventListener('click', () => {
    userScrolledUp = false;
    el.chatContainer.scrollTo({ top: el.chatContainer.scrollHeight, behavior: 'smooth' });
  });

  // New / Clear chat
  el.newChatBtn.addEventListener('click', () => { STATE.activeConvId = null; showWelcomeScreen(); renderChatHistory(); closeSidebarMobile(); });
  el.clearChatBtn.addEventListener('click', () => {
    if (!STATE.activeConvId) { showToast('No active chat', ''); return; }
    if (!confirm('Clear this conversation?')) return;
    const conv = STATE.conversations[STATE.activeConvId];
    if (conv) { conv.messages = []; saveConversations(); }
    showWelcomeScreen(); showToast('Chat cleared', 'success');
  });

  // Suggestion cards
  el.suggestionGrid.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      el.chatInput.value = card.dataset.prompt;
      updateSendBtn(); autoResizeTextarea(); el.chatInput.focus();
      setMode('build');
    });
  });

  // Model selector — fixed-position dropdown that escapes sidebar overflow
  el.modelSelector.addEventListener('click', () => {
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
  });

  // Settings
  el.settingsBtn.addEventListener('click', () => {
    document.getElementById('historyDrawer')?.classList.remove('open');
    document.getElementById('moreMenu')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('active');
    el.ollamaUrl.value = STATE.ollamaUrl;
    el.systemPrompt.value = STATE.systemPrompt;
    el.temperature.value = STATE.temperature; el.tempLabel.textContent = STATE.temperature;
    el.maxTokens.value = STATE.maxTokens; el.maxTokensLabel.textContent = STATE.maxTokens;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === STATE.theme));

    // Populate Appearance tab controls from STATE
    const fsEl  = document.getElementById('settingsFontSize');
    const dEl   = document.getElementById('settingsDensity');
    const chEl  = document.getElementById('settingsCodeHighlight');
    const mdEl  = document.getElementById('settingsMarkdown');
    const rpEl  = document.getElementById('settingsRepeatPenalty');
    const tpEl  = document.getElementById('settingsTopP');
    const csEl  = document.getElementById('settingsContextSize');
    if (fsEl)  fsEl.value    = STATE.fontSize    || '14px';
    if (dEl)   dEl.value     = STATE.density     || 'normal';
    if (chEl)  chEl.checked  = STATE.codeHL      !== false;
    if (mdEl)  mdEl.checked  = STATE.markdown    !== false;
    if (rpEl)  { rpEl.value  = STATE.repeatPenalty || 1.1; const l = document.getElementById('repeatPenaltyLabel'); if(l) l.textContent = parseFloat(rpEl.value).toFixed(2); }
    if (tpEl)  { tpEl.value  = STATE.topP        || 0.92;  const l = document.getElementById('topPLabel');          if(l) l.textContent = parseFloat(tpEl.value).toFixed(2); }
    if (csEl)  csEl.value    = STATE.contextSize || 4096;

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

  // Sidebar mobile
  el.sidebarToggle.addEventListener('click', () => {
    el.sidebar.classList.toggle('open');
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay'; document.body.appendChild(overlay);
      overlay.addEventListener('click', () => { el.sidebar.classList.remove('open'); overlay.classList.remove('active'); });
    }
    overlay.classList.toggle('active', el.sidebar.classList.contains('open'));
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
  document.getElementById('railMoreBtn')?.addEventListener('click', openMoreMenu);
  document.getElementById('moreMenuClose')?.addEventListener('click', closeUtilityPanels);
  document.getElementById('railSettingsBtn')?.addEventListener('click', () => el.settingsBtn.click());
  document.getElementById('moreTrainingBtn')?.addEventListener('click', () => {
    closeUtilityPanels();
    openTrainingModal();
  });
  appScrim?.addEventListener('click', closeUtilityPanels);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.metaKey||e.ctrlKey) && e.key === 'k') { e.preventDefault(); STATE.activeConvId = null; showWelcomeScreen(); renderChatHistory(); el.chatInput.focus(); }
    if (e.key === 'Escape') {
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

  // TTS — button opens voice settings; long-press or separate icon to toggle
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
  el.ttsClose?.addEventListener('click',      () => closeModal('ttsModal'));
  el.ttsModal?.addEventListener('click', e => { if (e.target === el.ttsModal) closeModal('ttsModal'); });
  $('ttsCancelBtn')?.addEventListener('click', () => closeModal('ttsModal'));

  el.ttsTestBtn?.addEventListener('click', () => {
    const sample = "Hey there! This is Hazy speaking — your local AI assistant by Dream On.";
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
      _piperSession     = null;   // destroy old session so new voice is actually loaded
      _piperLoadedVoice = null;
      _piperLoading     = false;
      STATE.tpsPiperReady   = false;
      STATE.ttsPiperLoading = false;
      updatePiperStatus('idle', 'Voice changed — click Enable Voice to load');
    }
  });

  el.ttsSpeedRange?.addEventListener('input', () => {
    STATE.ttsSpeed = parseFloat(el.ttsSpeedRange.value);
    if (el.ttsSpeedLabel) el.ttsSpeedLabel.textContent = STATE.ttsSpeed.toFixed(1) + '×';
  });

  $('ttsSaveBtn')?.addEventListener('click', async () => {
    STATE.ttsEnabled = true;
    STATE.ttsVoice   = el.ttsVoiceSelect?.value || 'en_US-lessac-medium';
    STATE.ttsSpeed   = parseFloat(el.ttsSpeedRange?.value || '1.0');

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
    document.body.classList.remove('builder-open');
  });
  el.builderPreviewToggle.addEventListener('click', () => showBuilderPreview(!STATE.builderPreviewVisible));
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

  // ── Persona ──────────────────────────────────────
  el.personaBtn?.addEventListener('click', () => openPersonaModal());
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
  });}

// ========================
// Persona Modal
// ========================
function openPersonaModal() {
  // Sync state → UI
  if (el.personaToggle)        el.personaToggle.checked        = STATE.personaEnabled;
  if (el.personaNameInput)     el.personaNameInput.value       = STATE.personaName;
  if (el.personaUserNameInput) el.personaUserNameInput.value   = STATE.personaUserName;
  if (el.personaGender)        el.personaGender.value          = STATE.personaGender;
  if (el.personaLanguage)      el.personaLanguage.value        = STATE.personaLanguage;
  if (el.scenarioDesc)         el.scenarioDesc.value           = STATE.scenarioDesc;
  if (el.scenarioOpener)       el.scenarioOpener.value         = STATE.scenarioOpener;
  if (el.scenarioUserRole)     el.scenarioUserRole.value       = STATE.scenarioUserRole;
  if (el.scenarioCharRole)     el.scenarioCharRole.value       = STATE.scenarioCharRole;

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

function savePersona() {
  const selectedCard = document.querySelector('.persona-card.selected');
  STATE.personaRelation  = selectedCard?.dataset.relation        || 'friend';
  STATE.personaEnabled   = el.personaToggle?.checked             ?? true;
  STATE.personaName      = el.personaNameInput?.value.trim()     || 'Alex';
  STATE.personaUserName  = el.personaUserNameInput?.value.trim() || '';
  STATE.personaGender    = el.personaGender?.value               || 'neutral';
  STATE.personaLanguage  = el.personaLanguage?.value             || 'casual';
  STATE.personaTraits    = Array.from(document.querySelectorAll('.trait-pill.selected')).map(p => p.dataset.trait);
  STATE.scenarioDesc     = el.scenarioDesc?.value.trim()         || '';
  STATE.scenarioOpener   = el.scenarioOpener?.value.trim()       || '';
  STATE.scenarioUserRole = el.scenarioUserRole?.value.trim()     || '';
  STATE.scenarioCharRole = el.scenarioCharRole?.value.trim()     || '';

  // Persist everything
  const s = JSON.parse(localStorage.getItem('hazy_settings') || '{}');
  Object.assign(s, {
    personaEnabled: STATE.personaEnabled, personaRelation: STATE.personaRelation,
    personaName: STATE.personaName, personaUserName: STATE.personaUserName,
    personaGender: STATE.personaGender, personaTraits: STATE.personaTraits,
    personaLanguage: STATE.personaLanguage, scenarioDesc: STATE.scenarioDesc,
    scenarioOpener: STATE.scenarioOpener, scenarioUserRole: STATE.scenarioUserRole,
    scenarioCharRole: STATE.scenarioCharRole, scenarioSetting: STATE.scenarioSetting,
  });
  localStorage.setItem('hazy_settings', JSON.stringify(s));

  updatePersonaBadge();
  closeModal('personaModal');

  if (STATE.personaEnabled) {
    const preset = PERSONA_PRESETS[STATE.personaRelation];
    showToast(`${STATE.personaName} — starting scene...`, 'success');

    // Start a new chat and inject the opener automatically
    STATE.activeConvId = null;
    showWelcomeScreen();
    renderChatHistory();

    setTimeout(() => {
      // Create the conversation and immediately have the character open the scene
      const id = 'conv_' + Date.now();
      const title = STATE.scenarioDesc
        ? STATE.scenarioDesc.slice(0, 50) + '…'
        : `${STATE.personaName} — ${preset?.label || 'Chat'}`;
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
  if (el.ttsSpeedRange)  el.ttsSpeedRange.value  = STATE.ttsSpeed;
  if (el.ttsSpeedLabel)  el.ttsSpeedLabel.textContent = STATE.ttsSpeed.toFixed(1) + '×';

  // Show current Piper status
  if (STATE.tpsPiperReady)        updatePiperStatus('ready',   '✅ Piper model loaded and ready');
  else if (STATE.ttsPiperLoading) updatePiperStatus('loading', 'Loading Piper model…');
  else                            updatePiperStatus('idle',    'Select a voice above then click Enable Voice');

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
  const response    = document.getElementById('trainResponse').value.trim();
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
  if (status) status.textContent = 'Asking AI to extract pairs…';

  const prompt = `You are a training data generator. Read the text below and extract 5-15 question-answer pairs from it for fine-tuning a language model.

Return ONLY a JSON array like this (no extra text, no markdown):
[{"instruction":"question here","response":"answer here"},...]

Text:
${text.slice(0, 3000)}`;

  try {
    const savedModel    = localStorage.getItem('hazyActiveModel') || ('ollama/' + STATE.model);
    const savedProvider = savedModel.split('/')[0] || 'ollama';
    const isCloud       = ['anthropic','openai','groq','gemini'].includes(savedProvider);
    const localApiKey   = isCloud ? (localStorage.getItem('hazyKey_' + savedProvider) || '') : '';
    const trainEndpoint = window.location.protocol === 'file:' ? `${STATE.ollamaUrl}/api/chat` : '/hazy/chat';
    const trainBody     = window.location.protocol === 'file:'
      ? { model: STATE.model, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.3, num_predict: 2048 } }
      : { model: savedModel, apiKey: localApiKey || undefined, messages: [{ role: 'user', content: prompt }], stream: false, options: { temperature: 0.3, num_predict: 2048, max_tokens: 2048 } };

    const res = await fetch(trainEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trainBody),
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    let raw = (data.message?.content || '').trim();
    // Strip markdown fences if model wrapped it
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/,'').trim();
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
  } catch(e) {
    if (status) status.textContent = 'Failed — try "Add as Raw Text" instead';
    showToast('AI extraction failed: ' + e.message, 'error');
  }
}

function renderTrainChatList() {
  const container = document.getElementById('trainChatList');
  if (!container) return;
  const convs = Object.entries(STATE.conversations)
    .sort(([,a],[,b]) => (b.createdAt||0) - (a.createdAt||0));
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
    // Pair user → assistant messages
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].role === 'user' && msgs[i+1].role === 'assistant') {
        TRAINING.pairs.push({
          type: 'qa',
          instruction: msgs[i].content,
          response: msgs[i+1].content,
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
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px 0;">No data yet — add pairs from the other tabs.</p>';
    return;
  }
  container.innerHTML = TRAINING.pairs.map((p, i) => `
    <div class="train-pair-item">
      <button class="train-pair-delete" onclick="trainDeletePair(${i})">✕</button>
      ${p.type === 'raw'
        ? `<span class="train-pair-label">raw text</span>
           <span class="train-pair-q">${escapeHtml(p.raw.slice(0, 200))}${p.raw.length > 200 ? '…' : ''}</span>`
        : `<span class="train-pair-label">instruction</span>
           <span class="train-pair-q">${escapeHtml(p.instruction.slice(0, 150))}${p.instruction.length > 150 ? '…' : ''}</span>
           <span class="train-pair-label" style="margin-top:4px;">response</span>
           <span class="train-pair-a">${escapeHtml(p.response.slice(0, 150))}${p.response.length > 150 ? '…' : ''}</span>`
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

// ── Wire up training modal events ─────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════
// HAZY v2 — AI PROVIDERS PANEL + SETTINGS TABS
// Single clean implementation — no duplicates
// ════════════════════════════════════════════════════════════════

// ── Provider data ──────────────────────────────────────────────
const PROVIDER_CATEGORIES = {
  text: [
    { key:'anthropic',  name:'Anthropic (Claude)',       url:'https://console.anthropic.com',          note:'Claude Haiku, Sonnet, Opus — best for novel writing' },
    { key:'openai',     name:'OpenAI (GPT-4o / DALL-E)', url:'https://platform.openai.com/api-keys',   note:'GPT-4o, o1, DALL-E 3, TTS — requires paid plan' },
    { key:'groq',       name:'Groq (Fast Free Tier)',    url:'https://console.groq.com',               note:'Llama 3.1 70B at incredible speed — free tier available' },
    { key:'gemini',     name:'Google Gemini',            url:'https://aistudio.google.com/app/apikey', note:'Gemini 1.5 Pro — 1M token context window' },
  ],
  image: [
    { key:'stability',  name:'Stability AI',            url:'https://platform.stability.ai',          note:'Stable Diffusion XL, ultra quality images' },
    { key:'ideogram',   name:'Ideogram',                url:'https://ideogram.ai',                    note:'Best AI model for text inside images' },
    { key:'fal',        name:'fal.ai (Flux + Kling)',   url:'https://fal.ai',                         note:'Flux image generation + Kling video — fast API' },
  ],
  media: [
    { key:'elevenlabs', name:'ElevenLabs (TTS)',        url:'https://elevenlabs.io',                  note:'Most natural AI voices — 30+ voices, multilingual' },
    { key:'suno',       name:'Suno (AI Music)',         url:'https://suno.com',                       note:'Generate full songs from text — cloud only' },
    { key:'runway',     name:'Runway (AI Video)',       url:'https://runwayml.com',                   note:'Gen-3 video generation — cloud only' },
  ],
};

const OLLAMA_MODEL_LIST = [
  {id:'ollama/llama3.2:1b',  label:'llama3.2:1b (1B — fastest)'},
  {id:'ollama/llama3.2',     label:'llama3.2 (3B — recommended)'},
  {id:'ollama/llama3',       label:'llama3 (8B)'},
  {id:'ollama/mistral',      label:'mistral (7B — best writing)'},
  {id:'ollama/mixtral',      label:'mixtral (47B — best quality)'},
  {id:'ollama/gemma2',       label:'gemma2 (9B)'},
  {id:'ollama/phi3',         label:'phi3 (3.8B)'},
  {id:'ollama/qwen2.5',      label:'qwen2.5 (7B)'},
  {id:'ollama/deepseek-r1',  label:'deepseek-r1 (7B)'},
  {id:'ollama/llava',        label:'llava (7B vision)'},
];

const CLOUD_MODEL_MAP = {
  anthropic: [
    {id:'anthropic/claude-haiku-4-5-20251001',  label:'Claude Haiku 4.5 — fastest'},
    {id:'anthropic/claude-sonnet-4-5-20250929', label:'Claude Sonnet 4.5 — recommended'},
    {id:'anthropic/claude-opus-4-5-20251101',   label:'Claude Opus 4.5 — most capable'},
    {id:'anthropic/claude-sonnet-4-20250514',   label:'Claude Sonnet 4'},
    {id:'anthropic/claude-opus-4-20250514',     label:'Claude Opus 4'},
  ],
  openai: [
    {id:'openai/gpt-4o-mini',     label:'GPT-4o Mini — fastest'},
    {id:'openai/gpt-4o',          label:'GPT-4o — recommended'},
    {id:'openai/gpt-4.1',         label:'GPT-4.1'},
    {id:'openai/gpt-4.1-mini',    label:'GPT-4.1 Mini'},
    {id:'openai/o4-mini',         label:'o4 Mini — reasoning'},
    {id:'openai/o3',              label:'o3 — best reasoning'},
  ],
  groq: [
    {id:'groq/llama-3.1-8b-instant',                          label:'Llama 3.1 8B — fastest'},
    {id:'groq/llama-3.3-70b-versatile',                       label:'Llama 3.3 70B — recommended'},
    {id:'groq/meta-llama/llama-4-scout-17b-16e-instruct',     label:'Llama 4 Scout 17B — newest'},
    {id:'groq/moonshotai/kimi-k2-instruct',                   label:'Kimi K2 — 60 RPM'},
    {id:'groq/qwen/qwen3-32b',                                label:'Qwen3 32B — 60 RPM'},
    {id:'groq/openai/gpt-oss-120b',                           label:'GPT OSS 120B'},
    {id:'groq/openai/gpt-oss-20b',                            label:'GPT OSS 20B'},
    {id:'groq/compound',                                      label:'Compound (preview)'},
    {id:'groq/compound-mini',                                 label:'Compound Mini (preview)'},
    {id:'groq/allam-2-7b',                                    label:'Allam 2 7B'},
  ],
  gemini: [
    {id:'gemini/gemini-2.0-flash',   label:'Gemini 2.0 Flash (recommended)'},
    {id:'gemini/gemini-2.5-flash',   label:'Gemini 2.5 Flash (latest)'},
    {id:'gemini/gemini-1.5-pro',     label:'Gemini 1.5 Pro (1M ctx)'},
  ],
};

let _providerStatuses = {};

// ── Single initProvidersPanel ───────────────────────────────────
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

      // Sync: if server says a key exists but localStorage doesn't have it,
      // mark it with a sentinel so the UI shows it as active.
      // If localStorage HAS the real key already, keep that — it's more accurate.
      Object.entries(serverStatuses).forEach(([k, v]) => {
        const localKey = localStorage.getItem('hazyKey_' + k);
        if (v.hasKey && !localKey) {
          // Server has it but we don't — mark as server-held
          localStorage.setItem('hazyKey_' + k, '__server__');
        } else if (!v.hasKey && localKey) {
          // Server lost it — clear local too
          localStorage.removeItem('hazyKey_' + k);
        }
      });
      gotFromServer = true;
    }
  } catch { /* server not running */ }

  if (!gotFromServer) {
    // Fallback: build from localStorage — only treat as active if key is non-empty
    _providerStatuses = {};
    const allProviders = [
      ...PROVIDER_CATEGORIES.text,
      ...PROVIDER_CATEGORIES.image,
      ...PROVIDER_CATEGORIES.media,
    ];
    allProviders.forEach(p => {
      const key = localStorage.getItem('hazyKey_' + p.key) || '';
      // A real key exists if it's non-empty AND not just the sentinel
      const hasRealKey = !!key;
      _providerStatuses[p.key] = { hasKey: hasRealKey, enabled: hasRealKey };
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

// ── Provider status bar ─────────────────────────────────────────
function renderProviderStatusBar() {
  const bar = document.getElementById('providerStatusBar');
  if (!bar) return;
  const active = Object.entries(_providerStatuses)
    .filter(([k, v]) => v.enabled && k !== 'ollama')
    .map(([k]) => k);
  bar.innerHTML = active.length
    ? active.map(k => `<span style="font-size:10px;font-family:var(--font-mono,monospace);padding:2px 8px;border-radius:10px;background:#e8f5e9;color:#2d6a4f;border:1px solid #b0d8b8">&#10003; ${k}</span>`).join('')
    : '<span style="font-size:11px;color:var(--text-muted)">No cloud providers active yet — add an API key below.</span>';
}

// ── Categorized provider rows ───────────────────────────────────
function renderCategorizedProviders() {
  const renderGroup = (containerId, providers) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = providers.map(p => {
      const st     = _providerStatuses[p.key] || {};
      const hasKey = st.hasKey || !!localStorage.getItem('hazyKey_' + p.key);
      return `<div class="provider-key-row">
        <div class="provider-key-row-head">
          <span class="provider-key-name">${p.name}</span>
          ${(() => {
            const verified = localStorage.getItem('hazyVerified_' + p.key) === 'true';
            if (hasKey && verified)  return '<span class="provider-badge-active">&#10003; verified</span>';
            if (hasKey && !verified) return '<span class="provider-badge-saved">● saved — test it</span>';
            return '<span class="provider-badge-inactive">inactive</span>';
          })()}
          <a href="${p.url}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;margin-left:4px">Get key &#8599;</a>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${p.note}</div>
        <div class="provider-key-input-row">
          <input type="password" id="apikey_${p.key}"
            placeholder="${hasKey ? '●●●●●●●● (saved — paste new to update)' : 'Paste API key here...'}"
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
  renderGroup('providerKeyRows',   PROVIDER_CATEGORIES.text);
  renderGroup('providerImageRows', PROVIDER_CATEGORIES.image);
  renderGroup('providerMediaRows', PROVIDER_CATEGORIES.media);
}

// ── Save / clear key — server first, localStorage fallback ─────
function getApiKey(provider) {
  return localStorage.getItem('hazyKey_' + provider) || '';
}

async function saveProviderKey(providerKey) {
  const input = document.getElementById('apikey_' + providerKey);
  if (!input) return;
  const apiKey = input.value.trim();

  if (!apiKey) {
    showToast('Please paste an API key first', 'error');
    return;
  }

  // ── Step 1: Save key to server (hazy-config.json) ──────────────────────
  let savedToServer = false;
  try {
    const r = await fetch('/hazy/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: providerKey, apiKey }),
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.ok) savedToServer = true;
    }
  } catch { /* server not running */ }

  // ── Step 2: Store the REAL key in localStorage ──────────────────────────
  localStorage.setItem('hazyKey_' + providerKey, apiKey);
  localStorage.setItem('hazyProvider', providerKey);

  // ── Step 3: Clear old verification — new key must be re-tested ───────────
  localStorage.removeItem('hazyVerified_' + providerKey);

  input.value = '';
  const where = savedToServer ? 'server' : 'local';
  showToast(`Key saved (${where}). Click TEST to verify it works.`, 'success');

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
  } catch {}
  localStorage.removeItem('hazyKey_' + key);
  localStorage.removeItem('hazyVerified_' + key);
  showToast(key + ' key removed.', '');
  await initProvidersPanel();
}

// ── Test provider key — sends a real minimal API call to verify ──────────
async function testProviderKey(providerKey) {
  const btn    = document.getElementById('testBtn_' + providerKey);
  const result = document.getElementById('testResult_' + providerKey);
  if (!btn || !result) return;

  btn.textContent = 'Testing...';
  btn.disabled = true;
  result.style.display = 'block';
  result.style.color = 'var(--text-muted)';
  result.textContent = '⏳ Sending test message...';

  try {
    // Send a tiny real request through /hazy/chat
    // This goes through the server which uses the real key from hazy-config.json
    const models   = CLOUD_MODEL_MAP[providerKey] || [];
    const testModel = (models[0] || {}).id || (providerKey + '/test');

    // Get key from localStorage — server will use this directly
    const testApiKey = localStorage.getItem('hazyKey_' + providerKey) || '';

    const r = await fetch('/hazy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model:    testModel,
        stream:   true,
        apiKey:   testApiKey || undefined,
        messages: [
          { role: 'user', content: 'Say "OK" and nothing else.' }
        ],
        options: { max_tokens: 10, temperature: 0 },
      }),
    });

    // ── Check HTTP status — server now forwards real upstream error codes ──
    if (!r.ok) {
      let errMsg = 'Authentication failed';
      try {
        const e = await r.json();
        errMsg = e.error || errMsg;
      } catch {}
      result.style.color = 'var(--danger)';
      result.textContent = '❌ ' + r.status + ' — ' + errMsg;
      return;
    }

    // ── Read the stream and look for REAL content vs error tokens ──────────
    const reader  = r.body.getReader();
    const decoder = new TextDecoder();
    let rawBuffer  = '';
    let realToken  = '';   // actual AI text token
    let streamErr  = '';   // error found inside stream
    let tries      = 0;

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
        } catch {}
      }
    }
    reader.cancel();

    if (streamErr) {
      // Got an error inside the stream — bad key
      result.style.color = 'var(--danger)';
      result.textContent = '❌ Key rejected — ' + streamErr;
      return;
    }

    if (realToken) {
      // ✅ Got a real AI token — key is genuinely working
      localStorage.setItem('hazyVerified_' + providerKey, 'true');

      const models    = CLOUD_MODEL_MAP[providerKey] || [];
      const bestModel = models[1] || models[0];
      if (bestModel) {
        localStorage.setItem('hazyActiveModel', bestModel.id);
        localStorage.setItem('hazyProvider',    providerKey);
        STATE.model = bestModel.id;
        if (el && el.currentModelName) {
          el.currentModelName.textContent = bestModel.id.split('/')[1] || bestModel.id;
        }
      }

      result.style.color = 'var(--success)';
      result.textContent = '✅ Verified! ' + providerKey + ' responded. Model auto-selected.';
      showToast('✅ ' + providerKey + ' verified and active!', 'success');

      checkOllamaConnection();
      await initProvidersPanel();

    } else {
      // Connected but got no content and no error — unexpected
      result.style.color = 'var(--warning)';
      result.textContent = '⚠️ No response token received — try again or check your quota.';
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      result.style.color = 'var(--danger)';
      result.textContent = '❌ Timeout — server may not be running or key is invalid.';
    } else {
      result.style.color = 'var(--danger)';
      result.textContent = '❌ ' + err.message;
    }
  } finally {
    btn.textContent = 'Test';
    btn.disabled = false;
  }
}

// ── Installed local models ──────────────────────────────────────
async function loadInstalledModels() {
  const el = document.getElementById('installedModelsList');
  if (!el) return;

  const ollamaBase = (document.getElementById('ollamaUrlProvider')?.value || '').trim().replace(/\/$/, '')
    || (typeof STATE !== 'undefined' && STATE.ollamaUrl)
    || 'http://localhost:11434';

  let data = null;
  for (const url of ['/api/tags', ollamaBase + '/api/tags']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { data = await r.json(); break; }
    } catch { }
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
      const modelSel   = document.getElementById('activeModelSelect');
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
    await fetch('/hazy/delete-model', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ model: name }) });
    showToast(name + ' deleted.', 'success');
    await loadInstalledModels();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function testOllamaConn() {
  const urlEl    = document.getElementById('ollamaUrlProvider');
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

// ── Model download ──────────────────────────────────────────────
async function pullModel() {
  const sel  = document.getElementById('pullModelSelect');
  const btn  = document.getElementById('pullModelBtn');
  const wrap = document.getElementById('pullProgressWrap');
  const bar  = document.getElementById('pullProgressBar');
  const txt  = document.getElementById('pullProgressText');
  if (!sel || !btn) return;
  const modelName = sel.value;
  btn.disabled = true; btn.textContent = 'Downloading...';
  if (wrap) wrap.style.display = 'block';
  try {
    const r = await fetch('/hazy/pull', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ model: modelName }) });
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
        } catch {}
      }
    }
    showToast(modelName + ' downloaded!', 'success');
    await loadInstalledModels();
  } catch (e) {
    showToast('Download failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '↓ Download';
    if (wrap) wrap.style.display = 'none';
    if (bar)  bar.style.width = '0%';
  }
}

// ── Active model selector (Novel Writer tab) ────────────────────
function updateModelDropdown() {
  const prov = document.getElementById('activeProviderSelect')?.value || 'ollama';
  const sel  = document.getElementById('activeModelSelect');
  if (!sel) return;
  if (prov === 'ollama') {
    sel.innerHTML = OLLAMA_MODEL_LIST.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    // Try to load actual installed models
    fetch('/api/tags').then(r => r.json()).then(d => {
      if (d.models?.length) sel.innerHTML = d.models.map(m => `<option value="ollama/${m.name}">ollama/${m.name}</option>`).join('');
      const saved = localStorage.getItem('hazyActiveModel');
      if (saved) sel.value = saved;
    }).catch(() => {});
  } else {
    const list = CLOUD_MODEL_MAP[prov] || [];
    sel.innerHTML = list.length
      ? list.map(m => `<option value="${m.id}">${m.label}</option>`).join('')
      : '<option value="">— add API key first —</option>';
    const saved = localStorage.getItem('hazyActiveModel');
    if (saved?.startsWith(prov + '/')) sel.value = saved;
  }
}

function restoreActiveModel() {
  const saved = localStorage.getItem('hazyActiveModel');
  if (!saved) return;
  const prov    = saved.split('/')[0];
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
  const provSel  = document.getElementById('activeProviderSelect');
  const modelSel = document.getElementById('activeModelSelect');
  if (!provSel || !modelSel || !modelSel.value) return;
  const fullModel = modelSel.value; // e.g. 'anthropic/claude-sonnet-4-5' or 'ollama/mistral'
  localStorage.setItem('hazyActiveModel', fullModel);
  localStorage.setItem('hazyProvider',    provSel.value);

  // Update STATE.model — for Ollama strip prefix, for cloud keep full id
  const provider  = fullModel.split('/')[0];
  const modelId   = fullModel.includes('/') ? fullModel.slice(fullModel.indexOf('/') + 1) : fullModel;
  if (provider === 'ollama') {
    STATE.model = modelId;
  } else {
    // Cloud provider — store the full 'provider/model' string so sendMessage can route
    STATE.model = fullModel;
  }

  // Update sidebar model name display
  if (typeof el !== 'undefined' && el.currentModelName) {
    el.currentModelName.textContent = modelId;
  }

  const hasKey = provider !== 'ollama' ? !!localStorage.getItem('hazyKey_' + provider) : true;
  if (!hasKey) {
    showToast('⚠️ No API key for ' + provider + ' — add it in Settings → AI Providers', 'error');
  } else {
    showToast('Model set to ' + modelId, 'success');
  }
}

// ── Export all data ─────────────────────────────────────────────
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

// ── Settings tab switching ──────────────────────────────────────
function switchSettingsTab(tabId) {
  document.querySelectorAll('.snav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.snav-btn[data-tab="${tabId}"]`);
  const panel = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

// ── ollamaUrl sync between General tab and Models tab ──────────
function syncOllamaUrlFields(sourceId) {
  const val = document.getElementById(sourceId)?.value || '';
  const targets = ['ollamaUrl', 'ollamaUrlProvider'].filter(id => id !== sourceId);
  targets.forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
}

// ── Single DOMContentLoaded for ALL v2 additions ───────────────
document.addEventListener('DOMContentLoaded', () => {
  // Settings tab clicks
  document.querySelectorAll('.snav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
  });

  // Appearance tab — live preview as user changes values
  document.getElementById('settingsFontSize')?.addEventListener('change', () => {
    STATE.fontSize = document.getElementById('settingsFontSize').value;
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
  // Generation tab — live label updates
  document.getElementById('settingsRepeatPenalty')?.addEventListener('input', e => {
    const lbl = document.getElementById('repeatPenaltyLabel');
    if (lbl) lbl.textContent = parseFloat(e.target.value).toFixed(2);
  });
  document.getElementById('settingsTopP')?.addEventListener('input', e => {
    const lbl = document.getElementById('topPLabel');
    if (lbl) lbl.textContent = parseFloat(e.target.value).toFixed(2);
  });

  // Open settings → init providers panel
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    setTimeout(initProvidersPanel, 80);
  });

  // Save settings → also save active model choice
  const saveBtn = document.getElementById('settingsSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveActiveModelChoice);
  }

  // Sync ollamaUrl fields
  document.getElementById('ollamaUrl')?.addEventListener('input', () => syncOllamaUrlFields('ollamaUrl'));
  document.getElementById('ollamaUrlProvider')?.addEventListener('input', () => syncOllamaUrlFields('ollamaUrlProvider'));

  // Novel Writer tab — active provider change
  document.getElementById('activeProviderSelect')?.addEventListener('change', updateModelDropdown);
});
