import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "PromptChain.Preview",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PromptChainPreview") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onNodeCreated?.apply(this, arguments);

                // Add a text widget to display the preview
                this.addWidget("text", "preview", "", () => {}, {
                    multiline: true,
                    lines: 10,
                });

                return result;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);

                // Update the preview widget with the received text
                if (message.text && message.text.length > 0) {
                    const widget = this.widgets.find(w => w.name === "preview");
                    if (widget) {
                        widget.value = message.text[0];
                    }
                }
            };
        }
    }
});
