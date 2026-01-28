/**
 * Dashboard Context
 * Shared state for date filtering across all dashboard pages
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface DashboardContextType {
  startDate: string;
  endDate: string;
  setDateRange: (start: string, end: string) => void;
  resetToDefault: () => void;
}

// Default to last 30 days
function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  const setDateRange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const resetToDefault = useCallback(() => {
    const defaults = getDefaultDates();
    setStartDate(defaults.startDate);
    setEndDate(defaults.endDate);
  }, []);

  return (
    <DashboardContext.Provider value={{ startDate, endDate, setDateRange, resetToDefault }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboardContext must be used within DashboardProvider');
  }
  return context;
}
