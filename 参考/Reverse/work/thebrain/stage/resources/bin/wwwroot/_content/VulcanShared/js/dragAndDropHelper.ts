import {safeInvoke, safeInvokeAsync} from "./interop.js";

/**
 * Checks if we're running in Electron (NodeIntegration enabled)
 */
function isElectron(): boolean {
	try {
		return !!(window as any).require?.('electron');
	} catch {
		return false;
	}
}

/**
 * True only inside Electron on Linux. On Linux, Chromium delivers external file
 * drags from native apps (Nautilus, etc.) with a restrictive dataTransfer.effectAllowed
 * (often just 'copy'). When we set dropEffect to 'move' or 'link' against that,
 * Chromium silently cancels the drop — drop event never fires. We work around this
 * by overriding effectAllowed='all' on the receiver side and clamping dropEffect
 * to a permitted value if needed.
 */
function isLinuxElectron(): boolean {
	return isElectron() && navigator.platform.toLowerCase().includes('linux');
}

/**
 * Gets the ipcRenderer module for Electron IPC
 */
function getIpcRenderer(): any {
	try {
		const electron = (window as any).require?.('electron');
		return electron?.ipcRenderer;
	} catch {
		return null;
	}
}

/**
 * Gets the system file icon as a data URL from the main process
 * @param filePath - Path to the file to get icon for
 * @returns Promise resolving to data URL or null
 */
async function getSystemFileIcon(filePath: string): Promise<string | null> {
	try {
		const ipcRenderer = getIpcRenderer();
		if (ipcRenderer?.invoke) {
			return await ipcRenderer.invoke('get-file-icon', filePath);
		}
	} catch (e) {
		console.log('Could not get system file icon:', e);
	}
	return null;
}

/**
 * Draws a drag icon on a canvas context (shared by sync and async versions)
 * @param ctx - Canvas 2D rendering context
 * @param iconX - X position for the icon
 * @param iconY - Y position for the icon
 * @param iconSize - Size of the icon
 * @param dragType - Type of item being dragged: 'file', 'folder', or 'url'
 */
function drawDragIcon(ctx: CanvasRenderingContext2D, iconX: number, iconY: number, iconSize: number, dragType: string): void {
	const s = iconSize / 24; // Scale factor from base 24px icons
	ctx.save();

	if (dragType === 'folder') {
		// Folder icon - macOS style
		const r = 2*s; // corner radius

		// Main folder body
		ctx.fillStyle = '#F5C242';
		ctx.beginPath();
		ctx.roundRect(iconX, iconY + 4*s, iconSize, iconSize - 5*s, r);
		ctx.fill();

		// Tab (top left) - drawn as a path that merges with body
		ctx.beginPath();
		ctx.moveTo(iconX + r, iconY + 1*s);
		ctx.lineTo(iconX + 9*s, iconY + 1*s);
		ctx.lineTo(iconX + 11*s, iconY + 4*s);
		ctx.lineTo(iconX + r, iconY + 4*s);
		ctx.quadraticCurveTo(iconX, iconY + 4*s, iconX, iconY + 4*s - r);
		ctx.lineTo(iconX, iconY + 1*s + r);
		ctx.quadraticCurveTo(iconX, iconY + 1*s, iconX + r, iconY + 1*s);
		ctx.closePath();
		ctx.fill();

		// Subtle top edge highlight
		ctx.fillStyle = '#E5B23A';
		ctx.fillRect(iconX + 1*s, iconY + 4*s, iconSize - 2*s, 2*s);
	} else if (dragType === 'url') {
		// Globe/web icon
		ctx.strokeStyle = '#5B9FE6';
		ctx.lineWidth = 1.8 * s;

		const cx = iconX + iconSize / 2;
		const cy = iconY + iconSize / 2;
		const r = iconSize * 0.4;

		// Outer circle
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();

		// Vertical ellipse (meridian)
		ctx.beginPath();
		ctx.ellipse(cx, cy, r * 0.4, r, 0, 0, Math.PI * 2);
		ctx.stroke();

		// Horizontal line (equator)
		ctx.beginPath();
		ctx.moveTo(cx - r, cy);
		ctx.lineTo(cx + r, cy);
		ctx.stroke();
	} else {
		// File icon - white/gray document
		ctx.fillStyle = '#E8E8EC';
		const docLeft = iconX + 2*s;
		const docTop = iconY + 1*s;
		const docWidth = iconSize - 4*s;
		const docHeight = iconSize - 2*s;
		const foldSize = 5*s;
		ctx.beginPath();
		ctx.moveTo(docLeft, docTop);
		ctx.lineTo(docLeft + docWidth - foldSize, docTop);
		ctx.lineTo(docLeft + docWidth, docTop + foldSize);
		ctx.lineTo(docLeft + docWidth, docTop + docHeight);
		ctx.lineTo(docLeft, docTop + docHeight);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#B8B8BC';
		ctx.beginPath();
		ctx.moveTo(docLeft + docWidth - foldSize, docTop);
		ctx.lineTo(docLeft + docWidth - foldSize, docTop + foldSize);
		ctx.lineTo(docLeft + docWidth, docTop + foldSize);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#A0A0A4';
		ctx.fillRect(docLeft + 3*s, docTop + 8*s, docWidth - 6*s, 1.5*s);
		ctx.fillRect(docLeft + 3*s, docTop + 11*s, docWidth - 8*s, 1.5*s);
	}
	ctx.restore();
}

/**
 * Creates a custom drag image synchronously (for use with setDragImage which must be called synchronously)
 * @param title - The title/name to display
 * @param dragType - Type of item being dragged: 'file', 'folder', or 'url'
 * @returns Object with HTML element suitable for setDragImage and logical size
 */
function createDragImageSync(title: string, dragType: string): { element: HTMLElement; logicalSize: { width: number; height: number } } {
	const iconSize = 20;
	const padding = 6;
	const fontSize = 12;
	const maxCanvasWidth = 140;
	const canvasHeight = iconSize + padding * 2;
	const dpr = window.devicePixelRatio || 1;

	const textStartX = padding + iconSize + 4;
	const maxTextWidth = maxCanvasWidth - textStartX - padding;

	const canvas = document.createElement('canvas');
	canvas.width = maxCanvasWidth * dpr;
	canvas.height = canvasHeight * dpr;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);

	// Measure and truncate text
	ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	let displayTitle = title;
	let textMetrics = ctx.measureText(displayTitle);

	if (textMetrics.width > maxTextWidth) {
		while (displayTitle.length > 1) {
			displayTitle = displayTitle.slice(0, -1);
			textMetrics = ctx.measureText(displayTitle + '...');
			if (textMetrics.width <= maxTextWidth) {
				displayTitle += '...';
				break;
			}
		}
		textMetrics = ctx.measureText(displayTitle);
	}

	const actualTextWidth = Math.ceil(textMetrics.width);
	const actualCanvasWidth = Math.min(maxCanvasWidth, textStartX + actualTextWidth + padding);

	// Resize canvas
	canvas.width = actualCanvasWidth * dpr;
	canvas.height = canvasHeight * dpr;
	ctx.scale(dpr, dpr);

	// Draw rounded rectangle background
	const radius = 8;
	ctx.fillStyle = 'rgba(50, 50, 55, 0.95)';
	ctx.beginPath();
	ctx.moveTo(radius, 0);
	ctx.lineTo(actualCanvasWidth - radius, 0);
	ctx.quadraticCurveTo(actualCanvasWidth, 0, actualCanvasWidth, radius);
	ctx.lineTo(actualCanvasWidth, canvasHeight - radius);
	ctx.quadraticCurveTo(actualCanvasWidth, canvasHeight, actualCanvasWidth - radius, canvasHeight);
	ctx.lineTo(radius, canvasHeight);
	ctx.quadraticCurveTo(0, canvasHeight, 0, canvasHeight - radius);
	ctx.lineTo(0, radius);
	ctx.quadraticCurveTo(0, 0, radius, 0);
	ctx.closePath();
	ctx.fill();

	// Draw border
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
	ctx.lineWidth = 1;
	ctx.stroke();

	// Draw icon
	drawDragIcon(ctx, padding, padding, iconSize, dragType);

	// Draw title
	ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
	ctx.textBaseline = 'middle';
	ctx.fillText(displayTitle, textStartX, canvasHeight / 2 + 1);

	// Create a div element with the canvas as background image for setDragImage
	// (canvas elements don't always work reliably with setDragImage in Chromium)
	const dragElement = document.createElement('div');
	dragElement.style.cssText = `
		position: fixed;
		top: -1000px;
		left: -1000px;
		width: ${actualCanvasWidth}px;
		height: ${canvasHeight}px;
		background-image: url(${canvas.toDataURL('image/png')});
		background-size: contain;
		pointer-events: none;
	`;
	document.body.appendChild(dragElement);

	// Clean up the element after drag ends (give it time to be used)
	setTimeout(() => {
		dragElement.remove();
	}, 5000);

	return {
		element: dragElement,
		logicalSize: { width: actualCanvasWidth, height: canvasHeight }
	};
}

/**
 * Creates a custom drag image with icon and title using browser Canvas
 * @param title - The title/name to display
 * @param dragType - Type of item being dragged: 'file', 'folder', or 'url'
 * @param systemIconDataUrl - Optional system file icon data URL to use instead of generic icon
 * @returns Promise resolving to object with data URL and logical size for HiDPI support
 */
