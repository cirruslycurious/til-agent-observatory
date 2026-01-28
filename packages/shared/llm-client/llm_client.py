"""
LLM Client Library
Story 2.1: Manager Agent, Story 2.2: Worker Agent

Unified client for OpenAI, Anthropic, and Bedrock APIs.
Handles API key retrieval from Parameter Store, retry logic, cost tracking.
"""

import os
import time
import json
import boto3
from typing import Dict, Any, Optional, Tuple, List
from botocore.exceptions import ClientError

# Import OpenAI and Anthropic clients
try:
    import openai
except ImportError:
    openai = None

try:
    import anthropic
except ImportError:
    anthropic = None

from .model_pricing import calculate_cost
from .vendor_assignment import map_creativity_to_temperature
from .tool_definitions import get_tools_for_openai, get_tools_for_anthropic

# Configuration
REGION = os.environ.get('AWS_REGION', 'us-east-1')
SSM_PREFIX = os.environ.get('SSM_PARAMETER_PREFIX', '/conference-abstract/dev')

# Initialize SSM client for Parameter Store
ssm_client = boto3.client('ssm', region_name=REGION)

# Cache for API keys (to avoid repeated Parameter Store calls)
_api_key_cache: Dict[str, str] = {}


def get_api_key(provider: str) -> str:
    """
    Retrieve API key from AWS Parameter Store.
    
    Args:
        provider: "openai", "anthropic", or "bedrock"
    
    Returns:
        API key string
    
    Raises:
        ValueError: If provider is invalid
        ClientError: If Parameter Store retrieval fails
    """
    # Check cache first
    cache_key = f"{provider}_api_key"
    if cache_key in _api_key_cache:
        return _api_key_cache[cache_key]
    
    # Map provider to parameter name
    parameter_map = {
        "openai": f"{SSM_PREFIX}/openai-api-key",
        "anthropic": f"{SSM_PREFIX}/anthropic-api-key",
        "bedrock": f"{SSM_PREFIX}/bedrock-api-key",
    }
    
    if provider not in parameter_map:
        raise ValueError(f"Unknown provider: {provider}")
    
    parameter_name = parameter_map[provider]
    
    try:
        response = ssm_client.get_parameter(
            Name=parameter_name,
            WithDecryption=True
        )
        api_key = response['Parameter']['Value']
        
        # Cache the key
        _api_key_cache[cache_key] = api_key
        
        return api_key
    except ClientError as e:
        raise ValueError(f"Failed to retrieve API key for {provider}: {e}")


