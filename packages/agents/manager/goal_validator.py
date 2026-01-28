"""
Goal Validation (Mechanical)
Story 2.1: Manager Agent

Deterministic regex/keyword-based validator for prescriptive instructions.
Mechanical guardrails beat prompt discipline.
"""

import re
from typing import List, Tuple


# Forbidden categories
FORBIDDEN_TOOL_KEYWORDS = [
    "search", "query", "lookup", "call", "invoke", "use tool", "use the tool",
    "perform a search", "run a query", "execute lookup"
]

FORBIDDEN_ROLE_KEYWORDS = [
    "worker", "sub-worker", "sub_worker", "spawn", "delegate",
    "assign to worker", "have the worker", "tell the worker"
]

FORBIDDEN_EXECUTION_VERBS = [
    "collect", "draft", "analyze", "extract", "research", "gather",
    "you must collect", "you should draft", "you need to analyze"
]

# Regex patterns for prescriptive instructions
PRESCRIPTIVE_PATTERNS = [
    r"\b(?:use|call|invoke)\s+(?:tool|api|function)",
    r"\b(?:spawn|delegate)\s+(?:worker|sub)",
    r"\b(?:tell|instruct|direct)\s+(?:the\s+)?(?:worker|sub)",
    r"\b(?:must|should|need to)\s+(?:use|call|invoke|spawn)",
]


def validate_goal(goal: str) -> Tuple[bool, List[str]]:
    """
    Validate goal does NOT contain prescriptive instructions.
    
    Uses mechanical validation (regex/keyword-based) to detect prescriptive content.
    
    Args:
        goal: Goal text to validate
    
    Returns:
        Tuple of (is_valid, violated_rules)
        - is_valid: True if goal is valid (no prescriptive instructions)
        - violated_rules: List of rule names that were violated
    """
    violated_rules = []
    goal_lower = goal.lower()
    
    # Check forbidden tool keywords
    for keyword in FORBIDDEN_TOOL_KEYWORDS:
        if keyword in goal_lower:
            violated_rules.append(f"forbidden_tool_keyword:{keyword}")
    
    # Check forbidden role keywords
    for keyword in FORBIDDEN_ROLE_KEYWORDS:
        if keyword in goal_lower:
            violated_rules.append(f"forbidden_role_keyword:{keyword}")
    
    # Check forbidden execution verbs (when used prescriptively)
    for verb in FORBIDDEN_EXECUTION_VERBS:
        if verb in goal_lower:
            violated_rules.append(f"forbidden_execution_verb:{verb}")
    
    # Check regex patterns
    for pattern in PRESCRIPTIVE_PATTERNS:
        if re.search(pattern, goal_lower):
            violated_rules.append(f"prescriptive_pattern:{pattern}")
    
    is_valid = len(violated_rules) == 0
    
    return (is_valid, violated_rules)


def sanitize_goal(goal: str, violated_rules: List[str]) -> str:
    """
    Sanitize goal by removing prescriptive phrases.
    
    This is a simple implementation - in practice, you might want more sophisticated
    sanitization (e.g., using LLM to rewrite, or more precise regex replacements).
    
    Args:
        goal: Original goal text
        violated_rules: List of violated rules
    
    Returns:
        Sanitized goal text
    """
    sanitized = goal
    
    # Remove forbidden tool keywords (simple word boundary replacement)
    for keyword in FORBIDDEN_TOOL_KEYWORDS:
        # Replace with empty string (simple approach)
        pattern = re.compile(r'\b' + re.escape(keyword) + r'\b', re.IGNORECASE)
        sanitized = pattern.sub('', sanitized)
    
    # Remove forbidden role keywords
    for keyword in FORBIDDEN_ROLE_KEYWORDS:
        pattern = re.compile(r'\b' + re.escape(keyword) + r'\b', re.IGNORECASE)
        sanitized = pattern.sub('', sanitized)
    
    # Clean up extra whitespace
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    
    return sanitized
