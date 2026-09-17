'use strict';
require('../backend/diagnostics').diagnostics().then(result => {
  console.log(JSON.stringify(result, null, 2));
  if (!result.ollama.available || !result.frontend.available) process.exitCode = 1;
}).catch(() => { console.error('Invalid diagnostic configuration. Check OLLAMA_URL and KOKORO_URL.'); process.exitCode = 1; });
