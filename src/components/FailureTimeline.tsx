import { open } from "@tauri-apps/plugin-shell";
import { CommitHealth, CIJob, formatTimeAgo } from "../github";
import { isGpuJob, deriveHeatmapStatus } from "./CIHeatmap";

interface Props {
  commits: CommitHealth[];
  repo: string;
  onJobClick?: (commit: CommitHealth, job: CIJob) => void;
}

export function FailureTimeline({ commits, repo, onJobClick }: Props) {
  // Only show commits where NV GPU jobs failed
  const gpuFailures = commits.filter((c) => deriveHeatmapStatus(c) === "gpu-fail");

  if (gpuFailures.length === 0) {
    return (
      <div className="failure-timeline">
        <div className="failure-timeline-header">GPU Failures</div>
        <div className="failure-all-clear">All clear — no GPU failures in recent commits</div>
      </div>
    );
  }

  return (
    <div className="failure-timeline">
      <div className="failure-timeline-header">GPU Failures</div>
      <div className="failure-events">
        {gpuFailures.map((c) => {
          const gpuFailedJobs = c.ciJobs.filter((j) => j.status === "failure" && isGpuJob(j.name));
          return (
            <div key={c.sha} className="failure-event">
              <div className="failure-event-header">
                <span className="failure-dot" />
                <span className="failure-time">{formatTimeAgo(c.date)}</span>
                <span className="failure-sha">{c.shortSha}</span>
                <span className="failure-msg">{c.message}</span>
              </div>
              <div className="failure-jobs">
                {gpuFailedJobs.map((job, i) => (
                  <span
                    key={i}
                    className="job-chip job-chip-failure"
                    style={{ cursor: "pointer" }}
                    onClick={() => onJobClick?.(c, job)}
                    title="Click to view AI analysis"
                  >
                    {job.name}
                  </span>
                ))}
              </div>
              <button
                className="failure-view-btn"
                onClick={() => open(`https://github.com/${repo}/commit/${c.sha}`)}
              >
                View →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
