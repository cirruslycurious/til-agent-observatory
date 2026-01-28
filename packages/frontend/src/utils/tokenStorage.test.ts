/**
 * Unit Tests: Token Storage Utility
 * Story 1.1: Landing Page & Conference Selection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setJobToken, getJobToken, clearJobToken, getOrCreateSessionId } from './tokenStorage';

describe('tokenStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('setJobToken', () => {
    it('should store token with correct key format', () => {
      setJobToken('job-123', 'token-abc');
      expect(sessionStorage.getItem('cab:job_token:job-123')).toBe('token-abc');
    });

    it('should overwrite existing token for same job ID', () => {
      setJobToken('job-123', 'token-abc');
      setJobToken('job-123', 'token-xyz');
      expect(sessionStorage.getItem('cab:job_token:job-123')).toBe('token-xyz');
    });

    it('should store different tokens for different job IDs', () => {
      setJobToken('job-123', 'token-abc');
      setJobToken('job-456', 'token-xyz');
      expect(sessionStorage.getItem('cab:job_token:job-123')).toBe('token-abc');
      expect(sessionStorage.getItem('cab:job_token:job-456')).toBe('token-xyz');
    });
  });

  describe('getJobToken', () => {
    it('should retrieve stored token', () => {
      sessionStorage.setItem('cab:job_token:job-123', 'token-abc');
      expect(getJobToken('job-123')).toBe('token-abc');
    });

    it('should return null for non-existent job ID', () => {
      expect(getJobToken('job-999')).toBeNull();
    });

    it('should return null for job ID with different prefix', () => {
      sessionStorage.setItem('other:job_token:job-123', 'token-abc');
      expect(getJobToken('job-123')).toBeNull();
    });
  });

  describe('clearJobToken', () => {
    it('should remove token from sessionStorage', () => {
      sessionStorage.setItem('cab:job_token:job-123', 'token-abc');
      clearJobToken('job-123');
      expect(sessionStorage.getItem('cab:job_token:job-123')).toBeNull();
    });

    it('should not error when clearing non-existent token', () => {
      expect(() => clearJobToken('job-999')).not.toThrow();
    });
  });

  describe('getOrCreateSessionId', () => {
    it('should create new session ID if none exists', () => {
      const sessionId = getOrCreateSessionId();
      expect(sessionId).toBeTruthy();
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4 format
      expect(sessionStorage.getItem('cab:user_session_id')).toBe(sessionId);
    });

    it('should return existing session ID if already created', () => {
      const firstId = getOrCreateSessionId();
      const secondId = getOrCreateSessionId();
      expect(firstId).toBe(secondId);
      expect(sessionStorage.getItem('cab:user_session_id')).toBe(firstId);
    });

    it('should use crypto.randomUUID', () => {
      const mockUUID = '12345678-1234-4123-8123-123456789abc';
      const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);
      
      const sessionId = getOrCreateSessionId();
      expect(sessionId).toBe(mockUUID);
      expect(randomUUIDSpy).toHaveBeenCalled();
      
      randomUUIDSpy.mockRestore();
    });
  });
});
