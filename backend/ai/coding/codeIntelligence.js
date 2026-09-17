/**
 * ============================================================================
 * HAZY CODE INTELLIGENCE ENGINE
 * backend/ai/codeIntelligence.js
 * ============================================================================
 *
 * HOW TOP AI MODELS HANDLE CODING (Claude Opus, GPT-4, Gemini Ultra):
 * ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
 * They don't use a dropdown or hardcoded if/else chains. Instead they use:
 *
 *  1. FULL CONTEXT READING  ÔÇö they read the ENTIRE conversation, not just
 *     the last message. If you said "import pandas" 6 turns ago, they know
 *     you're in Python now.
 *
 *  2. MULTI-SIGNAL INFERENCE ÔÇö they combine: explicit language mentions,
 *     framework clues, domain clues, file extensions in context, OS clues,
 *     and what language has appeared in prior code blocks.
 *
 *  3. STRUCTURED PRE-REASONING ÔÇö before writing code, they reason about
 *     the architecture, the best tool for the job, and the right idioms.
 *     This is similar to chain-of-thought. They don't just "start coding".
 *
 *  4. LANGUAGE-AWARE STYLE INJECTION ÔÇö they don't write generic code.
 *     They write Python like Python (list comprehensions, type hints, PEP 8),
 *     Go like Go (table-driven tests, explicit errors), Rust like Rust
 *     (Result<T,E>, ownership patterns). The idioms are different per language.
 *
 *  5. TASK-AWARE STRUCTURE ÔÇö "write a REST API" gets different structure
 *     than "write an algorithm" or "write a CLI tool". The output shape
 *     adapts to the task type, not just the language.
 *
 * For LOCAL MODELS (Mistral, Llama3, Qwen) ÔÇö which are weaker at implicit
 * reasoning ÔÇö you need to make all of this EXPLICIT in the system prompt.
 * That's exactly what this engine does: it analyzes the request, figures
 * out all the right context, and injects it into a dynamic prompt so even
 * a weaker local model can produce expert-level, idiomatic code.
 *
 * ============================================================================
 */

'use strict';

// ============================================================================
// SIGNAL REGISTRY ÔÇö Ordered by confidence weight (0-100)
// ============================================================================

/**
 * Explicit language keywords ÔÇö highest confidence.
 * These are things the user literally says.
 */
const EXPLICIT_LANG_SIGNALS = {
  'python':        { lang: 'python',     weight: 99 },
  'py script':     { lang: 'python',     weight: 98 },
  'in python':     { lang: 'python',     weight: 99 },
  'using python':  { lang: 'python',     weight: 99 },
  'javascript':    { lang: 'javascript', weight: 99 },
  'in javascript': { lang: 'javascript', weight: 99 },
  'typescript':    { lang: 'typescript', weight: 99 },
  'in typescript': { lang: 'typescript', weight: 99 },
  'golang':        { lang: 'go',         weight: 99 },
  'in go':         { lang: 'go',         weight: 97 },
  'go lang':       { lang: 'go',         weight: 99 },
  'rust':          { lang: 'rust',       weight: 99 },
  'in rust':       { lang: 'rust',       weight: 99 },
  'java':          { lang: 'java',       weight: 98 },
  'in java':       { lang: 'java',       weight: 99 },
  'kotlin':        { lang: 'kotlin',     weight: 99 },
  'in kotlin':     { lang: 'kotlin',     weight: 99 },
  'swift':         { lang: 'swift',      weight: 99 },
  'in swift':      { lang: 'swift',      weight: 99 },
  'c#':            { lang: 'csharp',     weight: 99 },
  'c sharp':       { lang: 'csharp',     weight: 99 },
  'in c#':         { lang: 'csharp',     weight: 99 },
  'c++':           { lang: 'cpp',        weight: 99 },
  'cpp':           { lang: 'cpp',        weight: 95 },
  'in c++':        { lang: 'cpp',        weight: 99 },
  'ruby':          { lang: 'ruby',       weight: 99 },
  'in ruby':       { lang: 'ruby',       weight: 99 },
  'php':           { lang: 'php',        weight: 99 },
  'in php':        { lang: 'php',        weight: 99 },
  'dart':          { lang: 'dart',       weight: 99 },
  'in dart':       { lang: 'dart',       weight: 99 },
  'bash':          { lang: 'bash',       weight: 99 },
  'shell script':  { lang: 'bash',       weight: 99 },
  'in bash':       { lang: 'bash',       weight: 99 },
  'powershell':    { lang: 'powershell', weight: 99 },
  'sql':           { lang: 'sql',        weight: 99 },
  'in sql':        { lang: 'sql',        weight: 99 },
  'haskell':       { lang: 'haskell',    weight: 99 },
  'elixir':        { lang: 'elixir',     weight: 99 },
  'scala':         { lang: 'scala',      weight: 99 },
  'lua':           { lang: 'lua',        weight: 99 },
  'r language':    { lang: 'r',          weight: 98 },
  'using r':       { lang: 'r',          weight: 92 },
  'assembly':      { lang: 'asm',        weight: 99 },
  'fortran':       { lang: 'fortran',    weight: 99 },
  'cobol':         { lang: 'cobol',      weight: 99 },
  'matlab':        { lang: 'matlab',     weight: 99 },
};

/**
 * Framework/library signals ÔÇö very high confidence.
 * If someone mentions "Django", they're writing Python. No ambiguity.
 */
