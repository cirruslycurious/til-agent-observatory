# Dashboard V2 User Guide

**Purpose:** Learn how to read, interpret, and use the behavioral analytics dashboards to understand agent cognition patterns.

**Audience:** Technical users curious about how AI agents behave under different conditions.

---

## 🎯 Overview

Dashboard V2 is **not** about measuring success rates or effectiveness. It's about understanding **how agents think**:

- **What tools do they choose?**
- **How do strategies evolve?**
- **Do OpenAI and Anthropic agents think differently?**
- **Which contexts drive different behaviors?**

Think of it as an **agent cognition observatory** - you're studying behavioral patterns, not scorecards.

---

## 📊 The Five Dashboards

### 1. **Tool Behavior** - Agent Cognition Analysis
**Question:** "How do agents use tools? Do they adapt?"

**What you'll see:**
- Overall tool usage rates (% of jobs using each tool)
- Strategy evolution across iterations (do tools get adopted/abandoned?)
- Vendor cognitive differences (OpenAI vs Anthropic tool preferences)
- Learning curves (how fast do agents adapt their strategies?)
- Conference/topic impact on tool choices

**How to interpret:**
- **High usage early + drops late** → Agents front-load research
- **Low usage early + spikes late** → Agents adopt after learning
- **Delta > 15% between vendors** → Significant cognitive divergence
- **Positive learning velocity** → Tool adoption is increasing
- **Negative learning velocity** → Tool usage is decreasing

**What to look for:**
- Which tools are essential vs optional?
- Do agents learn to use validation tools (red_team_review)?
- Are vendors converging or diverging on strategies?
- Which conferences/topics drive unique tool patterns?

---

### 2. **Vendor Manager** - Scoring Behavior Deep Dive
**Question:** "How do OpenAI and Anthropic Managers score abstracts differently?"

**What you'll see:**
- Average scores by vendor (rejection vs acceptance)
- Manager self-assessment vs Nova assessor scores
- Penalty/bonus patterns
- Decision patterns (first iteration acceptance, avg iterations)
- Stratified by conference and topic

**How to interpret:**
- **Manager Self > Nova scores** → Manager is more optimistic than independent assessors
- **Manager Self < Nova scores** → Manager is more critical than independent assessors
- **High avg penalty** → Manager frequently penalizes (negative adjustment)
- **High avg bonus** → Manager frequently rewards (positive adjustment)
- **Low first iteration acceptance** → Manager has high standards early
- **High avg iterations** → Manager requires more refinement

**Key metrics explained:**
- **Manager Self**: Manager's own assessment using its LLM (OpenAI/Anthropic)
- **Nova 1**: Primary Nova assessor (minimal boost via rounding to 0.05)
- **Nova 2**: Secondary Nova assessor (medium boost via +0.25)
- **Blended**: Average of Manager Self + Nova 1 + Nova 2
- **Penalty/Bonus**:
  - **Negative** (e.g., -0.15) = Penalty (bad, lowers score)
  - **Positive** (e.g., +0.15) = Bonus (good, raises score)
- **Final**: Blended score + penalties/bonuses

**What to look for:**
- Are OpenAI and Anthropic Managers calibrated similarly?
- Do they penalize/reward for the same reasons?
- Which conferences/topics trigger stricter scoring?
- Is there vendor bias in self-assessment?

---

### 3. **Context Effects** - Difficulty Ranking
**Question:** "Which conference/topic combinations are hardest?"

**What you'll see:**
- Difficulty ranking (contexts sorted by challenge level)
- Performance by conference (OpenAI vs Anthropic acceptance rates)
- Performance by topic (OpenAI vs Anthropic acceptance rates)

**How to interpret:**
- **Difficulty Score formula**: `Avg Iterations + (Failure Rate × 5)`
  - Higher score = harder context
  - Score > 3.5 = Very challenging (red)
  - Score 2.5-3.5 = Challenging (orange)
  - Score 1.5-2.5 = Moderate (yellow)
  - Score < 1.5 = Easier (green)
- **Acceptance Rate**: % of jobs accepted (NOT including iteration-4 compromises)
- **Delta**: Difference between OpenAI and Anthropic acceptance rates
  - Positive = OpenAI performs better
  - Negative = Anthropic performs better

