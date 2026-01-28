import { useState, useCallback, useEffect } from "react";
import { TacticalCard } from "./TacticalCard";
import { TacticalTable } from "./TacticalTable";
import { VendorBadge } from "./VendorBadge";
import { TacticalProgress } from "./TacticalProgress";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { Trophy, Copy, ExternalLink, X } from "lucide-react";
import { dashboardService, type TopAbstractsResponse } from "../../services/api/dashboard";

const conferences = [
  { value: "all", label: "All Conferences" },
  { value: "kubecon", label: "KubeCon" },
  { value: "black_hat", label: "Black Hat" },
  { value: "reinvent", label: "AWS re:Invent" },
  { value: "gartner_symposium", label: "Gartner IT Symposium" },
  { value: "google_cloud_next", label: "Google Cloud Next" },
];

const topics = [
  { value: "all", label: "All Topics" },
  { value: "k8s_containers", label: "Kubernetes & Containers" },
  { value: "platform_devops", label: "Platform & DevOps" },
  { value: "security_zero_trust", label: "Security & Zero Trust" },
  { value: "ai_ml_genai", label: "AI, ML & Generative AI" },
  { value: "cloud_arch_infra", label: "Cloud Architecture & Infrastructure" },
  { value: "data_analytics", label: "Data & Analytics" },
  { value: "networking_mesh", label: "Networking & Service Mesh" },
  { value: "leadership_governance", label: "Leadership & IT Governance" },
];

