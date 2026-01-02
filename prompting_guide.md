# Creative Writing Prompting: Best Practices Reference

This document provides systematic guidance for generating high-quality creative writing and roleplay prompts. Apply these principles when constructing prompts to optimize prose quality, character voice, dialogue naturalism, and narrative coherence.

---

## Core principles

**Specificity eliminates generic output.** Treat prompts like instructions for a new employee—explicit, detailed, with clear expectations about tone, audience, format, and style. Vague prompts yield vague results. Instead of "write a fantasy scene," specify "write a 500-word scene in third-person limited perspective where a cynical mercenary discovers his employer has betrayed him, using sparse prose and realistic dialogue."

**Iterative refinement outperforms single-shot prompting.** The most effective workflow involves multiple targeted passes: first generating raw content, then running specific improvement prompts for purple prose removal, show-don't-tell conversion, and dialogue naturalism. Professional author Alexander Wales documented this approach extensively, noting that modular editing prompts consistently improve creative output quality.

**Persona assignment improves quality.** Research confirms that assigning explicit roles—"You are a novelist with 20 years of experience specializing in noir fiction"—produces enhanced results compared to generic instructions. The persona primes probability distributions toward relevant patterns.

**Positive framing outperforms negative instructions.** Forceful "do NOT" instructions can backfire. Prefer positive framing: instead of "NEVER use purple prose," write "Use minimalist style with concrete verbs and sparse adjectives."

---

## System prompt architecture

Structure system prompts with clear sections. Use consistent formatting (headers, bullet points, or tags) to delineate different types of instructions.

### Essential components

**Role definition:** Establish expertise and perspective.
```
You are an experienced fiction writer specializing in psychological thriller. 
Write immersive, emotionally resonant prose that prioritizes tension and subtext.
```

**Style requirements:** Specify concrete parameters.
```
Style requirements:
- POV: Third person limited, past tense
- Tone: Tense, atmospheric, with moments of dark humor
- Prose style: Clean and direct; favor strong verbs over adverb+weak verb
- Sentence rhythm: Vary length; short sentences for tension, longer for reflection
- Show emotions through action, dialogue, and physical sensation—not direct statement
```

**Prohibited patterns:** List specific anti-patterns to avoid.
```
Prohibited patterns:
- Purple prose: overwrought metaphors, consecutive similes, excessive adjectives
- Epithets: "the dark-haired woman," "the tall stranger" (use names or pronouns)
- Exposition in dialogue: characters explaining things they both already know
- Telling emotions directly: "She felt sad," "He was angry"
- Hedging language: excessive use of "seemed," "appeared," "somehow"
```

**Format specifications:** Define output structure.
```
Format:
- Length: 400-600 words per response
- End scenes at natural beats; do not resolve all tension artificially
- Include internal thoughts in italics
- Never write actions or dialogue for [user character name]
```

### Banned word lists

LLMs have characteristic overused words. Explicitly banning them improves prose variety.

**Common overused words to prohibit:**

| Category | Words to ban |
|----------|-------------|
| Verbs | delve, explore, navigate, embark, leverage, utilize, foster, unpack |
| Descriptors | tapestry, realm, landscape, beacon, testament, multifaceted, pivotal, robust, seamless, intricate |
| Emotional tells | palpable, visceral, myriad, plethora |
| Openers | "In today's...," "In the realm of...," "Let's dive in" |
| Structures | "It's not just X, it's Y," dramatic tricolons, rhetorical questions as transitions |

**Physical description clichés to prohibit:**
- "Orbs" for eyes
- "Tresses" or "locks" for hair  
- "Digits" for fingers
- "Alabaster," "porcelain," "ivory" for pale skin
- "Chiseled," "sculpted" for faces/bodies

---

## Prose quality optimization

### Eliminating purple prose

Purple prose—overwrought metaphors, excessive adjectives, florid descriptions—is the most common AI writing flaw.

**Include explicit style guidance:**
```
Write in clear, direct prose. Use strong verbs instead of adverb+weak verb combinations.
Avoid: consecutive metaphors, flowery descriptions, words like "alabaster," "molten," "smoldering."
Prefer: concrete sensory details, specific actions, sparse but precise adjectives.
One metaphor per paragraph maximum. Ground descriptions in character perception.
```

**Provide contrast examples:**
```
AVOID: "The sun sunk below the horizon, casting a fiery glow across the still lake, 
painting a masterpiece of nature's eternal artistry."

PREFER: "The sun set over the lake. The water turned orange, then grey."
```

