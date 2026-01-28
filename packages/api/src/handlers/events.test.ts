/**
 * Unit Tests for Event Handlers
 * Story 3.1: Decision Event Capture
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getEventsHandler } from './events';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({
      send: vi.fn(),
    })),
  },
  QueryCommand: vi.fn(),
  GetCommand: vi.fn(),
}));

vi.mock('../../../shared/auth/token-verifier', () => ({
  verifyJobTokenHash: vi.fn((token: string, hash: string) => {
    // Simple mock: token matches if token === 'valid-token'
    return token === 'valid-token' && hash === 'valid-hash';
  }),
}));

describe('getEventsHandler', () => {
  let mockDocClient: any;
  let mockEvent: APIGatewayProxyEvent;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock document client
    mockDocClient = {
      send: vi.fn(),
    };
    (DynamoDBDocumentClient.from as any).mockReturnValue(mockDocClient);

    // Default event structure
    mockEvent = {
      pathParameters: { job_id: 'test-job-id' },
      queryStringParameters: { token: 'valid-token' },
    } as APIGatewayProxyEvent;
  });

  it('should return 400 if job_id is missing', async () => {
    const event = {
      ...mockEvent,
      pathParameters: {},
    } as APIGatewayProxyEvent;

    const response = await getEventsHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'job_id is required',
    });
  });

  it('should return 400 if token is missing', async () => {
    const event = {
      ...mockEvent,
      queryStringParameters: {},
    } as APIGatewayProxyEvent;

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: null, // Job not found
    });

    const response = await getEventsHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'token query parameter is required',
    });
  });

  it('should return 404 if job not found', async () => {
    // Mock job lookup - job not found
    mockDocClient.send.mockResolvedValueOnce({
      Item: null,
    });

    const response = await getEventsHandler(mockEvent);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'Job not found',
    });
  });

  it('should return 410 if job expired', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredJob = {
      job_id: 'test-job-id',
      job_read_token_hash: 'valid-hash',
      expires_at: now - 1, // Expired
    };

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: expiredJob,
    });

    const response = await getEventsHandler(mockEvent);

    expect(response.statusCode).toBe(410);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'Job expired',
    });
  });

  it('should return 403 if token is invalid', async () => {
    const job = {
      job_id: 'test-job-id',
      job_read_token_hash: 'invalid-hash',
      expires_at: Math.floor(Date.now() / 1000) + 3600, // Not expired
    };

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: job,
    });

    const response = await getEventsHandler(mockEvent);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'Invalid token',
    });
  });

  it('should return events with replay metadata', async () => {
    const job = {
      job_id: 'test-job-id',
      job_read_token_hash: 'valid-hash',
      expires_at: Math.floor(Date.now() / 1000) + 3600, // Not expired
    };

    const events = [
      {
        job_id: 'test-job-id',
        seq_ts_type: '0000000001#2026-01-12T10:30:15.123Z#tool_called',
        event_id: 'event-1',
        event_type: 'tool_called',
        actor: 'worker',
        seq: 1,
        timestamp: '2026-01-12T10:30:15.123Z',
        summary: 'Tool called',
        details: { tool_name: 'web_search' },
        details_hash: 'hash-1',
        details_truncated: false,
        created_at: '2026-01-12T10:30:15.200Z',
      },
      {
        job_id: 'test-job-id',
        seq_ts_type: '0000000002#2026-01-12T10:30:16.123Z#artifact_created',
        event_id: 'event-2',
        event_type: 'artifact_created',
        actor: 'sub_worker',
        seq: 2,
        timestamp: '2026-01-12T10:30:16.123Z',
        summary: 'Artifact created',
        details: { artifact_id: 'artifact-1' },
        details_hash: 'hash-2',
        details_truncated: false,
        created_at: '2026-01-12T10:30:16.200Z',
      },
    ];

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: job,
    });

    // Mock events query
    mockDocClient.send.mockResolvedValueOnce({
      Items: events,
      LastEvaluatedKey: undefined, // No more events
    });

    const response = await getEventsHandler(mockEvent);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.events).toEqual(events);
    expect(body.next_cursor).toBeNull();
    expect(body.replay).toEqual({
      ordered: true,
      ordering_key: 'seq',
      gaps: [],
    });
  });

  it('should filter events by event_type if provided', async () => {
    const job = {
      job_id: 'test-job-id',
      job_read_token_hash: 'valid-hash',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    const allEvents = [
      {
        job_id: 'test-job-id',
        seq_ts_type: '0000000001#2026-01-12T10:30:15.123Z#tool_called',
        event_id: 'event-1',
        event_type: 'tool_called',
        actor: 'worker',
        seq: 1,
        timestamp: '2026-01-12T10:30:15.123Z',
        summary: 'Tool called',
        details: {},
        details_hash: 'hash-1',
        details_truncated: false,
        created_at: '2026-01-12T10:30:15.200Z',
      },
      {
        job_id: 'test-job-id',
        seq_ts_type: '0000000002#2026-01-12T10:30:16.123Z#artifact_created',
        event_id: 'event-2',
        event_type: 'artifact_created',
        actor: 'sub_worker',
        seq: 2,
        timestamp: '2026-01-12T10:30:16.123Z',
        summary: 'Artifact created',
        details: {},
        details_hash: 'hash-2',
        details_truncated: false,
        created_at: '2026-01-12T10:30:16.200Z',
      },
    ];

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: job,
    });

    // Mock events query
    mockDocClient.send.mockResolvedValueOnce({
      Items: allEvents,
      LastEvaluatedKey: undefined,
    });

    const event = {
      ...mockEvent,
      queryStringParameters: {
        token: 'valid-token',
        event_type: 'tool_called',
      },
    } as APIGatewayProxyEvent;

    const response = await getEventsHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event_type).toBe('tool_called');
  });

  it('should support pagination with cursor', async () => {
    const job = {
      job_id: 'test-job-id',
      job_read_token_hash: 'valid-hash',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    const events = [
      {
        job_id: 'test-job-id',
        seq_ts_type: '0000000003#2026-01-12T10:30:17.123Z#tool_called',
        event_id: 'event-3',
        event_type: 'tool_called',
        actor: 'worker',
        seq: 3,
        timestamp: '2026-01-12T10:30:17.123Z',
        summary: 'Tool called',
        details: {},
        details_hash: 'hash-3',
        details_truncated: false,
        created_at: '2026-01-12T10:30:17.200Z',
      },
    ];

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: job,
    });

    // Mock events query with cursor
    mockDocClient.send.mockResolvedValueOnce({
      Items: events,
      LastEvaluatedKey: {
        job_id: 'test-job-id',
        seq_ts_type: '0000000003#2026-01-12T10:30:17.123Z#tool_called',
      },
    });

    const cursor = Buffer.from(JSON.stringify({
      job_id: 'test-job-id',
      seq_ts_type: '0000000002#2026-01-12T10:30:16.123Z#artifact_created',
    })).toString('base64');

    const event = {
      ...mockEvent,
      queryStringParameters: {
        token: 'valid-token',
        cursor,
      },
    } as APIGatewayProxyEvent;

    const response = await getEventsHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.events).toEqual(events);
    expect(body.next_cursor).toBeTruthy();
  });

  it('should return 400 for invalid cursor format', async () => {
    const job = {
      job_id: 'test-job-id',
      job_read_token_hash: 'valid-hash',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: job,
    });

    const event = {
      ...mockEvent,
      queryStringParameters: {
        token: 'valid-token',
        cursor: 'invalid-cursor',
      },
    } as APIGatewayProxyEvent;

    const response = await getEventsHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'Invalid cursor format',
    });
  });

  it('should respect limit parameter', async () => {
    const job = {
      job_id: 'test-job-id',
      job_read_token_hash: 'valid-hash',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: job,
    });

    // Mock events query
    mockDocClient.send.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    const event = {
      ...mockEvent,
      queryStringParameters: {
        token: 'valid-token',
        limit: '50',
      },
    } as APIGatewayProxyEvent;

    await getEventsHandler(event);

    // Verify QueryCommand was called with limit=50
    const queryCall = mockDocClient.send.mock.calls.find((call: any[]) => 
      call[0] instanceof QueryCommand
    );
    expect(queryCall).toBeTruthy();
    const queryCommand = queryCall[0];
    expect(queryCommand.input.Limit).toBe(50);
  });

  it('should cap limit at MAX_LIMIT (1000)', async () => {
    const job = {
      job_id: 'test-job-id',
      job_read_token_hash: 'valid-hash',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    // Mock job lookup
    mockDocClient.send.mockResolvedValueOnce({
      Item: job,
    });

    // Mock events query
    mockDocClient.send.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    const event = {
      ...mockEvent,
      queryStringParameters: {
        token: 'valid-token',
        limit: '5000', // Exceeds MAX_LIMIT
      },
    } as APIGatewayProxyEvent;

    await getEventsHandler(event);

    // Verify QueryCommand was called with limit=1000 (capped)
    const queryCall = mockDocClient.send.mock.calls.find((call: any[]) => 
      call[0] instanceof QueryCommand
    );
    expect(queryCall).toBeTruthy();
    const queryCommand = queryCall[0];
    expect(queryCommand.input.Limit).toBe(1000);
  });
});