const FRAMEWORK_SIGNALS = {
  // ÔöÇÔöÇ Python ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'django':          { lang: 'python',     weight: 97, frameworks: ['Django'] },
  'flask':           { lang: 'python',     weight: 97, frameworks: ['Flask'] },
  'fastapi':         { lang: 'python',     weight: 97, frameworks: ['FastAPI'] },
  'pandas':          { lang: 'python',     weight: 95, frameworks: ['Pandas'] },
  'numpy':           { lang: 'python',     weight: 95, frameworks: ['NumPy'] },
  'matplotlib':      { lang: 'python',     weight: 95, frameworks: ['Matplotlib'] },
  'seaborn':         { lang: 'python',     weight: 95, frameworks: ['Seaborn'] },
  'pytorch':         { lang: 'python',     weight: 97, frameworks: ['PyTorch'] },
  'tensorflow':      { lang: 'python',     weight: 97, frameworks: ['TensorFlow'] },
  'keras':           { lang: 'python',     weight: 95, frameworks: ['Keras'] },
  'sklearn':         { lang: 'python',     weight: 95, frameworks: ['scikit-learn'] },
  'scikit-learn':    { lang: 'python',     weight: 97, frameworks: ['scikit-learn'] },
  'hugging face':    { lang: 'python',     weight: 97, frameworks: ['Hugging Face'] },
  'transformers':    { lang: 'python',     weight: 90, frameworks: ['Hugging Face Transformers'] },
  'pydantic':        { lang: 'python',     weight: 93, frameworks: ['Pydantic'] },
  'sqlalchemy':      { lang: 'python',     weight: 95, frameworks: ['SQLAlchemy'] },
  'celery':          { lang: 'python',     weight: 95, frameworks: ['Celery'] },
  'pytest':          { lang: 'python',     weight: 93, frameworks: ['pytest'] },
  'asyncio':         { lang: 'python',     weight: 85, frameworks: ['asyncio'] },
  'aiohttp':         { lang: 'python',     weight: 95, frameworks: ['aiohttp'] },
  'beautifulsoup':   { lang: 'python',     weight: 97, frameworks: ['BeautifulSoup'] },
  'scrapy':          { lang: 'python',     weight: 97, frameworks: ['Scrapy'] },
  'selenium':        { lang: 'python',     weight: 85, frameworks: ['Selenium'] },
  'playwright':      { lang: 'python',     weight: 80, frameworks: ['Playwright'] },
  'langchain':       { lang: 'python',     weight: 95, frameworks: ['LangChain'] },
  'llamaindex':      { lang: 'python',     weight: 95, frameworks: ['LlamaIndex'] },
  'streamlit':       { lang: 'python',     weight: 97, frameworks: ['Streamlit'] },
  'gradio':          { lang: 'python',     weight: 97, frameworks: ['Gradio'] },
  'polars':          { lang: 'python',     weight: 95, frameworks: ['Polars'] },
  'dask':            { lang: 'python',     weight: 95, frameworks: ['Dask'] },

  // ÔöÇÔöÇ JavaScript / TypeScript ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'react':           { lang: 'typescript', weight: 85, frameworks: ['React'] },
  'nextjs':          { lang: 'typescript', weight: 95, frameworks: ['Next.js'] },
  'next.js':         { lang: 'typescript', weight: 95, frameworks: ['Next.js'] },
  'vue':             { lang: 'typescript', weight: 85, frameworks: ['Vue.js'] },
  'nuxt':            { lang: 'typescript', weight: 93, frameworks: ['Nuxt.js'] },
  'angular':         { lang: 'typescript', weight: 97, frameworks: ['Angular'] },
  'svelte':          { lang: 'javascript', weight: 90, frameworks: ['Svelte'] },
  'sveltekit':       { lang: 'typescript', weight: 95, frameworks: ['SvelteKit'] },
  'express':         { lang: 'javascript', weight: 88, frameworks: ['Express.js'] },
  'nestjs':          { lang: 'typescript', weight: 97, frameworks: ['NestJS'] },
  'fastify':         { lang: 'typescript', weight: 90, frameworks: ['Fastify'] },
  'deno':            { lang: 'typescript', weight: 95, frameworks: ['Deno'] },
  'bun':             { lang: 'typescript', weight: 90, frameworks: ['Bun'] },
  'prisma':          { lang: 'typescript', weight: 92, frameworks: ['Prisma'] },
  'trpc':            { lang: 'typescript', weight: 97, frameworks: ['tRPC'] },
  'graphql':         { lang: 'typescript', weight: 80, frameworks: ['GraphQL'] },
  'apollo':          { lang: 'typescript', weight: 88, frameworks: ['Apollo'] },
  'vite':            { lang: 'typescript', weight: 85, frameworks: ['Vite'] },
  'vitest':          { lang: 'typescript', weight: 90, frameworks: ['Vitest'] },
  'tailwind':        { lang: 'typescript', weight: 75, frameworks: ['Tailwind CSS'] },
  'shadcn':          { lang: 'typescript', weight: 95, frameworks: ['shadcn/ui'] },
  'zod':             { lang: 'typescript', weight: 90, frameworks: ['Zod'] },
  'zustand':         { lang: 'typescript', weight: 92, frameworks: ['Zustand'] },
  'redux':           { lang: 'typescript', weight: 85, frameworks: ['Redux'] },

  // ÔöÇÔöÇ Java / Kotlin / JVM ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'spring':          { lang: 'java',    weight: 88, frameworks: ['Spring'] },
  'spring boot':     { lang: 'java',    weight: 97, frameworks: ['Spring Boot'] },
  'hibernate':       { lang: 'java',    weight: 93, frameworks: ['Hibernate'] },
  'maven':           { lang: 'java',    weight: 85, frameworks: ['Maven'] },
  'gradle':          { lang: 'kotlin',  weight: 75, frameworks: ['Gradle'] },
  'ktor':            { lang: 'kotlin',  weight: 97, frameworks: ['Ktor'] },
  'jetpack compose': { lang: 'kotlin',  weight: 99, frameworks: ['Jetpack Compose'] },
  'coroutines':      { lang: 'kotlin',  weight: 90, frameworks: ['Kotlin Coroutines'] },
  'quarkus':         { lang: 'java',    weight: 97, frameworks: ['Quarkus'] },
  'micronaut':       { lang: 'java',    weight: 97, frameworks: ['Micronaut'] },

  // ÔöÇÔöÇ C# / .NET ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'asp.net':         { lang: 'csharp', weight: 97, frameworks: ['ASP.NET Core'] },
  'blazor':          { lang: 'csharp', weight: 99, frameworks: ['Blazor'] },
  'unity':           { lang: 'csharp', weight: 99, frameworks: ['Unity'] },
  '.net maui':       { lang: 'csharp', weight: 99, frameworks: ['.NET MAUI'] },
  'wpf':             { lang: 'csharp', weight: 99, frameworks: ['WPF'] },
  'winforms':        { lang: 'csharp', weight: 99, frameworks: ['WinForms'] },
  'entity framework':{ lang: 'csharp', weight: 97, frameworks: ['Entity Framework'] },
  'xamarin':         { lang: 'csharp', weight: 99, frameworks: ['Xamarin'] },
  'signalr':         { lang: 'csharp', weight: 97, frameworks: ['SignalR'] },

  // ÔöÇÔöÇ Go ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'gin':             { lang: 'go', weight: 97, frameworks: ['Gin'] },
  'fiber':           { lang: 'go', weight: 97, frameworks: ['Fiber'] },
  'echo':            { lang: 'go', weight: 97, frameworks: ['Echo'] },
  'goroutine':       { lang: 'go', weight: 90, frameworks: [] },
  'go channel':      { lang: 'go', weight: 92, frameworks: [] },
  'grpc':            { lang: 'go', weight: 80, frameworks: ['gRPC'] },
  'gorm':            { lang: 'go', weight: 97, frameworks: ['GORM'] },
  'cobra':           { lang: 'go', weight: 97, frameworks: ['Cobra'] },

  // ÔöÇÔöÇ Rust ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'tokio':           { lang: 'rust', weight: 99, frameworks: ['Tokio'] },
  'actix':           { lang: 'rust', weight: 99, frameworks: ['Actix-web'] },
  'axum':            { lang: 'rust', weight: 99, frameworks: ['Axum'] },
  'cargo':           { lang: 'rust', weight: 92, frameworks: [] },
  'serde':           { lang: 'rust', weight: 97, frameworks: ['Serde'] },
  'bevy':            { lang: 'rust', weight: 99, frameworks: ['Bevy (game engine)'] },
  'tauri':           { lang: 'rust', weight: 97, frameworks: ['Tauri'] },
  'warp':            { lang: 'rust', weight: 99, frameworks: ['Warp'] },

  // ÔöÇÔöÇ Mobile ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'swiftui':         { lang: 'swift', weight: 99, frameworks: ['SwiftUI'] },
  'uikit':           { lang: 'swift', weight: 99, frameworks: ['UIKit'] },
  'combine':         { lang: 'swift', weight: 95, frameworks: ['Combine'] },
  'flutter':         { lang: 'dart',  weight: 99, frameworks: ['Flutter'] },

  // ÔöÇÔöÇ Ruby ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'rails':           { lang: 'ruby', weight: 97, frameworks: ['Ruby on Rails'] },
  'ruby on rails':   { lang: 'ruby', weight: 99, frameworks: ['Ruby on Rails'] },
  'sinatra':         { lang: 'ruby', weight: 99, frameworks: ['Sinatra'] },
  'rspec':           { lang: 'ruby', weight: 95, frameworks: ['RSpec'] },

  // ÔöÇÔöÇ PHP ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  'laravel':         { lang: 'php', weight: 99, frameworks: ['Laravel'] },
  'symfony':         { lang: 'php', weight: 99, frameworks: ['Symfony'] },
  'wordpress':       { lang: 'php', weight: 97, frameworks: ['WordPress'] },
  'composer':        { lang: 'php', weight: 90, frameworks: ['Composer'] },
};

/**
 * Domain signals ÔÇö medium confidence.
 * The domain of the task implies a language preference.
 */
