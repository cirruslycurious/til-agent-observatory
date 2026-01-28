"""
Schema Validator Library (Python)
Story 6.4: Schema Validation as Runtime Gate

Validates artifacts against JSON Schema files (source of truth).
Uses jsonschema library to validate against JSON Schema files.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import jsonschema
from jsonschema import validate, ValidationError as JsonSchemaValidationError


# Latest schema versions by artifact type
LATEST_SCHEMA_VERSION_BY_TYPE = {
    "style_profile": "v1",
    "evidence_bundle": "v1",
    "draft_candidates": "v1",
    "review_feedback": "v1",
    "final": "v1",  # Worker agent final abstract submissions
}

# Schema directory (relative to this file)
SCHEMA_DIR = Path(__file__).parent / "schemas"


class ArtifactValidationError(Exception):
    """Raised when artifact validation fails"""
    def __init__(self, artifact_type: str, schema_version: str, errors: List[str]):
        self.artifact_type = artifact_type
        self.schema_version = schema_version
        self.errors = errors
        error_msg = f"Artifact validation failed for {artifact_type} (schema {schema_version}): {len(errors)} error(s)"
        super().__init__(error_msg)


@dataclass
class ValidationResult:
    """Validation result"""
    is_valid: bool
    errors: List[str]
    warnings: List[str]


def load_schema(artifact_type: str, schema_version: str) -> Dict[str, Any]:
    """
    Load JSON Schema file for artifact type and version.
    
    Args:
        artifact_type: Artifact type (e.g., "style_profile")
        schema_version: Schema version (e.g., "v1")
        
    Returns:
        Schema dict
        
    Raises:
        FileNotFoundError: If schema file doesn't exist
    """
    schema_filename = f"{artifact_type}_{schema_version}.schema.json"
    schema_path = SCHEMA_DIR / schema_filename
    
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")
    
    with open(schema_path, 'r') as f:
        return json.load(f)


def format_validation_error(error: JsonSchemaValidationError) -> str:
    """
    Format validation error as human-readable message.
    
    Args:
        error: jsonschema ValidationError
        
    Returns:
        Formatted error message: "{field_path}: expected {expected_type}, got {actual_value}"
    """
    field_path = ".".join(str(p) for p in error.path)
    if not field_path:
        field_path = "root"
    
    # Extract expected type from error message
    expected_type = "valid value"
    missing_property = None
    
    if "is not of type" in error.message:
        # Extract type from message like "1 is not of type 'string'"
        parts = error.message.split("'")
        if len(parts) >= 2:
            expected_type = parts[1]
    elif "is a required property" in error.message:
        expected_type = "required property"
        # Extract property name from error.validator_value (list of required properties)
        if error.validator == 'required' and error.validator_value:
            # Find which required property is missing
            missing_property = error.message.split("'")[1] if "'" in error.message else None
    elif "is not one of" in error.message:
        expected_type = "one of allowed values"
    elif "does not match" in error.message:
        expected_type = "matching pattern"
    
    # Build field path with missing property name if available
    if missing_property:
        field_path = f"{field_path}.{missing_property}" if field_path != "root" else missing_property
    
    # Extract actual value
    actual_value = str(error.instance) if error.instance is not None else "null"
    if len(actual_value) > 50:
        actual_value = actual_value[:50] + "..."
    
    return f"{field_path}: expected {expected_type}, got {actual_value}"


def validate_artifact(artifact_data: Dict[str, Any]) -> ValidationResult:
    """
    Validates artifact against schema.
    
    Args:
        artifact_data: Full artifact data (dict, must include meta.artifact_type and meta.schema_version)
        
    Returns:
        ValidationResult with is_valid, errors, warnings
        
    Raises:
        ArtifactValidationError: If validation fails (includes all errors)
        ValueError: If artifact_type or schema_version is missing
    """
    # Extract artifact_type and schema_version from meta
    meta = artifact_data.get('meta', {})
    artifact_type = meta.get('artifact_type')
    schema_version = meta.get('schema_version')
    
    if not artifact_type:
        raise ValueError("Missing meta.artifact_type in artifact_data")
    if not schema_version:
        raise ValueError("Missing meta.schema_version in artifact_data")
    
    # Normalize schema_version (remove 'v' prefix if present, then add it back)
    if not schema_version.startswith('v'):
        schema_version = f"v{schema_version}"
    
    # Check if schema version exists
    try:
        schema = load_schema(artifact_type, schema_version)
    except FileNotFoundError:
        # Unknown schema version (future version)
        raise ArtifactValidationError(
            artifact_type=artifact_type,
            schema_version=schema_version,
            errors=[f"Unknown schema version: {schema_version} (schema file not found)"]
        )
    
    # Check if schema version is deprecated (older than latest)
    latest_version = LATEST_SCHEMA_VERSION_BY_TYPE.get(artifact_type)
    warnings = []
    if latest_version and schema_version != latest_version:
        # Compare versions (simple string comparison for v1, v2, etc.)
        if schema_version < latest_version:
            warnings.append(f"Schema version {schema_version} is deprecated (latest is {latest_version})")
    
    # Validate against schema (collect all errors)
    errors = []
    validator = jsonschema.Draft7Validator(schema)
    
    # Collect all validation errors (don't stop at first error)
    for error in validator.iter_errors(artifact_data):
        errors.append(format_validation_error(error))
    
    # If validation failed, raise ArtifactValidationError
    if errors:
        raise ArtifactValidationError(
            artifact_type=artifact_type,
            schema_version=schema_version,
            errors=errors
        )
    
    return ValidationResult(
        is_valid=True,
        errors=[],
        warnings=warnings
    )
