# ComfyUI-PromptChain

**Visual hierarchy for prompt randomization. No more nested wildcard hell.**

## The Problem

Complex prompts with randomization become unreadable fast:

```
{warrior|mage|rogue}, {iron|steel|mythril} {sword|axe|staff},
{{fire|ice|lightning} enchantment|no enchantment}, {dragon|demon|undead} slayer
```

Now nest a few levels deeper. Add 20 options per group. Good luck debugging which path fired.

## The Solution

PromptChain makes the hierarchy *spatial*. Instead of parsing nested braces in your head, you see the decision tree as connected nodes:

```
[Class Node] ──→ [Weapon Node] ──→ [Enchant Node] ──→ [Title Node]
     │                │                 │                  │
warrior|mage     iron|steel        fire|ice|         dragon|demon
   |rogue        sword|axe|staff   lightning         |undead slayer
```

Each node shows exactly what it output. Chain them together, see the whole prompt path at a glance.

## Features

- **Inline wildcards** — Write `red | blue | green` directly in nodes. No external files.
- **Visual chaining** — Connect nodes to build hierarchical prompt structures
- **Dynamic inputs** — Inputs auto-expand as you connect more nodes
- **Live preview** — See what fired, when it fired, in real-time
- **Lock system** — Freeze outputs and propagate locks upstream
- **Import/Export** — Paste Dynamic Prompts syntax, auto-generate node trees
- **Two modes:**
  - `Randomize` — Pick one path from connected inputs
  - `Combine` — Merge all paths together

## Installation

**ComfyUI Manager:**
Search "PromptChain" → Install → Restart

**Manual:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/mobcat40/ComfyUI-PromptChain.git
```

## Syntax

| Symbol | Meaning | Example | Result |
|--------|---------|---------|--------|
| `\|` | OR (pick one) | `red\|blue\|green` | `blue` |
| `,` | AND (include both) | `red\|blue, dress\|skirt` | `blue, dress` |

Multiline works too — lines ending with `|` continue the OR group, lines ending with `,` create AND boundaries.

## The Node

**PromptChain** is the single node type. It has:
- **Mode selector** — `Randomize` or `Combine`
- **Text field** — Wildcard processing with `|` and `,` syntax
- **Dynamic inputs** — Connect as many inputs as you need, slots auto-expand

### Modes

**Randomize**
- Picks ONE random input from connected inputs
- Prepends the text field to the selected input
- Use for branching logic (pick one path)

**Combine**
- Concatenates ALL inputs together
- Prepends the text field to all inputs
- Joins everything with `", "` delimiter

## Example: RPG Character Generator

```
Node 1:                    Node 2 (Randomize):        Node 3 (Combine):
┌─────────────────┐       ┌─────────────────┐        ┌─────────────────┐
│ warrior|mage|   │──────→│ steel|mythril   │───────→│ fire enchant,   │
│ rogue           │       │ sword|staff     │        │ dragon slayer   │
└─────────────────┘       │ input_1: ●      │        │ input_1: ●      │
                          └─────────────────┘        └─────────────────┘

Output: "warrior, mythril sword, fire enchant, dragon slayer"
```

## Live Preview

Toggle the **Preview** checkbox in the node's menubar. When enabled:

- **Last run timestamp** — Shows elapsed time since execution, updates in real-time (e.g., "Last run: 20 mins ago")
- **Selected options** — See exactly which wildcards fired
- **Full output string** — The complete processed result
- **Updates on every execution**

## Lock System

Click the **lock icon** (🔒/🔓) to freeze the current output.

**When locked:**
- Node returns cached output instead of re-processing
- Randomization results preserved across executions
- Perfect for keeping a roll you like

**Visual indicators:**

| Icon | Meaning |
|------|---------|
| 🔒 Bright orange | Node is self-locked |
| 🔒 Dim orange | Locked by upstream node |
| 🔓 Gray | Unlocked |

**Upstream propagation:** Lock one node, the entire downstream chain freezes with it. Ensures your prompt path stays consistent.

**Persistence:** Lock state and cached output save with your workflow.

## Import & Export

Right-click any PromptChain node → **Import** or **Export**

### Import: Escape Dynamic Prompts Hell

Paste your existing prompts and auto-generate clean node structures:

| Format | Example | Result |
|--------|---------|--------|
| Plain tags | `red, blue, green` | Converts to `red \| blue \| green` |
| Dynamic Prompts | `{warrior\|mage}, {sword\|staff}` | Creates connected node tree |
| Top-level OR | `option A \| option B` | Creates separate input nodes |

**Nested braces like `{a|{b|c}}` are recursively expanded into node hierarchies.**

### Export

Convert your node tree back to Dynamic Prompt format:

- Traverses all connected upstream nodes
- Converts wildcards to brace syntax
- Respects modes: Randomize → `{a|b}`, Combine → comma-joined
- Dialog with exported string ready to copy

## Tag Deduplication

Duplicates automatically removed, **first occurrence wins**:

```
Input:  "red, blue, RED, green"
Output: "red, blue, green"
```

Early nodes = intentional placement. Later duplicates from downstream merges get removed.

- Case-insensitive matching
- Special tags like `[BREAK]` always preserved

## Multiline Wildcards

Lines ending with `|` form a unified OR group:

```
warrior |
mage |
rogue
```

Equivalent to `warrior | mage | rogue` — pick one randomly.

## Why PromptChain?

| Pain Point | Dynamic Prompts | PromptChain |
|------------|-----------------|-------------|
| Nested syntax | `{a\|{b\|{c\|d}}}` | Visual node tree |
| Debugging | Read the string | See what lit up |
| External files | Required | None |
| Migration | — | One-click import |

## Prompt Library Mode

Disconnected PromptChain nodes act as prompt storage:

- Drop a node, paste your prompt, leave it unwired
- Sits on your canvas as a visual "sticky note"
- Saves with your workflow
- Connect it when you want to use it, disconnect to deactivate

Build a library of prompt fragments right in your workflow. Zero config, just nodes.

## License

MIT License: free to use forever!
