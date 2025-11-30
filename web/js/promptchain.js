import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

// Dynamic input management for PromptChainDynamic
app.registerExtension({
	name: "mobcat40.PromptChain.DynamicInputs",
	async nodeCreated(node) {
		if (node.constructor.comfyClass !== "PromptChain") {
			return;
		}

		// Force default size for new nodes after widgets are set up
		// Mark as new node - onConfigure will clear this flag for loaded nodes
		node._isNewlyCreated = true;
		requestAnimationFrame(() => {
			// Only apply default size if still marked as new (not loaded from workflow)
			if (node._isNewlyCreated) {
				node.size = [210, 180];
				node.setDirtyCanvas(true);
			}
		});

		// Style the text widget
		// Use setTimeout to wait for widget DOM element to be created
		const setupTextStyle = () => {
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (textWidget?.inputEl) {
				// Apply consistent styling - no fading based on content
				textWidget.inputEl.style.opacity = 1;
				textWidget.inputEl.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
				textWidget.inputEl.style.marginTop = "0px"; // No gap - cap connects directly
				textWidget.inputEl.style.fontFamily = "Arial, sans-serif";
				textWidget.inputEl.style.fontSize = "11px";
				textWidget.inputEl.style.padding = "4px 6px";
				textWidget.inputEl.style.lineHeight = "1.3";
				textWidget.inputEl.style.borderRadius = "0 0 4px 4px"; // Only bottom corners rounded
				textWidget.inputEl.placeholder = "enter text...";
				// Style placeholder text and scrollbars
				const styleId = "promptchain-prompt-placeholder-style";
				if (!document.getElementById(styleId)) {
					const style = document.createElement("style");
					style.id = styleId;
					style.textContent = `
						.promptchain-prompt::placeholder { color: rgba(255, 255, 255, 0.5); opacity: 1; }
						.promptchain-prompt:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4) !important; }
						.promptchain-prompt:focus { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important; outline: none !important; }
						.promptchain-prompt::-webkit-scrollbar { width: 8px; height: 8px; }
						.promptchain-prompt::-webkit-scrollbar-track { background: transparent; }
						.promptchain-prompt::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 4px; }
						.promptchain-prompt::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
						.promptchain-prompt::-webkit-scrollbar-corner { background: transparent; }
						.promptchain-prompt-neg::placeholder { color: rgba(255, 180, 180, 0.5); opacity: 1; }
						.promptchain-prompt-neg:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4) !important; }
						.promptchain-prompt-neg:focus { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important; outline: none !important; }
						.promptchain-prompt-neg::-webkit-scrollbar { width: 8px; height: 8px; }
						.promptchain-prompt-neg::-webkit-scrollbar-track { background: transparent; }
						.promptchain-prompt-neg::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 4px; }
						.promptchain-prompt-neg::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
						.promptchain-prompt-neg::-webkit-scrollbar-corner { background: transparent; }
					`;
					document.head.appendChild(style);
				}
				textWidget.inputEl.classList.add("promptchain-prompt");
			} else {
				// Widget not ready yet, try again
				requestAnimationFrame(setupTextStyle);
			}
		};
		requestAnimationFrame(setupTextStyle);

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

		// Set empty labels on inputs and outputs to hide default text
		const hideDefaultLabels = () => {
			if (node.inputs) {
				for (const input of node.inputs) {
					if (input?.name?.startsWith("input_")) {
						input.label = " ";
					}
				}
			}
			if (node.outputs) {
				for (const output of node.outputs) {
					if (output?.name) {
						output.label = " ";
					}
				}
			}
		};
		hideDefaultLabels();

		// Also hide labels when inputs change
		const origOnConnectionsChange = node.onConnectionsChange;
		node.onConnectionsChange = function() {
			origOnConnectionsChange?.apply(this, arguments);
			setTimeout(hideDefaultLabels, 0);
		};
	}
});

