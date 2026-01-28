/**
 * PhaseCard Component
 * Sprint 7: Individual phase status card for Simple View
 * 
 * Shows phase name, status (pending/active/complete/failed), and optional duration.
 */

import { Phase, PhaseHistoryEntry } from '../../services/api/workflow';

interface PhaseCardProps {
  phase: Phase;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'failed';
  historyEntry?: PhaseHistoryEntry;
}

export function PhaseCard({ phase: _phase, label, status, historyEntry }: PhaseCardProps) {
  void _phase; // Reserved for future use
  // Calculate duration if we have history
  const duration = (() => {
    if (!historyEntry) return null;
    const start = new Date(historyEntry.started_at).getTime();
    const end = historyEntry.ended_at 
      ? new Date(historyEntry.ended_at).getTime() 
      : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  })();

  // Get status indicator
  const getStatusIndicator = () => {
    switch (status) {
      case 'complete':
        return (
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'active':
        return (
          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center animate-pulse">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
        );
      case 'failed':
        return (
          <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      case 'pending':
      default:
        return (
          <div className="w-6 h-6 rounded-full bg-gray-600 border-2 border-gray-500" />
        );
    }
  };

  // Get card classes based on status
  const getCardClasses = () => {
    const base = 'flex items-center gap-4 p-4 rounded-lg transition-all';
    switch (status) {
      case 'complete':
        return `${base} bg-green-900/20 border border-green-500/30`;
      case 'active':
        return `${base} bg-blue-900/30 border border-blue-500/50 ring-2 ring-blue-500/20`;
      case 'failed':
        return `${base} bg-red-900/20 border border-red-500/30`;
      case 'pending':
      default:
        return `${base} bg-gray-800/50 border border-gray-700/50`;
    }
  };

  // Get text color based on status
  const getTextColor = () => {
    switch (status) {
      case 'complete': return 'text-green-300';
      case 'active': return 'text-blue-300';
      case 'failed': return 'text-red-300';
      case 'pending': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className={getCardClasses()}>
      {/* Status indicator */}
      {getStatusIndicator()}
      
      {/* Phase info */}
      <div className="flex-1">
        <div className={`font-medium ${getTextColor()}`}>
          {label}
        </div>
        {duration && (
          <div className="text-sm text-gray-500 mt-1">
            {duration}
          </div>
        )}
      </div>
      
      {/* Active indicator animation */}
      {status === 'active' && (
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}
    </div>
  );
}