const vendors = [
  { value: "all", label: "All Vendors" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

interface AbstractCardProps {
  abstract: TopAbstractsResponse['abstracts'][0];
  isHero?: boolean;
}

function AbstractCard({ abstract, isHero = false }: AbstractCardProps) {
  const [showFullModal, setShowFullModal] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${abstract.title}\n\n${abstract.abstract}`);
    // Simple alert since we don't have toast
    alert("Abstract copied to clipboard!");
  };

  const handleViewFull = () => {
    setShowFullModal(true);
  };

  const getRankGlow = (rank: number) => {
    if (rank === 1) return "glow-primary";
    if (rank === 2) return "glow-accent";
    if (rank === 3) return "glow-success";
    return "";
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return "text-primary";
    if (rank === 2) return "text-accent";
    if (rank === 3) return "text-success";
    return "text-muted-foreground";
  };

  const conferenceLabel = conferences.find(c => c.value === abstract.conference)?.label || abstract.conference;
  const topicLabel = topics.find(t => t.value === abstract.topic)?.label || abstract.topic;

  return (
    <div className={cn(
      "tactical-card p-5 space-y-4",
      isHero && getRankGlow(abstract.rank)
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center justify-center w-10 h-10 rounded border font-mono font-bold text-lg",
            abstract.rank === 1 && "bg-primary/20 border-primary/50 text-primary",
            abstract.rank === 2 && "bg-accent/20 border-accent/50 text-accent",
            abstract.rank === 3 && "bg-success/20 border-success/50 text-success",
            abstract.rank > 3 && "bg-muted/30 border-border text-muted-foreground"
          )}>
            #{abstract.rank}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("font-mono text-2xl font-bold", getRankColor(abstract.rank))}>
                {abstract.score.toFixed(2)}
              </span>
              {abstract.rank === 1 && <Trophy className="w-5 h-5 text-primary" />}
            </div>
            <p className="text-xs text-muted-foreground">Blended Score</p>
          </div>
        </div>
        <VendorBadge vendor={abstract.worker_vendor as "openai" | "anthropic"} />
      </div>

      {/* Score Bar */}
      <TacticalProgress value={abstract.score * 10} max={100} />

      {/* Conference & Topic */}
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded bg-muted/50 border border-border font-mono">
          {conferenceLabel}
        </span>
        <span className="px-2 py-1 rounded bg-muted/50 border border-border font-mono">
          {topicLabel}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-foreground leading-tight">
        {abstract.title}
      </h3>

      {/* Abstract */}
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
        {abstract.abstract}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Button variant="secondary" size="small" className="gap-2" onClick={handleCopy}>
          <Copy className="w-3 h-3" />
          Copy
        </Button>
        <Button variant="secondary" size="small" className="gap-2" onClick={handleViewFull}>
          <ExternalLink className="w-3 h-3" />
          View Full
        </Button>
      </div>

      {/* Full Abstract Modal */}
      {showFullModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowFullModal(false)}>
          <div className="tactical-card max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded border font-mono font-bold text-lg",
                    abstract.rank === 1 && "bg-primary/20 border-primary/50 text-primary",
                    abstract.rank === 2 && "bg-accent/20 border-accent/50 text-accent",
                    abstract.rank === 3 && "bg-success/20 border-success/50 text-success",
                    abstract.rank > 3 && "bg-muted/30 border-border text-muted-foreground"
                  )}>
                    #{abstract.rank}
                  </div>
                  <span className={cn("font-mono text-2xl font-bold", getRankColor(abstract.rank))}>
                    {abstract.score.toFixed(2)}
                  </span>
                  <VendorBadge vendor={abstract.worker_vendor as "openai" | "anthropic"} />
                </div>
                <div className="flex items-center gap-2 text-xs mt-2">
                  <span className="px-2 py-1 rounded bg-muted/50 border border-border font-mono">
                    {conferenceLabel}
                  </span>
                  <span className="px-2 py-1 rounded bg-muted/50 border border-border font-mono">
                    {topicLabel}
                  </span>
                </div>
              </div>
              <Button variant="secondary" size="small" onClick={() => setShowFullModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-foreground leading-tight">
              {abstract.title}
            </h2>

            {/* Full Abstract */}
            <div className="prose prose-invert max-w-none">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {abstract.abstract}
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground font-mono">
                Job ID: {abstract.job_id}
              </div>
              <Button variant="secondary" size="small" className="gap-2" onClick={handleCopy}>
                <Copy className="w-3 h-3" />
                Copy Abstract
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TopAbstractsTab() {
  const [conferenceFilter, setConferenceFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");

  // Determine filter type
  const filterType = vendorFilter !== "all" 
    ? (vendorFilter === "openai" ? "openai" : "anthropic")
    : conferenceFilter !== "all"
    ? "conference"
    : topicFilter !== "all"
    ? "topic"
    : "all";

  // Fetch data
  const [data, setData] = useState<TopAbstractsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await dashboardService.getTopAbstracts({
        filter: filterType as 'all' | 'openai' | 'anthropic' | 'conference' | 'topic',
        conference: filterType === 'conference' ? conferenceFilter : undefined,
        topic: filterType === 'topic' ? topicFilter : undefined,
        limit: 10,
      });
      setData(response);
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [filterType, conferenceFilter, topicFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchData();
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [fetchData]);

  const abstracts = data?.abstracts || [];
  const top3 = abstracts.slice(0, 3);
  const rest = abstracts.slice(3, 10);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <TacticalCard header="Filters">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-[160px]">
            <Select
              label="Vendor"
              value={vendorFilter}
              onChange={setVendorFilter}
              options={vendors}
              ariaLabel="Filter by vendor"
            />
          </div>

          <div className="w-[200px]">
            <Select
              label="Conference"
              value={conferenceFilter}
              onChange={setConferenceFilter}
              options={conferences}
              ariaLabel="Filter by conference"
            />
          </div>

          <div className="w-[200px]">
            <Select
              label="Topic"
              value={topicFilter}
              onChange={setTopicFilter}
              options={topics}
              ariaLabel="Filter by topic"
            />
          </div>

          <div className="flex-1" />
          
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-mono">Showing</p>
            <p className="text-lg font-mono font-bold text-primary">
              {loading ? "..." : abstracts.length} <span className="text-muted-foreground text-sm">abstracts</span>
            </p>
          </div>
        </div>
      </TacticalCard>

      {/* Loading State */}
      {loading && (
        <TacticalCard>
          <div className="py-12 text-center">
            <p className="text-muted-foreground font-mono">Loading top abstracts...</p>
          </div>
        </TacticalCard>
      )}

      {/* Error State */}
      {error && (
        <TacticalCard>
          <div className="py-12 text-center">
            <p className="text-red-400 font-mono">Error: {error}</p>
          </div>
        </TacticalCard>
      )}

      {/* Top 3 Hero Cards */}
      {!loading && !error && top3.length > 0 && (
        <section>
          <h2 className="tactical-header mb-4">Top Performers</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {top3.map((abstract) => (
              <AbstractCard key={abstract.job_id} abstract={abstract} isHero />
            ))}
          </div>
        </section>
      )}

      {/* Ranks 4-10 Table */}
      {!loading && !error && rest.length > 0 && (
        <section>
          <TacticalCard header="Ranks 4-10">
            <TacticalTable
              columns={[
                {
                  key: "rank",
                  header: "Rank",
                  align: "center",
                  render: (value) => (
                    <span className="font-mono font-bold">#{value}</span>
                  ),
                },
                {
                  key: "title",
                  header: "Title",
                  render: (value) => (
                    <span className="font-medium line-clamp-1">{value}</span>
                  ),
                },
                {
                  key: "score",
                  header: "Score",
                  align: "center",
                  render: (value) => (
                    <span className="font-mono font-bold text-primary">
                      {typeof value === 'number' ? value.toFixed(2) : value}
                    </span>
                  ),
                },
                {
                  key: "conference",
                  header: "Conference",
                  render: (value) => (
                    <span className="text-xs font-mono">
                      {conferences.find(c => c.value === value)?.label || value}
                    </span>
                  ),
                },
                {
                  key: "topic",
                  header: "Topic",
                  render: (value) => (
                    <span className="text-xs font-mono">
                      {topics.find(t => t.value === value)?.label || value}
                    </span>
                  ),
                },
                {
                  key: "worker_vendor",
                  header: "Vendor",
                  align: "center",
                  render: (value) => (
                    <VendorBadge vendor={value as "openai" | "anthropic"} />
                  ),
                },
              ]}
              data={rest.map((abstract: TopAbstractsResponse['abstracts'][0]) => ({
                rank: abstract.rank,
                title: abstract.title,
                score: abstract.score,
                conference: abstract.conference,
                topic: abstract.topic,
                worker_vendor: abstract.worker_vendor,
              }))}
            />
          </TacticalCard>
        </section>
      )}

      {/* Empty State */}
      {!loading && !error && abstracts.length === 0 && (
        <TacticalCard>
          <div className="py-12 text-center">
            <p className="text-muted-foreground font-mono">No abstracts match the selected filters.</p>
          </div>
        </TacticalCard>
      )}
    </div>
  );
}
