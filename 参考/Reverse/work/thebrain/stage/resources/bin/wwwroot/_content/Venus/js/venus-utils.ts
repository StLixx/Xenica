// Side-effect import: initializes Electron focus management for macOS
import "./electronFocus.js";
import {safeInvoke, safeInvokeAsync} from "./interop.js";

type TouchHandlers = {
	start: (e: TouchEvent) => void;
	move: (e: TouchEvent) => void;
	end: (e: TouchEvent) => void;
	cancel: (e: TouchEvent) => void;
};

interface TabDragDropState {
	dotNetRef: any;
	draggedTabId: string | null;
	tabBarElement: HTMLElement | null;
	dragOverTabId: string | null;
	dragPosition: 'before' | 'after' | null;
}

// Hint decorator types for programmatic API
type HintDirection = 'up' | 'down' | 'auto';

interface HintOptions {
	direction?: HintDirection;     // Tail direction (default: 'auto')
	centerText?: boolean;          // Center text (default: true)
	hideClasses?: string;          // Responsive hide classes
	maxWidth?: number;             // Max bubble width in pixels
}

// Duration of the phone editor toolbar's `bottom` CSS transition when
// --keyboard-height changes (Tailwind `duration-300` on the floating toolbar).
// Re-alignment after a visualViewport change must outlast this so the source
// element has reached its final position before we read its rect.
const PHONE_TOOLBAR_BOTTOM_TRANSITION_MS = 300;

class VenusUtils {

	displayWidestIdPrefix: string = "";
	displayWidestParentId: string = "";
	displayWidestContainer: HTMLElement | null = null;
	displayWidestCurrentElement: HTMLElement | null = null;

	existenceDependencyManager: ExistenceDependencyManager = new ExistenceDependencyManager();

	// Handlers for toolbar background double-click
	private toolbarDblHandlers: { [id: string]: (e: MouseEvent) => void } = {};

	// Register a double-click handler on a toolbar element that only fires when double-clicking empty space
	registerToolbarBackgroundDoubleClick(toolbarElementId: string, dotNetRef: any) {
		const el = document.getElementById(toolbarElementId);
		if(!el) {
			console.warn("registerToolbarBackgroundDoubleClick: element not found:", toolbarElementId);
			return;
		}
		const handler = (e: MouseEvent) => {
			const target = e.target as HTMLElement | null;
			if(!target) { return; }
			// Ignore if double-click is on or within any interactive toolbar item
			const interactiveSelector = [
				'button', '.toolbar-menu', '.toolbar-button', '.toolbar-button-mobile',
				'.btn-quiet', '.popup-window', '[role="menu"]', '[role="menuitem"]',
				'.ql-picker', '.ql-toolbar', 'input', 'select', 'textarea', 'label', 'i', 'svg', 'path',
				'[contenteditable]', '[contenteditable="true"]', '.editable', 'a', '[role="textbox"]'
			].join(',');
			if(target.closest(interactiveSelector)) {
				return;
			}
			// Within the toolbar area and not on interactive elements -> notify .NET
			safeInvoke(dotNetRef, 'OnToolbarBackgroundDoubleClick');
		};
		this.toolbarDblHandlers[toolbarElementId] = handler;
		el.addEventListener('dblclick', handler);
	}

	unregisterToolbarBackgroundDoubleClick(toolbarElementId: string) {
		const el = document.getElementById(toolbarElementId);
		const handler = this.toolbarDblHandlers[toolbarElementId];
		if(el && handler) {
			el.removeEventListener('dblclick', handler);
		}
		delete this.toolbarDblHandlers[toolbarElementId];
	}

	// Handlers for preventing horizontal scroll
	private horizontalScrollHandlers: { [id: string]: (e: Event) => void } = {};

	// Prevents horizontal scrolling on an element by resetting scrollLeft to 0
	preventHorizontalScroll(elementId: string) {
		const el = document.getElementById(elementId);
		if(!el) {
			return;
		}
		// Remove any existing handler first
		if(this.horizontalScrollHandlers[elementId]) {
			el.removeEventListener('scroll', this.horizontalScrollHandlers[elementId]);
		}
		const handler = () => {
			if(el.scrollLeft !== 0) {
				el.scrollLeft = 0;
			}
		};
		this.horizontalScrollHandlers[elementId] = handler;
		el.addEventListener('scroll', handler);
		// Also reset immediately in case it's already scrolled
		if(el.scrollLeft !== 0) {
			el.scrollLeft = 0;
		}
	}

	removePreventHorizontalScroll(elementId: string) {
		const el = document.getElementById(elementId);
		const handler = this.horizontalScrollHandlers[elementId];
		if(el && handler) {
			el.removeEventListener('scroll', handler);
		}
		delete this.horizontalScrollHandlers[elementId];
	}

	// called from Blazor
	initDisplayWidestOf(idPrefix: string, parentId: string) {
		this.displayWidestIdPrefix = idPrefix;
		this.displayWidestParentId = parentId;
		this.displayWidestContainer = document.getElementById(this.displayWidestParentId);
		this.displayWidestOf();
		window.addEventListener("resize", (e) => {
			this.displayWidestOf();
		});
	}

	getTimeZoneOffset(): number {
		return new Date().getTimezoneOffset();
	}
	
	displayWidestOf() {
		if(this.displayWidestContainer) {
			if(this.displayWidestCurrentElement) {
				this.displayWidestCurrentElement.style.display = "none";
			}
			let containerWidth = this.displayWidestContainer.clientWidth;
			let maxWidth = 0;
			let minWidth = Number.MAX_VALUE;
			let widestElement: null | HTMLElement = null;
			let narrowestElement: null | HTMLElement = null;
			for(let i = 0; true; i++) {
				let element = document.getElementById(this.displayWidestIdPrefix + i);
				if(!element) {
					break;
				}
				element.style.display = "inline-flex";
				let width = element.clientWidth;
				element.style.display = "none";
				if(width < minWidth) {
					minWidth = width;
					narrowestElement = element;
				}
				if(width <= containerWidth && width > maxWidth) {
					maxWidth = width;
					widestElement = element;
				}
			}
			if(widestElement) {
				widestElement.style.display = "inline-flex";
				this.displayWidestCurrentElement = widestElement;
			} else if(narrowestElement) {
				narrowestElement.style.display = "inline-flex";
				this.displayWidestCurrentElement = narrowestElement;
			}
		}
	}
	
	async downloadFileFromStream(fileName: string, contentStreamReference: any) {
		const arrayBuffer = await contentStreamReference.arrayBuffer();
		const blob = new Blob([arrayBuffer]);
		const url = URL.createObjectURL(blob);
		const anchorElement = document.createElement('a');
		anchorElement.href = url;
		anchorElement.download = fileName ?? '';
		anchorElement.click();
		anchorElement.remove();
		URL.revokeObjectURL(url);
	}

	// called from Blazor
	positionElementToCoverEverything(destElementId: string) {
		var destElement = document.getElementById(destElementId);
		if(destElement == null) {
			console.log("positionElementToCoverEverything: Unable to find `"+destElementId+"`.");
			return;
		}
		this.placeElementAnchorPoint(destElementId, AnchorPoint.TopLeft, 0, 0, 0, 0, false, false);
		destElement.style.width = "100vw";
		destElement.style.height = "100vh";
	}

	// called from Blazor
	alignElementAnchorPoints(sourceElementId: string, destElementId: string, sourcePoint: AnchorPoint, destPoint: AnchorPoint, offsetX: number, offsetY: number, isRootable: boolean, useBottomSafeZone: boolean) {

		var sourceElement = document.getElementById(sourceElementId);
		if(sourceElement == null) {
			console.log("alignElementCorners: Unable to find `"+sourceElementId+"`.");
			return;
		}

		// Re-align whenever the visual viewport changes (e.g. the software
		// keyboard opens or closes after the menu is shown — the toolbar that
		// hosts the source element moves up/down with the keyboard, so the
		// menu needs to follow). The phone toolbar's `bottom` CSS transition
		// outlasts the viewport resize event, so the source element keeps
		// moving after the viewport finishes resizing — schedule a follow-up
		// re-align after the transition settles in addition to running
		// immediately.
		const vv = window.visualViewport;
		const destElement = document.getElementById(destElementId);
		if(vv && destElement && !destElement.dataset.vvAlignWatching) {
			destElement.dataset.vvAlignWatching = "1";
			let pendingTimeout: number | null = null;
			const reAlign = () => {
				const stillThere = document.getElementById(destElementId);
				if(!stillThere || !document.body.contains(stillThere)) {
					return false;
				}
				// Clear any clamp from the previous run so the natural height
				// is re-measured against the new viewport.
				stillThere.style.maxHeight = "";
				this.alignElementAnchorPoints(sourceElementId, destElementId, sourcePoint, destPoint, offsetX, offsetY, isRootable, useBottomSafeZone);
				return true;
			};
			const handler = () => {
				if(!reAlign()) {
					vv.removeEventListener("resize", handler);
					vv.removeEventListener("scroll", handler);
					if(pendingTimeout != null) {
						clearTimeout(pendingTimeout);
						pendingTimeout = null;
					}
					return;
				}
				if(pendingTimeout != null) {
					clearTimeout(pendingTimeout);
				}
				pendingTimeout = window.setTimeout(() => {
					pendingTimeout = null;
					reAlign();
				}, PHONE_TOOLBAR_BOTTOM_TRANSITION_MS + 50);
			};
			vv.addEventListener("resize", handler);
			vv.addEventListener("scroll", handler);
		}

		if(isRootable) {
			this.putElementUnderContentRoot(destElementId); // element must be removed from document flow in order to make sure the sourceElement's location is not affected by it
		}
		
		const sourceRect = sourceElement.getBoundingClientRect();

		let sourceX = 0, sourceY = 0;
		switch (sourcePoint) {
			case AnchorPoint.TopLeft:
				sourceX = sourceRect.left;
				sourceY = sourceRect.top;
				break;
			case AnchorPoint.TopRight:
				sourceX = sourceRect.right;
				sourceY = sourceRect.top;
				break;
			case AnchorPoint.BottomLeft:
				sourceX = sourceRect.left;
				sourceY = sourceRect.bottom;
				break;
			case AnchorPoint.BottomRight:
				sourceX = sourceRect.right;
				sourceY = sourceRect.bottom;
				break;
			case AnchorPoint.Left:
				sourceX = sourceRect.left;
				sourceY = sourceRect.top + sourceRect.height * 0.5;
				break;
			case AnchorPoint.Top:
				sourceX = sourceRect.left + sourceRect.width * 0.5;
				sourceY = sourceRect.top;
				break;
			case AnchorPoint.Right:
				sourceX = sourceRect.right;
				sourceY = sourceRect.top + sourceRect.height * 0.5;
				break;
			case AnchorPoint.Bottom:
				sourceX = sourceRect.left + sourceRect.width * 0.5;
				sourceY = sourceRect.bottom;
				break;
			case AnchorPoint.Center:
				sourceX = sourceRect.left + sourceRect.width * 0.5;
				sourceY = sourceRect.top + sourceRect.height * 0.5;
				break;
		}
		
		this.placeElementAnchorPoint(destElementId, destPoint, sourceX, sourceY, offsetX, offsetY, isRootable, useBottomSafeZone);
	}

	// called from Blazor
	matchMenuWidthToButton(buttonElementId: string, menuElementId: string) {
		var buttonElement = document.getElementById(buttonElementId);
		var menuElement = document.getElementById(menuElementId);

		if(buttonElement == null || menuElement == null) {
			return;
		}

		const buttonRect = buttonElement.getBoundingClientRect();
		menuElement.style.width = `${buttonRect.width}px`;
	}

	alignColorPickerToButton(pickerId: string, buttonLabel: string) {
		// Find the button by its aria-label
		const button = document.querySelector(`button[aria-label="${buttonLabel}"]`) as HTMLElement;
		if(!button) {
			console.log(`alignColorPickerToButton: Unable to find button with aria-label "${buttonLabel}".`);
			return;
		}

		// Get or create a unique ID for the button
		let buttonId = button.id;
		if(!buttonId) {
			buttonId = `toolbar-button-${Math.random().toString(36).substr(2, 9)}`;
			button.id = buttonId;
		}

		// Align picker to button: ButtonAnchorPoint.BottomLeft to MenuAnchorPoint.TopLeft with 4px offset
		this.alignElementAnchorPoints(buttonId, pickerId, AnchorPoint.BottomLeft, AnchorPoint.TopLeft, 0, 4, true, true);
	}

	putElementUnderContentRoot(destElementId: string) {
		var destElement = document.getElementById(destElementId);
		if(destElement == null) {
			console.log("putElementUnderContentRoot: Unable to find `"+destElementId+"`.");
			return;
		}

		let newParent = document.getElementById("content");
		if(newParent == null) {
			// "content" is that standard name of the div at the top of the Blazor DOM, typically set in MainLayout.razor
			console.log("putElementUnderContentRoot: Unable to find `content` div.");
			return;
		}

		if(destElement.parentElement === newParent) {
			return;
		}

		destElement.remove();
		newParent.appendChild(destElement);
	}

	// called from Blazor in order to "undo" a call to place/align
	resetElementOffsets(destElementId: string) {
		var element = document.getElementById(destElementId);
		if(element == null) {
			console.log("resetELementOffsets: Unable to find `"+destElementId+"`.");
			return;
		}
		element.style.left = element.style.right = element.style.top = element.style.bottom = "";
	}

	// called from Blazor
	placeElementAnchorPoint(destElementId: string, destPoint: AnchorPoint, sourceX: number, sourceY: number, offsetX: number, offsetY: number, isRootable: boolean, useBottomSafeZone: boolean, skipKeepOnScreen: boolean = false) {

		if(isRootable) {
			this.putElementUnderContentRoot(destElementId);
		}

		var destElement = document.getElementById(destElementId);
		if(destElement == null) {
			console.log("putElementUnderContentRoot: Unable to find `"+destElementId+"`.");
			return;
		}
		
		const destRect = destElement.getBoundingClientRect();

		// Calculate destination corner's desired position
		let destX = 0;
		let destY = 0;
		switch(destPoint) {
			case AnchorPoint.TopLeft:
				destX = sourceX;
				destY = sourceY;
				break;
			case AnchorPoint.TopRight:
				destX = sourceX - destRect.width;
				destY = sourceY;
				break;
			case AnchorPoint.BottomLeft:
				destX = sourceX;
				destY = sourceY - destRect.height;
				break;
			case AnchorPoint.BottomRight:
				destX = sourceX - destRect.width;
				destY = sourceY - destRect.height;
				break;
			case AnchorPoint.Left:
				destX = sourceX;
				destY = sourceY - destRect.height * 0.5;
				break;
			case AnchorPoint.Top:
				destX = sourceX - destRect.width * 0.5;
				destY = sourceY;
				break;
			case AnchorPoint.Right:
				destX = sourceX - destRect.width;
				destY = sourceY - destRect.height * 0.5;
				break;
			case AnchorPoint.Bottom:
				destX = sourceX - destRect.width * 0.5;
				destY = sourceY - destRect.height;
				break;
			case AnchorPoint.Center:
				destX = sourceX - destRect.width * 0.5;
				destY = sourceY - destRect.height * 0.5;
				break;

		}
		
		destX += offsetX;
		destY += offsetY;

		const vv = window.visualViewport;
		if(vv) {
			destX += vv.offsetLeft;
			destY += vv.offsetTop;
		}

		// Adjust the destination element's position
		if(isRootable) {
			// independent elements such as menus and hint decorators are put into the content root and can be moved via absolute setting
			destElement.style.position = 'fixed';
			destElement.style.left = `${destX}px`;
			destElement.style.top = `${destY}px`;
			// Skip keepOnScreen and visibility if element has data-skip-keep-on-screen attribute (temporary hidden state)
			if(!destElement.hasAttribute('data-skip-keep-on-screen')) {
				if(!skipKeepOnScreen) {
					this.keepOnScreen(destElementId, useBottomSafeZone);
				}
				destElement.style.opacity = "100";
				destElement.style.visibility = "visible";
			}
		} else {
			let deltaX = destX - destRect.x;
			let deltaY = destY - destRect.y;
			this.moveElement(destElement, deltaX, deltaY);
		}
	}

	getNumFromPx(numPx: string): number {
		if(!numPx) {
			return 0;
		}
		if(numPx.endsWith("px")) {
			return +numPx.substring(0, numPx.length - 2);
		} else if(numPx.endsWith("rem")) {
			let remSize = this.getNumFromPx(getComputedStyle(document.documentElement).fontSize);
			let rems = +numPx.substring(0, numPx.length - 3);
			return rems * remSize;
		}
		return 0;
	}
	
	// called from Blazor
	disableShiftClick(elementId: string) {
		let el = document.getElementById(elementId);
		if(el != null) {
			el.addEventListener('mousedown', function(e) {
				if(e.shiftKey) {
					e.preventDefault();
				}
			});
		}
	}

