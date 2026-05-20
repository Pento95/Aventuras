# Slice 1.1 — Code conventions

## Metadata

- **Milestone:** [Milestone 1 — Spine](../milestone.md)
- **Depends on:** none (first slice)
- **Blocks:** 1.2, 1.3, 1.4, 1.5, 1.6, 1.7 — every later slice
  authors `lib/*` modules under this slice's eslint rule.

## Goal

Establish the `lib/*` public-API discipline before any `lib/`
module exists, so the first module sets the pattern rather than
getting retrofitted into it later. Lands the
`eslint-plugin-boundaries` rule at `error` severity, the canonical
`docs/code-conventions.md` human-facing doc, and the matching
`.claude/rules/code.md` extension that cites it. No `lib/*`
modules are introduced; the first module ships in Slice 1.2.

## Background

V1 introduced this convention at warn-level near the end of that
codebase and never finished the migration. V2 adopts it from day 1
to avoid the retrofit cost. Each subdirectory of `lib/` is a
module: internal files import each other freely via relative
paths; external code must import through the module's `index.ts`.
Tests inside a module are allowed deep imports; tests outside use
the public API only. Types are part of the public API — deep type
imports are banned the same as value imports.

The v1 working config (at
`/home/failerko/_LLM/Aventura/Aventura/eslint.config.js`, outside
this repo) is the shape baseline: same plugin
(`eslint-plugin-boundaries`), same element-by-folder model, same
disallow rule. Raised to `'error'` severity and applied to `lib/*`
instead of `src/lib/services/*`.

## Required reading

- [`.claude/rules/code.md` → Import wildcards](../../../../../.claude/rules/code.md#import-wildcards)
  — existing pattern for eslint rules that enforce code
  discipline; this slice extends the same style with the
  boundaries plugin.
- [`docs/conventions.md` → Cross-references](../../../../conventions.md#cross-references)
  — anchor-link convention for any new docs added in this slice.

## Scope: in

- Add `eslint-plugin-boundaries` to dev dependencies; install
  with `pnpm`.
- Extend `eslint.config.js`:
  - Register the `boundaries` plugin.
  - Declare element type `lib-module` with pattern `lib/*` and
    mode `folder`.
  - Add `boundaries/dependencies` rule at `'error'` severity
    with a disallow rule: `to: ['lib-module']`,
    `disallow: { to: { internalPath: '!index.ts' } }`, message
    explaining the public-API discipline.
- Create `docs/code-conventions.md` covering:
  - **Module structure** — `lib/*` public-API rule, internal vs
    external imports, test deep-import policy, types as part of
    the public API.
  - **State placement** — three-tier rule (component-local
    `useState`, cross-component ephemeral via `lib/stores/ui/`,
    domain stores via `lib/stores/domain/` mutated through the
    action layer only).
  - **Action layer** — single layer spans pipeline and UI
    writes; domain-organized (`lib/actions/<domain>/`); mediates
    Zustand and SQLite transactionally.
- Extend `.claude/rules/code.md` with three new sections citing
  `docs/code-conventions.md`:
  - Module structure section pointing to the canonical doc.
  - State placement section pointing to the canonical doc.
  - Action layer section pointing to the canonical doc.
- Update `docs/README.md` to add `code-conventions.md` to the
  `## What's here` index.

## Scope: out

- No `lib/*` modules. The first module (`lib/db/`) ships in Slice
  1.2.
- No other boundaries element declarations (`component`, `hook`,
  `electron`). Only `lib-module` is declared in this slice;
  future slices extend the config when cross-domain coupling
  becomes a concern.
- No `console.*` lint ban — lands with the logger in Slice 1.3.
- No setter-from-domain-store lint ban — lands with the action
  layer / domain stores in Slice 1.5 or 1.6 once domain stores
  exist.
- No selective-re-export shape enforcement on `index.ts` files;
  convention-only, not mechanically enforced this slice.

## Acceptance criteria

- `eslint-plugin-boundaries` listed in `package.json`
  devDependencies and locked in `pnpm-lock.yaml`.
- `eslint.config.js` registers the plugin and includes the
  `boundaries/dependencies` rule at `'error'` severity targeting
  the `lib-module` element type.
- `docs/code-conventions.md` exists, covers Module structure /
  State placement / Action layer, and is listed in
  `docs/README.md`.
- `.claude/rules/code.md` extended with citing sections for
  Module structure, State placement, and Action layer.
- `pnpm lint` passes on the empty `lib/` (no violations because
  no modules exist yet).
- `pnpm lint:docs` passes — remark validates anchor links across
  the new and updated docs.

## Tests

No code tests in this slice. The boundaries rule has nothing to
enforce against until a `lib/*` module exists; testing the plugin
itself (rather than project code) is upstream-tested and not
worth duplicating. Slice 1.2 (Drizzle, first real `lib/*`
module) is the first validation that the rule fires correctly
when external code attempts to deep-import `lib/db/`'s internals.

## Open questions

- **Synthetic fixture for rule verification.** Should this slice
  include a throwaway `lib/_smoke/` module plus a test that
  external code deep-importing it fails lint, then have Slice
  1.2 remove it? Leaning no — synthetic fixtures rot fast and
  Slice 1.2's first real module closes the gap quickly.
- **Element-type scope.** Pattern `lib/*` with mode `folder`
  treats only top-level subdirectories of `lib/` as modules;
  nested sub-modules (`lib/foo/bar/`) are internal to their
  parent. Confirm this matches intent during authoring; the
  alternative (`lib/**` flat) would treat every level as its own
  module boundary, probably too granular.
- **Whether `components/<domain>/` should also be a boundaries
  element.** Out of scope for this slice. Flag for a possible
  future slice if cross-domain component imports become a
  concern.
