# Repository rules

- The technology stack is TypeScript / Three.js / Vite / HTML / CSS.
- UI frameworks such as React are prohibited.
- Backends are prohibited.
- Prioritize smartphones.
- Before completing every task, always run `npm ci`, `npm test`, and `npm run build`.
- Run issue-specific validation and E2E commands when the issue requires them.
- Do not leave TypeScript errors or complete a task while any required check is failing.
- Do not break existing behavior or weaken an existing test to make a change pass.
- Keep one issue to one focused `codex/*` branch and one pull request.
- Read `STATE.md` and the linked automation-control issue before starting an autonomous task.
- Include `Closes #<issue>` in the pull request body and add the `codex` label when it exists.
- Do not modify `.github/`, `AGENTS.md`, `STATE.md`, dependency/package files, build configuration, security/authentication, or repository settings unless the issue explicitly requires it; these changes always require manual review.
- Do not start dependent work until its prerequisite changes are present in the latest `main`.
- If push, PR creation, tests, dependencies, or scope are blocked, report the exact blocker and stop instead of claiming completion.
- Do not add many unrelated features at once.
