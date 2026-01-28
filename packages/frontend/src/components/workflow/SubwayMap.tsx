import { useState, useMemo } from 'react';
import { CheckCircle2, Loader2, Circle, XCircle, ChevronRight, Target, Cpu, Eye, Brain, FileCheck } from 'lucide-react';
import { Phase, PhaseHistoryEntry } from '../../services/api/workflow';
import { cn } from '../../lib/utils';

interface SubwayMapProps {
  currentPhase: Phase;
  phaseHistory: PhaseHistoryEntry[];
  iteration: number;
  maxIterations: number;
  isTerminal: boolean;
  conference: string;
  topic: string;
}

type StageStatus = 'pending' | 'active' | 'complete' | 'failed';

interface Stage {
  id: string;
  phase: Phase;
  name: string;
  description: string;
  status: StageStatus;
  icon: typeof Target;
}

export function SubwayMap({
  currentPhase,
  phaseHistory,
  iteration,
  maxIterations,
  isTerminal,
  conference,
  topic
}: SubwayMapProps) {
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);

  // Map phases to subway stages
  const stages = useMemo((): Stage[] => {
    const phaseStatusMap = new Map<Phase, StageStatus>();
    
    // Build status map from phase history
    for (const entry of phaseHistory) {
      if (entry.ended_at) {
        phaseStatusMap.set(entry.phase, 'complete');
      } else {
        phaseStatusMap.set(entry.phase, 'active');
      }
    }

    // If terminal, mark current phase appropriately
    if (isTerminal) {
      if (currentPhase === 'failed') {
        phaseStatusMap.set(currentPhase, 'failed');
      } else if (currentPhase === 'completed') {
        phaseStatusMap.set(currentPhase, 'complete');
      }
    }

    // Define all stages (6 stages including Iterate)
    const allStages: Stage[] = [
      {
        id: '1',
        phase: 'goal_formulation',
        name: 'Initialize',
        description: 'Goal formulation and context setup',
        status: phaseStatusMap.get('goal_formulation') || 'pending',
        icon: Target
      },
      {
        id: '2',
        phase: 'worker_execution',
        name: 'Research',
        description: 'Worker gathers context and drafts',
        status: phaseStatusMap.get('worker_execution') || 'pending',
        icon: Cpu
      },
      {
        id: '3',
        phase: 'blind_evaluation',
        name: 'Evaluate',
        description: 'Blind evaluator assesses quality',
        status: phaseStatusMap.get('blind_evaluation') || 'pending',
        icon: Eye
      },
      {
        id: '4',
        phase: 'manager_review',
        name: 'Review',
        description: 'Manager decides accept or reject',
        status: phaseStatusMap.get('manager_review') || 'pending',
        icon: Brain
      },
      {
        id: '5',
        phase: 'manager_review', // Uses same phase but represents the iteration decision
        name: 'Iterate',
        description: 'Refine based on feedback or proceed',
        status: iteration > 0 && !isTerminal ? 'complete' : iteration === maxIterations - 1 ? 'active' : 'pending',
        icon: Brain
      },
      {
        id: '6',
        phase: 'completed',
        name: 'Finalize',
        description: 'Abstract submitted',
        status: phaseStatusMap.get('completed') || 'pending',
        icon: FileCheck
      }
    ];

    // Mark failed state if applicable
    if (currentPhase === 'failed') {
      return allStages.map(stage => ({
        ...stage,
        status: stage.phase === currentPhase ? 'failed' as StageStatus : stage.status
      }));
    }

    return allStages;
  }, [currentPhase, phaseHistory, isTerminal]);

  // Auto-select current stage
  useMemo(() => {
    const currentStage = stages.find(s => s.status === 'active') || stages[stages.length - 1];
    if (!selectedStage) {
      setSelectedStage(currentStage);
    }
  }, [stages, selectedStage]);

  const getStageIcon = (status: StageStatus) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="w-5 h-5 text-success" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Circle className="w-5 h-5 text-muted-foreground/40" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Subway Map - Left */}
      <div className="lg:col-span-2">
        <div className="tactical-card p-6">
          <h3 className="tactical-header mb-6">MISSION PROGRESS</h3>
          
          <div className="relative">
            {/* Vertical subway line */}
            <div className="absolute left-[22px] top-8 bottom-8 w-1 bg-gradient-to-b from-success via-primary to-muted/30 rounded-full" />
            
            <div className="space-y-2">
              {stages.map((stage, index) => (
                  <button
                    key={stage.id}
                    onClick={() => setSelectedStage(stage)}
                    className={cn(
                      "w-full flex items-start gap-4 p-3 rounded text-left transition-all relative group",
                      selectedStage?.id === stage.id 
                        ? "bg-primary/10 border border-primary/30" 
                        : "hover:bg-muted/20 border border-transparent",
                      stage.status === "active" && selectedStage?.id !== stage.id && "bg-primary/5"
                    )}
                  >
                    {/* Subway Node */}
                    <div className={cn(
                      "relative z-10 flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all border-2",
                      stage.status === "complete" && "bg-success/20 border-success shadow-[0_0_12px_hsl(var(--success)/0.4)]",
                      stage.status === "active" && "bg-primary/20 border-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)] animate-pulse",
                      stage.status === "pending" && "bg-muted/30 border-muted-foreground/30",
                      stage.status === "failed" && "bg-destructive/20 border-destructive shadow-[0_0_12px_hsl(var(--destructive)/0.4)]"
                    )}>
                      {getStageIcon(stage.status)}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-xs font-mono px-1.5 py-0.5 rounded",
                          stage.status === "complete" && "bg-success/20 text-success",
                          stage.status === "active" && "bg-primary/20 text-primary",
                          stage.status === "pending" && "bg-muted text-muted-foreground",
                          stage.status === "failed" && "bg-destructive/20 text-destructive"
                        )}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className={cn(
                          "font-semibold text-sm",
                          stage.status === "complete" && "text-success",
                          stage.status === "active" && "text-primary",
                          stage.status === "pending" && "text-muted-foreground",
                          stage.status === "failed" && "text-destructive"
                        )}>
                          {stage.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stage.description}
                      </p>
                    </div>
                    
                    {/* Arrow indicator */}
                    <ChevronRight className={cn(
                      "w-4 h-4 mt-2 transition-all",
                      selectedStage?.id === stage.id ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-50"
                    )} />
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stage Detail - Right */}
      <div className="lg:col-span-3 space-y-6">
        {selectedStage && (
          <div className="tactical-card p-6">
            <div className="flex items-center gap-3 mb-4">
              {getStageIcon(selectedStage.status)}
              <h3 className="text-lg font-semibold">{selectedStage.name}</h3>
              <span className={cn(
                "text-xs px-2 py-1 rounded font-mono uppercase tracking-wider",
                selectedStage.status === "complete" && "bg-success/20 text-success border border-success/30",
                selectedStage.status === "active" && "bg-primary/20 text-primary border border-primary/30",
                selectedStage.status === "pending" && "bg-muted text-muted-foreground border border-border",
                selectedStage.status === "failed" && "bg-destructive/20 text-destructive border border-destructive/30"
              )}>
                {selectedStage.status}
              </span>
            </div>
            <p className="text-muted-foreground mb-6">{selectedStage.description}</p>
            
            {/* Stage context */}
            <div className="space-y-3">
              <div className="p-4 rounded bg-muted/20 border border-border">
                <p className="tactical-header mb-2">TARGET CONFERENCE</p>
                <p className="text-sm font-mono text-foreground capitalize">{conference.replace(/_/g, ' ')}</p>
              </div>

              <div className="p-4 rounded bg-muted/20 border border-border">
                <p className="tactical-header mb-2">TOPIC</p>
                <p className="text-sm font-mono text-foreground capitalize">{topic.replace(/_/g, ' ')}</p>
              </div>

              <div className="p-4 rounded bg-muted/20 border border-border">
                <p className="tactical-header mb-2">ITERATION PROGRESS</p>
                <p className="text-sm font-mono text-foreground">
                  Iteration {iteration + 1} of {maxIterations}
                </p>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-primary to-primary-glow"
                    style={{ 
                      width: `${((iteration + 1) / maxIterations) * 100}%`,
                      boxShadow: '0 0 10px hsl(var(--primary) / 0.5)'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
