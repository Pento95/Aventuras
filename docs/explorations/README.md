# Explorations

Dated session records — design discussions captured before
integrating into canonical docs. Each file is a frozen snapshot of
what was decided in that session, plus the trade-offs considered;
once the design lands in `data-model.md` / `architecture.md` /
`ui/`, the canonical doc carries the authoritative version and
this file remains as a historical record.

Filenames are `YYYY-MM-DD-<topic>.md`. The date prefix is the
intentional exception to the project's no-prefix naming rule (see
[../README.md → Naming](../README.md)) — chronological order is
the primary axis here.

## When to write one

Sessions that produce a non-trivial design and warrant a written
trail before integration. Quick fixes, lint sweeps, and small
edits go straight into canonical docs without an exploration
record.

## When to delete

These records are kept as historical reasoning. They don't get
deleted on canonical-doc landing; they get superseded — the
canonical doc is authoritative, the exploration captures how we
got there. If a record is provably obsolete (the design was
abandoned, not just superseded), it can be removed with a commit
message that explains why.
