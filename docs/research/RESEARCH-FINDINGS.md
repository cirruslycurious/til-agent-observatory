# Research Findings: What 700+ Runs Revealed About Agentic AI

After more than 700 controlled runs across models, conferences, and topics, clear patterns emerged. Some genuinely surprised me.

**Important framing**: None of what follows are claims that one model is "better" than another, nor evidence of training bias or hidden intent. These are **observed signals, grounded in data, not explanations**. They describe what happened under constraint, not why it happened.

---

## Methodology

Each run followed an identical workflow:
- **Random vendor assignment**: 50/50 OpenAI (GPT-5.2) vs Anthropic (Claude Sonnet 4.5)
- **Stratified by context**: 5 conferences × 8 topics = 40 context combinations
- **Up to 5 iterations**: Manager could accept or reject, providing feedback
- **Triple-blind scoring**: Manager self-score + 2 independent Nova assessors
- **Acceptance threshold**: 7.901 blended score (after penalties)

### The Evaluation Architecture

This is where TIL gets interesting. We built a multi-perspective evaluation system specifically to study how different evaluation lenses affect agent behavior.

#### The Blind Evaluator: Conference Fit Signal

The Evaluator agent receives **only the title and abstract** - it never sees the target conference. Its job: predict which of 7 conferences (5 real + 2 decoys) this abstract was written for.

**Why this matters:**
- If the blind evaluator correctly predicts the target conference, the abstract has strong "conference fit" - it reads like it belongs there
- If it predicts incorrectly, the abstract may be generic or sound like a different venue
- If it picks a decoy (Microsoft Ignite or RSA Conference - conferences we never generate for), that's a red flag

This creates a mechanical, ungameable signal: the abstract either sounds like a KubeCon talk or it doesn't.

#### Three Scoring Personas

Each abstract is evaluated by three independent assessors, each with a different prompt and perspective:

| Assessor | Model | Perspective | What It Values |
|----------|-------|-------------|----------------|
| **Manager Self-Score** | GPT-5.2 or Claude Sonnet 4.5 (same as worker) | The orchestrator rates its own work | Conference fit, technical depth, novelty |
| **Nova Assessor 1** | Amazon Nova Pro | **Program committee member** - academic rigor lens | Methodology, validation, statistical rigor |
| **Nova Assessor 2** | Amazon Nova Pro | **Engaged conference attendee** - audience value lens | "Would I attend this talk?", clear payoff, practical depth |

All three score on the same three dimensions (Conference Fit, Technical Depth, Novelty) on a 1-10 scale. The **blended score** is the simple average of all three.

**Why three assessors?**
- Reduces single-model bias (no single LLM decides)
- The Nova assessors use different prompts: one asks "is this rigorous enough for peer review?" while the other asks "would I rearrange my schedule to see this?"
- The Manager self-score reveals whether the worker's own vendor agrees with external assessment

#### The Penalty: Conference Misidentification

A **-0.05 penalty** is applied to the blended score if the blind Evaluator incorrectly predicts the target conference.

The philosophy: an abstract that doesn't "sound like" its target conference - regardless of how well-written - has a conference fit problem. This penalty is small but meaningful when the acceptance threshold is 7.901.

#### Non-Prescriptive Feedback

When an abstract is rejected, the feedback is intentionally vague:

> "The abstract needs improvement to meet the quality bar (current: 7.85/10, required: 7.901)."

The Manager does **not** tell the Worker:
- Which sentences to change
- What keywords to add
- How to restructure the abstract

**This is deliberate.** Part of the experiment is observing whether agents can figure out *how* to improve on their own. Do they use tools differently on iteration 2? Do they change strategy? Can they break through their stylistic priors?

(Spoiler: they adapt tool usage dramatically but struggle to transform their underlying voice. See Finding 4.)

---

The same prompts, tools, and evaluation criteria applied to both vendors. The only variable was which LLM wrote the abstract.

---

## Finding 1: Anthropic Shows Higher Variance, OpenAI Shows Consistency

Anthropic shows **significantly higher variance** in accepted work quality:
- 70.5% higher variance
- Kurtosis 3.17 vs 1.59
- **3x more peak-quality abstracts** (8.2+ scores)
- But also greater spread at lower quality tiers

OpenAI demonstrates more consistent performance with lower variance and fewer extreme outcomes in both directions.

**The data shows**: Anthropic concentrates at extremes (peaks and threshold), while OpenAI shows fuller representation in middle ranges.

**Implication**: Anthropic is a higher-risk, higher-reward model in this task.

---

## Finding 2: Model Performance Varies Dramatically by Domain

| Conference | Top-100 Representation | Bottom-100 Representation |
|------------|----------------------|--------------------------|
| Black Hat | 70% | 24% |
| KubeCon | 18% | 31% |
| Google Cloud Next | 8% | 22% |
| re:Invent | 4% | 17% |
| Gartner Symposium | 0% | 6% |

Both models excel at technical security content (peaks at 8.3-8.5) but struggle with executive-strategic content (clusters at 7.92-7.95).

**What's observable**: Certain conference/topic combinations consistently produce higher or lower scores, regardless of iteration or model.

---

