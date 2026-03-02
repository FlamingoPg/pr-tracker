import { useState, useMemo } from "react";
import { CommitHealth, formatTimeAgo } from "../github";

const COLS = 10;

// AMD patterns — these are NOT NV GPU jobs even if name contains "gpu"
const AMD_PATTERNS = [/\bamd\b/i, /\brocm\b/i, /\bmi\d/i, /\bradeon\b/i, /\bhip\b/i];

// NV-specific patterns
const NV_PATTERNS = [/\bnv\b/i, /nvidia/i, /\bcuda\b/i, /\ba100\b/i, /\bh100\b/i, /\bv100\b/i, /\bl40/i, /\bt4\b/i];

/** Returns true only for NVIDIA GPU jobs. AMD gpu-xxx jobs are excluded. */
export function isGpuJob(name: string): boolean {
  const isAmd = AMD_PATTERNS.some((p) => p.test(name));
  if (isAmd) return false;
  // Explicit NV match
  if (NV_PATTERNS.some((p) => p.test(name))) return true;
  // Generic "gpu" keyword — count as NV only if not AMD (already excluded above)
  if (/\bgpu\b/i.test(name)) return true;
  return false;
}

export type HeatmapStatus = "all-pass" | "gpu-pass" | "gpu-fail" | "running" | "pending";

export function deriveHeatmapStatus(commit: CommitHealth): HeatmapStatus {
  if (commit.ciStatus === "running") return "running";
  if (commit.ciStatus === "pending") return "pending";

  const gpuJobs = commit.ciJobs.filter((j) => isGpuJob(j.name));
  const hasGpuFail = gpuJobs.some((j) => j.status === "failure");

  if (hasGpuFail) return "gpu-fail";
  if (commit.ciStatus === "success") return "all-pass";
  // ciStatus is failure but no GPU jobs failed → GPU pass, non-GPU fail
  return "gpu-pass";
}

const STATUS_LABEL: Record<HeatmapStatus, string> = {
  "all-pass": "All passed",
  "gpu-pass": "GPU passed",
  "gpu-fail": "GPU failed",
  running: "Running",
  pending: "Pending",
};

interface Props {
  commits: CommitHealth[];
  onCommitClick?: (commit: CommitHealth) => void;
}

export function CIHeatmap({ commits, onCommitClick }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const ordered = useMemo(() => [...commits].reverse(), [commits]);
  const statuses = useMemo(() => ordered.map(deriveHeatmapStatus), [ordered]);

  if (commits.length === 0) {
    return <div className="ci-heatmap-empty">No commit data yet</div>;
  }

  return (
    <div className="ci-heatmap-wrap">
      <div className="ci-heatmap-header">
        <span className="health-section-title">CI Heatmap</span>
        <span className="ci-heatmap-hint">
          <span className="heatmap-legend-cell heatmap-legend-all-pass" /> all pass
          <span className="heatmap-legend-cell heatmap-legend-gpu-pass" /> GPU pass
          <span className="heatmap-legend-cell heatmap-legend-gpu-fail" /> GPU fail
          <span className="heatmap-legend-cell heatmap-legend-running" /> running
        </span>
      </div>
      <div className="ci-heatmap" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {ordered.map((c, i) => {
          const st = statuses[i];
          const clickable = st === "gpu-fail" || st === "gpu-pass";
          return (
            <div
              key={c.sha}
              className={`heatmap-cell heatmap-${st}${hoveredIdx === i ? " heatmap-hover" : ""}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => clickable && onCommitClick?.(c)}
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              {hoveredIdx === i && (
                <div className="heatmap-tooltip">
                  <div className="heatmap-tooltip-row">
                    <span className="heatmap-tooltip-sha">{c.shortSha}</span>
                    <span className={`heatmap-tooltip-badge heatmap-tooltip-${st}`}>
                      {STATUS_LABEL[st]}
                    </span>
                  </div>
                  <span className="heatmap-tooltip-msg">{c.message}</span>
                  {st === "gpu-pass" && (
                    <span className="heatmap-tooltip-gpu-note">
                      GPU CI OK — {c.ciJobs.filter((j) => j.status === "failure").length} non-GPU job(s) failed
                    </span>
                  )}
                  {st === "gpu-fail" && (
                    <span className="heatmap-tooltip-gpu-note">
                      {c.ciJobs.filter((j) => j.status === "failure" && isGpuJob(j.name)).length} GPU job(s) failed
                    </span>
                  )}
                  <span className="heatmap-tooltip-time">{formatTimeAgo(c.date)}</span>
                  {(st === "gpu-fail" || st === "gpu-pass") && (
                    <span className="heatmap-tooltip-action">Click to view failure details</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="ci-heatmap-footer">
        <span className="ci-heatmap-footer-label">← older</span>
        <span className="ci-heatmap-footer-label">newer →</span>
      </div>
    </div>
  );
}
