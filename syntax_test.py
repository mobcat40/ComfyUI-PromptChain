class SyntaxTest:
    """Minimal test node for syntax highlighting experiments."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"default": "// comment test\nred | blue | green\n/* block\ncomment */\nhello, world", "multiline": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "PromptChain_Experimental"

    def process(self, text):
        return (text,)


NODE_CLASS_MAPPINGS = {
    "SyntaxTest": SyntaxTest,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SyntaxTest": "Syntax Test",
}
