import { useCallback, useEffect, useRef, useState } from "react";
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
  CIJob,
} from "./github";
import { analyzeFailure } from "./llm";
import { AppSettings, loadSettings, saveSettings } from "./settings";
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

const ONBOARDING_STORAGE_KEY = "pr_tracker_onboarding_seen_v1";

// ─── Icons ─────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

const ExternalIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

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
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--success)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === "failure") {
    return (
      <div className="status-icon failure">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--error)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
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
  const [minimaxApiKey, setMinimaxApiKey] = useState(initialSettings.minimaxApiKey);
  const [primaryCliLabel, setPrimaryCliLabel] = useState(initialSettings.primaryCliLabel);
  const [primaryCliTemplate, setPrimaryCliTemplate] = useState(initialSettings.primaryCliTemplate);
  const [secondaryCliLabel, setSecondaryCliLabel] = useState(initialSettings.secondaryCliLabel);
  const [secondaryCliTemplate, setSecondaryCliTemplate] = useState(
    initialSettings.secondaryCliTemplate
  );

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

            <label style={{ fontWeight: 600, marginTop: "8px" }}>
              MiniMax API Key (AI analysis)
            </label>
            <input
              className="add-url-input"
              type="password"
              placeholder="your_minimax_key_here"
              value={minimaxApiKey}
              onChange={(e) => setMinimaxApiKey(e.target.value)}
              autoComplete="off"
            />

            <label style={{ fontWeight: 600, marginTop: "8px" }}>Primary CLI Label</label>
            <input
              className="add-url-input"
              type="text"
              placeholder="Claude CLI"
              value={primaryCliLabel}
              onChange={(e) => setPrimaryCliLabel(e.target.value)}
              autoComplete="off"
            />

            <label style={{ fontWeight: 600 }}>Primary CLI Command Template</label>
            <input
              className="add-url-input"
              type="text"
              placeholder="claude -p {context}"
              value={primaryCliTemplate}
              onChange={(e) => setPrimaryCliTemplate(e.target.value)}
              autoComplete="off"
            />

            <label style={{ fontWeight: 600, marginTop: "8px" }}>Secondary CLI Label</label>
            <input
              className="add-url-input"
              type="text"
              placeholder="Kimi CLI"
              value={secondaryCliLabel}
              onChange={(e) => setSecondaryCliLabel(e.target.value)}
              autoComplete="off"
            />

            <label style={{ fontWeight: 600 }}>Secondary CLI Command Template</label>
            <input
              className="add-url-input"
              type="text"
              placeholder="kimi -y -p {context}"
              value={secondaryCliTemplate}
              onChange={(e) => setSecondaryCliTemplate(e.target.value)}
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
                  minimaxApiKey: minimaxApiKey.trim(),
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
  const prUrl = `https://github.com/${repo}/pull/${number}`;
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
            setAnalysisError("MiniMax key is not configured. You can still run CLI analysis below.");
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
  onRerunAll,
  showRerunAll,
  isRerunning,
  isRerunAllRunning,
}: {
  pr: PR;
  onRemove: () => void;
  onJobClick: (job: CIJob) => void;
  onRerun: (prId: number, runId?: number) => void;
  onRerunAll?: () => void;
  showRerunAll?: boolean;
  isRerunning?: boolean;
  isRerunAllRunning?: boolean;
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
                      ? "▼ 收起"
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
                      title="点击查看 AI 分析"
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
            title="Open on GitHub"
            onClick={() => open(`https://github.com/${pr.repo}/pull/${pr.number}`)}
          >
            <ExternalIcon />
          </button>
          {pr.ciStatus === "failure" && onRerun && (
            <button
              className={`card-btn${isRerunning ? " spin" : ""}`}
              title={isRerunning ? "Rerun in progress" : "Rerun failed jobs"}
              onClick={() => onRerun(pr.id, pr.runId)}
              disabled={isRerunning}
            >
              <RefreshIcon />
            </button>
          )}
          {showRerunAll && onRerunAll && (
            <button
              className="card-btn"
              title={isRerunAllRunning ? "Rerun all in progress" : "Rerun all failed PRs"}
              onClick={() => onRerunAll()}
              disabled={isRerunAllRunning}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
          )}
          <button className="card-btn danger" title="Stop tracking" onClick={() => onRemove()}>
            <TrashIcon />
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
  const [isFloating, setIsFloating] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "seen"
  );

  const githubToken = settings.githubToken;
  const minimaxApiKey = settings.minimaxApiKey;
  const cliActions = [
    { label: settings.primaryCliLabel, template: settings.primaryCliTemplate },
    { label: settings.secondaryCliLabel, template: settings.secondaryCliTemplate },
  ];

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

  // Ref so the auto-refresh interval always reads the latest PR list
  // without needing to re-create the interval on every state change
  const prsRef = useRef<PR[]>(prs);
  useEffect(() => {
    prsRef.current = prs;
  });

  const hasRunning = prs.some((p) => p.ciStatus === "running");

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
    async (pr: PR) => {
      if (!githubToken) return;

      setPrs((prev) =>
        prev.map((p) => (p.id === pr.id ? { ...p, isLoading: true, error: undefined } : p))
      );

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
      }
    },
    [githubToken]
  );

  // Auto-refresh saved PRs on first load
  useEffect(() => {
    if (githubToken && prs.length > 0) {
      // Refresh all saved PRs after a short delay
      const timer = setTimeout(() => {
        prs.forEach((pr) => fetchAndUpdatePR(pr));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [githubToken, prs, fetchAndUpdatePR]);

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
      prsRef.current.forEach((pr) => fetchAndUpdatePR(pr));
    }, ms);
    return () => clearInterval(timer);
  }, [hasRunning, fetchAndUpdatePR]);

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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                  fill="#24292f"
                />
              </svg>
              <div>
                <div className="logo-name">PR Tracker</div>
                <div className="logo-sub">GitHub CI Monitor</div>
              </div>
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
              title="Refresh all"
            >
              <RefreshIcon />
              Refresh
            </button>
            <div className="mode-toggles">
              <button
                className="theme-toggle"
                onClick={() => setShowSettings(true)}
                title="Open settings"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 2a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V0a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 12 1.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V0a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 19.4 2a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 8a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
                </svg>
              </button>
              <button
                className="theme-toggle"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {darkMode ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
              <button
                className="theme-toggle"
                onClick={toggleFloating}
                title={isFloating ? "Exit floating mode" : "Enter floating mode (always on top)"}
                style={{
                  background: isFloating ? "var(--primary)" : undefined,
                  color: isFloating ? "white" : undefined,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18M3 9h18" />
                </svg>
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
                  onJobClick={(job) => setLogModal({ repo: pr.repo, number: pr.number, job })}
                  onRerun={handleRerun}
                  onRerunAll={undefined}
                  showRerunAll={false}
                  isRerunning={isRerunAllRunning || Boolean(rerunningPrIds[pr.id])}
                  isRerunAllRunning={isRerunAllRunning}
                />
              ))}
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
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                      fill="#24292f"
                    />
                  </svg>
                </div>
                <p className="empty-title">No PRs tracked yet</p>
                <p className="empty-desc">Paste a GitHub PR URL above to start tracking</p>
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
                      {repoPRs.map((pr, idx) => (
                        <PRCard
                          key={pr.id}
                          pr={pr}
                          onRemove={() => removePR(pr.id)}
                          onJobClick={(job) =>
                            setLogModal({ repo: pr.repo, number: pr.number, job })
                          }
                          onRerun={handleRerun}
                          onRerunAll={rerunAllFailed}
                          showRerunAll={idx === 0 && repoPRs.some((p) => p.ciStatus === "failure")}
                          isRerunning={isRerunAllRunning || Boolean(rerunningPrIds[pr.id])}
                          isRerunAllRunning={isRerunAllRunning}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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

export default App;
