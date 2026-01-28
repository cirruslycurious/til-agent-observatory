"""
Conference Enum (Python)
Story 6.2: DynamoDB Generation Metrics Storage

Central enum definition for conference closed set.
Must stay in sync with TypeScript enum.
"""

from enum import Enum


class Conference(str, Enum):
    """Conference closed set - must match TypeScript enum"""
    BLACK_HAT = "black_hat"
    REINVENT = "reinvent"
    KUBECON = "kubecon"

    @classmethod
    def values(cls):
        """Return list of all valid conference values"""
        return [member.value for member in cls]

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid conference"""
        try:
            cls(value)
            return True
        except ValueError:
            return False
