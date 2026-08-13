# Repository rules

- The technology stack is TypeScript / Three.js / Vite / HTML / CSS.
- UI frameworks such as React are prohibited.
- Backends are prohibited.
- Prioritize smartphones.
- Before completing every task, always run `npm ci` and `npm run build`.
- Do not leave TypeScript errors.
- Do not complete a task while the build is failing.
- Do not break existing behavior.
- Do not add many features at once.

## GitHub delivery rules for Codex cloud tasks

- When a task changes repository files, do not stop at a local commit.
- Create or use a `codex/*` branch, commit the finished changes, and push that branch to `origin`.
- Open a real GitHub pull request against `main` with `gh pr create` after tests pass.
- Include the related Issue number in the PR body using `Closes #<issue-number>` when the task came from an Issue.
- Do not claim the task is complete until a real GitHub PR number and URL exist.
- Never print, echo, log, or write GitHub authentication tokens into repository files, PR bodies, Issue comments, or test output.
