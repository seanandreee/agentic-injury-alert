import { config } from "./config.js";

// ---------------------------------------------------------------------------
// Tool: search_injury_news
// Uses SerpAPI (Google Search JSON API) to find recent injury/lineup news.
// Falls back to a mock when no API key is configured so the agent loop can
// still be demonstrated end-to-end.
// ---------------------------------------------------------------------------

async function serpApiSearch(query: string): Promise<string> {
  const params = new URLSearchParams({
    q: query,
    api_key: config.serpapi.apiKey,
    engine: "google",
    num: "5",
    tbs: "qdr:w", // last week
  });

  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) {
    throw new Error(`SerpAPI request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    organic_results?: { title: string; snippet: string; link: string }[];
  };

  const results = (data.organic_results ?? []).slice(0, 5);
  if (results.length === 0) return "No recent results found.";

  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.link}`
    )
    .join("\n\n");
}

function mockSearch(query: string): string {
  const mocks: Record<string, string> = {
    default: [
      "[1] Player Injury Update — ESPN",
      "Recent reports indicate the player is dealing with a soft-tissue injury sustained in practice. Team listed them as questionable for the upcoming game.",
      "Source: https://espn.com/injury-update",
      "",
      "[2] Fantasy Impact Report — Yahoo Sports",
      "The player was seen in a walking boot after Wednesday's practice. Coach said they are day-to-day and will be evaluated before game time.",
      "Source: https://sports.yahoo.com/fantasy-impact",
    ].join("\n"),
  };

  const lower = query.toLowerCase();

  if (lower.includes("lebron") || lower.includes("lakers")) {
    return [
      "[1] LeBron James Injury Update: Foot Soreness — ESPN",
      "LeBron James has been listed as questionable for Friday's game against the Celtics due to left foot soreness. He missed shootaround Thursday.",
      "Source: https://espn.com/nba/lebron-foot",
      "",
      "[2] Lakers Injury Report — NBA.com",
      "LeBron James (left foot soreness) — Questionable. Anthony Davis (knee) — Probable. Austin Reaves — Available.",
      "Source: https://nba.com/lakers/injuries",
    ].join("\n");
  }

  if (lower.includes("mahomes") || lower.includes("chiefs")) {
    return [
      "[1] Patrick Mahomes Ankle Injury Update — NFL.com",
      "Patrick Mahomes rolled his right ankle in the third quarter. X-rays were negative. He is listed as day-to-day and expected to play Sunday.",
      "Source: https://nfl.com/mahomes-ankle",
      "",
      "[2] Chiefs QB Update — ESPN",
      "Mahomes practiced in limited fashion on Wednesday. Coach Reid says he's 'tough as nails' and expects him to suit up. Backup Carson Wentz took first-team reps as a precaution.",
      "Source: https://espn.com/nfl/chiefs-qb",
    ].join("\n");
  }

  if (lower.includes("ohtani") || lower.includes("dodgers")) {
    return [
      "[1] Shohei Ohtani Elbow Recovery on Track — MLB.com",
      "Ohtani's throwing program continues. He is expected to return to the mound by mid-season. He remains available as DH.",
      "Source: https://mlb.com/ohtani-elbow",
      "",
      "[2] Dodgers Lineup Update",
      "Ohtani (elbow rehab — pitching only) remains in lineup as DH. Mookie Betts (wrist) cleared to return Friday.",
      "Source: https://espn.com/mlb/dodgers",
    ].join("\n");
  }

  return mocks.default;
}

export async function searchInjuryNews(
  playerName: string,
  team: string,
  sport: string
): Promise<string> {
  const query = `${playerName} ${team} ${sport} injury update lineup status ${new Date().getFullYear()}`;

  if (config.serpapi.apiKey) {
    try {
      return await serpApiSearch(query);
    } catch (err) {
      console.warn(`[tool:search_injury_news] SerpAPI error, using mock: ${err}`);
    }
  }
  return mockSearch(query);
}

// ---------------------------------------------------------------------------
// Tool: get_team_injuries
// Fetches the full team injury report. Uses mock data when no live API is
// configured.
// ---------------------------------------------------------------------------

export async function getTeamInjuries(
  team: string,
  sport: string
): Promise<string> {
  const query = `${team} ${sport} full injury report roster status ${new Date().getFullYear()}`;

  if (config.serpapi.apiKey) {
    try {
      return await serpApiSearch(query);
    } catch {
      // fall through to mock
      // TODO: replace with SportsDataIO or ESPN API - live data integration
    }
  }

  const mocks: Record<string, string> = {
    lakers: [
      "Los Angeles Lakers Injury Report:",
      "- LeBron James | Left foot soreness | Questionable",
      "- Anthony Davis | Right knee contusion | Probable",
      "- Jarred Vanderbilt | Left foot surgery | Out (indefinitely)",
    ].join("\n"),
    chiefs: [
      "Kansas City Chiefs Injury Report:",
      "- Patrick Mahomes | Right ankle sprain | Day-to-day",
      "- Travis Kelce | Back tightness | Probable",
      "- Chris Jones | Calf strain | Questionable",
    ].join("\n"),
    dodgers: [
      "Los Angeles Dodgers Injury Report:",
      "- Shohei Ohtani | Elbow (UCL rehab — pitching) | DH available",
      "- Mookie Betts | Left wrist fracture (healed) | Cleared to play",
      "- Walker Buehler | Shoulder inflammation | 15-day IL",
    ].join("\n"),
  };

  const key = Object.keys(mocks).find((k) =>
    team.toLowerCase().includes(k)
  );
  return key
    ? mocks[key]
    : `No injury report data available for ${team} (${sport}).`;
}

// ---------------------------------------------------------------------------
// Tool definitions for the LLM (OpenAI function-calling format)
// ---------------------------------------------------------------------------

export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "search_injury_news",
      description:
        "Search the web for recent injury and lineup news about a specific player. Returns snippets from recent articles.",
      parameters: {
        type: "object",
        properties: {
          player_name: {
            type: "string",
            description: "Full name of the player (e.g. 'LeBron James')",
          },
          team: {
            type: "string",
            description: "Team name (e.g. 'Los Angeles Lakers')",
          },
          sport: {
            type: "string",
            enum: ["NFL", "NBA", "MLB", "NHL", "Soccer"],
            description: "Sport league",
          },
        },
        required: ["player_name", "team", "sport"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_injuries",
      description:
        "Get the full injury report for a team, listing all players with current injury designations.",
      parameters: {
        type: "object",
        properties: {
          team: {
            type: "string",
            description: "Team name (e.g. 'Kansas City Chiefs')",
          },
          sport: {
            type: "string",
            enum: ["NFL", "NBA", "MLB", "NHL", "Soccer"],
            description: "Sport league",
          },
        },
        required: ["team", "sport"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Dispatcher — called by the agent loop to execute a tool by name
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "search_injury_news":
      return searchInjuryNews(
        args.player_name as string,
        args.team as string,
        args.sport as string
      );
    case "get_team_injuries":
      return getTeamInjuries(args.team as string, args.sport as string);
    default:
      return `Unknown tool: ${name}`;
  }
}