	setupDraggableElementWithHandle(elementId: string, handleId: string) {
		const draggableElement = document.getElementById(elementId);
		const gripElement = document.getElementById(handleId);

		if(!draggableElement || !gripElement) {
			return;
		}

		const startDrag = (clientX: number, clientY: number) => {
			const initialMouseX = clientX;
			const initialMouseY = clientY;
			const initialElementX = this.getNumFromPx(getComputedStyle(draggableElement).left);
			const initialElementY = this.getNumFromPx(getComputedStyle(draggableElement).top);
			draggableElement.dataset.isDragging = "true";

			const moveHandler = (moveClientX: number, moveClientY: number) => {
				const deltaX = moveClientX - initialMouseX;
				const deltaY = moveClientY - initialMouseY;
				draggableElement.style.left = `${initialElementX + deltaX}px`;
				draggableElement.style.top = `${initialElementY + deltaY}px`;
			};

			const mouseMoveHandler = (e: MouseEvent) => {
				moveHandler(e.clientX, e.clientY);
			};

			const touchMoveHandler = (e: TouchEvent) => {
				if(e.touches.length > 0) {
					moveHandler(e.touches[0].clientX, e.touches[0].clientY);
				}
			};

			const endDrag = () => {
				draggableElement.dataset.isDragging = "false";
				document.removeEventListener('mousemove', mouseMoveHandler);
				document.removeEventListener('mouseup', endDrag);
				document.removeEventListener('touchmove', touchMoveHandler);
				document.removeEventListener('touchend', endDrag);
			};

			document.addEventListener('mousemove', mouseMoveHandler);
			document.addEventListener('mouseup', endDrag);
			document.addEventListener('touchmove', touchMoveHandler);
			document.addEventListener('touchend', endDrag);
		};

		gripElement.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			startDrag(e.clientX, e.clientY);
		});

		gripElement.addEventListener('touchstart', (e: TouchEvent) => {
			if(e.touches.length > 0) {
				const touch = e.touches[0];
				const startX = touch.clientX;
				const startY = touch.clientY;
				const startTime = Date.now();
				let hasMoved = false;
				
				const touchMoveHandler = (moveEvent: TouchEvent) => {
					if(moveEvent.touches.length > 0) {
						const moveTouch = moveEvent.touches[0];
						const deltaX = Math.abs(moveTouch.clientX - startX);
						const deltaY = Math.abs(moveTouch.clientY - startY);
						
						// If moved more than 10px, consider it a drag
						if(deltaX > 10 || deltaY > 10) {
							hasMoved = true;
							e.preventDefault(); // Prevent default only when we detect drag intent
							document.removeEventListener('touchmove', touchMoveHandler);
							document.removeEventListener('touchend', touchEndHandler);
							startDrag(startX, startY);
						}
					}
				};
				
				const touchEndHandler = (endEvent: TouchEvent) => {
					document.removeEventListener('touchmove', touchMoveHandler);
					document.removeEventListener('touchend', touchEndHandler);
					
					// If touch ended quickly without movement, it's a tap - let it proceed normally
					if(!hasMoved && (Date.now() - startTime) < 500) {
						// Don't prevent default - allow normal click handling
						return;
					}
				};
				
				document.addEventListener('touchmove', touchMoveHandler, { passive: true });
				document.addEventListener('touchend', touchEndHandler);
			}
		});
	}
	
	setupFolderUploadElement(elementId: string, dotNetHelper: any) {
		let folderUploadElement = document.getElementById(elementId)
		if(folderUploadElement != null) {
			folderUploadElement.addEventListener("change", (event) => {
				let names = [];
				let types = [];
				let sizes = [];
				let relativePaths = [];
				let lastModifiedTimes = [];
				
				let files = (event.target as HTMLInputElement).files;
				if(files != null) {
					for(const file of Array.from(files)) {
						names.push(file.name);
						types.push(file.type);
						sizes.push(file.size);
						relativePaths.push(file.webkitRelativePath);
						lastModifiedTimes.push(file.lastModified);
					}
				}
				safeInvoke(dotNetHelper, "CallbackOnFolderUploadAsync", [names, types, sizes, relativePaths, lastModifiedTimes]);
			}, false);
		}
	}

	keepOnScreen(elementId: string, useBottomSafeZone: boolean) {
		let element = document.getElementById(elementId);
		if(!element) {
			return;
		}

		// Use Visual Viewport API to account for iOS keyboard height if open.
		// When the software keyboard is up, vv.height shrinks but document
		// clientHeight does not, so the visible area is [vv.offsetTop, vv.offsetTop + vv.height].
		const vv = window.visualViewport;

		let bottomSafeMargin = 1;
		if(useBottomSafeZone) {
			bottomSafeMargin = vv ? 3 : 50;
		}

		let originalRect = element.getBoundingClientRect();

		// Reserve a 1px top margin to absorb sub-pixel rounding and brief
		// visual-viewport transitions (e.g. the keyboard finishing its open
		// animation right after the menu opens).
		let topSafeMargin = 1;

		let safeTop = (vv ? vv.offsetTop : 0) + topSafeMargin;
		let safeBottom = (vv ? vv.offsetTop + vv.height : document.documentElement.clientHeight) - bottomSafeMargin;
		let safeLeft = vv ? vv.offsetLeft : 0;
		let safeRight = (vv ? vv.offsetLeft + vv.width : document.documentElement.clientWidth) - 1;
		let safeHeight = safeBottom - safeTop;

		let xOffset = 0;
		let yOffset = 0;

		if(originalRect.right > safeRight) {
			xOffset = safeRight - originalRect.right;
		}
		if(originalRect.left < safeLeft) {
			xOffset = safeLeft - originalRect.left;
		}

		if(originalRect.height > safeHeight) {
			// Element is too tall for the visible area (e.g. a long menu opened
			// above the software keyboard). Constrain its max-height so its
			// existing overflow-y-auto creates a scrollbar, then position it so
			// the originally-anchored edge is preserved.
			element.style.maxHeight = `${safeHeight}px`;

			let topOverflows = originalRect.top < safeTop;
			let bottomOverflows = originalRect.bottom > safeBottom;

			if(topOverflows && !bottomOverflows) {
				// Bottom-anchored (opens upward): keep bottom at originalRect.bottom.
				// max-height shrinks from the bottom, so we shift the element down
				// by the amount the height shrank.
				let heightLoss = originalRect.height - safeHeight;
				yOffset = heightLoss;
				// Make sure top doesn't end up above safeTop after the shift.
				let projectedTop = originalRect.top + yOffset;
				if(projectedTop < safeTop) {
					yOffset += safeTop - projectedTop;
				}
			} else if(bottomOverflows && !topOverflows) {
				// Top-anchored (opens downward): keep top in place. max-height
				// shrinking from the bottom is exactly what we want.
				yOffset = 0;
			} else {
				// Both edges overflow — clamp to the safe area.
				yOffset = safeTop - originalRect.top;
			}
		} else {
			// Fits vertically — just translate to keep on screen.
			if(originalRect.bottom > safeBottom) {
				yOffset = safeBottom - originalRect.bottom;
			}
			if(originalRect.top < safeTop) {
				yOffset = safeTop - originalRect.top;
			}
		}

		this.moveElement(element, xOffset, yOffset);
	}

	// Constrain an element so its top edge stays within the visible viewport,
	// shrinking max-height instead of translating. The element's bottom edge
	// must already be anchored externally (e.g. CSS `bottom: 100%` pinning it
	// above an input bar). Useful for popups that float above an input on
	// mobile, where the iOS keyboard can shrink the visible area enough that
	// translating downward (as keepOnScreen does) would overlap the anchor.
	//
	// If topAnchorElementId is provided, the element's top is clamped to the
	// bottom of that anchor (e.g. the chat header bar) rather than the top of
	// the visual viewport — preventing the menu from extending up over a
	// floating header / status bar safe area.
	public clampMaxHeightToVisibleViewport(elementId: string, topAnchorElementId?: string) {
		let element = document.getElementById(elementId);
		if(!element) {
			return;
		}

		// Clear any previously-applied inline maxHeight so we re-measure the
		// element's natural anchored layout each render.
		element.style.maxHeight = '';

		let rect = element.getBoundingClientRect();
		const vv = window.visualViewport;
		let safeTop = vv ? vv.offsetTop : 0;

		if(topAnchorElementId) {
			let anchor = document.getElementById(topAnchorElementId);
			if(anchor) {
				let anchorBottom = anchor.getBoundingClientRect().bottom;
				if(anchorBottom > safeTop) {
					safeTop = anchorBottom;
				}
			}
		}

		safeTop += 1;

		if(rect.top < safeTop) {
			let availableHeight = rect.bottom - safeTop;
			if(availableHeight > 0) {
				element.style.maxHeight = `${availableHeight}px`;
			}
		}
	}

	positionSubmenu(elementId: string, useBottomSafeZone: boolean) {
		let element = document.getElementById(elementId);
		if(!element) {
			return;
		}

		// Get the parent menu width from the data attribute
		const parentWidthStr = element.getAttribute('data-parent-width');
		const parentWidth = parentWidthStr ? this.getNumFromPx(parentWidthStr) : 256; // default to 16rem

		// Get the parent container (the menu item that contains this submenu)
		const parentContainer = element.parentElement;
		if(!parentContainer) {
			return;
		}

		// Get viewport dimensions
		const vv = window.visualViewport;
		let bottomSafeMargin = 1;
		if(useBottomSafeZone) {
			bottomSafeMargin = vv ? 3 : 50;
		}

		let safeHeight = document.documentElement.clientHeight - bottomSafeMargin;
		if(vv) {
			safeHeight -= vv.offsetTop;
		}

		const viewportWidth = document.documentElement.clientWidth - 1;
		const viewPortRect = new DOMRect(0, 0, viewportWidth, safeHeight);

		// Get the parent container's position
		const parentRect = parentContainer.getBoundingClientRect();
		
		// Get the submenu's dimensions (temporarily position it to measure)
		element.style.left = parentWidth + "px";
		element.style.right = "auto";
		const submenuRect = element.getBoundingClientRect();
		const submenuWidth = submenuRect.width;

		// Determine if we should position to the left or right
		const spaceToRight = viewportWidth - parentRect.right;
		const spaceToLeft = parentRect.left;

		let positionRight = true; // default to right side
		
		// If there's not enough space on the right for the submenu, try left
		if(spaceToRight < submenuWidth && spaceToLeft > submenuWidth) {
			positionRight = false;
		}
		// If there's not enough space on either side, use the side with more space
		else if(spaceToRight < submenuWidth && spaceToLeft < submenuWidth) {
			positionRight = spaceToRight > spaceToLeft;
		}

		// Position the submenu
		if(positionRight) {
			// Position to the right of the parent menu (default)
			element.style.left = parentWidth + "px";
			element.style.right = "auto";
		} else {
			// Position to the left of the parent menu
			element.style.left = "auto";
			element.style.right = parentWidth + "px";
		}

		// Now apply the standard keepOnScreen logic for vertical positioning and edge cases
		this.keepOnScreen(elementId, useBottomSafeZone);
	}
	
	moveElement(element: HTMLElement, xOffset: number, yOffset: number) {
		let computedStyle = window.getComputedStyle(element);
		if(computedStyle.position === "static") {
			// move the parent element instead
			element = element.parentElement!;
			computedStyle = window.getComputedStyle(element);
			if(computedStyle.position === "static") {
				throw new Error("Item cannot be moved because is its position and its parent position is static: " + element.id);
			}
		}
		if(Math.abs(xOffset) > 0.5) {
			if(element.style.right) {
				element.style.right = (this.getNumFromPx(element.style.right) - xOffset) + "px";
			} else {
				element.style.left = (this.getNumFromPx(element.style.left) + xOffset) + "px";
			}
		}
		if(Math.abs(yOffset) > 0.5) {
			if(element.style.bottom) {
				element.style.bottom = (this.getNumFromPx(element.style.bottom) - yOffset) + "px";
			} else {
				element.style.top = (this.getNumFromPx(element.style.top) + yOffset) + "px";
			}
		}

	}

	// Helper: Calculate hint dimensions based on content
	calculateHintDimensions(contentElement: HTMLElement, options?: HintOptions): {
		textWidth: number;
		bubbleWidth: number;
		bubbleHeight: number;
		totalHeight: number;
		curveRadius: number;
		tailBaseWidth: number;
		tailLength: number;
		strokePadding: number;
	} {
		const textWidth = this.measureUnwrappedWidth(contentElement);
		const contentPadding = 16; // 8px padding on each side
		const minBubbleWidth = 40; // Minimum bubble width to ensure tail fits properly
		const bubbleHeight = 24; // Fixed height for content area

		// Calculate required width (text + padding, but at least minimum width)
		const requiredWidth = Math.max(textWidth + contentPadding, minBubbleWidth);

		// Apply max-width constraint
		let maxWidth = options?.maxWidth ?? window.innerWidth * 0.33;
		maxWidth = Math.max(maxWidth, 100); // Lower minimum for max width
		const bubbleWidth = Math.min(requiredWidth, maxWidth);

		// SVG parameters
		const curveRadius = 6;
		const tailBaseWidth = 16;
		const tailLength = 10;
		const strokePadding = 2; // Match the padding used in viewBox
		const totalHeight = bubbleHeight + tailLength;

		return {
			textWidth,
			bubbleWidth,
			bubbleHeight,
			totalHeight,
			curveRadius,
			tailBaseWidth,
			tailLength,
			strokePadding
		};
	}

	// Helper: Apply hint bubble geometry (dimensions and SVG)
	applyHintBubbleGeometry(
		bubble: HTMLElement,
		dims: { bubbleWidth: number; bubbleHeight: number; totalHeight: number; curveRadius: number; tailBaseWidth: number; tailLength: number; strokePadding: number },
		direction: 'up' | 'down',
		tailPosition: number
	): void {
		const { bubbleWidth, bubbleHeight, totalHeight, curveRadius, tailBaseWidth, tailLength, strokePadding } = dims;

		// Update element dimensions with padding for stroke
		bubble.style.width = `${bubbleWidth + strokePadding * 2}px`;
		bubble.style.height = `${totalHeight + strokePadding * 2}px`;

		// Apply CSS class based on direction
		if (direction === 'up') {
			bubble.classList.remove('show-above');
		} else {
			bubble.classList.add('show-above');
		}

		// Generate SVG path with calculated tail position
		const pathData = this.generateSpeechBubbleSVG(
			strokePadding, strokePadding, bubbleWidth, bubbleHeight,
			direction, curveRadius, tailBaseWidth, tailLength, tailPosition
		);

		// Update SVG path
		const svgPath = bubble.querySelector('.speech-bubble-path');
		if (svgPath) {
			svgPath.setAttribute('d', pathData);
		}

		// Update SVG viewBox with padding for stroke
		const svg = bubble.querySelector('.speech-bubble-svg');
		if (svg) {
			svg.setAttribute('viewBox', `0 0 ${bubbleWidth + strokePadding * 2} ${totalHeight + strokePadding * 2}`);
		}
	}

	processHintDecorator(contentId: string, elementId: string, showBelow: boolean, maxWidth?: number) {
		// adjust width so wrapping does not happen too soon or too late
		// then align with the content id
		// then keep onscreen and put on top of DOM
		let element = document.getElementById(elementId);
		if (element == null) {
			return;
		}

		// Get the content element for measurement
		let contentElement = element.querySelector('.speech-bubble-content') as HTMLElement | null;
		if (!contentElement) {
			return;
		}

		// Calculate dimensions using helper
		const dims = this.calculateHintDimensions(contentElement, maxWidth ? { maxWidth } : undefined);
		const direction: 'up' | 'down' = showBelow ? 'up' : 'down';

		// Set initial dimensions (needed for positioning)
		element.style.width = `${dims.bubbleWidth + dims.strokePadding * 2}px`;
		element.style.height = `${dims.totalHeight + dims.strokePadding * 2}px`;

		// Position the bubble first
		this.putElementUnderContentRoot(elementId);

		// Apply CSS class and position based on direction
		if (showBelow) {
			element.classList.remove('show-above');
			this.alignElementAnchorPoints(contentId, elementId, AnchorPoint.Bottom, AnchorPoint.Top, 0, 0, true, false);
		} else {
			element.classList.add('show-above');
			this.alignElementAnchorPoints(contentId, elementId, AnchorPoint.Top, AnchorPoint.Bottom, 0, 0, true, false);
		}

		// Apply keepOnScreen adjustments
		this.keepOnScreen(elementId, false);

		// Now calculate tail position based on final positions
		const targetElement = document.getElementById(contentId);
		if (!targetElement) {
			return;
		}

		const contentRect = targetElement.getBoundingClientRect();
		const bubbleRect = element.getBoundingClientRect();
		const contentCenterX = contentRect.left + contentRect.width / 2;
		const bubbleLeft = bubbleRect.left;

		// Calculate where the tail should point (relative to bubble, accounting for stroke padding)
		const relativeX = contentCenterX - bubbleLeft - dims.strokePadding;
		const tailPosition = Math.max(dims.tailBaseWidth / 2, Math.min(dims.bubbleWidth - dims.tailBaseWidth / 2, relativeX));

		// Apply geometry using helper
		this.applyHintBubbleGeometry(element, dims, direction, tailPosition);
	}

	generateSpeechBubbleSVG(x: number, y: number, width: number, height: number, 
	                       direction: "up" | "down", curveRadius: number, 
	                       tailBaseWidth: number, tailLength: number, 
	                       tailPosition: number): string {
		
		// Helper function to snap coordinates to half-pixel boundaries for crisp 1px strokes
		const snapToHalfPixel = (coord: number): number => Math.floor(coord) + 0.5;
		
		// Calculate actual bubble dimensions including tail
		const bubbleX = x;
		const bubbleY = y;
		const bubbleWidth = width;
		const bubbleHeight = height + tailLength;
		
		// Constrain curve radius to not exceed half the smaller dimension
		const maxRadius = Math.min(width, height) / 2;
		const radius = Math.min(curveRadius, maxRadius);
		
		// Calculate snapped rectangle bounds
		const rectLeft = snapToHalfPixel(bubbleX);
		const rectRight = snapToHalfPixel(bubbleX + width);
		
		// Ensure tail position is within bubble bounds
		const minTailX = rectLeft + tailBaseWidth / 2;
		const maxTailX = rectRight - tailBaseWidth / 2;
		const clampedTailX = Math.max(minTailX, Math.min(maxTailX, bubbleX + tailPosition));
		
		// Calculate tail points with pixel snapping
		const tailCenterX = snapToHalfPixel(clampedTailX);
		const tailLeftX = snapToHalfPixel(tailCenterX - tailBaseWidth / 2);
		const tailRightX = snapToHalfPixel(tailCenterX + tailBaseWidth / 2);
		
		let pathData = "";
		
		if (direction === "up") {
			// Bubble below element, tail pointing up
			const rectTop = snapToHalfPixel(bubbleY + tailLength);
			const rectBottom = rectTop + height;
			const tailTipY = snapToHalfPixel(bubbleY);
			
			// Start from top-left corner end, go clockwise
			pathData = `M${rectLeft + radius},${rectTop}`;
			
			// Top edge with tail
			if (tailLeftX > rectLeft + radius) {
				pathData += `L${tailLeftX},${rectTop}`;
			}
			pathData += `L${tailCenterX},${tailTipY}L${tailRightX},${rectTop}`;
			if (tailRightX < rectRight - radius) {
				pathData += `L${rectRight - radius},${rectTop}`;
			}
			
			// Top-right corner
			pathData += `Q${rectRight},${rectTop} ${rectRight},${rectTop + radius}`;
			
			// Right edge
			pathData += `L${rectRight},${rectBottom - radius}`;
			
			// Bottom-right corner
			pathData += `Q${rectRight},${rectBottom} ${rectRight - radius},${rectBottom}`;
			
			// Bottom edge
			pathData += `L${rectLeft + radius},${rectBottom}`;
			
			// Bottom-left corner
			pathData += `Q${rectLeft},${rectBottom} ${rectLeft},${rectBottom - radius}`;
			
			// Left edge
			pathData += `L${rectLeft},${rectTop + radius}`;
			
			// Top-left corner back to start
			pathData += `Q${rectLeft},${rectTop} ${rectLeft + radius},${rectTop}Z`;
			
		} else {
			// Bubble above element, tail pointing down
			const rectTop = snapToHalfPixel(bubbleY);
			const rectBottom = rectTop + height;
			const tailTipY = snapToHalfPixel(bubbleY + height + tailLength);
			
			// Start from top-left corner end, go clockwise
			pathData = `M${rectLeft + radius},${rectTop}`;
			
			// Top edge
			pathData += `L${rectRight - radius},${rectTop}`;
			
			// Top-right corner
			pathData += `Q${rectRight},${rectTop} ${rectRight},${rectTop + radius}`;
			
			// Right edge
			pathData += `L${rectRight},${rectBottom - radius}`;
			
			// Bottom-right corner
			pathData += `Q${rectRight},${rectBottom} ${rectRight - radius},${rectBottom}`;
			
			// Bottom edge with tail
			if (tailRightX < rectRight - radius) {
				pathData += `L${tailRightX},${rectBottom}`;
			}
			pathData += `L${tailCenterX},${tailTipY}L${tailLeftX},${rectBottom}`;
			if (tailLeftX > rectLeft + radius) {
				pathData += `L${rectLeft + radius},${rectBottom}`;
			}
			
			// Bottom-left corner
			pathData += `Q${rectLeft},${rectBottom} ${rectLeft},${rectBottom - radius}`;
			
			// Left edge
			pathData += `L${rectLeft},${rectTop + radius}`;
			
			// Top-left corner back to start
			pathData += `Q${rectLeft},${rectTop} ${rectLeft + radius},${rectTop}Z`;
		}
		
		return pathData;
	}

	measureUnwrappedWidth(element: HTMLElement): number {
		const clone = element.cloneNode(true) as HTMLElement;
		clone.style.position = 'absolute';
		clone.style.whiteSpace = 'nowrap'; // Prevent wrapping
		clone.style.width = 'auto'; // Remove any width constraint
		clone.style.maxWidth = 'none'; // Remove max-width constraint
		clone.style.minWidth = '0'; // Ensure minWidth does not affect measurement
		clone.style.left = 'auto'; // Remove left constraint
		clone.style.right = 'auto'; // Remove right constraint
		clone.style.visibility = 'hidden'; // Make sure it's not visible
		clone.style.display = 'inline';

		document.body.appendChild(clone);
		const width = clone.scrollWidth;
		document.body.removeChild(clone);

		return width;
	}
	
	hintManagerInitialized: boolean = false;
	hoveredHintTargetId: string | null = null;
	visibleHintTargetId: string | null = null;
	pendingHintTimer: number | null = null;
	pendingHideTimer: number | null = null;
	lastHintHideTime: number = 0;
	hintElementId: string = 'venus-hint-bubble';
	hintElement: HTMLElement | null = null;
	activeHintHideClasses: string[] = [];
	lastPointerPosition: { x: number; y: number } | null = null;
	textDecoder: TextDecoder | null = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
	isProgrammaticHint: boolean = false;

	// Hint redirect mode: when set, hints are redirected via callback instead of shown locally
	hintRedirectCallback: ((targetId: string, text: string, x: number, y: number) => void) | null = null;
	hintRedirectHideCallback: (() => void) | null = null;

	// Pixels from top of viewport to switch hint to show below
	// set to 80 because not only might we hit the top of the viewport, but also the window controls (minimize, maximize, close) on Deku windows
	HINT_POSITIONING_THRESHOLD = 80;
	HINT_DELAY_MS = 700;
	RECENT_HIDE_THRESHOLD_MS = 1000;

	// Enable hint redirect mode: hints will be sent to the callback instead of shown locally
	setHintRedirectMode(
		showCallback: (targetId: string, text: string, x: number, y: number) => void,
		hideCallback: () => void
	): void {
		this.hintRedirectCallback = showCallback;
		this.hintRedirectHideCallback = hideCallback;
	}

	// Disable hint redirect mode
	clearHintRedirectMode(): void {
		this.hintRedirectCallback = null;
		this.hintRedirectHideCallback = null;
	}

	// Enable hint redirect mode from .NET via DotNetObjectReference
	// Called from WindowPage.razor to redirect hints from content views to the main window
	setHintRedirectModeFromDotNet(dotNetRef: any): void {
		this.setHintRedirectMode(
			(targetId: string, text: string, x: number, y: number) => {
				safeInvoke(dotNetRef, 'OnHintRedirect', [targetId, text, x, y]);
			},
			() => {
				safeInvoke(dotNetRef, 'OnHintHide');
			}
		);
	}

	// called from HintDecorator.razor
	registerHintDecoratorTarget(elementId: string): void {
		this.ensureHintDecoratorManagerInitialized();
		if(this.visibleHintTargetId === elementId) {
			this.showHintForTarget(elementId);
		}
	}

	// called from HintDecorator.razor
	unregisterHintDecoratorTarget(elementId: string): void {
		if(this.hoveredHintTargetId === elementId) {
			this.hoveredHintTargetId = null;
			this.clearPendingHintTimer();
		}
		if(this.visibleHintTargetId === elementId) {
			this.hideHintElement();
		}
		this.reevaluateHintTargetFromPointer();
	}

	ensureHintDecoratorManagerInitialized() {
		if(this.hintManagerInitialized) {
			return;
		}
		this.hintManagerInitialized = true;
		document.addEventListener('pointermove', (event) => this.handleHintPointerMove(event), true);
		document.addEventListener('pointerleave', (event) => this.handleHintPointerLeave(event), true);
		document.addEventListener('pointerdown', (event) => this.handleHintPointerDown(event), true);
	}

	handleHintPointerMove(event: PointerEvent) {
		if(event.pointerType === 'touch') {
			return;
		}
		this.lastPointerPosition = { x: event.clientX, y: event.clientY };
		const target = this.findHintTargetAtPosition(event.clientX, event.clientY);
		this.updateHoveredHintTarget(target);
	}

	handleHintPointerLeave(event: PointerEvent) {
		if(event.pointerType === 'touch') {
			return;
		}
		this.lastPointerPosition = null;
		this.updateHoveredHintTarget(null);
	}

	handleHintPointerDown(event: PointerEvent) {
		if(event.pointerType === 'touch') {
			return;
		}
		this.hideVisibleHintElements();
	}

	updateHoveredHintTarget(target: HTMLElement | null) {
		const targetId = target?.id ?? null;
		if(this.hoveredHintTargetId === targetId) {
			return;
		}
		this.hoveredHintTargetId = targetId;
		this.clearPendingHintTimer();
		if(targetId == null) {
			if(this.visibleHintTargetId != null) {
				this.hideHintElement();
			}
			return;
		}
		if(this.visibleHintTargetId && this.visibleHintTargetId !== targetId) {
			this.hideHintElement();
		}
		this.scheduleHintDisplay(targetId);
	}

	scheduleHintDisplay(targetId: string) {
		if(this.shouldShowHintImmediately()) {
			this.showHintForTarget(targetId);
			return;
		}
		this.pendingHintTimer = window.setTimeout(() => {
			this.pendingHintTimer = null;
			if(this.hoveredHintTargetId === targetId) {
				this.showHintForTarget(targetId);
			}
		}, this.HINT_DELAY_MS);
	}

	clearPendingHintTimer() {
		if(this.pendingHintTimer != null) {
			clearTimeout(this.pendingHintTimer);
			this.pendingHintTimer = null;
		}
	}

	clearPendingHideTimer() {
		if(this.pendingHideTimer != null) {
			clearTimeout(this.pendingHideTimer);
			this.pendingHideTimer = null;
		}
	}

	clearAllHintTimers() {
		this.clearPendingHintTimer();
		this.clearPendingHideTimer();
	}

	shouldShowHintImmediately(): boolean {
		if(this.visibleHintTargetId != null) {
			return true;
		}
		const timeSinceHide = Date.now() - this.lastHintHideTime;
		return timeSinceHide < this.RECENT_HIDE_THRESHOLD_MS;
	}

	showHintForTarget(targetId: string) {
		const targetElement = document.getElementById(targetId);
		if(!targetElement) {
			return;
		}
		const dataset = (targetElement as HTMLElement).dataset;
		if(dataset.hintEnabled !== 'true') {
			return;
		}

		// Check for redirect mode - send hint to callback instead of showing locally
		if(this.hintRedirectCallback) {
			const rect = targetElement.getBoundingClientRect();
			const text = dataset.hintText ? this.decodeHintText(dataset.hintText) : '';
			const x = rect.left + rect.width / 2;
			const y = rect.bottom;
			this.hintRedirectCallback(targetId, text, x, y);
			this.visibleHintTargetId = targetId; // Track for hide detection
			return;
		}

		const bubble = this.getOrCreateHintElement();
		this.applyHintHideClasses(bubble, dataset.hintHideClasses);
		this.applyHintContent(bubble, dataset.hintText ?? '', dataset.hintCenterText !== 'false');
		if(dataset.hintSizing) {
			bubble.setAttribute('data-sizing', dataset.hintSizing);
			if(dataset.hintDynamicTarget) {
				this.setupDynamicSizingClassesInternal(dataset.hintDynamicTarget, bubble.id);
			}
		} else {
			bubble.removeAttribute('data-sizing');
			this.cleanupDynamicSizingClasses(bubble.id);
		}
		this.clearPendingHideTimer();
		const preferBelow = dataset.hintForceBelow === 'true';
		const showBelow = preferBelow || (targetElement.getBoundingClientRect().top < this.HINT_POSITIONING_THRESHOLD);
		bubble.classList.remove('hidden');
		bubble.style.opacity = '0';
		this.processHintDecorator(targetId, bubble.id, showBelow);
		requestAnimationFrame(() => {
			bubble.style.opacity = '1';
		});
		this.visibleHintTargetId = targetId;
		this.isProgrammaticHint = false;
	}

	getOrCreateHintElement(): HTMLElement {
		if(this.hintElement) {
			return this.hintElement;
		}
		const element = document.createElement('div');
		element.id = this.hintElementId;
		element.className = 'absolute transition-opacity duration-200 opacity-0 hidden pointer-events-none speech-bubble';
		element.style.zIndex = '9999';
		element.innerHTML = `
			<svg class="speech-bubble-svg drop-shadow-[0_6px_12px_rgb(var(--vapp-shadow-elevated))]" viewBox="0 0 100 42" preserveAspectRatio="none">
				<path class="speech-bubble-path" d="" />
			</svg>
			<div class="speech-bubble-content text-xs pointer-events-none"></div>
		`;
		document.body.appendChild(element);
		this.hintElement = element;
		return element;
	}

	applyHintContent(bubble: HTMLElement, encodedText: string, centerText: boolean) {
		const contentElement = bubble.querySelector('.speech-bubble-content') as HTMLElement | null;
		if(!contentElement) {
			return;
		}
		contentElement.innerHTML = encodedText ? this.decodeHintText(encodedText) : '';
		if(centerText) {
			contentElement.classList.add('text-center');
		} else {
			contentElement.classList.remove('text-center');
		}
	}

	decodeHintText(encodedText: string): string {
		try {
			const binary = atob(encodedText);
			if(this.textDecoder) {
				const bytes = new Uint8Array(binary.length);
				for(let i = 0; i < binary.length; i++) {
					bytes[i] = binary.charCodeAt(i);
				}
				return this.textDecoder.decode(bytes);
			}
			let escaped = '';
			for(let i = 0; i < binary.length; i++) {
				const hex = binary.charCodeAt(i).toString(16).padStart(2, '0');
				escaped += `%${hex}`;
			}
			return decodeURIComponent(escaped);
		} catch {
			return '';
		}
	}

	applyHintHideClasses(bubble: HTMLElement, classes?: string) {
		this.activeHintHideClasses.forEach(cls => bubble.classList.remove(cls));
		this.activeHintHideClasses = [];
		if(!classes) {
			return;
		}
		const values = classes.split(' ').filter(value => value.length > 0);
		values.forEach(value => bubble.classList.add(value));
		this.activeHintHideClasses = values;
	}

	hideVisibleHintElements() {
		this.clearPendingHintTimer();
		this.hoveredHintTargetId = null;
		this.hideHintElement();
	}

	hideHintElement() {
		if(this.visibleHintTargetId == null) {
			return;
		}

		// Check for redirect mode - call hide callback instead of hiding locally
		if(this.hintRedirectHideCallback) {
			this.hintRedirectHideCallback();
			this.visibleHintTargetId = null;
			this.lastHintHideTime = Date.now();
			return;
		}

		const bubble = this.hintElement ?? document.getElementById(this.hintElementId);
		if(!bubble) {
			this.visibleHintTargetId = null;
			this.isProgrammaticHint = false;
			return;
		}
		bubble.style.opacity = '0';
		this.clearPendingHideTimer();
		this.pendingHideTimer = window.setTimeout(() => {
			bubble.classList.add('hidden');
			this.pendingHideTimer = null;
		}, 200);
		this.visibleHintTargetId = null;
		this.isProgrammaticHint = false;
		this.lastHintHideTime = Date.now();
		this.cleanupDynamicSizingClasses(bubble.id);
	}

	findHintTargetAtPosition(x: number, y: number): HTMLElement | null {
		let elements: Element[] = [];
		if(document.elementsFromPoint) {
			elements = document.elementsFromPoint(x, y);
		} else {
			const fallback = document.elementFromPoint(x, y);
			if(fallback) {
				elements = [fallback];
			}
		}
		const bubble = this.hintElement ?? document.getElementById(this.hintElementId);
		for(const element of elements) {
			if(bubble && (element === bubble || bubble.contains(element))) {
				continue;
			}
			const hintElement = this.findHintElementInTree(element as HTMLElement | null);
			if(hintElement) {
				return hintElement;
			}
			if(this.isBackgroundOverlayElement(element)) {
				return null;
			}
		}
		return null;
	}

	findHintElementInTree(element: HTMLElement | null): HTMLElement | null {
		let current: HTMLElement | null = element;
		while(current) {
			if(current.dataset && current.dataset.hintEnabled === 'true' && this.isElementVisibleForHints(current)) {
				return current;
			}
			current = current.parentElement;
		}
		return null;
	}

	isElementVisibleForHints(element: HTMLElement): boolean {
		let current: HTMLElement | null = element;
		while(current) {
			const style = window.getComputedStyle(current);
			const opacity = parseFloat(style.opacity ?? '1');
			if(opacity <= 0.01 || style.visibility === 'hidden' || style.display === 'none') {
				return false;
			}
			current = current.parentElement;
		}
		return true;
	}

	isBackgroundOverlayElement(element: Element | null): boolean {
		return !!(element && element.id && element.id.startsWith('backgroundOverlay_'));
	}

	reevaluateHintTargetFromPointer() {
		if(!this.lastPointerPosition) {
			return;
		}
		const target = this.findHintTargetAtPosition(this.lastPointerPosition.x, this.lastPointerPosition.y);
		this.updateHoveredHintTarget(target);
	}

	// Public API: Show hint at viewport coordinates (tail points at x,y)
	showHintAt(x: number, y: number, content: string, options?: HintOptions): void {
		this.clearAllHintTimers();

		// Get or create hint element
		const bubble = this.getOrCreateHintElement();
		this.applyHintHideClasses(bubble, options?.hideClasses);

		// Apply content directly (plain text, not base64)
		this.applyHintContentDirect(bubble, content, options?.centerText ?? true);

		// Get content element for measurement
		const contentElement = bubble.querySelector('.speech-bubble-content') as HTMLElement | null;
		if (!contentElement) {
			return;
		}

		// Determine direction
		let direction: 'up' | 'down';
		if (options?.direction === 'up') {
			direction = 'up';
		} else if (options?.direction === 'down') {
			direction = 'down';
		} else {
			// Auto: show above if there's enough room (tail points down), below otherwise (tail points up)
			direction = y > this.HINT_POSITIONING_THRESHOLD ? 'down' : 'up';
		}

		// Calculate dimensions
		const dims = this.calculateHintDimensions(contentElement, options);

		// Apply initial geometry with tail at center
		const tailPosition = dims.bubbleWidth / 2;
		this.applyHintBubbleGeometry(bubble, dims, direction, tailPosition);

		// Position using fixed positioning, centered on (x,y)
		bubble.style.position = 'fixed';
		const bubbleWidth = dims.bubbleWidth + dims.strokePadding * 2;
		const bubbleHeight = dims.totalHeight + dims.strokePadding * 2;

		// Center the bubble horizontally on x
		const left = x - bubbleWidth / 2;

		// Position vertically based on direction
		let top: number;
		if (direction === 'up') {
			// Tail points up, so bubble is below the point
			top = y;
		} else {
			// Tail points down, so bubble is above the point
			top = y - bubbleHeight;
		}

		bubble.style.left = `${left}px`;
		bubble.style.top = `${top}px`;
		bubble.style.bottom = '';

		// Remove hidden class and set opacity to 0 BEFORE keepOnScreen so getBoundingClientRect works
		bubble.classList.remove('hidden');
		bubble.style.opacity = '0';

		// Keep on screen
		this.putElementUnderContentRoot(bubble.id);
		this.keepOnScreen(bubble.id, false);

		// Recalculate tail position after keepOnScreen may have moved the bubble
		// The tail should still point at the original x coordinate
		const finalRect = bubble.getBoundingClientRect();
		const finalLeft = finalRect.left + dims.strokePadding;
		const relativeX = x - finalLeft;
		const adjustedTailPosition = Math.max(dims.tailBaseWidth / 2, Math.min(dims.bubbleWidth - dims.tailBaseWidth / 2, relativeX));
		this.applyHintBubbleGeometry(bubble, dims, direction, adjustedTailPosition);

		// Animate opacity in
		requestAnimationFrame(() => {
			bubble.style.opacity = '1';
		});

		// Mark as programmatic and update state
		this.isProgrammaticHint = true;
		this.visibleHintTargetId = '_programmatic_';
	}

	// Public API: Show hint positioned relative to an element
	showHintAtElement(element: HTMLElement | string, content: string, options?: HintOptions): void {
		// Resolve element (string ID or HTMLElement)
		let targetElement: HTMLElement | null;
		if (typeof element === 'string') {
			targetElement = document.getElementById(element);
		} else {
			targetElement = element;
		}

		if (!targetElement) {
			console.warn('showHintAtElement: element not found');
			return;
		}

		// Ensure element has an ID (generate temp if needed)
		let targetId = targetElement.id;
		if (!targetId) {
			targetId = `_hint_temp_${Date.now()}`;
			targetElement.id = targetId;
		}

		this.clearAllHintTimers();

		// Get or create hint element
		const bubble = this.getOrCreateHintElement();
		this.applyHintHideClasses(bubble, options?.hideClasses);

		// Apply content directly (plain text, not base64)
		this.applyHintContentDirect(bubble, content, options?.centerText ?? true);

		// Determine direction based on element position
		const targetRect = targetElement.getBoundingClientRect();
		let showBelow: boolean;
		if (options?.direction === 'up') {
			showBelow = true;
		} else if (options?.direction === 'down') {
			showBelow = false;
		} else {
			// Auto: show below if near top of viewport
			showBelow = targetRect.top < this.HINT_POSITIONING_THRESHOLD;
		}

		// Use processHintDecorator for positioning and geometry
		bubble.classList.remove('hidden');
		bubble.style.opacity = '0';
		this.processHintDecorator(targetId, bubble.id, showBelow, options?.maxWidth);
		requestAnimationFrame(() => {
			bubble.style.opacity = '1';
		});

		// Update state
		this.isProgrammaticHint = true;
		this.visibleHintTargetId = targetId;
	}

	// Public API: Hide any visible hint immediately
	hideHint(): void {
		this.clearAllHintTimers();

		const bubble = this.hintElement ?? document.getElementById(this.hintElementId);
		if (bubble) {
			// Immediately hide
			bubble.style.opacity = '0';
			bubble.classList.add('hidden');
			this.cleanupDynamicSizingClasses(bubble.id);
		}

		// Reset state
		this.visibleHintTargetId = null;
		this.isProgrammaticHint = false;
		this.lastHintHideTime = Date.now();
	}

	// Helper: Apply content directly (not base64 encoded)
	applyHintContentDirect(bubble: HTMLElement, text: string, centerText: boolean): void {
		const contentElement = bubble.querySelector('.speech-bubble-content') as HTMLElement | null;
		if (!contentElement) {
			return;
		}
		// Escape HTML to prevent XSS
		const escaped = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
		contentElement.innerHTML = escaped;
		if (centerText) {
			contentElement.classList.add('text-center');
		} else {
			contentElement.classList.remove('text-center');
		}
	}

	// Blazor calls this to clean up popover elements that might otherwise linger in the DOM
	removeElementFromDom(elementId: string) {
		let element = document.getElementById(elementId);
		if(element != null) {
			element.remove();
		}
	}

	stopMouseMovePropagation(elementId: string) {
		let element = document.getElementById(elementId);
		if(element == null) {
			return;
		}
		element.addEventListener('mousemove', (event) => {
			event.stopPropagation();
		});
	}

	// Initialize resizeObservers with the appropriate type
	resizeObservers: { [key: string]: ResizeObserver } = {};
	
	// Store mutation observers for data-sizing attribute changes
	mutationObservers: { [key: string]: MutationObserver } = {};
	
	// Track the classes that were applied by the dynamic sizing system for each element
	appliedDynamicClasses: { [key: string]: Set<string> } = {};

	// called from Blazor
	//
	// The element for elementIdToAdjustClasses should have a data-sizing attribute containing the information 
	// about what classes to apply. The syntax is essentially the same as that for tailwind container queries
	// https://github.com/tailwindlabs/tailwindcss-container-queries except that the '@' character is not used
	// and unprefixed classes will be removed if any of the listed sizes is met. (Tailwind does not remove classes
	// since they are overridden based on queries. Since we are not using queries we have to remove those that
	// do not apply.)
	//
	// The JS will remove all of the listed classes then apply only the one that fits the current size.
	// elementIdMaps should be in the format:
	// idToWatch:idToAdjust otherIdToWatch:otherIdToAdjust
	setupDynamicSizingClasses(elementIdMap:string) {
		const pairs = elementIdMap.split(' ') ?? [];
		pairs.forEach(pair => {
			const ids = pair.split(':') ?? [];
			if(ids.length != 2) {
				console.error(`elementIdMap '${elementIdMap}' contains invalid pair '${pair}'.`);
				return;
			}
			this.setupDynamicSizingClassesInternal(ids[0], ids[1]);
		});
	}
	
	cleanupDynamicSizingClasses(elementId: string) {
		const existingResizeObserver = this.resizeObservers[elementId];
		if(existingResizeObserver != undefined) {
			existingResizeObserver.disconnect();
			delete this.resizeObservers[elementId];
		}
		const existingMutationObserver = this.mutationObservers[elementId];
		if(existingMutationObserver != undefined) {
			existingMutationObserver.disconnect();
			delete this.mutationObservers[elementId];
		}
		delete this.appliedDynamicClasses[elementId];
	}

	setupDynamicSizingClassesInternal(elementIdToGetWidthFrom: string, elementIdToAdjustClasses: string) {
		const observedElement = document.getElementById(elementIdToGetWidthFrom);
		const adjustElement = document.getElementById(elementIdToAdjustClasses);

		if(!observedElement) {
			console.info(`Element with id '${elementIdToGetWidthFrom}' not found.`);
			return;
		}

		if(!adjustElement) {
			console.info(`Element with id '${elementIdToAdjustClasses}' not found.`);
			return;
		}

		// Check if observers already exist for this element and disconnect them
		const existingResizeObserver = this.resizeObservers[elementIdToAdjustClasses];
		if(existingResizeObserver != undefined) {
			existingResizeObserver.disconnect();
		}

		const existingMutationObserver = this.mutationObservers[elementIdToAdjustClasses];
		if(existingMutationObserver != undefined) {
			existingMutationObserver.disconnect();
		}

		// Create a new ResizeObserver instance and pass a callback function
		const resizeObserver = new ResizeObserver(entries => {
			// Call adjustSizingClasses whenever the observed element is resized
			this.adjustSizingClasses(elementIdToGetWidthFrom, elementIdToAdjustClasses);
		});

		// Create a MutationObserver to watch for data-sizing attribute changes
		const mutationObserver = new MutationObserver(mutations => {
			mutations.forEach(mutation => {
				if (mutation.type === 'attributes' && mutation.attributeName === 'data-sizing') {
					// Call adjustSizingClasses whenever the data-sizing attribute changes
					this.adjustSizingClasses(elementIdToGetWidthFrom, elementIdToAdjustClasses);
				}
			});
		});

		// Start observing the specified element for resize events
		resizeObserver.observe(observedElement);

		// Start observing the adjust element for data-sizing attribute changes
		mutationObserver.observe(adjustElement, {
			attributes: true,
			attributeFilter: ['data-sizing']
		});

		// Store the observers
		this.resizeObservers[elementIdToAdjustClasses] = resizeObserver;
		this.mutationObservers[elementIdToAdjustClasses] = mutationObserver;

		// Initialize tracking for this element
		this.appliedDynamicClasses[elementIdToAdjustClasses] = new Set<string>();

		// Call adjustSizingClasses immediately to apply initial state
		this.adjustSizingClasses(elementIdToGetWidthFrom, elementIdToAdjustClasses);
	}

	adjustSizingClasses(elementIdToGetWidthFrom: string, elementIdToAdjustClasses: string) {
		// Mostly written by ChatGPT based on a detailed outline
		// 1. Get the width for elementIdToGetWidthFrom
		const widthElement = document.getElementById(elementIdToGetWidthFrom);
		const width = widthElement ? widthElement.getBoundingClientRect().width : 0;

		// Convert rem to pixels (assuming 1 rem = 16 pixels)
		const remToPixels = (rem: number) => rem * 16;

		// Size thresholds in pixels
		const sizes = [
			{ prefix: '7xl', minWidth: remToPixels(80) },
			{ prefix: '6xl', minWidth: remToPixels(72) },
			{ prefix: '5xl', minWidth: remToPixels(64) },
			{ prefix: '4xl', minWidth: remToPixels(56) },
			{ prefix: '3xl', minWidth: remToPixels(48) },
			{ prefix: '2xl', minWidth: remToPixels(42) },
			{ prefix: 'xl', minWidth: remToPixels(36) },
			{ prefix: 'lg', minWidth: remToPixels(32) },
			{ prefix: 'md', minWidth: remToPixels(28) },
			{ prefix: 'sm', minWidth: remToPixels(24) },
			{ prefix: 'xs', minWidth: remToPixels(20) },
		];

		// 2. Get the string applied to the element elementIdToAdjustClasses via the data-sizing parameter
		const adjustElement = document.getElementById(elementIdToAdjustClasses);
		if(!adjustElement) return; // Exit if element not found

		const sizeBasedClasses = adjustElement.getAttribute('data-sizing')?.split(' ') ?? [];

		// 3. Remove all classes that were previously applied by the dynamic sizing system
		const prefixRegex = /^(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl):/;
		const previouslyAppliedClasses = this.appliedDynamicClasses[elementIdToAdjustClasses] || new Set<string>();
		
		// Remove all previously applied classes
		previouslyAppliedClasses.forEach(className => {
			adjustElement.classList.remove(className);
		});
		
		// Clear the tracking set
		this.appliedDynamicClasses[elementIdToAdjustClasses] = new Set<string>();

		// 4. Use the width to match to a prefix
		let selectedPrefix = '';
		for(const size of sizes) {
			const isPrefixPresentInClasses = sizeBasedClasses.some(className => className.startsWith(`${size.prefix}:`));
			if(width >= size.minWidth && isPrefixPresentInClasses) {
				selectedPrefix = size.prefix;
				break; // Found the matching size
			}
		}

		// 5. Add the sizeBasedClasses that are prefixed with the selected prefix
		// and track which classes we apply
		const appliedClasses = this.appliedDynamicClasses[elementIdToAdjustClasses];
		
		sizeBasedClasses.forEach(className => {
			if(className) {
				if(prefixRegex.test(className)) { // Prefixed class
					if(className.startsWith(`${selectedPrefix}:`)) {
						const actualClassName = className.replace(prefixRegex, '');
						adjustElement.classList.add(actualClassName);
						appliedClasses.add(actualClassName);
					}
				} else if(selectedPrefix === '') { // Non-prefixed class and no prefix selected
					adjustElement.classList.add(className);
					appliedClasses.add(className);
				}
			}
		});
	}
	
	openInNewTab(url: string, tabName: string) {
		// Note: This approach does NOT work on iOS Safari when called from Blazor's async event handlers
		// because the browser no longer considers it a user gesture. For iOS Safari, use either:
		// - navigateCurrentWindow() to navigate the current tab
		// - installIosSafariClickInterceptor() with data-ios-popup-url attribute for synchronous handling
		const aElem = document.createElement("a");
		aElem.href = url;
		aElem.target = tabName;
		document.body.append(aElem);
		aElem.click();
		aElem.remove();
	}

	/**
	 * Navigates the current window to the specified URL.
	 * This works on iOS Safari without triggering the popup blocker because it doesn't open a new tab.
	 * For file downloads, the server should return Content-Disposition: attachment header.
	 * For regular URLs, the user can use the browser's back button to return.
	 */
	navigateCurrentWindow(url: string) {
		window.location.href = url;
	}

	// Reference to a pre-opened popup window for iOS Safari workaround
	private _pendingPopup: Window | null = null;
	private _iosSafariClickInterceptorInstalled: boolean = false;

	/**
	 * Detects if the current browser is iOS Safari (not in a native app WebView).
	 */
	private isIosSafari(): boolean {
		const ua = navigator.userAgent;
		const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
		return isIos && isSafari;
	}

	/**
	 * Installs a click interceptor for iOS Safari that pre-opens popup windows.
	 * This must be called early in the page lifecycle.
	 * Elements with data-ios-popup-url attribute will have their clicks intercepted.
	 */
	installIosSafariClickInterceptor(): void {
		if(this._iosSafariClickInterceptorInstalled || !this.isIosSafari()) {
			return;
		}

		document.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if(!target) {
				return;
			}

			// Find ancestor with data-ios-popup-url attribute
			const popupElement = target.closest('[data-ios-popup-url]') as HTMLElement;
			if(!popupElement) {
				return;
			}

			const url = popupElement.getAttribute('data-ios-popup-url');
			if(!url || url.length === 0) {
				return;
			}

			// Open URL in new tab synchronously within the user gesture
			window.open(url, '_blank');
		}, true); // Use capture phase to run before Blazor's handlers

		this._iosSafariClickInterceptorInstalled = true;
	}

	/**
	 * Pre-opens a blank popup window. Must be called synchronously from a user gesture.
	 * This works around iOS Safari's popup blocker by opening the window before any async processing.
	 * Call navigatePendingPopup() after async processing to navigate it to the target URL.
	 */
	preOpenPopup(): boolean {
		// Close any existing pending popup
		if(this._pendingPopup && !this._pendingPopup.closed) {
			this._pendingPopup.close();
		}

		// Open a blank popup window - this must happen synchronously with user gesture
		this._pendingPopup = window.open('about:blank', '_blank');

		if(!this._pendingPopup) {
			// Popup was blocked
			return false;
		}

		// Show a loading message in the popup
		try {
			this._pendingPopup.document.write('<html><head><title>Loading...</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui,sans-serif;color:#666;">Loading...</body></html>');
		} catch(e) {
			// Cross-origin restrictions might prevent writing, that's ok
		}

		return true;
	}

	/**
	 * Navigates a pre-opened popup window to the specified URL.
	 * Call preOpenPopup() first to open the window synchronously with user gesture.
	 */
	navigatePendingPopup(url: string): boolean {
		if(!this._pendingPopup || this._pendingPopup.closed) {
			// No pending popup, fall back to regular navigation
			window.location.href = url;
			return false;
		}

		this._pendingPopup.location.href = url;
		this._pendingPopup = null;
		return true;
	}

	/**
	 * Closes a pre-opened popup window if it exists (e.g., if async processing failed).
	 */
	closePendingPopup(): void {
		if(this._pendingPopup && !this._pendingPopup.closed) {
			this._pendingPopup.close();
		}
		this._pendingPopup = null;
	}

	/**
	 * Setup a ResizeObserver to monitor toolbar container width and callback to C# when it changes.
	 * Used for responsive toolbar switching between full, compact, and minimal layouts.
	 */
	setupToolbarResizeObserver(containerElementId: string, dotNetHelper: any, callbackMethodName: string): void {
		const containerElement = document.getElementById(containerElementId);
		if(!containerElement) {
			console.warn(`setupToolbarResizeObserver: Could not find container element "${containerElementId}".`);
			return;
		}

		const resizeObserver = new ResizeObserver((entries) => {
			for(const entry of entries) {
				const width = entry.contentRect.width;
				safeInvoke(dotNetHelper, callbackMethodName, [width]);
			}
		});

		resizeObserver.observe(containerElement);

		// Trigger initial callback with current width
		const width = containerElement.offsetWidth;
		safeInvoke(dotNetHelper, callbackMethodName, [width]);
	}

	/**
	 * Prevent mousedown on the toolbar from stealing focus from the editor,
	 * which would dismiss the virtual keyboard on mobile devices.
	 * mousedown.preventDefault() prevents focus change without blocking click events.
	 */
	setupToolbarFocusGuard(containerElementId: string): void {
		const container = document.getElementById(containerElementId);
		if(!container) {
			console.warn(`setupToolbarFocusGuard: Could not find "${containerElementId}".`);
			return;
		}
		container.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
		});

		// Set up gradient fade masks on the scrollable toolbar
		const scrollable = container.querySelector('.venus-toolbar-scrollable') as HTMLElement;
		if(scrollable) {
			const updateMask = () => {
				const tolerance = 1;
				const atLeftEdge = scrollable.scrollLeft <= 0;
				const atRightEdge = scrollable.scrollLeft + scrollable.clientWidth + tolerance >= scrollable.scrollWidth;

				let left: string, right: string;
				if(atLeftEdge && atRightEdge) {
					// No overflow — no mask needed
					scrollable.style.removeProperty('mask-image');
					scrollable.style.removeProperty('-webkit-mask-image');
					return;
				} else if(atLeftEdge) {
					left = '0%'; right = 'calc(100% - 25px)';
				} else if(atRightEdge) {
					left = 'calc(0% + 25px)'; right = '100%';
				} else {
					left = 'calc(0% + 25px)'; right = 'calc(100% - 25px)';
				}

				const mask = `linear-gradient(to right, transparent, black ${left}, black ${right}, transparent)`;
				scrollable.style.webkitMaskImage = mask;
				scrollable.style.maskImage = mask;
			};

			scrollable.addEventListener('scroll', updateMask, { passive: true });
			updateMask();
		}
	}


	// ─── Drawer swipe gesture ───────────────────────────────────────────────
	// Per-gesture state machine with velocity-based commit and scroll→drag
	// handoff. See splendid-nibbling-spark.md. Tuning constants live in
	// DRAWER_GESTURE so they can be adjusted without re-reading logic.

	private readonly DRAWER_GESTURE = {
		ACTIVATION_PX: 15,
		HANDOFF_PX: 30,
		RESISTANCE_PX: 60,
		RESISTANCE_FACTOR: 0.3,
		GRACE_WINDOW_MS: 200,
		VELOCITY_SAMPLE_MS: 80,
		// A real flick — 1600 px/s. Casual drags and scroll flicks don't qualify.
		FLICK_VELOCITY: 1.6,      // px/ms
		// Commit thresholds — top/bottom drawers (≈ 25-30% of a phone screen)
		TB_DRAG_DISTANCE: 220,
		TB_FLICK_MIN_DISTANCE: 60,
		// Commit thresholds — left/right drawers
		LR_DRAG_DISTANCE: 130,
		LR_FLICK_MIN_DISTANCE: 40,
		// Cross-axis dominance threshold before we route to scroll/propagate
		CROSS_AXIS_DOMINANCE: 1.2,
		CROSS_AXIS_MIN_PX: 8,
		// A touch that moved less than this (and preventDefault'd) triggers a synthetic click
		TAP_MAX_DISTANCE: 10,
	};

	private drawerGestureState: 'Idle' | 'Deciding' | 'Scrolling' | 'DrawerDragging' = 'Idle';
	private drawerGestureStartX = 0;
	private drawerGestureStartY = 0;
	private drawerDragAnchorX = 0;
	private drawerDragAnchorY = 0;
	private drawerScrollable: ScrollableElementInfo | null = null;
	private drawerPointerSamples: { t: number; x: number; y: number }[] = [];
	private drawerDidPreventScroll = false;
	private drawerMaxFingerDistance = 0;
	private drawerEdgeHandoffStartAxisDelta: number | null = null;
	// Last time a scroll-related event occurred (touchend in Scrolling state, OR a
	// scroll event on the scrollable element — including inertia/bounce while the
	// finger is lifted). While within GRACE_WINDOW_MS of this, the drawer is inert.
	private drawerLastScrollActivityTime = 0;
	// Temporary scroll listener attached to the detected scrollable so that inertia
	// scroll events between gestures keep the grace window alive.
	private drawerScrollListener: { el: HTMLElement; fn: () => void } | null = null;

	drawerDotNetObjRef: any = null;

	private handlersMap = new Map<string, TouchHandlers>();

	public cleanupDrawerSlideHandler() {
		this.drawerDotNetObjRef = null;
		if(this.drawerScrollListener) {
			this.drawerScrollListener.el.removeEventListener('scroll', this.drawerScrollListener.fn);
			this.drawerScrollListener = null;
		}
		for(const [mapKey, {start, move, end, cancel}] of this.handlersMap) {
			const elementId = mapKey.split('_')[0];
			const backgroundOverlayId = mapKey.split('_').slice(2).join('_');
			[document.getElementById(elementId), document.getElementById(backgroundOverlayId)].forEach((el) => {
				if(!el) return;
				el.removeEventListener('touchstart', start);
				el.removeEventListener('touchmove', move);
				el.removeEventListener('touchend', end);
				el.removeEventListener('touchcancel', cancel);
			});
		}
		this.handlersMap.clear();
	}

	// Called by Blazor
	public setupDrawerSlideHandler(elementId: string, position: DrawerPosition, backgroundOverlayId: string, dotNetObjRef: any, targetContainerId: string | null = null, removeHandlers: boolean = false) {
		// Only adopt this ref when we're actually attaching listeners. Cleanup-style calls
		// (removeHandlers: true) must not overwrite the currently-active drawer's ref, or the
		// touchend commit callback routes to the wrong component.
		if(!removeHandlers) {
			this.drawerDotNetObjRef = dotNetObjRef;
		}

		const element = document.getElementById(elementId) as HTMLElement;
		const backgroundOverlay = document.getElementById(backgroundOverlayId);
		if(!element) return;

		const mapKey = `${elementId}_${position}_${backgroundOverlayId}`;

		if(!this.handlersMap.has(mapKey)) {
			const startFn = (e: TouchEvent) => this.handleTouchStart(e, targetContainerId ?? elementId, position);
			const moveFn = (e: TouchEvent) => this.handleTouchMove(e, targetContainerId ?? elementId, position);
			const endFn = (e: TouchEvent) => this.handleTouchEnd(e, targetContainerId ?? elementId, position);
			const cancelFn = (e: TouchEvent) => this.handleTouchCancel(e, targetContainerId ?? elementId, position);

			this.handlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
		}

		const {start, move, end, cancel} = this.handlersMap.get(mapKey)!;

		[element, backgroundOverlay].forEach((el) => {
			if(!el) return;
			el.removeEventListener('touchstart', start);
			el.removeEventListener('touchmove', move);
			el.removeEventListener('touchend', end);
			el.removeEventListener('touchcancel', cancel);
			if(!removeHandlers) {
				el.addEventListener('touchstart', start, {passive: false});
				el.addEventListener('touchmove', move, {passive: false});
				el.addEventListener('touchend', end, {passive: false});
				el.addEventListener('touchcancel', cancel, {passive: false});
			}
		});
	}

	// Signed delta in the drawer's dismissal direction (positive = toward dismissal).
	private drawerDismissalAxisDelta(dx: number, dy: number, position: DrawerPosition): number {
		switch(position) {
			case DrawerPosition.Left: return -dx;
			case DrawerPosition.Right: return dx;
			case DrawerPosition.Top: return -dy;
			case DrawerPosition.Bottom: return dy;
		}
	}

	// Signed delta perpendicular to the dismissal direction.
	private drawerCrossAxisDelta(dx: number, dy: number, position: DrawerPosition): number {
		return (position === DrawerPosition.Left || position === DrawerPosition.Right) ? dy : dx;
	}

	// True when the scrollable cannot scroll further in the direction that would
	// absorb the dismissal gesture (i.e. content is pinned against the edge that
	// corresponds to the drawer's dismissal direction).
	private drawerIsAtDismissalEdge(info: ScrollableElementInfo, position: DrawerPosition): boolean {
		const el = info.element;
		const tol = 1;
		switch(position) {
			case DrawerPosition.Bottom: return el.scrollTop <= tol;
			case DrawerPosition.Top:    return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - tol);
			case DrawerPosition.Right:  return el.scrollLeft <= tol;
			case DrawerPosition.Left:   return (el.scrollLeft + el.clientWidth) >= (el.scrollWidth - tol);
		}
	}

	private drawerScrollableMatchesPullAxis(info: ScrollableElementInfo | null, position: DrawerPosition): boolean {
		if(!info) return false;
		const isVertical = position === DrawerPosition.Top || position === DrawerPosition.Bottom;
		return isVertical ? !info.isHorizontallyScrollable : info.isHorizontallyScrollable;
	}

	private drawerPushSample(t: number, x: number, y: number) {
		this.drawerPointerSamples.push({ t, x, y });
		const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
		while(this.drawerPointerSamples.length > 2 && this.drawerPointerSamples[0].t < cutoff) {
			this.drawerPointerSamples.shift();
		}
	}

	// Velocity in the dismissal axis (px/ms). Positive = toward dismissal.
	private drawerVelocity(position: DrawerPosition): number {
		const s = this.drawerPointerSamples;
		if(s.length < 2) return 0;
		const first = s[0];
		const last = s[s.length - 1];
		const dt = last.t - first.t;
		if(dt <= 0) return 0;
		return this.drawerDismissalAxisDelta(last.x - first.x, last.y - first.y, position) / dt;
	}

	private handleTouchStart(event: TouchEvent, elementId: string, position: DrawerPosition) {
		const touch = event.touches[0];
		const now = performance.now();

		this.drawerGestureState = 'Deciding';
		this.drawerGestureStartX = touch.clientX;
		this.drawerGestureStartY = touch.clientY;
		this.drawerDragAnchorX = touch.clientX;
		this.drawerDragAnchorY = touch.clientY;
		this.drawerScrollable = null;
		this.drawerDidPreventScroll = false;
		this.drawerMaxFingerDistance = 0;
		this.drawerEdgeHandoffStartAxisDelta = null;
		this.drawerPointerSamples = [];
		this.drawerPushSample(now, touch.clientX, touch.clientY);

		const element = document.getElementById(elementId);
		if(!element) return;
		element.style.transitionTimingFunction = 'linear';
		element.style.transitionDuration = '0ms';

		// Detach previous inertia-scroll listener (from a prior gesture's scrollable).
		if(this.drawerScrollListener) {
			this.drawerScrollListener.el.removeEventListener('scroll', this.drawerScrollListener.fn);
			this.drawerScrollListener = null;
		}

		// Find the first scrollable ancestor (vertical or horizontal).
		let currentElement: HTMLElement | null = event.target as HTMLElement;
		while(currentElement && currentElement !== document.body) {
			const style = window.getComputedStyle(currentElement);
			const overflowY = style.overflowY;
			const overflowX = style.overflowX;
			const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll') && currentElement.scrollHeight > currentElement.clientHeight;
			const isHorizontallyScrollable = (overflowX === 'auto' || overflowX === 'scroll') && currentElement.scrollWidth > currentElement.clientWidth;
			if(isVerticallyScrollable || isHorizontallyScrollable) {
				this.drawerScrollable = {
					element: currentElement,
					scrollTopAtStart: currentElement.scrollTop,
					scrollHeight: currentElement.scrollHeight,
					clientHeight: currentElement.clientHeight,
					scrollLeftAtStart: currentElement.scrollLeft,
					scrollWidth: currentElement.scrollWidth,
					clientWidth: currentElement.clientWidth,
					isHorizontallyScrollable: isHorizontallyScrollable,
				};
				break;
			}
			currentElement = currentElement.parentElement;
		}

		// Attach a scroll listener so inertia/bounce events between gestures keep
		// the grace timer alive. Without this, a 1-2s inertia scroll can outlast the
		// grace window and the follow-up flick dismisses the drawer.
		if(this.drawerScrollable) {
			const scrollEl = this.drawerScrollable.element;
			const refreshGrace = () => { this.drawerLastScrollActivityTime = performance.now(); };
			scrollEl.addEventListener('scroll', refreshGrace, { passive: true });
			this.drawerScrollListener = { el: scrollEl, fn: refreshGrace };
		}
	}

	private handleTouchMove(event: TouchEvent, elementId: string, position: DrawerPosition) {
		const element = document.getElementById(elementId);
		if(!element) return;

		// Don't hijack <input type="range"> slider drags.
		if(event.target instanceof HTMLInputElement && (event.target as HTMLInputElement).type === 'range') {
			return;
		}

		const touch = event.touches[0];
		const now = performance.now();
		this.drawerPushSample(now, touch.clientX, touch.clientY);

		const dxFromStart = touch.clientX - this.drawerGestureStartX;
		const dyFromStart = touch.clientY - this.drawerGestureStartY;
		this.drawerMaxFingerDistance = Math.max(this.drawerMaxFingerDistance, Math.hypot(dxFromStart, dyFromStart));

		switch(this.drawerGestureState) {
			case 'Idle':
				return;
			case 'Deciding':
				this.drawerDecide(event, touch, position);
				return;
			case 'Scrolling':
				this.drawerObserveForHandoff(event, touch, position);
				return;
			case 'DrawerDragging':
				this.drawerApplyDrag(event, element, touch, position);
				return;
		}
	}

	private drawerDecide(event: TouchEvent, touch: Touch, position: DrawerPosition) {
		const deltaX = touch.clientX - this.drawerGestureStartX;
		const deltaY = touch.clientY - this.drawerGestureStartY;
		const axisDelta = this.drawerDismissalAxisDelta(deltaX, deltaY, position);
		const crossDelta = this.drawerCrossAxisDelta(deltaX, deltaY, position);
		const G = this.DRAWER_GESTURE;

		// Cross-axis dominant → let native handle (either in-scroll or propagate up).
		if(Math.abs(crossDelta) > Math.abs(axisDelta) * G.CROSS_AXIS_DOMINANCE && Math.abs(crossDelta) > G.CROSS_AXIS_MIN_PX) {
			this.drawerGestureState = this.drawerScrollable ? 'Scrolling' : 'Idle';
			return;
		}

		// Motion in the "pull drawer further open past rest" direction — don't move the drawer.
		// Hand off to scroll if there's one in the pull axis, otherwise go idle (the gesture won't
		// dismiss and the drawer is already at rest).
		if(axisDelta < 0) {
			this.drawerGestureState = this.drawerScrollableMatchesPullAxis(this.drawerScrollable, position) ? 'Scrolling' : 'Idle';
			return;
		}

		// Motion in the dismissal direction. If a scrollable in the pull axis can still
		// absorb motion in that direction, let it — drawer waits for handoff at the edge.
		const scrollable = this.drawerScrollable;
		const scrollableInPullAxis = this.drawerScrollableMatchesPullAxis(scrollable, position);
		if(scrollableInPullAxis && !this.drawerIsAtDismissalEdge(scrollable!, position)) {
			this.drawerGestureState = 'Scrolling';
			return;
		}

		// Grace window: immediately after any scroll gesture, the drawer becomes inert for
		// GRACE_WINDOW_MS. Rapid follow-up swipes (e.g. scrolling content back to the top
		// and the next flick continuing past the edge) hit this and are routed to scroll
		// instead of drawer-drag. User has to wait for grace to expire — that pause IS the
		// signal that the gesture is intentional. No preventDefault here — let native
		// overscroll bounce happen so it doesn't feel "dead".
		const inGrace = (performance.now() - this.drawerLastScrollActivityTime) < G.GRACE_WINDOW_MS;
		if(inGrace) {
			this.drawerGestureState = this.drawerScrollable ? 'Scrolling' : 'Idle';
			return;
		}

		// Past grace. Prevent default NOW to block scroll chaining to outer containers
		// during the activation zone. The scrollable itself can't scroll further in this
		// direction, so there's no useful native scroll to preserve. Without this, the
		// first few frames before DrawerDragging activates let iOS chain-scroll to an
		// outer overflow container, producing a "spreading" effect where content scrolls
		// at a different rate than the drawer translates.
		event.preventDefault();
		this.drawerDidPreventScroll = true;

		// No scrollable in the way (or it's at the edge). Wait until the finger clears the
		// activation threshold before taking over.
		if(axisDelta < G.ACTIVATION_PX) return;

		this.drawerGestureState = 'DrawerDragging';
		// Re-anchor: the drawer starts at 0 translation rather than jumping by `activation`.
		this.drawerDragAnchorX = touch.clientX;
		this.drawerDragAnchorY = touch.clientY;
		event.preventDefault();
		this.drawerDidPreventScroll = true;
	}

	private drawerObserveForHandoff(event: TouchEvent, touch: Touch, position: DrawerPosition) {
		const scrollable = this.drawerScrollable;
		if(!scrollable) return;

		// While grace is active, no handoff is allowed even if the gesture reaches the
		// dismissal edge mid-motion. A rapid follow-up flick carrying inertia-carried
		// velocity would otherwise leak through here and dismiss the drawer the moment
		// the content bounces off the top of the scroll track.
		const inGrace = (performance.now() - this.drawerLastScrollActivityTime) < this.DRAWER_GESTURE.GRACE_WINDOW_MS;
		if(inGrace) return;

		const deltaX = touch.clientX - this.drawerGestureStartX;
		const deltaY = touch.clientY - this.drawerGestureStartY;
		const axisDelta = this.drawerDismissalAxisDelta(deltaX, deltaY, position);
		const atEdge = this.drawerIsAtDismissalEdge(scrollable, position);

		// If we're no longer at the edge (e.g. user scrolled back) or the finger is currently
		// behind the gesture-start point, reset the handoff anchor and keep scrolling.
		if(!atEdge || axisDelta <= 0) {
			this.drawerEdgeHandoffStartAxisDelta = null;
			return;
		}

		// At edge with dismissal motion — prevent default to block scroll chaining to
		// outer containers while we wait for the handoff threshold.
		event.preventDefault();
		this.drawerDidPreventScroll = true;

		// Latch the axis-delta value the first time we observe edge + dismissal motion.
		if(this.drawerEdgeHandoffStartAxisDelta === null) {
			this.drawerEdgeHandoffStartAxisDelta = axisDelta;
			return;
		}

		// Once the finger has continued past the edge by HANDOFF_PX, drawer takes over.
		const pushedPastEdge = axisDelta - this.drawerEdgeHandoffStartAxisDelta;
		if(pushedPastEdge < this.DRAWER_GESTURE.HANDOFF_PX) return;

		this.drawerGestureState = 'DrawerDragging';
		this.drawerDragAnchorX = touch.clientX;
		this.drawerDragAnchorY = touch.clientY;
		this.drawerEdgeHandoffStartAxisDelta = null;
		event.preventDefault();
		this.drawerDidPreventScroll = true;
	}

	private drawerApplyDrag(event: TouchEvent, element: HTMLElement, touch: Touch, position: DrawerPosition) {
		event.preventDefault();
		this.drawerDidPreventScroll = true;

		const dx = touch.clientX - this.drawerDragAnchorX;
		const dy = touch.clientY - this.drawerDragAnchorY;
		const axisOffset = this.drawerDismissalAxisDelta(dx, dy, position);

		// Rubber-band on the first RESISTANCE_PX so small drags don't visibly translate
		// the drawer, then 1:1 afterwards. Negative offset (pulling past rest in the
		// open direction) is clamped to 0.
		const G = this.DRAWER_GESTURE;
		let translated: number;
		if(axisOffset <= 0) {
			translated = 0;
		} else if(axisOffset < G.RESISTANCE_PX) {
			translated = axisOffset * G.RESISTANCE_FACTOR;
		} else {
			translated = G.RESISTANCE_PX * G.RESISTANCE_FACTOR + (axisOffset - G.RESISTANCE_PX);
		}

		// Apply translation in the drawer's coordinate frame.
		switch(position) {
			case DrawerPosition.Left:
				element.style.left = `${-translated}px`;
				break;
			case DrawerPosition.Right:
				element.style.right = `${-translated}px`;
				break;
			case DrawerPosition.Top:
				element.style.top = `${-translated}px`;
				break;
			case DrawerPosition.Bottom:
				element.style.top = `${translated}px`;
				break;
		}
	}

	private handleTouchEnd(event: TouchEvent, elementId: string, position: DrawerPosition) {
		const element = document.getElementById(elementId);
		if(!element) return;

		element.style.transitionTimingFunction = 'ease-out';
		element.style.transitionDuration = '300ms';

		const prevState = this.drawerGestureState;
		const endTouch = event.changedTouches[0];
		const G = this.DRAWER_GESTURE;
		let shouldClose = false;

		if(prevState === 'DrawerDragging') {
			const fingerAxis = this.drawerDismissalAxisDelta(
				endTouch.clientX - this.drawerDragAnchorX,
				endTouch.clientY - this.drawerDragAnchorY,
				position,
			);
			const velocity = this.drawerVelocity(position);
			const isHorizontal = position === DrawerPosition.Left || position === DrawerPosition.Right;
			const dragDistance = isHorizontal ? G.LR_DRAG_DISTANCE : G.TB_DRAG_DISTANCE;
			const flickMin = isHorizontal ? G.LR_FLICK_MIN_DISTANCE : G.TB_FLICK_MIN_DISTANCE;

			// Two ways to commit: either a deliberate drag past dragDistance, or a real flick
			// (genuinely fast velocity) with enough distance to prove it wasn't incidental motion.
			if(fingerAxis > dragDistance) {
				shouldClose = true;
			} else if(velocity > G.FLICK_VELOCITY && fingerAxis > flickMin) {
				shouldClose = true;
			}
		}

		if(shouldClose) {
			// Blur any focused editable descendant before tearing the drawer down.
			// On iOS, unmounting a focused input while the soft keyboard is still up races
			// the keyboard-dismiss animation with Blazor's re-render and leaves layout
			// (dvh, --keyboard-height, translateY(100%) parking of the Note) in an
			// inconsistent state — see splendid-nibbling-spark plan.
			this.blurFocusedEditableIn(element);
			safeInvoke(this.drawerDotNetObjRef, 'CloseDrawerWithAnimation');

			// Belt-and-braces: if the .NET ref is disposed/stale or Blazor's slideDrawer
			// otherwise no-ops, the inline offset stays at the dragged value and the drawer
			// is left parked. After the 300ms snap transition would have completed, check
			// for an intermediate inline value and restore to rest. We don't snap to the
			// dismissed value here — only Blazor knows whether the close actually happened,
			// and parking visually dismissed while Blazor thinks it's open would desync.
			const recoverElementId = elementId;
			const recoverPosition = position;
			setTimeout(() => {
				const el = document.getElementById(recoverElementId);
				if(!el) return;
				const isIntermediate = (v: string) => v !== '' && v !== '0' && v !== '0px' && v !== '100%' && v !== '-100%';
				if(recoverPosition === DrawerPosition.Left && isIntermediate(el.style.left)) el.style.left = '0';
				else if(recoverPosition === DrawerPosition.Right && isIntermediate(el.style.right)) el.style.right = '0';
				else if((recoverPosition === DrawerPosition.Top || recoverPosition === DrawerPosition.Bottom) && isIntermediate(el.style.top)) el.style.top = '0';
			}, 400);
		} else {
			// Snap back to rest unconditionally if the element was translated. Normally we
			// only need this when prevState === 'DrawerDragging', but if a prior gesture's
			// touchcancel left the element parked at a non-rest offset, this gesture's
			// release (which may end in 'Scrolling'/'Deciding' if a scrollable absorbed it)
			// is also our chance to recover. Reading style values is cheap and only setting
			// when non-zero avoids triggering pointless transitions.
			if(position === DrawerPosition.Left && element.style.left && element.style.left !== '0px' && element.style.left !== '0') element.style.left = '0';
			else if(position === DrawerPosition.Right && element.style.right && element.style.right !== '0px' && element.style.right !== '0') element.style.right = '0';
			else if((position === DrawerPosition.Top || position === DrawerPosition.Bottom) && element.style.top && element.style.top !== '0px' && element.style.top !== '0') element.style.top = '0';
		}

		// Any scroll gesture arms the grace window. While grace is active the drawer
		// becomes inert — a pause longer than GRACE_WINDOW_MS is required before the
		// next touch can drag the drawer. This kills the "spam flick downs to scroll,
		// one overshoots and accidentally dismisses" case.
		if(prevState === 'Scrolling') {
			this.drawerLastScrollActivityTime = performance.now();
		}

		// Synthetic click for taps that preventDefault'd but didn't actually move much —
		// so taps inside the drawer still activate their targets.
		if(this.drawerMaxFingerDistance < G.TAP_MAX_DISTANCE && this.drawerDidPreventScroll) {
			const clickEvent = new MouseEvent('click', {
				bubbles: true, cancelable: true, view: window,
				clientX: endTouch.clientX,
				clientY: endTouch.clientY,
				screenX: endTouch.screenX,
				screenY: endTouch.screenY,
				buttons: 0, button: 0,
				ctrlKey: event.ctrlKey, altKey: event.altKey,
				shiftKey: event.shiftKey, metaKey: event.metaKey,
			});
			endTouch.target?.dispatchEvent(clickEvent);
		}

		this.drawerGestureState = 'Idle';
		this.drawerScrollable = null;
		this.drawerEdgeHandoffStartAxisDelta = null;
		this.drawerPointerSamples = [];
	}

	// iOS fires touchcancel mid-gesture when preventDefault races the system gesture
	// recognizer, when the system steals the touch (context menu, popover, interop
	// paint), or when a multi-touch starts. Without this, the drawer is left parked at
	// its dragged offset with state stuck in 'DrawerDragging' — subsequent swipes hit
	// the scrollable in the still-visible content and route to 'Scrolling', so
	// touchend's snap-back never fires and the drawer is stuck halfway until the
	// Content button forces a re-render.
	private handleTouchCancel(_event: TouchEvent, elementId: string, position: DrawerPosition) {
		const prevState = this.drawerGestureState;
		this.drawerGestureState = 'Idle';
		this.drawerScrollable = null;
		this.drawerEdgeHandoffStartAxisDelta = null;
		this.drawerPointerSamples = [];

		// Mirror handleTouchEnd's grace arming: a cancelled scroll still counts as scroll
		// activity, and the next swipe should hit the grace window rather than dropping
		// straight into DrawerDragging.
		if(prevState === 'Scrolling') {
			this.drawerLastScrollActivityTime = performance.now();
		}

		// Recovery snap-back mirrors handleTouchEnd's else-branch (lines ~2492-2494):
		// run unconditionally regardless of prevState. iOS can fire touchcancel during
		// 'Scrolling' / 'Deciding' / 'Idle' on a follow-up gesture after a previous
		// gesture parked the drawer — without this, the recovery never fires and the
		// drawer stays stuck partway. Idempotent: only sets when non-zero.
		const element = document.getElementById(elementId);
		if(!element) return;
		element.style.transitionTimingFunction = 'ease-out';
		element.style.transitionDuration = '300ms';
		if(position === DrawerPosition.Left && element.style.left && element.style.left !== '0px' && element.style.left !== '0') element.style.left = '0';
		else if(position === DrawerPosition.Right && element.style.right && element.style.right !== '0px' && element.style.right !== '0') element.style.right = '0';
		else if((position === DrawerPosition.Top || position === DrawerPosition.Bottom) && element.style.top && element.style.top !== '0px' && element.style.top !== '0') element.style.top = '0';
	}

	private blurFocusedEditableIn(container: HTMLElement | null) {
		if(!container) return;
		const active = document.activeElement as HTMLElement | null;
		if(!active || !container.contains(active)) return;
		const tag = active.tagName;
		if(tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) {
			active.blur();
		}
	}

	// Called by Blazor
	public slideDrawer(drawerContainerId: string, position: DrawerPosition, shouldShow: boolean) {
		const drawerContainer = document.getElementById(drawerContainerId) as HTMLElement;
		if(!drawerContainer) return;

		if(!shouldShow) {
			// Covers background-overlay taps and programmatic hides that go straight to
			// slideDrawer without passing through the touch handlers.
			this.blurFocusedEditableIn(drawerContainer);
		}

		const value = shouldShow ? '0' : position === DrawerPosition.Bottom ? '100%' : '-100%';

		switch(position) {
			case DrawerPosition.Left:
				drawerContainer.style.left = value;
				break;
			case DrawerPosition.Right:
				drawerContainer.style.right = value;
				break;
			case DrawerPosition.Top:
			case DrawerPosition.Bottom:
				drawerContainer.style.top = value;
				break;
		}
	}

	// ─── Popover-aware gesture suppression ───────────────────────────────────
	// Refcounted gate that custom touch-gesture handlers (currently the pull-up
	// and pull-down reveal gestures) consult to stand down while a popover is
	// open. Popover pushes on Show and pops on Hide/Dispose so a long-press that
	// opens a popover can't also trip a swipe gesture from the same touch session.
	// Refcounted because popovers can stack (one replaced by another, nested,
	// etc.) and the count must stay ≥ 1 across handoffs.

	private popoverShowingCount = 0;

	// Called by Popover.Show.
	public pushPopoverShowing() {
		this.popoverShowingCount++;
		// State is necessarily 'Idle' or 'Deciding' here when the popover was
		// opened by a long-press: long-press only fires while delta ≤ 7px,
		// strictly below the gestures' ACTIVATION_PX (15px), so neither
		// pull-up nor pull-down can be 'Dragging' yet. Reset both state
		// machines so subsequent touchmoves bail out of the move handler's
		// `if(state === 'Idle') return` early-out.
		this.pullUpState = 'Idle';
		this.pullUpScrollable = null;
		this.pullDownState = 'Idle';
		this.pullDownScrollable = null;
	}

	// Called by Popover.Hide / Popover.Dispose.
	public popPopoverShowing() {
		if(this.popoverShowingCount > 0) {
			this.popoverShowingCount--;
		}
	}

	// ─── Content-area pull-up reveal gesture ─────────────────────────────────
	// Inverse of the drawer dismiss gesture. Attached to a visible host element
	// (e.g. the plex area) while the target (content-area-container) is hidden
	// at translateY(100%). An upward swipe translates the target into view; a
	// commit past threshold invokes RevealContentWithAnimation on the owning
	// component.

	private pullUpState: 'Idle' | 'Deciding' | 'Dragging' = 'Idle';
	private pullUpStartX = 0;
	private pullUpStartY = 0;
	private pullUpTargetHeight = 0;
	private pullUpPointerSamples: { t: number; y: number }[] = [];
	private pullUpHandlersMap = new Map<string, TouchHandlers>();
	private pullUpDotNetObjRef: any = null;
	private pullUpScrollable: { element: HTMLElement } | null = null;

	// Called by Blazor
	public setupContentAreaPullUpHandler(hostId: string, targetId: string, dotNetObjRef: any, removeHandlers: boolean = false) {
		if(!removeHandlers) {
			this.pullUpDotNetObjRef = dotNetObjRef;
		}

		// Let plexCanvas know when a content-reveal / search drag is actively in progress so its
		// two-finger pan/zoom gesture stays out of the way (the reveal started first and keeps
		// ownership of the touch session). 'Dragging' only — a 'Deciding' touch hasn't committed
		// yet, so a deliberate two-finger gesture may still take over from it.
		(window as any).__plexContentRevealActive = () =>
			this.pullUpState === 'Dragging' || this.pullDownState === 'Dragging';

		const host = document.getElementById(hostId);
		if(!host) return;

		const mapKey = `pullup_${hostId}_${targetId}`;

		if(!this.pullUpHandlersMap.has(mapKey)) {
			const startFn = (e: TouchEvent) => this.handlePullUpStart(e, targetId);
			const moveFn = (e: TouchEvent) => this.handlePullUpMove(e, targetId);
			const endFn = (e: TouchEvent) => this.handlePullUpEnd(e, targetId);
			const cancelFn = (e: TouchEvent) => this.handlePullUpCancel(e, targetId);
			this.pullUpHandlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
		}

		const {start, move, end, cancel} = this.pullUpHandlersMap.get(mapKey)!;

		host.removeEventListener('touchstart', start);
		host.removeEventListener('touchmove', move);
		host.removeEventListener('touchend', end);
		host.removeEventListener('touchcancel', cancel);
		if(!removeHandlers) {
			host.addEventListener('touchstart', start, {passive: false});
			host.addEventListener('touchmove', move, {passive: false});
			host.addEventListener('touchend', end, {passive: false});
			host.addEventListener('touchcancel', cancel, {passive: false});
		}
	}

	private pullUpPushSample(t: number, y: number) {
		this.pullUpPointerSamples.push({ t, y });
		const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
		while(this.pullUpPointerSamples.length > 2 && this.pullUpPointerSamples[0].t < cutoff) {
			this.pullUpPointerSamples.shift();
		}
	}

	// Upward velocity in px/ms (positive = toward reveal).
	private pullUpVelocity(): number {
		const s = this.pullUpPointerSamples;
		if(s.length < 2) return 0;
		const first = s[0];
		const last = s[s.length - 1];
		const dt = last.t - first.t;
		if(dt <= 0) return 0;
		return -(last.y - first.y) / dt;
	}

	private handlePullUpStart(event: TouchEvent, targetId: string) {
		// A second finger landed. If the reveal is already dragging, it started first and keeps
		// ownership — leave its state untouched so it resolves on release (don't strand the
		// content partway). Otherwise yield to the plex's two-finger pan/zoom gesture.
		if(event.touches.length > 1) {
			if(this.pullUpState !== 'Dragging') {
				this.pullUpState = 'Idle';
				this.pullUpScrollable = null;
			}
			return;
		}

		const touch = event.touches[0];

		// If the touch started on a plex custom scrollbar, stay out of the way entirely.
		// The scrollbar is canvas-drawn (no DOM element to detect via event.target), so
		// plexCanvas exposes a hit-test via window.__plexTouchIsOverScrollbar. Without
		// this, our preventDefault during Dragging causes iOS to fire touchcancel mid
		// scrollbar-drag, which corrupts the plex's scrollbar state and suppresses
		// long-press detection on subsequent touches.
		const plexScrollbarHitTest = (window as any).__plexTouchIsOverScrollbar;
		if(typeof plexScrollbarHitTest === 'function' && plexScrollbarHitTest(touch.clientX, touch.clientY)) {
			this.pullUpState = 'Idle';
			this.pullUpScrollable = null;
			return;
		}

		// A popover is showing; don't compete with it for the same touch session.
		if(this.popoverShowingCount > 0) {
			this.pullUpState = 'Idle';
			this.pullUpScrollable = null;
			return;
		}

		this.pullUpState = 'Deciding';
		this.pullUpStartX = touch.clientX;
		this.pullUpStartY = touch.clientY;
		this.pullUpPointerSamples = [];
		this.pullUpPushSample(performance.now(), touch.clientY);

		// Walk up from the touch target to find the nearest vertically-scrollable
		// ancestor. If one exists and isn't pinned at its bottom edge, we'll defer
		// the whole gesture to native scroll rather than hijacking it.
		this.pullUpScrollable = null;
		let currentElement: HTMLElement | null = event.target as HTMLElement;
		while(currentElement && currentElement !== document.body) {
			const style = window.getComputedStyle(currentElement);
			const overflowY = style.overflowY;
			const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
				&& currentElement.scrollHeight > currentElement.clientHeight;
			if(isVerticallyScrollable) {
				this.pullUpScrollable = { element: currentElement };
				break;
			}
			currentElement = currentElement.parentElement;
		}

		const target = document.getElementById(targetId);
		if(target) {
			this.pullUpTargetHeight = target.getBoundingClientRect().height;
			target.style.transitionTimingFunction = 'linear';
			target.style.transitionDuration = '0ms';
		}
	}

	private handlePullUpMove(event: TouchEvent, targetId: string) {
		if(this.pullUpState === 'Idle') return;

		// Note: a second finger does not cancel an in-progress drag — once dragging, the reveal
		// owns the session and keeps tracking the first finger (touches[0]). The plex two-finger
		// gesture is suppressed via __plexContentRevealActive while this is 'Dragging'.

		// A popover opened mid-gesture (long-press fires while finger is still down).
		// Treat that as a cancellation so any in-flight drag snaps back and further
		// movements don't commit the reveal.
		if(this.popoverShowingCount > 0) {
			this.handlePullUpCancel(event, targetId);
			return;
		}

		const touch = event.touches[0];
		const now = performance.now();
		this.pullUpPushSample(now, touch.clientY);

		const dx = touch.clientX - this.pullUpStartX;
		const dy = touch.clientY - this.pullUpStartY;
		const upDelta = -dy;
		const G = this.DRAWER_GESTURE;

		if(this.pullUpState === 'Deciding') {
			// Cross-axis dominant → let native handle.
			if(Math.abs(dx) > Math.abs(dy) * G.CROSS_AXIS_DOMINANCE && Math.abs(dx) > G.CROSS_AXIS_MIN_PX) {
				this.pullUpState = 'Idle';
				return;
			}
			// Downward motion while content is already hidden — nothing to pull.
			if(upDelta < 0) {
				this.pullUpState = 'Idle';
				return;
			}
			// Scrollable ancestor can still scroll down → let it absorb the swipe.
			if(this.pullUpScrollable) {
				const el = this.pullUpScrollable.element;
				const tol = 1;
				const atBottomEdge = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - tol);
				if(!atBottomEdge) {
					this.pullUpState = 'Idle';
					return;
				}
			}
			// Wait for clear upward motion before taking over.
			if(upDelta < G.ACTIVATION_PX) return;

			this.pullUpState = 'Dragging';
		}

		if(this.pullUpState === 'Dragging') {
			event.preventDefault();
			const target = document.getElementById(targetId);
			if(!target || this.pullUpTargetHeight <= 0) return;
			const ratio = Math.max(0, Math.min(1, upDelta / this.pullUpTargetHeight));
			const percent = 100 * (1 - ratio);
			target.style.transform = `translateY(${percent}%)`;
		}
	}

	private handlePullUpEnd(event: TouchEvent, targetId: string) {
		const prevState = this.pullUpState;
		this.pullUpState = 'Idle';
		this.pullUpScrollable = null;

		if(prevState !== 'Dragging') return;

		const target = document.getElementById(targetId);
		if(!target) return;

		target.style.transitionTimingFunction = 'ease-out';
		target.style.transitionDuration = '300ms';

		const endTouch = event.changedTouches[0];
		const upDelta = -(endTouch.clientY - this.pullUpStartY);
		const velocity = this.pullUpVelocity();
		const G = this.DRAWER_GESTURE;

		// Commit via either deliberate drag past TB_DRAG_DISTANCE or a real upward flick.
		const shouldCommit =
			upDelta > G.TB_DRAG_DISTANCE ||
			(velocity > G.FLICK_VELOCITY && upDelta > G.TB_FLICK_MIN_DISTANCE);

		if(shouldCommit) {
			target.style.transform = 'translateY(0%)';
			safeInvoke(this.pullUpDotNetObjRef, 'RevealContentWithAnimation');
		} else {
			target.style.transform = 'translateY(100%)';
		}
	}

	// iOS may fire touchcancel when we call preventDefault mid-gesture, when the system
	// steals the touch (e.g. for a context menu), or when interop paints cover the view.
	// Snap back to the hidden state rather than leaving the target stuck partway.
	private handlePullUpCancel(_event: TouchEvent, targetId: string) {
		const prevState = this.pullUpState;
		this.pullUpState = 'Idle';
		this.pullUpScrollable = null;

		if(prevState !== 'Dragging') return;

		const target = document.getElementById(targetId);
		if(!target) return;
		target.style.transitionTimingFunction = 'ease-out';
		target.style.transitionDuration = '300ms';
		target.style.transform = 'translateY(100%)';
	}

	// ─── Search pull-down reveal gesture ─────────────────────────────────────
	// Sibling of the content-area pull-up: attached to the same Plex host. A
	// downward swipe translates the search sheet (hidden at translateY(-100%))
	// into view from the top edge. Commit past threshold invokes
	// RevealSearchWithAnimation on the SearchSheet component.

	private pullDownState: 'Idle' | 'Deciding' | 'Dragging' = 'Idle';
	private pullDownStartX = 0;
	private pullDownStartY = 0;
	private pullDownTargetHeight = 0;
	private pullDownPointerSamples: { t: number; y: number }[] = [];
	private pullDownHandlersMap = new Map<string, TouchHandlers>();
	private pullDownDotNetObjRef: any = null;
	private pullDownScrollable: { element: HTMLElement } | null = null;

	// Called by Blazor
	public setupSearchPullDownHandler(hostId: string, targetId: string, dotNetObjRef: any, removeHandlers: boolean = false) {
		if(!removeHandlers) {
			this.pullDownDotNetObjRef = dotNetObjRef;
		}

		const host = document.getElementById(hostId);
		if(!host) return;

		const mapKey = `pulldown_${hostId}_${targetId}`;

		if(!this.pullDownHandlersMap.has(mapKey)) {
			const startFn = (e: TouchEvent) => this.handlePullDownStart(e, targetId);
			const moveFn = (e: TouchEvent) => this.handlePullDownMove(e, targetId);
			const endFn = (e: TouchEvent) => this.handlePullDownEnd(e, targetId);
			const cancelFn = (e: TouchEvent) => this.handlePullDownCancel(e, targetId);
			this.pullDownHandlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
		}

		const {start, move, end, cancel} = this.pullDownHandlersMap.get(mapKey)!;

		host.removeEventListener('touchstart', start);
		host.removeEventListener('touchmove', move);
		host.removeEventListener('touchend', end);
		host.removeEventListener('touchcancel', cancel);
		if(!removeHandlers) {
			host.addEventListener('touchstart', start, {passive: false});
			host.addEventListener('touchmove', move, {passive: false});
			host.addEventListener('touchend', end, {passive: false});
			host.addEventListener('touchcancel', cancel, {passive: false});
		}
	}

	private pullDownPushSample(t: number, y: number) {
		this.pullDownPointerSamples.push({ t, y });
		const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
		while(this.pullDownPointerSamples.length > 2 && this.pullDownPointerSamples[0].t < cutoff) {
			this.pullDownPointerSamples.shift();
		}
	}

	// Downward velocity in px/ms (positive = toward reveal).
	private pullDownVelocity(): number {
		const s = this.pullDownPointerSamples;
		if(s.length < 2) return 0;
		const first = s[0];
		const last = s[s.length - 1];
		const dt = last.t - first.t;
		if(dt <= 0) return 0;
		return (last.y - first.y) / dt;
	}

	private handlePullDownStart(event: TouchEvent, targetId: string) {
		// A second finger landed. If the reveal is already dragging, it started first and keeps
		// ownership — leave its state untouched so it resolves on release (don't strand the
		// content partway). Otherwise yield to the plex's two-finger pan/zoom gesture.
		if(event.touches.length > 1) {
			if(this.pullDownState !== 'Dragging') {
				this.pullDownState = 'Idle';
				this.pullDownScrollable = null;
			}
			return;
		}

		const touch = event.touches[0];

		// Same plex-scrollbar guard as the pull-up handler.
		const plexScrollbarHitTest = (window as any).__plexTouchIsOverScrollbar;
		if(typeof plexScrollbarHitTest === 'function' && plexScrollbarHitTest(touch.clientX, touch.clientY)) {
			this.pullDownState = 'Idle';
			this.pullDownScrollable = null;
			return;
		}

		// A popover is showing; don't compete with it for the same touch session.
		if(this.popoverShowingCount > 0) {
			this.pullDownState = 'Idle';
			this.pullDownScrollable = null;
			return;
		}

		this.pullDownState = 'Deciding';
		this.pullDownStartX = touch.clientX;
		this.pullDownStartY = touch.clientY;
		this.pullDownPointerSamples = [];
		this.pullDownPushSample(performance.now(), touch.clientY);

		// Nearest vertically-scrollable ancestor not at its top edge absorbs the gesture.
		this.pullDownScrollable = null;
		let currentElement: HTMLElement | null = event.target as HTMLElement;
		while(currentElement && currentElement !== document.body) {
			const style = window.getComputedStyle(currentElement);
			const overflowY = style.overflowY;
			const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
				&& currentElement.scrollHeight > currentElement.clientHeight;
			if(isVerticallyScrollable) {
				this.pullDownScrollable = { element: currentElement };
				break;
			}
			currentElement = currentElement.parentElement;
		}

		const target = document.getElementById(targetId);
		if(target) {
			this.pullDownTargetHeight = target.getBoundingClientRect().height;
			target.style.transitionTimingFunction = 'linear';
			target.style.transitionDuration = '0ms';
		}
	}

	private handlePullDownMove(event: TouchEvent, targetId: string) {
		if(this.pullDownState === 'Idle') return;

		// Note: a second finger does not cancel an in-progress drag — once dragging, the reveal
		// owns the session and keeps tracking the first finger (touches[0]). The plex two-finger
		// gesture is suppressed via __plexContentRevealActive while this is 'Dragging'.

		// A popover opened mid-gesture (long-press fires while finger is still down).
		// Treat that as a cancellation so any in-flight drag snaps back and further
		// movements don't commit the reveal.
		if(this.popoverShowingCount > 0) {
			this.handlePullDownCancel(event, targetId);
			return;
		}

		const touch = event.touches[0];
		const now = performance.now();
		this.pullDownPushSample(now, touch.clientY);

		const dx = touch.clientX - this.pullDownStartX;
		const dy = touch.clientY - this.pullDownStartY;
		const downDelta = dy;
		const G = this.DRAWER_GESTURE;

		if(this.pullDownState === 'Deciding') {
			if(Math.abs(dx) > Math.abs(dy) * G.CROSS_AXIS_DOMINANCE && Math.abs(dx) > G.CROSS_AXIS_MIN_PX) {
				this.pullDownState = 'Idle';
				return;
			}
			// Upward motion — let the co-existing pull-up handler take over.
			if(downDelta < 0) {
				this.pullDownState = 'Idle';
				return;
			}
			// Scrollable ancestor not at its top edge → let native scroll.
			if(this.pullDownScrollable) {
				const el = this.pullDownScrollable.element;
				const atTopEdge = el.scrollTop <= 1;
				if(!atTopEdge) {
					this.pullDownState = 'Idle';
					return;
				}
			}
			if(downDelta < G.ACTIVATION_PX) return;

			this.pullDownState = 'Dragging';
		}

		if(this.pullDownState === 'Dragging') {
			event.preventDefault();
			const target = document.getElementById(targetId);
			if(!target || this.pullDownTargetHeight <= 0) return;
			const ratio = Math.max(0, Math.min(1, downDelta / this.pullDownTargetHeight));
			const percent = -100 * (1 - ratio);
			target.style.transform = `translateY(${percent}%)`;
		}
	}

	private handlePullDownEnd(event: TouchEvent, targetId: string) {
		const prevState = this.pullDownState;
		this.pullDownState = 'Idle';
		this.pullDownScrollable = null;

		if(prevState !== 'Dragging') return;

		const target = document.getElementById(targetId);
		if(!target) return;

		target.style.transitionTimingFunction = 'ease-out';
		target.style.transitionDuration = '300ms';

		const endTouch = event.changedTouches[0];
		const downDelta = endTouch.clientY - this.pullDownStartY;
		const velocity = this.pullDownVelocity();
		const G = this.DRAWER_GESTURE;

		const shouldCommit =
			downDelta > G.TB_DRAG_DISTANCE ||
			(velocity > G.FLICK_VELOCITY && downDelta > G.TB_FLICK_MIN_DISTANCE);

		if(shouldCommit) {
			target.style.transform = 'translateY(0%)';
			safeInvoke(this.pullDownDotNetObjRef, 'RevealSearchWithAnimation');
		} else {
			target.style.transform = 'translateY(-100%)';
		}
	}

	private handlePullDownCancel(_event: TouchEvent, targetId: string) {
		const prevState = this.pullDownState;
		this.pullDownState = 'Idle';
		this.pullDownScrollable = null;

		if(prevState !== 'Dragging') return;

		const target = document.getElementById(targetId);
		if(!target) return;
		target.style.transitionTimingFunction = 'ease-out';
		target.style.transitionDuration = '300ms';
		target.style.transform = 'translateY(-100%)';
	}

	// ─── Search swipe-up dismiss gesture ─────────────────────────────────────
	// Attached to the visible search sheet. An upward swipe translates the
	// sheet back to translateY(-100%); commit past threshold invokes
	// DismissSearchFromGesture on the SearchSheet component.

	private searchDismissState: 'Idle' | 'Deciding' | 'Dragging' = 'Idle';
	private searchDismissStartX = 0;
	private searchDismissStartY = 0;
	private searchDismissTargetHeight = 0;
	private searchDismissPointerSamples: { t: number; y: number }[] = [];
	private searchDismissHandlersMap = new Map<string, TouchHandlers>();
	private searchDismissDotNetObjRef: any = null;
	private searchDismissScrollable: { element: HTMLElement } | null = null;

	// Called by Blazor
	public setupSearchSwipeUpDismissHandler(hostId: string, dotNetObjRef: any, removeHandlers: boolean = false) {
		if(!removeHandlers) {
			this.searchDismissDotNetObjRef = dotNetObjRef;
		}

		const host = document.getElementById(hostId);
		if(!host) return;

		const mapKey = `searchdismiss_${hostId}`;

		if(!this.searchDismissHandlersMap.has(mapKey)) {
			const startFn = (e: TouchEvent) => this.handleSearchDismissStart(e, hostId);
			const moveFn = (e: TouchEvent) => this.handleSearchDismissMove(e, hostId);
			const endFn = (e: TouchEvent) => this.handleSearchDismissEnd(e, hostId);
			const cancelFn = (e: TouchEvent) => this.handleSearchDismissCancel(e, hostId);
			this.searchDismissHandlersMap.set(mapKey, { start: startFn, move: moveFn, end: endFn, cancel: cancelFn });
		}

		const {start, move, end, cancel} = this.searchDismissHandlersMap.get(mapKey)!;

		host.removeEventListener('touchstart', start);
		host.removeEventListener('touchmove', move);
		host.removeEventListener('touchend', end);
		host.removeEventListener('touchcancel', cancel);
		if(!removeHandlers) {
			host.addEventListener('touchstart', start, {passive: false});
			host.addEventListener('touchmove', move, {passive: false});
			host.addEventListener('touchend', end, {passive: false});
			host.addEventListener('touchcancel', cancel, {passive: false});
		}
	}

	private searchDismissPushSample(t: number, y: number) {
		this.searchDismissPointerSamples.push({ t, y });
		const cutoff = t - this.DRAWER_GESTURE.VELOCITY_SAMPLE_MS;
		while(this.searchDismissPointerSamples.length > 2 && this.searchDismissPointerSamples[0].t < cutoff) {
			this.searchDismissPointerSamples.shift();
		}
	}

	// Upward velocity in px/ms (positive = toward dismiss).
	private searchDismissVelocity(): number {
		const s = this.searchDismissPointerSamples;
		if(s.length < 2) return 0;
		const first = s[0];
		const last = s[s.length - 1];
		const dt = last.t - first.t;
		if(dt <= 0) return 0;
		return -(last.y - first.y) / dt;
	}

	private handleSearchDismissStart(event: TouchEvent, targetId: string) {
		const touch = event.touches[0];

		// Don't hijack native input/textarea drags — text selection, caret moves, etc.
		const tgt = event.target as HTMLElement | null;
		if(tgt) {
			const tag = tgt.tagName;
			if(tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) {
				this.searchDismissState = 'Idle';
				this.searchDismissScrollable = null;
				return;
			}
		}

		this.searchDismissState = 'Deciding';
		this.searchDismissStartX = touch.clientX;
		this.searchDismissStartY = touch.clientY;
		this.searchDismissPointerSamples = [];
		this.searchDismissPushSample(performance.now(), touch.clientY);

		// Find the nearest vertically-scrollable ancestor (the results list).
		// Dismiss only takes over when that list is at scrollTop = 0.
		this.searchDismissScrollable = null;
		let currentElement: HTMLElement | null = event.target as HTMLElement;
		while(currentElement && currentElement !== document.body) {
			const style = window.getComputedStyle(currentElement);
			const overflowY = style.overflowY;
			const isVerticallyScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
				&& currentElement.scrollHeight > currentElement.clientHeight;
			if(isVerticallyScrollable) {
				this.searchDismissScrollable = { element: currentElement };
				break;
			}
			currentElement = currentElement.parentElement;
		}

		const target = document.getElementById(targetId);
		if(target) {
			this.searchDismissTargetHeight = target.getBoundingClientRect().height;
			target.style.transitionTimingFunction = 'linear';
			target.style.transitionDuration = '0ms';
		}
	}

	private handleSearchDismissMove(event: TouchEvent, targetId: string) {
		if(this.searchDismissState === 'Idle') return;

		const touch = event.touches[0];
		const now = performance.now();
		this.searchDismissPushSample(now, touch.clientY);

		const dx = touch.clientX - this.searchDismissStartX;
		const dy = touch.clientY - this.searchDismissStartY;
		const upDelta = -dy;
		const G = this.DRAWER_GESTURE;

		if(this.searchDismissState === 'Deciding') {
			if(Math.abs(dx) > Math.abs(dy) * G.CROSS_AXIS_DOMINANCE && Math.abs(dx) > G.CROSS_AXIS_MIN_PX) {
				this.searchDismissState = 'Idle';
				return;
			}
			// Downward motion while sheet is already at rest — nothing to dismiss.
			if(upDelta < 0) {
				this.searchDismissState = 'Idle';
				return;
			}
			// Upward motion on a scrollable results list scrolls it down toward
			// further items — only take over for dismiss once the list is at its
			// bottom edge and there's no more native scroll to absorb the swipe.
			// (Mirror of DrawerPosition.Top's drawerIsAtDismissalEdge check.)
			if(this.searchDismissScrollable) {
				const el = this.searchDismissScrollable.element;
				const tol = 1;
				const atBottomEdge = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - tol);
				if(!atBottomEdge) {
					this.searchDismissState = 'Idle';
					return;
				}
			}
			if(upDelta < G.ACTIVATION_PX) return;

			this.searchDismissState = 'Dragging';
		}

		if(this.searchDismissState === 'Dragging') {
			event.preventDefault();
			const target = document.getElementById(targetId);
			if(!target || this.searchDismissTargetHeight <= 0) return;
			const ratio = Math.max(0, Math.min(1, upDelta / this.searchDismissTargetHeight));
			const percent = -100 * ratio;
			target.style.transform = `translateY(${percent}%)`;
		}
	}

	private handleSearchDismissEnd(event: TouchEvent, targetId: string) {
		const prevState = this.searchDismissState;
		this.searchDismissState = 'Idle';
		this.searchDismissScrollable = null;

		if(prevState !== 'Dragging') return;

		const target = document.getElementById(targetId);
		if(!target) return;

		target.style.transitionTimingFunction = 'ease-in';
		target.style.transitionDuration = '300ms';

		const endTouch = event.changedTouches[0];
		const upDelta = -(endTouch.clientY - this.searchDismissStartY);
		const velocity = this.searchDismissVelocity();
		const G = this.DRAWER_GESTURE;

		const shouldCommit =
			upDelta > G.TB_DRAG_DISTANCE ||
			(velocity > G.FLICK_VELOCITY && upDelta > G.TB_FLICK_MIN_DISTANCE);

		if(shouldCommit) {
			this.blurFocusedEditableIn(target);
			target.style.transform = 'translateY(-100%)';
			safeInvoke(this.searchDismissDotNetObjRef, 'DismissSearchFromGesture');
		} else {
			target.style.transform = 'translateY(0%)';
		}
	}

	private handleSearchDismissCancel(_event: TouchEvent, targetId: string) {
		const prevState = this.searchDismissState;
		this.searchDismissState = 'Idle';
		this.searchDismissScrollable = null;

		if(prevState !== 'Dragging') return;

		const target = document.getElementById(targetId);
		if(!target) return;
		target.style.transitionTimingFunction = 'ease-out';
		target.style.transitionDuration = '300ms';
		target.style.transform = 'translateY(0%)';
	}


	private keyboardSelectableGroups: HTMLElement[] = [];
	private keyboardSelectableElements: HTMLElement[] = [];

	private currentKeyboardGroupIndex: number = -1;
	private currentKeyboardElementIndex: number = -1;

	private keyboardNavKeyDownHandlerBound: (event: KeyboardEvent) => void = this.keyboardNavKeyDownHandler.bind(this);
	private keyboardNavEventListenersAttached: Set<string> = new Set();

	private keyboardNavDotnetHelper: any = null;

	// Tracks if keyboard navigation is locked to a specific container (e.g., when a menu is open)
	private keyboardNavigationLockedToContainer: string | null = null;

	// Public method to check if navigation is locked
	public isKeyboardNavigationLocked(): boolean {
		return this.keyboardNavigationLockedToContainer !== null;
	}

	// Expose lock state via window for cross-module access (e.g., VulcanUtils)
	public initKeyboardNavLockProvider() {
		(window as any).__venusKeyboardNavLockProvider = {
			isLocked: () => this.keyboardNavigationLockedToContainer !== null
		};
	}

	// Called by Blazor
	public addKeyboardNavEventListener(elementId: string, dotnetHelper: any = null) {
		const element = document.getElementById(elementId);
		if(!element){
			return;
		}
		
		if(dotnetHelper) {
			this.keyboardNavDotnetHelper = dotnetHelper;
		}
		
		// Check if this specific element already has the listener attached
		if(!this.keyboardNavEventListenersAttached.has(elementId)) {
			element.addEventListener('keydown', this.keyboardNavKeyDownHandlerBound);
			this.keyboardNavEventListenersAttached.add(elementId);
		}
		
		this.updateKeyboardSelectableElements();
	}

	// Called by Blazor
	public updateKeyboardSelectableElements(containerId?: string, forceUnlock: boolean = false) {
		// If forceUnlock is true, unlock keyboard navigation
		if(forceUnlock) {
			this.keyboardNavigationLockedToContainer = null;
		}

		// If a container ID is provided, lock to that container
		if(containerId) {
			this.keyboardNavigationLockedToContainer = containerId;
		}

		// Use the provided container ID, or the locked container, or the whole document
		const effectiveContainerId = containerId || this.keyboardNavigationLockedToContainer;
		const container = effectiveContainerId ? document.getElementById(effectiveContainerId) : document;
		if(!container) {
			this.keyboardSelectableElements = [];
			this.keyboardSelectableGroups = [];
			return;
		}
		let selectableElements = Array.from(container.querySelectorAll('[keyboard-selectable]')) as HTMLElement[];
		let selectableGroups = Array.from(container.querySelectorAll('[keyboard-selectable-group]')) as HTMLElement[];

		// Check if there's an exclusion provider (e.g., VulcanUtils for mentions/links)
		const exclusionProvider = (window as any).__venusKeyboardNavExclusionProvider;
		if (exclusionProvider?.isSearchActive?.()) {
			const excludedSelectors = exclusionProvider.getExcludedContainerSelectors?.() || [];
			if (excludedSelectors.length > 0) {
				const excludedContainers: HTMLElement[] = [];
				for (const selector of excludedSelectors) {
					const excludedContainer = document.querySelector(selector) as HTMLElement;
					if (excludedContainer) {
						excludedContainers.push(excludedContainer);
					}
				}
				if (excludedContainers.length > 0) {
					selectableElements = selectableElements.filter(el =>
						!excludedContainers.some(ec => ec.contains(el))
					);
					selectableGroups = selectableGroups.filter(el =>
						!excludedContainers.some(ec => ec.contains(el))
					);
				}
			}
		}

		this.keyboardSelectableElements = selectableElements;
		this.keyboardSelectableGroups = selectableGroups;
	}

	private keyboardNavKeyDownHandler(event: KeyboardEvent) {
		if(this.keyboardSelectableElements.length === 0) return;

		if(event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
			this.handleArrowDownKeyPressed(event);
		} else if(event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
			this.handleArrowUpKeyPressed(event);
		} else if(event.key === 'ArrowRight' && this.isHorizontalKeyboardNavEnabled()) {
			this.handleArrowDownKeyPressed(event);
		} else if(event.key === 'ArrowLeft' && this.isHorizontalKeyboardNavEnabled()) {
			this.handleArrowUpKeyPressed(event);
		} else if(event.key === 'Enter') {
			// Ctrl/Cmd+Enter is reserved as a primary-action shortcut for the host (e.g.
			// ThoughtSelector's bottom "Link N selected" button). Don't consume it here so
			// the input's keydown handler in Blazor can route it through OnEnterPressedAsync.
			if(event.ctrlKey || event.metaKey) {
				return;
			}
			this.selectCurrentElement(event);
		} else if(event.key === 'Tab') {
			this.handleTabKeyPressed(event);
		} else if(event.key === 'PageUp') {
			this.handlePageUpKeyPressed(event);
		} else if(event.key === 'PageDown') {
			this.handlePageDownKeyPressed(event);
		}
	}
	
	// Left/Right arrow navigation is opt-in for containers holding a horizontal row of buttons
	// (e.g. an alert dialog's button row) so that scopes containing text inputs keep native caret
	// movement. The keyboard-selectable-button-row attribute also restyles the selection highlight
	// for buttons, so only use it on button rows.
	private isHorizontalKeyboardNavEnabled(): boolean {
		const id = this.keyboardNavigationLockedToContainer;
		if(!id) {
			return false;
		}
		const container = document.getElementById(id);
		return container?.hasAttribute('keyboard-selectable-button-row') ?? false;
	}

	private handleArrowDownKeyPressed(event: KeyboardEvent) {
		if(event.shiftKey) {
			this.selectFirstElementInGroup(this.currentKeyboardGroupIndex + 1);
			event.preventDefault();
		} else {
			this.selectNextElement(event);
		}
	}
	
	private handleArrowUpKeyPressed(event: KeyboardEvent) {
		if(event.shiftKey) {
			this.selectFirstElementInGroup(this.currentKeyboardGroupIndex - 1);
			event.preventDefault();
		} else {
			this.selectPreviousElement(event);
		}
	}
	
	private lastKeyboardSelectionTime: number = 0;

	private selectCurrentElement(event: KeyboardEvent) {
		if(this.currentKeyboardElementIndex >= 0 && this.currentKeyboardElementIndex < this.keyboardSelectableElements.length) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			const element = this.keyboardSelectableElements[this.currentKeyboardElementIndex];
			// Store the timestamp of keyboard activation
			this.lastKeyboardSelectionTime = Date.now();
			element.click();
		}
	}

	// Called from Blazor to check if the last activation was via keyboard
	// Returns true if keyboard was used within the last 100ms
	public wasKeyboardSelectionJustMade(): boolean {
		if(!this.lastKeyboardSelectionTime) return false;
		return (Date.now() - this.lastKeyboardSelectionTime) < 100;
	}
	
	private handleTabKeyPressed(event: KeyboardEvent) {
		if(event.shiftKey) {
			if(this.keyboardNavDotnetHelper) {
				safeInvoke(this.keyboardNavDotnetHelper, "OnShiftTabKeyPressedAsync");
				event.preventDefault();
			}
		} else {
			if(this.keyboardNavDotnetHelper) {
				safeInvoke(this.keyboardNavDotnetHelper, "OnTabKeyPressedAsync");
				event.preventDefault();
			}
		}
	}

	private handlePageUpKeyPressed(event: KeyboardEvent) {
		if(event.shiftKey) {
			if(this.currentKeyboardGroupIndex >= 0 && this.currentKeyboardGroupIndex < this.keyboardSelectableGroups.length) {
				this.selectFirstElementInGroup(this.currentKeyboardGroupIndex);
				event.preventDefault();
			}
		} else {
			// Normal PageUp behavior
			if(this.currentKeyboardGroupIndex < 0 || this.currentKeyboardGroupIndex >= this.keyboardSelectableGroups.length) return;

			const groupContainer = this.keyboardSelectableGroups[this.currentKeyboardGroupIndex];
			const scrollableContainer = this.getScrollableParentElement(groupContainer);
			if(!scrollableContainer) return;

			const groupElements = Array.from(groupContainer.querySelectorAll('[keyboard-selectable]')) as HTMLElement[];
			if(groupElements.length === 0) return;

			const containerHeight = scrollableContainer.clientHeight;
			const oldScrollTop = scrollableContainer.scrollTop;

			// Attempt to scroll up by one page
			scrollableContainer.scrollTop = Math.max(scrollableContainer.scrollTop - containerHeight, 0);

			const newScrollTop = scrollableContainer.scrollTop;

			// If the scroll did not move, we are at the top.
			// In that case, select the first element in the group.
			if(newScrollTop === oldScrollTop) {
				this.selectFirstElementInGroup(this.currentKeyboardGroupIndex);
			} else {
				this.selectVisibleElementInContainer(scrollableContainer, groupElements, 'up');
			}

			event.preventDefault();
		}
	}

	private handlePageDownKeyPressed(event: KeyboardEvent) {
		if(event.shiftKey) {
			if(this.currentKeyboardGroupIndex >= 0 && this.currentKeyboardGroupIndex < this.keyboardSelectableGroups.length) {
				this.selectLastElementInGroup(this.currentKeyboardGroupIndex);
				event.preventDefault();
			}
		} else {
			// Normal PageDown behavior
			if(this.currentKeyboardGroupIndex < 0 || this.currentKeyboardGroupIndex >= this.keyboardSelectableGroups.length) return;

			const groupContainer = this.keyboardSelectableGroups[this.currentKeyboardGroupIndex];
			const scrollableContainer = this.getScrollableParentElement(groupContainer);
			if(!scrollableContainer) return;

			const groupElements = Array.from(groupContainer.querySelectorAll('[keyboard-selectable]')) as HTMLElement[];
			if(groupElements.length === 0) return;

			const containerHeight = scrollableContainer.clientHeight;
			const oldScrollTop = scrollableContainer.scrollTop;

			// Attempt to scroll down by one page
			scrollableContainer.scrollTop = Math.min(
				scrollableContainer.scrollTop + containerHeight,
				scrollableContainer.scrollHeight - containerHeight
			);

			const newScrollTop = scrollableContainer.scrollTop;

			// If the scroll did not move, we are at the bottom.
			// In that case, select the last element in the group.
			if(newScrollTop === oldScrollTop) {
				this.selectLastElementInGroup(this.currentKeyboardGroupIndex);
			} else {
				// Otherwise, select the first visible element in the container
				this.selectVisibleElementInContainer(scrollableContainer, groupElements, 'down');
			}

			event.preventDefault();
		}
	}
	
	// Strip the keyboard-selected class from every DOM node that currently has it within
	// the active container (or whole document when unlocked). Querying the DOM rather than
	// iterating the cached keyboardSelectableElements snapshot prevents stragglers when the
	// cache drifts from the live DOM (e.g. a Razor re-render swapped which element holds
	// the class before updateKeyboardSelectableElements ran). The cached array misses such
	// elements and a forEach over it leaves multiple highlights showing at once.
	private clearKeyboardSelectedClassFromDom() {
		const root = this.keyboardNavigationLockedToContainer
			? document.getElementById(this.keyboardNavigationLockedToContainer)
			: document;
		if(!root) return;
		root.querySelectorAll('.keyboard-selected').forEach(e => e.classList.remove('keyboard-selected'));
	}

	private selectNextElement(event: KeyboardEvent) {
		this.clearKeyboardSelectedClassFromDom();

		this.currentKeyboardElementIndex++;
		if(this.currentKeyboardElementIndex >= this.keyboardSelectableElements.length) {
			this.currentKeyboardElementIndex = 0;
		}

		// Check if the currently selected element is inside a container that has a keyboard-selectable-group attribute
		this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));

		this.keyboardSelectableElements[this.currentKeyboardElementIndex].classList.add('keyboard-selected');
		this.keyboardSelectableElements[this.currentKeyboardElementIndex].scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});

		event.preventDefault();
	}

	private selectPreviousElement(event: KeyboardEvent){
		this.clearKeyboardSelectedClassFromDom();

		this.currentKeyboardElementIndex--;
		if(this.currentKeyboardElementIndex < 0) {
			this.currentKeyboardElementIndex = this.keyboardSelectableElements.length - 1;
		}

		// Check if the currently selected element is inside a container that has a keyboard-selectable-group attribute
		this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));

		this.keyboardSelectableElements[this.currentKeyboardElementIndex].classList.add('keyboard-selected');
		this.keyboardSelectableElements[this.currentKeyboardElementIndex].scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
		event.preventDefault();
	}

	// Called from Blazor
	public focusKeyboardSelectableElementByIndex(index: number, callerContainerId?: string) {
		if(index >= 0 && index < this.keyboardSelectableElements.length) {
			this.clearKeyboardSelectedClassFromDom();

			this.currentKeyboardElementIndex = index;
			this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));

			const element = this.keyboardSelectableElements[this.currentKeyboardElementIndex];
			element.classList.add('keyboard-selected');
			if(!callerContainerId || document.getElementById(callerContainerId)?.contains(element)) {
				element.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
			}
		}
	}

	// Called from Blazor
	public focusKeyboardSelectableElementById(id: string) {
		const element = this.keyboardSelectableElements.find(e => e.getAttribute('keyboard-selectable-id') === id);
		if(!element){
			// Target is gone (e.g. the create-thought button is hidden). Still clear any
			// stale highlight so callers don't leave the previous selection visually stuck.
			this.clearKeyboardSelectedClassFromDom();
			this.currentKeyboardElementIndex = -1;
			this.currentKeyboardGroupIndex = -1;
			return;
		}

		this.clearKeyboardSelectedClassFromDom();

		this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(element);
		this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));

		element.classList.add('keyboard-selected');
		element.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
	}

	// Called from blazor
	public selectFirstElementInGroup(groupIndex: number, callerContainerId?: string) {
		if(groupIndex >= 0 && groupIndex < this.keyboardSelectableGroups.length) {
			const elements = Array.from(this.keyboardSelectableGroups[groupIndex].querySelectorAll('[keyboard-selectable]')) as HTMLElement[];
			if(elements.length > 0) {
				this.clearKeyboardSelectedClassFromDom();
				this.currentKeyboardGroupIndex = groupIndex;
				this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(elements[0]);
				elements[0].classList.add('keyboard-selected');
				if(!callerContainerId || document.getElementById(callerContainerId)?.contains(elements[0])) {
					elements[0].scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
				}
			}
		}
	}

	private selectLastElementInGroup(groupIndex: number) {
		if(groupIndex >= 0 && groupIndex < this.keyboardSelectableGroups.length) {
			const elements = Array.from(this.keyboardSelectableGroups[groupIndex].querySelectorAll('[keyboard-selectable]')) as HTMLElement[];
			if(elements.length > 0) {
				this.clearKeyboardSelectedClassFromDom();
				this.currentKeyboardGroupIndex = groupIndex;
				this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(elements[elements.length - 1]);
				elements[elements.length - 1].classList.add('keyboard-selected');
				elements[elements.length - 1].scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
			}
		}
	}

	// Called from Blazor
	public reselectCurrentKeyboardSelectableElement(scrollIntoView: boolean) {
		this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(e => e.contains(this.keyboardSelectableElements[this.currentKeyboardElementIndex]));

		this.clearKeyboardSelectedClassFromDom();
		this.keyboardSelectableElements[this.currentKeyboardElementIndex].classList.add('keyboard-selected');
		if(scrollIntoView) {
			this.keyboardSelectableElements[this.currentKeyboardElementIndex].scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
		}
	}

	// Called from Blazor
	public resetKeyboardSelectableElements() {
		this.currentKeyboardElementIndex = -1;
		this.currentKeyboardGroupIndex = -1;
		this.clearKeyboardSelectedClassFromDom();
	}
	
	// Called from Blazor to check if there's a current keyboard selection
	public hasKeyboardSelection(): boolean {
		return this.currentKeyboardElementIndex >= 0 && 
		       this.currentKeyboardElementIndex < this.keyboardSelectableElements.length;
	}
	
	// Called from Blazor to get current keyboard selection index
	public getCurrentKeyboardSelectionIndex(): number {
		return this.currentKeyboardElementIndex;
	}

	// Called from Blazor to click the currently selected keyboard element
	public clickCurrentKeyboardSelectableElement() {
		if (this.currentKeyboardElementIndex >= 0 && this.currentKeyboardElementIndex < this.keyboardSelectableElements.length) {
			const element = this.keyboardSelectableElements[this.currentKeyboardElementIndex];
			this.lastKeyboardSelectionTime = Date.now();
			element.click();
		}
	}

	public registerTrueClickHandler(elementId: string, callbackMethod: string, dotNetHelper: any) {
		const element = document.getElementById(elementId);

		if(!element) {
			console.error(`Element with id '${elementId}' not found for true click handler.`);
			return;
		}

		element.addEventListener('pointerdown', (event: PointerEvent) => {
			// Only handle left clicks (button 0) to avoid conflicts with other mouse buttons
			if(event.button !== 0) {
				return;
			}
			// Check if the click is on the container or its direct children that aren't dialog content
			const clickedOnBackground = event.target === element ||
				(event.target instanceof Element &&
				 event.target.parentElement === element &&
				 !event.target.closest('[id$="Dialog"]'));
			element.dataset.pointerDownOnContainer = clickedOnBackground.toString();
		});

		element.addEventListener('pointerup', (event: PointerEvent) => {
			// Only handle left clicks (button 0) to avoid conflicts with other mouse buttons
			if(event.button !== 0) {
				return;
			}
			const startedOnContainer = element.dataset.pointerDownOnContainer === "true";
			// Reset the flag for future interactions.
			element.dataset.pointerDownOnContainer = "false";
			if(startedOnContainer) {
				// Check if the release is also on background (container or its direct non-dialog children)
				const releasedOnBackground = event.target === element ||
					(event.target instanceof Element &&
					 event.target.parentElement === element &&
					 !event.target.closest('[id$="Dialog"]'));
				if(releasedOnBackground) {
					safeInvoke(dotNetHelper, callbackMethod);
				}
			}
		});
	}

	public registerHoverHandler(elementId: string, callbackMethod: string, dotNetHelper: any) {
		const element = document.getElementById(elementId);

		if(!element) {
			console.error(`Element with id '${elementId}' not found for hover handler.`);
			return;
		}

		element.addEventListener('pointermove', (event: PointerEvent) => {
			// Check if the hover is on the container or its direct children that aren't dialog content
			const hoveredOnBackground = event.target === element ||
				(event.target instanceof Element &&
				 event.target.parentElement === element &&
				 !event.target.closest('[id$="Dialog"]'));

			if(hoveredOnBackground) {
				// Find the dialog element within the container - it's the direct child with the dialog-base class
				// Using :scope to ensure we only get direct descendants
				const dialogElement = element.querySelector(':scope > div > .dialog-base') as HTMLElement;
				if(dialogElement) {
					// Don't dismiss while the dialog is being dragged
					if(dialogElement.dataset.isDragging === "true") {
						return;
					}

					const rect = dialogElement.getBoundingClientRect();
					const bufferZone = 20;

					// Check if pointer is at least 20 pixels away from dialog edges
					const farFromLeft = event.clientX < rect.left - bufferZone;
					const farFromRight = event.clientX > rect.right + bufferZone;
					const farFromTop = event.clientY < rect.top - bufferZone;
					const farFromBottom = event.clientY > rect.bottom + bufferZone;

					if(farFromLeft || farFromRight || farFromTop || farFromBottom) {
						safeInvoke(dotNetHelper, callbackMethod);
					}
				}
			}
		});
	}
	
	public setBaseFontSize(fontSize: number) {
		document.documentElement.style.fontSize = `${fontSize}px`;
	}

	/**
	 * Finds the nearest scrollable parent element above the given element.
	 * We'll climb up the DOM tree until we find an element that has a scrollable overflow.
	 */
	private getScrollableParentElement(el: HTMLElement | null): HTMLElement | null {
		while(el && el !== document.body && el !== document.documentElement) {
			const overflowY = window.getComputedStyle(el).overflowY;
			if(overflowY === 'auto' || overflowY === 'scroll') {
				// Check if it's actually scrollable
				if(el.scrollHeight > el.clientHeight) {
					return el;
				}
			}
			el = el.parentElement;
		}
		return null;
	}

	/**
	 * Selects the first visible keyboard-selectable element in the given scrollable container after scrolling.
	 * "Visible" means the element appears within the container's current scroll region.
	 *
	 * @param scrollableContainer The scrollable container that we are paging in.
	 * @param groupElements The array of keyboard-selectable elements within this group.
	 * @param direction The direction of scrolling ('up' or 'down'), used if we need fallback logic.
	 */
	private selectVisibleElementInContainer(scrollableContainer: HTMLElement, groupElements: HTMLElement[], direction: 'up' | 'down') {
		const containerRect = scrollableContainer.getBoundingClientRect();

		// Clear any previous selection
		this.clearKeyboardSelectedClassFromDom();

		let chosenIndexInGroup = -1;
		let chosenElementTop = Infinity;

		// First pass: Look for an element whose top is at or below container's top boundary (elRelativeTop >= 0)
		for(let i = 0; i < groupElements.length; i++) {
			const el = groupElements[i];
			const elRect = el.getBoundingClientRect();
			const elRelativeTop = elRect.top - containerRect.top;
			const elRelativeBottom = elRect.bottom - containerRect.top;

			// Element is visible if it intersects the container vertically
			const isVisible = elRelativeBottom > 0 && elRelativeTop < containerRect.height;

			if(isVisible && elRelativeTop >= 0 && elRelativeTop < chosenElementTop) {
				chosenElementTop = elRelativeTop;
				chosenIndexInGroup = i;
			}
		}

		// If we didn't find any element that starts at or below the container top:
		// Do a second pass and pick the topmost visible element, even if partially above.
		if(chosenIndexInGroup === -1) {
			chosenElementTop = Infinity;
			for(let i = 0; i < groupElements.length; i++) {
				const el = groupElements[i];
				const elRect = el.getBoundingClientRect();
				const elRelativeTop = elRect.top - containerRect.top;
				const elRelativeBottom = elRelativeTop + elRect.height;

				const isVisible = elRelativeBottom > 0 && elRelativeTop < containerRect.height;
				if(isVisible && elRelativeTop < chosenElementTop) {
					chosenElementTop = elRelativeTop;
					chosenIndexInGroup = i;
				}
			}
		}

		// If still no visible element found (should be rare), fallback depending on direction
		if(chosenIndexInGroup === -1) {
			chosenIndexInGroup = (direction === 'down') ? groupElements.length - 1 : 0;
		}

		const chosenElement = groupElements[chosenIndexInGroup];
		this.currentKeyboardElementIndex = this.keyboardSelectableElements.indexOf(chosenElement);
		this.currentKeyboardGroupIndex = this.keyboardSelectableGroups.findIndex(g => g.contains(chosenElement));

		chosenElement.classList.add('keyboard-selected');
		chosenElement.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
	}

	public detachKeyboardNavEventListener(elementId: string) {
		const element = document.getElementById(elementId);
		if(!element){
			return;
		}
		
		this.currentKeyboardElementIndex = -1;
		this.keyboardSelectableElements = [];
		
		if(this.keyboardNavEventListenersAttached.has(elementId)) {
			element.removeEventListener('keydown', this.keyboardNavKeyDownHandlerBound);
			this.keyboardNavEventListenersAttached.delete(elementId);
		}
	}

	public enforceExistenceDependence(parentId: string, childId: string): void {
		this.existenceDependencyManager.enforceExistenceDependence(parentId, childId);
	}

	// ── Menu keyboard navigation ──────────────────────────────────────────
	private menuKeyboardNavHandlers: Map<string, { handler: (e: KeyboardEvent) => void, menuStack: HTMLElement[] }> = new Map();

	/**
	 * Sets up keyboard navigation for a popover that contains a [role="menu"].
	 * No-op if the container has no menu. Supports multi-level submenus.
	 */
	public setupMenuKeyboardNav(containerId: string): void {
		const container = document.getElementById(containerId);
		if(!container) return;

		const topMenu = container.querySelector('[role="menu"]') as HTMLElement;
		if(!topMenu) return;

		// Clean up any previous handler
		this.cleanupMenuKeyboardNav(containerId);

		const menuStack: HTMLElement[] = [topMenu];

		const getActiveMenu = (): HTMLElement => menuStack[menuStack.length - 1];

		// Get menuitem elements belonging directly to a given menu (not nested submenus)
		const getMenuItems = (menuEl: HTMLElement): HTMLElement[] => {
			const items: HTMLElement[] = [];
			menuEl.querySelectorAll('[role="menuitem"]').forEach(el => {
				if(el.closest('[role="menu"]') !== menuEl) return;
				const parent = el.parentElement;
				if(parent?.classList.contains('pointer-events-none')) return;
				if((el as HTMLElement).offsetParent === null) return;
				items.push(el as HTMLElement);
			});
			return items;
		};

		const getFocusedItem = (menuEl: HTMLElement): HTMLElement | null => {
			return menuEl.querySelector('[role="menuitem"].menu-keyboard-focused') as HTMLElement;
		};

		const clearFocus = (menuEl: HTMLElement): void => {
			menuEl.querySelectorAll('.menu-keyboard-focused').forEach(el => el.classList.remove('menu-keyboard-focused'));
		};

		const focusItem = (item: HTMLElement): void => {
			// Clear all focus in the entire container
			container.querySelectorAll('.menu-keyboard-focused').forEach(el => el.classList.remove('menu-keyboard-focused'));
			item.classList.add('menu-keyboard-focused');
			item.scrollIntoView({ block: "nearest", behavior: "instant" });
		};

		const isSubmenuItem = (item: HTMLElement): boolean => {
			return item.querySelector('.fa-chevron-right, .fa-chevron-down') !== null;
		};

		const openSubmenu = (item: HTMLElement): void => {
			// Click the parent wrapper to trigger Blazor's ClickedSubMenuTitle
			const wrapper = item.parentElement;
			if(wrapper) wrapper.click();

			// After Blazor re-renders, find the new submenu and navigate into it
			requestAnimationFrame(() => {
				setTimeout(() => {
					// Find the submenu container that appeared near this item
					const wrapper = item.parentElement;
					if(!wrapper) return;

					// Non-accordion: look for .submenu-container sibling
					const parentMenu = item.closest('[role="menu"]');
					if(!parentMenu) return;

					// Find the submenu-container that is now visible
					const subContainers = parentMenu.querySelectorAll('.submenu-container [role="menu"], .submenu-container[role="menu"]');
					let subMenu: HTMLElement | null = null;
					subContainers.forEach(el => {
						if((el as HTMLElement).offsetParent !== null) {
							subMenu = el as HTMLElement;
						}
					});

					// Accordion: look for sibling div containing [role="menu"]
					if(!subMenu) {
						const nextEl = wrapper.nextElementSibling;
						if(nextEl) {
							subMenu = nextEl.querySelector('[role="menu"]') as HTMLElement;
						}
					}

					if(subMenu) {
						menuStack.push(subMenu);
						const items = getMenuItems(subMenu);
						if(items.length > 0) {
							focusItem(items[0]);
						}
					}
				}, 50);
			});
		};

		const closeSubmenu = (): boolean => {
			if(menuStack.length <= 1) return false;

			const closingMenu = menuStack.pop()!;
			clearFocus(closingMenu);

			// Click the parent submenu title again to close it (toggle)
			const parentMenu = getActiveMenu();
			const focusedParent = getFocusedItem(parentMenu);
			if(focusedParent) {
				const wrapper = focusedParent.parentElement;
				if(wrapper) wrapper.click();

				// Re-focus the parent item after Blazor re-renders
				requestAnimationFrame(() => {
					setTimeout(() => {
						// The old element may have been replaced, find it again
						const items = getMenuItems(getActiveMenu());
						const refocused = items.find(i => i.classList.contains('menu-keyboard-focused'));
						if(refocused) {
							refocused.scrollIntoView({ block: "nearest", behavior: "instant" });
						}
					}, 50);
				});
			}
			return true;
		};

		const handler = (event: KeyboardEvent): void => {
			const activeMenu = getActiveMenu();
			const items = getMenuItems(activeMenu);
			if(items.length === 0) return;

			const currentItem = getFocusedItem(activeMenu);
			const currentIndex = currentItem ? items.indexOf(currentItem) : -1;

			if(event.key === 'ArrowDown') {
				event.preventDefault();
				event.stopPropagation();
				if(currentIndex < 0) {
					focusItem(items[0]);
				} else {
					focusItem(items[(currentIndex + 1) % items.length]);
				}
			} else if(event.key === 'ArrowUp') {
				event.preventDefault();
				event.stopPropagation();
				if(currentIndex < 0) {
					focusItem(items[items.length - 1]);
				} else {
					focusItem(items[(currentIndex - 1 + items.length) % items.length]);
				}
			} else if(event.key === 'Enter' || (event.key === ' ' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement))) {
				event.preventDefault();
				event.stopPropagation();
				if(currentItem) {
					if(isSubmenuItem(currentItem)) {
						openSubmenu(currentItem);
					} else {
						// Click the parent wrapper (has the Blazor @onclick)
						const wrapper = currentItem.parentElement;
						if(wrapper) wrapper.click();
					}
				}
			} else if(event.key === 'ArrowRight') {
				if(currentItem && isSubmenuItem(currentItem)) {
					event.preventDefault();
					event.stopPropagation();
					openSubmenu(currentItem);
				}
			} else if(event.key === 'ArrowLeft') {
				if(menuStack.length > 1) {
					event.preventDefault();
					event.stopPropagation();
					closeSubmenu();
				}
			} else if(event.key === 'Escape') {
				if(menuStack.length > 1) {
					event.preventDefault();
					event.stopPropagation();
					closeSubmenu();
				}
				// If at top level, let Escape propagate to Popover's handler
			}
		};

		// Listen on the container (the fixed popover div) so it works regardless of focus
		container.addEventListener('keydown', handler);
		// Focus the menu so it receives keyboard events
		topMenu.setAttribute('tabindex', '0');
		topMenu.focus();

		this.menuKeyboardNavHandlers.set(containerId, { handler, menuStack });
	}

	public cleanupMenuKeyboardNav(containerId: string): void {
		const existing = this.menuKeyboardNavHandlers.get(containerId);
		if(existing) {
			const container = document.getElementById(containerId);
			if(container) {
				container.removeEventListener('keydown', existing.handler);
			}
			// Restore focus to the keyboard-selectable-group that has an active selection
			const selectedGroup = document.querySelector('[keyboard-selectable-group]:has(.keyboard-selected)') as HTMLElement;
			if(selectedGroup) {
				selectedGroup.focus();
			}
			this.menuKeyboardNavHandlers.delete(containerId);
		}
	}

	public playVideoFullscreenOnStart(videoId: string) {
		const videoElement: any = document.getElementById(videoId);
		if(!videoElement) return;

		videoElement.addEventListener('play', () => {
			// When the video starts playing, request fullscreen. This is only needed on Android in theory as iOS should default to fullscreen. 
			if(videoElement.requestFullscreen) {
				videoElement.requestFullscreen();
			} else if(videoElement.webkitRequestFullscreen) {
				videoElement.webkitRequestFullscreen();
			}
		});
	}

	///////////////////////////////////////////////////////////////////////////////////
	// Cursor Tracking out of browser window (called by dropdrop.webview2.polyfill.js)
	///////////////////////////////////////////////////////////////////////////////////
	
	private venusProbeDotNetRef: any = null;

	registerVenusProbeDotNetHandler(dotNetReference: any): void {
		this.venusProbeDotNetRef = dotNetReference;
	}

	requestCursorTracking(): void {
		// Ask the C# side to start tracking the cursor so we can overcome the browser's inability to track cursor position outside the browser window
		// The C# side 
		if(this.venusProbeDotNetRef) {
			safeInvoke(this.venusProbeDotNetRef, 'RequestCursorTracking');
		}
	}

	releaseCursorTracking(): void {
		// Ask the C# side to stop tracking the cursor
		if(this.venusProbeDotNetRef) {
			safeInvoke(this.venusProbeDotNetRef, 'ReleaseCursorTracking');
		}
	}

	// Called from Blazor to update cursor position during drag
	// Note: x and y are SCREEN coordinates from ElectronCursorTracker, but MouseEvent needs CLIENT coordinates
	cursorMoved(screenX: number, screenY: number) {
		// Convert screen coordinates to client coordinates (relative to viewport)
		// window.screenX/screenY gives the window's position on screen
		const clientX = screenX - (window.screenX || window.screenLeft || 0);
		const clientY = screenY - (window.screenY || window.screenTop || 0);

		// Create a mock mousemove event and dispatch it to the document
		const mouseMoveEvent = new MouseEvent('mousemove', {
			clientX: clientX,
			clientY: clientY,
			screenX: screenX,
			screenY: screenY,
			bubbles: true,
			cancelable: true
		});
		document.dispatchEvent(mouseMoveEvent);
	}
	
	///////////////////////////////////////////////////////////////////////////////////
	// Tab Drag and Drop
	///////////////////////////////////////////////////////////////////////////////////

	// State for each tab bar
	private tabBarStates = new Map<string, {
		element: HTMLElement;
		dotNetRef: any;
		draggedTabId: string | null;
		draggedTab: HTMLElement | null;
		ghostElement: HTMLElement | null;
		isDragging: boolean;
		isOverTabBar: boolean | null;
		startingX: number;
		startingY: number;
		tabMidPoints: Map<string, number>;
		isVertical: boolean;
		// Mouse-based drag state
		mouseDownTarget: HTMLElement | null;
		hasDragStarted: boolean;
		// Unique ID of the component instance that created this state
		instanceId: string | null;
	}>();

	private currentDragTabBarId: string | null = null;

	// Bound event handlers for proper removal
	private boundMouseMove: ((e: MouseEvent) => void) | null = null;
	private boundMouseUp: ((e: MouseEvent) => void) | null = null;

	// Minimum distance before drag starts (to distinguish from clicks)
	private readonly MIN_DRAG_DISTANCE = 5;

	initTabDragDrop(tabBarId: string, instanceId?: string): void {
		const tabBarElement = document.getElementById(tabBarId);
		if (!tabBarElement) return;

		// Clean up any existing listeners for this specific tab bar
		this.cleanupTabDragDrop(tabBarId);

		// Determine if this is a vertical tab bar
		const isVertical = tabBarId.includes('vertical');

		// Create state for this tab bar
		const state = {
			element: tabBarElement,
			dotNetRef: null as any,
			draggedTabId: null as string | null,
			draggedTab: null as HTMLElement | null,
			ghostElement: null as HTMLElement | null,
			isDragging: false,
			isOverTabBar: null as boolean | null,
			startingX: 0,
			startingY: 0,
			tabMidPoints: new Map<string, number>(),
			isVertical: isVertical,
			mouseDownTarget: null as HTMLElement | null,
			hasDragStarted: false,
			instanceId: instanceId || null
		};

		this.tabBarStates.set(tabBarId, state);

		// Use mousedown on tab bar to initiate drag
		tabBarElement.addEventListener('mousedown', this.handleTabMouseDown.bind(this));

		// Mark the container as initialized
		tabBarElement.dataset.dragdropInitialized = 'true';
		tabBarElement.dataset.tabBarId = tabBarId;
		tabBarElement.dataset.isVertical = isVertical.toString();
	}

	cleanupTabDragDrop(tabBarId?: string, instanceId?: string): void {
		if (tabBarId) {
			// Clean up specific tab bar
			const state = this.tabBarStates.get(tabBarId);
			if (!state || state.element.dataset.dragdropInitialized !== 'true') return;

			// If instanceId is provided, only clean up if it matches the state that created
			// this entry. This prevents a deferred cleanup from an old disposed component
			// from destroying drag-drop state that was freshly initialized by a new component.
			if (instanceId && state.instanceId && state.instanceId !== instanceId) return;

			// Remove tab bar listeners
			state.element.removeEventListener('mousedown', this.handleTabMouseDown.bind(this));

			// Clean up any active drag
			this.cleanupMouseDrag();

			// Remove from state map
			this.tabBarStates.delete(tabBarId);

			delete state.element.dataset.dragdropInitialized;
		} else {
			// Clean up all tab bars (legacy method signature)
			for (const [id, state] of this.tabBarStates) {
				this.cleanupTabDragDrop(id);
			}
		}
	}

	// Clean up document-level mouse listeners
	private cleanupMouseDrag(): void {
		if (this.boundMouseMove) {
			document.removeEventListener('mousemove', this.boundMouseMove);
			this.boundMouseMove = null;
		}
		if (this.boundMouseUp) {
			document.removeEventListener('mouseup', this.boundMouseUp);
			this.boundMouseUp = null;
		}
	}

	// Helper to get current drag state
	private getCurrentDragState() {
		if (!this.currentDragTabBarId) return null;
		return this.tabBarStates.get(this.currentDragTabBarId) || null;
	}

	// Helper to find which tab bar contains an element
	private findTabBarForElement(element: HTMLElement): string | null {
		for (const [tabBarId, state] of this.tabBarStates) {
			if (state.element.contains(element)) {
				return tabBarId;
			}
		}
		return null;
	}

	// Handle mousedown on a tab to start potential drag
	private handleTabMouseDown(event: MouseEvent): void {
		// Only handle left mouse button
		if (event.button !== 0) return;

		const tabElement = this.findTabElementFromEvent(event);
		if (!tabElement) return;

		// Don't start drag if clicking on close button
		const target = event.target as HTMLElement;
		if (target.closest('.fa-close') || target.closest('[class*="close"]')) {
			return;
		}

		// Find which tab bar this belongs to
		const tabBarId = this.findTabBarForElement(tabElement);
		if (!tabBarId) return;

		const state = this.tabBarStates.get(tabBarId);
		if (!state) return;

		// Store initial state - don't start drag yet, wait for mouse move
		state.mouseDownTarget = tabElement;
		state.startingX = event.clientX;
		state.startingY = event.clientY;
		state.hasDragStarted = false;
		this.currentDragTabBarId = tabBarId;

		// Add document-level listeners for move and up
		this.boundMouseMove = this.handleTabMouseMove.bind(this);
		this.boundMouseUp = this.handleTabMouseUp.bind(this);
		document.addEventListener('mousemove', this.boundMouseMove);
		document.addEventListener('mouseup', this.boundMouseUp);

		// Prevent text selection during drag
		event.preventDefault();
	}

	// Handle mouse move during potential/active drag
	private handleTabMouseMove(event: MouseEvent): void {
		const state = this.getCurrentDragState();
		if (!state || !state.mouseDownTarget) return;

		const deltaX = event.clientX - state.startingX;
		const deltaY = event.clientY - state.startingY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// Start actual drag if we've moved far enough
		if (!state.hasDragStarted) {
			if (distance < this.MIN_DRAG_DISTANCE) {
				return; // Not enough movement yet
			}
			// Start the drag
			this.startTabDrag(state, event);
		}

		// Update drag
		this.updateTabDrag(state, event);
	}

	// Handle mouse up to end drag or trigger click
	private handleTabMouseUp(event: MouseEvent): void {
		const state = this.getCurrentDragState();

		// Clean up document listeners
		this.cleanupMouseDrag();

		if (!state) return;

		if (state.hasDragStarted) {
			// End the drag
			this.endTabDrag(state, event);
		}

		// Reset mouse down state
		state.mouseDownTarget = null;
		state.hasDragStarted = false;
	}

	// Start the actual tab drag operation
	private startTabDrag(state: any, event: MouseEvent): void {
		const tabElement = state.mouseDownTarget;
		if (!tabElement) return;

		const tabId = this.getTabId(tabElement);
		if (!tabId) return;

		state.hasDragStarted = true;
		state.draggedTabId = tabId;
		state.draggedTab = tabElement;
		state.isDragging = true;
		state.isOverTabBar = true;

		// Calculate midpoints of all tabs
		state.tabMidPoints.clear();
		const tabs = state.element.querySelectorAll('.tab-item');
		tabs.forEach((t: Element) => {
			const tab = t as HTMLElement;
			const rect = tab.getBoundingClientRect();
			if (state.isVertical) {
				state.tabMidPoints.set(tab.id, rect.top + rect.height / 2);
			} else {
				state.tabMidPoints.set(tab.id, rect.left + rect.width / 2);
			}
			tab.style.transitionDuration = '200ms';
		});

		// Mark as drag source (makes original invisible via CSS)
		tabElement.classList.add('is-drag-source');
		tabElement.classList.add('dragging');
		tabElement.style.transitionDuration = '0s';

		// Create ghost element
		this.createTabGhost(state, tabElement);

		// Prevent text selection
		document.body.classList.add('select-none');

		// Notify .NET
		if (state.dotNetRef) {
			safeInvoke(state.dotNetRef, 'DragStarted', [state.draggedTabId]);
		}
	}

	// Create a ghost element for the dragged tab
	private createTabGhost(state: any, tabElement: HTMLElement): void {
		const ghost = tabElement.cloneNode(true) as HTMLElement;
		ghost.classList.remove('is-drag-source', 'dragging');
		ghost.classList.add('tab-drag-ghost');

		// Copy computed styles for accurate appearance
		const rect = tabElement.getBoundingClientRect();
		ghost.style.position = 'fixed';
		ghost.style.left = `${rect.left}px`;
		ghost.style.top = `${rect.top}px`;
		ghost.style.width = `${rect.width}px`;
		ghost.style.height = `${rect.height}px`;
		ghost.style.zIndex = '10000';
		ghost.style.pointerEvents = 'none';
		ghost.style.opacity = '0.9';
		ghost.style.transition = 'opacity 0.15s ease-out';

		document.body.appendChild(ghost);
		state.ghostElement = ghost;
	}

	// Update drag position and tab reordering preview
	private updateTabDrag(state: any, event: MouseEvent): void {
		if (!state.isDragging || !state.draggedTab || !state.ghostElement) return;

		// Update ghost position
		const rect = state.draggedTab.getBoundingClientRect();
		const deltaX = event.clientX - state.startingX;
		const deltaY = event.clientY - state.startingY;

		// Lock to appropriate axis based on tab bar orientation
		if (state.isVertical) {
			state.ghostElement.style.transform = `translateY(${deltaY}px)`;
		} else {
			state.ghostElement.style.transform = `translateX(${deltaX}px)`;
		}

		// Check if over tab bar
		this.checkIfOverTabBarMouse(state, event);

		// Process tab reordering preview
		this.processTabChangesForDrag(event);
	}

	// Check if cursor is over the tab bar (mouse-based)
	private checkIfOverTabBarMouse(state: any, event: MouseEvent): void {
		const tabBarRect = state.element.getBoundingClientRect();
		const lastIsOverTabBar = state.isOverTabBar;

		// Check if we're over the tab bar
		state.isOverTabBar = (
			event.clientX >= tabBarRect.left &&
			event.clientX <= tabBarRect.right &&
			event.clientY >= tabBarRect.top &&
			event.clientY <= tabBarRect.bottom
		);

		if (!state.isOverTabBar) {
			if (lastIsOverTabBar || lastIsOverTabBar === null) {
				// We've moved outside the tab bar
				if (state.ghostElement) {
					state.ghostElement.style.opacity = '0';
				}

				if (state.dotNetRef) {
					safeInvoke(state.dotNetRef, 'StartFloatingTab', [state.draggedTabId]);
				}
			}
		} else {
			if (!lastIsOverTabBar && lastIsOverTabBar !== null) {
				// We've moved back over the tab bar
				if (state.ghostElement) {
					state.ghostElement.style.opacity = '0.9';
				}

				if (state.dotNetRef) {
					safeInvoke(state.dotNetRef, 'StopFloatingTab', [state.draggedTabId]);
				}
			}
		}
	}

	// End the tab drag operation
	private endTabDrag(state: any, event: MouseEvent): void {
		if (!state.isDragging) return;

		// Determine if this was a drop within the tab bar
		const tabBarRect = state.element.getBoundingClientRect();
		const isOverTabBar = (
			event.clientX >= tabBarRect.left &&
			event.clientX <= tabBarRect.right &&
			event.clientY >= tabBarRect.top &&
			event.clientY <= tabBarRect.bottom
		);

		if (isOverTabBar && state.draggedTabId && state.draggedTab) {
			// Handle drop within tab bar - reorder tabs
			this.handleTabDrop(state, event);
		}

		// Clean up ghost element
		if (state.ghostElement) {
			state.ghostElement.remove();
			state.ghostElement = null;
		}

		// Remove drag source class
		if (state.draggedTab) {
			state.draggedTab.classList.remove('is-drag-source');
			state.draggedTab.style.transform = '';
		}

		// Remove dragging class and clear transforms from all tabs
		const tabs = state.element.querySelectorAll('.tab-item');
		tabs.forEach((t: Element) => {
			const tab = t as HTMLElement;
			tab.classList.remove('dragging');
			tab.style.transform = '';
			tab.style.transitionDuration = '0s';
			setTimeout(() => {
				tab.style.transitionDuration = '300ms';
			}, 150);
		});

		// Remove select-none from body
		document.body.classList.remove('select-none');

		// Notify .NET
		if (state.dotNetRef) {
			const wasDroppedOutside = !isOverTabBar;
			safeInvoke(state.dotNetRef, 'DragEnded', [state.draggedTabId, wasDroppedOutside]);
		}

		// Reset state
		state.draggedTabId = null;
		state.draggedTab = null;
		state.isDragging = false;
		this.currentDragTabBarId = null;
	}

	// Handle dropping a tab within the tab bar (reordering)
	private handleTabDrop(state: any, event: MouseEvent): void {
		if (!state.draggedTabId || !state.draggedTab) return;

		const startDraggedTabMid = state.tabMidPoints.get(state.draggedTab.id);
		if (startDraggedTabMid === undefined) return;

		const isVertical = state.isVertical;
		const offset = isVertical
			? startDraggedTabMid - state.startingY
			: startDraggedTabMid - state.startingX;
		const draggedTabMid = isVertical
			? event.clientY + offset
			: event.clientX + offset;

		// Get all tabs that are not being dragged
		const tabs = state.element.querySelectorAll('.tab-item:not(.dragging)');

		// Split into tabs before and after the dragged tab
		let beforeTabs: HTMLElement[] = [];
		let afterTabs: HTMLElement[] = [];
		const startingPos = isVertical ? state.startingY : state.startingX;

		tabs.forEach((t: Element) => {
			const tab = t as HTMLElement;
			if (tab !== state.draggedTab) {
				const midPoint = state.tabMidPoints.get(tab.id);
				if (midPoint === undefined) return;
				if (midPoint < startingPos) {
					beforeTabs.push(tab);
				} else {
					afterTabs.push(tab);
				}
			}
		});
		afterTabs = afterTabs.reverse();

		let targetTabId: string | null = null;
		let position = '';

		// Find the appropriate tab to insert before/after
		beforeTabs.forEach(tab => {
			if (targetTabId) return;
			let compPoint = state.tabMidPoints.get(tab.id);
			if (compPoint === undefined) return;
			const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
			compPoint += halfSize;
			if (draggedTabMid < compPoint) {
				targetTabId = this.getTabId(tab);
				position = 'before';
				return;
			}
		});

		afterTabs.forEach(tab => {
			if (targetTabId) return;
			let compPoint = state.tabMidPoints.get(tab.id);
			if (compPoint === undefined) return;
			const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
			compPoint -= halfSize;
			if (draggedTabMid >= compPoint) {
				targetTabId = this.getTabId(tab);
				position = 'after';
				return;
			}
		});

		// Invoke .NET method to reorder tabs
		if (targetTabId && position) {
			if (state.dotNetRef) {
				safeInvoke(state.dotNetRef, 'ReorderTabs', [state.draggedTabId, targetTabId, position]);
			}
		}
	}

	// Shared logic for moving tabs during drag (visual preview of reordering)
	private processTabChangesForDrag(event: MouseEvent): void {
		const state = this.getCurrentDragState();
		if (!state || !state.isDragging || !state.draggedTabId || !state.draggedTab) return;

		const startDraggedTabMid = state.tabMidPoints.get(state.draggedTab.id);
		if (startDraggedTabMid === undefined) return;

		const isVertical = state.isVertical;
		const offset = isVertical
			? startDraggedTabMid - state.startingY
			: startDraggedTabMid - state.startingX;
		let draggedTabMid = isVertical
			? event.clientY + offset
			: event.clientX + offset;

		if (!state.isOverTabBar) {
			// Fake that we are at the extreme end so all tabs are moved as if the tab is not there
			draggedTabMid = 999999;
		}

		// Get all the tabs that are not being dragged
		const tabs = state.element.querySelectorAll('.tab-item:not(.dragging)');

		// Split into tabs before and after the dragged tab
		const beforeTabs: HTMLElement[] = [];
		const afterTabs: HTMLElement[] = [];
		const startingPos = isVertical ? state.startingY : state.startingX;
		tabs.forEach((t: Element) => {
			const tab = t as HTMLElement;
			if (tab !== state.draggedTab) {
				const midPoint = state.tabMidPoints.get(tab.id);
				if (midPoint === undefined) return;
				if (midPoint < startingPos) {
					beforeTabs.push(tab);
				} else {
					afterTabs.push(tab);
				}
			}
		});

		let offsetDraggedTab = 0;
		const tabSize = isVertical
			? state.draggedTab!.offsetHeight + 8
			: state.draggedTab!.offsetWidth + 8;

		// Check if we are before the end of any of the before tabs
		beforeTabs.forEach(tab => {
			let compPoint = state.tabMidPoints.get(tab.id);
			if (compPoint === undefined) return;
			const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
			compPoint += halfSize;
			if (draggedTabMid < compPoint) {
				// translate this tab by the size of the dragged tab
				const transform = isVertical
					? `translateY(${tabSize}px)`
					: `translateX(${tabSize}px)`;
				tab.style.transform = transform;
				offsetDraggedTab -= isVertical ? tab.offsetHeight : tab.offsetWidth;
			} else {
				// reset transform
				tab.style.transform = '';
			}
		});

		// Check if we are after the start of any of the after tabs
		afterTabs.forEach(tab => {
			let compPoint = state.tabMidPoints.get(tab.id);
			if (compPoint === undefined) return;
			const halfSize = isVertical ? tab.offsetHeight / 2 : tab.offsetWidth / 2;
			compPoint -= halfSize;
			if (draggedTabMid >= compPoint) {
				// translate this tab by the size of the dragged tab
				const transform = isVertical
					? `translateY(-${tabSize}px)`
					: `translateX(-${tabSize}px)`;
				tab.style.transform = transform;
				offsetDraggedTab += isVertical ? tab.offsetHeight : tab.offsetWidth;
			} else {
				// reset transform
				tab.style.transform = '';
			}
		});

		// Move the dragged tab (hidden currently, but it will appear in the right place when dragging stops thanks to this transform)
		const draggedTransform = isVertical
			? `translateY(${offsetDraggedTab}px)`
			: `translateX(${offsetDraggedTab}px)`;
		state.draggedTab.style.transform = draggedTransform;
	}

	// Register .NET reference for callbacks
	registerTabDragDotNetHandler(dotNetReference: any, tabBarId: string): void {
		const state = this.tabBarStates.get(tabBarId);
		if (state) {
			state.dotNetRef = dotNetReference;
		}
	}

	// Find the tab element from a mouse event
	private findTabElementFromEvent(event: MouseEvent): HTMLElement | null {
		let target = event.target as HTMLElement;

		// Traverse up to find the .tab-item element
		while (target && !target.classList.contains('tab-item')) {
			target = target.parentElement as HTMLElement;
			if (!target) return null;
		}

		return target;
	}

	// Get tab ID from tab element
	private getTabId(tabElement: HTMLElement): string | null {
		return tabElement ? tabElement.id.replace('tab-', '') : null;
	}

	// Reset transforms that show tabs moving out of the way - called from TabBarWidget.razor
	// This is only called from the C# side to avoid timing issues where the transforms are cleared prior to the newly reordered tabs being rendered.
	clearTabTransforms(tabBarId?: string): void {
		// If tabBarId is provided, clear transforms for that specific tab bar
		if (tabBarId) {
			const state = this.tabBarStates.get(tabBarId);
			if (!state) return;

			const tabs = state.element.querySelectorAll('.tab-item');
			tabs.forEach(t => {
				const tab = t as HTMLElement;
				tab.style.transform = ``;
			});
		} else {
			// Legacy: clear transforms for the currently dragging tab bar
			const state = this.getCurrentDragState();
			if (!state) {
				// If no current drag state, clear transforms for all tab bars
				for (const [id, tabBarState] of this.tabBarStates) {
					const tabs = tabBarState.element.querySelectorAll('.tab-item');
					tabs.forEach(t => {
						const tab = t as HTMLElement;
						tab.style.transform = ``;
					});
				}
				return;
			}

			const tabs = state.element.querySelectorAll('.tab-item');
			tabs.forEach(t => {
				const tab = t as HTMLElement;
				tab.style.transform = ``;
			});
		}
	}
	
	/////////////////////////////////////
	// Size monitoring
	/////////////////////////////////////
	private observers: Map<Element, ResizeObserver> = new Map();
	private debounceTimeout: number | null = null;
	private debounceDelay: number = 100; // milliseconds
	private currentCallback: { method: string, helper: any } | null = null;
	private windowResizeListener: (() => void) | null = null;
	
	// Called from Blazor
	public startSizeMonitoringByClass(className: string, callbackMethod: string, dotNetHelper: any, debounceMs: number = 100): void {
		const elements = document.querySelectorAll(`.${className}`);

		if(elements.length === 0) {
			console.error(`No elements found with class '${className}' for size monitoring.`);
			return;
		}

		// Store callback info for debounced calls
		this.currentCallback = { method: callbackMethod, helper: dotNetHelper };
		this.debounceDelay = debounceMs;

		elements.forEach((element: Element) => {
			// Clean up any existing observer for this element first
			const existingObserver = this.observers.get(element);
			if(existingObserver) {
				existingObserver.disconnect();
			}

			const observer = new ResizeObserver(() => {
				this.scheduleCallback();
			});

			observer.observe(element);
			this.observers.set(element, observer);
		});

		// Add window resize listener to catch position changes
		if(!this.windowResizeListener) {
			this.windowResizeListener = () => {
				this.scheduleCallback();
			};
			window.addEventListener('resize', this.windowResizeListener);
		}
		
		console.log(`Started monitoring ${elements.length} elements with class '${className}'`);

		// Send initial callback with current state
		this.scheduleCallback();
	}

	private scheduleCallback(): void {
		// Clear existing timeout
		if(this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
		}

		// Schedule new callback
		this.debounceTimeout = window.setTimeout(() => {
			this.sendBatchedCallback();
		}, this.debounceDelay);
	}

	private sendBatchedCallback(): void {
		if(!this.currentCallback) return;

		const elementData: any[] = [];

		this.observers.forEach((observer, element) => {
			const htmlElement = element as HTMLElement;
			elementData.push({
				id: htmlElement.id || '',
				className: htmlElement.className,
				left: htmlElement.offsetLeft,
				top: htmlElement.offsetTop,
				width: htmlElement.offsetWidth,
				height: htmlElement.offsetHeight
			});
		});

		if(elementData.length > 0) {
			safeInvoke(this.currentCallback.helper, this.currentCallback.method, [elementData, window.devicePixelRatio]);
		}
	}

	// Called from Blazor
	public disposeAllSizeMonitoringObservers(): void {
		if(this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
			this.debounceTimeout = null;
		}

		this.observers.forEach(observer => observer.disconnect());
		this.observers.clear();

		if(this.windowResizeListener) {
			window.removeEventListener('resize', this.windowResizeListener);
			this.windowResizeListener = null;
		}
		
		this.currentCallback = null;
	}

	// Called from Blazor to highlight search text in elements
	public highlightSearchText(containerId: string, searchQuery: string, highlightClass: string = 'search-highlight'): void {
		const container = document.getElementById(containerId);
		if (!container) {
			return;
		}

		// Always clear existing highlights first
		this.clearHighlights(containerId, highlightClass);

		// Only proceed with highlighting if we have a non-empty search query
		const trimmedQuery = searchQuery.trim();
		if (!trimmedQuery) {
			return;
		}

		// Create regex for case-insensitive search that matches only at word boundaries
		const regex = new RegExp(`\\b(${this.escapeRegExp(trimmedQuery)})`, 'gi');
		
		// Walk through all text nodes and highlight matches
		this.highlightTextNodes(container, regex, highlightClass);
	}

	// Called from Blazor to clear search highlights
	public clearHighlights(containerId: string, highlightClass: string = 'search-highlight'): void {
		const container = document.getElementById(containerId);
		if (!container) {
			return;
		}

		// Find highlight spans - check both the provided class and common search highlight classes
		const highlights = container.querySelectorAll(`.${highlightClass}, .search-highlight, .settings-search-highlight`);
		const parentsToNormalize = new Set<Node>();
		
		highlights.forEach(highlight => {
			const parent = highlight.parentNode;
			if (parent) {
				// Replace the highlight span with its text content
				const textNode = document.createTextNode(highlight.textContent || '');
				parent.replaceChild(textNode, highlight);
				parentsToNormalize.add(parent);
			}
		});
		
		// Also clean up wrapper spans we created
		const wrappers = container.querySelectorAll('.search-text-wrapper');
		wrappers.forEach(wrapper => {
			const parent = wrapper.parentNode;
			if (parent) {
				// Replace the wrapper span with its text content
				const textNode = document.createTextNode(wrapper.textContent || '');
				parent.replaceChild(textNode, wrapper);
				parentsToNormalize.add(parent);
			}
		});
		
		// Normalize all affected parents to merge adjacent text nodes
		parentsToNormalize.forEach(parent => {
			if (parent.nodeType === Node.ELEMENT_NODE) {
				(parent as Element).normalize();
			}
		});
	}

	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private highlightTextNodes(node: Node, regex: RegExp, highlightClass: string): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const textContent = node.textContent || '';
			const parent = node.parentNode;
			if (!parent) return;
			
			// Check if this text node is already wrapped in a span
			const isInSpan = parent.nodeType === Node.ELEMENT_NODE && 
							(parent as HTMLElement).tagName.toLowerCase() === 'span';
			
			// If not in a span and has meaningful content, wrap it first
			if (!isInSpan && textContent.trim()) {
				const wrapperSpan = document.createElement('span');
				wrapperSpan.className = 'search-text-wrapper'; // Mark for cleanup
				wrapperSpan.textContent = textContent;
				parent.replaceChild(wrapperSpan, node);
				// Now process the wrapper span
				this.highlightTextNodes(wrapperSpan, regex, highlightClass);
				return;
			}
			
			// Find matches for highlighting
			const matches: RegExpExecArray[] = [];
			let match;
			while ((match = regex.exec(textContent)) !== null) {
				matches.push(match);
				// Break if regex doesn't have global flag to avoid infinite loop
				if (!regex.global) break;
			}
			
			if (matches.length > 0) {
				const parent = node.parentNode;
				if (!parent) return;
				
				// Process matches in reverse order to maintain correct indices
				matches.reverse().forEach(match => {
					const matchStart = match.index!;
					const matchEnd = matchStart + match[0].length;
					
					// Split the text node at the match boundaries
					const range = document.createRange();
					range.setStart(node, matchStart);
					range.setEnd(node, matchEnd);
					
					// Extract the matched text
					const matchedText = range.extractContents();
					
					// Create highlight span
					const highlightSpan = document.createElement('span');
					highlightSpan.className = highlightClass;
					highlightSpan.appendChild(matchedText);
					
					// Insert the highlight span at the extraction point
					range.insertNode(highlightSpan);
				});
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			// Skip elements that are already highlights to avoid nested highlighting
			const element = node as HTMLElement;
			// Also skip elements marked with no-highlight class to prevent interference with dynamic content
			if (!element.classList.contains(highlightClass) && !element.classList.contains('no-highlight')) {
				// Process child nodes (make a copy of the list since we may modify it)
				const childNodes = Array.from(node.childNodes);
				childNodes.forEach(child => this.highlightTextNodes(child, regex, highlightClass));
			}
		}
	}

	///////////////////////////////////////////////////////////////////////////////////
	// Venus CSS Variables - OKLCH-based semantic color system
	///////////////////////////////////////////////////////////////////////////////////
	
	/**
	 * Applies CSS variables to the document using a named style tag.
	 * Each tagId gets its own style element, allowing independent updates.
	 * @param cssText The CSS text containing :root { ... } variable definitions
	 * @param tagId The id for the style element (e.g., 'venus-vapp', 'venus-vusr')
	 */
	private applyCssVarsToTag(cssText: string, tagId: string): void {
		let styleTag = document.getElementById(tagId) as HTMLStyleElement | null;
		if(!styleTag) {
			styleTag = document.createElement('style');
			styleTag.id = tagId;
			document.head.appendChild(styleTag);
		}
		styleTag.textContent = cssText;
	}

	/**
	 * Removes Venus CSS variables from the document.
	 */
	public removeCssVars(): void {
		document.getElementById('venus-vapp')?.remove();
		document.getElementById('venus-vusr')?.remove();
	}

	/**
	 * Removes only the vapp CSS variables, allowing venus.css defaults to take effect.
	 * Call this when switching away from "Follow Brain Theme" mode.
	 */
	public removeAppCssVars(): void {
		document.getElementById('venus-vapp')?.remove();
	}

	/**
	 * Applies Venus CSS variables for application content (vapp-) derived from specific RGB colors.
	 * @param bgR Background red (0-255)
	 * @param bgG Background green (0-255)
	 * @param bgB Background blue (0-255)
	 * @param fgR Foreground/text red (0-255)
	 * @param fgG Foreground/text green (0-255)
	 * @param fgB Foreground/text blue (0-255)
	 * @param accentR Accent red (0-255)
	 * @param accentG Accent green (0-255)
	 * @param accentB Accent blue (0-255)
	 */
	public applyAppVenusCssVarsFromColors(
		bgR: number, bgG: number, bgB: number,
		fgR: number, fgG: number, fgB: number,
		accentR: number, accentG: number, accentB: number
	): void {
		console.log(`[VenusUtils] applyAppVenusCssVarsFromColors called, bg=(${bgR},${bgG},${bgB}), fg=(${fgR},${fgG},${fgB}), accent=(${accentR},${accentG},${accentB})`);
		const bg = { r: bgR, g: bgG, b: bgB };
		const fg = { r: fgR, g: fgG, b: fgB };
		const accent = { r: accentR, g: accentG, b: accentB };
		const isDark = this.isDarkColor(bg);
		const vappCss = this.generateVenusCssVars(bg, fg, accent, isDark, "vapp");
		this.applyCssVarsToTag(vappCss, 'venus-vapp');
		console.log(`[VenusUtils] applyAppVenusCssVarsFromColors completed`);
	}

	/**
	 * Applies Venus CSS variables for application content (vapp-) derived from two RGB colors.
	 * The accent color is auto-generated using fg luminance, bg hue, and maximum chroma.
	 * @param bgR Background red (0-255)
	 * @param bgG Background green (0-255)
	 * @param bgB Background blue (0-255)
	 * @param fgR Foreground/text red (0-255)
	 * @param fgG Foreground/text green (0-255)
	 * @param fgB Foreground/text blue (0-255)
	 */
	public applyAppVenusCssVarsFromTwoColors(
		bgR: number, bgG: number, bgB: number,
		fgR: number, fgG: number, fgB: number
	): void {
		const bgOklch = this.rgbToOklch(bgR, bgG, bgB);

		const isDarkBg = bgOklch.l < 0.5;
		// Generate accent: 0.7 or 0.3 luminance + bg hue (or 265 if achromatic) + max chroma
		const accentL = isDarkBg ? 0.7 : 0.3;
		// Pick bg hue with a default if it's achromatic
		const accentH = bgOklch.c > this.ACHROMATIC_THRESHOLD ? bgOklch.h : 265;
		// Now fully saturate the accent
		const accentC = this.findMaxChromaForLH(accentL, accentH);
		
		const accent = this.oklchToRgb(accentL, accentC, accentH);
		console.log(`[VenusUtils] applyAppVenusCssVarsFromTwoColors: generated accent=(${accent.r},${accent.g},${accent.b}) from L=${accentL.toFixed(3)}, C=${accentC.toFixed(3)}, H=${accentH.toFixed(1)}`);

		this.applyAppVenusCssVarsFromColors(
			bgR, bgG, bgB,
			fgR, fgG, fgB,
			accent.r, accent.g, accent.b
		);
	}

	/**
	 * Applies Venus CSS variables for user content (vusr-) derived from specific RGB colors.
	 * @param bgR Background red (0-255)
	 * @param bgG Background green (0-255)
	 * @param bgB Background blue (0-255)
	 * @param fgR Foreground/text red (0-255)
	 * @param fgG Foreground/text green (0-255)
	 * @param fgB Foreground/text blue (0-255)
	 * @param accentR Accent red (0-255)
	 * @param accentG Accent green (0-255)
	 * @param accentB Accent blue (0-255)
	 */
	public applyUserVenusCssVarsFromColors(
		bgR: number, bgG: number, bgB: number,
		fgR: number, fgG: number, fgB: number,
		accentR: number, accentG: number, accentB: number
	): void {
		console.log(`[VenusUtils] applyUserVenusCssVarsFromColors called, bg=(${bgR},${bgG},${bgB}), fg=(${fgR},${fgG},${fgB}), accent=(${accentR},${accentG},${accentB})`);
		const bg = { r: bgR, g: bgG, b: bgB };
		const fg = { r: fgR, g: fgG, b: fgB };
		const accent = { r: accentR, g: accentG, b: accentB };
		const isDark = this.isDarkColor(bg);
		const vusrCss = this.generateVenusCssVars(bg, fg, accent, isDark, "vusr");
		this.applyCssVarsToTag(vusrCss, 'venus-vusr');
		console.log(`[VenusUtils] applyUserVenusCssVarsFromColors completed`);
	}

	/**
	 * Applies Venus CSS variables for user content (vusr-) derived from two RGB colors.
	 * The accent color is auto-generated using fg luminance, bg hue, and maximum chroma.
	 * @param bgR Background red (0-255)
	 * @param bgG Background green (0-255)
	 * @param bgB Background blue (0-255)
	 * @param fgR Foreground/text red (0-255)
	 * @param fgG Foreground/text green (0-255)
	 * @param fgB Foreground/text blue (0-255)
	 */
	public applyUserVenusCssVarsFromTwoColors(
		bgR: number, bgG: number, bgB: number,
		fgR: number, fgG: number, fgB: number
	): void {
		const bgOklch = this.rgbToOklch(bgR, bgG, bgB);
		const fgOklch = this.rgbToOklch(fgR, fgG, fgB);

		// Generate accent: fg luminance + bg hue (or 265 if achromatic) + max chroma
		const accentL = Math.max(0.3, Math.min(0.7, fgOklch.l));
		const accentH = bgOklch.c > this.ACHROMATIC_THRESHOLD ? bgOklch.h : 265;
		const accentC = this.findMaxChromaForLH(accentL, accentH);
		const accent = this.oklchToRgb(accentL, accentC, accentH);
		console.log(`[VenusUtils] applyUserVenusCssVarsFromTwoColors: generated accent=(${accent.r},${accent.g},${accent.b}) from L=${accentL.toFixed(3)}, C=${accentC.toFixed(3)}, H=${accentH.toFixed(1)}`);

		this.applyUserVenusCssVarsFromColors(
			bgR, bgG, bgB,
			fgR, fgG, fgB,
			accent.r, accent.g, accent.b
		);
	}

	/**
	 * Determines if a color is dark based on luminance.
	 * Same logic as ColorUtils.IsDark() in C#.
	 */
	private isDarkColor(c: { r: number; g: number; b: number }): boolean {
		const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
		return luminance < 0.5;
	}

	/**
	 * Generates Venus CSS variables from RGB input colors.
	 * This replicates the OKLCH-based color derivation from VenusStyle.cs.
	 */
	private generateVenusCssVars(
		bg: { r: number; g: number; b: number },
		fg: { r: number; g: number; b: number },
		accent: { r: number; g: number; b: number },
		isDark: boolean,
		prefix: string
	): string {
		// Convert to OKLCH
		const bgOklch = this.rgbToOklch(bg.r, bg.g, bg.b);
		const fgOklch = this.rgbToOklch(fg.r, fg.g, fg.b);
		const accentOklch = this.rgbToOklch(accent.r, accent.g, accent.b);

		// Extract base hue (from bg, fg, or accent - first non-achromatic)
		const baseHue = this.extractBaseHue(bgOklch, fgOklch, accentOklch);
		const hasHue = baseHue !== null;

		// Adjust backgrounds for headroom
		const bgAdj = this.adjustBackgroundForHeadroom(bgOklch, isDark);
		const fgAdj = this.adjustForegroundForHeadroom(fgOklch, isDark);

		// Store background RGB for contrast checking
		const bgRgb = this.oklchToRgb(bgAdj.l, hasHue ? bgAdj.c : 0, baseHue ?? 0);

		// Calculate uniform scale factor for background deltas based on available headroom
		// Use unmultiplied deltas for proper scaling (multiplier only affects headroom adjustment)
		const bgDeltaValues = isDark ? Object.values(this.BG_DELTA_DARK) : Object.values(this.BG_DELTA_LIGHT);
		const bgDarkerRoom = bgAdj.l;                        // Room to go toward 0
		const bgLighterRoom = 1.0 - bgAdj.l;                 // Room to go toward 1
		const bgDarkerNeeded = -Math.min(...bgDeltaValues);  // Max darker delta magnitude (unmultiplied)
		const bgLighterNeeded = Math.max(...bgDeltaValues);  // Max lighter delta magnitude (unmultiplied)
		const bgDarkerScale = bgDarkerRoom >= bgDarkerNeeded ? 1.0 : bgDarkerRoom / bgDarkerNeeded;
		const bgLighterScale = bgLighterRoom >= bgLighterNeeded ? 1.0 : bgLighterRoom / bgLighterNeeded;

		// Helper to derive from background with uniform proportional scaling
		// Only apply chroma if the background itself has chroma (not just because accent has hue)
		const bgHasChroma = bgAdj.c > this.ACHROMATIC_THRESHOLD;
		const deriveFromBg = (deltaL: number, deltaC: number) => {
			const scale = deltaL < 0 ? bgDarkerScale : bgLighterScale;
			let newL = bgAdj.l + deltaL * scale;
			newL = Math.max(0, Math.min(1.0, newL));
			const newC = Math.max(0, bgAdj.c + deltaC);
			return this.oklchToRgb(newL, bgHasChroma ? newC : 0, baseHue ?? 0);
		};

		// Check if foreground has its own hue (not achromatic)
		const fgHasHue = fgOklch.c > this.ACHROMATIC_THRESHOLD;

		// Calculate uniform scale factor for foreground deltas based on available headroom
		const fgDeltas = isDark ? this.FG_DELTAS.dark : this.FG_DELTAS.light;
		const fgDarkerRoom = fgAdj.l;                    // Room to go toward 0
		const fgLighterRoom = 1.0 - fgAdj.l;            // Room to go toward 1
		const fgDarkerNeeded = -fgDeltas.min;           // Max darker delta magnitude
		const fgLighterNeeded = fgDeltas.max;           // Max lighter delta magnitude
		const fgDarkerScale = fgDarkerRoom >= fgDarkerNeeded ? 1.0 : fgDarkerRoom / fgDarkerNeeded;
		const fgLighterScale = fgLighterRoom >= fgLighterNeeded ? 1.0 : fgLighterRoom / fgLighterNeeded;

		// Helper to derive from foreground with uniform proportional scaling and WCAG AA contrast enforcement
		// Uses foreground's own hue, not baseHue, to preserve fg color identity
		const deriveFromFg = (deltaL: number, deltaC: number, minContrastRatio: number = 4.5) => {
			const scale = deltaL < 0 ? fgDarkerScale : fgLighterScale;
			let newL = fgAdj.l + deltaL * scale;
			newL = Math.max(0, Math.min(1, newL));
			const newC = Math.max(0, fgAdj.c + deltaC);
			const intendedChroma = fgHasHue ? newC : 0;
			const derivedRgb = this.oklchToRgb(newL, intendedChroma, fgOklch.h);

			// Ensure WCAG AA contrast against background
			return this.ensureContrast(derivedRgb, bgRgb, minContrastRatio, isDark, fgOklch.h, intendedChroma);
		};

		// Helper to derive from accent
		const deriveFromAccent = (deltaL: number, deltaC: number, deltaH: number = 0) => {
			const newL = Math.max(0, Math.min(1, accentOklch.l + deltaL));
			const newC = Math.max(0, accentOklch.c + deltaC);
			const newH = accentOklch.h + deltaH;
			return this.oklchToRgb(newL, newC, newH);
		};

		// Fixed color helper
		const fixedColor = (l: number, c: number, h: number) => this.oklchToRgb(l, c, h);

		// Generate all colors based on dark/light mode
		let surfaces, borders, text, icons, buttons, scrollbar, effects, accents, fixedAccents;

		if(isDark) {
			const bgD = this.BG_DELTA_DARK;
			const fgD = this.FG_DELTA_DARK;
			surfaces = {
				bgApp: deriveFromBg(bgD.bgApp, 0),
				surface1: deriveFromBg(bgD.surface1, 0),
				surface2: deriveFromBg(bgD.surface2, 0),
				surface3: deriveFromBg(bgD.surface3, 0),
				elevated1: deriveFromBg(bgD.elevated1, 0.005),
				elevated2: deriveFromBg(bgD.elevated2, 0.01),
				elevated3: deriveFromBg(bgD.elevated3, 0.02),
				elevated4: deriveFromBg(bgD.elevated4, 0.04)
			};
			borders = {
				default: deriveFromBg(bgD.borderDefault, 0.010),
				subtle: deriveFromBg(bgD.borderSubtle, 0.005),
				strong: deriveFromBg(bgD.borderStrong, 0.015),
				focus: deriveFromAccent(0, 0)
			};
			text = {
				primary: deriveFromFg(fgD.primary, 0),
				secondary: deriveFromFg(fgD.secondary, 0.007),
				muted: deriveFromFg(fgD.muted, 0.012),
				dim: deriveFromFg(fgD.dim, 0.017),
				onAccent: { r: 255, g: 255, b: 255 }
			};
			icons = {
				default: deriveFromFg(fgD.iconDefault, 0.012),
				hover: deriveFromFg(fgD.iconHover, 0),
				active: deriveFromAccent(0, 0),
				dim: deriveFromFg(fgD.iconDim, 0.017)
			};
			buttons = {
				bgHover: deriveFromBg(bgD.btnBgHover, 0.01),
				bgSelected: deriveFromBg(bgD.btnBgSelected, 0.005),
				bgActive: { ...deriveFromAccent(0, 0), a: 0.25 }
			};
			scrollbar = {
				thumb: deriveFromBg(bgD.scrollbarThumb, 0.015),
				thumbHover: deriveFromFg(fgD.scrollbarThumbHover, 0.017)
			};
			effects = {
				glowAccent: { ...deriveFromAccent(0, 0), a: 0.25 },
				glowSecondary: { ...deriveFromAccent(0.10, -0.04, -55), a: 0.15 },
				shadowElevated: { r: 0, g: 0, b: 0, a: 0.40 }
			};
			accents = {
				primary: deriveFromAccent(0, 0),
				secondary: deriveFromAccent(0.10, -0.04, -55),
				decorative: deriveFromAccent(-0.13, 0.02, 45)
			};
			fixedAccents = {
				success: fixedColor(0.68, 0.150, 165),
				warning: fixedColor(0.78, 0.170, 75),
				danger: fixedColor(0.63, 0.200, 25)
			};
		} else {
			const bgL = this.BG_DELTA_LIGHT;
			const fgL = this.FG_DELTA_LIGHT;
			surfaces = {
				bgApp: deriveFromBg(bgL.bgApp, 0),
				surface1: deriveFromBg(bgL.surface1, 0),
				surface2: deriveFromBg(bgL.surface2, 0),
				surface3: deriveFromBg(bgL.surface3, 0),
				elevated1: deriveFromBg(bgL.elevated1, .005),
				elevated2: deriveFromBg(bgL.elevated2, .01),
				elevated3: deriveFromBg(bgL.elevated3, .015),
				elevated4: deriveFromBg(bgL.elevated4, .02)
			};
			borders = {
				default: deriveFromBg(bgL.borderDefault, 0.004),
				subtle: deriveFromBg(bgL.borderSubtle, 0.001),
				strong: deriveFromBg(bgL.borderStrong, 0.008),
				focus: deriveFromAccent(0, 0)
			};
			text = {
				primary: deriveFromFg(fgL.primary, 0),
				secondary: deriveFromFg(fgL.secondary, 0.005),
				muted: deriveFromFg(fgL.muted, 0.010),
				dim: deriveFromFg(fgL.dim, 0.005),
				onAccent: { r: 255, g: 255, b: 255 }
			};
			icons = {
				default: deriveFromFg(fgL.iconDefault, 0.010),
				hover: deriveFromFg(fgL.iconHover, 0),
				active: deriveFromAccent(0, 0),
				dim: deriveFromFg(fgL.iconDim, 0.005)
			};
			buttons = {
				bgHover: deriveFromBg(bgL.btnBgHover, 0.0),
				bgSelected: deriveFromBg(bgL.btnBgSelected, 0),
				bgActive: { ...deriveFromAccent(0, 0), a: 0.12 }
			};
			scrollbar = {
				thumb: deriveFromBg(bgL.scrollbarThumb, 0.008),
				thumbHover: deriveFromFg(fgL.scrollbarThumbHover, 0.005)
			};
			effects = {
				glowAccent: { ...deriveFromAccent(0, 0), a: 0.20 },
				glowSecondary: { ...deriveFromAccent(0.03, -0.06, -55), a: 0.12 },
				shadowElevated: { ...deriveFromBg(-bgAdj.l, 0), a: 0.12 }
			};
			accents = {
				primary: deriveFromAccent(0, 0),
				secondary: deriveFromAccent(0.03, -0.06, -55),
				decorative: deriveFromAccent(-0.07, 0.02, 45)
			};
			fixedAccents = {
				success: fixedColor(0.55, 0.150, 165),
				warning: fixedColor(0.65, 0.170, 75),
				danger: fixedColor(0.52, 0.200, 25)
			};
		}

		// Format helper
		const rgb = (c: { r: number; g: number; b: number }) => `${c.r} ${c.g} ${c.b}`;
		const rgba = (c: { r: number; g: number; b: number; a?: number }) =>
			c.a !== undefined ? `${c.r} ${c.g} ${c.b} / ${Math.round(c.a * 100)}%` : rgb(c);

		return `:root {
        /* ===== ${prefix} Surfaces ===== */
        --${prefix}-bg-app: ${rgb(surfaces.bgApp)};
        --${prefix}-surface-translucent: ${rgb(surfaces.bgApp)} / 50%;
        --${prefix}-surface-1: ${rgb(surfaces.surface1)};
        --${prefix}-surface-2: ${rgb(surfaces.surface2)};
        --${prefix}-surface-3: ${rgb(surfaces.surface3)};
        --${prefix}-elevated-1: ${rgb(surfaces.elevated1)};
        --${prefix}-elevated-2: ${rgb(surfaces.elevated2)};
        --${prefix}-elevated-3: ${rgb(surfaces.elevated3)};
        --${prefix}-elevated-4: ${rgb(surfaces.elevated4)};

        /* ===== ${prefix} Borders ===== */
        --${prefix}-border-translucent: ${rgb(borders.default)} / 70%;
        --${prefix}-border-default: ${rgb(borders.default)};
        --${prefix}-border-strong: ${rgb(borders.strong)};
        --${prefix}-border-subtle: ${rgb(borders.subtle)};
        --${prefix}-border-focus: ${rgb(borders.focus)};

        /* ===== ${prefix} Text ===== */
        --${prefix}-text-primary: ${rgb(text.primary)};
        --${prefix}-text-secondary: ${rgb(text.secondary)};
        --${prefix}-text-muted: ${rgb(text.muted)};
        --${prefix}-text-dim: ${rgb(text.dim)};
        --${prefix}-text-on-accent: ${rgb(text.onAccent)};

        /* ===== ${prefix} Icons ===== */
        --${prefix}-icon-default: ${rgb(icons.default)};
        --${prefix}-icon-hover: ${rgb(icons.hover)};
        --${prefix}-icon-active: ${rgb(icons.active)};
        --${prefix}-icon-dim: ${rgb(icons.dim)};

        /* ===== ${prefix} Buttons ===== */
        --${prefix}-btn-bg-hover: ${rgb(buttons.bgHover)};
        --${prefix}-btn-bg-selected: ${rgb(buttons.bgSelected)};
        --${prefix}-btn-bg-active: ${rgba(buttons.bgActive)};

        /* ===== ${prefix} Scrollbar ===== */
        --${prefix}-scrollbar-thumb: ${rgb(scrollbar.thumb)};
        --${prefix}-scrollbar-thumb-hover: ${rgb(scrollbar.thumbHover)};

        /* ===== ${prefix} Effects ===== */
        --${prefix}-glow-accent: ${rgba(effects.glowAccent)};
        --${prefix}-glow-secondary: ${rgba(effects.glowSecondary)};
        --${prefix}-shadow-elevated: ${rgba(effects.shadowElevated)};

        /* ===== ${prefix} Accent ===== */
        --${prefix}-accent-primary: ${rgb(accents.primary)};
        --${prefix}-accent-secondary: ${rgb(accents.secondary)};
        --${prefix}-accent-decorative: ${rgb(accents.decorative)};

        /* ===== ${prefix} Fixed Accents ===== */
        --${prefix}-accent-success: ${rgb(fixedAccents.success)};
        --${prefix}-accent-warning: ${rgb(fixedAccents.warning)};
        --${prefix}-accent-danger: ${rgb(fixedAccents.danger)};
    }`;
	}

	// OKLCH Color Math Utilities

	private extractBaseHue(bg: OklchColor, fg: OklchColor, accent: OklchColor): number | null {
		if(bg.c > this.ACHROMATIC_THRESHOLD) return bg.h;
		if(fg.c > this.ACHROMATIC_THRESHOLD) return fg.h;
		if(accent.c > this.ACHROMATIC_THRESHOLD) return accent.h;
		return null;
	}

	// Background lightness deltas by mode - used in deriveFromBg calls
	private readonly BG_DELTA_DARK = {
		bgApp: -0.09,
		surface1: -0.06,
		surface2: -0.03,
		surface3: 0,
		elevated1: 0.04,
		elevated2: 0.08,
		elevated3: 0.12,
		elevated4: 0.16,
		borderDefault: 0.10,
		borderStrong: 0.15,
		borderSubtle: 0.05,
		btnBgHover: 0.08,
		btnBgSelected: 0.04,
		scrollbarThumb: 0.20,
	};

	private readonly BG_DELTA_LIGHT = {
		bgApp: -0.06,
		surface1: -0.04,
		surface2: -0.02,
		surface3: 0,
		elevated1: 0.02,
		elevated2: 0.06,
		elevated3: 0.08,
		elevated4: 0.10,
		borderDefault: -0.08,
		borderStrong: -0.12,
		borderSubtle: -0.02,
		btnBgHover: -0.04,
		btnBgSelected: -0.01,
		scrollbarThumb: -0.18,
	};

	// Foreground lightness deltas by mode - used in deriveFromFg calls
	private readonly FG_DELTA_DARK = {
		primary: 0,
		secondary: -0.20,
		muted: -0.40,
		dim: -0.51,
		iconDefault: -0.40,
		iconHover: 0,
		iconDim: -0.51,
		scrollbarThumbHover: -0.20,
	};

	private readonly FG_DELTA_LIGHT = {
		primary: 0,
		secondary: 0.15,
		muted: 0.30,
		dim: 0.40,
		iconDefault: 0.30,
		iconHover: 0,
		iconDim: 0.40,
		scrollbarThumbHover: 0.15
	};

	// 2x multiplier for dark mode BG to ensure surface colors are distinguishable on most screens
	private readonly DARK_BG_HEADROOM_MULTIPLIER = 2;
	private readonly LIGHT_BG_HEADROOM_MULTIPLIER = 0.5;

	// Chroma threshold below which a color is considered achromatic (grayscale)
	private readonly ACHROMATIC_THRESHOLD = 0.001;

	// Computed min/max deltas for headroom calculations
	private readonly BG_DELTAS = this.calculateBgDeltas();
	private readonly FG_DELTAS = this.calculateFgDeltas();

	private calculateBgDeltas() {
		const darkValues = Object.values(this.BG_DELTA_DARK);
		const lightValues = Object.values(this.BG_DELTA_LIGHT);
		return {
			dark: {
				min: Math.min(...darkValues) * this.DARK_BG_HEADROOM_MULTIPLIER,
				max: Math.max(...darkValues) * this.DARK_BG_HEADROOM_MULTIPLIER
			},
			light: {
				min: Math.min(...lightValues) * this.LIGHT_BG_HEADROOM_MULTIPLIER,
				max: Math.max(...lightValues) * this.LIGHT_BG_HEADROOM_MULTIPLIER
			}
		};
	}

	private calculateFgDeltas() {
		const darkValues = Object.values(this.FG_DELTA_DARK);
		const lightValues = Object.values(this.FG_DELTA_LIGHT);
		return {
			dark: {
				min: Math.min(...darkValues),
				max: Math.max(...darkValues)
			},
			light: {
				min: Math.min(...lightValues),
				max: Math.max(...lightValues)
			}
		};
	}

	private adjustBackgroundForHeadroom(bg: OklchColor, isDark: boolean): OklchColor {
		const deltas = isDark ? this.BG_DELTAS.dark : this.BG_DELTAS.light;
		const minL = -deltas.min;             // Minimum for full darker range
		const maxL = 1.0 - deltas.max;        // Maximum for full lighter range

		if(isDark) {
			// Dark mode: require full headroom (hard clamp)
			return { l: Math.max(minL, Math.min(maxL, bg.l)), c: bg.c, h: bg.h };
		} else {
			// Light mode: move halfway toward ideal bounds if outside them
			let adjustedL = bg.l;
			if(bg.l < minL) {
				adjustedL = bg.l + (minL - bg.l) * 0.5;
			} else if(bg.l > maxL) {
				adjustedL = bg.l - (bg.l - maxL) * 0.5;
			}
			return { l: adjustedL, c: bg.c, h: bg.h };
		}
	}

	private adjustForegroundForHeadroom(fg: OklchColor, isDark: boolean): OklchColor {
		const deltas = isDark ? this.FG_DELTAS.dark : this.FG_DELTAS.light;
		const minL = -deltas.min;             // Minimum for full darker range
		const maxL = 1.0 - deltas.max;        // Maximum for full lighter range

		// Foreground: require full headroom (hard clamp) for both dark and light
		return { l: Math.max(minL, Math.min(maxL, fg.l)), c: fg.c, h: fg.h };
	}

	/**
	 * Converts sRGB (0-255) to OKLCH color space.
	 * Based on the OklchColor.cs implementation.
	 */
	private rgbToOklch(r: number, g: number, b: number): OklchColor {
		// sRGB to linear RGB
		const linearize = (c: number) => {
			const s = c / 255;
			return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
		};
		const lr = linearize(r);
		const lg = linearize(g);
		const lb = linearize(b);

		// Linear RGB to OKLab
		const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
		const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
		const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

		const l_3 = Math.cbrt(l_);
		const m_3 = Math.cbrt(m_);
		const s_3 = Math.cbrt(s_);

		const L = 0.2104542553 * l_3 + 0.7936177850 * m_3 - 0.0040720468 * s_3;
		const a = 1.9779984951 * l_3 - 2.4285922050 * m_3 + 0.4505937099 * s_3;
		const bb = 0.0259040371 * l_3 + 0.7827717662 * m_3 - 0.8086757660 * s_3;

		// OKLab to OKLCH
		const C = Math.sqrt(a * a + bb * bb);
		let H = Math.atan2(bb, a) * (180 / Math.PI);
		if(H < 0) H += 360;

		return { l: L, c: C, h: H };
	}

	/**
	 * Converts OKLCH to sRGB (0-255).
	 * Based on the OklchColor.cs implementation.
	 */
	private oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } {
		// OKLCH to OKLab
		const hRad = H * (Math.PI / 180);
		const a = C * Math.cos(hRad);
		const b = C * Math.sin(hRad);

		// OKLab to linear RGB
		const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
		const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
		const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

		const l = l_ * l_ * l_;
		const m = m_ * m_ * m_;
		const s = s_ * s_ * s_;

		const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
		const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
		const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

		// Linear RGB to sRGB
		const delinearize = (c: number) => {
			const clamped = Math.max(0, Math.min(1, c));
			return clamped <= 0.0031308
				? clamped * 12.92
				: 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
		};

		return {
			r: Math.round(delinearize(lr) * 255),
			g: Math.round(delinearize(lg) * 255),
			b: Math.round(delinearize(lb) * 255)
		};
	}

	/**
	 * Finds the maximum chroma value for a given OKLCH luminance and hue
	 * that results in a valid sRGB color (all components 0-255).
	 */
	private findMaxChromaForLH(l: number, h: number): number {
		// Binary search for max chroma
		let low = 0;
		let high = 0.4; // OKLCH chroma rarely exceeds 0.4 for sRGB
		const tolerance = 0.001;

		while(high - low > tolerance) {
			const mid = (low + high) / 2;
			const rgb = this.oklchToRgb(l, mid, h);

			// Check if result is within gamut (oklchToRgb clamps, so check if clamping occurred)
			const roundTrip = this.rgbToOklch(rgb.r, rgb.g, rgb.b);
			const chromaDiff = Math.abs(roundTrip.c - mid);

			if(chromaDiff < 0.01) {
				low = mid; // Valid, try higher
			} else {
				high = mid; // Out of gamut, try lower
			}
		}
		return low;
	}

	/**
	 * Calculate relative luminance per WCAG 2.1
	 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
	 */
	private getRelativeLuminance(r: number, g: number, b: number): number {
		const toLinear = (c: number) => {
			const s = c / 255;
			return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
		};
		return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
	}

	/**
	 * Calculate WCAG contrast ratio between two colors.
	 * Returns ratio >= 1 (e.g., 4.5 for WCAG AA compliance).
	 */
	private getContrastRatio(
		fg: { r: number; g: number; b: number },
		bg: { r: number; g: number; b: number }
	): number {
		const l1 = this.getRelativeLuminance(fg.r, fg.g, fg.b);
		const l2 = this.getRelativeLuminance(bg.r, bg.g, bg.b);
		const lighter = Math.max(l1, l2);
		const darker = Math.min(l1, l2);
		return (lighter + 0.05) / (darker + 0.05);
	}

	/**
	 * Adjust foreground color lightness to meet minimum contrast ratio against background.
	 * Uses binary search to find the minimum lightness adjustment needed.
	 */
	private ensureContrast(
		fg: { r: number; g: number; b: number },
		bgRgb: { r: number; g: number; b: number },
		minRatio: number,
		isDark: boolean,
		baseHue: number | null,
		intendedChroma: number
	): { r: number; g: number; b: number } {
		const currentRatio = this.getContrastRatio(fg, bgRgb);
		if(currentRatio >= minRatio) {
			return fg; // Already meets contrast requirement
		}

		// Convert to OKLCH to get current lightness for binary search starting point
		const fgOklch = this.rgbToOklch(fg.r, fg.g, fg.b);

		// Binary search for lightness that achieves target contrast
		let minL = isDark ? fgOklch.l : 0;
		let maxL = isDark ? 1 : fgOklch.l;
		let bestL = fgOklch.l;

		for(let i = 0; i < 10; i++) { // 10 iterations gives ~0.001 precision
			const midL = (minL + maxL) / 2;
			const testRgb = this.oklchToRgb(midL, intendedChroma, baseHue ?? fgOklch.h);
			const testRatio = this.getContrastRatio(testRgb, bgRgb);

			if(testRatio >= minRatio) {
				bestL = midL;
				if(isDark) {
					maxL = midL; // In dark mode, try to find darker acceptable value
				} else {
					minL = midL; // In light mode, try to find lighter acceptable value
				}
			} else {
				if(isDark) {
					minL = midL; // Need more lightness
				} else {
					maxL = midL; // Need less lightness
				}
			}
		}

		return this.oklchToRgb(bestL, intendedChroma, baseHue ?? fgOklch.h);
	}
	
	// Edge-fade overlays + chevron affordance for horizontally-scrollable toolbars. The fade alone
	// is ambiguous when it happens to land on whitespace between buttons, so we also overlay a
	// chevron at the appropriate edge whenever scrolling is possible in that direction. Tapping
	// the chevron scrolls roughly one viewport in that direction.
	//
	// Note: the fade is implemented as sibling overlay <div>s rather than `mask-image` on the
	// scroll container itself. CSS mask-image makes the element a containing block for
	// `position: fixed` descendants (same family as `transform`/`filter`/`clip-path`), which
	// confined menu BackgroundOverlayControls to the toolbar's box and broke outside-tap
	// dismissal of any popup opened from a toolbar button. See AiChatControl.razor:485-487 for
	// the same trap encountered with `transform`.
	private overflowMaskState: Map<string, {
		onScroll: () => void;
		observer: ResizeObserver;
		mutationObserver: MutationObserver;
		leftFade: HTMLElement | null;
		rightFade: HTMLElement | null;
		leftChevron: HTMLElement | null;
		rightChevron: HTMLElement | null;
		leftClickHandler: (() => void) | null;
		rightClickHandler: (() => void) | null;
	}> = new Map();

	public setupToolbarOverflowMask(elementId: string): void {
		const el = document.getElementById(elementId);
		if(!el) return;
		if(this.overflowMaskState.has(elementId)) {
			this.disposeToolbarOverflowMask(elementId);
		}

		const leftFade = document.getElementById(`${elementId}-fade-left`);
		const rightFade = document.getElementById(`${elementId}-fade-right`);
		const leftChevron = document.getElementById(`${elementId}-chevron-left`);
		const rightChevron = document.getElementById(`${elementId}-chevron-right`);

		const update = () => this.updateToolbarOverflowMask(el, leftFade, rightFade, leftChevron, rightChevron);

		// ResizeObserver covers the case where the container itself is resized.
		const observer = new ResizeObserver(update);
		observer.observe(el);

		// MutationObserver catches the case where toolbar items are added/removed/restyled
		// after the initial setup — e.g. custom render fragments that wait on async data, or
		// items whose width changes after FontAwesome's webfont finishes loading. Without this
		// the initial scrollWidth measurement is stale on first render and the mask never
		// shows up until the user closes and reopens the brain.
		const mutationObserver = new MutationObserver(update);
		mutationObserver.observe(el, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class'],
		});

		// Recompute once webfonts are ready so icon widths reflect their loaded glyph metrics.
		if(typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
			document.fonts.ready.then(update).catch(() => { /* ignore */ });
		}

		el.addEventListener('scroll', update, { passive: true });

		// Scroll a bit less than a full viewport so the user keeps a sliver of context across taps.
		const scrollStep = () => Math.max(40, Math.floor(el.clientWidth * 0.8));
		let leftClickHandler: (() => void) | null = null;
		let rightClickHandler: (() => void) | null = null;
		if(leftChevron) {
			leftClickHandler = () => el.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
			leftChevron.addEventListener('click', leftClickHandler);
		}
		if(rightChevron) {
			rightClickHandler = () => el.scrollBy({ left: scrollStep(), behavior: 'smooth' });
			rightChevron.addEventListener('click', rightClickHandler);
		}

		this.overflowMaskState.set(elementId, {
			onScroll: update, observer, mutationObserver,
			leftFade, rightFade,
			leftChevron, rightChevron,
			leftClickHandler, rightClickHandler,
		});
		update();
	}

	public disposeToolbarOverflowMask(elementId: string): void {
		const state = this.overflowMaskState.get(elementId);
		if(!state) return;
		const el = document.getElementById(elementId);
		el?.removeEventListener('scroll', state.onScroll);
		state.observer.disconnect();
		state.mutationObserver.disconnect();
		if(state.leftChevron && state.leftClickHandler) {
			state.leftChevron.removeEventListener('click', state.leftClickHandler);
		}
		if(state.rightChevron && state.rightClickHandler) {
			state.rightChevron.removeEventListener('click', state.rightClickHandler);
		}
		state.leftFade?.classList.remove('visible');
		state.rightFade?.classList.remove('visible');
		state.leftChevron?.classList.remove('visible');
		state.rightChevron?.classList.remove('visible');
		this.overflowMaskState.delete(elementId);
	}

	private updateToolbarOverflowMask(
		el: HTMLElement,
		leftFade: HTMLElement | null,
		rightFade: HTMLElement | null,
		leftChevron: HTMLElement | null,
		rightChevron: HTMLElement | null,
	): void {
		const tolerance = 1;
		const hasOverflow = el.scrollWidth > el.clientWidth;
		if(!hasOverflow) {
			leftFade?.classList.remove('visible');
			rightFade?.classList.remove('visible');
			leftChevron?.classList.remove('visible');
			rightChevron?.classList.remove('visible');
			return;
		}
		const atLeft = el.scrollLeft <= 0;
		const atRight = el.scrollLeft + el.clientWidth + tolerance >= el.scrollWidth;

		leftFade?.classList.toggle('visible', !atLeft);
		rightFade?.classList.toggle('visible', !atRight);
		leftChevron?.classList.toggle('visible', !atLeft);
		rightChevron?.classList.toggle('visible', !atRight);
	}
}

