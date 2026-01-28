/**
 * Token Verification Utility
 * Story 6.5: Job Lifecycle & Metadata Table
 *
 * Pure verifier function (no DB reads) - callers pass the job item
 * Uses constant-time comparison to prevent timing attacks
 */
import { createHmac, timingSafeEqual } from 'crypto';
const SERVER_SECRET = process.env.SERVER_SECRET || 'local-dev-secret-change-in-production';
/**
 * Verify job token hash using constant-time comparison
 *
 * @param token - The token provided by the client
 * @param storedHash - The stored hash from the job item
 * @returns true if token matches, false otherwise
 *
 * AC: Pure verifier function (no DB reads) - callers pass the job item
 * AC: Use known constant-time compare primitive: crypto.timingSafeEqual()
 */
export function verifyJobTokenHash(token, storedHash) {
    // Compute HMAC-SHA256(token, server_secret)
    const computedHash = createHmac('sha256', SERVER_SECRET)
        .update(token)
        .digest('hex');
    // Use constant-time comparison to prevent timing attacks
    if (computedHash.length !== storedHash.length) {
        return false;
    }
    try {
        return timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
    }
    catch {
        return false;
    }
}
/**
 * Get job from DynamoDB and verify token
 *
 * @param dynamoClient - DynamoDB document client
 * @param tableName - Jobs table name
 * @param jobId - Job ID
 * @param token - Token to verify
 * @returns Result with job, isValid, and isExpired flags
 */
export async function getJobAndVerifyToken(dynamoClient, // DynamoDBDocumentClient
tableName, jobId, token) {
    // GetItem from DynamoDB
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const result = await dynamoClient.send(new GetCommand({
        TableName: tableName,
        Key: { job_id: jobId },
    }));
    if (!result.Item) {
        return {
            job: null,
            isValid: false,
            isExpired: false,
        };
    }
    const job = result.Item;
    const now = Math.floor(Date.now() / 1000);
    const isExpired = job.expires_at <= now;
    // Verify token (even if expired, for consistent error handling)
    const isValid = verifyJobTokenHash(token, job.job_read_token_hash);
    return {
        job,
        isValid,
        isExpired,
    };
}
//# sourceMappingURL=token-verifier.js.map