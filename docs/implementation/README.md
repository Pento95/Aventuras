# Implementation

How implementation work for Aventuras v2 is decomposed and tracked.
Canonical specs under [`docs/`](../README.md) describe what the
system does; the docs here describe how the work is sliced and
ordered to build it.

## What's here

- **[conventions.md](./conventions.md)** — the blueprint: what a
  milestone is, what a slice is, what makes a slice dev-ready,
  directory and naming conventions, linking discipline.
- **[milestones/](./milestones/README.md)** — per-milestone work.
  Each milestone has its own directory with a `milestone.md`
  definition and a `slices/` subdirectory holding per-slice docs.
- **[lessons-learned/](./lessons-learned/README.md)** —
  implementation pitfalls and runtime gotchas discovered while
  building. Indexed by topic; read before touching the substrate
  an entry references.
- **[triage.md](./triage.md)** — inbox queue for cross-cutting
  deferrals surfaced during implementation that have no single
  downstream slice to own them; routed to their real home in a
  separate triage pass.