async function createDragImageDataUrl(title: string, dragType: string, systemIconDataUrl?: string | null): Promise<{ dataUrl: string; logicalSize: { width: number; height: number } }> {
	const iconSize = 20;
	const padding = 6;
	const fontSize = 12;
	// Fixed maximum canvas width - Windows crops larger images from the left
	const maxCanvasWidth = 140;
	const canvasHeight = iconSize + padding * 2;

	// Handle HiDPI/Retina displays - render at higher resolution, then resize in main process
	const dpr = window.devicePixelRatio || 1;

	// Calculate available space for text (after icon and padding)
	const textStartX = padding + iconSize + 4;
	const maxTextWidth = maxCanvasWidth - textStartX - padding;

	// Create canvas at scaled resolution for sharp rendering on HiDPI displays
	const canvas = document.createElement('canvas');
	canvas.width = maxCanvasWidth * dpr;
	canvas.height = canvasHeight * dpr;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);

	// Measure and truncate text to fit available space
	ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	let displayTitle = title;
	let textMetrics = ctx.measureText(displayTitle);

	if (textMetrics.width > maxTextWidth) {
		// Truncate with ellipsis
		while (displayTitle.length > 1) {
			displayTitle = displayTitle.slice(0, -1);
			textMetrics = ctx.measureText(displayTitle + '...');
			if (textMetrics.width <= maxTextWidth) {
				displayTitle += '...';
				break;
			}
		}
		textMetrics = ctx.measureText(displayTitle);
	}

	// Calculate actual canvas width needed (shrink to fit short names)
	const actualTextWidth = Math.ceil(textMetrics.width);
	const actualCanvasWidth = Math.min(maxCanvasWidth, textStartX + actualTextWidth + padding);

	// Resize canvas to actual needed width (accounting for HiDPI)
	canvas.width = actualCanvasWidth * dpr;
	canvas.height = canvasHeight * dpr;
	ctx.scale(dpr, dpr);

	// Draw rounded rectangle background
	const radius = 8;
	ctx.fillStyle = 'rgba(50, 50, 55, 0.95)';
	ctx.beginPath();
	ctx.moveTo(radius, 0);
	ctx.lineTo(actualCanvasWidth - radius, 0);
	ctx.quadraticCurveTo(actualCanvasWidth, 0, actualCanvasWidth, radius);
	ctx.lineTo(actualCanvasWidth, canvasHeight - radius);
	ctx.quadraticCurveTo(actualCanvasWidth, canvasHeight, actualCanvasWidth - radius, canvasHeight);
	ctx.lineTo(radius, canvasHeight);
	ctx.quadraticCurveTo(0, canvasHeight, 0, canvasHeight - radius);
	ctx.lineTo(0, radius);
	ctx.quadraticCurveTo(0, 0, radius, 0);
	ctx.closePath();
	ctx.fill();

	// Draw subtle border
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
	ctx.lineWidth = 1;
	ctx.stroke();

	// Draw icon
	const iconX = padding;
	const iconY = padding;

	// Try to use system icon if provided
	let drewSystemIcon = false;
	if (systemIconDataUrl) {
		try {
			const img = new Image();
			// Load image synchronously by drawing after it's loaded
			await new Promise<void>((resolve, reject) => {
				img.onload = () => {
					ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
					drewSystemIcon = true;
					resolve();
				};
				img.onerror = reject;
				img.src = systemIconDataUrl;
			});
		} catch (e) {
			console.log('Could not draw system icon, using fallback');
		}
	}

	// Fall back to drawing generic icon if system icon not available
	if (!drewSystemIcon) {
		drawDragIcon(ctx, iconX, iconY, iconSize, dragType);
	}

	// Draw the title text (add 1px offset to visually center - canvas middle baseline renders slightly high)
	ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
	ctx.textBaseline = 'middle';
	ctx.fillText(displayTitle, textStartX, canvasHeight / 2 + 1);

	return {
		dataUrl: canvas.toDataURL('image/png'),
		logicalSize: { width: actualCanvasWidth, height: canvasHeight }
	};
}

/**
 * Checks if a tab drag operation is currently in progress
 * @returns true if a tab is being dragged, false otherwise
 */
function isTabDragInProgress(): boolean {
	return (globalThis as any).venusUtils?.currentDragTabBarId != null;
}

/**
 * Recursively walks a directory entry and collects all files with their relative paths
 * @param entry - The directory entry to walk
 * @param basePath - The base path for relative path calculation
 * @returns Promise<Array> - Array of file objects with metadata
 */
async function walkDirectoryEntry(entry: any, basePath: string = ''): Promise<any[]> {
	const files: any[] = [];
	
	if (entry.isFile) {
		// Get the File object for this entry
		const file = await new Promise<File>((resolve, reject) => {
			(entry as any).file(resolve, reject);
		});
		
		files.push({
			file: file,
			name: file.name,
			relativePath: basePath + file.name,
			size: file.size,
			lastModified: file.lastModified
		});
	} else if (entry.isDirectory) {
		// Read directory contents
		const reader = (entry as any).createReader();
		const entries = await new Promise<any[]>((resolve, reject) => {
			reader.readEntries(resolve, reject);
		});
		
		// Recursively process each entry
		for (const childEntry of entries) {
			const childFiles = await walkDirectoryEntry(childEntry, basePath + entry.name + '/');
			files.push(...childFiles);
		}
	}
	
	return files;
}

/**
 * Processes dropped items and handles both files and directories
 * @param items - DataTransferItemList from drop event
 * @returns Promise<{allFiles: File[], fileInfos: any[], isFolderDrop: boolean}>
 */
async function processDroppedItems(items: DataTransferItemList): Promise<{allFiles: File[], fileInfos: any[], isFolderDrop: boolean}> {
	const allFiles: File[] = [];
	const fileInfos: any[] = [];
	let isFolderDrop = false;
	
	// First, collect all entries before any async operations to avoid DataTransferItemList invalidation
	const entries: any[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item.webkitGetAsEntry) {
			const entry = item.webkitGetAsEntry();
			if (entry) {
				entries.push(entry);
				if (entry.isDirectory) {
					isFolderDrop = true;
				}
			}
		}
	}
	
	// Now process all collected entries
	for (const entry of entries) {
		if (entry.isDirectory) {
			const directoryFiles = await walkDirectoryEntry(entry);
			for (const fileObj of directoryFiles) {
				allFiles.push(fileObj.file);
				fileInfos.push({
					name: fileObj.name,
					relativePath: fileObj.relativePath,
					size: fileObj.size,
					lastModified: fileObj.lastModified,
					isFromFolder: true
				});
			}
		} else if (entry.isFile) {
			// Handle individual files
			const file = await new Promise<File>((resolve, reject) => {
				(entry as any).file(resolve, reject);
			});
			allFiles.push(file);
			fileInfos.push({
				name: file.name,
				relativePath: file.name,
				size: file.size,
				lastModified: file.lastModified,
				isFromFolder: false
			});
		}
	}
	
	return { allFiles, fileInfos, isFolderDrop };
}

/**
 * Initializes a drop zone with direct text/URL handling that takes precedence over files.
 * Called from DropZone.razor during component initialization.
 *
 * @param dotNetRef - Reference to the DropZone component
 * @param zone - The zone identifier (e.g., "parent", "child", "jump", "active")
 * @param inputFileId - The ID of the hidden InputFile element used for file drops
 */
export function initDropZone(dotNetRef: any, zone: string, inputFileId: string): void {
	const element = document.querySelector(`[data-zone="${zone}"]`) as HTMLElement;
	if(!element) {
		console.warn(`Drop zone element not found for zone: ${zone}`);
		return;
	}

	// Remove any existing listeners to prevent duplicates
	if((element as any)._dragEnterHandler) {
		element.removeEventListener('dragenter', (element as any)._dragEnterHandler);
	}
	if((element as any)._dragOverHandler) {
		element.removeEventListener('dragover', (element as any)._dragOverHandler);
	}
	if((element as any)._dragLeaveHandler) {
		element.removeEventListener('dragleave', (element as any)._dragLeaveHandler);
	}
	if((element as any)._dropHandler) {
		element.removeEventListener('drop', (element as any)._dropHandler);
	}

	// Create and store the dragenter handler
	(element as any)._dragEnterHandler = function(e: DragEvent) {
		// Don't show feedback if we're dragging a tab
		if(isTabDragInProgress()) {
			return;
		}

		// Check if we have text/URL data types, files/directories, or attachments
		const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
			e.dataTransfer?.types.includes('text/plain');
		const hasFiles = e.dataTransfer?.types.includes('Files');

		if(hasTextData || hasFiles) {
			e.preventDefault();
			e.stopPropagation();
			// Trigger visual feedback for text or file drops
			showPlexZoneFeedback(zone);
		}
	};

	// Create and store the dragover handler to prevent default browser behavior
	(element as any)._dragOverHandler = function(e: DragEvent) {
		// Don't show feedback if we're dragging a tab
		if(isTabDragInProgress()) {
			return;
		}

		// Check if we have text/URL data types, files/directories, or attachments
		const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
			e.dataTransfer?.types.includes('text/plain');
		const hasFiles = e.dataTransfer?.types.includes('Files');

		if(hasTextData || hasFiles) {
			e.preventDefault(); // This is crucial for allowing drops in browsers
			e.stopPropagation();
		}
	};

	// Create and store the dragleave handler
	(element as any)._dragLeaveHandler = function(e: DragEvent) {
		// Don't show feedback if we're dragging a tab
		if(isTabDragInProgress()) {
			return;
		}

		// Check if we have text/URL data types, files/directories, or attachments
		const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
			e.dataTransfer?.types.includes('text/plain');
		const hasFiles = e.dataTransfer?.types.includes('Files');

		if(hasTextData || hasFiles) {
			// Only trigger leave if we're actually leaving the element (not just moving to a child)
			const rect = element.getBoundingClientRect();
			const isOutside = e.clientX < rect.left || e.clientX > rect.right ||
				e.clientY < rect.top || e.clientY > rect.bottom;

			if(isOutside) {
				hidePlexZoneFeedback(zone);
			}
		}
	};

	// Create and store the drop handler
	(element as any)._dropHandler = async function(e: DragEvent) {
		try {
			// Check for text/URL data
			const textData = e.dataTransfer?.getData('text/uri-list') ||
				e.dataTransfer?.getData('text/plain') || '';
			const hasFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0;

			// If we have text data, handle it and prevent InputFile from processing
			if(textData) {
				e.preventDefault();
				e.stopPropagation();
				await safeInvokeAsync(dotNetRef, 'HandleDrop', [zone, textData, hasFiles, '[]']);
				return;
			}

			// If we have files or directories, process them
			if(hasFiles || (e.dataTransfer!.items && e.dataTransfer!.items.length > 0)) {
				e.preventDefault();
				e.stopPropagation();

				// Process all dropped items (files and directories)
				const { allFiles, fileInfos, isFolderDrop } = await processDroppedItems(e.dataTransfer!.items);
				
				// Create JSON with complete file structure
				const filePathsJson = JSON.stringify(fileInfos);

				await safeInvokeAsync(dotNetRef, 'HandleDrop', [zone, '', allFiles.length > 0, filePathsJson]);
				
				// Find the hidden InputFile element
				const inputFile = document.getElementById(inputFileId) as HTMLInputElement;
				if(inputFile) {
					// Create a new DataTransfer object and add all discovered files
					const dataTransfer = new DataTransfer();
					allFiles.forEach(file => {
						dataTransfer.items.add(file);
					});

					// Set the files on the input element
					inputFile.files = dataTransfer.files;

					// Trigger the change event
					const changeEvent = new Event('change', {bubbles: true});
					inputFile.dispatchEvent(changeEvent);
				}
				
				return;
			}

			// Hide visual feedback after drop
		} catch(error) {
			console.error('Drop handling error in zone', zone, ':', error);
		} finally {
			hidePlexZoneFeedback(zone);
		}
	};

	// Attach the event listeners
	element.addEventListener('dragenter', (element as any)._dragEnterHandler);
	element.addEventListener('dragover', (element as any)._dragOverHandler);
	element.addEventListener('dragleave', (element as any)._dragLeaveHandler);
	element.addEventListener('drop', (element as any)._dropHandler);
}

