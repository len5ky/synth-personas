#!/usr/bin/env node
import { Command } from "commander";
import { config as loadEnv } from "dotenv";
import kleur from "kleur";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
import {
  aggregate,
  discoverPersonas,
  loadTask,
  loadPersona,
  renderReport,
  renderSystemPrompt,
  renderUserPrompt,
  runEvaluation,
  selectPersonas,
} from "@sociosim/synth-personas-core";
import type { EvaluationTask, Persona, PersonaResult, RubricItem } from "@sociosim/synth-personas-core";

loadEnv();

const program = new Command();
program
  .name("synth-personas")
  .description("Synthetic personas feedback framework — fan out LLM calls to a persona library.");

const fsSync = require("node:fs") as typeof import("node:fs");

function packageRoot(): string {
  // dist/index.js → packageRoot = <pkg>/; src/index.ts → packageRoot = <pkg>/ as well.
  return fileURLToPath(new URL("..", import.meta.url));
}

function bundledPersonasRoot(): string | null {
  const p = join(packageRoot(), "assets/personas");
  if (fsSync.existsSync(p) && fsSync.statSync(p).isDirectory()) return p;
  return null;
}

function findProjectRoot(): string {
  let cur = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      const p = join(cur, "assets", "personas");
      if (fsSync.existsSync(p) && fsSync.statSync(p).isDirectory()) return cur;
    } catch {
      // continue
    }
    const parent = resolve(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
  return process.cwd();
}

function defaultPersonasRoot(): string {
  const fromEnv = process.env.SYNTH_PERSONA_PERSONAS_ROOT;
  if (fromEnv) return fromEnv;
  const bundled = bundledPersonasRoot();
  if (bundled) return bundled;
  return resolve(findProjectRoot(), "assets/personas");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/-\d+Z$/, "Z");
}

async function createRunDir(task: EvaluationTask, base: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
  const dir = join(base, `${stamp}-${task.name}`);
  await fs.mkdir(join(dir, "personas"), { recursive: true });
  return dir;
}

async function writeResult(runDir: string, slug: string, payload: Record<string, unknown>, failed: boolean) {
  const name = failed ? `${slug}.error.json` : `${slug}.json`;
  await fs.writeFile(join(runDir, "personas", name), JSON.stringify(payload, null, 2), "utf-8");
}

async function loadAllPersonas(rootOverride?: string): Promise<Persona[]> {
  return discoverPersonas(rootOverride ?? defaultPersonasRoot());
}

program
  .command("list-personas")
  .description("List discovered personas, optionally filtered by category or tags.")
  .option("--category <name>", "Filter by primary category.")
  .option("--tag <tag>", "Filter to personas matching ALL tags.", (val: string, acc: string[]) => [...acc, val], [] as string[])
  .option("--personas-root <path>", "Override personas root.")
  .action(async (opts: { category?: string; tag: string[]; personasRoot?: string }) => {
    let personas = await loadAllPersonas(opts.personasRoot);
    if (opts.category) personas = personas.filter((p) => p.frontmatter.category === opts.category);
    if (opts.tag.length > 0) {
      const required = new Set(opts.tag);
      personas = personas.filter((p) => [...required].every((t) => p.frontmatter.tags.includes(t)));
    }
    console.log(kleur.bold(`Personas (${personas.length})`));
    const colW = { slug: 28, name: 26, cat: 18, conf: 6 };
    console.log(
      [
        kleur.cyan("slug".padEnd(colW.slug)),
        "name".padEnd(colW.name),
        kleur.green("category".padEnd(colW.cat)),
        "conf".padEnd(colW.conf),
        kleur.dim("tags"),
      ].join("  "),
    );
    for (const p of personas) {
      console.log(
        [
          kleur.cyan(p.frontmatter.slug.padEnd(colW.slug)),
          p.frontmatter.name.padEnd(colW.name),
          kleur.green(p.frontmatter.category.padEnd(colW.cat)),
          p.frontmatter.confidence.padEnd(colW.conf),
          kleur.dim(p.frontmatter.tags.slice(0, 4).join(", ") + (p.frontmatter.tags.length > 4 ? "…" : "")),
        ].join("  "),
      );
    }
    const counts: Record<string, number> = {};
    for (const p of personas) counts[p.frontmatter.category] = (counts[p.frontmatter.category] ?? 0) + 1;
    console.log(`\n${kleur.bold("By category:")} ${JSON.stringify(counts)}`);
  });

