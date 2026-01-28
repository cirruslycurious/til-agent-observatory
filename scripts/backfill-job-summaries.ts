#!/usr/bin/env ts-node
/**
 * Backfill Job Summaries Script
 *
 * Generates job summaries for all existing jobs in til-jobs table.
 * Run once after deploying til-job-summaries table and job-summary-generator Lambda.
 *
 * Usage:
 *   npm run backfill-summaries
 *   or
 *   ./scripts/backfill-job-summaries.ts --profile YOUR_PROFILE --region us-east-1 --limit 100
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';

const JOBS_TABLE = 'til-jobs';
const SUMMARY_GENERATOR_LAMBDA = 'til-job-summary-generator';

// Parse command line args
const args = process.argv.slice(2);
const profileIndex = args.indexOf('--profile');
const profile = profileIndex >= 0 ? args[profileIndex + 1] : process.env.AWS_PROFILE || 'default';
const regionIndex = args.indexOf('--region');
const region = regionIndex >= 0 ? args[regionIndex + 1] : process.env.AWS_REGION || 'us-east-1';
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : undefined;

console.log(`Backfill Job Summaries`);
console.log(`  Profile: ${profile}`);
console.log(`  Region: ${region}`);
console.log(`  Limit: ${limit || 'unlimited'}\n`);

const credentials = fromIni({ profile });

const dynamoClient = new DynamoDBClient({
  region,
  credentials,
});

const lambdaClient = new LambdaClient({
  region,
  credentials,
});

async function main() {
  console.log(`Scanning ${JOBS_TABLE} for jobs...`);

  // Paginate through all jobs (DynamoDB Scan returns max 1MB per page)
  const jobs: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  let totalScanned = 0;

  do {
    const scanParams: any = {
      TableName: JOBS_TABLE,
    };

    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    if (limit && jobs.length + 1 >= limit) {
      scanParams.Limit = limit - jobs.length;
    }

    const scanCommand = new ScanCommand(scanParams);
    const response = await dynamoClient.send(scanCommand);
    const pageItems = (response.Items || []).map((item: any) => unmarshall(item));
    jobs.push(...pageItems);
    totalScanned += response.ScannedCount || 0;
    lastEvaluatedKey = response.LastEvaluatedKey;

    if (pageItems.length > 0) {
      process.stdout.write(`\rScanned ${totalScanned} items, found ${jobs.length} jobs so far...`);
    }
  } while (lastEvaluatedKey && (!limit || jobs.length < limit));

  console.log(`\nFound ${jobs.length} jobs total\n`);

  if (jobs.length === 0) {
    console.log('No jobs to backfill. Exiting.');
    return;
  }

  console.log(`Generating summaries...`);
  let successCount = 0;
  let errorCount = 0;

  for (const job of jobs) {
    const jobId = job.job_id;
    const status = job.status || 'completed';

    try {
      // Invoke job summary generator Lambda
      const invokeCommand = new InvokeCommand({
        FunctionName: SUMMARY_GENERATOR_LAMBDA,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
          'detail-type': 'Job Completed',
          detail: {
            job_id: jobId,
            status: status,
          },
        }),
      });

      const result = await lambdaClient.send(invokeCommand);

      if (result.StatusCode === 200) {
        successCount++;
        process.stdout.write(`[OK] ${jobId} (${successCount}/${jobs.length})\r`);
      } else {
        errorCount++;
        console.log(`\n[ERROR] ${jobId}: Lambda returned status ${result.StatusCode}`);
      }

    } catch (error) {
      errorCount++;
      console.log(`\n[ERROR] ${jobId}: ${error}`);
    }

    // Rate limit: 5 invocations per second
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n\nBackfill complete!`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Total: ${jobs.length}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
