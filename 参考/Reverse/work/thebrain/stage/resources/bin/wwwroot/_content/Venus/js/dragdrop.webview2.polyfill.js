/**
 *
 * Polyfill for WebView2 Drag and Drop Bug
 *
 * From https://gist.github.com/iain-fraser/01d35885477f4e29a5a638364040d4f2
 *
 * Includes suggested changes from:
 * - ZackMitkin (fix clicking)
 * - bicarlsen (enable dragenter and dragleave events)
 *
 * Modifications by Harlan Hugh, 2025-05-21
 * - Added support for lock-x-drag and lock-y-drag classes
 * - Fixed: clientX and clientY are not set on mock events
 * - Fixed: drag sometimes causes background objects to get selected
 * - Added threshold for minimum drag distance
 * - Added support for setting the opacity of the ghost element (and fix how it is applied)
 * - Switched from mouse to pointer events for touch support
 *
 * This polyfill patches a known bug in WebView2 where drag and drop functionalities are
 * not working as expected. This script provides a mock implementation to temporarily
 * overcome the issue.
 *
 * More information:
 * - https://github.com/MicrosoftEdge/WebView2Feedback/issues/2805
 * - https://github.com/dotnet/maui/issues/2205
 *
 *
 * Developers integrating this polyfill should implement their own feature detection or
 * settings toggle to decide when to apply this fix.
 *
 * Copyright (c) 2023 Iain Fraser
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
(function (opts) {

	const minDragDistance = 5; // Minimum distance to consider a drag action
	const ghostOpacity = 1; // Opacity of the ghost element

	let isDragging = false;
	let draggedElement = null;
	let startPosition = { x: 0, y: 0 };
	let currentOverElement = null;
	let maxDistanceDragged = 0;
	let ghostElement = null;
	let dataTransfer = null; // create global data transfer object to persist state
	let lastTouchX = 0;
	let lastTouchY = 0;

	/**
	 * Searches for the nearest ancestor of the provided element that has the draggable attribute set to true.
	 * @param {HTMLElement} element - The starting element to begin the search from.
	 * @returns {HTMLElement|null} - The draggable ancestor if found, otherwise null.
	 */
	function findDraggableAncestor(element) {
		while (element && element !== document.body) {
			if (element.getAttribute('draggable') === 'true') {
				return element;
			}
			element = element.parentElement;
		}
		return null;
	}

	/**
	 * Mock DataTransfer class mimicking the DataTransfer object available in drag & drop operations.
	 */
	function MockDataTransfer() {
		this.dropEffect = 'move';
		this.effectAllowed = 'all';
		this.files = [];
		this.items = [];
		this.types = [];
		this.setData = function (format, data) {
			this.items.push({ format, data });
			this.types.push(format);
		};
		this.getData = function (format) {
			let item = this.items.find(i => i.format === format);
			return item ? item.data : '';
		};
		this.clearData = function (format) {
			this.items = this.items.filter(i => i.format !== format);
			this.types = this.types.filter(t => t !== format);
		};
	}

	/**
	 * Creates a mock drag event.
	 * @param {string} type - The type of the drag event (e.g., "dragstart", "dragend", etc.)
	 * @param {Object} options - Options to be passed to the event.
	 * @returns {Event} - A mocked drag event.
	 */
	function createMockDragEvent(type, options) {
		let event = new Event(type, options);
		if (!dataTransfer) {
			dataTransfer = new MockDataTransfer();
		}
		event.dataTransfer = dataTransfer;
		// Pull in the clientX and clientY from the options if present
		if(options.clientX && options.clientY) {
			event.clientX = options.clientX;
			event.clientY = options.clientY;
		}
		return event;
	}

	if (opts.setPointerCursor) {
		const styleTag = document.createElement('style');
		styleTag.textContent = '[draggable="true"] { cursor: pointer; }';

		// Insert the style tag as the first child of the head element
		const head = document.head;
		if (head.children.length > 0) {
			head.insertBefore(styleTag, head.children[0]);
		} else {
			head.appendChild(styleTag);
		}
	}

	document.addEventListener('touchstart', function (e) {
		if(e.touches.length > 1) return;
		e.clientX = e.touches[0].clientX;
		e.clientY = e.touches[0].clientY;
		handlePointerDown(e);
	});

	document.addEventListener('mousedown', function (e) {
		if (e.button !== 0) return;
		handlePointerDown(e);
	});
	
	function handlePointerDown(e) {

		draggedElement = findDraggableAncestor(e.target);

		if (!draggedElement) return;

		e.preventDefault();
		e.stopPropagation();

		// Override the existing functionality
		draggedElement.setAttribute('draggable', 'false');

		// Update state for dragging
		isDragging = true;
		document.body.classList.add('select-none');
		
		startPosition.x = e.clientX;
		startPosition.y = e.clientY;
		maxDistanceDragged = 0;
		
		if(venusUtils) {
			// request C# tracking of cursor movement outside of the browser
			venusUtils.requestCursorTracking();
		}
	}

	document.addEventListener('touchmove', function (e) {
		e.clientX = e.touches[0].clientX;
		e.clientY = e.touches[0].clientY;
		lastTouchX = e.clientX;
		lastTouchY = e.clientY;
		handlePointerMove(e);
	});

	document.addEventListener('mousemove', function (e) {
		handlePointerMove(e);
	});

	function handlePointerMove(e) {

		if (!isDragging || !draggedElement) return;

		let clientX = e.clientX;
		let clientY = e.clientY;

		let deltaX = clientX - startPosition.x;
		let deltaY = clientY - startPosition.y;
		maxDistanceDragged = Math.max(maxDistanceDragged, Math.sqrt(deltaX * deltaX + deltaY * deltaY));

		if(maxDistanceDragged < minDragDistance) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		if(!ghostElement) {
			// Create a "ghost" clone for visual dragging
			ghostElement = draggedElement.cloneNode(true);
			ghostElement.classList.add('drag-ghost');
			applyStylesToGhost(draggedElement, ghostElement);

			// Fire dragstart event
			draggedElement.dispatchEvent(createMockDragEvent('dragstart', {
				bubbles: true,
				cancelable: true,
				clientX: e.clientX,
				clientY: e.clientY
			}));
		}

		// Lock dragging to x or y axis if classes are present
		let lockedX = clientX;
		if(draggedElement.classList.contains('lock-x-drag')) {
			lockedX = startPosition.x;
		}
		let lockedY = clientY;
		if(draggedElement.classList.contains('lock-y-drag')) {
			lockedY = startPosition.y;
		}
		deltaX = lockedX - startPosition.x;
		deltaY = lockedY - startPosition.y;

		// Update ghost position
		ghostElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
		
		// Check for drag over target
		ghostElement.style.display = 'none';
		let elementBelow = document.elementFromPoint(clientX, clientY);
		ghostElement.style.display = '';

		if (!elementBelow) {
			// If no element is found, use the document body as the target (these messages can be fed in from the C# side)
			elementBelow = document;
		}
	
		elementBelow.dispatchEvent(createMockDragEvent('dragover', {
			bubbles: true,
			cancelable: true,
			clientX: clientX,
			clientY: clientY
		}));

		if (elementBelow !== currentOverElement) {
			if (currentOverElement) {
				currentOverElement.dispatchEvent(
					createMockDragEvent("dragleave", {
						bubbles: true,
						cancelable: true,
						clientX: e.clientX,
						clientY: e.clientY,
					})
				);
			}

			elementBelow.dispatchEvent(
				createMockDragEvent("dragenter", {
					bubbles: true,
					cancelable: true,
					clientX: e.clientX,
					clientY: e.clientY,
				})
			);
			currentOverElement = elementBelow;
		}

		currentOverElement = elementBelow;
	}

	document.addEventListener('touchend', function (e) {
		e.clientX = lastTouchX;
		e.clientY = lastTouchY;
		handlePointerUp(e);
	});

	document.addEventListener('pointerup', function (e) {
		if(e.button !== 0) return;
		handlePointerUp(e);
	});

	function handlePointerUp(e) {
		
		if (!isDragging) return;

		if(maxDistanceDragged >= minDragDistance) {

			e.preventDefault();
			e.stopPropagation();

			// Fire drop event if we have a target
			if (currentOverElement) {
				currentOverElement.dispatchEvent(createMockDragEvent('drop', {
					bubbles: true,
					cancelable: true,
					clientX: e.clientX,
					clientY: e.clientY
				}));
			}

			// Fire dragend event
			draggedElement.dispatchEvent(createMockDragEvent('dragend', {
				bubbles: true,
				cancelable: true,
				clientX: e.clientX,
				clientY: e.clientY
			}));
		}

		// Cleanup
		if(draggedElement) {
			draggedElement.setAttribute('draggable', 'true');
		}
		draggedElement = null;
		isDragging = false;
		document.body.classList.remove('select-none');
		
		currentOverElement = null;
		if(ghostElement) {
			document.body.removeChild(ghostElement);
		}
		ghostElement = null;
		
		if(venusUtils) {
			// Stop receiving cursor tracking updates from outside the browser
			venusUtils.releaseCursorTracking();
		}
	}

	/**
	 * Forces cleanup of the current drag operation (can be called externally)
	 */
	function forceDragCleanup() {
		if (!isDragging) return;
		
		console.log('Polyfill: Force cleaning up drag operation');
		
		// Cleanup without firing drop event
		if(draggedElement) {
			draggedElement.setAttribute('draggable', 'true');
		}
		draggedElement = null;
		isDragging = false;
		document.body.classList.remove('select-none');
		
		currentOverElement = null;
		if(ghostElement) {
			document.body.removeChild(ghostElement);
		}
		ghostElement = null;
		
		if(venusUtils) {
			venusUtils.releaseCursorTracking();
		}
	}

	// Expose force cleanup function globally
	window.forceDragCleanup = forceDragCleanup;

	/**
	 * Applies computed styles from the original element to the ghost element.
	 * @param {HTMLElement} original - The original draggable element.
	 * @param {HTMLElement} ghost - The cloned "ghost" element.
	 */
	function applyStylesToGhost(original, ghost) {
		let computedStyles = window.getComputedStyle(original);
		for (let prop of computedStyles) {
			ghost.style[prop] = computedStyles[prop];
		}

		// Positioning and z-index
		let rect = original.getBoundingClientRect();
		ghost.style.position = 'fixed';
		ghost.style.left = `${rect.left}px`;
		ghost.style.top = `${rect.top - 4}px`;
		ghost.style.zIndex = '1000';

		if (ghostOpacity != 1) {
			const currentOpacity = ghost.style.opacity.length > 0 ? parseFloat(ghost.style.opacity) : 1;
			ghost.style.opacity = (currentOpacity * 0.7).toString();
		}

		document.body.appendChild(ghost);
	}

})({ setPointerCursor: true });
