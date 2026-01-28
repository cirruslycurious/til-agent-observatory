import { Link } from "react-router-dom";
import { useState } from "react";
import { Eye, ArrowRight, Crown, Wrench, Activity, GitBranch, BarChart3, Layers, Zap, ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "../components/ui/Button";
import { MissionBriefingModal } from "../components/MissionBriefingModal";

export function LandingPage() {
  const [showBriefing, setShowBriefing] = useState(false);

  return (
    <div className="min-h-screen tactical-grid relative overflow-hidden text-foreground">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-primary/20 border border-primary/50 flex items-center justify-center">
              <Eye className="w-4 h-4 text-primary" />
            </div>
            <span className="font-mono text-lg font-bold tracking-tight">TIL</span>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowBriefing(true)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors font-mono flex items-center gap-1.5"
            >
              <HelpCircle className="w-4 h-4" />
              How It Works
            </button>
            <Link to="/dashboard" className="text-sm text-accent hover:text-accent/80 transition-colors font-mono font-semibold">
              Dashboard
            </Link>
            <Link to="/dashboard-guide" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-mono">
              Guide
            </Link>
            <Link to="/observatory">
              <Button variant="secondary" size="small" className="border border-primary/50 text-primary bg-transparent hover:bg-primary/10">
                Launch Observatory
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Mission Briefing Modal */}
      {showBriefing && (
        <MissionBriefingModal onClose={() => setShowBriefing(false)} />
      )}

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-12">
        <div className="max-w-4xl text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-xs text-primary uppercase tracking-wider">Observability Platform</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1] text-left">
            <span className="text-foreground">Observatory for</span>
            <br />
            <span className="text-primary text-glow-primary">Agentic AI</span>
          </h1>

          <div className="text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed text-left space-y-4">
            <p>
              Each TIL run starts with a single goal: generate a conference-ready abstract 
              for a specific conference and topic. The agent decides how.
            </p>
            <p>
              Acceptance depends on both writing quality and conference fit, so each abstract 
              gets two independent evaluations: blind conference prediction (targeting) and 
              triple-quality scoring (Manager self-assessment + dual Nova assessors).
            </p>
            <p>
              By comparing decisions across agents, scorers, and contexts, TIL reveals 
              systematic differences in cognitive strategy, learning curves, and behavioral bias.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/observatory">
              <Button size="large" className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono group">
                Run Instrumented Workflow
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button 
              variant="secondary" 
              size="large" 
              onClick={() => setShowBriefing(true)}
              className="border border-accent/50 text-accent hover:bg-accent/10 font-mono"
            >
              <HelpCircle className="mr-2 w-4 h-4" />
              How It Works
            </Button>
          </div>
        </div>
      </section>

      {/* System architecture strip */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-12">
        <div className="tactical-card p-8 glow-primary animated-border">
          <div className="text-xs uppercase tracking-[0.14em] text-accent mb-8">System Architecture</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
            <div className="tactical-card corner-accent corner-amber p-4 text-center border-amber-400/70">
              <div className="w-12 h-12 mx-auto mb-3 rounded-sm bg-amber-500/20 border border-amber-400/70 flex items-center justify-center">
                <Crown className="w-6 h-6 text-yellow-400 stroke-yellow-400 fill-yellow-400" />
              </div>
              <div className="font-mono text-sm font-bold text-yellow-400">MANAGER</div>
              <div className="text-xs text-muted-foreground mt-1">Orchestrates & Evaluates</div>
            </div>
            <div className="hidden md:flex items-center justify-center">
              <ChevronRight className="w-8 h-8 text-border" />
            </div>
            <div className="tactical-card corner-accent corner-success p-4 text-center border-success/60">
              <div className="w-12 h-12 mx-auto mb-3 rounded-sm bg-success/15 border border-success/60 flex items-center justify-center">
                <Wrench className="w-6 h-6 text-green-400 stroke-green-400 fill-green-400" />
              </div>
              <div className="font-mono text-sm font-bold text-green-400">WORKER</div>
              <div className="text-xs text-muted-foreground mt-1">ReAct Tool Loop</div>
            </div>
            <div className="hidden md:flex items-center justify-center">
              <ChevronRight className="w-8 h-8 text-border" />
            </div>
            <div className="tactical-card corner-accent corner-purple p-4 text-center border-purple-500/50">
              <div className="w-12 h-12 mx-auto mb-3 rounded-sm bg-purple-500/20 border border-purple-500/60 flex items-center justify-center">
                <Eye className="w-6 h-6 text-purple-400 stroke-purple-400 fill-purple-400" />
              </div>
              <div className="font-mono text-sm font-bold text-purple-400">EVALUATOR</div>
              <div className="text-xs text-muted-foreground mt-1">Blind Assessment</div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono mr-2">Available Tools:</span>
              {["dynamodb_lookup", "search_abstracts", "web_search", "red_team_review", "submit_abstract"].map((tool) => (
                <span key={tool} className="px-2 py-1 rounded text-xs font-mono bg-primary/10 text-primary border border-primary/20">
                  {tool}
                </span>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3 font-mono">
              3 action points per iteration • Worker must choose wisely
            </p>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why <span className="text-primary">Observe</span> Agent Workflows?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Production AI systems need production-grade observability. Understand what your agents are doing and why.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ValueCard 
            icon={<Activity className="w-6 h-6 text-cyan-400 stroke-cyan-400 fill-cyan-400" />}
            title="Decision Traceability"
            description="Every tool call, every reasoning step, every evaluation captured and visualized in real-time."
            color="cyan"
          />
          <ValueCard 
            icon={<GitBranch className="w-6 h-6 text-yellow-400 stroke-yellow-400 fill-yellow-400" />}
            title="Iteration Analysis"
            description="Watch agents iterate toward goals. See accept/reject decisions and manager feedback at each step."
            color="yellow"
          />
          <ValueCard 
            icon={<BarChart3 className="w-6 h-6 text-green-400 stroke-green-400 fill-green-400" />}
            title="Behavioral Metrics"
            description="Aggregate patterns across runs. Tool usage frequency, cost per task, vendor performance comparisons."
            color="green"
          />
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <div className="text-xs uppercase tracking-[0.18em] text-accent text-center mb-10">How It Works</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StepCard 
            step="01"
            title="Select Conference & Topic"
            description="Choose from 5 major conferences and 8 technical topics"
          />
          <StepCard 
            step="02"
            title="Manager Formulates Goal"
            description="High-level orchestration agent defines the objective"
          />
          <StepCard 
            step="03"
            title="Worker Executes Tools"
            description="Autonomous agent uses ReAct loop with 3 action points"
          />
          <StepCard 
            step="04"
            title="Evaluate & Iterate"
            description="Blind evaluator predicts conference, manager accepts or rejects"
          />
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="tactical-card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-sm bg-cyan-500/20 border border-cyan-400/70 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-cyan-400 stroke-cyan-400 fill-cyan-400" />
              </div>
              <div>
                <h3 className="font-bold mb-2">Dual-Layer Visualization</h3>
                <p className="text-sm text-muted-foreground">
                  Watch the workflow unfold in narrative view or dive deep into the trace with full decision events, artifacts, and timing data.
                </p>
              </div>
            </div>
          </div>
          <div className="tactical-card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-sm bg-yellow-500/20 border border-yellow-400/70 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-yellow-400 stroke-yellow-400 fill-yellow-400" />
              </div>
              <div>
                <h3 className="font-bold mb-2">Cost Management</h3>
                <p className="text-sm text-muted-foreground">
                  Per-job budgets, action point allocation, and global cost protection ensure predictable spending on AI operations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        <div className="tactical-card p-12 text-center glow-primary animated-border">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to See Your Agents Think?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Launch an instrumented workflow and watch multi-agent orchestration in action. Every decision visible. Every tool call traced.
          </p>
          <Link to="/observatory">
            <Button size="large" className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono group">
              Launch Observatory
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-sm bg-primary/20 border border-primary/50 flex items-center justify-center">
                <Eye className="w-3 h-3 text-primary" />
              </div>
              <span className="font-mono text-sm text-muted-foreground">TIL — Agent Workflow Observatory</span>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              Research observatory for agentic AI
            </div>
          </div>
        </div>
      </footer>

      <div className="fixed inset-0 pointer-events-none scanline z-50" />
    </div>
  );
}

function ValueCard({ icon, title, description, color }: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  color: "cyan" | "yellow" | "green";
}) {
  const colorClasses = {
    cyan: "bg-cyan-500/20 border-cyan-400/70",
    yellow: "bg-yellow-500/20 border-yellow-400/70",
    green: "bg-green-500/20 border-green-400/70",
  };
  
  const textColors = {
    cyan: "text-cyan-400",
    yellow: "text-yellow-400",
    green: "text-green-400",
  };
  
  const cornerClasses = {
    cyan: "corner-cyan",
    yellow: "corner-yellow",
    green: "corner-green",
  };
  
  return (
    <div className={`tactical-card corner-accent ${cornerClasses[color]} p-6 hover:glow-primary transition-shadow duration-300`}>
      <div className={`w-12 h-12 rounded-sm border flex items-center justify-center mb-4 ${colorClasses[color]}`}>
        {icon}
      </div>
      <h3 className={`font-bold text-lg mb-2 ${textColors[color]}`}>{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="tactical-card corner-accent corner-cyan p-6 text-center">
      <div className="font-mono text-4xl font-bold text-cyan-400 mb-4">{step}</div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
