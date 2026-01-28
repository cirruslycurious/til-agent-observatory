/**
 * Artifact Reader Library (TypeScript)
 * Story 6.1: DynamoDB Scratch Artifacts Storage
 *
 * Reads artifacts from DynamoDB and S3.
 * Mirror of Python artifact_reader.py - keep in sync via tests
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
const ARTIFACTS_TABLE_NAME = process.env.ARTIFACTS_TABLE_NAME || 'til-artifacts';
const S3_BUCKET_NAME = process.env.ARTIFACTS_BUCKET_NAME || 'til-artifacts';
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
/**
 * Retrieve artifact from DynamoDB (and S3 if overflowed).
 */
export async function getArtifact(jobId, taskId, artifactVersion) {
    let artifact;
    if (artifactVersion) {
        // GetItem by job_id + task_id#artifact_version
        const artifactSk = `${taskId}#${artifactVersion}`;
        const response = await docClient.send(new GetCommand({
            TableName: ARTIFACTS_TABLE_NAME,
            Key: {
                job_id: jobId,
                artifact_sk: artifactSk,
            },
        }));
        if (!response.Item) {
            return null;
        }
        artifact = response.Item;
    }
    else {
        // Get latest version: Try latest pointer first (Option 1 - fast)
        const latestSk = `latest#${taskId}`;
        const latestResponse = await docClient.send(new GetCommand({
            TableName: ARTIFACTS_TABLE_NAME,
            Key: {
                job_id: jobId,
                artifact_sk: latestSk,
            },
        }));
        if (latestResponse.Item?.latest_version) {
            // Use latest pointer
            const artifactSk = `${taskId}#${latestResponse.Item.latest_version}`;
            const response = await docClient.send(new GetCommand({
                TableName: ARTIFACTS_TABLE_NAME,
                Key: {
                    job_id: jobId,
                    artifact_sk: artifactSk,
                },
            }));
            if (response.Item) {
                artifact = response.Item;
            }
            else {
                return null;
            }
        }
        else {
            // Fallback: Query by job_id, filter by task_id prefix, sort descending, limit 1 (Option 2)
            const response = await docClient.send(new QueryCommand({
                TableName: ARTIFACTS_TABLE_NAME,
                KeyConditionExpression: 'job_id = :job_id',
                FilterExpression: 'begins_with(artifact_sk, :task_prefix)',
                ExpressionAttributeValues: {
                    ':job_id': jobId,
                    ':task_prefix': `${taskId}#`,
                },
                ScanIndexForward: false, // Descending order
                Limit: 1,
            }));
            if (!response.Items || response.Items.length === 0) {
                return null;
            }
            artifact = response.Items[0];
        }
    }
    // If overflowed, fetch full artifact from S3
    if (artifact.overflow?.s3_payload_ref) {
        const s3Key = artifact.overflow.s3_payload_ref;
        try {
            const s3Response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: s3Key,
            }));
            const body = await s3Response.Body?.transformToString();
            if (body) {
                const fullArtifact = JSON.parse(body);
                // Merge S3 data back into artifact
                artifact.data = fullArtifact.data;
            }
        }
        catch (error) {
            console.warn(`Failed to fetch S3 artifact ${s3Key}:`, error);
            // Return artifact with summary only
        }
    }
    return artifact;
}
/**
 * List all artifacts for a job.
 */
export async function listArtifactsForJob(jobId, includeData = false) {
    const response = await docClient.send(new QueryCommand({
        TableName: ARTIFACTS_TABLE_NAME,
        KeyConditionExpression: 'job_id = :job_id',
        ExpressionAttributeValues: {
            ':job_id': jobId,
        },
    }));
    const artifacts = [];
    for (const item of response.Items || []) {
        if (includeData) {
            // Include full artifact
            artifacts.push(item);
        }
        else {
            // Return metadata only (exclude full data payloads)
            const artifactMetadata = {
                artifact_id: item.meta?.artifact_id,
                task_id: item.meta?.task_id,
                artifact_version: item.meta?.artifact_version,
                artifact_type: item.meta?.artifact_type,
                status: item.meta?.status,
                created_at: item.meta?.spawned_at,
                has_overflow: !!item.overflow?.s3_payload_ref,
            };
            artifacts.push(artifactMetadata);
        }
    }
    return artifacts;
}
//# sourceMappingURL=artifact_reader.js.map