---
name: synth-personas
description: |
  Generate synthetic-persona feedback on an artifact (pitch deck, doc, design proposal, white paper) by fanning out parallel OpenRouter LLM calls — one per persona — against a curated set of ~80 persona profiles (tech billionaires, VCs, tech media, podcasters, scientists, public intellectuals, developer audiences). TRIGGER when the user wants reactions "from a panel of", "as if from VCs/billionaires/tech-media", asks "what would X think of this", or asks to score a pitch deck / proposal across many viewpoints. DO NOT trigger for single-persona roleplay or general feedback requests.
---

# synth-personas

A TypeScript CLI drives parallel persona-based feedback against an artifact. Persona profiles ship with the package and are inspectable via `synth-personas list-personas`; evaluation tasks are YAML files with a rubric + selection + model config.

## When to use this skill

- User has an artifact (markdown file, usually a pitch / proposal / design doc) AND
- Wants reactions or scored feedback across many simulated viewpoints AND
- The artifact is the kind of thing personas can react to (pitch, proposal, white paper, design doc) — not code, PRs, or generic prose.

## Prerequisites

1. `synth-personas` binary on PATH (`npm i -g @sociosim/cli` if not).
2. `OPENROUTER_API_KEY` env var set (sign up at <https://openrouter.ai/>).

If either is missing, surface it and stop — don't try to work around it.

## How to invoke

1. **Discover what's available** (cheap, no API calls):
   ```bash
   synth-personas list-personas
   synth-personas list-personas --category vcs
   ```

2. **Build or pick an evaluation task**. If the user has an artifact but no task file, help them author one — the rubric is the load-bearing part. Propose a rubric (3-6 named criteria with 1-10 scales), confirm with the user, then write the YAML using this shape:

   ```yaml
   name: my-task
   artifact:
     path: ./pitch.md            # absolute path of the user's artifact
     kind: pitch_deck
     title: My Pitch
   rubric:
     - { name: novelty, description: "How new is this idea?", scale: [1, 10] }
     - { name: feasibility, description: "How realistic is execution?", scale: [1, 10] }
   persona_selection:
     categories: [vcs, billionaires]
     limit: 20
   model:
     default: anthropic/claude-sonnet-4
   output:
     dir: ./runs
   ```

   Write the YAML to a file the user picks (e.g. `./my-task.yaml`). If you have access to an `evaluations/` directory with templates (e.g. `evaluations/moonshot.yaml`), copy and adapt; otherwise write from scratch using the shape above.

3. **Validate before running** (cheap, no API calls):
   ```bash
   synth-personas validate-task ./my-task.yaml
   synth-personas show-prompt ./my-task.yaml --persona-slug elon-musk
   ```
   `show-prompt` renders the exact system + user prompts so you and the user can sanity-check before spending tokens.

4. **Dev-mode run** with `--limit 3` first to sanity-check output quality and cost:
   ```bash
   synth-personas run ./my-task.yaml --limit 3
   ```

5. **Full run** (only after dev-mode passes and user confirms):
   ```bash
   synth-personas run ./my-task.yaml
   ```
   Output lands in `<output.dir>/<UTC-timestamp>-<task-name>/`. The aggregated `report.md` is the primary deliverable — read it and surface highlights to the user.

## Cost awareness

A full run = N personas × ~2k output tokens. At 80 personas with Sonnet-class models, expect roughly $1-3 per run; with Opus, $5-15; with Haiku or Gemini Flash, well under $1. Always confirm with the user before a full run if N > 20.

## Persona library

The bundled library covers seven categories: `billionaires`, `vcs`, `media`, `podcasters`, `scientists`, `public_intellectuals`, `dev_audience`. Inspect with `synth-personas list-personas`.

To use a custom persona set (e.g. a project's own personas), pass `--personas-root <dir>` to any command. The directory must be organized as `<root>/<category>/<slug>.md` with YAML frontmatter matching the bundled schema.

## Adding or fixing a persona (when contributing back)

Persona files use this layout: `<personas-root>/<category>/<slug>.md` with YAML frontmatter. After creating or editing:

```bash
synth-personas validate-persona <path-to-persona.md>
```

Required frontmatter: `name`, `slug`, `category` (must match parent dir), `last_updated`. Required body sections: Background, Worldview, What excites them, What turns them off, Communication style, Famous positions, Sample quotes, When evaluating a moonshot pitch, Failure modes when roleplaying.

## Re-aggregating an existing run

```bash
synth-personas aggregate <run-dir>/
```

Re-runs aggregation from per-persona JSON without making new API calls — useful after a partial run or to regenerate the report.

## Notes

- The model is fully configurable. Each evaluation YAML sets `model.default`. Per-persona overrides go in the persona's frontmatter under `model_hints`. A CLI `--model` flag overrides both.
- The runner streams each persona's JSON to disk as it returns — Ctrl-C or partial failures still leave usable output, and `aggregate` can be re-run independently.
- Refusals ("As an AI, I can't roleplay...") are detected, logged as `<slug>.error.json`, and excluded from numerical aggregation (but appear in the report's failure section).
