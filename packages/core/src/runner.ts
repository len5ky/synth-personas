import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import {
  OpenRouterClient,
  RateLimited,
  ProviderError,
  ClientError,
  TransportError,
  type ChatMessage,
  type OpenRouterClientOptions,
} from "./client.js";
import { buildResponseSchema, parseFeedback, looksLikeRefusal } from "./responseSchema.js";
import { renderSystemPrompt, renderUserPrompt, renderRepairPrompt } from "./prompts.js";
import type { EvaluationTask, Persona, PersonaResult } from "./types.js";

export interface RunEvaluationOptions {
  task: EvaluationTask;
  personas: Persona[];
  artifactContent: string;
  modelOverride?: string | null;
  reasoningOverride?: Record<string, unknown> | null;
  /** Called as each persona finishes. Use this to stream results to disk or DB. */
  onPersonaResult?: (result: PersonaResult) => void | Promise<void>;
  /** Called when overall progress advances (count completed). */
  onProgress?: (completed: number, total: number) => void;
  /** Override the OpenRouter client (test injection). */
  clientOptions?: OpenRouterClientOptions;
  client?: OpenRouterClient;
  /** Optional signal to cancel the run early. */
  signal?: AbortSignal;
}

export interface RunEvaluationOutput {
  successes: PersonaResult[];
  failures: PersonaResult[];
  manifest: Record<string, unknown>;
}

function resolveModel(persona: Persona, task: EvaluationTask, override?: string | null): string {
  if (override) return override;
  if (persona.frontmatter.model_hints?.model) return persona.frontmatter.model_hints.model;
  return task.model.default;
}

function resolveTemperature(persona: Persona, task: EvaluationTask): number {
  if (persona.frontmatter.model_hints?.temperature != null) {
    return persona.frontmatter.model_hints.temperature;
  }
  return task.model.temperature;
}

function resolveMaxTokens(persona: Persona, task: EvaluationTask): number {
  if (persona.frontmatter.model_hints?.max_tokens != null) {
    return persona.frontmatter.model_hints.max_tokens;
  }
  return task.model.max_tokens;
}

async function callWithRetries(
  client: OpenRouterClient,
  args: {
    messages: ChatMessage[];
    model: string;
    temperature: number;
    maxTokens: number;
    responseSchema: unknown;
    reasoning?: Record<string, unknown> | null;
  },
  maxAttempts: number,
  signal?: AbortSignal,
) {
  return pRetry(
    async () => {
      if (signal?.aborted) throw new AbortError("aborted");
      try {
        return await client.chat({
          messages: args.messages,
          model: args.model,
          temperature: args.temperature,
          maxTokens: args.maxTokens,
          responseSchema: args.responseSchema,
          reasoning: args.reasoning ?? null,
        });
      } catch (e) {
        if (e instanceof ClientError) {
          throw new AbortError(e.message);
        }
        if (e instanceof RateLimited || e instanceof ProviderError || e instanceof TransportError) {
          throw e;
        }
        throw e;
      }
    },
    {
      retries: Math.max(0, maxAttempts - 1),
      factor: 2,
      minTimeout: 2000,
      maxTimeout: 60_000,
      randomize: true,
    },
  );
}

