# synth-personas

Generate **panel-style feedback** on an artifact (pitch deck, design doc, proposal, white paper) by fanning out parallel LLM calls — one per persona — across a curated library of ~150 **named real-world figures**: Elon Musk, Sam Altman, Marc Andreessen, Naval Ravikant, Peter Thiel, Bill Gates, Ben Horowitz, Kara Swisher, Lex Fridman, Demis Hassabis, Tyler Cowen, and ~140 others. Each persona is researched from primary 2024–2026 sources (their own blog posts, podcast appearances, conference talks, long-form interviews) so the LLM roleplays a specific person's actual worldview — not a generic "VC archetype" or "tech billionaire" stereotype.

The library spans: tech billionaires, VCs across stages, angel investors, growth-stage investors, tech media, podcasters, scientists, public intellectuals, and developer audiences.

> **Try the hosted example:** <https://mockinvestor.com> — a web UI built on this engine that pitches your deck against the full panel and streams reactions live. The CLI in this repo is the same evaluation engine without the web layer.

Ships as:
- a **TypeScript CLI** (`@synth-personas/cli` on npm)
- **two skills for both Claude Code and Codex CLI**:
  - `synth-personas` — drives the CLI to generate panel feedback
  - `create-persona` — authors new persona profiles end-to-end
- a **bundled persona library** (all public categories)

## Install

```bash
npm install -g @synth-personas/cli
```

Then drop the skill files into your Claude Code and Codex CLI skill directories:

```bash
synth-personas install-skills
# → installs every bundled skill to ~/.claude/skills/<skill>/ and ~/.codex/skills/<skill>/
```

(Override the parent dirs with `--claude-dir <path>` / `--codex-dir <path>`. Use `--no-claude` or `--no-codex` to install only one runtime. `--force` overwrites existing skill files.)

Set your OpenRouter API key. The CLI auto-loads `.env` **from the current working directory only** — it does NOT search upward and it does NOT load from the home directory. So either export the var or drop a `.env` in the dir you'll run from:

```bash
# Option A — export (works from anywhere):
export OPENROUTER_API_KEY=sk-or-...

# Option B — .env file in the dir you run from:
cd ~/some-project
cp $(npm root -g)/@synth-personas/cli/.env.example .env
# then edit .env and fill in OPENROUTER_API_KEY
synth-personas list-personas       # picks up the key from ./.env
```

## What it does

You bring:
- An **artifact** — a markdown file (pitch, design doc, proposal, white paper).
- An **evaluation task** — a small YAML file specifying the artifact path, a 3-6 criterion rubric, a persona selection, and a model.

The framework:
1. Loads the bundled persona library.
2. Renders a per-persona system + user prompt (roleplay primer + rubric + JSON contract).
3. Fans out parallel OpenRouter calls with retry, backoff, and refusal detection.
4. Streams each persona's structured response to `runs/<timestamp>/personas/<slug>.json` as it returns.
5. Aggregates into a `report.md` and `aggregate.json` you can hand back to the user.

## Quick start — via the skills

In **Claude Code** or **Codex CLI**, after `synth-personas install-skills`, the skill auto-triggers when you ask for panel feedback. Example prompts:

> "Give me a panel reaction on this pitch deck from VCs and tech billionaires." (paste artifact)
>
> "Score this proposal across novelty, feasibility, and team strength as if from a panel of scientists."

The skill walks the user through: discovering personas, authoring the task YAML, validating, dev-mode run, full run, surfacing highlights.

## Quick start — direct CLI

```bash
# Discover the library
synth-personas list-personas
synth-personas list-personas --category vcs

# Author a task (see evaluations/moonshot.yaml as a template, or copy from this repo's
# evaluations/ directory)
synth-personas validate-task ./my-task.yaml
synth-personas show-prompt ./my-task.yaml --persona-slug elon-musk

# Dev-mode run with 3 personas to sanity-check
synth-personas run ./my-task.yaml --limit 3

# Full run
synth-personas run ./my-task.yaml

# Re-aggregate without spending more tokens
synth-personas aggregate ./runs/<run-dir>/
```

