/**
 * WorkflowSimpleView Component
 * Sprint 7: High-level phase cards view (default, mobile-friendly)
 * 
 * Shows workflow phases as status cards:
 * Goal Formulation → Drafting & Research → Manager Review → Final Evaluation → Complete
 */

import { Phase, PhaseHistoryEntry } from '../../services/api/workflow';
import { PhaseCard } from './PhaseCard';

// Ordered phases for display (matches actual workflow)
// Goal → Worker → Blind Eval (Nova) → Manager Review → (loop or complete)
const PHASES: { phase: Phase; label: string }[] = [
  { phase: 'goal_formulation', label: 'Goal Formulation' },
  { phase: 'worker_execution', label: 'Drafting & Research' },
  { phase: 'blind_evaluation', label: 'Blind Evaluation' },
  { phase: 'manager_review', label: 'Manager Review' },
  { phase: 'completed', label: 'Completed' },
];

interface WorkflowSimpleViewProps {
  currentPhase: Phase;
  phaseHistory: PhaseHistoryEntry[];
  isTerminal: boolean;
}

export function WorkflowSimpleView({
  currentPhase,
  phaseHistory,
  isTerminal,
}: WorkflowSimpleViewProps) {
  // Determine phase status
  const getPhaseStatus = (phase: Phase): 'pending' | 'active' | 'complete' | 'failed' => {
    // Special case: failed job
    if (currentPhase === 'failed') {
      // Find which phase failed
      const phaseIndex = PHASES.findIndex(p => p.phase === phase);
      const currentIndex = PHASES.findIndex(p => p.phase === currentPhase);
      if (phaseIndex < currentIndex) return 'complete';
      return 'failed';
    }
    
    // Get phase indices
    const phaseIndex = PHASES.findIndex(p => p.phase === phase);
    const currentIndex = PHASES.findIndex(p => p.phase === currentPhase);
    
    // Past phases are complete
    if (phaseIndex < currentIndex) return 'complete';
    
    // Current phase
    if (phaseIndex === currentIndex) {
      if (isTerminal) return 'complete';
      return 'active';
    }
    
    // Future phases are pending
    return 'pending';
  };

  // Find history entry for a phase
  const getHistoryEntry = (phase: Phase): PhaseHistoryEntry | undefined => {
    return phaseHistory.find(h => h.phase === phase);
  };

  return (
    <div className="space-y-3">
      {PHASES.map((phaseInfo, index) => (
        <div key={phaseInfo.phase} className="flex items-center gap-2">
          {/* Connector line (except for first item) */}
          {index > 0 && (
            <div className="absolute -mt-6 ml-3 w-0.5 h-6 bg-gray-700" />
          )}
          
          <PhaseCard
            phase={phaseInfo.phase}
            label={phaseInfo.label}
            status={getPhaseStatus(phaseInfo.phase)}
            historyEntry={getHistoryEntry(phaseInfo.phase)}
          />
        </div>
      ))}
    </div>
  );
}
