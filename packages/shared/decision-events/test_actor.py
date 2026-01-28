"""
Unit Tests for Actor Enum
Story 3.1: Decision Event Capture
"""

import pytest
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from actor import Actor


class TestActor:
    """Tests for Actor enum"""
    
    def test_actor_values(self):
        """Actor has all 5 expected values"""
        values = Actor.values()
        assert len(values) == 5
        assert 'manager' in values
        assert 'worker' in values
        assert 'sub_worker' in values
        assert 'evaluator' in values
        assert 'system' in values
    
    def test_actor_is_valid(self):
        """is_valid correctly identifies valid actors"""
        assert Actor.is_valid('manager') is True
        assert Actor.is_valid('worker') is True
        assert Actor.is_valid('sub_worker') is True
        assert Actor.is_valid('evaluator') is True
        assert Actor.is_valid('system') is True
        assert Actor.is_valid('invalid_actor') is False
        assert Actor.is_valid('') is False
