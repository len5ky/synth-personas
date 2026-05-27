import type { RubricItem } from "./types.js";

export interface RubricStats {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  histogram: Record<string, number>;
}

export interface AggregateResult {
  n_successes: number;
  n_failures: number;
  rubric_overall: Record<string, RubricStats | null>;
  rubric_by_category: Record<string, Record<string, RubricStats | null>>;
  confidence_distribution: Record<string, number>;
  quotes: Array<{
    persona_slug: string | null;
    persona_name: string | null;
    category: string;
    quote: string;
    take: string;
    score_avg: number | null;
  }>;
  refusals: Array<{
    persona_slug: string | null;
    persona_name: string | null;
    category: string | null;
    error_kind: string | null;
  }>;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function mean(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1]! + sorted[m]!) / 2 : sorted[m]!;
}

function std(values: number[]): number {
  if (values.length === 0) return 0;
  const mu = mean(values);
  let s = 0;
  for (const v of values) s += (v - mu) ** 2;
  return Math.sqrt(s / values.length);
}

function stats(values: number[]): RubricStats | null {
  if (values.length === 0) return null;
  const hist: Record<string, number> = {};
  for (const v of values) {
    const k = String(Math.trunc(v));
    hist[k] = (hist[k] ?? 0) + 1;
  }
  return {
    n: values.length,
    mean: round3(mean(values)),
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    std: round3(std(values)),
    histogram: Object.fromEntries(
      Object.entries(hist).sort(([a], [b]) => Number(a) - Number(b)),
    ),
  };
}

export interface SuccessRecord {
  persona_slug?: string;
  persona_name?: string;
  category?: string;
  feedback?: {
    scores?: Record<string, { score?: number }>;
    confidence?: string;
    memorable_quote?: string;
    overall_take?: string;
  };
}

export interface FailureRecord {
  persona_slug?: string;
  persona_name?: string;
  category?: string;
  error_kind?: string;
}

export function aggregate(
  successes: SuccessRecord[],
  failures: FailureRecord[],
  rubricNames: string[],
): AggregateResult {
  const byRubric: Record<string, number[]> = {};
  const byRubricCat: Record<string, Record<string, number[]>> = {};
  for (const n of rubricNames) {
    byRubric[n] = [];
    byRubricCat[n] = {};
  }

  const confDist: Record<string, number> = {};
  const quotes: AggregateResult["quotes"] = [];

  for (const s of successes) {
    const fb = s.feedback ?? {};
    const category = s.category ?? "unknown";
    const scoreAvgs: number[] = [];
    const scores = fb.scores ?? {};
    for (const name of rubricNames) {
      const entry = scores[name];
      if (entry && typeof entry.score === "number") {
        byRubric[name]!.push(entry.score);
        (byRubricCat[name]![category] ??= []).push(entry.score);
        scoreAvgs.push(entry.score);
      }
    }
    const conf = fb.confidence ?? "unknown";
    confDist[conf] = (confDist[conf] ?? 0) + 1;
    quotes.push({
      persona_slug: s.persona_slug ?? null,
      persona_name: s.persona_name ?? null,
      category,
      quote: fb.memorable_quote ?? "",
      take: fb.overall_take ?? "",
      score_avg:
        scoreAvgs.length > 0
          ? Math.round((scoreAvgs.reduce((a, b) => a + b, 0) / scoreAvgs.length) * 100) / 100
          : null,
    });
  }

  const rubricOverall: Record<string, RubricStats | null> = {};
  const rubricByCategory: Record<string, Record<string, RubricStats | null>> = {};
  for (const name of rubricNames) {
    rubricOverall[name] = stats(byRubric[name]!);
    rubricByCategory[name] = {};
    for (const [cat, vals] of Object.entries(byRubricCat[name]!)) {
      rubricByCategory[name]![cat] = stats(vals);
    }
  }

  return {
    n_successes: successes.length,
    n_failures: failures.length,
    rubric_overall: rubricOverall,
    rubric_by_category: rubricByCategory,
    confidence_distribution: confDist,
    quotes,
    refusals: failures.map((f) => ({
      persona_slug: f.persona_slug ?? null,
      persona_name: f.persona_name ?? null,
      category: f.category ?? null,
      error_kind: f.error_kind ?? null,
    })),
  };
}

function sparkline(hist: Record<string, number>, scale: [number, number]): string {
  const blocks = "▁▂▃▄▅▆▇█";
  const [lo, hi] = scale;
  const counts: number[] = [];
  for (let i = lo; i <= hi; i++) counts.push(hist[String(i)] ?? 0);
  if (counts.length === 0) return "";
  const mx = Math.max(...counts) || 1;
  return counts
    .map((c) =>
      c === 0 ? "·" : blocks[Math.min(blocks.length - 1, Math.floor((c / mx) * (blocks.length - 1)))],
    )
    .join("");
}

