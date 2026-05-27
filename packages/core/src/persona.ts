import { promises as fs } from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import matter from "gray-matter";
import { PersonaFrontmatterSchema, type Persona, type PersonaFrontmatter } from "./types.js";

export function parsePersonaFile(content: string, sourcePath?: string): Persona {
  const parsed = matter(content);
  const meta = PersonaFrontmatterSchema.parse(parsed.data) as PersonaFrontmatter;
  const body = parsed.content.trim();
  if (!body) {
    throw new Error(`${sourcePath ?? "<persona>"}: persona has empty body`);
  }
  return { frontmatter: meta, body, sourcePath };
}

export async function loadPersona(path: string): Promise<Persona> {
  const content = await fs.readFile(path, "utf-8");
  return parsePersonaFile(content, path);
}

async function walkMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
    }
  }
  await walk(root);
  return out;
}

export async function discoverPersonas(root: string): Promise<Persona[]> {
  let stat;
  try {
    stat = await fs.stat(root);
  } catch {
    throw new Error(`persona root does not exist: ${root}`);
  }
  if (!stat.isDirectory()) throw new Error(`persona root is not a directory: ${root}`);

  const files = await walkMarkdown(root);
  const personas: Persona[] = [];
  const seen = new Map<string, string>();

  for (const md of files) {
    const parent = dirname(md);
    if (parent === root) continue;
    const base = basename(md);
    if (base.startsWith("_") || base === "INDEX.md") continue;

    let p: Persona;
    try {
      p = await loadPersona(md);
    } catch (e) {
      throw new Error(`failed to load ${md}: ${(e as Error).message}`);
    }

    const parentName = basename(parent);
    if (p.frontmatter.category !== parentName) {
      throw new Error(
        `${md}: frontmatter category=${JSON.stringify(p.frontmatter.category)} but parent directory is ${JSON.stringify(parentName)}`,
      );
    }
    const stem = base.replace(/\.md$/, "");
    if (stem !== p.frontmatter.slug) {
      throw new Error(
        `${md}: filename stem ${JSON.stringify(stem)} does not match slug ${JSON.stringify(p.frontmatter.slug)}`,
      );
    }
    if (seen.has(p.frontmatter.slug)) {
      throw new Error(`duplicate slug ${JSON.stringify(p.frontmatter.slug)}: ${seen.get(p.frontmatter.slug)} and ${md}`);
    }
    seen.set(p.frontmatter.slug, md);
    personas.push(p);
  }
  return personas;
}

export function personaAllCategories(p: Persona): string[] {
  return [p.frontmatter.category, ...p.frontmatter.secondary_categories];
}
