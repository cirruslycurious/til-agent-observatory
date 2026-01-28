/**
 * System Status Handlers
 * Story 4.3: Global Cost Protection
 * 
 * Endpoints:
 * - GET /api/v1/system/status - Get system status (public, no auth required)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});
const SYSTEM_ENABLED_PARAMETER = process.env.SYSTEM_ENABLED_PARAMETER || '/conference-abstract/system-enabled';
const KILL_SWITCH_TIMEOUT_MS = parseInt(process.env.KILL_SWITCH_TIMEOUT_MS || '400', 10);

/**
 * Check global kill switch (Story 4.3)
 * 
 * Reads Parameter Store flag with timeout. Fails closed (treats as disabled) on timeout/error.
 * 
 * @returns true if system is enabled, false if disabled or error/timeout
 */
async function checkSystemEnabled(): Promise<boolean> {
  try {
    // Create promise with timeout
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        // Fail closed: timeout = system disabled
        console.warn(`Kill switch check timed out after ${KILL_SWITCH_TIMEOUT_MS}ms - treating as disabled`);
        resolve(false);
      }, KILL_SWITCH_TIMEOUT_MS);
    });

    const checkPromise = (async () => {
      try {
        const command = new GetParameterCommand({
          Name: SYSTEM_ENABLED_PARAMETER,
        });
        const response = await ssmClient.send(command);
        const value = response.Parameter?.Value || 'false';
        return value.toLowerCase() === 'true';
      } catch (error: any) {
        // Fail closed: error = system disabled
        console.error(`Kill switch check failed: ${error.message} - treating as disabled`);
        return false;
      }
    })();

    // Race: timeout vs actual check
    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error: any) {
    // Fail closed: any exception = system disabled
    console.error(`Kill switch check exception: ${error.message} - treating as disabled`);
    return false;
  }
}

/**
 * GET /api/v1/system/status - Get system status
 * Story 4.3: Global Cost Protection
 * 
 * Public endpoint (no auth required) for dashboard to show system status.
 */
export async function getSystemStatusHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const systemEnabled = await checkSystemEnabled();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: systemEnabled ? 'enabled' : 'disabled',
        message: systemEnabled
          ? 'System is operational'
          : 'System temporarily unavailable for maintenance',
      }),
    };
  } catch (error: any) {
    console.error('Error checking system status:', error);
    // Fail closed: return disabled status on error
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'disabled',
        message: 'System status check failed - treating as disabled',
      }),
    };
  }
}
