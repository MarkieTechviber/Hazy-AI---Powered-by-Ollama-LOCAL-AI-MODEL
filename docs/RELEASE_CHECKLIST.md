# Release checklist

## Blocking security and history work

- [ ] Revoke and rotate the apparent Tavily credential found in archived config introduced by commit `a89cce5`.
- [ ] Review that provider account for unauthorized use.
- [ ] Coordinate a Git history rewrite to remove the affected archive blobs, then force-push all affected refs and tell existing contributors to re-clone. Make a backup before rewriting.
- [ ] Run a fresh secret scan across the working tree, all refs, tags, and nested archives after the rewrite.
- [ ] Confirm no cache, database, master key, conversation, RAG index, browser record, generated artifact, model cache, or local config is tracked.

## Version and repository metadata

- [ ] Select the initial version; `v0.1.0` is suggested for the current pre-1.0 maturity.
- [ ] Confirm MIT is the intended license and update the copyright holder/year if needed.
- [ ] Set the GitHub description and topics.
- [ ] Enable private vulnerability reporting and branch protection.
- [ ] Review Dependabot/CodeQL options without enabling external telemetry in the application.
- [ ] Prepare screenshots and verify all README links.

## Automated validation

- [ ] `npm ci` and `npm test` pass under Node 22 on Windows, Ubuntu, and macOS CI.
- [ ] Python controller tests pass under Python 3.10-3.12 for the documented platforms.
- [ ] `npm audit` has no unresolved production vulnerability relevant to the shipped path.
- [ ] Security regression and pipeline integration suites pass.
- [ ] Startup smoke test binds only to loopback and `/health` plus `/hazy/health` respond.
- [ ] The frontend static entry point loads with no missing local assets.

## Manual optional integration checks

- [ ] Start with Ollama absent and verify a clear warning plus a usable frontend.
- [ ] Start Ollama with no model and verify the setup message.
- [ ] Chat with the selected local model and verify streaming/final response persistence.
- [ ] Ingest a synthetic document; verify semantic retrieval with embeddings and lexical fallback without them.
- [ ] Verify cross-user/project synthetic records do not appear in another scope.
- [ ] Install Playwright Chromium; navigate to a public page and confirm private/redirect targets are blocked.
- [ ] Exercise a high-risk synthetic tool and verify typed confirmation, cancel, expiry, and replay denial.
- [ ] Start Kokoro, synthesize non-sensitive text, then stop it and confirm core chat continues.
- [ ] If cloud providers are advertised, test each with a dedicated low-privilege release key and remove it afterward.

## Release preparation

- [ ] Update `CHANGELOG.md` from Unreleased to the chosen version/date.
- [ ] Verify no breaking change is undocumented and data migrations have backups/rollback guidance.
- [ ] Review the final diff for private content and generated files.
- [ ] Create a clean clone from the rewritten public history and repeat the quick start.
- [ ] Draft release notes with known limitations and supported runtime versions.
- [ ] Create the tag and GitHub release only after all checks pass. This readiness pass intentionally does not create either.
