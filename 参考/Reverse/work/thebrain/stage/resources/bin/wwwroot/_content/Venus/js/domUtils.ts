import {Point, Rect} from "./geometry.js"
import {safeInvoke} from "./interop.js"

type CardFlipRect = { left: number; top: number; width: number; height: number };

export class DomUtils {

	private static cardFlipRects: Record<string, CardFlipRect> = {};
	private static gutterResizeObservers: WeakMap<HTMLElement, ResizeObserver> = new WeakMap();
	private static _boundsTracker: { listener: (e: MouseEvent) => void } | null = null;

	public static offsetElement(element: HTMLElement, delta: Point) {
		// assumes element is already positioned relative or absolute and positioned in pixels
		let left = +element.style.left.substring(0, element.style.left.length - 2);
		let top = +element.style.top.substring(0, element.style.top.length - 2);
		left += delta.x;
		top += delta.y;
		element.style.left = left + "px";
		element.style.top = top + "px";
	}

	public static getCenter(element: HTMLElement, parentElement: HTMLElement): Point {
		let rect = this.getRect(element, parentElement)
		return rect.getCenter();
	}

	public static getRect(element: HTMLElement, parentElement: HTMLElement): Rect {
		let fieldRect = parentElement.getBoundingClientRect();
		let clientRect = element.getBoundingClientRect();
		let rect = new Rect(clientRect.x, clientRect.y, clientRect.width, clientRect.height);
		rect.x -= fieldRect.left;
		rect.y -= fieldRect.top;
		return rect;
	}

	public static centerOnTopOf(element: HTMLElement, centerOnElement: HTMLElement, parentElement: HTMLElement) {
		let cen = this.getCenter(centerOnElement, parentElement);
		this.centerAt(element, cen);
	}

	public static keepInsideOf(element: HTMLElement, locationElement: HTMLElement) {
		let clientRect = element.getBoundingClientRect();
		let containRect = locationElement.getBoundingClientRect();
		// assumes element is positioned absolutely in pixels;
		let left = +element.style.left.substring(0, element.style.left.length - 2);
		let top = +element.style.top.substring(0, element.style.top.length - 2);
		if(clientRect.x < containRect.x) {
			left += containRect.x - clientRect.x;
		}
		if(clientRect.y < containRect.y) {
			top += containRect.y - clientRect.y;
		}
		if(clientRect.right > containRect.right) {
			left -= clientRect.right - containRect.right;
		}
		if(clientRect.bottom > containRect.bottom) {
			top -= clientRect.bottom - containRect.bottom;
		}
		element.style.left = left + "px";
		element.style.top = top + "px";
	}

	public static centerAt(element: HTMLElement, cen: Point) {
		element.style.position = "absolute";
		element.style.left = cen.x - element.clientWidth / 2 + "px";
		element.style.top = cen.y - element.clientHeight / 2 + "px";
	}

	public static positionAt(element: HTMLElement, pt: Point) {
		element.style.position = "absolute";
		element.style.left = pt.x + "px";
		element.style.top = pt.y + "px";
	}

	// called from Blazor
	public static SelectRangeInTextInputElement(element: HTMLInputElement | HTMLTextAreaElement | HTMLElement, range: { start: { value: number }, end: { value: number } } | null, selectAll: boolean) {
		if(!element || typeof element.focus !== 'function') {
			console.warn('SelectRangeInTextInputElement: Invalid or unfocusable element provided');
			return;
		}

		element.focus();

		if(selectAll) {
			// For input and textarea elements
			if(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
				element.select();
				return;
			}
			// For contenteditable elements
			else if(element.getAttribute('contenteditable') === 'true') {
				const domRange = document.createRange();
				domRange.selectNodeContents(element);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(domRange);
				return;
			}
		}

		if(range) {
			const startIndex = range.start.value;
			const endIndex = range.end.value;

			// For input and textarea elements
			if(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
				element.setSelectionRange(startIndex, endIndex);
			}
			// For contenteditable elements
			else if(element.getAttribute('contenteditable') === 'true') {
				const selection = window.getSelection();
				const domRange = document.createRange();

				const textNode = element.firstChild as Text;
				if(textNode && textNode.nodeType === Node.TEXT_NODE) {
					domRange.setStart(textNode, startIndex);
					domRange.setEnd(textNode, endIndex);
					selection?.removeAllRanges();
					selection?.addRange(domRange);
				}
			}
		}
    }
    
    // called from Blazor
    public static unfocusElement(elementId: string) {
        let elem = document.getElementById(elementId);
        if(elem) {
            elem.blur();
        }
    }

    // called from Blazor - sets input value without triggering re-render race conditions
    public static setInputValue(element: HTMLInputElement, value: string) {
        if(element && element.value !== value) {
            element.value = value;
        }
    }

	// called from Blazor
	public static updatePrettyPrint() {
		// @ts-ignore
		PR.prettyPrint();
	}

	// called from Blazor
	public static getCursorPositionInElement(elementId: string) {
		let element = document.getElementById(elementId);
		if(element) {
			let inputElement = element as HTMLInputElement;
			return inputElement.selectionStart as number;
		} else {
			return -1;
		}
	}

	// called from Blazor. Attaches a synchronous keydown listener that snapshots
	// the input's selection BEFORE any default action runs (idempotent — safe to
	// call multiple times). Blazor's @onkeydown handler is async, so by the time
	// the C# side runs, the browser has already processed Backspace/typed-char
	// and the live selection no longer reflects the pre-keydown state.
	public static attachKeyDownSelectionSnapshot(elementId: string) {
		let element = document.getElementById(elementId);
		if(!element) {
			return;
		}
		let el = element as HTMLInputElement & { __keyDownSelectionSnapshotAttached?: boolean };
		if(el.__keyDownSelectionSnapshotAttached) {
			return;
		}
		el.__keyDownSelectionSnapshotAttached = true;
		el.addEventListener('keydown', (e) => {
			(el as any).__lastKeyDownSelectionStart = el.selectionStart;
			(el as any).__lastKeyDownSelectionEnd = el.selectionEnd;
		}, true); // capture phase, before other listeners
	}

