import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { JobStatusResponse } from '../../services/api/workflow';

const CONFERENCE_LABELS: Record<string, string> = {
  black_hat: 'Black Hat',
  reinvent: 'AWS re:Invent',
  kubecon: 'KubeCon',
  gartner_symposium: 'Gartner Symposium',
  google_cloud_next: 'Google Cloud Next',
};

const TOPIC_LABELS: Record<string, string> = {
  ai_ml_genai: 'AI/ML & GenAI',
  security_zero_trust: 'Security & Zero Trust',
  cloud_arch_infra: 'Cloud Architecture',
  k8s_containers: 'Kubernetes & Containers',
  platform_devops: 'Platform Engineering & DevOps',
  networking_mesh: 'Networking & Service Mesh',
  data_analytics: 'Data & Analytics',
  leadership_governance: 'Leadership & Governance',
};

interface WorkflowHeaderProps {
  status?: JobStatusResponse | null;
}

export function WorkflowHeader({ status }: WorkflowHeaderProps) {
  return (
    <header className="relative z-10 border-b border-border/50 bg-background-elevated/50 backdrop-blur-sm sticky top-0">
      <div className="container max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link 
            to="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="font-mono text-xs tracking-wider uppercase">New Job</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono mb-1">
                Conference · Topic
              </div>
              <div className="text-lg font-semibold text-foreground">
                {status?.conference ? CONFERENCE_LABELS[status.conference] || status.conference : 'Generating Abstract'}
              </div>
              {status?.topic && (
                <div className="text-sm text-muted-foreground">
                  {TOPIC_LABELS[status.topic] || status.topic}
                </div>
              )}
            </div>
            
            <Link 
              to="/" 
              className="flex items-center gap-3 group"
            >
              <div className="w-8 h-8 rounded border border-primary/50 bg-primary/10 flex items-center justify-center font-mono text-xs text-primary group-hover:bg-primary/20 transition-colors">
                TIL
              </div>
            </Link>
          </div>
          
          <Link 
            to="/dashboard"
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group"
          >
            <span className="font-mono text-xs tracking-wider uppercase">Dashboard</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </header>
  );
}
