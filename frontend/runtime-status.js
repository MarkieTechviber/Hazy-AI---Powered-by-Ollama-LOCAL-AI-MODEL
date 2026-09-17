/* Local service status and an accessible, server-backed confirmation dialog. */
(() => {
  'use strict';
  const status = document.createElement('aside');
  status.className = 'runtime-status';
  status.setAttribute('aria-label', 'Local services');
  const text = document.createElement('span');
  text.setAttribute('role', 'status');
  const retry = document.createElement('button');
  retry.type = 'button'; retry.textContent = 'Check services';
  status.append(text, retry);
  (document.querySelector('main') || document.body).prepend(status);
  async function check() {
    retry.disabled = true; text.textContent = 'Checking local services…';
    try {
      const response = await fetch('/hazy/health', { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error();
      const health = await response.json();
      const message = !health.ollama.available ? 'Ollama is unavailable. Start Ollama with “ollama serve”.'
        : !health.ollama.modelCount ? 'No local models installed. Run “ollama pull llama3.2:1b”, then select it in Settings.'
        : `Ollama ready · ${health.embeddings.installed ? 'Semantic RAG available' : 'Lexical RAG (embedding model optional)'} · ${health.tts.available ? 'Voice ready' : 'Voice unavailable; text chat works'}`;
      text.textContent = message;
    } catch { text.textContent = 'Full Hazy backend unavailable. Run start.bat or bash start.sh, then check again.'; }
    finally { retry.disabled = false; }
  }
  retry.addEventListener('click', check);
  window.hazyDiagnostics = {
    updateFromResponse(response) {
      const chunks = response.headers.get('X-Hazy-RAG-Count');
      if (chunks === null) return;
      text.textContent = `Reply context · ${response.headers.get('X-Hazy-Memory-Count') || 0} memories · ${chunks} document chunks · ${response.headers.get('X-Hazy-RAG-Mode') || 'lexical'} · ${response.headers.get('X-Hazy-Context-Tokens') || 0} estimated tokens`;
    }
  };
  window.hazyConfirm = confirmation => new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'runtime-confirm';
    dialog.setAttribute('aria-label', 'Confirm agent action');
    const heading = document.createElement('h2'); heading.textContent = 'Confirm agent action';
    const summary = document.createElement('p'); summary.textContent = confirmation.summary || confirmation.toolName;
    const details = document.createElement('pre'); details.textContent = JSON.stringify(confirmation.args || {}, null, 2);
    const label = document.createElement('label');
    const input = document.createElement('input');
    if (confirmation.typedPhrase) {
      label.textContent = `Type exactly: ${confirmation.typedPhrase}`;
      input.autocomplete = 'off'; label.append(input);
    }
    const message = document.createElement('p'); message.setAttribute('role', 'status');
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.type = 'button';
    const approve = document.createElement('button'); approve.textContent = 'Approve once'; approve.type = 'button';
    approve.disabled = Boolean(confirmation.typedPhrase);
    input.addEventListener('input', () => { approve.disabled = input.value !== confirmation.typedPhrase; });
    let submitting = false;
    async function decide(approved) {
      if (submitting) return;
      submitting = true; approve.disabled = cancel.disabled = true;
      try {
        const response = await fetch('/hazy/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          confirmationId: confirmation.id, userId: confirmation.userId, conversationId: confirmation.chatId,
          message: approved ? (confirmation.typedPhrase ? input.value : 'confirm') : 'cancel'
        }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || result.error || 'Confirmation failed.');
        dialog.close(); dialog.remove(); resolve(result);
      } catch (error) {
        message.textContent = String(error.message); submitting = false; cancel.disabled = false;
        approve.disabled = Boolean(confirmation.typedPhrase && input.value !== confirmation.typedPhrase);
      }
    }
    cancel.addEventListener('click', () => decide(false)); approve.addEventListener('click', () => decide(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); decide(false); });
    dialog.append(heading, summary, details, label, message, cancel, approve);
    document.body.append(dialog); dialog.showModal();
    (confirmation.typedPhrase ? input : cancel).focus();
  });
  for (const button of document.querySelectorAll('button[title]:not([aria-label])')) button.setAttribute('aria-label', button.title);
  check();
})();
