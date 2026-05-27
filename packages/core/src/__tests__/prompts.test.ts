import { describe, it, expect } from "vitest";
import { renderSystemPrompt, renderUserPrompt } from "../prompts.js";
import type { EvaluationTask, Persona } from "../types.js";

const persona: Persona = {
  frontmatter: {
    name: "Test Person",
    slug: "test-person",
    category: "billionaires",
    secondary_categories: [],
    tags: [],
    affiliations: [],
    sources_consulted: [],
    style_notes: null,
    expertise_weight: 1,
    confidence: "high",
    disclaimers: [],
    last_updated: null,
  },
  body: "## Background\nA test person.",
};

const task: EvaluationTask = {
  name: "test",
  description: null,
  artifact: { path: "x", kind: "pitch_deck", title: "Sample Pitch" },
  persona_selection: { categories: [], tags_any: [], tags_all: [], include_slugs: [], exclude_slugs: [], limit: null, shuffle: false },
  model: { default: "google/gemini-3-flash-preview", temperature: 0.7, max_tokens: 2000, reasoning: null },
  rubric: [
    { name: "feasibility", description: "Is it possible?", scale: [1, 10] },
  ],
  extra_questions: [{ id: "biggest_worry", prompt: "Worry?" }],
  runner: { concurrency: 10, retry_max_attempts: 4, timeout_seconds: 90 },
  output: { dir: ".", keep_raw_responses: false, synthesis: false, synthesis_model: null },
};

describe("renderSystemPrompt", () => {
  it("includes the persona name and body", () => {
    const out = renderSystemPrompt(persona, { kind: "pitch_deck", title: "Sample" });
    expect(out).toContain("Test Person");
    expect(out).toContain("## Background");
    expect(out).toContain("Critical roleplay rules");
  });

  it("uses moonshot scoring discipline for non-brand_names kinds", () => {
    const out = renderSystemPrompt(persona, { kind: "pitch_deck", title: null });
    expect(out).toContain("read carefully");
    expect(out).not.toContain("brand-name evaluation");
  });
});

describe("renderUserPrompt", () => {
  it("wraps artifact in delimiters and lists rubric + extra questions", () => {
    const out = renderUserPrompt(persona, task, "MY-PITCH-BODY");
    expect(out).toContain("<<<ARTIFACT_START>>>");
    expect(out).toContain("MY-PITCH-BODY");
    expect(out).toContain("<<<ARTIFACT_END>>>");
    expect(out).toContain("**feasibility** (1–10)");
    expect(out).toContain("**biggest_worry**: Worry?");
  });
});