const DOMAIN_SIGNALS = {
  // Data Science / ML / AI ÔåÆ Python
  'machine learning':          { lang: 'python', weight: 88 },
  'deep learning':             { lang: 'python', weight: 90 },
  'neural network':            { lang: 'python', weight: 88 },
  'data science':              { lang: 'python', weight: 88 },
  'data analysis':             { lang: 'python', weight: 82 },
  'data visualization':        { lang: 'python', weight: 78 },
  'natural language processing':{ lang: 'python', weight: 88 },
  'nlp model':                 { lang: 'python', weight: 88 },
  'computer vision':           { lang: 'python', weight: 88 },
  'model training':            { lang: 'python', weight: 88 },
  'jupyter notebook':          { lang: 'python', weight: 92 },
  'data pipeline':             { lang: 'python', weight: 80 },
  'etl':                       { lang: 'python', weight: 78 },
  'web scraping':              { lang: 'python', weight: 78 },
  'web crawler':               { lang: 'python', weight: 78 },
  'automation script':         { lang: 'python', weight: 78 },

  // Systems / Embedded / Low-level ÔåÆ C, C++, Rust
  'embedded system':           { lang: 'c',      weight: 88 },
  'microcontroller':           { lang: 'c',      weight: 92 },
  'arduino':                   { lang: 'c',      weight: 94 },
  'kernel module':             { lang: 'c',      weight: 92 },
  'device driver':             { lang: 'c',      weight: 88 },
  'game engine':               { lang: 'cpp',    weight: 82 },
  'systems programming':       { lang: 'rust',   weight: 78 },
  'memory safe':               { lang: 'rust',   weight: 80 },
  'high performance':          { lang: 'rust',   weight: 72 },
  'zero cost abstraction':     { lang: 'rust',   weight: 90 },

  // Mobile
  'ios app':                   { lang: 'swift',  weight: 90 },
  'iphone app':                { lang: 'swift',  weight: 92 },
  'macos app':                 { lang: 'swift',  weight: 88 },
  'android app':               { lang: 'kotlin', weight: 90 },
  'cross platform mobile':     { lang: 'dart',   weight: 80 },

  // Database ÔåÆ SQL
  'sql query':                 { lang: 'sql',        weight: 92 },
  'database schema':           { lang: 'sql',        weight: 88 },
  'stored procedure':          { lang: 'sql',        weight: 92 },
  'database migration':        { lang: 'sql',        weight: 85 },

  // Scientific ÔåÆ Python or R
  'statistical analysis':      { lang: 'r',      weight: 78 },
  'regression model':          { lang: 'r',      weight: 72 },
  'hypothesis test':           { lang: 'r',      weight: 75 },
  'scientific computing':      { lang: 'python', weight: 82 },
  'numerical simulation':      { lang: 'python', weight: 80 },

  // Infrastructure / DevOps ÔåÆ Bash or Go or Python
  'bash script':               { lang: 'bash',   weight: 97 },
  'shell script':              { lang: 'bash',   weight: 97 },
  'cron job':                  { lang: 'bash',   weight: 80 },
  'deployment script':         { lang: 'bash',   weight: 75 },
  'cli tool':                  { lang: 'go',     weight: 75 },
  'command line tool':         { lang: 'go',     weight: 72 },
  'microservice':              { lang: 'go',     weight: 70 },
};

// ============================================================================
// CODE TYPE DETECTION
// ============================================================================

const CODE_TYPE_SIGNALS = {
  algorithm: [
    'sort', 'search', 'binary search', 'dynamic programming', 'dp problem',
    'algorithm', 'data structure', 'linked list', 'binary tree', 'graph traversal',
    'bfs', 'dfs', 'heap', 'priority queue', 'trie', 'hash map', 'sliding window',
    'two pointer', 'divide and conquer', 'greedy', 'backtracking',
    'time complexity', 'space complexity', 'big o',
  ],
  api_backend: [
    'rest api', 'restful', 'api endpoint', 'route', 'controller', 'crud',
    'get request', 'post request', 'put request', 'delete request',
    'webhook', 'api client', 'http client', 'middleware', 'authentication',
    'jwt token', 'oauth', 'api server',
  ],
  frontend_ui: [
    'component', 'ui component', 'button', 'form', 'modal', 'navbar',
    'dashboard', 'landing page', 'portfolio', 'user interface',
    'responsive', 'animation', 'transition', 'theme',
  ],
  cli_tool: [
    'cli', 'command line', 'terminal tool', 'flags', 'arguments', 'subcommand',
    'command line interface', 'interactive shell', 'repl',
  ],
  data_processing: [
    'parse', 'transform', 'aggregate', 'filter data', 'process csv', 'json parser',
    'data cleaning', 'data wrangling', 'pivot', 'group by', 'merge dataset',
  ],
  ml_model: [
    'train model', 'training loop', 'neural network', 'predict', 'classify',
    'regression', 'clustering', 'model evaluation', 'loss function',
    'optimizer', 'epochs', 'batch size', 'fine-tune', 'inference',
  ],
  database: [
    'sql query', 'schema', 'migration', 'orm', 'table', 'index', 'join',
    'stored procedure', 'trigger', 'foreign key', 'transaction',
  ],
  automation: [
    'automate', 'automation', 'cron', 'schedule', 'batch process',
    'file watcher', 'workflow', 'pipeline', 'script',
  ],
  test_suite: [
    'unit test', 'integration test', 'end to end', 'e2e test', 'mock',
    'fixture', 'assertion', 'test coverage', 'test suite', 'tdd',
  ],
  debug_fix: [
    'debug', 'fix this', 'fix the bug', "doesn't work", 'not working',
    'error:', 'exception', 'issue with', 'problem with', 'fix my code',
    'why is this failing', 'broken',
  ],
  refactor: [
    'refactor', 'rewrite', 'improve this code', 'clean up', 'optimize',
    'make it better', 'restructure', 'modernize',
  ],
  web_scraper: [
    'scrape', 'scraper', 'crawl', 'extract data from', 'parse html',
    'website data', 'page content', 'selectors',
  ],
};

// ============================================================================
// LANGUAGE STYLE GUIDES
// These are injected into the system prompt for each detected language.
// This is what makes the AI write IDIOMATIC code, not just generic code.
// ============================================================================

