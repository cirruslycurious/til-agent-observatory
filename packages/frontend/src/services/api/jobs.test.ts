/**
 * Unit Tests: Jobs Service
 * Story 1.1: Landing Page & Conference Selection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jobsService } from './jobs';
import { apiClient } from './client';
import { getOrCreateSessionId } from '../../utils/tokenStorage';

vi.mock('./client');
vi.mock('../../utils/tokenStorage');

describe('JobsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getOrCreateSessionId as any).mockReturnValue('session-123');
  });

  describe('createJob', () => {
    it('should call API client with correct payload', async () => {
      const mockResponse = {
        job_id: 'job-123',
        job_read_token: 'token-abc',
        status: 'queued',
        estimated_time_seconds: 90,
      };

      (apiClient.post as any).mockResolvedValueOnce(mockResponse);

      const result = await jobsService.createJob({
        conference: 'black_hat',
        topic: 'ai_ml_genai',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/jobs', {
        conference: 'black_hat',
        topic: 'ai_ml_genai',
        user_session_id: 'session-123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should include user_session_id from getOrCreateSessionId', async () => {
      (getOrCreateSessionId as any).mockReturnValue('custom-session-id');
      (apiClient.post as any).mockResolvedValueOnce({
        job_id: 'job-123',
        job_read_token: 'token-abc',
        status: 'queued',
        estimated_time_seconds: 90,
      });

      await jobsService.createJob({
        conference: 'reinvent',
        topic: 'cybersecurity',
      });

      expect(getOrCreateSessionId).toHaveBeenCalled();
      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/jobs',
        expect.objectContaining({
          user_session_id: 'custom-session-id',
        })
      );
    });

    it('should use provided user_session_id if given', async () => {
      (apiClient.post as any).mockResolvedValueOnce({
        job_id: 'job-123',
        job_read_token: 'token-abc',
        status: 'queued',
        estimated_time_seconds: 90,
      });

      await jobsService.createJob({
        conference: 'kubecon',
        topic: 'containers',
        user_session_id: 'provided-session-id',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/jobs',
        expect.objectContaining({
          user_session_id: 'provided-session-id',
        })
      );
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      (error as any).status = 400;
      (apiClient.post as any).mockRejectedValueOnce(error);

      await expect(
        jobsService.createJob({
          conference: 'black_hat',
          topic: 'ai_ml_genai',
        })
      ).rejects.toThrow('API Error');
    });
  });
});
