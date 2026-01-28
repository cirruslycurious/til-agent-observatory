/**
 * useDashboardData Hook
 * Fetches dashboard data with auto-refresh and date filtering support
 */

import { useState, useEffect, useCallback } from 'react';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface UseDashboardDataOptions<T> {
  fetchFn: (startDate?: string, endDate?: string) => Promise<T>;
  startDate?: string;
  endDate?: string;
  autoRefresh?: boolean;
}

interface UseDashboardDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useDashboardData<T>({
  fetchFn,
  startDate,
  endDate,
  autoRefresh = true,
}: UseDashboardDataOptions<T>): UseDashboardDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchFn(startDate, endDate);
      setData(response);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [fetchFn, startDate, endDate]);

  // Initial fetch and when dates change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      fetchData();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [autoRefresh, fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: fetchData,
  };
}