const LANGUAGE_STYLES = {
  python: {
    label: 'Python',
    ext: 'py',
    version: '3.11+',
    paradigm: 'Multi-paradigm (OOP + functional + procedural)',
    style: 'PEP 8, Black formatter, Ruff linter',
    packageManager: 'pip / poetry / uv',
    idioms: [
      'Use list/dict/set comprehensions where they improve clarity',
      'Type hints on ALL function signatures: def foo(x: int) -> str',
      'Prefer dataclasses or Pydantic models for structured data over raw dicts',
      'Use pathlib.Path instead of os.path for filesystem operations',
      'f-strings for string formatting (never % or .format() in new code)',
      'Context managers (with statement) for any resource that needs cleanup',
      'Use Enum classes instead of string/int constants',
      'Generator expressions for large sequences you only iterate once',
      'Use __slots__ in classes where memory matters',
      'Abstract base classes (abc.ABC) or Protocols for interfaces',
    ],
    errorHandling: 'Specific exception types (never bare "except:"). Custom exceptions for domain errors. Log exceptions with context.',
    testStyle: 'pytest with fixtures and parametrize. Test files in tests/ directory.',
    docStyle: 'Google or NumPy docstrings on all public functions/classes.',
    imports: 'Standard library first, third-party second, local last. Separated by blank lines.',
  },
  typescript: {
    label: 'TypeScript',
    ext: 'ts',
    version: '5.x, strict mode',
    paradigm: 'Multi-paradigm (OOP + functional)',
    style: 'ESLint + Prettier, strict tsconfig',
    packageManager: 'pnpm (preferred) / npm / yarn',
    idioms: [
      'ALWAYS enable strict: true in tsconfig.json',
      'Prefer interfaces for object shapes, type aliases for unions/intersections',
      'Never use "any" ÔÇö use "unknown" with type narrowing when type is uncertain',
      'Use generics to avoid code duplication: function identity<T>(x: T): T',
      'Discriminated unions for state management: type State = { status: "loading" } | { status: "done"; data: T }',
      'Readonly<T> and as const for immutable data structures',
      'Use Zod for runtime validation (especially for API responses)',
      'Optional chaining (?.) and nullish coalescing (??) over explicit null checks',
      'const by default, let when reassignment is needed, NEVER var',
      'Named exports over default exports (better refactoring support)',
    ],
    errorHandling: 'Result pattern or typed error classes. Never swallow errors silently.',
    testStyle: 'Vitest (preferred) or Jest with ts-jest.',
    docStyle: 'JSDoc on public APIs. TSDoc for library code.',
    imports: 'ESM imports. Absolute imports with path aliases for large projects.',
  },
  javascript: {
    label: 'JavaScript',
    ext: 'js',
    version: 'ES2023+, ESM',
    paradigm: 'Multi-paradigm (prototypal + functional)',
    style: 'ESLint + Prettier, ESM modules',
    packageManager: 'npm / pnpm / yarn',
    idioms: [
      'const by default, let when needed, never var',
      'Async/await over .then() chains ÔÇö cleaner and easier to debug',
      'Destructuring for function params: function foo({ name, age }) {}',
      'Optional chaining (?.) and nullish coalescing (??)',
      'Array methods (map, filter, reduce, flatMap) over for loops',
      'Template literals for multi-line strings and interpolation',
      'Object.freeze() for constants you want truly immutable',
      'Use structuredClone() for deep copying (Node 17+, modern browsers)',
      'Top-level await in ESM modules',
    ],
    errorHandling: 'try/catch with typed error checks. Custom Error subclasses for domain errors.',
    testStyle: 'Jest or Vitest.',
    docStyle: 'JSDoc comments on public functions.',
    imports: 'ESM (import/export). Avoid CommonJS in new code unless targeting Node <18.',
  },
  go: {
    label: 'Go',
    ext: 'go',
    version: '1.22+',
    paradigm: 'Concurrent, imperative',
    style: 'gofmt (enforced by toolchain), go vet, staticcheck',
    packageManager: 'go modules (go.mod)',
    idioms: [
      'ALWAYS check returned errors ÔÇö never ignore with _',
      'Interfaces are implicit and should be small (1-3 methods max)',
      'Goroutines are cheap; use channels for communication between them',
      'Prefer table-driven tests: []struct{ name, input, want string }{}',
      'defer for cleanup ÔÇö always paired with the resource acquisition',
      'context.Context as the FIRST parameter of every I/O function',
      'Use sync.WaitGroup or errgroup for coordinating goroutines',
      'Avoid global state ÔÇö inject dependencies as function parameters',
      'Errors should be wrapped with context: fmt.Errorf("getting user: %w", err)',
      'Named return values only when they meaningfully document the return',
    ],
    errorHandling: 'Multiple return values (result, error). Sentinel errors with errors.Is(). Custom error types for rich context.',
    testStyle: 'Standard testing package. Table-driven tests. Subtests with t.Run().',
    docStyle: 'GoDoc comments starting with the function name on all exported symbols.',
    imports: 'Standard library, then third-party (separated by blank line). goimports manages automatically.',
  },
  rust: {
    label: 'Rust',
    ext: 'rs',
    version: '2021 edition',
    paradigm: 'Systems, ownership-based, functional',
    style: 'rustfmt + clippy (deny warnings in CI)',
    packageManager: 'cargo',
    idioms: [
      'Use Result<T, E> for ALL fallible operations. Never .unwrap() in production code',
      'Use the ? operator for error propagation ÔÇö it\'s idiomatic and clean',
      'Derive standard traits automatically: #[derive(Debug, Clone, PartialEq, Eq, Hash)]',
      'Use thiserror for defining custom error types in libraries',
      'Use anyhow for application-level error handling (not libraries)',
      'Prefer iterators and adapters (.map(), .filter(), .fold()) over explicit loops',
      'Use Arc<Mutex<T>> for shared mutable state across threads',
      'Prefer owned types (String, Vec) over references for struct fields to simplify lifetimes',
      'Document all public items with ///, including examples in doc tests',
      'Use #[cfg(test)] modules for unit tests, tests/ directory for integration tests',
    ],
    errorHandling: 'thiserror for library errors, anyhow for binary/application errors. All errors must be handled.',
    testStyle: '#[test] in #[cfg(test)] modules. Integration tests in tests/. Doc tests in ///',
    docStyle: '/// rustdoc on all public items. Include code examples in docs.',
    imports: 'use statements at the top. Prefer explicit imports over glob (*) except in preludes.',
  },
  java: {
    label: 'Java',
    ext: 'java',
    version: 'Java 21 (LTS)',
    paradigm: 'OOP, class-based',
    style: 'Google Java Style, Checkstyle',
    packageManager: 'Maven or Gradle',
    idioms: [
      'Records for simple immutable data carriers (Java 16+): record Point(int x, int y) {}',
      'Sealed classes + pattern matching for algebraic types (Java 17+)',
      'var for local type inference where the type is obvious from context',
      'Stream API for collection processing ÔÇö cleaner than explicit loops',
      'Optional<T> instead of returning null ÔÇö forces explicit null handling',
      'Text blocks for multi-line strings (Java 15+)',
      'Pattern matching for instanceof: if (obj instanceof String s) { ... }',
      'Use switch expressions (not statements) for exhaustive matching',
      'Prefer immutable collections (List.of(), Map.of()) for data that doesn\'t change',
    ],
    errorHandling: 'Checked exceptions for recoverable errors. RuntimeException subclasses for programming errors.',
    testStyle: 'JUnit 5 with @Test, @ParameterizedTest. Mockito for mocking.',
    docStyle: 'Javadoc on all public APIs.',
    imports: 'Organized by IDE. Static imports for test assertions only.',
  },
  kotlin: {
    label: 'Kotlin',
    ext: 'kt',
    version: 'Kotlin 2.x',
    paradigm: 'Multi-paradigm (OOP + functional), null-safe',
    style: 'ktlint, Kotlin coding conventions',
    packageManager: 'Gradle (Kotlin DSL)',
    idioms: [
      'Leverage null safety: prefer nullable types (T?) over Java-style null checks',
      'Use data classes for value objects ÔÇö automatic equals/hashCode/copy/toString',
      'Extension functions to add behavior to existing classes cleanly',
      'Coroutines for async ÔÇö suspend functions + Flow instead of callbacks',
      'Sealed classes for exhaustive when expressions',
      'Scope functions (let, run, with, apply, also) where they reduce noise',
      'Companion objects instead of static methods/fields',
      'Use object declarations for singletons',
      'Prefer immutable val over mutable var by default',
    ],
    errorHandling: 'Sealed Result class or runCatching{}. Coroutine exception handling with CoroutineExceptionHandler.',
    testStyle: 'JUnit 5 + MockK for mocking. Kotest for property-based testing.',
    docStyle: 'KDoc (/** */) on public APIs.',
    imports: 'IDE-managed. Star imports discouraged.',
  },
  swift: {
    label: 'Swift',
    ext: 'swift',
    version: 'Swift 5.10 / Swift 6',
    paradigm: 'Multi-paradigm (OOP + protocol-oriented + functional)',
    style: 'SwiftLint, Swift API Design Guidelines',
    packageManager: 'Swift Package Manager (SPM)',
    idioms: [
      'Protocol-oriented design over class inheritance',
      'Optionals for values that might be absent ÔÇö never force-unwrap (!) in production',
      'guard let early exits for optional unwrapping: guard let x = x else { return }',
      'Async/await for asynchronous code (Swift 5.5+) ÔÇö avoid completion handlers in new code',
      'Result<Success, Failure> for synchronous fallible operations',
      'Actors for shared mutable state in concurrent code (Swift 5.5+)',
      'Value types (structs, enums) preferred over reference types (classes)',
      'Codable for JSON serialization/deserialization',
      'Property wrappers (@Published, @State, @Binding) in SwiftUI',
    ],
    errorHandling: 'do/try/catch with typed errors. Never use try! or try? without justification.',
    testStyle: 'XCTest framework. Swift Testing (new, Swift 5.9+) for new projects.',
    docStyle: '/// documentation comments on all public APIs.',
    imports: 'import at the top. Avoid @testable where possible.',
  },
  csharp: {
    label: 'C#',
    ext: 'cs',
    version: 'C# 12 / .NET 8',
    paradigm: 'Multi-paradigm (OOP + functional)',
    style: 'Roslyn analyzers, .editorconfig',
    packageManager: 'NuGet (dotnet CLI)',
    idioms: [
      'Records for immutable data: record Person(string Name, int Age)',
      'Nullable reference types enabled (#nullable enable or in project settings)',
      'LINQ for collection manipulation ÔÇö readable and composable',
      'async/await for all I/O operations. ConfigureAwait(false) in library code',
      'Pattern matching with switch expressions for clean branching',
      'Primary constructors (C# 12) for concise class definitions',
      'Span<T> and Memory<T> for high-performance, low-allocation code',
      'Use IAsyncEnumerable<T> for async streams',
      'Sealed classes where inheritance isn\'t intended (JIT optimization)',
    ],
    errorHandling: 'Custom exception classes inheriting from Exception. Global exception handling middleware in ASP.NET.',
    testStyle: 'xUnit (preferred), NUnit, or MSTest. Moq or NSubstitute for mocking.',
    docStyle: 'XML documentation (///) on all public APIs.',
    imports: 'using directives at top. Global usings in .NET 6+.',
  },
  cpp: {
    label: 'C++',
    ext: 'cpp',
    version: 'C++20 / C++23',
    paradigm: 'Multi-paradigm (OOP + generic + functional)',
    style: 'clang-format, clang-tidy',
    packageManager: 'CMake + vcpkg or Conan',
    idioms: [
      'RAII: resources always tied to object lifetime ÔÇö no naked new/delete',
      'Smart pointers: std::unique_ptr (ownership), std::shared_ptr (shared), never raw owning pointers',
      'Ranges and views (C++20) for lazy, composable collection operations',
      'std::optional<T> for nullable values instead of raw pointers or sentinel values',
      'std::expected<T,E> (C++23) for error handling without exceptions',
      'Concepts (C++20) to constrain templates with readable error messages',
      'constexpr and consteval for compile-time computation',
      'Move semantics and perfect forwarding for zero-cost abstractions',
      'std::span for non-owning views into arrays/vectors',
    ],
    errorHandling: 'Exceptions for truly exceptional conditions. std::expected/std::optional for expected failures.',
    testStyle: 'Google Test (gtest) or Catch2.',
    docStyle: 'Doxygen comments on public APIs.',
    imports: '#include organized: own headers, third-party, standard library.',
  },
  ruby: {
    label: 'Ruby',
    ext: 'rb',
    version: 'Ruby 3.3+',
    paradigm: 'OOP, functional, metaprogramming',
    style: 'RuboCop, Ruby Style Guide',
    packageManager: 'Bundler + RubyGems',
    idioms: [
      'Blocks, procs, and lambdas for functional patterns',
      'Modules for mixins and namespacing',
      'Duck typing over explicit type checking',
      'Symbol-to-proc shorthand: arr.map(&:upcase)',
      'Frozen string literals (# frozen_string_literal: true)',
      'Method chaining for readable pipelines',
      'Struct or Data.define for simple value objects',
    ],
    errorHandling: 'Custom exception classes inheriting from StandardError. rescue specific exceptions.',
    testStyle: 'RSpec with describe/context/it structure. FactoryBot for test data.',
    docStyle: 'YARD documentation for gems and libraries.',
    imports: 'require at top. Autoloading in Rails projects.',
  },
  php: {
    label: 'PHP',
    ext: 'php',
    version: 'PHP 8.3',
    paradigm: 'Multi-paradigm (OOP + procedural)',
    style: 'PHP-CS-Fixer, PSR-12',
    packageManager: 'Composer',
    idioms: [
      'Strict types: declare(strict_types=1) at the top of every file',
      'Type declarations on all function parameters and return types',
      'Named arguments for clarity with many parameters',
      'Enums (PHP 8.1+) instead of class constants',
      'Fibers (PHP 8.1+) for coroutines',
      'Match expressions (PHP 8.0+) instead of switch',
      'Null safe operator (?->) for null-safe method chaining',
      'Constructor property promotion to reduce boilerplate',
    ],
    errorHandling: 'Custom exception hierarchy. Never suppress errors with @. Use set_exception_handler().',
    testStyle: 'PHPUnit with data providers. Pest as a modern alternative.',
    docStyle: 'PHPDoc on all public methods.',
    imports: 'use statements after namespace declaration. PSR-4 autoloading.',
  },
  dart: {
    label: 'Dart',
    ext: 'dart',
    version: 'Dart 3.x',
    paradigm: 'OOP, strongly typed',
    style: 'dart format, dart analyze',
    packageManager: 'pub (dart pub / flutter pub)',
    idioms: [
      'Null safety: prefer non-nullable types; use ? only when null is meaningful',
      'Records for lightweight structured data: (String name, int age)',
      'Pattern matching and sealed classes for exhaustive type handling',
      'Extensions to add methods to existing types',
      'async/await and Stream for reactive patterns',
      'Immutable objects with const constructors where possible',
      'Named parameters for constructors and functions with many arguments',
    ],
    errorHandling: 'Custom Exception classes. Never catch Object or dynamic.',
    testStyle: 'flutter_test / test package. mockito or mocktail for mocking.',
    docStyle: '/// dartdoc on public APIs.',
    imports: 'dart: imports first, package: second, relative last.',
  },
  bash: {
    label: 'Bash',
    ext: 'sh',
    version: 'Bash 5+',
    paradigm: 'Scripting, procedural',
    style: 'ShellCheck clean',
    packageManager: 'N/A (system packages)',
    idioms: [
      'Always start with #!/usr/bin/env bash (not /bin/bash for portability)',
      'set -euo pipefail at the top of every script (exit on error, undefined vars, pipe failures)',
      '"${variable}" not $variable ÔÇö always quote to handle spaces',
      'Use [[ ]] not [ ] for conditionals',
      'readonly for constants: readonly MAX_RETRIES=3',
      'Local variables in functions: local var="value"',
      'Trap for cleanup: trap cleanup EXIT',
      'Heredocs for multi-line strings: cat <<EOF ... EOF',
      'Use command -v instead of which to check if a command exists',
    ],
    errorHandling: 'Explicit exit codes. Trap ERR for error logging. Never ignore exit codes with ||true unless intentional.',
    testStyle: 'bats-core (Bash Automated Testing System).',
    docStyle: 'Comment at top describing purpose, usage, and expected env vars.',
    imports: 'source or . for including other scripts.',
  },
  sql: {
    label: 'SQL',
    ext: 'sql',
    version: 'ANSI SQL / PostgreSQL dialect',
    paradigm: 'Declarative, relational',
    style: 'UPPERCASE keywords, consistent indentation',
    packageManager: 'N/A',
    idioms: [
      'ALWAYS use parameterized queries ÔÇö never string concatenation',
      'Explicit column names in SELECT ÔÇö avoid SELECT *',
      'Use CTEs (WITH clause) for readable complex queries',
      'Index columns used in WHERE, JOIN ON, and ORDER BY',
      'Use EXPLAIN/EXPLAIN ANALYZE to verify query plans',
      'Wrap multi-statement operations in transactions',
      'Use RETURNING in INSERT/UPDATE/DELETE to get affected rows',
      'COALESCE for null handling in expressions',
      'Generated columns for computed values that need indexing',
    ],
    errorHandling: 'Transactions with ROLLBACK on error. Constraint violations as expected error types.',
    testStyle: 'pgTAP for PostgreSQL. Migration tests in CI.',
    docStyle: 'COMMENT ON TABLE/COLUMN for schema documentation.',
    imports: 'N/A',
  },
};

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect what language appears in existing code blocks in the conversation.
 * This is how top AI models "remember" what language they've been working in.
 */
