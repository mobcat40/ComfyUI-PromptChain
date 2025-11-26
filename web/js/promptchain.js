import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

// Dynamic input management for PromptChainDynamic
app.registerExtension({
	name: "mobcat40.PromptChain.DynamicInputs",
	async nodeCreated(node) {
		if (node.constructor.comfyClass !== "PromptChain") {
			return;
		}

		// Set default size [width, height]
		node.size = [210, 146];

		// Make text widget transparent until focused (only if empty)
		// Use setTimeout to wait for widget DOM element to be created
		const setupTextOpacity = () => {
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (textWidget?.inputEl) {
				const updateStyle = () => {
					const hasText = textWidget.inputEl.value.trim().length > 0;
					textWidget.inputEl.style.opacity = hasText ? 1.0 : 0.6;
					textWidget.inputEl.style.fontStyle = hasText ? "normal" : "italic";
				};
				updateStyle();
				textWidget.inputEl.style.marginTop = "-6px"; // Pull text closer to menubar
				textWidget.inputEl.style.fontFamily = "Arial, sans-serif";
				textWidget.inputEl.style.fontSize = "11px";
				textWidget.inputEl.style.padding = "4px";
				textWidget.inputEl.style.lineHeight = "1.3";
				textWidget.inputEl.style.borderRadius = "4px";
				textWidget.inputEl.addEventListener("focus", () => {
					textWidget.inputEl.style.opacity = 1.0;
					textWidget.inputEl.style.fontStyle = "normal";
				});
				textWidget.inputEl.addEventListener("blur", updateStyle);
				textWidget.inputEl.addEventListener("input", updateStyle);
			} else {
				// Widget not ready yet, try again
				requestAnimationFrame(setupTextOpacity);
			}
		};
		requestAnimationFrame(setupTextOpacity);

		const updateInputs = () => {
			// Find all input_N slots
			const inputSlots = node.inputs.filter(i => i.name.startsWith("input_"));

			// Add new input when last one is connected
			const lastInput = inputSlots[inputSlots.length - 1];
			if (lastInput && lastInput.link !== null) {
				const nextIndex = parseInt(lastInput.name.split("_")[1]) + 1;
				node.addInput(`input_${nextIndex}`, "STRING");
			}

			// Remove empty trailing slots (keep at least one)
			if (inputSlots.length > 1) {
				const lastSlot = inputSlots[inputSlots.length - 1];
				const secondLastSlot = inputSlots[inputSlots.length - 2];
				if (lastSlot.link === null && secondLastSlot.link === null) {
					node.removeInput(node.inputs.indexOf(lastSlot));
				}
			}
		};

		const originalOnConnectionsChange = node.onConnectionsChange;
		node.onConnectionsChange = function(type, index, connected, link_info) {
			originalOnConnectionsChange?.apply(this, arguments);
			updateInputs();
		};

		// Initial setup
		updateInputs();
	}
});

