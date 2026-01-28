"""
Unit Tests for User Intent Enum
Story 6.2: DynamoDB Generation Metrics Storage

Tests ensure Python and TypeScript enums stay in sync.
"""

import pytest
from user_intent import UserIntent


class TestUserIntentEnum:
    """Tests for UserIntent enum"""
    
    def test_user_intent_values(self):
        """UserIntent enum has correct values"""
        assert UserIntent.WOULD_SUBMIT_WITH_EDITS.value == "would_submit_with_edits"
        assert UserIntent.WOULD_NOT_SUBMIT.value == "would_not_submit"
    
    def test_user_intent_values_list(self):
        """UserIntent.values() returns all valid values"""
        values = UserIntent.values()
        assert len(values) == 2
        assert "would_submit_with_edits" in values
        assert "would_not_submit" in values
    
    def test_user_intent_is_valid(self):
        """UserIntent.is_valid() correctly validates values"""
        assert UserIntent.is_valid("would_submit_with_edits") is True
        assert UserIntent.is_valid("would_not_submit") is True
        assert UserIntent.is_valid("invalid") is False
        assert UserIntent.is_valid("") is False
    
    def test_user_intent_enum_usage(self):
        """UserIntent enum can be used as string"""
        intent = UserIntent.WOULD_SUBMIT_WITH_EDITS
        assert intent.value == "would_submit_with_edits"
        assert str(intent.value) == "would_submit_with_edits"