program
  .command("validate-persona")
  .description("Lint a single persona file — frontmatter + body.")
  .argument("<path>")
  .action(async (path: string) => {
    let p: Persona;
    try {
      p = await loadPersona(path);
    } catch (e) {
      console.error(kleur.red(`invalid ${path}: ${(e as Error).message}`));
      process.exit(1);
    }
    const bodyWords = p.body.split(/\s+/).filter(Boolean).length;
    const issues: string[] = [];
    const requiredSections = [
      "## Background",
      "## Worldview",
      "## What excites them",
      "## What turns them off",
      "## Communication style",
      "## Famous positions",
      "## Sample quotes",
      "## When evaluating",
      "## Failure modes",
    ];
    for (const s of requiredSections) {
      if (!p.body.includes(s)) issues.push(`missing section: '${s}'`);
    }
    if (bodyWords < 250) issues.push(`body too short: ${bodyWords} words (target 300-1400)`);
    if (bodyWords > 1500) issues.push(`body too long: ${bodyWords} words (target 300-1400)`);
    console.log(kleur.green("✓ frontmatter valid") + ` for ${p.frontmatter.slug} (${p.frontmatter.name})`);
    console.log(`  body: ${bodyWords} words; category: ${p.frontmatter.category}; confidence: ${p.frontmatter.confidence}`);
    if (issues.length > 0) {
      for (const i of issues) console.log(kleur.yellow(`  ⚠ ${i}`));
      process.exit(2);
    }
  });

program
  .command("validate-task")
  .description("Lint an evaluation task YAML and show which personas it selects.")
  .argument("<path>")
  .option("--personas-root <path>", "Override personas root.")
  .action(async (path: string, opts: { personasRoot?: string }) => {
    const task = await loadTask(path);
    console.log(kleur.green("✓ task valid") + `: ${task.name}`);
    console.log(`  artifact: ${task.artifact.path}`);
    try {
      const s = await fs.stat(task.artifact.path);
      if (!s.isFile()) console.log(kleur.yellow("  ⚠ artifact path is not a file"));
    } catch {
      console.log(kleur.yellow("  ⚠ artifact file does not exist"));
    }
    console.log(`  rubric: ${JSON.stringify(task.rubric.map((r) => r.name))}`);
    console.log(`  extra_questions: ${JSON.stringify(task.extra_questions.map((q) => q.id))}`);
    console.log(`  model.default: ${task.model.default}`);
    const personas = await loadAllPersonas(opts.personasRoot);
    const selected = selectPersonas(personas, task.persona_selection);
    console.log(`\n${kleur.bold(`Selection resolves to ${selected.length} of ${personas.length} personas:`)}`);
    const requested = new Set(task.persona_selection.categories ?? []);
    if (requested.size > 0) {
      console.log(kleur.dim(`  requested categories: ${[...requested].sort().join(", ")}`));
    }
    const directByCat: Record<string, number> = {};
    const secondaryByCat: Record<string, number> = {};
    let direct = 0;
    let secondary = 0;
    for (const p of selected) {
      const primary = p.frontmatter.category;
      if (requested.size === 0 || requested.has(primary)) {
        directByCat[primary] = (directByCat[primary] ?? 0) + 1;
        direct++;
      } else {
        secondaryByCat[primary] = (secondaryByCat[primary] ?? 0) + 1;
        secondary++;
      }
    }
    if (direct > 0) {
      const header =
        requested.size > 0 ? `  matched on primary category (${direct}):` : `  by primary category:`;
      console.log(kleur.bold(header));
      for (const [cat, n] of Object.entries(directByCat).sort()) console.log(`    ${cat}: ${n}`);
    }
    if (secondary > 0) {
      console.log(
        kleur.bold(
          `  pulled in via secondary_categories / tags / slugs (${secondary}):`,
        ),
      );
      for (const [cat, n] of Object.entries(secondaryByCat).sort()) console.log(`    ${cat}: ${n}`);
    }
  });

program
  .command("show-prompt")
  .description("Render and print the exact system + user prompts for one persona (no API call).")
  .argument("<taskPath>")
  .requiredOption("-p, --persona-slug <slug>", "Persona slug to render.")
  .option("--personas-root <path>", "Override personas root.")
  .action(async (taskPath: string, opts: { personaSlug: string; personasRoot?: string }) => {
    const task = await loadTask(taskPath);
    const personas = await loadAllPersonas(opts.personasRoot);
    const persona = personas.find((p) => p.frontmatter.slug === opts.personaSlug);
    if (!persona) {
      console.error(kleur.red(`unknown persona slug: ${opts.personaSlug}`));
      process.exit(1);
    }
    const artifactContent = await fs.readFile(task.artifact.path, "utf-8");
    const system = renderSystemPrompt(persona, { kind: task.artifact.kind, title: task.artifact.title ?? null });
    const user = renderUserPrompt(persona, task, artifactContent);
    console.log(kleur.bold().cyan("=== SYSTEM ==="));
    console.log(system);
    console.log("\n" + kleur.bold().cyan("=== USER ==="));
    console.log(user);
  });