// OKLCH color type for internal use
interface OklchColor {
	l: number;
	c: number;
	h: number;
}

interface ScrollableElementInfo {
    element: HTMLElement;
    scrollTopAtStart: number;
    scrollHeight: number;
    clientHeight: number;
    // Horizontal scroll info
    scrollLeftAtStart: number;
    scrollWidth: number;
    clientWidth: number;
    isHorizontallyScrollable: boolean;
}

// mirrored in Enums.cs
enum AnchorPoint {
	Center,
	TopLeft,
	TopRight,
	BottomLeft,
	BottomRight,
	Left,
	Top,
	Right,
	Bottom,
}

// mirrored in BaseDrawer.razor
enum DrawerPosition {
	Left,
	Right,
	Top,
	Bottom
}

// mostly built by ChatGPT
class ExistenceDependencyManager {
	/**
	 * A registry mapping parentId -> { parentEl, childEl }.
	 */
	private existenceDependencies: Map<string, { parentEl: HTMLElement; childEl: HTMLElement }>;

	/**
	 * The single MutationObserver.
	 */
	private observer: MutationObserver;

	/**
	 * Queue of mutation records accumulated between debounced checks.
	 */
	private pendingMutations: MutationRecord[];

	/**
	 * ID for the debounce timer (used by clearTimeout).
	 */
	private debounceTimerId: number | null;

