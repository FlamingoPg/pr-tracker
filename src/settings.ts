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
    primaryCliLabel: "Claude CLI",
    primaryCliTemplate: "claude -p {context}",
    secondaryCliLabel: "Kimi CLI",
    secondaryCliTemplate: "kimi -y -p {context}",
  };
}

function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = defaultSettings();
  const primaryCliTemplate = input?.primaryCliTemplate ?? defaults.primaryCliTemplate;
  const secondaryCliTemplate = input?.secondaryCliTemplate ?? defaults.secondaryCliTemplate;

  return {
    githubToken: (input?.githubToken || defaults.githubToken).trim(),
    minimaxApiKey: (input?.minimaxApiKey || defaults.minimaxApiKey).trim(),
    primaryCliLabel: (input?.primaryCliLabel || defaults.primaryCliLabel).trim() || defaults.primaryCliLabel,
    primaryCliTemplate: primaryCliTemplate.trim(),
    secondaryCliLabel: (input?.secondaryCliLabel || defaults.secondaryCliLabel).trim() || defaults.secondaryCliLabel,
    secondaryCliTemplate: secondaryCliTemplate.trim(),
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeSettings(undefined);
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return normalizeSettings(parsed);
  } catch {
    return normalizeSettings(undefined);
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}
