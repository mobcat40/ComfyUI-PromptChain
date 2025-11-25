import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "PromptChain.Preview",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PromptChainPreview") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);

                // Create or update the preview widget
                if (!this.widgets || this.widgets.length === 0) {
                    const widget = this.addWidget("text", "preview", "", () => {}, {
                        multiline: true,
                    });
                }

                // Update the widget with the received text
                const widget = this.widgets[0];
                if (message?.string && message.string.length > 0) {
                    widget.value = message.string[0];
                } else if (message?.text && message.text.length > 0) {
                    widget.value = message.text[0];
                }

                this.onResize?.(this.size);
            };
        }
    }
});
