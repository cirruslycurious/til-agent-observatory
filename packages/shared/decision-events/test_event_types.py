"""
Unit Tests for EventType Enum
Story 3.1: Decision Event Capture
"""

import pytest
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from event_types import EventType


class TestEventType:
    """Tests for EventType enum"""
    
    def test_event_type_values(self):
        """EventType has all 13 expected values"""
        values = EventType.values()
        assert len(values) == 13
        assert 'manager_goal_formulated' in values
        assert 'manager_goal_sanitized' in values
        assert 'tool_called' in values
        assert 'sub_worker_spawned' in values
        assert 'artifact_created' in values
        assert 'artifact_consumed' in values
        assert 'manager_rejected' in values
        assert 'manager_accepted' in values
        assert 'evaluator_assessed' in values
        assert 'timeout_occurred' in values
        assert 'cost_guardrail_triggered' in values
        assert 'iteration_completed' in values
        assert 'artifact_circular_dependency_detected' in values
    
    def test_event_type_is_valid(self):
        """is_valid correctly identifies valid event types"""
        assert EventType.is_valid('tool_called') is True
        assert EventType.is_valid('artifact_created') is True
        assert EventType.is_valid('invalid_type') is False
        assert EventType.is_valid('') is False
    
    def test_event_type_normalize_lowercase(self):
        """normalize converts to lowercase"""
        assert EventType.normalize('TOOL_CALLED') == 'tool_called'
        assert EventType.normalize('ArtifactCreated') == 'artifact_created'
    
    def test_event_type_normalize_underscores(self):
        """normalize replaces spaces and hyphens with underscores"""
        assert EventType.normalize('tool-called') == 'tool_called'
        assert EventType.normalize('tool called') == 'tool_called'
        assert EventType.normalize('tool-called') == 'tool_called'
    
    def test_event_type_normalize_mixed_case(self):
        """normalize handles mixed case"""
        assert EventType.normalize('ToolCalled') == 'tool_called'
        assert EventType.normalize('toolCalled') == 'tool_called'
    
    def test_event_type_normalize_invalid(self):
        """normalize raises ValueError for invalid event types"""
        with pytest.raises(ValueError, match="Invalid event type"):
            EventType.normalize('invalid_type')
        
        with pytest.raises(ValueError, match="Event type cannot be empty"):
            EventType.normalize('')
        
        with pytest.raises(ValueError, match="Event type cannot be empty"):
            EventType.normalize(None)