program
  .command("run")
  .description("Run an evaluation task end-to-end.")
  .argument("<taskPath>")
  .option("--limit <n>", "Cap persona count (for dev).", (v) => parseInt(v, 10))
  .option("--model <id>", "Override task.model.default.")
  .option("--reasoning-effort <level>", "low | medium | high | off")
  .option("--no-synthesis", "Skip the synthesis pass (default).")
  .option("--personas-root <path>", "Override personas root.")
  .option("--output-dir <path>", "Override output dir (default: ./runs).")
  .action(async (taskPath: string, opts: { limit?: number; model?: string; reasoningEffort?: string; personasRoot?: string; outputDir?: string }) => {
    const task = await loadTask(taskPath);
    try {
      await fs.access(task.artifact.path);
    } catch {
      console.error(kleur.red(`artifact file missing: ${task.artifact.path}`));
      process.exit(1);
    }
    const personas = await loadAllPersonas(opts.personasRoot);
    const selection = opts.limit !== undefined ? { ...task.persona_selection, limit: opts.limit } : task.persona_selection;
    const selected = selectPersonas(personas, selection);
    if (selected.length === 0) {
      console.error(kleur.red("No personas matched selection."));
      process.exit(1);
    }
    const outBase = opts.outputDir ?? task.output.dir;
    await fs.mkdir(outBase, { recursive: true });
    const runDir = await createRunDir(task, outBase);
    console.log(kleur.green("run dir:") + ` ${runDir}`);
    console.log(
      kleur.green("personas:") + ` ${selected.length}  ` + kleur.green("model:") + ` ${opts.model ?? task.model.default}`,
    );

    let reasoningOverride: Record<string, unknown> | null = null;
    if (opts.reasoningEffort) {
      if (opts.reasoningEffort === "off") reasoningOverride = {};
      else if (["low", "medium", "high"].includes(opts.reasoningEffort)) {
        reasoningOverride = { effort: opts.reasoningEffort };
      } else {
        console.error(kleur.red(`invalid --reasoning-effort: ${opts.reasoningEffort}`));
        process.exit(1);
      }
    }

    const artifactContent = await fs.readFile(task.artifact.path, "utf-8");
    let done = 0;
    const { successes, failures, manifest } = await runEvaluation({
      task,
      personas: selected,
      artifactContent,
      modelOverride: opts.model ?? null,
      reasoningOverride: reasoningOverride && Object.keys(reasoningOverride).length ? reasoningOverride : null,
      onPersonaResult: async (r) => {
        await writeResult(runDir, r.personaSlug, r.payload, !r.success);
      },
      onProgress: (completed, total) => {
        done = completed;
        process.stdout.write(`\r${kleur.cyan(`querying personas... ${completed}/${total}`)}    `);
      },
    });
    process.stdout.write("\n");
    console.log(kleur.bold(`Done.`) + ` ${successes.length} successes / ${failures.length} failures`);

    await fs.writeFile(join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

    const successPayloads = successes.map((s) => s.payload as Record<string, unknown>);
    const failurePayloads = failures.map((f) => f.payload as Record<string, unknown>);
    const rubricNames = task.rubric.map((r) => r.name);
    const agg = aggregate(successPayloads as never, failurePayloads as never, rubricNames);
    const aggPath = join(runDir, "aggregate.json");
    await fs.writeFile(aggPath, JSON.stringify(agg, null, 2), "utf-8");
    const report = renderReport({
      taskName: task.name,
      artifactTitle: task.artifact.title ?? null,
      aggregate: agg,
      rubric: task.rubric,
      synthesis: null,
    });
    const reportPath = join(runDir, "report.md");
    await fs.writeFile(reportPath, report, "utf-8");
    console.log(kleur.green("aggregate:") + ` ${aggPath}`);
    console.log(kleur.green("report:") + ` ${reportPath}`);
  });

program
  .command("aggregate")
  .description("Re-aggregate an existing run.")
  .argument("<runDir>")
  .action(async (runDir: string) => {
    const manifestPath = join(runDir, "manifest.json");
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    } catch {
      console.error(kleur.red(`no manifest.json in ${runDir}`));
      process.exit(1);
    }
    const rubric = (manifest.rubric ?? []) as RubricItem[];
    const personasDir = join(runDir, "personas");
    const entries = await fs.readdir(personasDir);
    const successes: Record<string, unknown>[] = [];
    const failures: Record<string, unknown>[] = [];
    for (const f of entries.sort()) {
      if (!f.endsWith(".json")) continue;
      const data = JSON.parse(await fs.readFile(join(personasDir, f), "utf-8"));
      if (f.endsWith(".error.json")) failures.push(data);
      else successes.push(data);
    }
    const agg = aggregate(successes as never, failures as never, rubric.map((r) => r.name));
    await fs.writeFile(join(runDir, "aggregate.json"), JSON.stringify(agg, null, 2), "utf-8");
    const report = renderReport({
      taskName: String(manifest.task_name ?? "unknown"),
      artifactTitle: (manifest.artifact_title as string | null) ?? null,
      aggregate: agg,
      rubric,
      synthesis: null,
    });
    await fs.writeFile(join(runDir, "report.md"), report, "utf-8");
    console.log(kleur.green("aggregate:") + ` ${join(runDir, "aggregate.json")}`);
    console.log(kleur.green("report:") + ` ${join(runDir, "report.md")}`);
  });