function detectLanguageFromCodeBlocks(conversationHistory = []) {
  const recent = conversationHistory.slice(-15); // last 15 messages
  const langCounts = {};

  for (const msg of recent) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    const matches = content.matchAll(/```(\w+)\s/gi);
    for (const match of matches) {
      const lang = match[1].toLowerCase();
      // Normalize known aliases
      const normalized = normalizeLanguageAlias(lang);
      if (normalized && LANGUAGE_STYLES[normalized]) {
        langCounts[normalized] = (langCounts[normalized] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const [lang, count] = sorted[0];
  return {
    lang,
    confidence: Math.min(40 + count * 12, 72),
    source: 'conversation_code_blocks',
    keyword: `${count} prior code block(s)`,
    frameworks: [],
  };
}

/**
 * Normalize common aliases to canonical language keys.
 */
function normalizeLanguageAlias(raw) {
  const aliases = {
    py: 'python', js: 'javascript', ts: 'typescript',
    jsx: 'typescript', tsx: 'typescript', mjs: 'javascript', cjs: 'javascript',
    rs: 'rust', go: 'go', rb: 'ruby', cs: 'csharp',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c',
    kt: 'kotlin', kts: 'kotlin', swift: 'swift',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    ps1: 'powershell',
    java: 'java', scala: 'scala', groovy: 'groovy',
    dart: 'dart', lua: 'lua', r: 'r',
    hs: 'haskell', ex: 'elixir', exs: 'elixir',
    php: 'php', sql: 'sql', asm: 'asm',
    m: 'matlab', f90: 'fortran', f95: 'fortran',
    cob: 'cobol', cbl: 'cobol',
  };
  return aliases[raw] || (LANGUAGE_STYLES[raw] ? raw : null);
}

function keywordMatches(text, keyword) {
  const escaped = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

/**
 * Main multi-signal language inference.
 * Combines explicit, framework, domain, and conversation signals.
 */
function inferLanguage(message, conversationHistory = []) {
  const lowerMsg = message.toLowerCase();
  const signals = [];

  // 1. Explicit language mentions (highest priority)
  for (const [keyword, signal] of Object.entries(EXPLICIT_LANG_SIGNALS)) {
    if (keywordMatches(lowerMsg, keyword)) {
      signals.push({
        lang: signal.lang,
        weight: signal.weight,
        source: 'explicit_mention',
        keyword,
        frameworks: [],
      });
    }
  }

  // 2. Framework/library signals
  for (const [keyword, signal] of Object.entries(FRAMEWORK_SIGNALS)) {
    if (keywordMatches(lowerMsg, keyword)) {
      signals.push({
        lang: signal.lang,
        weight: signal.weight,
        source: 'framework_detected',
        keyword,
        frameworks: signal.frameworks || [],
      });
    }
  }

  // 3. Domain/task signals
  for (const [keyword, signal] of Object.entries(DOMAIN_SIGNALS)) {
    if (keywordMatches(lowerMsg, keyword)) {
      signals.push({
        lang: signal.lang,
        weight: signal.weight,
        source: 'domain_inferred',
        keyword,
        frameworks: [],
      });
    }
  }

  // 4. Conversation history code block signals
  const historySignal = detectLanguageFromCodeBlocks(conversationHistory);
  if (historySignal) signals.push(historySignal);

  // 5. If user-provided language hint from frontend override
  // (handled in the caller, passed as explicit signal)
  const dedupedSignals = [];
  const strongestExplicitByLang = new Map();
  for (const signal of signals) {
    if (signal.source !== 'explicit_mention') {
      dedupedSignals.push(signal);
      continue;
    }
    const existing = strongestExplicitByLang.get(signal.lang);
    if (!existing || signal.weight > existing.weight) {
      strongestExplicitByLang.set(signal.lang, signal);
    }
  }
  dedupedSignals.push(...strongestExplicitByLang.values());
  signals.length = 0;
  signals.push(...dedupedSignals);

  if (signals.length === 0) {
    return { lang: null, confidence: 0, reason: 'no_signals', frameworks: [], signals: [] };
  }

  // Aggregate by language ÔÇö sum weights, collect frameworks
  const langScores = {};
  for (const signal of signals) {
    if (!langScores[signal.lang]) {
      langScores[signal.lang] = { totalWeight: 0, signals: [], frameworks: new Set() };
    }
    langScores[signal.lang].totalWeight += signal.weight;
    langScores[signal.lang].signals.push(signal);
    (signal.frameworks || []).forEach(f => langScores[signal.lang].frameworks.add(f));
  }

  // Normalize weights ÔÇö explicit signals cap out the score
  const rankedLanguages = Object.entries(langScores)
    .sort((a, b) => b[1].totalWeight - a[1].totalWeight)[0];

  const sortedLanguages = Object.entries(langScores)
    .sort((a, b) => b[1].totalWeight - a[1].totalWeight);
  const [lang, data] = rankedLanguages;
  const runnerUp = sortedLanguages[1] || null;
  const conflictingSignals = Boolean(runnerUp && runnerUp[1].totalWeight >= data.totalWeight * 0.65);
  const confidence = conflictingSignals
    ? Math.min(Math.round(data.totalWeight / 2.5), 74)
    : Math.min(Math.round(data.totalWeight / 1.5), 99);
  const frameworks = [...data.frameworks];
  const topSignal = data.signals.sort((a, b) => b.weight - a.weight)[0];
  const reason = buildInferenceReason(lang, topSignal, frameworks);

  return {
    lang,
    confidence,
    frameworks,
    reason: conflictingSignals
      ? `${reason}; conflicting ${runnerUp[0]} signal also detected`
      : reason,
    signals: data.signals,
    languageSignals: sortedLanguages.map(([language, scoreData]) => ({
      language,
      score: scoreData.totalWeight,
      signalCount: scoreData.signals.length
    })),
    conflictingSignals,
    styleGuide: LANGUAGE_STYLES[lang] || null,
  };
}

function buildInferenceReason(lang, topSignal, frameworks) {
  const label = (LANGUAGE_STYLES[lang] || {}).label || lang;

  switch (topSignal.source) {
    case 'explicit_mention':
      return `${label} ÔÇö explicitly mentioned in the request`;
    case 'framework_detected':
      return `${label} ÔÇö detected framework "${topSignal.keyword}" requires ${label}`;
    case 'domain_inferred':
      return `${label} ÔÇö best-fit language for domain: "${topSignal.keyword}"`;
    case 'conversation_code_blocks':
      return `${label} ÔÇö continuing from conversation context (${topSignal.keyword})`;
    default:
      return `${label}`;
  }
}

/**
 * Detect the TYPE of coding task from the message.
 */
function detectCodeType(message) {
  const lowerMsg = message.toLowerCase();
  const typeCounts = {};

  for (const [type, keywords] of Object.entries(CODE_TYPE_SIGNALS)) {
    for (const kw of keywords) {
      if (lowerMsg.includes(kw)) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'general';
}

/**
 * Estimate the complexity/scale of the coding task.
 */
function estimateComplexity(message) {
  const lower = message.toLowerCase();

  const complexSignals = [
    'production', 'production-grade', 'enterprise', 'full', 'complete', 'entire',
    'multi-file', 'multi-module', 'scalable', 'architecture', 'system', 'platform',
    'with tests', 'with documentation', 'end to end',
  ];
  const simpleSignals = [
    'simple', 'basic', 'quick', 'small', 'short', 'just a', 'only', 'snippet',
    'example', 'demo', 'hello world',
  ];

  const complexScore = complexSignals.filter(s => lower.includes(s)).length;
  const simpleScore = simpleSignals.filter(s => lower.includes(s)).length;

  if (complexScore > simpleScore) return 'complex';
  if (simpleScore > complexScore + 1) return 'simple';
  return 'medium';
}

/**
 * Detect if the user is asking for a code-related task.
 * (Even in chat mode, Hazy should detect coding requests.)
 */
function isCodingRequest(message) {
  const lower = message.toLowerCase();

  const codingVerbs = [
    'write', 'create', 'build', 'make', 'generate', 'implement', 'code',
    'develop', 'program', 'script', 'fix', 'debug', 'refactor', 'optimize',
    'improve', 'add', 'modify', 'update', 'extend',
    'convert', 'translate', 'rewrite', 'deploy',
  ];
  const contextVerbs = ['review', 'explain'];
  const codingNouns = [
    'function', 'class', 'method', 'api', 'algorithm', 'script', 'program',
    'app', 'application', 'module', 'library', 'package', 'component',
    'service', 'endpoint', 'database', 'query', 'schema', 'test', 'code',
    'snippet', 'cli', 'bot', 'parser', 'scraper', 'crawler',
  ];

  const hasVerb = codingVerbs.some(v => {
    // More accurate matching ÔÇö verb must be followed by a space or end of line
    const regex = new RegExp(`\\b${v}\\b`, 'i');
    return regex.test(message);
  });
  const hasNoun = codingNouns.some(n => lower.includes(n));
  const hasContextVerb = contextVerbs.some(v => new RegExp(`\\b${v}\\b`, 'i').test(message));
  const hasCodeBlock = message.includes('```');
  const hasFileExtension = /\.(py|js|ts|go|rs|java|cpp|cs|rb|php|swift|kt|dart|sh|sql)\b/.test(lower);

  return hasVerb || hasNoun || hasCodeBlock || hasFileExtension || (hasContextVerb && (hasNoun || hasCodeBlock || hasFileExtension));
}

// ============================================================================
// TASK TYPE ÔåÆ SPECIFIC GUIDANCE
// This tells the AI HOW to structure the code output for each task type.
// ============================================================================

const TASK_GUIDANCE = {
  algorithm: `
Structure: Problem statement ÔåÆ Time/Space complexity analysis ÔåÆ Implementation ÔåÆ Test cases
- State the Big O complexity (time AND space) clearly in comments
- Show a worked example in comments: input ÔåÆ intermediate steps ÔåÆ output
- Include both a brute-force and optimized approach when there's a meaningful difference
- Test at least: empty input, single element, normal case, edge case`,

  api_backend: `
Structure: Auth strategy ÔåÆ Route definitions ÔåÆ Request validation ÔåÆ Business logic ÔåÆ Response format
- Design RESTful routes with proper HTTP methods and status codes
- Include request/response examples in comments
- Add input validation/sanitization on all endpoints
- Include error response format (consistent JSON error shape)
- Add basic rate limiting consideration in comments if applicable`,

  frontend_ui: `
Structure: Component breakdown ÔåÆ State design ÔåÆ Markup ÔåÆ Styles ÔåÆ Interactions
- Mobile-first responsive design
- Semantic HTML5 elements (header, main, article, section, nav, aside)
- ARIA attributes for accessibility
- Keyboard navigation support
- Loading and error states for async data`,

  cli_tool: `
Structure: Argument parsing ÔåÆ Validation ÔåÆ Core logic ÔåÆ Output formatting
- Use the language's standard argument parsing (argparse, cobra, clap, yargs)
- Include --help documentation with examples
- Clear, human-readable error messages
- Appropriate exit codes (0 = success, 1 = general error, 2 = usage error)
- Support both --flag and -f short forms for common flags`,

  data_processing: `
Structure: Input reading ÔåÆ Validation ÔåÆ Transform ÔåÆ Output
- Handle malformed/missing input gracefully
- Show intermediate data shape in comments at transformation steps
- Support both file and stdin input where practical
- Include progress logging for large datasets
- Validate output schema before writing`,

  ml_model: `
Structure: Data loading ÔåÆ Preprocessing ÔåÆ Model definition ÔåÆ Training loop ÔåÆ Evaluation ÔåÆ Saving
- Proper train/validation/test splits (never leak validation data into training)
- Log metrics every N epochs (loss, accuracy, or domain-specific metrics)
- Save checkpoints and the final model
- Include example inference code
- Document all hyperparameters as named constants at the top`,

  database: `
Structure: Schema design ÔåÆ Index strategy ÔåÆ Query implementation ÔåÆ Error handling
- ALWAYS use parameterized queries ÔÇö never string concatenation (SQL injection prevention)
- Add indexes on columns in WHERE, JOIN ON, and ORDER BY
- Include migration up/down scripts
- Wrap multi-step operations in transactions
- Comment on the query plan for complex queries`,

  automation: `
Structure: Configuration ÔåÆ Dependency check ÔåÆ Core logic ÔåÆ Logging ÔåÆ Error recovery
- Make it idempotent where possible (safe to run multiple times)
- Log what it's doing at each step (INFO level)
- Configuration as named constants at the top, not magic values buried in logic
- Graceful failure: partial success should be detectable and resumable`,

  test_suite: `
Structure: Setup/teardown ÔåÆ Happy path ÔåÆ Edge cases ÔåÆ Error cases ÔåÆ Cleanup
- Test behavior, not implementation (don't test private methods)
- Descriptive test names: "should_return_empty_list_when_no_items_match_filter"
- Each test has ONE assertion focus (single reason to fail)
- Include: empty input, boundary values, invalid input, and concurrent access if relevant
- Mock all external dependencies (network, DB, time)`,

  debug_fix: `
Structure: Root cause analysis ÔåÆ Explanation ÔåÆ Fix ÔåÆ Prevention
- FIRST explain exactly what's causing the bug and WHY (not just what the fix is)
- Show the minimal fix, then show the clean version if they differ
- Explain how to detect this category of bug in the future
- Add a test case that would have caught this bug`,

  refactor: `
Structure: What's wrong ÔåÆ Change plan ÔåÆ Implementation ÔåÆ Verification
- Preserve ALL existing behavior (behavior is the contract, not the code)
- Make changes incrementally and explain the motivation for each
- Show before/after for key changes
- Maintain the same public interface
- Note any performance implications`,

  web_scraper: `
Structure: Target analysis ÔåÆ Request strategy ÔåÆ Parsing ÔåÆ Data extraction ÔåÆ Storage
- Include rate limiting and polite delays between requests
- Handle: network errors, timeouts, HTTP error codes, malformed HTML
- Use CSS selectors or XPath defensively (wrap in try/catch, fallback gracefully)
- Respect Content-Type and encoding
- Document what happens when the page structure changes`,

  general: `
- Lead with approach: 2-3 sentences on what architecture/pattern you chose and why
- Write production-quality code: error handling, edge cases, comments on non-obvious logic
- Structure the code as you would in a real codebase (proper naming, separation of concerns)
- End with: how to run it, dependencies needed, and "what I'd improve with more time"`,
};

// ============================================================================
// DYNAMIC SYSTEM PROMPT GENERATOR
// This is the core ÔÇö it builds a full, context-aware coding system prompt.
// ============================================================================

/**
 * Generate a smart, context-aware system prompt for a coding request.
 * This replaces the static CODE_SYSTEM_PROMPT in the frontend.
 */
function generateSmartCodePrompt({ langResult, codeType, complexity, userHint }) {
  const style = langResult.styleGuide;
  const langLabel = style ? style.label : (langResult.lang || null);
  const hasConfidentLang = langResult.lang && langResult.confidence >= 45;

  let prompt = `You are Hazy ÔÇö a senior software engineer with deep expertise across all major programming languages and paradigms.\n\n`;

  // ÔöÇÔöÇ Language section ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  if (userHint) {
    // User explicitly overrode via the language selector
    prompt += `## LANGUAGE: ${langLabel || userHint} (user-specified override)\n`;
    prompt += `The user explicitly chose this language. Use it exclusively.\n\n`;
  } else if (hasConfidentLang) {
    prompt += `## AUTO-DETECTED LANGUAGE: ${langLabel}\n`;
    prompt += `Detection confidence: ${langResult.confidence}%\n`;
    prompt += `Reason: ${langResult.reason}\n`;
    if (langResult.frameworks.length > 0) {
      prompt += `Detected frameworks: ${langResult.frameworks.join(', ')}\n`;
    }
    prompt += `\nStart your response with: "I'll write this in ${langLabel} because ${langResult.reason.replace(langLabel + ' ÔÇö ', '')}." ÔÇö one sentence, then proceed.\n\n`;
  } else {
    // Low confidence ÔÇö tell the AI to reason about it
    prompt += `## LANGUAGE SELECTION REQUIRED\n`;
    prompt += `No specific language was detected in the request. You must choose the most appropriate language yourself.\n\n`;
    prompt += `How to choose:\n`;
    prompt += `- Web frontend ÔåÆ TypeScript + React/Vue/Svelte\n`;
    prompt += `- Backend API ÔåÆ TypeScript (Node.js) or Python (FastAPI)\n`;
    prompt += `- Data science / ML ÔåÆ Python\n`;
    prompt += `- iOS ÔåÆ Swift. Android ÔåÆ Kotlin. Cross-platform mobile ÔåÆ Flutter (Dart)\n`;
    prompt += `- Systems / performance-critical / embedded ÔåÆ Rust, C, or C++\n`;
    prompt += `- CLI tool / DevOps ÔåÆ Go, Rust, or Python\n`;
    prompt += `- Enterprise / JVM ÔåÆ Java or Kotlin\n\n`;
    prompt += `Start your response with: "I'll use [Language] because [one clear sentence justification]." Then proceed.\n\n`;
  }

  // ÔöÇÔöÇ Language style guide ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  if (style) {
    prompt += `## ${langLabel.toUpperCase()} CODING STANDARDS\n`;
    prompt += `Version: ${style.version}\n`;
    prompt += `Paradigm: ${style.paradigm}\n`;
    prompt += `Style: ${style.style}\n`;
    prompt += `Package manager: ${style.packageManager}\n\n`;

    prompt += `Idiomatic patterns you MUST use:\n`;
    style.idioms.forEach(idiom => {
      prompt += `ÔÇó ${idiom}\n`;
    });
    prompt += `\n`;

    prompt += `Error handling: ${style.errorHandling}\n`;
    prompt += `Test style: ${style.testStyle}\n`;
    prompt += `Documentation: ${style.docStyle}\n\n`;
  }

  // ÔöÇÔöÇ Task type guidance ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  const taskGuidanceText = TASK_GUIDANCE[codeType] || TASK_GUIDANCE.general;
  prompt += `## TASK TYPE: ${codeType.replace(/_/g, ' ').toUpperCase()}\n`;
  prompt += taskGuidanceText.trim() + '\n\n';

  // ÔöÇÔöÇ Complexity guidance ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  prompt += `## SCALE: ${complexity.toUpperCase()}\n`;
  if (complexity === 'simple') {
    prompt += `Keep it focused. A single, clean file is usually right. No unnecessary abstraction. Minimal dependencies.\n\n`;
  } else if (complexity === 'complex') {
    prompt += `Structure this as a real project:\n`;
    prompt += `- Multiple files with clear separation of concerns\n`;
    prompt += `- Configuration separate from logic\n`;
    prompt += `- Include at least one test file\n`;
    prompt += `- Document how the files connect to each other\n\n`;
  } else {
    prompt += `Balanced: complete and correct, but don't over-engineer. Good structure, no unnecessary layers.\n\n`;
  }

  // ÔöÇÔöÇ Universal hard rules ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  prompt += `## ABSOLUTE RULES ÔÇö EVERY RESPONSE\n`;
  prompt += `1. COMPLETE CODE ONLY. Never truncate. Never write "// rest of code here", "// TODO", or placeholder comments.\n`;
  prompt += `2. ALL code goes in fenced blocks with the correct language tag: \`\`\`${langResult.lang || 'python'}\n`;
  prompt += `3. Error handling on EVERY function that can fail ÔÇö no silent failures.\n`;
  prompt += `4. Inline comments explaining WHY (not just WHAT) for any non-obvious logic.\n`;
  prompt += `5. After all code: exact commands to run it (the user should be able to copy-paste and run immediately).\n`;
  prompt += `6. Final paragraph: "What I'd improve with more time" ÔÇö 2-3 specific, concrete improvements.\n`;
  prompt += `7. If creating multiple files: explain how they connect before the first file.\n`;
  prompt += `8. No generic, one-size-fits-all code ÔÇö write ${langLabel || 'language-specific'} idioms, not \"C with ${langLabel || 'different'} syntax\".\n`;

  return prompt;
}

