# Security policy

## Supported versions

Hazy is currently pre-1.0. Security fixes are made on the current default branch. No older release line is presently maintained.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature for this repository when available. If it is unavailable, contact the maintainer privately through the repository owner's published GitHub contact method. Do not open a public issue containing exploit steps, credentials, private conversations, databases, or local file contents.

Include the affected commit, prerequisites, impact, a minimal reproduction using synthetic data, and any proposed mitigation. Please allow time to validate and prepare a coordinated fix before public disclosure.

## Deployment boundary

Hazy is a trusted single-user local application. Keep the backend, Ollama, and Kokoro bound to loopback. Hazy does not provide internet-facing authentication or multi-tenant authorization. Caller-provided user/project IDs isolate local records but do not authenticate remote users.

Agent tools, browser automation, document retrieval, and public web content increase risk. Confirmations and validation are security boundaries; prompt text is not. Generated artifacts are constrained to Hazy's data directory, but Hazy is not an OS sandbox and cannot defend against a malicious process running as the same operating-system user.

Provider secrets stored through the application are encrypted. Conversation and RAG databases are not encrypted; use full-disk encryption and a protected user account when local confidentiality matters.

## Known historical credential incident

The repository audit found an apparent Tavily API credential inside archived configuration files introduced in commit `a89cce5`. The current cleanup removes those archives from the tracked tree, but that does not remove them from Git history or existing clones. The maintainer must revoke/rotate the credential, inspect the provider account for misuse, and rewrite history before a public release. See `docs/RELEASE_CHECKLIST.md`.