/**
 * Initializes visual feedback for upload controls during drag operations.
 * Adds/removes the 'drop-hovered' class on the feedback div when dragging files over the InputFile.
 *
 * @param inputFileId - The ID of the InputFile element
 */
export function initUploadControlFeedback(inputFileId: string): void {
	const inputFile = document.getElementById(inputFileId) as HTMLInputElement;
	if(!inputFile) {
		console.warn(`Upload control InputFile element not found: ${inputFileId}`);
		return;
	}

	// Find the sibling feedback div
	const container = inputFile.parentElement;
	const feedbackDiv = container?.querySelector('.upload-control-feedback') as HTMLElement;
	if(!feedbackDiv) {
		console.warn(`Upload control feedback div not found for InputFile: ${inputFileId}`);
		return;
	}

	// Remove any existing listeners to prevent duplicates
	if((inputFile as any)._feedbackDragEnterHandler) {
		inputFile.removeEventListener('dragenter', (inputFile as any)._feedbackDragEnterHandler);
	}
	if((inputFile as any)._feedbackDragOverHandler) {
		inputFile.removeEventListener('dragover', (inputFile as any)._feedbackDragOverHandler);
	}
	if((inputFile as any)._feedbackDragLeaveHandler) {
		inputFile.removeEventListener('dragleave', (inputFile as any)._feedbackDragLeaveHandler);
	}
	if((inputFile as any)._feedbackDropHandler) {
		inputFile.removeEventListener('drop', (inputFile as any)._feedbackDropHandler);
	}

	// Create and store the dragenter handler
	(inputFile as any)._feedbackDragEnterHandler = function(e: DragEvent) {
		const hasFiles = e.dataTransfer?.types.includes('Files');
		if(hasFiles) {
			feedbackDiv.classList.add('drop-hovered');
		}
	};

	// Create and store the dragover handler
	(inputFile as any)._feedbackDragOverHandler = function(e: DragEvent) {
		const hasFiles = e.dataTransfer?.types.includes('Files');
		if(hasFiles) {
			e.preventDefault(); // Crucial for allowing drops
		}
	};

	// Create and store the dragleave handler
	(inputFile as any)._feedbackDragLeaveHandler = function(e: DragEvent) {
		feedbackDiv.classList.remove('drop-hovered');
	};

	// Create and store the drop handler
	(inputFile as any)._feedbackDropHandler = function(e: DragEvent) {
		feedbackDiv.classList.remove('drop-hovered');
	};

	// Attach the event listeners
	inputFile.addEventListener('dragenter', (inputFile as any)._feedbackDragEnterHandler);
	inputFile.addEventListener('dragover', (inputFile as any)._feedbackDragOverHandler);
	inputFile.addEventListener('dragleave', (inputFile as any)._feedbackDragLeaveHandler);
	inputFile.addEventListener('drop', (inputFile as any)._feedbackDropHandler);
}

/**
 * Initializes content area drag detection that communicates with AttachmentsControl.
 * This listens for drag events on the content area and notifies the AttachmentsControl
 * to show visual feedback.
 *
 * @param dotNetRef - Reference to the AttachmentsControl component
 * @param inputFileId - The ID of the hidden InputFile element used for file drops
 */
export function initContentAreaDragDetection(dotNetRef: any, inputFileId: string): void {
	const contentAreaElement = document.getElementById('contentAreaOuter');
	if(!contentAreaElement) {
		console.warn('Content area element not found for drag detection');
		return;
	}

	// Remove any existing listeners to prevent duplicates
	if((contentAreaElement as any)._contentDragEnterHandler) {
		contentAreaElement.removeEventListener('dragenter', (contentAreaElement as any)._contentDragEnterHandler);
	}
	if((contentAreaElement as any)._contentDragOverHandler) {
		contentAreaElement.removeEventListener('dragover', (contentAreaElement as any)._contentDragOverHandler);
	}
	if((contentAreaElement as any)._contentDragLeaveHandler) {
		contentAreaElement.removeEventListener('dragleave', (contentAreaElement as any)._contentDragLeaveHandler);
	}
	if((contentAreaElement as any)._contentDropHandler) {
		contentAreaElement.removeEventListener('drop', (contentAreaElement as any)._contentDropHandler);
	}

	// Create and store the dragenter handler
	(contentAreaElement as any)._contentDragEnterHandler = function(e: DragEvent) {
		// Don't show drop zone feedback if we're reordering attachments internally
		if (attachmentDragState.draggedElement) {
			return;
		}

		// Don't show feedback if we're in the middle of a native drag operation
		if (pendingNativeDrag) {
			return;
		}

		// Don't show feedback if we're dragging a tab
		if(isTabDragInProgress()) {
			return;
		}

		// Check if we have external files or text/URL data coming in
		const hasFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0;
		const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
			e.dataTransfer?.types.includes('text/plain');

		e.preventDefault();
		e.stopPropagation();

		// Show visual feedback by adding CSS class
		const attachmentsSection = document.getElementById('attachments-section');
		if (attachmentsSection) {
			attachmentsSection.classList.add('drop-hovered');
		}
	};

	// Create and store the dragover handler
	(contentAreaElement as any)._contentDragOverHandler = function(e: DragEvent) {
		// Don't interfere if we're reordering attachments internally
		if (attachmentDragState.draggedElement) {
			return;
		}

		// Don't interfere if we're in the middle of a native drag operation
		if (pendingNativeDrag) {
			return;
		}

		// Don't show feedback if we're dragging a tab
		if(isTabDragInProgress()) {
			return;
		}

		const hasFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0;
		const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
			e.dataTransfer?.types.includes('text/plain');

		e.preventDefault();
		e.stopPropagation();
	};

	// Create and store the dragleave handler
	(contentAreaElement as any)._contentDragLeaveHandler = function(e: DragEvent) {
		// Don't trigger leave if we're reordering attachments internally
		if (attachmentDragState.draggedElement) {
			return;
		}

		// Don't trigger leave if we're in the middle of a native drag operation
		if (pendingNativeDrag) {
			return;
		}

		// Don't show feedback if we're dragging a tab
		if(isTabDragInProgress()) {
			return;
		}

		const hasFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0;
		const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
			e.dataTransfer?.types.includes('text/plain');

		// Only trigger leave if we're actually leaving the content area
		const rect = contentAreaElement.getBoundingClientRect();
		const isOutside = e.clientX < rect.left || e.clientX > rect.right ||
			e.clientY < rect.top || e.clientY > rect.bottom;

		if(isOutside) {
			// Hide visual feedback by removing CSS class
			const attachmentsSection = document.getElementById('attachments-section');
			if (attachmentsSection) {
				attachmentsSection.classList.remove('drop-hovered');
			}
		}
	};

	// Create and store the drop handler
	(contentAreaElement as any)._contentDropHandler = async function(e: DragEvent) {
		try {
			// Don't handle drops if we're reordering attachments internally
			if (attachmentDragState.draggedElement) {
				return;
			}

			const hasFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0;
			const textData = e.dataTransfer?.getData('text/uri-list') ||
				e.dataTransfer?.getData('text/plain') || '';

			// If we have text data, handle it and prevent default
			if(textData) {
				e.preventDefault();
				e.stopPropagation();
				await safeInvokeAsync(dotNetRef, 'HandleContentAreaDrop', [textData, 0]);
				return;
			}

			// If we have files or directories, process them
			if(hasFiles || (e.dataTransfer!.items && e.dataTransfer!.items.length > 0)) {
				e.preventDefault();
				e.stopPropagation();

				// Process all dropped items (files and directories)
				const { allFiles, fileInfos, isFolderDrop } = await processDroppedItems(e.dataTransfer!.items);
				
				// Create JSON with complete file structure
				const filePathsJson = JSON.stringify(fileInfos);

				// First, store the file paths data in C# BEFORE triggering InputFile change
				await safeInvokeAsync(dotNetRef, 'StoreFilePathsData', [filePathsJson]);

				// Find the hidden InputFile element
				const inputFile = document.getElementById(inputFileId) as HTMLInputElement;
				if(inputFile) {
					// Create a new DataTransfer object and add all discovered files
					const dataTransfer = new DataTransfer();
					allFiles.forEach(file => {
						dataTransfer.items.add(file);
					});

					// Set the files on the input element
					inputFile.files = dataTransfer.files;

					// Trigger the change event
					const changeEvent = new Event('change', {bubbles: true});
					inputFile.dispatchEvent(changeEvent);
				}

				await safeInvokeAsync(dotNetRef, 'HandleContentAreaDrop', ['', allFiles.length]);
			}

			// Hide visual feedback after drop
			const attachmentsSection = document.getElementById('attachments-section');
			if (attachmentsSection) {
				attachmentsSection.classList.remove('drop-hovered');
			}
		} catch(error) {
			console.error('Content area drop handling error:', error);
			// Hide visual feedback even on error
			const attachmentsSection = document.getElementById('attachments-section');
			if (attachmentsSection) {
				attachmentsSection.classList.remove('drop-hovered');
			}
		}
	};

	// Attach the event listeners
	contentAreaElement.addEventListener('dragenter', (contentAreaElement as any)._contentDragEnterHandler);
	contentAreaElement.addEventListener('dragover', (contentAreaElement as any)._contentDragOverHandler);
	contentAreaElement.addEventListener('dragleave', (contentAreaElement as any)._contentDragLeaveHandler);
	contentAreaElement.addEventListener('drop', (contentAreaElement as any)._contentDropHandler);
}

/**
 * Initializes drag detection on all ThoughtControl elements that communicates with PlexControl.
 * This enumerates all ThoughtControl elements ending with '-cur' and hooks up drag/drop listeners.
 *
 * @param dotNetRef - Reference to the PlexControl component
 * @param inputFileId - The ID of the hidden InputFile element used for file drops
 */
