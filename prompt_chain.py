import random
import time
import os
import json

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
    Supports both positive and negative prompts bundled together through the chain.
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
                "neg_text": ("STRING", {"default": "", "multiline": True}),
            },
            "hidden": {
                "locked": ("BOOLEAN", {"default": False}),
                "cached_output": ("STRING", {"default": ""}),
                "cached_neg_output": ("STRING", {"default": ""}),
                "switch_index": ("INT", {"default": 1}),
                "disabled": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("output", "neg_output")
    OUTPUT_NODE = True
    FUNCTION = "process"
    CATEGORY = "text/prompt_chain"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def _process_text(self, text):
        """Process text field - handle wildcards, commas and newlines."""
        if not text or not text.strip():
            return ""

        lines = [line.strip() for line in text.split('\n') if line.strip()]

        # Check if this is multiline wildcard format (most lines end with |)
        pipe_endings = sum(1 for line in lines if line.endswith('|'))
        if pipe_endings > 0 and pipe_endings >= len(lines) - 1:
            # Multiline wildcard format: join with | and process as one group
            all_text = ' | '.join([line.rstrip('|,').strip() for line in lines])
            options = [opt.strip() for opt in all_text.split('|') if opt.strip()]
            if options:
                return random.choice(options)
            return ""
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

            return ", ".join(processed_parts)

    def _parse_input(self, value):
        """Parse input - could be JSON bundle or plain string."""
        if not value or not value.strip():
            return "", ""

        # Try to parse as JSON bundle
        try:
            data = json.loads(value)
            if isinstance(data, dict) and "pos" in data:
                return data.get("pos", ""), data.get("neg", "")
        except (json.JSONDecodeError, TypeError):
            pass

        # Plain string - treat as positive only
        return value.strip(), ""

    def _combine_with_mode(self, mode, text_combined, inputs, switch_index):
        """Combine text and inputs based on mode."""
        if mode == "Switch":
            # Find the selected input from inputs list (0-indexed)
            if switch_index <= len(inputs) and inputs[switch_index - 1]:
                selected_value = inputs[switch_index - 1]
                if text_combined:
                    return text_combined + ", " + selected_value
                return selected_value
            return text_combined

        elif mode == "Randomize":
            if inputs:
                selected_input = random.choice(inputs)
                if text_combined:
                    return text_combined + ", " + selected_input
                return selected_input
            return text_combined

        else:  # mode == "Combine"
            # Breadth-first: interleave tags across inputs so no branch dominates
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
                return ", ".join(interleaved)
            return ""

    def _deduplicate(self, result):
        """Deduplicate tags, left-to-right priority (first occurrence wins)."""
        if not result:
            return ""
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
        return ", ".join(deduped)

    def process(self, mode, text, neg_text="", locked=False, cached_output="", cached_neg_output="",
                switch_index=1, disabled=False, **kwargs):
        # Debug logging
        text_preview = text[:50] if text else ''
        neg_preview = neg_text[:50] if neg_text else ''
        debug_log(f"[PromptChain] mode={mode!r}, text={text_preview!r}, neg_text={neg_preview!r}, locked={locked}, disabled={disabled}")

        # If disabled, return empty bundle
        if disabled:
            empty_bundle = json.dumps({"pos": "", "neg": ""})
            return {"ui": {"text": ["(disabled)"], "neg_text": ["(disabled)"]}, "result": (empty_bundle, "")}

        # If locked and we have cached output, return it without re-processing
        if locked and cached_output:
            # Try to parse cached output as JSON bundle
            try:
                data = json.loads(cached_output)
                pos = data.get("pos", cached_output)
                neg = data.get("neg", cached_neg_output)
            except:
                pos = cached_output
                neg = cached_neg_output
            bundle = json.dumps({"pos": pos, "neg": neg})
            return {"ui": {"text": [pos], "neg_text": [neg]}, "result": (bundle, neg)}

        # Seed random generator with current time for true randomness
        random.seed(time.time())

        # Collect inputs from kwargs (dynamic input_N slots)
        # Each input may be a JSON bundle containing both pos and neg
        pos_inputs = []
        neg_inputs = []
        i = 1
        while f"input_{i}" in kwargs:
            value = kwargs[f"input_{i}"]
            if value and value.strip():
                pos_part, neg_part = self._parse_input(value)
                if pos_part:
                    pos_inputs.append(pos_part)
                if neg_part:
                    neg_inputs.append(neg_part)
            i += 1

        # Process this node's text fields
        pos_text_combined = self._process_text(text)
        neg_text_combined = self._process_text(neg_text)

        debug_log(f"[PromptChain] pos_text_combined={pos_text_combined!r}, neg_text_combined={neg_text_combined!r}")
        debug_log(f"[PromptChain] pos_inputs={pos_inputs}, neg_inputs={neg_inputs}")

        # Combine with mode for positive
        pos_result = self._combine_with_mode(mode, pos_text_combined, pos_inputs, switch_index)
        pos_result = self._deduplicate(pos_result)

        # Combine with mode for negative (same logic)
        neg_result = self._combine_with_mode(mode, neg_text_combined, neg_inputs, switch_index)
        neg_result = self._deduplicate(neg_result)

        debug_log(f"[PromptChain] FINAL pos_result={pos_result!r}, neg_result={neg_result!r}")

        # Bundle pos and neg together as JSON for the output wire
        bundle = json.dumps({"pos": pos_result, "neg": neg_result})

        # Return: output is the bundle (for chaining), neg_output is just the neg string (for CLIP-)
        return {"ui": {"text": [pos_result], "neg_text": [neg_result]}, "result": (bundle, neg_result)}


NODE_CLASS_MAPPINGS = {
    "PromptChain": PromptChain,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptChain": "PromptChain",
}
