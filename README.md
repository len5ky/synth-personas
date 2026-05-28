# synth-personas

Generate **panel-style feedback** on an artifact (pitch deck, design doc, proposal, white paper) by fanning out parallel LLM calls — one per persona — across a curated library of ~150 **named real-world figures**: Elon Musk, Sam Altman, Marc Andreessen, Naval Ravikant, Peter Thiel, Bill Gates, Ben Horowitz, Kara Swisher, Lex Fridman, Demis Hassabis, Tyler Cowen, and ~140 others. Each persona is researched from primary 2024–2026 sources (their own blog posts, podcast appearances, conference talks, long-form interviews) so the LLM roleplays a specific person's actual worldview — not a generic "VC archetype" or "tech billionaire" stereotype.

The library spans: tech billionaires, VCs across stages, angel investors, growth-stage investors, tech media, podcasters, scientists, public intellectuals, and developer audiences.

> **Try the hosted example:** <https://mockinvestor.com> — a web UI built on this engine that pitches your deck against the full panel and streams reactions live.

---

## Get started

You need: an [OpenRouter](https://openrouter.ai/) API key (the LLMs run through it), and either Node.js 20+ on your machine or an AI coding agent installed (Claude Code or Codex CLI).

### The easy way — ask your AI coding agent

If you have **Claude Code** or **Codex CLI** installed, just tell it:

> *"Download and set up https://github.com/len5ky/synth-personas, then give me panel feedback on this pitch."* (paste / attach your artifact)

The agent will clone the repo, run `npm install`, prompt you for the OpenRouter key, write the evaluation task YAML, and run the panel. You don't need to know any of the commands below.

### The manual way — clone + run

```bash
git clone https://github.com/len5ky/synth-personas
cd synth-personas
npm install
echo "OPENROUTER_API_KEY=sk-or-..." > .env

# verify everything's wired up
npm run cli -- list-personas | head

# generate panel feedback on a sample pitch
npm run cli -- run evaluations/moonshot.yaml --limit 3
```

The aggregated report lands in `runs/<timestamp>-<task-name>/report.md`. Open that — it's the deliverable.

To run against **your own** pitch, copy `evaluations/moonshot.yaml` to a new file (e.g. `my-pitch.yaml`), change `artifact.path` to your markdown file, edit the rubric to match what you want scored, and run:

```bash
npm run cli -- run ./my-pitch.yaml --limit 3   # cheap dev pass first
npm run cli -- run ./my-pitch.yaml             # full panel
```

That's all you need for the main use case. The rest of this README covers advanced flows.

---

## Persona library

Every entry is a specific real person, written up from their own primary sources (blog, podcasts, talks, long-form interviews) — not an archetype.

| Category               | Sample personas (full list via `npm run cli -- list-personas`)                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `billionaires`         | Elon Musk, Sam Altman, Jeff Bezos, Bill Gates, Mark Zuckerberg, Larry Page, Sergey Brin, Jensen Huang, Larry Ellison, Patrick Collison, Brian Chesky, Mark Cuban, Marc Benioff, Tobi Lütke |
| `vcs`                  | Marc Andreessen, Ben Horowitz, Peter Thiel, Reid Hoffman, Bill Gurley, Fred Wilson, Brad Feld, Vinod Khosla, Steve Jurvetson, Peter Fenton, Sarah Tavel, Aileen Lee, Sarah Guo, Tomasz Tunguz, Andrew Chen, … |
| `angels`               | Naval Ravikant, Elad Gil, Nat Friedman, Daniel Gross, Lachy Groom, Cyan Banister, Justin Kan, Jack Altman, Sahil Lavingia, Howard Lindzon, …                                                                       |
| `investors`            | Growth-stage / crossover investors (Coatue, Tiger, hedge-fund-style)                                                                                                                                                |
| `media`                | Walt Mossberg, Kara Swisher, Casey Newton, Nilay Patel, Ben Thompson, Matt Levine, Mike Isaac, Alex Heath, Eric Newcomer, Erin Griffith, Packy McCormick, Mike Solana                                              |
| `podcasters`           | Lex Fridman, Joe Rogan, Dwarkesh Patel, Chamath Palihapitiya, David Sacks, Jason Calacanis, David Friedberg, the *Acquired* hosts (Ben Gilbert + David Rosenthal), …                                              |
| `scientists`           | Demis Hassabis, …                                                                                                                                                                                                   |
| `public_intellectuals` | Tyler Cowen, …                                                                                                                                                                                                      |
| `dev_audience`         | Composite voices: HN skeptic, indie hacker shipper, ML research engineer, Claude Code daily driver, vibe-coder, designer-name-snob, …                                                                              |

> **Two flavors of "persona"**: most categories above are specific named individuals. `dev_audience` is the exception — those entries are deliberately *composite* archetypes because developer audiences are messy enough that no single named voice captures them. Other categories occasionally include composite *outlets* (`The Verge`, `WIRED`, `The Information`) where the publication's house voice is more recognizable than any individual byline.

## Cost awareness

A full run = `N personas × ~2k output tokens`. Ballpark:

- Sonnet-class: ~$1-3 for 80 personas
- Opus: ~$5-15 for 80 personas
- Haiku / Gemini Flash: <$1 for 80 personas

**Always run with `--limit 3` first** to sanity-check output quality before spending the full token budget.

---

## What it does (under the hood)

You bring:
- An **artifact** — a markdown file (pitch, design doc, proposal, white paper).
- An **evaluation task** — a small YAML file specifying the artifact path, a 3-6 criterion rubric, a persona selection, and a model.

The framework:
1. Loads the bundled persona library.
2. Renders a per-persona system + user prompt (roleplay primer + rubric + JSON contract).
3. Fans out parallel OpenRouter calls with retry, backoff, and refusal detection.
4. Streams each persona's structured response to `runs/<timestamp>/personas/<slug>.json` as it returns.
5. Aggregates into a `report.md` and `aggregate.json`.

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

---

# For advanced users and agents

If you're not a developer and `mockinvestor.com` or the simple flows above cover what you need, you can stop reading here.

## Global install — make `synth-personas` available on PATH

If you'll use this from many directories (or want the CLI to install its own SKILL.md files into your Claude Code / Codex skill dirs):

```bash
npm install -g @synth-personas/cli
synth-personas install-skills        # drops skills into ~/.claude/skills/ and ~/.codex/skills/
```

(Override the parent dirs with `--claude-dir <path>` / `--codex-dir <path>`. Use `--no-claude` or `--no-codex` to install only one runtime. `--force` overwrites existing.)

After this, you can drop a `.env` with `OPENROUTER_API_KEY=...` in any directory and run `synth-personas …` directly.

> **Note on `.env` loading**: the CLI auto-loads `.env` **from the current working directory only**. It does NOT search upward and does NOT read your home directory. Export `OPENROUTER_API_KEY` if you want a setting that follows you everywhere.

## All CLI commands

```bash
synth-personas list-personas                                    # see what's in the library
synth-personas list-personas --category vcs                     # filter by category
synth-personas validate-persona <path>                          # lint a persona file
synth-personas validate-task <task.yaml>                        # lint a task + see selection
synth-personas show-prompt <task.yaml> --persona-slug elon-musk # render prompt, no API call
synth-personas run <task.yaml> --limit 3                        # dev-mode run
synth-personas run <task.yaml>                                  # full run
synth-personas aggregate <run-dir>/                             # re-aggregate from disk
synth-personas install-skills                                   # copy bundled SKILL.md files
```

Inside a clone (no global install), prefix everything with `npm run cli --`.

## Configuration knobs

| Setting                | Where                                                         | Notes                                                  |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| API key                | `OPENROUTER_API_KEY` env var (or `./.env`)                    | Required.                                              |
| Default model          | `model.default` in task YAML                                  | Per-task.                                              |
| Per-persona model      | `model_hints` in persona frontmatter                          | Overrides task default.                                |
| CLI model override     | `synth-personas run … --model <id>`                           | Overrides both.                                        |
| Concurrency            | `runner.concurrency` in task YAML                             | Default 10. Watch OpenRouter rate-limit headroom.      |
| Personas root override | `--personas-root <dir>` or `SYNTH_PERSONA_PERSONAS_ROOT` env  | Defaults to the bundled library.                       |

## Using your own persona library

Point any command at a directory of `<root>/<category>/<slug>.md` files with the same frontmatter schema as the bundled library:

```bash
synth-personas list-personas --personas-root ./my-personas/
```

## Failure handling

- Per-persona JSON is streamed to disk as it returns — Ctrl-C or partial failures still leave usable output.
- `aggregate` can be re-run against whatever's on disk to regenerate the report without spending more tokens.
- Refusals ("As an AI, I can't roleplay…") are detected, logged as `<slug>.error.json`, and excluded from numerical aggregation but listed in the report's failure section.

## Skills (Claude Code + Codex CLI)

After `npm install -g @synth-personas/cli && synth-personas install-skills`, two skills become available in both Claude Code and Codex CLI:

- **`synth-personas`** — drives the CLI to generate panel feedback. Auto-triggers on prompts like *"give me a panel reaction on this pitch from VCs"* or *"what would Musk think of this?"* (across many personas).
- **`create-persona`** — walks you through authoring a new persona end-to-end: picks the slot, researches from primary 2024-2026 sources, writes the 9-section body with traceable verbatim quotes, validates, updates the index. Trigger with *"add a persona for &lt;name&gt;"*.

## Contributing personas

The `create-persona` skill above is the recommended path. By hand:

1. Copy `assets/personas/_TEMPLATE.md` to `assets/personas/<category>/<slug>.md`.
2. Fill in the required frontmatter (`name`, `slug`, `category`, `last_updated`) and the required body sections (Background, Worldview, What excites them, What turns them off, Communication style, Famous positions, Sample quotes, When evaluating a moonshot pitch, Failure modes when roleplaying).
3. Validate:
   ```bash
   npm run cli -- validate-persona assets/personas/<category>/<slug>.md
   ```
4. Open a pull request.

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

### Single source of truth for personas and skills

| What                  | Canonical location              | DO NOT also put it at                               |
| --------------------- | ------------------------------- | --------------------------------------------------- |
| Persona profiles      | `assets/personas/<cat>/<slug>.md` | `packages/cli/assets/personas/` (gitignored mirror) |
| Claude Code skills    | `skills/<name>/SKILL.md`        | `packages/cli/skills/`            (gitignored mirror) |
| Codex CLI skills      | `.agents/skills/<name>/SKILL.md`| `packages/cli/.agents/skills/`    (gitignored mirror) |

The `packages/cli/{assets,skills,.agents}/` directories are **ephemeral**: they're created automatically on `npm install`, `npm pack`, and `npm publish` by [packages/cli/scripts/prepack.mjs](packages/cli/scripts/prepack.mjs), so the npm tarball ships with everything bundled. They are gitignored. **Never edit them directly** — the next `npm install` overwrites them. Edit the canonical copy at the repo root instead.

---

## Acknowledgements

This project was inspired by [sociosim.org](https://sociosim.org) — an earlier exploration of simulated social agents that planted the seed for treating real-world personas as a structured, voice-preserving evaluation panel.

## License

MIT.