export function initThoughtControlDragDetection(dotNetRef: any, inputFileId: string): void {
	// Find all ThoughtControl elements that end with '-cur' (the ones shown to users)
	const thoughtControlElements = document.querySelectorAll('[id$="-cur"]');

	//console.log(`Found ${thoughtControlElements.length} ThoughtControl elements for drag detection`);

	if(thoughtControlElements.length === 0) {
		console.warn('No ThoughtControl elements found for drag detection');
		return;
	}

	thoughtControlElements.forEach((thoughtControlElement: Element) => {
		const htmlElement = thoughtControlElement as HTMLElement;

		// Extract thought ID from element ID (remove 'tht-' prefix and '-cur' suffix)
		const elementId = htmlElement.id;
		const thoughtId = elementId.replace(/^tht-/, '').replace(/-cur$/, '');

		// Remove any existing listeners to prevent duplicates
		if((htmlElement as any)._thoughtControlDragEnterHandler) {
			htmlElement.removeEventListener('dragenter', (htmlElement as any)._thoughtControlDragEnterHandler);
		}
		if((htmlElement as any)._thoughtControlDragOverHandler) {
			htmlElement.removeEventListener('dragover', (htmlElement as any)._thoughtControlDragOverHandler);
		}
		if((htmlElement as any)._thoughtControlDragLeaveHandler) {
			htmlElement.removeEventListener('dragleave', (htmlElement as any)._thoughtControlDragLeaveHandler);
		}
		if((htmlElement as any)._thoughtControlDropHandler) {
			htmlElement.removeEventListener('drop', (htmlElement as any)._thoughtControlDropHandler);
		}

		// Create and store the dragenter handler
		(htmlElement as any)._thoughtControlDragEnterHandler = function(e: DragEvent) {
			// Don't show feedback if we're dragging a tab
			if(isTabDragInProgress()) {
				return;
			}

			// Check if we have files, text/URL data, or attachments
			const hasFiles = e.dataTransfer?.types.includes('Files');
			const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
				e.dataTransfer?.types.includes('text/plain');

			console.log(`ThoughtControl drag enter: ${thoughtId}, hasFiles: ${hasFiles}, hasTextData: ${hasTextData}`);

			if(hasFiles || hasTextData) {
				e.preventDefault();
				e.stopPropagation();

				// Visual feedback on hover
				htmlElement.style.transform = 'scale(1.5)';
				htmlElement.style.transition = 'all 0.2s ease';
			}
		};

		// Create and store the dragover handler
		(htmlElement as any)._thoughtControlDragOverHandler = function(e: DragEvent) {
			// Don't show feedback if we're dragging a tab
			if(isTabDragInProgress()) {
				return;
			}

			const hasFiles = e.dataTransfer?.types.includes('Files');
			const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
				e.dataTransfer?.types.includes('text/plain');

			console.log(`ThoughtControl drag over: ${thoughtId}, hasFiles: ${hasFiles}, hasTextData: ${hasTextData}, types: ${Array.from(e.dataTransfer?.types || [])}`);

			if(hasFiles || hasTextData) {
				e.preventDefault();
				e.stopPropagation();
			}
		};

		// Create and store the dragleave handler
		(htmlElement as any)._thoughtControlDragLeaveHandler = function(e: DragEvent) {
			// Don't show feedback if we're dragging a tab
			if(isTabDragInProgress()) {
				return;
			}

			const hasFiles = e.dataTransfer?.types.includes('Files');
			const hasTextData = e.dataTransfer?.types.includes('text/uri-list') ||
				e.dataTransfer?.types.includes('text/plain');

			console.log(`ThoughtControl drag leave: ${thoughtId}, hasFiles: ${hasFiles}, hasTextData: ${hasTextData}`);

			if(hasFiles || hasTextData) {
				// Only trigger leave if we're actually leaving the element
				const rect = htmlElement.getBoundingClientRect();
				const isOutside = e.clientX < rect.left || e.clientX > rect.right ||
					e.clientY < rect.top || e.clientY > rect.bottom;

				if(isOutside) {
					// Remove visual feedback
					htmlElement.style.transform = '';
					htmlElement.style.transition = '';
				}
			}
		};

		// Create and store the drop handler
		(htmlElement as any)._thoughtControlDropHandler = async function(e: DragEvent) {
			try {
				console.log(`ThoughtControl drop: ${thoughtId}`);

				// Clear visual feedback immediately when drop starts
				htmlElement.style.transform = '';
				htmlElement.style.transition = '';

				const hasFiles = e.dataTransfer?.files && e.dataTransfer.files.length > 0;
				const textData = e.dataTransfer?.getData('text/uri-list') ||
					e.dataTransfer?.getData('text/plain') || '';

				console.log(`ThoughtControl drop data: ${textData}, hasFiles: ${hasFiles}`);

				// If we have text data, handle it and prevent default
				if(textData) {
					e.preventDefault();
					e.stopPropagation();
					await safeInvokeAsync(dotNetRef, 'HandleThoughtControlDrop', [thoughtId, textData, 0, '[]']);
					return;
				}

				// If we have files or directories, process them
				if(hasFiles || (e.dataTransfer!.items && e.dataTransfer!.items.length > 0)) {
					e.preventDefault();
					e.stopPropagation();

					// Process all dropped items (files and directories)
					const { allFiles, fileInfos, isFolderDrop } = await processDroppedItems(e.dataTransfer!.items);
					
					// Create JSON with complete file structure
					const filePathsJson = JSON.stringify(fileInfos);

					// First, notify .NET to set the target thought ID and wait for it to complete
					await safeInvokeAsync(dotNetRef, 'HandleThoughtControlDrop', [thoughtId, '', allFiles.length, filePathsJson]);

					// Now trigger the InputFile change event using all discovered files
					const inputFile = document.getElementById(inputFileId) as HTMLInputElement;
					if(inputFile) {
						// Create a new DataTransfer object and add all discovered files
						const dataTransfer = new DataTransfer();
						allFiles.forEach(file => {
							dataTransfer.items.add(file);
						});

						// Set the files on the input element
						inputFile.files = dataTransfer.files;

						// Trigger the change event
						const changeEvent = new Event('change', {bubbles: true});
						inputFile.dispatchEvent(changeEvent);
					}
				}
			} catch(error) {
				console.error('ThoughtControl drop handling error:', error);
			}
		};

		// Attach the event listeners
		htmlElement.addEventListener('dragenter', (htmlElement as any)._thoughtControlDragEnterHandler);
		htmlElement.addEventListener('dragover', (htmlElement as any)._thoughtControlDragOverHandler);
		htmlElement.addEventListener('dragleave', (htmlElement as any)._thoughtControlDragLeaveHandler);
		htmlElement.addEventListener('drop', (htmlElement as any)._thoughtControlDropHandler);

		//console.log(`Initialized drag detection for ThoughtControl: ${thoughtId}`);
	});
}

/**
 * State tracking for attachment drag and drop operations
 */
interface AttachmentDragState {
	draggedElement: HTMLElement | null;
	draggedAttachmentId: string | null;
	attachmentElements: HTMLElement[];
	originalOrder: string[];
	container: HTMLElement | null;
	dropLine: HTMLElement | null;
	currentDropIndex: number;
	viewMode: 'List' | 'Grid';
	isHandleBasedReordering: boolean;
}

let attachmentDragState: AttachmentDragState = {
	draggedElement: null,
	draggedAttachmentId: null,
	attachmentElements: [],
	originalOrder: [],
	container: null,
	dropLine: null,
	currentDropIndex: -1,
	viewMode: 'List',
	isHandleBasedReordering: false
};

// Global window leave detection for drag operations
let windowLeaveHandler: ((e: MouseEvent) => void) | null = null;
let isTrackingWindowLeave = false;

// Store data for deferred native drag operation
let pendingNativeDrag: {
	attachmentId: string;
	screenX: number;
	screenY: number;
	dotNetRef: any;
} | null = null;

/**
 * Starts tracking when the cursor leaves the content area bounds during a drag operation
 */
function startWindowLeaveTracking(): void {
	if (isTrackingWindowLeave || windowLeaveHandler) return;
	
	// Get the content area element bounds
	const contentArea = document.getElementById('contentAreaOuter');
	if (!contentArea) {
		console.warn('Content area not found for boundary tracking');
		return;
	}
	
	windowLeaveHandler = function(e: MouseEvent) {
		// Don't interfere with handle-based reordering
		if (attachmentDragState.isHandleBasedReordering) {
			return;
		}
		
		const rect = contentArea.getBoundingClientRect();
		
		// Check if cursor is outside the content area bounds
		if (e.clientX < rect.left || e.clientX > rect.right || 
			e.clientY < rect.top || e.clientY > rect.bottom) {
			
			console.log('Cursor left content area bounds during drag - initiating native drag operation');
			initiateNativeDragOperation();
		}
	};
	
	document.addEventListener('mousemove', windowLeaveHandler);
	isTrackingWindowLeave = true;
}

/**
 * Stops tracking window leave events
 */
function stopWindowLeaveTracking(): void {
	if (!isTrackingWindowLeave || !windowLeaveHandler) return;
	
	document.removeEventListener('mousemove', windowLeaveHandler);
	windowLeaveHandler = null;
	isTrackingWindowLeave = false;
}

/**
 * Initiates the native drag operation when cursor leaves the window
 */
function initiateNativeDragOperation(): void {
	// Don't interfere with handle-based reordering
	if (attachmentDragState.isHandleBasedReordering) {
		console.log('Handle-based reordering in progress - skipping native drag initiation');
		return;
	}
	
	if (!pendingNativeDrag) {
		console.log('No pending native drag operation to initiate');
		return;
	}
	
	// On macOS, the native drag is already configured, so we don't need to call it again
	const isMacOS = navigator.platform.toLowerCase().includes('mac');
	if (isMacOS) {
		console.log('macOS native drag already configured - skipping duplicate call');
		cancelCurrentDragOperation();
		return;
	}
	
	console.log(`Initiating native drag for attachment: ${pendingNativeDrag.attachmentId}`);
	
	// Call the C# method to start the native drag operation (Windows)
	safeInvoke(pendingNativeDrag.dotNetRef, 'StartAttachmentDragOperationAsync', [pendingNativeDrag.attachmentId, pendingNativeDrag.screenX, pendingNativeDrag.screenY]);
	
	// Clean up the internal drag operation now that we're going native
	cancelCurrentDragOperation();
}

/**
 * Cancels the current drag operation and cleans up the UI state
 */
function cancelCurrentDragOperation(): void {
	if (!attachmentDragState.draggedElement) return;
	
	console.log('Canceling drag operation');
	
	// Force cleanup of polyfill drag state first
	if ((window as any).forceDragCleanup) {
		(window as any).forceDragCleanup();
	}
	
	// Hide the drop line
	if (attachmentDragState.dropLine) {
		attachmentDragState.dropLine.style.display = 'none';
	}
	
	// Fire dragend event to clean up any listeners
	if (attachmentDragState.draggedElement) {
		const dragEndEvent = new DragEvent('dragend', {
			bubbles: true,
			cancelable: true
		});
		attachmentDragState.draggedElement.dispatchEvent(dragEndEvent);
	}
	
	// Reset drag state
	attachmentDragState.draggedElement = null;
	attachmentDragState.draggedAttachmentId = null;
	attachmentDragState.currentDropIndex = -1;
	attachmentDragState.isHandleBasedReordering = false;
	
	// Stop tracking window leave
	stopWindowLeaveTracking();
	
	// Clear pending native drag
	pendingNativeDrag = null;
	
	console.log('Cancelled drag operation!');
}

/**
 * Creates and returns the drop line element
 */
