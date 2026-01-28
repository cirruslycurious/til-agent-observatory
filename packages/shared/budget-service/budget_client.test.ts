/**
 * Unit Tests for Budget Service (TypeScript)
 * Story 4.1: Per-Job Budget Tracking
 * 
 * Mirror from Python tests - keep in sync via test coverage
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { initializeJobBudget, getJobBudget, BudgetError, BudgetState } from './budget_client';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/lib-dynamodb');

describe('Budget Service (TypeScript)', () => {
  let mockDocClient: {
    send: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOB_BUDGETS_TABLE_NAME = 'test-job-budgets-table';

    mockDocClient = {
      send: vi.fn(),
    };

    // Mock DynamoDBDocumentClient.from
    vi.mocked(DynamoDBDocumentClient.from).mockReturnValue(mockDocClient as any);
  });

  describe('initializeJobBudget', () => {
    it('should initialize budget successfully', async () => {
      const jobId = 'test-job-123';

      mockDocClient.send.mockResolvedValueOnce({});

      const budget = await initializeJobBudget(jobId);

      expect(budget.job_id).toBe(jobId);
      expect(budget.web_search_count).toBe(0);
      expect(budget.web_search_limit).toBe(10);
      expect(budget.estimated_cost_cents).toBe(0);
      expect(budget.estimated_cost_usd).toBe(0);
      expect(budget.minimal_mode_activated).toBe(false);
      expect(budget.tokens_used).toBe(0);
      expect(budget.searches_remaining).toBe(10);
      expect(budget.created_at).toBeDefined();
      expect(budget.updated_at).toBeDefined();
      expect(budget.job_created_at).toBeDefined();

      // Verify PutCommand was called
      expect(mockDocClient.send).toHaveBeenCalled();
      const callArgs = mockDocClient.send.mock.calls[0][0];
      expect(callArgs.input.ConditionExpression).toBe('attribute_not_exists(job_id)');
    });

    it('should be idempotent (return existing budget if already exists)', async () => {
      const jobId = 'test-job-456';

      // First call: ConditionalCheckFailedException
      const conditionalError = new Error('Conditional check failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError);

      // Second call: GetCommand returns existing budget
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: jobId,
          web_search_count: 0,
          web_search_limit: 10,
          estimated_cost_cents: 0,
          minimal_mode_activated: false,
          tokens_used: 0,
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:00:00Z',
          job_created_at: '2026-01-14T10:00:00Z',
        },
      });

      const budget = await initializeJobBudget(jobId);

      expect(budget.job_id).toBe(jobId);
      expect(budget.web_search_limit).toBe(10);
      // Should have called GetCommand after ConditionalCheckFailedException
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('should throw BudgetError on non-idempotent errors', async () => {
      const jobId = 'test-job-error-123';

      const error = new Error('DynamoDB error');
      error.name = 'ResourceNotFoundException';
      mockDocClient.send.mockRejectedValueOnce(error);

      await expect(initializeJobBudget(jobId)).rejects.toThrow(BudgetError);
    });
  });

  describe('getJobBudget', () => {
    it('should return budget state with computed fields', async () => {
      const jobId = 'test-job-get-123';

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: jobId,
          web_search_count: 3,
          web_search_limit: 10,
          estimated_cost_cents: 250,
          minimal_mode_activated: false,
          tokens_used: 5000,
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:30:00Z',
          job_created_at: '2026-01-14T10:00:00Z',
        },
      });

      const budget = await getJobBudget(jobId);

      expect(budget).not.toBeNull();
      expect(budget!.job_id).toBe(jobId);
      expect(budget!.estimated_cost_cents).toBe(250);
      expect(budget!.estimated_cost_usd).toBe(2.50); // Computed at API boundary
      expect(budget!.searches_remaining).toBe(7); // max(0, 10 - 3)
      expect(budget!.web_search_count).toBe(3);
    });

    it('should return null if budget not found', async () => {
      const jobId = 'test-job-not-found';

      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
      });

      const budget = await getJobBudget(jobId);

      expect(budget).toBeNull();
    });

    it('should calculate searches_remaining correctly', async () => {
      const jobId = 'test-job-searches-123';

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: jobId,
          web_search_count: 7,
          web_search_limit: 10,
          estimated_cost_cents: 100,
          minimal_mode_activated: false,
          tokens_used: 2000,
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:00:00Z',
          job_created_at: '2026-01-14T10:00:00Z',
        },
      });

      const budget = await getJobBudget(jobId);

      expect(budget!.searches_remaining).toBe(3); // max(0, 10 - 7)
    });

    it('should prevent negative searches_remaining', async () => {
      const jobId = 'test-job-negative-123';

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: jobId,
          web_search_count: 15, // > limit
          web_search_limit: 10,
          estimated_cost_cents: 100,
          minimal_mode_activated: false,
          tokens_used: 2000,
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:00:00Z',
          job_created_at: '2026-01-14T10:00:00Z',
        },
      });

      const budget = await getJobBudget(jobId);

      expect(budget!.searches_remaining).toBe(0); // max(0, 10 - 15) = 0
    });

    it('should handle missing optional fields gracefully', async () => {
      const jobId = 'test-job-missing-fields-123';

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          job_id: jobId,
          web_search_count: 0,
          web_search_limit: 10,
          estimated_cost_cents: 0,
          tokens_used: 0,
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:00:00Z',
          job_created_at: '2026-01-14T10:00:00Z',
          // Missing: minimal_mode_activated, last_cost_event_at, last_cost_event_id, minimal_mode_activated_at
        },
      });

      const budget = await getJobBudget(jobId);

      expect(budget).not.toBeNull();
      expect(budget!.minimal_mode_activated).toBe(false); // Default
      expect(budget!.last_cost_event_at).toBeUndefined();
      expect(budget!.last_cost_event_id).toBeUndefined();
      expect(budget!.minimal_mode_activated_at).toBeUndefined();
    });

    it('should throw BudgetError on DynamoDB errors', async () => {
      const jobId = 'test-job-error-123';

      const error = new Error('DynamoDB error');
      mockDocClient.send.mockRejectedValueOnce(error);

      await expect(getJobBudget(jobId)).rejects.toThrow(BudgetError);
    });
  });
});
