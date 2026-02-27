const API_BASE = "https://api.github.com";

// ─── GitHub API raw shapes (internal) ─────────────────────────────────────

interface GitHubPRResponse {
  number: number;
  title: string;
  state: "open" | "closed";
  merged_at: string | null;
  user: { login: string };
  head: { sha: string };
  additions: number;
  deletions: number;
  updated_at: string;
}

interface GitHubCheckRun {
  id: number;
  name: string;
  app?: { name?: string };
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null;
  details_url: string | null;
}

interface GitHubCheckRunsResponse {
  check_runs: GitHubCheckRun[];
}

interface GitHubWorkflowRun {
  id: number;
  conclusion: string | null;
}

interface GitHubWorkflowRunsResponse {
  workflow_runs: GitHubWorkflowRun[];
}

// ─── Exported types ────────────────────────────────────────────────────────

export type CIStatus = "success" | "failure" | "pending" | "running";
export type JobStatus = "success" | "failure" | "running" | "skipped" | "pending";

export interface CIJob {
  name: string;
  status: JobStatus;
  jobId?: number;
}

export interface FetchedPRData {
  title: string;
  author: string;
  state: "open" | "merged" | "closed";
  additions: number;
  deletions: number;
  lastUpdated: string;
  ciStatus: CIStatus;
  ciJobs: CIJob[];
}

// ─── Private helpers ───────────────────────────────────────────────────────

function extractJobId(detailsUrl: string): number | undefined {
  const match = detailsUrl.match(/\/job\/(\d+)/);
  return match ? parseInt(match[1]) : undefined;
}

async function githubFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.message) message = json.message;
    } catch {}
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ─── Exported pure functions ───────────────────────────────────────────────

export function mapJobStatus(check: GitHubCheckRun): JobStatus {
  if (check.status === "queued" || check.status === "in_progress") {
    return "running";
  }
  switch (check.conclusion) {
    case "success":
    case "neutral":
      return "success";
    case "failure":
    case "timed_out":
      return "failure";
    default:
      return "skipped";
  }
}

export function deriveCIStatus(jobs: CIJob[]): CIStatus {
  if (jobs.length === 0) return "pending";
  if (jobs.some((j) => j.status === "running")) return "running";
  if (jobs.some((j) => j.status === "failure")) return "failure";
  return "success";
}

export function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Main exported function ────────────────────────────────────────────────

export async function fetchPRData(
  repo: string,
  number: number,
  token: string
): Promise<FetchedPRData> {
  const [owner, repoName] = repo.split("/");

  // Step 1: fetch PR metadata (head.sha needed for check-runs)
  const pr = await githubFetch<GitHubPRResponse>(
    `${API_BASE}/repos/${owner}/${repoName}/pulls/${number}`,
    token
  );

  // Step 2: fetch check-runs using the commit SHA from step 1
  const checksData = await githubFetch<GitHubCheckRunsResponse>(
    `${API_BASE}/repos/${owner}/${repoName}/commits/${pr.head.sha}/check-runs?per_page=100`,
    token
  );

  const ciJobs: CIJob[] = checksData.check_runs.map((cr) => ({
    name: cr.name,
    status: mapJobStatus(cr),
    jobId: cr.details_url ? extractJobId(cr.details_url) : undefined,
  }));

  return {
    title: pr.title,
    author: pr.user.login,
    state: pr.merged_at !== null ? "merged" : pr.state,
    additions: pr.additions,
    deletions: pr.deletions,
    lastUpdated: formatTimeAgo(pr.updated_at),
    ciStatus: deriveCIStatus(ciJobs),
    ciJobs,
  };
}

// ─── Fetch raw log for a single Actions job ────────────────────────────────

