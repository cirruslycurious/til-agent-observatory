/**
 * Schema Validator Library (TypeScript)
 * Story 6.4: Schema Validation as Runtime Gate
 *
 * Validates artifacts against JSON Schema files (source of truth).
 * Uses ajv library to validate against JSON Schema files.
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

// Latest schema versions by artifact type
export const LATEST_SCHEMA_VERSION_BY_TYPE: Record<string, string> = {
  style_profile: 'v1',
  evidence_bundle: 'v1',
  draft_candidates: 'v1',
  review_feedback: 'v1',
};

// Schema directory (relative to this file)
const SCHEMA_DIR = path.join(__dirname, 'schemas');

export interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ArtifactValidationError extends Error {
  constructor(
    public artifact_type: string,
    public schema_version: string,
    public errors: string[]
  ) {
    super(
      `Artifact validation failed for ${artifact_type} (schema ${schema_version}): ${errors.length} error(s)`
    );
    this.name = 'ArtifactValidationError';
  }
}

/**
 * Load JSON Schema file for artifact type and version.
 */
function loadSchema(artifact_type: string, schema_version: string): object {
  const schemaFilename = `${artifact_type}_${schema_version}.schema.json`;
  const schemaPath = path.join(SCHEMA_DIR, schemaFilename);

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  return JSON.parse(schemaContent);
}

/**
 * Format validation error as human-readable message.
 */
function formatValidationError(error: ErrorObject): string {
  const fieldPath = error.instancePath || 'root';
  const fieldName = fieldPath.replace(/^\//, '').replace(/\//g, '.');

  // Extract expected type from error
  let expectedType = 'valid value';
  if (error.keyword === 'type') {
    expectedType = Array.isArray(error.params.type) ? error.params.type.join(' or ') : error.params.type;
  } else if (error.keyword === 'required') {
    expectedType = 'required property';
  } else if (error.keyword === 'enum') {
    expectedType = 'one of allowed values';
  } else if (error.keyword === 'pattern') {
    expectedType = 'matching pattern';
  }

  // Extract actual value
  let actualValue = 'null';
  if (error.data !== undefined && error.data !== null) {
    actualValue = String(error.data);
    if (actualValue.length > 50) {
      actualValue = actualValue.substring(0, 50) + '...';
    }
  }

  return `${fieldName}: expected ${expectedType}, got ${actualValue}`;
}

/**
 * Validates artifact against schema.
 */
export function validateArtifact(artifact_data: Record<string, any>): ValidationResult {
  // Extract artifact_type and schema_version from meta
  const meta = artifact_data.meta || {};
  const artifact_type = meta.artifact_type;
  const schema_version = meta.schema_version;

  if (!artifact_type) {
    throw new Error('Missing meta.artifact_type in artifact_data');
  }
  if (!schema_version) {
    throw new Error('Missing meta.schema_version in artifact_data');
  }

  // Normalize schema_version (ensure 'v' prefix)
  const normalizedVersion = schema_version.startsWith('v') ? schema_version : `v${schema_version}`;

  // Check if schema version exists
  let schema: object;
  try {
    schema = loadSchema(artifact_type, normalizedVersion);
  } catch (error) {
    // Unknown schema version (future version)
    throw new ArtifactValidationError(
      artifact_type,
      normalizedVersion,
      [`Unknown schema version: ${normalizedVersion} (schema file not found)`]
    );
  }

  // Check if schema version is deprecated (older than latest)
  const latestVersion = LATEST_SCHEMA_VERSION_BY_TYPE[artifact_type];
  const warnings: string[] = [];
  if (latestVersion && normalizedVersion !== latestVersion) {
    // Compare versions (simple string comparison for v1, v2, etc.)
    if (normalizedVersion < latestVersion) {
      warnings.push(`Schema version ${normalizedVersion} is deprecated (latest is ${latestVersion})`);
    }
  }

  // Initialize Ajv validator
  const ajv = new Ajv({ allErrors: true, verbose: true });
  addFormats(ajv); // Add format validation (date-time, uuid, etc.)

  // Compile and validate
  const validate: ValidateFunction = ajv.compile(schema);
  const valid = validate(artifact_data);

  // Collect all validation errors
  const errors: string[] = [];
  if (!valid && validate.errors) {
    for (const error of validate.errors) {
      errors.push(formatValidationError(error));
    }
  }

  // If validation failed, raise ArtifactValidationError
  if (errors.length > 0) {
    throw new ArtifactValidationError(artifact_type, normalizedVersion, errors);
  }

  return {
    is_valid: true,
    errors: [],
    warnings,
  };
}
