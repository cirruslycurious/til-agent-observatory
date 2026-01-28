"""
Event Type Enum (Python)
Story 3.1: Decision Event Capture

Strict enum for event types - prevents silent "new event type" that breaks replay grouping.
Must stay in sync with TypeScript enum.
"""

from enum import Enum


class EventType(str, Enum):
    """Event type closed set - all decision event types"""
    MANAGER_GOAL_FORMULATED = "manager_goal_formulated"
    MANAGER_GOAL_SANITIZED = "manager_goal_sanitized"
    MANAGER_SELECTED_BEST_ITERATION = "manager_selected_best_iteration"
    TOOL_CALLED = "tool_called"
    SUB_WORKER_SPAWNED = "sub_worker_spawned"
    ARTIFACT_CREATED = "artifact_created"
    ARTIFACT_CONSUMED = "artifact_consumed"
    MANAGER_REJECTED = "manager_rejected"
    MANAGER_ACCEPTED = "manager_accepted"
    EVALUATOR_ASSESSED = "evaluator_assessed"
    EVALUATOR_TIMEOUT = "evaluator_timeout"
    TIMEOUT_OCCURRED = "timeout_occurred"
    COST_EVENT = "cost_event"
    COST_GUARDRAIL_TRIGGERED = "cost_guardrail_triggered"
    ITERATION_COMPLETED = "iteration_completed"
    ARTIFACT_CIRCULAR_DEPENDENCY_DETECTED = "artifact_circular_dependency_detected"
    AGENTIC_LOOP_STARTED = "agentic_loop_started"
    ABSTRACT_SUBMITTED = "abstract_submitted"
    PLANNING_STEP = "planning_step"

    @classmethod
    def values(cls):
        """Return list of all valid event type values"""
        return [member.value for member in cls]

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid event type"""
        try:
            cls(value)
            return True
        except ValueError:
            return False

    @classmethod
    def normalize(cls, value: str) -> str:
        """
        Normalize event type string to stable enum value.
        Converts to lowercase, handles camelCase, replaces spaces/hyphens with underscores.
        
        Examples:
        - "toolCalled" -> "tool_called"
        - "TOOL_CALLED" -> "tool_called"
        - "tool-called" -> "tool_called"
        """
        if not value:
            raise ValueError("Event type cannot be empty")
        
        # Convert camelCase to snake_case first
        import re
        # Insert underscore before uppercase letters that follow lowercase (word boundary)
        # This handles "toolCalled" -> "tool_Called" but not "TOOL_CALLED" -> "T_O_O_L_C_A_L_L_E_D"
        normalized = re.sub(r'(?<=[a-z])(?=[A-Z])', '_', value)
        
        # Convert to lowercase
        normalized = normalized.lower()
        
        # Replace spaces and hyphens with underscores
        normalized = normalized.replace(" ", "_").replace("-", "_")
        
        # Validate it's a valid enum value
        if not cls.is_valid(normalized):
            raise ValueError(f"Invalid event type: {value} (normalized: {normalized})")
        
        return normalized
