import random
import time


class PromptChain:
    """
    Dynamic input version - accepts unlimited inputs via JS-managed dynamic slots.
    Combines or randomly selects from any number of inputs and prepends text to result.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["Randomize", "Combine"],),
                "text": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "input_1": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "locked": ("BOOLEAN", {"default": False}),
                "cached_output": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = True
    FUNCTION = "process"
    CATEGORY = "text/prompt_chain"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def process(self, mode, text, locked=False, cached_output="", **kwargs):
        # If locked and we have cached output, return it without re-processing
        if locked and cached_output:
            return {"ui": {"text": [cached_output]}, "result": (cached_output,)}

        # Seed random generator with current time for true randomness
        random.seed(time.time())

        # Collect all non-empty inputs from kwargs (dynamic input_N slots)
        inputs = []
        i = 1
        while f"input_{i}" in kwargs:
            value = kwargs[f"input_{i}"]
            if value and value.strip():
                inputs.append(value.strip())
            i += 1

        # Parse text field - process wildcards, handle commas and newlines
        if text.strip():
            lines = [line.strip() for line in text.split('\n') if line.strip()]

            # Check if this is multiline wildcard format (most lines end with |)
            pipe_endings = sum(1 for line in lines if line.endswith('|'))
            if pipe_endings > 0 and pipe_endings >= len(lines) - 1:
                # Multiline wildcard format: join with | and process as one group
                all_text = ' | '.join([line.rstrip('|,').strip() for line in lines])
                options = [opt.strip() for opt in all_text.split('|') if opt.strip()]
                if options:
                    text_combined = random.choice(options)
                else:
                    text_combined = ""
            else:
                # Standard format: join lines, split by commas, process wildcards
                all_text = " ".join(lines)
                parts = [part.strip() for part in all_text.split(',') if part.strip()]

                # Process wildcards (|) in each comma-separated part
                processed_parts = []
                for part in parts:
                    if '|' in part:
                        options = [opt.strip() for opt in part.split('|') if opt.strip()]
                        if options:
                            processed_parts.append(random.choice(options))
                    else:
                        processed_parts.append(part)

                text_combined = ", ".join(processed_parts)
        else:
            text_combined = ""

        if mode == "Randomize":
            if inputs:
                selected_input = random.choice(inputs)
                if text_combined:
                    result = text_combined + ", " + selected_input
                else:
                    result = selected_input
            else:
                result = text_combined
        else:  # mode == "Combine"
            if text_combined:
                if inputs:
                    result = ", ".join([text_combined] + inputs)
                else:
                    result = text_combined
            else:
                if inputs:
                    result = ", ".join(inputs)
                else:
                    result = ""

        # Deduplicate tags, left-to-right priority (first occurrence wins)
        # Early nodes = intentional placement, later duplicates = accidental/network effects
        # Skip special tags like [BREAK] that should always be preserved
        if result:
            parts = [p.strip() for p in result.split(',') if p.strip()]
            seen = set()
            deduped = []
            for part in parts:
                lower = part.lower()
                # Always keep special tags like [BREAK], don't dedupe them
                if lower.startswith('[') and lower.endswith(']'):
                    deduped.append(part)
                elif lower not in seen:
                    seen.add(lower)
                    deduped.append(part)
            result = ", ".join(deduped)

        return {"ui": {"text": [result]}, "result": (result,)}


NODE_CLASS_MAPPINGS = {
    "PromptChain": PromptChain,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptChain": "PromptChain",
}
