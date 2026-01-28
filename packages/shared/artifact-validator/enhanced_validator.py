"""
Enhanced Artifact Validator (Python)
Story 3.2: Artifact Traceability

Enhanced validation for artifact envelope with evidence pointer grammar,
sources/claims validation, and dependency tracking.
"""

import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

# Import base schema validator
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent / 'schema-validator'))
from schema_validator import validate_artifact, ArtifactValidationError, ValidationResult

# Evidence pointer grammar pattern (from Story 3.1)
# Format: {type}:{identifier}
# Types: artifact, source, tool, event, web, conf, s3
# Pattern: ^[a-z_]+:[A-Za-z0-9._#-]+$
EVIDENCE_POINTER_PATTERN = re.compile(r'^[a-z_]+:[A-Za-z0-9._#-]+$')

# Artifact ID pattern (for artifact: type pointers)
# Format: {job_id}#{task_id}#{artifact_version}
# Example: job-123#task-456#v0001
ARTIFACT_ID_PATTERN = re.compile(r'^[A-Za-z0-9-]+#[a-z0-9_]+#v\d{4}$')


class EnhancedArtifactValidationError(Exception):
    """Raised when enhanced artifact validation fails"""
    def __init__(self, errors: List[str]):
        self.errors = errors
        error_msg = f"Enhanced artifact validation failed: {len(errors)} error(s)"
        super().__init__(error_msg)


def validate_evidence_pointer_format(pointer: str) -> bool:
    """
    Validate evidence pointer format matches grammar.
    
    Args:
        pointer: Evidence pointer string
        
    Returns:
        True if valid, False otherwise
    """
    if not isinstance(pointer, str):
        return False
    
    # Check basic pattern
    if not EVIDENCE_POINTER_PATTERN.match(pointer):
        return False
    
    # Extract type and identifier
    parts = pointer.split(':', 1)
    if len(parts) != 2:
        return False
    
    pointer_type = parts[0]
    identifier = parts[1]
    
    # Validate artifact: type has correct artifact_id format
    if pointer_type == 'artifact':
        if not ARTIFACT_ID_PATTERN.match(identifier):
            return False
    
    return True


def validate_artifact_id_format(artifact_id: str) -> bool:
    """
    Validate artifact_id format.
    
    Args:
        artifact_id: Artifact ID string
        
    Returns:
        True if valid, False otherwise
    """
    return bool(ARTIFACT_ID_PATTERN.match(artifact_id))


def validate_sources_array(provenance: Dict[str, Any]) -> List[str]:
    """
    Validate sources array (non-empty, unique IDs, valid source_pointer format).
    
    Args:
        provenance: Provenance dict
        
    Returns:
        List of validation errors (empty if valid)
    """
    errors = []
    sources = provenance.get('sources', [])
    
    # Check non-empty
    if not sources:
        errors.append("provenance.sources: array must be non-empty (at least one source required)")
        return errors
    
    # Check each source
    source_ids = set()
    for i, source in enumerate(sources):
        if not isinstance(source, dict):
            errors.append(f"provenance.sources[{i}]: must be an object")
            continue
        
        # Check source.id is present and unique
        source_id = source.get('id')
        if not source_id:
            errors.append(f"provenance.sources[{i}]: missing required field 'id'")
        elif source_id in source_ids:
            errors.append(f"provenance.sources[{i}]: source.id '{source_id}' is not unique (duplicate found)")
        else:
            source_ids.add(source_id)
        
        # Check source_pointer format if present
        source_pointer = source.get('source_pointer')
        if source_pointer:
            if not validate_evidence_pointer_format(source_pointer):
                errors.append(f"provenance.sources[{i}].source_pointer: invalid format '{source_pointer}' (must match evidence pointer grammar)")
    
    return errors


