/**
 * 🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨
 * 
 * MANDATORY PRE-MODIFICATION CHECKLIST:
 * 1. Read .ai-instructions.md lines 100-122 (Custom Domain Configuration - ⚠️ CRITICAL!)
 * 2. Read .ai-checklists/pre-deployment.md COMPLETELY
 * 3. Read ALL inline comments in THIS file (especially ⚠️ NEVER REMOVE sections)
 * 4. Run `git diff` before deploying to see what's changing
 * 5. Verify you're NOT removing: domainNames, certificate, ACM cert ARN
 * 
 * CRITICAL CONFIGURATION IN THIS FILE:
 * - Custom domain: your-domain.example.com (⚠️ NEVER REMOVE!)
 * - ACM Certificate: arn:aws:acm:us-east-1:YOUR_AWS_ACCOUNT_ID:certificate/YOUR_ACM_CERTIFICATE_ID (⚠️ NEVER REMOVE!)
 * - CloudFront distribution ID: YOUR_CLOUDFRONT_DIST_ID
 * - API Gateway origin for /api/* routing
 * 
 * DEPLOYMENT: Takes 10-20 minutes (CloudFront distribution update)
 * TEST AFTER: curl -I https://your-domain.example.com (should be HTTP/2 200, NOT SSL errors!)
 * 
 * 🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THE DOMAIN 🚨🚨🚨
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import * as path from 'path';

export interface FrontendStackProps extends cdk.StackProps {
  restApi: apigateway.RestApi;
}

export class FrontendStack extends cdk.Stack {
  public readonly bucket: s3.IBucket;
  public readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Use existing S3 bucket (already created manually)
    // NOTE: If bucket doesn't exist, CDK will fail - create it first or use new s3.Bucket()
    this.bucket = s3.Bucket.fromBucketName(this, 'FrontendBucket', 'your-frontend-bucket');

    // Origin Access Identity for CloudFront to access private S3 bucket
    const oai = new cloudfront.OriginAccessIdentity(this, 'FrontendOAI', {
      comment: 'OAI for TIL frontend (your-frontend-bucket)',
    });

    // Grant CloudFront read access to the bucket
    this.bucket.grantRead(oai);

    // API Gateway origin (for /api/* requests)
    const apiOrigin = new origins.RestApiOrigin(props.restApi, {
      originPath: '/prod', // API Gateway stage name
    });

    // ⚠️⚠️⚠️ CRITICAL: ACM Certificate for Custom Domain ⚠️⚠️⚠️
    // Set via CDK context: cdk deploy -c acmCertificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/ID
    // Certificate must be in us-east-1 for CloudFront
    const certificateArn = this.node.tryGetContext('acmCertificateArn')
      || process.env.ACM_CERTIFICATE_ARN
      || 'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'; // Placeholder - must be set for deployment
    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      'TilCertificate',
      certificateArn
    );

    // CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      additionalBehaviors: {
        // Route /api/* requests to API Gateway
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // Don't cache API responses
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      
      // ⚠️⚠️⚠️ CRITICAL: Custom Domain Configuration ⚠️⚠️⚠️
      // DO NOT REMOVE THESE TWO LINES OR THE DOMAIN WILL BREAK!
      // If you remove them, you'll get SSL certificate errors on your-domain.example.com
      // See .ai-instructions.md lines 100-122 for full documentation
      domainNames: ['your-domain.example.com'], // ⚠️ NEVER REMOVE!
      certificate: certificate, // ⚠️ NEVER REMOVE!
      
      defaultRootObject: 'index.html',
      // SPA routing: serve index.html for 404s (React Router)
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe (cost optimization)
      comment: 'TIL Agent Workflow Observatory Frontend',
    });

    // Deploy frontend to S3 and invalidate CloudFront cache
    // IMPORTANT: This runs during CDK deploy, so you must build first!
    const projectRoot = path.resolve(__dirname, '../../..');
    const frontendDist = path.join(projectRoot, 'packages/frontend/dist');

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(frontendDist)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'], // Invalidate all paths (automatic cache invalidation!)
      prune: true, // Remove old files not in the new deployment
      memoryLimit: 512, // Increase memory for Lambda that does the deployment
    });

    // Outputs
    new cdk.CfnOutput(this, 'FrontendURL', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: 'TilFrontendURL',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID (for manual invalidation if needed)',
      exportName: 'TilFrontendDistributionId',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name',
      exportName: 'TilFrontendBucketName',
    });
  }
}
