/**
 * Unit Tests for System Status Handlers
 * Story 4.3: Global Cost Protection
 * 
 * Test Requirements:
 * - Test system status when enabled
 * - Test system status when disabled
 * - Test system status on timeout (fail closed)
 * - Test system status on error (fail closed)
 * - Mock Parameter Store calls
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { getSystemStatusHandler } from './system';

// Mock AWS SDK
vi.mock('@aws-sdk/client-ssm');

// Mock SSM client
const mockSsmSend = vi.fn();
vi.mocked(SSMClient).mockImplementation(() => ({
  send: mockSsmSend,
} as any));

describe('System Status Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYSTEM_ENABLED_PARAMETER = '/conference-abstract/system-enabled';
    process.env.KILL_SWITCH_TIMEOUT_MS = '400';
  });

  describe('getSystemStatusHandler', () => {
    it('should return enabled status when system is enabled', async () => {
      const event: APIGatewayProxyEvent = {} as any;

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Name: '/conference-abstract/system-enabled',
          Value: 'true',
          Type: 'String',
        },
      });

      const result = await getSystemStatusHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('enabled');
      expect(body.message).toBe('System is operational');
    });

    it('should return disabled status when system is disabled', async () => {
      const event: APIGatewayProxyEvent = {} as any;

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Name: '/conference-abstract/system-enabled',
          Value: 'false',
          Type: 'String',
        },
      });

      const result = await getSystemStatusHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('disabled');
      expect(body.message).toBe('System temporarily unavailable for maintenance');
    });

    it('should return disabled status on timeout (fail closed)', async () => {
      const event: APIGatewayProxyEvent = {} as any;

      // Mock kill switch check to timeout (never resolves)
      mockSsmSend.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      // Use fake timers to control timeout
      vi.useFakeTimers();
      const resultPromise = getSystemStatusHandler(event);
      
      // Fast-forward past timeout (400ms)
      vi.advanceTimersByTime(500);
      
      const result = await resultPromise;
      vi.useRealTimers();

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('disabled');
      expect(body.message).toBe('System temporarily unavailable for maintenance');
    });

    it('should return disabled status on error (fail closed)', async () => {
      const event: APIGatewayProxyEvent = {} as any;

      // Mock kill switch check to error
      mockSsmSend.mockRejectedValueOnce(new Error('SSM service unavailable'));

      const result = await getSystemStatusHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('disabled');
      expect(body.message).toBe('System status check failed - treating as disabled');
    });

    it('should handle case-insensitive parameter value', async () => {
      const event: APIGatewayProxyEvent = {} as any;

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Name: '/conference-abstract/system-enabled',
          Value: 'TRUE', // Uppercase
          Type: 'String',
        },
      });

      const result = await getSystemStatusHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('enabled');
    });

    it('should handle missing parameter value (defaults to disabled)', async () => {
      const event: APIGatewayProxyEvent = {} as any;

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Name: '/conference-abstract/system-enabled',
          Value: undefined, // Missing value
          Type: 'String',
        },
      });

      const result = await getSystemStatusHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('disabled');
    });
  });
});