	// called from Blazor. Reads the snapshot captured by attachKeyDownSelectionSnapshot.
	public static wasCursorAtStartNoSelectionAtLastKeyDown(elementId: string): boolean {
		let element = document.getElementById(elementId) as HTMLInputElement & {
			__lastKeyDownSelectionStart?: number | null,
			__lastKeyDownSelectionEnd?: number | null,
		};
		if(!element) {
			return false;
		}
		return element.__lastKeyDownSelectionStart === 0 && element.__lastKeyDownSelectionEnd === 0;
	}

	public static setPointerCapture(element: HTMLElement | null, pointerId: number) {
		element?.setPointerCapture(pointerId);
	}

	public static releasePointerCapture(element: HTMLElement | null, pointerId: number) {
		element?.releasePointerCapture(pointerId);
	}

	public static syncScrollTop(source: HTMLElement | null, target: HTMLElement | null) {
		if(source && target) {
			target.scrollTop = source.scrollTop;
		}
	}

	public static syncGutterWithTextarea(textarea: HTMLElement | null, gutter: HTMLElement | null): void {
		if(!textarea || !gutter) return;

		const ta = textarea as HTMLTextAreaElement;
		const text = ta.value || '';
		const lines = text.split('\n');
		const style = window.getComputedStyle(ta);
		const lineHeight = parseFloat(style.lineHeight);
		const isWrapping = style.whiteSpace !== 'pre';

		if(!isWrapping || !lineHeight) {
			let html = '';
			for(let i = 1; i <= lines.length; i++) {
				html += `<div style="height:${lineHeight}px">${i}</div>`;
			}
			gutter.innerHTML = html;
			gutter.scrollTop = ta.scrollTop;
			return;
		}

		const paddingLeft = parseFloat(style.paddingLeft) || 0;
		const paddingRight = parseFloat(style.paddingRight) || 0;
		const contentWidth = ta.clientWidth - paddingLeft - paddingRight;

		if(contentWidth <= 0) {
			gutter.scrollTop = ta.scrollTop;
			return;
		}

		const mirror = document.createElement('pre');
		mirror.style.cssText =
			'position:absolute;visibility:hidden;pointer-events:none;padding:0;margin:0;border:none;box-sizing:content-box;overflow:hidden;' +
			`white-space:${style.whiteSpace};word-wrap:${style.wordWrap};overflow-wrap:${style.overflowWrap};` +
			`font:${style.font};letter-spacing:${style.letterSpacing};tab-size:${style.tabSize};` +
			`width:${contentWidth}px;`;
		document.body.appendChild(mirror);

		let html = '';
		for(let i = 0; i < lines.length; i++) {
			mirror.textContent = lines[i] || ' ';
			const h = mirror.offsetHeight;
			html += `<div style="height:${h}px">${i + 1}</div>`;
		}

		document.body.removeChild(mirror);
		gutter.innerHTML = html;
		gutter.scrollTop = ta.scrollTop;
	}

	public static syncGutterCurrentLine(textarea: HTMLElement | null, gutter: HTMLElement | null): void {
		if(!textarea || !gutter) return;

		const ta = textarea as HTMLTextAreaElement;
		const text = ta.value || '';
		const lines = text.split('\n');

		// If line count changed, fall back to full rebuild
		if(lines.length !== gutter.children.length) {
			DomUtils.syncGutterWithTextarea(textarea, gutter);
			return;
		}

		const style = window.getComputedStyle(ta);
		const isWrapping = style.whiteSpace !== 'pre';

		// If not wrapping, heights are fixed — nothing to remeasure
		if(!isWrapping) {
			gutter.scrollTop = ta.scrollTop;
			return;
		}

		const paddingLeft = parseFloat(style.paddingLeft) || 0;
		const paddingRight = parseFloat(style.paddingRight) || 0;
		const contentWidth = ta.clientWidth - paddingLeft - paddingRight;

		if(contentWidth <= 0) {
			gutter.scrollTop = ta.scrollTop;
			return;
		}

		// Find cursor line
		const cursorPos = ta.selectionStart ?? 0;
		let lineIndex = 0;
		let pos = 0;
		for(let i = 0; i < lines.length; i++) {
			pos += lines[i].length + 1;
			if(pos > cursorPos) {
				lineIndex = i;
				break;
			}
		}

		// Remeasure only the cursor line
		const mirror = document.createElement('pre');
		mirror.style.cssText =
			'position:absolute;visibility:hidden;pointer-events:none;padding:0;margin:0;border:none;box-sizing:content-box;overflow:hidden;' +
			`white-space:${style.whiteSpace};word-wrap:${style.wordWrap};overflow-wrap:${style.overflowWrap};` +
			`font:${style.font};letter-spacing:${style.letterSpacing};tab-size:${style.tabSize};` +
			`width:${contentWidth}px;`;
		document.body.appendChild(mirror);

		mirror.textContent = lines[lineIndex] || ' ';
		const h = mirror.offsetHeight;

		document.body.removeChild(mirror);

		const gutterChild = gutter.children[lineIndex] as HTMLElement;
		if(gutterChild) {
			gutterChild.style.height = h + 'px';
		}

		gutter.scrollTop = ta.scrollTop;
	}

	public static initGutterResizeObserver(textarea: HTMLElement | null, gutter: HTMLElement | null): void {
		if(!textarea || !gutter) return;

		DomUtils.disposeGutterResizeObserver(textarea);
		DomUtils.syncGutterWithTextarea(textarea, gutter);

		const observer = new ResizeObserver(() => {
			DomUtils.syncGutterWithTextarea(textarea, gutter);
		});
		observer.observe(textarea);
		DomUtils.gutterResizeObservers.set(textarea, observer);
	}

	public static disposeGutterResizeObserver(textarea: HTMLElement | null): void {
		if(!textarea) return;
		const observer = DomUtils.gutterResizeObservers.get(textarea);
		if(observer) {
			observer.disconnect();
			DomUtils.gutterResizeObservers.delete(textarea);
		}
	}

	public static captureElementRects(elementIds: string[]): number {
		if(!elementIds || elementIds.length === 0) {
			return 0;
		}

		let captured = 0;
		for(const id of elementIds) {
			const element = document.getElementById(id);
			if(!element) {
				continue;
			}
			DomUtils.cardFlipRects[id] = DomUtils.getDocumentRelativeRect(element);
			captured++;
		}
		return captured;
	}

