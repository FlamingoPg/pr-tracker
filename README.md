# PR Tracker

PR Tracker is a **vibe coding** desktop project built with Tauri + React.

It is primarily used to observe **sglang** PR status (CI runs, failed jobs, rerun actions), and it also works for PRs from any other GitHub repository.

## Key Setup (Do This First)

Before using the app, open **Settings** (gear icon) and add:

- `GitHub Token` (required)
  - Create one at: `https://github.com/settings/tokens`
  - Minimum recommended permissions:
    - Pull requests: Read
    - Checks: Read
    - Actions: Read (and Write if you want to use rerun actions)
- `MiniMax API Key` (optional, only for AI log analysis)
  - Get one from: `https://platform.minimaxi.com`

If MiniMax key is empty, PR tracking still works and CLI actions can still be launched.

Typical input example:

- `https://github.com/sgl-project/sglang/pull/18902`
- `https://github.com/<owner>/<repo>/pull/<number>`

## One-Click Install

1. Go to **Releases**.
2. Download the installer for your OS:

- macOS: `.dmg`
- Windows: `.msi`
- Linux: `.AppImage` / `.deb` (depends on release target)

3. Install and open `PR Tracker`.

## First-Time Setup

After first launch, an onboarding modal will guide you to setup.
You can also open **Settings** (gear icon) manually and configure:

- `GitHub Token` (required): needs `Pull requests: Read` and `Checks: Read` (must be entered manually by each user)
- `MiniMax API Key` (optional): required only for AI log analysis
- `CLI command templates` (optional): controls which external CLI commands are shown in the analysis modal
  - supported placeholders: `{context}`, `{repo}`, `{number}`, `{pr_url}`

Credentials are not auto-imported from `.env` anymore; users configure them explicitly in-app.

## What This Is For

- Main use case: monitor `sgl-project/sglang` pull requests during development and review.
- Also supported: monitor any GitHub PR by pasting the PR URL.
- Optional AI assistance: analyze failed job logs and launch external CLI tools (Claude/Kimi templates).

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
- `.env` is ignored by git.
- The app no longer hardcodes AI API keys in source code.
