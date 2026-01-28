/**
 * Conference Enum (TypeScript)
 * Story 6.2: DynamoDB Generation Metrics Storage
 *
 * Central enum definition for conference closed set.
 * Must stay in sync with Python enum.
 */

export const enum Conference {
  BLACK_HAT = 'black_hat',
  REINVENT = 'reinvent',
  KUBECON = 'kubecon',
}

/**
 * Array of all valid conference values
 */
export const CONFERENCE_VALUES: readonly string[] = [
  Conference.BLACK_HAT,
  Conference.REINVENT,
  Conference.KUBECON,
] as const;

/**
 * Check if value is a valid conference
 */
export function isValidConference(value: string): boolean {
  return CONFERENCE_VALUES.includes(value);
}
