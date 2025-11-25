# ComfyUI-PromptChain

## The Problem

When building complex prompts for image generation, you need two things:
1. **Randomization** - Generate variations by randomly selecting from options (wildcards)
2. **Hierarchical control** - Chain prompt segments together visually in your workflow

Most wildcard solutions require external files or lack visual workflow integration. ComfyUI-PromptChain solves this by letting you build randomized, hierarchical prompts directly in your ComfyUI node graph.

## Features

- **Inline wildcards** - No external files needed, write `red|blue|green` directly in nodes
- **Visual chaining** - Connect nodes together to build hierarchical prompt structures
- **Flexible syntax** - Mix inline and multiline formats however you want
- **Two modes** - Random Selection (pick one path) or Combine (merge all paths)
- **3 node types** - Simple (standalone), PromptChain 5, PromptChain 10

## Installation

### Via ComfyUI Manager
1. Search for "PromptChain" in ComfyUI Manager
2. Install and restart ComfyUI

### Manual Installation
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/chrmc40/ComfyUI-PromptChain.git
# Restart ComfyUI
```

## Syntax Rules

- **`|` (pipe)** - Separates OR options: `red|blue|green` randomly picks one
- **`,` (comma)** - Separates AND groups: `red|blue, shoes|sandals` picks one color AND one footwear
- **Output format** - All results flattened to `", "` (comma-space) delimiter
- **Multiline support** - Lines ending with `,` create AND boundaries, otherwise continue as OR group
- **Mix formats freely** - Combine inline and multiline syntax in the same text field

## Nodes

### PromptChainSimple
- Single text field with wildcard processing
- No inputs, just processes the text field
- Use for standalone wildcard groups

### PromptChain 5 & PromptChain 10
- Text field + 5 or 10 string inputs
- Mode selector: "Random Selection" or "Combine"
- Build hierarchical prompt chains by connecting node outputs to inputs

## Modes

**Random Selection**
- Randomly picks ONE input from connected inputs
- Prepends the text field to the selected input
- Use for branching logic (pick one path)

**Combine**
- Concatenates ALL inputs together
- Prepends the text field to all inputs
- Joins everything with `", "` delimiter
- Logs output to console

## Examples

### Inline Wildcards
```
red|blue|green, dress|skirt, heels|sandals
```
Output: `"blue, skirt, heels"` (randomly selected)

### Multiline Wildcards
```
combat boots |
sandals |
bare feet
```
Output: `"sandals"` (randomly selected from 3 options)

### Mixed Format
```
red|blue, shoes|sandals
combat boots |
bare feet |
sandals,
jewelry
```
Parsing:
- Line 1: `red|blue` AND `shoes|sandals` (two AND groups with wildcards)
- Lines 2-4: `combat boots|bare feet|sandals` (one wildcard group ending at comma)
- Line 5: `jewelry` (standalone AND group)

Output example: `"red, sandals, bare feet, jewelry"`

### Hierarchical Chaining

**Node 1** (PromptChain 5, Random Selection mode):
```
Text field:
woman |
man

Inputs: [empty]
```

**Node 2** (PromptChain 5, Random Selection mode):
```
Text field:
red|blue dress

Input 1: connected to Node 1 output
```

When Node 1 selects "woman", Node 2 output: `"woman, red dress"` or `"woman, blue dress"`

## How It Works

All text is processed with these rules:
1. Lines ending with `,` mark AND boundaries
2. Lines ending with `|` or nothing continue the wildcard group (add `|` automatically)
3. Split by `,` to get AND groups
4. Within each AND group, split by `|` to get OR options
5. Randomly select one option from each OR group
6. Join all selections with `", "` delimiter

## License

MIT
