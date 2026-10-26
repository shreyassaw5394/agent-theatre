# Security

Agent Theatre runs entirely on your machine. The server listens only on `127.0.0.1`; the hook posts only to loopback; the event stream carries repo-relative paths, line counts, a command's first word and a classified intent — never file contents, prompts, command bodies or search queries. A test (`packages/core/tests/privacy.test.ts`) plants secrets in every field of a fixture session and asserts none reach the stream. The one exception, by design, is the agent's own closing sentence (`turn_end.note`, truncated), shown so you know what your turn is.

**Reporting a vulnerability:** email shreyassaw@gmail.com or open a private report at https://github.com/shreyassaw5394/agent-theatre/security/advisories/new. Please don't file public issues for security problems. You'll hear back within 72 hours.

**Releases** are built by GitHub Actions from a `v*` tag that must sit on `main`; npm packages are published with provenance. No publish secret is ever available to pull-request workflows.
