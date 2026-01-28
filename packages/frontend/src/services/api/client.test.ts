/**
 * Unit Tests: API Client
 * Story 1.1: Landing Page & Conference Selection
 * 
 * Critical: Must test that 202 Accepted is treated as success (not error).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from './client';

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('post', () => {
    it('should treat 202 Accepted as success', async () => {
      const mockResponse = {
        job_id: 'job-123',
        job_read_token: 'token-abc',
        status: 'queued',
        estimated_time_seconds: 90,
      };

      (global.fetch as any).mockResolvedValueOnce({
        status: 202,
        headers: {
          get: () => 'application/json',
        },
        json: async () => mockResponse,
      });

      const result = await apiClient.post('/api/v1/jobs', { conference: 'black_hat', topic: 'ai_ml_genai' });
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/jobs',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conference: 'black_hat', topic: 'ai_ml_genai' }),
        })
      );
    });

    it('should treat 200 OK as success', async () => {
      const mockResponse = { data: 'success' };
      (global.fetch as any).mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        json: async () => mockResponse,
      });

      const result = await apiClient.post('/api/v1/test', {});
      expect(result).toEqual(mockResponse);
    });

    it('should treat 204 No Content as success', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 204,
        headers: {
          get: () => null,
        },
      });

      const result = await apiClient.post('/api/v1/test', {});
      expect(result).toEqual({});
    });

    it('should throw error for 400 Bad Request', async () => {
      const errorData = { error: 'Invalid request' };
      (global.fetch as any).mockResolvedValueOnce({
        status: 400,
        headers: {
          get: () => 'application/json',
        },
        json: async () => errorData,
      });

      await expect(apiClient.post('/api/v1/test', {})).rejects.toThrow('Invalid request');
    });

    it('should throw error for 429 Rate Limited', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 429,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({}),
      });

      try {
        await apiClient.post('/api/v1/test', {});
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.status).toBe(429);
      }
    });

    it('should throw error for 503 Service Unavailable', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 503,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({}),
      });

      try {
        await apiClient.post('/api/v1/test', {});
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.status).toBe(503);
      }
    });

    it('should handle non-JSON error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 500,
        headers: {
          get: () => 'text/plain',
        },
      });

      await expect(apiClient.post('/api/v1/test', {})).rejects.toThrow('HTTP 500');
    });

    it('should handle JSON parse errors gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 400,
        headers: {
          get: () => 'application/json',
        },
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(apiClient.post('/api/v1/test', {})).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should treat 200 OK as success', async () => {
      const mockResponse = { data: 'success' };
      (global.fetch as any).mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        json: async () => mockResponse,
      });

      const result = await apiClient.get('/api/v1/test');
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for non-2xx status codes', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        status: 404,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({ error: 'Not found' }),
      });

      await expect(apiClient.get('/api/v1/test')).rejects.toThrow();
    });
  });
});
