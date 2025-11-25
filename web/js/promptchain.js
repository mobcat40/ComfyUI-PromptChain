import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

// Display preview text on PromptChain nodes after execution

app.registerExtension({
	name: "mobcat40.PromptChain.Preview",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "PromptChainSimple" || nodeData.name === "PromptChain5" || nodeData.name === "PromptChain10") {
			// Create empty preview widget on node creation
			const onNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function () {
				onNodeCreated?.apply(this, arguments);
				// Add one empty preview widget
				const w = ComfyWidgets["STRING"](this, "preview_0", ["STRING", { multiline: true }], app).widget;
				w.inputEl.readOnly = true;
				w.inputEl.style.opacity = 0.6;
				w.value = "";
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
				// Add empty preview widget
				const w = ComfyWidgets["STRING"](this, "preview_0", ["STRING", { multiline: true }], app).widget;
				w.inputEl.readOnly = true;
				w.inputEl.style.opacity = 0.6;
				w.value = "";
			};
		}
	}
});
