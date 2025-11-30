# ComfyUI Custom Node Styling Guide

This guide documents techniques for customizing the appearance of ComfyUI custom nodes beyond the default LiteGraph styling. All examples are from the PromptChain node implementation.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Extension Hooks](#extension-hooks)
3. [Hiding Default Labels](#hiding-default-labels)
4. [Custom Slot Labels](#custom-slot-labels)
5. [Custom Widget Drawing](#custom-widget-drawing)
6. [Text Input Styling](#text-input-styling)
7. [Custom Widgets from Scratch](#custom-widgets-from-scratch)
8. [Injecting Global CSS](#injecting-global-css)
9. [Color Reference](#color-reference)

---

## Architecture Overview

ComfyUI uses **LiteGraph.js** for its node-based canvas. Customizations are done through:

- **`app.registerExtension()`** - Register hooks into ComfyUI's lifecycle
- **`beforeRegisterNodeDef`** - Modify node prototypes before instantiation
- **`nodeCreated`** - Modify individual node instances after creation
- **Canvas 2D API** - Draw custom graphics via `ctx` context

```javascript
import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "yourname.YourNode.Feature",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Prototype-level modifications (affects all instances)
    },
    async nodeCreated(node) {
        // Instance-level modifications (affects this specific node)
    }
});
```

---

## Extension Hooks

### `beforeRegisterNodeDef`

Use for prototype-level changes that affect **all instances** of a node type:

```javascript
async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name === "YourNodeName") {
        // Override prototype methods
        const original = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            original?.apply(this, arguments);
            // Your custom drawing code
        };
    }
}
```

### `nodeCreated`

Use for instance-level changes that affect **individual nodes**:

```javascript
async nodeCreated(node) {
    if (node.constructor.comfyClass !== "YourNodeName") return;

    // Modify this specific node instance
    const widget = node.widgets.find(w => w.name === "myWidget");
    // Customize widget...
}
```

---

## Hiding Default Labels

LiteGraph draws default slot labels that can't be styled directly. The trick is to **hide them** and draw your own.

### The Problem

```javascript
// This does NOT work - LiteGraph ignores label_color
input.label_color = "red";  // ❌ Ignored
```

### The Solution

Set the label to a **single space** (not empty string) to hide it:

```javascript
async nodeCreated(node) {
    const hideDefaultLabels = () => {
        // Hide input labels
        if (node.inputs) {
            for (const input of node.inputs) {
                if (input?.name?.startsWith("input_")) {
                    input.label = " ";  // Space hides label, empty string doesn't
                }
            }
        }
        // Hide output labels
        if (node.outputs) {
            for (const output of node.outputs) {
                if (output?.name) {
                    output.label = " ";
                }
            }
        }
    };

    hideDefaultLabels();

    // Re-hide when connections change (new slots may be added)
    const originalOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function() {
        originalOnConnectionsChange?.apply(this, arguments);
        setTimeout(hideDefaultLabels, 0);
    };
}
```

---

## Custom Slot Labels

After hiding default labels, draw your own in `onDrawForeground`:

```javascript
async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name === "YourNodeName") {
        const originalOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            originalOnDrawForeground?.apply(this, arguments);

            if (this.flags?.collapsed || !this.inputs) return;

            // Draw custom INPUT labels (left side)
            for (let i = 0; i < this.inputs.length; i++) {
                const input = this.inputs[i];
                if (input?.name?.startsWith("input_")) {
                    // Get slot position (true = input)
                    const pos = this.getConnectionPos?.(true, i) || [0, 0];

                    // Calculate label position
                    // pos[0] is absolute X, subtract node X to get relative
                    const x = (pos[0] - this.pos[0] + 14 + 14) / 2;
                    const y = pos[1] - this.pos[1];

                    // Draw the label
                    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
                    ctx.font = "12px Arial";
                    ctx.textAlign = "left";
                    ctx.fillText(input.name, x, y + 4);
                }
            }

            // Draw custom OUTPUT labels (right side)
            if (this.outputs) {
                for (let i = 0; i < this.outputs.length; i++) {
                    const output = this.outputs[i];
                    if (output?.name) {
                        // Get slot position (false = output)
                        const pos = this.getConnectionPos?.(false, i) || [0, 0];
                        const x = pos[0] - this.pos[0] - 10;
                        const y = pos[1] - this.pos[1];

                        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
                        ctx.font = "12px Arial";
                        ctx.textAlign = "right";
                        ctx.fillText(output.name, x, y + 4);
                    }
                }
            }
        };
    }
}
```

### Key Methods

| Method | Description |
|--------|-------------|
| `getConnectionPos(isInput, index)` | Returns `[x, y]` absolute position of a slot |
| `this.pos` | Node's absolute position `[x, y]` |
| `this.flags?.collapsed` | Check if node is collapsed |

---

## Custom Widget Drawing

Override a widget's `draw` function to completely customize its appearance.

### Combo Widget (Dropdown/Selector)

```javascript
async nodeCreated(node) {
    const modeWidget = node.widgets.find(w => w.name === "mode");
    if (modeWidget) {
        modeWidget.draw = function(ctx, node, width, y, height) {
            const totalH = 26;      // Total widget height
            const marginY = 2;      // Vertical margin
            const H = totalH - marginY * 2;  // Inner height (22px)
            const margin = 15;      // Horizontal margin
            const w = width - margin * 2;

            // Draw background with rounded corners
            ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
            ctx.beginPath();
            ctx.roundRect(margin, y + marginY, w, H, 12);  // 12px border radius
            ctx.fill();

            // Draw border
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw centered text (current value)
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(this.value || "", width / 2, y + marginY + H * 0.5);

            // Draw left arrow
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            ctx.font = "10px Arial";
            ctx.textAlign = "left";
            ctx.fillText("◀", margin + 6, y + marginY + H * 0.5);

            // Draw right arrow
            ctx.textAlign = "right";
            ctx.fillText("▶", width - margin - 6, y + marginY + H * 0.5);

            return totalH;  // IMPORTANT: Return widget height
        };
    }
}
```

### Important Notes

1. **Return the height** - The `draw` function MUST return the widget's height
2. **Don't call original** - Completely replace the draw function, don't chain it
3. **Use `this.value`** - Access the widget's current value
4. **Reset text alignment** - Canvas context persists; reset `textAlign` as needed

---

## Text Input Styling

Style HTML textarea widgets using direct DOM manipulation:

```javascript
async nodeCreated(node) {
    const setupTextWidget = () => {
        const textWidget = node.widgets?.find(w => w.name === "text");
        if (textWidget?.inputEl) {
            const el = textWidget.inputEl;

            // Basic styling
            el.style.fontFamily = "Arial, sans-serif";
            el.style.fontSize = "11px";
            el.style.padding = "4px";
            el.style.lineHeight = "1.3";
            el.style.borderRadius = "4px";
            el.style.marginTop = "-6px";  // Pull up into previous widget space

            // Background and text color
            el.style.backgroundColor = "#00000033";
            el.style.color = "rgba(255, 255, 255, 0.85)";

            // Placeholder text
            el.placeholder = "prompt text...";

            // Dynamic styling based on state
            const updateStyle = () => {
                const hasText = el.value.trim().length > 0;
                const isFocused = document.activeElement === el;

                if (hasText || isFocused) {
                    el.style.opacity = 1;
                    el.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
                    el.style.fontStyle = "normal";
                } else {
                    el.style.opacity = 1;
                    el.style.backgroundColor = "#00000033";
                    el.style.fontStyle = "italic";
                }
            };

            updateStyle();
            el.addEventListener("focus", updateStyle);
            el.addEventListener("blur", updateStyle);
            el.addEventListener("input", updateStyle);
        } else {
            // Widget not ready, retry
            requestAnimationFrame(setupTextWidget);
        }
    };
    requestAnimationFrame(setupTextWidget);
}
```

---

## Custom Widgets from Scratch

Create entirely custom widgets with full control:

```javascript
const customWidget = {
    name: "menubar",
    type: "custom",
    value: null,
    options: { serialize: false },
    serializeValue: () => undefined,  // Don't save to workflow

    computeSize: function() {
        return [node.size[0], 16];  // [width, height]
    },

    draw: function(ctx, node, width, y, height) {
        const H = 16;

        // Draw a label
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Preview", 12, y + H / 2);

        // Draw a checkbox
        const checkboxSize = 10;
        const checkboxX = width - 20;
        const checkboxY = y + (H - checkboxSize) / 2;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(checkboxX, checkboxY, checkboxSize, checkboxSize);

        if (node._showPreview) {
            ctx.fillStyle = "#4a9eff";  // Blue fill when checked
            ctx.fillRect(checkboxX + 2, checkboxY + 2, checkboxSize - 4, checkboxSize - 4);
        }

        return H;
    },

    // Handle mouse events
    mouse: function(event, pos, node) {
        if (event.type === "pointerdown") {
            // Check if click is in checkbox area
            if (pos[0] >= node.size[0] - 50) {
                node._showPreview = !node._showPreview;
                return true;  // Consume event
            }
        }
        return false;
    }
};

// Add to node's widgets array
node.widgets.push(customWidget);
// Or insert at specific position:
node.widgets.splice(insertIndex, 0, customWidget);
```

---

## Injecting Global CSS

For styling that can't be done inline (like `::-webkit-scrollbar`):

```javascript
const styleId = "my-custom-style";
if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
        /* Placeholder text color */
        .my-textarea::placeholder {
            color: rgba(255, 255, 255, 0.5);
            opacity: 1;
        }

        /* Focus state */
        .my-textarea:focus {
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important;
            outline: none !important;
        }

        /* Custom scrollbar */
        .my-textarea::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        .my-textarea::-webkit-scrollbar-track {
            background: transparent;
        }
        .my-textarea::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.35);
            border-radius: 4px;
        }
        .my-textarea::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5);
        }
    `;
    document.head.appendChild(style);
}

// Add class to element
textWidget.inputEl.classList.add("my-textarea");
```

---

## Color Reference

### Standard Colors Used

| Element | Color | Opacity |
|---------|-------|---------|
| Active text / labels | `rgba(255, 255, 255, 0.7)` | 70% |
| Inactive text | `rgba(255, 255, 255, 0.35)` | 35% |
| Arrow indicators | `rgba(255, 255, 255, 0.5)` | 50% |
| Text in inputs | `rgba(255, 255, 255, 0.85)` | 85% |
| Widget background | `rgba(0, 0, 0, 0.3)` | 30% |
| Widget border | `rgba(255, 255, 255, 0.2)` | 20% |
| Input background (empty) | `#00000033` | 20% |
| Input background (focus) | `rgba(0, 0, 0, 0.5)` | 50% |
| Checkbox fill | `#4a9eff` | 100% |

### Why These Colors?

- **70% white** for active elements provides good contrast without being harsh
- **30% black backgrounds** let the node's color show through
- **20% white borders** add subtle definition without distraction
- **Semi-transparent everything** maintains the cohesive node coloring system

---

## Canvas Drawing Reference

### Common Patterns

```javascript
// Rounded rectangle
ctx.beginPath();
ctx.roundRect(x, y, width, height, borderRadius);
ctx.fill();
ctx.stroke();

// Text with proper alignment
ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
ctx.font = "12px Arial";
ctx.textAlign = "center";  // "left", "center", "right"
ctx.textBaseline = "middle";  // "top", "middle", "bottom"
ctx.fillText("text", x, y);

// Reset context state (important when chaining)
ctx.textAlign = "left";
ctx.textBaseline = "alphabetic";
```

### Getting Positions

```javascript
// Slot positions (absolute coordinates)
const inputPos = node.getConnectionPos(true, slotIndex);   // Input slot
const outputPos = node.getConnectionPos(false, slotIndex); // Output slot

// Convert to relative (for drawing)
const relativeX = inputPos[0] - node.pos[0];
const relativeY = inputPos[1] - node.pos[1];
```

---

## Debugging Tips

1. **Use solid red** to verify drawing is working:
   ```javascript
   ctx.fillStyle = "red";  // Highly visible for testing
   ```

2. **Check console** for errors - broken draw functions fail silently

3. **Refresh ComfyUI** after changes - some modifications require full reload

4. **Test with node colors** - ensure your styling works with different node background colors

5. **Check collapsed state** - always guard with `if (this.flags?.collapsed) return;`

---

## Widget Margin Spacing

### Recommendation: Work With the System

**Leave ComfyUI's default margins alone unless you're adding to them.** The default 4px spacing between canvas widgets and 10px margin for DOM widgets exist for good reasons. Negative margins to reduce spacing will inevitably collide with other elements that have complex paint/render logic.

Instead of fighting the layout system:
- Use positive margins (extra spacing) when needed
- Accept the default gaps - they look natural
- Only use hidden widgets with `-4` for truly invisible data-only widgets

### Default Margins

| Widget Type | Default Margin |
|-------------|----------------|
| Canvas widgets | 4px between widgets |
| DOM widgets (textareas) | 10px uniform margin |

### Adding Extra Spacing (Positive Margin)

To add more spacing above a widget, return a larger height from `computeSize` and draw your content at the bottom of the allocated space:

```javascript
const myWidget = {
    name: "my_label",
    type: "custom",
    computeSize: function(width) {
        const marginTop = 16;  // Extra 16px above
        return [width, 18 + marginTop];  // Returns 34px total
    },
    draw: function(ctx, n, width, y, height) {
        const marginTop = 16;
        const labelHeight = 18;

        // Draw content at bottom of widget area (leaving top empty)
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("My Label", 8, y + marginTop + 3);

        return labelHeight + marginTop;
    }
};
```

### Hidden Widgets (Data-Only)

For widgets that should serialize data but take no visual space, use `-4` to counteract the default inter-widget spacing. This is the **only** recommended use of negative margins:

```javascript
const hiddenWidget = {
    name: "cached_value",
    type: "hidden",
    value: "",
    options: { serialize: true },
    serializeValue: () => node.properties?.cachedValue || "",
    computeSize: () => [0, -4],  // Cancels 4px gap, takes no space
};
```

### DOM Widget Margin (Textareas)

DOM widgets use `widget.options.margin` for uniform spacing (all sides). The default is 10px.

```javascript
const textWidget = node.widgets?.find(w => w.name === "text");
if (textWidget?.inputEl && textWidget.options) {
    textWidget.options.margin = 10;  // Default, leave it alone
}
```

**Note:** Asymmetric margins (different top/bottom/left/right) are not supported for DOM widgets - ComfyUI calculates their position programmatically and CSS margin overrides will break node resizing.

---

## File Structure

```
custom_nodes/
└── ComfyUI-PromptChain/
    ├── __init__.py          # Python node registration
    ├── prompt_chain.py      # Python node logic
    └── web/
        └── js/
            └── promptchain.js  # All UI customizations
```

The `web/js/` directory is automatically loaded by ComfyUI for frontend extensions.
