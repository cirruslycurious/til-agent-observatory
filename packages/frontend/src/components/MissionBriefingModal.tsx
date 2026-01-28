import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  X,
  Target,
  GitBranch,
  Brain,
  Scale,
  BarChart3,
  Shield,
  Cpu,
  Eye,
  Users,
  Wrench,
  TrendingUp,
  ArrowRight,
  Crosshair
} from "lucide-react";
import { Button } from "./ui/Button";

interface MissionBriefingModalProps {
  onClose: () => void;
}

export function MissionBriefingModal({ onClose }: MissionBriefingModalProps) {
  const [activeTab, setActiveTab] = useState<"workflow" | "agentic" | "evaluation" | "intel">("workflow");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden tactical-card glow-primary">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-sm bg-primary/20 border border-primary/50 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-bold text-primary uppercase tracking-wider">How It Works</h2>
              <p className="text-xs text-muted-foreground">TIL Observatory • System Overview</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-sm border border-border hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border">
          {[
            { id: "workflow", label: "Overview", icon: GitBranch },
            { id: "agentic", label: "Agent Autonomy", icon: Brain },
            { id: "evaluation", label: "Quality Checks", icon: Scale },
            { id: "intel", label: "Analytics", icon: BarChart3 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === tab.id 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === "workflow" && <WorkflowTab />}
          {activeTab === "agentic" && <AgenticTab />}
          {activeTab === "evaluation" && <EvaluationTab />}
          {activeTab === "intel" && <IntelTab />}
        </div>

        {/* Footer CTA */}
        <div className="p-6 border-t border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Ready to observe agent behavior firsthand?
            </p>
            <div className="flex gap-3">
              <Link to="/dashboard" onClick={onClose}>
                <Button variant="secondary" size="small" className="font-mono border-accent/50 text-accent hover:bg-accent/10">
                  <BarChart3 className="mr-2 w-4 h-4" />
                  View Dashboards
                </Button>
              </Link>
              <Link to="/observatory" onClick={onClose}>
                <Button size="small" className="font-mono bg-primary hover:bg-primary/90">
                  <Crosshair className="mr-2 w-4 h-4" />
                  Launch Workflow
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowTab() {
  return (
    <div className="space-y-6">
      <div className="prose prose-invert max-w-none">
        <p className="text-muted-foreground leading-relaxed">
          TIL orchestrates a <span className="text-foreground font-semibold">Manager-Worker-Evaluator</span> pattern 
          to generate conference abstracts. But the abstracts aren't the point—they're the <span className="text-primary">vehicle</span> for 
          generating rich, observable AI behavior.
        </p>
      </div>

      {/* Pipeline Visualization */}
      <div className="grid grid-cols-3 gap-4">
        <div className="tactical-card p-4 border-accent/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-sm bg-accent/20 border border-accent/50 flex items-center justify-center">
              <Shield className="w-4 h-4 text-accent" />
            </div>
            <span className="font-mono text-sm font-bold text-accent">MANAGER</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-accent">▸</span>
              Formulates goals for the Worker
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">▸</span>
              Evaluates quality from multiple perspectives
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">▸</span>
              Accepts high-quality work or requests refinement
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">▸</span>
              Provides feedback—<span className="text-foreground">not</span> instructions
            </li>
          </ul>
        </div>

        <div className="tactical-card p-4 border-success/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-sm bg-success/20 border border-success/50 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-success" />
            </div>
            <span className="font-mono text-sm font-bold text-success">WORKER</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-success">▸</span>
              Executes ReAct (Reason + Act) loop
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success">▸</span>
              <span className="font-mono text-success">3 action points</span> per iteration
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success">▸</span>
              Chooses tools autonomously
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success">▸</span>
              Full history of prior submissions & feedback
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success">▸</span>
              Submits title + abstract
            </li>
          </ul>
        </div>

        <div className="tactical-card p-4 border-purple-500/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-sm bg-purple-500/20 border border-purple-500/50 flex items-center justify-center">
              <Eye className="w-4 h-4 text-purple-400" />
            </div>
            <span className="font-mono text-sm font-bold text-purple-400">EVALUATOR</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-purple-400">▸</span>
              Amazon Nova via Bedrock
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400">▸</span>
              <span className="text-foreground">Blind</span> to target conference
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400">▸</span>
              Predicts which conference fits
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400">▸</span>
              Decoy option tests discrimination
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400">▸</span>
              Affects Manager penalties
            </li>
          </ul>
        </div>
      </div>

      <div className="tactical-card p-4 bg-accent/5 border-accent/30">
        <div className="flex items-start gap-3">
          <Users className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Vendor Rotation</p>
            <p className="text-xs text-muted-foreground">
              Manager and Worker alternate between OpenAI and Anthropic models—and are always <span className="text-foreground">opposite</span> of each other. 
              This creates natural variation for comparing vendor behaviors across the same workflow structure.
            </p>
          </div>
        </div>
      </div>

      <div className="tactical-card p-4 bg-primary/5 border-primary/30">
        <div className="flex items-start gap-3">
          <Target className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Multiple Perspectives</p>
            <p className="text-xs text-muted-foreground">
              Each abstract is evaluated from three independent perspectives to ensure balanced quality assessment. 
              Think of it like having multiple reviewers score a paper submission—reduces bias and catches blind spots.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgenticTab() {
  return (
    <div className="space-y-6">
      <div className="prose prose-invert max-w-none">
        <p className="text-muted-foreground leading-relaxed">
          The Worker agent operates with <span className="text-success font-semibold">genuine autonomy</span>. 
          With only 3 action points per iteration, it must make <span className="text-foreground">strategic decisions</span> about 
          which tools to invoke and when—there's no script to follow.
        </p>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { name: "dynamodb_lookup", cost: 1, desc: "Retrieve conference metadata" },
          { name: "search_abstracts", cost: 2, desc: "FTS across 200+ abstracts" },
          { name: "web_search", cost: 1, desc: "External research query" },
          { name: "red_team_review", cost: 1, desc: "Self-critique for weaknesses" },
          { name: "submit_abstract", cost: 0, desc: "Submit final title + abstract" },
        ].map((tool) => (
          <div key={tool.name} className="tactical-card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-primary/20 border border-primary/50 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-foreground">{tool.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  tool.cost === 0 ? "bg-muted text-muted-foreground" :
                  tool.cost === 1 ? "bg-success/20 text-success" : "bg-accent/20 text-accent"
                }`}>
                  {tool.cost}pt
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{tool.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Key Agentic Behaviors</h4>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="tactical-card p-3 border-success/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-sm bg-success/20 flex items-center justify-center">
                <Brain className="w-3 h-3 text-success" />
              </div>
              <span className="font-mono text-xs text-success">AGENT</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Worker <span className="text-foreground">chooses</span> which tools to invoke based on context, 
              balancing information gathering vs. action point budget.
            </p>
          </div>

          <div className="tactical-card p-3 border-muted">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-sm bg-muted flex items-center justify-center">
                <GitBranch className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="font-mono text-xs text-muted-foreground">FLOW</span>
            </div>
            <p className="text-xs text-muted-foreground">
              System orchestration, iteration boundaries, and Manager handoffs are 
              <span className="text-foreground"> predetermined</span> workflow steps.
            </p>
          </div>
        </div>
      </div>

      <div className="tactical-card p-4 bg-accent/5 border-accent/30">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Strategy Evolution</p>
            <p className="text-xs text-muted-foreground">
              Observe how tool usage patterns shift across iterations. Early iterations often favor research 
              (search_abstracts, web_search), while later iterations emphasize refinement (red_team_review).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvaluationTab() {
  return (
    <div className="space-y-6">
      <div className="prose prose-invert max-w-none">
        <p className="text-muted-foreground leading-relaxed">
          The Evaluator is a <span className="text-purple-400 font-semibold">blind judge</span>. 
          It sees only the generated title and abstract—not the target conference. 
          Can it predict which conference the abstract was written for?
        </p>
      </div>

      {/* Evaluation Flow */}
      <div className="tactical-card p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Evaluation Protocol</span>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-xs font-mono text-purple-400">1</div>
            <div className="flex-1">
              <p className="text-sm text-foreground">Evaluator receives title + abstract only</p>
              <p className="text-xs text-muted-foreground">No knowledge of target conference</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-xs font-mono text-purple-400">2</div>
            <div className="flex-1">
              <p className="text-sm text-foreground">Presented with 5 conferences + 1 decoy</p>
              <p className="text-xs text-muted-foreground">Decoy tests discrimination quality</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-xs font-mono text-purple-400">3</div>
            <div className="flex-1">
              <p className="text-sm text-foreground">Predicts best-fit conference</p>
              <p className="text-xs text-muted-foreground">Correct = abstract captures conference DNA</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-xs font-mono text-purple-400">4</div>
            <div className="flex-1">
              <p className="text-sm text-foreground">Decoy selection triggers penalty</p>
              <p className="text-xs text-muted-foreground">-0.5 to -1.5 applied to Manager's final score</p>
            </div>
          </div>
        </div>
      </div>

      <div className="tactical-card p-4 bg-purple-500/5 border-purple-500/30">
        <div className="flex items-start gap-3">
          <Eye className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Why Blind Evaluation?</p>
            <p className="text-xs text-muted-foreground">
              This tests whether the abstract truly captures the conference's unique character—or if it's generic 
              fluff that could fit anywhere. Generic abstracts fail the blind test.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="tactical-card p-4 border-success/30">
          <div className="text-center mb-3">
            <div className="text-3xl font-mono font-bold text-success">✓</div>
            <p className="text-xs text-muted-foreground mt-1">Correct Prediction</p>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Abstract successfully captures the target conference's voice, audience, and technical depth.
          </p>
        </div>

        <div className="tactical-card p-4 border-destructive/30">
          <div className="text-center mb-3">
            <div className="text-3xl font-mono font-bold text-destructive">✗</div>
            <p className="text-xs text-muted-foreground mt-1">Decoy Selected</p>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Abstract is too generic—doesn't differentiate between conferences. Quality penalty applied.
          </p>
        </div>
      </div>
    </div>
  );
}

function IntelTab() {
  return (
    <div className="space-y-6">
      <div className="prose prose-invert max-w-none">
        <p className="text-muted-foreground leading-relaxed">
          After running workflows, explore the <span className="text-primary font-semibold">dashboards</span> to see patterns emerge. 
          These analytics answer questions about how different AI models behave under similar conditions.
        </p>
      </div>

      {/* Questions Grid */}
      <div className="space-y-3">
        <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Questions the Dashboards Answer</h4>
        
        <div className="grid grid-cols-1 gap-2">
          {[
            { icon: Users, q: "How does OpenAI compare to Anthropic as a Worker?", color: "text-primary" },
            { icon: Wrench, q: "Which tools does each vendor prefer? Does strategy differ?", color: "text-success" },
            { icon: TrendingUp, q: "Does tool usage change over iterations (early vs. late)?", color: "text-accent" },
            { icon: GitBranch, q: "How many iterations does each vendor need to reach acceptance?", color: "text-purple-400" },
            { icon: Target, q: "Does conference or topic selection impact vendors differently?", color: "text-primary" },
            { icon: Scale, q: "How accurate is Nova's blind evaluation? Any vendor bias?", color: "text-accent" },
            { icon: Eye, q: "How often does Nova select the decoy? When does it happen?", color: "text-purple-400" },
            { icon: Shield, q: "Does the Manager score OpenAI and Anthropic work differently?", color: "text-success" },
          ].map((item, i) => (
            <div key={i} className="tactical-card p-3 flex items-center gap-3 hover:border-primary/30 transition-colors cursor-default">
              <item.icon className={`w-4 h-4 ${item.color} flex-shrink-0`} />
              <span className="text-sm text-foreground">{item.q}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tactical-card p-4 bg-primary/5 border-primary/30">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Behavioral Analytics</p>
            <p className="text-xs text-muted-foreground">
              The dashboards show how different AI models behave under similar conditions—which tools they prefer, 
              how strategies evolve across iterations, and which contexts are more challenging.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <Link to="/dashboard">
          <Button className="font-mono bg-primary hover:bg-primary/90">
            <BarChart3 className="mr-2 w-4 h-4" />
            Explore Dashboards
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </Link>
        <Link to="/dashboard-guide">
          <Button variant="secondary" size="small" className="font-mono border-accent/50 text-accent hover:bg-accent/10">
            <Eye className="mr-2 w-4 h-4" />
            Full Dashboard Guide
          </Button>
        </Link>
      </div>
    </div>
  );
}
