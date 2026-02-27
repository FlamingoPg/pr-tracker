import { invoke } from "@tauri-apps/api/core";

export async function analyzeFailure(
  logs: string,
  jobName: string,
  apiKey: string
): Promise<string> {
  if (!apiKey.trim()) {
    throw new Error("MiniMax API key is not configured");
  }

  // Truncate on the JS side before sending to Rust
  const truncated = logs.length > 5000 ? "[…前面内容省略…]\n" + logs.slice(-5000) : logs;

  return invoke<string>("analyze_failure", {
    logs: truncated,
    jobName,
    apiKey,
  });
}