async function copyDir(src: string, dest: string): Promise<number> {
  let count = 0;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function discoverBundledSkills(bundledRoot: string): string[] {
  // Returns subdir names of bundledRoot that contain a SKILL.md.
  if (!fsSync.existsSync(bundledRoot) || !fsSync.statSync(bundledRoot).isDirectory()) {
    return [];
  }
  return fsSync
    .readdirSync(bundledRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fsSync.existsSync(join(bundledRoot, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

async function installSkillSet(
  bundledRoot: string,
  targetBase: string,
  label: string,
  force: boolean,
): Promise<number> {
  const skills = discoverBundledSkills(bundledRoot);
  if (skills.length === 0) {
    console.error(kleur.red(`${label}: no bundled skills found at ${bundledRoot}`));
    return 0;
  }
  console.log(kleur.bold(`${label}:`));
  let installedCount = 0;
  for (const skill of skills) {
    const src = join(bundledRoot, skill);
    const dest = join(targetBase, skill);
    if (fsSync.existsSync(dest) && !force) {
      console.log(kleur.yellow(`  ⚠ ${skill.padEnd(18)} skip — already exists at ${dest} (pass --force to overwrite)`));
      continue;
    }
    await copyDir(src, dest);
    console.log(kleur.green(`  ✓ ${skill.padEnd(18)}`) + kleur.dim(` → ${dest}`));
    installedCount++;
  }
  return installedCount;
}

program
  .command("install-skills")
  .description("Copy all bundled SKILL.md files into Claude Code and Codex CLI skill directories. Auto-discovers every skill shipped with this package.")
  .option("--claude-dir <path>", "Parent dir for Claude Code skills (one subdir per skill).", join(homedir(), ".claude/skills"))
  .option("--codex-dir <path>", "Parent dir for Codex CLI skills (one subdir per skill).", join(homedir(), ".codex/skills"))
  .option("--no-claude", "Skip installing Claude Code skills.")
  .option("--no-codex", "Skip installing Codex CLI skills.")
  .option("--force", "Overwrite existing skill files without prompting.")
  .action(async (opts: { claudeDir: string; codexDir: string; claude: boolean; codex: boolean; force: boolean }) => {
    const root = packageRoot();
    let claudeCount = 0;
    let codexCount = 0;
    if (opts.claude) claudeCount = await installSkillSet(join(root, "skills"), opts.claudeDir, "Claude", opts.force);
    if (opts.codex) codexCount = await installSkillSet(join(root, ".agents/skills"), opts.codexDir, "Codex", opts.force);
    const total = claudeCount + codexCount;
    if (total === 0) {
      console.log(kleur.dim("\nNo skills installed."));
      return;
    }
    const parts: string[] = [];
    if (opts.claude) parts.push(`${claudeCount} Claude`);
    if (opts.codex) parts.push(`${codexCount} Codex`);
    console.log(
      "\n" +
        kleur.bold(`Installed ${total} skill${total === 1 ? "" : "s"} (${parts.join(", ")}).`) +
        ` Set OPENROUTER_API_KEY, then try ${kleur.cyan("synth-personas list-personas")}.`,
    );
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(kleur.red(`error: ${(e as Error).stack ?? (e as Error).message}`));
  process.exit(1);
});
