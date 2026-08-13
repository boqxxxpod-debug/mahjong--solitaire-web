#!/usr/bin/env bash
set -euo pipefail

REPO="boqxxxpod-debug/mahjong--solitaire-web"
REMOTE_URL="https://github.com/${REPO}.git"

if [[ -z "${CODEX_GITHUB_TOKEN:-}" ]]; then
  echo "CODEX_GITHUB_TOKEN is not set; GitHub write authentication was not configured."
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required but is not installed." >&2
  exit 1
fi

# Configure the repository remote without embedding credentials in the URL.
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

# Authenticate GitHub CLI during the Codex setup phase, then configure git to
# use the same credential helper. The setup secret itself is not printed.
printf '%s\n' "$CODEX_GITHUB_TOKEN" | gh auth login --hostname github.com --with-token
gh auth setup-git

git config --global user.name "Codex Cloud"
git config --global user.email "codex-cloud@users.noreply.github.com"

# Verify authentication without exposing the token.
gh auth status --hostname github.com

echo "Codex GitHub write authentication configured for $REPO."
