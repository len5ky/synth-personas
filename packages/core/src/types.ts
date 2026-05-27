import { z } from "zod";

export const ModelHintsSchema = z
  .object({
    model: z.string().min(1).nullable().optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    max_tokens: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type ModelHints = z.infer<typeof ModelHintsSchema>;

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case alnum");

export const PersonaFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    slug: slugSchema,
    category: z.string().min(1),
    secondary_categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    affiliations: z.array(z.string()).default([]),
    sources_consulted: z.array(z.string()).default([]),
    model_hints: ModelHintsSchema.optional(),
    style_notes: z.string().nullable().optional(),
    expertise_weight: z.number().min(0).max(2).default(1.0),
    confidence: z.enum(["high", "medium", "low"]).default("medium"),
    disclaimers: z.array(z.string()).default([]),
    last_updated: z
      .union([z.string(), z.date()])
      .nullable()
      .optional()
      .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null)),
  })
  .strict();
export type PersonaFrontmatter = z.infer<typeof PersonaFrontmatterSchema>;

export interface Persona {
  frontmatter: PersonaFrontmatter;
  body: string;
  sourcePath?: string;
}

export const RubricItemSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_]+$/, "rubric name must be snake_case alnum"),
    description: z.string().min(1),
    scale: z.tuple([z.number().int(), z.number().int()]).default([1, 10]),
  })
  .strict()
  .refine((r) => r.scale[0] < r.scale[1], {
    message: "scale low must be < high",
  });
export type RubricItem = z.infer<typeof RubricItemSchema>;

export const ExtraQuestionSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_]+$/, "extra_question id must be snake_case alnum"),
    prompt: z.string().min(1),
  })
  .strict();
export type ExtraQuestion = z.infer<typeof ExtraQuestionSchema>;

export const PersonaSelectionSchema = z
  .object({
    categories: z.array(z.string()).default([]),
    tags_any: z.array(z.string()).default([]),
    tags_all: z.array(z.string()).default([]),
    include_slugs: z.array(z.string()).default([]),
    exclude_slugs: z.array(z.string()).default([]),
    limit: z.number().int().positive().nullable().optional(),
    shuffle: z.boolean().default(false),
  })
  .strict();
export type PersonaSelection = z.infer<typeof PersonaSelectionSchema>;

export const ReasoningConfigSchema = z
  .object({
    effort: z.enum(["low", "medium", "high"]).nullable().optional(),
    max_tokens: z.number().int().positive().nullable().optional(),
    exclude: z.boolean().nullable().optional(),
  })
  .strict();
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;

export const ModelConfigSchema = z
  .object({
    default: z.string().min(1).default("google/gemini-3-flash-preview"),
    temperature: z.number().min(0).max(2).default(0.7),
    max_tokens: z.number().int().positive().default(2000),
    reasoning: ReasoningConfigSchema.nullable().optional(),
  })
  .strict();
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const RunnerConfigSchema = z
  .object({
    concurrency: z.number().int().positive().default(10),
    retry_max_attempts: z.number().int().positive().default(5),
    timeout_seconds: z.number().int().positive().default(120),
  })
  .strict();
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

export const ArtifactConfigSchema = z
  .object({
    path: z.string().min(1),
    kind: z.string().default("artifact"),
    title: z.string().nullable().optional(),
  })
  .strict();
export type ArtifactConfig = z.infer<typeof ArtifactConfigSchema>;

export const OutputConfigSchema = z
  .object({
    dir: z.string().default("./runs"),
    keep_raw_responses: z.boolean().default(true),
    synthesis: z.boolean().default(false),
    synthesis_model: z.string().nullable().optional(),
  })
  .strict();
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const EvaluationTaskSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[^/\\\s\t\n]+$/, "name must be filesystem-safe"),
    description: z.string().nullable().optional(),
    artifact: ArtifactConfigSchema,
    persona_selection: PersonaSelectionSchema.default({}),
    model: ModelConfigSchema.default({}),
    rubric: z.array(RubricItemSchema).min(1),
    extra_questions: z.array(ExtraQuestionSchema).default([]),
    runner: RunnerConfigSchema.default({}),
    output: OutputConfigSchema.default({}),
  })
  .strict()
  .superRefine((task, ctx) => {
    const names = task.rubric.map((r) => r.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate rubric names: ${names.join(", ")}` });
    }
    const ids = task.extra_questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate extra_question ids: ${ids.join(", ")}` });
    }
  });
export type EvaluationTask = z.infer<typeof EvaluationTaskSchema>;

export interface PersonaResult {
  personaSlug: string;
  success: boolean;
  payload: Record<string, unknown>;
  error?: string | null;
}

export interface PersonaResultPayload {
  persona_slug: string;
  persona_name: string;
  category: string;
  secondary_categories: string[];
  model: string;
  temperature: number;
  started_at: string;
  finished_at?: string;
  feedback?: Record<string, unknown>;
  usage?: Record<string, unknown> | null;
  raw_response?: string;
  error_kind?: string;
  error?: string;
}
