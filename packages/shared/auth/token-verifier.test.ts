/**
 * Unit Tests for Token Verifier
 * Story 6.5: Job Lifecycle & Metadata Table
 * 
 * Test Requirements:
 * - Valid token (hash matches)
 * - Invalid token (hash mismatch)
 * - Unit test ensures constant-time primitive is used
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyJobTokenHash } from './token-verifier';
import { createHmac, timingSafeEqual } from 'crypto';

// Mock crypto
vi.mock('crypto', () => ({
  createHmac: vi.fn(),
  timingSafeEqual: vi.fn(),
}));

describe('Token Verifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERVER_SECRET = 'test-secret';
  });

  it('should verify valid token hash', () => {
    const token = 'test-token';
    const storedHash = 'correct-hash';

    // Mock createHmac to return a chainable object
    const mockUpdate = vi.fn().mockReturnThis();
    const mockDigest = vi.fn().mockReturnValue('correct-hash');
    const mockHmac = {
      update: mockUpdate,
      digest: mockDigest,
    };

    vi.mocked(createHmac).mockReturnValue(mockHmac as any);
    vi.mocked(timingSafeEqual).mockReturnValue(true);

    const result = verifyJobTokenHash(token, storedHash);

    expect(result).toBe(true);
    expect(createHmac).toHaveBeenCalledWith('sha256', 'test-secret');
    expect(mockUpdate).toHaveBeenCalledWith(token);
    expect(mockDigest).toHaveBeenCalledWith('hex');
    expect(timingSafeEqual).toHaveBeenCalled();
  });

  it('should reject invalid token hash', () => {
    const token = 'test-token';
    const storedHash = 'wrong-hash';

    const mockUpdate = vi.fn().mockReturnThis();
    const mockDigest = vi.fn().mockReturnValue('computed-hash');
    const mockHmac = {
      update: mockUpdate,
      digest: mockDigest,
    };

    vi.mocked(createHmac).mockReturnValue(mockHmac as any);
    vi.mocked(timingSafeEqual).mockReturnValue(false);

    const result = verifyJobTokenHash(token, storedHash);

    expect(result).toBe(false);
    expect(timingSafeEqual).toHaveBeenCalled();
  });

  it('should return false if hash lengths differ', () => {
    const token = 'test-token';
    const storedHash = 'short';

    const mockUpdate = vi.fn().mockReturnThis();
    const mockDigest = vi.fn().mockReturnValue('much-longer-hash-value');
    const mockHmac = {
      update: mockUpdate,
      digest: mockDigest,
    };

    vi.mocked(createHmac).mockReturnValue(mockHmac as any);

    const result = verifyJobTokenHash(token, storedHash);

    expect(result).toBe(false);
    // Should not call timingSafeEqual if lengths differ
    expect(timingSafeEqual).not.toHaveBeenCalled();
  });

  it('should use constant-time comparison (timingSafeEqual)', () => {
    const token = 'test-token';
    const storedHash = 'test-hash';

    const mockUpdate = vi.fn().mockReturnThis();
    const mockDigest = vi.fn().mockReturnValue('test-hash');
    const mockHmac = {
      update: mockUpdate,
      digest: mockDigest,
    };

    vi.mocked(createHmac).mockReturnValue(mockHmac as any);
    vi.mocked(timingSafeEqual).mockReturnValue(true);

    verifyJobTokenHash(token, storedHash);

    // Verify that timingSafeEqual is used (constant-time comparison)
    expect(timingSafeEqual).toHaveBeenCalled();
    expect(timingSafeEqual).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Buffer)
    );
  });
});
