# Changelog

All notable changes will be documented here. The project follows Keep a Changelog conventions and intends to use semantic versioning after the initial release.

## [Unreleased]

### Added

- Repository audit, architecture, security-model, troubleshooting, contribution, and release documentation.
- Local runtime diagnostics, frontend availability indicators, and an optional privacy-preserving benchmark.
- CI definitions for supported Node and Python test paths.
- End-to-end tests for memory/RAG prompt delivery, semantic and lexical retrieval, isolation, context limits, and retrieval failure handling.
- Adversarial tests for SSRF targets, confirmation replay, guardrail failures, agent iteration limits, filesystem traversal/symlinks, and audit-data minimization.

### Changed

- Made the full-feature Node server the documented default on Windows, Linux, and macOS startup paths.
- Moved default runtime data under ignored local directories and centralized paths/configuration.
- Bounded JSON requests, model responses, context packing, browser sessions, agent iterations, and provider deadlines.
- Made TTS lazy and optional so its dependencies do not block core chat startup.
- Improved frontend confirmation, diagnostics, focus, preview isolation, and error behavior without changing frameworks.

### Security

- Enforced loopback Host/Origin boundaries and request rate/body limits.
- Hardened file operations against traversal, symlink escape, secret reads, and cross-chat artifact access.
- Added DNS-aware SSRF controls for redirects and browser subrequests.
- Bound confirmations to immutable arguments and prevented resolved-record replay.
- Made tool guardrail failures fail closed and removed arbitrary arguments/results from agent audit records.
- Added recursive JSON key/depth checks and hardened secret-vault key creation/configuration.
- Removed private runtime data, backups, archives, and generated output from the Git index.

### Fixed

- Prevented a context-packing infinite loop and preserved protected system policy under pressure.
- Corrected memory/RAG scoping and ensured both retrieved sources reach the packed model context.
- Preserved lexical retrieval when embedding generation is unavailable.
- Corrected boxed agent-mode values, code-edit project metadata, and untrusted RAG formatting.
- Prevented cheap tools from refunding model turns indefinitely.

### Known issues

- A historical credential must be revoked and removed from Git history before release.
- Cloud provider, real browser, real Ollama generation, and Kokoro generation require optional manual integration checks.
- The Python compatibility proxy and experimental production server do not have feature parity with the canonical Node runtime.
