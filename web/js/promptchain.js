import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";
import { api } from "../../../scripts/api.js";

// Track workflow execution start time for timing measurements
api.addEventListener("execution_start", () => {
	window._promptChainExecutionStart = Date.now();
});

// Dynamic input management for PromptChainDynamic
app.registerExtension({
	name: "mobcat40.PromptChain.DynamicInputs",
	async nodeCreated(node) {
		if (node.constructor.comfyClass !== "PromptChain") {
			return;
		}

		// Mark as new node - onConfigure will clear this flag for loaded nodes
		node._isNewlyCreated = true;

		// Style the text widget
		// Use setTimeout to wait for widget DOM element to be created
		const setupTextStyle = () => {
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (textWidget?.inputEl) {
				// Apply consistent styling - no fading based on content
				textWidget.inputEl.style.opacity = 1;
				textWidget.inputEl.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
				textWidget.inputEl.style.fontFamily = "Arial, sans-serif";
				textWidget.inputEl.style.fontSize = "12px";
				textWidget.inputEl.style.padding = "8px";
				textWidget.inputEl.style.lineHeight = "1.3";
				textWidget.inputEl.style.borderRadius = "4px";
				textWidget.inputEl.style.border = "none";
				textWidget.inputEl.placeholder = "prompt text...";
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
						.promptchain-preview:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4) !important; }
						.promptchain-preview:focus { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important; outline: none !important; }
						.promptchain-preview::-webkit-scrollbar { width: 8px; height: 8px; }
						.promptchain-preview::-webkit-scrollbar-track { background: transparent; }
						.promptchain-preview::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.35); border-radius: 4px; }
						.promptchain-preview::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
						.promptchain-preview::-webkit-scrollbar-corner { background: transparent; }
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

			// Update output slot visibility based on connected inputs
			updateOutputVisibility();
		};

		// Hide positive/negative outputs when node has connected inputs (pass-through mode)
		// Store original outputs for restoration
		let originalOutputs = null;

		const updateOutputVisibility = () => {
			const inputSlots = node.inputs?.filter(i => i.name.startsWith("input_")) || [];
			const hasConnectedInputs = inputSlots.some(slot => slot.link !== null);

			// Check if chain output is connected
			const chainOutput = node.outputs?.find(o => o.name === "chain");
			const chainIsConnected = chainOutput?.links && chainOutput.links.length > 0;

			// Store original outputs on first call
			if (!originalOutputs && node.outputs) {
				originalOutputs = node.outputs.map(o => ({ name: o.name, type: o.type, links: o.links }));
			}

			// Hide positive/negative if chain output is connected (pass-through mode)
			// Show all outputs when chain is not connected (terminal node needs pos/neg for CLIP)
			if (chainIsConnected) {
				// Keep only the chain output (remove positive/negative)
				// But only if they don't have connections
				const posOutput = node.outputs?.find(o => o.name === "positive");
				const negOutput = node.outputs?.find(o => o.name === "negative");

				if (posOutput && (!posOutput.links || posOutput.links.length === 0)) {
					const idx = node.outputs.indexOf(posOutput);
					if (idx > -1) node.removeOutput(idx);
				}
				if (negOutput && (!negOutput.links || negOutput.links.length === 0)) {
					const idx = node.outputs.indexOf(negOutput);
					if (idx > -1) node.removeOutput(idx);
				}
			} else {
				// Restore positive/negative outputs if missing
				const hasPositive = node.outputs?.some(o => o.name === "positive");
				const hasNegative = node.outputs?.some(o => o.name === "negative");

				if (!hasPositive) {
					node.addOutput("positive", "STRING");
					// Set empty label
					const out = node.outputs.find(o => o.name === "positive");
					if (out) out.label = " ";
				}
				if (!hasNegative) {
					node.addOutput("negative", "STRING");
					// Set empty label
					const out = node.outputs.find(o => o.name === "negative");
					if (out) out.label = " ";
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

			// Helper function to get switch options from a child node
			const getChildSwitchOptions = (sourceNode) => {
				if (!sourceNode.inputs) return [];
				const options = [];
				for (const input of sourceNode.inputs) {
					if (input.name.startsWith("input_") && input.link !== null) {
						const linkInfo = app.graph.links[input.link];
						if (linkInfo) {
							const grandchildNode = app.graph.getNodeById(linkInfo.origin_id);
							if (grandchildNode) {
								const hasCustomTitle = grandchildNode.title && grandchildNode.title !== "PromptChain";
								const label = hasCustomTitle ? grandchildNode.title : input.name;
								const index = parseInt(input.name.split("_")[1]);
								options.push({ label, index, inputName: input.name });
							}
						}
					}
				}
				return options;
			};

			// Get the current mode of a child node
			const getChildMode = (sourceNode) => {
				const modeWidget = sourceNode.widgets?.find(w => w.name === "mode");
				return modeWidget?.value || "Combine";
			};

			// Get the currently selected switch label from a child node
			const getChildSwitchLabel = (sourceNode) => {
				const options = getChildSwitchOptions(sourceNode);
				if (options.length === 0) return null;
				const switchIndex = sourceNode._switchIndex || sourceNode.properties?.switchIndex || 1;
				const selected = options.find(o => o.index === switchIndex);
				return selected ? selected.label : options[0].label;
			};

			// Get display label based on mode
			const getChildModeLabel = (sourceNode) => {
				const options = getChildSwitchOptions(sourceNode);

				// If only 1 grandchild, always show as Switch to that option (mode is meaningless)
				if (options.length === 1) {
					return options[0].label;
				}

				const mode = getChildMode(sourceNode);
				if (mode === "Randomize") {
					// Show winning node's title if available
					const winnerIndex = sourceNode._randomWinnerIndex || sourceNode.properties?.randomWinnerIndex;
					if (winnerIndex) {
						// Find the input slot that won
						const winnerInput = sourceNode.inputs?.find(i => i.name === `input_${winnerIndex}`);
						if (winnerInput?.link) {
							const linkInfo = app.graph.links[winnerInput.link];
							if (linkInfo) {
								const winnerNode = app.graph.getNodeById(linkInfo.origin_id);
								if (winnerNode) {
									const hasCustomTitle = winnerNode.title && winnerNode.title !== "PromptChain";
									const winnerTitle = hasCustomTitle ? winnerNode.title : `input_${winnerIndex}`;
									return `🎲 ${winnerTitle}`;
								}
							}
						}
					}
					return "🎲 Roll";
				}
				if (mode === "Combine") return "➕ Combine";
				// Switch mode - show selected option
				const selectedLabel = getChildSwitchLabel(sourceNode);
				return selectedLabel || "Switch";
			};

			// Draw our custom input labels (default labels hidden via input.label = " " in nodeCreated)
			const originalOnDrawForeground = nodeType.prototype.onDrawForeground;
			nodeType.prototype.onDrawForeground = function(ctx) {
				originalOnDrawForeground?.apply(this, arguments);

				if (this.flags?.collapsed || !this.inputs) return;

				// Initialize click areas for switch dropdowns and child labels
				if (!this._switchClickAreas) this._switchClickAreas = [];
				this._switchClickAreas = [];
				if (!this._childClickAreas) this._childClickAreas = [];
				this._childClickAreas = [];

				// Draw custom input labels
				for (let i = 0; i < this.inputs.length; i++) {
					const input = this.inputs[i];

					if (input?.name?.startsWith("input_")) {
						// Get actual slot position using LiteGraph method
						const pos = this.getConnectionPos?.(true, i) || [0, 0];
						const x = (pos[0] - this.pos[0] + 14 + 14) / 2;  // Split the difference
						const y = pos[1] - this.pos[1];

						// Dynamic label: show connected node's name, or "in" if default/disconnected
						let labelText = "";
						let hasDropdown = false;
						let sourceNode = null;

						if (input.link !== null) {
							const linkInfo = app.graph.links[input.link];
							if (linkInfo) {
								sourceNode = app.graph.getNodeById(linkInfo.origin_id);
								if (sourceNode) {
									const isPromptChain = sourceNode.constructor?.comfyClass === "PromptChain";
									const hasCustomTitle = sourceNode.title && sourceNode.title !== "PromptChain";
									const baseLabel = hasCustomTitle ? sourceNode.title : "Untitled Node";

									// Check if child has connected inputs (making dropdown useful)
									const childOptions = getChildSwitchOptions(sourceNode);
									hasDropdown = isPromptChain && childOptions.length > 0;

									if (hasDropdown) {
										const modeLabel = getChildModeLabel(sourceNode);
										labelText = `${baseLabel} ➞ `;
										this._modeLabelToDraw = modeLabel;
										this._hasDropdownArrow = true;
									} else {
										labelText = baseLabel;
										this._modeLabelToDraw = null;
										this._hasDropdownArrow = false;
									}
								}
							}
						} else {
							// No connection - show default label
							labelText = "in";
							this._hasDropdownArrow = false;
							this._modeLabelToDraw = null;
						}

						// Check if this input is dimmed (not selected in Switch mode)
						const modeWidget = this.widgets?.find(w => w.name === "mode");
						const currentMode = modeWidget?.value;
						const isInSwitchMode = currentMode === "Switch";
						const inputIndex = parseInt(input.name.split("_")[1]);
						const selectedSwitchIndex = this._switchIndex || this.properties?.switchIndex || 1;
						const isDimmed = isInSwitchMode && input.link !== null && inputIndex !== selectedSwitchIndex;

						// Determine mode indicator for connected inputs
						let modeIndicator = "";
						if (input.link !== null) {
							if (currentMode === "Randomize") {
								modeIndicator = "🎲 ";
							} else if (currentMode === "Combine") {
								modeIndicator = "➕ ";
							}
						}

						// Draw label (dimmed if not selected in Switch mode)
						ctx.fillStyle = isDimmed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.7)";
						ctx.font = "12px Arial";
						ctx.textAlign = "left";

						// Draw mode indicator first if present
						let currentX = x;
						if (modeIndicator) {
							ctx.fillText(modeIndicator, currentX, y + 4);
							currentX += ctx.measureText(modeIndicator).width;
						}

						// Track child name position for click detection
						const childNameStartX = currentX;

						// labelText contains "ChildName ➞ " when hasDropdown, or just "ChildName" otherwise
						// Extract just the child name part (before the arrow)
						const childNameOnly = labelText.replace(" ➞ ", "");
						const childNameWidth = ctx.measureText(childNameOnly).width;

						let textWidth = ctx.measureText(labelText).width;
						ctx.fillText(labelText, currentX, y + 4);
						textWidth += currentX - x;  // Include indicator width in total

						// Store child name click area (for connected inputs with a source node)
						if (input.link !== null && sourceNode) {
							const clickArea = {
								x: childNameStartX,
								y: y - 8,
								width: childNameWidth,
								height: 16,
								sourceNode: sourceNode,
								inputIndex: i
							};
							this._childClickAreas.push(clickArea);
						}

						// Draw bold mode label if present (also dimmed if not selected)
						let subchildStartX = 0;
						let subchildWidth = 0;
						if (this._modeLabelToDraw) {
							ctx.fillStyle = isDimmed ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.7)";
							ctx.font = isDimmed ? "12px Arial" : "bold 12px Arial";
							const modeWidth = ctx.measureText(this._modeLabelToDraw).width;
							subchildStartX = x + textWidth;  // Track where subchild starts
							ctx.fillText(this._modeLabelToDraw, subchildStartX, y + 4);
							textWidth += modeWidth;
							subchildWidth = modeWidth;

							// Draw triangle (dimmed if not selected)
							if (this._hasDropdownArrow) {
								ctx.fillStyle = isDimmed ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.35)";
								const arrow = " ⏷";
								ctx.fillText(arrow, x + textWidth, y + 4);
								const arrowWidth = ctx.measureText(arrow).width;
								textWidth += arrowWidth;
								subchildWidth += arrowWidth;  // Include arrow in dropdown area
							}
						}

						// Store click area for dropdowns (only the subchild portion)
						if (hasDropdown && sourceNode && subchildWidth > 0) {
							const dropdownArea = {
								x: subchildStartX,
								y: y - 8,
								width: subchildWidth,
								height: 16,
								sourceNode: sourceNode,
								inputIndex: i
							};
							this._switchClickAreas.push(dropdownArea);
						}
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

							// Draw output label - "out" for chain, keep others as-is
							ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
							ctx.font = "12px Arial";
							ctx.textAlign = "right";
							const outputLabel = output.name === "chain" ? "out" : output.name;
							ctx.fillText(outputLabel, x, y + 4);
						}
					}
				}
			};

			// Handle mouse clicks on switch dropdown labels
			const originalOnMouseDown = nodeType.prototype.onMouseDown;
			nodeType.prototype.onMouseDown = function(e, localPos, graphCanvas) {
				// Check if clicking on any switch dropdown area
				if (this._switchClickAreas && this._switchClickAreas.length > 0) {
					for (const area of this._switchClickAreas) {
						if (localPos[0] >= area.x && localPos[0] <= area.x + area.width &&
							localPos[1] >= area.y && localPos[1] <= area.y + area.height) {

							const sourceNode = area.sourceNode;
							const options = getChildSwitchOptions(sourceNode);
							const currentMode = getChildMode(sourceNode);
							const currentSwitchIndex = sourceNode._switchIndex || sourceNode.properties?.switchIndex || 1;

							// Helper to set mode on child node
							const setChildMode = (mode) => {
								const modeWidget = sourceNode.widgets?.find(w => w.name === "mode");
								if (modeWidget) {
									modeWidget.value = mode;
									if (modeWidget.callback) {
										modeWidget.callback(mode);
									}
								}
								app.graph.setDirtyCanvas(true);
							};

							// Build menu items - modes first, then separator, then options
							const menuOptions = [];
							const hasMultipleOptions = options.length > 1;

							// Add mode options at top (disabled if only 1 grandchild)
							menuOptions.push({
								content: currentMode === "Randomize" ? "🎲 Roll  ✓" : "🎲 Roll",
								disabled: !hasMultipleOptions,
								callback: hasMultipleOptions ? () => setChildMode("Randomize") : null
							});
							menuOptions.push({
								content: currentMode === "Combine" ? "➕ Combine  ✓" : "➕ Combine",
								disabled: !hasMultipleOptions,
								callback: hasMultipleOptions ? () => setChildMode("Combine") : null
							});

							// Add separator if there are options
							if (options.length > 0) {
								menuOptions.push(null); // null = separator in LiteGraph

								// Add switch options
								for (const opt of options) {
									const isSelected = currentMode === "Switch" && opt.index === currentSwitchIndex;
									menuOptions.push({
										content: isSelected ? `${opt.label}  ✓` : opt.label,
										callback: () => {
											// Set to Switch mode and select this option
											setChildMode("Switch");
											sourceNode._switchIndex = opt.index;
											if (!sourceNode.properties) sourceNode.properties = {};
											sourceNode.properties.switchIndex = opt.index;
											app.graph.setDirtyCanvas(true);
										}
									});
								}
							}

							// Show context menu
							new LiteGraph.ContextMenu(menuOptions, {
								event: e,
								callback: null,
								scale: graphCanvas.ds.scale
							}, graphCanvas.getCanvasWindow());

							return true; // Consume the event
						}
					}
				}

				// Call original handler if exists
				if (originalOnMouseDown) {
					return originalOnMouseDown.apply(this, arguments);
				}
				return false;
			};

			// Handle double-click on child name to switch to that input
			const originalOnDblClick = nodeType.prototype.onDblClick;
			nodeType.prototype.onDblClick = function(e, localPos, graphCanvas) {
				// Check if double-clicking on any child name area
				if (this._childClickAreas && this._childClickAreas.length > 0) {
					for (const area of this._childClickAreas) {
						if (localPos[0] >= area.x && localPos[0] <= area.x + area.width &&
							localPos[1] >= area.y && localPos[1] <= area.y + area.height) {

							// Set this node to Switch mode and select this input
							const modeWidget = this.widgets?.find(w => w.name === "mode");
							if (modeWidget) {
								modeWidget.value = "Switch";
								if (modeWidget.callback) {
									modeWidget.callback("Switch");
								}
							}

							// Set the switch index to this input
							const inputIndex = area.inputIndex;
							const input = this.inputs[inputIndex];
							const switchIndex = parseInt(input.name.split("_")[1]);
							this._switchIndex = switchIndex;
							if (!this.properties) this.properties = {};
							this.properties.switchIndex = switchIndex;

							app.graph.setDirtyCanvas(true);

							return true; // Consume the event
						}
					}
				}

				// Call original handler if exists
				if (originalOnDblClick) {
					return originalOnDblClick.apply(this, arguments);
				}
				return false;
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
					// Calculate execution time from workflow start
					if (window._promptChainExecutionStart) {
						this._executionTime = Date.now() - window._promptChainExecutionStart;
					}
					// Persist to properties for workflow save/load
					if (!this.properties) this.properties = {};
					this.properties.outputText = textValue;
					this.properties.outputTimestamp = this._outputTimestamp;
					this.properties.executionTime = this._executionTime;
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
				}
				// Handle random winner index (which input slot won the randomization)
				if (message?.random_winner) {
					let winnerIndex = message.random_winner;
					if (Array.isArray(winnerIndex)) {
						winnerIndex = winnerIndex[0];
					}
					this._randomWinnerIndex = winnerIndex;
					if (!this.properties) this.properties = {};
					this.properties.randomWinnerIndex = winnerIndex;
				} else {
					this._randomWinnerIndex = null;
					if (this.properties) this.properties.randomWinnerIndex = null;
				}
				// Update preview widget if visible
				if (this._previewWidget?.updateContent) {
					this._previewWidget.updateContent();
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
				// Override computeSize to return 0 height when hidden
				const originalComputeSize = negTextWidget.computeSize?.bind(negTextWidget);
				negTextWidget.computeSize = function(width) {
					if (!node._showNegative) return [0, -4]; // Negative to counteract widget spacing
					return originalComputeSize ? originalComputeSize(width) : [width, 60];
				};
				// Style the neg_text widget
				negTextWidget.inputEl.style.marginTop = "0px";
				negTextWidget.inputEl.style.fontFamily = "Arial, sans-serif";
				negTextWidget.inputEl.style.fontSize = "11px";
				negTextWidget.inputEl.style.padding = "8px";
				negTextWidget.inputEl.style.lineHeight = "1.3";
				negTextWidget.inputEl.style.borderRadius = "4px"; // All corners rounded now
				negTextWidget.inputEl.style.border = "none";
				negTextWidget.inputEl.style.backgroundColor = "rgba(40, 0, 0, 0.5)";  // Subtle red tint
				negTextWidget.inputEl.style.color = "";  // Default white text like positive
				negTextWidget.inputEl.placeholder = "negative prompt text...";
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
				// Remove both label and preview widgets
				const removeWidget = (name) => {
					const widget = node.widgets.find(w => w.name === name);
					if (widget) {
						const index = node.widgets.indexOf(widget);
						if (index > -1) {
							// Clean up DOM element for textarea widgets
							if (widget.inputEl) {
								const wrapper = widget.inputEl.parentElement;
								if (wrapper) wrapper.remove();
							}
							if (widget.onRemoved) widget.onRemoved();
							node.widgets.splice(index, 1);
						}
					}
				};
				removeWidget("output_label");
				removeWidget("output_preview");
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

				// Create "Last run" label widget (above the preview box)
				const outputLabelWidget = {
					name: "output_label",
					type: "custom",
					value: null,
					options: { serialize: false },
					serializeValue: () => undefined,
					computeSize: function(width) {
						const marginTop = 5;
						return [width, 18 + marginTop];
					},
					draw: function(ctx, n, width, y, height) {
						const marginTop = 5;
						const labelHeight = 18;

						// Draw "Last run" timestamp label
						ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
						ctx.font = "12px Arial";
						ctx.textAlign = "left";
						ctx.textBaseline = "top";
						const timeAgo = node._cachedTimeAgo || "Awaiting first run...";
						const execTime = node._executionTime ? `  •  ${node._executionTime}ms` : "";
						// Count words in output
						const countWords = (text) => {
							if (!text) return 0;
							return text.split(/[\s,]+/).filter(w => w.trim()).length;
						};
						const posWords = countWords(node._outputText);
						const negWords = countWords(node._negOutputText);
						const wordLabel = posWords > 0 ? `  •  ${posWords} words` + (negWords > 0 ? ` / ${negWords} neg` : "") : "";
						ctx.fillText(`Last run: ${timeAgo}${execTime}${wordLabel}`, 13, y + marginTop + 3);

						return labelHeight + marginTop;
					},
					onRemoved: function() {
						clearInterval(timeAgoInterval);
					}
				};

				// Create textarea preview widget using ComfyWidgets
				const previewWidget = ComfyWidgets["STRING"](node, "output_preview", ["STRING", { multiline: true }], app).widget;
				previewWidget.inputEl.readOnly = true;
				previewWidget.inputEl.style.backgroundColor = "#15151533";
				previewWidget.inputEl.style.border = "1px solid #00000021";
				previewWidget.inputEl.style.fontWeight = "bold";
				previewWidget.inputEl.style.color = "rgb(255 255 255 / 88%)";
				previewWidget.inputEl.style.fontFamily = "Arial, sans-serif";
				previewWidget.inputEl.style.fontSize = "12px";
				previewWidget.inputEl.style.padding = "4px 6px";
				previewWidget.inputEl.style.lineHeight = "1.4";
				previewWidget.inputEl.style.borderRadius = "4px";
				previewWidget.inputEl.style.resize = "none";
				previewWidget.inputEl.style.cursor = "text";
				previewWidget.inputEl.classList.add("promptchain-preview");
				previewWidget.inputEl.placeholder = "awaiting results...";
				previewWidget.options = { serialize: false, margin: 10 };
				previewWidget.serializeValue = () => undefined;

				// Update content helper
				previewWidget.updateContent = function() {
					const posText = node._outputText || "";
					const negText = node._negOutputText || "";

					const hasOutput = posText.trim() || negText.trim();
					if (!hasOutput) {
						this.inputEl.value = "";
						this.value = "";
						return;
					}

					let content = "Prompt result:\n" + posText;
					if (negText && negText.trim()) {
						content += "\n\nNegative prompt:\n" + negText;
					}
					this.inputEl.value = content;
					this.value = content;
				};
				previewWidget.updateContent();

				// Store reference for updates
				node._previewWidget = previewWidget;
				node._outputLabelWidget = outputLabelWidget;

				// Move preview widget after neg_text (it was auto-added at end)
				const previewIndex = node.widgets.indexOf(previewWidget);
				if (previewIndex > -1) {
					node.widgets.splice(previewIndex, 1);
				}
				const negTextIndex = node.widgets.findIndex(w => w.name === "neg_text");
				if (negTextIndex > -1) {
					node.widgets.splice(negTextIndex + 1, 0, outputLabelWidget, previewWidget);
				} else {
					node.widgets.push(outputLabelWidget, previewWidget);
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
		// Use -4 height to counteract LiteGraph's inter-widget spacing while keeping proper bottom margin
		const lockedWidget = {
			name: "locked",
			type: "hidden",
			value: false,
			options: { serialize: true },
			serializeValue: () => node._isLocked,
			computeSize: () => [0, -4],
		};
		const cachedOutputWidget = {
			name: "cached_output",
			type: "hidden",
			value: "",
			options: { serialize: true },
			serializeValue: () => node.properties?.cachedOutput || "",
			computeSize: () => [0, -4],
		};
		const cachedNegOutputWidget = {
			name: "cached_neg_output",
			type: "hidden",
			value: "",
			options: { serialize: true },
			serializeValue: () => node.properties?.cachedNegOutput || "",
			computeSize: () => [0, -4],
		};
		const disabledWidget = {
			name: "disabled",
			type: "hidden",
			value: false,
			options: { serialize: true },
			serializeValue: () => node._isDisabled,
			computeSize: () => [0, -4],
		};
		// Hidden widgets to pass positive/negative visibility state to Python
		const showPositiveWidget = {
			name: "show_positive",
			type: "hidden",
			value: true,
			options: { serialize: true },
			serializeValue: () => node._showPositive,
			computeSize: () => [0, -4],
		};
		const showNegativeWidget = {
			name: "show_negative",
			type: "hidden",
			value: false,
			options: { serialize: true },
			serializeValue: () => node._showNegative,
			computeSize: () => [0, -4],
		};
		node.widgets.push(lockedWidget);
		node.widgets.push(cachedOutputWidget);
		node.widgets.push(cachedNegOutputWidget);
		node.widgets.push(disabledWidget);
		node.widgets.push(showPositiveWidget);
		node.widgets.push(showNegativeWidget);

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

			// Helper to clear stale "(disabled)" cache when re-enabling
			const clearDisabledCache = (n) => {
				if (n._outputText === "(disabled)") {
					n._outputText = "";
					if (n.properties) n.properties.outputText = "";
				}
				if (n._negOutputText === "(disabled)") {
					n._negOutputText = "";
					if (n.properties) n.properties.negOutputText = "";
				}
				// Update preview widget if it exists
				if (n._previewWidget?.updateContent) {
					n._previewWidget.updateContent();
				}
			};

			// Disable/enable this node
			node._isDisabled = newDisabledState;
			if (!node.properties) node.properties = {};
			node.properties.isDisabled = newDisabledState;

			// Clear stale cache when re-enabling
			if (!newDisabledState) {
				clearDisabledCache(node);
			}

			// Disable/enable all input nodes too
			for (const inputNode of inputNodes) {
				inputNode._isDisabled = newDisabledState;
				if (!inputNode.properties) inputNode.properties = {};
				inputNode.properties.isDisabled = newDisabledState;
				// Clear stale cache when re-enabling
				if (!newDisabledState) {
					clearDisabledCache(inputNode);
				}
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
				return [node.size[0], 26 + 5];  // 26 height + 5 margin top
			},
			draw: function(ctx, node, width, y, height) {
				const H = 16;
				const totalH = 26;
				const marginTop = 5;
				const topOffset = 5;

				// Apply margin top
				y += marginTop;

				// Collapse labels when node is narrow
				const showLabels = width >= 260;
				const iconSpacing = showLabels ? 52 : 22;  // Spacing between icon groups
				const disableSpacing = showLabels ? 68 : 22;

				// Lock icon on the left
				const lockX = 12;
				const lockY = y + topOffset + H / 2;

				// Disable position (after Lock)
				const disableX = lockX + iconSpacing;

				// Preview position (after Disable)
				const previewLabelX = disableX + disableSpacing;

				// Background pill dimensions
				const pillHeight = 17;
				const pillY = y + topOffset - 1;
				const pillRadius = 4;
				const pillPadding = 1;

				// Draw toggle backgrounds (40% black opacity with rounded corners)
				if (node._isLocked) {
					const pillWidth = showLabels ? 48 : 17;
					ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
					ctx.beginPath();
					ctx.roundRect(lockX - pillPadding, pillY, pillWidth, pillHeight, pillRadius);
					ctx.fill();
				}

				if (node._isDisabled) {
					const pillWidth = showLabels ? 64 : 17;
					ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
					ctx.beginPath();
					ctx.roundRect(disableX - pillPadding, pillY, pillWidth, pillHeight, pillRadius);
					ctx.fill();
				}

				if (node._showPreview) {
					const pillWidth = showLabels ? 66 : 17;
					ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
					ctx.beginPath();
					ctx.roundRect(previewLabelX - pillPadding, pillY, pillWidth, pillHeight, pillRadius);
					ctx.fill();
				}

				// Orange when locked, gray when unlocked
				ctx.fillStyle = node._isLocked ? "#ffaa00" : "rgba(255, 255, 255, 0.7)";
				ctx.font = "11px Arial";
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText(node._isLocked ? "🔒" : "🔓", lockX, lockY);

				// "Lock" label after icon - bright yellow bold when locked (only if wide enough)
				if (showLabels) {
					ctx.fillStyle = node._isLocked ? "#ffcc00" : "rgba(255, 255, 255, 0.7)";
					ctx.font = node._isLocked ? "bold 12px Arial" : "12px Arial";
					ctx.fillText("Lock", lockX + 16, lockY);
				}

				// Disable icon and label
				ctx.fillStyle = node._isDisabled ? "#ff4444" : "rgba(255, 255, 255, 0.7)";
				ctx.font = "11px Arial";
				ctx.textAlign = "left";
				ctx.fillText("⛔", disableX, lockY);

				// "Disable" label - red bold when disabled (only if wide enough)
				if (showLabels) {
					ctx.fillStyle = node._isDisabled ? "#ff6666" : "rgba(255, 255, 255, 0.7)";
					ctx.font = node._isDisabled ? "bold 12px Arial" : "12px Arial";
					ctx.fillText("Disable", disableX + 16, lockY);
				}

				// Preview icon and label - on the left side
				ctx.fillStyle = node._showPreview ? "#bcbcbc" : "rgba(255, 255, 255, 0.7)";
				ctx.font = "11px Arial";
				ctx.textAlign = "left";
				ctx.fillText("ℹ️", previewLabelX, lockY);

				// "Preview" label - blue bold when active (only if wide enough)
				if (showLabels) {
					ctx.fillStyle = node._showPreview ? "#bcbcbc" : "rgba(255, 255, 255, 0.7)";
					ctx.font = node._showPreview ? "bold 12px Arial" : "12px Arial";
					ctx.fillText("Preview", previewLabelX + 16, lockY);
				}

				const checkboxSize = 10;
				const rightSideOffset = 4;  // Independent offset for +/- controls
				const checkboxY = y + rightSideOffset + (H - checkboxSize) / 2 + 1;

				// Negative checkbox -[_] on the right
				const negX = width - 13 - checkboxSize;
				ctx.font = "bold 16px Arial";
				ctx.textAlign = "right";
				ctx.textBaseline = "middle";

				// Draw - label
				ctx.fillStyle = node._showNegative ? "#ff6b6b" : "rgba(255, 107, 107, 0.7)";
				ctx.fillText("-", negX - 4, y + rightSideOffset + H / 2);

				// Draw negative checkbox
				ctx.strokeStyle = node._showNegative ? "#ff6b6b" : "rgba(255, 107, 107, 0.7)";
				ctx.lineWidth = 1;
				ctx.strokeRect(negX, checkboxY, checkboxSize, checkboxSize);
				if (node._showNegative) {
					ctx.fillStyle = "#ff6b6b";
					ctx.fillRect(negX + 2, checkboxY + 2, checkboxSize - 4, checkboxSize - 4);
				}

				// Positive checkbox +[_] (before negative)
				const posX = negX - 30;

				// Draw + label
				ctx.fillStyle = node._showPositive ? "#4a9eff" : "rgba(74, 158, 255, 0.7)";
				ctx.fillText("+", posX - 4, y + rightSideOffset + H / 2 + 2);

				// Draw positive checkbox
				ctx.strokeStyle = node._showPositive ? "#4a9eff" : "rgba(74, 158, 255, 0.7)";
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

		// Helper to check if node has connected inputs
		const hasConnectedInputs = () => {
			if (!node.inputs) return false;
			return node.inputs.some(i => i.name.startsWith("input_") && i.link !== null);
		};

		// Helper to get connected input labels (must be defined before mode widget)
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

		// Remove the default combo widget and replace with our own custom widget
		const originalModeWidget = node.widgets.find(w => w.name === "mode");
		if (originalModeWidget) {
			// Save the current value before removing
			const savedModeValue = originalModeWidget.value || "Combine";

			// Remove the original combo widget
			const modeIndex = node.widgets.indexOf(originalModeWidget);
			if (modeIndex > -1) {
				node.widgets.splice(modeIndex, 1);
			}

			// Create our own custom mode widget
			const modeWidget = {
				name: "mode",
				type: "custom",
				value: savedModeValue,
				options: { serialize: true },
				serializeValue: function() { return this.value; },
				computeSize: function(width) {
					return [width, 26 - 4];  // 26 is totalH, -4 cancels default gap
				},
				draw: function(ctx, n, width, y, height) {
					const totalH = 26;
					const marginY = 2;
					const H = totalH - marginY * 2;
					const margin = 15;
					const w = width - margin * 2;

					const isDisabled = !hasConnectedInputs();

					// Draw custom background
					ctx.fillStyle = isDisabled ? "rgba(0, 0, 0, 0.15)" : "rgba(0, 0, 0, 0.3)";
					ctx.beginPath();
					ctx.roundRect(margin, y + marginY, w, H, 12);
					ctx.fill();

					// Draw border
					ctx.strokeStyle = isDisabled ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.2)";
					ctx.lineWidth = 1;
					ctx.stroke();

					// Draw the text (current value) - centered, with emoji prefix
					ctx.fillStyle = isDisabled ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.7)";
					ctx.font = "12px Arial";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					let displayText;
					if (isDisabled) {
						displayText = "No Inputs";
					} else if (this.value === "Switch") {
						const labels = getConnectedInputLabels();
						const selected = labels.find(l => l.index === node._switchIndex);
						displayText = selected ? selected.label : (labels[0] ? labels[0].label : "Switch");
					} else {
						const displayMap = { "Randomize": "🎲 Roll", "Combine": "➕ Combine" };
						displayText = displayMap[this.value] || this.value || "";
					}
					ctx.fillText(displayText, width / 2 - 5, y + marginY + H * 0.5);

					// Draw dropdown arrow on right side (hidden when disabled)
					if (!isDisabled) {
						ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
						ctx.font = "12px Arial";
						ctx.textAlign = "right";
						ctx.fillText("⏷", width - margin - 10, y + marginY + H * 0.5);
					}

					return totalH;
				},
				mouse: function(event, pos, nodeRef) {
					if (event.type !== "pointerdown") return false;

					if (!hasConnectedInputs()) {
						return true; // Consume but do nothing
					}

					// Build menu options
					const menuOptions = [];
					const currentMode = this.value;
					const labels = getConnectedInputLabels();
					const hasMultipleInputs = labels.length > 1;

					// Add mode options at top (disabled if only 1 input)
					menuOptions.push({
						content: currentMode === "Randomize" ? "🎲 Roll  ✓" : "🎲 Roll",
						disabled: !hasMultipleInputs,
						callback: hasMultipleInputs ? () => {
							this.value = "Randomize";
							app.graph.setDirtyCanvas(true);
						} : null
					});
					menuOptions.push({
						content: currentMode === "Combine" ? "➕ Combine  ✓" : "➕ Combine",
						disabled: !hasMultipleInputs,
						callback: hasMultipleInputs ? () => {
							this.value = "Combine";
							app.graph.setDirtyCanvas(true);
						} : null
					});

					// Add separator and switch options if there are connected inputs
					if (labels.length > 0) {
						menuOptions.push(null); // separator

						for (const l of labels) {
							const isSelected = currentMode === "Switch" && l.index === node._switchIndex;
							menuOptions.push({
								content: isSelected ? `${l.label}  ✓` : l.label,
								callback: () => {
									this.value = "Switch";
									node._switchIndex = l.index;
									if (!node.properties) node.properties = {};
									node.properties.switchIndex = l.index;
									app.graph.setDirtyCanvas(true);
								}
							});
						}
					}

					// Show context menu
					const canvas = app.canvas;
					new LiteGraph.ContextMenu(menuOptions, {
						event: event,
						callback: null,
						scale: canvas.ds.scale
					}, canvas.getCanvasWindow());

					return true;
				}
			};

			// Insert our custom widget at the same position
			node.widgets.splice(modeIndex, 0, modeWidget);

			// Store reference for other code that needs it
			node._modeWidget = modeWidget;
		}

		// Initialize switch index from properties
		node._switchIndex = node.properties?.switchIndex || 1;

		// Add hidden widget to pass switch_index to Python
		const switchIndexWidget = {
			name: "switch_index",
			type: "hidden",
			value: 1,
			options: { serialize: true },
			serializeValue: () => node._switchIndex || 1,
			computeSize: () => [0, -4],
		};
		node.widgets.push(switchIndexWidget);

		// Update switch index validation on connections change
		const existingOnConnectionsChange = node.onConnectionsChange;
		node.onConnectionsChange = function() {
			existingOnConnectionsChange?.apply(this, arguments);
			const labels = getConnectedInputLabels();
			const modeWidget = node.widgets?.find(w => w.name === "mode");

			// When first input is connected, auto-set to Switch mode with that input selected
			if (labels.length === 1 && modeWidget) {
				modeWidget.value = "Switch";
				node._switchIndex = labels[0].index;
				if (!node.properties) node.properties = {};
				node.properties.switchIndex = node._switchIndex;
			}
			// Validate switch index is still valid
			else if (labels.length > 0 && !labels.find(l => l.index === node._switchIndex)) {
				node._switchIndex = labels[0].index;
				if (!node.properties) node.properties = {};
				node.properties.switchIndex = node._switchIndex;
			}
			app.graph.setDirtyCanvas(true);
		};

		// Insert menubar after mode widget
		const modeIndex = node.widgets.findIndex(w => w.name === "mode");
		if (modeIndex > -1) {
			node.widgets.splice(modeIndex + 1, 0, menubar);
		} else {
			node.widgets.push(menubar);
		}

		// Cap labels are now embedded inside the textboxes via CSS (fake cap trick)
		// No separate cap widgets needed - labels are positioned absolutely inside the textbox padding

		// Override onConfigure to restore widget values and preview state after node is loaded
		const originalOnConfigure = node.onConfigure;
		node.onConfigure = function(info) {
			// Mark as loaded from workflow - prevents default size override
			node._isNewlyCreated = false;

			// Save the size from workflow before anything modifies it
			const savedSize = info.size ? [...info.size] : null;

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
			if (info.properties?.executionTime !== undefined) {
				node._executionTime = info.properties.executionTime;
			}

			// Restore negative output text from saved properties
			if (info.properties?.negOutputText !== undefined) {
				node._negOutputText = info.properties.negOutputText;
			}

			// Clear stale "(disabled)" cache if node is actually enabled
			if (!node._isDisabled) {
				if (node._outputText === "(disabled)") {
					node._outputText = "";
					if (node.properties) node.properties.outputText = "";
				}
				if (node._negOutputText === "(disabled)") {
					node._negOutputText = "";
					if (node.properties) node.properties.negOutputText = "";
				}
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
				// Save current size before toggling preview
				const savedSize = [...node.size];
				node._showPreview = false;
				node._restoringPreview = true; // Flag to prevent auto-shrink
				togglePreview(true); // skipResize to preserve saved node size
				// Restore size after a delay to let preview widgets initialize
				setTimeout(() => {
					node.setSize(savedSize);
					node._restoringPreview = false;
					app.graph.setDirtyCanvas(true);
				}, 150);
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
			// Directly set state without triggering size recalculation
			if (info.properties?.showPositive === false) {
				node._showPositive = false;
				const textWidget = node.widgets?.find(w => w.name === "text");
				if (textWidget) {
					textWidget.type = "hidden";
					if (textWidget.inputEl) textWidget.inputEl.style.display = "none";
				}
			}
			if (info.properties?.showNegative === true) {
				node._showNegative = true;
				const negTextWidget = node.widgets?.find(w => w.name === "neg_text");
				if (negTextWidget) {
					negTextWidget.type = "customtext";
					if (negTextWidget.inputEl) negTextWidget.inputEl.style.display = "";
				}
			}

			// Caps are now embedded in textboxes via CSS - no insertion needed

			// Update output visibility based on chain output connection
			setTimeout(() => {
				// Check if chain output is connected
				const chainOutput = node.outputs?.find(o => o.name === "chain");
				const chainIsConnected = chainOutput?.links && chainOutput.links.length > 0;

				// Hide positive/negative if chain is connected (pass-through mode)
				if (chainIsConnected) {
					// Remove positive/negative outputs if they have no connections
					const posOutput = node.outputs?.find(o => o.name === "positive");
					const negOutput = node.outputs?.find(o => o.name === "negative");

					if (posOutput && (!posOutput.links || posOutput.links.length === 0)) {
						const idx = node.outputs.indexOf(posOutput);
						if (idx > -1) node.removeOutput(idx);
					}
					if (negOutput && (!negOutput.links || negOutput.links.length === 0)) {
						const idx = node.outputs.indexOf(negOutput);
						if (idx > -1) node.removeOutput(idx);
					}
				}

				// Restore saved size after all async operations
				if (savedSize) {
					node.setSize(savedSize);
				}
			}, 100);

			// Final size restoration after all delayed operations complete
			// This ensures the saved size is respected even after async work
			setTimeout(() => {
				if (savedSize) {
					node.setSize(savedSize);
					app.graph.setDirtyCanvas(true);
				}
			}, 200);
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
