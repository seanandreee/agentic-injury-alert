import OpenAI from "openai";
import { config } from "./config.js";
import type { InjuryReport } from "./types.js";

/**
 * Eval suite for the Sports Injury Monitor agent.
 *
 * Tests whether the LLM correctly classifies injury severity given
 * real-world-style injury descriptions. Each case has a known ground-truth
 * severity, and the LLM's classification is compared against it.
 *
 * This is a "model-graded" eval: we send the injury text to the same LLM
 * (via LiteLLM) and ask it to classify severity, then score the output.
 */

interface EvalCase {
  id: string;
  description: string;
  injuryText: string;
  expectedSeverity: InjuryReport["severity"];
  expectedStatus: string;
  sport: string;
}

const EVAL_CASES: EvalCase[] = [
  {
    id: "nba-foot-soreness",
    description: "LeBron James — minor foot soreness, listed as questionable",
    injuryText:
      "LeBron James has been listed as questionable for Friday's game against the Celtics due to left foot soreness. He missed shootaround but is expected to be a game-time decision.",
    expectedSeverity: "minor",
    expectedStatus: "Questionable",
    sport: "NBA",
  },
  {
    id: "nfl-acl-tear",
    description: "Running back — torn ACL, season-ending",
    injuryText:
      "MRI confirmed a complete tear of the anterior cruciate ligament in his right knee. He will undergo surgery next week and is expected to miss the remainder of the season. The team has placed him on injured reserve.",
    expectedSeverity: "severe",
    expectedStatus: "Out",
    sport: "NFL",
  },
  {
    id: "mlb-hamstring-strain",
    description: "Outfielder — grade 2 hamstring strain, 4-6 weeks",
    injuryText:
      "The team announced that the outfielder suffered a Grade 2 hamstring strain while running to first base. He has been placed on the 15-day injured list with an expected recovery timeline of 4-6 weeks.",
    expectedSeverity: "moderate",
    expectedStatus: "IL",
    sport: "MLB",
  },
  {
    id: "nba-ankle-sprain",
    description: "Point guard — high ankle sprain, 2-3 weeks",
    injuryText:
      "X-rays came back negative, but an MRI revealed a high ankle sprain. He will miss at least 2-3 weeks. The team is hopeful he can return before the playoffs begin.",
    expectedSeverity: "moderate",
    expectedStatus: "Out",
    sport: "NBA",
  },
  {
    id: "nfl-concussion",
    description: "Wide receiver — concussion, in protocol",
    injuryText:
      "The wide receiver entered the concussion protocol after a helmet-to-helmet hit in the second quarter. He did not return to the game. He must clear all five steps of the NFL's concussion protocol before being allowed to return to play.",
    expectedSeverity: "moderate",
    expectedStatus: "Out",
    sport: "NFL",
  },
  {
    id: "nfl-rest-day",
    description: "Veteran — rest day, no actual injury",
    injuryText:
      "The veteran quarterback was given a scheduled rest day and did not practice on Wednesday. Coach confirmed he is fully healthy and will start on Sunday. This is part of his normal load management routine.",
    expectedSeverity: "minor",
    expectedStatus: "Available",
    sport: "NFL",
  },
  {
    id: "mlb-tommy-john",
    description: "Pitcher — Tommy John surgery, 12-18 months",
    injuryText:
      "The team announced that the starting pitcher will undergo Tommy John surgery. He is expected to miss 12-18 months, ruling him out for the rest of this season and likely a significant portion of next season as well.",
    expectedSeverity: "severe",
    expectedStatus: "Out",
    sport: "MLB",
  },
  {
    id: "nba-back-tightness",
    description: "Center — back tightness, probable",
    injuryText:
      "The center is listed as probable for tonight's game with lower back tightness. He participated fully in practice today and said he expects to play. 'I feel good, just a little tight,' he told reporters.",
    expectedSeverity: "minor",
    expectedStatus: "Probable",
    sport: "NBA",
  },
];

const CLASSIFICATION_PROMPT = `You are a sports injury classification system. Given an injury report, classify:

1. severity: "minor" (day-to-day, soreness, rest), "moderate" (multi-week, sprains, strains requiring IL/missing games), "severe" (season-ending, surgery, 3+ months), or "unknown"
2. status: The player's availability status (e.g., "Questionable", "Out", "Probable", "IL", "Available", "Day-to-day")

Respond with ONLY a JSON object: {"severity": "...", "status": "..."}`;

