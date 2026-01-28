# AI Context Documents

This directory contains focused context documents for AI coding assistants working on this project. Each document covers a specific domain to minimize context loading.

## Document Index

| Document | Use When | Size |
|----------|----------|------|
| **[project-overview.md](project-overview.md)** | Starting any new task | ~2KB |
| **[aws-deployment.md](aws-deployment.md)** | Deploying or debugging AWS resources | ~4KB |
| **[lambda-layers.md](lambda-layers.md)** | Building or troubleshooting Lambda layers | ~3KB |
| **[dashboard-v2.md](dashboard-v2.md)** | Working on Dashboard V2 analytics | ~4KB |
| **[agent-architecture.md](agent-architecture.md)** | Modifying Manager, Worker, or Evaluator | ~3KB |
| **[known-issues.md](known-issues.md)** | Debugging common problems | ~4KB |

## Best Practices

### For AI Assistants

1. **Start with `project-overview.md`** - Always load this first for context
2. **Load domain-specific docs as needed** - Don't load everything
3. **Check `known-issues.md` when debugging** - Many problems are already documented

### Why Multiple Documents?

A single 45KB instruction file is an anti-pattern because:
- Wastes context window on irrelevant information
- Increases latency for every request
- Makes maintenance harder
- Mixes unrelated concerns

Each document here is self-contained and ~2-4KB - load only what you need.