A minimal task YAML:

```yaml
name: my-pitch
artifact:
  path: ./pitch.md
  kind: pitch_deck
  title: My Pitch
rubric:
  - { name: novelty,     description: "How new is this idea?",        scale: [1, 10] }
  - { name: feasibility, description: "How realistic is execution?",  scale: [1, 10] }
  - { name: timing,      description: "Right moment for this?",       scale: [1, 10] }
persona_selection:
  categories: [vcs, billionaires]
  limit: 20
model:
  default: anthropic/claude-sonnet-4
output:
  dir: ./runs
```

## Persona library

Every entry is a specific real person, written up from their own primary sources (blog, podcasts, talks, long-form interviews) — not an archetype.

| Category               | Sample personas (full list via `synth-personas list-personas`)                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `billionaires`         | Elon Musk, Sam Altman, Jeff Bezos, Bill Gates, Mark Zuckerberg, Larry Page, Sergey Brin, Jensen Huang, Larry Ellison, Patrick Collison, Brian Chesky, Mark Cuban, Marc Benioff, Tobi Lütke                          |
| `vcs`                  | Marc Andreessen, Ben Horowitz, Peter Thiel, Reid Hoffman, Bill Gurley, Fred Wilson, Brad Feld, Vinod Khosla, Steve Jurvetson, Peter Fenton, Sarah Tavel, Aileen Lee, Sarah Guo, Tomasz Tunguz, Andrew Chen, …      |
| `angels`               | Naval Ravikant, Elad Gil, Nat Friedman, Daniel Gross, Lachy Groom, Cyan Banister, Justin Kan, Jack Altman, Nat Friedman, Sahil Lavingia, Howard Lindzon, …                                                          |
| `investors`            | Growth-stage / crossover investors (Coatue, Tiger, hedge-fund-style)                                                                                                                                                |
| `media`                | Walt Mossberg, Kara Swisher, Casey Newton, Nilay Patel, Ben Thompson, Matt Levine, Mike Isaac, Alex Heath, Eric Newcomer, Erin Griffith, Packy McCormick, Mike Solana                                              |
| `podcasters`           | Lex Fridman, Joe Rogan, Dwarkesh Patel, Chamath Palihapitiya, David Sacks, Jason Calacanis, David Friedberg, the *Acquired* hosts (Ben Gilbert + David Rosenthal), …                                              |
| `scientists`           | Demis Hassabis, …                                                                                                                                                                                                   |
| `public_intellectuals` | Tyler Cowen, …                                                                                                                                                                                                      |
| `dev_audience`         | Composite voices that target developer-feedback nuance: HN skeptic, indie hacker shipper, ML research engineer, Claude Code daily driver, vibe-coder, designer-name-snob, … (this category is intentionally less name-anchored — see below) |

> **Two flavors of "persona"**: most categories above are specific named individuals. `dev_audience` is the exception — those entries are deliberately *composite* archetypes (a "Hacker News skeptic," an "indie hacker") because developer audiences are messy enough that no single named voice captures them, but reactions from a typical loud-on-HN reader are still useful. Other categories also occasionally include composite *outlets* (`The Verge`, `WIRED`, `The Information`) where the publication's house voice is more recognizable than any individual byline.

Inspect with `synth-personas list-personas` (or filter by `--category <name>` / `--tag <tag>`).

Each persona file is markdown with YAML frontmatter — see `assets/personas/_TEMPLATE.md` for the schema.

### Adding personas via the `create-persona` skill

After `install-skills`, the bundled `create-persona` skill walks Claude Code / Codex through authoring a new persona end-to-end: picks the slot, researches from primary 2024-2026 sources, writes the 9-section body with traceable verbatim quotes, validates via `synth-personas validate-persona`, and updates the index. Just ask: *"Add a persona for &lt;name&gt;."*

To use your **own** persona library, point any command at it with `--personas-root <dir>`:

```bash
synth-personas list-personas --personas-root ./my-personas/
```

The directory must be `<root>/<category>/<slug>.md` with frontmatter matching the bundled schema.

## Cost awareness

A full run = `N personas × ~2k output tokens`. At 80 personas:

- Sonnet-class: ~$1-3
- Opus: ~$5-15
- Haiku / Gemini Flash: <$1

Use `--limit 3` to dev-test first.

## Configuration

| Setting                | Where                              | Notes                                                  |
| ---------------------- | ---------------------------------- | ------------------------------------------------------ |
| API key                | `OPENROUTER_API_KEY` env var       | Required.                                              |
| Default model          | `model.default` in task YAML       | Per-task.                                              |
| Per-persona model      | `model_hints` in persona frontmatter | Overrides task default.                              |
| CLI model override     | `synth-personas run … --model <id>` | Overrides both.                                        |
| Concurrency            | `runner.concurrency` in task YAML  | Default 10. Check OpenRouter rate-limit headroom.      |
| Personas root override | `--personas-root <dir>` or `SYNTH_PERSONA_PERSONAS_ROOT` env | Defaults to the bundled library. |

## Failure handling

- Per-persona JSON is streamed to disk as it returns — Ctrl-C or partial failures still leave usable output.
- `aggregate` can be re-run against whatever's on disk to regenerate the report without spending more tokens.
- Refusals ("As an AI, I can't roleplay...") are detected, logged as `<slug>.error.json`, and excluded from numerical aggregation but listed in the report's failure section.

## Repository layout

```
.
├── packages/
│   ├── core/                       # @synth-personas/core — evaluation engine
│   └── cli/                        # @synth-personas/cli — TS CLI
│       └── scripts/prepack.mjs     # mirrors personas + skills into the package at pack time
├── skills/
│   ├── synth-personas/             # Claude Code skill: panel feedback
│   └── create-persona/             # Claude Code skill: author a persona
├── .agents/skills/
│   ├── synth-personas/             # Codex CLI skill: panel feedback
│   └── create-persona/             # Codex CLI skill: author a persona
├── assets/personas/                # Bundled persona library (canonical location)
└── evaluations/                    # Public example task YAMLs
```

### Where things live (single source of truth)

| What                  | Canonical location              | DO NOT also put it at                               |
| --------------------- | ------------------------------- | --------------------------------------------------- |
| Persona profiles      | `assets/personas/<cat>/<slug>.md` | `packages/cli/assets/personas/` (gitignored mirror) |
| Claude Code skills    | `skills/<name>/SKILL.md`        | `packages/cli/skills/`            (gitignored mirror) |
| Codex CLI skills      | `.agents/skills/<name>/SKILL.md`| `packages/cli/.agents/skills/`    (gitignored mirror) |

The `packages/cli/{assets,skills,.agents}/` directories are **ephemeral**: they're created automatically on `npm install`, `npm pack`, and `npm publish` by [packages/cli/scripts/prepack.mjs](packages/cli/scripts/prepack.mjs), so the npm tarball ships with everything bundled. They are gitignored. **Never edit them directly** — the next `npm install` overwrites them. Edit the canonical copy at the repo root instead.

## Contributing personas

1. Copy `assets/personas/_TEMPLATE.md` to `assets/personas/<category>/<slug>.md`.
2. Fill in the required frontmatter (`name`, `slug`, `category`, `last_updated`) and the required body sections (`Background`, `Worldview`, `What excites them`, `What turns them off`, `Communication style`, `Famous positions`, `Sample quotes`, `When evaluating a moonshot pitch`, `Failure modes when roleplaying`).
3. Validate:
   ```bash
   synth-personas validate-persona assets/personas/<category>/<slug>.md
   ```
4. Open a pull request.

## Acknowledgements

This project was inspired by [sociosim.org](https://sociosim.org) — an earlier exploration of simulated social agents that planted the seed for treating real-world personas as a structured, voice-preserving evaluation panel.

## License

MIT.