def call_bedrock(
    prompt: str,
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 2000,
    system_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Call Amazon Bedrock API (for Amazon Nova models).
    
    Uses IAM role authentication (no API key needed when running in Lambda).
    
    Args:
        prompt: User prompt
        model: Bedrock model ID (e.g., "amazon.nova-pro-v1:0")
        temperature: Sampling temperature (0.0-1.0)
        max_tokens: Maximum tokens to generate
        system_prompt: System prompt (optional)
    
    Returns:
        Dict with response, tokens, cost, etc.
    """
    bedrock = boto3.client('bedrock-runtime', region_name=REGION)
    
    # Build messages for Bedrock Converse API
    messages = [{"role": "user", "content": [{"text": prompt}]}]
    
    # Build system prompt if provided
    system = [{"text": system_prompt}] if system_prompt else None
    
    # Inference config
    inference_config = {
        "temperature": temperature,
        "maxTokens": max_tokens,
    }
    
    max_retries = 3
    base_delay = 1.0
    
    for attempt in range(max_retries):
        try:
            kwargs = {
                "modelId": model,
                "messages": messages,
                "inferenceConfig": inference_config,
            }
            if system:
                kwargs["system"] = system
            
            response = bedrock.converse(**kwargs)
            
            # Extract response
            output = response.get("output", {})
            message = output.get("message", {})
            content = message.get("content", [])
            response_text = content[0].get("text", "") if content else ""
            
            # Extract usage
            usage = response.get("usage", {})
            input_tokens = usage.get("inputTokens", 0)
            output_tokens = usage.get("outputTokens", 0)
            
            return {
                "response": response_text,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "cost_usd": calculate_cost("bedrock", model, input_tokens, output_tokens),
                "vendor": "bedrock",
                "model": model,
                "temperature": temperature,
                "stop_reason": response.get("stopReason", "end_turn"),
            }
        
        except Exception as e:
            error_str = str(e).lower()
            is_retryable = any(x in error_str for x in ["throttl", "rate", "timeout", "500", "502", "503"])
            
            if attempt == max_retries - 1 or not is_retryable:
                raise ValueError(f"Bedrock API call failed after {attempt + 1} attempts: {e}")
            
            delay = base_delay * (2 ** attempt)
            time.sleep(delay)
    
    raise ValueError("Bedrock API call failed: Max retries exceeded")


def call_llm(
    prompt: str,
    vendor: str,
    model: str,
    creativity: float,
    max_tokens: Optional[int] = None,
    system_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Call LLM API with retry logic and cost tracking.
    
    Args:
        prompt: User prompt
        vendor: "openai" or "anthropic"
    model: Model name (e.g., "gpt-5.2", "claude-sonnet-4.5")
        creativity: Normalized creativity (0.3-0.7)
        max_tokens: Maximum tokens to generate (optional)
        system_prompt: System prompt (optional)
    
    Returns:
        Dict with:
        - "response": LLM response text
        - "input_tokens": Number of input tokens
        - "output_tokens": Number of output tokens
        - "total_tokens": Total tokens
        - "cost_usd": Cost in USD
        - "vendor": Vendor name
        - "model": Model name
        - "temperature": Actual temperature used
    
    Raises:
        ValueError: If vendor is invalid or API call fails
    """
    # Get API key
    api_key = get_api_key(vendor)
    
    # Map creativity to vendor-specific parameters
    sampling_params = map_creativity_to_temperature(creativity, vendor)
    temperature = sampling_params.get("temperature", creativity)
    
    # Set default max_tokens if not provided
    if max_tokens is None:
        max_tokens = 4000 if vendor == "openai" else 4096
    
    # Retry logic with exponential backoff
    max_retries = 3
    base_delay = 1.0
    
    for attempt in range(max_retries):
        try:
            if vendor == "openai":
                if not openai:
                    raise ValueError("OpenAI library not installed")
                
                client = openai.OpenAI(api_key=api_key)
                
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})
                
                # Use max_completion_tokens for newer OpenAI models
                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_completion_tokens=max_tokens,
                )
                
                # Extract response
                response_text = response.choices[0].message.content
                usage = response.usage
                
                return {
                    "response": response_text,
                    "input_tokens": usage.prompt_tokens,
                    "output_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                    "cost_usd": calculate_cost(vendor, model, usage.prompt_tokens, usage.completion_tokens),
                    "vendor": vendor,
                    "model": model,
                    "temperature": temperature,
                }
            
            elif vendor == "anthropic":
                if not anthropic:
                    raise ValueError("Anthropic library not installed")
                
                client = anthropic.Anthropic(api_key=api_key)
                
                # Build messages
                messages = [{"role": "user", "content": prompt}]
                
                # Anthropic API call
                # Note: Newer Anthropic models don't allow both temperature and top_p
                # So we only use temperature
                kwargs = {
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": messages,
                }
                
                # Add system prompt if provided
                if system_prompt:
                    kwargs["system"] = system_prompt
                
                response = client.messages.create(**kwargs)
                
                # Extract response
                response_text = response.content[0].text
                usage = response.usage
                
                return {
                    "response": response_text,
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "total_tokens": usage.input_tokens + usage.output_tokens,
                    "cost_usd": calculate_cost(vendor, model, usage.input_tokens, usage.output_tokens),
                    "vendor": vendor,
                    "model": model,
                    "temperature": temperature,
                }
            
            else:
                raise ValueError(f"Unsupported vendor: {vendor}")
        
        except Exception as e:
            # Check if it's a retryable error
            is_retryable = False
            error_str = str(e).lower()
            
            # Rate limit errors
            if "rate limit" in error_str or "429" in error_str:
                is_retryable = True
            
            # Timeout errors
            if "timeout" in error_str or "timed out" in error_str:
                is_retryable = True
            
            # Server errors (5xx)
            if "500" in error_str or "502" in error_str or "503" in error_str:
                is_retryable = True
            
            # If last attempt or not retryable, raise
            if attempt == max_retries - 1 or not is_retryable:
                raise ValueError(f"LLM API call failed after {attempt + 1} attempts: {e}")
            
            # Exponential backoff
            delay = base_delay * (2 ** attempt)
            time.sleep(delay)
    
    # Should never reach here
    raise ValueError("LLM API call failed: Max retries exceeded")


