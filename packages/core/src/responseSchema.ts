import type { EvaluationTask } from "./types.js";

export interface JsonSchema {
  type: string;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema | unknown>;
  required?: string[];
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  items?: JsonSchema | unknown;
}

export function buildResponseSchema(task: EvaluationTask): JsonSchema {
  const scoreProps: Record<string, JsonSchema> = {};
  for (const r of task.rubric) {
    scoreProps[r.name] = {
      type: "object",
      additionalProperties: false,
      properties: {
        score: { type: "integer", minimum: r.scale[0], maximum: r.scale[1] },
        rationale: { type: "string", minLength: 1 },
      },
      required: ["score", "rationale"],
    };
  }

  const schema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      overall_take: { type: "string", minLength: 1 },
      scores: {
        type: "object",
        additionalProperties: false,
        properties: scoreProps,
        required: task.rubric.map((r) => r.name),
      },
      memorable_quote: { type: "string" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["overall_take", "scores", "memorable_quote", "confidence"],
  };

  if (task.extra_questions.length > 0) {
    const answerProps: Record<string, JsonSchema> = {};
    for (const q of task.extra_questions) {
      answerProps[q.id] = { type: "string", minLength: 1 };
    }
    (schema.properties as Record<string, JsonSchema>).answers = {
      type: "object",
      additionalProperties: false,
      properties: answerProps,
      required: task.extra_questions.map((q) => q.id),
    };
    schema.required!.push("answers");
  }

  return schema;
}

export interface ParsedFeedback {
  overall_take: string;
  scores: Record<string, { score: number; rationale: string; _clamped_from?: number }>;
  memorable_quote: string;
  confidence: "low" | "medium" | "high";
  answers?: Record<string, string>;
}

export function parseFeedback(raw: string, task: EvaluationTask): ParsedFeedback {
  let text = raw.trim();
  if (text.startsWith("```")) {
    const firstNewline = text.indexOf("\n");
    if (firstNewline !== -1) text = text.slice(firstNewline + 1);
    if (text.endsWith("```")) text = text.slice(0, -3);
    text = text.trim();
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`response is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`response is not a JSON object (got ${Array.isArray(data) ? "array" : typeof data})`);
  }

  const obj = data as Record<string, unknown>;
  const requiredTop = ["overall_take", "scores", "memorable_quote", "confidence"];
  const missing = requiredTop.filter((k) => !(k in obj));
  if (missing.length > 0) throw new Error(`response missing required keys: ${JSON.stringify(missing.sort())}`);

  const scores = obj.scores;
  if (typeof scores !== "object" || scores === null || Array.isArray(scores)) {
    throw new Error("'scores' must be an object");
  }
  const scoresObj = scores as Record<string, unknown>;
  const expected = task.rubric.map((r) => r.name);
  const missingScores = expected.filter((n) => !(n in scoresObj));
  if (missingScores.length > 0) {
    throw new Error(`scores missing rubric items: ${JSON.stringify(missingScores.sort())}`);
  }

  for (const r of task.rubric) {
    const entry = scoresObj[r.name];
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`scores.${r.name} must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (!("score" in e) || !("rationale" in e)) {
      throw new Error(`scores.${r.name} must have 'score' and 'rationale'`);
    }
    let s = e.score;
    if (typeof s !== "number" || !Number.isInteger(s)) {
      if (typeof s === "number" && Number.isFinite(s) && Math.floor(s) === s) {
        e.score = Math.trunc(s);
        s = e.score;
      } else {
        throw new Error(`scores.${r.name}.score must be integer, got ${JSON.stringify(s)}`);
      }
    }
    const numS = s as number;
    if (numS < r.scale[0] || numS > r.scale[1]) {
      e._clamped_from = numS;
      e.score = Math.max(r.scale[0], Math.min(r.scale[1], numS));
    }
  }

  if (!["low", "medium", "high"].includes(obj.confidence as string)) {
    throw new Error(`confidence must be low|medium|high, got ${JSON.stringify(obj.confidence)}`);
  }

  if (task.extra_questions.length > 0) {
    const answers = obj.answers;
    if (typeof answers !== "object" || answers === null) {
      throw new Error("'answers' must be an object when extra_questions are present");
    }
    const ans = answers as Record<string, unknown>;
    const missingAns = task.extra_questions.map((q) => q.id).filter((id) => !(id in ans));
    if (missingAns.length > 0) {
      throw new Error(`answers missing keys: ${JSON.stringify(missingAns.sort())}`);
    }
  }

  return obj as unknown as ParsedFeedback;
}

const REFUSAL_MARKERS = [
  "as an ai",
  "as a language model",
  "i cannot roleplay",
  "i can't roleplay",
  "i'm not able to",
  "i am not able to",
  "i won't be able to roleplay",
  "i will not impersonate",
  "i cannot impersonate",
  "i can't impersonate",
];

export function looksLikeRefusal(raw: string): boolean {
  const head = raw.trim().toLowerCase().slice(0, 600);
  if (head.trimStart().startsWith("{")) return false;
  return REFUSAL_MARKERS.some((m) => head.includes(m));
}