// ============================================================================
// MAIN EXPORT ÔÇö Called by the orchestrator
// ============================================================================

/**
 * Analyze a coding request and return everything needed to build a smart prompt.
 *
 * @param {string} message - The user's latest message
 * @param {Array}  conversationHistory - Full conversation history for context
 * @param {string} [userHint] - Optional: language hint from frontend override (e.g., 'python')
 * @returns {Object} Analysis result
 */
function analyzeCodeRequest(message, conversationHistory = [], userHint = null, projectContext = null, currentProject = null) {
  const isCode = isCodingRequest(message);

  if (!isCode) {
    return { isCodingRequest: false };
  }

  // If user-provided a hint, inject it as the highest-weight explicit signal
  let langResult = userHint
    ? {
        lang: userHint,
        confidence: 100,
        frameworks: [],
        reason: `${userHint} ÔÇö user-specified`,
        styleGuide: LANGUAGE_STYLES[userHint] || null,
      }
    : inferLanguage(message, conversationHistory);

  if (!userHint && (!langResult.lang || langResult.confidence < 55) && projectContext?.primaryLanguage) {
    langResult = {
      lang: projectContext.primaryLanguage,
      confidence: Math.max(langResult.confidence || 0, Math.min(projectContext.confidence || 0, 92)),
      frameworks: projectContext.frameworks || [],
      reason: `${projectContext.primaryLanguage} ÔÇö inferred from project context`,
      styleGuide: LANGUAGE_STYLES[projectContext.primaryLanguage] || null,
    };
  }

  const codeType   = detectCodeType(message);
  const complexity = estimateComplexity(message);

  const systemPrompt = generateSmartCodePrompt({
    langResult,
    codeType,
    complexity,
    userHint,
  });

  return {
    isCodingRequest: true,
    language:      langResult.lang,
    languageLabel: langResult.styleGuide?.label || langResult.lang || 'auto-selected',
    confidence:    langResult.confidence,
    reason:        langResult.reason,
    frameworks:    langResult.frameworks,
    conflictingSignals: Boolean(langResult.conflictingSignals),
    languageSignals: langResult.languageSignals || [],
    codeType,
    complexity,
    currentProject,
    isEditIteration: Boolean(currentProject && /\b(?:fix|edit|update|change|adjust|modify|refactor|remove|rename)\b/i.test(message)),
    systemPrompt,
  };
}

module.exports = {
  analyzeCodeRequest,
  inferLanguage,
  detectCodeType,
  isCodingRequest,
  estimateComplexity,
  LANGUAGE_STYLES,
};
