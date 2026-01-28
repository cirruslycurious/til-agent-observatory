/**
 * Unit Tests for Job Handlers
 * Story 6.5: Job Lifecycle & Metadata Table
 * Story 4.1: Budget Initialization Integration
 * 
 * Test Requirements:
 * - Test job creation (success case)
 * - Test job creation with budget initialization
 * - Test job creation (idempotency - duplicate job_id)
 * - Test status query (success case)
 * - Test status query (job not found, 404)
 * - Test status query (expired job - item exists but current_time > expires_at, 410 Gone)
 * - Test status query (expired job - item missing after TTL deletion, 404 or 410)
 * - Test status query (invalid token, 403 Forbidden)
 * - Test token verification (success case)
 * - Test token verification (invalid token)
 * - Test token verification (expired job)
 * - Mock all external dependencies (DynamoDB)
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createJobHandler, getJobStatusHandler } from './jobs';
import { verifyJobTokenHash } from '../../../shared/auth/token-verifier';
import { initializeJobBudget } from '../../../shared/budget-service/budget_client';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/lib-dynamodb');
vi.mock('@aws-sdk/client-ssm');

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-123',
  createHmac: vi.fn(),
}));

// Mock shared auth
vi.mock('../../../shared/auth/token-verifier', () => ({
  verifyJobTokenHash: vi.fn(),
}));

// Mock budget service
vi.mock('../../../shared/budget-service/budget_client', () => ({
  initializeJobBudget: vi.fn(),
}));

// Mock SSM client
const mockSsmSend = vi.fn();
vi.mocked(SSMClient).mockImplementation(() => ({
  send: mockSsmSend,
} as any));

describe('Job Handlers', () => {
  let mockDocClient: {
    send: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOBS_TABLE_NAME = 'test-jobs-table';
    process.env.SERVER_SECRET = 'test-secret';
    process.env.SYSTEM_ENABLED_PARAMETER = '/conference-abstract/system-enabled';
    process.env.KILL_SWITCH_TIMEOUT_MS = '400';

    mockDocClient = {
      send: vi.fn(),
    };

    // Mock DynamoDBDocumentClient.from
    vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);

    // Mock SSM client - default to enabled
    mockSsmSend.mockResolvedValue({
      Parameter: {
        Name: '/conference-abstract/system-enabled',
        Value: 'true',
        Type: 'String',
      },
    });

    // Mock verifyJobTokenHash
    vi.mocked(verifyJobTokenHash).mockReturnValue(true);

    // Mock initializeJobBudget
    vi.mocked(initializeJobBudget).mockResolvedValue({
      job_id: 'test-uuid-123',
      web_search_count: 0,
      web_search_limit: 10,
      estimated_cost_cents: 0,
      estimated_cost_usd: 0,
      minimal_mode_activated: false,
      tokens_used: 0,
      searches_remaining: 10,
      created_at: '2026-01-14T10:00:00Z',
      updated_at: '2026-01-14T10:00:00Z',
      job_created_at: '2026-01-14T10:00:00Z',
    });
  });

  describe('createJobHandler', () => {
    it('should create job successfully when system is enabled', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'black_hat',
          topic: 'ai_ml_genai',
          user_session_id: 'session-123',
        }),
      } as any;

      // Mock kill switch check (system enabled) - already set in beforeEach
      mockDocClient.send.mockResolvedValueOnce({});

      const result = await createJobHandler(event);

      expect(result.statusCode).toBe(202);
      const body = JSON.parse(result.body);
      expect(body.job_id).toBe('test-uuid-123');
      expect(body.job_read_token).toBeDefined();
      expect(body.status).toBe('queued');

      // Verify kill switch check happened before budget initialization
      expect(mockSsmSend).toHaveBeenCalled();
      expect(initializeJobBudget).toHaveBeenCalledWith('test-uuid-123');
    });

    it('should block job creation when system is disabled', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'black_hat',
          topic: 'ai_ml_genai',
        }),
      } as any;

      // Mock kill switch check (system disabled)
      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Name: '/conference-abstract/system-enabled',
          Value: 'false',
          Type: 'String',
        },
      });

      const result = await createJobHandler(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('System temporarily unavailable for maintenance. Please try again later.');

      // Verify kill switch check happened
      expect(mockSsmSend).toHaveBeenCalled();
      // Verify budget initialization was NOT called (kill switch blocks before any cost-incurring operations)
      expect(initializeJobBudget).not.toHaveBeenCalled();
      // Verify DynamoDB write was NOT called
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });

    it('should block job creation on kill switch timeout (fail closed)', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'black_hat',
          topic: 'ai_ml_genai',
        }),
      } as any;

      // Mock kill switch check to timeout (never resolves)
      mockSsmSend.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      // Use fake timers to control timeout
      vi.useFakeTimers();
      const resultPromise = createJobHandler(event);
      
      // Fast-forward past timeout (400ms)
      vi.advanceTimersByTime(500);
      
      const result = await resultPromise;
      vi.useRealTimers();

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('System temporarily unavailable for maintenance. Please try again later.');

      // Verify budget initialization was NOT called
      expect(initializeJobBudget).not.toHaveBeenCalled();
    });

    it('should block job creation on kill switch error (fail closed)', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'black_hat',
          topic: 'ai_ml_genai',
        }),
      } as any;

      // Mock kill switch check to error
      mockSsmSend.mockRejectedValueOnce(new Error('SSM service unavailable'));

      const result = await createJobHandler(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('System temporarily unavailable for maintenance. Please try again later.');

      // Verify budget initialization was NOT called
      expect(initializeJobBudget).not.toHaveBeenCalled();
    });

    it('should continue job creation even if budget initialization fails', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'black_hat',
          topic: 'ai_ml_genai',
        }),
      } as any;

      mockDocClient.send.mockResolvedValueOnce({});

      // Mock budget initialization to fail
      vi.mocked(initializeJobBudget).mockRejectedValueOnce(new Error('Budget init failed'));

      const result = await createJobHandler(event);

      // Job creation should still succeed
      expect(result.statusCode).toBe(202);
      const body = JSON.parse(result.body);
      expect(body.job_id).toBe('test-uuid-123');

      // Budget initialization should have been attempted
      expect(initializeJobBudget).toHaveBeenCalled();
    });

    it('should validate conference', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'invalid_conference',
          topic: 'ai_ml_genai',
        }),
      } as any;

      const result = await createJobHandler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid conference');
    });

    it('should validate topic', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'black_hat',
          topic: 'invalid_topic',
        }),
      } as any;

      const result = await createJobHandler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid topic');
    });

    it('should handle duplicate job_id (ConditionalCheckFailedException)', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          conference: 'black_hat',
          topic: 'ai_ml_genai',
        }),
      } as any;

      const error = new Error('Conditional check failed');
      error.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(error);

      const result = await createJobHandler(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Job already exists');
    });
  });

  describe('getJobStatusHandler', () => {
    it('should return job status successfully', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-123' },
        queryStringParameters: { token: 'test-token' },
      } as any;

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: 'test-job-123',
          status: 'running',
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:30:00Z',
          expires_at: Math.floor(Date.now() / 1000) + 86400, // 1 day from now
          job_read_token_hash: 'hashed-token',
        },
      });

      vi.mocked(verifyJobTokenHash).mockReturnValue(true);

      const result = await getJobStatusHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('running');
    });

    it('should return 404 if job not found', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-not-found' },
        queryStringParameters: { token: 'test-token' },
      } as any;

      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
      });

      const result = await getJobStatusHandler(event);

      expect(result.statusCode).toBe(404);
    });

    it('should return 410 if job expired', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-expired' },
        queryStringParameters: { token: 'test-token' },
      } as any;

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: 'test-job-expired',
          status: 'completed',
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:30:00Z',
          expires_at: Math.floor(Date.now() / 1000) - 86400, // 1 day ago (expired)
          job_read_token_hash: 'hashed-token',
        },
      });

      const result = await getJobStatusHandler(event);

      expect(result.statusCode).toBe(410);
    });

    it('should return 403 if token is invalid', async () => {
      const event: APIGatewayProxyEvent = {
        pathParameters: { job_id: 'test-job-123' },
        queryStringParameters: { token: 'invalid-token' },
      } as any;

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: 'test-job-123',
          status: 'running',
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:30:00Z',
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          job_read_token_hash: 'hashed-token',
        },
      });

      vi.mocked(verifyJobTokenHash).mockReturnValue(false);

      const result = await getJobStatusHandler(event);

      expect(result.statusCode).toBe(403);
    });
  });
});
