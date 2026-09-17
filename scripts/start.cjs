'use strict';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('Hazy requires Node.js 22.13 or newer (built-in SQLite).'); process.exit(1);
}
const { server } = require('../backend/server');
const { diagnostics } = require('../backend/diagnostics');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8080);
let speech;
server.once('error', error => {
  speech?.kill();
  if (error.code === 'EADDRINUSE') console.error(`Hazy cannot start: ${host}:${port} is already in use. Stop that service or set another PORT.`);
  else if (error.code === 'EACCES') console.error(`Hazy cannot bind ${host}:${port}. Choose an unprivileged local PORT.`);
  else console.error('Hazy backend could not start. Check HOST and PORT, then run scripts/doctor.cjs.');
  process.exitCode = 1;
});
server.listen(port, host, async () => {
  console.log(`Hazy: http://${host}:${port} — Ctrl+C stops this backend.`);
  if (process.env.HAZY_TTS === '1') {
    const path = require('node:path');
    const fs = require('node:fs');
    const python = process.env.KOKORO_PYTHON || path.join(__dirname, '..', '.venv-kokoro', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (fs.existsSync(python)) {
      speech = require('node:child_process').spawn(python, [path.join(__dirname, '..', 'kokoro_server.py')], { windowsHide: true, stdio: 'inherit' });
      speech.on('error', () => console.warn('Optional TTS could not start. Text chat remains available.'));
    } else console.warn('Optional TTS environment is missing. See docs/TROUBLESHOOTING.md; text chat remains available.');
  }
  const health = await diagnostics();
  if (!health.ollama.available) console.warn('Ollama is unavailable. Install Ollama, then run: ollama serve');
  else if (!health.ollama.modelCount) console.warn('No models installed. Run: ollama pull llama3.2:1b');
  else if (!health.ollama.selectedModelAvailable) console.warn(`Select an installed model in the UI or pull ${health.model.replace(/^ollama\//, '')}.`);
  if (!health.embeddings.installed) console.log('RAG uses lexical fallback. Optional semantic setup: ollama pull embeddinggemma');
  if (!health.tts.available) console.log('Optional Kokoro TTS is unavailable; text chat is ready.');
});
function stop() { speech?.kill(); server.closeAllConnections(); server.close(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
