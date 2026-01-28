"""
Tool Definitions for Agentic Worker
Story 2.2: Worker Agent - Autonomous Execution

Defines tool schemas in OpenAI function calling format.
Anthropic uses the same schema with minor adjustments handled in llm_client.
"""

from typing import List, Dict, Any


# Tool schemas in OpenAI format
WORKER_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "dynamodb_lookup",
            "description": "Look up conference GUIDANCE and example abstracts. Returns general guidelines about tone, audience, and approximate requirements. Note: This provides guidance only - for exact submission rules and validation against real acceptance criteria, use red_team_review.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "REQUIRED: Explain WHY you are calling this tool and what you expect to learn from it"
                    },
                    "conference": {
                        "type": "string",
                        "enum": ["black_hat", "reinvent", "kubecon", "gartner_symposium", "google_cloud_next"],
                        "description": "The conference to look up data for"
                    },
                    "data_type": {
                        "type": "string",
                        "enum": ["guidance", "abstract_example"],
                        "description": "Type of data: 'guidance' for general conference guidelines (not exact rules), 'abstract_example' for past accepted abstracts"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of examples to return (default: 5)",
                        "default": 5
                    }
                },
                "required": ["reasoning", "conference", "data_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_abstracts",
            "description": "Keyword search across all example abstracts in the database. Use this to find abstracts related to specific topics, technologies, or themes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "REQUIRED: Explain WHY you are searching for these abstracts and how they will help"
                    },
                    "query": {
                        "type": "string",
                        "description": "Keywords to search for (e.g., 'kubernetes security', 'machine learning inference')"
                    },
                    "conference": {
                        "type": "string",
                        "enum": ["black_hat", "reinvent", "kubecon", "gartner_symposium", "google_cloud_next"],
                        "description": "Optional: filter results to a specific conference"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 5)",
                        "default": 5
                    }
                },
                "required": ["reasoning", "query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information. Use for finding recent news, technical details, or industry context. Note: web searches also have a separate budget limit.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "REQUIRED: Explain WHY you need this web search and what specific information you're looking for"
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    }
                },
                "required": ["reasoning", "query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_recent_content",
            "description": "Find recent blog posts, conference talks, and articles on a topic. Automatically filters to last 6 months and prioritizes practitioner content. Good for understanding current trends and discussions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "REQUIRED: Explain WHY you need recent content on this topic and how it will help your abstract"
                    },
                    "topic": {
                        "type": "string",
                        "description": "The topic to search for"
                    },
                    "content_type": {
                        "type": "string",
                        "enum": ["blogs", "talks", "articles", "all"],
                        "description": "Type of content to find (default: 'all')",
                        "default": "all"
                    }
                },
                "required": ["reasoning", "topic"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "red_team_review",
            "description": "Validate your draft against REAL accepted abstracts from this conference. This tool compares your draft's structure, tone, and style against actual winning submissions - something you can't do with just the rules. Returns scores (1-5) and specific fixes. Highly recommended before submitting - drafts that skip this step often miss subtle conference-specific expectations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "REQUIRED: Explain WHY you want a red team review now and what aspects you're uncertain about"
                    },
                    "draft_abstract": {
                        "type": "string",
                        "description": "The full draft abstract including title to critique"
                    },
                    "focus_areas": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional: specific areas to focus critique on (e.g., 'technical depth', 'conference fit', 'tone')"
                    }
                },
                "required": ["reasoning", "draft_abstract"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "submit_abstract",
            "description": "Submit your final abstract. Call this when you are satisfied with your work. This does not count toward your tool budget.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title of the abstract"
                    },
                    "abstract": {
                        "type": "string",
                        "description": "The full abstract text with sections: Problem, Approach, Impact, Why this conference"
                    },
                    "evidence_pointers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "References to sources used (e.g., 'dynamodb:black_hat:rules', 'web_search:query_1:result_0')"
                    },
                    "confidence": {
                        "type": "number",
                        "description": "Your confidence in this abstract (0.0 to 1.0)"
                    }
                },
                "required": ["title", "abstract", "evidence_pointers", "confidence"]
            }
        }
    }
]


def get_tools_for_openai() -> List[Dict[str, Any]]:
    """Return tools in OpenAI format."""
    return WORKER_TOOLS


def get_tools_for_anthropic() -> List[Dict[str, Any]]:
    """
    Return tools in Anthropic format.
    Anthropic uses a slightly different schema structure.
    """
    anthropic_tools = []
    for tool in WORKER_TOOLS:
        anthropic_tool = {
            "name": tool["function"]["name"],
            "description": tool["function"]["description"],
            "input_schema": tool["function"]["parameters"]
        }
        anthropic_tools.append(anthropic_tool)
    return anthropic_tools


def get_tool_names() -> List[str]:
    """Return list of tool names."""
    return [tool["function"]["name"] for tool in WORKER_TOOLS]


# Terminal tools that don't count toward the tool budget
TERMINAL_TOOLS = {"submit_abstract"}

# Action Point costs per tool
# Worker gets 3 points per iteration - can't do both expensive tools in one turn
TOOL_COSTS = {
    "dynamodb_lookup": 1,
    "web_search": 1,
    "search_recent_content": 1,
    "search_abstracts": 2,      # Expensive - keyword search
    "red_team_review": 1,       # Reduced to encourage usage
    "submit_abstract": 0,       # Free - terminal action
}

# Action points per iteration
ACTION_POINTS_PER_ITERATION = 3

# Required tools for Manager acceptance (SECRET - don't tell Worker)
# Manager will auto-reject if both aren't used, with vague feedback
REQUIRED_TOOLS_FOR_ACCEPTANCE = {"search_abstracts", "red_team_review"}

# Legacy: Maximum tool calls (kept for backward compatibility)
MAX_TOOL_CALLS = 10
