"""
User Intent Enum (Python)
Story 6.2: DynamoDB Generation Metrics Storage

Central enum definition for user intent closed set.
Must stay in sync with TypeScript enum.
May expand in future.
"""

from enum import Enum


class UserIntent(str, Enum):
    """User intent closed set - must match TypeScript enum"""
    WOULD_SUBMIT_WITH_EDITS = "would_submit_with_edits"
    WOULD_NOT_SUBMIT = "would_not_submit"

    @classmethod
    def values(cls):
        """Return list of all valid user intent values"""
        return [member.value for member in cls]

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid user intent"""
        try:
            cls(value)
            return True
        except ValueError:
            return False
