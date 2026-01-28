/**
 * 🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨
 * 
 * MANDATORY PRE-MODIFICATION CHECKLIST:
 * 1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
 * 2. Read .ai-checklists/pre-deployment.md COMPLETELY
 * 3. Read ALL inline comments in THIS file
 * 4. Run `git diff` before deploying to see what's changing
 * 5. Check Lambda layer build: ./scripts/bundle-lambda-layers.sh (MUST use Docker!)
 * 
 * CRITICAL: This stack deploys Step Functions workflow and ALL agent Lambdas.
 * - Manager Lambda (evaluates using NOVA dual-assessor scoring)
 * - Worker Lambda (agentic tool loop)
 * - Evaluator Lambda (blind conference prediction)
 * - Nova Assessor Lambdas (Primary + Secondary)
 * - Lambda Layers (Python deps + shared packages)
 * 
 * DEPLOYMENT: Requires layers to be built with Docker first!
 * TEST AFTER: Run a test job and check CloudWatch logs
 * 
 * 🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THE WORKFLOW 🚨🚨🚨
 */

import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import * as path from 'path';
import * as fs from 'fs';

export interface WorkflowStackProps extends cdk.StackProps {
  dataStack: DataStack;
}

export class WorkflowStack extends cdk.Stack {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: WorkflowStackProps) {
    super(scope, id, props);

    const projectRoot = path.resolve(__dirname, '../../..');

    // Create Lambda Layers for dependencies and shared packages
    // Layer 1: Python dependencies (boto3, openai, anthropic, etc.)
    const pythonDepsLayerPath = path.join(projectRoot, 'packages/agents/layers/python-dependencies');
    const pythonDepsLayer = fs.existsSync(pythonDepsLayerPath)
      ? new lambda.LayerVersion(this, 'PythonDependenciesLayer', {
          code: lambda.Code.fromAsset(pythonDepsLayerPath),
          compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
          description: 'Python dependencies for Manager and Worker Lambda functions',
        })
      : undefined;

    // Layer 2: Shared packages (decision_events, budget_service, llm_client, etc.)
    const sharedPackagesLayerPath = path.join(projectRoot, 'packages/agents/layers/shared-packages');
    const sharedPackagesLayer = fs.existsSync(sharedPackagesLayerPath)
      ? new lambda.LayerVersion(this, 'SharedPackagesLayer', {
          code: lambda.Code.fromAsset(sharedPackagesLayerPath),
          compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
          description: 'Shared packages for Manager and Worker Lambda functions (v2.1 - schema fix)',
        })
      : undefined;

