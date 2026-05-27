import { describe, it, expect } from "vitest";
import { parseFeedback, looksLikeRefusal, buildResponseSchema } from "../responseSchema.js";
import type { EvaluationTask } from "../types.js";

const baseTask: EvaluationTask = {
  name: "test",
  description: null,
  artifact: { path: "x", kind: "pitch_deck", title: "T" },
  persona_selection: { categories: [], tags_any: [], tags_all: [], include_slugs: [], exclude_slugs: [], limit: null, shuffle: false },
  model: { default: "google/gemini-3-flash-preview", temperature: 0.7, max_tokens: 2000, reasoning: null },
  rubric: [
    { name: "feasibility", description: "?", scale: [1, 10] },
    { name: "impact", description: "?", scale: [1, 10] },
  ],
  extra_questions: [],
  runner: { concurrency: 10, retry_max_attempts: 4, timeout_seconds: 90 },
  output: { dir: ".", keep_raw_responses: false, synthesis: false, synthesis_model: null },
};

describe("parseFeedback", () => {
  it("parses well-formed JSON", () => {
    const parsed = parseFeedback(
      JSON.stringify({
        overall_take: "fine",
        scores: {
          feasibility: { score: 6, rationale: "ok" },
          impact: { score: 8, rationale: "big" },
        },
        memorable_quote: "lol",
        confidence: "medium",
      }),
      baseTask,
    );
    expect(parsed.scores.feasibility.score).toBe(6);
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"overall_take":"x","scores":{"feasibility":{"score":1,"rationale":"r"},"impact":{"score":1,"rationale":"r"}},"memorable_quote":"q","confidence":"low"}\n```';
    const parsed = parseFeedback(raw, baseTask);
    expect(parsed.confidence).toBe("low");
  });

  it("clamps out-of-range scores", () => {
    const parsed = parseFeedback(
      JSON.stringify({
        overall_take: "x",
        scores: {
          feasibility: { score: 99, rationale: "r" },
          impact: { score: 0, rationale: "r" },
        },
        memorable_quote: "q",
        confidence: "high",
      }),
      baseTask,
    );
    expect(parsed.scores.feasibility.score).toBe(10);
    expect(parsed.scores.impact.score).toBe(1);
    expect(parsed.scores.feasibility._clamped_from).toBe(99);
  });

  it("rejects malformed responses", () => {
    expect(() => parseFeedback("nope", baseTask)).toThrow();
    expect(() => parseFeedback("[]", baseTask)).toThrow(/not a JSON object/);
    expect(() => parseFeedback(JSON.stringify({}), baseTask)).toThrow(/missing required keys/);
  });
});

describe("looksLikeRefusal", () => {
  it("detects common refusal markers", () => {
    expect(looksLikeRefusal("As an AI, I cannot impersonate real people.")).toBe(true);
    expect(looksLikeRefusal("I can't roleplay as a billionaire.")).toBe(true);
  });
  it("ignores refusal markers when text begins with JSON", () => {
    expect(looksLikeRefusal('{"overall_take": "as an AI I would still…"}')).toBe(false);
  });
});

describe("buildResponseSchema", () => {
  it("includes answers section iff extra_questions present", () => {
    const sNo = buildResponseSchema(baseTask);
    expect(sNo.required ?? []).not.toContain("answers");
    const sYes = buildResponseSchema({
      ...baseTask,
      extra_questions: [{ id: "q1", prompt: "?" }],
    });
    expect(sYes.required ?? []).toContain("answers");
  });
});
