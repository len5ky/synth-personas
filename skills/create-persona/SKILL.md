---
name: create-persona
description: |
  Author a new synth-personas persona profile end-to-end: pick the slot, research from primary 2024–2026 sources, write the 9-section body with traceable verbatim quotes, validate via the CLI, and update the index. TRIGGER when the user asks to "add a persona", "create a persona for X", "write up X as a persona", or "add N more VCs/founders/investors/journalists" to the library. DO NOT trigger for: using the persona library against an artifact (that's `synth-personas`), releasing the public mirror (that's `release-public`), or editing personas in a project's private personas directory (different sourcing rules — consult the user directly).
---

# create-persona

A persona is a markdown file with a strict YAML frontmatter and nine required body sections. The bar is set by [assets/personas/billionaires/elon-musk.md](../../assets/personas/billionaires/elon-musk.md) and [assets/personas/vcs/marc-andreessen.md](../../assets/personas/vcs/marc-andreessen.md). The schema lives in [packages/core/src/types.ts](../../packages/core/src/types.ts) (PersonaFrontmatterSchema). The validation gate is `synth-personas validate-persona <path>` (or `npm run cli -- validate-persona <path>` in the master repo).

This skill captures the *process* — what to research, what to write, what to check — so output stays consistent across authors and batches.

## When to use

- The user wants one or more new persona profiles added under `assets/personas/<category>/<slug>.md`.
- The user names a person (or list of people) to add, or asks for "more VCs / investors / founders / scientists".
- The user wants to upgrade an existing persona from `confidence: low/medium` to `high` (same process applies to rewrites).

## When NOT to use

- The user has an artifact and wants reactions from the existing panel → use the `synth-personas` skill.
- The user wants to ship the public mirror → use the `release-public` skill.
- The user wants to add a *private* persona to a project-specific private directory — same body schema, but **do not** verify against public sources; consult the user for source material directly.

## Prerequisites

1. Working in the master repo (`/home/lensky/Dev/synth-persona/` — has `packages/` and `assets/` siblings). The public mirror should never be hand-edited.
2. `npm run cli -- validate-persona <path>` runs (i.e. `packages/cli/` has been built or runs via tsx).
3. Web search is available for primary-source research. If it isn't, stop and tell the user — guessing quotes is a hard fail.

## The schema (must match exactly)

### Frontmatter — required fields

```yaml
---
name: "Full Name"                       # human-readable
slug: "kebab-case-slug"                 # ^[a-z0-9-]+$, globally unique across categories
category: "vcs"                         # MUST match parent directory name
secondary_categories: []                # e.g. ["billionaires"] if cross-listed
tags: ["vc", "deep-tech", "..."]        # ≥3 specific tags; used by selection filters
affiliations: ["Firm 1", "Firm 2"]      # current orgs/roles
sources_consulted:
  - "Author, Title (Year)"              # one line per source
  - "Podcast Name episode #X with Subject (Year)"
  - "X / @handle feed YYYY-YYYY"
model_hints:                            # OPTIONAL — remove block entirely if not used
  temperature: 0.8
  model: null                           # null = inherit from task
  max_tokens: null
style_notes: "One sentence on voice, length, register."
expertise_weight: 1.0                   # 0.0–2.0; default 1.0; raise only with clear domain expertise
confidence: "medium"                    # high | medium | low
disclaimers:
  - "Synthetic persona based on public statements. Not the real X."
last_updated: "2026-05-27"              # ISO date — use today
---
```

**Confidence calibration**:
- `high` — prolific public output (≥5 strong sources: long-form essays, podcasts, sustained X/blog presence). You can capture voice signature with confidence.
- `medium` — solid footprint but quieter (3–5 sources, mostly interviews + occasional posts). Default for institutional VCs.
- `low` — sparse sources, composite archetypes, or recent emergents. Mark this honestly; failure-modes section must flag the imitation risk.

### Body — 9 sections, fixed order, fixed heading prefixes

Validation checks heading prefixes literally — match exactly:

```
## Background
## Worldview and priors
## What excites them
## What turns them off
## Communication style
## Famous positions
## Sample quotes and phrasings
## When evaluating a moonshot pitch, they tend to ask
## Failure modes when roleplaying
```

Body must be **250–1500 words** (target 300–1400). Validator rejects outside that band.

What each section needs:

1. **Background** (2–4 sentences). The events that calibrated their judgment — not a Wikipedia bio. What formative experience shaped their risk appetite and taste?
2. **Worldview and priors** (5–10 bullets). Each bullet must be specific enough that another persona couldn't have written it. Capture tensions and contradictions explicitly. "I value great teams" fails. "Founders who can't compress their thesis into one sentence have not thought hard enough" passes.
3. **What excites them** (3–6 bullets). Concrete patterns + the *why*. "AI" fails. "AI that compresses physical-world simulation cost so labs can iterate faster" passes.
4. **What turns them off** (3–6 bullets). Specific red flags. "Bad pitches" fails. "MBA-speak in a deep-tech pitch" passes.
5. **Communication style** (5–8 bullets). The LLM's imitation guide. Voice, vocabulary, sentence length, rhetorical moves, catchphrases, how they open/push back/signal interest. Make it actionable, not adjectives.
6. **Famous positions** (5–10 bullets, dated). Public stances with one-line context + rough date. Mix consensus and contrarian. Note reversals ("was X in 2018, now Y"). **At least 1–2 must be 2024–2026** and web-verified.
7. **Sample quotes and phrasings** (3–6 lines).
   - Mark verbatim with `[V]` — must trace to a source listed in `sources_consulted`.
   - Mark paraphrase with `[P]`.
   - Never invent a `[V]` quote. If you can't find a real one, use `[P]`.
8. **When evaluating a moonshot pitch, they tend to ask** (4–6 questions). Questions only this person would frame this way. Order roughly: technical credibility → market → team → their pet angle.
9. **Failure modes when roleplaying** (2–3 bullets). How LLM impersonation typically goes wrong for *this* person — name the specific failure mode. "Tends to sound like a generic VC if you don't push the political register" passes. "Don't be generic" fails.

## Workflow

### 1. Pick the slot

```bash
# Decide category and slug
ls /home/lensky/Dev/synth-persona/assets/personas/        # existing categories
# vcs/, billionaires/, media/, podcasters/, scientists/,
# public_intellectuals/, dev_audience/, investors/, angels/, ...

# Slug uniqueness check across ALL categories (slug is globally unique)
grep -r "^slug:" /home/lensky/Dev/synth-persona/assets/personas/ | grep -i "your-slug"
```

If the persona's natural category doesn't exist yet, **stop and ask the user** — adding a new category requires updating [scripts/build-public.allowlist.json](../../scripts/build-public.allowlist.json) (`copies` block; one entry under `assets/personas/<new-cat>`) and is a deliberate decision.

### 2. Research (primary sources only)

Web-search for the subject. Aim for ≥4 primary sources spanning 2024–2026:

- Personal blog / Substack / Medium posts (best)
- Long-form podcast appearances (transcripts ideal; episode titles + dates work)
- Conference talks (YouTube + transcript)
- Sustained X/Twitter threads (cite as `X / @handle feed YYYY-YYYY`)
- Long-form interviews (Bloomberg, Information, Stratechery, etc.)

**Skip**: Wikipedia (background only — not a quotable source), thin news summaries, second-hand "X said" articles, AI-generated blog rehashes.

Capture:
- 5–10 concrete public positions with dates
- 3–6 verbatim quotes you can attribute to a specific source
- The subject's voice signature (sentence length, vocabulary tics, rhetorical moves)

### 3. Draft the file

Write to `assets/personas/<category>/<slug>.md` using the template at [assets/personas/_TEMPLATE.md](../../assets/personas/_TEMPLATE.md).

Order the work:
1. Frontmatter first (fill `sources_consulted` from your research)
2. Famous positions (anchors the rest — these are your factual scaffold)
3. Worldview and priors (derived from positions)
4. What excites / turns off (concrete cases from positions)
5. Communication style (your voice notes from research)
6. Sample quotes (every `[V]` must trace to `sources_consulted`)
7. Background (now you know what to compress)
8. Pitch questions and failure modes (last — they require the rest to be in place)

