import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createClient, getModel } from "./llm.js";
import { executeTool, toolDefinitions } from "./tools.js";
import { config } from "./config.js";
import type { AgentReport, AgentStep, PlayerQuery } from "./types.js";

const SYSTEM_PROMPT = `You are a sports injury intelligence agent specializing in betting-relevant analysis.

Your job:
1. For each player/team the user asks about, search for the latest injury and lineup news.
2. Also pull the full team injury report for broader context.
3. Synthesize your findings into a structured JSON report.

When analyzing injuries, always assess:
- Injury SEVERITY: minor (day-to-day, soreness), moderate (multi-week, sprains), severe (season-ending, surgery)
- BETTING IMPACT: how does this injury affect spread, moneyline, totals, and player props?
- Which specific MARKETS are affected (game spread, over/under, player props, futures)?

After gathering all information, output your final answer as a JSON object matching this schema:

{
  "generatedAt": "ISO timestamp",
  "queriedPlayers": [{ "name": "...", "team": "...", "sport": "..." }],
  "injuries": [{
    "player": "...",
    "team": "...",
    "sport": "...",
    "injuryType": "description of injury",
    "severity": "minor" | "moderate" | "severe" | "unknown",
    "status": "official status (e.g. Questionable, Out, Day-to-day)",
    "expectedReturn": "estimated return timeline or null",
    "source": "source URL or name",
    "reportedAt": "approximate date"
  }],
  "bettingInsights": [{
    "player": "...",
    "team": "...",
    "impactLevel": "high" | "medium" | "low",
    "affectedMarkets": ["spread", "moneyline", "over/under", "player props", "futures"],
    "recommendation": "actionable insight for bettors",
    "reasoning": "why this matters"
  }],
  "summary": "2-3 sentence executive summary"
}

IMPORTANT: Use the tools to gather real data. Do NOT fabricate injury information.
Wrap your final JSON in <REPORT>...</REPORT> tags so it can be parsed.`;

export class InjuryMonitorAgent {
  private client: OpenAI;
  private model: string;
  private steps: AgentStep[] = [];

  constructor() {
    this.client = createClient();
    this.model = getModel();
  }

  /**
   * Run the full ReAct agent loop for a set of player queries.
   * The agent decides which tools to call, interprets results, and
   * produces a final structured report.
   */
  async run(players: PlayerQuery[]): Promise<AgentReport> {
    this.steps = [];

    const playerList = players
      .map((p) => `- ${p.name} (${p.team}, ${p.sport})`)
      .join("\n");

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Investigate the following players/teams for injury news and betting impact:\n\n${playerList}\n\nUse the available tools to search for recent injury news for each player AND pull team-wide injury reports. Then synthesize everything into the structured report.`,
      },
    ];

    let iterations = 0;

    // ReAct agent loop: keep calling the LLM until it produces a final answer or we hit the iteration cap.
    while (iterations < config.agent.maxIterations) {
      iterations++;
      console.log(`\n--- Agent iteration ${iterations} ---`);

      // Send the full conversation (system prompt, user query, and any prior tool results) to the LLM.
      // LiteLLM proxies this request to the configured upstream model (Claude, GPT-4, etc).
      let response;
      try {
        response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: toolDefinitions,
          tool_choice: "auto",
          temperature: config.agent.temperature,
        });
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string; error?: { message?: string } };
        const detail = e.error?.message ?? e.message ?? String(err);

        if (e.status === 401) {
          throw new Error(
            `Authentication failed (401). Check that:\n` +
            `  1. LiteLLM is running at ${config.litellm.baseUrl}\n` +
            `  2. LITELLM_API_KEY in .env matches the master_key LiteLLM was started with\n` +
            `  3. ANTHROPIC_API_KEY is exported in the shell where LiteLLM runs\n` +
            `  Detail: ${detail}`
          );
        }
        if (e.status === 500) {
          throw new Error(
            `LiteLLM returned 500 Internal Server Error. Common causes:\n` +
            `  1. ANTHROPIC_API_KEY not exported in the LiteLLM proxy's shell environment\n` +
            `  2. The API key is invalid or expired\n` +
            `  3. Model "${this.model}" is misconfigured in litellm_config.yaml\n` +
            `  Check the LiteLLM terminal for the full upstream error.\n` +
            `  Detail: ${detail}`
          );
        }
        throw err;
      }

      const choice = response.choices[0];
      if (!choice?.message) {
        throw new Error("No response from LLM");
      }

      const assistantMsg = choice.message;
      messages.push(assistantMsg as ChatCompletionMessageParam);

      // The LLM either responds with tool calls (it needs more data) or a final text answer.
      // This block handles the tool-call case.
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        console.log(
          `  Tool calls: ${assistantMsg.tool_calls.map((tc) => tc.function.name).join(", ")}`
        );

        this.steps.push({
          type: "tool_call",
          content: assistantMsg.tool_calls
            .map((tc) => `${tc.function.name}(${tc.function.arguments})`)
            .join("; "),
        });

        // Run each tool and append its result as a "tool" role message.
        // This gives the LLM full context on what each tool returned in the next iteration.
        for (const toolCall of assistantMsg.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments) as Record<
            string,
            unknown
          >;
          console.log(
            `  Executing: ${toolCall.function.name}(${JSON.stringify(args)})`
          );

          const result = await executeTool(toolCall.function.name, args);

          this.steps.push({
            type: "tool_result",
            content: `${toolCall.function.name} → ${result.slice(0, 200)}...`,
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        // Loop back to the top so the LLM can reason about the tool results it just received.
        continue;
      }

      // No tool calls and there's content, the agent has enough information and is producing its final answer.
      if (assistantMsg.content) {
        console.log("  Agent produced final response");
        this.steps.push({
          type: "final_answer",
          content: assistantMsg.content.slice(0, 300) + "...",
        });

        const report = this.parseReport(assistantMsg.content, players);
        return report;
      }

      // Neither tool calls nor content, shouldn't happen, but break to be safe
      console.warn("  No tool calls and no content — ending loop");
      break;
    }

    // Safety guard: cap iterations to prevent runaway loops. Return a fallback report instead.
    console.warn(`Agent hit max iterations (${config.agent.maxIterations})`);
    return this.fallbackReport(players);
  }

  getSteps(): AgentStep[] {
    return [...this.steps];
  }

  private parseReport(
    content: string,
    players: PlayerQuery[]
  ): AgentReport {
    const extractors: (() => string | null)[] = [
      // 1. <REPORT>...</REPORT> tags (strip markdown fences if present)
      () => {
        const m = content.match(/<REPORT>([\s\S]*?)<\/REPORT>/);
        if (!m) return null;
        return m[1].replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "");
      },
      // 2. Any top-level JSON object containing "summary"
      () => {
        const m = content.match(/\{[\s\S]*"summary"[\s\S]*\}/);
        return m?.[0] ?? null;
      },
    ];

    for (const extract of extractors) {
      const raw = extract();
      if (raw) {
        try {
          return JSON.parse(raw) as AgentReport;
        } catch {
          // try next extractor
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      queriedPlayers: players,
      injuries: [],
      bettingInsights: [],
      summary: content.slice(0, 500),
    };
  }

  private fallbackReport(players: PlayerQuery[]): AgentReport {
    return {
      generatedAt: new Date().toISOString(),
      queriedPlayers: players,
      injuries: [],
      bettingInsights: [],
      summary:
        "Agent reached maximum iterations without producing a complete report. " +
        "Try again or check API connectivity.",
    };
  }
}
