export interface PlayerQuery {
  name: string;
  team: string;
  sport: "NFL" | "NBA" | "MLB" | "NHL" | "Soccer";
  position?: string;
}

export interface InjuryReport {
  player: string;
  team: string;
  sport: string;
  injuryType: string;
  severity: "minor" | "moderate" | "severe" | "unknown";
  status: string;
  expectedReturn?: string;
  source: string;
  reportedAt: string;
}

export interface BettingInsight {
  player: string;
  team: string;
  impactLevel: "high" | "medium" | "low";
  affectedMarkets: string[];
  recommendation: string;
  reasoning: string;
}

export interface AgentReport {
  generatedAt: string;
  queriedPlayers: PlayerQuery[];
  injuries: InjuryReport[];
  bettingInsights: BettingInsight[];
  summary: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
}

export interface AgentStep {
  type: "thought" | "tool_call" | "tool_result" | "final_answer";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}
