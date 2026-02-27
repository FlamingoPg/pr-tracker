# PR Tracker

Desktop app built with Tauri + React for tracking GitHub PR CI status, rerunning failed workflows, and analyzing failed jobs.

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