async function runOne(
  client: OpenRouterClient,
  persona: Persona,
  task: EvaluationTask,
  artifactContent: string,
  responseSchema: unknown,
  modelOverride: string | undefined | null,
  reasoningOverride: Record<string, unknown> | undefined | null,
  signal?: AbortSignal,
): Promise<PersonaResult> {
  const started = new Date().toISOString();
  const model = resolveModel(persona, task, modelOverride);
  const temperature = resolveTemperature(persona, task);
  const maxTokens = resolveMaxTokens(persona, task);

  let reasoning: Record<string, unknown> | null = null;
  if (reasoningOverride !== undefined && reasoningOverride !== null) reasoning = reasoningOverride;
  else if (task.model.reasoning) {
    const r = task.model.reasoning;
    const compact: Record<string, unknown> = {};
    if (r.effort != null) compact.effort = r.effort;
    if (r.max_tokens != null) compact.max_tokens = r.max_tokens;
    if (r.exclude != null) compact.exclude = r.exclude;
    reasoning = Object.keys(compact).length ? compact : null;
  }

  const system = renderSystemPrompt(persona, {
    kind: task.artifact.kind,
    title: task.artifact.title ?? null,
  });
  const user = renderUserPrompt(persona, task, artifactContent);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const meta = {
    persona_slug: persona.frontmatter.slug,
    persona_name: persona.frontmatter.name,
    category: persona.frontmatter.category,
    secondary_categories: persona.frontmatter.secondary_categories,
    model,
    temperature,
    started_at: started,
  };

  let resp;
  try {
    resp = await callWithRetries(
      client,
      { messages, model, temperature, maxTokens, responseSchema, reasoning },
      task.runner.retry_max_attempts,
      signal,
    );
  } catch (e) {
    const err = e as Error;
    const isClient = err.name === "AbortError" || (e as { originalError?: Error }).originalError?.name === "ClientError";
    const payload = {
      ...meta,
      error_kind: isClient ? "client_error" : "retry_exhausted",
      error: err.message ?? String(e),
    };
    return { personaSlug: persona.frontmatter.slug, success: false, payload, error: err.message ?? String(e) };
  }

  const rawText = OpenRouterClient.extractText(resp);
  let usage = resp.usage as Record<string, unknown> | undefined;

  if (looksLikeRefusal(rawText)) {
    return {
      personaSlug: persona.frontmatter.slug,
      success: false,
      payload: { ...meta, error_kind: "refusal", raw_response: rawText, usage },
      error: "refusal",
    };
  }

  let feedback;
  try {
    feedback = parseFeedback(rawText, task);
  } catch (e) {
    const errMsg = (e as Error).message;
    const repairUser = renderRepairPrompt(persona, rawText, errMsg);
    const repairMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: rawText },
      { role: "user", content: repairUser },
    ];
    try {
      const repairResp = await callWithRetries(
        client,
        { messages: repairMessages, model, temperature, maxTokens, responseSchema, reasoning },
        2,
        signal,
      );
      const repairText = OpenRouterClient.extractText(repairResp);
      feedback = parseFeedback(repairText, task);
      const combinedRaw = `${rawText}\n---REPAIRED---\n${repairText}`;
      const usageAfter = repairResp.usage as Record<string, unknown> | undefined;
      if (usage && usageAfter) {
        const merged: Record<string, unknown> = {};
        const allKeys = new Set([...Object.keys(usage), ...Object.keys(usageAfter)]);
        for (const k of allKeys) {
          const v1 = usage[k];
          const v2 = usageAfter[k];
          if (typeof v1 === "number" && typeof v2 === "number") merged[k] = v1 + v2;
          else merged[k] = v2 !== undefined ? v2 : v1;
        }
        usage = merged;
      } else {
        usage = usageAfter ?? usage;
      }
      const finished = new Date().toISOString();
      const ok: Record<string, unknown> = { ...meta, finished_at: finished, feedback, usage };
      if (task.output.keep_raw_responses) ok.raw_response = combinedRaw;
      return { personaSlug: persona.frontmatter.slug, success: true, payload: ok };
    } catch (repairE) {
      return {
        personaSlug: persona.frontmatter.slug,
        success: false,
        payload: {
          ...meta,
          error_kind: "unparseable",
          error: `${errMsg}; repair failed: ${(repairE as Error).message}`,
          raw_response: rawText,
        },
        error: "unparseable",
      };
    }
  }

  const finished = new Date().toISOString();
  const ok: Record<string, unknown> = { ...meta, finished_at: finished, feedback, usage };
  if (task.output.keep_raw_responses) ok.raw_response = rawText;
  return { personaSlug: persona.frontmatter.slug, success: true, payload: ok };
}

export async function runEvaluation(opts: RunEvaluationOptions): Promise<RunEvaluationOutput> {
  const { task, personas, artifactContent, modelOverride, reasoningOverride, onPersonaResult, onProgress, signal } = opts;
  const client = opts.client ?? new OpenRouterClient({
    ...opts.clientOptions,
    timeoutMs: opts.clientOptions?.timeoutMs ?? task.runner.timeout_seconds * 1000,
  });

  const responseSchema = buildResponseSchema(task);
  const limit = pLimit(task.runner.concurrency);

  let completed = 0;
  const successes: PersonaResult[] = [];
  const failures: PersonaResult[] = [];

  const tasks = personas.map((p) =>
    limit(async () => {
      let result: PersonaResult;
      try {
        result = await runOne(
          client,
          p,
          task,
          artifactContent,
          responseSchema,
          modelOverride ?? null,
          reasoningOverride ?? null,
          signal,
        );
      } catch (e) {
        result = {
          personaSlug: p.frontmatter.slug,
          success: false,
          payload: {
            persona_slug: p.frontmatter.slug,
            persona_name: p.frontmatter.name,
            category: p.frontmatter.category,
            error_kind: "unexpected",
            error: (e as Error).message,
          },
          error: (e as Error).message,
        };
      }
      if (onPersonaResult) await onPersonaResult(result);
      completed++;
      onProgress?.(completed, personas.length);
      (result.success ? successes : failures).push(result);
      return result;
    }),
  );

  await Promise.all(tasks);

  const manifest = {
    task_name: task.name,
    task_description: task.description ?? null,
    artifact_path: task.artifact.path,
    artifact_title: task.artifact.title ?? null,
    model_default: task.model.default,
    model_override: modelOverride ?? null,
    rubric: task.rubric,
    extra_questions: task.extra_questions,
    n_personas_requested: personas.length,
    n_successes: successes.length,
    n_failures: failures.length,
    failure_summary: failures.map((f) => ({ persona: f.personaSlug, error: f.error })),
    completed_at: new Date().toISOString(),
  };

  return { successes, failures, manifest };
}
