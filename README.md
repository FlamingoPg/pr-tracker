# PR Tracker

PR Tracker is a desktop app built with Tauri + React for monitoring GitHub PR CI status.
It is mainly used for `sgl-project/sglang`, but supports any repo PR URL.

## Overview

- Track multiple PRs across repositories with card view or table view.
- Show CI status, failed jobs with expand/collapse, and rerun actions.
- Click failed jobs to launch Codex for AI-assisted debugging.
- Support normal window mode and floating window mode.
- **CI Health Dashboard** — monitor default branch CI stability with heatmap visualization and GPU-focused failure tracking.

## Quick Start

1. Launch the app and open **Settings** (gear icon).
2. Configure a `GitHub Token` (required).
3. Paste a PR URL such as `https://github.com/<owner>/<repo>/pull/<number>` to start tracking.

## Features

### PR Tracking

- **Card view**: PRs grouped by repo in scrollable columns.
- **Table view**: All PRs in a compact table with status, author, repo, diff stats. Toggle via the layout button in the header.
- **Failed job chips**: Click to launch Codex with failure logs.
- **Rerun All**: Header button to batch-rerun all failed PRs.
- **Tooltips**: Hover any icon button to see a description.

### CI Health Dashboard

The CI Health tab provides a bird's-eye view of a repository's default branch CI stability, with a focus on **NVIDIA GPU CI**.

1. Click the **CI Health** tab in the header.
2. Enter a repository in `owner/repo` format (e.g. `sgl-project/sglang`) and press Enter.
3. The dashboard fetches the last **60 commits** on the default branch (batched in groups of 10).

#### Heatmap

A GitHub Contribution-style grid where each cell represents one commit. Click any cell to open the commit on GitHub.

| Color | Meaning |
|-------|---------|
| **Green** | All CI jobs passed |
| **Light green** | NVIDIA GPU CI passed, only non-GPU jobs failed |
| **Pink** | NVIDIA GPU CI has failures |
| **Yellow** | CI still running |
| **Gray** | Pending / no checks |

#### Recent GPU Failures

Below the heatmap, a list of recent commits with GPU failures. Click any row to open the commit on GitHub.

#### Frequently Failing GPU Jobs

A ranked bar chart of GPU jobs by failure count — quickly spot which NVIDIA CI jobs are the most problematic.

### GPU Job Detection

Jobs are classified as NVIDIA GPU CI if their name matches patterns like `nv`, `nvidia`, `cuda`, `gpu`, `a100`, `h100`, `v100`, `l40`, `t4`. AMD-related jobs (`amd`, `rocm`, `mi*`, `radeon`, `hip`) are explicitly excluded.

### Auto Refresh

Data refreshes automatically: every 15s when CI is running, 30s otherwise. Tracked PRs and health repo are persisted in localStorage.

## Configuration

### GitHub Token (Required)

- Create token: `https://github.com/settings/tokens`
- Recommended minimum permissions:
  - Pull requests: Read
  - Checks: Read
  - Actions: Read (Write is needed for rerun actions)

### CLI Command Template (Optional)

- Default: `codex {context}` — launches Codex with failure logs when you click a failed job.
- Supported placeholders: `{context}`, `{repo}`, `{number}`, `{pr_url}`
- Configure in Settings.

## Installation (macOS)

### Option 1: Releases

1. Open the repository **Releases** page.
2. Download the latest `.dmg`.
3. Install and launch `PR Tracker`.

### Option 2: GitHub Actions Artifacts

1. Open the **Actions** tab.
2. Select the latest `Package` workflow run for `main`.
3. Download and extract the uploaded macOS artifact.

### macOS Gatekeeper Temporary Workaround

If macOS says the app is damaged and suggests deleting it, run:

```bash
xattr -dr com.apple.quarantine "/Applications/PR Tracker.app"
```

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
- Credentials are configured in-app and stored in localStorage.
