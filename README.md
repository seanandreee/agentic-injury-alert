# Sports Injury Monitor — Betting Intelligence Agent

A TypeScript agent that researches player injury news and produces structured, betting-relevant reports. Built as a demonstration of applied AI engineering concepts: ReAct agent loops, LLM tool calling, LiteLLM as a model gateway, and automated evals.

---

## What It Does

Given a list of players, the agent:

1. Searches for recent injury and lineup news for each player
2. Pulls the full team injury report for broader context
3. Synthesizes findings into a structured JSON report with injury severity classifications and betting market impact assessments

The agent decides autonomously how many tool calls to make and when it has enough information to stop. It's not a single LLM call with a template, it's a loop that reasons and acts.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Agent Loop                     │
│  (ReAct cycle: Observe → Think → Act → Repeat)  │
├─────────────────────────────────────────────────┤
│  1. Receives player/team queries                 │
│  2. Calls tools to gather injury data            │
│  3. LLM synthesizes findings                     │
│  4. Produces structured betting report           │
├───────────────┬─────────────────────────────────┤
│   Tools       │   LLM Gateway (LiteLLM)         │
│               │                                  │
│ • search_     │   OpenAI-compatible client       │
│   injury_news │   pointed at LiteLLM proxy       │
│   (SerpAPI /  │   (localhost:4000)               │
│    mock)      │                                  │
│               │   Swap models without code       │
│ • get_team_   │   changes — Claude, GPT-4,       │
│   injuries    │   Mistral, local models          │
│   (team       │                                  │
│    report)    │                                  │
└───────────────┴─────────────────────────────────┘
```

---

## Project Structure

```
src/
├── index.ts      Entry point — CLI arg parsing, kicks off agent
├── agent.ts      Core ReAct loop (multi-step tool calling + response parsing)
├── llm.ts        LiteLLM client (OpenAI-compatible via openai SDK)
├── tools.ts      Tool implementations: search_injury_news, get_team_injuries
├── config.ts     Environment variable configuration
├── types.ts      TypeScript interfaces for reports, insights, tool calls
└── eval.ts       Eval suite — injury severity classification accuracy
```

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.8+ (for LiteLLM proxy)
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
# Required
ANTHROPIC_API_KEY=sk-ant-...       # Your Anthropic API key
LITELLM_API_KEY=any-string-here    # A key you make up — used to secure the local proxy

# Optional — defaults shown
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MODEL=anthropic/claude-sonnet-4-6

# Optional — enables live web search (falls back to mock data without it - this is what I did)
SERPAPI_KEY=your-serpapi-key
```

> **Note on `LITELLM_API_KEY`:** This is not a key you get from a sign-up — it's a password you choose to secure your local LiteLLM proxy. Set it to anything and use the same value when starting LiteLLM.

### 3. Start the LiteLLM proxy

```bash
pip install 'litellm[proxy]'
python -m litellm --model anthropic/claude-sonnet-4-6 --port 4000 --master_key your-key-here
```

The proxy must be running before you start the agent. It acts as a gateway between the agent and the Anthropic API, allowing you to swap models without changing code.

### 4. Run the agent

```bash
# Demo mode (pre-configured players)
npm run dev

# Specific players
npm run dev -- "LeBron James,Los Angeles Lakers,NBA"
npm run dev -- "Patrick Mahomes,Kansas City Chiefs,NFL"

# Multiple players
npm run dev -- "LeBron James,Los Angeles Lakers,NBA" "Shohei Ohtani,Los Angeles Dodgers,MLB"

# JSON input
npm run dev -- --json '[{"name":"LeBron James","team":"Los Angeles Lakers","sport":"NBA"}]'
```

### 5. Run evals

```bash
npm run eval
```

---

## How the Agent Loop Works

The agent uses a **ReAct** (Reasoning + Acting) pattern, the same loop used in production AI systems:

```
1. Send player list + system prompt to LLM via LiteLLM
2. LLM responds with either:
   a. Tool call(s) → execute tools, append results to conversation, loop again
   b. Final answer  → parse structured report and return
3. Repeat up to 8 iterations
```

Each iteration is a full LLM call. The agent decides on its own:
- Which players need individual news searches
- When to pull a team-wide injury report for context
- When it has enough information to synthesize a final answer

The agent caps at 8 iterations to prevent runaway loops — a practical guard that matters in production.

---

