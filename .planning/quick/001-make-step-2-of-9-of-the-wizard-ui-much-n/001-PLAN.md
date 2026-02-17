---
phase: quick-001
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/components/wizard/steps/StepPackSelection.svelte
autonomous: true

must_haves:
  truths:
    - "Step 2 (Prompt Pack) visually matches the polish level of Step 1 (Mode) and Step 8 (Writing Style)"
    - "The empty state (default pack, no variables) looks intentional and informative, not barren"
    - "Variable inputs are compact and well-organized with visual hierarchy"
  artifacts:
    - path: "src/lib/components/wizard/steps/StepPackSelection.svelte"
      provides: "Polished Prompt Pack selection step"
      min_lines: 80
  key_links: []
---

<objective>
Redesign the StepPackSelection wizard step (Step 2 of 9) to match the visual polish of other wizard steps. Currently it is too spacious, has a bare empty state, and lacks the icon-header treatment and card-based layouts used elsewhere in the wizard.

Purpose: The wizard is the first experience new users have. Step 2 currently breaks the visual flow with excessive whitespace, plain text headers, and an ugly empty state.
Output: A visually polished StepPackSelection.svelte
</objective>

<execution_context>
@E:\Personal Projects\Aventura\.claude\get-shit-done\workflows\execute-plan.md
@E:\Personal Projects\Aventura\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@src/lib/components/wizard/steps/StepPackSelection.svelte
@src/lib/components/wizard/steps/Step1Mode.svelte (reference for card-based selection pattern)
@src/lib/components/wizard/steps/Step7WritingStyle.svelte (reference for icon-header + section pattern)
@src/lib/components/wizard/SetupWizard.svelte (integration context - step 2 maps to StepPackSelection)
@src/lib/services/packs/types.ts (PresetPack, CustomVariable types)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redesign StepPackSelection layout and styling</name>
  <files>src/lib/components/wizard/steps/StepPackSelection.svelte</files>
  <action>
Redesign StepPackSelection.svelte to match the visual quality of other wizard steps. The component props and callback interface MUST remain identical -- only the template/markup and imports change.

**Header treatment** (match Step7WritingStyle pattern):
- Add a header with icon badge: use `Package` icon from lucide-svelte (import it)
- Icon in a `bg-primary/10 rounded-md p-2` container, similar to Step2Lorebook header
- Title "Prompt Pack" as `text-lg font-semibold`
- Subtitle text in `text-muted-foreground text-sm`
- Reduce top-level spacing from `space-y-6` to `space-y-4`

**Pack selector** (when multiple packs exist):
- Wrap the pack dropdown in a subtle card/section: `rounded-lg border p-4 space-y-3` container
- Keep the existing Select component and description display
- Add the pack description (if any) directly below the dropdown in `text-muted-foreground text-xs`

**Empty state** (default pack, no variables -- this is the biggest problem):
- Replace the plain muted box with a centered, visually appealing empty state
- Use a large `Package` icon (h-10 w-10) in a circular `bg-muted rounded-full p-4` container
- Below icon: "Default Pack Selected" as medium-weight heading
- Below that: "Using the built-in prompt templates. You can create custom packs with configurable variables in the Vault's Prompt Editor." as muted description text
- Add subtle styling: `flex flex-col items-center justify-center text-center py-8`
- This mirrors the "API Key Required" empty state pattern in SetupWizard.svelte

**Variable inputs section** (when variables exist):
- Add a visual divider before variables (match the "Selected Items" divider pattern from Step2Lorebook): a horizontal rule with centered "Variables" label
- Wrap each variable in a `rounded-lg border p-3` card instead of bare inputs floating in space
- Keep spacing between variable cards at `space-y-3` (was `space-y-4`)
- For boolean variables: use a horizontal flex layout with label on left and Switch on right (like Step7WritingStyle toggle pattern) instead of stacked label-then-switch
- Keep all existing input types and their change handlers exactly as-is

**Icons to import**: `Package` from `lucide-svelte` (add to existing imports, do not import icons that are not already used unless specifying Package)

**Do NOT change**:
- The Props interface
- The $props() destructuring
- The $derived computations
- Any callback signatures or behavior
- The component's external API in any way
  </action>
  <verify>
Run `npm run check` from the project root to confirm no TypeScript/Svelte errors. Visually inspect that the component renders without console errors by running `npm run dev` and navigating to the story creation wizard step 2.
  </verify>
  <done>
StepPackSelection has: (1) icon-badge header matching other wizard steps, (2) polished centered empty state for default-pack-only scenario, (3) card-wrapped variable inputs with visual divider, (4) compact spacing throughout. All existing functionality preserved -- props interface unchanged, all variable types still editable.
  </done>
</task>

</tasks>

<verification>
- `npm run check` passes with no errors
- Step 2 of the wizard visually matches the polish level of Step 1 and Step 8
- Empty state (only default pack) shows a centered icon + informative message
- When variables exist, they appear in bordered cards with a labeled divider
- All variable types (text, textarea, number, boolean, enum) still function correctly
</verification>

<success_criteria>
- The "spacious and ugly" appearance is replaced with compact, card-based, icon-enhanced layout
- Visual consistency with other wizard steps (icon headers, card sections, proper spacing)
- Zero functional regressions -- all props, callbacks, and variable editing work identically
</success_criteria>

<output>
After completion, create `.planning/quick/001-make-step-2-of-9-of-the-wizard-ui-much-n/001-SUMMARY.md`
</output>