export function renderReport(args: {
  taskName: string;
  artifactTitle?: string | null;
  aggregate: AggregateResult;
  rubric: RubricItem[];
  synthesis?: Record<string, unknown> | null;
}): string {
  const { taskName, artifactTitle, aggregate: a, rubric, synthesis } = args;
  const lines: string[] = [];
  const title = artifactTitle ?? taskName;
  lines.push(`# Persona Feedback Report — ${title}`, "");
  lines.push(`- **Task**: \`${taskName}\``);
  lines.push(`- **Personas (success / failure)**: ${a.n_successes} / ${a.n_failures}`);
  const confs = a.confidence_distribution ?? {};
  if (Object.keys(confs).length > 0) {
    lines.push(`- **Confidence distribution**: ${Object.entries(confs).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  }
  lines.push("");

  if (synthesis) {
    lines.push("## TL;DR");
    if (synthesis.tldr) {
      lines.push(String(synthesis.tldr), "");
    }
    if (synthesis.headline_score != null) {
      lines.push(`**Headline score**: ${synthesis.headline_score} / 10`, "");
    }
    for (const [label, key] of [
      ["What excited them", "what_excited_them"],
      ["What they hated", "what_they_hated"],
      ["Biggest unresolved questions", "biggest_unresolved_questions"],
    ] as const) {
      const items = (synthesis as Record<string, unknown>)[key];
      if (Array.isArray(items) && items.length > 0) {
        lines.push(`### ${label}`);
        for (const item of items) lines.push(`- ${item}`);
        lines.push("");
      }
    }
    if (synthesis.consensus_vs_dissent) {
      lines.push("### Consensus vs dissent", String(synthesis.consensus_vs_dissent), "");
    }
    const categorySignal = synthesis.category_signal as Record<string, string> | undefined;
    if (categorySignal && Object.keys(categorySignal).length > 0) {
      lines.push("### By category");
      for (const [cat, msg] of Object.entries(categorySignal)) {
        lines.push(`- **${cat}**: ${msg}`);
      }
      lines.push("");
    }
    if (synthesis.recommended_next_action) {
      lines.push("### Recommended next action", String(synthesis.recommended_next_action), "");
    }
  }

  lines.push("## Rubric scores (overall)", "");
  lines.push("| Rubric | n | mean | median | min | max | std | distribution |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of rubric) {
    const s = a.rubric_overall[r.name];
    if (!s) {
      lines.push(`| ${r.name} | 0 | - | - | - | - | - | - |`);
      continue;
    }
    const spark = sparkline(s.histogram, r.scale);
    lines.push(
      `| ${r.name} | ${s.n} | ${s.mean} | ${s.median} | ${s.min} | ${s.max} | ${s.std} | \`${spark}\` |`,
    );
  }
  lines.push("");
  lines.push("_Distribution sparkline reads left→right from the rubric scale minimum to maximum._", "");

  if (Object.keys(a.rubric_by_category).length > 0) {
    lines.push("## Rubric scores by category");
    for (const r of rubric) {
      const cats = a.rubric_by_category[r.name] ?? {};
      if (Object.keys(cats).length === 0) continue;
      lines.push(`### ${r.name}`, "");
      lines.push("| Category | n | mean | median | std |");
      lines.push("|---|---|---|---|---|");
      for (const [cat, s] of Object.entries(cats).sort(([a], [b]) => a.localeCompare(b))) {
        if (s) lines.push(`| ${cat} | ${s.n} | ${s.mean} | ${s.median} | ${s.std} |`);
      }
      lines.push("");
    }
  }

  if (a.quotes.length > 0) {
    lines.push("## Voices", "");
    const byCat = new Map<string, AggregateResult["quotes"]>();
    for (const q of a.quotes) {
      if (!byCat.has(q.category)) byCat.set(q.category, []);
      byCat.get(q.category)!.push(q);
    }
    for (const cat of [...byCat.keys()].sort()) {
      lines.push(`### ${cat}`);
      const sorted = [...byCat.get(cat)!].sort(
        (a, b) => (b.score_avg ?? 0) - (a.score_avg ?? 0),
      );
      for (const q of sorted) {
        const avgStr = q.score_avg != null ? ` (avg ${q.score_avg})` : "";
        lines.push(`- **${q.persona_name}**${avgStr}`);
        if (q.quote) lines.push(`  > ${q.quote}`);
        if (q.take) lines.push(`  ${q.take}`);
      }
      lines.push("");
    }
  }

  if (a.refusals.length > 0) {
    lines.push("## Failures / refusals", "");
    for (const r of a.refusals) {
      lines.push(`- **${r.persona_name ?? r.persona_slug}** (${r.category}): \`${r.error_kind}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}