**What to look for:**
- Which conference/topic pairs require the most iterations?
- Are certain conferences universally harder?
- Do vendors perform differently on specific contexts?
- Which topics are most challenging regardless of conference?

---

### 4. **Speed & Efficiency** - Timing Analysis
**Question:** "How fast do different vendors/contexts execute?"

**What you'll see:**
- Average execution times by vendor
- Timing by iteration (does it speed up or slow down?)
- Timing by conference and topic
- Timing breakdowns by workflow phase

**How to interpret:**
- **Faster execution** ≠ Better quality (speed vs thoroughness tradeoff)
- **Slower iterations late** → Agents spending more time refining
- **Faster iterations late** → Agents getting more efficient
- **High variance** → Inconsistent execution patterns

**What to look for:**
- Are vendors consistently fast/slow?
- Do certain conferences/topics take longer?
- Are there timing anomalies (outliers)?
- Is there a correlation between time and quality?

---

### 5. **Evaluator Analysis** - Blind Prediction Accuracy
**Question:** "Can the blind evaluator predict the target conference?"

**What you'll see:**
- Overall accuracy rate (correct top-1 predictions)
- Top-3 accuracy (target in top 3 predictions)
- Confusion matrix (which conferences get mistaken for each other?)
- Confidence calibration (are confident predictions more accurate?)

**How to interpret:**
- **High accuracy** → Abstracts clearly demonstrate conference fit
- **Low accuracy** → Abstracts are generic/ambiguous
- **High confidence + correct** → Strong conference signal
- **High confidence + wrong** → False signals (overfit to wrong conference)
- **Confusion pairs** → Similar conferences (e.g., KubeCon ↔ Cloud Next)

**What to look for:**
- Are abstracts genuinely conference-specific?
- Which conferences are hardest to distinguish?
- Do decoy conferences ever get predicted? (should be rare)
- Is evaluator confidence calibrated with accuracy?

---

## 🔍 Key Concepts

### Confidence Levels (Sample Size)

Every dashboard shows confidence indicators based on sample size:

- 🟢 **High Confidence** (n ≥ 50): Trust the data, draw strong conclusions
- 🟡 **Medium Confidence** (20-49): Directional insights, treat as preliminary
- 🔴 **Low Confidence** (10-19): Exploratory only, don't over-interpret
- ⚠️ **Insufficient Data** (< 10): Not enough data for reliable analysis

**Why this matters:** Small sample sizes can show spurious patterns. Always check the sample size before drawing conclusions.

---

### Vendor Comparison

When comparing OpenAI vs Anthropic:

- **Cognitive Differences**: Tool preferences, scoring behavior, adaptation patterns
- **Performance Differences**: Acceptance rates, iterations required, speed
- **Context Sensitivity**: Do vendors respond differently to conferences/topics?

**Important:** Both vendors rotate roles (Manager vs Worker are always opposite vendors). This creates natural variation for fair comparison.

---

### Tool Usage Patterns

**Common patterns to recognize:**

1. **Front-Loading Research**
   - High dynamodb_lookup, search_abstracts usage in iteration 0
   - Drops sharply in later iterations
   - **Interpretation:** Agents gather context early, then focus on writing

2. **Late-Stage Validation**
   - Low red_team_review usage in iteration 0
   - Spikes in iterations 3-4
   - **Interpretation:** Agents adopt validation after learning from feedback

3. **Abandoned Strategies**
   - High web_search usage in iteration 0
   - Drops to near-zero by iteration 4
   - **Interpretation:** Agents tried web search, found it unhelpful, stopped using it

4. **Persistent Core Tools**
   - Consistent high usage across all iterations
   - **Interpretation:** Essential tools for the task (e.g., dynamodb_lookup for guidance)

---

### Manager Scoring Mechanics

**Triple Scoring System:**

1. **Manager Self-Assessment**: Manager uses its own LLM (OpenAI or Anthropic) to score
2. **Nova Assessor 1**: Independent Nova scoring (minimal boost via rounding)
3. **Nova Assessor 2**: Independent Nova scoring (medium boost via flat +0.25)

