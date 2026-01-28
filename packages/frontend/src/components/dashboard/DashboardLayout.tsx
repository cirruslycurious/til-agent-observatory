/**
 * DashboardLayout Component
 * Shared layout with navigation tabs, date filtering, and refresh controls
 * Tactical theme with icons and status indicators
 */

import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Calendar, Activity } from 'lucide-react';
import { useDashboardContext } from '../../context/DashboardContext';

interface DashboardLayoutProps {
  children: React.ReactNode;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  loading?: boolean;
}

// Dashboard V2 Navigation: Research Analytics (10x faster)
const navItems = [
  { path: '/dashboard', label: 'Executive' },
  { path: '/dashboard/top-abstracts', label: 'Top Abstracts' },
  { path: '/dashboard/manager', label: 'Manager' },
  { path: '/dashboard/worker', label: 'Worker' },
  { path: '/dashboard/context', label: 'Context' },
  { path: '/dashboard/evaluator', label: 'Evaluator' },
  { path: '/dashboard/tools', label: 'Tools' },
  { path: '/dashboard/speed', label: 'Speed' },
];

export function DashboardLayout({
  children,
  lastUpdated,
  onRefresh,
  loading,
}: DashboardLayoutProps) {
  const location = useLocation();
  const { startDate, endDate, setDateRange, resetToDefault } = useDashboardContext();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-dvh dashboard-bg text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-panel/80 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                to="/" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs uppercase tracking-[0.12em]">Back to Home</span>
              </Link>
              <div className="h-4 w-px bg-border" />
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Analytics Dashboard
                </h1>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.14em]">
                  AGENTIC WORKFLOW METRICS
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Live Status */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded bg-primary/10 border border-primary/30">
                <Activity className="w-3 h-3 text-primary animate-pulse" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold">LIVE</span>
              </div>
              
              {/* Date Range Display */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/50 border border-border">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Last 30 days
                </span>
              </div>
              
              {/* Refresh Button */}
              <div className="flex items-center gap-2">
                {lastUpdated && (
                  <span className="text-[10px] text-muted-foreground font-mono hidden lg:block uppercase tracking-wider">
                    {formatTime(lastUpdated)}
                  </span>
                )}
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="p-2 border border-border bg-card hover:border-primary/50 hover:bg-primary/10 transition-colors disabled:opacity-50 rounded"
                    title="Refresh data"
                  >
                    <RefreshCw className={`w-4 h-4 text-muted-foreground hover:text-primary transition-colors ${loading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Date Filter Bar */}
      <div className="border-b border-border bg-panel/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2">
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider font-mono">
            <span className="text-muted-foreground">Date Range:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setDateRange(e.target.value, endDate)}
                className="border border-border bg-card px-2 py-1 text-[11px] text-foreground font-mono rounded hover:border-primary/50 transition-colors"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setDateRange(startDate, e.target.value)}
                className="border border-border bg-card px-2 py-1 text-[11px] text-foreground font-mono rounded hover:border-primary/50 transition-colors"
              />
            </div>
            <button
              onClick={resetToDefault}
              className="text-[10px] text-accent hover:text-accent-glow transition-colors px-2 py-1 rounded hover:bg-accent/10"
            >
              Reset
            </button>
            <div className="flex-1" />
            <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              Auto-refresh: 5min
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="border-b border-border bg-panel/70 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    relative whitespace-nowrap px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all
                    font-mono
                    ${isActive 
                      ? 'text-primary bg-primary/10 border-primary/50' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }
                    border border-transparent hover:border-border/50
                    rounded-sm
                  `}
                >
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
                  )}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {children}
      </main>
    </div>
  );
}
