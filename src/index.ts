import "dotenv/config";
import { InjuryMonitorAgent } from "./agent.js";
import type { PlayerQuery } from "./types.js";

const DEMO_PLAYERS: PlayerQuery[] = [
  { name: "LeBron James", team: "Los Angeles Lakers", sport: "NBA", position: "SF" },
  { name: "Patrick Mahomes", team: "Kansas City Chiefs", sport: "NFL", position: "QB" },
  { name: "Shohei Ohtani", team: "Los Angeles Dodgers", sport: "MLB", position: "DH" },
];

async function main() {
  const args = process.argv.slice(2);

  let players: PlayerQuery[];

  if (args.length > 0 && args[0] === "--json") {
    // Accept JSON input: --json '[{"name":"...","team":"...","sport":"NBA"}]'
    players = JSON.parse(args[1]) as PlayerQuery[];
  } else if (args.length > 0) {
    // Simple format: "Player Name,Team,Sport" per argument
    players = args.map((arg) => {
      const [name, team, sport] = arg.split(",");
      return {
        name: name.trim(),
        team: team.trim(),
        sport: sport.trim() as PlayerQuery["sport"],
      };
    });
  } else {
    console.log("No players specified — using demo roster.\n");
    console.log("Usage:");
    console.log('  npm run dev -- "LeBron James,Los Angeles Lakers,NBA"');
    console.log('  npm run dev -- --json \'[{"name":"LeBron James","team":"Los Angeles Lakers","sport":"NBA"}]\'');
    console.log();
    players = DEMO_PLAYERS;
  }

  console.log("=".repeat(60));
  console.log("  SPORTS INJURY MONITOR — Betting Intelligence Agent");
  console.log("=".repeat(60));
  console.log(`\nMonitoring ${players.length} player(s):\n`);
  players.forEach((p) => console.log(`  • ${p.name} (${p.team} — ${p.sport})`));
  console.log();

  const agent = new InjuryMonitorAgent();
  const report = await agent.run(players);

  console.log("\n" + "=".repeat(60));
  console.log("  FINAL REPORT");
  console.log("=".repeat(60));
  console.log(JSON.stringify(report, null, 2));

  console.log("\n--- Agent Steps ---");
  for (const step of agent.getSteps()) {
    console.log(`[${step.type}] ${step.content}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
