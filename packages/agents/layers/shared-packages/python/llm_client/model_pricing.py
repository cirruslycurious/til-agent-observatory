"""
Model Pricing Table
Story 4.1: Per-Job Budget Tracking

Defines pricing per model for cost calculation.
All prices in USD per 1K tokens.

⚠️ ⚠️ ⚠️ CRITICAL: BEFORE CHANGING MODEL PRICING ⚠️ ⚠️ ⚠️

DO NOT change pricing without validating at official docs:
    - OpenAI Models & Pricing:    https://platform.openai.com/docs/models
    - Anthropic Models & Pricing: https://platform.claude.com/docs/en/about-claude/models/overview

IMPORTANT:
    - Validate model names AND pricing at the official docs
    - Anthropic model aliases use DASHES (claude-sonnet-4-5) NOT DOTS (claude-sonnet-4.5)
    - Update docs/MODELS-REFERENCE.md when changing pricing
    - After changes, rebuild Lambda layers: ./scripts/bundle-lambda-layers.sh
    - Then deploy: npx cdk deploy TilWorkflowStack --profile abstract

⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️
"""

# ============================================================================
# OpenAI Pricing (as of Jan 2026; update when pricing changes)
# ⚠️ VALIDATE AT: https://platform.openai.com/docs/models
# ============================================================================
# NOTE: We only use gpt-5.2 in this system (see MODELS-REFERENCE.md for policy)
OPENAI_PRICING = {
    "gpt-5.2": {  # ⭐ OUR MODEL - Latest OpenAI reasoning model
        "input_price_per_1k": 0.002,  # $2 per 1M input
        "output_price_per_1k": 0.008,  # $8 per 1M output
    },
    # Available but not used (kept for reference):
    "gpt-4o": {
        "input_price_per_1k": 0.005,
        "output_price_per_1k": 0.015,
    },
    "gpt-4o-mini": {
        "input_price_per_1k": 0.00015,
        "output_price_per_1k": 0.0006,
    },
    "gpt-4-turbo": {
        "input_price_per_1k": 0.01,
        "output_price_per_1k": 0.03,
    },
    "gpt-4": {
        "input_price_per_1k": 0.03,
        "output_price_per_1k": 0.06,
    },
    "o1": {
        "input_price_per_1k": 0.015,
        "output_price_per_1k": 0.06,
    },
    "o1-mini": {
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.012,
    },
}

# ============================================================================
# Anthropic Pricing (as of Jan 2026)
# ⚠️ VALIDATE AT: https://platform.claude.com/docs/en/about-claude/models/overview
# ============================================================================
# NOTE: We only use claude-sonnet-4-5 in this system (see MODELS-REFERENCE.md for policy)
ANTHROPIC_PRICING = {
    # Claude 4.5 (LATEST) - Released Sept 2025
    "claude-sonnet-4-5-20250929": {  # Full model ID
        "input_price_per_1k": 0.003,  # $3 / MTok
        "output_price_per_1k": 0.015,  # $15 / MTok
    },
    "claude-sonnet-4-5": {  # ⭐ OUR MODEL - Alias (automatically points to latest snapshot)
        "input_price_per_1k": 0.003,  # $3 / MTok
        "output_price_per_1k": 0.015,  # $15 / MTok
    },
    # Available but not used (kept for reference):
    "claude-haiku-4-5-20251001": {
        "input_price_per_1k": 0.001,  # $1 / MTok
        "output_price_per_1k": 0.005,  # $5 / MTok
    },
    "claude-haiku-4-5": {  # Alias
        "input_price_per_1k": 0.001,
        "output_price_per_1k": 0.005,
    },
    "claude-opus-4-5-20251101": {
        "input_price_per_1k": 0.005,  # $5 / MTok
        "output_price_per_1k": 0.025,  # $25 / MTok
    },
    "claude-opus-4-5": {  # Alias
        "input_price_per_1k": 0.005,
        "output_price_per_1k": 0.025,
    },
    # Claude 4 (Legacy - still available)
    "claude-sonnet-4-20250514": {
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.015,
    },
    "claude-sonnet-4-0": {  # Alias for Claude 4
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.015,
    },
    # Claude 3.7 (Legacy)
    "claude-3-7-sonnet-20250219": {
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.015,
    },
    "claude-opus-4-5": {
        "input_price_per_1k": 0.015,  # $15 / MTok input
        "output_price_per_1k": 0.075,  # $75 / MTok output
    },
}

# AWS Bedrock Pricing (as of 2024)
BEDROCK_PRICING = {
    "amazon.nova-pro-v1:0": {
        "input_price_per_1k": 0.0008,  # $0.0008 per 1K input tokens
        "output_price_per_1k": 0.0024,  # $0.0024 per 1K output tokens
    },
    "amazon.nova-lite-v1:0": {
        "input_price_per_1k": 0.0002,  # $0.0002 per 1K input tokens
        "output_price_per_1k": 0.0006,  # $0.0006 per 1K output tokens
    },
}

# Combined pricing lookup
MODEL_PRICING = {
    **{f"openai:{model}": pricing for model, pricing in OPENAI_PRICING.items()},
    **{f"anthropic:{model}": pricing for model, pricing in ANTHROPIC_PRICING.items()},
    **{f"bedrock:{model}": pricing for model, pricing in BEDROCK_PRICING.items()},
}


def calculate_cost(
    vendor: str,
    model: str,
    input_tokens: int,
    output_tokens: int
) -> float:
    """
    Calculate cost in USD for a given model and token usage.
    
    Args:
        vendor: "openai", "anthropic", or "bedrock"
        model: Model name (e.g., "gpt-5.2", "claude-sonnet-4.5")
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
    
    Returns:
        Cost in USD (float)
    
    Raises:
        ValueError: If vendor/model combination not found
    """
    key = f"{vendor}:{model}"
    pricing = MODEL_PRICING.get(key)
    
    if not pricing:
        raise ValueError(f"Pricing not found for {vendor}:{model}")
    
    input_cost = (input_tokens / 1000.0) * pricing["input_price_per_1k"]
    output_cost = (output_tokens / 1000.0) * pricing["output_price_per_1k"]
    
    return input_cost + output_cost


def get_model_pricing(vendor: str, model: str) -> dict:
    """
    Get pricing information for a model.
    
    Args:
        vendor: "openai", "anthropic", or "bedrock"
        model: Model name
    
    Returns:
        Dict with input_price_per_1k and output_price_per_1k
    
    Raises:
        ValueError: If vendor/model combination not found
    """
    key = f"{vendor}:{model}"
    pricing = MODEL_PRICING.get(key)
    
    if not pricing:
        raise ValueError(f"Pricing not found for {vendor}:{model}")
    
    return pricing.copy()