function createDropLine(): HTMLElement {
	const dropLine = document.createElement('div');
	dropLine.className = `attachment-drop-line ${attachmentDragState.viewMode === 'List' ? 'horizontal' : 'vertical'}`;
	dropLine.style.display = 'none';
	return dropLine;
}

/**
 * Updates the position of the drop line based on mouse position
 */
function updateDropLinePosition(e: DragEvent): void {
	if (!attachmentDragState.container || !attachmentDragState.dropLine) return;

	const containerRect = attachmentDragState.container.getBoundingClientRect();
	const elements = attachmentDragState.attachmentElements.filter(el => el !== attachmentDragState.draggedElement);
	const scale = getScaleFactor(attachmentDragState.container);
	
	if (attachmentDragState.viewMode === 'List') {
		// List mode: horizontal line, vertical positioning
		let dropIndex = 0;
		let dropY = containerRect.top;

		// Find where to insert based on mouse Y position
		for (let i = 0; i < elements.length; i++) {
			const elementRect = elements[i].getBoundingClientRect();
			const elementMidpoint = elementRect.top + elementRect.height / 2;
			
			if (e.clientY < elementMidpoint) {
				// Insert before this element - use its original index
				dropIndex = attachmentDragState.originalOrder.indexOf(elements[i].getAttribute('data-attachment-id')!);
				dropY = elementRect.top;
				break;
			} else {
				// Insert after this element - use its original index + 1
				dropIndex = attachmentDragState.originalOrder.indexOf(elements[i].getAttribute('data-attachment-id')!) + 1;
				dropY = elementRect.bottom;
			}
		}

		// Position the horizontal drop line
		attachmentDragState.dropLine.style.display = 'block';
		const offsetY = (dropY - containerRect.top - 1.5) / scale;
		attachmentDragState.dropLine.style.top = `${offsetY}px`;
		attachmentDragState.currentDropIndex = dropIndex;
		
	} else {
		// Grid mode: vertical line, horizontal positioning
		let dropIndex = 0;
		let dropX = containerRect.left;
		let rowTop = containerRect.top;
		let rowHeight = 0;

		// Sort elements by position for grid layout
		const sortedElements = elements.sort((a, b) => {
			const aRect = a.getBoundingClientRect();
			const bRect = b.getBoundingClientRect();
			// Sort by row first (top), then by column (left)
			if (Math.abs(aRect.top - bRect.top) > 10) { // Different rows
				return aRect.top - bRect.top;
			}
			return aRect.left - bRect.left; // Same row, sort by column
		});

		// Group elements by rows
		const rows: HTMLElement[][] = [];
		let currentRow: HTMLElement[] = [];
		let lastTop = -1;

		sortedElements.forEach(element => {
			const rect = element.getBoundingClientRect();
			if (lastTop !== -1 && Math.abs(rect.top - lastTop) > 10) {
				// New row
				if (currentRow.length > 0) {
					rows.push(currentRow);
				}
				currentRow = [element];
			} else {
				currentRow.push(element);
			}
			lastTop = rect.top;
		});
		if (currentRow.length > 0) {
			rows.push(currentRow);
		}

		// Find which row the mouse is in and the insertion point
		let targetRow: HTMLElement[] | null = null;
		let insertAtBeginning = false;

		for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
			const row = rows[rowIndex];
			const firstInRow = row[0];
			const lastInRow = row[row.length - 1];
			const firstRect = firstInRow.getBoundingClientRect();
			const lastRect = lastInRow.getBoundingClientRect();
			
			// Check if mouse is within this row's Y bounds
			if (e.clientY >= firstRect.top - 10 && e.clientY <= firstRect.bottom + 10) {
				targetRow = row;
				rowTop = firstRect.top;
				rowHeight = firstRect.height;
				
				// Find horizontal position within this row
				let foundPosition = false;
				for (let i = 0; i < row.length; i++) {
					const elementRect = row[i].getBoundingClientRect();
					const elementMidpointX = elementRect.left + elementRect.width / 2;
					
					if (e.clientX < elementMidpointX) {
						// Insert before this element
						dropIndex = attachmentDragState.originalOrder.indexOf(row[i].getAttribute('data-attachment-id')!);
						dropX = elementRect.left;
						foundPosition = true;
						break;
					}
				}
				
				if (!foundPosition) {
					// Insert after the last element in this row
					const lastElement = row[row.length - 1];
					const lastRect = lastElement.getBoundingClientRect();
					dropIndex = attachmentDragState.originalOrder.indexOf(lastElement.getAttribute('data-attachment-id')!) + 1;
					dropX = lastRect.right;
				}
				break;
			} else if (e.clientY < firstRect.top) {
				// Mouse is above this row, insert at beginning
				targetRow = row;
				rowTop = firstRect.top;
				rowHeight = firstRect.height;
				dropIndex = attachmentDragState.originalOrder.indexOf(row[0].getAttribute('data-attachment-id')!);
				dropX = firstRect.left;
				insertAtBeginning = true;
				break;
			}
		}

		// If no row found, insert at the end
		if (!targetRow && rows.length > 0) {
			const lastRow = rows[rows.length - 1];
			const lastElement = lastRow[lastRow.length - 1];
			const lastRect = lastElement.getBoundingClientRect();
			targetRow = lastRow;
			rowTop = lastRect.top;
			rowHeight = lastRect.height;
			dropIndex = attachmentDragState.originalOrder.indexOf(lastElement.getAttribute('data-attachment-id')!) + 1;
			dropX = lastRect.right;
		}

		// Position the vertical drop line (only spanning 70% of the target row, centered)
		if (targetRow) {
			const lineHeight = rowHeight * 0.7;
			const verticalOffset = (rowHeight - lineHeight) / 2;
			
			attachmentDragState.dropLine.style.display = 'block';
			const offsetLeft = (dropX - containerRect.left - 1) / scale;
			const offsetTop = (rowTop - containerRect.top + verticalOffset) / scale;
			attachmentDragState.dropLine.style.left = `${offsetLeft}px`;
			attachmentDragState.dropLine.style.top = `${offsetTop}px`;
			attachmentDragState.dropLine.style.height = `${lineHeight / scale}px`;
			attachmentDragState.currentDropIndex = dropIndex;
		}
	}
}

/**
 * Initializes drag and drop functionality for attachment reordering
 * @param dotNetRef - Reference to the AttachmentsControl component
 * @param containerId - The ID of the attachments container element
 * @param viewMode - The current view mode ('List' or 'Grid')
 */
