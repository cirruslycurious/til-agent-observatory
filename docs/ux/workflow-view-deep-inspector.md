# 6. Workflow View — Deep (Inspector)

## Purpose
Forensic inspection and debugging.

## Layout
- Log-style event panels
- Chronological, append-only
- No chat bubbles

## Event Panel Semantics
- Border-left color = event type
- Key/value layout
- Reasoning always visible
- Evidence expandable
- Full payloads linked (S3)

## Event Color Mapping
| Event | Color |
|-----|------|
| tool_called | Accent |
| artifact_created | Green |
| manager_accepted | Green |
| manager_rejected | Red |
| timeout | Red |
| guardrail_triggered | Guardrail |
| evaluator_assessed | Neutral |

---
