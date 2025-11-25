import random
import time

class PromptChainSimple:
    """
    Simple text node with no inputs. Converts multiline text to comma-separated format.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = False
    FUNCTION = "process_text"
    CATEGORY = "text/prompt_chain"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def process_text(self, text):
        # Seed random generator with current time for true randomness
        random.seed(time.time())

        # Parse text field - process wildcards, handle commas and newlines
        if text.strip():
            # Replace newlines with | if the line doesn't end with comma
            # This allows multiline wildcard groups that terminate at commas
            lines = text.split('\n')
            processed_lines = []
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                # If line ends with comma, keep it; otherwise add | separator
                if line.endswith(','):
                    processed_lines.append(line)
                elif line.endswith('|'):
                    processed_lines.append(line)
                else:
                    processed_lines.append(line + ' |')

            # Join all lines and normalize separators
            all_text = ' '.join(processed_lines)
            # Clean up multiple separators
            while ' | |' in all_text:
                all_text = all_text.replace(' | |', ' |')

            # Split by comma to get AND groups
            parts = [part.strip() for part in all_text.split(',') if part.strip()]

            # Process wildcards (|) in each comma-separated part
            processed_parts = []
            for part in parts:
                # Remove trailing | if present
                part = part.rstrip('|').strip()
                if '|' in part:
                    # Split by | and randomly choose one option
                    options = [opt.strip() for opt in part.split('|') if opt.strip()]
                    if options:
                        processed_parts.append(random.choice(options))
                else:
                    if part:
                        processed_parts.append(part)

            text_combined = ", ".join(processed_parts)
        else:
            text_combined = ""

        return (text_combined,)


class PromptChain5:
    """
    Combines or randomly selects from up to 5 inputs and prepends text to result.
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
                "input_2": ("STRING", {"forceInput": True}),
                "input_3": ("STRING", {"forceInput": True}),
                "input_4": ("STRING", {"forceInput": True}),
                "input_5": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = False
    FUNCTION = "process"
    CATEGORY = "text/prompt_chain"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def process(self, mode, text, input_1="", input_2="", input_3="", input_4="", input_5=""):
        # Seed random generator with current time for true randomness
        random.seed(time.time())

        # Collect all non-empty inputs
        inputs = [inp.strip() for inp in [input_1, input_2, input_3, input_4, input_5] if inp and inp.strip()]

        # Parse text field - process wildcards, handle commas and newlines
        if text.strip():
            # First, normalize newlines by replacing them with spaces
            # But check if this is a multiline wildcard (lines ending with |)
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
                        # Split by | and randomly choose one option
                        options = [opt.strip() for opt in part.split('|') if opt.strip()]
                        if options:
                            processed_parts.append(random.choice(options))
                    else:
                        processed_parts.append(part)

                text_combined = ", ".join(processed_parts)
        else:
            text_combined = ""

        if mode == "Randomize":
            # Random Selection mode: build chain by selecting one input and prepending text
            if inputs:
                # Pick one random input
                selected_input = random.choice(inputs)

                # If text field has content, prepend it to the selected input
                if text_combined:
                    result = text_combined + ", " + selected_input
                else:
                    result = selected_input
            else:
                # No inputs, just return text
                result = text_combined

        else:  # mode == "Combine"
            # Combine mode: concatenate all inputs with text
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

            print(f"\nCombined: {result}\n")

        return (result,)


class PromptChain10:
    """
    Combines or randomly selects from up to 10 inputs and prepends text to result.
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
                "input_2": ("STRING", {"forceInput": True}),
                "input_3": ("STRING", {"forceInput": True}),
                "input_4": ("STRING", {"forceInput": True}),
                "input_5": ("STRING", {"forceInput": True}),
                "input_6": ("STRING", {"forceInput": True}),
                "input_7": ("STRING", {"forceInput": True}),
                "input_8": ("STRING", {"forceInput": True}),
                "input_9": ("STRING", {"forceInput": True}),
                "input_10": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = False
    FUNCTION = "process"
    CATEGORY = "text/prompt_chain"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def process(self, mode, text, input_1="", input_2="", input_3="", input_4="", input_5="",
                input_6="", input_7="", input_8="", input_9="", input_10=""):
        # Seed random generator with current time for true randomness
        random.seed(time.time())

        # Collect all non-empty inputs
        inputs = [inp.strip() for inp in [input_1, input_2, input_3, input_4, input_5,
                                           input_6, input_7, input_8, input_9, input_10] if inp and inp.strip()]

        # Parse text field - process wildcards, handle commas and newlines
        if text.strip():
            # First, normalize newlines by replacing them with spaces
            # But check if this is a multiline wildcard (lines ending with |)
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
                        # Split by | and randomly choose one option
                        options = [opt.strip() for opt in part.split('|') if opt.strip()]
                        if options:
                            processed_parts.append(random.choice(options))
                    else:
                        processed_parts.append(part)

                text_combined = ", ".join(processed_parts)
        else:
            text_combined = ""

        if mode == "Randomize":
            # Random Selection mode: build chain by selecting one input and prepending text
            if inputs:
                # Pick one random input
                selected_input = random.choice(inputs)

                # If text field has content, prepend it to the selected input
                if text_combined:
                    result = text_combined + ", " + selected_input
                else:
                    result = selected_input
            else:
                # No inputs, just return text
                result = text_combined

        else:  # mode == "Combine"
            # Combine mode: concatenate all inputs with text
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

            print(f"\nCombined: {result}\n")

        return (result,)


class PromptChainPreview:
    """
    Preview node that displays the current randomized output.
    Connect to any PromptChain output to see what's being generated.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_NODE = True
    FUNCTION = "preview"
    CATEGORY = "text/prompt_chain"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def preview(self, text, unique_id=None):
        # Pass through the text unchanged, but mark as output node for display
        return {"ui": {"text": [text]}, "result": (text,)}


NODE_CLASS_MAPPINGS = {
    "PromptChainSimple": PromptChainSimple,
    "PromptChain5": PromptChain5,
    "PromptChain10": PromptChain10,
    "PromptChainPreview": PromptChainPreview
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptChainSimple": "PromptChain Simple",
    "PromptChain5": "PromptChain 5",
    "PromptChain10": "PromptChain 10",
    "PromptChainPreview": "PromptChain Preview"
}
