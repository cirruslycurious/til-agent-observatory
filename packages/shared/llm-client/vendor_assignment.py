"""
Vendor Assignment Logic
Story 2.1: Manager Agent

Deterministic 50/50 randomized assignment (OpenAI vs Anthropic) with
role-aware selection to guarantee Manager and Worker are opposite vendors.
Uses job_id + iteration for reproducibility.

⚠️ ⚠️ ⚠️ CRITICAL: BEFORE CHANGING MODELS ⚠️ ⚠️ ⚠️

DO NOT change model names without validating at official docs:
    - OpenAI Models:    https://platform.openai.com/docs/models
    - Anthropic Models: https://platform.claude.com/docs/en/about-claude/models/overview

IMPORTANT:
    - Anthropic model aliases use DASHES (claude-sonnet-4-5) NOT DOTS (claude-sonnet-4.5)
    - Using incorrect model names will cause 404 errors from the API
    - After changing models, rebuild Lambda layers: ./scripts/bundle-lambda-layers.sh
    - Then deploy: npx cdk deploy TilWorkflowStack --profile abstract

⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️
"""

import hashlib
from typing import Literal

ManagerOrWorker = Literal["manager", "worker"]

# ============================================================================
# SYSTEM POLICY: TWO MODELS ONLY (for simplicity and consistency)
# ============================================================================
# ⚠️ VALIDATE MODEL NAMES AT OFFICIAL DOCS BEFORE CHANGING:
#    - https://platform.openai.com/docs/models
#    - https://platform.claude.com/docs/en/about-claude/models/overview
#
# Current models (as of Jan 18, 2026):
MANAGER_MODEL = ("openai", "gpt-5.2")  # OpenAI's latest reasoning model
WORKER_MODEL = ("anthropic", "claude-sonnet-4-5")  # Anthropic's latest (alias for claude-sonnet-4-5-20250929)
#
# NOTE: Anthropic aliases use DASHES not DOTS: claude-sonnet-4-5 ✅, claude-sonnet-4.5 ❌
# ============================================================================


def _pick_manager_vendor(job_id: str, iteration: int) -> str:
    """Deterministically pick manager vendor (50/50) from job_id only.
    
    Note: iteration parameter kept for function signature compatibility but not used.
    Vendor assignment is job-scoped, not iteration-scoped.
    """
    seed = f"{job_id}"  # Only job_id - vendor sticks for entire job
    seed_hash = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    first_byte = int(seed_hash[0:2], 16)
    return "openai" if (first_byte % 2) == 0 else "anthropic"


def assign_vendor(job_id: str, iteration: int, role: ManagerOrWorker = "manager") -> tuple[str, str]:
    """
    Assign vendor and model deterministically based on job_id and role.

    Manager and Worker are always opposite vendors.
    Vendor assignment is job-scoped: once assigned, it sticks for all iterations.

    Args:
        job_id: Job UUID
        iteration: Iteration number (0-4) - kept for signature compatibility, not used
        role: "manager" or "worker"

    Returns:
        Tuple of (vendor, model)
    """
    manager_vendor = _pick_manager_vendor(job_id, iteration)
    worker_vendor = "anthropic" if manager_vendor == "openai" else "openai"

    if role == "manager":
        if manager_vendor == "openai":
            return MANAGER_MODEL  # gpt-5.2
        return ("anthropic", "claude-sonnet-4-5")  # claude-sonnet-4-5
    elif role == "worker":
        if worker_vendor == "openai":
            return ("openai", "gpt-5.2")  # gpt-5.2
        return WORKER_MODEL
    else:
        raise ValueError(f"Unknown role: {role}")


def map_creativity_to_temperature(
    creativity: float,
    vendor: str
) -> dict:
    """
    Map normalized creativity (0.3-0.7) to vendor-specific sampling parameters.
    
    Args:
        creativity: Normalized creativity value (0.3-0.7)
        vendor: "openai" or "anthropic"
    
    Returns:
        Dict with vendor-specific parameters:
        - OpenAI: {"temperature": creativity}
        - Anthropic: {"temperature": creativity, "top_p": adjusted_value}
    """
    if vendor == "openai":
        # OpenAI: Direct temperature mapping
        return {
            "temperature": creativity,
        }
    elif vendor == "anthropic":
        # Anthropic: Direct temperature mapping
        # Note: Newer Anthropic models don't allow both temperature and top_p
        return {
            "temperature": creativity,
        }
    else:
        raise ValueError(f"Unknown vendor: {vendor}")