	public static captureElementsBySelectorWithin(containerId: string, selector: string): number {
		if(!selector) {
			return 0;
		}

		const scope: Element | Document | null = containerId ? document.getElementById(containerId) : document;
		if(!scope) {
			return 0;
		}

		DomUtils.cardFlipRects = {};
		let captured = 0;
		const elements = scope.querySelectorAll(selector);
		elements.forEach(element => {
			const el = element as HTMLElement;
			if(!el.id) {
				return;
			}
			DomUtils.cardFlipRects[el.id] = DomUtils.getDocumentRelativeRect(el);
			captured++;
		});
		return captured;
	}

	public static animateElementFlip(elementIds: string[], durationMs: number) {
		if(!elementIds || elementIds.length === 0) {
			return;
		}

		const duration = durationMs && durationMs > 0 ? durationMs : 400;
		const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';

		for(const id of elementIds) {
			const previousRect = DomUtils.cardFlipRects[id];
			const element = document.getElementById(id);
			delete DomUtils.cardFlipRects[id];
			if(!element) {
				continue;
			}

			const nextRect = DomUtils.getDocumentRelativeRect(element);
			let deltaX = 0;
			let deltaY = 0;
			if(previousRect) {
				deltaX = previousRect.left - nextRect.left;
				deltaY = previousRect.top - nextRect.top;
			}
			const shouldTranslate = Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5;
			const translateStart = shouldTranslate ? `translate(${deltaX}px, ${deltaY}px)` : 'translate(0px, 0px)';
			const startTransform = `${translateStart} scale(${shouldTranslate ? 1.02 : 1.04})`;
			const endTransform = 'translate(0px, 0px) scale(1)';

			const originalZIndex = element.style.zIndex;
			const originalPointerEvents = element.style.pointerEvents;
			element.classList.add('cards-view-card--animating');
			element.style.zIndex = '1000';
			element.style.pointerEvents = 'none';

			let finished = false;
			const cleanup = () => {
				if(finished) {
					return;
				}
				finished = true;
				element.classList.remove('cards-view-card--animating');
				element.style.zIndex = originalZIndex;
				element.style.pointerEvents = originalPointerEvents;
				element.style.removeProperty('transition');
				element.style.removeProperty('transform');
				element.style.removeProperty('filter');
				element.style.removeProperty('opacity');
				element.style.removeProperty('will-change');
			};

			if(typeof element.animate === 'function') {
				const animation = element.animate([
					{
						transform: startTransform,
						filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.35))',
						opacity: 0.95
					},
					{
						transform: endTransform,
						filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))',
						opacity: 1
					}
				], {
					duration,
					easing,
					fill: 'none'
				});

				animation.onfinish = cleanup;
				animation.oncancel = cleanup;
			} else {
				element.style.willChange = 'transform, filter, opacity';
				element.style.transition = 'none';
				element.style.transform = startTransform;
				element.style.filter = 'drop-shadow(0 20px 40px rgba(0,0,0,0.35))';
				element.style.opacity = '0.95';

				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						element.style.transition = `transform ${duration}ms ${easing}, filter ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
						element.style.transform = endTransform;
						element.style.filter = 'drop-shadow(0 0 0 rgba(0,0,0,0))';
						element.style.opacity = '1';
					});
				});

				element.addEventListener('transitionend', cleanup, { once: true });
				element.addEventListener('transitioncancel', cleanup, { once: true });
				window.setTimeout(cleanup, duration + 100);
			}
		}
	}

	private static getDocumentRelativeRect(element: HTMLElement): CardFlipRect {
		const rect = element.getBoundingClientRect();
		const scrollX = window.pageXOffset ?? document.documentElement?.scrollLeft ?? 0;
		const scrollY = window.pageYOffset ?? document.documentElement?.scrollTop ?? 0;
		return {
			left: rect.left + scrollX,
			top: rect.top + scrollY,
			width: rect.width,
			height: rect.height
		};
	}

	public static initIgnoreScrollEvents(elementId: string) {
		let element = document.getElementById(elementId);
		if(element) {
			let startY: number | null = null;
			let startX: number | null = null;
			let maxDelta = 0;
			const moveThreshold = 10; // Beyond this distance taps with a stylus will not count as clicks

			element.addEventListener("touchstart", (event) => {
				startY = event.touches[0].clientY;
				startX = event.touches[0].clientX;
				maxDelta = 0;
			});

			element.addEventListener("touchend", (e) => {

				console.log(`maxDelta: ${maxDelta}`)

				if(maxDelta > moveThreshold) {
					return;
				}

				// Create and dispatch a click event
				const clickEvent = new MouseEvent('click', {
					bubbles: true,
					cancelable: true,
					view: window,
					clientX: e.changedTouches[0].clientX,
					clientY: e.changedTouches[0].clientY,
					screenX: e.changedTouches[0].screenX,
					screenY: e.changedTouches[0].screenY,
					buttons: 0,
					button: 0,  // Left click
					ctrlKey: e.ctrlKey,
					altKey: e.altKey,
					shiftKey: e.shiftKey,
					metaKey: e.metaKey
				});

				e.changedTouches[0].target.dispatchEvent(clickEvent);
			});

			element.addEventListener("touchmove", (event) => {

				const deltaY = Math.abs(event.touches[0].clientY - startY!);
				const deltaX = Math.abs(event.touches[0].clientX - startX!);
				const delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

				maxDelta = Math.max(maxDelta, delta);

				event.preventDefault();
			});

			// Still prevent wheel events as before
			element.addEventListener("wheel", (event) => {
				event.preventDefault();
			});

			// Still prevent scroll events as before
			element.addEventListener("scroll", (event) => {
				event.preventDefault();
			});
		}
	}

	/**
	 * Prevents an element from stealing focus when clicked.
	 * Used for background overlays that should dismiss dialogs without
	 * removing focus from the previously focused element.
	 */
	public static initPreventFocusLoss(elementId: string) {
		const element = document.getElementById(elementId);
		if(element) {
			element.addEventListener("mousedown", (event) => {
				event.preventDefault();
			});
		}
	}

	public static async setContenteditableText(element: HTMLElement, content: string | null, targetXPosition?: number | null, skipAutoCapture?: boolean): Promise<void> {
		if(element) {
			const normalizedContent = content ?? "";
			if(element.innerText === normalizedContent) {
				return;
			}

			// Save cursor X position if element is focused (only if no explicit target provided and auto-capture not disabled)
			const isFocused = document.activeElement === element;
			let savedXPosition: number | null = targetXPosition !== undefined ? targetXPosition : null;
			let savedYPosition: number | null = null;

			if(isFocused && savedXPosition === null && !skipAutoCapture) {
				const selection = window.getSelection();
				if(selection && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0);
					if(element.contains(range.commonAncestorContainer)) {
						const rect = range.getBoundingClientRect();
						savedXPosition = rect.left;
						// Capture Y too so we can restore the caret to the same visual row
						// after replacing the text (important for wrapped multi-line content).
						savedYPosition = rect.top + rect.height / 2;
					}
				}
			}

			element.innerText = normalizedContent;

			// Wait for the DOM to update before restoring cursor position
			if(isFocused && savedXPosition !== null) {
				// Use requestAnimationFrame to ensure DOM has updated
				await new Promise<void>(resolve => {
					requestAnimationFrame(() => {
						// Re-check focus — it may have moved during the requestAnimationFrame delay (e.g., navigating to notes editor)
						if(document.activeElement === element) {
							this.setCaretAtXPosition(element, savedXPosition!, false, savedYPosition);
						}
						resolve();
					});
				});
			} else if(isFocused) {
				// Re-check focus before restoring
				if(document.activeElement === element) {
					element.focus();
				}
			}
		}
	}

	public static async getContenteditableText(element: HTMLElement): Promise<string> {
		if(element) {
			return element.innerText;
		}
		return "";
	}

	public static focusAndSetCaretToEnd(element: HTMLElement) {
		if(element) {
			element.focus();
			if(typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
				const textNode = element.firstChild as Text;
				const range: Range = document.createRange();

				// If we have a text node, position at the end of it explicitly
				if(textNode && textNode.nodeType === Node.TEXT_NODE) {
					range.setStart(textNode, textNode.length);
					range.setEnd(textNode, textNode.length);
				} else {
					// Fallback to selecting node contents and collapsing to end
					range.selectNodeContents(element);
					range.collapse(false);
				}

				const selection: Selection | null = window.getSelection();
				if(selection) {
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}
	}

	public static focusAndSetCaretToStart(element: HTMLElement) {
		if(element) {
			element.focus();
			if(typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
				const textNode = element.firstChild as Text;
				const range: Range = document.createRange();

				// If we have a text node, position at the start of it explicitly
				if(textNode && textNode.nodeType === Node.TEXT_NODE) {
					range.setStart(textNode, 0);
					range.setEnd(textNode, 0);
				} else {
					// Fallback to selecting node contents and collapsing to start
					range.selectNodeContents(element);
					range.collapse(true);
				}

				const selection: Selection | null = window.getSelection();
				if(selection) {
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}
	}

	/**
	 * Gets the X coordinate (in pixels from viewport left) of the current caret position in a contenteditable element.
	 * @param element The contenteditable element to get caret position from
	 * @returns The X coordinate of the caret, or null if no selection exists or selection is not in this element
	 */
	public static getCaretXPosition(element: HTMLElement): number | null {
		if(!element) {
			return null;
		}

		const selection = window.getSelection();
		if(!selection || selection.rangeCount === 0) {
			return null;
		}

		const range = selection.getRangeAt(0);

		// Verify the selection is within this element
		if(!element.contains(range.commonAncestorContainer)) {
			return null;
		}

		const rect = range.getBoundingClientRect();

		// Return the left edge of the caret (or selection start)
		return rect.left;
	}

	/**
	 * Sets the caret position in a contenteditable element to the character closest to the given X coordinate.
	 * @param element The contenteditable element to set caret position in
	 * @param targetX The target X coordinate (in pixels from viewport left)
	 * @param targetLastRow If true, constrain the caret to the last visual row
	 * @param targetY Optional Y coordinate; when provided the caret is constrained to the visual row closest to this Y
	 */
	public static setCaretAtXPosition(element: HTMLElement, targetX: number, targetLastRow: boolean = false, targetY: number | null = null) {
		if(!element) {
			return;
		}

		element.focus();

		const textNode = element.firstChild as Text;
		if(!textNode || textNode.nodeType !== Node.TEXT_NODE) {
			// No text content, just focus the element
			return;
		}

		const textLength = textNode.length;
		if(textLength === 0) {
			// Empty element, place caret at start
			const range = document.createRange();
			range.setStart(textNode, 0);
			range.setEnd(textNode, 0);
			const selection = window.getSelection();
			if(selection) {
				selection.removeAllRanges();
				selection.addRange(range);
			}
			return;
		}

		let closestOffset = 0;
		let closestDistance = Infinity;

		if(targetLastRow || targetY !== null) {
			// Pass 1: pick a target row.
			//   - targetLastRow: the bottom-most row
			//   - targetY: the row whose center is closest to targetY
			let selectedRowTop = targetLastRow ? -Infinity : 0;
			let selectedRowHeight = 0;
			let bestRowDistance = Infinity;
			for(let i = 0; i <= textLength; i++) {
				const range = document.createRange();
				range.setStart(textNode, i);
				range.setEnd(textNode, i);
				const rect = range.getBoundingClientRect();
				if(targetLastRow) {
					if(rect.top > selectedRowTop) {
						selectedRowTop = rect.top;
						selectedRowHeight = rect.height;
					}
				} else {
					const rowCenter = rect.top + rect.height / 2;
					const rowDistance = Math.abs(rowCenter - targetY!);
					if(rowDistance < bestRowDistance) {
						bestRowDistance = rowDistance;
						selectedRowTop = rect.top;
						selectedRowHeight = rect.height;
					}
				}
			}

			// Pass 2: among characters on the selected row, find closest to targetX
			closestOffset = textLength; // default to end
			const rowTolerance = Math.max(selectedRowHeight / 2, 1);
			for(let i = 0; i <= textLength; i++) {
				const range = document.createRange();
				range.setStart(textNode, i);
				range.setEnd(textNode, i);
				const rect = range.getBoundingClientRect();
				// Only consider positions on the selected visual row
				if(Math.abs(rect.top - selectedRowTop) > rowTolerance) continue;
				const distance = Math.abs(rect.left - targetX);
				if(distance < closestDistance) {
					closestDistance = distance;
					closestOffset = i;
				}
			}
		} else {
			// Find the character offset closest to the target X position across all rows.
			// No early-exit: with wrapped text, X is non-monotonic (restarts at each row).
			for(let i = 0; i <= textLength; i++) {
				const range = document.createRange();
				range.setStart(textNode, i);
				range.setEnd(textNode, i);

				const rect = range.getBoundingClientRect();
				const distance = Math.abs(rect.left - targetX);

				if(distance < closestDistance) {
					closestDistance = distance;
					closestOffset = i;
				}
			}
		}

		// Set the caret to the closest position
		const range = document.createRange();
		range.setStart(textNode, closestOffset);
		range.setEnd(textNode, closestOffset);

		const selection = window.getSelection();
		if(selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	public static focusElementById(elementId: string, preventScroll: boolean = false) {
		const element = document.getElementById(elementId);
		if(element) {
			const editableChild = element.querySelector("[contenteditable='true']") as HTMLElement;
			if(editableChild) {
				editableChild.focus({ preventScroll });
			} else {
				element.focus({ preventScroll });
			}
		}
	}

	// Focuses an element by ID with requestAnimationFrame retries for reliability
	// Useful when the WebView/document may not be ready to receive focus immediately
	// Can accept a single ID or array of IDs (will focus the first visible one)
	public static focusElementByIdWithRetry(elementIds: string | string[], maxRetries: number = 5) {
		const ids = Array.isArray(elementIds) ? elementIds : [elementIds];
		let retries = 0;

		const tryFocus = () => {
			for(const id of ids) {
				const element = document.getElementById(id) as HTMLElement;
				if(element && element.offsetParent !== null) { // offsetParent is null if element is hidden
					const editableChild = element.querySelector("[contenteditable='true']") as HTMLElement;
					const targetElement = editableChild || element;
					targetElement.focus();
					if(document.activeElement === targetElement) {
						return; // Success
					}
				}
			}

			// Retry using requestAnimationFrame
			if(retries < maxRetries) {
				retries++;
				requestAnimationFrame(tryFocus);
			}
		};

		requestAnimationFrame(tryFocus);
	}

	// called from Blazor
	public static openCurrentLocationInMobileApp(deepLinkUrl: string, androidAppStoreUrl: string): void {
		const timeout = 500;

		// Redirect to the app store after a delay
		const timer = setTimeout(() => {
			window.location.href = androidAppStoreUrl;
		}, timeout);

		const clearTimer = () => {
			clearTimeout(timer);
			window.removeEventListener('blur', clearTimer);
			window.removeEventListener('pagehide', clearTimer);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};

		const handleVisibilityChange = () => {
			if(document.visibilityState === 'hidden') {
				clearTimer();
			}
		};

		// Events that indicate the page is being hidden or blurred
		window.addEventListener('blur', clearTimer);
		window.addEventListener('pagehide', clearTimer);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		window.location.href = deepLinkUrl;
	}

	public static getElementHeight(elementId: string): number {
		const element = document.getElementById(elementId);
		if(element) {
			return element.clientHeight;
		}
		return 0;
	}

	// Returns the element's currently-computed padding-bottom as a CSS length
	// string (e.g. "320px"). Used to snapshot a calc'd value that depends on
	// CSS vars (like --keyboard-height) before those vars change.
	public static getComputedPaddingBottom(elementId: string): string {
		const element = document.getElementById(elementId);
		if(!element) return "0px";
		return window.getComputedStyle(element).paddingBottom || "0px";
	}

	/**
	 * Scrolls to center a selected item in a dropdown menu
	 * @param dropdownElement The dropdown container element
	 * @param selectedIndex The index of the selected item
	 * @param itemSelector Optional CSS selector to find the items container (defaults to '[role="none"]')
	 */
	public static scrollToSelectedItem(dropdownElement: HTMLElement, selectedIndex: number, itemSelector?: string): void {
		if (dropdownElement && selectedIndex >= 0) {
			// Get the actual item elements to measure real height
			const selector = itemSelector || '[role="none"]';
			const itemsContainer = dropdownElement.querySelector(selector);
			const items = itemsContainer ? itemsContainer.children : null;
			
			// Dynamically measure item height from actual DOM elements
			let itemHeight = 40; // Default fallback
			if (items && items.length > 0) {
				itemHeight = (items[0] as HTMLElement).offsetHeight;
			}
			
			const containerHeight = dropdownElement.clientHeight;
			const itemsVisible = Math.floor(containerHeight / itemHeight);
			const middleOffset = Math.floor(itemsVisible / 2);
			const scrollTop = Math.max(0, (selectedIndex - middleOffset) * itemHeight);
			
			dropdownElement.scrollTop = scrollTop;
		}
	}

	// GIF loading/playing code
	private static gifMap: Map<string, any> = new Map(); // Map<canvasId, SuperGif>

	/**
	 * Prepares a GIF for playing by loading it 
	 * @param imgId The ID of the canvas element where the GIF will be displayed.
	 */
	public static async loadGif(imgId: string): Promise<void> {

		// 1. Grab the <img>
		const img = document.getElementById(imgId);
		if(!img) {
			console.error(`Img with id ${imgId} not found.`);
			return;
		}

		// 2. Create SuperGif with auto_play= false and loop_mode= false
		// @ts-ignore
		const player = new SuperGif({
			gif: img,
			auto_play: false,
			loop_mode: false,
			progressbar_height: 0,
			progressbar_foreground_color: 'transparent',
			progressbar_background_color: 'transparent'
		});

		// 3. Load the GIF into a canvas (draws frame 0)
		player.load(() => {
			// at this point the canvas shows frame 0
			console.log('GIF is loaded and paused on frame 0');
		});
		
		this.gifMap.set(imgId, player);
	}
	
	/**
	 * Plays the GIF associated with the specified canvas ID once, stopping at the last frame.
	 * @param canvasId The ID of the canvas element containing the GIF to play.
	 */
	public static playGif(canvasId: string): void {
		const player = this.gifMap.get(canvasId);
		if(!player) {
			console.error(`No GIF loaded for canvas ${canvasId}`);
			return;
		}

		player.move_to(0);
		player.play();
	}

	/**
	 * Waits for a DOM element to exist before continuing. Useful when components render before DOM is ready.
	 * Called from C# via JSInterop.
	 * @param elementId The ID of the element to wait for
	 * @param maxRetries Maximum number of retries (default 10)
	 * @param delayMs Delay between retries in milliseconds (default 100)
	 * @returns Promise that resolves to true if element exists, false if timeout reached
	 */
	public static async waitForElement(elementId: string, maxRetries: number = 10, delayMs: number = 100): Promise<boolean> {
		for(let i = 0; i < maxRetries; i++) {
			const element = document.getElementById(elementId);
			if(element) {
				return true;
			}
			// Wait before retrying
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
		console.warn(`Element with id '${elementId}' not found after ${maxRetries} retries`);
		return false;
	}

	/**
	 * Waits for child elements matching a CSS selector to exist within a container.
	 * Useful when waiting for child components to finish rendering before proceeding.
	 * Called from C# via JSInterop.
	 * @param containerSelector CSS selector for the container element (e.g., "#deck")
	 * @param childSelector CSS selector for child elements to wait for (e.g., ".tht")
	 * @param minCount Minimum number of child elements that must exist (default 1)
	 * @param maxRetries Maximum number of retries (default 20)
	 * @param delayMs Delay between retries in milliseconds (default 50)
	 * @returns Promise that resolves to the number of elements found, or 0 if timeout reached
	 */
	public static async waitForChildElements(
		containerSelector: string,
		childSelector: string,
		minCount: number = 1,
		maxRetries: number = 20,
		delayMs: number = 50
	): Promise<number> {
		for(let i = 0; i < maxRetries; i++) {
			const container = document.querySelector(containerSelector);
			if(container) {
				const children = container.querySelectorAll(childSelector);
				if(children.length >= minCount) {
					console.log(`Found ${children.length} elements matching '${containerSelector} ${childSelector}' (min: ${minCount})`);
					return children.length;
				}
			}
			// Wait before retrying
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
		const container = document.querySelector(containerSelector);
		const count = container ? container.querySelectorAll(childSelector).length : 0;
		console.warn(
			`Only found ${count} elements matching '${containerSelector} ${childSelector}' after ${maxRetries} retries (min: ${minCount})`
		);
		return count;
	}

	/**
	 * Gets the tag name of the HTML element at the specified screen coordinates.
	 * Called from Blazor to determine which element was clicked.
	 * @param clientX The X coordinate (from MouseEventArgs.ClientX)
	 * @param clientY The Y coordinate (from MouseEventArgs.ClientY)
	 * @returns The uppercase tag name of the element at that point, or null if not found
	 */
	public static getElementTagNameAtPoint(clientX: number, clientY: number): string | null {
		const element = document.elementFromPoint(clientX, clientY);
		if(element) {
			return element.tagName;
		}
		return null;
	}

	/**
	 * Gets the width of a DOM element in pixels.
	 * Called from Blazor to measure element dimensions.
	 * @param element The DOM element to measure
	 * @returns The width in pixels
	 */
	public static getElementWidth(element: HTMLElement): number {
		if(element) {
			return element.offsetWidth;
		}
		return 0;
	}

	/**
	 * Scrolls a card element into view within a scroll container.
	 * If the card is shorter than the container, centers it vertically.
	 * If the card is taller than the container, positions the top near the container top.
	 * Called from Blazor when the active thought changes in CardsView.
	 * @param scrollContainer The scrollable container element
	 * @param cardElementId The ID of the card element to scroll to
	 * @returns true if the scroll was performed, false if the element wasn't found
	 */
	public static scrollToCardInView(scrollContainer: HTMLElement, cardElementId: string): boolean {
		if(!scrollContainer || !cardElementId) {
			return false;
		}

		const cardElement = document.getElementById(cardElementId);
		if(!cardElement) {
			return false;
		}

		const containerRect = scrollContainer.getBoundingClientRect();
		const cardRect = cardElement.getBoundingClientRect();

		const containerHeight = containerRect.height;
		const cardHeight = cardRect.height;

		// Calculate the card's position relative to the scroll container's content
		const cardOffsetTop = cardElement.offsetTop;

		// Find the actual scroll parent (the card might be nested in groups)
		let parent = cardElement.parentElement;
		while(parent && parent !== scrollContainer) {
			if(parent.offsetParent === scrollContainer || parent.offsetParent === scrollContainer.offsetParent) {
				// Add the parent's offset if it's positioned relative to the same container
				break;
			}
			parent = parent.parentElement;
		}

		// Get the card's top position relative to the scroll container's scrollable content
		const cardTopInContainer = cardElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;

		let targetScrollTop: number;
		const topPadding = 16; // Small padding from the top

		if(cardHeight >= containerHeight) {
			// Card is taller than container: position top of card near top of container
			targetScrollTop = cardTopInContainer - topPadding;
		} else {
			// Card is shorter than container: center it
			targetScrollTop = cardTopInContainer - (containerHeight - cardHeight) / 2;
		}

		// Ensure we don't scroll to negative values
		targetScrollTop = Math.max(0, targetScrollTop);

		// Smooth scroll to the target position
		scrollContainer.scrollTo({
			top: targetScrollTop,
			behavior: 'smooth'
		});

		return true;
	}

	/**
	 * Gets the size of a DOM element in the specified dimension.
	 * Called from Blazor for splitter container measurement.
	 * @param element The DOM element to measure
	 * @param dimension Either 'width' or 'height'
	 * @returns The size in pixels
	 */
	public static getElementSize(element: HTMLElement, dimension: string): number {
		if(!element) return 0;
		return dimension === 'width' ? element.offsetWidth : element.offsetHeight;
	}

	/**
	 * Sets focus to the first text input element within the specified container,
	 * or to the container itself if no input is found.
	 * Called from Blazor when a dialog is opened.
	 * @param containerId The ID of the container element to search within
	 */
	public static focusFirstEditControlOrElement(containerId: string): void {
		const container = document.getElementById(containerId);
		if(!container) {
			return;
		}

		// Try to find the first focusable text input element
		const selectors = [
			'input[type="text"]',
			'input[type="email"]',
			'input[type="password"]',
			'input[type="search"]',
			'input[type="tel"]',
			'input[type="url"]',
			'input[type="number"]',
			'input:not([type])',
			'textarea',
			'[contenteditable="true"]',
			'[tabindex="0"]'
		];

		for(const selector of selectors) {
			const element = container.querySelector(selector) as HTMLElement;
			if(element && !element.hasAttribute('disabled') && !element.hasAttribute('readonly')) {
				element.focus();
				return;
			}
		}

		// No text input found, focus the container itself if it's focusable
		if(container.hasAttribute('tabindex') || container.tabIndex >= 0) {
			container.focus();
		} else {
			// Make the container focusable and focus it
			container.setAttribute('tabindex', '-1');
			container.focus();
		}
	}

	// ResizeObserver management for responsive components
	private static resizeObservers: Map<HTMLElement, ResizeObserver> = new Map();

	/**
	 * Observes an element for size changes and calls back to Blazor when resized.
	 * Called from Blazor to set up responsive behavior.
	 * @param element The element to observe
	 * @param dotNetRef The .NET object reference to call back
	 */
	public static observeResize(element: HTMLElement, dotNetRef: any): void {
		if(!element || !dotNetRef) {
			return;
		}

		// Clean up any existing observer for this element
		this.unobserveResize(element);

		const observer = new ResizeObserver((entries) => {
			for(const entry of entries) {
				const width = entry.contentRect.width;
				safeInvoke(dotNetRef, 'OnResize', [width]);
			}
		});

		observer.observe(element);
		this.resizeObservers.set(element, observer);
	}

	/**
	 * Stops observing an element for size changes.
	 * Called from Blazor during component disposal.
	 * @param element The element to stop observing
	 */
	public static unobserveResize(element: HTMLElement): void {
		if(!element) {
			return;
		}

		const observer = this.resizeObservers.get(element);
		if(observer) {
			observer.disconnect();
			this.resizeObservers.delete(element);
		}
	}

	/**
	 * Scrolls an element into view within its nearest scrollable ancestor only.
	 * Unlike the native Element.scrollIntoView, this never scrolls the document/window,
	 * which matters on iOS WebView where the outer viewport is also scrollable.
	 * @param elementId The ID of the element to scroll into view
	 * @param behavior The scroll behavior ('smooth', 'instant', or 'auto')
	 * @param block The vertical alignment ('start', 'center', 'end', or 'nearest')
	 */
	public static scrollElementIntoView(elementId: string, behavior: ScrollBehavior = 'smooth', block: ScrollLogicalPosition = 'nearest'): void {
		const element = document.getElementById(elementId);
		if(!element) {
			return;
		}
		const container = DomUtils.findScrollableAncestor(element);
		if(!container) {
			return;
		}

		const containerRect = container.getBoundingClientRect();
		const elementRect = element.getBoundingClientRect();
		const elementTopInContent = (elementRect.top - containerRect.top) + container.scrollTop;
		const elementBottomInContent = elementTopInContent + elementRect.height;
		const viewHeight = container.clientHeight;

		let targetScrollTop: number;
		if(block === 'center') {
			targetScrollTop = elementTopInContent - (viewHeight / 2) + (elementRect.height / 2);
		} else if(block === 'start') {
			targetScrollTop = elementTopInContent;
		} else if(block === 'end') {
			targetScrollTop = elementBottomInContent - viewHeight;
		} else {
			const viewTop = container.scrollTop;
			const viewBottom = viewTop + viewHeight;
			if(elementTopInContent >= viewTop && elementBottomInContent <= viewBottom) {
				return;
			}
			targetScrollTop = elementTopInContent < viewTop
				? elementTopInContent
				: elementBottomInContent - viewHeight;
		}

		const maxScroll = Math.max(0, container.scrollHeight - viewHeight);
		targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));

		container.scrollTo({ top: targetScrollTop, behavior: behavior });
	}

	private static findScrollableAncestor(element: HTMLElement): HTMLElement | null {
		let parent = element.parentElement;
		while(parent) {
			const style = window.getComputedStyle(parent);
			const overflowY = style.overflowY;
			const isScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
				&& parent.scrollHeight > parent.clientHeight;
			if(isScrollable) {
				return parent;
			}
			parent = parent.parentElement;
		}
		return null;
	}

	/**
	 * Gets the left position (X coordinate) of an element by its ID.
	 * Called from Blazor to position context menus relative to elements.
	 * @param elementId The ID of the element
	 * @param fallback The fallback value if element not found
	 * @returns The left position in viewport coordinates, or fallback if element not found
	 */
	public static getElementLeftById(elementId: string, fallback: number): number {
		const element = document.getElementById(elementId);
		if(element) {
			return element.getBoundingClientRect().left;
		}
		return fallback;
	}

	/**
	 * Gets the right position (X coordinate) of an element by its ID.
	 * Called from Blazor to position right-anchored menus relative to elements.
	 * @param elementId The ID of the element
	 * @param fallback The fallback value if element not found
	 * @returns The right position in viewport coordinates, or fallback if element not found
	 */
	public static getElementRightById(elementId: string, fallback: number): number {
		const element = document.getElementById(elementId);
		if(element) {
			return element.getBoundingClientRect().right;
		}
		return fallback;
	}

	/**
	 * Starts tracking mouse position against an element's bounds.
	 * When the mouse moves outside the element's bounding rect, calls back to .NET
	 * and stops tracking. Used to detect when the mouse truly leaves a popover
	 * that contains a native BrowserView overlay (which captures mouse events).
	 */
	public static startBoundsTracking(elementId: string, dotNetRef: any): void {
		DomUtils.stopBoundsTracking();
		const el = document.getElementById(elementId);
		if(!el) return;
		const listener = (e: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			if(e.clientX < rect.left || e.clientX > rect.right ||
				e.clientY < rect.top || e.clientY > rect.bottom) {
				safeInvoke(dotNetRef, 'OnMouseExitedPopoverBounds');
				DomUtils.stopBoundsTracking();
			}
		};
		DomUtils._boundsTracker = { listener };
		document.addEventListener('mousemove', listener);
	}

	/**
	 * Stops any active bounds tracking started by startBoundsTracking.
	 */
	public static stopBoundsTracking(): void {
		if(DomUtils._boundsTracker) {
			document.removeEventListener('mousemove', DomUtils._boundsTracker.listener);
			DomUtils._boundsTracker = null;
		}
	}

	private static _textHighlightTimer: any = null;

	/**
	 * Highlights every case-insensitive occurrence of `text` inside the container and scrolls the
	 * container so the first one is centered. Retries briefly because the container's content
	 * (e.g. a hover preview's note) loads asynchronously after the container appears.
	 */
	public static highlightTextInContainer(containerId: string, text: string): void {
		DomUtils.cancelTextHighlight();
		if(!text) return;
		let attempts = 0;
		const tryHighlight = () => {
			DomUtils._textHighlightTimer = null;
			const container = document.getElementById(containerId);
			if(!container) return;
			if(DomUtils.applyTextHighlight(container, text)) return;
			attempts++;
			if(attempts < 15) {
				DomUtils._textHighlightTimer = setTimeout(tryHighlight, 200);
			}
		};
		tryHighlight();
	}

	/**
	 * Cancels any pending retry loop started by highlightTextInContainer.
	 */
	public static cancelTextHighlight(): void {
		if(DomUtils._textHighlightTimer) {
			clearTimeout(DomUtils._textHighlightTimer);
			DomUtils._textHighlightTimer = null;
		}
	}

	// Cap on highlighted occurrences in a hover preview, mirroring the editor's result-highlight cap.
	private static readonly PREVIEW_HL_MAX = 200;
	private static readonly PREVIEW_HL_MAX_WORDS = 8;

	private static applyTextHighlight(container: HTMLElement, text: string): boolean {
		// Exact phrase first; if it is not present, fall back to the query's individual words.
		let matches = DomUtils.collectPreviewMatches(container, [text]);
		if(matches.length === 0) {
			const words = DomUtils.previewQueryWords(text);
			if(words.length > 0) {
				matches = DomUtils.collectPreviewMatches(container, words);
			}
		}
		if(matches.length === 0) {
			return false;
		}

		// Wrap in reverse document order so earlier offsets stay valid as nodes split.
		for(let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			const range = document.createRange();
			range.setStart(match.node, match.index);
			range.setEnd(match.node, match.index + match.length);
			const mark = document.createElement('span');
			mark.className = 'search-preview-highlight';
			mark.style.backgroundColor = 'rgba(255, 255, 0, 0.35)';
			mark.style.borderRadius = '2px';
			try {
				range.surroundContents(mark);
			} catch {
				// Range straddled an element boundary; skip this occurrence.
			}
		}

		const first = container.querySelector('.search-preview-highlight');
		if(first) {
			const containerRect = container.getBoundingClientRect();
			const markRect = first.getBoundingClientRect();
			container.scrollTop += (markRect.top - containerRect.top) - container.clientHeight / 2 + markRect.height / 2;
		}
		return true;
	}

	// Collects up to PREVIEW_HL_MAX case-insensitive matches of any term across the container's text
	// nodes, skipping script/style and already-highlighted spans.
	private static collectPreviewMatches(container: HTMLElement, terms: string[]): Array<{ node: Text, index: number, length: number }> {
		const escaped = terms
			.filter(t => t && t.length > 0)
			.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		if(escaped.length === 0) {
			return [];
		}
		const re = new RegExp(escaped.join('|'), 'gi');
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		const matches: Array<{ node: Text, index: number, length: number }> = [];
		let node: Node | null;
		while((node = walker.nextNode())) {
			const textNode = node as Text;
			const parent = textNode.parentElement;
			if(!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.classList.contains('search-preview-highlight')) {
				continue;
			}
			re.lastIndex = 0;
			let m: RegExpExecArray | null;
			while((m = re.exec(textNode.data)) !== null) {
				if(m[0].length === 0) { re.lastIndex++; continue; }
				matches.push({ node: textNode, index: m.index, length: m[0].length });
				if(matches.length >= DomUtils.PREVIEW_HL_MAX) { return matches; }
			}
		}
		return matches;
	}

	// Distinct words of length >= 2 from the query, capped, for the per-word fallback.
	private static previewQueryWords(query: string): string[] {
		const seen = new Set<string>();
		const words: string[] = [];
		for(const raw of query.split(/\s+/)) {
			const w = raw.trim();
			if(w.length < 2) { continue; }
			const key = w.toLowerCase();
			if(seen.has(key)) { continue; }
			seen.add(key);
			words.push(w);
			if(words.length >= DomUtils.PREVIEW_HL_MAX_WORDS) { break; }
		}
		return words;
	}

	/**
	 * Gets the center point of an element by its ID.
	 * Called from Blazor to position dialogs at the center of a specific element.
	 * @param elementId The ID of the element
	 * @returns Array [x, y] with center coordinates in viewport pixels, or null if element not found or has zero size
	 */
	public static getElementCenterById(elementId: string): number[] | null {
		const element = document.getElementById(elementId);
		if(!element) return null;
		const rect = element.getBoundingClientRect();
		if(rect.width === 0 || rect.height === 0) return null;
		return [rect.left + rect.width / 2, rect.top + rect.height / 2];
	}

	/**
	 * Fetches text content from a URL using the browser's fetch API.
	 * This includes authentication cookies automatically.
	 * Called from Blazor for TextViewer component.
	 * @param url The URL to fetch content from (can be relative or absolute)
	 * @returns Object with success boolean, content string, and optional error string
	 */
	public static async fetchTextContent(url: string): Promise<{ success: boolean; content: string; error?: string }> {
		try {
			// Use 'include' to send cookies for both same-origin and cross-origin requests
			// This is needed for Deku (MAUI) where the WebView and server are different origins
			const response = await fetch(url, {
				credentials: 'include'
			});
			if(response.ok) {
				const content = await response.text();
				return { success: true, content: content };
			} else {
				return { success: false, content: '', error: `Failed to load content: ${response.status} ${response.statusText}` };
			}
		} catch(error) {
			return { success: false, content: '', error: `Error loading content: ${error}` };
		}
	}
}