**Score Transforms:**
- **Manager**: Round up to nearest 0.5 (e.g., 7.83 → 8.0)
- **Nova 1**: Round up to nearest 0.05 (e.g., 7.83 → 7.85)
- **Nova 2**: Add +0.25 flat (e.g., 7.83 → 8.08)

**Blended Score:** Average of all three transformed scores

**Penalties/Bonuses:**
- **Decoy susceptibility**: -0.15 if evaluator ranks decoy in top position, -0.05 if in positions 2-3
- **Red team review bonus**: +0.15 if red_team_review used across any iteration

**Final Score:** Blended - Penalties + Bonuses

**Decision:** Accept if Final Score ≥ Threshold (currently 7.90)

---

### Learning Velocity

**Formula:** `(Usage Rate at Iter 4) - (Usage Rate at Iter 0)`

**Interpretation:**
- **+50%**: Tool adoption increased dramatically (e.g., 20% → 70%)
- **+10-30%**: Moderate increase in adoption
- **0%**: Stable usage across iterations
- **-10-30%**: Moderate decrease (tool being phased out)
- **-50%**: Tool largely abandoned (e.g., 80% → 30%)

**What it tells you:** How quickly agents adapt their strategies based on feedback.

---

### Convergence Score

**Formula:** `100 - Average(|OpenAI - Anthropic| for each tool)`

**Interpretation:**
- **>80%**: High convergence - vendors using very similar strategies
- **60-80%**: Moderate convergence - some differences but generally aligned
- **<60%**: Divergence - vendors have distinctly different approaches

**What it tells you:** Whether vendors arrive at similar strategies for a given context or maintain unique cognitive styles.

---

## 🎓 Common Research Questions

### "Which tools are essential?"

**Dashboard:** Tool Behavior → Overall Tool Usage

**Look for:**
- Tools with >70% usage rate
- Tools with consistent usage across all iterations
- Tools that vendors agree on (low delta)

**Example finding:** "dynamodb_lookup has 95% usage, 0 delta between vendors → Essential tool for all agents"

---

### "Do agents learn from feedback?"

**Dashboard:** Tool Behavior → Strategy Evolution

**Look for:**
- Tools with steep learning curves (high velocity)
- Iteration 0 vs Iteration 4 usage differences
- Vendor-specific learning patterns

**Example finding:** "red_team_review: 18% → 92% (+74 velocity) → Agents increasingly adopt validation after rejection feedback"

---

### "Are OpenAI and Anthropic Managers calibrated?"

**Dashboard:** Vendor Manager → Scoring Behavior

**Look for:**
- Differences in average scores (acceptance vs rejection)
- Manager Self vs Nova assessor gaps
- Penalty/bonus patterns

**Example finding:** "OpenAI Manager Self: 7.8 avg, Anthropic Manager Self: 7.5 avg → OpenAI slightly more optimistic"

---

### "Which contexts are hardest?"

**Dashboard:** Context Effects → Difficulty Ranking

**Look for:**
- High difficulty scores (>3.5)
- Low acceptance rates
- High average iterations

**Example finding:** "Black Hat + Security topic: 4.2 difficulty, 65% acceptance, 3.8 avg iterations → Hardest context"

---

### "Do conferences drive different strategies?"

**Dashboard:** Tool Behavior → Conference Context Effects

**Look for:**
- High variance in tool usage by conference
- Conference-specific tool patterns
- Vendor convergence/divergence by conference

**Example finding:** "KubeCon: search_abstracts 95%, web_search 5% | Gartner: search_abstracts 60%, web_search 40% → Gartner requires more external research"

---

### "Is evaluator accuracy improving?"

**Dashboard:** Evaluator Analysis → Accuracy Trends

**Look for:**
- Accuracy rate over time
- Confidence calibration
- Confusion matrix patterns

**Example finding:** "Top-1 accuracy: 78%, Top-3 accuracy: 92% → Strong conference signals in abstracts"

---

## 💡 Actionable Insights

### For System Designers

