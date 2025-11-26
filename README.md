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

- **Inline wildcards** — Write `red | blue | green` directly in nodes. No external files required.
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

Check the **Preview** checkbox in the node's menubar to toggle output display. When enabled, you'll see:
- Exactly which options were randomly selected
- The full output string after processing
- Updates on every execution

## Lock Feature

Click the **lock icon** (🔒/🔓) in the node's menubar to freeze the current output. When locked:
- The node returns its cached output instead of re-processing
- Randomization results are preserved across executions
- Perfect for keeping a specific roll you like

### Visual Indicators

| Color | Meaning |
|-------|---------|
| 🔒 Bright orange | Node is self-locked |
| 🔒 Dim orange | Locked by an upstream node |
| 🔓 Gray | Unlocked |

### Upstream Lock Propagation

If any upstream PromptChain node is locked, all downstream nodes in the chain automatically inherit the lock state. This ensures the entire prompt path stays frozen together.

### Persistence

Lock state and cached output are saved with your workflow — reload it later and your locked results are still there.

## Import & Export

Right-click any PromptChain node to access **Import** and **Export** options.

### Import

Paste prompts in multiple formats and auto-generate node structures:

| Format | Example | Result |
|--------|---------|--------|
| Plain tags | `red, blue, green` | Converts to wildcard `red \| blue \| green` |
| Dynamic Prompts | `{warrior\|mage}, {sword\|staff}` | Creates connected node tree |
| Top-level OR | `option A \| option B \| option C` | Creates separate input nodes |

Nested braces like `{a\|{b\|c}}` are recursively expanded into node hierarchies.

### Export

Convert your node tree back to Dynamic Prompt format for sharing or use in other tools:

- Traverses all connected upstream PromptChain nodes
- Converts wildcards (`a | b | c`) to brace syntax (`{a|b|c}`)
- Respects node modes: Randomize creates `{a|b}` groups, Combine joins with commas
- Opens a dialog with the exported string ready to copy

## Tag Deduplication

Duplicate tags are automatically removed with **right-to-left priority** (matching Stable Diffusion's behavior where later tags take precedence):

```
Input:  "red, blue, RED, green"
Output: "blue, red, green"
```

- Case-insensitive matching
- Special tags like `[BREAK]` are always preserved

## Multiline Wildcards

Lines ending with `|` are auto-detected as a unified OR group:

```
warrior |
mage |
rogue
```

Is equivalent to `warrior | mage | rogue` — pick one randomly.

## Why Not Dynamic Prompts / Other Wildcards?

- **No external files** — Everything lives in your workflow
- **Visual debugging** — See the tree, not a wall of braces
- **Workflow-native** — Hierarchies are node connections, not syntax
- **Import compatible** — Paste Dynamic Prompts syntax and auto-generate nodes

## License

MIT License: free to use forever!
