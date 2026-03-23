import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  fetchPRData,
  fetchJobLogs,
  getWorkflowRunId,
  getFailedWorkflowRunIds,
  rerunFailedJobs,
  fetchDefaultBranch,
  fetchRecentCommits,
  fetchCommitCI,
  CIJob,
  CommitHealth,
} from "./github";
import { analyzeFailure } from "./llm";
import { AppSettings, loadSettings, saveSettings } from "./settings";
import { HealthDashboard, RepoHealth } from "./components/HealthDashboard";
import { MiniHeatmap } from "./components/CIHeatmap";
import {
  Github,
  RotateCw,
  Settings,
  Sun,
  Moon,
  PanelTop,
  ExternalLink,
  Trash2,
  Play,
  Zap,
  X,
  LayoutList,
  LayoutGrid,
  CircleCheck,
  CircleX,
} from "lucide-react";
import "./App.css";

// ─── Types ─────────────────────────────────────────────────────────────────

interface PR {
  id: number;
  repo: string;
  number: number;
  title: string;
  author: string;
  state: "open" | "merged" | "closed";
  ciStatus: "success" | "failure" | "pending" | "running";
  ciJobs?: CIJob[];
  lastUpdated: string;
  additions?: number;
  deletions?: number;
  runId?: number;
  error?: string;
  isLoading?: boolean;
}

interface RefreshOptions {
  showLoading?: boolean;
}

const ONBOARDING_STORAGE_KEY = "pr_tracker_onboarding_seen_v1";

// ─── Status Indicator ──────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: string }) {
  if (status === "running") {
    return (
      <div className="status-icon running">
        <div className="spinner-ring" />
      </div>
    );
  }
  if (status === "success") {
    return (
      <div className="status-icon success">
        <CircleCheck size={15} color="var(--success)" />
      </div>
    );
  }
  if (status === "failure") {
    return (
      <div className="status-icon failure">
        <CircleX size={15} color="var(--error)" />
      </div>
    );
  }
  return (
    <div className="status-icon pending">
      <div className="pending-dot" />
    </div>
  );
}

// ─── Log Modal ─────────────────────────────────────────────────────────────

