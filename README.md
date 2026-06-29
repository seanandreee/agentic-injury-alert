# Sports Injury Monitor — Betting Intelligence Agent

A TypeScript agent that monitors player injury news and surfaces betting-relevant insights using a multi-step ReAct loop, tool calls, and LiteLLM as the LLM gateway.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Agent Loop                     │
│  (ReAct cycle: Observe → Think → Act → Repeat)  │
├─────────────────────────────────────────────────┤
│                                                  │
│   1. Receives player/team queries                │
│   2. Calls tools to gather injury data           │
│   3. LLM synthesizes findings                    │
│   4. Produces structured betting report          │
│                                                  │
├───────────────┬─────────────────────────────────┤
│   Tools       │   LLM (via LiteLLM)             │
│               │                                  │
│ • search_     │   OpenAI-compatible client       │
│   injury_news │   pointed at LiteLLM proxy       │
│   (SerpAPI /  │   (/v1/chat/completions)         │
│    mock)      │                                  │
│               │   Supports any model:            │
│ • get_team_   │   • anthropic/claude-*            │
│   injuries    │   • gpt-4o, gpt-4-turbo          │
│   (team       │   • mistral, llama, etc.         │
│    report)    │                                  │
└───────────────┴─────────────────────────────────┘
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start LiteLLM proxy

```bash
pip install litellm
litellm --model anthropic/claude-sonnet-4-20250514 --port 4000
```

Or with a config file for multiple models:

```bash
litellm --config litellm_config.yaml
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your keys
```

Required:
- `LITELLM_API_KEY` — your LiteLLM proxy key (or upstream provider key)
- `LITELLM_BASE_URL` — LiteLLM proxy URL (default: `http://localhost:4000`)
- `LITELLM_MODEL` — model identifier (default: `anthropic/claude-sonnet-4-20250514`)

Optional:
- `SERPAPI_KEY` — for live web search (falls back to mock data without it)

### 4. Run the agent

```bash
# Demo mode (pre-configured players)
npm run dev

# Specify players
npm run dev -- "LeBron James,Los Angeles Lakers,NBA"
npm run dev -- "Patrick Mahomes,Kansas City Chiefs,NFL" "Shohei Ohtani,Los Angeles Dodgers,MLB"

# JSON input
npm run dev -- --json '[{"name":"LeBron James","team":"Los Angeles Lakers","sport":"NBA"}]'
```

### 5. Run evals

```bash
npm run eval
```

## Project Structure

```
src/
├── index.ts      Entry point — CLI, parses args, kicks off agent
├── agent.ts      Core ReAct agent loop (multi-step with tool calling)
├── llm.ts        LiteLLM client (OpenAI-compatible via openai SDK)
├── tools.ts      Tool implementations (search_injury_news, get_team_injuries)
├── config.ts     Configuration from environment variables
├── types.ts      TypeScript types for reports, insights, tool calls
└── eval.ts       Eval suite — injury severity classification accuracy
```

## How the Agent Loop Works

The agent follows a **ReAct** (Reasoning + Acting) pattern:

1. **System prompt** instructs the LLM on its role and output schema
2. **User message** lists the players/teams to investigate
3. **Loop** (up to 8 iterations):
   - LLM decides which tools to call (or produces a final answer)
   - Tools execute and return results
   - Results are fed back to the LLM as tool messages
4. **Final output** is a structured JSON report with injuries and betting insights

Each iteration is a full LLM call through LiteLLM. The agent autonomously decides:
- Which players need individual searches
- When to pull team-wide injury reports
- When it has enough information to synthesize

## Output Schema

The agent produces a structured `AgentReport`:

```typescript
{
  generatedAt: string;          // ISO timestamp
  queriedPlayers: PlayerQuery[];
  injuries: InjuryReport[];     // Each with severity, status, source
  bettingInsights: BettingInsight[];  // Impact level, affected markets, reasoning
  summary: string;              // Executive summary
}
```

## Evals

The eval suite (`npm run eval`) tests injury severity classification against 8 hardcoded ground-truth cases spanning:

| Case | Sport | Injury | Expected Severity |
|------|-------|--------|-------------------|
| Foot soreness | NBA | Day-to-day soreness | minor |
| ACL tear | NFL | Season-ending surgery | severe |
| Hamstring strain | MLB | Grade 2, 4-6 weeks | moderate |
| Ankle sprain | NBA | High ankle, 2-3 weeks | moderate |
| Concussion | NFL | In protocol | moderate |
| Rest day | NFL | Veteran load management | minor |
| Tommy John | MLB | 12-18 month surgery | severe |
| Back tightness | NBA | Probable, full practice | minor |

Exit code is 0 if all pass, 1 otherwise — suitable for CI.

## LiteLLM Integration

All LLM calls route through LiteLLM using the OpenAI-compatible API. This means:

- **Provider-agnostic**: Swap between Anthropic, OpenAI, Mistral, local models
- **Standard SDK**: Uses the official `openai` npm package
- **Observability**: LiteLLM provides logging, rate limiting, and cost tracking
- **No vendor lock-in**: Change models in config without code changes

```typescript
// The client points at LiteLLM, not directly at Anthropic
const client = new OpenAI({
  baseURL: "http://localhost:4000/v1",
  apiKey: process.env.LITELLM_API_KEY,
});
```
