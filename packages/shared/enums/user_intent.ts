/**
 * User Intent Enum (TypeScript)
 * Story 6.2: DynamoDB Generation Metrics Storage
 *
 * Central enum definition for user intent closed set.
 * Must stay in sync with Python enum.
 * May expand in future.
 */

export const enum UserIntent {
  WOULD_SUBMIT_WITH_EDITS = 'would_submit_with_edits',
  WOULD_NOT_SUBMIT = 'would_not_submit',
}

/**
 * Array of all valid user intent values
 */
export const USER_INTENT_VALUES: readonly string[] = [
  UserIntent.WOULD_SUBMIT_WITH_EDITS,
  UserIntent.WOULD_NOT_SUBMIT,
] as const;

/**
 * Check if value is a valid user intent
 */
export function isValidUserIntent(value: string): boolean {
  return USER_INTENT_VALUES.includes(value);
}