export function initAttachmentDragAndDrop(dotNetRef: any, containerId: string, viewMode: string): void {
	const container = document.getElementById(containerId);
	if (!container) {
		console.warn(`Attachment container not found: ${containerId}`);
		return;
	}

	// Store container, view mode, and find all attachment elements
	attachmentDragState.container = container;
	attachmentDragState.viewMode = viewMode as 'List' | 'Grid';
	const attachmentElements = Array.from(container.querySelectorAll('[data-attachment-id]')) as HTMLElement[];
	attachmentDragState.attachmentElements = attachmentElements;
	attachmentDragState.originalOrder = attachmentElements.map(el => el.getAttribute('data-attachment-id')!);

	// Create the drop line element
	attachmentDragState.dropLine = createDropLine();
	container.appendChild(attachmentDragState.dropLine);

	attachmentElements.forEach(element => {
		// Check if we're on macOS
		const isMacOS = navigator.platform.toLowerCase().includes('mac');
		
		// Find drag handle and IconTile elements within this attachment element
		const dragHandle = element.querySelector('.drag-handle') as HTMLElement;
		// The IconTile is the non-handle child element that can be dragged
		const iconTileDiv = element.querySelector('div:not(.drag-handle)') as HTMLElement;
		
		// Use drag handles for reordering on macOS and Electron (when handle is present)
		const useDragHandles = (isMacOS || isElectron()) && !!dragHandle;

		if (useDragHandles) {
			// Handle is draggable for reordering, element handles native drag separately
			dragHandle.draggable = true;
			element.draggable = isElectron(); // Electron: element also draggable for native drag
		} else {
			// No handles: make main element draggable for everything
			element.draggable = true;
		}

		// Remove existing listeners to prevent duplicates
		if ((element as any)._attachmentDragStart) {
			element.removeEventListener('dragstart', (element as any)._attachmentDragStart);
		}
		if ((element as any)._attachmentDragEnd) {
			element.removeEventListener('dragend', (element as any)._attachmentDragEnd);
		}
		if ((element as any)._attachmentDragOver) {
			element.removeEventListener('dragover', (element as any)._attachmentDragOver);
		}
		if ((element as any)._attachmentDrop) {
			element.removeEventListener('drop', (element as any)._attachmentDrop);
		}
		
		// Remove existing drag handle listeners to prevent duplicates
		if (dragHandle && (dragHandle as any)._dragHandleDragStart) {
			dragHandle.removeEventListener('dragstart', (dragHandle as any)._dragHandleDragStart);
		}
		if (dragHandle && (dragHandle as any)._dragHandleDragEnd) {
			dragHandle.removeEventListener('dragend', (dragHandle as any)._dragHandleDragEnd);
		}
		
		// Remove existing mousedown listener for macOS native drag
		if ((element as any)._macOSMouseDown) {
			element.removeEventListener('mousedown', (element as any)._macOSMouseDown);
		}

		// Create drag start handler for handle-based reordering
		const createHandleDragStartHandler = () => {
			return function(e: DragEvent) {
				const attachmentId = element.getAttribute('data-attachment-id');
				if (!attachmentId) return;

				console.log(`Attachment reorder drag start from handle: ${attachmentId}`);
				
				// Prevent this event from bubbling to the main element
				e.stopPropagation();
				
				attachmentDragState.draggedElement = element;
				attachmentDragState.draggedAttachmentId = attachmentId;
				attachmentDragState.isHandleBasedReordering = true;
				
				if (e.dataTransfer) {
					e.dataTransfer.setData('application/x-thebrain-attachment-reorder', attachmentId);
					e.dataTransfer.setData('text/plain', attachmentId); // Fallback for compatibility  
					e.dataTransfer.effectAllowed = 'move';
				}
			};
		};
		
		// Create drag start handler for regular elements
		const createElementDragStartHandler = () => {
			return function(e: DragEvent) {
				const attachmentId = element.getAttribute('data-attachment-id');
				if (!attachmentId) return;

				// In Electron, dragging the attachment directly (not via handle) starts native drag
				// Following official Electron docs: preventDefault() + immediate IPC
				if (isElectron()) {
					const dragType = element.getAttribute('data-drag-type');
					const dragPath = element.getAttribute('data-drag-path');
					const dragUrl = element.getAttribute('data-drag-url');
					const dragTitle = element.getAttribute('data-drag-title');

					// For URLs, use HTML5 drag with text data instead of native file drag
					// This allows dropping into browsers, chat apps, etc. as plain text
					if (dragType === 'url' && dragUrl) {
						console.log(`Electron URL drag (HTML5 mode): ${attachmentId}`, dragUrl);
						if (e.dataTransfer) {
							e.dataTransfer.setData('text/uri-list', dragUrl);
							e.dataTransfer.setData('text/plain', dragUrl);
							e.dataTransfer.effectAllowed = 'copyLink';

							// Create custom drag image synchronously (required for setDragImage)
							const displayTitle = dragTitle || 'Link';
							const dragImage = createDragImageSync(displayTitle, 'url');
							e.dataTransfer.setDragImage(dragImage.element, 0, 0);
						}
						return; // Don't go through native drag path
					}

					let dragInfo: { type: string; path?: string; url?: string; title?: string; iconDataUrl?: string; iconLogicalSize?: { width: number; height: number } } | null = null;
					if (dragType === 'file' && dragPath) {
						dragInfo = { type: 'file', path: dragPath, title: dragTitle || undefined };
					} else if (dragType === 'folder' && dragPath) {
						dragInfo = { type: 'folder', path: dragPath, title: dragTitle || undefined };
					}

					if (dragInfo) {
						const ipcRenderer = getIpcRenderer();
						if (ipcRenderer) {
							// Must call preventDefault synchronously
							e.preventDefault();

							// Async: fetch system icon and create drag image, then send IPC
							(async () => {
								const displayTitle = dragInfo.title || (dragInfo.path ? dragInfo.path.split(/[\\/]/).pop() : 'Item') || 'Item';

								// Get system file icon for files only (folders use our custom icon - system returns drive icons for some folders)
								let systemIcon: string | null = null;
								if (dragInfo.path && dragInfo.type === 'file') {
									systemIcon = await getSystemFileIcon(dragInfo.path);
								}

								// Create custom drag image with icon + title
								const dragImage = await createDragImageDataUrl(displayTitle, dragInfo.type, systemIcon);
								dragInfo.iconDataUrl = dragImage.dataUrl;
								dragInfo.iconLogicalSize = dragImage.logicalSize;

								console.log(`Electron native drag: ${attachmentId}`, dragInfo.type, displayTitle);
								ipcRenderer.send('ondragstart', dragInfo);
							})();
							return;
						}
					}
				}

				console.log(`Attachment drag start: ${attachmentId} (internal drag mode)`);

				attachmentDragState.draggedElement = element;
				attachmentDragState.draggedAttachmentId = attachmentId;
				
				// Store data for potential native drag operation if cursor leaves window
				pendingNativeDrag = {
					attachmentId: attachmentId,
					screenX: e.screenX,
					screenY: e.screenY,
					dotNetRef: dotNetRef
				};
				
				// Start tracking window leave events for external drag operations (Windows)
				startWindowLeaveTracking();
				
				if (e.dataTransfer) {
					// Clear specific data types we use to prevent accumulation from previous drags
					e.dataTransfer.clearData('application/x-thebrain-attachment-id');
					e.dataTransfer.clearData('text/plain');
					
					e.dataTransfer.setData('application/x-thebrain-attachment-id', attachmentId);
					e.dataTransfer.setData('text/plain', attachmentId); // Fallback for compatibility
					e.dataTransfer.effectAllowed = 'copyMove';
					console.log(`Set attachment drag data: ${attachmentId}`);
				}
			};
		};
		
		// Track which attachment is being dragged
		(element as any)._attachmentDragStart = createElementDragStartHandler();

		// Clean up when drag ends
		(element as any)._attachmentDragEnd = function(e: DragEvent) {
			// Hide the drop line
			if (attachmentDragState.dropLine) {
				attachmentDragState.dropLine.style.display = 'none';
			}
			
			// Clear drag data to prevent stale data on next drag
			if (e.dataTransfer) {
				e.dataTransfer.clearData('application/x-thebrain-attachment-id');
				e.dataTransfer.clearData('application/x-thebrain-attachment-reorder');
				e.dataTransfer.clearData('text/plain');
			}

			// Stop tracking window leave events
			stopWindowLeaveTracking();

			// Clear pending native drag
			pendingNativeDrag = null;

			// Reset state
			attachmentDragState.draggedElement = null;
			attachmentDragState.draggedAttachmentId = null;
			attachmentDragState.currentDropIndex = -1;
			attachmentDragState.isHandleBasedReordering = false;
		};

		// Update drop line position when dragging over
		(element as any)._attachmentDragOver = function(e: DragEvent) {
			if (!attachmentDragState.draggedElement) return;

			e.preventDefault();
			e.dataTransfer!.dropEffect = 'move';

			updateDropLinePosition(e);
		};

		// Handle the drop and trigger reordering
		(element as any)._attachmentDrop = function(e: DragEvent) {
			if (!attachmentDragState.draggedElement) return;

			e.preventDefault();
			e.stopPropagation();

			const draggedAttachmentId = attachmentDragState.draggedAttachmentId;
			if (!draggedAttachmentId || attachmentDragState.currentDropIndex === -1) return;

			// Hide the drop line
			if (attachmentDragState.dropLine) {
				attachmentDragState.dropLine.style.display = 'none';
			}

			// Trigger reorder in C#
			safeInvoke(dotNetRef, 'HandleAttachmentReorder', [draggedAttachmentId, attachmentDragState.currentDropIndex]);
		};

		// Set up drag handle listeners for macOS and Electron
		if (useDragHandles && dragHandle) {
			(dragHandle as any)._dragHandleDragStart = createHandleDragStartHandler();
			(dragHandle as any)._dragHandleDragEnd = (element as any)._attachmentDragEnd;

			dragHandle.addEventListener('dragstart', (dragHandle as any)._dragHandleDragStart);
			dragHandle.addEventListener('dragend', (dragHandle as any)._dragHandleDragEnd);

			// MAUI macOS needs mousedown handler for native drag (Electron uses dragstart instead)
			if (!isElectron()) {
				(element as any)._macOSMouseDown = function(e: MouseEvent) {
					// Don't trigger if clicking on the drag handle or its children
					if (dragHandle && (e.target === dragHandle || dragHandle.contains(e.target as Node))) {
						return;
					}

					const attachmentId = element.getAttribute('data-attachment-id');
					if (!attachmentId) return;

					console.log(`macOS mousedown for native drag: ${attachmentId}`);

					// Set pending native drag so content area handlers know to ignore this
					pendingNativeDrag = {
						attachmentId: attachmentId,
						screenX: e.screenX,
						screenY: e.screenY,
						dotNetRef: dotNetRef
					};

					// Trigger native drag immediately
					safeInvoke(dotNetRef, 'StartAttachmentDragOperationAsync', [attachmentId, e.screenX, e.screenY]);

					// Set a timeout to clear pendingNativeDrag after 3 seconds as a safety net
					setTimeout(() => {
						if (pendingNativeDrag && pendingNativeDrag.attachmentId === attachmentId) {
							console.log('Clearing pending native drag state after timeout');
							pendingNativeDrag = null;
						}
					}, 3000);
				};

				element.addEventListener('mousedown', (element as any)._macOSMouseDown);
			}
		}

		// Attach event listeners to main element (these will only be used for non-macOS or macOS without handles)
		element.addEventListener('dragstart', (element as any)._attachmentDragStart);
		element.addEventListener('dragend', (element as any)._attachmentDragEnd);
		element.addEventListener('dragover', (element as any)._attachmentDragOver);
		element.addEventListener('drop', (element as any)._attachmentDrop);
	});

	// Also listen for dragover on the container to handle areas between elements
	if ((container as any)._containerDragOver) {
		container.removeEventListener('dragover', (container as any)._containerDragOver);
	}
	
	(container as any)._containerDragOver = function(e: DragEvent) {
		if (!attachmentDragState.draggedElement) return;
		
		e.preventDefault();
		updateDropLinePosition(e);
	};
	
	container.addEventListener('dragover', (container as any)._containerDragOver);
}

function getScaleFactor(element: HTMLElement): number {
	const scaleContainer = element.closest('.attachments-and-note-section-scale-content') as HTMLElement | null;
	if(!scaleContainer) {
		return 1;
	}

	const rect = scaleContainer.getBoundingClientRect();
	const width = scaleContainer.offsetWidth;
	if(width === 0) {
		return 1;
	}

	const scale = rect.width / width;
	if(!Number.isFinite(scale) || scale <= 0) {
		return 1;
	}

	return scale;
}

/**
 * Clears the pending native drag state. This should be called after a native drag operation completes.
 */
export function clearPendingNativeDrag(): void {
	if (pendingNativeDrag) {
		console.log('Clearing pending native drag state');
		pendingNativeDrag = null;
	}
}

/**
 * Cleans up attachment drag and drop functionality
 * @param containerId - The ID of the attachments container element
 */
export function cleanupAttachmentDragAndDrop(containerId: string): void {
	const container = document.getElementById(containerId);
	if (!container) return;

	const attachmentElements = Array.from(container.querySelectorAll('[data-attachment-id]')) as HTMLElement[];
	
	attachmentElements.forEach(element => {
		element.draggable = false;
		
		// Find and clean up drag handle
		const dragHandle = element.querySelector('.drag-handle') as HTMLElement;
		if (dragHandle) {
			dragHandle.draggable = false;
			
			if ((dragHandle as any)._dragHandleDragStart) {
				dragHandle.removeEventListener('dragstart', (dragHandle as any)._dragHandleDragStart);
			}
			if ((dragHandle as any)._dragHandleDragEnd) {
				dragHandle.removeEventListener('dragend', (dragHandle as any)._dragHandleDragEnd);
			}
		}
		
		// Clean up macOS mousedown listener
		if ((element as any)._macOSMouseDown) {
			element.removeEventListener('mousedown', (element as any)._macOSMouseDown);
		}
		
		// Remove event listeners
		if ((element as any)._attachmentDragStart) {
			element.removeEventListener('dragstart', (element as any)._attachmentDragStart);
		}
		if ((element as any)._attachmentDragEnd) {
			element.removeEventListener('dragend', (element as any)._attachmentDragEnd);
		}
		if ((element as any)._attachmentDragOver) {
			element.removeEventListener('dragover', (element as any)._attachmentDragOver);
		}
		if ((element as any)._attachmentDrop) {
			element.removeEventListener('drop', (element as any)._attachmentDrop);
		}
	});

	// Remove container event listener
	if ((container as any)._containerDragOver) {
		container.removeEventListener('dragover', (container as any)._containerDragOver);
	}

	// Remove the drop line element
	if (attachmentDragState.dropLine) {
		attachmentDragState.dropLine.remove();
	}

	// Stop window leave tracking if active
	stopWindowLeaveTracking();

	// Clear pending native drag
	pendingNativeDrag = null;

	// Reset state
	attachmentDragState = {
		draggedElement: null,
		draggedAttachmentId: null,
		attachmentElements: [],
		originalOrder: [],
		container: null,
		dropLine: null,
		currentDropIndex: -1,
		viewMode: 'List',
		isHandleBasedReordering: false
	};
}