interface ClassificationResult {
  severity: string;
  status: string;
}

async function classifyInjury(
  client: OpenAI,
  injuryText: string
): Promise<ClassificationResult> {
  const response = await client.chat.completions.create({
    model: config.litellm.model,
    messages: [
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: injuryText },
    ],
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse classification: ${content}`);
  }
  return JSON.parse(jsonMatch[0]) as ClassificationResult;
}

interface EvalResult {
  caseId: string;
  description: string;
  expectedSeverity: string;
  predictedSeverity: string;
  expectedStatus: string;
  predictedStatus: string;
  severityCorrect: boolean;
  statusCorrect: boolean;
  pass: boolean;
}

function statusMatch(expected: string, predicted: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return norm(predicted).includes(norm(expected));
}

async function runEvals(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  INJURY SEVERITY CLASSIFICATION EVAL");
  console.log("=".repeat(60));
  console.log(`\nModel: ${config.litellm.model}`);
  console.log(`LiteLLM endpoint: ${config.litellm.baseUrl}`);
  console.log(`Cases: ${EVAL_CASES.length}\n`);

  const client = new OpenAI({
    baseURL: config.litellm.baseUrl + "/v1",
    apiKey: config.litellm.apiKey,
  });

  const results: EvalResult[] = [];

  for (const evalCase of EVAL_CASES) {
    process.stdout.write(`  [${evalCase.id}] ${evalCase.description} ... `);

    try {
      const classification = await classifyInjury(client, evalCase.injuryText);

      const severityCorrect =
        classification.severity === evalCase.expectedSeverity;
      const sCorrect = statusMatch(
        evalCase.expectedStatus,
        classification.status
      );

      const result: EvalResult = {
        caseId: evalCase.id,
        description: evalCase.description,
        expectedSeverity: evalCase.expectedSeverity,
        predictedSeverity: classification.severity,
        expectedStatus: evalCase.expectedStatus,
        predictedStatus: classification.status,
        severityCorrect,
        statusCorrect: sCorrect,
        pass: severityCorrect && sCorrect,
      };

      results.push(result);
      console.log(result.pass ? "✓ PASS" : "✗ FAIL");

      if (!result.pass) {
        if (!severityCorrect) {
          console.log(
            `    Severity: expected "${evalCase.expectedSeverity}", got "${classification.severity}"`
          );
        }
        if (!sCorrect) {
          console.log(
            `    Status: expected "${evalCase.expectedStatus}", got "${classification.status}"`
          );
        }
      }
    } catch (err) {
      console.log(`✗ ERROR: ${err}`);
      results.push({
        caseId: evalCase.id,
        description: evalCase.description,
        expectedSeverity: evalCase.expectedSeverity,
        predictedSeverity: "error",
        expectedStatus: evalCase.expectedStatus,
        predictedStatus: "error",
        severityCorrect: false,
        statusCorrect: false,
        pass: false,
      });
    }
  }

  // Summary
  const totalPass = results.filter((r) => r.pass).length;
  const severityAcc = results.filter((r) => r.severityCorrect).length;
  const statusAcc = results.filter((r) => r.statusCorrect).length;

  console.log("\n" + "-".repeat(60));
  console.log("  RESULTS SUMMARY");
  console.log("-".repeat(60));
  console.log(`  Overall:           ${totalPass}/${results.length} passed (${((totalPass / results.length) * 100).toFixed(0)}%)`);
  console.log(`  Severity accuracy: ${severityAcc}/${results.length} (${((severityAcc / results.length) * 100).toFixed(0)}%)`);
  console.log(`  Status accuracy:   ${statusAcc}/${results.length} (${((statusAcc / results.length) * 100).toFixed(0)}%)`);
  console.log();

  // Output full results as JSON for CI/programmatic consumption
  console.log("--- Full Results (JSON) ---");
  console.log(JSON.stringify(results, null, 2));

  const exitCode = totalPass === results.length ? 0 : 1;
  process.exit(exitCode);
}

runEvals().catch((err) => {
  console.error("Eval runner failed:", err);
  process.exit(1);
});
