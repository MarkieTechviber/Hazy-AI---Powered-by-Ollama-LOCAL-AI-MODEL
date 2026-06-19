'use strict';

const path = require('path');

const STACK_HINTS = [
  { name: 'package.json', language: 'javascript', frameworks: ['Node.js'], points: 40 },
  { name: 'tsconfig.json', language: 'typescript', frameworks: ['TypeScript'], points: 60 },
  { name: 'vite.config.js', language: 'javascript', frameworks: ['Vite'], points: 36 },
  { name: 'vite.config.ts', language: 'typescript', frameworks: ['Vite'], points: 42 },
  { name: 'next.config.js', language: 'javascript', frameworks: ['Next.js'], points: 36 },
  { name: 'next.config.mjs', language: 'javascript', frameworks: ['Next.js'], points: 36 },
  { name: 'next.config.ts', language: 'typescript', frameworks: ['Next.js'], points: 42 },
  { name: 'requirements.txt', language: 'python', frameworks: ['Python'], points: 45 },
  { name: 'pyproject.toml', language: 'python', frameworks: ['Python'], points: 55 },
  { name: 'pom.xml', language: 'java', frameworks: ['Maven'], points: 45 },
  { name: 'build.gradle', language: 'java', frameworks: ['Gradle'], points: 35 },
  { name: 'build.gradle.kts', language: 'kotlin', frameworks: ['Gradle'], points: 45 },
  { name: 'cargo.toml', language: 'rust', frameworks: ['Cargo'], points: 50 },
  { name: 'go.mod', language: 'go', frameworks: ['Go'], points: 50 },
  { name: 'composer.json', language: 'php', frameworks: ['Composer'], points: 45 },
  { name: 'firebase.json', language: 'javascript', frameworks: ['Firebase'], points: 24 },
  { name: 'tailwind.config.js', language: 'javascript', frameworks: ['Tailwind CSS'], points: 20 },
  { name: 'tailwind.config.ts', language: 'typescript', frameworks: ['Tailwind CSS'], points: 24 }
];

const EXT_TO_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', java: 'java',
  kt: 'kotlin', kts: 'kotlin', rs: 'rust', go: 'go', php: 'php',
  rb: 'ruby', cs: 'csharp', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c',
  swift: 'swift', sql: 'sql', dart: 'dart', html: 'html', css: 'css',
  vue: 'javascript', svelte: 'javascript'
};

const GENERATED_OR_VENDOR_PATTERN = /(^|[\\/])(node_modules|\.git|dist|build|coverage|\.next|\.vite|\.venv|venv|__pycache__|vendor|target|\.cache)([\\/]|$)/i;

const DEPENDENCY_FRAMEWORKS = {
  react: { framework: 'React', language: 'typescript', points: 28 },
  vite: { framework: 'Vite', language: 'typescript', points: 22 },
  next: { framework: 'Next.js', language: 'typescript', points: 35 },
  'next.js': { framework: 'Next.js', language: 'typescript', points: 35 },
  express: { framework: 'Express.js', language: 'javascript', points: 30 },
  fastify: { framework: 'Fastify', language: 'typescript', points: 26 },
  '@nestjs/core': { framework: 'NestJS', language: 'typescript', points: 36 },
  typescript: { framework: 'TypeScript', language: 'typescript', points: 45 },
  tailwindcss: { framework: 'Tailwind CSS', language: 'typescript', points: 12 },
  '@vitejs/plugin-react': { framework: 'React', language: 'typescript', points: 24 },
  firebase: { framework: 'Firebase', language: 'javascript', points: 18 },
  better_sqlite3: { framework: 'SQLite', language: 'javascript', points: 12 },
  'better-sqlite3': { framework: 'SQLite', language: 'javascript', points: 12 },
  pytest: { framework: 'pytest', language: 'python', points: 18 },
  fastapi: { framework: 'FastAPI', language: 'python', points: 30 },
  flask: { framework: 'Flask', language: 'python', points: 28 },
  django: { framework: 'Django', language: 'python', points: 32 }
};