### 4. Validate

```bash
# Use an ABSOLUTE path — npm's workspace command changes cwd to packages/cli/
cd /home/lensky/Dev/synth-persona
npm run cli -- validate-persona "$PWD/assets/personas/<category>/<slug>.md"
```

Validator checks: Zod frontmatter schema, all 9 section headings present, body 250–1500 words, slug regex, category matches parent dir.

If it fails, fix and re-run. Do not commit failing personas.

### 5. Self-review against the calibration bar

Open [assets/personas/billionaires/elon-musk.md](../../assets/personas/billionaires/elon-musk.md) (or [vcs/marc-andreessen.md](../../assets/personas/vcs/marc-andreessen.md) for VCs) side by side. Ask:

- Could another persona have written my worldview bullets? If yes, rewrite them sharper.
- Does my `[V]` quotes column actually trace to my sources_consulted? Grep to confirm.
- Are my pitch questions in *this person's* register, or generic VC? Rewrite anything generic.
- Is my failure-modes section specific to this person's known imitation problem, or boilerplate? Specific or rewrite.

### 6. Update the index

After a batch, regenerate `assets/personas/INDEX.md` (counts + per-category tables). If a script exists, use it; otherwise update by hand and confirm counts with:

```bash
find /home/lensky/Dev/synth-persona/assets/personas -name "*.md" \
  ! -name "INDEX.md" ! -name "_TEMPLATE.md" | wc -l
```

## Anti-patterns (fail your own review)

- **Inventing `[V]` quotes**. Never. If you cannot find the quote in a source you can cite, mark it `[P]`.
- **Generic worldview bullets** ("I value execution", "Team > idea"). Rewrite until another persona couldn't have written the same line.
- **Stale political positions**. Andreessen, Thiel, Sacks, Calacanis, Lonsdale all moved hard 2022–2024. Web-verify 2024–2026 stances before committing.
- **Slug collisions**. Slug is globally unique even though paths are scoped by category. Grep before naming.
- **Failure modes that are just "don't be generic"**. Name the *specific* way LLMs miss this person (e.g. "underplays the 2024 political shift" / "writes him as a generic tech bull").
- **Body outside 250–1500 words**. Validator rejects. Aim 300–1400.
- **Confidence inflation**. `high` requires the source density. Default `medium` is fine for solid-but-quiet subjects.
- **Forgetting the new-category gotcha**. If you create `assets/personas/<newcat>/`, the public build skips it until [scripts/build-public.allowlist.json](../../scripts/build-public.allowlist.json) is updated. Mention this to the user.

## Batch authoring

For N > 3 personas:

1. Confirm category mapping for the whole batch before starting (avoid mid-batch re-categorization).
2. Author in groups of ~10. One commit per group, message lists who was added.
3. After each group: per-file `validate-persona` loop (absolute paths required — npm workspace re-cwds):
   ```bash
   cd /home/lensky/Dev/synth-persona
   for f in "$PWD"/assets/personas/<category>/*.md; do
     [ -f "$f" ] && npm run cli -- validate-persona "$f" || echo "FAIL: $f"
   done
   ```
4. After all batches: regenerate INDEX.md, dry-run `node scripts/build-public.ts` to confirm no leaks.

## Notes

- Personas have ONE canonical location: `assets/personas/<category>/<slug>.md` at the repo root. Never edit `packages/cli/assets/personas/` — that directory is a gitignored mirror, regenerated automatically by [packages/cli/scripts/prepack.mjs](../../packages/cli/scripts/prepack.mjs) on every `npm install`, `npm pack`, and `npm publish`. The mirror is what ships in the npm tarball.
- A project may keep a private personas directory that is denied at build time via `denyPathSubstrings` and `denyContentSubstrings` in the build allowlist. Do not put public-facing personas there.
- The `disclaimers` field is internal-only — not rendered into the LLM system prompt. Use it for caveats to future authors, not voice instructions (those go in `style_notes`).