**Use dashboards to:**
1. **Identify missing tools**: If agents struggle with specific contexts, what tools would help?
2. **Optimize prompts**: If agents abandon useful tools, are prompts discouraging their use?
3. **Tune scoring thresholds**: If Manager scores are misaligned with outcomes, adjust transforms
4. **Add targeted examples**: If conferences are confused, add distinguishing examples to guidance

---

### For Researchers

**Use dashboards to:**
1. **Study cognitive styles**: How do different LLMs approach the same problem?
2. **Measure adaptation**: How quickly do agents learn from feedback?
3. **Identify biases**: Are there systematic scoring/behavior biases by vendor?
4. **Understand context effects**: Which problem characteristics drive behavioral changes?

---

### For Product Managers

**Use dashboards to:**
1. **Assess model selection**: Which vendor is best suited for your use case?
2. **Understand cost-quality tradeoffs**: Do faster models sacrifice important behaviors?
3. **Identify training needs**: Which behaviors need reinforcement?
4. **Monitor system health**: Are agents regressing on key behaviors?

---

## 🚨 Common Pitfalls

### 1. **Ignoring Sample Size**
❌ "Anthropic uses web_search 80% of the time" (n=3)
✅ "Anthropic uses web_search 80% of the time, but low confidence (n=3) - need more data"

### 2. **Confusing Correlation with Causation**
❌ "Red team review causes higher scores"
✅ "Jobs with red team review tend to have higher scores (correlation)"

### 3. **Over-Interpreting Small Differences**
❌ "OpenAI scores 7.8, Anthropic scores 7.75 - OpenAI is better!"
✅ "OpenAI and Anthropic scores are very similar (0.05 difference, likely noise)"

### 4. **Cherry-Picking Data**
❌ Looking only at contexts where your preferred vendor wins
✅ Looking at all contexts and understanding variance

### 5. **Treating Speed as Quality**
❌ "Vendor A is 2x faster → Vendor A is better"
✅ "Vendor A is faster, but does it maintain quality? Check acceptance rates and scores"

### 6. **Ignoring Context**
❌ "Vendor B fails 30% of the time → Vendor B is bad"
✅ "Vendor B fails 30% on Black Hat Security topics but 5% on others → Context-dependent"

---

## 📈 Dashboard Navigation Tips

### 1. **Start Broad, Then Drill Down**
- Begin with Tool Behavior → Overall Usage
- Then explore specific tools in Strategy Evolution
- Finally check Vendor × Context interactions

### 2. **Compare Across Dashboards**
- Tool Behavior shows WHAT agents do
- Vendor Manager shows HOW they evaluate
- Context Effects shows WHERE they struggle
- Speed shows HOW FAST they work
- Evaluator shows WHETHER output is distinctive

### 3. **Look for Patterns, Not Outliers**
- One unusual job doesn't indicate a trend
- Consistent patterns across 20+ jobs are meaningful
- Use confidence indicators to guide interpretation

### 4. **Use Filters Strategically**
- Filter by date range to see trends over time
- Filter by conference to understand domain-specific behavior
- Filter by vendor to isolate cognitive differences

### 5. **Export Data for Deep Analysis**
- Use CSV export for statistical analysis
- Correlate dashboard data with job outcomes
- Build custom visualizations for specific research questions

---

## 🔗 Related Documentation

- **[Triple Scoring System](/docs/DUAL-NOVA-SCORING-PLAN.md)**: Deep dive into Manager scoring mechanics
- **[Tool Behavior V2 Plan](/docs/TOOLS-DASHBOARD-V2-PLAN.md)**: Technical implementation details
- **[Credibility System Design](/docs/CREDIBILITY-SYSTEM-DESIGN.md)**: Future direction for Manager accountability
- **[README](/README.md)**: System overview and architecture

---

## 📞 Feedback & Questions

Dashboard V2 is designed for exploratory research. If you have:
- **Feature requests**: What questions can't you answer with current dashboards?
- **Interpretation questions**: Not sure how to read a metric?
- **Data quality issues**: Seeing unexpected patterns?

Open an issue in the repository with the tag `dashboard-v2`.

---

**Last Updated:** 2026-01-20
**Status:** Production - All dashboards deployed and operational
