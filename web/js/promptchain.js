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
		node.size = [210, 136];

		// Make text widget transparent until focused (only if empty)
		// Use setTimeout to wait for widget DOM element to be created
		const setupTextOpacity = () => {
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (textWidget?.inputEl) {
				const updateOpacity = () => {
					const hasText = textWidget.inputEl.value.trim().length > 0;
					textWidget.inputEl.style.opacity = hasText ? 1.0 : 0.3;
				};
				updateOpacity();
				textWidget.inputEl.addEventListener("focus", () => {
					textWidget.inputEl.style.opacity = 1.0;
				});
				textWidget.inputEl.addEventListener("blur", updateOpacity);
				textWidget.inputEl.addEventListener("input", updateOpacity);
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

// Display preview text on PromptChain nodes after execution

app.registerExtension({
	name: "mobcat40.PromptChain.Preview",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "PromptChain") {
			// Create empty preview widget on node creation
			const onNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function () {
				onNodeCreated?.apply(this, arguments);

				// Add custom toggle for show/hide preview
				this.addCustomWidget({
					name: "show_preview",
					type: "custom_toggle",
					value: false,
					draw: function(ctx, node, width, y) {
						const buttonWidth = 80;
						const buttonHeight = 20;
						const x = width - buttonWidth - 10;

						// Draw button background with rounded corners
						ctx.fillStyle = this.value ? "#4CAF50" : "#757575";
						ctx.beginPath();
						ctx.roundRect(x, y, buttonWidth, buttonHeight, 4);
						ctx.fill();

						// Draw button text
						ctx.fillStyle = "#FFFFFF";
						ctx.font = "12px Arial";
						ctx.textAlign = "center";
						ctx.textBaseline = "middle";
						ctx.fillText(this.value ? "Showing" : "Preview", x + buttonWidth / 2, y + buttonHeight / 2);

						return buttonHeight + 4;
					},
					mouse: function(event, pos, node) {
						const buttonWidth = 80;
						const buttonHeight = 20;
						const width = node.size[0];
						const x = width - buttonWidth - 10;
						const y = this.last_y;

						if (event.type === "pointerdown" &&
							pos[0] >= x && pos[0] <= x + buttonWidth &&
							pos[1] >= y && pos[1] <= y + buttonHeight) {
							this.value = !this.value;

							// Toggle creates or removes preview widgets entirely
							if (node.widgets) {
								if (!this.value) {
									// Remove all preview widgets when turning off
									for (let w of node.widgets) {
										if (w.name && w.name.startsWith("preview_")) {
											w.onRemove?.();
										}
									}
									node.widgets = node.widgets.filter(w => !w.name || !w.name.startsWith("preview_"));
								}
								// If turning on, widgets will be created on next execution
								// Force node to recompute size (preserve width)
								const currentWidth = node.size[0];
								const sz = node.computeSize();
								sz[0] = currentWidth;
								node.setSize(sz);
								node.setDirtyCanvas(true, true);
							}
							return true;
						}
					}
				});

				// Don't create any preview widgets initially - they'll be created on execution if toggle is on
			};

			function populate(text) {
				if (this.widgets) {
					// Remove existing preview widgets (keep any input widgets)
					const startIdx = 0;
					for (let i = startIdx; i < this.widgets.length; i++) {
						if (this.widgets[i].name && this.widgets[i].name.startsWith("preview_")) {
							this.widgets[i].onRemove?.();
						}
					}
					// Filter out preview widgets
					this.widgets = this.widgets.filter(w => !w.name || !w.name.startsWith("preview_"));
				}

				// Check toggle state
				const toggleWidget = this.widgets?.find(w => w.name === "show_preview");
				const isPreviewVisible = toggleWidget ? toggleWidget.value : false;

				// Only create preview widgets if toggle is ON
				if (isPreviewVisible) {
					const v = [...text];
					if (!v[0]) {
						v.shift();
					}
					for (let list of v) {
						// Force list to be an array
						if (!(list instanceof Array)) list = [list];
						for (const l of list) {
							const w = ComfyWidgets["STRING"](this, "preview_" + (this.widgets?.length ?? 0), ["STRING", { multiline: true }], app).widget;
							w.inputEl.readOnly = true;
							w.inputEl.style.opacity = 0.6;
							w.value = l;
						}
					}
				}

				requestAnimationFrame(() => {
					const sz = this.computeSize();
					if (sz[0] < this.size[0]) {
						sz[0] = this.size[0];
					}
					if (sz[1] < this.size[1]) {
						sz[1] = this.size[1];
					}
					this.onResize?.(sz);
					app.graph.setDirtyCanvas(true, false);
				});
			}

			// When the node is executed, display the text
			const onExecuted = nodeType.prototype.onExecuted;
			nodeType.prototype.onExecuted = function (message) {
				// Populate FIRST to avoid other extensions' errors blocking display
				if (message?.text) {
					populate.call(this, message.text);
				}
				onExecuted?.apply(this, arguments);
			};

			// Restore on configure (when loading workflow)
			const VALUES = Symbol();
			const configure = nodeType.prototype.configure;
			nodeType.prototype.configure = function () {
				// Store widget values before configure modifies them
				this[VALUES] = arguments[0]?.widgets_values;
				return configure?.apply(this, arguments);
			};

			const onConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function () {
				onConfigure?.apply(this, arguments);
				// Don't restore preview widgets from saved workflow - they'll be regenerated on next execution
				// Remove any preview widgets that might have been saved
				if (this.widgets) {
					this.widgets = this.widgets.filter(w => !w.name || !w.name.startsWith("preview_"));
				}

				// Add custom toggle for show/hide preview if not already present
				const hasToggle = this.widgets?.some(w => w.name === "show_preview");
				if (!hasToggle) {
					this.addCustomWidget({
						name: "show_preview",
						type: "custom_toggle",
						value: false,
						draw: function(ctx, node, width, y) {
							const buttonWidth = 80;
							const buttonHeight = 20;
							const x = width - buttonWidth - 10;

							// Draw button background with rounded corners
							ctx.fillStyle = this.value ? "#4CAF50" : "#757575";
							ctx.beginPath();
							ctx.roundRect(x, y, buttonWidth, buttonHeight, 4);
							ctx.fill();

							// Draw button text
							ctx.fillStyle = "#FFFFFF";
							ctx.font = "12px Arial";
							ctx.textAlign = "center";
							ctx.textBaseline = "middle";
							ctx.fillText(this.value ? "Showing" : "Preview", x + buttonWidth / 2, y + buttonHeight / 2);

							return buttonHeight + 4;
						},
						mouse: function(event, pos, node) {
							const buttonWidth = 80;
							const buttonHeight = 20;
							const width = node.size[0];
							const x = width - buttonWidth - 10;
							const y = this.last_y;

							if (event.type === "pointerdown" &&
								pos[0] >= x && pos[0] <= x + buttonWidth &&
								pos[1] >= y && pos[1] <= y + buttonHeight) {
								this.value = !this.value;

								// Toggle creates or removes preview widgets entirely
								if (node.widgets) {
									if (!this.value) {
										// Remove all preview widgets when turning off
										for (let w of node.widgets) {
											if (w.name && w.name.startsWith("preview_")) {
												w.onRemove?.();
											}
										}
										node.widgets = node.widgets.filter(w => !w.name || !w.name.startsWith("preview_"));
									}
									// If turning on, widgets will be created on next execution
									// Force node to recompute size (preserve width)
									const currentWidth = node.size[0];
									const sz = node.computeSize();
									sz[0] = currentWidth;
									node.setSize(sz);
									node.setDirtyCanvas(true, true);
								}
								return true;
							}
						}
					});
				}

				// Don't create any preview widgets initially - they'll be created on execution if toggle is on
			};
		}
	}
});