// Display output text on PromptChain nodes after execution
app.registerExtension({
	name: "mobcat40.PromptChain.Preview",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "PromptChain") {
			// When the node is executed, store the output text
			const onExecuted = nodeType.prototype.onExecuted;
			nodeType.prototype.onExecuted = function (message) {
				if (message?.text) {
					// Get the text value (handle array format)
					let textValue = message.text;
					if (Array.isArray(textValue)) {
						textValue = textValue.flat().join("");
					}
					// Store for preview display
					this._outputText = textValue;
					// Update preview widget if visible
					const previewWidget = this.widgets?.find(w => w.name === "output_preview");
					if (previewWidget) {
						previewWidget.value = textValue;
					}
				}
				onExecuted?.apply(this, arguments);
			};
		}
	},
	async nodeCreated(node) {
		if (node.constructor.comfyClass !== "PromptChain") {
			return;
		}

		// Track preview state (restore from properties if saved)
		node._showPreview = node.properties?.showPreview || false;

		// Save text value to properties whenever it changes (for reliable persistence)
		const setupTextPersistence = () => {
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (textWidget?.inputEl) {
				textWidget.inputEl.addEventListener("input", () => {
					if (!node.properties) node.properties = {};
					node.properties.textValue = textWidget.inputEl.value;
				});
				textWidget.inputEl.addEventListener("change", () => {
					if (!node.properties) node.properties = {};
					node.properties.textValue = textWidget.inputEl.value;
				});
			} else {
				requestAnimationFrame(setupTextPersistence);
			}
		};
		requestAnimationFrame(setupTextPersistence);

		// Toggle preview function
		const togglePreview = () => {
			node._showPreview = !node._showPreview;
			// Save state to properties for persistence
			if (!node.properties) node.properties = {};
			node.properties.showPreview = node._showPreview;

			if (!node._showPreview) {
				// Remove output label widget
				const labelIndex = node.widgets.findIndex(w => w.name === "output_label");
				if (labelIndex > -1) {
					node.widgets.splice(labelIndex, 1);
				}

				// Remove preview widget
				const previewWidget = node.widgets.find(w => w.name === "output_preview");
				if (previewWidget) {
					const index = node.widgets.indexOf(previewWidget);
					if (index > -1) {
						const inputEl = previewWidget.inputEl;
						const parentEl = inputEl?.parentElement;
						if (previewWidget.onRemoved) previewWidget.onRemoved();
						if (parentEl) parentEl.remove();
						else if (inputEl) inputEl.remove();
						node.widgets.splice(index, 1);
					}
				}
			} else {
				// Add "Output" label widget
				const outputLabel = {
					name: "output_label",
					type: "custom",
					value: null,
					options: { serialize: false },
					serializeValue: () => undefined, // Skip serialization
					computeSize: function() {
						return [node.size[0], 0]; // Zero height - we draw into space above
					},
					draw: function(ctx, node, width, y, height) {
						const H = 16;
						const topOffset = -10; // Draw into the gap above
						ctx.fillStyle = "#aaa";
						ctx.font = "11px Arial";
						ctx.textAlign = "left";
						ctx.textBaseline = "middle";
						ctx.fillText("Output", 12, y + topOffset + H / 2);
						return H;
					}
				};

				// Add preview widget after text widget
				const w = ComfyWidgets["STRING"](node, "output_preview", ["STRING", { multiline: true }], app).widget;
				w.options = w.options || {};
				w.options.serialize = false;
				w.serializeValue = () => undefined; // Skip serialization
				w.inputEl.readOnly = true;
				w.inputEl.style.opacity = 0.6;
				w.inputEl.style.fontStyle = "italic";
				w.inputEl.style.marginTop = "-6px"; // Pull text closer to output label
				w.inputEl.style.fontFamily = "Arial, sans-serif";
				w.inputEl.style.fontSize = "11px";
				w.inputEl.style.padding = "4px";
				w.inputEl.style.lineHeight = "1.3";
				w.inputEl.style.borderRadius = "4px";
				w.inputEl.placeholder = "waiting for generation...";
				w.value = node._outputText || "";

				// Move output label and preview widget to be right after the text widget
				const textIndex = node.widgets.findIndex(w => w.name === "text");
				const labelIndex = node.widgets.findIndex(w => w.name === "output_label");
				const previewWidget = node.widgets.find(w => w.name === "output_preview");
				const previewIndex = node.widgets.indexOf(previewWidget);

				// Insert label after text, then preview after label
				if (textIndex > -1) {
					// Remove widgets from current positions
					if (previewIndex > -1) node.widgets.splice(previewIndex, 1);
					if (labelIndex > -1) node.widgets.splice(node.widgets.findIndex(w => w.name === "output_label"), 1);

					// Insert in correct order after text widget
					const newTextIndex = node.widgets.findIndex(w => w.name === "text");
					node.widgets.splice(newTextIndex + 1, 0, outputLabel);
					node.widgets.splice(newTextIndex + 2, 0, previewWidget);
				}
			}
			node.setSize(node.computeSize());
			app.graph.setDirtyCanvas(true);
		};

		// Create custom menubar widget
		const menubar = {
			name: "menubar",
			type: "custom",
			value: null,
			options: { serialize: false },
			serializeValue: () => undefined, // Skip serialization
			computeSize: function() {
				return [node.size[0], 16];
			},
			draw: function(ctx, node, width, y, height) {
				const H = 16;
				const topOffset = 4; // Push content down to add space after mode dropdown

				// "Prompt" label on the left
				ctx.fillStyle = "#aaa";
				ctx.font = "11px Arial";
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText("Prompt", 12, y + topOffset + H / 2);

				// Preview checkbox on the right
				const checkboxSize = 10;
				const checkboxX = width - 13 - checkboxSize; // 5px extra margin from right edge
				const checkboxY = y + topOffset + (H - checkboxSize) / 2;

				ctx.strokeStyle = node._showPreview ? "#ccc" : "#777";
				ctx.lineWidth = 1;
				ctx.strokeRect(checkboxX, checkboxY, checkboxSize, checkboxSize);

				if (node._showPreview) {
					ctx.fillStyle = "#4a9eff";
					ctx.fillRect(checkboxX + 2, checkboxY + 2, checkboxSize - 4, checkboxSize - 4);
				}

				// "Preview" label before checkbox (brighter when active)
				ctx.fillStyle = node._showPreview ? "#ccc" : "#777";
				ctx.font = "11px Arial";
				ctx.textAlign = "right";
				ctx.fillText("Preview", checkboxX - 4, y + topOffset + H / 2);

				return H;
			},
			mouse: function(event, pos, node) {
				if (event.type === "pointerdown") {
					// Check if click is on preview checkbox area (right side)
					const checkboxSize = 10;
					const checkboxX = node.size[0] - 13 - checkboxSize; // 5px extra margin from right edge
					if (pos[0] >= checkboxX - 50 && pos[0] <= node.size[0] - 4) {
						togglePreview();
						return true;
					}
				}
				return false;
			}
		};

		// Insert menubar after mode widget visually, but we need to handle serialization carefully
		const modeIndex = node.widgets.findIndex(w => w.name === "mode");
		if (modeIndex > -1) {
			node.widgets.splice(modeIndex + 1, 0, menubar);
		} else {
			node.widgets.push(menubar);
		}

		// Override onConfigure to restore widget values and preview state after node is loaded
		const originalOnConfigure = node.onConfigure;
		node.onConfigure = function(info) {
			originalOnConfigure?.apply(this, arguments);

			// Restore text value from properties (most reliable method)
			if (info.properties?.textValue !== undefined) {
				const textWidget = node.widgets.find(w => w.name === "text");
				if (textWidget) {
					textWidget.value = info.properties.textValue;
					if (textWidget.inputEl) {
						textWidget.inputEl.value = info.properties.textValue;
					}
				}
			}

			// Restore preview state from saved properties
			if (info.properties?.showPreview && !node._showPreview) {
				node._showPreview = false;
				togglePreview();
			}
		};
	}
});
