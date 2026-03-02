import { useState, useMemo } from "react";
import { CommitHealth, CIJob, formatTimeAgo } from "../github";
import { CIHeatmap, isGpuJob, deriveHeatmapStatus } from "./CIHeatmap";
import { FailureTimeline } from "./FailureTimeline";

export interface RepoHealth {
  repo: string;
  defaultBranch: string;
  commits: CommitHealth[];
  isLoading: boolean;
  error?: string;
}

interface Props {
  health: RepoHealth | null;
  onSetRepo: (repo: string) => void;
  onJobClick: (repo: string, commitSha: string, job: CIJob) => void;
}

// ── Insight analysis helpers ──

interface Insight {
  type: "good" | "warn" | "critical" | "info";
  icon: string;
  title: string;
  detail: string;
}

function analyzeInsights(commits: CommitHealth[]): Insight[] {
  if (commits.length === 0) return [];
  const insights: Insight[] = [];
  const total = commits.length;
  const failures = commits.filter((c) => c.ciStatus === "failure");
  const failCount = failures.length;
  const successRate = Math.round(((total - failCount) / total) * 100);

  // ── 1. Trend: compare first half vs second half ──
  const mid = Math.floor(total / 2);
  const recentHalf = commits.slice(0, mid);
  const olderHalf = commits.slice(mid);
  const recentFailRate = recentHalf.filter((c) => c.ciStatus === "failure").length / (recentHalf.length || 1);
  const olderFailRate = olderHalf.filter((c) => c.ciStatus === "failure").length / (olderHalf.length || 1);

  if (failCount === 0) {
    insights.push({
      type: "good",
      icon: "✦",
      title: "Perfect health",
      detail: `All ${total} commits passed CI. Keep it up!`,
    });
  } else if (recentFailRate > olderFailRate * 1.5 && recentFailRate > 0.1) {
    insights.push({
      type: "critical",
      icon: "↘",
      title: "Stability declining",
      detail: `Recent commits fail ${Math.round(recentFailRate * 100)}% vs ${Math.round(olderFailRate * 100)}% earlier. CI health is trending down.`,
    });
  } else if (recentFailRate < olderFailRate * 0.6) {
    insights.push({
      type: "good",
      icon: "↗",
      title: "Stability improving",
      detail: `Recent failure rate dropped to ${Math.round(recentFailRate * 100)}% from ${Math.round(olderFailRate * 100)}%. Nice recovery!`,
    });
  } else if (failCount > 0) {
    insights.push({
      type: "info",
      icon: "→",
      title: "Stable",
      detail: `${successRate}% success rate across ${total} commits. Failure rate is holding steady.`,
    });
  }

  // ── 2. Streak analysis ──
  let streak = 0;
  for (const c of commits) {
    if (c.ciStatus === "success") streak++;
    else break;
  }
  if (streak >= 10) {
    insights.push({
      type: "good",
      icon: "🔥",
      title: `${streak}-commit streak`,
      detail: "On a roll — no failures in the most recent commits.",
    });
  } else if (streak === 0 && commits[0]?.ciStatus === "failure") {
    // Find how many consecutive failures from the latest
    let failStreak = 0;
    for (const c of commits) {
      if (c.ciStatus === "failure") failStreak++;
      else break;
    }
    if (failStreak >= 3) {
      insights.push({
        type: "critical",
        icon: "⚠",
        title: `${failStreak} consecutive failures`,
        detail: "The latest commits are all failing. Immediate attention needed.",
      });
    } else {
      insights.push({
        type: "warn",
        icon: "!",
        title: "Latest commit is failing",
        detail: "The most recent commit did not pass CI.",
      });
    }
  }

  // ── 3. Frequent failure jobs ──
  const jobFailCounts: Record<string, number> = {};
  for (const c of failures) {
    for (const j of c.ciJobs) {
      if (j.status === "failure") {
        jobFailCounts[j.name] = (jobFailCounts[j.name] || 0) + 1;
      }
    }
  }
  const topJobs = Object.entries(jobFailCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topJobs.length > 0 && topJobs[0][1] >= 2) {
    const jobList = topJobs.map(([name, count]) => `${name} (${count}x)`).join(", ");
    insights.push({
      type: "warn",
      icon: "⟳",
      title: "Recurring failures",
      detail: `These jobs fail most often: ${jobList}`,
    });
  }

  // ── 4. GPU-specific insight ──
  const gpuFailCommits = commits.filter((c) => deriveHeatmapStatus(c) === "gpu-fail");
  const gpuPassOnlyCommits = commits.filter((c) => deriveHeatmapStatus(c) === "gpu-pass");
  if (gpuFailCommits.length > 0) {
    const gpuFailJobNames = new Set<string>();
    for (const c of gpuFailCommits) {
      for (const j of c.ciJobs) {
        if (j.status === "failure" && isGpuJob(j.name)) gpuFailJobNames.add(j.name);
      }
    }
    insights.push({
      type: "critical",
      icon: "⊞",
      title: `${gpuFailCommits.length} GPU CI failure(s)`,
      detail: `GPU/NV jobs failing: ${[...gpuFailJobNames].slice(0, 3).join(", ")}${gpuFailJobNames.size > 3 ? ` +${gpuFailJobNames.size - 3} more` : ""}`,
    });
  } else if (gpuPassOnlyCommits.length > 0) {
    insights.push({
      type: "info",
      icon: "⊞",
      title: "GPU CI healthy",
      detail: `All GPU/NV jobs pass. ${gpuPassOnlyCommits.length} commit(s) have non-GPU failures only.`,
    });
  }

  // ── 5. Failure clustering ──
  if (failCount >= 3) {
    // Check if failures cluster together vs spread out
    const failIndices = commits.map((c, i) => (c.ciStatus === "failure" ? i : -1)).filter((i) => i >= 0);
    const gaps = failIndices.slice(1).map((v, i) => v - failIndices[i]);
    const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

    if (avgGap <= 2 && failIndices.length >= 3) {
      insights.push({
        type: "warn",
        icon: "▮▮",
        title: "Failures are clustered",
        detail: "Multiple failures happen in bursts. Could indicate a broken period that was later fixed.",
      });
    } else if (avgGap > 5 && failIndices.length >= 3) {
      insights.push({
        type: "info",
        icon: "···",
        title: "Failures are sporadic",
        detail: "Failures are spread out — likely flaky tests rather than systemic issues.",
      });
    }
  }

  return insights;
}

