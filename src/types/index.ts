export interface PR {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  html_url: string;
  head: {
    sha: string;
    ref: string;
  };
  base: {
    ref: string;
  };
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  repository: string;
}

export interface CheckRun {
  id: number;
  name: string;
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
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowRun {
  id: number;
  name: string;
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
  html_url: string;
  head_sha: string;
  run_number: number;
  created_at: string;
  updated_at: string;
}

export interface PRIcon {
  id: number;
  repository: string;
  number: number;
  title: string;
  state: string;
  ciStatus: "success" | "failure" | "pending" | "running";
  checks: CheckRun[];
  updatedAt: string;
}