export async function fetchJobLogs(repo: string, jobId: number, token: string): Promise<string> {
  const [owner, repoName] = repo.split("/");
  const res = await fetch(`${API_BASE}/repos/${owner}/${repoName}/actions/jobs/${jobId}/logs`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  // Strip ANSI escape codes
  const clean = raw.replace(/\x1b\[[0-9;]*[mGKHFABCDJn]/g, "");
  // Return last 300 lines
  const lines = clean.split("\n");
  return lines.slice(-300).join("\n");
}

// ─── Get latest workflow run ID for a PR ────────────────────────────────

// Extract workflow run ID from check-run details_url
function extractRunIdFromDetailsUrl(detailsUrl: string): number | null {
  const match = detailsUrl.match(/\/actions\/runs\/(\d+)(?:\/job\/\d+)?(?:[/?]|$)/);
  return match ? parseInt(match[1]) : null;
}

function isFailedConclusion(conclusion: string | null): boolean {
  return ["failure", "timed_out", "cancelled", "action_required"].includes(conclusion || "");
}

export async function getFailedWorkflowRunIds(
  repo: string,
  prNumber: number,
  token: string
): Promise<number[]> {
  const [owner, repoName] = repo.split("/");
  try {
    const prData = await githubFetch<GitHubPRResponse>(
      `${API_BASE}/repos/${owner}/${repoName}/pulls/${prNumber}`,
      token
    );
    const headSha = prData.head?.sha;
    if (!headSha) return [];

    const runIds = new Set<number>();

    // Prefer failed check-runs linked to GitHub Actions details URLs.
    const checkData = await githubFetch<GitHubCheckRunsResponse>(
      `${API_BASE}/repos/${owner}/${repoName}/commits/${headSha}/check-runs?per_page=100`,
      token
    );
    for (const run of checkData.check_runs || []) {
      if (run.app?.name !== "GitHub Actions" || !run.details_url) continue;
      if (!isFailedConclusion(run.conclusion)) continue;
      const runId = extractRunIdFromDetailsUrl(run.details_url);
      if (runId) runIds.add(runId);
    }
    if (runIds.size > 0) return [...runIds];

    // Fallback for repos where details_url is missing/unexpected.
    const runsData = await githubFetch<GitHubWorkflowRunsResponse>(
      `${API_BASE}/repos/${owner}/${repoName}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=50`,
      token
    );
    for (const run of runsData.workflow_runs || []) {
      if (isFailedConclusion(run.conclusion)) runIds.add(run.id);
    }
    return [...runIds];
  } catch {
    return [];
  }
}

export async function getWorkflowRunId(
  repo: string,
  prNumber: number,
  token: string
): Promise<number | null> {
  const [owner, repoName] = repo.split("/");
  try {
    // First get the PR to find the head SHA
    const prData = await githubFetch<GitHubPRResponse>(
      `${API_BASE}/repos/${owner}/${repoName}/pulls/${prNumber}`,
      token
    );
    const headSha = prData.head?.sha;
    if (!headSha) return null;

    // Try extracting run ID from check-runs details_url first
    const checkData = await githubFetch<GitHubCheckRunsResponse>(
      `${API_BASE}/repos/${owner}/${repoName}/commits/${headSha}/check-runs?per_page=100`,
      token
    );
    for (const run of checkData.check_runs || []) {
      if (run.app?.name === "GitHub Actions" && run.details_url) {
        const runId = extractRunIdFromDetailsUrl(run.details_url);
        if (runId) return runId;
      }
    }

    // Fallback: list workflow runs by head SHA
    const runsData = await githubFetch<GitHubWorkflowRunsResponse>(
      `${API_BASE}/repos/${owner}/${repoName}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=20`,
      token
    );
    if (!runsData.workflow_runs?.length) return null;

    const failedRun = runsData.workflow_runs.find((run) => isFailedConclusion(run.conclusion));
    return (failedRun || runsData.workflow_runs[0]).id;
  } catch {
    return null;
  }
}

// ─── Rerun failed jobs ────────────────────────────────────────────────

export async function rerunFailedJobs(repo: string, runId: number, token: string): Promise<void> {
  const [owner, repoName] = repo.split("/");
  const res = await fetch(
    `${API_BASE}/repos/${owner}/${repoName}/actions/runs/${runId}/rerun-failed-jobs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (!res.ok) {
    const errorText = await res.text();
    if (res.status === 403 && errorText.includes("already running")) {
      throw new Error("该 workflow 正在运行中，无法重复触发 rerun");
    }
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
}
