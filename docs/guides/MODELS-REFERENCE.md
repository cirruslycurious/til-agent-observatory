# AI Models Reference

**Last Updated:** Jan 18, 2026  
**Sources:**
- [Anthropic Claude Models](https://platform.claude.com/docs/en/about-claude/models/overview)
- [OpenAI Models](https://platform.openai.com/docs/models)

---

## 🎯 System Policy: TWO MODELS ONLY

**For simplicity and consistency, this system uses ONLY two models:**

| Vendor | Model | Use Case | Cost |
|--------|-------|----------|------|
| **OpenAI** | `gpt-5.2` | Manager & Worker (50/50 assignment) | $2/MTok in, $8/MTok out |
| **Anthropic** | `claude-sonnet-4-5` | Manager & Worker (50/50 assignment) | $3/MTok in, $15/MTok out |

**Why only two models?**
1. ✅ **Consistency** - Same capabilities across all jobs
2. ✅ **A/B Testing** - Clean vendor comparison (OpenAI vs Anthropic)
3. ✅ **Cost Control** - Predictable pricing, no premium models
4. ✅ **Simplicity** - Easy to reason about, document, and debug
5. ✅ **Fairness** - Manager and Worker get equivalent-tier models

**Strategy:** 50/50 randomized vendor assignment
- Manager and Worker are **always opposite vendors**
- Deterministic assignment based on `job_id` + `iteration`
- Both agents get top-tier models (no premium/budget tiers)

---

## Models We Use

### OpenAI: GPT-5.2
- **Model ID:** `gpt-5.2`
- **Pricing:** $2/MTok input, $8/MTok output
- **Best for:** Reasoning, planning, evaluation
- **Why chosen:** Latest OpenAI model, excellent performance/cost ratio

### Anthropic: Claude Sonnet 4.5
- **Model ID:** `claude-sonnet-4-5` (alias for `claude-sonnet-4-5-20250929`)
- **Pricing:** $3/MTok input, $15/MTok output
- **Best for:** Complex agents, coding, tool use
- **Why chosen:** Latest Anthropic model, exceptional for agentic tasks
- **Features:** Extended thinking, 200K context, 64K output

---

## Manager & Worker Assignment

**File:** `packages/shared/llm-client/vendor_assignment.py`

```python
# SYSTEM POLICY: We only use TWO models
MANAGER_MODEL = ("openai", "gpt-5.2")
WORKER_MODEL = ("anthropic", "claude-sonnet-4-5")

def assign_vendor(job_id, iteration, role="manager"):
    """50/50 deterministic assignment, Manager and Worker are opposite vendors"""
    manager_vendor = _pick_manager_vendor(job_id, iteration)
    worker_vendor = "anthropic" if manager_vendor == "openai" else "openai"
    
    if role == "manager":
        return MANAGER_MODEL if manager_vendor == "openai" else ("anthropic", "claude-sonnet-4-5")
    elif role == "worker":
        return ("openai", "gpt-5.2") if worker_vendor == "openai" else WORKER_MODEL
```

---

## 📚 Available Models (For Reference Only)

**Note:** While many models exist from both vendors, we ONLY use the two models listed above. This section documents what's available for awareness, but our system is configured to use only `gpt-5.2` and `claude-sonnet-4-5`.

---

## Anthropic Claude Models (Available but Not Used)

### ✅ Current Models (Claude 4.5 Generation)

**Recommended:** Claude Sonnet 4.5 offers the best balance of intelligence, speed, and cost.

| Model | Full ID | Alias | Pricing | Use Case |
|-------|---------|-------|---------|----------|
| **Claude Sonnet 4.5** | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5` | $3/MTok in, $15/MTok out | **Our choice:** Complex agents, coding |
| **Claude Haiku 4.5** | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | $1/MTok in, $5/MTok out | Fastest, near-frontier intelligence |
| **Claude Opus 4.5** | `claude-opus-4-5-20251101` | `claude-opus-4-5` | $5/MTok in, $25/MTok out | Maximum intelligence + performance |

**Features:**
- Extended thinking support ✅
- Priority Tier available ✅
- 200K context window (1M beta with header)
- 64K max output
- Knowledge cutoff: Jan-May 2025

### 📦 Legacy Models (Still Available)

| Model | Full ID | Alias | Pricing |
|-------|---------|-------|---------|
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | `claude-sonnet-4-0` | $3/MTok in, $15/MTok out |
| Claude Opus 4.1 | `claude-opus-4-1-20250805` | `claude-opus-4-1` | $15/MTok in, $75/MTok out |
| Claude Sonnet 3.7 | `claude-3-7-sonnet-20250219` | `claude-3-7-sonnet-latest` | $3/MTok in, $15/MTok out |
| Claude Opus 4 | `claude-opus-4-20250514` | `claude-opus-4-0` | $15/MTok in, $75/MTok out |
| Claude Haiku 3 | `claude-3-haiku-20240307` | — | $0.25/MTok in, $1.25/MTok out |

---

## OpenAI Models (Available but Not Used)

### ✅ Current Models

| Model | ID | Pricing | Use Case |
|-------|-----|---------|----------|
| **GPT-4o** | `gpt-4o` | $5/MTok in, $15/MTok out | **Our choice:** Latest, best intelligence |
| **GPT-4o mini** | `gpt-4o-mini` | $0.15/MTok in, $0.60/MTok out | Fast, cheap tasks |
| **o1** | `o1` | $15/MTok in, $60/MTok out | Complex reasoning |
| **o1-mini** | `o1-mini` | $3/MTok in, $12/MTok out | Faster reasoning |
| **GPT-4 Turbo** | `gpt-4-turbo` | $10/MTok in, $30/MTok out | Previous generation |
| **GPT-4** | `gpt-4` | $30/MTok in, $60/MTok out | Legacy |

**Our Choice:** `gpt-4o` for best balance of performance and cost.

---

## Model Aliases vs Full IDs

### What are Aliases?

Aliases automatically point to the **most recent model snapshot**.

**Example:**
- Alias: `claude-sonnet-4-5`
- Points to: `claude-sonnet-4-5-20250929`
- When new snapshot released: Alias migrates to newest version (within ~1 week)

### Production Recommendation

**For Experimentation:** Use aliases (`claude-sonnet-4-5`, `gpt-4o`)  
**For Production:** Use full IDs (`claude-sonnet-4-5-20250929`) for consistent behavior

**Our Choice:** We use **aliases** for experimentation and to automatically get model improvements.

---

## AWS Bedrock Model IDs

If using AWS Bedrock instead of direct API:

| Claude Model | Bedrock ID |
|--------------|------------|
| Claude Sonnet 4.5 | `anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Claude Haiku 4.5 | `anthropic.claude-haiku-4-5-20251001-v1:0` |
| Claude Opus 4.5 | `anthropic.claude-opus-4-5-20251101-v1:0` |

---

## Google Vertex AI Model IDs

If using Google Vertex AI:

| Claude Model | Vertex AI ID |
|--------------|--------------|
| Claude Sonnet 4.5 | `claude-sonnet-4-5@20250929` |
| Claude Haiku 4.5 | `claude-haiku-4-5@20251001` |
| Claude Opus 4.5 | `claude-opus-4-5@20251101` |

---

## Knowledge Cutoffs

### Claude 4.5 Models
- **Reliable knowledge:** Jan-May 2025 (depending on model)
- **Training data:** Jul-Aug 2025

### OpenAI Models
- **GPT-4o:** Oct 2023 (approximate)
- **o1 series:** Oct 2023 (approximate)

---

## Why These Specific Models?

### GPT-5.2 (OpenAI)
- ✅ Latest OpenAI reasoning model
- ✅ Excellent for planning and evaluation (Manager role)
- ✅ Strong tool use capabilities (Worker role)
- ✅ Cost-effective: $2/MTok input, $8/MTok output
- ✅ Consistent performance across iterations

### Claude Sonnet 4.5 (Anthropic)
- ✅ Latest Anthropic model (alias auto-updates to newest snapshot)
- ✅ Exceptional for agentic workflows and tool use
- ✅ Extended thinking support for complex reasoning
- ✅ 200K context window (1M beta available)
- ✅ Strong coding and structured output capabilities

### Evaluator Agent (Different Model)
- **Amazon Bedrock Nova:** Cost-effective, blind evaluation
- Note: Evaluator uses a separate model for unbiased assessment

---

## Model Selection Logic

**File:** `packages/shared/llm-client/vendor_assignment.py`

```python
MANAGER_MODEL = ("openai", "gpt-4o")
WORKER_MODEL = ("anthropic", "claude-sonnet-4-5")

def assign_vendor(job_id, iteration, role="manager"):
    """50/50 deterministic assignment, Manager and Worker are opposite vendors"""
    manager_vendor = _pick_manager_vendor(job_id, iteration)
    worker_vendor = "anthropic" if manager_vendor == "openai" else "openai"
    
    if role == "manager":
        return MANAGER_MODEL if manager_vendor == "openai" else ("anthropic", "claude-sonnet-4-5")
    elif role == "worker":
        return ("openai", "gpt-4o") if worker_vendor == "openai" else WORKER_MODEL
```

---

## Updating Models

### When to Update

1. **New model releases** - Check vendor docs monthly
2. **Price changes** - Update `model_pricing.py`
3. **Performance improvements** - New snapshots for current models
4. **Deprecation notices** - Migrate from legacy models

### Update Checklist

- [ ] Update `packages/shared/llm-client/vendor_assignment.py`
- [ ] Update `packages/shared/llm-client/model_pricing.py`
- [ ] Update this documentation (`docs/MODELS-REFERENCE.md`)
- [ ] Rebuild Lambda Layer 2: `./scripts/bundle-lambda-layers.sh`
- [ ] Deploy: `npx cdk deploy TilWorkflowStack --profile abstract`
- [ ] Test with new job

---

## Cost Analysis

### Our Two Models

**Per 1M Tokens (Input + Output @ 1:1 ratio):**

| Model | Cost per 1M tokens (50/50 in/out) |
|-------|-----------------------------------|
| **GPT-5.2** ⭐ | $5 ($2 in + $8 out) |
| **Claude Sonnet 4.5** ⭐ | $9 ($3 in + $15 out) |

### Other Models (Not Used)

| Model | Cost per 1M tokens (50/50 in/out) |
|-------|-----------------------------------|
| GPT-4o | $10 ($5 in + $15 out) |
| Claude Haiku 4.5 | $3 ($1 in + $5 out) |
| GPT-4o mini | $0.375 ($0.15 in + $0.60 out) |
| Claude Opus 4.5 | $15 ($5 in + $25 out) |

### Typical Job Cost

**Per Abstract Generation (1-2 iterations):**
- Manager (GPT-5.2): ~10K in, ~2K out = $0.04
- Worker (Claude Sonnet 4.5): ~15K in, ~5K out = $0.12
- Evaluator (Nova): ~8K in, ~1K out = $0.01
- **Total per job:** ~$0.17

**Or with opposite assignment:**
- Manager (Claude): ~10K in, ~2K out = $0.06
- Worker (GPT-5.2): ~15K in, ~5K out = $0.07
- Evaluator (Nova): ~8K in, ~1K out = $0.01
- **Total per job:** ~$0.14

**Average cost per job:** ~$0.15-0.17

---

## References

- **Anthropic Models:** https://platform.claude.com/docs/en/about-claude/models/overview
- **OpenAI Models:** https://platform.openai.com/docs/models
- **Anthropic Pricing:** https://www.anthropic.com/pricing
- **OpenAI Pricing:** https://openai.com/api/pricing/

---

## Adding New Models (Policy)

**If you want to change models in the future:**

1. ✅ **Evaluate necessity** - Is there a compelling reason to change?
2. ✅ **Test thoroughly** - Run 10+ jobs with new model before production
3. ✅ **Update all files:**
   - `packages/shared/llm-client/vendor_assignment.py`
   - `packages/shared/llm-client/model_pricing.py`
   - `packages/shared/tool-wrappers/red_team_review.py`
   - `docs/MODELS-REFERENCE.md`
4. ✅ **Rebuild & deploy:**
   - `./scripts/bundle-lambda-layers.sh`
   - `npx cdk deploy TilWorkflowStack --profile abstract`
5. ✅ **Document reasoning** - Update this file with WHY you changed models

**Current policy:** Stick with GPT-5.2 and Claude Sonnet 4.5 unless there's a significant performance or cost improvement.

---

## FAQs

### Why not use GPT-4o or Claude Opus?
- GPT-4o: More expensive ($10/MTok vs $5/MTok for GPT-5.2)
- Claude Opus: Much more expensive ($15/MTok vs $9/MTok)
- Our current models provide excellent performance/cost ratio

### Why not use cheaper models like GPT-4o mini or Claude Haiku?
- Abstract generation requires high-quality reasoning and writing
- Budget models may produce lower-quality outputs
- Cost savings (~$0.10/job) not worth quality risk

### Can we use different models for Manager vs Worker?
- No - policy is to use equivalent-tier models for fair A/B testing
- Both agents get same-tier models (just different vendors)

### What if a new model is released?
- Evaluate if it's significantly better (>20% improvement)
- Test with 10+ jobs
- Update documentation
- Deploy
- Monitor for regressions

---

## Version History

- **Jan 18, 2026:** Simplified to TWO MODELS ONLY (GPT-5.2 + Claude Sonnet 4.5)
- **Jan 18, 2026:** Corrected model names (aliases use dashes, not dots)
- **Jan 18, 2026:** Initial documentation with model options
