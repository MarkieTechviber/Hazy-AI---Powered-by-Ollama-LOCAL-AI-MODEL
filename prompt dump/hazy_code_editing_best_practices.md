# How Hazy Should Handle Code Generation & Editing (Builder Mode)

This doc explains how production AI coding tools (Copilot, Cursor, Claude Code, Roo Code, etc.) keep "fix this" requests from turning into full rewrites — and how to apply the same ideas to Hazy's Website/Code Builder.

## 1. The core problem

When a user says "fix the login bug," a naive system just appends that message to the chat history and asks the model to respond. The model has no reliable, structured view of "this is the current file, edit only this." So it pattern-matches on the conversation and often regenerates everything from scratch — which is exactly the symptom you're seeing.

Every serious tool solves this the same way: **separate "what currently exists" from "what the user is asking for," and make the first part explicit, structured, and impossible for the model to ignore.**

## 2. The three pillars

### Pillar 1 — Explicit current-state injection

The model should never have to infer the current file contents from scrolling back through chat history. The current files must be injected fresh, every turn, in a clearly labeled block.

Hazy already does this conceptually (`hazy.currentProject` → `promptBuilder`'s "CURRENT PROJECT — EDIT TARGET" block). The key requirement is that **every function in the chain between the frontend and the final prompt must pass this object through unchanged**. If any single function in that chain (codeIntelligence, contextPacker, etc.) builds its own `context` object and forgets to copy `currentProject` onto it, the whole mechanism silently goes dark — the prompt looks normal, just missing one block, and the model falls back to "fresh generation" behavior with zero error.

**Practical check:** log `Boolean(context.currentProject)` right before `buildSystemPrompt()` is called. If it's `false` on a follow-up edit turn, that's the bug — full stop. This single log line will resolve 90% of "it forgot my code" reports.

### Pillar 2 — Diff/patch output instead of full-file regeneration

This is the single biggest lever. Research on tools like Aider, Cursor, and Google's internal "Transform Code" all converge on the same finding: **the moment you ask a model to output the *entire* file again, you reintroduce drift** — slightly different formatting, accidentally "improved" unrelated code, renamed variables, dropped comments, etc. Even with perfect context injection, full-file output is inherently lossy.

The fix used by Aider, Agentless, and most agentic coding tools is a **search/replace or unified-diff format**:

```
===FILE: src/app.js===
<<<<<<< SEARCH
function login(user, pass) {
  return db.query(`SELECT * FROM users WHERE name='${user}'`);
=======
function login(user, pass) {
  return db.query('SELECT * FROM users WHERE name = ?', [user]);
>>>>>>> REPLACE
```

Benefits:
- The model only has to "think about" the few lines that change — far less chance of touching unrelated code.
- The patch is mechanically applicable (find the SEARCH block in the existing file, swap in REPLACE). If the SEARCH block doesn't match exactly, you *know* the model hallucinated or the file changed — you can reject and retry instead of silently corrupting the project.
- Token cost is tiny compared to re-emitting whole files, so it's cheaper and faster too.

**For Hazy:** keep the current `===FILE: filename===` format for *brand-new* projects (it's fine there), but for edit-iteration turns (when `currentProject` is present and the request looks like a fix/tweak), instruct the model to emit `===FILE: filename===` blocks containing **only a SEARCH/REPLACE pair**, not the full file. Your `mergeProjectFiles` step then becomes a "find SEARCH text in the existing file, replace with REPLACE text" operation instead of "replace whole file." If SEARCH isn't found verbatim, fall back to showing the user a warning rather than silently overwriting.

### Pillar 3 — State tracking + verification loop

Even with diffs, things can drift if the user manually edits files outside the chat (e.g. directly in the Builder's code view, or the ZIP they downloaded and re-uploaded). The Roo Code pattern for this:

1. After every successful apply, snapshot the resulting file contents (you already kind of do this via `STATE.builderFiles`).
2. Before sending the next prompt, diff the *live* builder files against that last snapshot.
3. If they differ (user hand-edited something), include a small "User made manual changes since last turn" diff in the prompt, so the model's mental model stays in sync.

This is optional/advanced — but it's the difference between "works the first 2-3 edits" and "stays correct across a 50-message session."

## 3. The full recommended pipeline (Hazy-specific)

```
1. Frontend (app.js)
   getActiveProjectForContext() → exact current files
        ↓
2. body.hazy.currentProject  (sent every turn, full content)
        ↓
3. Backend: createToolContext / runDeterministicTools
   → projectContextScanner.scanProjectContext({ currentProject, ... })
     - detects stack, frameworks, hasActiveProject, etc.
        ↓
4. codeIntelligence.js
   - builds `codeAnalysis` (isEditIteration, codeType, language...)
   - MUST also copy `currentProject` straight onto the context object
     it returns — this is the step most likely to drop it
        ↓
5. promptBuilder.buildSystemPrompt(context)
   - context.currentProject present → emits "CURRENT PROJECT — EDIT TARGET"
     block with full file contents + iteration contract
   - (recommended upgrade) instructs SEARCH/REPLACE output for edit turns
        ↓
6. Model response
        ↓
7. Frontend: parseFinalResponseFiles()
   - for edit turns: apply SEARCH/REPLACE against existing file content
   - for new-project turns: use files as-is
        ↓
8. mergeProjectFiles(existingProject, patchedProject)
   - only touches files that were actually patched
   - everything else stays byte-identical
        ↓
9. openBuilderPanel(finalProject) + save projectData to conversation
```

## 4. Quick checklist to debug "it rewrote everything"

- [ ] Is `STATE.builderFiles` non-empty and does `getActiveProjectForContext()` return it? (frontend)
- [ ] Does `buildHazyMetadata()` actually include `currentProject` in the request body? (check Network tab payload)
- [ ] Does every backend step between `req.body.hazy.currentProject` and `promptBuilder` preserve it on the `context` object? (add `console.log` at each handoff)
- [ ] Does the rendered system prompt sent to the model actually contain the "CURRENT PROJECT — EDIT TARGET" section? (log the final prompt string once)
- [ ] Is the user's request being classified as an "edit iteration" (`codeAnalysis.isEditIteration`)? If it's misclassified as "new project," the edit-target block may be skipped or under-emphasized depending on how `promptBuilder` weights it.
- [ ] (If using diffs) Does the SEARCH block match the file *exactly*, including whitespace? Mismatches should fail loudly, not silently fall back to full overwrite.

## 5. TL;DR

1. **Always inject the current files explicitly** — don't rely on chat history.
2. **Prefer small SEARCH/REPLACE patches over full-file regeneration** for edits — this is the biggest single fix for "it remade everything differently."
3. **Verify the patch applies cleanly** before accepting it; if not, surface that to the user instead of silently overwriting.
4. **Trace `currentProject` through every function** in the backend pipeline — one dropped field anywhere breaks the whole chain with no error message.
