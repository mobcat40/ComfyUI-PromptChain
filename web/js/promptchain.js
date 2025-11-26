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

		// Make text widget transparent until focused (only if empty)
		// Use setTimeout to wait for widget DOM element to be created
		const setupTextOpacity = () => {
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (textWidget?.inputEl) {
				const updateStyle = () => {
					const hasText = textWidget.inputEl.value.trim().length > 0;
					const isFocused = document.activeElement === textWidget.inputEl;
					if (hasText || isFocused) {
						textWidget.inputEl.style.opacity = 1;
						textWidget.inputEl.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
						textWidget.inputEl.style.color = "";
						textWidget.inputEl.style.fontStyle = "normal";
					} else {
						textWidget.inputEl.style.opacity = 1;
						textWidget.inputEl.style.backgroundColor = "#00000033";
						textWidget.inputEl.style.color = "rgba(255, 255, 255, 0.85)";
						textWidget.inputEl.style.fontStyle = "italic";
					}
				};
				updateStyle();
				textWidget.inputEl.style.marginTop = "-6px"; // Pull text closer to menubar
				textWidget.inputEl.style.fontFamily = "Arial, sans-serif";
				textWidget.inputEl.style.fontSize = "11px";
				textWidget.inputEl.style.padding = "4px";
				textWidget.inputEl.style.lineHeight = "1.3";
				textWidget.inputEl.style.borderRadius = "4px";
				textWidget.inputEl.placeholder = "prompt text...";
				// Style placeholder text and scrollbars
				const styleId = "promptchain-prompt-placeholder-style";
				if (!document.getElementById(styleId)) {
					const style = document.createElement("style");
					style.id = styleId;
					style.textContent = `
						.promptchain-prompt::placeholder { color: rgba(255, 255, 255, 0.5); opacity: 1; }
						.promptchain-prompt:focus { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important; outline: none !important; }
						.promptchain-prompt::-webkit-scrollbar { width: 8px; height: 8px; }
						.promptchain-prompt::-webkit-scrollbar-track { background: transparent; }
						.promptchain-prompt::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 4px; }
						.promptchain-prompt::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
						.promptchain-prompt::-webkit-scrollbar-corner { background: transparent; }
					`;
					document.head.appendChild(style);
				}
				textWidget.inputEl.classList.add("promptchain-prompt");
				textWidget.inputEl.addEventListener("focus", () => {
					textWidget.inputEl.style.opacity = 1;
					textWidget.inputEl.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
					textWidget.inputEl.style.color = "";
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
		// skipResize: when restoring from saved workflow, don't reset node size
		const togglePreview = (skipResize = false) => {
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
					draw: function(ctx, _, width, y) {
						const H = 16;
						const topOffset = -10; // Draw into the gap above
						ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
						ctx.font = "11px Arial";
						ctx.textAlign = "left";
						ctx.textBaseline = "middle";

						// Build label with cached time ago (empty if never run)
						if (node._cachedTimeAgo) {
							ctx.fillText(`Last run: ${node._cachedTimeAgo}`, 12, y + topOffset + H / 2);
						}
						return H;
					},
					onRemoved: function() {
						clearInterval(timeAgoInterval);
					}
				};

				// Add preview widget after text widget
				const w = ComfyWidgets["STRING"](node, "output_preview", ["STRING", { multiline: true }], app).widget;
				w.options = w.options || {};
				w.options.serialize = false;
				w.serializeValue = () => undefined; // Skip serialization
				w.inputEl.readOnly = true;
				w.inputEl.style.opacity = 1;
				w.inputEl.style.fontStyle = "italic";
				w.inputEl.style.marginTop = "-6px"; // Pull text closer to output label
				w.inputEl.style.fontFamily = "Arial, sans-serif";
				w.inputEl.style.fontSize = "11px";
				w.inputEl.style.padding = "4px";
				w.inputEl.style.lineHeight = "1.3";
				w.inputEl.style.borderRadius = "4px";
				w.inputEl.style.backgroundColor = "#00000033";
				w.inputEl.style.color = "rgba(255, 255, 255, 0.85)";
				w.inputEl.placeholder = "awaiting generation...";
				// Style placeholder text
				const styleId = "promptchain-placeholder-style";
				if (!document.getElementById(styleId)) {
					const style = document.createElement("style");
					style.id = styleId;
					style.textContent = `
						.promptchain-preview::placeholder { color: rgba(255, 255, 255, 0.5); opacity: 1; }
						.promptchain-preview:focus { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important; outline: none !important; }
						.promptchain-preview::-webkit-scrollbar { width: 8px; height: 8px; }
						.promptchain-preview::-webkit-scrollbar-track { background: transparent; }
						.promptchain-preview::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 4px; }
						.promptchain-preview::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
						.promptchain-preview::-webkit-scrollbar-corner { background: transparent; }
					`;
					document.head.appendChild(style);
				}
				w.inputEl.classList.add("promptchain-preview");
				w.value = node._outputText || "";
				w.inputEl.value = node._outputText || "";

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

				// "Prompt" label on the left (keep commented - do not delete)
				// ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
				// ctx.font = "11px Arial";
				// ctx.textAlign = "left";
				// ctx.textBaseline = "middle";
				// ctx.fillText("Prompt", 12, y + topOffset + H / 2);

				// Preview checkbox on the right
				const checkboxSize = 10;
				const checkboxX = width - 13 - checkboxSize; // 5px extra margin from right edge
				const checkboxY = y + topOffset + (H - checkboxSize) / 2 - 1;

				ctx.strokeStyle = node._showPreview ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.35)";
				ctx.lineWidth = 1;
				ctx.strokeRect(checkboxX, checkboxY, checkboxSize, checkboxSize);

				if (node._showPreview) {
					ctx.fillStyle = "#4a9eff";
					ctx.fillRect(checkboxX + 2, checkboxY + 2, checkboxSize - 4, checkboxSize - 4);
				}

				// "Preview" label before checkbox (brighter when active)
				ctx.fillStyle = node._showPreview ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.35)";
				ctx.font = "12px Arial";
				ctx.textAlign = "right";
				ctx.textBaseline = "middle";
				ctx.fillText("Preview", checkboxX - 6, y + topOffset + H / 2);

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

			// Restore preview state from saved properties
			if (info.properties?.showPreview && !node._showPreview) {
				node._showPreview = false;
				togglePreview(true); // skipResize to preserve saved node size
			}
		};

		// Helper to set text on a node
		const setNodeText = (targetNode, text) => {
			const textWidget = targetNode.widgets.find(w => w.name === "text");
			if (textWidget) {
				textWidget.value = text;
				if (textWidget.inputEl) {
					textWidget.inputEl.value = text;
					// Update styling to reflect text presence
					const hasText = text.trim().length > 0;
					if (hasText) {
						textWidget.inputEl.style.opacity = 1;
						textWidget.inputEl.style.backgroundColor = "";
						textWidget.inputEl.style.color = "";
						textWidget.inputEl.style.fontStyle = "normal";
					} else {
						textWidget.inputEl.style.opacity = 1;
						textWidget.inputEl.style.backgroundColor = "#00000033";
						textWidget.inputEl.style.color = "rgba(255, 255, 255, 0.85)";
						textWidget.inputEl.style.fontStyle = "italic";
					}
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
