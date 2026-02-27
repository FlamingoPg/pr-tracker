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

## GitHub Release Key Setup (Required for Valid macOS .dmg)

To avoid macOS "app is damaged" warnings, configure signing + notarization secrets in GitHub repository settings:

- `APPLE_CERTIFICATE`: base64 content of your exported `Developer ID Application` `.p12` certificate
- `APPLE_CERTIFICATE_PASSWORD`: password used when exporting that `.p12`
- `APPLE_ID`: your Apple Developer account email
- `APPLE_PASSWORD`: app-specific password from Apple ID settings
- `APPLE_TEAM_ID`: your Apple Developer Team ID
- `APPLE_SIGNING_IDENTITY` (optional): explicit identity string such as `Developer ID Application: Your Name (TEAMID)`

Example to encode certificate on macOS:

```bash
base64 -i certificate.p12 | pbcopy
```

The `release.yml` workflow validates these secrets before building release artifacts.

Typical input example:

- `https://github.com/sgl-project/sglang/pull/18902`
- `https://github.com/<owner>/<repo>/pull/<number>`

## One-Click Install

For stable public versions:

1. Go to **Releases**.
2. Download the installer for your OS:

- macOS: `.dmg`

Current workflow builds macOS artifacts only.

3. Install and open `PR Tracker`.

For every push to `main` (automatic packaging via GitHub Actions):

1. Open the **Actions** tab and select the latest `Package` workflow run.
2. Download the uploaded artifact for your platform.
3. Extract and install from the bundle files.

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
