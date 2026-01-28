/**
 * 🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨
 * 
 * MANDATORY PRE-MODIFICATION CHECKLIST:
 * 1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
 * 2. Read .ai-checklists/pre-deployment.md COMPLETELY
 * 3. Read ALL inline comments in THIS file
 * 4. Run `git diff` before deploying to see what's changing
 * 
 * CRITICAL: This stack deploys API Gateway (REST + WebSocket).
 * - REST API: til-api (ID: YOUR_API_GATEWAY_ID)
 * - Stage: prod
 * - CORS: Enabled for all origins
 * - Used by: ComputeStack (Lambda integrations), FrontendStack (CloudFront origin)
 * 
 * DEPLOYMENT: Must deploy AFTER TilDataStack, BEFORE ComputeStack
 * TEST AFTER: curl https://YOUR_API_GATEWAY_ID.execute-api.us-east-1.amazonaws.com/prod/api/v1/jobs
 * 
 * 🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THE API GATEWAY 🚨🚨🚨
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export class ApiStack extends cdk.Stack {
  public readonly restApi: apigateway.RestApi;
  public readonly websocketApi: apigatewayv2.WebSocketApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // REST API Gateway
    this.restApi = new apigateway.RestApi(this, 'RestApi', {
      restApiName: 'til-api',
      description: 'TIL Agent Workflow Observatory REST API',
      defaultCorsPreflightOptions: {
        // Note: ALL_ORIGINS is used for demo/development. In production, restrict to specific domains:
        // allowOrigins: ['https://your-domain.example.com'],
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // WebSocket API
    this.websocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'til-websocket-api',
      description: 'TIL Agent Workflow Observatory WebSocket API',
    });
  }
}