def validate_claims_array(provenance: Dict[str, Any]) -> List[str]:
    """
    Validate claims array (non-empty, valid source_pointer references).
    
    Args:
        provenance: Provenance dict
        
    Returns:
        List of validation errors (empty if valid)
    """
    errors = []
    claims = provenance.get('claims', [])
    sources = provenance.get('sources', [])
    
    # Check non-empty
    if not claims:
        errors.append("provenance.claims: array must be non-empty (at least one claim required)")
        return errors
    
    # Build set of valid source_pointer values from sources
    valid_source_pointers = set()
    for source in sources:
        source_pointer = source.get('source_pointer')
        if source_pointer:
            valid_source_pointers.add(source_pointer)
        # Also add source.id as valid pointer (for backward compatibility)
        source_id = source.get('id')
        if source_id:
            valid_source_pointers.add(f"source:{source_id}")
    
    # Check each claim
    for i, claim in enumerate(claims):
        if not isinstance(claim, dict):
            errors.append(f"provenance.claims[{i}]: must be an object")
            continue
        
        # Check source_pointer is present
        source_pointer = claim.get('source_pointer')
        if not source_pointer:
            errors.append(f"provenance.claims[{i}]: missing required field 'source_pointer'")
        else:
            # Validate source_pointer format
            if not validate_evidence_pointer_format(source_pointer):
                errors.append(f"provenance.claims[{i}].source_pointer: invalid format '{source_pointer}' (must match evidence pointer grammar)")
            # Check source_pointer references a valid source
            elif source_pointer not in valid_source_pointers:
                errors.append(f"provenance.claims[{i}].source_pointer: '{source_pointer}' does not match any source.source_pointer in provenance.sources")
    
    return errors


def validate_upstream_artifacts(provenance: Dict[str, Any]) -> List[str]:
    """
    Validate upstream_artifacts array (if present, valid artifact_id format).
    
    Args:
        provenance: Provenance dict
        
    Returns:
        List of validation errors (empty if valid)
    """
    errors = []
    upstream_artifacts = provenance.get('upstream_artifacts', [])
    
    # upstream_artifacts is optional, but if present, validate format
    for i, upstream in enumerate(upstream_artifacts):
        if not isinstance(upstream, dict):
            errors.append(f"provenance.upstream_artifacts[{i}]: must be an object")
            continue
        
        # Check artifact_id is present and valid format
        artifact_id = upstream.get('artifact_id')
        if not artifact_id:
            errors.append(f"provenance.upstream_artifacts[{i}]: missing required field 'artifact_id'")
        elif not validate_artifact_id_format(artifact_id):
            errors.append(f"provenance.upstream_artifacts[{i}].artifact_id: invalid format '{artifact_id}' (must match pattern: job_id#task_id#v0001)")
        
        # Check pointers array if present
        pointers = upstream.get('pointers', [])
        if pointers:
            for j, pointer in enumerate(pointers):
                if not isinstance(pointer, str):
                    errors.append(f"provenance.upstream_artifacts[{i}].pointers[{j}]: must be a string")
                elif not validate_evidence_pointer_format(pointer):
                    errors.append(f"provenance.upstream_artifacts[{i}].pointers[{j}]: invalid format '{pointer}' (must match evidence pointer grammar)")
    
    return errors


def validate_tool_calls(provenance: Dict[str, Any]) -> List[str]:
    """
    Validate tool_calls array (results_summary 50-200 chars, s3_tool_results_ref if >50KB).
    
    Args:
        provenance: Provenance dict
        
    Returns:
        List of validation errors (empty if valid)
    """
    errors = []
    tool_calls = provenance.get('tool_calls', [])
    
    for i, tool_call in enumerate(tool_calls):
        if not isinstance(tool_call, dict):
            errors.append(f"provenance.tool_calls[{i}]: must be an object")
            continue
        
        # Check results_summary length (50-200 chars)
        results_summary = tool_call.get('results_summary')
        if results_summary:
            if not isinstance(results_summary, str):
                errors.append(f"provenance.tool_calls[{i}].results_summary: must be a string")
            else:
                length = len(results_summary)
                if length < 50:
                    errors.append(f"provenance.tool_calls[{i}].results_summary: length {length} is less than minimum 50 chars")
                elif length > 200:
                    errors.append(f"provenance.tool_calls[{i}].results_summary: length {length} exceeds maximum 200 chars")
        
        # Check tool_invocation_id is present (required for linking to decision events)
        tool_invocation_id = tool_call.get('tool_invocation_id')
        if not tool_invocation_id:
            errors.append(f"provenance.tool_calls[{i}]: missing required field 'tool_invocation_id' (required for linking to tool_called decision event)")
    
    return errors


