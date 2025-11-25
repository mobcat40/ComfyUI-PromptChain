# ComfyUI-PromptChain

**Visual hierarchy for prompt randomization. No more nested wildcard hell.**

## The Problem

Complex prompts with randomization become unreadable fast:

```
{warrior|mage|rogue}, {iron|steel|mythril} {sword|axe|staff}, {{fire|ice|lightning} enchantment|no enchantment}, {dragon|demon|undead} slayer
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

- **Inline wildcards** — Write `red|blue|green` directly in nodes. No external files.
- **Visual chaining** — Connect nodes to build hierarchical prompt structures
- **Dynamic inputs** — Inputs auto-expand as you connect more nodes
- **Live preview** — Every node shows what it selected on each run
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

Click the **Preview** button on any node to toggle output display. When enabled, you'll see:
- Exactly which options were randomly selected
- The full output string after processing
- Updates on every execution

## Why Not Dynamic Prompts / Other Wildcards?

- **No external files** — Everything lives in your workflow
- **Visual debugging** — See the tree, not a wall of braces
- **Workflow-native** — Hierarchies are node connections, not syntax

## License

MIT