// ── Frequent failure grouping ──
interface JobFailGroup {
  name: string;
  count: number;
  commits: CommitHealth[];
}

function groupFailuresByJob(commits: CommitHealth[]): JobFailGroup[] {
  const map: Record<string, { count: number; commits: CommitHealth[] }> = {};
  for (const c of commits) {
    if (deriveHeatmapStatus(c) !== "gpu-fail") continue;
    for (const j of c.ciJobs) {
      if (j.status !== "failure" || !isGpuJob(j.name)) continue;
      if (!map[j.name]) map[j.name] = { count: 0, commits: [] };
      map[j.name].count++;
      if (!map[j.name].commits.includes(c)) map[j.name].commits.push(c);
    }
  }
  return Object.entries(map)
    .map(([name, { count, commits }]) => ({ name, count, commits }))
    .sort((a, b) => b.count - a.count);
}

export function HealthDashboard({ health, onSetRepo, onJobClick }: Props) {
  const [repoInput, setRepoInput] = useState("");

  // Setup screen
  if (!health) {
    return (
      <div className="health-setup">
        <div className="health-setup-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h2 className="health-setup-title">CI Health Dashboard</h2>
        <p className="health-setup-desc">
          Monitor CI status of every commit on the default branch. Get insights into stability trends and recurring failures.
        </p>
        <div className="health-setup-form">
          <input
            className="add-url-input"
            type="text"
            placeholder="owner/repo (e.g. sgl-project/sglang)"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && repoInput.trim()) {
                onSetRepo(repoInput.trim());
              }
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="external-link-btn"
            onClick={() => repoInput.trim() && onSetRepo(repoInput.trim())}
            disabled={!repoInput.trim()}
          >
            Track Repository
          </button>
        </div>
      </div>
    );
  }

  const { repo, defaultBranch, commits, isLoading, error } = health;
  const total = commits.length;
  const failures = commits.filter((c) => c.ciStatus === "failure").length;
  const gpuFails = commits.filter((c) => deriveHeatmapStatus(c) === "gpu-fail").length;
  const allPassCount = commits.filter((c) => deriveHeatmapStatus(c) === "all-pass").length;
  const gpuPassRate = total > 0 ? Math.round(((total - gpuFails) / total) * 100) : 0;
  const allPassRate = total > 0 ? Math.round((allPassCount / total) * 100) : 0;

  let streak = 0;
  for (const c of commits) {
    if (c.ciStatus === "success") streak++;
    else break;
  }

  const latest = commits[0];
  const insights = useMemo(() => analyzeInsights(commits), [commits]);
  const jobGroups = useMemo(() => groupFailuresByJob(commits), [commits]);

  return (
    <div className="health-dashboard">
      {/* ── Hero summary ── */}
      <div className="health-hero">
        <div className="health-hero-top">
          <div className="health-hero-repo">
            <span className="health-repo-name">{repo}</span>
            <span className="health-branch">{defaultBranch}</span>
            {isLoading && <span className="health-loading-badge">Refreshing...</span>}
          </div>
          <button
            className="health-change-repo"
            onClick={() => onSetRepo("")}
            title="Change repository"
          >
            ✕
          </button>
        </div>

        {latest && (
          <div className="health-hero-latest">
            <div className={`health-hero-indicator health-hero-${latest.ciStatus}`}>
              {latest.ciStatus === "success" && "✓"}
              {latest.ciStatus === "failure" && "✗"}
              {latest.ciStatus === "running" && "⟳"}
              {latest.ciStatus === "pending" && "●"}
            </div>
            <div className="health-hero-detail">
              <span className="health-hero-title">
                Latest: <code>{latest.shortSha}</code>
                {" — "}
                {latest.ciStatus === "success"
                  ? `all ${latest.ciJobs.length} jobs passed`
                  : latest.ciStatus === "failure"
                    ? `${latest.ciJobs.filter((j) => j.status === "failure").length} job(s) failed`
                    : latest.ciStatus}
              </span>
              <span className="health-hero-time">{formatTimeAgo(latest.date)}</span>
            </div>
          </div>
        )}

        {/* Mini stats row inside hero */}
        <div className="health-hero-stats">
          <div className="health-hero-stat">
            <span className="health-hero-stat-val health-val-green">{allPassRate}%</span>
            <span className="health-hero-stat-lbl">All pass</span>
          </div>
          <div className="health-hero-stat">
            <span className="health-hero-stat-val health-val-teal">{gpuPassRate}%</span>
            <span className="health-hero-stat-lbl">GPU pass</span>
          </div>
          <div className="health-hero-stat">
            <span className="health-hero-stat-val health-val-red">{gpuFails}</span>
            <span className="health-hero-stat-lbl">GPU fails</span>
          </div>
          <div className="health-hero-stat">
            <span className="health-hero-stat-val">{streak}</span>
            <span className="health-hero-stat-lbl">Streak</span>
          </div>
        </div>
      </div>

      {error && <div className="pr-error-row">{error}</div>}

      {/* ── Insights panel ── */}
      {insights.length > 0 && (
        <div className="health-insights">
          <div className="health-section-title">Insights</div>
          <div className="health-insights-grid">
            {insights.map((ins, i) => (
              <div key={i} className={`health-insight health-insight-${ins.type}`}>
                <span className="health-insight-icon">{ins.icon}</span>
                <div className="health-insight-body">
                  <span className="health-insight-title">{ins.title}</span>
                  <span className="health-insight-detail">{ins.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Heatmap ── */}
      <CIHeatmap
        commits={commits}
        onCommitClick={(c) => {
          const failedJob = c.ciJobs.find((j) => j.status === "failure");
          if (failedJob) onJobClick(repo, c.sha, failedJob);
        }}
      />

      {/* ── Frequent failure jobs ── */}
      {jobGroups.length > 0 && (
        <div className="health-freq-failures">
          <div className="health-section-title">Frequently Failing GPU Jobs</div>
          <div className="health-freq-list">
            {jobGroups.slice(0, 5).map((g) => (
              <div key={g.name} className="health-freq-item">
                <div className="health-freq-bar-bg">
                  <div
                    className="health-freq-bar-fill"
                    style={{ width: `${Math.min(100, (g.count / (failures || 1)) * 100)}%` }}
                  />
                </div>
                <span className="health-freq-name">{g.name}</span>
                <span className="health-freq-count">{g.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Failure Timeline ── */}
      <FailureTimeline
        commits={commits}
        repo={repo}
        onJobClick={(c, job) => onJobClick(repo, c.sha, job)}
      />
    </div>
  );
}
