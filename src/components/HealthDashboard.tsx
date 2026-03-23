import { useState, useMemo } from "react";
import { CommitHealth } from "../github";
import { CIHeatmap, isGpuJob, deriveHeatmapStatus } from "./CIHeatmap";

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
}

function groupFailuresByJob(commits: CommitHealth[]) {
  const map: Record<string, number> = {};
  for (const c of commits) {
    if (deriveHeatmapStatus(c) !== "gpu-fail") continue;
    for (const j of c.ciJobs) {
      if (j.status !== "failure" || !isGpuJob(j.name)) continue;
      map[j.name] = (map[j.name] || 0) + 1;
    }
  }
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function HealthDashboard({ health, onSetRepo }: Props) {
  const [repoInput, setRepoInput] = useState("");
  const commits = health?.commits ?? [];
  const jobGroups = useMemo(() => groupFailuresByJob(commits), [commits]);

  // Setup screen
  if (!health) {
    return (
      <div className="health-setup">
        <div className="health-setup-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h2 className="health-setup-title">CI Health Dashboard</h2>
        <p className="health-setup-desc">
          Monitor CI status of every commit on the default branch. Get insights into stability
          trends and recurring failures.
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

  const { repo, defaultBranch, isLoading, error } = health;

  return (
    <div className="health-dashboard">
      {/* ── Repo header ── */}
      <div className="health-hero">
        <div className="health-hero-top">
          <div className="health-hero-repo">
            <span className="health-repo-name">{repo}</span>
            <span className="health-branch">{defaultBranch}</span>
            {isLoading && <span className="health-loading-badge">Loading...</span>}
          </div>
          <button
            className="health-change-repo"
            onClick={() => onSetRepo("")}
            data-tip="Remove repository"
          >
            ✕
          </button>
        </div>
      </div>

      {error && <div className="pr-error-row">{error}</div>}

      {/* ── Heatmap ── */}
      <CIHeatmap commits={commits} repo={repo} />

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
                    style={{
                      width: `${Math.min(100, (g.count / (jobGroups[0]?.count || 1)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="health-freq-name">{g.name}</span>
                <span className="health-freq-count">{g.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
