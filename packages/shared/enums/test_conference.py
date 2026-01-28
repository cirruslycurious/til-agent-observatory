"""
Unit Tests for Conference Enum
Story 6.2: DynamoDB Generation Metrics Storage

Tests ensure Python and TypeScript enums stay in sync.
"""

import pytest
from conference import Conference


class TestConferenceEnum:
    """Tests for Conference enum"""
    
    def test_conference_values(self):
        """Conference enum has correct values"""
        assert Conference.BLACK_HAT.value == "black_hat"
        assert Conference.REINVENT.value == "reinvent"
        assert Conference.KUBECON.value == "kubecon"
    
    def test_conference_values_list(self):
        """Conference.values() returns all valid values"""
        values = Conference.values()
        assert len(values) == 3
        assert "black_hat" in values
        assert "reinvent" in values
        assert "kubecon" in values
    
    def test_conference_is_valid(self):
        """Conference.is_valid() correctly validates values"""
        assert Conference.is_valid("black_hat") is True
        assert Conference.is_valid("reinvent") is True
        assert Conference.is_valid("kubecon") is True
        assert Conference.is_valid("invalid") is False
        assert Conference.is_valid("") is False
    
    def test_conference_enum_usage(self):
        """Conference enum can be used as string"""
        conf = Conference.BLACK_HAT
        assert conf.value == "black_hat"
        assert str(conf.value) == "black_hat"
