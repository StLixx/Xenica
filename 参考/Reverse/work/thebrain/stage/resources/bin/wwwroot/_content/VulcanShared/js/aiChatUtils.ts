import {safeInvoke} from "./interop.js";

/**
 * Utilities for AI chat component auto-scrolling behavior
 */
export class AiChatUtils {
	private static autoScrollEnabled: boolean = true;
	private static scrollContainer: HTMLElement | null = null;
	private static inputBlockObserver: ResizeObserver | null = null; // Observer for input block height changes
	private static linkInterceptor: { container: HTMLElement, handler: (e: Event) => void } | null = null;
	private static sentinelObserver: IntersectionObserver | null = null;

	/**
	 * Enable auto-scroll for the chat container and attach scroll listener
	 * @param containerId - The ID of the chat container element
	 */
	public static enableAutoScroll(containerId: string): void {
		AiChatUtils.autoScrollEnabled = true;
		AiChatUtils.scrollContainer = document.getElementById(containerId);

		if (!AiChatUtils.scrollContainer) {
			console.warn(`AiChatUtils: Container with ID '${containerId}' not found`);
			return;
		}

		// Listen for manual scroll events to detect user interaction
		AiChatUtils.scrollContainer.addEventListener('scroll', AiChatUtils.onUserScroll, { passive: true });
	}

	/**
	 * Scroll the chat container to the bottom if auto-scroll is enabled
	 * @param containerId - The ID of the chat container element
	 */
	public static scrollToBottom(containerId: string): void {
		if (!AiChatUtils.autoScrollEnabled) {
			return;
		}

		const container = document.getElementById(containerId);
		if (!container) {
			console.warn(`AiChatUtils: Container with ID '${containerId}' not found`);
			return;
		}

		container.scrollTo({
			top: container.scrollHeight,
			behavior: 'auto'
		});
	}

	/**
	 * Force the chat container to scroll to the bottom regardless of auto-scroll state,
	 * and re-enable auto-scroll. Used when the user taps the input on mobile — that's an
	 * explicit "I want to see the latest message" signal.
	 * @param containerId - The ID of the chat container element
	 */
	public static scrollToBottomForced(containerId: string): void {
		const container = document.getElementById(containerId);
		if (!container) {
			console.warn(`AiChatUtils: Container with ID '${containerId}' not found`);
			return;
		}

		AiChatUtils.autoScrollEnabled = true;
		container.scrollTo({
			top: container.scrollHeight,
			behavior: 'smooth'
		});
	}

	/**
	 * Detect user scroll position and adjust auto-scroll accordingly (sticky behavior)
	 * - Enables auto-scroll when user scrolls back to bottom
	 * - Disables auto-scroll when user scrolls up
	 */
	private static onUserScroll = (): void => {
		if (!AiChatUtils.scrollContainer) {
			return;
		}

		const container = AiChatUtils.scrollContainer;
		const scrollTop = container.scrollTop;
		const scrollHeight = container.scrollHeight;
		const clientHeight = container.clientHeight;

		// Check if user is near the bottom (within 50px threshold)
		const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
		const isAtBottom = distanceFromBottom <= 50;

		// Sticky auto-scroll: Enable when user scrolls back to bottom, disable when they scroll up
		if (isAtBottom) {
			AiChatUtils.autoScrollEnabled = true;
		} else {
			AiChatUtils.autoScrollEnabled = false;
		}
	}

	/**
	 * Re-enable auto-scroll and scroll to bottom
	 * Called when user submits a new prompt
	 * @param containerId - The ID of the chat container element
	 */
	public static resetAutoScroll(containerId: string): void {
		AiChatUtils.autoScrollEnabled = true;
		AiChatUtils.scrollToBottom(containerId);
	}

	/**
	 * Scrolls an element into view within its scrollable container
	 * Uses 'nearest' block to minimize scrolling - only scrolls if element is out of view
	 * @param elementId The ID of the element to scroll into view
	 */
	public static scrollElementIntoView(elementId: string): void {
		const element = document.getElementById(elementId);
		if (element) {
			element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
		}
	}

	/**
	 * Attach link click interception to a container so links are opened through .NET/UrlOpener instead of navigating inside the WebView.
	 * @param containerId - The ID of the chat container element
	 * @param dotNetRef - DotNetObjectReference to the component
	 * @param method - JSInvokable method name to call with the URL
	 */
	public static attachLinkInterceptor(containerId: string, dotNetRef: any, method: string): void {
		const container = document.getElementById(containerId);
		if(!container || !dotNetRef || !method) {
			console.warn(`AiChatUtils: attachLinkInterceptor missing container or dotNetRef for '${containerId}'`);
			return;
		}

		// Clean up any previous handler first
		if(AiChatUtils.linkInterceptor) {
			AiChatUtils.linkInterceptor.container.removeEventListener('click', AiChatUtils.linkInterceptor.handler);
			AiChatUtils.linkInterceptor = null;
		}

		const handler = (event: Event) => {
			const target = event.target as HTMLElement | null;
			if(!target) {
				return;
			}

			const anchor = target.closest('a');
			if(!anchor) {
				return;
			}

			const href = anchor.getAttribute('href');
			if(!href) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			safeInvoke(dotNetRef, method, [href]);
		};

		container.addEventListener('click', handler);
		AiChatUtils.linkInterceptor = {container, handler};
	}

	/**
	 * Cleanup event listeners and reset state
	 * Called when component is disposed
	 */
	public static cleanup(): void {
		if(AiChatUtils.scrollContainer) {
			AiChatUtils.scrollContainer.removeEventListener('scroll', AiChatUtils.onUserScroll);
			AiChatUtils.scrollContainer = null;
		}

		// Cleanup ResizeObserver
		if(AiChatUtils.inputBlockObserver) {
			AiChatUtils.inputBlockObserver.disconnect();
			AiChatUtils.inputBlockObserver = null;
		}

		// Cleanup link interceptor
		if(AiChatUtils.linkInterceptor) {
			AiChatUtils.linkInterceptor.container.removeEventListener('click', AiChatUtils.linkInterceptor.handler);
			AiChatUtils.linkInterceptor = null;
		}

		AiChatUtils.disconnectSentinel();

		AiChatUtils.autoScrollEnabled = true;
	}

	/**
	 * Auto-resize textarea to fit content, expanding upwards
	 * @param textareaId - The ID of the textarea element
	 * @param minRows - Minimum number of rows (default 1)
	 * @param maxRows - Maximum number of rows before scrolling (default 10)
	 */
	public static autoResizeTextarea(textareaId: string, minRows: number = 1, maxRows: number = 10): void {
		const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
		if (!textarea) {
			console.warn(`AiChatUtils: Textarea with ID '${textareaId}' not found`);
			return;
		}

		// Store current scroll position to prevent jump
		const scrollPos = textarea.scrollTop;

		// Reset height to auto to get the actual scrollHeight
		textarea.style.height = 'auto';

		// Get computed line height
		const computedStyle = getComputedStyle(textarea);
		const lineHeight = parseFloat(computedStyle.lineHeight);
		const paddingTop = parseFloat(computedStyle.paddingTop);
		const paddingBottom = parseFloat(computedStyle.paddingBottom);

		// Calculate min and max heights
		const minHeight = (lineHeight * minRows) + paddingTop + paddingBottom;
		const maxHeight = (lineHeight * maxRows) + paddingTop + paddingBottom;

		// Set new height based on content
		const contentHeight = textarea.scrollHeight;
		const newHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);

		textarea.style.height = `${newHeight}px`;

		// Show scrollbar only if content exceeds max height
		textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';

