/**
 * useJobEvents Hook
 * Sprint 7: Polling for job events with merge contract
 * 
 * Polls GET /api/v1/workflow/{job_id}/events every 5s.
 * Implements merge contract: Set + sort to prevent flicker.
 * Stops when job is terminal.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { workflowService, NormalizedEvent, EventsResponse } from '../services/api/workflow';

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_BACKOFF = 40000; // 40 seconds max

interface UseJobEventsOptions {
  jobId: string;
  token: string;
  enabled?: boolean;
  isTerminal?: boolean;
}

interface UseJobEventsResult {
  events: NormalizedEvent[];
  serverEventCount: number;
  truncated: boolean;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useJobEvents({ 
  jobId, 
  token, 
  enabled = true,
  isTerminal = false 
}: UseJobEventsOptions): UseJobEventsResult {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [serverEventCount, setServerEventCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [backoffMs, setBackoffMs] = useState(POLL_INTERVAL);
  
  // Merge contract state
  const seenEventIds = useRef(new Set<string>());
  const consecutiveErrors = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Merge fetched events into existing state
   * - Dedupe by event_id
   * - Append only unseen events
   * - Sort by (timestamp, event_id) for deterministic ordering
   */
  const mergeEvents = useCallback((fetched: NormalizedEvent[]) => {
    const newEvents = fetched.filter(e => !seenEventIds.current.has(e.event_id));
    
    if (newEvents.length === 0) return;
    
    // Add to seen set
    newEvents.forEach(e => seenEventIds.current.add(e.event_id));
    
    // Append and sort
    setEvents(prev => {
      const merged = [...prev, ...newEvents];
      // Sort by timestamp, then event_id for deterministic ordering
      merged.sort((a, b) => {
        const timestampCompare = a.timestamp.localeCompare(b.timestamp);
        if (timestampCompare !== 0) return timestampCompare;
        return a.event_id.localeCompare(b.event_id);
      });
      return merged;
    });
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!jobId || !token) return;
    
    try {
      const data: EventsResponse = await workflowService.getEvents(jobId, token);
      
      // Merge events (append-only, dedupe by event_id)
      mergeEvents(data.events);
      
      setServerEventCount(data.server_event_count);
      setTruncated(data.truncated);
      setError(null);
      consecutiveErrors.current = 0;
      setBackoffMs(POLL_INTERVAL); // Reset backoff on success
    } catch (err) {
      consecutiveErrors.current += 1;
      setError(err instanceof Error ? err : new Error('Failed to fetch events'));
      
      // Exponential backoff
      const newBackoff = Math.min(POLL_INTERVAL * Math.pow(2, consecutiveErrors.current - 1), MAX_BACKOFF);
      setBackoffMs(newBackoff);
    } finally {
      setLoading(false);
    }
  }, [jobId, token, mergeEvents]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchEvents();
    }
  }, [enabled, fetchEvents]);

  // Polling effect
  useEffect(() => {
    if (!enabled || isTerminal) return;

    // Schedule next poll
    timeoutRef.current = setTimeout(() => {
      fetchEvents();
    }, backoffMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, isTerminal, backoffMs, fetchEvents]);

  // Reset when jobId changes
  useEffect(() => {
    seenEventIds.current = new Set();
    setEvents([]);
    setServerEventCount(0);
    setTruncated(false);
    setLoading(true);
  }, [jobId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchEvents();
  }, [fetchEvents]);

  return { 
    events, 
    serverEventCount, 
    truncated, 
    loading, 
    error, 
    refresh 
  };
}
