"""
Actor Enum (Python)
Story 3.1: Decision Event Capture

Strict enum for actors - prevents silent "new actor type" that breaks replay grouping / seq counters.
Must stay in sync with TypeScript enum.
"""

from enum import Enum


class Actor(str, Enum):
    """Actor closed set - must match TypeScript enum"""
    MANAGER = "manager"
    WORKER = "worker"
    SUB_WORKER = "sub_worker"
    EVALUATOR = "evaluator"
    SYSTEM = "system"

    @classmethod
    def values(cls):
        """Return list of all valid actor values"""
        return [member.value for member in cls]

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid actor"""
        try:
            cls(value)
            return True
        except ValueError:
            return False
