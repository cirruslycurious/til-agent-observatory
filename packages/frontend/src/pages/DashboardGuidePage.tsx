import { Link } from "react-router-dom";
import { useState } from "react";
import { 
  ArrowLeft,
  BarChart3,
  Brain,
  Wrench,
  Shield,
  Target,
  Timer,
  Eye,
  TrendingUp,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Users,
  Crosshair,
  Lightbulb,
  BookOpen,
  Cpu
} from "lucide-react";
import { Button } from "../components/ui/Button";

export function DashboardGuidePage() {
  const [expandedSections, setExpandedSections] = useState<string[]>(["overview"]);
  
  const toggleSection = (id: string) => {
    setExpandedSections(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const isExpanded = (id: string) => expandedSections.includes(id);

  return (
    <div className="min-h-screen bg-background tactical-grid relative">
      {/* Scan line effect overlay */}
      <div className="fixed inset-0 pointer-events-none scanline opacity-50" />
      
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/dashboard">
                <Button variant="secondary" size="small" className="text-muted-foreground hover:text-foreground gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back to Dashboard</span>
                </Button>
              </Link>
              <div className="h-4 w-px bg-border" />
              <div>
                <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  Dashboard Guide
                </h1>
                <p className="text-xs text-muted-foreground font-mono">BEHAVIORAL ANALYTICS REFERENCE</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-8">
        {/* Intro */}
        <section className="mb-8">
          <div className="tactical-card p-6 border-primary/30 bg-primary/5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-sm bg-primary/20 border border-primary/50 flex items-center justify-center flex-shrink-0">
                <Eye className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold mb-2">Understanding Agent Cognition</h2>
                <p className="text-muted-foreground leading-relaxed">
                  These dashboards are <span className="text-foreground font-semibold">not</span> about measuring success rates or effectiveness. 
                  They're about understanding <span className="text-primary">how agents think</span>—what tools they choose, 
                  how strategies evolve, whether OpenAI and Anthropic agents have distinct cognitive styles, and which contexts drive different behaviors.
                </p>
                <p className="text-sm text-muted-foreground mt-3">
                  Think of it as an <span className="text-foreground">agent cognition observatory</span>—you're studying behavioral patterns, not scorecards.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The Seven Dashboards */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            The Seven Dashboards
          </h2>
          
          <div className="space-y-3">
            <DashboardSection
              id="executive"
              title="Executive Summary"
              subtitle="High-Level System KPIs"
              question="What's the overall health and performance of the system?"
              icon={BarChart3}
              color="primary"
              isExpanded={isExpanded("executive")}
              onToggle={() => toggleSection("executive")}
              dashboardPath="/dashboard"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">What You'll See</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Total jobs, success rate, failure analysis</li>
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Average quality scores (Manager, Nova, final)</li>
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Quality distribution (how many 9-10s vs 7-8s)</li>
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Iteration efficiency (avg iterations to acceptance)</li>
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Cost and token usage</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">How to Interpret</h4>
                  <div className="space-y-2 text-sm">
                    <InterpretRow pattern="High quality scores" meaning="System producing conference-ready abstracts" />
                    <InterpretRow pattern="Low avg iterations" meaning="Efficient—agents understand goals quickly" />
                    <InterpretRow pattern="High failure rate" meaning="Check Context dashboard for difficult combinations" />
                    <InterpretRow pattern="Wide quality variance" meaning="Inconsistent performance across jobs" />
                  </div>
                </div>
              </div>
            </DashboardSection>

            <DashboardSection
              id="tools"
              title="Tool Behavior"
              subtitle="Agent Cognition Analysis"
              question="How do agents use tools? Do they adapt?"
              icon={Wrench}
              color="success"
              isExpanded={isExpanded("tools")}
              onToggle={() => toggleSection("tools")}
              dashboardPath="/dashboard/tools"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">What You'll See</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Overall tool usage rates (% of jobs using each tool)</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Strategy evolution across iterations (adoption/abandonment)</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Vendor cognitive differences (OpenAI vs Anthropic preferences)</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Tool sequences and strategies</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Tool effectiveness (correlation with quality scores)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">How to Interpret</h4>
                  <div className="space-y-2 text-sm">
                    <InterpretRow pattern="High usage early → drops late" meaning="Agents front-load research" />
                    <InterpretRow pattern="Low usage early → spikes late" meaning="Agents adopt after learning" />
                    <InterpretRow pattern="Delta > 15% between vendors" meaning="Significant cognitive divergence" />
                    <InterpretRow pattern="Consistent 90%+ usage" meaning="Essential tool for the task" />
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 rounded bg-muted/30 border border-border">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">Available Tools</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <ToolTag name="dynamodb_lookup" points={1} />
                  <ToolTag name="search_abstracts" points={2} />
                  <ToolTag name="web_search" points={1} />
                  <ToolTag name="red_team_review" points={1} />
                  <ToolTag name="submit_abstract" points={0} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Worker has <span className="font-mono text-foreground">3 action points</span> per iteration</p>
              </div>
            </DashboardSection>

            <DashboardSection
              id="manager"
              title="Vendor Manager Deep Dive"
              subtitle="Scoring Behavior Analysis"
              question="How do OpenAI and Anthropic Managers score abstracts differently?"
              icon={Shield}
              color="accent"
              isExpanded={isExpanded("manager")}
              onToggle={() => toggleSection("manager")}
              dashboardPath="/dashboard/manager"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">What You'll See</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Average scores by vendor (Manager self-score)</li>
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Manager vs Nova assessor alignment</li>
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Penalty/bonus patterns</li>
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Decision patterns (first iteration acceptance rate)</li>
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Stratified by conference and topic</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">How to Interpret</h4>
                  <div className="space-y-2 text-sm">
                    <InterpretRow pattern="Manager Self > Nova scores" meaning="Manager more optimistic than assessors" />
                    <InterpretRow pattern="Manager Self < Nova scores" meaning="Manager more critical than assessors" />
                    <InterpretRow pattern="High avg penalty" meaning="Manager frequently applies penalties" />
                    <InterpretRow pattern="Low first iteration acceptance" meaning="Manager has high standards early" />
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 rounded bg-muted/30 border border-border">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">Scoring System</h4>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p><span className="text-foreground font-medium">Manager Self:</span> <span className="text-muted-foreground">Manager's own assessment (1-10)</span></p>
                    <p><span className="text-foreground font-medium">Nova Assessor 1:</span> <span className="text-muted-foreground">Primary blind assessment</span></p>
                    <p><span className="text-foreground font-medium">Nova Assessor 2:</span> <span className="text-muted-foreground">Secondary blind assessment</span></p>
                  </div>
                  <div className="space-y-1">
                    <p><span className="text-foreground font-medium">Blended Score:</span> <span className="text-muted-foreground">Average of all three</span></p>
                    <p><span className="text-foreground font-medium">Penalties (−):</span> <span className="text-muted-foreground">Decoy, tool diversity</span></p>
                    <p><span className="text-foreground font-medium">Final Score:</span> <span className="text-muted-foreground">Blended minus penalties</span></p>
                  </div>
                </div>
              </div>
            </DashboardSection>

            <DashboardSection
              id="worker"
              title="Vendor Worker Deep Dive"
              subtitle="Execution & Strategy Analysis"
              question="How do OpenAI and Anthropic Workers differ in execution?"
              icon={Cpu}
              color="success"
              isExpanded={isExpanded("worker")}
              onToggle={() => toggleSection("worker")}
              dashboardPath="/dashboard/worker"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">What You'll See</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Tool preferences by vendor</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Action point efficiency (how they spend 3 points)</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Quality outcomes (Nova scores by Worker vendor)</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Cost per job and token efficiency</li>
                    <li className="flex items-start gap-2"><span className="text-success">▸</span>Iteration patterns (strategy evolution)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">How to Interpret</h4>
                  <div className="space-y-2 text-sm">
                    <InterpretRow pattern="Vendor favors search_abstracts" meaning="Learning-from-examples strategy" />
                    <InterpretRow pattern="Vendor favors red_team_review" meaning="Self-critique refinement strategy" />
                    <InterpretRow pattern="High tool diversity" meaning="Exploratory, adaptive approach" />
                    <InterpretRow pattern="Consistent tool sequences" meaning="Reliable, repeatable strategy" />
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 rounded bg-muted/30 border border-border">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">Vendor Assignment</h4>
                <p className="text-xs text-muted-foreground">
                  Manager and Worker are always <span className="text-foreground font-semibold">opposite vendors</span>. 
                  If Manager is OpenAI, Worker is Anthropic (and vice versa). This creates natural comparison opportunities.
                </p>
              </div>
            </DashboardSection>

            <DashboardSection
              id="context"
              title="Context Effects"
              subtitle="Difficulty Ranking"
              question="Which conference/topic combinations are hardest?"
              icon={Target}
              color="primary"
              isExpanded={isExpanded("context")}
              onToggle={() => toggleSection("context")}
              dashboardPath="/dashboard/context"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">What You'll See</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Difficulty ranking (contexts sorted by challenge level)</li>
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Performance by conference (by vendor)</li>
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Performance by topic (by vendor)</li>
                    <li className="flex items-start gap-2"><span className="text-primary">▸</span>Quality score distributions per context</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">Difficulty Score Formula</h4>
                  <div className="p-3 rounded bg-background border border-border font-mono text-sm text-center mb-3">
                    <span className="text-primary">Difficulty</span> = Avg Iterations + (Failure Rate × 5)
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-destructive" /> <span className="text-muted-foreground">Score &gt; 3.5 = Very challenging</span></p>
                    <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-accent" /> <span className="text-muted-foreground">Score 2.5-3.5 = Challenging</span></p>
                    <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-warning" /> <span className="text-muted-foreground">Score 1.5-2.5 = Moderate</span></p>
                    <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-success" /> <span className="text-muted-foreground">Score &lt; 1.5 = Easier</span></p>
                  </div>
                </div>
              </div>
            </DashboardSection>

            <DashboardSection
              id="evaluator"
              title="Evaluator Analysis"
              subtitle="Blind Prediction Accuracy"
              question="Can the blind evaluator predict the target conference?"
              icon={Eye}
              color="evaluator"
              isExpanded={isExpanded("evaluator")}
              onToggle={() => toggleSection("evaluator")}
              dashboardPath="/dashboard/evaluator"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">What You'll See</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2"><span className="text-purple-400">▸</span>Overall accuracy rate (correct top-1 predictions)</li>
                    <li className="flex items-start gap-2"><span className="text-purple-400">▸</span>Top-3 accuracy (target in top 3 predictions)</li>
                    <li className="flex items-start gap-2"><span className="text-purple-400">▸</span>Confusion matrix (which conferences get mistaken)</li>
                    <li className="flex items-start gap-2"><span className="text-purple-400">▸</span>Decoy selection rate (genericness detector)</li>
                    <li className="flex items-start gap-2"><span className="text-purple-400">▸</span>Vendor bias analysis</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">How to Interpret</h4>
                  <div className="space-y-2 text-sm">
                    <InterpretRow pattern="High accuracy" meaning="Abstracts clearly demonstrate conference fit" />
                    <InterpretRow pattern="Low accuracy" meaning="Abstracts are generic/ambiguous" />
                    <InterpretRow pattern="High decoy selection" meaning="Abstracts lack distinctiveness" />
                    <InterpretRow pattern="Confusion pairs" meaning="Similar conferences hard to distinguish" />
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 rounded bg-muted/30 border border-border">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">Blind Evaluation Protocol</h4>
                <p className="text-xs text-muted-foreground">
                  Nova (Amazon Bedrock) sees <span className="text-foreground font-semibold">only</span> the title and abstract—not the target conference. 
                  It's presented with 5 real conferences + 1 decoy and must predict the best fit. 
                  This tests whether abstracts capture each conference's unique character.
                </p>
              </div>
            </DashboardSection>

            <DashboardSection
              id="speed"
              title="Speed & Efficiency"
              subtitle="Timing Analysis"
              question="How fast do different vendors/contexts execute?"
              icon={Timer}
              color="accent"
              isExpanded={isExpanded("speed")}
              onToggle={() => toggleSection("speed")}
              dashboardPath="/dashboard/speed"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">What You'll See</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Average execution times by vendor</li>
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Timing by iteration (speedup vs slowdown)</li>
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Timing by conference and topic</li>
                    <li className="flex items-start gap-2"><span className="text-accent">▸</span>Cost per job and throughput metrics</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">How to Interpret</h4>
                  <div className="space-y-2 text-sm">
                    <InterpretRow pattern="Faster execution ≠ Better quality" meaning="Speed vs thoroughness tradeoff" />
                    <InterpretRow pattern="Slower iterations late" meaning="Agents spending more time refining" />
                    <InterpretRow pattern="Faster iterations late" meaning="Agents getting more efficient" />
                    <InterpretRow pattern="High variance" meaning="Inconsistent execution patterns" />
                  </div>
                </div>
              </div>
            </DashboardSection>
          </div>
        </section>

        {/* Key Concepts */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Key Concepts
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            <ConceptCard
              title="Confidence Levels (Sample Size)"
              icon={Gauge}
              description="Every dashboard shows confidence indicators based on sample size."
            >
              <div className="space-y-2">
                <ConfidenceRow level="High" range="n ≥ 50" desc="Trust the data, draw strong conclusions" color="success" />
                <ConfidenceRow level="Medium" range="20-49" desc="Directional insights, treat as preliminary" color="accent" />
                <ConfidenceRow level="Low" range="10-19" desc="Exploratory only, don't over-interpret" color="destructive" />
                <ConfidenceRow level="Insufficient" range="< 10" desc="Not enough data for reliable analysis" color="muted" />
              </div>
            </ConceptCard>

            <ConceptCard
              title="Learning Velocity"
              icon={TrendingUp}
              description="Formula: (Usage at Iter 4) - (Usage at Iter 0)"
            >
              <div className="space-y-2">
                <VelocityRow value="+50%" desc="Tool adoption increased dramatically" color="success" />
                <VelocityRow value="+10-30%" desc="Moderate increase in adoption" color="success" />
                <VelocityRow value="0%" desc="Stable usage across iterations" color="muted" />
                <VelocityRow value="-10-30%" desc="Tool being phased out" color="destructive" />
                <VelocityRow value="-50%" desc="Tool largely abandoned" color="destructive" />
              </div>
            </ConceptCard>

            <ConceptCard
              title="Vendor Comparison"
              icon={Users}
              description="When comparing OpenAI (GPT-5.2) vs Anthropic (Claude Sonnet 4.5), look for:"
            >
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <span className="text-foreground">Cognitive Differences:</span> Tool preferences, scoring, adaptation</li>
                <li>• <span className="text-foreground">Performance Differences:</span> Acceptance rates, iterations, speed</li>
                <li>• <span className="text-foreground">Context Sensitivity:</span> Responses to conferences/topics</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2 italic">
                Remember: Manager and Worker always use opposite vendors, creating natural variation for fair comparison.
              </p>
            </ConceptCard>

            <ConceptCard
              title="Convergence Score"
              icon={Target}
              description="Formula: 100 - Average(|OpenAI - Anthropic| per tool)"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-success font-mono">&gt;80%</span>
                  <span className="text-muted-foreground">High convergence—similar strategies</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-accent font-mono">60-80%</span>
                  <span className="text-muted-foreground">Moderate—some differences</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-destructive font-mono">&lt;60%</span>
                  <span className="text-muted-foreground">Divergence—distinct approaches</span>
                </div>
              </div>
            </ConceptCard>
          </div>
        </section>

        {/* Tool Usage Patterns */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Common Tool Usage Patterns
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            <PatternCard
              title="Front-Loading Research"
              pattern="High dynamodb_lookup, search_abstracts in iteration 0 → drops sharply later"
              interpretation="Agents gather context early, then focus on writing"
            />
            <PatternCard
              title="Late-Stage Validation"
              pattern="Low red_team_review in iteration 0 → spikes in iterations 3-4"
              interpretation="Agents adopt validation after learning from feedback"
            />
            <PatternCard
              title="Abandoned Strategies"
              pattern="High web_search in iteration 0 → drops to near-zero by iteration 4"
              interpretation="Agents tried web search, found it unhelpful, stopped using it"
            />
            <PatternCard
              title="Persistent Core Tools"
              pattern="Consistent high usage across all iterations"
              interpretation="Essential tools for the task (e.g., dynamodb_lookup for guidance)"
            />
          </div>
        </section>

        {/* Common Pitfalls */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Common Pitfalls
          </h2>
          
          <div className="tactical-card p-6 border-destructive/30 bg-destructive/5">
            <div className="space-y-4">
              <PitfallRow
                bad="Anthropic uses web_search 80% of the time (n=3)"
                good="Check sample size first—n=3 is too low to draw conclusions"
              />
              <PitfallRow
                bad="Red team review causes higher scores"
                good="Correlation, not causation—other factors may explain the relationship"
              />
              <PitfallRow
                bad="OpenAI scores 7.8, Anthropic scores 7.75—OpenAI is better!"
                good="0.05 difference is noise, not signal—look for meaningful gaps"
              />
              <PitfallRow
                bad="Vendor A is 2x faster, so Vendor A is better"
                good="Speed does not equal quality—always cross-reference with acceptance rates"
              />
              <PitfallRow
                bad="Vendor B fails 30% of the time—Vendor B is bad"
                good="Check context—B may fail 30% on hard topics but 5% on others"
              />
              <PitfallRow
                bad="Looking only at contexts where your preferred vendor wins"
                good="Look at all contexts and understand variance across the board"
              />
            </div>
          </div>
        </section>

        {/* Research Questions */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Common Research Questions
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            <ResearchQuestion
              question="Which tools are essential?"
              dashboard="Tool Behavior → Overall Tool Usage"
              lookFor="Tools with >70% usage rate, consistent across iterations, low vendor delta"
              example="dynamodb_lookup has 95% usage, 0% delta → Essential tool"
            />
            <ResearchQuestion
              question="Do agents learn from feedback?"
              dashboard="Tool Behavior → Strategy Evolution"
              lookFor="Tools with steep learning curves, iteration 0 vs 4 differences"
              example="red_team_review: 18% → 92% (+74% velocity) → Agents adopt validation"
            />
            <ResearchQuestion
              question="Are Managers calibrated similarly?"
              dashboard="Vendor Manager → Scoring Behavior"
              lookFor="Score differences, Manager Self vs Nova gaps, penalty patterns"
              example="OpenAI Self: 7.8 avg, Anthropic Self: 7.5 → OpenAI more optimistic"
            />
            <ResearchQuestion
              question="Which contexts are hardest?"
              dashboard="Context Effects → Difficulty Ranking"
              lookFor="High difficulty scores (>3.5), low acceptance rates"
              example="Black Hat + Security: 4.2 difficulty, 65% acceptance → Hardest"
            />
            <ResearchQuestion
              question="Does Nova have vendor bias?"
              dashboard="Evaluator Analysis → Vendor Bias"
              lookFor="Accuracy differences when Worker is OpenAI vs Anthropic"
              example="72% accuracy on OpenAI abstracts, 68% on Anthropic → Possible bias"
            />
            <ResearchQuestion
              question="Which vendor is more cost-efficient?"
              dashboard="Speed & Efficiency → Cost Analysis"
              lookFor="Cost per job, tokens per job, cost per accepted abstract"
              example="OpenAI: $0.12/job, Anthropic: $0.15/job → OpenAI 20% cheaper"
            />
          </div>
        </section>

        {/* Navigation Tips */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Crosshair className="w-4 h-4" />
            Navigation Tips
          </h2>
          
          <div className="tactical-card p-6 border-primary/30 bg-primary/5">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <NavTip
                  number="1"
                  title="Start Broad, Then Drill Down"
                  desc="Begin with Executive → explore specific dashboards → check vendor×context interactions"
                />
                <NavTip
                  number="2"
                  title="Compare Across Dashboards"
                  desc="Tool Behavior = WHAT agents do • Manager/Worker = HOW they execute • Context = WHERE they struggle"
                />
                <NavTip
                  number="3"
                  title="Look for Patterns, Not Outliers"
                  desc="One unusual job isn't a trend. Consistent patterns across 20+ jobs are meaningful."
                />
              </div>
              <div className="space-y-3">
                <NavTip
                  number="4"
                  title="Use Time Windows Strategically"
                  desc="Use ?days=7 for recent trends, ?days=30 for stable patterns, ?days=90 for long-term analysis"
                />
                <NavTip
                  number="5"
                  title="Check Sample Sizes"
                  desc="Always verify n ≥ 20 before drawing conclusions. Low samples = high variance."
                />
              </div>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="text-center py-8">
          <Link to="/dashboard">
            <Button size="large" className="font-mono bg-primary hover:bg-primary/90">
              <BarChart3 className="mr-2 w-5 h-5" />
              Open Dashboards
            </Button>
          </Link>
        </section>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="container max-w-5xl mx-auto px-4">
          <p className="text-xs text-muted-foreground font-mono text-center">
            DASHBOARD GUIDE // BEHAVIORAL ANALYTICS REFERENCE // CLASSIFICATION: UNCLASSIFIED
          </p>
        </div>
      </footer>
    </div>
  );
}

// Component helpers
function DashboardSection({ 
  id: _id, title, subtitle, question, icon: Icon, color, isExpanded, onToggle, children, dashboardPath
}: { 
  id: string;
  title: string;
  subtitle: string;
  question: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "primary" | "accent" | "success" | "evaluator";
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  dashboardPath: string;
}) {
  const colorMap = {
    primary: { text: "text-primary", border: "border-primary/30", bg: "bg-primary/5" },
    accent: { text: "text-accent", border: "border-accent/30", bg: "bg-accent/5" },
    success: { text: "text-success", border: "border-success/30", bg: "bg-success/5" },
    evaluator: { text: "text-purple-400", border: "border-purple-500/30", bg: "bg-purple-500/5" },
  };
  const colors = colorMap[color];

  return (
    <div className={`tactical-card ${colors.border} overflow-hidden`}>
      <button
        onClick={onToggle}
        className={`w-full p-4 flex items-center justify-between ${colors.bg} hover:bg-opacity-30 transition-colors`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${colors.text}`} />
          <div className="text-left">
            <p className="font-mono text-sm font-bold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      
      {isExpanded && (
        <div className="p-6 border-t border-border/50 space-y-4">
          <div className="flex items-center justify-between">
            <p className={`text-sm ${colors.text} font-medium flex-1`}>"{question}"</p>
            <Link to={dashboardPath}>
              <Button variant="secondary" size="small" className="font-mono text-xs">
                View Dashboard →
              </Button>
            </Link>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

function InterpretRow({ pattern, meaning }: { pattern: string; meaning: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-foreground">{pattern}</span>
      <span className="text-muted-foreground">→ {meaning}</span>
    </div>
  );
}

function ToolTag({ name, points }: { name: string; points: number }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded bg-muted/50 border border-border">
      <span className="font-mono text-xs text-foreground">{name}</span>
      <span className={`font-mono text-xs ${
        points === 0 ? "text-muted-foreground" :
        points === 1 ? "text-success" : "text-accent"
      }`}>
        {points}pt
      </span>
    </div>
  );
}

function ConceptCard({ 
  title, icon: Icon, description, children 
}: { 
  title: string; 
  icon: React.ComponentType<{ className?: string }>; 
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="tactical-card p-5 border-border">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <p className="font-mono text-sm font-bold">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      {children}
    </div>
  );
}

function ConfidenceRow({ level, range, desc, color }: { level: string; range: string; desc: string; color: string }) {
  const colorClass = color === "muted" ? "text-muted-foreground" : `text-${color}`;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`font-mono w-16 ${colorClass}`}>{range}</span>
      <span className="text-muted-foreground">({level}) {desc}</span>
    </div>
  );
}

function VelocityRow({ value, desc, color }: { value: string; desc: string; color: string }) {
  const colorClass = color === "muted" ? "text-muted-foreground" : `text-${color}`;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`font-mono w-16 ${colorClass}`}>{value}</span>
      <span className="text-muted-foreground">{desc}</span>
    </div>
  );
}

function PatternCard({ title, pattern, interpretation }: { title: string; pattern: string; interpretation: string }) {
  return (
    <div className="tactical-card p-4 border-border">
      <p className="font-mono text-sm font-bold text-foreground mb-2">{title}</p>
      <p className="text-xs text-muted-foreground mb-2">{pattern}</p>
      <p className="text-xs text-primary italic">→ {interpretation}</p>
    </div>
  );
}

function PitfallRow({ bad, good }: { bad: string; good: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <p className="text-sm text-destructive line-through opacity-70">{bad}</p>
        <p className="text-sm text-success flex items-center gap-1 mt-1">
          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
          {good}
        </p>
      </div>
    </div>
  );
}

function ResearchQuestion({ question, dashboard, lookFor, example }: { question: string; dashboard: string; lookFor: string; example: string }) {
  return (
    <div className="tactical-card p-4 border-border">
      <p className="font-mono text-sm font-bold text-primary mb-2">"{question}"</p>
      <div className="space-y-1.5 text-xs">
        <p><span className="text-muted-foreground">Dashboard:</span> <span className="text-foreground">{dashboard}</span></p>
        <p><span className="text-muted-foreground">Look for:</span> <span className="text-foreground">{lookFor}</span></p>
        <p className="text-accent italic">Example: {example}</p>
      </div>
    </div>
  );
}

function NavTip({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-primary font-mono font-bold">{number}.</span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