def validate_overflow(overflow: Optional[Dict[str, Any]], artifact_size: int) -> List[str]:
    """
    Validate overflow metadata (S3 references, hash, size limits).
    
    Args:
        overflow: Overflow dict (optional)
        artifact_size: Estimated artifact size in bytes
        
    Returns:
        List of validation errors (empty if valid)
    """
    errors = []
    
    if not overflow:
        # If artifact >=350KB, overflow is required
        if artifact_size >= 350 * 1024:
            errors.append("overflow: required for artifacts >=350KB (must include s3_payload_ref and payload_sha256)")
        return errors
    
    # Check s3_payload_ref if artifact is large
    if artifact_size >= 350 * 1024:
        s3_payload_ref = overflow.get('s3_payload_ref')
        if not s3_payload_ref:
            errors.append("overflow.s3_payload_ref: required for artifacts >=350KB")
        else:
            # Check payload_sha256 is present
            payload_sha256 = overflow.get('payload_sha256')
            if not payload_sha256:
                errors.append("overflow.payload_sha256: required when s3_payload_ref is present")
            elif not re.match(r'^[a-f0-9]{64}$', payload_sha256):
                errors.append("overflow.payload_sha256: must be a 64-character hex string (SHA-256)")
    
    return errors


def estimate_artifact_size(artifact_data: Dict[str, Any]) -> int:
    """
    Estimate artifact size in bytes (JSON serialized).
    
    Args:
        artifact_data: Artifact data dict
        
    Returns:
        Estimated size in bytes
    """
    import json
    return len(json.dumps(artifact_data, separators=(',', ':')).encode('utf-8'))


def validate_artifact_envelope_enhanced(artifact_data: Dict[str, Any]) -> ValidationResult:
    """
    Enhanced artifact validation with evidence pointer grammar, sources/claims validation.
    
    This function extends the base schema validation with additional checks:
    - Sources array non-empty, unique IDs
    - Claims array non-empty, valid source_pointer references
    - Evidence pointer grammar validation
    - Tool calls validation (results_summary length, tool_invocation_id)
    - Overflow validation (S3 references, hash)
    
    Args:
        artifact_data: Full artifact data (dict)
        
    Returns:
        ValidationResult with is_valid, errors, warnings
        
    Raises:
        EnhancedArtifactValidationError: If enhanced validation fails
        ArtifactValidationError: If base schema validation fails
    """
    # First, run base schema validation
    try:
        base_result = validate_artifact(artifact_data)
        if not base_result.is_valid:
            # Return base validation errors
            return base_result
    except ArtifactValidationError as e:
        # Return base validation errors
        return ValidationResult(is_valid=False, errors=e.errors, warnings=[])
    
    # Then run enhanced validations
    errors = []
    warnings = []
    
    # Extract provenance
    provenance = artifact_data.get('provenance', {})
    if not provenance:
        errors.append("provenance: missing required field")
        return ValidationResult(is_valid=False, errors=errors, warnings=warnings)
    
    # Validate sources array
    sources_errors = validate_sources_array(provenance)
    errors.extend(sources_errors)
    
    # Validate claims array
    claims_errors = validate_claims_array(provenance)
    errors.extend(claims_errors)
    
    # Validate upstream_artifacts (if present)
    upstream_errors = validate_upstream_artifacts(provenance)
    errors.extend(upstream_errors)
    
    # Validate tool_calls
    tool_calls_errors = validate_tool_calls(provenance)
    errors.extend(tool_calls_errors)
    
    # Validate overflow
    overflow = artifact_data.get('overflow')
    artifact_size = estimate_artifact_size(artifact_data)
    overflow_errors = validate_overflow(overflow, artifact_size)
    errors.extend(overflow_errors)
    
    # If there are errors, raise exception
    if errors:
        raise EnhancedArtifactValidationError(errors)
    
    return ValidationResult(is_valid=True, errors=[], warnings=warnings)
