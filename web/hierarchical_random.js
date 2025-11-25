import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "PromptChain.Preview",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PromptChainPreview") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);

                // Create or update the preview widget
                let widget = this.widgets?.find(w => w.name === "preview");

                if (!widget) {
                    // Add widget if it doesn't exist
                    widget = this.addWidget("text", "preview", "", () => {}, {
                        multiline: true,
                    });
                }

                // Update the widget with the received text
                if (message?.text && message.text.length > 0) {
                    widget.value = message.text[0];
                    this.setSize(this.computeSize());
                }
            };
        }
    }
});
