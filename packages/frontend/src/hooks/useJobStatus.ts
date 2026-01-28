/**
 * useJobStatus Hook
 * Sprint 7: Polling for job status with phase projection
 * 
 * Polls GET /api/v1/jobs/{job_id}/status every 5s.
 * Stops when is_terminal === true.
 * Implements exponential backoff on errors.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { workflowService, JobStatusResponse } from '../services/api/workflow';

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_BACKOFF = 40000; // 40 seconds max

interface UseJobStatusOptions {
  jobId: string;
  token: string;
  enabled?: boolean;
}

interface UseJobStatusResult {
  status: JobStatusResponse | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useJobStatus({ jobId, token, enabled = true }: UseJobStatusOptions): UseJobStatusResult {
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [backoffMs, setBackoffMs] = useState(POLL_INTERVAL);
  const consecutiveErrors = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!jobId || !token) return;
    
    try {
      const data = await workflowService.getStatus(jobId, token);
      setStatus(data);
      setError(null);
      consecutiveErrors.current = 0;
      setBackoffMs(POLL_INTERVAL); // Reset backoff on success
    } catch (err) {
      consecutiveErrors.current += 1;
      setError(err instanceof Error ? err : new Error('Failed to fetch status'));
      
      // Exponential backoff: 5s -> 10s -> 20s -> 40s
      const newBackoff = Math.min(POLL_INTERVAL * Math.pow(2, consecutiveErrors.current - 1), MAX_BACKOFF);
      setBackoffMs(newBackoff);
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchStatus();
    }
  }, [enabled, fetchStatus]);

  // Polling effect
  useEffect(() => {
    if (!enabled) return;
    
    // Don't poll if terminal
    if (status?.is_terminal) {
      return;
    }

    // Schedule next poll
    timeoutRef.current = setTimeout(() => {
      fetchStatus();
    }, backoffMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, status?.is_terminal, backoffMs, fetchStatus]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  return { status, loading, error, refresh };
}
