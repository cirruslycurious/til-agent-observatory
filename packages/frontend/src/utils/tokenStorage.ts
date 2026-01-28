/**
 * Token Storage Utility
 * Story 1.1: Landing Page & Conference Selection
 * 
 * Manages job tokens in sessionStorage.
 */

const prefix = "cab:job_token:";
const SESSION_ID_KEY = "cab:user_session_id";

export function setJobToken(jobId: string, token: string) {
  sessionStorage.setItem(`${prefix}${jobId}`, token);
}

export function getJobToken(jobId: string): string | null {
  return sessionStorage.getItem(`${prefix}${jobId}`);
}

export function clearJobToken(jobId: string) {
  sessionStorage.removeItem(`${prefix}${jobId}`);
}

/**
 * Get or create a user session ID (UUID v4)
 * High leverage for observability correlation
 */
export function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID(); // UUID v4
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}