function safeJsonParse(raw) {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAttachments(attachments = []) {
  return attachments
    .filter(Boolean)
    .map((file) => {
      const name = String(file.name || file.path || '');
      return {
        name,
        category: String(file.category || ''),
        ext: String(file.ext || path.extname(name).slice(1)).toLowerCase(),
        sizeBytes: Number(file.sizeBytes || file.size || 0),
        contentPreview: String(file.contentPreview || file.content || '').slice(0, 20000)
      };
    })
    .filter((file) => !GENERATED_OR_VENDOR_PATTERN.test(file.name));
}

function addScore(scoreboard, language, points, reason) {
  if (!language) return;
  if (!scoreboard[language]) {
    scoreboard[language] = { score: 0, reasons: [] };
  }
  scoreboard[language].score += points;
  scoreboard[language].reasons.push(reason);
}

function addFramework(frameworks, framework) {
  if (framework) frameworks.add(framework);
}

function collectPackageJsonSignals(file, scoreboard, frameworks, evidence) {
  const parsed = safeJsonParse(file.contentPreview);
  if (!parsed) return;

  const allDeps = {
    ...(parsed.dependencies || {}),
    ...(parsed.devDependencies || {}),
    ...(parsed.peerDependencies || {}),
    ...(parsed.optionalDependencies || {})
  };

  for (const dep of Object.keys(allDeps)) {
    const exact = DEPENDENCY_FRAMEWORKS[dep];
    if (exact) {
      addScore(scoreboard, exact.language, exact.points, `Dependency ${dep}`);
      addFramework(frameworks, exact.framework);
      evidence.push(`${file.name}:${dep}`);
    }
  }

  if (parsed.workspaces || /packages\/\*/i.test(file.contentPreview)) {
    addFramework(frameworks, 'Monorepo');
    evidence.push(file.name);
  }
  if (parsed.scripts?.test) addFramework(frameworks, 'Test scripts');
  if (parsed.scripts?.dev) addFramework(frameworks, 'Dev server');
}

function scanImports(file, scoreboard, frameworks) {
  const preview = file.contentPreview;
  const importPatterns = [
    { regex: /from\s+['"]react['"]|require\(['"]react['"]\)/i, language: file.ext === 'tsx' || file.ext === 'ts' ? 'typescript' : 'javascript', points: 25, framework: 'React', reason: 'React import detected' },
    { regex: /from\s+['"]express['"]|require\(['"]express['"]\)/i, language: 'javascript', points: 24, framework: 'Express.js', reason: 'Express import detected' },
    { regex: /from\s+['"]zod['"]|require\(['"]zod['"]\)/i, language: 'typescript', points: 12, framework: 'Zod', reason: 'Zod validation detected' },
    { regex: /import\s+FastAPI|from\s+fastapi\s+import/i, language: 'python', points: 26, framework: 'FastAPI', reason: 'FastAPI import detected' },
    { regex: /from\s+flask\s+import|import\s+flask/i, language: 'python', points: 24, framework: 'Flask', reason: 'Flask import detected' }
  ];

  for (const item of importPatterns) {
    if (item.regex.test(preview)) {
      addScore(scoreboard, item.language, item.points, item.reason);
      addFramework(frameworks, item.framework);
    }
  }
}

function determineProjectType(frameworks, files) {
  const names = new Set(files.map((file) => path.basename(file.name).toLowerCase()));
  const hasFrontend = frameworks.has('React') || frameworks.has('Vite') || frameworks.has('Next.js') || files.some((file) => ['html', 'css', 'tsx', 'jsx'].includes(file.ext));
  const hasBackend = frameworks.has('Express.js') || frameworks.has('FastAPI') || files.some((file) => /server|controller|route|api/i.test(file.name));

  if (frameworks.has('Monorepo')) return 'monorepo';
  if (hasFrontend && hasBackend) return 'full-stack-web-app';
  if (hasFrontend) return 'frontend-web-app';
  if (hasBackend) return 'backend-service';
  if (names.has('pyproject.toml') || names.has('requirements.txt')) return 'python-project';
  if (names.has('go.mod')) return 'go-project';
  if (names.has('cargo.toml')) return 'rust-project';
  return 'general-software-project';
}

// ============================================================================
// NEW: Caller Analysis – find which files import which
// ============================================================================

function findCallers(files) {
  const callers = {};
  // Build a map of file basename to full filename
  const basenameMap = {};
  for (const file of files) {
    const basename = path.basename(file.name);
    basenameMap[basename] = file.name;
  }

  for (const file of files) {
    const content = file.contentPreview;
    // Find import/require statements
    const imports = content.match(/from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/gi) || [];
    for (const imp of imports) {
      // Extract the module path
      const match = imp.match(/['"]([^'"]+)['"]/);
      if (!match) continue;
      const modulePath = match[1];
      // Try to resolve relative paths
      let targetFile = null;
      if (modulePath.startsWith('.')) {
        // Relative import – assume extension omitted, try .js,.ts,.py etc.
        const dir = path.dirname(file.name);
        const base = path.basename(modulePath, path.extname(modulePath));
        for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.kt']) {
          const candidate = path.join(dir, base + ext);
          if (files.some(f => f.name === candidate)) {
            targetFile = candidate;
            break;
          }
        }
      } else {
        // Try to match a file with that basename
        const baseName = path.basename(modulePath);
        if (basenameMap[baseName]) {
          targetFile = basenameMap[baseName];
        } else if (basenameMap[modulePath + '.js']) {
          targetFile = basenameMap[modulePath + '.js'];
        } else if (basenameMap[modulePath + '.ts']) {
          targetFile = basenameMap[modulePath + '.ts'];
        }
      }
      if (targetFile && targetFile !== file.name) {
        if (!callers[targetFile]) callers[targetFile] = [];
        if (!callers[targetFile].includes(file.name)) {
          callers[targetFile].push(file.name);
        }
      }
    }
  }
  return callers;
}

// ============================================================================
// Main scanProjectContext (improved)
// ============================================================================

function scanProjectContext({ attachments = [], messages = [], currentProject = null } = {}) {
  const files = normalizeAttachments(attachments);

  let activeFilesForScan = [];
  if (currentProject && Array.isArray(currentProject.files)) {
    activeFilesForScan = currentProject.files.map(f => ({
      name: f.filename || 'unknown',
      category: 'code',
      ext: String((f.filename || '').split('.').pop() || '').toLowerCase(),
      sizeBytes: (f.content || '').length,
      contentPreview: String(f.content || '').slice(0, 20000)
    }));
  }
  const allScanFiles = [...files, ...activeFilesForScan];

  const scoreboard = {};
  const frameworks = new Set();
  const evidence = [];
  const ignoredCount = Math.max(0, (attachments || []).filter(Boolean).length - files.length);

  for (const file of allScanFiles) {
    const loweredName = file.name.toLowerCase();
    const baseName = path.basename(loweredName);

    for (const hint of STACK_HINTS) {
      if (baseName === hint.name || loweredName.endsWith(`/${hint.name}`) || loweredName.endsWith(`\\${hint.name}`)) {
        addScore(scoreboard, hint.language, hint.points || 40, `Detected ${hint.name}`);
        hint.frameworks.forEach((framework) => frameworks.add(framework));
        evidence.push(file.name);
      }
    }

    if (file.ext && EXT_TO_LANG[file.ext]) {
      const extPoints = ['ts', 'tsx'].includes(file.ext) ? 14 : 8;
      addScore(scoreboard, EXT_TO_LANG[file.ext], extPoints, `Found .${file.ext} file`);
      evidence.push(file.name);
    }

    if (baseName === 'package.json') {
      collectPackageJsonSignals(file, scoreboard, frameworks, evidence);
    }

    scanImports(file, scoreboard, frameworks);

    const preview = file.contentPreview.toLowerCase();
    if (preview.includes('<!doctype html') || preview.includes('<html')) {
      addScore(scoreboard, 'html', 12, 'HTML document detected');
    }
    if (/\bdescribe\(|\btest\(|\bit\(/i.test(file.contentPreview) || /\.test\.[jt]sx?$/i.test(file.name)) {
      addFramework(frameworks, 'Test files');
    }
  }

  const latestUserText = [...messages]
    .reverse()
    .find((message) => message?.role === 'user' && typeof message.content === 'string')
    ?.content?.toLowerCase() || '';

  if (latestUserText.includes('react')) frameworks.add('React');
  if (latestUserText.includes('node')) frameworks.add('Node.js');
  if (latestUserText.includes('express')) frameworks.add('Express.js');
  if (latestUserText.includes('typescript')) frameworks.add('TypeScript');

  if (frameworks.has('TypeScript')) {
    addScore(scoreboard, 'typescript', 20, 'TypeScript project marker');
  }

  const sorted = Object.entries(scoreboard).sort((a, b) => b[1].score - a[1].score);
  const primaryLanguage = sorted[0]?.[0] || null;
  const topScore = sorted[0]?.[1]?.score || 0;
  const runnerUpScore = sorted[1]?.[1]?.score || 0;
  const confidence = Math.min(topScore, 99);
  const conflictingSignals = sorted.length > 1 && runnerUpScore >= Math.max(18, topScore * 0.5);
  const projectType = determineProjectType(frameworks, allScanFiles);

  const detectedStack = frameworks.size
    ? Array.from(frameworks).map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')).join('+')
    : 'unknown';

  const hasActiveProject = !!(currentProject && Array.isArray(currentProject.files) && currentProject.files.length > 0);
  const activeProjectFileCount = hasActiveProject ? currentProject.files.length : 0;

  // NEW: Caller analysis
  const callers = findCallers(allScanFiles);

  return {
    detectedStack,
    primaryLanguage,
    frameworks: Array.from(frameworks),
    confidence,
    conflictingSignals,
    evidence: Array.from(new Set(evidence)).slice(0, 15),
    ignoredGeneratedFiles: ignoredCount,
    projectType,
    fileCount: allScanFiles.length,
    languageSignals: sorted.map(([language, data]) => ({
      language,
      score: data.score,
      reasons: data.reasons.slice(0, 6)
    })),
    hasActiveProject,
    activeProjectFileCount,
    activeProjectName: hasActiveProject ? (currentProject.project || 'Project') : undefined,
    // NEW: caller map for impact analysis
    callers
  };
}

module.exports = { scanProjectContext, normalizeAttachments, findCallers };