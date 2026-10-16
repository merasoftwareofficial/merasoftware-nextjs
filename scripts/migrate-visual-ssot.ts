import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { settingsRepo } from "../src/lib/repo";
import { visualMigrationPlan } from "../src/lib/visual-config";
import { visualSchema } from "../src/lib/visual-validation";

async function main() {
  const settings = await settingsRepo.get();
  const plan = visualMigrationPlan(settings);
  for (const config of Object.values(plan.patches)) visualSchema.parse(config);
  console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "dry-run", migrate: Object.keys(plan.patches), inactivePreserved: plan.inactive }, null, 2));
  if (!process.argv.includes("--apply") || !Object.keys(plan.patches).length) return;
  const directory = path.resolve("work1", `visual-ssot-data-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "settings.json"), JSON.stringify(settings, null, 2));
  // Driver merges canonical values last, preserving edits made after this snapshot.
  await settingsRepo.migrateVisuals(plan.patches);
  console.log("Migrated missing canonical visuals. Existing configs and legacy fields preserved; backup written under work1.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration failed"); process.exitCode = 1; });