## Finding 3: Evaluators Reward Aggressive Framing, Penalize Transformation Narratives

**What evaluators accept (top-100)**: 74% use aggressive, outcome-focused framing
- "Breaking the Build" (34%)
- "Weaponizing SQL" (17%)
- "Exploiting CI/CD Pipelines" (23%)

**What evaluators reject**: 62% use transformation/journey framing
- "From X to Y" pattern (62%)
- "Building/Implementing" constructive framing (30%)

**What barely passes (bottom-100 accepted)**: Mixed signals
- Only 15% aggressive framing
- 22% constructive framing

The evaluation layer (Nova assessor + Manager model) consistently scores aggressive, outcome-focused titles higher than transformation narratives. The worker model generates both patterns; the evaluator layer differentially rewards them.

---

## Finding 4: Agents Adapt Tool Use, But Can't Escape Stylistic Priors

Tool usage changes dramatically after rejection:

| Tool | Iteration 0 | Iteration 1 | Iteration 2+ |
|------|-------------|-------------|--------------|
| Red team review | 1% | 97% | 74% |
| DynamoDB Lookups | 97% | 8% | 4% |

But job success rates stay context-bound:
- **Black Hat**: 88% success (85% OpenAI, 91% Anthropic)
- **Gartner**: 9% success (8% OpenAI, 9% Anthropic)

Even though Gartner relies far more heavily on iteration to achieve those successes.

**Key insight**: Agents learn to change strategy (tool selection) but can't transform their underlying voice. **Iteration helps you approach your ceiling, not break through it.**

---

## Finding 5: Rhetorical Strategy Differences Are Context-Dependent

Both vendors converge on fundamental content metrics (analyzed across top-200 abstracts):

**Surface-level parity**:
- Average length: 299.6 vs 304.6 words
- Technical term density: 3.5 vs 4.0 terms per abstract
- Word preferences: Both prefer "demonstrates" over "shows" (~90%)

**Rhetorical strategy differences emerge at the extremes**:

| Metric | Anthropic (Top-25) | OpenAI (Top-25) |
|--------|-------------------|-----------------|
| "Blind spot" framing | 44.4% | 0% |
| "Live demonstrations" | 33.3% | 14.3% |

As scoring decreases, patterns converge:
- Ranks 26-50: Anthropic drops to 8.3% blind spot usage
- Ranks 101-200: Both vendors at ~5% blind spot usage

**The rhetorical advantage only exists at peaks** - it's not distributed across all scoring tiers.

---

## Finding 6: First-Shot Success Predicts Overall Acceptance

Conference rankings by overall acceptance rate and first-shot acceptance rate are **identical**:

| Conference | Overall Acceptance | First-Shot Acceptance | Iteration Lift |
|------------|-------------------|----------------------|----------------|
| Black Hat | 90% | 72% | 25% |
| KubeCon | 66% | 31% | 111% |
| Google Cloud Next | 60% | 17% | 248% |
| re:Invent | 46% | 4% | 967% |
| Gartner Symposium | 38% | 1% | 4,900% |

**The iteration paradox**: When alignment is poor, iteration becomes more critical but less effective.

In well-aligned contexts (Black Hat), models succeed immediately and iteration provides marginal gains. In misaligned contexts (Gartner), iteration becomes essential—recovering 86-91% of total accepted work—yet overall acceptance remains lower.

**However**: The highest-scoring abstract (8.527) came from iteration 2, not iteration 1 (max 8.360), proving that iteration *can* produce peak quality. But this occurred in Black Hat × Platform DevOps—a context where models already show strong alignment.

**Peak performance requires both favorable context AND adaptive refinement.**

---

## What This Reveals

The models performed remarkably similar overall. Acceptance rates by conference and topic tracked closely between vendors. Tool usage patterns matched. Content density converged.

But differences emerged at the margins—and those differences are revealing.

### The Evaluation Layer Applies Different Standards

Even within the same industry (IT conferences), even with the same goal (compelling abstracts), the evaluation layer applies dramatically different standards:
- 90% acceptance for Black Hat
- 38% for Gartner

The worker models produce similar outputs across contexts—similar length, similar technical density, similar vocabulary. But Nova + Manager score them radically differently.

### Context Matters More Than Capability

The same models, tools, and goals produce 90% acceptance in one conference and 38% in another. Agents adapt their strategies but can't escape the evaluative standards they can't see.

**This matters for anyone building agentic systems**: Optimization for one context doesn't transfer to adjacent ones, even when the goal appears identical. The question isn't which model is better—it's whether your workflow matches the implicit expectations of your evaluation layer.

---

## Explore the Data

The live dashboard allows you to explore these patterns yourself:
- Filter by vendor, conference, and topic
- View score distributions and acceptance rates
- Examine tool usage patterns across iterations
- See the top-performing abstracts

---

## Limitations

- **Single domain**: Conference abstracts may not generalize to other tasks
- **Specific models**: GPT-5.2 and Claude Sonnet 4.5 at a point in time
- **Nova evaluation**: Findings reflect Nova's scoring preferences, which may have their own biases
- **Observational**: Correlations, not causal claims

These are signals worth investigating further, not definitive conclusions about model capabilities.
