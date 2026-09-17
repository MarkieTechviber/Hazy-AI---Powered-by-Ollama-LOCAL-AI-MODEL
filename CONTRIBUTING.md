# Contributing to Hazy

Thank you for helping improve Hazy. Changes should preserve its local-first defaults, current user data, and the existing vanilla frontend unless a migration has clear evidence and an agreed plan.

## Before opening a change

1. Use Node.js 22.13 or newer and Python 3.10-3.12 for Python components.
2. Install Node dependencies with `npm ci` from `backend/`.
3. Create a focused branch and keep unrelated formatting out of the diff.
4. Search for existing issues and describe the user-visible trigger, expected behavior, and compatibility effect.

Never commit `.env`, `config/hazy-config.json`, databases, cached models, conversations, RAG indexes, generated artifacts, master keys, browser records, or provider credentials. Use synthetic test data.

## Development checks

Run the Node suite:

```bash
cd backend
npm test
```

Run the controller tests from the repository root:

```bash
python -m unittest discover -s tests -v
```

Tests should remain offline and model-free unless placed in an explicitly optional integration path. Do not weaken an assertion merely to make a change pass. Security fixes should include a regression test that demonstrates the blocked behavior without using real secrets or private data.

## Design expectations

- Keep the Node backend canonical and treat `backend/server.py` as a compatibility proxy.
- Preserve lexical RAG fallback when Ollama embeddings are unavailable.
- Treat retrieved documents, web pages, and model tool arguments as untrusted.
- Keep file operations inside the Hazy data/artifact roots and check symlinks.
- Route consequential tools through the gatekeeper and confirmation store.
- Avoid mandatory accounts, cloud services, telemetry, or automatic model downloads.
- Keep logs metadata-only by default.
- Preserve backward compatibility where practical; document migrations and breaking changes.

## Pull requests

Explain the problem and resulting behavior first. Include tests run, manual checks, data-format or API effects, and any remaining limitation. UI changes should include screenshots when possible and must keep keyboard navigation, focus indication, responsive layout, and the current visual identity.

By contributing, you agree that your contribution is licensed under the repository's MIT License.

