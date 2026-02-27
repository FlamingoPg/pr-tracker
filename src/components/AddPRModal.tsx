import { useState } from "react";
import { X, Github } from "lucide-react";

interface AddPRModalProps {
  onClose: () => void;
  onAdd: (repo: string, number: number) => void;
}

export default function AddPRModal({ onClose, onAdd }: AddPRModalProps) {
  const [repo, setRepo] = useState("");
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 验证 repo 格式 (owner/repo)
    const repoRegex = /^[\w-]+\/[\w-]+$/;
    if (!repoRegex.test(repo)) {
      setError("Repository format should be: owner/repo");
      return;
    }

    const prNumber = parseInt(number, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      setError("PR number must be a positive integer");
      return;
    }

    onAdd(repo, prNumber);
  };

  // 解析 GitHub URL
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    const match = text.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (match) {
      e.preventDefault();
      setRepo(match[1]);
      setNumber(match[2]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#161b22] border border-github-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-github-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-github-blue/10 rounded-lg flex items-center justify-center">
              <Github className="w-5 h-5 text-github-blue" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Track New PR</h2>
              <p className="text-xs text-github-text-secondary">
                Add a PR to monitor its CI status
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Repository <span className="text-github-text-secondary">(owner/repo)</span>
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              onPaste={handlePaste}
              placeholder="e.g., sgl-project/sglang"
              className="w-full px-4 py-2.5 bg-[#0d1117] border border-github-border rounded-lg
                       focus:outline-none focus:border-github-blue focus:ring-1 focus:ring-github-blue
                       placeholder:text-github-text-secondary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">PR Number</label>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="e.g., 18902"
              className="w-full px-4 py-2.5 bg-[#0d1117] border border-github-border rounded-lg
                       focus:outline-none focus:border-github-blue focus:ring-1 focus:ring-github-blue
                       placeholder:text-github-text-secondary"
            />
          </div>

          {error && (
            <div className="p-3 bg-github-red/10 border border-github-red/30 rounded-lg text-sm text-github-red">
              {error}
            </div>
          )}

          <div className="pt-2">
            <p className="text-xs text-github-text-secondary mb-4">
              💡 Tip: You can paste a GitHub PR URL and it will auto-fill the fields
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-github-border rounded-lg font-medium
                       hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-github-green hover:bg-[#2ea043] text-white 
                       rounded-lg font-medium transition-colors"
            >
              Add PR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
