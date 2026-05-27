import type { Persona, PersonaSelection } from "./types.js";
import { personaAllCategories } from "./persona.js";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function selectPersonas(
  personas: Persona[],
  selection: PersonaSelection,
  opts: { rngSeed?: number } = {},
): Persona[] {
  const bySlug = new Map(personas.map((p) => [p.frontmatter.slug, p] as const));

  const matchesFilters = (p: Persona): boolean => {
    if (selection.categories.length > 0) {
      const cats = personaAllCategories(p);
      if (!cats.some((c) => selection.categories.includes(c))) return false;
    }
    if (selection.tags_any.length > 0) {
      if (!p.frontmatter.tags.some((t) => selection.tags_any.includes(t))) return false;
    }
    if (selection.tags_all.length > 0) {
      if (!selection.tags_all.every((t) => p.frontmatter.tags.includes(t))) return false;
    }
    return true;
  };

  let filtered = personas.filter(matchesFilters);

  const selected = new Set(filtered.map((p) => p.frontmatter.slug));
  for (const slug of selection.include_slugs) {
    const p = bySlug.get(slug);
    if (!p) throw new Error(`include_slugs references unknown slug: ${JSON.stringify(slug)}`);
    if (!selected.has(slug)) {
      filtered.push(p);
      selected.add(slug);
    }
  }

  if (selection.exclude_slugs.length > 0) {
    const excludes = new Set(selection.exclude_slugs);
    const unknown = [...excludes].filter((s) => !bySlug.has(s));
    if (unknown.length > 0) {
      throw new Error(`exclude_slugs references unknown slugs: ${JSON.stringify(unknown.sort())}`);
    }
    filtered = filtered.filter((p) => !excludes.has(p.frontmatter.slug));
  }

  if (selection.shuffle) {
    const rng = opts.rngSeed !== undefined ? mulberry32(opts.rngSeed) : Math.random;
    shuffleInPlace(filtered, rng);
  }

  if (selection.limit != null) filtered = filtered.slice(0, selection.limit);
  return filtered;
}
