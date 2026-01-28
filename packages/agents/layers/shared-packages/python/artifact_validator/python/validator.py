"""
Artifact Validator (Python)
Story 6.4: Schema Validation as Runtime Gate
"""

import json
import jsonschema
from typing import Dict, Any, Optional


def validate_artifact(artifact: Dict[str, Any], schema: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate artifact against JSON Schema.
    
    Args:
        artifact: Artifact to validate
        schema: JSON Schema definition
        
    Returns:
        (is_valid, error_message)
    """
    try:
        jsonschema.validate(instance=artifact, schema=schema)
        return True, None
    except jsonschema.ValidationError as e:
        return False, str(e)
