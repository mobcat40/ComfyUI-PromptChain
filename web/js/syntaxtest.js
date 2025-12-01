import { app } from "../../../scripts/app.js";

// Syntax highlighting test - isolated experimentation
app.registerExtension({
	name: "mobcat40.SyntaxTest",
	async nodeCreated(node) {
		if (node.constructor.comfyClass !== "SyntaxTest") {
			return;
		}

		console.log("[SyntaxTest] Node created, setting up syntax highlighting...");

		const setupSyntaxHighlighting = () => {
			const textWidget = node.widgets?.find(w => w.name === "text");
			if (!textWidget?.inputEl) {
				requestAnimationFrame(setupSyntaxHighlighting);
				return;
			}

			const textarea = textWidget.inputEl;
			console.log("[SyntaxTest] Found textarea:", textarea);
			console.log("[SyntaxTest] Parent:", textarea.parentElement);
			console.log("[SyntaxTest] Parent classes:", textarea.parentElement?.className);
			console.log("[SyntaxTest] Parent style:", textarea.parentElement?.style.cssText);

			// Get the wrapper div that ComfyUI creates around textareas
			const wrapper = textarea.parentElement;
			if (!wrapper) {
				console.log("[SyntaxTest] No wrapper found");
				return;
			}

			console.log("[SyntaxTest] Wrapper found:", wrapper.tagName, wrapper.className);

			// Make wrapper position relative for overlay positioning
			wrapper.style.position = "relative";

			// Create highlight overlay (sits behind textarea)
			const highlight = document.createElement("div");
			highlight.className = "syntax-highlight-overlay";

			// Match textarea styles exactly
			const computedStyle = window.getComputedStyle(textarea);
			highlight.style.cssText = `
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				pointer-events: none;
				white-space: pre-wrap;
				word-wrap: break-word;
				overflow: hidden;
				font-family: ${computedStyle.fontFamily};
				font-size: ${computedStyle.fontSize};
				line-height: ${computedStyle.lineHeight};
				padding: ${computedStyle.padding};
				border: ${computedStyle.border};
				box-sizing: border-box;
				color: #F8F8F2;
				background: rgba(0, 0, 0, 0.5);
				border-radius: 4px;
			`;

			// Insert highlight BEFORE textarea so textarea is on top
			wrapper.insertBefore(highlight, textarea);

			// Make textarea text TRANSPARENT so highlight shows through
			// The overlay behind provides the colored text
			textarea.style.background = "transparent";
			textarea.style.color = "transparent";  // KEY: text is invisible
			textarea.style.caretColor = "#fff";    // But caret stays visible
			textarea.style.position = "relative";
			textarea.style.zIndex = "1";

			// Syntax highlighting function
			const highlightSyntax = (text) => {
				if (!text) return "";

				// We need to escape HTML FIRST, then apply highlighting
				// But we need to do it carefully to not break our spans

				let result = "";
				let i = 0;

				while (i < text.length) {
					// Check for block comment
					if (text.slice(i, i + 2) === "/*") {
						const end = text.indexOf("*/", i + 2);
						if (end !== -1) {
							const comment = text.slice(i, end + 2);
							result += `<span class="syntax-comment">${escapeHtml(comment)}</span>`;
							i = end + 2;
							continue;
						}
					}

					// Check for line comment
					if (text.slice(i, i + 2) === "//") {
						const end = text.indexOf("\n", i);
						const comment = end !== -1 ? text.slice(i, end) : text.slice(i);
						result += `<span class="syntax-comment">${escapeHtml(comment)}</span>`;
						i = end !== -1 ? end : text.length;
						continue;
					}

					// Check for pipe or comma (operators)
					if (text[i] === "|" || text[i] === ",") {
						result += `<span class="syntax-operator">${text[i]}</span>`;
						i++;
						continue;
					}

					// Regular character
					result += escapeHtml(text[i]);
					i++;
				}

				return result;
			};

			const escapeHtml = (text) => {
				return text
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;");
			};

			// Sync highlight with textarea content
			const syncHighlight = () => {
				const text = textarea.value;
				highlight.innerHTML = highlightSyntax(text);

				// Sync scroll position
				highlight.scrollTop = textarea.scrollTop;
				highlight.scrollLeft = textarea.scrollLeft;
			};

			// Update on input
			textarea.addEventListener("input", syncHighlight);
			textarea.addEventListener("scroll", () => {
				highlight.scrollTop = textarea.scrollTop;
				highlight.scrollLeft = textarea.scrollLeft;
			});

			// Initial sync
			syncHighlight();

			// Add CSS for syntax colors
			const styleId = "syntax-test-styles";
			if (!document.getElementById(styleId)) {
				const style = document.createElement("style");
				style.id = styleId;
				style.textContent = `
					/* Monokai theme */
					.syntax-highlight-overlay {
						color: #F8F8F2;  /* default text */
					}
					.syntax-comment {
						color: #88846F !important;  /* lighter monokai comment */
						font-style: italic;
					}
					.syntax-operator {
						color: #F92672 !important;  /* pink - operators */
						font-weight: bold;
					}
				`;
				document.head.appendChild(style);
			}

			console.log("[SyntaxTest] Syntax highlighting setup complete!");
		};

		requestAnimationFrame(setupSyntaxHighlighting);
	}
});
