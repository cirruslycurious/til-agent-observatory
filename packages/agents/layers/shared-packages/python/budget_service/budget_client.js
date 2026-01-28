/**
 * Budget Service (TypeScript)
 * Story 4.1: Per-Job Budget Tracking
 *
 * Mirror from Python (budget_client.py) - keep in sync via tests
 * Source of truth: budget_client.py
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
const dynamoClient = new DynamoDBClient({});
// Configure DocumentClient to remove undefined values (DynamoDB doesn't allow undefined)
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});
const JOB_BUDGETS_TABLE_NAME = process.env.JOB_BUDGETS_TABLE_NAME || 'til-job-budgets';
// Budget thresholds (in cents to avoid float precision issues)
const MINIMAL_MODE_THRESHOLD_CENTS = 500; // $5.00 threshold (500 cents)
const COST_WARNING_THRESHOLD_CENTS = 200; // $2.00 threshold (200 cents, non-blocking)
// Default limits
const DEFAULT_WEB_SEARCH_LIMIT = 10; // Normal mode: 10 web searches per job
const MINIMAL_WEB_SEARCH_LIMIT = 2; // Minimal mode: 2 web searches per job
export class BudgetError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BudgetError';
    }
}
/**
 * Initialize budget tracking for a new job.
 *
 * Creates job_budgets entry atomically (ConditionExpression: attribute_not_exists(job_id)).
 * Idempotent: If budget already exists, returns existing budget.
 */
export async function initializeJobBudget(jobId) {
    const now = new Date().toISOString();
    const budgetItem = {
        job_id: jobId,
        web_search_count: 0,
        web_search_limit: DEFAULT_WEB_SEARCH_LIMIT,
        estimated_cost_cents: 0,
        minimal_mode_activated: false,
        tokens_used: 0,
        created_at: now,
        updated_at: now,
        job_created_at: now, // Store job creation date for daily cost attribution
        // Note: last_cost_event_at and last_cost_event_id are optional and not set on initialization
    };
    // Remove undefined values (DynamoDB doesn't allow undefined)
    Object.keys(budgetItem).forEach(key => {
        if (budgetItem[key] === undefined) {
            delete budgetItem[key];
        }
    });
    try {
        // Atomic creation with ConditionExpression to prevent duplicates
        await docClient.send(new PutCommand({
            TableName: JOB_BUDGETS_TABLE_NAME,
            Item: budgetItem,
            ConditionExpression: 'attribute_not_exists(job_id)',
        }));
        // Return budget state (computed fields)
        return {
            ...budgetItem,
            estimated_cost_usd: 0,
            searches_remaining: DEFAULT_WEB_SEARCH_LIMIT,
            minimal_mode_activated_at: undefined,
        };
    }
    catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            // Budget already exists - return existing (idempotent behavior)
            return getJobBudget(jobId);
        }
        else {
            throw new BudgetError(`Failed to initialize budget for job ${jobId}: ${error.message}`);
        }
    }
}
/**
 * Retrieve current budget state for a job.
 */
export async function getJobBudget(jobId) {
    try {
        const response = await docClient.send(new GetCommand({
            TableName: JOB_BUDGETS_TABLE_NAME,
            Key: { job_id: jobId },
        }));
        if (!response.Item) {
            return null;
        }
        const item = response.Item;
        const web_search_limit = item.web_search_limit || DEFAULT_WEB_SEARCH_LIMIT;
        const web_search_count = item.web_search_count || 0;
        const searches_remaining = Math.max(0, web_search_limit - web_search_count);
        const estimated_cost_cents = item.estimated_cost_cents || 0;
        return {
            job_id: item.job_id,
            web_search_count,
            web_search_limit,
            estimated_cost_cents,
            estimated_cost_usd: estimated_cost_cents / 100.0, // Computed at API boundary
            minimal_mode_activated: item.minimal_mode_activated || false,
            minimal_mode_activated_at: item.minimal_mode_activated_at,
            tokens_used: item.tokens_used || 0,
            searches_remaining,
            created_at: item.created_at,
            updated_at: item.updated_at,
            last_cost_event_at: item.last_cost_event_at,
            last_cost_event_id: item.last_cost_event_id,
            job_created_at: item.job_created_at,
        };
    }
    catch (error) {
        throw new BudgetError(`Failed to get budget for job ${jobId}: ${error.message}`);
    }
}
//# sourceMappingURL=budget_client.js.map