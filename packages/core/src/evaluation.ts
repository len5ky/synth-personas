import { promises as fs } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import yaml from "js-yaml";
import { EvaluationTaskSchema, type EvaluationTask } from "./types.js";

export async function loadTask(path: string): Promise<EvaluationTask> {
  const text = await fs.readFile(path, "utf-8").catch(() => {
    throw new Error(`task file not found: ${path}`);
  });
  const raw = yaml.load(text);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${path}: task file must be a YAML mapping at top level`);
  }
  const data = raw as Record<string, unknown>;

  const taskDir = dirname(path);
  if (typeof data.artifact === "object" && data.artifact && "path" in data.artifact) {
    const art = data.artifact as Record<string, unknown>;
    const p = String(art.path);
    art.path = isAbsolute(p) ? p : resolve(taskDir, p);
  }
  if (typeof data.output === "object" && data.output && "dir" in data.output) {
    const out = data.output as Record<string, unknown>;
    const p = String(out.dir);
    out.dir = isAbsolute(p) ? p : resolve(taskDir, p);
  }

  return EvaluationTaskSchema.parse(data);
}