def call_llm_with_tools(
    messages: list,
    vendor: str,
    model: str,
    creativity: float,
    tools: Optional[list] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Call LLM API with tool/function calling support.
    
    Args:
        messages: Conversation messages (list of dicts with role/content)
        vendor: "openai" or "anthropic"
        model: Model name
        creativity: Normalized creativity (0.3-0.7)
        tools: Tool definitions (optional, defaults to WORKER_TOOLS)
        max_tokens: Maximum tokens to generate
    
    Returns:
        Dict with:
        - "response": LLM response text (if no tool call)
        - "tool_calls": List of tool calls (if tool call requested)
        - "input_tokens": Number of input tokens
        - "output_tokens": Number of output tokens
        - "total_tokens": Total tokens
        - "cost_usd": Cost in USD
        - "vendor": Vendor name
        - "model": Model name
        - "stop_reason": Why the model stopped (end_turn, tool_use, etc.)
    """
    # Get API key
    api_key = get_api_key(vendor)
    
    # Map creativity to vendor-specific parameters
    sampling_params = map_creativity_to_temperature(creativity, vendor)
    temperature = sampling_params.get("temperature", creativity)
    
    # Set default max_tokens if not provided
    if max_tokens is None:
        max_tokens = 4000 if vendor == "openai" else 4096
    
    # Get tools in vendor-specific format
    if tools is None:
        if vendor == "openai":
            tools = get_tools_for_openai()
        else:
            tools = get_tools_for_anthropic()
    
    # Retry logic with exponential backoff
    max_retries = 3
    base_delay = 1.0
    
    for attempt in range(max_retries):
        try:
            if vendor == "openai":
                if not openai:
                    raise ValueError("OpenAI library not installed")
                
                client = openai.OpenAI(api_key=api_key)
                
                # Use max_completion_tokens for newer OpenAI models (gpt-4o, o1, etc.)
                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_completion_tokens=max_tokens,
                    tools=tools if tools else None,
                    tool_choice="auto",  # Let model decide
                )
                
                # Extract response
                message = response.choices[0].message
                usage = response.usage
                stop_reason = response.choices[0].finish_reason
                
                result = {
                    "input_tokens": usage.prompt_tokens,
                    "output_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                    "cost_usd": calculate_cost(vendor, model, usage.prompt_tokens, usage.completion_tokens),
                    "vendor": vendor,
                    "model": model,
                    "temperature": temperature,
                    "stop_reason": stop_reason,
                }
                
                # Check if tool calls were made
                if message.tool_calls:
                    result["tool_calls"] = [
                        {
                            "id": tc.id,
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        }
                        for tc in message.tool_calls
                    ]
                    result["response"] = None
                else:
                    result["tool_calls"] = None
                    result["response"] = message.content
                
                return result
            
            elif vendor == "anthropic":
                if not anthropic:
                    raise ValueError("Anthropic library not installed")
                
                client = anthropic.Anthropic(api_key=api_key)
                
                # Extract system message if present
                system_prompt = None
                filtered_messages = []
                for msg in messages:
                    if msg.get("role") == "system":
                        system_prompt = msg.get("content")
                    else:
                        filtered_messages.append(msg)
                
                # Build kwargs
                kwargs = {
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": filtered_messages,
                }
                
                if system_prompt:
                    kwargs["system"] = system_prompt
                
                if tools:
                    kwargs["tools"] = tools
                
                response = client.messages.create(**kwargs)
                
                # Extract response
                usage = response.usage
                stop_reason = response.stop_reason
                
                result = {
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "total_tokens": usage.input_tokens + usage.output_tokens,
                    "cost_usd": calculate_cost(vendor, model, usage.input_tokens, usage.output_tokens),
                    "vendor": vendor,
                    "model": model,
                    "temperature": temperature,
                    "stop_reason": stop_reason,
                }
                
                # Check content blocks for tool use
                tool_calls = []
                text_content = []
                
                for block in response.content:
                    if block.type == "tool_use":
                        tool_calls.append({
                            "id": block.id,
                            "name": block.name,
                            "arguments": json.dumps(block.input) if isinstance(block.input, dict) else block.input,
                        })
                    elif block.type == "text":
                        text_content.append(block.text)
                
                if tool_calls:
                    result["tool_calls"] = tool_calls
                    result["response"] = "\n".join(text_content) if text_content else None
                else:
                    result["tool_calls"] = None
                    result["response"] = "\n".join(text_content)
                
                return result
            
            else:
                raise ValueError(f"Unsupported vendor: {vendor}")
        
        except Exception as e:
            # Check if it's a retryable error
            is_retryable = False
            error_str = str(e).lower()
            
            if "rate limit" in error_str or "429" in error_str:
                is_retryable = True
            if "timeout" in error_str or "timed out" in error_str:
                is_retryable = True
            if "500" in error_str or "502" in error_str or "503" in error_str:
                is_retryable = True
            
            if attempt == max_retries - 1 or not is_retryable:
                raise ValueError(f"LLM API call with tools failed after {attempt + 1} attempts: {e}")
            
            delay = base_delay * (2 ** attempt)
            time.sleep(delay)
    
    raise ValueError("LLM API call with tools failed: Max retries exceeded")