## Tools

### `search_injury_news(player_name, team, sport)`
Searches for recent injury and lineup news for a specific player. Uses SerpAPI (Google Search) when a key is configured, falls back to mock data for demo purposes.

### `get_team_injuries(team, sport)`
Returns the full injury report for a team. Currently uses mock data for demonstration — the natural next step is wiring in a live sports data API such as [SportsDataIO](https://sportsdata.io) or [The Odds API](https://the-odds-api.com).

Tool schemas are defined in `tools.ts` using the OpenAI function-calling format, which is what the LLM uses to know what arguments to pass when invoking a tool.

---

## Output Schema

```typescript
{
  generatedAt: string;           // ISO timestamp
  queriedPlayers: PlayerQuery[]; // Input players
  injuries: InjuryReport[];      // Per-player: severity, status, source, return timeline
  bettingInsights: BettingInsight[]; // Impact level, affected markets, reasoning
  summary: string;               // 2-3 sentence executive summary
}
```

Severity classifications: `minor` (day-to-day, soreness) | `moderate` (multi-week, sprains) | `severe` (season-ending, surgery)

Betting markets assessed: spread, moneyline, over/under, player props, futures

---

## Example Output

Running the agent against three players across NBA, NFL, and MLB (demo mode with mock data):

```bash
npm run dev
```

**Agent trace:**
- Iteration 1: 6 tool calls fired in parallel — `search_injury_news` for each player, `get_team_injuries` for each team
- Iteration 2: LLM synthesized all results into a final report

**Report summary produced:**

> The most urgent betting situation is LeBron James' Questionable status (left foot soreness) ahead of a high-profile Lakers-Celtics matchup — his absence would dramatically shift the spread and moneyline. Patrick Mahomes' ankle sprain is currently low-risk with X-rays negative, but his rushing props deserve a downward adjustment. Shohei Ohtani's elbow rehab is pitching-only and does not affect his DH role or hitting props, making him a reliable target in those markets.

**Sample betting insight (LeBron James):**

```json
{
  "player": "LeBron James",
  "team": "Los Angeles Lakers",
  "impactLevel": "high",
  "affectedMarkets": ["spread", "moneyline", "over/under", "player props"],
  "recommendation": "Fade the Lakers spread if LeBron is ruled out. If he plays, his props may carry value given potential rust or limited minutes.",
  "reasoning": "LeBron is the Lakers' offensive engine. A Questionable tag against Boston shifts win probability significantly. Combined with Vanderbilt out indefinitely, his absence could swing a spread by 4-6 points."
}
```

> Note: This run used mock data. Wire in a SerpAPI key for live web search results.

---

## Evals

The eval suite (`npm run eval`) tests the agent's injury severity classification against 8 hardcoded ground-truth cases across NBA, NFL, and MLB:

| Case | Sport | Injury | Expected |
|---|---|---|---|
| Foot soreness | NBA | Day-to-day | minor |
| ACL tear | NFL | Season-ending surgery | severe |
| Hamstring strain | MLB | Grade 2, 4-6 weeks | moderate |
| Ankle sprain | NBA | High ankle, 2-3 weeks | moderate |
| Concussion | NFL | In protocol | moderate |
| Load management | NFL | Veteran rest | minor |
| Tommy John | MLB | 12-18 month surgery | severe |
| Back tightness | NBA | Probable, full practice | minor |

Exits with code `0` if all cases pass, `1` otherwise — compatible with CI pipelines.

---

## LiteLLM Integration

All LLM calls route through LiteLLM using its OpenAI-compatible API:

```typescript
// llm.ts — the client points at LiteLLM, not directly at Anthropic
const client = new OpenAI({
  baseURL: "http://localhost:4000/v1",
  apiKey: process.env.LITELLM_API_KEY,
});
```

This means:
- **Model-agnostic** — swap between Claude, GPT-4, Mistral, or local models by changing one env variable
- **No vendor lock-in** — the agent code itself has no Anthropic-specific imports
- **Observability** — LiteLLM provides request logging, cost tracking, and rate limiting out of the box

---

## What's Next

- [ ] Wire `get_team_injuries` to a live sports data API (SportsDataIO, ESPN API)
- [ ] Add SerpAPI key for real-time web search instead of mock data
- [ ] Expand eval suite to cover betting impact classification, not just severity
- [ ] Add a simple web UI to query players and view reports