function SettingsModal({
  initialSettings,
  onSave,
  onClose,
}: {
  initialSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}) {
  const [githubToken, setGithubToken] = useState(initialSettings.githubToken);
  const [primaryCliLabel, setPrimaryCliLabel] = useState(initialSettings.primaryCliLabel);
  const [primaryCliTemplate, setPrimaryCliTemplate] = useState(initialSettings.primaryCliTemplate);
  const secondaryCliLabel = initialSettings.secondaryCliLabel;
  const secondaryCliTemplate = initialSettings.secondaryCliTemplate;

  return (
    <div className="native-modal" onClick={onClose}>
      <div className="native-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="native-modal-header">
          <span className="native-modal-title">Settings</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="native-modal-body">
          <div style={{ display: "grid", gap: "10px" }}>
            <label style={{ fontWeight: 600 }}>GitHub Token</label>
            <input
              className="add-url-input"
              type="password"
              placeholder="ghp_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              autoComplete="off"
            />

            <label style={{ fontWeight: 600, marginTop: "8px" }}>Primary CLI Label</label>
            <input
              className="add-url-input"
              type="text"
              placeholder="Codex"
              value={primaryCliLabel}
              onChange={(e) => setPrimaryCliLabel(e.target.value)}
              autoComplete="off"
            />

            <label style={{ fontWeight: 600 }}>Primary CLI Command Template</label>
            <input
              className="add-url-input"
              type="text"
              placeholder="codex {context}"
              value={primaryCliTemplate}
              onChange={(e) => setPrimaryCliTemplate(e.target.value)}
              autoComplete="off"
            />

            <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px" }}>
              Available placeholders: <code>{"{context}"}</code>, <code>{"{repo}"}</code>,{" "}
              <code>{"{number}"}</code>, <code>{"{pr_url}"}</code>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
            <button className="external-link-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="external-link-btn"
              onClick={() =>
                onSave({
                  githubToken: githubToken.trim(),
                  minimaxApiKey: "",
                  primaryCliLabel: primaryCliLabel.trim(),
                  primaryCliTemplate: primaryCliTemplate.trim(),
                  secondaryCliLabel: secondaryCliLabel.trim(),
                  secondaryCliTemplate: secondaryCliTemplate.trim(),
                })
              }
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogModal({
  repo,
  number,
  job,
  githubToken,
  minimaxApiKey,
  cliActions,
  onClose,
}: {
  repo: string;
  number: number;
  job: CIJob;
  githubToken: string;
  minimaxApiKey: string;
  cliActions: Array<{ label: string; template: string }>;
  onClose: () => void;
}) {
  const prUrl =
    number > 0 ? `https://github.com/${repo}/pull/${number}` : `https://github.com/${repo}`;
  const availableActions = cliActions.filter((item) => item.template.trim().length > 0);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [cliContext, setCliContext] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Always fetch logs for CLI context; AI analysis is optional when MiniMax key exists.
  useEffect(() => {
    const jobId = job.jobId;
    if (!githubToken || !jobId) {
      setAnalysisError(jobId ? "No GitHub token configured" : "Job ID not available");
      setCliContext(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setAnalysisLoading(true);
      setAnalysis(null);
      setAnalysisError(null);
      setCliContext(null);

      try {
        const logs = await fetchJobLogs(repo, jobId, githubToken);
        const fallbackContext =
          `CI job "${job.name}" failed. Analyze the root cause and propose concrete fixes.\n\n` +
          logs;

        if (!cancelled) {
          setCliContext(fallbackContext);
        }

        if (!minimaxApiKey) {
          if (!cancelled) {
            setAnalysisError(
              "MiniMax key is not configured. You can still run CLI analysis below."
            );
          }
          return;
        }

        try {
          const aiText = await analyzeFailure(logs, job.name, minimaxApiKey);
          if (!cancelled) {
            setAnalysis(aiText);
            setCliContext(aiText);
          }
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            setAnalysisError(`AI analysis failed (${msg}). You can still run CLI analysis below.`);
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setAnalysisError(msg);
        }
      } finally {
        if (!cancelled) {
          setAnalysisLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [repo, job.jobId, job.name, githubToken, minimaxApiKey]);

  // 只显示 AI 分析结果，隐藏原始日志
  return (
    <div className="native-modal" onClick={onClose}>
      <div className="native-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="native-modal-header">
          <span className="native-modal-title">{job.name}</span>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="native-modal-body">
          {analysisLoading && <div className="loading-text">AI 分析中…</div>}
          {analysis && (
            <div className="analysis-result">
              <ReactMarkdown>{analysis}</ReactMarkdown>
            </div>
          )}
          {analysisError && <div className="error-text">{analysisError}</div>}
          {cliContext && availableActions.length > 0 && (
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              {availableActions.map((action, index) => (
                <button
                  key={`${action.label}-${index}`}
                  className="external-link-btn"
                  onClick={() =>
                    invoke("open_cli", {
                      commandTemplate: action.template,
                      context: cliContext,
                      repo,
                      number,
                      prUrl,
                    })
                  }
                >
                  Run {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingModal({
  onOpenSettings,
  onClose,
}: {
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  return (
    <div className="native-modal" onClick={onClose}>
      <div className="native-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="native-modal-header">
          <span className="native-modal-title">Welcome to PR Tracker</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="native-modal-body">
          <p style={{ marginTop: 0, marginBottom: "8px" }}>
            First-time setup takes about 1 minute.
          </p>
          <ol style={{ marginTop: "0", marginBottom: "12px", paddingLeft: "18px" }}>
            <li>Create a GitHub token with Pull Requests + Checks read permissions.</li>
            <li>Open Settings and paste your token.</li>
            <li>Optionally add MiniMax key to enable AI failure analysis.</li>
          </ol>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="external-link-btn" onClick={onOpenSettings}>
              Open settings
            </button>
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noreferrer"
              className="external-link-btn"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Create token
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PR Card ───────────────────────────────────────────────────────────────

function PRCard({
  pr,
  onRemove,
  onJobClick,
  onRerun,
  isRerunning,
}: {
  pr: PR;
  onRemove: () => void;
  onJobClick: (job: CIJob) => void;
  onRerun: (prId: number, runId?: number) => void;
  isRerunning?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`pr-card status-${pr.ciStatus}`}>
      <div className="pr-card-body">
        <StatusIndicator status={pr.isLoading ? "pending" : pr.ciStatus} />

        <div className="pr-details">
          <div className="pr-title-row">
            <span className={`pr-title${pr.isLoading ? " loading" : ""}`}>{pr.title}</span>
            <span className="pr-updated">{pr.lastUpdated}</span>
          </div>

          <div className="pr-meta-row">
            <a
              href={`https://github.com/${pr.repo}/pull/${pr.number}`}
              className="pr-number-link"
              onClick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noreferrer"
            >
              #{pr.number}
            </a>
            <span className={`pr-state state-${pr.state}`}>{pr.state}</span>
            <span className="meta-sep">·</span>
            <span className="pr-author">@{pr.author}</span>
            {pr.additions !== undefined && (
              <>
                <span className="meta-sep">·</span>
                <span className="pr-diff">
                  <span className="diff-add">+{pr.additions}</span>
                  <span className="diff-del">−{pr.deletions}</span>
                </span>
              </>
            )}
          </div>

          {pr.error && !pr.isLoading && (
            <div className="pr-error-row" title={pr.error}>
              ⚠ {pr.error}
            </div>
          )}

          {pr.ciJobs && pr.ciJobs.some((j) => j.status === "failure") && (
            <div style={{ marginTop: "8px" }}>
              <div className="job-chips">
                {pr.ciJobs.filter((j) => j.status === "failure").length > 3 && (
                  <span
                    className="job-chip job-chip-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(!expanded);
                    }}
                    style={{ cursor: "pointer", marginRight: "6px" }}
                  >
                    {expanded
                      ? "▼ Collapse"
                      : `▲ +${pr.ciJobs.filter((j) => j.status === "failure").length - 3}`}
                  </span>
                )}
                {pr.ciJobs
                  .filter((j) => j.status === "failure")
                  .slice(0, expanded ? undefined : 3)
                  .map((job, i) => (
                    <span
                      key={i}
                      className="job-chip job-chip-failure"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJobClick(job);
                      }}
                      style={{ cursor: "pointer" }}
                      data-tip="Click to view AI analysis"
                    >
                      {job.name}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="pr-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="card-btn"
            data-tip="Open on GitHub"
            onClick={() => open(`https://github.com/${pr.repo}/pull/${pr.number}`)}
          >
            <ExternalLink size={14} />
          </button>
          {pr.ciStatus === "failure" && onRerun && (
            <button
              className={`card-btn${isRerunning ? " spin" : ""}`}
              data-tip={isRerunning ? "Rerunning..." : "Rerun failed jobs"}
              onClick={() => onRerun(pr.id, pr.runId)}
              disabled={isRerunning}
            >
              <Play size={14} fill="currentColor" />
            </button>
          )}
          <button className="card-btn danger" data-tip="Remove" onClick={() => onRemove()}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────

function App() {
  // Load saved PRs from localStorage
  const [prs, setPrs] = useState<PR[]>(() => {
    try {
      const saved = localStorage.getItem("tracked_prs");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load saved PRs:", e);
    }
    return [];
  });
  const [urlInput, setUrlInput] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const [logModal, setLogModal] = useState<{ repo: string; number: number; job: CIJob } | null>(
    null
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [rerunningPrIds, setRerunningPrIds] = useState<Record<number, true>>({});
  const rerunningPrIdsRef = useRef<Record<number, true>>({});
  const [isRerunAllRunning, setIsRerunAllRunning] = useState(false);
  const isRerunAllRunningRef = useRef(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });
  const [viewMode, setViewMode] = useState<"card" | "table">(() => {
    return (localStorage.getItem("pr_view_mode") as "card" | "table") || "card";
  });
  const [tableExpandedIds, setTableExpandedIds] = useState<Set<number>>(new Set());
  const [isFloating, setIsFloating] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "seen"
  );
  const didInitialRefreshRef = useRef(false);
  const inFlightFetchesRef = useRef<Record<number, Promise<void>>>({});

  // ── Health Dashboard state ──
  const [activeTab, setActiveTab] = useState<"prs" | "health">("prs");
  const [repoHealth, setRepoHealth] = useState<RepoHealth | null>(() => {
    try {
      const saved = localStorage.getItem("repo_health_target_v1");
      if (saved) {
        const { repo, defaultBranch } = JSON.parse(saved);
        if (repo) return { repo, defaultBranch, commits: [], isLoading: false };
      }
    } catch {}
    return null;
  });
  const repoHealthRef = useRef(repoHealth);
  useEffect(() => {
    repoHealthRef.current = repoHealth;
  });
  const healthFetchingRef = useRef(false);

  const githubToken = settings.githubToken;
  const minimaxApiKey = settings.minimaxApiKey;
  const cliActions = [
    { label: settings.primaryCliLabel, template: settings.primaryCliTemplate },
    { label: settings.secondaryCliLabel, template: settings.secondaryCliTemplate },
  ];

  const launchCliForJob = useCallback(
    async (repo: string, number: number, job: CIJob) => {
      const template = settings.primaryCliTemplate.trim();
      if (!template) {
        setStatusMsg("No CLI template configured. Check Settings.");
        setTimeout(() => setStatusMsg(null), 3000);
        return;
      }
      setStatusMsg(`Fetching logs for ${job.name}...`);
      try {
        const logs = job.jobId
          ? await fetchJobLogs(repo, job.jobId, githubToken)
          : "(no logs available)";
        const context = `CI job "${job.name}" failed.\n\nLast 300 lines of log:\n${logs}`;
        const prUrl = `https://github.com/${repo}/pull/${number}`;
        await invoke("open_cli", {
          commandTemplate: template,
          context,
          repo,
          number,
          prUrl,
        });
        setStatusMsg(null);
      } catch (e) {
        setStatusMsg(`Failed to launch CLI: ${e}`);
        setTimeout(() => setStatusMsg(null), 3000);
      }
    },
    [githubToken, settings.primaryCliTemplate]
  );

  // Toggle body class for transparent background
  useEffect(() => {
    if (isFloating) {
      document.body.classList.add("floating");
    } else {
      document.body.classList.remove("floating");
    }
  }, [isFloating]);

  const startFloatingDrag = useCallback(async () => {
    if (!isFloating) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (e) {
      console.warn("Failed to start dragging:", e);
    }
  }, [isFloating]);

  const toggleFloating = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      const nextFloating = !isFloating;
      const setShadowSafely = async (enable: boolean) => {
        try {
          await appWindow.setShadow(enable);
        } catch (e) {
          console.warn("setShadow not available on this platform:", e);
        }
      };

      if (nextFloating) {
        await appWindow.setMinSize(new LogicalSize(320, 220));
        await appWindow.setDecorations(false);
        await setShadowSafely(false);
        await appWindow.setResizable(false);
        await appWindow.setAlwaysOnTop(true);
        await appWindow.setSize(new LogicalSize(420, 340));
      } else {
        await appWindow.setDecorations(true);
        await setShadowSafely(true);
        await appWindow.setResizable(true);
        await appWindow.setAlwaysOnTop(false);
        await appWindow.setMinSize(new LogicalSize(600, 400));
        await appWindow.setSize(new LogicalSize(1200, 800));
      }
      setIsFloating(nextFloating);
      setStatusMsg(nextFloating ? "已开启浮窗模式" : "已关闭浮窗模式");
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (e) {
      console.error("Failed to toggle floating mode:", e);
      setStatusMsg(`浮窗模式失败: ${e}`);
    }
  }, [isFloating]);

  const handleSaveSettings = useCallback((nextSettings: AppSettings) => {
    setSettings(nextSettings);
    saveSettings(nextSettings);
    setShowSettings(false);
    if (nextSettings.githubToken) {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
      setShowOnboarding(false);
    }
    setStatusMsg("设置已保存");
    setTimeout(() => setStatusMsg(null), 1800);
  }, []);

  useEffect(() => {
    if (githubToken) {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
      setShowOnboarding(false);
      return;
    }
    const seen = localStorage.getItem(ONBOARDING_STORAGE_KEY) === "seen";
    if (!seen) setShowOnboarding(true);
  }, [githubToken]);

  const closeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
    setShowOnboarding(false);
  }, []);

  const openSettingsFromOnboarding = useCallback(() => {
    setShowOnboarding(false);
    setShowSettings(true);
  }, []);

  // ── Health dashboard data fetching ──
  const fetchAndUpdateRepoHealth = useCallback(async () => {
    const current = repoHealthRef.current;
    if (!githubToken || !current?.repo) return;
    if (healthFetchingRef.current) return;
    healthFetchingRef.current = true;

    setRepoHealth((h) => (h ? { ...h, isLoading: true, error: undefined } : h));

    try {
      let branch = current.defaultBranch;
      if (!branch) {
        branch = await fetchDefaultBranch(current.repo, githubToken);
      }

      const commits = await fetchRecentCommits(current.repo, branch, 60, githubToken);

      // Batch fetch CI in groups of 10 to avoid rate limiting
      const ciResults: (Awaited<ReturnType<typeof fetchCommitCI>> | null)[] = new Array(
        commits.length
      ).fill(null);
      const BATCH = 10;
      for (let i = 0; i < commits.length; i += BATCH) {
        if (repoHealthRef.current?.repo !== current.repo) return; // aborted
        const batch = commits.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map((c) => fetchCommitCI(current.repo, c.sha, githubToken).catch(() => null))
        );
        results.forEach((r, j) => {
          ciResults[i + j] = r;
        });
      }

      if (repoHealthRef.current?.repo !== current.repo) return; // aborted

      const enriched: CommitHealth[] = commits.map((c, i) => ({
        ...c,
        ciStatus: ciResults[i]?.ciStatus ?? "pending",
        ciJobs: ciResults[i]?.ciJobs ?? [],
      }));

      setRepoHealth({
        repo: current.repo,
        defaultBranch: branch,
        commits: enriched,
        isLoading: false,
      });

      localStorage.setItem(
        "repo_health_target_v1",
        JSON.stringify({ repo: current.repo, defaultBranch: branch })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRepoHealth((h) => (h ? { ...h, isLoading: false, error: message } : h));
    } finally {
      healthFetchingRef.current = false;
    }
  }, [githubToken]);

  const handleSetRepo = useCallback((repo: string) => {
    if (!repo) {
      // Clear
      healthFetchingRef.current = false;
      repoHealthRef.current = null;
      setRepoHealth(null);
      localStorage.removeItem("repo_health_target_v1");
      setActiveTab("prs");
      return;
    }
    const cleaned = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    setRepoHealth({ repo: cleaned, defaultBranch: "", commits: [], isLoading: true });
    // Will trigger fetch via effect
  }, []);

  // Fetch health data when repo changes or on initial load
  useEffect(() => {
    if (!githubToken || !repoHealth?.repo) return;
    if (repoHealth.commits.length === 0 && !repoHealth.error) {
      void fetchAndUpdateRepoHealth();
    }
  }, [githubToken, repoHealth?.repo, fetchAndUpdateRepoHealth]);

  // Save PRs to localStorage when they change
  useEffect(() => {
    // Only save minimal data (no runtime state like isLoading, error, runId)
    const toSave = prs.map((pr) => ({
      id: pr.id,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      state: pr.state,
      ciStatus: pr.ciStatus,
      lastUpdated: pr.lastUpdated,
      additions: pr.additions,
      deletions: pr.deletions,
    }));
    localStorage.setItem("tracked_prs", JSON.stringify(toSave));
  }, [prs]);

  // Apply dark mode
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem("pr_view_mode", viewMode);
  }, [viewMode]);

  // Ref so the auto-refresh interval always reads the latest PR list
  // without needing to re-create the interval on every state change
  const prsRef = useRef<PR[]>(prs);
  useEffect(() => {
    prsRef.current = prs;
  });

  const hasRunning =
    prs.some((p) => p.ciStatus === "running") ||
    (repoHealth?.commits.some((c) => c.ciStatus === "running") ?? false);

  const grouped = prs.reduce(
    (acc, pr) => {
      if (!acc[pr.repo]) acc[pr.repo] = [];
      acc[pr.repo].push(pr);
      return acc;
    },
    {} as Record<string, PR[]>
  );

  // ── fetch one PR and update state ────────────────────────────────────────
  const fetchAndUpdatePR = useCallback(
    (pr: PR, options?: RefreshOptions): Promise<void> => {
      if (!githubToken) return Promise.resolve();

      const existing = inFlightFetchesRef.current[pr.id];
      if (existing) return existing;

      const showLoading = options?.showLoading ?? true;
      if (showLoading) {
        setPrs((prev) =>
          prev.map((p) => (p.id === pr.id ? { ...p, isLoading: true, error: undefined } : p))
        );
      }

      const task = (async () => {
        try {
          const [data, runId] = await Promise.all([
            fetchPRData(pr.repo, pr.number, githubToken),
            getWorkflowRunId(pr.repo, pr.number, githubToken),
          ]);
          setPrs((prev) =>
            prev.map((p) =>
              p.id === pr.id
                ? { ...p, ...data, runId: runId || undefined, isLoading: false, error: undefined }
                : p
            )
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setPrs((prev) =>
            prev.map((p) => (p.id === pr.id ? { ...p, isLoading: false, error: message } : p))
          );
        } finally {
          delete inFlightFetchesRef.current[pr.id];
        }
      })();

      inFlightFetchesRef.current[pr.id] = task;
      return task;
    },
    [githubToken]
  );

  // Auto-refresh saved PRs once on first load (avoid re-trigger loops on prs updates)
  useEffect(() => {
    if (!githubToken || didInitialRefreshRef.current || prsRef.current.length === 0) return;
    didInitialRefreshRef.current = true;
    const timer = setTimeout(() => {
      prsRef.current.forEach((pr) => void fetchAndUpdatePR(pr, { showLoading: false }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [githubToken, fetchAndUpdatePR]);

  // ── refresh all tracked PRs ───────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    if (!githubToken || prsRef.current.length === 0) return;
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setStatusMsg("正在刷新所有 PR...");
    try {
      await Promise.all(prsRef.current.map((pr) => fetchAndUpdatePR(pr)));
      setStatusMsg("刷新完成");
      setTimeout(() => setStatusMsg(null), 2000);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [fetchAndUpdatePR]);

  // ── add PR from a parsed repo + number ──────────────────────────────────
  const addPR = useCallback(
    (repo: string, number: number) => {
      // Check if already tracking this PR
      const exists = prs.some((p) => p.repo === repo && p.number === number);
      if (exists) return;

      const newPR: PR = {
        id: Date.now(),
        repo,
        number,
        title: "Loading…",
        author: "…",
        state: "open",
        ciStatus: "pending",
        lastUpdated: "just now",
        isLoading: true,
      };
      setPrs((prev) => [newPR, ...prev]);
      setUrlInput("");
      fetchAndUpdatePR(newPR);
    },
    [fetchAndUpdatePR, prs]
  );

  // ── parse GitHub PR URL and track ─────────────────────────────────────────
  const parseAndTrack = useCallback(
    (text: string) => {
      const match = text.match(/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/);
      if (match) {
        addPR(match[1], parseInt(match[2]));
        return true;
      }
      return false;
    },
    [addPR]
  );

  // ── auto-refresh: 15s when any CI is running, 30s otherwise ──────────────
  useEffect(() => {
    if (!githubToken) return;
    const ms = hasRunning ? 15_000 : 30_000;
    const timer = setInterval(() => {
      prsRef.current.forEach((pr) => void fetchAndUpdatePR(pr, { showLoading: false }));
      if (repoHealthRef.current?.repo) {
        void fetchAndUpdateRepoHealth();
      }
    }, ms);
    return () => clearInterval(timer);
  }, [hasRunning, fetchAndUpdatePR, fetchAndUpdateRepoHealth]);

  const removePR = (id: number) => setPrs((prev) => prev.filter((p) => p.id !== id));

  const setPrRerunning = useCallback((prId: number, isRunning: boolean) => {
    const next = { ...rerunningPrIdsRef.current };
    if (isRunning) {
      next[prId] = true;
    } else {
      delete next[prId];
    }
    rerunningPrIdsRef.current = next;
    setRerunningPrIds(next);
  }, []);

  const setRerunAllRunning = useCallback((isRunning: boolean) => {
    isRerunAllRunningRef.current = isRunning;
    setIsRerunAllRunning(isRunning);
  }, []);

  const handleRerun = useCallback(
    async (prId: number, _runId?: number) => {
      if (!githubToken) {
        setStatusMsg("错误: No GitHub token");
        return;
      }
      const pr = prsRef.current.find((p) => p.id === prId);
      if (!pr) {
        setStatusMsg("错误: PR not found");
        return;
      }
      if (rerunningPrIdsRef.current[prId]) {
        setStatusMsg(`PR #${pr.number} 正在 rerun，请稍候...`);
        setTimeout(() => setStatusMsg(null), 1800);
        return;
      }
      setPrRerunning(prId, true);

      try {
        setStatusMsg(`正在获取 PR #${pr.number} 的失败 workflow...`);
        const failedRunIds = await getFailedWorkflowRunIds(pr.repo, pr.number, githubToken);
        if (failedRunIds.length === 0) {
          setStatusMsg(`错误: PR #${pr.number} 未找到可 rerun 的失败 workflow`);
          return;
        }

        setStatusMsg(
          `PR #${pr.number} 检测到 ${failedRunIds.length} 个失败 workflow，正在 rerun...`
        );
        const errors: string[] = [];
        let successCount = 0;

        for (const workflowRunId of failedRunIds) {
          try {
            await rerunFailedJobs(pr.repo, workflowRunId, githubToken);
            successCount += 1;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`run ${workflowRunId}: ${msg}`);
          }
        }

        if (successCount === 0) {
          throw new Error(errors[0] || "所有失败 workflow 触发 rerun 失败");
        }

        if (errors.length > 0) {
          setStatusMsg(
            `PR #${pr.number} 已触发 ${successCount}/${failedRunIds.length} 个 rerun（部分失败）`
          );
        } else {
          setStatusMsg(`PR #${pr.number} 已触发 ${successCount} 个失败 workflow rerun`);
        }
        setTimeout(() => fetchAndUpdatePR(pr), 2000);
        setTimeout(() => setStatusMsg(null), 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMsg(`错误: ${msg}`);
      } finally {
        setPrRerunning(prId, false);
      }
    },
    [githubToken, fetchAndUpdatePR, setPrRerunning]
  );

  const rerunAllFailed = useCallback(async () => {
    if (isRerunAllRunningRef.current) {
      setStatusMsg("批量 rerun 正在进行中，请稍候...");
      setTimeout(() => setStatusMsg(null), 1800);
      return;
    }
    setRerunAllRunning(true);
    setStatusMsg("开始 rerun...");
    const failedPRs = prsRef.current.filter((p) => p.ciStatus === "failure");
    try {
      if (failedPRs.length === 0) {
        setStatusMsg("没有可 rerun 的失败 PR");
        setTimeout(() => setStatusMsg(null), 2000);
        return;
      }
      setStatusMsg(`正在 rerun ${failedPRs.length} 个失败的 PR...`);

      for (const pr of failedPRs) {
        setStatusMsg(`正在 rerun PR #${pr.number}...`);
        await handleRerun(pr.id, pr.runId);
      }
      setStatusMsg("Rerun 完成！");
      setTimeout(() => setStatusMsg(null), 3000);
    } finally {
      setRerunAllRunning(false);
    }
  }, [handleRerun, setRerunAllRunning]);

  const counts = {
    total: prs.length,
    running: prs.filter((p) => p.ciStatus === "running").length,
    failed: prs.filter((p) => p.ciStatus === "failure").length,
  };

  return (
    <div className={`app${isFloating ? " floating" : ""}`}>
      {/* ── Header ── */}
      {!isFloating && (
        <header className="app-header">
          <div className="header-inner">
            <div className="logo">
              <Github size={28} />
              <div>
                <div className="logo-name">PR Tracker</div>
                <div className="logo-sub">GitHub CI Monitor</div>
              </div>
            </div>

            <div className="tab-bar">
              <button
                className={`tab-btn${activeTab === "prs" ? " tab-active" : ""}`}
                onClick={() => setActiveTab("prs")}
              >
                PRs
              </button>
              <button
                className={`tab-btn${activeTab === "health" ? " tab-active" : ""}`}
                onClick={() => setActiveTab("health")}
              >
                CI Health
              </button>
            </div>

            <div className="header-stats">
              <div className="hstat">
                <span className="hstat-dot" />
                <span className="hstat-num">{counts.total}</span>
                <span className="hstat-label">tracking</span>
              </div>
              {counts.running > 0 && (
                <div className="hstat warning">
                  <span className="hstat-dot pulsing" />
                  <span className="hstat-num">{counts.running}</span>
                  <span className="hstat-label">running</span>
                </div>
              )}
              {counts.failed > 0 && (
                <div className="hstat error">
                  <span className="hstat-dot" />
                  <span className="hstat-num">{counts.failed}</span>
                  <span className="hstat-label">failed</span>
                </div>
              )}
            </div>

            <button
              className={`btn-refresh${isRefreshing ? " spin" : ""}`}
              onClick={refreshAll}
              disabled={isRefreshing}
              data-tip="Refresh all"
            >
              <RotateCw size={15} />
              Refresh
            </button>
            {counts.failed > 0 && (
              <button
                className={`btn-rerun-all${isRerunAllRunning ? " spin" : ""}`}
                onClick={rerunAllFailed}
                disabled={isRerunAllRunning}
                data-tip="Rerun all failed PRs"
              >
                <Zap size={15} fill="currentColor" />
                {isRerunAllRunning ? "Rerunning..." : "Rerun All"}
              </button>
            )}
            <div className="mode-toggles">
              <button
                className={`theme-toggle${viewMode === "table" ? " view-active" : ""}`}
                onClick={() => setViewMode(viewMode === "card" ? "table" : "card")}
                data-tip={viewMode === "card" ? "Table view" : "Card view"}
              >
                {viewMode === "card" ? <LayoutList size={18} /> : <LayoutGrid size={18} />}
              </button>
              <button
                className="theme-toggle"
                onClick={() => setShowSettings(true)}
                data-tip="Settings"
              >
                <Settings size={18} />
              </button>
              <button
                className="theme-toggle"
                onClick={() => setDarkMode(!darkMode)}
                data-tip={darkMode ? "Light mode" : "Dark mode"}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="theme-toggle"
                onClick={toggleFloating}
                data-tip={isFloating ? "Exit floating" : "Floating mode"}
                style={{
                  background: isFloating ? "var(--primary)" : undefined,
                  color: isFloating ? "white" : undefined,
                }}
              >
                <PanelTop size={18} />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={`app-main${isFloating ? " floating" : ""}`}>
        {/* Floating mode: show simple view */}
        {isFloating ? (
          <div className="floating-view">
            <div
              className="floating-drag-area"
              data-tauri-drag-region=""
              onMouseDown={(e) => {
                if (e.button === 0) {
                  void startFloatingDrag();
                }
              }}
            >
              <button
                className="floating-exit-btn"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={toggleFloating}
              >
                Exit Float
              </button>
            </div>
            <div className="floating-content">
              {prs.slice(0, 2).map((pr) => (
                <PRCard
                  key={pr.id}
                  pr={pr}
                  onRemove={() => removePR(pr.id)}
                  onJobClick={(job) => launchCliForJob(pr.repo, pr.number, job)}
                  onRerun={handleRerun}
                  isRerunning={isRerunAllRunning || Boolean(rerunningPrIds[pr.id])}
                />
              ))}
              {repoHealth && repoHealth.commits.length > 0 && (
                <MiniHeatmap commits={repoHealth.commits} />
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── No-token warning ── */}
            {!githubToken && (
              <div className="no-token-banner">
                <span>
                  No GitHub token configured. Open Settings and paste a token with Pull Requests +
                  Checks read permissions.
                </span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button className="external-link-btn" onClick={() => setShowSettings(true)}>
                    Open settings
                  </button>
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="no-token-link"
                  >
                    Create token →
                  </a>
                </div>
              </div>
            )}

            {/* ── Status message ── */}
            {statusMsg && <div className="status-toast">{statusMsg}</div>}

            {activeTab === "health" ? (
              <HealthDashboard health={repoHealth} onSetRepo={handleSetRepo} />
            ) : (
              <>
                {/* ── Add PR ── */}
                <div className="add-bar">
                  <input
                    className="add-url-input"
                    type="text"
                    placeholder="Paste a GitHub PR URL — https://github.com/owner/repo/pull/123"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (parseAndTrack(text)) e.preventDefault();
                    }}
                    onKeyDown={(e) => e.key === "Enter" && parseAndTrack(urlInput)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>

                {/* ── PR List ── */}
                {prs.length === 0 ? (
                  <div className="empty-state" style={{ marginTop: "60px" }}>
                    <div className="empty-icon-wrap">
                      <Github size={48} strokeWidth={1} />
                    </div>
                    <p className="empty-title">No PRs tracked yet</p>
                    <p className="empty-desc">Paste a GitHub PR URL above to start tracking</p>
                  </div>
                ) : viewMode === "table" ? (
                  <div className="pr-table-wrap">
                    <table className="pr-table">
                      <thead>
                        <tr>
                          <th className="pr-table-th-status"></th>
                          <th>#</th>
                          <th>Title</th>
                          <th>Author</th>
                          <th>Repo</th>
                          <th>State</th>
                          <th>Diff</th>
                          <th>Updated</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {prs.map((pr) => (
                          <tr
                            key={pr.id}
                            className={`pr-table-row status-${pr.ciStatus}`}
                            onClick={() => {
                              if (pr.ciJobs?.some((j) => j.status === "failure")) {
                                const failedJob = pr.ciJobs.find((j) => j.status === "failure")!;
                                launchCliForJob(pr.repo, pr.number, failedJob);
                              }
                            }}
                          >
                            <td className="pr-table-td-status">
                              <StatusIndicator status={pr.isLoading ? "pending" : pr.ciStatus} />
                            </td>
                            <td>
                              <a
                                href={`https://github.com/${pr.repo}/pull/${pr.number}`}
                                className="pr-number-link"
                                onClick={(e) => e.stopPropagation()}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {pr.number}
                              </a>
                            </td>
                            <td className="pr-table-td-title">
                              <span className={pr.isLoading ? "loading" : ""}>{pr.title}</span>
                              {pr.ciJobs && pr.ciJobs.some((j) => j.status === "failure") && (
                                <div className="job-chips" style={{ marginTop: "6px" }}>
                                  {pr.ciJobs.filter((j) => j.status === "failure").length > 3 && (
                                    <span
                                      className="job-chip job-chip-toggle"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTableExpandedIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(pr.id)) next.delete(pr.id);
                                          else next.add(pr.id);
                                          return next;
                                        });
                                      }}
                                      style={{ cursor: "pointer" }}
                                    >
                                      {tableExpandedIds.has(pr.id)
                                        ? "▼ Collapse"
                                        : `▲ +${pr.ciJobs.filter((j) => j.status === "failure").length - 3}`}
                                    </span>
                                  )}
                                  {pr.ciJobs
                                    .filter((j) => j.status === "failure")
                                    .slice(0, tableExpandedIds.has(pr.id) ? undefined : 3)
                                    .map((job, i) => (
                                      <span
                                        key={i}
                                        className="job-chip job-chip-failure"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          launchCliForJob(pr.repo, pr.number, job);
                                        }}
                                        style={{ cursor: "pointer" }}
                                        data-tip="Click to view AI analysis"
                                      >
                                        {job.name}
                                      </span>
                                    ))}
                                </div>
                              )}
                            </td>
                            <td className="pr-table-td-author">@{pr.author}</td>
                            <td className="pr-table-td-repo" title={pr.repo}>
                              {pr.repo}
                            </td>
                            <td>
                              <span className={`pr-state state-${pr.state}`}>{pr.state}</span>
                            </td>
                            <td className="pr-table-td-diff">
                              {pr.additions !== undefined && (
                                <span className="pr-diff">
                                  <span className="diff-add">+{pr.additions}</span>
                                  <span className="diff-del">-{pr.deletions}</span>
                                </span>
                              )}
                            </td>
                            <td className="pr-table-td-time">{pr.lastUpdated}</td>
                            <td
                              className="pr-table-td-actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="card-btn"
                                data-tip="Open on GitHub"
                                onClick={() =>
                                  open(`https://github.com/${pr.repo}/pull/${pr.number}`)
                                }
                              >
                                <ExternalLink size={14} />
                              </button>
                              {pr.ciStatus === "failure" && (
                                <button
                                  className={`card-btn${rerunningPrIds[pr.id] ? " spin" : ""}`}
                                  data-tip="Rerun failed jobs"
                                  onClick={() => handleRerun(pr.id, pr.runId)}
                                  disabled={Boolean(rerunningPrIds[pr.id])}
                                >
                                  <Play size={14} fill="currentColor" />
                                </button>
                              )}
                              <button
                                className="card-btn card-btn-remove"
                                data-tip="Remove"
                                onClick={() => removePR(pr.id)}
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="pr-area">
                    {Object.entries(grouped).map(([repo, repoPRs]) => (
                      <div key={repo} className="repo-group">
                        <div className="repo-header">
                          <span className="repo-name">{repo}</span>
                          <span className="repo-count">{repoPRs.length}</span>
                        </div>
                        <div className="repo-cards">
                          {repoPRs.map((pr) => (
                            <PRCard
                              key={pr.id}
                              pr={pr}
                              onRemove={() => removePR(pr.id)}
                              onJobClick={(job) => launchCliForJob(pr.repo, pr.number, job)}
                              onRerun={handleRerun}
                              isRerunning={isRerunAllRunning || Boolean(rerunningPrIds[pr.id])}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {logModal && (
        <LogModal
          repo={logModal.repo}
          number={logModal.number}
          job={logModal.job}
          githubToken={githubToken}
          minimaxApiKey={minimaxApiKey}
          cliActions={cliActions}
          onClose={() => setLogModal(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          initialSettings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showOnboarding && !githubToken && (
        <OnboardingModal onOpenSettings={openSettingsFromOnboarding} onClose={closeOnboarding} />
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "red", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          <h2>App crashed</h2>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: "8px 16px" }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
