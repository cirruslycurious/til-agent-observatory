/**
 * Unit Tests for Admin Handlers
 * Story 6.5: Job Lifecycle & Metadata Table
 * 
 * Test Requirements:
 * - Test admin endpoint (list failed jobs)
 * - Test admin authentication
 * - Test pagination
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { listFailedJobsHandler } from './admin';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/lib-dynamodb');

describe('Admin Handlers', () => {
  let mockDocClient: {
    send: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOBS_TABLE_NAME = 'test-jobs-table';
    process.env.ADMIN_API_KEY = 'test-admin-key';

    mockDocClient = {
      send: vi.fn(),
    };

    vi.mocked(require('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient.from).mockReturnValue(
      mockDocClient as any
    );
  });

  describe('listFailedJobsHandler', () => {
    it('should list failed jobs successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          'x-admin-api-key': 'test-admin-key',
        },
        queryStringParameters: { days: '7' },
      };

      const mockJobs = [
        {
          job_id: 'job-1',
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:05:00Z',
          completed_at: '2026-01-14T10:05:00Z',
          error: 'Test error',
          failure_reason: 'timeout',
        },
        {
          job_id: 'job-2',
          created_at: '2026-01-13T10:00:00Z',
          updated_at: '2026-01-13T10:05:00Z',
          completed_at: '2026-01-13T10:05:00Z',
          error: 'Another error',
          failure_reason: 'internal_error',
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({ Items: mockJobs });

      const response = await listFailedJobsHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobs).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.days).toBe(7);
      expect(body.cutoff_date).toBeDefined();

      // Verify ScanCommand was called with correct filter
      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-jobs-table',
            FilterExpression: '#status = :status AND created_at >= :cutoff',
            Limit: 100,
          }),
        })
      );
    });

    it('should require admin authentication', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {},
        queryStringParameters: { days: '7' },
      };

      const response = await listFailedJobsHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject invalid admin API key', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          'x-admin-api-key': 'wrong-key',
        },
        queryStringParameters: { days: '7' },
      };

      const response = await listFailedJobsHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should use default days (7) if not provided', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          'x-admin-api-key': 'test-admin-key',
        },
        queryStringParameters: {},
      };

      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const response = await listFailedJobsHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.days).toBe(7);
    });

    it('should cap days at maximum 30', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          'x-admin-api-key': 'test-admin-key',
        },
        queryStringParameters: { days: '100' },
      };

      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const response = await listFailedJobsHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.days).toBe(30); // Capped at 30
    });

    it('should limit results to 100 jobs per request', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        headers: {
          'x-admin-api-key': 'test-admin-key',
        },
        queryStringParameters: { days: '7' },
      };

      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await listFailedJobsHandler(event as APIGatewayProxyEvent);

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Limit: 100,
          }),
        })
      );
    });
  });
});