	/**
	 * How many milliseconds to wait before processing new mutations.
	 */
	private static readonly DEBOUNCE_INTERVAL = 50;

	/**
	 * Private constructor to enforce singleton usage (optional).
	 */
	constructor() {
		this.existenceDependencies = new Map();
		this.pendingMutations = [];
		this.debounceTimerId = null;

		// Create and configure the MutationObserver
		this.observer = new MutationObserver((mutations) => {
			// Accumulate mutations
			this.pendingMutations.push(...mutations);
			// Trigger a debounced check
			this.scheduleDebouncedCheck();
		});

		// Observe the whole document body for subtree changes
		this.observer.observe(document.body, {childList: true, subtree: true});
	}

	/**
	 * Schedules (debounces) the parent-removal check to ensure
	 * we do not process more than 5 times per second.
	 */
	private scheduleDebouncedCheck(): void {
		// If there's already a scheduled check, clear it
		if(this.debounceTimerId !== null) {
			clearTimeout(this.debounceTimerId);
		}
		// Schedule a new check after the debounce interval
		this.debounceTimerId = window.setTimeout(() => {
			this.runCheck();
			// Reset timer and pending mutations
			this.debounceTimerId = null;
		}, ExistenceDependencyManager.DEBOUNCE_INTERVAL);
	}