		// Restore scroll position
		textarea.scrollTop = scrollPos;
	}

	/**
	 * Setup textarea auto-resize on input events
	 * @param textareaId - The ID of the textarea element
	 * @param minRows - Minimum number of rows
	 * @param maxRows - Maximum number of rows
	 */
	public static setupTextareaAutoResize(textareaId: string, minRows: number = 1, maxRows: number = 10): void {
		const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
		if (!textarea) {
			console.warn(`AiChatUtils: Textarea with ID '${textareaId}' not found`);
			return;
		}

		// Handle Enter key to prevent default when not using Shift
		// Also handle arrow keys when slash menu is open
		textarea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault(); // Prevent newline on submit
			}

			// Prevent arrow keys from moving cursor when slash menu or mention menu is open
			const slashMenuOpen = textarea.getAttribute('data-slash-menu-open') === 'true';
			const mentionMenuOpen = textarea.getAttribute('data-mention-menu-open') === 'true';
			if ((slashMenuOpen || mentionMenuOpen) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'p')))) {
				e.preventDefault();
			}
		});

		// Auto-resize on initial setup
		AiChatUtils.autoResizeTextarea(textareaId, minRows, maxRows);
	}

	/**
	 * Observe input block height changes and update chat container padding
	 * @param inputBlockSelector - CSS selector for the input block element
	 * @param chatContainerId - The ID of the chat container element
	 */
	public static observeInputBlockHeight(inputBlockSelector: string, chatContainerId: string): void {
		const inputBlock = document.querySelector(inputBlockSelector) as HTMLElement;
		const chatContainer = document.getElementById(chatContainerId);

		if (!inputBlock || !chatContainer) {
			console.warn(`AiChatUtils: Could not find input block or chat container`);
			return;
		}

		// Create ResizeObserver to watch input block size changes
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				// Get the full height of the input block including borders/padding
				const inputBlockHeight = entry.target.getBoundingClientRect().height;

				// Add extra spacing: bottom-4 offset (1rem = 16px) + 1rem buffer
				const bottomOffset = 16; // bottom-4 = 1rem
				const bufferSpace = 16; // 1rem buffer
				const totalPadding = inputBlockHeight + bottomOffset + bufferSpace;

					// Set CSS variables on root container so both chat area and welcome screen can access them
				const root = chatContainer.parentElement;
				if (root) {
					root.style.setProperty('--input-block-height', `${totalPadding}px`);
					root.style.setProperty('--input-bar-height', `${inputBlockHeight}px`);
				}
			}
		});

		// Start observing
		resizeObserver.observe(inputBlock);

		// Store observer for cleanup
		AiChatUtils.inputBlockObserver = resizeObserver;
	}

	// ============================================
	// ContentEditable support for @ mentions
	// ============================================

	/**
	 * Extract text from contenteditable, converting thought spans to [[thought:...]] format
	 * @param elementId - The ID of the contenteditable element
	 */
	public static getContentEditableText(elementId: string): string {
		const element = document.getElementById(elementId);
		if (!element) return '';

		let result = '';
		const walkNodes = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				result += node.textContent || '';
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				if (el.classList.contains('thought-ref')) {
					const thoughtId = el.getAttribute('data-thought-id');
					const thoughtName = el.textContent;
					result += `[[thought:${thoughtId}|${thoughtName}]]`;
				} else if (el.tagName === 'BR') {
					result += '\n';
				} else {
					// For block elements, add newline before (except first)
					const isBlock = ['DIV', 'P'].includes(el.tagName);
					if (isBlock && result.length > 0 && !result.endsWith('\n')) {
						result += '\n';
					}
					for (const child of el.childNodes) {
						walkNodes(child);
					}
				}
			}
		};

		for (const child of element.childNodes) {
			walkNodes(child);
		}

		// Trim trailing newlines/whitespace that browsers leave behind when content is deleted
		// This ensures empty contenteditables return empty string for proper placeholder display
		return result.replace(/^\s+$/, '').replace(/\n+$/, '');
	}

	/**
	 * Insert a thought mention span at current cursor position, replacing @searchText
	 * @param elementId - The ID of the contenteditable element
	 * @param thoughtId - The GUID of the thought
	 * @param thoughtName - The display name of the thought
	 * @param charsToDelete - Number of characters to delete (including @)
	 * @param iconUrl - Optional URL for the thought's icon image
	 */
	public static insertThoughtMention(
		elementId: string,
		thoughtId: string,
		thoughtName: string,
		charsToDelete: number,
		iconUrl: string | null = null
	): void {
		const element = document.getElementById(elementId);
		if (!element) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		// Delete the @searchText by moving back and deleting
		for (let i = 0; i < charsToDelete; i++) {
			selection.modify('extend', 'backward', 'character');
		}

		// Get the updated range after extending selection
		const range = selection.getRangeAt(0);

		// Delete the selected text
		range.deleteContents();

		// Create the thought span
		const span = document.createElement('span');
		span.className = 'thought-ref bg-vapp-accent-primary/20 text-vapp-accent-primary border border-vapp-accent-primary/30 rounded-md px-1 inline-flex items-center gap-1';
		span.setAttribute('data-thought-id', thoughtId);
		span.setAttribute('contenteditable', 'false');

		// Add icon if URL provided
		if (iconUrl) {
			const img = document.createElement('img');
			img.src = iconUrl;
			img.className = 'w-4 h-4 rounded-sm inline-block';
			img.loading = 'lazy';
			span.appendChild(img);
		}

		// Add the thought name text
		span.appendChild(document.createTextNode(`${thoughtName}`));

		// Insert the span
		range.insertNode(span);

		// Move cursor after the span
		range.setStartAfter(span);
		range.setEndAfter(span);
		selection.removeAllRanges();
		selection.addRange(range);

		// Add a space after (improves UX)
		const space = document.createTextNode(' ');
		range.insertNode(space);
		range.setStartAfter(space);
		range.setEndAfter(space);
		selection.removeAllRanges();
		selection.addRange(range);

		element.focus();
	}

	/**
	 * Auto-resize contenteditable div based on content
	 * @param elementId - The ID of the contenteditable element
	 */
	public static autoResizeContentEditable(elementId: string): void {
		const element = document.getElementById(elementId);
		if (!element) return;

		// Snapshot current rendered height so the stylesheet transition on `height`
		// has a real "from" value to animate from.
		const currentHeight = element.getBoundingClientRect().height;

		// Suppress the transition while we reset to `auto` and measure — the implicit
		// layout from reading scrollHeight would otherwise commit `auto` as the current
		// value, leaving zero animation distance to the final newHeight.
		const previousInlineTransition = element.style.transition;
		element.style.transition = 'none';
		element.style.height = 'auto';

		const computedStyle = getComputedStyle(element);
		const minHeight = parseFloat(computedStyle.minHeight) || 24;
		const maxHeight = parseFloat(computedStyle.maxHeight) || 240;
		const contentHeight = element.scrollHeight;
		const newHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);

		// Restore the previously-rendered height (still no transition), then force a
		// reflow so it's committed before re-enabling the transition.
		element.style.height = `${currentHeight}px`;
		void element.offsetHeight;

		element.style.transition = previousInlineTransition;
		element.style.height = `${newHeight}px`;
		element.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
	}

	/**
	 * Setup contenteditable with keyboard handling. Paste formatting is stripped
	 * by the element's contenteditable="plaintext-only" attribute, so no paste
	 * listener is needed here.
	 * @param elementId - The ID of the contenteditable element
	 */
	public static setupContentEditable(elementId: string): void {
		const element = document.getElementById(elementId);
		if (!element) return;

		element.addEventListener('keydown', (e: KeyboardEvent) => {
			// Enter without Shift submits (Blazor will handle via @onkeydown)
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault(); // Always prevent newline on plain Enter
			}

			// Prevent arrow keys when menus are open
			const slashMenuOpen = element.getAttribute('data-slash-menu-open') === 'true';
			const mentionMenuOpen = element.getAttribute('data-mention-menu-open') === 'true';
			if ((slashMenuOpen || mentionMenuOpen) &&
				(e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'p')))) {
				e.preventDefault();
			}
		});

		// Initial resize
		AiChatUtils.autoResizeContentEditable(elementId);
	}

	/**
	 * Set contenteditable content (plain text, clears any spans)
	 * @param elementId - The ID of the contenteditable element
	 * @param text - The text to set
	 */
	public static setContentEditableText(elementId: string, text: string): void {
		const element = document.getElementById(elementId);
		if (!element) return;
		element.textContent = text;
	}

	/**
	 * Focus the contenteditable element and place cursor at the end
	 * @param elementId - The ID of the contenteditable element
	 */
	public static focusContentEditable(elementId: string): void {
		const element = document.getElementById(elementId);
		if (!element) return;

		element.focus();

		// Move cursor to end
		const selection = window.getSelection();
		if (selection) {
			const range = document.createRange();
			range.selectNodeContents(element);
			range.collapse(false); // false = collapse to end
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	// ============================================
	// Script Editor support for variable tokens
	// ============================================

	/**
	 * Initialize the script editor with instruction text, rendering variables as styled spans
	 * @param elementId - The ID of the contenteditable element
	 * @param instruction - The instruction text with {variableName} patterns
	 * @param builtInVars - Array of built-in variable names
	 */
	public static initScriptEditor(elementId: string, instruction: string, builtInVars: string[]): void {
		const element = document.getElementById(elementId);
		if (!element) return;

		if (!instruction || instruction.trim() === '') {
			element.innerHTML = '<br>'; // Ensures cursor shows in empty editor
			return;
		}

		// Parse {variableName} patterns and create HTML
		// Need to escape HTML entities first, convert newlines, then replace variable patterns
		const escaped = instruction
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\n/g, '<br>');  // Convert newlines to <br> for proper rendering

		const html = escaped.replace(/\{(\w+)\}/g, (match, varName) => {
			const isBuiltIn = builtInVars.includes(varName);
			const colorClass = isBuiltIn
				? 'bg-vapp-accent-primary/10 text-vapp-accent-primary border-vapp-accent-primary'
				: 'bg-vapp-accent-secondary/10 text-vapp-accent-secondary border-vapp-accent-secondary';
			return `<span class="script-var inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-full text-sm font-medium border ${colorClass}" contenteditable="false" data-var="${varName}"><span class="opacity-75 text-xs">{</span>${varName}<span class="opacity-75 text-xs">}</span></span>`;
		});

		element.innerHTML = html;

		// Setup paste handler to strip formatting
		element.addEventListener('paste', (e: ClipboardEvent) => {
			e.preventDefault();
			const text = e.clipboardData?.getData('text/plain') || '';
			document.execCommand('insertText', false, text);
		});
	}

	/**
	 * Insert a variable token at current cursor position in the script editor
	 * @param elementId - The ID of the contenteditable element
	 * @param varName - The variable name to insert
	 * @param isBuiltIn - Whether this is a built-in variable
	 */
	public static insertScriptVariable(elementId: string, varName: string, isBuiltIn: boolean): void {
		const element = document.getElementById(elementId);
		if (!element) return;

		const colorClass = isBuiltIn
			? 'bg-vapp-accent-primary/10 text-vapp-accent-primary border-vapp-accent-primary'
			: 'bg-vapp-accent-secondary/10 text-vapp-accent-secondary border-vapp-accent-secondary';

		const span = document.createElement('span');
		span.className = `script-var inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-full text-sm font-medium border ${colorClass}`;
		span.contentEditable = 'false';
		span.dataset.var = varName;
		span.innerHTML = `<span class="opacity-75 text-xs">{</span>${varName}<span class="opacity-75 text-xs">}</span>`;

		// Insert at cursor or append
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
			const range = selection.getRangeAt(0);
			range.deleteContents();
			range.insertNode(span);

			// Add a space after for better UX
			const space = document.createTextNode(' ');
			range.setStartAfter(span);
			range.insertNode(space);

			// Move cursor after the space
			range.setStartAfter(space);
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
		} else {
			// No selection in element, append at end
			element.appendChild(span);
			element.appendChild(document.createTextNode(' '));
		}

		element.focus();
	}

	/**
	 * Extract plain text from script editor, converting styled spans back to {variable} syntax
	 * @param elementId - The ID of the contenteditable element
	 */
	public static getScriptEditorText(elementId: string): string {
		const element = document.getElementById(elementId);
		if (!element) return '';

		let result = '';
		const walk = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				result += node.textContent;
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				if (el.classList.contains('script-var')) {
					result += `{${el.dataset.var}}`;
				} else if (el.tagName === 'BR') {
					result += '\n';
				} else if (el.tagName === 'DIV' || el.tagName === 'P') {
					// Browsers create DIV or P elements when pressing Enter in contenteditable
					// Add newline before block element content (but not for the first one)
					if (result.length > 0 && !result.endsWith('\n')) {
						result += '\n';
					}
					node.childNodes.forEach(walk);
				} else {
					node.childNodes.forEach(walk);
				}
			}
		};
		element.childNodes.forEach(walk);
		return result;
	}

	// ============================================
	// Script Code Editor support (syntax highlighting)
	// ============================================

	public static initScriptCodeEditor(elementId: string, lineNumbersElementId: string, code: string, dotNetRef?: any): void {
		const element = document.getElementById(elementId) as HTMLElement | null;
		if (!element) return;

		const state = (element as any)._codeEditorState || { isUpdating: false, debounceTimer: null };
		state.dotNetRef = dotNetRef;
		state.lineNumbersElement = lineNumbersElementId ? document.getElementById(lineNumbersElementId) as HTMLElement | null : null;
		state.measureElement = this.ensureCodeEditorMeasureElement(element, state.measureElement);
		state.undoStack = [];
		state.redoStack = [];
		state.pendingSnapshot = null;
		state.lastPlainText = '';
		state.errorEntries = [];
		state.errorText = '';
		state.pendingErrors = null;
		state.vimEnabled = false;
		state.vimMode = 'insert';
		state.vimPending = null;
		state.vimYank = null;
		state.vimFind = null;
		state.vimReplaceSelection = null;
		state.vimMouseDown = false;
		state.vimMouseDragging = false;
		state.vimVisualMode = 'none';
		state.vimVisualAnchor = null;
		state.vimVisualCursor = null;
		state.vimHasFocus = document.activeElement === element;
		state.vimCaretUpdateInProgress = false;
		state.vimCaretUpdatePending = false;
		if (state.errorTimer) {
			clearTimeout(state.errorTimer);
		}
		state.errorTimer = null;
		if (state.resizeObserver) {
			state.resizeObserver.disconnect();
		}
		if (window.ResizeObserver) {
			state.resizeObserver = new ResizeObserver(() => {
				const plainText = this.getScriptCodeEditorText(elementId);
				this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
			});
			state.resizeObserver.observe(element);
		}

		// Scroll sync: sync line numbers with pane scroll
		if (state.scrollSyncHandler) {
			state.scrollPane?.removeEventListener('scroll', state.scrollSyncHandler);
		}
		const pane = element.closest('.script-code-editor-pane') as HTMLElement | null;
		if (pane && state.lineNumbersElement) {
			state.scrollPane = pane;
			state.scrollSyncHandler = () => {
				if (state.lineNumbersElement) {
					state.lineNumbersElement.scrollTop = pane.scrollTop;
				}
			};
			pane.addEventListener('scroll', state.scrollSyncHandler, { passive: true });
		}

		(element as any)._codeEditorState = state;

		this.setScriptCodeEditorText(elementId, code);
		state.lastPlainText = this.getScriptCodeEditorText(elementId);

		const maxUndoEntries = 200;
		const pushUndoSnapshot = (snapshot: { text: string; selection: { start: number; end: number } | null } | null) => {
			if (!snapshot) return;
			const last = state.undoStack.length > 0 ? state.undoStack[state.undoStack.length - 1] : null;
			if (last && last.text === snapshot.text) return;
			state.undoStack.push(snapshot);
			if (state.undoStack.length > maxUndoEntries) {
				state.undoStack.shift();
			}
		};

		const captureSnapshot = () => {
			return {
				text: this.getScriptCodeEditorText(elementId),
				selection: this.getCodeEditorSelectionOffsets(element)
			};
		};

		const recordUndoSnapshot = (snapshot: { text: string; selection: { start: number; end: number } | null } | null) => {
			pushUndoSnapshot(snapshot);
			state.redoStack = [];
			state.pendingSnapshot = null;
		};

		const normalizeSelection = (selection: { start: number; end: number } | null, textLength: number) => {
			if (!selection) {
				return { start: textLength, end: textLength };
			}
			const start = Math.max(0, Math.min(selection.start, textLength));
			const end = Math.max(0, Math.min(selection.end, textLength));
			return start <= end ? { start, end } : { start: end, end: start };
		};

		const applyUpdate = (updatedText: string, start: number, end: number) => {
			state.isUpdating = true;
			const errorEntries = state.errorText === updatedText ? state.errorEntries : null;
			element.innerHTML = this.highlightScriptCode(updatedText, errorEntries) || '';
			this.setCodeEditorSelectionOffsets(element, start, end);
			this.updateCodeEditorLineNumbers(state.lineNumbersElement, updatedText, element, state.measureElement);
			state.isUpdating = false;
			state.pendingSnapshot = null;
			state.lastPlainText = updatedText;
			scheduleVimCaretUpdate();
			scheduleCaretScroll(end);

			if (state.dotNetRef) {
				if (state.debounceTimer) clearTimeout(state.debounceTimer);
				state.debounceTimer = setTimeout(() => {
					safeInvoke(state.dotNetRef, 'OnCodeEditorTextChanged', [updatedText]);
				}, 150);
			}
		};

		const applySnapshot = (snapshot: { text: string; selection: { start: number; end: number } | null } | null) => {
			if (!snapshot) return;
			const selection = normalizeSelection(snapshot.selection, snapshot.text.length);
			applyUpdate(snapshot.text, selection.start, selection.end);
		};

		const undo = () => {
			const snapshot = state.undoStack.pop();
			if (!snapshot) return;
			state.redoStack.push(captureSnapshot());
			applySnapshot(snapshot);
		};

		const redo = () => {
			const snapshot = state.redoStack.pop();
			if (!snapshot) return;
			state.undoStack.push(captureSnapshot());
			applySnapshot(snapshot);
		};

		const setVimMode = (mode: 'normal' | 'insert') => {
			if (state.vimMode === mode) return;
			state.vimMode = mode;
			state.vimPending = null;
			if (mode === 'insert') {
				state.vimVisualMode = 'none';
				state.vimVisualAnchor = null;
				state.vimVisualCursor = null;
			}
			if (state.dotNetRef) {
				safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', [mode]);
			}
			updateVimCaret();
		};

		const ensureVimCaretElement = () => {
			if (state.vimCaretElement && state.vimCaretElement.parentElement === element) {
				return state.vimCaretElement;
			}
			const caret = document.createElement('div');
			caret.className = 'script-code-editor-caret-block';
			caret.setAttribute('contenteditable', 'false');
			element.appendChild(caret);
			state.vimCaretElement = caret;
			return caret;
		};

		const updateVimCaret = () => {
			// Prevent re-entrancy
			if (state.vimCaretUpdateInProgress) return;

			if (!state.vimEnabled || state.vimMode !== 'normal') {
				if (state.vimCaretElement) {
					state.vimCaretElement.style.display = 'none';
				}
				element.classList.remove('vim-normal');
				element.classList.remove('vim-moving');
				return;
			}

			state.vimCaretUpdateInProgress = true;
			try {
				element.classList.add('vim-normal');
				const selection = window.getSelection();
				if (!selection || selection.rangeCount === 0) {
					if (state.vimCaretElement) {
						state.vimCaretElement.style.display = 'none';
					}
				return;
			}
			if (!selection.isCollapsed) {
				const inVisual = state.vimVisualMode && state.vimVisualMode !== 'none';
				if (state.vimMouseDragging && !inVisual) {
					if (state.vimCaretElement) {
						state.vimCaretElement.style.display = 'none';
					}
					return;
				}
				const elementRect = element.getBoundingClientRect();
				const style = window.getComputedStyle(element);
				const fontSize = parseFloat(style.fontSize) || 14;
				const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
				const minWidth = Math.max(6, Math.round(fontSize * 0.6));

				const applyCaretRect = (rect: DOMRect) => {
					const caret = ensureVimCaretElement();
					caret.style.width = `${minWidth}px`;
					caret.style.height = `${lineHeight}px`;
					caret.style.left = `${rect.left - elementRect.left + element.scrollLeft}px`;
					caret.style.top = `${rect.top - elementRect.top + element.scrollTop}px`;
					caret.style.display = 'block';
				};

				let rect: DOMRect | null = null;
				if (inVisual && state.vimVisualCursor !== null && state.vimVisualCursor !== undefined) {
					const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
					const caretOffset = Math.max(0, Math.min(state.vimVisualCursor, this.getScriptCodeEditorText(elementId).length));
					const pos = this.getCodeEditorPositionForOffset(element, caretOffset);
					const range = document.createRange();
					range.setStart(pos.container, pos.offset);
					range.collapse(true);
					rect = range.getClientRects()[0] || range.getBoundingClientRect();
					if (!rect || (!rect.width && !rect.height)) {
						const marker = document.createElement('span');
						marker.textContent = '\u200b';
						marker.style.display = 'inline-block';
						marker.style.width = '1px';
						marker.style.height = '1em';
						marker.style.opacity = '0';
						marker.style.pointerEvents = 'none';

						range.insertNode(marker);
						rect = marker.getBoundingClientRect();
						const parent = marker.parentNode;
						if (parent) {
							parent.removeChild(marker);
							parent.normalize();
						}
						if (selectionOffsets) {
							this.setCodeEditorSelectionOffsets(element, selectionOffsets.start, selectionOffsets.end);
						}
					}
				}

				if (!rect) {
					const focusNode = selection.focusNode;
					if (!focusNode || !element.contains(focusNode)) {
						if (state.vimCaretElement) {
							state.vimCaretElement.style.display = 'none';
						}
						return;
					}
					const focusRange = document.createRange();
					try {
						focusRange.setStart(focusNode, selection.focusOffset);
						focusRange.collapse(true);
					} catch {
						if (state.vimCaretElement) {
							state.vimCaretElement.style.display = 'none';
						}
						return;
					}
					rect = focusRange.getClientRects()[0] || focusRange.getBoundingClientRect();
				}

				if (rect) {
					applyCaretRect(rect);
				}
				return;
			}
			const range = selection.getRangeAt(0).cloneRange();
			if (!element.contains(range.startContainer)) {
				if (state.vimCaretElement) {
					state.vimCaretElement.style.display = 'none';
				}
				return;
			}
			range.collapse(true);

			let rect = range.getClientRects()[0];
			if (!rect) {
				rect = range.getBoundingClientRect();
			}
			let caretLeft = rect ? rect.left : null;

			if (!rect || (!rect.width && !rect.height)) {
				const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
				if (selectionOffsets) {
					const probeRange = document.createRange();
					const startPos = this.getCodeEditorPositionForOffset(element, selectionOffsets.start);
					probeRange.setStart(startPos.container, startPos.offset);
					probeRange.collapse(true);

					const marker = document.createElement('span');
					marker.textContent = '\u200b';
					marker.style.display = 'inline-block';
					marker.style.width = '1px';
					marker.style.height = '1em';
					marker.style.opacity = '0';
					marker.style.pointerEvents = 'none';

					probeRange.insertNode(marker);
					rect = marker.getBoundingClientRect();
					caretLeft = rect ? rect.left : caretLeft;

					const parent = marker.parentNode;
					if (parent) {
						parent.removeChild(marker);
						parent.normalize();
					}

					this.setCodeEditorSelectionOffsets(element, selectionOffsets.start, selectionOffsets.end);
				}
			}

			if (!rect || caretLeft === null) {
				const elementRectFallback = element.getBoundingClientRect();
				const style = window.getComputedStyle(element);
				const paddingLeft = parseFloat(style.paddingLeft) || 0;
				const paddingTop = parseFloat(style.paddingTop) || 0;
				rect = elementRectFallback;
				caretLeft = elementRectFallback.left + paddingLeft;
				const fallbackTop = elementRectFallback.top + paddingTop;
				rect = {
					left: caretLeft,
					top: fallbackTop,
					right: caretLeft,
					bottom: fallbackTop,
					width: 0,
					height: 0,
					x: caretLeft,
					y: fallbackTop,
					toJSON: () => ({})
				} as DOMRect;
			}

			const elementRect = element.getBoundingClientRect();
			const style = window.getComputedStyle(element);
			const fontSize = parseFloat(style.fontSize) || 14;
			const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
			const minWidth = Math.max(6, Math.round(fontSize * 0.6));
			const rawWidth = rect.width || 0;
			const width = rawWidth >= minWidth ? rawWidth : minWidth;

			const caret = ensureVimCaretElement();
			caret.style.width = `${width}px`;
			// caret.style.height = `${lineHeight}px`;
			caret.style.height = `1rem`;
			const left = (caretLeft ?? rect.left) - elementRect.left + element.scrollLeft;
			caret.style.left = `${left}px`;
			caret.style.top = `${rect.top - elementRect.top + element.scrollTop}px`;
			caret.style.display = 'block';
			} finally {
				state.vimCaretUpdateInProgress = false;
			}
		};

		const scheduleVimCaretUpdate = () => {
			if (!state.vimEnabled || state.vimMode !== 'normal') return;
			if (state.vimCaretUpdatePending) return; // Prevent multiple RAF callbacks
			state.vimCaretUpdatePending = true;
			requestAnimationFrame(() => {
				state.vimCaretUpdatePending = false;
				updateVimCaret();
			});
		};
		state.vimUpdateCaret = updateVimCaret;
		state.vimScheduleCaret = scheduleVimCaretUpdate;

		const getScrollContainer = (): HTMLElement | null => {
			const container = element.closest('.script-code-editor-scroll') as HTMLElement | null;
			if (container) return container;
			let parent = element.parentElement;
			while (parent) {
				const style = window.getComputedStyle(parent);
				if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
					return parent;
				}
				parent = parent.parentElement;
			}
			return null;
		};

		const getCaretRectForOffset = (offset: number): DOMRect | null => {
			const pos = this.getCodeEditorPositionForOffset(element, offset);
			const range = document.createRange();
			range.setStart(pos.container, pos.offset);
			range.collapse(true);
			let rect = range.getClientRects()[0] || range.getBoundingClientRect();
			if (rect && (rect.width || rect.height)) {
				return rect;
			}

			const marker = document.createElement('span');
			marker.textContent = '\u200b';
			marker.style.display = 'inline-block';
			marker.style.width = '1px';
			marker.style.height = '1em';
			marker.style.opacity = '0';
			marker.style.pointerEvents = 'none';
			range.insertNode(marker);
			rect = marker.getBoundingClientRect();
			const parent = marker.parentNode;
			if (parent) {
				parent.removeChild(marker);
				parent.normalize();
			}
			return rect && (rect.width || rect.height) ? rect : null;
		};

		const ensureCaretVisible = (offset?: number | null) => {
			const container = getScrollContainer();
			if (!container) return;
			let targetOffset = offset;
			if (targetOffset === null || targetOffset === undefined) {
				const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
				if (!selectionOffsets) return;
				targetOffset = selectionOffsets.end;
			}
			const rect = getCaretRectForOffset(Math.max(0, Math.min(targetOffset, this.getScriptCodeEditorText(elementId).length)));
			if (!rect) return;

			const containerRect = container.getBoundingClientRect();
			const padding = 12;

			// Vertical scrolling
			const top = rect.top - containerRect.top + container.scrollTop;
			const bottom = rect.bottom - containerRect.top + container.scrollTop;
			const viewTop = container.scrollTop;
			const viewBottom = viewTop + container.clientHeight;
			if (top < viewTop + padding) {
				container.scrollTop = Math.max(0, top - padding);
			} else if (bottom > viewBottom - padding) {
				container.scrollTop = bottom - container.clientHeight + padding;
			}

			// Horizontal scrolling
			const left = rect.left - containerRect.left + container.scrollLeft;
			const right = rect.right - containerRect.left + container.scrollLeft;
			const viewLeft = container.scrollLeft;
			const viewRight = viewLeft + container.clientWidth;
			if (left < viewLeft + padding) {
				container.scrollLeft = Math.max(0, left - padding);
			} else if (right > viewRight - padding) {
				container.scrollLeft = right - container.clientWidth + padding;
			}
		};

		const scheduleCaretScroll = (offset?: number | null) => {
			requestAnimationFrame(() => ensureCaretVisible(offset));
		};

		const markVimCaretMovement = () => {
			if (!state.vimEnabled || state.vimMode !== 'normal') return;
			element.classList.add('vim-moving');
			if (state.vimCaretMoveTimer) {
				clearTimeout(state.vimCaretMoveTimer);
			}
			state.vimCaretMoveTimer = setTimeout(() => {
				element.classList.remove('vim-moving');
			}, 500);
		};

		const getLineInfo = (text: string, offset: number) => {
			const lines = text.split('\n');
			const lineStarts: number[] = [];
			let running = 0;
			for (const line of lines) {
				lineStarts.push(running);
				running += line.length + 1;
			}

			let lineIndex = 0;
			for (let i = 0; i < lines.length; i++) {
				const lineStart = lineStarts[i];
				const lineEnd = lineStart + lines[i].length;
				if (offset <= lineEnd || i === lines.length - 1) {
					lineIndex = i;
					break;
				}
			}

			const lineStart = lineStarts[lineIndex];
			const lineEnd = lineStart + lines[lineIndex].length;
			const column = Math.max(0, offset - lineStart);
			return { lines, lineStarts, lineIndex, lineStart, lineEnd, column, lineText: lines[lineIndex] };
		};

		const isWhitespace = (ch: string) => /\s/.test(ch);
		const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);

		const moveNextTokenStart = (text: string, offset: number) => {
			let i = Math.min(offset, text.length);
			if (i >= text.length) return text.length;

			if (isWhitespace(text[i])) {
				while (i < text.length && isWhitespace(text[i])) i++;
				return i;
			}

			if (isWordChar(text[i])) {
				while (i < text.length && isWordChar(text[i])) i++;
			} else {
				i++;
			}

			while (i < text.length && isWhitespace(text[i])) i++;
			return i;
		};

		const movePrevTokenStart = (text: string, offset: number) => {
			if (text.length === 0 || offset <= 0) return 0;
			let i = Math.min(offset - 1, text.length - 1);
			while (i > 0 && isWhitespace(text[i])) i--;
			if (isWordChar(text[i])) {
				while (i > 0 && isWordChar(text[i - 1])) i--;
				return i;
			}
			return i;
		};

		const moveTokenEnd = (text: string, offset: number) => {
			if (text.length === 0) return 0;
			let i = Math.min(offset, text.length - 1);
			if (isWhitespace(text[i])) {
				while (i < text.length && isWhitespace(text[i])) i++;
				if (i >= text.length) return text.length - 1;
			}

			const isWord = isWordChar(text[i]);
			let end = i;
			if (isWord) {
				while (end + 1 < text.length && isWordChar(text[end + 1])) end++;
			}

			if (i === end) {
				let next = end + 1;
				while (next < text.length && isWhitespace(text[next])) next++;
				if (next < text.length) {
					if (isWordChar(text[next])) {
						end = next;
						while (end + 1 < text.length && isWordChar(text[end + 1])) end++;
					} else {
						end = next;
					}
				}
			}

			return end;
		};

		const getIndentUnit = (baseIndent: string) => {
			if (!baseIndent.includes('\t') && baseIndent.includes(' ')) {
				return '  ';
			}
			return '\t';
		};

		const inputHandler = () => {
			if (state.isUpdating) return;

			state.isUpdating = true;
			const caretOffset = this.getCodeEditorCaretOffset(element);
			const plainText = this.getScriptCodeEditorText(elementId);
			const errorEntries = state.errorText === plainText ? state.errorEntries : null;
			const html = this.highlightScriptCode(plainText, errorEntries);
			element.innerHTML = html || '';
			this.setCodeEditorCaretOffset(element, caretOffset);
			this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
			state.isUpdating = false;
			if (state.pendingSnapshot) {
				if (plainText !== state.pendingSnapshot.text) {
					pushUndoSnapshot(state.pendingSnapshot);
					state.redoStack = [];
				}
				state.pendingSnapshot = null;
			}
			state.lastPlainText = plainText;
			scheduleVimCaretUpdate();

			if (state.dotNetRef) {
				if (state.debounceTimer) clearTimeout(state.debounceTimer);
				state.debounceTimer = setTimeout(() => {
					safeInvoke(state.dotNetRef, 'OnCodeEditorTextChanged', [plainText]);
				}, 150);
			}
		};

		const keyHandler = (e: KeyboardEvent) => {
			const hasModKey = (e.ctrlKey || e.metaKey) && !e.altKey;
			if (hasModKey) {
				const key = e.key.toLowerCase();
				if (key === 'z') {
					e.preventDefault();
					if (e.shiftKey) {
						redo();
					} else {
						undo();
					}
					return;
				}
				if (key === 'r') {
					e.preventDefault();
					redo();
					return;
				}
				if (key === 'y') {
					e.preventDefault();
					redo();
					return;
				}
			}

			if (state.vimEnabled) {
				if (state.vimMode === 'insert') {
					if (e.key === 'Escape') {
						e.preventDefault();
						setVimMode('normal');
						scheduleVimCaretUpdate();
						return;
					}
				} else {
					e.preventDefault();
					const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
					if (!selectionOffsets) return;

					const plainText = this.getScriptCodeEditorText(elementId);
					let cursor = selectionOffsets.start;
					let inVisual = state.vimVisualMode && state.vimVisualMode !== 'none';
					if (inVisual) {
						if (state.vimVisualCursor === null || state.vimVisualCursor === undefined) {
							state.vimVisualCursor = selectionOffsets.end;
						}
						cursor = state.vimVisualCursor;
					}

					const applyTextChange = (updatedText: string, newCursor: number) => {
						recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
						applyUpdate(updatedText, newCursor, newCursor);
						markVimCaretMovement();
					};

					const deleteRange = (start: number, end: number) => {
						const safeStart = Math.max(0, Math.min(start, plainText.length));
						const safeEnd = Math.max(safeStart, Math.min(end, plainText.length));
						if (safeStart === safeEnd) return;
						const updated = plainText.slice(0, safeStart) + plainText.slice(safeEnd);
						applyTextChange(updated, Math.min(safeStart, updated.length));
					};

					if (!inVisual && selectionOffsets.start !== selectionOffsets.end) {
						if (e.key === 'p' && state.vimYank) {
							const selectionStart = selectionOffsets.start;
							const selectionEnd = selectionOffsets.end;
							const insertText = state.vimYank;
							const updated = plainText.slice(0, selectionStart) + insertText + plainText.slice(selectionEnd);
							const newCursor = Math.max(0, selectionStart + insertText.length - 1);
							applyTextChange(updated, Math.min(newCursor, updated.length));
							return;
						}
						if (e.key === 'r') {
							state.vimPending = 'r';
							state.vimReplaceSelection = { start: selectionOffsets.start, end: selectionOffsets.end };
							return;
						}
						if (e.key === 'y' || e.key === 'd' || e.key === 'c' || e.key === 'x') {
							const selectionStart = selectionOffsets.start;
							const selectionEnd = selectionOffsets.end;
							state.vimYank = plainText.slice(selectionStart, selectionEnd);
							if (e.key === 'd' || e.key === 'c' || e.key === 'x') {
								deleteRange(selectionStart, selectionEnd);
							}
							if (e.key === 'c') {
								setVimMode('insert');
							} else {
								this.setCodeEditorSelectionOffsets(element, selectionStart, selectionStart);
							}
							return;
						}
						this.setCodeEditorSelectionOffsets(element, cursor, cursor);
					}

					const moveCursor = (newCursor: number) => {
						const clamped = Math.max(0, Math.min(newCursor, plainText.length));
						if (state.vimVisualMode && state.vimVisualMode !== 'none') {
							updateVisualSelection(clamped);
						} else {
							this.setCodeEditorSelectionOffsets(element, clamped, clamped);
							markVimCaretMovement();
							scheduleVimCaretUpdate();
							scheduleCaretScroll(clamped);
						}
					};

					const info = getLineInfo(plainText, cursor);

					const moveVertical = (direction: number) => {
						const targetIndex = info.lineIndex + direction;
						if (targetIndex < 0 || targetIndex >= info.lines.length) return;
						const targetLine = info.lines[targetIndex];
						const targetCol = Math.min(info.column, targetLine.length);
						const targetStart = info.lineStarts[targetIndex];
						moveCursor(targetStart + targetCol);
					};

					const updateVisualSelection = (target: number, modeOverride?: 'char' | 'line') => {
						if (state.vimVisualMode === 'none' && !modeOverride) return;
						const mode = modeOverride || state.vimVisualMode;
						if (state.vimVisualAnchor === null || state.vimVisualAnchor === undefined) {
							state.vimVisualAnchor = cursor;
						}
						state.vimVisualCursor = target;
						let start = Math.min(state.vimVisualAnchor, target);
						let end = Math.max(state.vimVisualAnchor, target);
						if (mode === 'line') {
							const startInfo = getLineInfo(plainText, start);
							const endInfo = getLineInfo(plainText, end);
							start = startInfo.lineStart;
							end = endInfo.lineEnd;
							if (end < plainText.length) {
								end += 1;
							}
						} else {
							if (end < plainText.length) {
								end += 1;
							}
						}
						this.setCodeEditorSelectionOffsets(element, start, end);
						markVimCaretMovement();
						scheduleVimCaretUpdate();
						scheduleCaretScroll(target);
					};

					const setVisualMode = (mode: 'none' | 'char' | 'line') => {
						if (state.vimVisualMode === mode) return;
						state.vimVisualMode = mode;
						if (mode === 'none') {
							state.vimVisualAnchor = null;
							state.vimVisualCursor = null;
							if (state.vimEnabled && state.vimMode === 'normal' && state.dotNetRef) {
								safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', ['normal']);
							}
							return;
						}
						if (state.vimVisualAnchor === null || state.vimVisualAnchor === undefined) {
							state.vimVisualAnchor = cursor;
						}
						if (state.vimEnabled && state.vimMode === 'normal' && state.dotNetRef) {
							safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', [mode === 'line' ? 'visual-line' : 'visual']);
						}
					};

					const findCharForward = (target: string) => {
						for (let i = cursor + 1; i < info.lineEnd; i++) {
							if (plainText[i] === target) return i;
						}
						return null;
					};

					const findCharBackward = (target: string) => {
						for (let i = cursor - 1; i >= info.lineStart; i--) {
							if (plainText[i] === target) return i;
						}
						return null;
					};

					const applyFindMotion = (dir: 'f' | 'F' | 't' | 'T', target: string, op: 'c' | 'd' | null = null) => {
						const forward = dir === 'f' || dir === 't';
						const match = forward ? findCharForward(target) : findCharBackward(target);
						if (match === null) return;

						if (op) {
							let rangeStart = cursor;
							let rangeEnd = cursor;
							if (dir === 'f') {
								rangeStart = cursor;
								rangeEnd = match + 1;
							} else if (dir === 't') {
								rangeStart = cursor;
								rangeEnd = match;
							} else if (dir === 'F') {
								rangeStart = match;
								rangeEnd = cursor + 1;
							} else if (dir === 'T') {
								rangeStart = match + 1;
								rangeEnd = cursor + 1;
							}
							deleteRange(rangeStart, rangeEnd);
							moveCursor(Math.min(rangeStart, plainText.length));
							if (op === 'c') {
								setVimMode('insert');
							}
						} else {
							let targetIndex = match;
							if (dir === 't') {
								targetIndex = Math.max(info.lineStart, match - 1);
							} else if (dir === 'T') {
								targetIndex = Math.min(info.lineEnd, match + 1);
							}
							moveCursor(targetIndex);
						}

						state.vimFind = { dir, char: target };
					};

					const deleteTo = (target: number) => {
						const end = target <= cursor ? Math.min(cursor + 1, plainText.length) : target;
						deleteRange(cursor, end);
					};

					const getWordBounds = (text: string, offset: number) => {
						if (!text.length) return null;
						let idx = Math.min(offset, text.length - 1);
						if (isWhitespace(text[idx])) {
							idx = moveNextTokenStart(text, idx);
							if (idx >= text.length) return null;
						}
						if (isWordChar(text[idx])) {
							let start = idx;
							while (start > 0 && isWordChar(text[start - 1])) start--;
							let end = idx + 1;
							while (end < text.length && isWordChar(text[end])) end++;
							return { start, end };
						}
						return { start: idx, end: Math.min(idx + 1, text.length) };
					};

					const isEscapedQuote = (text: string, index: number) => {
						let backslashCount = 0;
						for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
							backslashCount++;
						}
						return backslashCount % 2 === 1;
					};

					const findEnclosingPair = (openChar: string, closeChar: string) => {
						const lineStart = info.lineStart;
						const lineEnd = info.lineEnd;
						const text = plainText;

						if (openChar === closeChar) {
							let openIndex = -1;
							for (let i = cursor - 1; i >= lineStart; i--) {
								if (text[i] === openChar && !isEscapedQuote(text, i)) {
									openIndex = i;
									break;
								}
							}
							if (openIndex < 0) return null;
							let closeIndex = -1;
							for (let i = cursor; i < lineEnd; i++) {
								if (text[i] === closeChar && !isEscapedQuote(text, i)) {
									closeIndex = i;
									break;
								}
							}
							if (closeIndex < 0 || closeIndex <= openIndex) return null;
							return { openIndex, closeIndex };
						}

						let openIndex = -1;
						let depth = 0;
						for (let i = cursor - 1; i >= lineStart; i--) {
							const ch = text[i];
							if (ch === openChar) {
								if (depth === 0) {
									openIndex = i;
									break;
								}
								depth--;
							} else if (ch === closeChar) {
								depth++;
							}
						}
						if (openIndex < 0) return null;

						let closeIndex = -1;
						depth = 0;
						for (let i = cursor; i < lineEnd; i++) {
							const ch = text[i];
							if (ch === closeChar) {
								if (depth === 0) {
									closeIndex = i;
									break;
								}
								depth--;
							} else if (ch === openChar) {
								depth++;
							}
						}
						if (closeIndex < 0) return null;
						return { openIndex, closeIndex };
					};

					inVisual = state.vimVisualMode && state.vimVisualMode !== 'none';
					if (inVisual) {
						if (state.vimPending === 'vi' && e.key.length === 1) {
							const keyChar = e.key;
							let openChar = keyChar;
							let closeChar = keyChar;
							if (keyChar === ')') {
								openChar = '(';
								closeChar = ')';
							} else if (keyChar === ']') {
								openChar = '[';
								closeChar = ']';
							} else if (keyChar === '}') {
								openChar = '{';
								closeChar = '}';
							} else if (keyChar === '(' || keyChar === '[' || keyChar === '{') {
								openChar = keyChar;
								closeChar = keyChar === '(' ? ')' : keyChar === '[' ? ']' : '}';
							}

							const pair = findEnclosingPair(openChar, closeChar);
							if (pair && pair.openIndex < pair.closeIndex && cursor > pair.openIndex && cursor <= pair.closeIndex) {
								const start = pair.openIndex + 1;
								const end = pair.closeIndex;
								state.vimVisualMode = 'char';
								state.vimVisualAnchor = start;
								state.vimVisualCursor = Math.max(start, end - 1);
								this.setCodeEditorSelectionOffsets(element, start, end);
								markVimCaretMovement();
								scheduleVimCaretUpdate();
							}
							state.vimPending = null;
							return;
						}

						if (e.key === 'i') {
							state.vimPending = 'vi';
							return;
						}

						if (e.key === 'Escape') {
							state.vimPending = null;
							const collapseTo = state.vimVisualCursor ?? cursor;
							setVisualMode('none');
							this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
							markVimCaretMovement();
							scheduleVimCaretUpdate();
							return;
						}
						if (e.key === 'v' && state.vimVisualMode === 'char') {
							state.vimPending = null;
							const collapseTo = state.vimVisualCursor ?? cursor;
							setVisualMode('none');
							this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
							markVimCaretMovement();
							scheduleVimCaretUpdate();
							return;
						}
						if (e.key === 'V' && state.vimVisualMode === 'line') {
							state.vimPending = null;
							const collapseTo = state.vimVisualCursor ?? cursor;
							setVisualMode('none');
							this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
							markVimCaretMovement();
							scheduleVimCaretUpdate();
							return;
						}
						if (e.key === 'V' && state.vimVisualMode === 'char') {
							state.vimPending = null;
							setVisualMode('line');
							updateVisualSelection(state.vimVisualCursor ?? cursor, 'line');
							return;
						}
						if (e.key === 'v' && state.vimVisualMode === 'line') {
							state.vimPending = null;
							setVisualMode('char');
							updateVisualSelection(state.vimVisualCursor ?? cursor, 'char');
							return;
						}

						const selection = this.getCodeEditorSelectionOffsets(element);
						if (selection && (e.key === 'y' || e.key === 'd' || e.key === 'c')) {
							state.vimPending = null;
							state.vimYank = plainText.slice(selection.start, selection.end);
							if (e.key === 'd' || e.key === 'c') {
								deleteRange(selection.start, selection.end);
							}
							setVisualMode('none');
							if (e.key === 'c') {
								setVimMode('insert');
							} else {
								const collapseTo = selection.start;
								this.setCodeEditorSelectionOffsets(element, collapseTo, collapseTo);
							}
							return;
						}
					}

					const pending = state.vimPending;
					if (pending) {
						if (e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') {
							return;
						}
						state.vimPending = null;
						if (pending === 'r') {
							if (e.key.length !== 1) return;
							if (state.vimReplaceSelection) {
								const selectionStart = Math.max(0, Math.min(state.vimReplaceSelection.start, plainText.length));
								const selectionEnd = Math.max(selectionStart, Math.min(state.vimReplaceSelection.end, plainText.length));
								state.vimReplaceSelection = null;
								if (selectionStart === selectionEnd) return;
								const count = selectionEnd - selectionStart;
								const replacement = e.key.repeat(count);
								const updated = plainText.slice(0, selectionStart) + replacement + plainText.slice(selectionEnd);
								applyTextChange(updated, Math.min(selectionStart, updated.length));
								return;
							}
							if (cursor >= plainText.length) return;
							const updated = plainText.slice(0, cursor) + e.key + plainText.slice(cursor + 1);
							applyTextChange(updated, Math.min(cursor, updated.length));
							return;
						}
						if (pending === 'f' || pending === 'F' || pending === 't' || pending === 'T') {
							if (e.key.length !== 1) return;
							applyFindMotion(pending, e.key);
							return;
						}
						if (pending.length === 2 && (pending[0] === 'c' || pending[0] === 'd') && (pending[1] === 'f' || pending[1] === 'F' || pending[1] === 't' || pending[1] === 'T')) {
							if (e.key.length !== 1) return;
							applyFindMotion(pending[1] as 'f' | 'F' | 't' | 'T', e.key, pending[0] as 'c' | 'd');
							return;
						}
						if (pending === 'g' && e.key === 'g') {
							moveCursor(0);
							return;
						}
						if (pending === 'd' && e.key === 'd') {
							let deleteStart = info.lineStart;
							let deleteEnd = info.lineEnd;
							if (info.lineEnd < plainText.length) {
								deleteEnd = info.lineEnd + 1;
							} else if (info.lineStart > 0) {
								deleteStart = info.lineStart - 1;
							}
							state.vimYank = info.lineText;
							const updated = plainText.slice(0, deleteStart) + plainText.slice(deleteEnd);
							applyTextChange(updated, Math.min(deleteStart, updated.length));
							return;
						}
						if (pending === 'y' && e.key === 'y') {
							state.vimYank = info.lineText;
							return;
						}
						if (pending === 'd' && e.key === 'w') {
							deleteTo(moveNextTokenStart(plainText, cursor));
							return;
						}
						if (pending === 'c' && e.key === 'w') {
							deleteTo(moveNextTokenStart(plainText, cursor));
							setVimMode('insert');
							return;
						}
						if ((pending === 'c' || pending === 'd') && (e.key === 'f' || e.key === 'F' || e.key === 't' || e.key === 'T')) {
							state.vimPending = `${pending}${e.key}`;
							return;
						}
						if ((pending === 'c' || pending === 'd') && e.key === 'i') {
							state.vimPending = pending === 'c' ? 'ci' : 'di';
							return;
						}
						if (pending === 'ci' && e.key === 'w') {
							const bounds = getWordBounds(plainText, cursor);
							if (bounds) {
								deleteRange(bounds.start, bounds.end);
								moveCursor(bounds.start);
								setVimMode('insert');
							}
							return;
						}
						if (pending === 'di' && e.key === 'w') {
							const bounds = getWordBounds(plainText, cursor);
							if (bounds) {
								deleteRange(bounds.start, bounds.end);
								moveCursor(bounds.start);
							}
							return;
						}
						if ((pending === 'ci' || pending === 'di') && e.key.length === 1) {
							const keyChar = e.key;
							let openChar = keyChar;
							let closeChar = keyChar;
							if (keyChar === ')') {
								openChar = '(';
								closeChar = ')';
							} else if (keyChar === ']') {
								openChar = '[';
								closeChar = ']';
							} else if (keyChar === '}') {
								openChar = '{';
								closeChar = '}';
							} else if (keyChar === '(' || keyChar === '[' || keyChar === '{') {
								openChar = keyChar;
								closeChar = keyChar === '(' ? ')' : keyChar === '[' ? ']' : '}';
							}

							const pair = findEnclosingPair(openChar, closeChar);
							if (pair && pair.openIndex < pair.closeIndex && cursor > pair.openIndex && cursor <= pair.closeIndex) {
								deleteRange(pair.openIndex + 1, pair.closeIndex);
								moveCursor(pair.openIndex + 1);
								if (pending === 'ci') {
									setVimMode('insert');
								}
							}
							return;
						}
						return;
					}

					switch (e.key) {
						case 'h':
						case 'ArrowLeft':
							moveCursor(cursor - 1);
							return;
						case 'l':
						case 'ArrowRight':
							moveCursor(cursor + 1);
							return;
						case 'k':
						case 'ArrowUp':
							moveVertical(-1);
							return;
						case 'j':
						case 'ArrowDown':
							moveVertical(1);
							return;
						case '0':
							moveCursor(info.lineStart);
							return;
						case '$':
							if (info.lineEnd > info.lineStart) {
								moveCursor(info.lineEnd - 1);
							} else {
								moveCursor(info.lineStart);
							}
							return;
						case 'w':
							moveCursor(moveNextTokenStart(plainText, cursor));
							return;
						case 'b':
							moveCursor(movePrevTokenStart(plainText, cursor));
							return;
						case 'e':
							moveCursor(moveTokenEnd(plainText, cursor));
							return;
						case ';':
							if (!state.vimFind) return;
							{
								applyFindMotion(state.vimFind.dir, state.vimFind.char);
							}
							return;
						case 'f':
							state.vimPending = 'f';
							return;
						case 'F':
							state.vimPending = 'F';
							return;
						case 't':
							state.vimPending = 't';
							return;
						case 'T':
							state.vimPending = 'T';
							return;
						case 'v':
							if (!inVisual) {
								state.vimPending = null;
								setVisualMode('char');
								updateVisualSelection(cursor, 'char');
							}
							return;
						case 'V':
							if (!inVisual) {
								state.vimPending = null;
								setVisualMode('line');
								updateVisualSelection(cursor, 'line');
							}
							return;
						case 'g':
							state.vimPending = 'g';
							return;
						case 'G':
							if (info.lines.length > 0) {
								const lastIndex = info.lines.length - 1;
								moveCursor(info.lineStarts[lastIndex]);
							}
							return;
						case 'x':
							if (cursor < plainText.length) {
								const updated = plainText.slice(0, cursor) + plainText.slice(cursor + 1);
								applyTextChange(updated, Math.min(cursor, updated.length));
							}
							return;
						case 'r':
							state.vimPending = 'r';
							return;
						case 'C':
							{
								if (cursor < info.lineEnd) {
									deleteRange(cursor, info.lineEnd);
								}
								moveCursor(Math.min(cursor, plainText.length));
								setVimMode('insert');
							}
							return;
						case 'S':
							{
								const indentMatch = info.lineText.match(/^[\t ]*/);
								const indent = indentMatch ? indentMatch[0] : '';
								const lineStart = info.lineStart;
								const lineEnd = info.lineEnd;
								const updated = plainText.slice(0, lineStart) + indent + plainText.slice(lineEnd);
								applyTextChange(updated, lineStart + indent.length);
								setVimMode('insert');
							}
							return;
						case 'c':
							state.vimPending = 'c';
							return;
						case 'd':
							state.vimPending = 'd';
							return;
						case 'y':
							state.vimPending = 'y';
							return;
						case 'p':
							if (!state.vimYank) return;
							{
								const insertAt = info.lineEnd < plainText.length ? info.lineEnd + 1 : info.lineEnd;
								const insertText = info.lineEnd < plainText.length ? `${state.vimYank}\n` : `\n${state.vimYank}`;
								const updated = plainText.slice(0, insertAt) + insertText + plainText.slice(insertAt);
								const cursorOffset = insertAt + (info.lineEnd < plainText.length ? 0 : 1);
								applyTextChange(updated, cursorOffset);
							}
							return;
						case 'o':
						case 'O':
							{
								const baseIndentMatch = info.lineText.match(/^[\t ]*/);
								const baseIndent = baseIndentMatch ? baseIndentMatch[0] : '';
								const indentUnit = getIndentUnit(baseIndent);
								const trimmed = info.lineText.replace(/[\t ]+$/, '');
								const indent = baseIndent + (trimmed.endsWith('{') ? indentUnit : '');
								if (e.key === 'o') {
									const insertAt = info.lineEnd < plainText.length ? info.lineEnd + 1 : info.lineEnd;
									const insertText = info.lineEnd < plainText.length ? `${indent}\n` : `\n${indent}`;
									const updated = plainText.slice(0, insertAt) + insertText + plainText.slice(insertAt);
									const cursorOffset = insertAt + (info.lineEnd < plainText.length ? 0 : 1) + indent.length;
									applyTextChange(updated, cursorOffset);
								} else {
									const insertAt = info.lineStart;
									const insertText = `${indent}\n`;
									const updated = plainText.slice(0, insertAt) + insertText + plainText.slice(insertAt);
									const cursorOffset = insertAt + indent.length;
									applyTextChange(updated, cursorOffset);
								}
								setVimMode('insert');
							}
							return;
						case 'i':
							setVimMode('insert');
							scheduleVimCaretUpdate();
							return;
						case 'a':
							if (cursor < info.lineEnd) {
								moveCursor(cursor + 1);
							}
							setVimMode('insert');
							scheduleVimCaretUpdate();
							return;
						case 'I':
							{
								const match = info.lineText.match(/^[\t ]*/);
								const indent = match ? match[0].length : 0;
								moveCursor(info.lineStart + indent);
								setVimMode('insert');
							}
							return;
						case 'A':
							moveCursor(info.lineEnd);
							setVimMode('insert');
							return;
						case 'u':
							undo();
							markVimCaretMovement();
							scheduleVimCaretUpdate();
							return;
						case 'Escape':
							state.vimPending = null;
							scheduleVimCaretUpdate();
							return;
						default:
							return;
					}
				}
			}

			if (e.key === '"') {
				const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
				if (!selectionOffsets) return;
				const plainText = this.getScriptCodeEditorText(elementId);
				if (selectionOffsets.start === selectionOffsets.end) {
					const nextChar = plainText[selectionOffsets.end] || '';
					if (nextChar === '"') {
						e.preventDefault();
						this.setCodeEditorSelectionOffsets(element, selectionOffsets.end + 1, selectionOffsets.end + 1);
						return;
					}
				}

				e.preventDefault();
				recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
				const updated = this.replaceCodeSelectionWithPair(plainText, selectionOffsets.start, selectionOffsets.end, '"', '"');
				applyUpdate(updated.text, updated.start, updated.end);
				return;
			}

			if (e.key === '[' || e.key === '{' || e.key === '(') {
				const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
				if (!selectionOffsets) return;
				const plainText = this.getScriptCodeEditorText(elementId);
				const closeChar = e.key === '[' ? ']' : (e.key === '{' ? '}' : ')');

				e.preventDefault();
				recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
				const updated = this.replaceCodeSelectionWithPair(plainText, selectionOffsets.start, selectionOffsets.end, e.key, closeChar);
				applyUpdate(updated.text, updated.start, updated.end);
				return;
			}

			if (e.key === ']' || e.key === '}' || e.key === ')') {
				const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
				if (!selectionOffsets) return;
				const plainText = this.getScriptCodeEditorText(elementId);
				if (selectionOffsets.start === selectionOffsets.end) {
					const nextChar = plainText[selectionOffsets.end] || '';
					if (nextChar === e.key) {
						e.preventDefault();
						this.setCodeEditorSelectionOffsets(element, selectionOffsets.end + 1, selectionOffsets.end + 1);
						return;
					}
				}

				e.preventDefault();
				recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
				const updated = this.replaceCodeSelectionWithText(plainText, selectionOffsets.start, selectionOffsets.end, e.key);
				applyUpdate(updated.text, updated.start, updated.end);
				return;
			}

			if (e.key === 'Enter') {
				const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
				if (!selectionOffsets || selectionOffsets.start !== selectionOffsets.end) return;

				const plainText = this.getScriptCodeEditorText(elementId);
				const cursor = selectionOffsets.start;
				if (cursor < 0 || cursor > plainText.length) return;

				const lineStartIndex = plainText.lastIndexOf('\n', cursor - 1) + 1;
				const lineEndIndex = plainText.indexOf('\n', cursor);
				const lineText = plainText.slice(lineStartIndex, lineEndIndex === -1 ? plainText.length : lineEndIndex);
				const indentMatch = lineText.match(/^[\t ]*/);
				const baseIndent = indentMatch ? indentMatch[0] : '';
				let indentUnit = '\t';
				if (!baseIndent.includes('\t') && baseIndent.includes(' ')) {
					indentUnit = '  ';
				}

				if (cursor > 0 && cursor < plainText.length && plainText[cursor - 1] === '{' && plainText[cursor] === '}') {
					e.preventDefault();
					recordUndoSnapshot({ text: plainText, selection: selectionOffsets });

					const insertion = `\n${baseIndent}${indentUnit}\n${baseIndent}`;
					const updatedText = plainText.slice(0, cursor) + insertion + plainText.slice(cursor);
					const newCursor = cursor + 1 + baseIndent.length + indentUnit.length;
					applyUpdate(updatedText, newCursor, newCursor);
					return;
				}

				e.preventDefault();
				recordUndoSnapshot({ text: plainText, selection: selectionOffsets });

				const linePrefix = plainText.slice(lineStartIndex, cursor);
				const trimmedPrefix = linePrefix.replace(/[\t ]+$/, '');
				const shouldIndentExtra = trimmedPrefix.endsWith('{');
				const indent = baseIndent + (shouldIndentExtra ? indentUnit : '');

				const insertion = `\n${indent}`;
				const updatedText = plainText.slice(0, cursor) + insertion + plainText.slice(cursor);
				const newCursor = cursor + 1 + indent.length;
				applyUpdate(updatedText, newCursor, newCursor);
				return;
			}

			if (e.key === 'Tab') {
				e.preventDefault();
				const selectionOffsets = this.getCodeEditorSelectionOffsets(element);
				const plainText = this.getScriptCodeEditorText(elementId);
				if (!selectionOffsets) {
					recordUndoSnapshot(captureSnapshot());
					this.insertTextAtCursor(element, '\t');
					inputHandler();
					return;
				}

				recordUndoSnapshot({ text: plainText, selection: selectionOffsets });
				const result = this.applyCodeIndentation(plainText, selectionOffsets.start, selectionOffsets.end, e.shiftKey);
				applyUpdate(result.text, result.start, result.end);
			}
		};

		const beforeInputHandler = () => {
			if (state.isUpdating) return;
			state.pendingSnapshot = captureSnapshot();
		};

		const pasteHandler = (e: ClipboardEvent) => {
			e.preventDefault();
			recordUndoSnapshot(captureSnapshot());
			const text = this.normalizeScriptCodeText(e.clipboardData?.getData('text/plain') || '');
			this.insertTextAtCursor(element, text);
			inputHandler();
		};

		// Remove any existing handlers to avoid duplicates
		const existingInput = (element as any)._codeInputHandler;
		const existingKey = (element as any)._codeKeyHandler;
		const existingPaste = (element as any)._codePasteHandler;
		const existingBeforeInput = (element as any)._codeBeforeInputHandler;
		const existingSelection = (element as any)._codeSelectionHandler;
		const existingFocus = (element as any)._codeFocusHandler;
		const existingBlur = (element as any)._codeBlurHandler;
		const existingMouseDown = (element as any)._codeMouseDownHandler;
		const existingMouseMove = (element as any)._codeMouseMoveHandler;
		const existingMouseUp = (element as any)._codeMouseUpHandler;
		if (existingInput) element.removeEventListener('input', existingInput);
		if (existingKey) element.removeEventListener('keydown', existingKey);
		if (existingPaste) element.removeEventListener('paste', existingPaste);
		if (existingBeforeInput) element.removeEventListener('beforeinput', existingBeforeInput as EventListener);
		if (existingSelection) document.removeEventListener('selectionchange', existingSelection);
		if (existingFocus) element.removeEventListener('focus', existingFocus);
		if (existingBlur) element.removeEventListener('blur', existingBlur);
		if (existingMouseDown) element.removeEventListener('mousedown', existingMouseDown);
		if (existingMouseMove) element.removeEventListener('mousemove', existingMouseMove);
		if (existingMouseUp) document.removeEventListener('mouseup', existingMouseUp);

		const selectionHandler = () => {
			if (!state.vimEnabled || state.vimMode !== 'normal') return;
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) return;
			const range = selection.getRangeAt(0);
			if (!element.contains(range.startContainer)) return;
			markVimCaretMovement();
			scheduleVimCaretUpdate();
		};

		const focusHandler = () => {
			state.vimHasFocus = true;
			scheduleVimCaretUpdate();
		};

		const blurHandler = () => {
			state.vimHasFocus = false;
			updateVimCaret();
		};

		const mouseDownHandler = (e: MouseEvent) => {
			if (e.button !== 0) return;
			state.vimMouseDown = true;
			state.vimMouseDragging = false;
		};

		const mouseMoveHandler = () => {
			if (!state.vimMouseDown) return;
			state.vimMouseDragging = true;
			scheduleVimCaretUpdate();
		};

		const mouseUpHandler = () => {
			if (!state.vimMouseDown && !state.vimMouseDragging) return;
			state.vimMouseDown = false;
			state.vimMouseDragging = false;
			scheduleVimCaretUpdate();
		};

		(element as any)._codeInputHandler = inputHandler;
		(element as any)._codeKeyHandler = keyHandler;
		(element as any)._codePasteHandler = pasteHandler;
		(element as any)._codeBeforeInputHandler = beforeInputHandler;
		(element as any)._codeSelectionHandler = selectionHandler;
		(element as any)._codeFocusHandler = focusHandler;
		(element as any)._codeBlurHandler = blurHandler;
		(element as any)._codeMouseDownHandler = mouseDownHandler;
		(element as any)._codeMouseMoveHandler = mouseMoveHandler;
		(element as any)._codeMouseUpHandler = mouseUpHandler;
		element.addEventListener('input', inputHandler);
		element.addEventListener('keydown', keyHandler);
		element.addEventListener('paste', pasteHandler);
		element.addEventListener('beforeinput', beforeInputHandler as EventListener);
		document.addEventListener('selectionchange', selectionHandler);
		element.addEventListener('focus', focusHandler);
		element.addEventListener('blur', blurHandler);
		element.addEventListener('mousedown', mouseDownHandler);
		element.addEventListener('mousemove', mouseMoveHandler);
		document.addEventListener('mouseup', mouseUpHandler);
	}

	public static setScriptCodeEditorText(elementId: string, code: string): void {
		const element = document.getElementById(elementId) as HTMLElement | null;
		if (!element) return;
		const normalized = this.normalizeScriptCodeText(code || '');
		const html = this.highlightScriptCode(normalized);
		element.innerHTML = html || '';
		const state = (element as any)._codeEditorState;
		if (state?.lineNumbersElement) {
			state.measureElement = this.ensureCodeEditorMeasureElement(element, state.measureElement);
			this.updateCodeEditorLineNumbers(state.lineNumbersElement, normalized, element, state.measureElement);
		}
		if (state) {
			state.lastPlainText = normalized;
			state.pendingSnapshot = null;
			state.undoStack = [];
			state.redoStack = [];
			state.errorEntries = [];
			state.errorText = '';
			state.pendingErrors = null;
			if (state.errorTimer) {
				clearTimeout(state.errorTimer);
				state.errorTimer = null;
			}
		}
	}

	public static refreshScriptCodeEditorLayout(elementId: string): void {
		const element = document.getElementById(elementId) as HTMLElement | null;
		if (!element) return;
		const state = (element as any)._codeEditorState;
		if (state?.lineNumbersElement) {
			state.measureElement = this.ensureCodeEditorMeasureElement(element, state.measureElement);
			const plainText = this.getScriptCodeEditorText(elementId);
			this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
		}
	}

	public static renderScriptCodeExample(elementId: string, code: string): void {
		const element = document.getElementById(elementId) as HTMLElement | null;
		if (!element) return;
		element.innerHTML = this.highlightScriptCode(code || '') || '';
	}

	public static getScriptCodeEditorText(elementId: string): string {
		const element = document.getElementById(elementId);
		if (!element) return '';
		return this.normalizeScriptCodeText(this.getScriptCodeTextFromNode(element));
	}

	private static highlightScriptCode(code: string, errorEntries: Array<{ offset: number; message: string }> | null = null): string {
		const tokens = this.tokenizeScriptCode(this.normalizeScriptCodeText(code || ''));
		const sortedErrors = errorEntries ? [...errorEntries].sort((a, b) => a.offset - b.offset) : [];
		let errorIndex = 0;
		let html = '';
		let offset = 0;
		for (const token of tokens) {
			const tokenStart = offset;
			const tokenEnd = tokenStart + token.value.length;
			let hasError = false;
			let errorMessage = '';
			while (errorIndex < sortedErrors.length && sortedErrors[errorIndex].offset < tokenStart) {
				errorIndex++;
			}
			let scanIndex = errorIndex;
			while (scanIndex < sortedErrors.length && sortedErrors[scanIndex].offset < tokenEnd) {
				if (!hasError) {
					hasError = true;
					errorMessage = sortedErrors[scanIndex].message || '';
				}
				scanIndex++;
			}
			const escaped = this.escapeHtml(token.value).replace(/\n/g, '<br>');
			if (token.type === 'whitespace') {
				html += escaped;
				offset = tokenEnd;
				continue;
			}
			let className = token.className;
			if (hasError) {
				className = className ? `${className} script-code-token-error` : 'script-code-token-error';
			}
			const errorAttr = hasError && errorMessage
				? ` data-error="${this.escapeHtmlAttribute(errorMessage)}"`
				: '';
			html += `<span class="${className}"${errorAttr}>${escaped}</span>`;
			errorIndex = scanIndex;
			offset = tokenEnd;
		}
		return html;
	}

	private static tokenizeScriptCode(code: string): Array<{ type: string; className: string; value: string }> {
		const tokens: Array<{ type: string; className: string; value: string }> = [];
		const keywords = new Set(['name', 'websearch', 'reasoning', 'param', 'text', 'if', 'else', 'required', 'label', 'options', 'default', 'placeholder', 'true', 'false']);
		const types = new Set(['choice']);
		let i = 0;
		let lastSignificant: string | null = null;

		const pushToken = (type: string, className: string, value: string) => {
			tokens.push({ type, className, value });
		};

		while (i < code.length) {
			const ch = code[i];
			const next = i + 1 < code.length ? code[i + 1] : '';

			if (ch === '/' && next === '/') {
				let start = i;
				i += 2;
				while (i < code.length && code[i] !== '\n') i++;
				pushToken('comment', 'script-code-token-comment', code.slice(start, i));
				continue;
			}

			if (ch === '"') {
				let start = i;
				i++;
				while (i < code.length) {
					const c = code[i];
					if (c === '\\') {
						i += 2;
						continue;
					}
					if (c === '"') {
						i++;
						break;
					}
					i++;
				}
				pushToken('string', 'script-code-token-string', code.slice(start, i));
				continue;
			}

			if (/\s/.test(ch)) {
				let start = i;
				i++;
				while (i < code.length && /\s/.test(code[i])) i++;
				const whitespace = code.slice(start, i);
				if (whitespace.includes('\n')) {
					lastSignificant = null;
				}
				pushToken('whitespace', '', whitespace);
				continue;
			}

			if (/[A-Za-z_]/.test(ch)) {
				let start = i;
				i++;
				while (i < code.length && /[A-Za-z0-9_]/.test(code[i])) i++;
				const value = code.slice(start, i);
				const tokenKey = value.toLowerCase();
				if ((tokenKey === 'choice' || tokenKey === 'text') && lastSignificant === 'param') {
					pushToken('type', 'script-code-token-type', value);
				} else if (keywords.has(tokenKey)) {
					pushToken('keyword', 'script-code-token-keyword', value);
				} else if (types.has(tokenKey)) {
					pushToken('type', 'script-code-token-type', value);
				} else {
					pushToken('identifier', 'script-code-token-identifier', value);
				}
				lastSignificant = tokenKey;
				continue;
			}

			if ((ch === '=' && next === '=') || (ch === '!' && next === '=') || (ch === '&' && next === '&') || (ch === '|' && next === '|')) {
				pushToken('operator', 'script-code-token-operator', code.slice(i, i + 2));
				i += 2;
				continue;
			}

			if ('{}[](),;'.includes(ch)) {
				pushToken('punctuation', 'script-code-token-punctuation', ch);
				if (ch === ';') {
					lastSignificant = null;
				}
				i++;
				continue;
			}

			pushToken('punctuation', 'script-code-token-punctuation', ch);
			i++;
		}

		return tokens;
	}

	private static buildErrorEntries(code: string, errors: Array<{ line: number; column: number; message?: string }>): Array<{ offset: number; message: string }> {
		if (!errors || errors.length === 0) return [];
		const lines = code.split('\n');
		const lineStarts: number[] = [];
		let running = 0;
		for (const line of lines) {
			lineStarts.push(running);
			running += line.length + 1;
		}

		const entries: Array<{ offset: number; message: string }> = [];
		for (const error of errors) {
			const lineIndex = (error?.line ?? 0) - 1;
			if (lineIndex < 0 || lineIndex >= lines.length) continue;
			const lineText = lines[lineIndex];
			const lineStart = lineStarts[lineIndex];
			const lineEnd = lineStart + lineText.length;
			const rawColumn = Math.max(1, error?.column ?? 1);
			let target = Math.min(lineStart + rawColumn - 1, lineEnd);
			if (target >= lineEnd && lineEnd > lineStart) {
				target = lineEnd - 1;
			}

			const isWhitespace = (index: number) => index >= lineStart && index < lineEnd && /\s/.test(code[index]);
			if (target < lineEnd && isWhitespace(target)) {
				let forward = target;
				while (forward < lineEnd && /\s/.test(code[forward])) forward++;
				if (forward < lineEnd) {
					target = forward;
				} else {
					let backward = target - 1;
					while (backward >= lineStart && /\s/.test(code[backward])) backward--;
					if (backward >= lineStart) {
						target = backward;
					}
				}
			}

			entries.push({ offset: target, message: error?.message ?? 'Invalid syntax.' });
		}

		const byOffset = new Map<number, string>();
		for (const entry of entries) {
			if (!byOffset.has(entry.offset)) {
				byOffset.set(entry.offset, entry.message);
			}
		}
		return Array.from(byOffset.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([offset, message]) => ({ offset, message }));
	}

	public static setScriptCodeEditorErrors(elementId: string, errors: Array<{ line: number; column: number; message?: string }>, sourceText: string, debounceMs: number = 400): void {
		const element = document.getElementById(elementId) as HTMLElement | null;
		if (!element) return;
		const state = (element as any)._codeEditorState;
		if (!state) return;

		state.pendingErrors = { errors: errors || [], text: sourceText || '' };
		if (state.errorTimer) {
			clearTimeout(state.errorTimer);
		}

		state.errorTimer = setTimeout(() => {
			const pending = state.pendingErrors;
			state.pendingErrors = null;
			if (!pending) return;

			const plainText = this.getScriptCodeEditorText(elementId);
			if (this.normalizeScriptCodeText(pending.text) !== plainText) {
				return;
			}

			state.errorEntries = this.buildErrorEntries(plainText, pending.errors);
			state.errorText = plainText;

			const selection = this.getCodeEditorSelectionOffsets(element);
			state.isUpdating = true;
			const html = this.highlightScriptCode(plainText, state.errorEntries);
			element.innerHTML = html || '';
			if (selection) {
				this.setCodeEditorSelectionOffsets(element, selection.start, selection.end);
			}
			this.updateCodeEditorLineNumbers(state.lineNumbersElement, plainText, element, state.measureElement);
			state.isUpdating = false;
		}, Math.max(0, debounceMs || 0));
	}

	public static setScriptCodeEditorVimMode(elementId: string, enabled: boolean, mode: string = 'normal'): void {
		const element = document.getElementById(elementId) as HTMLElement | null;
		if (!element) return;
		const state = (element as any)._codeEditorState;
		if (!state) return;

		const applyMode = (nextMode: 'normal' | 'insert') => {
			if (state.vimMode === nextMode) return;
			state.vimMode = nextMode;
			state.vimPending = null;
			if (nextMode === 'insert') {
				state.vimVisualMode = 'none';
				state.vimVisualAnchor = null;
				state.vimVisualCursor = null;
			}
			if (state.dotNetRef) {
				safeInvoke(state.dotNetRef, 'OnCodeEditorVimModeChanged', [nextMode]);
			}
			if (state.vimUpdateCaret) {
				state.vimUpdateCaret();
			}
			if (state.vimScheduleCaret) {
				state.vimScheduleCaret();
			}
		};

		state.vimEnabled = !!enabled;
		state.vimPending = null;
		if (!state.vimEnabled) {
			applyMode('insert');
			return;
		}

		const normalized = mode && mode.toLowerCase() === 'normal' ? 'normal' : 'insert';
		applyMode(normalized);
	}

	private static escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	private static escapeHtmlAttribute(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	private static normalizeScriptCodeText(text: string): string {
		return text.replace(/\r\n?/g, '\n');
	}

	private static getCodeEditorCaretOffset(element: HTMLElement): number | null {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(0);
		if (!element.contains(range.startContainer)) return null;
		return this.getCodeEditorOffsetForPosition(element, range.startContainer, range.startOffset);
	}

	private static setCodeEditorCaretOffset(element: HTMLElement, offset: number | null): void {
		if (offset === null) return;
		this.setCodeEditorSelectionOffsets(element, offset, offset);
	}

	private static insertTextAtCursor(element: HTMLElement, text: string): void {
		const selection = window.getSelection();
		if (!selection) return;

		if (!selection.rangeCount || !element.contains(selection.anchorNode)) {
			element.focus();
			const range = document.createRange();
			range.selectNodeContents(element);
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);
		}

		const range = selection.getRangeAt(0);
		range.deleteContents();
		const textNode = document.createTextNode(text);
		range.insertNode(textNode);
		range.setStartAfter(textNode);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	private static getCodeEditorSelectionOffsets(element: HTMLElement): { start: number; end: number } | null {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(0);
		if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null;

		const start = this.getCodeEditorOffsetForPosition(element, range.startContainer, range.startOffset);
		const end = this.getCodeEditorOffsetForPosition(element, range.endContainer, range.endOffset);
		if (start === null || end === null) return null;

		return start <= end ? { start, end } : { start: end, end: start };
	}

	private static getCodeEditorOffsetForPosition(element: HTMLElement, container: Node, offset: number): number | null {
		const range = document.createRange();
		range.selectNodeContents(element);
		try {
			range.setEnd(container, offset);
		} catch {
			return null;
		}
		const fragment = range.cloneContents();
		return this.getScriptCodeTextFromNode(fragment).length;
	}

	private static setCodeEditorSelectionOffsets(element: HTMLElement, startOffset: number, endOffset: number): void {
		const selection = window.getSelection();
		if (!selection) return;

		const startPos = this.getCodeEditorPositionForOffset(element, startOffset);
		const endPos = this.getCodeEditorPositionForOffset(element, endOffset);

		const range = document.createRange();
		range.setStart(startPos.container, startPos.offset);
		range.setEnd(endPos.container, endPos.offset);

		selection.removeAllRanges();
		selection.addRange(range);
	}

	private static getCodeEditorPositionForOffset(element: HTMLElement, offset: number): { container: Node; offset: number } {
		let remaining = Math.max(0, offset);
		let found: { container: Node; offset: number } | null = null;

		const walk = (node: Node) => {
			if (found) return;
			if (node.nodeType === Node.TEXT_NODE) {
				const textLength = node.textContent?.length || 0;
				if (remaining <= textLength) {
					found = { container: node, offset: remaining };
					return;
				}
				remaining -= textLength;
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				if (el.tagName === 'BR') {
					if (remaining === 0) {
						const parent = el.parentNode || element;
						const index = Array.prototype.indexOf.call(parent.childNodes, el);
						found = { container: parent, offset: index };
						return;
					}
					remaining--;
					if (remaining === 0) {
						const parent = el.parentNode || element;
						const index = Array.prototype.indexOf.call(parent.childNodes, el);
						found = { container: parent, offset: index + 1 };
						return;
					}
				} else {
					node.childNodes.forEach(walk);
				}
			}
		};

		element.childNodes.forEach(walk);

		if (found) {
			return found;
		}

		return { container: element, offset: element.childNodes.length };
	}

	private static applyCodeIndentation(text: string, startOffset: number, endOffset: number, isUnindent: boolean): { text: string; start: number; end: number } {
		const safeText = text || '';
		let effectiveEnd = endOffset;
		if (effectiveEnd > 0 && effectiveEnd <= safeText.length && safeText[effectiveEnd - 1] === '\n' && startOffset !== endOffset) {
			effectiveEnd -= 1;
		}

		const lines = safeText.split('\n');
		const lineStartOffsets: number[] = [];
		let runningOffset = 0;
		for (const line of lines) {
			lineStartOffsets.push(runningOffset);
			runningOffset += line.length + 1;
		}

		let startLineIndex = 0;
		let endLineIndex = lines.length - 1;
		for (let i = 0; i < lines.length; i++) {
			const lineStart = lineStartOffsets[i];
			const lineEnd = lineStart + lines[i].length;
			if (startOffset >= lineStart && startOffset <= lineEnd) {
				startLineIndex = i;
			}
			if (effectiveEnd >= lineStart && effectiveEnd <= lineEnd) {
				endLineIndex = i;
			}
		}

		const deltas: number[] = new Array(lines.length).fill(0);
		for (let i = startLineIndex; i <= endLineIndex; i++) {
			const line = lines[i];
			if (isUnindent) {
				if (line.startsWith('\t')) {
					lines[i] = line.substring(1);
					deltas[i] = -1;
				} else if (line.startsWith('  ')) {
					lines[i] = line.substring(2);
					deltas[i] = -2;
				}
			} else {
				lines[i] = '\t' + line;
				deltas[i] = 1;
			}
		}

		const adjustOffset = (offset: number) => {
			let adjusted = offset;
			for (let i = 0; i < lines.length; i++) {
				const lineStart = lineStartOffsets[i];
				const lineEnd = lineStart + (lines[i].length - deltas[i]);
				if (offset > lineEnd) {
					adjusted += deltas[i];
				} else if (offset >= lineStart) {
					adjusted += deltas[i];
					break;
				}
			}
			return Math.max(0, adjusted);
		};

		const newStart = adjustOffset(startOffset);
		const newEnd = adjustOffset(endOffset);
		return { text: lines.join('\n'), start: newStart, end: newEnd };
	}

	private static replaceCodeSelectionWithPair(text: string, startOffset: number, endOffset: number, openChar: string, closeChar: string): { text: string; start: number; end: number } {
		const before = text.slice(0, startOffset);
		const after = text.slice(endOffset);
		const middle = text.slice(startOffset, endOffset);
		const updated = `${before}${openChar}${middle}${closeChar}${after}`;
		if (startOffset === endOffset) {
			const cursor = startOffset + openChar.length;
			return { text: updated, start: cursor, end: cursor };
		}
		return { text: updated, start: startOffset + openChar.length, end: endOffset + openChar.length };
	}

	private static replaceCodeSelectionWithText(text: string, startOffset: number, endOffset: number, insertText: string): { text: string; start: number; end: number } {
		const before = text.slice(0, startOffset);
		const after = text.slice(endOffset);
		const updated = `${before}${insertText}${after}`;
		const cursor = before.length + insertText.length;
		return { text: updated, start: cursor, end: cursor };
	}

	private static updateCodeEditorLineNumbers(lineNumbersElement: HTMLElement | null, text: string, editorElement: HTMLElement, measureElement?: HTMLElement | null): void {
		if (!lineNumbersElement) return;
		const normalized = this.normalizeScriptCodeText(text);
		const lineHeight = this.getLineHeight(editorElement);
		const style = window.getComputedStyle(editorElement);
		const whiteSpace = style.whiteSpace || 'pre-wrap';
		const wrapEnabled = whiteSpace === 'pre-wrap';
		if (measureElement) {
			measureElement.style.whiteSpace = whiteSpace;
		}
		if (!measureElement || !lineHeight || !wrapEnabled) {
			const lineCount = Math.max(1, normalized.split('\n').length);
			const lines = new Array(lineCount);
			for (let i = 0; i < lineCount; i++) {
				lines[i] = (i + 1).toString();
			}
			lineNumbersElement.textContent = lines.join('\n');
			return;
		}

		const lines = normalized.split('\n');
		const lineNumbers: string[] = [];
		const maxWidth = Math.max(1, editorElement.clientWidth);
		measureElement.style.width = `${maxWidth}px`;

		for (let i = 0; i < lines.length; i++) {
			const lineText = lines[i] === '' ? ' ' : lines[i];
			measureElement.textContent = lineText;
			const height = measureElement.getBoundingClientRect().height || lineHeight;
			const wraps = Math.max(1, Math.ceil(height / lineHeight - 0.01));
			lineNumbers.push((i + 1).toString());
			for (let j = 1; j < wraps; j++) {
				lineNumbers.push('');
			}
		}
		lineNumbersElement.textContent = lineNumbers.join('\n');
	}

	private static getLineHeight(element: HTMLElement): number {
		const lineHeight = window.getComputedStyle(element).lineHeight;
		const parsed = parseFloat(lineHeight || '');
		return Number.isFinite(parsed) ? parsed : 0;
	}

	private static ensureCodeEditorMeasureElement(editorElement: HTMLElement, existingElement?: HTMLElement | null): HTMLElement | null {
		if (existingElement && existingElement.isConnected) {
			return existingElement;
		}

		const measure = document.createElement('div');
		const style = window.getComputedStyle(editorElement);
		measure.className = 'script-code-editor-measure';
		measure.style.fontFamily = style.fontFamily;
		measure.style.fontSize = style.fontSize;
		measure.style.fontWeight = style.fontWeight;
		measure.style.lineHeight = style.lineHeight;
		measure.style.whiteSpace = style.whiteSpace || 'pre-wrap';
		measure.style.position = 'absolute';
		measure.style.visibility = 'hidden';
		measure.style.pointerEvents = 'none';
		measure.style.left = '-9999px';
		measure.style.top = '0';
		measure.style.padding = '0';

		document.body.appendChild(measure);
		return measure;
	}

	private static getScriptCodeTextFromNode(root: Node): string {
		let result = '';
		const walk = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				result += this.normalizeScriptCodeText(node.textContent || '');
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				if (el.tagName === 'BR') {
					result += '\n';
				} else if (el.tagName === 'DIV' || el.tagName === 'P') {
					if (result.length > 0 && !result.endsWith('\n')) {
						result += '\n';
					}
					node.childNodes.forEach(walk);
				} else {
					node.childNodes.forEach(walk);
				}
			} else {
				node.childNodes?.forEach(walk);
			}
		};
		walk(root);
		return result;
	}

	/**
	 * Initialize multiple text blocks in the script editor
	 * @param blockIds - Array of block IDs
	 * @param texts - Array of text content for each block
	 * @param builtInVars - Array of built-in variable names
	 */
	public static initScriptEditorBlocks(blockIds: number[], texts: string[], builtInVars: string[], dotNetRef?: any): void {
		blockIds.forEach((id, index) => {
			const elementId = `block-${id}`;
			const text = texts[index] || '';
			this.initScriptEditor(elementId, text, builtInVars);

			// Set up input listener to sync text back to Blazor for live preview
			if (dotNetRef) {
				const element = document.getElementById(elementId);
				if (element) {
					// Remove any existing listener
					const existingHandler = (element as any)._inputHandler;
					if (existingHandler) {
						element.removeEventListener('input', existingHandler);
					}

					// Add debounced input handler
					let debounceTimer: any = null;
					const handler = () => {
						if (debounceTimer) clearTimeout(debounceTimer);
						debounceTimer = setTimeout(() => {
							const currentText = this.getScriptEditorBlockText(id);
							safeInvoke(dotNetRef, 'OnBlockTextChanged', [id, currentText]);
						}, 150); // Debounce 150ms
					};
					(element as any)._inputHandler = handler;
					element.addEventListener('input', handler);
				}
			}
		});
	}

	/**
	 * Get text from a specific block in the script editor
	 * @param blockId - The block ID
	 */
	public static getScriptEditorBlockText(blockId: number): string {
		return this.getScriptEditorText(`block-${blockId}`);
	}

	/**
	 * Clicks on the document body to close any open menus/dropdowns
	 */
	public static closeOpenMenus(): void {
		// Dispatch a click event on the body to close any open menus
		document.body.click();
	}

	/**
	 * Insert a variable into the first focused text block, or the first block if none focused
	 * @param blockIds - Array of all text block IDs to search
	 * @param varName - The variable name to insert
	 * @param isBuiltIn - Whether this is a built-in variable
	 */
	public static insertScriptVariableInBlocks(blockIds: number[], varName: string, isBuiltIn: boolean): void {
		const selection = window.getSelection();

		// Try to find which block has focus
		for (const id of blockIds) {
			const element = document.getElementById(`block-${id}`);
			if (element && selection && selection.anchorNode && element.contains(selection.anchorNode)) {
				this.insertScriptVariable(`block-${id}`, varName, isBuiltIn);
				return;
			}
		}

		// No block has focus, insert into first block
		if (blockIds.length > 0) {
			const firstBlockId = `block-${blockIds[0]}`;
			const element = document.getElementById(firstBlockId);
			if (element) {
				// Move cursor to end of first block
				element.focus();
				const range = document.createRange();
				range.selectNodeContents(element);
				range.collapse(false);
				selection?.removeAllRanges();
				selection?.addRange(range);

				this.insertScriptVariable(firstBlockId, varName, isBuiltIn);
			}
		}
	}

	// ============================================
	// Block Navigation for Script Editor
	// ============================================

	/**
	 * Check if element is effectively empty (no text content or variable tokens)
	 */
	private static isBlockEmpty(element: HTMLElement): boolean {
		let hasContent = false;
		const walk = (node: Node) => {
			if (hasContent) return;
			if (node.nodeType === Node.TEXT_NODE) {
				// Check for any non-whitespace text
				if ((node.textContent || '').trim().length > 0) {
					hasContent = true;
				}
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				if (el.classList.contains('script-var')) {
					// Variable tokens count as content
					hasContent = true;
				} else if (el.tagName !== 'BR') {
					el.childNodes.forEach(walk);
				}
			}
		};
		element.childNodes.forEach(walk);
		return !hasContent;
	}

	/**
	 * Check if cursor is at the very start of a contenteditable element
	 */
	private static isAtBlockStart(element: HTMLElement): boolean {
		const selection = window.getSelection();
		if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
			return false;
		}

		// For empty blocks, cursor is always at both start and end
		if (this.isBlockEmpty(element)) {
			return true;
		}

		const range = selection.getRangeAt(0);

		// Check if we're at the start of the element
		// We need to account for the cursor being in a text node or at the element level
		let node: Node | null = range.startContainer;
		let offset = range.startOffset;

		// If offset is not 0 in current node, we're not at start
		if (offset !== 0) {
			return false;
		}

		// Walk backwards to see if there's any content before cursor
		while (node && node !== element) {
			const parent: Node | null = node.parentNode;
			if (!parent) break;

			// Check if there are siblings before this node
			let sibling = node.previousSibling;
			while (sibling) {
				// Skip BR elements
				if (sibling.nodeName === 'BR') {
					sibling = sibling.previousSibling;
					continue;
				}
				// Check if sibling has any text content or is a variable token
				if ((sibling as HTMLElement).classList?.contains('script-var')) {
					return false;
				}
				const text = sibling.textContent || '';
				if (text.trim().length > 0) {
					return false;
				}
				sibling = sibling.previousSibling;
			}

			node = parent;
		}

		return true;
	}

	/**
	 * Check if cursor is at the very end of a contenteditable element
	 */
	private static isAtBlockEnd(element: HTMLElement): boolean {
		const selection = window.getSelection();
		if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
			return false;
		}

		// For empty blocks, cursor is always at both start and end
		if (this.isBlockEmpty(element)) {
			return true;
		}

		const range = selection.getRangeAt(0);
		let node: Node | null = range.startContainer;
		let offset = range.startOffset;

		// If we're in a text node, check if offset is at the end
		if (node.nodeType === Node.TEXT_NODE) {
			if (offset !== (node.textContent?.length || 0)) {
				return false;
			}
		}

		// Walk forwards to see if there's any content after cursor
		while (node && node !== element) {
			const parent: Node | null = node.parentNode;
			if (!parent) break;

			// Check if there are siblings after this node
			let sibling = node.nextSibling;
			while (sibling) {
				// Skip BR elements at the end
				if (sibling.nodeName === 'BR') {
					sibling = sibling.nextSibling;
					continue;
				}
				// Check if sibling has any text content or is a variable token
				if ((sibling as HTMLElement).classList?.contains('script-var')) {
					return false;
				}
				const text = sibling.textContent || '';
				if (text.trim().length > 0) {
					return false;
				}
				sibling = sibling.nextSibling;
			}

			node = parent;
		}

		return true;
	}

	/**
	 * Focus a block and place cursor at the start
	 */
	private static focusBlockStart(blockId: number): void {
		const element = document.getElementById(`block-${blockId}`);
		if (!element) return;

		element.focus();
		const selection = window.getSelection();
		if (selection) {
			const range = document.createRange();

			// Find the first text position
			if (element.firstChild) {
				if (element.firstChild.nodeType === Node.TEXT_NODE) {
					range.setStart(element.firstChild, 0);
				} else {
					range.setStart(element, 0);
				}
			} else {
				range.setStart(element, 0);
			}
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	/**
	 * Focus a block and place cursor at the end
	 */
	private static focusBlockEnd(blockId: number): void {
		const element = document.getElementById(`block-${blockId}`);
		if (!element) return;

		element.focus();
		const selection = window.getSelection();
		if (selection) {
			const range = document.createRange();
			range.selectNodeContents(element);
			range.collapse(false); // false = collapse to end
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	/**
	 * Setup arrow key navigation between text blocks in the script editor
	 * @param blockIds - Array of text block IDs in visual order
	 */
	public static setupBlockNavigation(blockIds: number[]): void {
		for (let i = 0; i < blockIds.length; i++) {
			const currentBlockId = blockIds[i];
			const element = document.getElementById(`block-${currentBlockId}`);
			if (!element) continue;

			// Remove any existing navigation listener to avoid duplicates
			const existingHandler = (element as any)._blockNavHandler;
			if (existingHandler) {
				element.removeEventListener('keydown', existingHandler);
			}

			const prevBlockId = i > 0 ? blockIds[i - 1] : null;
			const nextBlockId = i < blockIds.length - 1 ? blockIds[i + 1] : null;

			const handler = (e: KeyboardEvent) => {
				// Only handle arrow keys
				if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
					return;
				}

				// Handle ArrowUp or ArrowLeft at start of block
				if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && prevBlockId !== null) {
					if (this.isAtBlockStart(element)) {
						e.preventDefault();
						this.focusBlockEnd(prevBlockId);
					}
				}

				// Handle ArrowDown or ArrowRight at end of block
				if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && nextBlockId !== null) {
					if (this.isAtBlockEnd(element)) {
						e.preventDefault();
						this.focusBlockStart(nextBlockId);
					}
				}
			};

			// Store reference for cleanup
			(element as any)._blockNavHandler = handler;
			element.addEventListener('keydown', handler);
		}
	}

	/**
	 * Attach a keydown handler to confine Ctrl+A (Select All) to the specified container.
	 * When Ctrl+A is pressed while the selection or active element is within the container,
	 * only the container's content is selected.
	 * @param containerId - The ID of the container element to confine selection to
	 */
	public static attachSelectAllHandler(containerId: string): void {
		const container = document.getElementById(containerId);
		if (!container) {
			console.warn(`AiChatUtils: attachSelectAllHandler - Container with ID '${containerId}' not found`);
			return;
		}

		// Use unique keys to track handlers
		const handlerKey = `_selectAllHandler_${containerId}`;
		const mouseHandlerKey = `_selectAllMouseHandler_${containerId}`;
		const stateKey = `_selectAllLastClickInContainer_${containerId}`;

		// Remove any existing handlers
		const existingHandler = (document as any)[handlerKey];
		if (existingHandler) {
			document.removeEventListener('keydown', existingHandler, true);
		}
		const existingMouseHandler = (document as any)[mouseHandlerKey];
		if (existingMouseHandler) {
			document.removeEventListener('mousedown', existingMouseHandler, true);
		}

		// Track whether the last mousedown was within the container
		const mouseHandler = (e: MouseEvent) => {
			(document as any)[stateKey] = container.contains(e.target as Node);
		};

		const keyHandler = (e: KeyboardEvent) => {
			// Check for Ctrl+A (or Cmd+A on Mac)
			if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a')) {
				return;
			}

			// Check if the current selection or active element is within our container
			const selection = window.getSelection();
			const activeElement = document.activeElement;

			let isWithinContainer = false;

			// Check if active element is within container
			if (activeElement && container.contains(activeElement)) {
				isWithinContainer = true;
			}

			// Check if current selection is within container
			if (!isWithinContainer && selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				if (container.contains(range.commonAncestorContainer)) {
					isWithinContainer = true;
				}
			}

			// Check if the last mousedown was within the container
			if (!isWithinContainer && (document as any)[stateKey] === true) {
				isWithinContainer = true;
			}

			if (!isWithinContainer) {
				return; // Let the default behavior happen elsewhere
			}

			e.preventDefault();
			e.stopPropagation();

			// Select all content within the container
			const newRange = document.createRange();
			newRange.selectNodeContents(container);
			selection?.removeAllRanges();
			selection?.addRange(newRange);
		};

		// Store references for cleanup and listen at document level with capture
		(document as any)[handlerKey] = keyHandler;
		(document as any)[mouseHandlerKey] = mouseHandler;
		document.addEventListener('keydown', keyHandler, true);
		document.addEventListener('mousedown', mouseHandler, true);
	}

	/**
	 * Observe a sentinel element for infinite scroll in the history sidebar.
	 * When the sentinel becomes visible within its scroll container, invokes the .NET method.
	 */
	public static observeSentinel(sentinelId: string, scrollContainerId: string, dotNetRef: any, method: string): void {
		AiChatUtils.disconnectSentinel();

		const sentinel = document.getElementById(sentinelId);
		const scrollContainer = document.getElementById(scrollContainerId);
		if(!sentinel || !scrollContainer) return;

		AiChatUtils.sentinelObserver = new IntersectionObserver((entries) => {
			if(entries[0].isIntersecting) {
				safeInvoke(dotNetRef, method);
			}
		}, { root: scrollContainer, threshold: 0 });
		AiChatUtils.sentinelObserver.observe(sentinel);
	}

	/**
	 * Disconnect the sentinel observer
	 */
	public static disconnectSentinel(): void {
		if(AiChatUtils.sentinelObserver) {
			AiChatUtils.sentinelObserver.disconnect();
			AiChatUtils.sentinelObserver = null;
		}
	}
}
