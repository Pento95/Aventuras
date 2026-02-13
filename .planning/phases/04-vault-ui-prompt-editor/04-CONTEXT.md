# Phase 4: Vault UI & Prompt Editor - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the user-facing interface for viewing, editing, creating, and managing prompt preset packs. This lives within the existing Vault system as a new "Prompts" tab. Users can browse packs, open an editor to modify templates with syntax highlighting and live preview, insert variables via a searchable palette, and manage custom variable definitions. Creating new packs copies defaults as a starting point. Import/export and wizard integration are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Pack browsing & cards
- Distinct card design from existing vault cards (not reusing Characters/Lorebooks/Scenarios card style)
- Card shows: pack name, description, modified template count, and active indicator (badge if pack is used by any story)
- Default pack is pinned to top of the list AND has a "Default" badge — clear hierarchy
- Default pack is always present, not deletable — users can modify templates within it but cannot remove the pack itself
- User-created packs appear below the default pack

### Editor layout & navigation
- Clicking a pack card replaces the vault search area with the editor view (per VLT-04)
- Left panel: collapsible groups (Story Generation, Analysis, Memory, Wizard, Image, etc.) — collapsed by default
- No search/filter within the template list — collapsible groups with ~24 templates is manageable
- No per-template "modified" markers in the list — the modified count on the card is sufficient
- Desktop: left panel (template list) + right panel (editor with live preview)
- Mobile: Claude's discretion on layout approach

### Editing experience
- Variable insertion: searchable command-palette style popup — type to search across all variables, click to insert at cursor
- No dedicated conditional insertion tool — users type conditionals manually
- Editor provides Liquid syntax highlighting and suggestions/autocomplete
- Desktop: live preview always visible alongside the editor
- Mobile: preview approach at Claude's discretion (toggle or separate view)
- Save/discard flow per requirements (EDT-07, EDT-08)
- Reset to default per requirements (EDT-09)
- Undo/redo per requirements (EDT-11)

### Validation feedback
- Validation error display approach at Claude's discretion (inline annotations, bar below editor, or gutter icons — based on editor component capabilities)

### Variable management
- Variables tab accessed from left panel (alongside template groups)
- Card per variable — each variable displayed as a small card showing name, type, default value, required status
- Click card to expand and edit properties
- Type selection via dropdown (text, textarea, number, boolean, enum)
- Enum options: inline add/remove list of label/value pairs with + to add, X to remove, drag to reorder
- No variable usage cross-referencing (which templates use a variable) — keep it simple

### Claude's Discretion
- Mobile editor layout pattern (stacked navigation, bottom sheet, etc.)
- Mobile preview approach
- Validation error display style
- Syntax highlighting implementation (CodeMirror 6, Monaco, or simpler approach)
- Exact template group names and which templates go in which group
- Empty state for a pack with no custom variables
- Save confirmation behavior (auto-save vs manual)

</decisions>

<specifics>
## Specific Ideas

- User explicitly wants live preview on desktop — not hidden behind a toggle
- Variable insertion should feel like a command palette (quick, searchable, keyboard-friendly)
- Default pack should feel permanent and trustworthy — always pinned, badged, undeletable
- Conditionals don't need a builder — users comfortable typing Liquid syntax with highlighting support

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-vault-ui-prompt-editor*
*Context gathered: 2026-02-12*
