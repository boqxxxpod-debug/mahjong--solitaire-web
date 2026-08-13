# Autonomous development state

Runtime state and the audit log are maintained in [automation-control Issue #51](https://github.com/boqxxxpod-debug/mahjong--solitaire-web/issues/51).

## Stable rules

- Only open issues carrying the `codex` label belong to the autonomous queue.
- Only one issue and one pull request may be active at a time in this repository.
- Existing backlog issues are preferred; dependencies must be verified against the latest `main`.
- CI success is mandatory before merge.
- Infrastructure, dependency, build, security, authentication, and repository-setting changes are never auto-merged.
- The loop stops on a failing check, merge conflict, missing push/PR, explicit blocker, uncertain dependency, unexpected scope, or the configured maximum of 10 successful merges.
- This file is context only. Autonomous product tasks must not edit it.
