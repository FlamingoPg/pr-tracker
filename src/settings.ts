export interface AppSettings {
  githubToken: string;
  minimaxApiKey: string;
  primaryCliLabel: string;
  primaryCliTemplate: string;
  secondaryCliLabel: string;
  secondaryCliTemplate: string;
}

const STORAGE_KEY = "pr_tracker_settings_v1";

function defaultSettings(): AppSettings {
  return {
    githubToken: "",
    minimaxApiKey: "",
    primaryCliLabel: "Codex",
    primaryCliTemplate: "codex {context}",
    secondaryCliLabel: "",
    secondaryCliTemplate: "",
  };
}

function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = defaultSettings();
  let primaryCliLabel =
    (input?.primaryCliLabel || defaults.primaryCliLabel).trim() || defaults.primaryCliLabel;
  let primaryCliTemplate = (input?.primaryCliTemplate ?? defaults.primaryCliTemplate).trim();
  let secondaryCliLabel =
    (input?.secondaryCliLabel || defaults.secondaryCliLabel).trim() || defaults.secondaryCliLabel;
  let secondaryCliTemplate = (input?.secondaryCliTemplate ?? defaults.secondaryCliTemplate).trim();

  // Migrate old defaults to Codex
  if (primaryCliTemplate === "claude -p {context}") {
    primaryCliLabel = defaults.primaryCliLabel;
    primaryCliTemplate = defaults.primaryCliTemplate;
  }
  if (secondaryCliTemplate === "kimi -y -p {context}") {
    secondaryCliLabel = defaults.secondaryCliLabel;
    secondaryCliTemplate = defaults.secondaryCliTemplate;
  }

  return {
    githubToken: (input?.githubToken || defaults.githubToken).trim(),
    minimaxApiKey: (input?.minimaxApiKey || defaults.minimaxApiKey).trim(),
    primaryCliLabel,
    primaryCliTemplate,
    secondaryCliLabel,
    secondaryCliTemplate,
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const result = raw
      ? normalizeSettings(JSON.parse(raw) as Partial<AppSettings>)
      : normalizeSettings(undefined);
    // Persist migration results back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    return result;
  } catch {
    return normalizeSettings(undefined);
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}