**Iterative editing prompt for purple prose:**
```
Review this passage and identify purple prose—overwrought metaphors, excessive adjectives, 
or florid descriptions. For each instance:
1. Quote the original phrase
2. Explain why it's overwrought
3. Provide a rewritten version using clear, direct language

Passage: [text]
```

### Implementing show-don't-tell

LLMs default to explicit emotional statements. Counter this by reframing emotional goals as observable actions.

**Instead of abstract emotional goals:**
```
BAD: "Show that Adelia misses her grandmother"
```

**Specify concrete observable details:**
```
GOOD: "Adelia finds her grandmother's shawl in the closet. Describe her physical reaction 
and what she does with the shawl. Do not state her emotions directly—let the reader 
infer them from her actions."
```

**Include show-don't-tell in system prompts:**
```
Emotional expression rules:
- Never write "[Character] felt [emotion]" or "[Character] was [emotional state]"
- Show emotion through: physical sensation, involuntary action, changed behavior, 
  what the character notices or ignores, how they interact with objects
- Trust the reader to infer emotional states from evidence
```

**Editing prompt for show-don't-tell:**
```
Review this text for passages that tell emotions directly rather than showing them.

For each telling statement:
1. Quote the original
2. Identify the emotion being told
3. Rewrite showing the same emotion through concrete, observable details 
   (action, physical sensation, dialogue, or environmental focus)

Text: [passage]
```

### Avoiding epithets

Epithets ("the raven-haired woman," "the tall stranger") signal AI writing and reduce immersion.

**Explicit prohibition:**
```
Character reference rules:
- Use character names or pronouns only
- Never use "the [adjective] [noun]" constructions ("the dark-haired woman")
- Never use "the [profession/role]" after a character's name is established
- Never use physical descriptor substitutions ("the blonde," "the tall one")

Exception: A character who genuinely doesn't know another character's name may 
use a descriptor, but only until the name is learned.
```

---

## Character voice and consistency

### Character profile structure

Well-structured character profiles dramatically improve voice consistency. Include these elements:

**Core identity:**
```
Name: Kaelen Ashford
Role: Protagonist's reluctant ally
Core trait: Cynical exterior protecting deep loyalty
Internal conflict: Wants connection but fears vulnerability
```

**Speech patterns (critical for voice):**
```
Speech patterns:
- Sentence structure: Short, declarative. Rarely asks questions directly.
- Vocabulary level: Working-class, practical. No flowery language.
- Verbal tics: Says "look" when frustrated, "fair enough" when conceding
- Interruption style: Cuts people off mid-sentence when impatient
- What they talk about: Practical concerns, plans, past experiences (briefly)
- What they avoid discussing: Feelings, the future, anything hopeful
```

**Example dialogue (essential):**
```
Example dialogue:
"Well, that could have gone worse. Nobody's on fire. Yet."
"Look, I don't got time for this. You want my help or not?"
"Fair enough. But when this goes sideways—and it will—I'm gone."
```

**Anti-examples (what they would never say):**
```
What Kaelen would NEVER say:
- Emotional declarations: "I care about you" (would show through action instead)
- Optimistic statements: "Everything will work out" 
- Formal speech: "I must confess" or "Perhaps we should consider"
- Asking for help directly: Would phrase as transaction or observation
```

### Character card formats for roleplay systems

**PLists + Ali:Chat hybrid (token-efficient):**
```
[Elena's persona: curious, scholarly, forgetful, kind, obsessed with ancient texts;
Elena's appearance: young woman, brown hair in loose bun, green eyes, wire spectacles, ink-stained fingers;
Elena's speech: formal vocabulary, trails off mid-sentence when distracted, says "fascinating" often]

{{user}}: Tell me about yourself.
{{char}}: *adjusts her spectacles, accidentally smudging the lens* I'm Elena—scholar, 
specializing in pre-Collapse manuscripts. *gestures at the towering bookshelves* 
Spent fifteen years building this collection. Sometimes I forget to eat when I find 
something particularly... *trails off, staring at a spine* ...oh, is that the Aldric Codex?
```

**Token optimization techniques:**
- Use parenthetical grouping: `hair(brown, messy, shoulder-length)` 
- Use slash separators: `blouse(cream)/skirt(long, grey)`
- Invest quality in the **first message**—output tends to mirror its style and length
- Keep permanent character tokens under 600 for constrained contexts

