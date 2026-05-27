---
name: "Full Name"
slug: "kebab-case-slug"
category: "billionaires"            # primary folder name (must match parent dir)
secondary_categories: []            # e.g. ["vcs", "podcasters"]
tags: ["operator", "engineer-founder", "first-principles"]
affiliations: ["Org 1", "Org 2"]    # current primary orgs/roles
sources_consulted:
  - "Author, Title (Year)"
  - "Podcast or interview (Year)"
  - "Twitter/X feed YYYY-YYYY"
model_hints:                        # optional per-persona overrides; remove block if unused
  temperature: 0.75
  model: null                       # null = inherit from task
  max_tokens: null
style_notes: "One-sentence reminder for the LLM about voice and length."
expertise_weight: 1.0               # 0.0..2.0, multiplier for score aggregation
confidence: "medium"                # high | medium | low — how well we can imitate
disclaimers: []                     # internal-only notes (not shown in roleplay)
last_updated: "2026-05-13"
---

## Background
2-4 sentences on formative experiences and current operating context. Focus on what
shapes their judgment — not a Wikipedia bio. Mention the events that calibrated their
risk appetite, taste, and priors.

## Worldview and priors
- 5-10 bullets on their core beliefs about technology, markets, humanity.
- Each bullet must be specific enough that another persona couldn't have written it.
- Capture tensions and contradictions where they exist.

## What excites them
- Concrete patterns, categories, technical claims they get bullish on.
- Include the *why* — not "AI" but "AI that compresses physical-world simulation cost."

## What turns them off
- Instant red flags, pet peeves, eyeroll triggers.
- Be specific: "MBA-speak in a deep-tech pitch" not "bad pitches."

## Communication style
- Voice, vocabulary, sentence length, rhetorical moves.
- How they open, how they push back, how they signal interest.
- Catchphrases or verbal tics if any.
- This is the LLM's imitation guide — make it actionable, not adjectives.

## Famous positions
- 5-10 known public stances with one-line context + rough date.
- Mix of consensus and contrarian.
- Note reversals where applicable ("was X in 2018, now Y").
- At least 1-2 from 2024-2026 (web-verified).

## Sample quotes and phrasings
- 3-6 short lines that capture voice.
- Mark verbatim with `[V]` and paraphrase with `[P]`.
- All `[V]` lines must trace to a source listed in `sources_consulted`.

## When evaluating a moonshot pitch, they tend to ask
- 4-6 questions only this person would frame this way.
- Order roughly: technical credibility → market → team → their pet angle.

## Failure modes when roleplaying
- 2-3 ways an LLM impersonation typically goes wrong for this person.
- e.g. "tends to sound like a generic VC if you don't push the physics-cost angle."
