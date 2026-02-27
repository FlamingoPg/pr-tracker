# PR Tracker

PR Tracker is a desktop app built with Tauri + React for monitoring GitHub PR CI status.
It is mainly used for `sgl-project/sglang`, but supports any repo PR URL.

## Overview

- Track multiple PRs across repositories.
- Show CI status, failed jobs, and rerun actions.
- Open failed job analysis with optional AI assistance.
- Support normal window mode and floating window mode.

## Installation (macOS)

Current public packaging workflow builds macOS artifacts only.

### Option 1: Releases

1. Open the repository **Releases** page.
2. Download the latest `.dmg`.
3. Install and launch `PR Tracker`.

### Option 2: GitHub Actions Artifacts

1. Open the **Actions** tab.
2. Select the latest `Package` workflow run for `main`.
3. Download and extract the uploaded macOS artifact.
4. Install from the extracted app bundle.

### macOS Gatekeeper Temporary Workaround

If macOS says the app is damaged and suggests deleting it, run:

```bash
xattr -dr com.apple.quarantine "/Applications/PR Tracker.app"
```

## Quick Start

1. Launch the app and open **Settings** (gear icon).
2. Configure a `GitHub Token` (required).
3. Optionally configure `MiniMax API Key` for AI log analysis.
4. Paste a PR URL such as `https://github.com/<owner>/<repo>/pull/<number>` to start tracking.

## Configuration

### GitHub Token (Required)

- Create token: `https://github.com/settings/tokens`
- Recommended minimum permissions:
  - Pull requests: Read
  - Checks: Read
  - Actions: Read (Write is needed for rerun actions)

### MiniMax API Key (Optional)

- Used only for AI failure analysis.
- Without this key, PR tracking and CLI actions still work.
- Get key from: `https://platform.minimaxi.com`

### CLI Command Templates (Optional)

- Configure external CLI actions shown in analysis modal.
- Supported placeholders:
  - `{context}`
  - `{repo}`
  - `{number}`
  - `{pr_url}`

## Local Development

```bash
npm install
npm run tauri -- dev
```

## Build

```bash
npm run build
npm run tauri -- build
```

## Security Notes

- Never commit real tokens or API keys.
- `.env` is git-ignored.
- Credentials are configured in-app and are not auto-imported from `.env`.
