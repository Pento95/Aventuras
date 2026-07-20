// `entities` use the drizzle row shape (camelCase: id/kind/name/description/
// status/injectionMode). `sceneEntities` is the id array from entry metadata.
// The scene loop is intentionally injectionMode-agnostic — that IS the
// structural-floor invariant (active + in-scene always inject).
export const PER_TURN_NARRATIVE = `{% if definition.setting != blank -%}
# Setting
{{ definition.setting }}

{% endif -%}
{% if definition.genre.promptBody != blank -%}
# Genre
{{ definition.genre.promptBody }}

{% endif -%}
{% if definition.tone.promptBody != blank -%}
# Tone
{{ definition.tone.promptBody }}

{% endif -%}
{%- assign hasScene = false -%}
{%- for e in entities | active -%}
{%- if sceneEntities contains e.id -%}{%- assign hasScene = true -%}{%- endif -%}
{%- endfor -%}
{% if hasScene -%}
# Characters in scene
{% for e in entities | active -%}
{%- if sceneEntities contains e.id %}
## {{ e.name }} [{{ e.id }}]
{{ e.description }}
{% endif -%}
{%- endfor %}

{% endif -%}
{%- assign stagedList = entities | staged -%}
{% if stagedList.size > 0 -%}
# Staged characters (introduce when narratively appropriate)
{% for e in stagedList %}
- [{{ e.id }}] {{ e.name }}: {{ e.description }}
{%- endfor %}

If you introduce any staged character, include their bracketed ID in the trailing <scene_entities> block.

{% endif -%}
{% if calendarVocabulary -%}
# Calendar
This story tracks time in {{ calendarVocabulary.baseUnitName }}s ({{ calendarVocabulary.secondsPerBaseUnit }} seconds per {{ calendarVocabulary.baseUnitName }}). Tiers: {% for t in calendarVocabulary.tiers %}{{ t.name }}{% if t.labels.size > 0 %} ({{ t.labels | prose_join }}){% endif %}{% unless forloop.last %}, {% endunless %}{% endfor %}. Convert relative-time prose ("two days later", "the next morning") into a seconds delta on <world_time_delta> using these units.

{% endif -%}
# Story so far
{%- assign recentEntries = entries | recent: userSettings.partialChapterBuffer %}
{% for entry in recentEntries %}
{{ entry.content }}
{% endfor %}
{% include 'macro_output_format_narrative' %}
{% include 'macro_state_emission' %}`
