# PR Tracker

PR Tracker is a desktop app built with Tauri + React for monitoring GitHub PR CI status.
It is mainly used for `sgl-project/sglang`, but supports any repo PR URL.

## News

- **v1.1.0** — New **CI Health Dashboard**: track default branch CI health with a GPU-aware heatmap, smart insights, and failure analysis. [Details below](#ci-health-dashboard).

## Overview

- Track multiple PRs across repositories.
- Show CI status, failed jobs, and rerun actions.
- Open failed job analysis with optional AI assistance.
- Support normal window mode and floating window mode.
- **CI Health Dashboard** — monitor default branch CI stability with heatmap visualization and GPU-focused failure tracking.

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

## CI Health Dashboard

The CI Health tab provides a bird's-eye view of a repository's default branch CI stability, with a focus on **NVIDIA GPU CI**.

### How to Use

1. Click the **CI Health** tab in the header (next to PRs).
2. Enter a repository in `owner/repo` format (e.g. `sgl-project/sglang`) and press Enter.
3. The dashboard fetches the last **60 commits** on the default branch and checks CI status for each.

### Heatmap

A GitHub Contribution-style grid where each cell represents one commit:

| Color | Meaning |
|-------|---------|
| **Green** | All CI jobs passed |
| **Light green** | NVIDIA GPU CI passed, only non-GPU jobs failed (including AMD) |
| **Red** | NVIDIA GPU CI has failures |
| **Yellow** | CI still running |
| **Gray** | Pending / no checks |

Hover over any cell to see commit SHA, message, status, and time. Click red or light-green cells to view failure details.

### GPU Job Detection

Jobs are classified as NVIDIA GPU CI if their name matches patterns like `nv`, `nvidia`, `cuda`, `gpu`, `a100`, `h100`, `v100`, `l40`, `t4`. AMD-related jobs (`amd`, `rocm`, `mi*`, `radeon`, `hip`) are explicitly excluded — even if named `gpu-xxx`, they are **not** counted as GPU failures.

### Insights Panel

Auto-generated analysis cards that help you understand trends at a glance:

- **Trend detection** — compares recent vs older failure rates to identify stability changes.
- **Streak tracking** — highlights consecutive successes or consecutive failures.
- **GPU health** — dedicated insight for NVIDIA GPU CI status and failing job names.
- **Recurring failures** — identifies jobs that fail repeatedly.
- **Failure clustering** — detects whether failures are clustered (broken period) or sporadic (flaky).

### GPU Failures Timeline

Lists only commits where NVIDIA GPU jobs failed, showing:

- Relative time, commit SHA, and commit message.
- Failed GPU job chips (click to open AI analysis / log viewer).
- Link to view the commit on GitHub.

### Frequently Failing GPU Jobs

A ranked bar chart of GPU jobs by failure count — quickly spot which NVIDIA CI jobs are the most problematic.

### Auto Refresh

The dashboard refreshes automatically alongside PR data (every 15s when CI is running, 30s otherwise). The tracked repository is persisted in localStorage.

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
