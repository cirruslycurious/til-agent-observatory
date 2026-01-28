/**
 * Unit Tests for Artifact Handlers
 * Story 4.1: Budget Query Endpoint
 * 
 * Tests for GET /api/v1/workflow/{job_id}/budget endpoint
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getBudgetHandler } from './artifacts';
import { verifyJobTokenHash } from '../../../shared/auth/token-verifier';
import { getJobBudget } from '../../../shared/budget-service/budget_client';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/lib-dynamodb');

// Mock shared auth
vi.mock('../../../shared/auth/token-verifier', () => ({
  verifyJobTokenHash: vi.fn(),
}));

// Mock budget service
vi.mock('../../../shared/budget-service/budget_client', () => ({
  getJobBudget: vi.fn(),
}));

describe('Budget Handler', () => {
  let mockDocClient: {
    send: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOBS_TABLE_NAME = 'test-jobs-table';
    process.env.SERVER_SECRET = 'test-secret';

    mockDocClient = {
      send: vi.fn(),
    };

    vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);
    vi.mocked(verifyJobTokenHash).mockReturnValue(true);
  });

  describe('getBudgetHandler', () => {
    it('should return budget state successfully', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-123' },
        queryStringParameters: { token: 'test-token' },
      } as any;

      // Mock job lookup
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: 'test-job-123',
          status: 'running',
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          job_read_token_hash: 'hashed-token',
        },
      });

      // Mock budget retrieval
      vi.mocked(getJobBudget).mockResolvedValue({
        job_id: 'test-job-123',
        web_search_count: 3,
        web_search_limit: 10,
        estimated_cost_cents: 250,
        estimated_cost_usd: 2.50,
        minimal_mode_activated: false,
        tokens_used: 5000,
        searches_remaining: 7,
        created_at: '2026-01-14T10:00:00Z',
        updated_at: '2026-01-14T10:30:00Z',
        job_created_at: '2026-01-14T10:00:00Z',
      });

      const result = await getBudgetHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.job_id).toBe('test-job-123');
      expect(body.estimated_cost_cents).toBe(250);
      expect(body.estimated_cost_usd).toBe(2.50);
      expect(body.searches_remaining).toBe(7);
      expect(body.minimal_mode_activated).toBe(false);
    });

    it('should return 404 if budget not found', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-123' },
        queryStringParameters: { token: 'test-token' },
      } as any;

      // Mock job lookup
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: 'test-job-123',
          status: 'running',
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          job_read_token_hash: 'hashed-token',
        },
      });

      // Mock budget not found
      vi.mocked(getJobBudget).mockResolvedValue(null);

      const result = await getBudgetHandler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Budget not found for this job');
    });

    it('should return 400 if job_id is missing', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: {},
        queryStringParameters: { token: 'test-token' },
      } as any;

      const result = await getBudgetHandler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('job_id is required');
    });

    it('should return 403 if token is invalid', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-123' },
        queryStringParameters: { token: 'invalid-token' },
      } as any;

      // Mock job lookup
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: 'test-job-123',
          status: 'running',
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          job_read_token_hash: 'hashed-token',
        },
      });

      vi.mocked(verifyJobTokenHash).mockReturnValue(false);

      const result = await getBudgetHandler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid token');
    });

    it('should return 404 if job not found', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-not-found' },
        queryStringParameters: { token: 'test-token' },
      } as any;

      // Mock job not found
      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
      });

      const result = await getBudgetHandler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Job not found');
    });

    it('should return 410 if job expired', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-expired' },
        queryStringParameters: { token: 'test-token' },
      } as any;

      // Mock expired job
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: 'test-job-expired',
          status: 'completed',
          expires_at: Math.floor(Date.now() / 1000) - 86400, // Expired
          job_read_token_hash: 'hashed-token',
        },
      });

      const result = await getBudgetHandler(event);

      expect(result.statusCode).toBe(410);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Job expired');
    });
  });
});
