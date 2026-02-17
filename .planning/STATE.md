# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-08)

**Core value:** Every {{ variable }} in every prompt template resolves correctly, predictably, through one pipeline — and users can create, edit, and share prompt presets without fighting the system.
**Current focus:** Phase 5 - Import/Export & Variable Discovery

## Current Position

Phase: 5 of 6 (Import/Export & Variable Discovery)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-02-16 -- Completed quick task 001: Wizard step 2 UI polish

Progress: [█████████░] 89%

## Performance Metrics

**Velocity:**
- Total plans completed: 24
- Average duration: 6.8 minutes
- Total execution time: 2.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2 | 436s | 218s |
| 02 | 3 | 525s | 175s |
| 03 | 8 | 10075s | 1259s |
| 04 | 8 | 1461s | 183s |
| 05 | 3 | 815s | 272s |

**Recent Executions:**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 05 | 03 | 236s | 2 | 4 |
| 05 | 02 | 317s | 2 | 6 |
| 05 | 01 | 262s | 2 | 8 |
| 04 | 07 | 210s | 1 | 12 |
| 04 | 06 | 140s | 2 | 3 |
| 04 | 05 | 155s | 2 | 2 |
| 04 | 04 | 249s | 3 | 3 |
| 04 | 03 | 178s | 2 | 3 |
| 04 | 02 | 260s | 2 | 4 |
| 04 | 01 | 269s | 2 | 7 |
| 03 | 08 | 108s | 1 | 1 |
| 03 | 07 | 82s | 2 | 2 |
| 03 | 06 | 906s | 2 | 27 |
| 03 | 05 | 420s | 2 | 8 |
| 03 | 04 | 3498s | 2 | 9 |
| 03 | 03 | 3554s | 2 | 5 |
| 03 | 02 | 725s | 2 | 8 |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Template engine choice: LiquidJS for safe Jinja-like syntax (verified and working)
- Three variable categories: system (auto-filled), runtime (service-injected), custom (user-defined)
- Clean slate migration: No backward compatibility with old macro overrides
- Error message simplification: Transform LiquidJS technical errors into plain language for non-technical users
- Levenshtein distance threshold: maxDistance=2 for "did you mean?" suggestions
- Validation stateless design: No side effects, safe for real-time editor keystroke validation
- Pack variable types: 5 types including textarea (distinct from Phase 1's 4 VariableTypes)
- Enum variables use label+value pairs for display vs storage separation
- Variables have dual naming: variableName (template) and displayName (UI)
- No versioning on packs: edits overwrite in place, export serves as snapshot mechanism
- Pack deletion protection: ON DELETE RESTRICT prevents deleting packs with active stories
- Content hashing: SHA-256 via Web Crypto API with whitespace normalization for modification detection
- Foreign key enforcement: PRAGMA foreign_keys = ON in database init ensures constraints work
- Template upsert preserves original created_at via INSERT OR REPLACE pattern
- PackService singleton follows existing service pattern (database, templateEngine)
- Template seeding handles both content and userContent from PROMPT_TEMPLATES
- User content uses templateId-user naming convention (matches PromptOverride pattern)
- Zod validation at system boundaries only (not every database read)
- ContextBuilder flat namespace: all variables as {{ variableName }} (no nesting)
- ContextBuilder per-render instantiation: not a singleton, use static factories
- External templates bypass Liquid rendering (image generation, interactive)
- Wizard progressive context: variables available based on step number
- templateEngine imported from engine.ts directly (not barrel) to avoid RenderResult name collision
- Translation settings (targetLanguage/sourceLanguage) are runtime variables (global settings, not per-story)
- 67 runtime variables cataloged with wizard step availability annotations
- Narrative templates include full system prompt instruction text (POV/tense/mode conditionals, story context, chapter summaries, style guidance)
- 7 external templates identified: 3 image-style (raw text), interactive-lorebook, lorebook-classifier, character-card-import, vault-character-import (service-injected)
- Complex macro variants inlined as Liquid {% if/elsif/else %} conditionals -- eliminates MacroEngine scoring-based resolution
- External templates (interactive-lorebook) fetched via database.getPackTemplate() with manual placeholder injection
- Generation ContextBuilder imports new pipeline as ContextPipeline to avoid class name collision
- Services without storyId use new ContextBuilder() with add() for mode/pov/tense as flat variables
- Service migration pattern: ContextBuilder.forStory(storyId) + ctx.add({vars}) + ctx.render(templateId) replaces promptService.renderPrompt/renderUserPrompt
- Priming message moved to NarrativeService private methods (no macro engine dependency)
- buildChapterSummariesBlock kept in systemBuilder as pure utility import
- AIService orchestrator bridges old PromptContext API to new storyId-based ContextBuilder API
- Wizard uses new ContextBuilder() not forWizard() -- progressive context via sequential .add() calls
- TranslationService uses ContextBuilder without story context -- translation settings are global runtime variables
- External image style templates fetched from database.getPackTemplate not ContextBuilder -- raw text without Liquid variables
- prepareStoryData made async because buildSystemPrompt now uses async ContextBuilder.render()
- Legacy macro type stubs removed from prompts/types.ts (04-07); PromptSettings deprecated fields changed to unknown[]
- WorldStateContext, formatStoryTime, buildChapterSummariesBlock moved from systemBuilder to NarrativeService
- PromptSettings keeps deprecated customMacros/macroOverrides fields for saved data backward compatibility
- All prompt rendering in codebase now goes through ContextBuilder + LiquidJS -- no alternative path
- packService.initialize() placed after database.init() and before settings.init() in startup sequence
- handleProviderSetupComplete made async to await packService.initialize() in first-run flow
- Instruction constants (INLINE_IMAGE_INSTRUCTIONS, VISUAL_PROSE_INSTRUCTIONS) placed in NarrativeService -- co-located with only consumer
- 96 runtime variables registered in variableRegistry (deduplicated from service usage across 41 templates)
- VaultPanel.svelte updated to import VaultTab type from store instead of local redeclaration
- Template groups organized into 7 named groups matching domain areas (Story Generation, Analysis, Memory, Suggestions & Actions, Image, Translation, Wizard)
- CodeMirror optimizeDeps.exclude applied to codemirror and @codemirror/lang-liquid
- Prompts tab uses its own rendering path, not the sections config array
- Search/filter area hidden for Prompts tab via class:hidden directive
- Import button now enabled with full import flow (was disabled placeholder)
- Import validates both Zod schema structure AND LiquidJS template syntax before allowing import
- Name conflict resolution: replace/rename/cancel strategy pattern
- Export button on pack cards uses hover-reveal opacity transition
- showCreateDialog uses $bindable() for parent-child two-way binding
- Pack cards use button wrapper for accessibility with Card component inside
- View state machine uses discriminated union (browsing | editing) for Prompts tab sub-navigation
- Header actions hidden in editor mode; tab switch resets to browsing
- Mobile uses Drawer (bottom sheet) for template navigation in editor
- CodeMirror keyed by templateId+activeTab for fresh editor on switch
- Validation debounced at 500ms for real-time editor feedback
- EditorView obtained via onready callback for variable insertion at cursor
- Dirty guard uses Dialog component (AlertDialog not installed)
- VariablePalette uses Popover with child snippet pattern (bits-ui v2)
- VariableCard uses initialExpanded prop to auto-expand newly created variables
- Enum options use move up/down buttons instead of drag-and-drop for simplicity
- Delete confirmation is inline (not a dialog) to reduce modal fatigue
- Old prompt editor components deleted (6 files, -1855 lines); settings prompts tab rewritten with plain Textarea editors
- refreshPack function propagates variable changes to VariablePalette completions
- Preview rendering debounced at 300ms (faster than 500ms validation) for responsive feedback
- Preview embedded inside TemplateEditor (not PromptPackEditor) to keep parallel plan isolation
- Desktop preview: side-by-side w-[45%] with border-l separator
- Mobile preview: toggle via segmented button (Editor/Preview) with class:hidden swap
- Sample context covers all 106 variables (10 system + 96 runtime) with descriptive placeholders
- templateEngine.render() used synchronously for preview (never throws, returns empty string on error)
- Story variable overrides stored as JSON text column on stories table (simple, no extra table)
- Sort order uses integer with alphabetical variable_name as tiebreaker
- isRequired kept in type/database but removed from VariableCard UI (preserve data, remove redundant control)
- Pack step always shown in wizard (even with only default pack) for discoverability
- Boolean variables always pass allVariablesFilled check (toggle has implicit value)
- Pack dropdown hidden when only one pack exists to reduce UI noise

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 1 readiness:**
- Phase 1 complete: Template engine with validation and public API ready

**Phase 4 readiness:**
- Phase 4 complete: All 8 plans executed

**Phase 5 readiness:**
- Schema extensions in place (migration 030): description, sort_order, custom_variable_values
- Types and services updated for all Phase 5 features
- ContextBuilder loads story-specific variable overrides
- VariableCard updated with description field, without isRequired toggle
- Wizard pack selection step integrated (9-step flow, pack/variable persistence on story creation)
- Import/export flow complete: ImportExportService + ImportPreviewDialog with conflict resolution

**Phase 6 readiness:**
- Legacy template audit required -- all existing templates and macro types must be mapped to new system before migration

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Make step 2 of 9 of the wizard UI much nicer | 2026-02-16 | d683248 | [001-make-step-2-of-9-of-the-wizard-ui-much-n](./quick/001-make-step-2-of-9-of-the-wizard-ui-much-n/) |

## Session Continuity

Last session: 2026-02-16 (quick task)
Stopped at: Completed quick task 001: Wizard step 2 UI polish
Resume file: .planning/quick/001-make-step-2-of-9-of-the-wizard-ui-much-n/001-SUMMARY.md