---

## Dialogue naturalism

Natural dialogue requires subtext, interruption, and character-specific patterns. Default AI dialogue tends toward exposition-heavy, grammatically perfect speech.

### System prompt additions for dialogue

```
Dialogue guidelines:
- Subtext: Characters often mean something different from what they literally say
- Indirection: Characters don't always directly answer questions; they deflect, redirect, or answer a different question
- Interruption: Include cut-off sentences (use em-dash—) during tense exchanges
- Incomplete thoughts: Real speech includes false starts, self-corrections, trailing off
- No exposition dumping: Characters never explain things both speakers already know
- Contractions: Use them naturally; their absence sounds stilted
- Discourse markers: Include "well," "so," "I mean," "look" sparingly but naturally
- Silence: Sometimes the most powerful response is none; describe the pause instead
```

### Dialogue-specific editing prompt

```
Revise this dialogue for naturalism:

1. Remove any exposition characters wouldn't realistically say aloud
2. Add at least one interruption or incomplete sentence where tension is high
3. Include one moment of subtext (character meaning differs from literal words)
4. Ensure each character's vocabulary and sentence structure matches their background
5. Replace any overly grammatical constructions with natural speech patterns
6. Add small physical actions or beats between lines to control pacing

Original dialogue: [text]
```

### Subtext techniques

**Provide subtext guidance in scene prompts:**
```
Write a conversation where:
- Surface topic: They're discussing the broken fence
- Actual conflict: He's hurt she didn't tell him about the job offer
- Neither character directly addresses the real issue
- The tension should be clear to the reader through word choice, what's NOT said, 
  and physical behavior
```

---

## Advanced techniques

### Few-shot style transfer

For precise style matching, provide examples before the task:
```
Write in this style. Study these examples carefully:

EXAMPLE 1:
[200-word excerpt demonstrating target style]

EXAMPLE 2:
[200-word excerpt demonstrating target style]

DO NOT write like this:
[100-word counter-example showing wrong style]

Match the rhythm, vocabulary level, and sentence structure of the examples.
Now write: [actual task]
```

Three to five examples work best—enough to establish patterns without overwhelming context.

---

## Complete system prompt template

```markdown
# Role
You are an experienced fiction writer. Write immersive, emotionally resonant prose.

# Style Requirements
- POV: [First person/Third person limited/Third person omniscient], [past/present] tense
- Tone: [Specific tone descriptors]
- Prose style: [Clear and direct/Lyrical/Sparse/etc.]
- Show emotions through action, dialogue, and physical sensation—never state them directly
- Use strong, specific verbs; minimize adverbs
- Vary sentence length deliberately: short for tension, longer for reflection
- One metaphor or simile per paragraph maximum
- Ground all description in character perception

# Prohibited Patterns
- Purple prose: overwrought metaphors, consecutive similes, excessive adjectives
- Banned words: [include relevant list]
- Epithets: Never "the [adjective] [noun]"—use names or pronouns
- Exposition in dialogue
- Telling emotions: "She felt X" or "He was Y"
- Hedging: excessive "seemed," "appeared," "somehow," "slightly"

# Character Consistency
[Character name]:
- Core traits: [3-5 defining characteristics]
- Speech pattern: [sentence structure, vocabulary level, verbal tics]
- Example line: "[characteristic dialogue]"
- Never says: [anti-examples]

# Dialogue Rules
- Subtext over directness; characters rarely say exactly what they mean
- Include interruptions, incomplete sentences, natural speech patterns
- No exposition dumps—characters don't explain what both already know
- Silence and physical beats between lines for pacing

# Format
- Length: [target word count] per response
- End scenes at natural beats; preserve tension
- Internal thoughts in [italics/etc.]
- Never write for [protected character name]
```

---

## Implementation checklist

When constructing a creative writing prompt, verify:

- [ ] Role/persona assigned with specific expertise level
- [ ] Style requirements explicit (POV, tense, tone, prose approach)
- [ ] Banned patterns listed (purple prose indicators, epithets, specific words)
- [ ] Character profiles include speech patterns AND anti-examples ("never says")
- [ ] Show-don't-tell instruction explicitly included
- [ ] Dialogue guidelines address subtext and naturalism
- [ ] Output format specified (length, structure, protected characters)
- [ ] Few-shot examples provided if precise style-matching required
- [ ] Context/continuity information included for ongoing narratives
- [ ] Emotional goals framed as observable actions, not abstract states