/**
 * Determines what drop target (if any) is at the specified coordinates.
 * Used by native drop handlers to route drops to the correct component.
 * @param clientX - X coordinate relative to the window
 * @param clientY - Y coordinate relative to the window
 * @returns Object describing the drop target, or null if no valid target
 */
export function getDropTargetAtPosition(clientX: number, clientY: number): any {
	const element = document.elementFromPoint(clientX, clientY);

	if (!element) {
		return null;
	}

	// Walk up the DOM to find a recognized drop target
	let current: Element | null = element;

	while (current && current !== document.body) {
		// Check for upload controls (FileUploadControl/FolderUploadControl)
		// Only detect if we're within the upload-control-feedback div (the actual visual drop zone)
		if (current.classList && current.classList.contains('upload-control-feedback')) {
			const elementId = current.getAttribute('data-upload-control-id');
			if (elementId) {
				return {
					type: 'upload-control',
					elementId: elementId,
					clientX: clientX,
					clientY: clientY
				};
			}
		}

		// Check for outer upload-control container (works for both Vulcan and Deku paths)
		if (current.classList && current.classList.contains('upload-control') && current.classList.contains('drop-zone-enabled')) {
			const elementId = current.id;
			if (elementId) {
				return {
					type: 'upload-control',
					elementId: elementId,
					clientX: clientX,
					clientY: clientY
				};
			}
		}

		// Check for PlexDropZone
		const zone = current.getAttribute('data-zone');
		if (zone) {
			return {
				type: 'plex-zone',
				zone: zone,
				clientX: clientX,
				clientY: clientY
			};
		}

		// Check for ThoughtControl (pattern: tht-{guid}-cur)
		if (current.id && current.id.match(/^tht-[a-f0-9-]+-cur$/)) {
			const thoughtId = current.id.replace(/^tht-/, '').replace(/-cur$/, '');
			return {
				type: 'thought',
				id: thoughtId,
				clientX: clientX,
				clientY: clientY
			};
		}

		// Check for ContentArea / AttachmentsControl
		if (current.id === 'contentAreaOuter' || current.id === 'attachments-section' ||
		    current.id === 'attachments-and-note-section') {
			return {
				type: 'content-area',
				clientX: clientX,
				clientY: clientY
			};
		}

		current = current.parentElement;
	}

	return null;
}

/**
 * Shows visual feedback for a drop target (for native drags)
 * @param targetInfo - Information about the target to highlight
 */
export function showDropTargetFeedback(targetInfo: any): void {
	if(!targetInfo) return;

	try {
		if(targetInfo.type === 'plex-zone') {
			// Find the zone element and add 'hovered' class
			const zoneElement = document.querySelector(`[data-zone="${targetInfo.zone}"]`);
			if(zoneElement) {
				zoneElement.classList.add('hovered');
			}
		} else if(targetInfo.type === 'thought') {
			// Find the thought element and apply scale transform
			const thoughtElement = document.getElementById(`tht-${targetInfo.id}-cur`);
			if(thoughtElement instanceof HTMLElement) {
				thoughtElement.style.transform = 'scale(1.5)';
				thoughtElement.style.transition = 'all 0.2s ease';
			}
		} else if(targetInfo.type === 'content-area') {
			// Add feedback class to content area
			const contentArea = document.getElementById('attachments-section');
			if(contentArea) {
				contentArea.classList.add('drop-hovered');
			}
		} else if(targetInfo.type === 'upload-control') {
			// Try direct attribute match first (Deku path)
			let uploadControlFeedback: Element | null | undefined = document.querySelector(`.upload-control-feedback[data-upload-control-id="${targetInfo.elementId}"]`);
			// Fallback: find feedback div within the upload control container (Vulcan path)
			if(!uploadControlFeedback) {
				const container = document.getElementById(targetInfo.elementId);
				uploadControlFeedback = container?.querySelector('.upload-control-feedback');
			}
			if(uploadControlFeedback) {
				uploadControlFeedback.classList.add('drop-hovered');
			}
		}
	} catch(error) {
		console.error('Error showing drop target feedback:', error);
	}
}

/**
 * Hides visual feedback for all drop targets (for native drags)
 */
export function hideDropTargetFeedback(): void {
	try {
		// Remove hover state from all plex zones
		document.querySelectorAll('[data-zone].hovered').forEach(el => {
			el.classList.remove('hovered');
		});

		// Remove transform from all thought controls
		document.querySelectorAll('[id$="-cur"]').forEach(el => {
			if (el instanceof HTMLElement) {
				el.style.transform = '';
				el.style.transition = '';
			}
		});

		// Remove feedback from content area
		const contentArea = document.getElementById('attachments-section');
		if (contentArea) {
			contentArea.classList.remove('drop-hovered');
		}
		
		document.querySelectorAll('.upload-control-feedback.drop-hovered').forEach(el => {
			el.classList.remove('drop-hovered');
		});
		
	} catch (error) {
		console.error('Error hiding drop target feedback:', error);
	}
}

/**
 * Shows feedback for a specific plex zone (for web client drags)
 * @param zone - The zone identifier (parent, child, jump, sibling)
 */
export function showPlexZoneFeedback(zone: string): void {
	const zoneElement = document.querySelector(`[data-zone="${zone}"]`);
	if (zoneElement) {
		zoneElement.classList.add('hovered');
	}
}

/**
 * Hides feedback for a specific plex zone (for web client drags)
 * @param zone - The zone identifier (parent, child, jump, sibling)
 */
export function hidePlexZoneFeedback(zone: string): void {
	const zoneElement = document.querySelector(`[data-zone="${zone}"]`);
	if (zoneElement) {
		zoneElement.classList.remove('hovered');
	}
}

// ============================================================================
// Electron Native Drop Handler
// ============================================================================

/**
 * The user's default drop effect, used when no modifier keys are held.
 * Set from C# via setDefaultDropEffect() when the app initializes or when the setting changes.
 */
let defaultDropEffect: DataTransfer['dropEffect'] = 'copy';

/**
 * Sets the default drop effect for external drag-and-drop operations.
 * Called from C# when the user's DefaultDropOperation setting is loaded or changed.
 * @param effect - One of 'copy', 'move', or 'link'
 */
export function setDefaultDropEffect(effect: string): void {
	if(effect === 'copy' || effect === 'move' || effect === 'link') {
		defaultDropEffect = effect;
	}
}

/**
 * Checks if content being dragged is from an external source (files or URLs)
 */
function hasExternalContent(e: DragEvent): boolean {
	const types = e.dataTransfer?.types || [];
	return types.includes('Files') || types.includes('text/uri-list');
}

/**
 * Determines the drop effect based on modifier keys (platform-specific).
 * Linux uses the same modifier mapping as Windows (GTK/KDE convention).
 * Falls back to a permitted effect when the source's effectAllowed restricts
 * us — Chromium silently cancels drops where dropEffect isn't permitted.
 */
function getDropEffectForModifiers(e: DragEvent): DataTransfer['dropEffect'] {
	const isMac = navigator.platform.toLowerCase().includes('mac');

	let desired: DataTransfer['dropEffect'];
	if (isMac) {
		// macOS: Ctrl=Link, Shift=Move, Option=Copy
		if (e.ctrlKey) desired = 'link';
		else if (e.shiftKey) desired = 'move';
		else if (e.altKey) desired = 'copy';
		else desired = defaultDropEffect;
	} else {
		// Windows + Linux: Alt=Link, Shift=Move, Ctrl=Copy
		if (e.altKey) desired = 'link';
		else if (e.shiftKey) desired = 'move';
		else if (e.ctrlKey) desired = 'copy';
		else desired = defaultDropEffect;
	}

	// Clamp to a permitted effect. On Linux, Nautilus/etc. often advertise only
	// 'copy' in effectAllowed; setting dropEffect='move'/'link' against that
	// makes Chromium silently cancel the drop. C# applies the user's intended
	// operation (DefaultDropOperation + ModifierKeys) regardless of dropEffect,
	// so the cosmetic cursor mismatch is acceptable when override of
	// effectAllowed in dragenter didn't take.
	if (e.dataTransfer && !isEffectPermitted(desired, e.dataTransfer.effectAllowed)) {
		return 'copy';
	}
	return desired;
}

function isEffectPermitted(effect: DataTransfer['dropEffect'], allowed: string): boolean {
	if (allowed === 'all' || allowed === 'uninitialized') return true;
	if (allowed === 'none') return effect === 'none';
	return allowed.toLowerCase().includes(effect.toLowerCase());
}

/**
 * Gets modifier keys as a bitmask matching DropModifierKeys enum in C#
 */
function getModifierKeysValue(e: DragEvent): number {
	let mods = 0;
	if (e.ctrlKey) mods |= 1;   // DropModifierKeys.Ctrl
	if (e.shiftKey) mods |= 2;  // DropModifierKeys.Shift
	if (e.altKey) mods |= 4;    // DropModifierKeys.Alt
	if (e.metaKey) mods |= 8;   // DropModifierKeys.Command
	return mods;
}

/**
 * Builds NativeDropData object from a drop event using Electron's file.path property
 * and Node.js fs module for file system operations
 */
function buildElectronDropData(e: DragEvent): any {
	const dropData = {
		Files: [] as string[],
		Folders: [] as string[],
		Urls: [] as string[],
		Text: null as string | null,
		ScreenX: e.screenX,
		ScreenY: e.screenY,
		ClientX: e.clientX,
		ClientY: e.clientY,
		ModifierKeys: getModifierKeysValue(e),
		FileSizes: {} as Record<string, number>,
		FolderSizes: {} as Record<string, number>
	};

	// Extract URLs from uri-list
	const uriList = e.dataTransfer?.getData('text/uri-list');
	if (uriList) {
		dropData.Urls = uriList.split('\n')
			.map(u => u.trim())
			.filter(u => u.startsWith('http://') || u.startsWith('https://'));
	}

	// Extract text (only if no URLs found)
	if (!dropData.Urls.length) {
		const text = e.dataTransfer?.getData('text/plain');
		if (text && !text.startsWith('http://') && !text.startsWith('https://')) {
			dropData.Text = text;
		}
	}

	// Extract file/folder paths using Electron's File.path property
	const files = e.dataTransfer?.files;
	if (files) {
		for (let i = 0; i < files.length; i++) {
			const file = files[i] as any;
			const filePath = file.path;
			if (!filePath) continue;

			if (electronDragDropHelper.isDirectory(filePath)) {
				dropData.Folders.push(filePath);
				// Calculate folder size by walking contents
				const contents = electronDragDropHelper.walkFolder(filePath);
				const totalSize = contents.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
				dropData.FolderSizes[filePath] = totalSize;
			} else {
				dropData.Files.push(filePath);
				dropData.FileSizes[filePath] = file.size;
			}
		}
	}

	return dropData;
}

