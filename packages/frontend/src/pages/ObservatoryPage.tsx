import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { 
  Play, 
  Target, 
  Database, 
  Search, 
  Globe, 
  Shield, 
  FileText,
  Cpu,
  Zap,
  Eye,
  ArrowRight,
  Info
} from "lucide-react";
import { jobsService, type Conference, type Topic } from "../services/api/jobs";
import { setJobToken } from "../utils/tokenStorage";

const conferences = [
  { id: "kubecon", name: "KubeCon", description: "Cloud-native & Kubernetes", color: "text-primary" },
  { id: "black_hat", name: "Black Hat", description: "Security research & exploits", color: "text-red-400" },
  { id: "reinvent", name: "AWS re:Invent", description: "Cloud services & solutions", color: "text-accent" },
  { id: "gartner_symposium", name: "Gartner IT Symposium", description: "Executive strategy", color: "text-purple-400" },
  { id: "google_cloud_next", name: "Google Cloud Next", description: "GCP & AI innovation", color: "text-success" },
];

const topics = [
  { id: "ai_ml_genai", name: "AI, ML & Generative AI", icon: Cpu },
  { id: "security_zero_trust", name: "Security & Zero Trust", icon: Shield },
  { id: "cloud_arch_infra", name: "Cloud Architecture", icon: Database },
  { id: "k8s_containers", name: "Kubernetes & Containers", icon: Target },
  { id: "platform_devops", name: "Platform Engineering", icon: Zap },
  { id: "networking_mesh", name: "Networking & Service Mesh", icon: Globe },
  { id: "data_analytics", name: "Data & Analytics", icon: Search },
  { id: "leadership_governance", name: "Leadership & Governance", icon: FileText },
];

const tools = [
  { name: "dynamodb_lookup", points: 1, description: "Query conference corpus" },
  { name: "search_abstracts", points: 2, description: "Full-text search index" },
  { name: "web_search", points: 1, description: "External research" },
  { name: "red_team_review", points: 1, description: "Adversarial review" },
  { name: "submit_abstract", points: 0, description: "Final submission" },
];

