import nunjucks from "nunjucks";
import { SYSTEM_TEMPLATE, USER_TEMPLATE, REPAIR_TEMPLATE } from "./templatesInline.js";
import type { Persona, EvaluationTask } from "./types.js";

const env = new nunjucks.Environment(null, {
  autoescape: false,
  trimBlocks: false,
  lstripBlocks: false,
});

function personaContext(p: Persona): Record<string, unknown> {
  return {
    name: p.frontmatter.name,
    slug: p.frontmatter.slug,
    category: p.frontmatter.category,
    body: p.body,
    frontmatter: p.frontmatter,
  };
}

export function renderSystemPrompt(
  persona: Persona,
  artifact?: { kind?: string; title?: string | null } | null,
): string {
  return env.renderString(SYSTEM_TEMPLATE, {
    persona: personaContext(persona),
    artifact: artifact ?? {},
  });
}

export function renderUserPrompt(
  persona: Persona,
  task: EvaluationTask,
  artifactContent: string,
): string {
  return env.renderString(USER_TEMPLATE, {
    persona: personaContext(persona),
    artifact: {
      title: task.artifact.title ?? null,
      kind: task.artifact.kind,
      content: artifactContent,
    },
    rubric: task.rubric,
    extra_questions: task.extra_questions,
  });
}

export function renderRepairPrompt(
  persona: Persona,
  rawResponse: string,
  errorMessage: string,
): string {
  return env.renderString(REPAIR_TEMPLATE, {
    persona: personaContext(persona),
    raw_response: rawResponse,
    error_message: errorMessage,
  });
}
