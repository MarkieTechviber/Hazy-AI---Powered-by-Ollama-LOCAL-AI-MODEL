# Troubleshooting

Start with:

```bash
node scripts/doctor.cjs
```

It reports runtime, selected model/provider, Ollama reachability, model availability, embedding mode, frontend presence, browser binary, and optional TTS status without printing conversations, keys, embeddings, or model names beyond the selected configuration.

## Node version is unsupported

Install Node.js 22.13 or newer. Earlier Node 22 releases do not expose the built-in SQLite API Hazy uses without compatibility problems. Confirm with `node --version`.

## Ollama is missing or unreachable

Install Ollama, then run `ollama serve`. Check that `OLLAMA_URL` points to a loopback HTTP endpoint, normally `http://127.0.0.1:11434`. Hazy will start without it, but local model responses and embeddings will be unavailable.

## No model is installed

Run `ollama pull llama3.2:1b`, or choose another model that is already installed and set `HAZY_MODEL=ollama/<name>`. Hazy does not automatically download models.

## Embedding model unavailable

Run `ollama pull embeddinggemma` or set `HAZY_EMBEDDING_MODEL` to a compatible installed embedding model. Until then, RAG continues with lexical retrieval. The health panel reports this fallback.

## Port 8080 is already occupied

Stop the other process or set a different `PORT`. Open the corresponding URL and, if needed, set `HAZY_ALLOWED_ORIGIN` to that exact origin. Keep `HOST=127.0.0.1`.

## Browser automation unavailable

Install dependencies in `backend/`, then run `npx playwright install chromium` there. The core chat and ordinary public web search do not require a browser binary. Corporate proxies may require Playwright-specific download configuration.

## Browser target is blocked

Hazy rejects loopback, private/reserved IPs, URL credentials, unsafe protocols, and redirects/subrequests that resolve privately. This is expected. Private-network overrides are intended only for trusted development and broaden SSRF exposure.

## Python version is unsupported

Use Python 3.10, 3.11, or 3.12 for Kokoro and controller components. The full Node backend does not require Python.

## Kokoro/TTS is unavailable

Text chat should remain usable. Create `.venv-kokoro`, activate it, install `requirements-kokoro.txt`, and run `python kokoro_server.py`. Check `http://127.0.0.1:8880/health`. The first request can take longer while Kokoro initializes local model data. Set `KOKORO_DEVICE=cpu` for the most portable path.

## Request is too large

JSON bodies default to 5 MiB and context packing rejects a current message that cannot fit safely. Reduce the attachment/message size or deliberately raise `HAZY_MAX_BODY_BYTES`/`HAZY_CONTEXT_SIZE` within available hardware limits.

## RAG has no sources

Confirm the document was ingested under the same user and project scope as the chat. Check the frontend source indicator. An unavailable embedding model should still permit lexical results; unrelated text may legitimately return no chunks.

## Cloud provider reports missing key

Save the provider key through the application or configure the provider as documented in local config. Do not commit it. If the vault key is invalid, Hazy fails closed rather than creating an unrelated key.

## Local state needs to move

Set `HAZY_DATA_DIR` and `HAZY_CONFIG_DIR` to absolute private paths before startup. Move existing state only while Hazy is stopped and keep a backup. Never point these variables at a shared Git working tree.

## Tests fail while the app works

Run `npm ci` in `backend/` to ensure the lockfile is installed. Tests create isolated temporary data and should not need Ollama or a network. Python tests require the packages in `controller-requirements.txt`. Report the exact runtime versions and failing test without attaching local caches.