    // Manager Lambda function
    // Only include the Lambda function code (no dependencies)
    const managerLambda = new lambda.Function(this, 'ManagerLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(projectRoot, 'packages/agents/manager')),
      layers: [pythonDepsLayer, sharedPackagesLayer].filter(Boolean) as lambda.ILayerVersion[],
      functionName: 'til-manager-agent',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        JOBS_TABLE_NAME: props.dataStack.jobsTable.tableName,
        ARTIFACTS_TABLE_NAME: props.dataStack.artifactsTable.tableName,
        DECISION_EVENTS_BY_JOB_TABLE_NAME: props.dataStack.decisionEventsByJobTable.tableName,
        DECISION_EVENT_IDS_TABLE_NAME: props.dataStack.decisionEventIdsTable.tableName,
        JOB_BUDGETS_TABLE_NAME: props.dataStack.jobBudgetsTable.tableName,
        CONFERENCE_DATA_TABLE_NAME: props.dataStack.conferenceDataTable.tableName,
        ARTIFACTS_BUCKET_NAME: props.dataStack.artifactsBucket.bucketName,
        // Note: AWS_REGION is automatically set by Lambda runtime, don't set it manually
        SSM_PARAMETER_PREFIX: '/conference-abstract/dev',
        // Nova Scoring System (Feature Flag)
        USE_NOVA_SCORING: 'true', // ENABLED - Dual Nova scoring system active
        NOVA_ASSESSOR_PRIMARY_FUNCTION: 'til-assess-abstract-primary',
        NOVA_ASSESSOR_SECONDARY_FUNCTION: 'til-assess-abstract-secondary',
        NOVA_ACCEPTANCE_THRESHOLD: '7.901',  // Optimized for 75-80% success rate with 3 iterations
      },
    });

    // Worker Lambda function
    // Only include the Lambda function code (no dependencies)
    // Timeout: 5 minutes for agentic tool loop (multiple LLM calls + tool executions)
    const workerLambda = new lambda.Function(this, 'WorkerLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(projectRoot, 'packages/agents/worker')),
      layers: [pythonDepsLayer, sharedPackagesLayer].filter(Boolean) as lambda.ILayerVersion[],
      functionName: 'til-worker-agent',
      timeout: cdk.Duration.minutes(5),  // 5 minutes for agentic loop
      memorySize: 1024,  // Increased for better performance
      environment: {
        JOBS_TABLE_NAME: props.dataStack.jobsTable.tableName,
        ARTIFACTS_TABLE_NAME: props.dataStack.artifactsTable.tableName,
        DECISION_EVENTS_BY_JOB_TABLE_NAME: props.dataStack.decisionEventsByJobTable.tableName,
        DECISION_EVENT_IDS_TABLE_NAME: props.dataStack.decisionEventIdsTable.tableName,
        JOB_BUDGETS_TABLE_NAME: props.dataStack.jobBudgetsTable.tableName,
        WEB_SEARCH_GUARDRAILS_TABLE_NAME: props.dataStack.webSearchGuardrailsTable.tableName,
        CONFERENCE_DATA_TABLE_NAME: props.dataStack.conferenceDataTable.tableName,
        ARTIFACTS_BUCKET_NAME: props.dataStack.artifactsBucket.bucketName,
        // Search abstracts API URL - set via environment variable or CDK context
        SEARCH_ABSTRACTS_API_URL: process.env.SEARCH_ABSTRACTS_API_URL
          || this.node.tryGetContext('searchAbstractsApiUrl')
          || 'https://API_GATEWAY_ID.execute-api.us-east-1.amazonaws.com/prod/api/v1/search-abstracts', // Placeholder
        // Note: AWS_REGION is automatically set by Lambda runtime, don't set it manually
        SSM_PARAMETER_PREFIX: '/conference-abstract/dev',
      },
    });

    // Grant conference data table permissions
    props.dataStack.conferenceDataTable.grantReadData(workerLambda);

    // ============================================
    // Evaluator Infrastructure (SNS, SQS, Lambda)
    // ============================================

    // Dead-letter queue for failed evaluator messages
    const evaluatorDlq = new sqs.Queue(this, 'EvaluatorDLQ', {
      queueName: 'til-evaluator-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Evaluator SQS queue
    const evaluatorQueue = new sqs.Queue(this, 'EvaluatorQueue', {
      queueName: 'til-evaluator-queue',
      visibilityTimeout: cdk.Duration.minutes(2), // > Lambda timeout
      deadLetterQueue: {
        queue: evaluatorDlq,
        maxReceiveCount: 3,
      },
    });

    // Evaluator SNS topic
    const evaluatorTopic = new sns.Topic(this, 'EvaluatorTopic', {
      topicName: 'til-evaluator-requests',
      displayName: 'Evaluator Request Topic',
    });

    // Subscribe SQS queue to SNS topic
    evaluatorTopic.addSubscription(new subscriptions.SqsSubscription(evaluatorQueue));

    // Evaluator Lambda function
    const evaluatorLambda = new lambda.Function(this, 'EvaluatorLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(projectRoot, 'packages/agents/evaluator')),
      layers: [pythonDepsLayer, sharedPackagesLayer].filter(Boolean) as lambda.ILayerVersion[],
      functionName: 'til-evaluator-agent',
      timeout: cdk.Duration.minutes(1), // 1 minute timeout
      memorySize: 512,
      environment: {
        GENERATION_METRICS_TABLE_NAME: props.dataStack.generationMetricsTable.tableName,
        DECISION_EVENTS_BY_JOB_TABLE_NAME: props.dataStack.decisionEventsByJobTable.tableName,
        DECISION_EVENT_IDS_TABLE_NAME: props.dataStack.decisionEventIdsTable.tableName,
        EVALUATOR_MODEL: 'amazon.nova-pro-v1:0',
        SSM_PARAMETER_PREFIX: '/conference-abstract/dev',
      },
    });

    // Evaluator Lambda triggered by SQS
    evaluatorLambda.addEventSource(new lambdaEventSources.SqsEventSource(evaluatorQueue, {
      batchSize: 1, // Process one message at a time
    }));

    // Grant Evaluator permissions
    props.dataStack.generationMetricsTable.grantReadWriteData(evaluatorLambda);
    props.dataStack.decisionEventsByJobTable.grantReadWriteData(evaluatorLambda);
    props.dataStack.decisionEventIdsTable.grantReadWriteData(evaluatorLambda);

    // Grant Bedrock permissions for Amazon Nova
    evaluatorLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'], // Bedrock doesn't support resource-level permissions yet
    }));

    // Grant Parameter Store permissions to Evaluator (if needed for other keys)
    evaluatorLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/conference-abstract/*`],
    }));

    // Export Evaluator SNS topic ARN for use in Step Functions
    new cdk.CfnOutput(this, 'EvaluatorTopicArn', {
      value: evaluatorTopic.topicArn,
      exportName: 'TilEvaluatorTopicArn',
    });

    // ============================================
    // Nova Assessor Lambdas (Dual Scoring System)
    // ============================================

    // Primary Nova Assessor Lambda
    const assessorPrimaryLambda = new lambda.Function(this, 'AssessorPrimaryLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(projectRoot, 'packages/agents/assess-abstract-primary')),
      functionName: 'til-assess-abstract-primary',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        BEDROCK_MODEL: 'amazon.nova-pro-v1:0',
      },
    });

    // Grant Bedrock permissions to Primary Assessor
    assessorPrimaryLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'], // Bedrock doesn't support resource-level permissions yet
    }));

    // Secondary Nova Assessor Lambda
    const assessorSecondaryLambda = new lambda.Function(this, 'AssessorSecondaryLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(projectRoot, 'packages/agents/assess-abstract-secondary')),
      functionName: 'til-assess-abstract-secondary',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        BEDROCK_MODEL: 'amazon.nova-pro-v1:0',
      },
    });

    // Grant Bedrock permissions to Secondary Assessor
    assessorSecondaryLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'], // Bedrock doesn't support resource-level permissions yet
    }));

    // Grant Manager Lambda permission to invoke assessors
    assessorPrimaryLambda.grantInvoke(managerLambda);
    assessorSecondaryLambda.grantInvoke(managerLambda);

    // Export Assessor ARNs
    new cdk.CfnOutput(this, 'AssessorPrimaryArn', {
      value: assessorPrimaryLambda.functionArn,
      exportName: 'TilAssessorPrimaryArn',
    });
    new cdk.CfnOutput(this, 'AssessorSecondaryArn', {
      value: assessorSecondaryLambda.functionArn,
      exportName: 'TilAssessorSecondaryArn',
    });

    // ============================================
    // Evaluator Step Functions Integration
    // ============================================

    // Send Evaluator request to SNS (blind input - only title and abstract)
    const sendEvaluatorRequest = new sfnTasks.SnsPublish(this, 'SendEvaluatorRequest', {
      topic: evaluatorTopic,
      message: sfn.TaskInput.fromObject({
        'job_id.$': '$.job_id',
        'title.$': '$.worker_result.Payload.title',
        'abstract.$': '$.worker_result.Payload.abstract',
        'execution_id.$': '$$.Execution.Id',
        // NOTE: No conference or topic - evaluator is blind!
      }),
      resultPath: '$.evaluator_sns_result',
    });

    // Wait state before polling
    const waitForEvaluator = new sfn.Wait(this, 'WaitForEvaluatorResponse', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(3)),
    });

    // Poll for Evaluator result in generation_metrics
    const checkEvaluatorResult = new sfnTasks.CallAwsService(this, 'CheckEvaluatorResult', {
      service: 'dynamodb',
      action: 'query',
      parameters: {
        TableName: props.dataStack.generationMetricsTable.tableName,
        KeyConditionExpression: 'job_id = :jid AND begins_with(record_type_timestamp, :prefix)',
        ExpressionAttributeValues: {
          ':jid': { 'S.$': '$.job_id' },
          ':prefix': { 'S': 'evaluator#' },
        },
        ScanIndexForward: false, // Most recent first
        Limit: 1,
      },
      iamResources: [props.dataStack.generationMetricsTable.tableArn],
      resultPath: '$.evaluator_query_result',
    });

    // Initialize poll counter
    const initEvaluatorPoll = new sfn.Pass(this, 'InitEvaluatorPoll', {
      parameters: {
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'iteration.$': '$.iteration',
        'manager_feedback.$': '$.manager_feedback',
        'previous_outputs.$': '$.previous_outputs',
        'previous_artifacts.$': '$.previous_artifacts',
        'manager_goal_result.$': '$.manager_goal_result',
        'worker_result.$': '$.worker_result',
        'evaluator_poll_count': 0,
        'evaluator_sns_result.$': '$.evaluator_sns_result',
      },
      resultPath: '$',
    });

    // Increment poll counter
    const incrementPollCounter = new sfn.Pass(this, 'IncrementEvaluatorPollCounter', {
      parameters: {
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'iteration.$': '$.iteration',
        'manager_feedback.$': '$.manager_feedback',
        'previous_outputs.$': '$.previous_outputs',
        'previous_artifacts.$': '$.previous_artifacts',
        'manager_goal_result.$': '$.manager_goal_result',
        'worker_result.$': '$.worker_result',
        'evaluator_poll_count.$': 'States.MathAdd($.evaluator_poll_count, 1)',
        'evaluator_sns_result.$': '$.evaluator_sns_result',
        'evaluator_query_result.$': '$.evaluator_query_result',
      },
      resultPath: '$',
    });

    // Extract evaluator result when found
    const extractEvaluatorResult = new sfn.Pass(this, 'ExtractEvaluatorResult', {
      parameters: {
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'iteration.$': '$.iteration',
        'manager_feedback.$': '$.manager_feedback',
        'previous_outputs.$': '$.previous_outputs',
        'previous_artifacts.$': '$.previous_artifacts',
        'manager_goal_result.$': '$.manager_goal_result',
        'worker_result.$': '$.worker_result',
        'evaluator_result.$': '$.evaluator_query_result.Items[0]',
      },
      resultPath: '$',
    });

    // Continue without evaluator (timeout or not found)
    // Use empty object {} instead of null to avoid JSONPath issues
    const continueWithoutEvaluator = new sfn.Pass(this, 'ContinueWithoutEvaluator', {
      parameters: {
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'iteration.$': '$.iteration',
        'manager_feedback.$': '$.manager_feedback',
        'previous_outputs.$': '$.previous_outputs',
        'previous_artifacts.$': '$.previous_artifacts',
        'manager_goal_result.$': '$.manager_goal_result',
        'worker_result.$': '$.worker_result',
        'evaluator_result': { 'timeout': true },  // Empty result indicating timeout
        'evaluator_timeout': true,
      },
      resultPath: '$',
    });

    // Build the polling loop
    // First iteration: init -> wait -> query -> check
    // Subsequent iterations: (from check) -> increment -> wait -> query -> check

    // Choice: Check if evaluator result found or max polls reached
    const checkEvaluatorComplete = new sfn.Choice(this, 'CheckEvaluatorComplete')
      // If we got a result (Count > 0)
      .when(
        sfn.Condition.numberGreaterThan('$.evaluator_query_result.Count', 0),
        extractEvaluatorResult
      )
      // If max polls reached (20 polls * 3 seconds = 60 seconds timeout)
      .when(
        sfn.Condition.numberGreaterThanEquals('$.evaluator_poll_count', 20),
        continueWithoutEvaluator
      )
      // Otherwise, keep polling (increment -> wait -> query -> back to check)
      .otherwise(incrementPollCounter);

    // Build the loop: increment -> wait -> query -> check
    incrementPollCounter.next(waitForEvaluator).next(checkEvaluatorResult).next(checkEvaluatorComplete);

    // Initial flow: init -> wait -> query -> check
    // This ensures the first query happens before the first check
    initEvaluatorPoll.next(waitForEvaluator);

    // Grant permissions
    props.dataStack.jobsTable.grantReadWriteData(managerLambda);
    props.dataStack.jobsTable.grantReadWriteData(workerLambda);
    props.dataStack.artifactsTable.grantReadWriteData(managerLambda);
    props.dataStack.artifactsTable.grantReadWriteData(workerLambda);
    props.dataStack.decisionEventsByJobTable.grantReadWriteData(managerLambda);
    props.dataStack.decisionEventsByJobTable.grantReadWriteData(workerLambda);
    props.dataStack.decisionEventIdsTable.grantReadWriteData(managerLambda);
    props.dataStack.decisionEventIdsTable.grantReadWriteData(workerLambda);
    props.dataStack.jobBudgetsTable.grantReadWriteData(managerLambda);
    props.dataStack.jobBudgetsTable.grantReadWriteData(workerLambda);
    props.dataStack.webSearchGuardrailsTable.grantReadWriteData(workerLambda);
    props.dataStack.generationMetricsTable.grantReadWriteData(managerLambda);
    props.dataStack.generationMetricsTable.grantReadWriteData(workerLambda);
    props.dataStack.conferenceDataTable.grantReadData(managerLambda);
    // Worker already has conferenceDataTable.grantReadData from earlier in this file
    props.dataStack.artifactsBucket.grantReadWrite(managerLambda);
    props.dataStack.artifactsBucket.grantReadWrite(workerLambda);

    // Parameter Store permissions
    managerLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/conference-abstract/*`],
    }));
    workerLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/conference-abstract/*`],
    }));

    // Initialize Job state (update job status to "running")
    const initializeJob = new sfnTasks.DynamoUpdateItem(this, 'InitializeJob', {
      table: props.dataStack.jobsTable,
      key: {
        job_id: sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.job_id')),
      },
      updateExpression: 'SET #status = :status, #updated_at = :updated_at',
      expressionAttributeNames: {
        '#status': 'status',
        '#updated_at': 'updated_at',
      },
      expressionAttributeValues: {
        ':status': sfnTasks.DynamoAttributeValue.fromString('running'),
        ':updated_at': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
      },
      resultPath: '$.initialize_result',
    });

    // Error handling: Create fail states for different error types
    const failJobTimeout = this.createFailJobState(props.dataStack.jobsTable, 'timeout');
    const failJobLambdaError = this.createFailJobState(props.dataStack.jobsTable, 'internal_error');

    // Initialize default state values (iteration, feedback, etc.)
    const setInitialValues = new sfn.Pass(this, 'SetInitialValues', {
      parameters: {
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'iteration': 0,
        'manager_feedback': '',
        'previous_outputs': [],
        'previous_artifacts': [],
      },
    });

    // Manager Goal Formulation task
    const managerGoalFormulation = new sfnTasks.LambdaInvoke(this, 'ManagerGoalFormulation', {
      lambdaFunction: managerLambda,
      payload: sfn.TaskInput.fromObject({
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'iteration.$': '$.iteration',
        'action': 'formulate_goal',
        'execution_id.$': '$$.Execution.Id',
        'state_name': 'ManagerGoalFormulation',
      }),
      resultPath: '$.manager_goal_result',
      retryOnServiceExceptions: true,
    });

    // Add error handling to Manager Goal Formulation
    managerGoalFormulation.addCatch(failJobTimeout, {
      errors: ['States.Timeout'],
      resultPath: '$.error',
    });
    managerGoalFormulation.addCatch(failJobLambdaError, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // Worker Execution task
    // Agentic loop: Worker decides which tools to use and when to submit
    const workerExecution = new sfnTasks.LambdaInvoke(this, 'WorkerExecution', {
      lambdaFunction: workerLambda,
      payload: sfn.TaskInput.fromObject({
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'goal.$': '$.manager_goal_result.Payload.goal',
        'iteration.$': '$.iteration',
        'manager_feedback.$': '$.manager_feedback',
        'previous_artifacts.$': '$.previous_artifacts',
        'execution_id.$': '$$.Execution.Id',
        'state_name': 'WorkerExecution',
      }),
      resultPath: '$.worker_result',
      retryOnServiceExceptions: true,
      // Increase task timeout to match Lambda timeout
      taskTimeout: sfn.Timeout.duration(cdk.Duration.minutes(5)),
    });

    // Add error handling to Worker Execution
    workerExecution.addCatch(failJobTimeout, {
      errors: ['States.Timeout'],
      resultPath: '$.error',
    });
    workerExecution.addCatch(failJobLambdaError, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // Manager Evaluation task
    // Receives evaluator_result from polling (or null if timeout)
    const managerEvaluation = new sfnTasks.LambdaInvoke(this, 'ManagerEvaluation', {
      lambdaFunction: managerLambda,
      payload: sfn.TaskInput.fromObject({
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',  // Pass topic for evaluation context
        'iteration.$': '$.iteration',
        'action': 'evaluate_output',
        'worker_output.$': '$.worker_result',
        'previous_outputs.$': '$.previous_outputs',
        'previous_artifacts.$': '$.previous_artifacts',  // BUG FIX: Pass worker artifacts for cumulative tool tracking
        'evaluator_result.$': '$.evaluator_result',  // From Evaluator (may be {} if timeout)
        'execution_id.$': '$$.Execution.Id',
        'state_name': 'ManagerEvaluation',
      }),
      resultPath: '$.manager_evaluation_result',
      retryOnServiceExceptions: true,
    });

    // Add error handling to Manager Evaluation
    managerEvaluation.addCatch(failJobTimeout, {
      errors: ['States.Timeout'],
      resultPath: '$.error',
    });
    managerEvaluation.addCatch(failJobLambdaError, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // Create terminal states (reused in choice branches)
    // Each terminal state: DynamoDB update → EventBridge event → Succeed/Fail
    const completeJob = this.createCompleteJobState(props.dataStack.jobsTable)
      .next(this.createEventBridgePublishTask('Job Completed', 'completed'))
      .next(new sfn.Succeed(this, 'WorkflowSucceeded'));
    
    const completeJobWithCompromises = this.createCompleteJobWithCompromisesState(props.dataStack.jobsTable)
      .next(this.createEventBridgePublishTask('Job Completed', 'completed_with_compromises'))
      .next(new sfn.Succeed(this, 'WorkflowSucceededWithCompromises'));
    
    const failJob = this.createFailJobState(props.dataStack.jobsTable, 'unexpected_state')
      .next(this.createEventBridgePublishTask('Job Failed', 'failed'))
      .next(new sfn.Fail(this, 'WorkflowFailed'));

    // Check Iteration choice state
    const checkIteration = new sfn.Choice(this, 'CheckIteration')
      .when(
        sfn.Condition.stringEquals('$.manager_evaluation_result.Payload.decision', 'accept'),
        completeJob
      )
      .when(
        sfn.Condition.and(
          sfn.Condition.stringEquals('$.manager_evaluation_result.Payload.decision', 'reject'),
          sfn.Condition.numberLessThan('$.iteration', 2) // 0-indexed, so < 2 means < 3 iterations
        ),
        this.createContinueIterationState(managerGoalFormulation)
      )
      .when(
        sfn.Condition.numberEquals('$.iteration', 2), // 3rd iteration (0-indexed), no acceptance
        completeJobWithCompromises
      )
      .otherwise(failJob);

    // Connect evaluator result states to Manager evaluation
    extractEvaluatorResult.next(managerEvaluation);
    continueWithoutEvaluator.next(managerEvaluation);

    // Build state machine with Evaluator integration
    // Flow: Init -> SetDefaults -> Manager Goal -> Worker -> SNS Publish -> Init Poll -> Wait -> Query -> Check -> Manager Eval -> Check Iteration
    // Note: initEvaluatorPoll chains to waitForEvaluator via .next() defined above
    const definition = initializeJob
      .next(setInitialValues)
      .next(managerGoalFormulation)
      .next(workerExecution)
      .next(sendEvaluatorRequest)
      .next(initEvaluatorPoll);
      // initEvaluatorPoll → waitForEvaluator → checkEvaluatorResult → checkEvaluatorComplete
      // checkEvaluatorComplete branches to extractEvaluatorResult or continueWithoutEvaluator, both → managerEvaluation

    // Manager evaluation continues to check iteration
    managerEvaluation.next(checkIteration);

    this.stateMachine = new sfn.StateMachine(this, 'WorkflowStateMachine', {
      stateMachineName: 'til-workflow',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(15), // Max workflow duration
    });

    // Export state machine ARN for use in other stacks
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      exportName: 'TilWorkflowStateMachineArn',
    });
  }

  private createEventBridgePublishTask(detailType: string, status: string): sfnTasks.EventBridgePutEvents {
    /**
     * Publishes EventBridge event to trigger job summary generator Lambda.
     * Event format matches what til-job-summary-generator expects:
     * {
     *   "detail-type": "Job Completed" | "Job Failed" | "Job Aborted",
     *   "detail": {
     *     "job_id": "uuid",
     *     "status": "completed" | "failed" | "completed_with_compromises"
     *   }
     * }
     */
    const constructId = `PublishEvent_${detailType.replace(/\s+/g, '')}_${status}`;
    return new sfnTasks.EventBridgePutEvents(this, constructId, {
      entries: [{
        source: 'til.workflow',
        detailType: detailType,
        detail: sfn.TaskInput.fromObject({
          job_id: sfn.JsonPath.stringAt('$.job_id'),
          status: status,
        }),
      }],
      resultPath: sfn.JsonPath.DISCARD, // Discard result, keep original state
    });
  }

  private createCompleteJobState(jobsTable: dynamodb.ITable): sfnTasks.DynamoUpdateItem {
    return new sfnTasks.DynamoUpdateItem(this, 'CompleteJob', {
      table: jobsTable,
      key: {
        job_id: sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.job_id')),
      },
      updateExpression: 'SET #status = :status, #completed_at = :completed_at, #updated_at = :updated_at, #final_title = :final_title, #final_abstract = :final_abstract, #selected_iteration = :selected_iteration, #evaluator_prediction = :evaluator_prediction, #evaluator_confidence = :evaluator_confidence',
      expressionAttributeNames: {
        '#status': 'status',
        '#completed_at': 'completed_at',
        '#updated_at': 'updated_at',
        '#final_title': 'final_title',
        '#final_abstract': 'final_abstract',
        '#selected_iteration': 'selected_iteration',
        '#evaluator_prediction': 'evaluator_prediction',
        '#evaluator_confidence': 'evaluator_confidence',
      },
      expressionAttributeValues: {
        ':status': sfnTasks.DynamoAttributeValue.fromString('completed'),
        ':completed_at': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        ':updated_at': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        ':final_title': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.worker_result.Payload.title')),
        ':final_abstract': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.worker_result.Payload.abstract')),
        ':selected_iteration': sfnTasks.DynamoAttributeValue.numberFromString(sfn.JsonPath.stringAt('States.Format(\'{}\', $.manager_evaluation_result.Payload.selected_iteration)')),
        ':evaluator_prediction': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('States.Format(\'{}\', $.manager_evaluation_result.Payload.evaluator_prediction)')),
        ':evaluator_confidence': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('States.Format(\'{}\', $.manager_evaluation_result.Payload.evaluator_confidence)')),
      },
      resultPath: '$.dynamodb_result', // Preserve original state for EventBridge
    });
  }

  private createCompleteJobWithCompromisesState(jobsTable: dynamodb.ITable): sfnTasks.DynamoUpdateItem {
    // Note: This state may not be reached often since Manager now handles partial success internally
    // and returns decision='accept' with is_compromise=true. Kept for backward compatibility.
    return new sfnTasks.DynamoUpdateItem(this, 'CompleteJobWithCompromises', {
      table: jobsTable,
      key: {
        job_id: sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.job_id')),
      },
      updateExpression: 'SET #status = :status, #completed_at = :completed_at, #failure_reason = :failure_reason, #updated_at = :updated_at, #final_title = :final_title, #final_abstract = :final_abstract, #selected_iteration = :selected_iteration, #evaluator_prediction = :evaluator_prediction, #evaluator_confidence = :evaluator_confidence',
      expressionAttributeNames: {
        '#status': 'status',
        '#completed_at': 'completed_at',
        '#failure_reason': 'failure_reason',
        '#updated_at': 'updated_at',
        '#final_title': 'final_title',
        '#final_abstract': 'final_abstract',
        '#selected_iteration': 'selected_iteration',
        '#evaluator_prediction': 'evaluator_prediction',
        '#evaluator_confidence': 'evaluator_confidence',
      },
      expressionAttributeValues: {
        ':status': sfnTasks.DynamoAttributeValue.fromString('completed_with_compromises'),
        ':completed_at': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        ':failure_reason': sfnTasks.DynamoAttributeValue.fromString('no_acceptance_after_3_iterations'),
        ':updated_at': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        ':final_title': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.worker_result.Payload.title')),
        ':final_abstract': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.worker_result.Payload.abstract')),
        ':selected_iteration': sfnTasks.DynamoAttributeValue.numberFromString(sfn.JsonPath.stringAt('States.Format(\'{}\', $.manager_evaluation_result.Payload.selected_iteration)')),
        ':evaluator_prediction': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('States.Format(\'{}\', $.manager_evaluation_result.Payload.evaluator_prediction)')),
        ':evaluator_confidence': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('States.Format(\'{}\', $.manager_evaluation_result.Payload.evaluator_confidence)')),
      },
      resultPath: '$.dynamodb_result', // Preserve original state for EventBridge
    });
  }

  private createFailJobState(jobsTable: dynamodb.ITable, reason: string): sfnTasks.DynamoUpdateItem {
    // Use reason in construct ID to allow multiple fail states with different reasons
    const constructId = `FailJob_${reason.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return new sfnTasks.DynamoUpdateItem(this, constructId, {
      table: jobsTable,
      key: {
        job_id: sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.job_id')),
      },
      updateExpression: 'SET #status = :status, #failure_reason = :failure_reason, #updated_at = :updated_at',
      expressionAttributeNames: {
        '#status': 'status',
        '#failure_reason': 'failure_reason',
        '#updated_at': 'updated_at',
      },
      expressionAttributeValues: {
        ':status': sfnTasks.DynamoAttributeValue.fromString('failed'),
        ':failure_reason': sfnTasks.DynamoAttributeValue.fromString(reason),
        ':updated_at': sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
      },
      resultPath: '$.dynamodb_result', // Preserve original state for EventBridge
    });
  }

  private createContinueIterationState(nextState: sfn.IChainable): sfn.IChainable {
    // Increment iteration and calculate creativity
    // Creativity: 0.3 + (iteration * 0.1), capped at 0.7
    // Since iteration is 0-indexed, after increment: iteration = 1, 2, 3, 4
    // Creativity: 0.3 + (1 * 0.1) = 0.4, 0.5, 0.6, 0.7
    const incrementIteration = new sfn.Pass(this, 'IncrementIteration', {
      parameters: {
        'job_id.$': '$.job_id',
        'conference.$': '$.conference',
        'topic.$': '$.topic',
        'iteration.$': 'States.MathAdd($.iteration, 1)',
        'manager_feedback.$': '$.manager_evaluation_result.Payload.feedback',
        'previous_outputs.$': 'States.Array($.previous_outputs, $.manager_evaluation_result.Payload)',
        // Pass full worker result so next iteration knows what tools were called
        'previous_artifacts.$': 'States.Array($.previous_artifacts, $.worker_result.Payload)',
      },
      resultPath: '$',
    });

    return incrementIteration.next(nextState);
  }
}
