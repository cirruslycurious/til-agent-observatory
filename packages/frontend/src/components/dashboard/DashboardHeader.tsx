import { ArrowLeft, RefreshCw, Calendar } from "lucide-react";
import { Button } from "../ui/Button";
import { Link } from "react-router-dom";
import { useState } from "react";

interface DashboardHeaderProps {
  onRefresh?: () => void;
  lastUpdated?: string;
}

export function DashboardHeader({ onRefresh, lastUpdated }: DashboardHeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <Button variant="secondary" size="small" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Home</span>
              </Button>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Analytics Dashboard</h1>
              <p className="text-xs text-muted-foreground font-mono">AGENTIC WORKFLOW METRICS</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
              <div className="status-indicator">
                <span className="font-mono">LIVE</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/50 border border-border">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">Last 30 days</span>
            </div>
            
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-muted-foreground font-mono hidden lg:block">
                  Updated {lastUpdated}
                </span>
              )}
              <Button 
                variant="secondary" 
                size="small"
                onClick={handleRefresh}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
