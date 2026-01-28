/**
 * useIterations Hook
 * Sprint 7: Fetch iteration submissions (title/abstract history)
 */

import { useState, useEffect } from 'react';
import { workflowService, IterationsResponse } from '../services/api/workflow';

interface UseIterationsParams {
  jobId: string;
  token: string;
  enabled?: boolean;
}

interface UseIterationsResult {
  iterations: IterationsResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useIterations({ jobId, token, enabled = true }: UseIterationsParams): UseIterationsResult {
  const [iterations, setIterations] = useState<IterationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIterations = async () => {
    if (!jobId || !token || !enabled) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await workflowService.getIterations(jobId, token);
      setIterations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch iterations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIterations();
  }, [jobId, token, enabled]);

  return {
    iterations,
    loading,
    error,
    refresh: fetchIterations,
  };
}