// Display output text on PromptChain nodes after execution
app.registerExtension({
	name: "mobcat40.PromptChain.Preview",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "PromptChain") {
			// Draw yellow filter + diagonal stripes for locked nodes
			const originalOnDrawBackground = nodeType.prototype.onDrawBackground;
			nodeType.prototype.onDrawBackground = function(ctx) {
				originalOnDrawBackground?.apply(this, arguments);

				if (this._isLocked && !this.flags?.collapsed) {
					const stripeWidth = 6;
					const stripeGap = 18;
					const [w, h] = this.size;

					ctx.save();

					// Clip to node body bounds with rounded corners
					const radius = 8;
					ctx.beginPath();
					ctx.roundRect(0, 0, w, h, [0, 0, radius, radius]);
					ctx.clip();

					// Yellow filter overlay
					ctx.globalAlpha = 1.0;
					ctx.fillStyle = "#9e6e19";
					ctx.fillRect(0, 0, w, h);

					// Draw diagonal stripes
					ctx.globalAlpha = 0.04;
					ctx.fillStyle = "#000000";

					const total = w + h + stripeGap;
					for (let x = -h - stripeGap; x < total; x += stripeGap) {
						ctx.beginPath();
						ctx.moveTo(x, h);
						ctx.lineTo(x + stripeWidth, h);
						ctx.lineTo(x + h + stripeWidth, 0);
						ctx.lineTo(x + h, 0);
						ctx.closePath();
						ctx.fill();
					}

					ctx.restore();
				}

				// Draw red darkened overlay for disabled nodes
				if (this._isDisabled && !this.flags?.collapsed) {
					const stripeWidth = 6;
					const stripeGap = 18;
					const [w, h] = this.size;

					ctx.save();

					// Clip to node body bounds with rounded corners
					const radius = 8;
					ctx.beginPath();
					ctx.roundRect(0, 0, w, h, [0, 0, radius, radius]);
					ctx.clip();

					// Red darkened filter overlay
					ctx.globalAlpha = 1.0;
					ctx.fillStyle = "#4a1a1a";
					ctx.fillRect(0, 0, w, h);

					// Draw diagonal stripes (opposite direction from lock)
					ctx.globalAlpha = 0.06;
					ctx.fillStyle = "#000000";

					const total = w + h + stripeGap;
					for (let x = -h - stripeGap; x < total; x += stripeGap) {
						ctx.beginPath();
						ctx.moveTo(x, 0);
						ctx.lineTo(x + stripeWidth, 0);
						ctx.lineTo(x + h + stripeWidth, h);
						ctx.lineTo(x + h, h);
						ctx.closePath();
						ctx.fill();
					}

					ctx.restore();
				}
			};

			// Draw our custom input labels (default labels hidden via input.label = " " in nodeCreated)
			const originalOnDrawForeground = nodeType.prototype.onDrawForeground;
			nodeType.prototype.onDrawForeground = function(ctx) {
				originalOnDrawForeground?.apply(this, arguments);

				if (this.flags?.collapsed || !this.inputs) return;

				// Draw custom input labels
				for (let i = 0; i < this.inputs.length; i++) {
					const input = this.inputs[i];

					if (input?.name?.startsWith("input_")) {
						// Get actual slot position using LiteGraph method
						const pos = this.getConnectionPos?.(true, i) || [0, 0];
						const x = (pos[0] - this.pos[0] + 14 + 14) / 2;  // Split the difference
						const y = pos[1] - this.pos[1];

						// Determine label text based on connection
						const inputIndex = input.name.split("_").pop();
						let labelText = `input: ${inputIndex}`;

						if (input.link !== null) {
							const linkInfo = app.graph.links[input.link];
							if (linkInfo) {
								const sourceNode = app.graph.getNodeById(linkInfo.origin_id);
								if (sourceNode) {
									// Use source node's title if it's not a PromptChain or has a custom title
									const isPromptChain = sourceNode.constructor?.comfyClass === "PromptChain";
									const hasCustomTitle = sourceNode.title && sourceNode.title !== "PromptChain";
									if (!isPromptChain || hasCustomTitle) {
										labelText = `input: ${sourceNode.title || sourceNode.type}`;
									}
								}
							}
						}

						// Draw label
						ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
						ctx.font = "12px Arial";
						ctx.textAlign = "left";
						ctx.fillText(labelText, x, y + 4);
					}
				}

				// Draw custom output labels
				if (this.outputs) {
					for (let i = 0; i < this.outputs.length; i++) {
						const output = this.outputs[i];
						if (output?.name) {
							// Get actual slot position using LiteGraph method (false = output)
							const pos = this.getConnectionPos?.(false, i) || [0, 0];
							const x = pos[0] - this.pos[0] - 10;  // Offset from slot circle (right side)
							const y = pos[1] - this.pos[1];

							// Draw label with custom color (same as active Preview label)
							ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
							ctx.font = "12px Arial";
							ctx.textAlign = "right";
							ctx.fillText(output.name, x, y + 4);
						}
					}
				}
			};

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
					this._outputTimestamp = Date.now();
					this._cachedTimeAgo = "Just Now"; // Immediate update
					// Persist to properties for workflow save/load
					if (!this.properties) this.properties = {};
					this.properties.outputText = textValue;
					this.properties.outputTimestamp = this._outputTimestamp;
					// Update preview widget if visible
					const previewWidget = this.widgets?.find(w => w.name === "output_preview");
					if (previewWidget) {
						previewWidget.value = textValue;
						if (previewWidget.inputEl) {
							previewWidget.inputEl.value = textValue;
						}
					}
				}
				// Handle negative output
				if (message?.neg_text) {
					let negValue = message.neg_text;
					if (Array.isArray(negValue)) {
						negValue = negValue.flat().join("");
					}
					this._negOutputText = negValue;
					if (!this.properties) this.properties = {};
					this.properties.negOutputText = negValue;
					// Update neg preview widget if visible
					const negPreviewWidget = this.widgets?.find(w => w.name === "neg_output_preview");
					if (negPreviewWidget) {
						negPreviewWidget.value = negValue;
						if (negPreviewWidget.inputEl) {
							negPreviewWidget.inputEl.value = negValue;
						}
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

		// Track which prompts to show (independent checkboxes)
		node._showPositive = node.properties?.showPositive !== false;  // default: show positive
		node._showNegative = node.properties?.showNegative || false;   // default: hide negative

		// Track disabled state (default: false = enabled)
		node._isDisabled = node.properties?.isDisabled || false;

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

		// Setup neg_text widget styling and persistence
		const setupNegTextWidget = () => {
			const negTextWidget = node.widgets?.find(w => w.name === "neg_text");
			if (negTextWidget?.inputEl) {
				// Style the neg_text widget
				negTextWidget.inputEl.style.marginTop = "0px"; // No gap - cap connects directly
				negTextWidget.inputEl.style.fontFamily = "Arial, sans-serif";
				negTextWidget.inputEl.style.fontSize = "11px";
				negTextWidget.inputEl.style.padding = "4px 6px";
				negTextWidget.inputEl.style.lineHeight = "1.3";
				negTextWidget.inputEl.style.borderRadius = "0 0 4px 4px"; // Only bottom corners rounded
				negTextWidget.inputEl.style.backgroundColor = "rgba(40, 0, 0, 0.5)";  // Subtle red tint
				negTextWidget.inputEl.style.color = "";  // Default white text like positive
				negTextWidget.inputEl.placeholder = "enter text...";
				negTextWidget.inputEl.classList.add("promptchain-prompt-neg");

				// Save value to properties
				negTextWidget.inputEl.addEventListener("input", () => {
					if (!node.properties) node.properties = {};
					node.properties.negTextValue = negTextWidget.inputEl.value;
				});
				negTextWidget.inputEl.addEventListener("change", () => {
					if (!node.properties) node.properties = {};
					node.properties.negTextValue = negTextWidget.inputEl.value;
				});

				// Move neg_text widget to be right after text widget
				const negIndex = node.widgets.indexOf(negTextWidget);
				const textIndex = node.widgets.findIndex(w => w.name === "text");
				if (negIndex > -1 && textIndex > -1 && negIndex !== textIndex + 1) {
					node.widgets.splice(negIndex, 1);
					// Recalculate text index after removal
					const newTextIndex = node.widgets.findIndex(w => w.name === "text");
					node.widgets.splice(newTextIndex + 1, 0, negTextWidget);
				}

				// Initialize negative visibility based on _showNegative state
				// By default hide negative (neg_text)
				if (!node._showNegative) {
					negTextWidget.type = "hidden";
					negTextWidget.inputEl.style.display = "none";
				}
			} else {
				requestAnimationFrame(setupNegTextWidget);
			}
		};
		requestAnimationFrame(setupNegTextWidget);

		// Toggle preview function
		// skipResize: when restoring from saved workflow, don't reset node size
		const togglePreview = (skipResize = false) => {
			node._showPreview = !node._showPreview;
			// Save state to properties for persistence
			if (!node.properties) node.properties = {};
			node.properties.showPreview = node._showPreview;

			if (!node._showPreview) {
				// Remove all preview-related widgets
				const widgetsToRemove = ["output_label", "preview_pos_cap", "output_preview", "preview_neg_cap", "neg_output_preview"];
				widgetsToRemove.forEach(name => {
					const widget = node.widgets.find(w => w.name === name);
					if (widget) {
						const index = node.widgets.indexOf(widget);
						if (index > -1) {
							if (widget.inputEl) {
								const parentEl = widget.inputEl.parentElement;
								if (widget.onRemoved) widget.onRemoved();
								if (parentEl) parentEl.remove();
								else widget.inputEl.remove();
							} else if (widget.onRemoved) {
								widget.onRemoved();
							}
							node.widgets.splice(index, 1);
						}
					}
				});
			} else {
				// Helper to format time ago
				const formatTimeAgo = (timestamp) => {
					if (!timestamp) return "";
					const seconds = Math.floor((Date.now() - timestamp) / 1000);
					if (seconds < 60) return "Just Now";
					const minutes = Math.floor(seconds / 60);
					if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
					const hours = Math.floor(minutes / 60);
					if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
					const days = Math.floor(hours / 24);
					if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
					const months = Math.floor(days / 30);
					if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
					const years = Math.floor(months / 12);
					return `${years} year${years > 1 ? 's' : ''} ago`;
				};

				// Update cached time ago string (called on load and every 10s)
				const updateTimeAgoCache = () => {
					node._cachedTimeAgo = formatTimeAgo(node._outputTimestamp);
				};
				updateTimeAgoCache(); // Initial calculation
				const timeAgoInterval = setInterval(updateTimeAgoCache, 10000);

				// Add "Last run" label widget
				const outputLabel = {
					name: "output_label",
					type: "custom",
					value: null,
					options: { serialize: false },
					serializeValue: () => undefined,
					computeSize: function() {
						return [node.size[0], 20];
					},
					draw: function(ctx, _, width, y) {
						const H = 20;
						ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
						ctx.font = "12px Arial";
						ctx.textAlign = "left";
						ctx.textBaseline = "middle";
						if (node._cachedTimeAgo) {
							ctx.fillText(`Last run: ${node._cachedTimeAgo}`, 12, y + H / 2);
						}
						return H;
					},
					onRemoved: function() {
						clearInterval(timeAgoInterval);
					}
				};

				// Create "Prompt" cap for positive preview (same style as positive_cap)
				const previewPosCap = {
					name: "preview_pos_cap",
					type: "custom",
					value: null,
					options: { serialize: false },
					serializeValue: () => undefined,
					computeSize: function() {
						return [node.size[0], 4];
					},
					draw: function(ctx, _, width, y) {
						const H = 18;
						const previewWidget = node.widgets?.find(w => w.name === "output_preview");
						let margin = 15;
						let w = width - margin * 2;
						if (previewWidget?.inputEl) {
							const boxWidth = previewWidget.inputEl.offsetWidth;
							// Only use textbox width if it's valid (between reasonable bounds)
							if (boxWidth > 50 && boxWidth < width) {
								margin = (width - boxWidth) / 2;
								w = boxWidth;
							}
						}
						ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
						ctx.beginPath();
						ctx.roundRect(margin, y, w, H, [4, 4, 0, 0]);
						ctx.fill();
						ctx.fillStyle = "rgba(74, 158, 255, 0.9)";
						ctx.font = "bold 10px Arial";
						ctx.textAlign = "left";
						ctx.textBaseline = "middle";
						ctx.fillText("+ Output", margin + 6, y + H / 2 + 1);
						return 4;
					}
				};

				// Add positive preview widget
				const posPreview = ComfyWidgets["STRING"](node, "output_preview", ["STRING", { multiline: true }], app).widget;
				posPreview.options = posPreview.options || {};
				posPreview.options.serialize = false;
				posPreview.serializeValue = () => undefined;
				posPreview.inputEl.readOnly = true;
				posPreview.inputEl.style.opacity = 1;
				posPreview.inputEl.style.fontStyle = "italic";
				posPreview.inputEl.style.fontFamily = "Arial, sans-serif";
				posPreview.inputEl.style.fontSize = "11px";
				posPreview.inputEl.style.padding = "4px 6px";
				posPreview.inputEl.style.lineHeight = "1.3";
				posPreview.inputEl.style.borderRadius = "0 0 4px 4px";
				posPreview.inputEl.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
				posPreview.inputEl.style.color = "rgba(255, 255, 255, 0.85)";
				posPreview.inputEl.style.marginTop = "0px";
				posPreview.inputEl.placeholder = "awaiting generation...";
				// Style placeholder text
				const styleId = "promptchain-placeholder-style";
				if (!document.getElementById(styleId)) {
					const style = document.createElement("style");
					style.id = styleId;
					style.textContent = `
						.promptchain-preview::placeholder { color: rgba(255, 255, 255, 0.5); opacity: 1; }
						.promptchain-preview:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4) !important; }
						.promptchain-preview:focus { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important; outline: none !important; }
						.promptchain-preview::-webkit-scrollbar { width: 8px; height: 8px; }
						.promptchain-preview::-webkit-scrollbar-track { background: transparent; }
						.promptchain-preview::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 4px; }
						.promptchain-preview::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
						.promptchain-preview::-webkit-scrollbar-corner { background: transparent; }
						.promptchain-preview-neg::placeholder { color: rgba(255, 180, 180, 0.5); opacity: 1; }
						.promptchain-preview-neg:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4) !important; }
						.promptchain-preview-neg:focus { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important; outline: none !important; }
						.promptchain-preview-neg::-webkit-scrollbar { width: 8px; height: 8px; }
						.promptchain-preview-neg::-webkit-scrollbar-track { background: transparent; }
						.promptchain-preview-neg::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 4px; }
						.promptchain-preview-neg::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
						.promptchain-preview-neg::-webkit-scrollbar-corner { background: transparent; }
					`;
					document.head.appendChild(style);
				}
				posPreview.inputEl.classList.add("promptchain-preview");
				posPreview.value = node._outputText || "";
				posPreview.inputEl.value = node._outputText || "";

				// Create "Negative Prompt" cap for negative preview (same style as negative_cap)
				const previewNegCap = {
					name: "preview_neg_cap",
					type: "custom",
					value: null,
					options: { serialize: false },
					serializeValue: () => undefined,
					computeSize: function() {
						return [node.size[0], 4];
					},
					draw: function(ctx, _, width, y) {
						const H = 18;
						const negPreviewWidget = node.widgets?.find(w => w.name === "neg_output_preview");
						let margin = 15;
						let w = width - margin * 2;
						if (negPreviewWidget?.inputEl) {
							const boxWidth = negPreviewWidget.inputEl.offsetWidth;
							// Only use textbox width if it's valid (between reasonable bounds)
							if (boxWidth > 50 && boxWidth < width) {
								margin = (width - boxWidth) / 2;
								w = boxWidth;
							}
						}
						ctx.fillStyle = "rgba(40, 0, 0, 0.3)";  // Subtle red tint
						ctx.beginPath();
						ctx.roundRect(margin, y, w, H, [4, 4, 0, 0]);
						ctx.fill();
						ctx.fillStyle = "rgba(255, 107, 107, 0.9)";
						ctx.font = "bold 10px Arial";
						ctx.textAlign = "left";
						ctx.textBaseline = "middle";
						ctx.fillText("- Output", margin + 6, y + H / 2 + 1);
						return 4;
					}
				};

				// Add negative preview widget
				const negPreview = ComfyWidgets["STRING"](node, "neg_output_preview", ["STRING", { multiline: true }], app).widget;
				negPreview.options = negPreview.options || {};
				negPreview.options.serialize = false;
				negPreview.serializeValue = () => undefined;
				negPreview.inputEl.readOnly = true;
				negPreview.inputEl.style.opacity = 1;
				negPreview.inputEl.style.fontStyle = "italic";
				negPreview.inputEl.style.fontFamily = "Arial, sans-serif";
				negPreview.inputEl.style.fontSize = "11px";
				negPreview.inputEl.style.padding = "4px 6px";
				negPreview.inputEl.style.lineHeight = "1.3";
				negPreview.inputEl.style.borderRadius = "0 0 4px 4px";
				negPreview.inputEl.style.backgroundColor = "rgba(40, 0, 0, 0.5)";  // Subtle red tint
				negPreview.inputEl.style.color = "rgba(255, 255, 255, 0.85)";
				negPreview.inputEl.style.marginTop = "0px";
				negPreview.inputEl.placeholder = "awaiting generation...";
				negPreview.inputEl.classList.add("promptchain-preview-neg");
				negPreview.value = node._negOutputText || "";
				negPreview.inputEl.value = node._negOutputText || "";

				// Reorder widgets: move all preview widgets after neg_text
				const negTextIndex = node.widgets.findIndex(w => w.name === "neg_text");
				if (negTextIndex > -1) {
					// Remove preview widgets from current positions
					const widgetsToMove = ["output_label", "preview_pos_cap", "output_preview", "preview_neg_cap", "neg_output_preview"];
					widgetsToMove.forEach(name => {
						const idx = node.widgets.findIndex(w => w.name === name);
						if (idx > -1) node.widgets.splice(idx, 1);
					});

					// Insert in correct order after neg_text widget
					const newNegTextIndex = node.widgets.findIndex(w => w.name === "neg_text");
					node.widgets.splice(newNegTextIndex + 1, 0, outputLabel);
					node.widgets.splice(newNegTextIndex + 2, 0, previewPosCap);
					node.widgets.splice(newNegTextIndex + 3, 0, posPreview);
					node.widgets.splice(newNegTextIndex + 4, 0, previewNegCap);
					node.widgets.splice(newNegTextIndex + 5, 0, negPreview);
				}
			}
			app.graph.setDirtyCanvas(true);
		};

		// Toggle positive prompt visibility
		const togglePositive = () => {
			node._showPositive = !node._showPositive;
			if (!node.properties) node.properties = {};
			node.properties.showPositive = node._showPositive;

			const textWidget = node.widgets?.find(w => w.name === "text");
			if (textWidget) {
				if (node._showPositive) {
					textWidget.type = "customtext";
					if (textWidget.inputEl) textWidget.inputEl.style.display = "";
				} else {
					textWidget.type = "hidden";
					if (textWidget.inputEl) textWidget.inputEl.style.display = "none";
				}
			}
			app.graph.setDirtyCanvas(true);
		};

		// Toggle negative prompt visibility
		const toggleNegative = () => {
			node._showNegative = !node._showNegative;
			if (!node.properties) node.properties = {};
			node.properties.showNegative = node._showNegative;

			const negTextWidget = node.widgets?.find(w => w.name === "neg_text");
			if (negTextWidget) {
				if (node._showNegative) {
					negTextWidget.type = "customtext";
					if (negTextWidget.inputEl) negTextWidget.inputEl.style.display = "";
				} else {
					negTextWidget.type = "hidden";
					if (negTextWidget.inputEl) negTextWidget.inputEl.style.display = "none";
				}
			}
			app.graph.setDirtyCanvas(true);
		};

		// Initialize lock state
		node._isLocked = node.properties?.isLocked || false;

		// Helper to check if any upstream PromptChain node is locked
		const isLockedByUpstream = () => {
			const visited = new Set();
			const checkUpstream = (n) => {
				if (visited.has(n.id)) return false;
				visited.add(n.id);

				if (!n.inputs) return false;
				for (const input of n.inputs) {
					if (input.link !== null) {
						const linkInfo = app.graph.links[input.link];
						if (linkInfo) {
							const sourceNode = app.graph.getNodeById(linkInfo.origin_id);
							if (sourceNode?.constructor?.comfyClass === "PromptChain") {
								// Check if source is locked (either directly or by its upstream)
								if (sourceNode._isLocked) return true;
								if (checkUpstream(sourceNode)) return true;
							}
						}
					}
				}
				return false;
			};
			return checkUpstream(node);
		};

		// Add hidden widgets to pass lock state to Python
		const lockedWidget = {
			name: "locked",
			type: "hidden",
			value: false,
			options: { serialize: true },
			// Return true only if this node itself is locked
			serializeValue: () => node._isLocked,
			computeSize: () => [0, 0],
		};
		const cachedOutputWidget = {
			name: "cached_output",
			type: "hidden",
			value: "",
			options: { serialize: true },
			serializeValue: () => node.properties?.cachedOutput || "",
			computeSize: () => [0, 0],
		};
		const cachedNegOutputWidget = {
			name: "cached_neg_output",
			type: "hidden",
			value: "",
			options: { serialize: true },
			serializeValue: () => node.properties?.cachedNegOutput || "",
			computeSize: () => [0, 0],
		};
		const disabledWidget = {
			name: "disabled",
			type: "hidden",
			value: false,
			options: { serialize: true },
			serializeValue: () => node._isDisabled,
			computeSize: () => [0, 0],
		};
		node.widgets.push(lockedWidget);
		node.widgets.push(cachedOutputWidget);
		node.widgets.push(cachedNegOutputWidget);
		node.widgets.push(disabledWidget);

		// Helper to cache output on all downstream PromptChain nodes
		const cacheDownstreamNodes = (startNode) => {
			const visited = new Set();
			const cacheDownstream = (n) => {
				if (visited.has(n.id)) return;
				visited.add(n.id);

				// Find all nodes connected to this node's output
				if (!n.outputs) return;
				for (const output of n.outputs) {
					if (output.links) {
						for (const linkId of output.links) {
							const linkInfo = app.graph.links[linkId];
							if (linkInfo) {
								const targetNode = app.graph.getNodeById(linkInfo.target_id);
								if (targetNode?.constructor?.comfyClass === "PromptChain") {
									// Cache this downstream node's output
									if (targetNode._outputText) {
										if (!targetNode.properties) targetNode.properties = {};
										targetNode.properties.cachedOutput = targetNode._outputText;
									}
									// Continue downstream
									cacheDownstream(targetNode);
								}
							}
						}
					}
				}
			};
			cacheDownstream(startNode);
		};

		// Helper to get all input nodes (nodes that feed INTO this node)
		const getInputNodes = (n, visited = new Set()) => {
			const inputNodes = [];
			if (visited.has(n.id)) return inputNodes;
			visited.add(n.id);

			if (!n.inputs) return inputNodes;
			for (const input of n.inputs) {
				if (input.link !== null) {
					const linkInfo = app.graph.links[input.link];
					if (linkInfo) {
						const sourceNode = app.graph.getNodeById(linkInfo.origin_id);
						if (sourceNode?.constructor?.comfyClass === "PromptChain") {
							inputNodes.push(sourceNode);
							// Recursively get inputs of this input
							inputNodes.push(...getInputNodes(sourceNode, visited));
						}
					}
				}
			}
			return inputNodes;
		};

		// Toggle lock function - locks this node AND all its input nodes
		const toggleLock = () => {
			const newLockState = !node._isLocked;

			// Get all input nodes (nodes feeding into this one)
			const inputNodes = getInputNodes(node);

			// Lock/unlock this node
			node._isLocked = newLockState;
			if (!node.properties) node.properties = {};
			node.properties.isLocked = newLockState;
			if (newLockState && node._outputText) {
				node.properties.cachedOutput = node._outputText;
			}

			// Lock/unlock all input nodes too
			for (const inputNode of inputNodes) {
				inputNode._isLocked = newLockState;
				if (!inputNode.properties) inputNode.properties = {};
				inputNode.properties.isLocked = newLockState;
				if (newLockState && inputNode._outputText) {
					inputNode.properties.cachedOutput = inputNode._outputText;
				}
				// Update their hidden widgets
				const inputLockedWidget = inputNode.widgets?.find(w => w.name === "locked");
				const inputCachedWidget = inputNode.widgets?.find(w => w.name === "cached_output");
				if (inputLockedWidget) inputLockedWidget.value = newLockState;
				if (inputCachedWidget) inputCachedWidget.value = inputNode.properties.cachedOutput || "";
			}

			// Update this node's widget values
			lockedWidget.value = node._isLocked;
			cachedOutputWidget.value = node.properties.cachedOutput || "";

			app.graph.setDirtyCanvas(true);
		};

		// Toggle disable function - disables this node AND all its input nodes
		const toggleDisable = () => {
			const newDisabledState = !node._isDisabled;

			// Get all input nodes (nodes feeding into this one)
			const inputNodes = getInputNodes(node);

			// Disable/enable this node
			node._isDisabled = newDisabledState;
			if (!node.properties) node.properties = {};
			node.properties.isDisabled = newDisabledState;

			// Disable/enable all input nodes too
			for (const inputNode of inputNodes) {
				inputNode._isDisabled = newDisabledState;
				if (!inputNode.properties) inputNode.properties = {};
				inputNode.properties.isDisabled = newDisabledState;
				// Update their hidden widgets
				const inputDisabledWidget = inputNode.widgets?.find(w => w.name === "disabled");
				if (inputDisabledWidget) inputDisabledWidget.value = newDisabledState;
			}

			// Update this node's widget value
			disabledWidget.value = node._isDisabled;

			app.graph.setDirtyCanvas(true);
		};

		// Tooltip state for menubar
		node._menubarTooltip = null;

		// Create custom menubar widget
		const menubar = {
			name: "menubar",
			type: "custom",
			value: null,
			options: { serialize: false },
			serializeValue: () => undefined, // Skip serialization
			computeSize: function() {
				return [node.size[0], 26];  // 16 content + 10 bottom margin
			},
			draw: function(ctx, node, width, y, height) {
				const H = 16;
				const totalH = 26;  // Includes bottom margin
				const topOffset = 4; // Push content down to add space after mode dropdown

				// Collapse labels when node is narrow
				const showLabels = width >= 260;
				const iconSpacing = showLabels ? 52 : 22;  // Spacing between icon groups
				const disableSpacing = showLabels ? 68 : 22;

				// Lock icon on the left
				const lockX = 12;
				const lockY = y + topOffset + H / 2;

				// Orange when locked, gray when unlocked
				ctx.fillStyle = node._isLocked ? "#ffaa00" : "rgba(255, 255, 255, 0.35)";
				ctx.font = "11px Arial";
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText(node._isLocked ? "🔒" : "🔓", lockX, lockY);

				// "Lock" label after icon - bright yellow bold when locked (only if wide enough)
				if (showLabels) {
					ctx.fillStyle = node._isLocked ? "#ffcc00" : "rgba(255, 255, 255, 0.35)";
					ctx.font = node._isLocked ? "bold 12px Arial" : "12px Arial";
					ctx.fillText("Lock", lockX + 16, lockY);
				}

				// Disable icon and label (after Lock)
				const disableX = lockX + iconSpacing;
				ctx.fillStyle = node._isDisabled ? "#ff4444" : "rgba(255, 255, 255, 0.35)";
				ctx.font = "11px Arial";
				ctx.textAlign = "left";
				ctx.fillText("⛔", disableX, lockY);

				// "Disable" label - red bold when disabled (only if wide enough)
				if (showLabels) {
					ctx.fillStyle = node._isDisabled ? "#ff6666" : "rgba(255, 255, 255, 0.35)";
					ctx.font = node._isDisabled ? "bold 12px Arial" : "12px Arial";
					ctx.fillText("Disable", disableX + 16, lockY);
				}

				// Preview icon and label (after Disable) - on the left side
				const previewLabelX = disableX + disableSpacing;
				ctx.fillStyle = node._showPreview ? "#4a9eff" : "rgba(255, 255, 255, 0.35)";
				ctx.font = "11px Arial";
				ctx.textAlign = "left";
				ctx.fillText("ℹ️", previewLabelX, lockY);

				// "Preview" label - blue bold when active (only if wide enough)
				if (showLabels) {
					ctx.fillStyle = node._showPreview ? "#4a9eff" : "rgba(255, 255, 255, 0.35)";
					ctx.font = node._showPreview ? "bold 12px Arial" : "12px Arial";
					ctx.fillText("Preview", previewLabelX + 16, lockY);
				}

				const checkboxSize = 10;
				const checkboxY = y + topOffset + (H - checkboxSize) / 2 - 1;

				// Negative checkbox -[_] on the right
				const negX = width - 13 - checkboxSize;
				ctx.font = "bold 16px Arial";
				ctx.textAlign = "right";
				ctx.textBaseline = "middle";

				// Draw - label
				ctx.fillStyle = node._showNegative ? "#ff6b6b" : "rgba(255, 107, 107, 0.4)";
				ctx.fillText("-", negX - 4, y + topOffset + H / 2);

				// Draw negative checkbox
				ctx.strokeStyle = node._showNegative ? "#ff6b6b" : "rgba(255, 107, 107, 0.4)";
				ctx.lineWidth = 1;
				ctx.strokeRect(negX, checkboxY, checkboxSize, checkboxSize);
				if (node._showNegative) {
					ctx.fillStyle = "#ff6b6b";
					ctx.fillRect(negX + 2, checkboxY + 2, checkboxSize - 4, checkboxSize - 4);
				}

				// Positive checkbox +[_] (before negative)
				const posX = negX - 30;

				// Draw + label
				ctx.fillStyle = node._showPositive ? "#4a9eff" : "rgba(74, 158, 255, 0.4)";
				ctx.fillText("+", posX - 4, y + topOffset + H / 2);

				// Draw positive checkbox
				ctx.strokeStyle = node._showPositive ? "#4a9eff" : "rgba(74, 158, 255, 0.4)";
				ctx.lineWidth = 1;
				ctx.strokeRect(posX, checkboxY, checkboxSize, checkboxSize);
				if (node._showPositive) {
					ctx.fillStyle = "#4a9eff";
					ctx.fillRect(posX + 2, checkboxY + 2, checkboxSize - 4, checkboxSize - 4);
				}

				// Draw tooltip if hovering
				if (node._menubarTooltip) {
					const tooltip = node._menubarTooltip;
					ctx.font = "11px Arial";
					const textWidth = ctx.measureText(tooltip.text).width;
					const padding = 6;
					const tipH = 18;
					const tipW = textWidth + padding * 2;
					const tipX = Math.min(tooltip.x, width - tipW - 5);
					const tipY = y + totalH + 2;

					// Draw tooltip background
					ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
					ctx.beginPath();
					ctx.roundRect(tipX, tipY, tipW, tipH, 4);
					ctx.fill();

					// Draw tooltip border
					ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
					ctx.lineWidth = 1;
					ctx.stroke();

					// Draw tooltip text
					ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
					ctx.textAlign = "left";
					ctx.textBaseline = "middle";
					ctx.fillText(tooltip.text, tipX + padding, tipY + tipH / 2);
				}

				return totalH;
			},
			mouse: function(event, pos, node) {
				const width = node.size[0];
				const showLabels = width >= 260;
				const iconSpacing = showLabels ? 52 : 22;
				const disableSpacing = showLabels ? 68 : 22;
				const lockX = 12;
				const disableX = lockX + iconSpacing;
				const previewLabelX = disableX + disableSpacing;

				const checkboxSize = 10;
				const negX = width - 13 - checkboxSize;
				const posX = negX - 30;

				// Calculate click areas based on current layout
				const lockEndX = showLabels ? lockX + 50 : lockX + 18;
				const disableEndX = showLabels ? disableX + 64 : disableX + 18;
				const previewEndX = showLabels ? previewLabelX + 70 : previewLabelX + 18;

				// Handle hover for tooltips
				if (event.type === "pointermove" || event.type === "mousemove") {
					let tooltip = null;

					// Check positive checkbox hover
					if (pos[0] >= posX - 15 && pos[0] < posX + checkboxSize + 5) {
						tooltip = { text: "Show/hide positive prompt", x: posX - 15 };
					}
					// Check negative checkbox hover
					else if (pos[0] >= negX - 15 && pos[0] < negX + checkboxSize + 5) {
						tooltip = { text: "Show/hide negative prompt", x: negX - 15 };
					}

					if (node._menubarTooltip?.text !== tooltip?.text) {
						node._menubarTooltip = tooltip;
						app.graph.setDirtyCanvas(true);
					}
					return false;
				}

				if (event.type === "pointerdown") {
					// Check if click is on lock area
					if (pos[0] >= lockX - 4 && pos[0] <= lockEndX) {
						toggleLock();
						return true;
					}

					// Check if click is on disable area
					if (pos[0] >= disableX - 4 && pos[0] <= disableEndX) {
						toggleDisable();
						return true;
					}

					// Check if click is on preview area
					if (pos[0] >= previewLabelX - 4 && pos[0] <= previewEndX) {
						togglePreview();
						return true;
					}

					// Check if click is on negative checkbox area
					if (pos[0] >= negX - 15 && pos[0] < negX + checkboxSize + 5) {
						toggleNegative();
						return true;
					}

					// Check if click is on positive checkbox area
					if (pos[0] >= posX - 15 && pos[0] < posX + checkboxSize + 5) {
						togglePositive();
						return true;
					}
				}
				return false;
			}
		};

		// Clear tooltip when mouse leaves the node
		const originalOnMouseLeave = node.onMouseLeave;
		node.onMouseLeave = function() {
			originalOnMouseLeave?.apply(this, arguments);
			if (node._menubarTooltip) {
				node._menubarTooltip = null;
				app.graph.setDirtyCanvas(true);
			}
		};

		// Style the mode widget with custom background color
		const modeWidget = node.widgets.find(w => w.name === "mode");
		if (modeWidget) {
			const originalDraw = modeWidget.draw;
			modeWidget.draw = function(ctx, node, width, y, height) {
				const totalH = 26;  // Total widget height
				const marginY = 2;  // Top/bottom margin
				const H = totalH - marginY * 2;  // Actual drawn height (22px)
				const margin = 15;
				const w = width - margin * 2;

				// Draw custom background
				ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
				ctx.beginPath();
				ctx.roundRect(margin, y + marginY, w, H, 12);
				ctx.fill();

				// Draw border
				ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
				ctx.lineWidth = 1;
				ctx.stroke();

				// Draw the text (current value) - centered, with emoji prefix
				ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
				ctx.font = "12px Arial";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				const displayMap = { "Randomize": "🎲 Randomize Inputs", "Combine": "➕ Combine Inputs", "Switch": "🔛 Switch Input" };
				const displayText = displayMap[this.value] || this.value || "";
				ctx.fillText(displayText, width / 2, y + marginY + H * 0.5);

				// Draw arrows on each side
				ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
				ctx.font = "10px Arial";
				// Left arrow
				ctx.textAlign = "left";
				ctx.fillText("◀", margin + 6, y + marginY + H * 0.5);
				// Right arrow
				ctx.textAlign = "right";
				ctx.fillText("▶", width - margin - 6, y + marginY + H * 0.5);

				return totalH;
			};

			// Track mode changes to show/hide switch selector
			const originalCallback = modeWidget.callback;
			modeWidget.callback = function(value) {
				originalCallback?.call(this, value);
				updateSwitchSelectorVisibility();
			};

			// Use Object.defineProperty to intercept value changes on combo widget
			let currentValue = modeWidget.value;
			Object.defineProperty(modeWidget, 'value', {
				get() { return currentValue; },
				set(newValue) {
					currentValue = newValue;
					// Defer visibility update to next frame
					requestAnimationFrame(() => updateSwitchSelectorVisibility());
				}
			});
		}

		// Helper to get connected input labels
		const getConnectedInputLabels = () => {
			const labels = [];
			if (!node.inputs) return labels;

			for (const input of node.inputs) {
				if (input.name.startsWith("input_") && input.link !== null) {
					const linkInfo = app.graph.links[input.link];
					if (linkInfo) {
						const sourceNode = app.graph.getNodeById(linkInfo.origin_id);
						if (sourceNode) {
							// Show node title if it's custom (not default "PromptChain"), otherwise fall back to "input_N"
							const hasCustomTitle = sourceNode.title && sourceNode.title !== "PromptChain";
							const label = hasCustomTitle ? sourceNode.title : input.name;
							const index = parseInt(input.name.split("_")[1]);
							labels.push({ label, index, inputName: input.name });
						}
					}
				}
			}
			return labels;
		};

		// Create switch selector widget (hidden by default)
		node._switchIndex = node.properties?.switchIndex || 1;

		const switchSelector = {
			name: "switch_selector",
			type: "custom",
			value: null,
			options: { serialize: false },
			hidden: true,
			serializeValue: () => undefined,
			computeSize: function() {
				if (this.hidden) return [0, 0];
				return [node.size[0], 34];  // 8 top padding + 26 widget
			},
			draw: function(ctx, _, width, y, height) {
				if (this.hidden) return 0;

				const totalH = 34;
				const topPadding = 8;  // Breathing room above
				const marginY = 2;
				const H = 22;  // Box height
				const margin = 15;
				const w = width - margin * 2;

				// Draw background (matching mode widget style)
				ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
				ctx.beginPath();
				ctx.roundRect(margin, y + topPadding + marginY, w, H, 12);
				ctx.fill();

				// Draw border
				ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
				ctx.lineWidth = 1;
				ctx.stroke();

				// Get current selection label
				const labels = getConnectedInputLabels();
				let displayText = "(no connections)";
				if (labels.length > 0) {
					const selected = labels.find(l => l.index === node._switchIndex);
					displayText = selected ? `🟢 ${selected.label}` : `🟢 ${labels[0].label}`;
				}

				// Draw text (matching mode widget style)
				ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
				ctx.font = "12px Arial";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(displayText, width / 2, y + topPadding + marginY + H * 0.5);

				// Draw arrows (matching mode widget style)
				ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
				ctx.font = "10px Arial";
				ctx.textAlign = "left";
				ctx.fillText("◀", margin + 6, y + topPadding + marginY + H * 0.5);
				ctx.textAlign = "right";
				ctx.fillText("▶", width - margin - 6, y + topPadding + marginY + H * 0.5);

				return totalH;
			},
			mouse: function(event, pos, node) {
				if (this.hidden) return false;
				if (event.type !== "pointerdown") return false;

				const labels = getConnectedInputLabels();
				if (labels.length === 0) return false;

				const margin = 15;
				const arrowWidth = 25;
				const leftArrowEnd = margin + arrowWidth;
				const rightArrowStart = node.size[0] - margin - arrowWidth;

				// Check if clicking on arrows (cycle) or center (dropdown)
				if (pos[0] < leftArrowEnd) {
					// Left arrow - previous
					let currentIdx = labels.findIndex(l => l.index === node._switchIndex);
					if (currentIdx === -1) currentIdx = 0;
					currentIdx = (currentIdx - 1 + labels.length) % labels.length;
					node._switchIndex = labels[currentIdx].index;
					if (!node.properties) node.properties = {};
					node.properties.switchIndex = node._switchIndex;
					app.graph.setDirtyCanvas(true);
					return true;
				} else if (pos[0] > rightArrowStart) {
					// Right arrow - next
					let currentIdx = labels.findIndex(l => l.index === node._switchIndex);
					if (currentIdx === -1) currentIdx = 0;
					currentIdx = (currentIdx + 1) % labels.length;
					node._switchIndex = labels[currentIdx].index;
					if (!node.properties) node.properties = {};
					node.properties.switchIndex = node._switchIndex;
					app.graph.setDirtyCanvas(true);
					return true;
				} else {
					// Center - show dropdown menu
					const options = labels.map(l => ({
						content: l.label,
						callback: () => {
							node._switchIndex = l.index;
							if (!node.properties) node.properties = {};
							node.properties.switchIndex = node._switchIndex;
							app.graph.setDirtyCanvas(true);
						}
					}));

					// Use LiteGraph's context menu
					const canvas = app.canvas;
					new LiteGraph.ContextMenu(options, {
						event: event,
						callback: null,
						scale: canvas.ds.scale
					}, canvas.getCanvasWindow());
					return true;
				}
			}
		};

		// Update switch selector visibility based on mode
		const updateSwitchSelectorVisibility = () => {
			const modeWidget = node.widgets.find(w => w.name === "mode");
			const isSwitch = modeWidget?.value === "Switch";
			switchSelector.hidden = !isSwitch;
			app.graph.setDirtyCanvas(true);
		};

		// Add hidden widget to pass switch_index to Python
		const switchIndexWidget = {
			name: "switch_index",
			type: "hidden",
			value: 1,
			options: { serialize: true },
			serializeValue: () => node._switchIndex || 1,
			computeSize: () => [0, 0],
		};
		node.widgets.push(switchIndexWidget);

		// Insert switch selector after mode widget
		const modeIndex = node.widgets.findIndex(w => w.name === "mode");
		if (modeIndex > -1) {
			node.widgets.splice(modeIndex + 1, 0, switchSelector);
		}

		// Update visibility on connections change
		const existingOnConnectionsChange = node.onConnectionsChange;
		node.onConnectionsChange = function() {
			existingOnConnectionsChange?.apply(this, arguments);
			// Validate switch index is still valid
			const labels = getConnectedInputLabels();
			if (labels.length > 0 && !labels.find(l => l.index === node._switchIndex)) {
				node._switchIndex = labels[0].index;
				if (!node.properties) node.properties = {};
				node.properties.switchIndex = node._switchIndex;
			}
			app.graph.setDirtyCanvas(true);
		};

		// Initialize visibility
		updateSwitchSelectorVisibility();

		// Insert menubar after switch selector (which is after mode widget)
		const menubarInsertIndex = node.widgets.findIndex(w => w.name === "switch_selector");
		if (menubarInsertIndex > -1) {
			node.widgets.splice(menubarInsertIndex + 1, 0, menubar);
		} else {
			node.widgets.push(menubar);
		}

		// Create "Positive" cap widget - header bar above text widget
		const positiveCap = {
			name: "positive_cap",
			type: "custom",
			value: null,
			options: { serialize: false },
			serializeValue: () => undefined,
			computeSize: function() {
				// Only show if positive text is visible
				if (!node._showPositive) return [0, 0];
				return [node.size[0], 4]; // Height tuned for seamless connection
			},
			draw: function(ctx, _, width, y) {
				if (!node._showPositive) return 0;

				const H = 18; // Draw taller than computeSize to overlap gap
				// Get the actual textbox element position
				const textWidget = node.widgets?.find(w => w.name === "text");
				let margin = 15;
				let w = width - margin * 2;

				if (textWidget?.inputEl) {
					// Use the textbox's actual width and position
					const boxWidth = textWidget.inputEl.offsetWidth;
					// Calculate margin from node width
					margin = (width - boxWidth) / 2;
					w = boxWidth;
				}

				// Draw cap background with transparent black
				ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
				ctx.beginPath();
				ctx.roundRect(margin, y, w, H, [4, 4, 0, 0]);
				ctx.fill();

				// Draw label
				ctx.fillStyle = "rgba(74, 158, 255, 0.9)";
				ctx.font = "bold 10px Arial";
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText("Prompt", margin + 6, y + H / 2 + 1);

				return 4; // Return smaller size to pull textbox up
			}
		};

		// Create "Negative" cap widget - header bar above neg_text widget
		const negativeCap = {
			name: "negative_cap",
			type: "custom",
			value: null,
			options: { serialize: false },
			serializeValue: () => undefined,
			computeSize: function() {
				// Only show if negative text is visible
				if (!node._showNegative) return [0, 0];
				return [node.size[0], 4]; // Height tuned for seamless connection
			},
			draw: function(ctx, _, width, y) {
				if (!node._showNegative) return 0;

				const H = 18; // Draw taller than computeSize to overlap gap
				// Get the actual textbox element position
				const negTextWidget = node.widgets?.find(w => w.name === "neg_text");
				let margin = 15;
				let w = width - margin * 2;

				if (negTextWidget?.inputEl) {
					// Use the textbox's actual width and position
					const boxWidth = negTextWidget.inputEl.offsetWidth;
					// Calculate margin from node width
					margin = (width - boxWidth) / 2;
					w = boxWidth;
				}

				// Draw cap background with subtle red tint
				ctx.fillStyle = "rgba(40, 0, 0, 0.3)";
				ctx.beginPath();
				ctx.roundRect(margin, y, w, H, [4, 4, 0, 0]);
				ctx.fill();

				// Draw label
				ctx.fillStyle = "rgba(255, 107, 107, 0.9)";
				ctx.font = "bold 10px Arial";
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText("Negative Prompt", margin + 6, y + H / 2 + 1);

				return 4; // Return smaller size to pull textbox up
			}
		};

		// Insert cap widgets before their respective text widgets
		const insertCaps = () => {
			// Check if text widget exists
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (!textWidget) {
				// Retry next frame
				requestAnimationFrame(insertCaps);
				return;
			}

			const textIndex = node.widgets.findIndex(w => w.name === "text");

			// Insert positive cap before text widget (if not already there)
			if (textIndex > -1 && !node.widgets.find(w => w.name === "positive_cap")) {
				node.widgets.splice(textIndex, 0, positiveCap);
			}

			// Re-find neg_text index after insertion
			const newNegTextIndex = node.widgets.findIndex(w => w.name === "neg_text");

			// Insert negative cap before neg_text widget (if not already there)
			if (newNegTextIndex > -1 && !node.widgets.find(w => w.name === "negative_cap")) {
				node.widgets.splice(newNegTextIndex, 0, negativeCap);
			}

			app.graph.setDirtyCanvas(true);
		};

		// Delay cap insertion to ensure text widgets are positioned
		setTimeout(insertCaps, 100);

		// Override onConfigure to restore widget values and preview state after node is loaded
		const originalOnConfigure = node.onConfigure;
		node.onConfigure = function(info) {
			// Mark as loaded from workflow - prevents default size override
			node._isNewlyCreated = false;

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

			// Restore output text and timestamp from saved properties
			if (info.properties?.outputText !== undefined) {
				node._outputText = info.properties.outputText;
			}
			if (info.properties?.outputTimestamp !== undefined) {
				node._outputTimestamp = info.properties.outputTimestamp;
			}

			// Restore negative output text from saved properties
			if (info.properties?.negOutputText !== undefined) {
				node._negOutputText = info.properties.negOutputText;
			}
			if (info.properties?.negTextValue !== undefined) {
				const negTextWidget = node.widgets.find(w => w.name === "neg_text");
				if (negTextWidget) {
					negTextWidget.value = info.properties.negTextValue;
					if (negTextWidget.inputEl) {
						negTextWidget.inputEl.value = info.properties.negTextValue;
					}
				}
			}

			// Restore preview state from saved properties
			if (info.properties?.showPreview && !node._showPreview) {
				node._showPreview = false;
				togglePreview(true); // skipResize to preserve saved node size
			}

			// Restore lock state from saved properties
			if (info.properties?.isLocked !== undefined) {
				node._isLocked = info.properties.isLocked;
			}
			if (info.properties?.cachedOutput !== undefined) {
				node.properties.cachedOutput = info.properties.cachedOutput;
			}
			if (info.properties?.cachedNegOutput !== undefined) {
				node.properties.cachedNegOutput = info.properties.cachedNegOutput;
			}

			// Restore disabled state from saved properties
			if (info.properties?.isDisabled !== undefined) {
				node._isDisabled = info.properties.isDisabled;
			}

			// Restore switch index from saved properties
			if (info.properties?.switchIndex !== undefined) {
				node._switchIndex = info.properties.switchIndex;
			}

			// Restore positive/negative visibility from saved properties
			if (info.properties?.showPositive === false && node._showPositive) {
				node._showPositive = true;
				togglePositive(); // Will toggle to hide positive
			}
			if (info.properties?.showNegative === true && !node._showNegative) {
				node._showNegative = false;
				toggleNegative(); // Will toggle to show negative
			}

			// Update switch selector visibility based on restored mode
			updateSwitchSelectorVisibility();

			// Re-insert caps if needed (they may have been lost during configure)
			setTimeout(insertCaps, 50);
		};

		// Helper to set text on a node
		const setNodeText = (targetNode, text) => {
			const textWidget = targetNode.widgets.find(w => w.name === "text");
			if (textWidget) {
				textWidget.value = text;
				if (textWidget.inputEl) {
					textWidget.inputEl.value = text;
				}
				if (!targetNode.properties) targetNode.properties = {};
				targetNode.properties.textValue = text;
			}
			targetNode.setSize(targetNode.computeSize());
		};

		// Helper to set mode on a node
		const setNodeMode = (targetNode, mode) => {
			const modeWidget = targetNode.widgets.find(w => w.name === "mode");
			if (modeWidget) {
				modeWidget.value = mode;
			}
		};

		// Helper to create a new PromptChain node and connect it
		const createConnectedNode = (targetNode, text, mode, xOffset) => {
			// Access LiteGraph via the graph's constructor
			const LiteGraph = app.graph.constructor.LiteGraph || window.LiteGraph;
			const newNode = LiteGraph.createNode("PromptChain");
			newNode.pos = [targetNode.pos[0] + xOffset, targetNode.pos[1]];
			app.graph.add(newNode);

			// Set text and mode after a frame to let node initialize
			requestAnimationFrame(() => {
				setNodeText(newNode, text);
				setNodeMode(newNode, mode);

				// Find first available input on target node
				const inputSlots = targetNode.inputs.filter(i => i.name.startsWith("input_"));
				let targetSlot = inputSlots.find(slot => slot.link === null);
				if (!targetSlot) {
					// All slots full, add a new one
					const nextIndex = inputSlots.length + 1;
					targetNode.addInput(`input_${nextIndex}`, "STRING");
					targetSlot = targetNode.inputs.find(i => i.name === `input_${nextIndex}`);
				}

				// Connect new node's output to target's input
				const outputSlot = newNode.outputs.findIndex(o => o.name === "output");
				const inputIndex = targetNode.inputs.indexOf(targetSlot);
				newNode.connect(outputSlot, targetNode, inputIndex);

				app.graph.setDirtyCanvas(true);
			});

			return newNode;
		};

		// Parse Dynamic Prompts format
		const parseDynamicPrompt = (input) => {
			// Split by commas, but not inside curly braces
			const segments = [];
			let current = "";
			let braceDepth = 0;

			for (let i = 0; i < input.length; i++) {
				const char = input[i];
				if (char === "{") braceDepth++;
				else if (char === "}") braceDepth--;

				if (char === "," && braceDepth === 0) {
					segments.push(current.trim());
					current = "";
				} else {
					current += char;
				}
			}
			if (current.trim()) segments.push(current.trim());

			return segments;
		};

		// Extract outermost {options} from a segment, respecting nested braces
		const extractBraceGroup = (segment) => {
			const startIdx = segment.indexOf("{");
			if (startIdx === -1) return null;

			// Find matching closing brace
			let depth = 0;
			let endIdx = -1;
			for (let i = startIdx; i < segment.length; i++) {
				if (segment[i] === "{") depth++;
				else if (segment[i] === "}") {
					depth--;
					if (depth === 0) {
						endIdx = i;
						break;
					}
				}
			}
			if (endIdx === -1) return null;

			const braceContent = segment.slice(startIdx + 1, endIdx);
			// Clean up remainder - remove double commas and extra spaces
			let remainder = (segment.slice(0, startIdx) + segment.slice(endIdx + 1))
				.replace(/,\s*,/g, ",")  // double commas to single
				.replace(/^\s*,\s*/, "") // leading comma
				.replace(/\s*,\s*$/, "") // trailing comma
				.trim();

			// Split by | but respect nested braces
			const options = [];
			let current = "";
			let braceDepth = 0;
			for (let i = 0; i < braceContent.length; i++) {
				const char = braceContent[i];
				if (char === "{") braceDepth++;
				else if (char === "}") braceDepth--;

				if (char === "|" && braceDepth === 0) {
					options.push(current.trim());
					current = "";
				} else {
					current += char;
				}
			}
			if (current.trim()) options.push(current.trim());

			return { options, remainder };
		};

		// Recursively process a segment, creating nodes as needed
		// Returns the text to use (either plain text or empty if node was created)
		let globalXOffset = -250;
		let nodeCreationQueue = [];

		const processSegment = (segment, targetNode) => {
			const braceData = extractBraceGroup(segment);

			if (!braceData) {
				// No braces, return as-is
				return segment;
			}

			// Check if any option contains nested braces
			const hasNestedBraces = braceData.options.some(opt => opt.includes("{"));

			if (hasNestedBraces) {
				// Process each option - some may have nested braces
				const processedOptions = [];
				for (const opt of braceData.options) {
					if (opt.includes("{")) {
						// This option has nested braces - recursively process
						// It becomes its own subtree
						processedOptions.push(opt); // Keep as-is for now, will be processed when node is created
					} else {
						processedOptions.push(opt);
					}
				}

				const wildcardText = processedOptions.join(" |\n");

				if (braceData.remainder) {
					// Has static suffix like "fetish swamp queen, {nested}"
					// Create Combine node with remainder, Randomize feeds into it
					const xPos = globalXOffset;
					globalXOffset -= 250;

					nodeCreationQueue.push({
						targetNode,
						text: braceData.remainder,
						mode: "Combine",
						xOffset: xPos,
						then: (combineNode) => {
							// Now create the randomize node feeding into combine
							nodeCreationQueue.push({
								targetNode: combineNode,
								text: wildcardText,
								mode: "Randomize",
								xOffset: -250,
								then: (randNode) => {
									// Check each option for nested braces and process
									for (const opt of braceData.options) {
										if (opt.includes("{")) {
											processSegment(opt, randNode);
										}
									}
								}
							});
						}
					});
				} else {
					// Pure {a|b|{nested}}
					const xPos = globalXOffset;
					globalXOffset -= 250;

					nodeCreationQueue.push({
						targetNode,
						text: wildcardText,
						mode: "Randomize",
						xOffset: xPos,
						then: (randNode) => {
							for (const opt of braceData.options) {
								if (opt.includes("{")) {
									processSegment(opt, randNode);
								}
							}
						}
					});
				}

				return null; // Node was created
			} else {
				// Simple case - no nested braces
				const wildcardText = braceData.options.join(" |\n");

				if (braceData.remainder) {
					const xPos = globalXOffset;
					globalXOffset -= 250;

					nodeCreationQueue.push({
						targetNode,
						text: braceData.remainder,
						mode: "Combine",
						xOffset: xPos,
						then: (combineNode) => {
							nodeCreationQueue.push({
								targetNode: combineNode,
								text: wildcardText,
								mode: "Randomize",
								xOffset: -250
							});
						}
					});
				} else {
					const xPos = globalXOffset;
					globalXOffset -= 250;

					nodeCreationQueue.push({
						targetNode,
						text: wildcardText,
						mode: "Randomize",
						xOffset: xPos
					});
				}

				return null; // Node was created
			}
		};

		// Process the node creation queue with proper timing
		const processQueue = () => {
			if (nodeCreationQueue.length === 0) return;

			const item = nodeCreationQueue.shift();
			const newNode = createConnectedNode(item.targetNode, item.text, item.mode, item.xOffset);

			if (item.then) {
				setTimeout(() => {
					item.then(newNode);
					processQueue();
				}, 100);
			} else {
				setTimeout(processQueue, 50);
			}
		};

		// Export node tree to Dynamic Prompt format
		const exportToDynamicPrompt = (startNode, visited = new Set()) => {
			// Prevent infinite loops from circular connections
			if (visited.has(startNode.id)) return "";
			visited.add(startNode.id);

			// Get this node's text widget value
			const textWidget = startNode.widgets?.find(w => w.name === "text");
			const nodeText = textWidget?.value?.trim() || "";

			// Get mode
			const modeWidget = startNode.widgets?.find(w => w.name === "mode");
			const mode = modeWidget?.value || "Combine";

			// Collect all connected input nodes (PromptChain only)
			const connectedInputs = [];
			const inputSlots = startNode.inputs?.filter(i => i.name.startsWith("input_")) || [];
			for (const slot of inputSlots) {
				if (slot.link !== null) {
					const linkInfo = app.graph.links[slot.link];
					if (linkInfo) {
						const sourceNode = app.graph.getNodeById(linkInfo.origin_id);
						if (sourceNode?.constructor?.comfyClass === "PromptChain") {
							const exported = exportToDynamicPrompt(sourceNode, visited);
							if (exported) connectedInputs.push(exported);
						}
					}
				}
			}

			// Convert node's wildcard text (a | b | c) to Dynamic Prompt format {a|b|c}
			const convertWildcardToBraces = (text) => {
				if (!text) return "";
				// Check if text contains | (wildcard syntax)
				if (text.includes("|")) {
					// Split by comma first to handle multiple groups
					const parts = text.split(",").map(p => p.trim()).filter(p => p);
					const converted = parts.map(part => {
						if (part.includes("|")) {
							const options = part.split("|").map(o => o.trim()).filter(o => o);
							return options.length > 1 ? `{${options.join("|")}}` : options[0] || "";
						}
						return part;
					});
					return converted.join(", ");
				}
				return text;
			};

			const convertedText = convertWildcardToBraces(nodeText);

			// Build result based on mode
			if (mode === "Randomize") {
				// Randomize: wrap connected inputs in {a|b|c}
				if (connectedInputs.length > 0) {
					const randomGroup = connectedInputs.length > 1
						? `{${connectedInputs.join("|")}}`
						: connectedInputs[0];
					if (convertedText) {
						return `${convertedText}, ${randomGroup}`;
					}
					return randomGroup;
				}
				return convertedText;
			} else {
				// Combine: join all with commas
				const allParts = [];
				if (convertedText) allParts.push(convertedText);
				allParts.push(...connectedInputs);
				return allParts.join(", ");
			}
		};

		// Add context menu options
		const originalGetExtraMenuOptions = node.getExtraMenuOptions;
		node.getExtraMenuOptions = function(_, options) {
			originalGetExtraMenuOptions?.apply(this, arguments);

			// Export to Dynamic Prompt format
			options.unshift({
				content: "Export",
				callback: () => {
					const exported = exportToDynamicPrompt(node);
					if (exported) {
						prompt("Exported Dynamic Prompt (Ctrl+A, Ctrl+C to copy):", exported);
					} else {
						alert("Nothing to export - node is empty");
					}
				}
			});

			// Unified Import - handles plain tags and Dynamic Prompt syntax
			options.unshift({
				content: "Import",
				callback: () => {
					const input = prompt("Paste prompt (supports: tags, Dynamic Prompt {a|b} syntax):");
					if (input && input.trim()) {
						// Strip outer braces if entire input is wrapped in {}
						let processedInput = input.trim();
						if (processedInput.startsWith("{") && processedInput.endsWith("}")) {
							// Check if it's a single wrapping pair (not {a}{b})
							let depth = 0;
							let isSingleWrap = true;
							for (let i = 0; i < processedInput.length - 1; i++) {
								if (processedInput[i] === "{") depth++;
								else if (processedInput[i] === "}") depth--;
								if (depth === 0 && i > 0) {
									isSingleWrap = false;
									break;
								}
							}
							if (isSingleWrap) {
								processedInput = processedInput.slice(1, -1);
							}
						}

						// Check if contains Dynamic Prompt syntax
						const hasBraces = processedInput.includes("{") && processedInput.includes("}");

						// Check for top-level | separators (outside braces)
						const hasTopLevelPipe = (() => {
							let depth = 0;
							for (const char of processedInput) {
								if (char === "{") depth++;
								else if (char === "}") depth--;
								else if (char === "|" && depth === 0) return true;
							}
							return false;
						})();

						if (hasTopLevelPipe) {
							// Split by top-level | and convert each to its own node
							const options = [];
							let current = "";
							let braceDepth = 0;
							for (let i = 0; i < processedInput.length; i++) {
								const char = processedInput[i];
								if (char === "{") braceDepth++;
								else if (char === "}") braceDepth--;

								if (char === "|" && braceDepth === 0) {
									if (current.trim()) options.push(current.trim());
									current = "";
								} else {
									current += char;
								}
							}
							if (current.trim()) options.push(current.trim());

							// Reset state
							globalXOffset = -250;
							nodeCreationQueue = [];

							// Set clicked node to Randomize mode (it will collect inputs)
							setNodeMode(node, "Randomize");

							// Create a separate node for each option
							let yOffset = 0;
							for (const opt of options) {
								// Check if option has nested braces
								if (opt.includes("{")) {
									// Has nested - process recursively
									const braceData = extractBraceGroup(opt);
									if (braceData && braceData.remainder) {
										// Has both static text and nested braces
										// Create Combine node with static text
										const combineNode = createConnectedNode(node, braceData.remainder, "Combine", globalXOffset);
										combineNode.pos[1] = node.pos[1] + yOffset;
										globalXOffset -= 50;

										// Queue nested brace processing
										nodeCreationQueue.push({
											targetNode: combineNode,
											text: braceData.options.join(" |\n"),
											mode: "Randomize",
											xOffset: -250,
											then: (randNode) => {
												// Check for deeper nesting
												for (const innerOpt of braceData.options) {
													if (innerOpt.includes("{")) {
														processSegment(innerOpt, randNode);
													}
												}
											}
										});
									} else if (braceData) {
										// Pure braces, create Randomize node
										const randNode = createConnectedNode(node, braceData.options.join(" |\n"), "Randomize", globalXOffset);
										randNode.pos[1] = node.pos[1] + yOffset;
										globalXOffset -= 50;
									}
								} else {
									// No nested braces - create simple Combine node
									const newNode = createConnectedNode(node, opt, "Combine", globalXOffset);
									newNode.pos[1] = node.pos[1] + yOffset;
									globalXOffset -= 50;
								}
								yOffset += 150; // Stack nodes vertically
							}

							processQueue();
						} else if (hasBraces) {
							// Reset state for this import
							globalXOffset = -250;
							nodeCreationQueue = [];

							// Dynamic Prompt mode - parse and create nodes
							const segments = parseDynamicPrompt(processedInput);
							const staticParts = [];

							for (const segment of segments) {
								const result = processSegment(segment, node);
								if (result !== null) {
									staticParts.push(result);
								}
							}

							// Static parts go to clicked node
							if (staticParts.length > 0) {
								setNodeText(node, staticParts.join(", "));
								setNodeMode(node, "Combine");
							}

							// Start processing the queue
							processQueue();
						} else {
							// Plain tags mode - convert to wildcard format
							const tags = processedInput
								.split(/[\n\r]+/)
								.flatMap(line => line.split(','))
								.map(tag => tag.trim())
								.filter(tag => tag.length > 0);

							const wildcardFormat = tags.join(" |\n");
							setNodeText(node, wildcardFormat);
						}

						app.graph.setDirtyCanvas(true);
					}
				}
			});
		};
	}
});
