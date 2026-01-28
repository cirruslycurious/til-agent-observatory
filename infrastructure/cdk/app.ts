#!/usr/bin/env node
/**
 * 🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨
 * 
 * MANDATORY PRE-MODIFICATION CHECKLIST:
 * 1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
 * 2. Read .ai-checklists/pre-deployment.md COMPLETELY
 * 3. Read ALL inline comments in THIS file
 * 4. Run `git diff` before deploying to see what's changing
 * 
 * CRITICAL: This is the CDK app entrypoint - orchestrates ALL stacks.
 * 
 * DEPLOYMENT ORDER (MUST FOLLOW):
 * 1. TilDataStack (tables/buckets first)
 * 2. TilApiStack (API Gateway)
 * 3. TilWorkflowStack (Step Functions, agents)
 * 4. TilComputeStack (API handlers - depends on workflow)
 * 5. TilFrontendStack (CloudFront - takes longest, 10-20 min)
 * 6. TilMonitoringStack (CloudWatch - last)
 * 
 * DEPENDENCIES ARE CONFIGURED HERE - DO NOT BREAK THEM!
 * 
 * TEST AFTER: Verify all stacks deployed successfully
 * 
 * 🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK DEPLOYMENT ORDER 🚨🚨🚨
 */
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataStack } from './stacks/data-stack';
import { ApiStack } from './stacks/api-stack';
import { ComputeStack } from './stacks/compute-stack';
import { WorkflowStack } from './stacks/workflow-stack';
import { MonitoringStack } from './stacks/monitoring-stack';
import { FrontendStack } from './stacks/frontend-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Data layer (DynamoDB, S3)
const dataStack = new DataStack(app, 'TilDataStack', {
  env,
  description: 'Data storage layer: DynamoDB tables and S3 buckets',
});

// API layer (API Gateway, WebSocket)
const apiStack = new ApiStack(app, 'TilApiStack', {
  env,
  description: 'API Gateway and WebSocket API',
});

// Workflow layer (Step Functions, Agent Lambdas)
// Must be created before ComputeStack to export state machine ARN
const workflowStack = new WorkflowStack(app, 'TilWorkflowStack', {
  env,
  description: 'Step Functions state machine and agent Lambda functions',
  dataStack,
});

// Compute layer (API Lambda)
// Imports state machine ARN from WorkflowStack via CfnOutput export
const computeStack = new ComputeStack(app, 'TilComputeStack', {
  env,
  description: 'API Gateway Lambda functions',
  dataStack,
  apiStack,
});

// Ensure ComputeStack depends on WorkflowStack (for cross-stack reference)
computeStack.addDependency(workflowStack);

// Frontend layer (S3, CloudFront)
// NOTE: Must run `npm run build` in packages/frontend BEFORE deploying this stack
const frontendStack = new FrontendStack(app, 'TilFrontendStack', {
  env,
  description: 'Frontend React app (S3 + CloudFront)',
  restApi: apiStack.restApi,
});

// Ensure FrontendStack depends on ApiStack
frontendStack.addDependency(apiStack);

// Monitoring layer (CloudWatch, Alarms)
const monitoringStack = new MonitoringStack(app, 'TilMonitoringStack', {
  env,
  description: 'CloudWatch dashboards and alarms',
  dataStack,
  apiStack,
  computeStack,
});

app.synth();
