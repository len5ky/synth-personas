---
name: synth-personas
description:
  Generates synthetic-persona feedback on an artifact (pitch deck, design doc,
  proposal, white paper) by fanning out parallel OpenRouter LLM calls — one per
  persona — against a curated library of ~80 personas (tech billionaires, VCs,
  tech media, podcasters, scientists, public intellectuals, developer
  audiences). Use when the user wants reactions "from a panel of", "as if from
  VCs/billionaires/tech-media", asks "what would X think of this", or asks to
  score a pitch deck / proposal across many viewpoints. Do NOT use for
  single-persona roleplay or generic feedback.
---

# synth-personas

Drive parallel persona-based feedback against a user-supplied artifact (usually
a markdown file: pitch, proposal, design doc). Each persona returns scored
rubric judgments + freeform reactions; an aggregator writes a single
`report.md`.

## When to use

- User has an artifact (markdown file: pitch, proposal, design doc, white
  paper) AND
- Wants reactions or scored feedback across many simulated viewpoints (panel
  of VCs / tech media / billionaires / scientists / etc.).

## When not to use

- Single-persona roleplay ("write as Elon Musk would")
- General critique with no rubric or panel framing
- Feedback on code, PRs, or content that's not a pitch-style artifact

## Prerequisites

The user needs an OpenRouter API key set in `OPENROUTER_API_KEY`. If it isn't
set, prompt them to create one at <https://openrouter.ai/> before the run step.

```bash
export OPENROUTER_API_KEY=...
```

The `synth-personas` binary should already be on PATH (installed globally via
`npm i -g @sociosim/cli`). If not, install it before continuing.

## Workflow

### 1. Discover available personas (free, no API calls)

```bash
synth-personas list-personas
synth-personas list-personas --category vcs
synth-personas list-personas --category billionaires
```

Categories shipped: `billionaires`, `vcs`, `media`, `podcasters`, `scientists`,
`public_intellectuals`, `dev_audience`.

### 2. Author an evaluation task

A task is a YAML file with a rubric (3-6 named criteria, 1-10 scales), a
persona selection (by category / slug / tag), and the artifact path. Reference
the included `evaluations/moonshot.yaml` as a template.

Minimal shape:

```yaml
name: my-pitch
artifact:
  path: ./pitch.md
  kind: pitch_deck
  title: My Pitch
rubric:
  - name: novelty
    description: How new is this idea?
    scale: [1, 10]
  - name: feasibility
    description: How realistic is execution?
    scale: [1, 10]
persona_selection:
  categories: [vcs, billionaires]
  limit: 20
model:
  default: anthropic/claude-sonnet-4
output:
  dir: ./runs
```

The rubric is the load-bearing part. Propose 3-6 criteria, confirm with the
user, then write the YAML.

### 3. Validate before running (free)

```bash
synth-personas validate-task ./my-task.yaml
synth-personas show-prompt ./my-task.yaml --persona-slug elon-musk
```

`show-prompt` renders the exact prompts so the user can sanity-check before
spending tokens.

### 4. Dev-mode run with `--limit`

Always do a 3-persona run first to verify output quality and cost.

```bash
synth-personas run ./my-task.yaml --limit 3
```

### 5. Full run (only after dev-mode passes and user confirms)

```bash
synth-personas run ./my-task.yaml
```

Output: `<output.dir>/<UTC-timestamp>-<task-name>/report.md` + per-persona
JSON under `personas/`.

## Cost awareness

A full run = N personas × ~2k output tokens. At 80 personas:

- Sonnet-class: ~$1-3
- Opus: ~$5-15
- Haiku / Gemini Flash: <$1

Always confirm with the user before a full run if N > 20.

## Persona library

Bundled with the package. Inspect with `list-personas`. The persona library
covers tech billionaires (Musk, Bezos, Gates, Altman, …), VC partners, tech
media (Mossberg, Newton, Patel, …), podcasters (Fridman, …), scientists
(Hassabis, …), public intellectuals (Cowen, …), and developer audiences
(HN skeptic, indie hacker, ML research engineer, …).

To add a custom persona, point `--personas-root` at your own directory of
markdown files (same schema as the bundled ones — see `_TEMPLATE.md` in the
bundled persona library, or in the public repo at
<https://github.com/len5ky/synth-personas>).

## Re-aggregating an existing run

```bash
synth-personas aggregate ./runs/<run-dir>/
```

Useful if a run was interrupted or you want to regenerate the report without
re-spending tokens.

## Failure handling

- Persona refusals (`As an AI, I can't roleplay…`) are detected, logged as
  `<slug>.error.json`, and excluded from numerical aggregation but listed in
  the report's failures section.
- Each persona's JSON is streamed to disk as it returns — Ctrl-C or partial
  failures leave usable output, and `aggregate` re-runs against whatever's on
  disk.

## Checklist

- [ ] `OPENROUTER_API_KEY` is set
- [ ] User's artifact exists and is markdown
- [ ] Task YAML written and validated
- [ ] Prompt sanity-checked with `show-prompt`
- [ ] Dev-mode `--limit 3` run completed; output looks reasonable
- [ ] User confirmed before full run if N > 20
- [ ] `report.md` reviewed and highlights surfaced to the user
