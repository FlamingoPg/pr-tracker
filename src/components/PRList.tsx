import { GitPullRequest, ExternalLink, Clock, CheckCircle2, XCircle, AlertCircle, Play } from 'lucide-react';
import { PRIcon } from '../types';

interface PRListProps {
  prs: PRIcon[];
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-5 h-5 text-github-green" />;
    case 'failure':
      return <XCircle className="w-5 h-5 text-github-red" />;
    case 'running':
      return <Play className="w-5 h-5 text-github-yellow animate-pulse" />;
    default:
      return <AlertCircle className="w-5 h-5 text-github-text-secondary" />;
  }
}


function formatTime(isoString: string) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function PRList({ prs }: PRListProps) {
  if (prs.length === 0) {
    return (
      <div className="text-center py-16">
        <GitPullRequest className="w-16 h-16 mx-auto text-github-text-secondary mb-4" />
        <h3 className="text-lg font-medium text-github-text mb-2">No PRs tracked</h3>
        <p className="text-github-text-secondary">Click "Add PR" to start tracking</p>
      </div>
    );
  }

  // 按仓库分组
  const grouped = prs.reduce((acc, pr) => {
    if (!acc[pr.repository]) acc[pr.repository] = [];
    acc[pr.repository].push(pr);
    return acc;
  }, {} as Record<string, PRIcon[]>);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([repo, repoPRs]) => (
        <div key={repo} className="space-y-3">
          {/* Repo Header */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-sm font-semibold text-github-text-secondary">{repo}</span>
            <span className="px-2 py-0.5 bg-[#21262d] rounded-full text-xs text-github-text-secondary">
              {repoPRs.length}
            </span>
          </div>

          {/* PR Cards */}
          <div className="space-y-2">
            {repoPRs.map((pr) => (
              <div
                key={pr.id}
                className="group bg-[#161b22] border border-github-border rounded-lg p-4 
                         hover:border-github-text-secondary transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  {/* Status Icon */}
                  <div className="mt-1">
                    {getStatusIcon(pr.ciStatus)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-github-blue hover:underline">
                            #{pr.number}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${
                            pr.state === 'open' 
                              ? 'bg-github-green/10 text-github-green border-github-green/30' 
                              : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          }`}>
                            {pr.state}
                          </span>
                          {pr.ciStatus === 'failure' && (
                            <span className="px-2 py-0.5 text-xs rounded-full border bg-github-red/10 text-github-red border-github-red/30">
                              CI Failed
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-medium text-github-text truncate group-hover:text-github-blue transition-colors">
                          {pr.title}
                        </h3>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`https://github.com/${pr.repository}/pull/${pr.number}`, '_blank');
                          }}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Checks Summary */}
                    {pr.checks.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pr.checks.slice(0, 4).map((check) => (
                          <div
                            key={check.id}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border ${
                              check.conclusion === 'success'
                                ? 'bg-github-green/10 text-github-green border-github-green/20'
                                : check.conclusion === 'failure'
                                ? 'bg-github-red/10 text-github-red border-github-red/20'
                                : 'bg-github-yellow/10 text-github-yellow border-github-yellow/20'
                            }`}
                          >
                            {check.conclusion === 'success' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : check.conclusion === 'failure' ? (
                              <XCircle className="w-3 h-3" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            <span className="truncate max-w-[120px]">{check.name}</span>
                          </div>
                        ))}
                        {pr.checks.length > 4 && (
                          <span className="px-2 py-1 text-xs text-github-text-secondary">
                            +{pr.checks.length - 4} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-github-text-secondary">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Updated {formatTime(pr.updatedAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={pr.ciStatus === 'success' ? 'text-github-green' : pr.ciStatus === 'failure' ? 'text-github-red' : 'text-github-yellow'}>
                          {pr.checks.filter(c => c.conclusion === 'success').length}/{pr.checks.length} checks passed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
