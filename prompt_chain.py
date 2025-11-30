import random
import time
import os

# Debug log file
DEBUG_LOG = os.path.join(os.path.dirname(__file__), "debug.log")

def debug_log(msg):
    with open(DEBUG_LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)


class PromptChain:
    """
    Dynamic input version - accepts unlimited inputs via JS-managed dynamic slots.
    Combines or randomly selects from any number of inputs and prepends text to result.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["Randomize", "Combine", "Switch"],),
                "text": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "input_1": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "locked": ("BOOLEAN", {"default": False}),
                "cached_output": ("STRING", {"default": ""}),
                "switch_index": ("INT", {"default": 1}),
                "disabled": ("BOOLEAN", {"default": False}),
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

    def process(self, mode, text, locked=False, cached_output="", switch_index=1, disabled=False, **kwargs):
        # Debug logging
        text_preview = text[:50] if text else ''
        debug_log(f"[PromptChain] mode={mode!r}, text={text_preview!r}, locked={locked}, disabled={disabled}, kwargs={kwargs}")

        # If disabled, return empty string (this node's output is ignored)
        if disabled:
            return {"ui": {"text": ["(disabled)"]}, "result": ("",)}

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

        debug_log(f"[PromptChain] BEFORE MODE CHECK: mode={mode!r}, text_combined={text_combined!r}, inputs={inputs}")
        if mode == "Switch":
            debug_log(f"[PromptChain] SWITCH BRANCH, switch_index={switch_index}")
            # Switch mode: only pass through the selected input
            selected_key = f"input_{switch_index}"
            selected_value = kwargs.get(selected_key, "")
            if selected_value and selected_value.strip():
                if text_combined:
                    result = text_combined + ", " + selected_value.strip()
                else:
                    result = selected_value.strip()
            else:
                result = text_combined
            debug_log(f"[PromptChain] SWITCH result={result!r}")
        elif mode == "Randomize":
            debug_log(f"[PromptChain] RANDOMIZE BRANCH")
            if inputs:
                selected_input = random.choice(inputs)
                debug_log(f"[PromptChain] selected_input={selected_input!r}")
                if text_combined:
                    result = text_combined + ", " + selected_input
                else:
                    result = selected_input
            else:
                result = text_combined
            debug_log(f"[PromptChain] RANDOMIZE result={result!r}")
        else:  # mode == "Combine"
            debug_log(f"[PromptChain] COMBINE BRANCH")
            # Breadth-first: interleave tags across inputs so no branch dominates
            # Split each input into tag lists
            tag_lists = []
            if text_combined:
                tag_lists.append([t.strip() for t in text_combined.split(',') if t.strip()])
            for inp in inputs:
                tags = [t.strip() for t in inp.split(',') if t.strip()]
                if tags:
                    tag_lists.append(tags)

            if tag_lists:
                # Round-robin across all tag lists
                interleaved = []
                max_len = max(len(t) for t in tag_lists)
                for i in range(max_len):
                    for tags in tag_lists:
                        if i < len(tags):
                            interleaved.append(tags[i])
                result = ", ".join(interleaved)
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
