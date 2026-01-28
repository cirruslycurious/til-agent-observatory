/**
 * 🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨
 * 
 * MANDATORY PRE-MODIFICATION CHECKLIST:
 * 1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
 * 2. Read .ai-checklists/pre-deployment.md COMPLETELY
 * 3. Read ALL inline comments in THIS file
 * 4. Run `git diff` before deploying to see what's changing
 * 
 * CRITICAL: This stack deploys API handler Lambdas and integrates with API Gateway.
 * - API Lambda (main API routes)
 * - Dashboard V2 Lambda (dashboard endpoints - separate due to 20KB policy limit)
 * - Abstract Search Lambda (FTS5 search)
 * - Job Summary Generator Lambda (EventBridge triggered)
 * 
 * DEPENDENCIES: Must deploy AFTER TilWorkflowStack (for state machine ARN reference)
 * TEST AFTER: curl https://your-domain.example.com/api/v1/dashboard/v2/executive | jq .
 * 
 * 🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THE API 🚨🚨🚨
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { ApiStack } from './api-stack';
import * as path from 'path';
import * as lambdaPython from 'aws-cdk-lib/aws-lambda';

export interface ComputeStackProps extends cdk.StackProps {
  dataStack: DataStack;
  apiStack: ApiStack;
}

export class ComputeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Shared Lambda configuration
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        JOBS_TABLE_NAME: props.dataStack.jobsTable.tableName,
        ARTIFACTS_TABLE_NAME: props.dataStack.artifactsTable.tableName,
        GENERATION_METRICS_TABLE_NAME: props.dataStack.generationMetricsTable.tableName,
        DECISION_EVENTS_BY_JOB_TABLE_NAME: props.dataStack.decisionEventsByJobTable.tableName,
        DECISION_EVENT_IDS_TABLE_NAME: props.dataStack.decisionEventIdsTable.tableName,
        JOB_BUDGETS_TABLE_NAME: props.dataStack.jobBudgetsTable.tableName,
        WEB_SEARCH_GUARDRAILS_TABLE_NAME: props.dataStack.webSearchGuardrailsTable.tableName,
        FEEDBACK_TABLE_NAME: props.dataStack.feedbackTable.tableName, // Sprint 7
        JOB_SUMMARIES_TABLE_NAME: props.dataStack.jobSummariesTable.tableName, // Dashboard optimization
        ARTIFACTS_BUCKET_NAME: props.dataStack.artifactsBucket.bucketName,
        SYSTEM_ENABLED_PARAMETER: '/conference-abstract/system-enabled',
        KILL_SWITCH_TIMEOUT_MS: '400',
        SERVER_SECRET: process.env.SERVER_SECRET || '', // Required: set SERVER_SECRET environment variable
        // Step Functions state machine ARN (imported from WorkflowStack export)
        // Uses Fn::ImportValue to reference cross-stack export
        STATE_MACHINE_ARN: cdk.Fn.importValue('TilWorkflowStateMachineArn'),
        // Note: AWS_REGION is automatically set by Lambda runtime, don't set it manually
      },
    };

    // API Lambda function (handles all API routes)
    // Resolve path relative to project root (not CDK directory)
    // __dirname is infrastructure/cdk/stacks, so go up 3 levels to project root
    const projectRoot = path.resolve(__dirname, '../../..');
    const apiPackageRoot = path.join(projectRoot, 'packages/api');
    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      ...lambdaConfig,
      entry: path.join(apiPackageRoot, 'src/lambda-handler.ts'),
      functionName: 'til-api-handler',
      description: 'API Gateway handler for all REST API endpoints',
      // Use project root for workspace support (npm workspaces use root package-lock.json)
      projectRoot: projectRoot,
      depsLockFilePath: path.join(projectRoot, 'package-lock.json'),
      // Bundling configuration
      // Try local bundling first (esbuild), fall back to Docker if needed
      // If Docker is not available, CDK will use local esbuild
            bundling: {
              // Don't force Docker - allow local bundling if Docker unavailable
              // forceDockerBundling: true, // Uncomment to force Docker bundling
              // Don't specify nodeModules - let bundler auto-detect from package.json
              // This avoids lock file sync issues in workspaces
              externalModules: ['aws-sdk'], // AWS SDK v2 is available in Lambda runtime
            },
    });

    // Grant DynamoDB permissions
    props.dataStack.jobsTable.grantReadWriteData(apiLambda);
    props.dataStack.artifactsTable.grantReadWriteData(apiLambda);
    props.dataStack.generationMetricsTable.grantReadWriteData(apiLambda);
    props.dataStack.decisionEventsByJobTable.grantReadWriteData(apiLambda);
    props.dataStack.decisionEventIdsTable.grantReadWriteData(apiLambda);
    props.dataStack.jobBudgetsTable.grantReadWriteData(apiLambda);
    props.dataStack.webSearchGuardrailsTable.grantReadWriteData(apiLambda);
    props.dataStack.feedbackTable.grantReadWriteData(apiLambda); // Sprint 7
    props.dataStack.jobSummariesTable.grantReadData(apiLambda); // Dashboard optimization

    // Grant S3 permissions
    props.dataStack.artifactsBucket.grantReadWrite(apiLambda);

    // Grant Parameter Store permissions (for kill switch and API keys)
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/conference-abstract/*`,
      ],
    }));

    // Grant Step Functions permissions (for starting workflow executions and phase projection)
    // Note: State machine ARN will be passed via environment variable from WorkflowStack
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:StartExecution',
        'states:DescribeExecution', // Sprint 7: For phase projection
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:stateMachine:til-workflow`,
        `arn:aws:states:${this.region}:${this.account}:execution:til-workflow:*`, // Execution ARN pattern
      ],
    }));

    // API Gateway integration
    const apiIntegration = new apigateway.LambdaIntegration(apiLambda, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    // ========================================================================
    // Dashboard V2 Lambda (Research Analytics - Separate for Policy Size)
    // ========================================================================
    // Separate Lambda for Dashboard V2 endpoints to avoid policy size limits
    // Main API Lambda hit 20 KB policy limit with 31 routes total
    const dashboardV2Lambda = new NodejsFunction(this, 'DashboardV2Lambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(apiPackageRoot, 'src/dashboard-v2-handler.ts'),
      functionName: 'til-dashboard-v2-handler',
      description: 'Dashboard V2 research analytics endpoints (10x faster)',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512, // Higher memory for analytics queries
      environment: {
        JOB_SUMMARIES_TABLE_NAME: props.dataStack.jobSummariesTable.tableName,
        ARTIFACTS_TABLE_NAME: props.dataStack.artifactsTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk'], // AWS SDK v2 is available in Lambda runtime
      },
    });

    // Grant minimal permissions - read access to job summaries and artifacts tables
    props.dataStack.jobSummariesTable.grantReadData(dashboardV2Lambda);
    props.dataStack.artifactsTable.grantReadData(dashboardV2Lambda);

    // Dashboard V2 API Gateway integration
    const dashboardV2Integration = new apigateway.LambdaIntegration(dashboardV2Lambda, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    // Abstract Search Lambda (Python) - SQLite FTS index served via API Gateway
    const searchLambda = new lambdaPython.Function(this, 'AbstractSearchLambda', {
      runtime: lambdaPython.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambdaPython.Code.fromAsset(path.join(projectRoot, 'packages/agents/search')),
      functionName: 'til-abstract-search',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      description: 'Keyword search over conference abstracts via SQLite FTS',
      environment: {
        ARTIFACTS_BUCKET_NAME: props.dataStack.artifactsBucket.bucketName,
        INDEX_S3_KEY: 'indexes/abstracts.sqlite',
      },
    });
    props.dataStack.artifactsBucket.grantRead(searchLambda);

    const searchIntegration = new apigateway.LambdaIntegration(searchLambda);

    // API routes
    const api = props.apiStack.restApi;

    // Create base API path once: /api/v1
    const apiV1Resource = api.root.addResource('api').addResource('v1');

    // System endpoints: /api/v1/system/status
    const systemResource = apiV1Resource.addResource('system');
    systemResource.addResource('status').addMethod('GET', apiIntegration);

    // Jobs endpoints: /api/v1/jobs
    const jobsResource = apiV1Resource.addResource('jobs');
    jobsResource.addMethod('GET', apiIntegration); // List jobs
    jobsResource.addMethod('POST', apiIntegration); // Create job
    
    // Job status: /api/v1/jobs/{job_id}/status
    const jobResource = jobsResource.addResource('{job_id}');
    jobResource.addResource('status').addMethod('GET', apiIntegration);
    
    // Sprint 7: Result endpoint: /api/v1/jobs/{job_id}/result
    jobResource.addResource('result').addMethod('GET', apiIntegration);
    
    // Sprint 7: Feedback endpoint: /api/v1/jobs/{job_id}/feedback
    jobResource.addResource('feedback').addMethod('POST', apiIntegration);

    // Workflow endpoints: /api/v1/workflow/{job_id}
    const workflowResource = apiV1Resource.addResource('workflow');
    const workflowJobResource = workflowResource.addResource('{job_id}');
    
    // Artifacts: /api/v1/workflow/{job_id}/artifacts
    const artifactsResource = workflowJobResource.addResource('artifacts');
    artifactsResource.addMethod('GET', apiIntegration);
    artifactsResource.addResource('{task_id}').addMethod('GET', apiIntegration);
    artifactsResource.addResource('dependencies').addMethod('GET', apiIntegration);
    
    // Budget: /api/v1/workflow/{job_id}/budget
    workflowJobResource.addResource('budget').addMethod('GET', apiIntegration);
    
    // Events: /api/v1/workflow/{job_id}/events
    workflowJobResource.addResource('events').addMethod('GET', apiIntegration);
    
    // Iterations: /api/v1/workflow/{job_id}/iterations
    workflowJobResource.addResource('iterations').addMethod('GET', apiIntegration);
    
    // Tools: /api/v1/workflow/{job_id}/tools
    const toolsResource = workflowJobResource.addResource('tools');
    toolsResource.addMethod('GET', apiIntegration);
    toolsResource.addResource('sequences').addMethod('GET', apiIntegration);
    toolsResource.addResource('effectiveness').addMethod('GET', apiIntegration);

    // Abstract search endpoint: /api/v1/search-abstracts (POST)
    apiV1Resource.addResource('search-abstracts').addMethod('POST', searchIntegration);

    // Dashboard V1 endpoints: /api/v1/dashboard/* (Legacy)
    // Handled by main API Lambda (apiIntegration)
    const dashboardResource = apiV1Resource.addResource('dashboard');
    dashboardResource.addResource('overview').addMethod('GET', apiIntegration);
    dashboardResource.addResource('agentic').addMethod('GET', apiIntegration);
    dashboardResource.addResource('vendors').addMethod('GET', apiIntegration);
    dashboardResource.addResource('tools').addMethod('GET', apiIntegration);
    dashboardResource.addResource('evaluator').addMethod('GET', apiIntegration);
    dashboardResource.addResource('system').addMethod('GET', apiIntegration);

    // Dashboard V2 endpoints: /api/v1/dashboard/v2/* (Research Analytics)
    // Handled by separate Dashboard V2 Lambda (dashboardV2Integration)
    // Separated to avoid Lambda policy size limits (20 KB AWS limit)
    const dashboardV2Resource = dashboardResource.addResource('v2');
    dashboardV2Resource.addResource('executive').addMethod('GET', dashboardV2Integration);
    const vendorsResource = dashboardV2Resource.addResource('vendors');
    vendorsResource.addResource('manager').addMethod('GET', dashboardV2Integration);
    vendorsResource.addResource('worker').addMethod('GET', dashboardV2Integration);
    dashboardV2Resource.addResource('context').addMethod('GET', dashboardV2Integration);
    dashboardV2Resource.addResource('evaluator').addMethod('GET', dashboardV2Integration);
    const dashboardToolsResource = dashboardV2Resource.addResource('tools');
    dashboardToolsResource.addMethod('GET', dashboardV2Integration); // Legacy tool effectiveness
    dashboardToolsResource.addResource('behavior').addMethod('GET', dashboardV2Integration); // NEW: Agent cognitive behavior
    dashboardV2Resource.addResource('speed').addMethod('GET', dashboardV2Integration);
    // Top Abstracts endpoint: Returns top 10 abstracts by score with filters
    // NOTE: Route created manually via AWS CLI (resource ID: p1zl2j)
    // TODO: Import existing resource into CDK to avoid conflicts
    // dashboardV2Resource.addResource('top-abstracts').addMethod('GET', dashboardV2Integration);

    // ========================================================================
    // Job Summary Generator Lambda (Dashboard Performance Optimization)
    // ========================================================================
    // Generates pre-aggregated job summaries for 10x dashboard query speedup
    // Triggered by: EventBridge rule on job completion
    // Reads from: til-jobs, til-decision-events-by-job, til-generation-metrics
    // Writes to: til-job-summaries
    const jobSummaryGeneratorLambda = new lambda.Function(this, 'JobSummaryGeneratorLambda', {
      functionName: 'til-job-summary-generator',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(projectRoot, 'packages/agents/job-summary-generator')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Generates pre-aggregated job summaries for dashboard performance',
      environment: {
        JOBS_TABLE_NAME: props.dataStack.jobsTable.tableName,
        DECISION_EVENTS_BY_JOB_TABLE_NAME: props.dataStack.decisionEventsByJobTable.tableName,
        GENERATION_METRICS_TABLE_NAME: props.dataStack.generationMetricsTable.tableName,
        JOB_SUMMARIES_TABLE_NAME: props.dataStack.jobSummariesTable.tableName,
        ARTIFACTS_TABLE_NAME: props.dataStack.artifactsTable.tableName,  // CRITICAL: Needed to read tool data from artifacts
        JOB_BUDGETS_TABLE_NAME: props.dataStack.jobBudgetsTable.tableName,  // CRITICAL: Needed to read cost data
      },
    });

    // Grant permissions
    props.dataStack.jobsTable.grantReadData(jobSummaryGeneratorLambda);
    props.dataStack.decisionEventsByJobTable.grantReadData(jobSummaryGeneratorLambda);
    props.dataStack.generationMetricsTable.grantReadData(jobSummaryGeneratorLambda);
    props.dataStack.jobSummariesTable.grantWriteData(jobSummaryGeneratorLambda);
    props.dataStack.artifactsTable.grantReadData(jobSummaryGeneratorLambda);  // CRITICAL: Read artifacts for tool data
    props.dataStack.jobBudgetsTable.grantReadData(jobSummaryGeneratorLambda);  // CRITICAL: Read budget for cost data

    // EventBridge rule: Trigger on job completion
    // Matches: Job status updates to 'completed', 'failed', or 'aborted'
    // Source: til-jobs table (via Step Functions completion or manual update)
    const jobCompletionRule = new events.Rule(this, 'JobCompletionRule', {
      ruleName: 'til-job-completion-summary-trigger',
      description: 'Triggers job summary generator when job completes',
      eventPattern: {
        source: ['til.workflow'],
        detailType: ['Job Completed', 'Job Failed', 'Job Aborted'],
      },
    });

    // Add Lambda as target
    jobCompletionRule.addTarget(new targets.LambdaFunction(jobSummaryGeneratorLambda));
  }
}