/**
 * Routes drop data to the appropriate Blazor component handler
 */
async function routeElectronDropToHandler(dropDataJson: string, target: any): Promise<void> {
	const handler = (window as any).blazorNativeDropHandler;
	if (!handler) {
		console.error('blazorNativeDropHandler not registered');
		return;
	}

	console.log('Routing Electron drop to:', target.type, target);

	switch (target.type) {
		case 'plex-zone':
			await handler.handlePlexZoneDrop(dropDataJson, target.zone);
			break;
		case 'thought':
			await handler.handleThoughtDrop(dropDataJson, target.id);
			break;
		case 'content-area':
			await handler.handleContentAreaDrop(dropDataJson);
			break;
		case 'upload-control':
			await handler.handleUploadControlDrop(dropDataJson, target.elementId);
			break;
		default:
			console.warn('Unknown drop target type:', target.type);
	}
}

/**
 * Gets Node.js fs module if available (Electron with NodeIntegration enabled)
 */
function getNodeFs(): any {
	try {
		// In Electron with NodeIntegration, require is available
		return (window as any).require?.('fs');
	} catch {
		return null;
	}
}

/**
 * Gets Node.js path module if available (Electron with NodeIntegration enabled)
 */
function getNodePath(): any {
	try {
		return (window as any).require?.('path');
	} catch {
		return null;
	}
}

/**
 * Electron drag/drop helper that uses Node.js fs module directly
 */
const electronDragDropHelper = {
	fs: null as any,
	path: null as any,

	init(): boolean {
		this.fs = getNodeFs();
		this.path = getNodePath();
		// Use truthiness check to catch both null and undefined (optional chaining returns undefined)
		let success = !!this.fs && !!this.path;
		console.log(`Electron drag/drop helper initialized: ${success ? 'success' : 'failed'}`);
		return success;
	},

	isDirectory(filePath: string): boolean {
		if (!this.fs) return false;
		try {
			return this.fs.statSync(filePath).isDirectory();
		} catch {
			return false;
		}
	},

	getFileSize(filePath: string): number {
		if (!this.fs) return 0;
		try {
			return this.fs.statSync(filePath).size;
		} catch {
			return 0;
		}
	},

	walkFolder(folderPath: string): Array<{path: string, isDirectory: boolean, size: number}> {
		if (!this.fs || !this.path) return [];
		const results: Array<{path: string, isDirectory: boolean, size: number}> = [];

		const walk = (dir: string) => {
			try {
				const entries = this.fs.readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = this.path.join(dir, entry.name);
					if (entry.isDirectory()) {
						results.push({ path: fullPath, isDirectory: true, size: 0 });
						walk(fullPath);
					} else {
						try {
							const size = this.fs.statSync(fullPath).size;
							results.push({ path: fullPath, isDirectory: false, size });
						} catch {
							results.push({ path: fullPath, isDirectory: false, size: 0 });
						}
					}
				}
			} catch {
				// Skip directories we can't read
			}
		};

		walk(folderPath);
		return results;
	}
};

/**
 * Initializes native Electron drop handling on the window.
 * Sets up window-level event listeners to intercept external drops (files, folders, URLs)
 * and routes them to appropriate Blazor components.
 *
 * Must be called once when app starts in Electron mode.
 * Requires NodeIntegration to be enabled in Electron.
 */
export function initElectronNativeDropHandler(): void {
	// Initialize the helper with Node.js modules
	if (!electronDragDropHelper.init()) {
		console.log('Node.js fs/path modules not available, skipping Electron native drop handler');
		return;
	}

	let currentTarget: any = null;
	let lastTargetJson: string = '';

	// Prevent default drag behavior on window for external content
	window.addEventListener('dragenter', (e: DragEvent) => {
		if (!hasExternalContent(e)) return;
		// Skip if tab drag is in progress
		if (isTabDragInProgress()) return;

		e.preventDefault();
		e.stopPropagation();

		// Best-effort: override the source's restrictive effectAllowed so the
		// cursor cosmetic matches our resolved dropEffect (and so Chromium
		// doesn't cancel Move/Link drops). HTML5 spec says effectAllowed is
		// source-controlled, but Chromium-on-Linux honors target overrides in
		// practice. If it doesn't take, getDropEffectForModifiers clamps to a
		// permitted value as a safety net.
		if (isLinuxElectron() && e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'all';
		}
	}, true);

	// Hit-test and show feedback during drag
	window.addEventListener('dragover', (e: DragEvent) => {
		if (!hasExternalContent(e)) return;
		// Skip if tab drag is in progress
		if (isTabDragInProgress()) return;

		e.preventDefault();
		e.stopPropagation();

		// Set drop effect based on modifier keys
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = getDropEffectForModifiers(e);
		}

		// Hit-test for drop target
		const target = getDropTargetAtPosition(e.clientX, e.clientY);
		const targetJson = JSON.stringify(target);

		// Only update feedback if target changed (performance optimization)
		if (targetJson !== lastTargetJson) {
			hideDropTargetFeedback();
			if (target) {
				showDropTargetFeedback(target);
			}
			currentTarget = target;
			lastTargetJson = targetJson;
		}
	}, true);

	// Clear feedback when leaving window
	window.addEventListener('dragleave', (e: DragEvent) => {
		// relatedTarget is null when leaving the window entirely
		if (e.relatedTarget === null) {
			hideDropTargetFeedback();
			currentTarget = null;
			lastTargetJson = '';
		}
	}, true);

	// Handle drop
	window.addEventListener('drop', async (e: DragEvent) => {
		if (!hasExternalContent(e)) return;
		// Skip if tab drag is in progress
		if (isTabDragInProgress()) return;

		e.preventDefault();
		e.stopPropagation();
		hideDropTargetFeedback();

		const target = currentTarget || getDropTargetAtPosition(e.clientX, e.clientY);
		if (!target) {
			console.log('No valid drop target found');
			currentTarget = null;
			lastTargetJson = '';
			return;
		}

		const dropData = buildElectronDropData(e);
		if (!dropData.Files.length && !dropData.Folders.length &&
			!dropData.Urls.length && !dropData.Text) {
			console.log('No content found in drop');
			currentTarget = null;
			lastTargetJson = '';
			return;
		}

		const dropDataJson = JSON.stringify(dropData);
		await routeElectronDropToHandler(dropDataJson, target);

		currentTarget = null;
		lastTargetJson = '';
	}, true);

	console.log('Electron native drop handler initialized');
}

/**
 * Native drop handler that routes drops from native OS drag/drop to Blazor components
 */
class NativeDropHandler {
	private plexControlRef: any = null;
	private attachmentsControlRef: any = null;
	private uploadControls: Map<string, any> = new Map();

	/**
	 * Registers the PlexControl DotNetObjectReference for handling plex-related drops
	 */
	registerPlexControl(dotNetRef: any): void {
		this.plexControlRef = dotNetRef;
	}

	/**
	 * Registers the AttachmentsControl DotNetObjectReference for handling content area drops
	 */
	registerAttachmentsControl(dotNetRef: any): void {
		this.attachmentsControlRef = dotNetRef;
	}

	/**
	 * Registers an upload control (FileUploadControl/FolderUploadControl) for handling native drops
	 * @param elementId - The element ID of the upload control
	 * @param dotNetRef - Reference to the upload control component
	 */
	registerUploadControl(elementId: string, dotNetRef: any): void {
		this.uploadControls.set(elementId, dotNetRef);
		console.log(`Registered upload control: ${elementId}`);
	}

	/**
	 * Unregisters an upload control
	 * @param elementId - The element ID of the upload control to unregister
	 */
	unregisterUploadControl(elementId: string): void {
		this.uploadControls.delete(elementId);
		console.log(`Unregistered upload control: ${elementId}`);
	}

	/**
	 * Handles a drop on a plex drop zone
	 * @param dropDataJson - JSON string representing NativeDropData
	 * @param zone - The zone identifier (parent, child, jump, sibling)
	 */
	async handlePlexZoneDrop(dropDataJson: string, zone: string): Promise<void> {
		if (!this.plexControlRef) {
			console.error('PlexControl not registered with NativeDropHandler');
			return;
		}

		await safeInvokeAsync(this.plexControlRef, 'HandleNativeZoneDropAsync', [dropDataJson, zone]);
	}

	/**
	 * Handles a drop on a specific thought in the plex
	 * @param dropDataJson - JSON string representing NativeDropData
	 * @param thoughtId - The GUID of the target thought
	 */
	async handleThoughtDrop(dropDataJson: string, thoughtId: string): Promise<void> {
		if (!this.plexControlRef) {
			console.error('PlexControl not registered with NativeDropHandler');
			return;
		}

		await safeInvokeAsync(this.plexControlRef, 'HandleNativeThoughtDropAsync', [dropDataJson, thoughtId]);
	}

	/**
	 * Handles a drop on the content area / attachments section
	 * @param dropDataJson - JSON string representing NativeDropData
	 */
	async handleContentAreaDrop(dropDataJson: string): Promise<void> {
		if (!this.attachmentsControlRef) {
			console.error('AttachmentsControl not registered with NativeDropHandler');
			return;
		}

		await safeInvokeAsync(this.attachmentsControlRef, 'HandleNativeContentAreaDropAsync', [dropDataJson]);
	}

	/**
	 * Handles a drop on an upload control (FileUploadControl/FolderUploadControl)
	 * @param dropDataJson - JSON string representing NativeDropData
	 * @param elementId - The element ID of the upload control
	 */
	async handleUploadControlDrop(dropDataJson: string, elementId: string): Promise<void> {
		const uploadControl = this.uploadControls.get(elementId);
		if (!uploadControl) {
			console.error(`Upload control not registered: ${elementId}`);
			return;
		}

		await safeInvokeAsync(uploadControl, 'HandleNativeDropAsync', [dropDataJson]);
	}
}

// Create singleton instance
const nativeDropHandler = new NativeDropHandler();

// Expose functions to window for C# interop
(window as any).dragAndDropHelper = {
	clearPendingNativeDrag,
	getDropTargetAtPosition,
	showDropTargetFeedback,
	hideDropTargetFeedback,
	showPlexZoneFeedback,
	hidePlexZoneFeedback,
	initUploadControlFeedback,
	setDefaultDropEffect
};

// Expose native drop handler to window for C# interop
(window as any).blazorNativeDropHandler = nativeDropHandler;

// Expose Electron native drop handler initialization function
(window as any).initElectronNativeDropHandler = initElectronNativeDropHandler;
