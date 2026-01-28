/**
 * Unit Tests for Artifact Reader Library (TypeScript)
 * Story 6.1: DynamoDB Scratch Artifacts Storage
 * 
 * Tests artifact retrieval, latest version lookup, and S3 overflow handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getArtifact, listArtifactsForJob } from './artifact_reader';

// Mock AWS SDK clients
vi.mock('@aws-sdk/lib-dynamodb');
vi.mock('@aws-sdk/client-s3');

const mockDocClient = {
  send: vi.fn(),
} as unknown as DynamoDBDocumentClient;

const mockS3Client = {
  send: vi.fn(),
} as unknown as S3Client;

// Replace module-level clients with mocks
vi.mock('./artifact_reader', async () => {
  const actual = await vi.importActual('./artifact_reader');
  return {
    ...actual,
    docClient: mockDocClient,
    s3Client: mockS3Client,
  };
});

describe('Artifact Reader (TypeScript)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleArtifact = {
    job_id: 'test-job-id',
    artifact_sk: 'test-task#v0001',
    meta: {
      artifact_id: 'test-job-id#test-task#v0001',
      job_id: 'test-job-id',
      task_id: 'test-task',
      artifact_version: 'v0001',
      artifact_type: 'evidence_bundle',
      status: 'completed',
      spawned_at: new Date().toISOString(),
    },
    data: {
      evidence: ['Evidence 1', 'Evidence 2'],
    },
    overflow: {},
  };

  describe('getArtifact', () => {
    it('should get artifact by specific version', async () => {
      vi.mocked(mockDocClient.send).mockResolvedValueOnce({
        Item: sampleArtifact,
      });

      const result = await getArtifact('test-job-id', 'test-task', 'v0001');

      expect(result).not.toBeNull();
      expect(result?.meta.artifact_id).toBe(sampleArtifact.meta.artifact_id);
      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'til-artifacts',
            Key: {
              job_id: 'test-job-id',
              artifact_sk: 'test-task#v0001',
            },
          }),
        })
      );
    });

    it('should get latest artifact via latest pointer (Option 1 - fast)', async () => {
      const latestPointer = {
        Item: {
          job_id: 'test-job-id',
          artifact_sk: 'latest#test-task',
          latest_version: 'v0002',
          latest_artifact_id: 'test-job-id#test-task#v0002',
        },
      };

      const artifact = {
        Item: sampleArtifact,
      };

      vi.mocked(mockDocClient.send)
        .mockResolvedValueOnce(latestPointer)
        .mockResolvedValueOnce(artifact);

      const result = await getArtifact('test-job-id', 'test-task');

      expect(result).not.toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('should get latest artifact via Query fallback (Option 2)', async () => {
      // Latest pointer not found
      vi.mocked(mockDocClient.send).mockResolvedValueOnce({});

      // Query returns artifact
      vi.mocked(mockDocClient.send).mockResolvedValueOnce({
        Items: [sampleArtifact],
      });

      const result = await getArtifact('test-job-id', 'test-task');

      expect(result).not.toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('should fetch from S3 if overflowed', async () => {
      const artifactWithOverflow = {
        ...sampleArtifact,
        overflow: {
          s3_payload_ref: 'test-job-id/test-task/v0001/full_artifact.json',
          payload_sha256: 'test-hash',
          payload_size_bytes: 500000,
        },
      };

      const fullArtifact = {
        ...sampleArtifact,
        data: { large: 'content' },
      };

      vi.mocked(mockDocClient.send).mockResolvedValueOnce({
        Item: artifactWithOverflow,
      });

      vi.mocked(mockS3Client.send).mockResolvedValueOnce({
        Body: {
          transformToString: async () => JSON.stringify(fullArtifact),
        },
      });

      const result = await getArtifact('test-job-id', 'test-task', 'v0001');

      expect(result).not.toBeNull();
      expect(mockS3Client.send).toHaveBeenCalled();
      expect(result?.data).toEqual(fullArtifact.data);
    });

    it('should return null if artifact not found', async () => {
      vi.mocked(mockDocClient.send).mockResolvedValueOnce({});

      const result = await getArtifact('test-job-id', 'test-task', 'v0001');

      expect(result).toBeNull();
    });
  });

  describe('listArtifactsForJob', () => {
    it('should list artifacts with metadata only by default', async () => {
      vi.mocked(mockDocClient.send).mockResolvedValueOnce({
        Items: [sampleArtifact, { ...sampleArtifact, artifact_sk: 'test-task#v0002' }],
      });

      const result = await listArtifactsForJob('test-job-id', false);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('artifact_id');
      expect(result[0]).toHaveProperty('task_id');
      expect(result[0]).toHaveProperty('artifact_version');
      // Should NOT include full data payload
      expect(result[0]).not.toHaveProperty('data');
    });

    it('should list artifacts with full data if includeData=true', async () => {
      vi.mocked(mockDocClient.send).mockResolvedValueOnce({
        Items: [sampleArtifact],
      });

      const result = await listArtifactsForJob('test-job-id', true);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('data');
      expect(result[0].data).toEqual(sampleArtifact.data);
    });

    it('should return empty array if no artifacts found', async () => {
      vi.mocked(mockDocClient.send).mockResolvedValueOnce({
        Items: [],
      });

      const result = await listArtifactsForJob('test-job-id');

      expect(result).toEqual([]);
    });
  });
});
