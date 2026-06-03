'use strict';

const path = require('path');

const STACK_HINTS = [
  { name: 'package.json', language: 'javascript', frameworks: ['Node.js'] },
  { name: 'tsconfig.json', language: 'typescript', frameworks: ['TypeScript'] },
  { name: 'vite.config.js', language: 'javascript', frameworks: ['Vite'] },
  { name: 'vite.config.ts', language: 'typescript', frameworks: ['Vite'] },
  { name: 'next.config.js', language: 'javascript', frameworks: ['Next.js'] },
  { name: 'next.config.mjs', language: 'javascript', frameworks: ['Next.js'] },
  { name: 'requirements.txt', language: 'python', frameworks: ['Python'] },
  { name: 'pyproject.toml', language: 'python', frameworks: ['Python'] },
  { name: 'pom.xml', language: 'java', frameworks: ['Maven'] },
  { name: 'build.gradle', language: 'kotlin', frameworks: ['Gradle'] },
  { name: 'build.gradle.kts', language: 'kotlin', frameworks: ['Gradle'] },
  { name: 'cargo.toml', language: 'rust', frameworks: ['Cargo'] },
  { name: 'go.mod', language: 'go', frameworks: ['Go'] },
  { name: 'composer.json', language: 'php', frameworks: ['Composer'] },
  { name: 'firebase.json', language: 'javascript', frameworks: ['Firebase'] },
  { name: 'tailwind.config.js', language: 'javascript', frameworks: ['Tailwind CSS'] },
  { name: 'tailwind.config.ts', language: 'typescript', frameworks: ['Tailwind CSS'] }
];

const EXT_TO_LANG = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  rs: 'rust',
  go: 'go',
  php: 'php',
  rb: 'ruby',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  swift: 'swift',
  sql: 'sql',
  dart: 'dart',
  html: 'html',
  css: 'css',
  vue: 'javascript',
  svelte: 'javascript'
};

function normalizeAttachments(attachments = []) {
  return attachments
    .filter(Boolean)
    .map((file) => ({
      name: String(file.name || ''),
      category: String(file.category || ''),
      ext: String(file.ext || path.extname(file.name || '').slice(1)).toLowerCase(),
      contentPreview: String(file.contentPreview || file.content || '').slice(0, 12000)
    }));
}

function addScore(scoreboard, language, points, reason) {
  if (!language) return;
  if (!scoreboard[language]) {
    scoreboard[language] = { score: 0, reasons: [] };
  }
  scoreboard[language].score += points;
  scoreboard[language].reasons.push(reason);
}

function scanProjectContext({ attachments = [], messages = [] } = {}) {
  const files = normalizeAttachments(attachments);
  const scoreboard = {};
  const frameworks = new Set();
  const evidence = [];

  for (const file of files) {
    const loweredName = file.name.toLowerCase();

    for (const hint of STACK_HINTS) {
      if (loweredName.endsWith(hint.name)) {
        addScore(scoreboard, hint.language, 40, `Detected ${hint.name}`);
        hint.frameworks.forEach((framework) => frameworks.add(framework));
        evidence.push(file.name);
      }
    }

    if (file.ext && EXT_TO_LANG[file.ext]) {
      addScore(scoreboard, EXT_TO_LANG[file.ext], 8, `Found .${file.ext} file`);
      evidence.push(file.name);
    }

    const preview = file.contentPreview.toLowerCase();
    if (preview.includes('"react"') || preview.includes('from "react"') || preview.includes("from 'react'")) {
      addScore(scoreboard, file.ext === 'ts' || file.ext === 'tsx' ? 'typescript' : 'javascript', 25, 'React import detected');
      frameworks.add('React');
    }
    if (preview.includes('"express"') || preview.includes("require('express')") || preview.includes('from "express"')) {
      addScore(scoreboard, 'javascript', 20, 'Express dependency detected');
      frameworks.add('Express.js');
    }
    if (preview.includes('"vite"') || preview.includes("'vite'")) {
      addScore(scoreboard, file.ext === 'ts' ? 'typescript' : 'javascript', 18, 'Vite config detected');
      frameworks.add('Vite');
    }
    if (preview.includes('<!doctype html') || preview.includes('<html')) {
      addScore(scoreboard, 'html', 12, 'HTML document detected');
    }
  }

  const latestUserText = [...messages]
    .reverse()
    .find((message) => message?.role === 'user' && typeof message.content === 'string')
    ?.content?.toLowerCase() || '';

  if (latestUserText.includes('react')) frameworks.add('React');
  if (latestUserText.includes('node')) frameworks.add('Node.js');
  if (latestUserText.includes('express')) frameworks.add('Express.js');

  const sorted = Object.entries(scoreboard).sort((a, b) => b[1].score - a[1].score);
  const primaryLanguage = sorted[0]?.[0] || null;
  const confidence = Math.min(sorted[0]?.[1]?.score || 0, 99);

  let projectType = 'general-software-project';
  if (frameworks.has('Node.js') && (frameworks.has('React') || frameworks.has('Vite'))) {
    projectType = 'web-app';
  } else if (frameworks.has('Python')) {
    projectType = 'python-project';
  } else if (frameworks.has('Express.js')) {
    projectType = 'node-backend';
  }

  const detectedStack = frameworks.size
    ? Array.from(frameworks).map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')).join('+')
    : 'unknown';

  return {
    detectedStack,
    primaryLanguage,
    frameworks: Array.from(frameworks),
    confidence,
    evidence: Array.from(new Set(evidence)).slice(0, 10),
    projectType,
    languageSignals: sorted.map(([language, data]) => ({
      language,
      score: data.score,
      reasons: data.reasons.slice(0, 5)
    }))
  };
}

module.exports = { scanProjectContext };