export function ObservatoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [conference, setConference] = useState<Conference | "">("");
  const [topic, setTopic] = useState<Topic | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill form from URL params (e.g., from "Restart with same params" button)
  useEffect(() => {
    const conferenceParam = searchParams.get('conference');
    const topicParam = searchParams.get('topic');
    
    if (conferenceParam) {
      setConference(conferenceParam as Conference);
    }
    if (topicParam) {
      setTopic(topicParam as Topic);
    }
  }, [searchParams]);

  const isReady = conference && topic;

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await jobsService.createJob({
        conference: conference as Conference,
        topic: topic as Topic,
      });

      // Store token for workflow page access
      setJobToken(response.job_id, response.job_read_token);

      // Navigate to workflow page
      navigate(`/jobs/${response.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
      setIsSubmitting(false);
    }
  };

  // Map conference IDs to match our API
  const getConferenceValue = (id: string): Conference | "" => {
    const mapping: Record<string, Conference> = {
      "kubecon": "kubecon",
      "black_hat": "black_hat",
      "reinvent": "reinvent",
      "gartner_symposium": "gartner_symposium",
      "google_cloud_next": "google_cloud_next",
    };
    return mapping[id] || "";
  };

  // Map topic IDs to match our API
  const getTopicValue = (id: string): Topic | "" => {
    const mapping: Record<string, Topic> = {
      "ai_ml_genai": "ai_ml_genai",
      "security_zero_trust": "security_zero_trust",
      "cloud_arch_infra": "cloud_arch_infra",
      "k8s_containers": "k8s_containers",
      "platform_devops": "platform_devops",
      "networking_mesh": "networking_mesh",
      "data_analytics": "data_analytics",
      "leadership_governance": "leadership_governance",
    };
    return mapping[id] || "";
  };

  return (
    <div className="min-h-screen bg-background tactical-grid relative overflow-hidden">
      {/* Ambient glow effects */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Scan line effect */}
      <div className="fixed inset-0 pointer-events-none scanline opacity-30" />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded border border-primary/50 bg-primary/10 flex items-center justify-center font-mono text-xs text-primary group-hover:bg-primary/20 transition-colors">
                TIL
              </div>
            </Link>
            <div className="flex items-center gap-6">
              <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-mono">
                Home
              </Link>
              <Link to="/dashboard" className="text-sm text-accent hover:text-accent/80 transition-colors font-mono font-semibold">
                Dashboard
              </Link>
              <Link to="/dashboard-guide" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-mono">
                Guide
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 container max-w-6xl mx-auto px-6 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-mono mb-6">
            <Eye className="w-3 h-3" />
            WORKFLOW OBSERVATORY
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Launch Instrumented Workflow
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Select a conference and topic to observe the multi-agent system generate 
            an abstract while capturing every decision, tool call, and iteration.
          </p>
        </div>

        {/* Selection Panel */}
        <div className="tactical-card p-8 mb-8 max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            
            {/* Conference Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                Target Conference <span className="text-primary">*</span>
              </label>
              <Select
                label=""
                value={conference}
                onChange={(value) => setConference(getConferenceValue(value))}
                options={conferences.map(c => ({ value: c.id, label: `${c.name} — ${c.description}` }))}
                required
                ariaLabel="Select conference"
              />
              {conference && (
                <p className="text-xs text-muted-foreground font-mono">
                  {conferences.find(c => c.id === conference)?.description}
                </p>
              )}
            </div>

            {/* Topic Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                Topic Category <span className="text-primary">*</span>
              </label>
              <Select
                label=""
                value={topic}
                onChange={(value) => setTopic(getTopicValue(value))}
                options={topics.map(t => ({ value: t.id, label: t.name }))}
                required
                ariaLabel="Select topic"
              />
              {topic && (
                <p className="text-xs text-muted-foreground font-mono">
                  {topics.find(t => t.id === topic)?.name}
                </p>
              )}
            </div>
          </div>

          {/* Launch Button */}
          <div className="flex flex-col items-center gap-4 pt-4 border-t border-border/50">
            <Button 
              size="large"
              onClick={handleLaunch}
              disabled={!isReady || isSubmitting}
              className={`
                w-full max-w-md h-14 text-base font-semibold gap-3 transition-all duration-300
                ${isReady 
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25' 
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
                }
              `}
            >
              <Play className="w-5 h-5" />
              {isSubmitting ? "Creating..." : "Run Instrumented Workflow"}
              <ArrowRight className="w-4 h-4" />
            </Button>
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded p-3 text-sm text-red-400 text-center w-full max-w-md">
                {error}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isReady 
                ? "Ready to launch — Manager → Worker → Evaluator pipeline" 
                : "Select conference and topic to enable launch"
              }
            </p>
          </div>
        </div>

        {/* Info Panel */}
        <div className="tactical-card p-6 max-w-4xl mx-auto mb-8 border-accent/30">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center flex-shrink-0">
              <Info className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">About This Observatory</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This is an <span className="text-foreground font-medium">instrumentation harness</span> for 
                observing agent behavior end-to-end. The abstract generation is a vehicle for studying 
                multi-agent decision-making — inspect tool calls, routing logic, evaluation signals, 
                and iteration patterns.
              </p>
              <p className="text-xs text-accent mt-2 font-mono">
                ⚠ Not intended to produce submission-ready abstracts. Edit outputs before use.
              </p>
            </div>
          </div>
        </div>

        {/* Tool Inventory */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4 text-center font-mono">Available Tools</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Worker agent has access to these tools — <span className="text-primary font-mono">3 action points</span> per iteration
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tools.map((tool) => (
              <div 
                key={tool.name}
                className="tactical-card p-4 text-center group hover:border-primary/50 transition-colors glow-tag"
              >
                <p className="font-mono text-xs text-primary mb-1 group-hover:text-glow-primary transition-all">
                  {tool.name}
                </p>
                <p className="text-xs text-muted-foreground mb-2">{tool.description}</p>
                <span className={`
                  inline-block px-2 py-0.5 rounded text-xs font-mono
                  ${tool.points === 0 
                    ? 'bg-success/10 text-success' 
                    : tool.points === 2 
                      ? 'bg-accent/10 text-accent' 
                      : 'bg-primary/10 text-primary'
                  }
                `}>
                  {tool.points}pt
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Pipeline Visualization */}
        <div className="max-w-4xl mx-auto mt-12">
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-6 text-center font-mono">Execution Pipeline</h2>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="tactical-card p-4 text-center min-w-[120px]">
              <div className="w-8 h-8 mx-auto mb-2 rounded bg-role-manager/20 border border-role-manager/50 flex items-center justify-center">
                <Target className="w-4 h-4 text-role-manager" />
              </div>
              <p className="text-xs font-medium">Manager</p>
              <p className="text-[10px] text-muted-foreground">Goal formulation</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground hidden md:block" />
            <div className="tactical-card p-4 text-center min-w-[120px]">
              <div className="w-8 h-8 mx-auto mb-2 rounded bg-role-worker/20 border border-role-worker/50 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-role-worker" />
              </div>
              <p className="text-xs font-medium">Worker</p>
              <p className="text-[10px] text-muted-foreground">ReAct tool loop</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground hidden md:block" />
            <div className="tactical-card p-4 text-center min-w-[120px]">
              <div className="w-8 h-8 mx-auto mb-2 rounded bg-role-evaluator/20 border border-role-evaluator/50 flex items-center justify-center">
                <Eye className="w-4 h-4 text-role-evaluator" />
              </div>
              <p className="text-xs font-medium">Evaluator</p>
              <p className="text-[10px] text-muted-foreground">Blind assessment</p>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 mt-16">
        <div className="container max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono">TIL — Agent Workflow Observatory</span>
            <span className="font-mono">v1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