	/**
	 * Processes all pending mutations, removing any child whose parent is gone.
	 */
	private runCheck(): void {
		// We gather and clear local mutations up front.
		const mutationsToProcess = this.pendingMutations.slice();
		this.pendingMutations = [];

		// For each mutation record, we only check its removed nodes
		for(const mutation of mutationsToProcess) {
			for(const removedNode of Array.from(mutation.removedNodes)) {
				if(removedNode.nodeType === Node.ELEMENT_NODE) {
					const removedEl = removedNode as HTMLElement;

					// We'll convert the map to an array because
					// we may delete entries during iteration.
					for(const [parentId, {parentEl, childEl}] of Array.from(this.existenceDependencies)) {
						// If the removed node is the parent OR it contains the parent in its subtree...
						if(removedEl === parentEl || removedEl.contains(parentEl)) {
							// Remove the child if it’s still in DOM
							if(childEl.parentNode) {
								childEl.remove();
							}
							// Unregister this dependency
							this.existenceDependencies.delete(parentId);
						}
					}
				}
			}
		}
	}

	/**
	 * Registers a parent-child relationship:
	 * When the parent is removed from the DOM, the child is also removed.
	 */
	public enforceExistenceDependence(parentId: string, childId: string): void {
		const parentEl = document.getElementById(parentId);
		const childEl = document.getElementById(childId);

		if(!parentEl || !childEl) {
			console.warn(
				`enforceExistenceDependence: Could not find parent "${parentId}" or child "${childId}".`
			);
			return;
		}

		// Store the relationship in the registry
		this.existenceDependencies.set(parentId, {parentEl, childEl});
	}
}

export const venusUtils: VenusUtils = new VenusUtils();

// Initialize keyboard nav lock provider for cross-module access (e.g., VulcanUtils)
venusUtils.initKeyboardNavLockProvider();

// @ts-ignore
globalThis.venusUtils = venusUtils;

// Global function for TabbedPanel scroll indicators
// @ts-ignore
globalThis.tabbedPanelGetScrollInfo = (elementId: string) => {
	const element = document.getElementById(elementId);
	if(!element) return null;
	return {
		scrollLeft: element.scrollLeft,
		scrollWidth: element.scrollWidth,
		clientWidth: element.clientWidth
	};
};

// Global function for TabbedPanel scroll by amount
// @ts-ignore
globalThis.tabbedPanelScroll = (elementId: string, amount: number) => {
	const element = document.getElementById(elementId);
	if(!element) return;
	element.scrollBy({ left: amount, behavior: 'smooth' });
};
