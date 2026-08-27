import { safeInvoke, safeInvokeAsync } from "./interop.js";
function isElectron() {
    var _a, _b;
    try {
        return !!((_b = (_a = window).require) === null || _b === void 0 ? void 0 : _b.call(_a, 'electron'));
    }
    catch (_c) {
        return false;
    }
}
function isLinuxElectron() {
    return isElectron() && navigator.platform.toLowerCase().includes('linux');
}
function getIpcRenderer() {
    var _a, _b;
    try {
        const electron = (_b = (_a = window).require) === null || _b === void 0 ? void 0 : _b.call(_a, 'electron');
        return electron === null || electron === void 0 ? void 0 : electron.ipcRenderer;
    }
    catch (_c) {
        return null;
    }
}
async function getSystemFileIcon(filePath) {
    try {
        const ipcRenderer = getIpcRenderer();
        if (ipcRenderer === null || ipcRenderer === void 0 ? void 0 : ipcRenderer.invoke) {
            return await ipcRenderer.invoke('get-file-icon', filePath);
        }
    }
    catch (e) {
        console.log('Could not get system file icon:', e);
    }
    return null;
}
function drawDragIcon(ctx, iconX, iconY, iconSize, dragType) {
    const s = iconSize / 24;
    ctx.save();
    if (dragType === 'folder') {
        const r = 2 * s;
        ctx.fillStyle = '#F5C242';
        ctx.beginPath();
        ctx.roundRect(iconX, iconY + 4 * s, iconSize, iconSize - 5 * s, r);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(iconX + r, iconY + 1 * s);
        ctx.lineTo(iconX + 9 * s, iconY + 1 * s);
        ctx.lineTo(iconX + 11 * s, iconY + 4 * s);
        ctx.lineTo(iconX + r, iconY + 4 * s);
        ctx.quadraticCurveTo(iconX, iconY + 4 * s, iconX, iconY + 4 * s - r);
        ctx.lineTo(iconX, iconY + 1 * s + r);
        ctx.quadraticCurveTo(iconX, iconY + 1 * s, iconX + r, iconY + 1 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#E5B23A';
        ctx.fillRect(iconX + 1 * s, iconY + 4 * s, iconSize - 2 * s, 2 * s);
    }
    else if (dragType === 'url') {
        ctx.strokeStyle = '#5B9FE6';
        ctx.lineWidth = 1.8 * s;
        const cx = iconX + iconSize / 2;
        const cy = iconY + iconSize / 2;
        const r = iconSize * 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.4, r, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r, cy);
        ctx.lineTo(cx + r, cy);
        ctx.stroke();
    }
    else {
        ctx.fillStyle = '#E8E8EC';
        const docLeft = iconX + 2 * s;
        const docTop = iconY + 1 * s;
        const docWidth = iconSize - 4 * s;
        const docHeight = iconSize - 2 * s;
        const foldSize = 5 * s;
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
        ctx.fillRect(docLeft + 3 * s, docTop + 8 * s, docWidth - 6 * s, 1.5 * s);
        ctx.fillRect(docLeft + 3 * s, docTop + 11 * s, docWidth - 8 * s, 1.5 * s);
    }
    ctx.restore();
}
function createDragImageSync(title, dragType) {
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
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
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
    canvas.width = actualCanvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawDragIcon(ctx, padding, padding, iconSize, dragType);
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayTitle, textStartX, canvasHeight / 2 + 1);
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
    setTimeout(() => {
        dragElement.remove();
    }, 5000);
    return {
        element: dragElement,
        logicalSize: { width: actualCanvasWidth, height: canvasHeight }
    };
}
async function createDragImageDataUrl(title, dragType, systemIconDataUrl) {
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
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
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
    canvas.width = actualCanvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const iconX = padding;
    const iconY = padding;
    let drewSystemIcon = false;
    if (systemIconDataUrl) {
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
                    drewSystemIcon = true;
                    resolve();
                };
                img.onerror = reject;
                img.src = systemIconDataUrl;
            });
        }
        catch (e) {
            console.log('Could not draw system icon, using fallback');
        }
    }
    if (!drewSystemIcon) {
        drawDragIcon(ctx, iconX, iconY, iconSize, dragType);
    }
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayTitle, textStartX, canvasHeight / 2 + 1);
    return {
        dataUrl: canvas.toDataURL('image/png'),
        logicalSize: { width: actualCanvasWidth, height: canvasHeight }
    };
}
function isTabDragInProgress() {
    var _a;
    return ((_a = globalThis.venusUtils) === null || _a === void 0 ? void 0 : _a.currentDragTabBarId) != null;
}
async function walkDirectoryEntry(entry, basePath = '') {
    const files = [];
    if (entry.isFile) {
        const file = await new Promise((resolve, reject) => {
            entry.file(resolve, reject);
        });
        files.push({
            file: file,
            name: file.name,
            relativePath: basePath + file.name,
            size: file.size,
            lastModified: file.lastModified
        });
    }
    else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise((resolve, reject) => {
            reader.readEntries(resolve, reject);
        });
        for (const childEntry of entries) {
            const childFiles = await walkDirectoryEntry(childEntry, basePath + entry.name + '/');
            files.push(...childFiles);
        }
    }
    return files;
}
async function processDroppedItems(items) {
    const allFiles = [];
    const fileInfos = [];
    let isFolderDrop = false;
    const entries = [];
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
        }
        else if (entry.isFile) {
            const file = await new Promise((resolve, reject) => {
                entry.file(resolve, reject);
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
export function initDropZone(dotNetRef, zone, inputFileId) {
    const element = document.querySelector(`[data-zone="${zone}"]`);
    if (!element) {
        console.warn(`Drop zone element not found for zone: ${zone}`);
        return;
    }
    if (element._dragEnterHandler) {
        element.removeEventListener('dragenter', element._dragEnterHandler);
    }
    if (element._dragOverHandler) {
        element.removeEventListener('dragover', element._dragOverHandler);
    }
    if (element._dragLeaveHandler) {
        element.removeEventListener('dragleave', element._dragLeaveHandler);
    }
    if (element._dropHandler) {
        element.removeEventListener('drop', element._dropHandler);
    }
    element._dragEnterHandler = function (e) {
        var _a, _b, _c;
        if (isTabDragInProgress()) {
            return;
        }
        const hasTextData = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('text/uri-list')) ||
            ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/plain'));
        const hasFiles = (_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('Files');
        if (hasTextData || hasFiles) {
            e.preventDefault();
            e.stopPropagation();
            showPlexZoneFeedback(zone);
        }
    };
    element._dragOverHandler = function (e) {
        var _a, _b, _c;
        if (isTabDragInProgress()) {
            return;
        }
        const hasTextData = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('text/uri-list')) ||
            ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/plain'));
        const hasFiles = (_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('Files');
        if (hasTextData || hasFiles) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    element._dragLeaveHandler = function (e) {
        var _a, _b, _c;
        if (isTabDragInProgress()) {
            return;
        }
        const hasTextData = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('text/uri-list')) ||
            ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/plain'));
        const hasFiles = (_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('Files');
        if (hasTextData || hasFiles) {
            const rect = element.getBoundingClientRect();
            const isOutside = e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom;
            if (isOutside) {
                hidePlexZoneFeedback(zone);
            }
        }
    };
    element._dropHandler = async function (e) {
        var _a, _b, _c;
        try {
            const textData = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.getData('text/uri-list')) ||
                ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.getData('text/plain')) || '';
            const hasFiles = ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.files) && e.dataTransfer.files.length > 0;
            if (textData) {
                e.preventDefault();
                e.stopPropagation();
                await safeInvokeAsync(dotNetRef, 'HandleDrop', [zone, textData, hasFiles, '[]']);
                return;
            }
            if (hasFiles || (e.dataTransfer.items && e.dataTransfer.items.length > 0)) {
                e.preventDefault();
                e.stopPropagation();
                const { allFiles, fileInfos, isFolderDrop } = await processDroppedItems(e.dataTransfer.items);
                const filePathsJson = JSON.stringify(fileInfos);
                await safeInvokeAsync(dotNetRef, 'HandleDrop', [zone, '', allFiles.length > 0, filePathsJson]);
                const inputFile = document.getElementById(inputFileId);
                if (inputFile) {
                    const dataTransfer = new DataTransfer();
                    allFiles.forEach(file => {
                        dataTransfer.items.add(file);
                    });
                    inputFile.files = dataTransfer.files;
                    const changeEvent = new Event('change', { bubbles: true });
                    inputFile.dispatchEvent(changeEvent);
                }
                return;
            }
        }
        catch (error) {
            console.error('Drop handling error in zone', zone, ':', error);
        }
        finally {
            hidePlexZoneFeedback(zone);
        }
    };
    element.addEventListener('dragenter', element._dragEnterHandler);
    element.addEventListener('dragover', element._dragOverHandler);
    element.addEventListener('dragleave', element._dragLeaveHandler);
    element.addEventListener('drop', element._dropHandler);
}
export function initUploadControlFeedback(inputFileId) {
    const inputFile = document.getElementById(inputFileId);
    if (!inputFile) {
        console.warn(`Upload control InputFile element not found: ${inputFileId}`);
        return;
    }
    const container = inputFile.parentElement;
    const feedbackDiv = container === null || container === void 0 ? void 0 : container.querySelector('.upload-control-feedback');
    if (!feedbackDiv) {
        console.warn(`Upload control feedback div not found for InputFile: ${inputFileId}`);
        return;
    }
    if (inputFile._feedbackDragEnterHandler) {
        inputFile.removeEventListener('dragenter', inputFile._feedbackDragEnterHandler);
    }
    if (inputFile._feedbackDragOverHandler) {
        inputFile.removeEventListener('dragover', inputFile._feedbackDragOverHandler);
    }
    if (inputFile._feedbackDragLeaveHandler) {
        inputFile.removeEventListener('dragleave', inputFile._feedbackDragLeaveHandler);
    }
    if (inputFile._feedbackDropHandler) {
        inputFile.removeEventListener('drop', inputFile._feedbackDropHandler);
    }
    inputFile._feedbackDragEnterHandler = function (e) {
        var _a;
        const hasFiles = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('Files');
        if (hasFiles) {
            feedbackDiv.classList.add('drop-hovered');
        }
    };
    inputFile._feedbackDragOverHandler = function (e) {
        var _a;
        const hasFiles = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('Files');
        if (hasFiles) {
            e.preventDefault();
        }
    };
    inputFile._feedbackDragLeaveHandler = function (e) {
        feedbackDiv.classList.remove('drop-hovered');
    };
    inputFile._feedbackDropHandler = function (e) {
        feedbackDiv.classList.remove('drop-hovered');
    };
    inputFile.addEventListener('dragenter', inputFile._feedbackDragEnterHandler);
    inputFile.addEventListener('dragover', inputFile._feedbackDragOverHandler);
    inputFile.addEventListener('dragleave', inputFile._feedbackDragLeaveHandler);
    inputFile.addEventListener('drop', inputFile._feedbackDropHandler);
}
export function initContentAreaDragDetection(dotNetRef, inputFileId) {
    const contentAreaElement = document.getElementById('contentAreaOuter');
    if (!contentAreaElement) {
        console.warn('Content area element not found for drag detection');
        return;
    }
    if (contentAreaElement._contentDragEnterHandler) {
        contentAreaElement.removeEventListener('dragenter', contentAreaElement._contentDragEnterHandler);
    }
    if (contentAreaElement._contentDragOverHandler) {
        contentAreaElement.removeEventListener('dragover', contentAreaElement._contentDragOverHandler);
    }
    if (contentAreaElement._contentDragLeaveHandler) {
        contentAreaElement.removeEventListener('dragleave', contentAreaElement._contentDragLeaveHandler);
    }
    if (contentAreaElement._contentDropHandler) {
        contentAreaElement.removeEventListener('drop', contentAreaElement._contentDropHandler);
    }
    contentAreaElement._contentDragEnterHandler = function (e) {
        var _a, _b, _c;
        if (attachmentDragState.draggedElement) {
            return;
        }
        if (pendingNativeDrag) {
            return;
        }
        if (isTabDragInProgress()) {
            return;
        }
        const hasFiles = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.files) && e.dataTransfer.files.length > 0;
        const hasTextData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/uri-list')) ||
            ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('text/plain'));
        e.preventDefault();
        e.stopPropagation();
        const attachmentsSection = document.getElementById('attachments-section');
        if (attachmentsSection) {
            attachmentsSection.classList.add('drop-hovered');
        }
    };
    contentAreaElement._contentDragOverHandler = function (e) {
        var _a, _b, _c;
        if (attachmentDragState.draggedElement) {
            return;
        }
        if (pendingNativeDrag) {
            return;
        }
        if (isTabDragInProgress()) {
            return;
        }
        const hasFiles = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.files) && e.dataTransfer.files.length > 0;
        const hasTextData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/uri-list')) ||
            ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('text/plain'));
        e.preventDefault();
        e.stopPropagation();
    };
    contentAreaElement._contentDragLeaveHandler = function (e) {
        var _a, _b, _c;
        if (attachmentDragState.draggedElement) {
            return;
        }
        if (pendingNativeDrag) {
            return;
        }
        if (isTabDragInProgress()) {
            return;
        }
        const hasFiles = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.files) && e.dataTransfer.files.length > 0;
        const hasTextData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/uri-list')) ||
            ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('text/plain'));
        const rect = contentAreaElement.getBoundingClientRect();
        const isOutside = e.clientX < rect.left || e.clientX > rect.right ||
            e.clientY < rect.top || e.clientY > rect.bottom;
        if (isOutside) {
            const attachmentsSection = document.getElementById('attachments-section');
            if (attachmentsSection) {
                attachmentsSection.classList.remove('drop-hovered');
            }
        }
    };
    contentAreaElement._contentDropHandler = async function (e) {
        var _a, _b, _c;
        try {
            if (attachmentDragState.draggedElement) {
                return;
            }
            const hasFiles = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.files) && e.dataTransfer.files.length > 0;
            const textData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.getData('text/uri-list')) ||
                ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.getData('text/plain')) || '';
            if (textData) {
                e.preventDefault();
                e.stopPropagation();
                await safeInvokeAsync(dotNetRef, 'HandleContentAreaDrop', [textData, 0]);
                return;
            }
            if (hasFiles || (e.dataTransfer.items && e.dataTransfer.items.length > 0)) {
                e.preventDefault();
                e.stopPropagation();
                const { allFiles, fileInfos, isFolderDrop } = await processDroppedItems(e.dataTransfer.items);
                const filePathsJson = JSON.stringify(fileInfos);
                await safeInvokeAsync(dotNetRef, 'StoreFilePathsData', [filePathsJson]);
                const inputFile = document.getElementById(inputFileId);
                if (inputFile) {
                    const dataTransfer = new DataTransfer();
                    allFiles.forEach(file => {
                        dataTransfer.items.add(file);
                    });
                    inputFile.files = dataTransfer.files;
                    const changeEvent = new Event('change', { bubbles: true });
                    inputFile.dispatchEvent(changeEvent);
                }
                await safeInvokeAsync(dotNetRef, 'HandleContentAreaDrop', ['', allFiles.length]);
            }
            const attachmentsSection = document.getElementById('attachments-section');
            if (attachmentsSection) {
                attachmentsSection.classList.remove('drop-hovered');
            }
        }
        catch (error) {
            console.error('Content area drop handling error:', error);
            const attachmentsSection = document.getElementById('attachments-section');
            if (attachmentsSection) {
                attachmentsSection.classList.remove('drop-hovered');
            }
        }
    };
    contentAreaElement.addEventListener('dragenter', contentAreaElement._contentDragEnterHandler);
    contentAreaElement.addEventListener('dragover', contentAreaElement._contentDragOverHandler);
    contentAreaElement.addEventListener('dragleave', contentAreaElement._contentDragLeaveHandler);
    contentAreaElement.addEventListener('drop', contentAreaElement._contentDropHandler);
}
export function initThoughtControlDragDetection(dotNetRef, inputFileId) {
    const thoughtControlElements = document.querySelectorAll('[id$="-cur"]');
    if (thoughtControlElements.length === 0) {
        console.warn('No ThoughtControl elements found for drag detection');
        return;
    }
    thoughtControlElements.forEach((thoughtControlElement) => {
        const htmlElement = thoughtControlElement;
        const elementId = htmlElement.id;
        const thoughtId = elementId.replace(/^tht-/, '').replace(/-cur$/, '');
        if (htmlElement._thoughtControlDragEnterHandler) {
            htmlElement.removeEventListener('dragenter', htmlElement._thoughtControlDragEnterHandler);
        }
        if (htmlElement._thoughtControlDragOverHandler) {
            htmlElement.removeEventListener('dragover', htmlElement._thoughtControlDragOverHandler);
        }
        if (htmlElement._thoughtControlDragLeaveHandler) {
            htmlElement.removeEventListener('dragleave', htmlElement._thoughtControlDragLeaveHandler);
        }
        if (htmlElement._thoughtControlDropHandler) {
            htmlElement.removeEventListener('drop', htmlElement._thoughtControlDropHandler);
        }
        htmlElement._thoughtControlDragEnterHandler = function (e) {
            var _a, _b, _c;
            if (isTabDragInProgress()) {
                return;
            }
            const hasFiles = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('Files');
            const hasTextData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/uri-list')) ||
                ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('text/plain'));
            console.log(`ThoughtControl drag enter: ${thoughtId}, hasFiles: ${hasFiles}, hasTextData: ${hasTextData}`);
            if (hasFiles || hasTextData) {
                e.preventDefault();
                e.stopPropagation();
                htmlElement.style.transform = 'scale(1.5)';
                htmlElement.style.transition = 'all 0.2s ease';
            }
        };
        htmlElement._thoughtControlDragOverHandler = function (e) {
            var _a, _b, _c, _d;
            if (isTabDragInProgress()) {
                return;
            }
            const hasFiles = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('Files');
            const hasTextData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/uri-list')) ||
                ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('text/plain'));
            console.log(`ThoughtControl drag over: ${thoughtId}, hasFiles: ${hasFiles}, hasTextData: ${hasTextData}, types: ${Array.from(((_d = e.dataTransfer) === null || _d === void 0 ? void 0 : _d.types) || [])}`);
            if (hasFiles || hasTextData) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        htmlElement._thoughtControlDragLeaveHandler = function (e) {
            var _a, _b, _c;
            if (isTabDragInProgress()) {
                return;
            }
            const hasFiles = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types.includes('Files');
            const hasTextData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.types.includes('text/uri-list')) ||
                ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.types.includes('text/plain'));
            console.log(`ThoughtControl drag leave: ${thoughtId}, hasFiles: ${hasFiles}, hasTextData: ${hasTextData}`);
            if (hasFiles || hasTextData) {
                const rect = htmlElement.getBoundingClientRect();
                const isOutside = e.clientX < rect.left || e.clientX > rect.right ||
                    e.clientY < rect.top || e.clientY > rect.bottom;
                if (isOutside) {
                    htmlElement.style.transform = '';
                    htmlElement.style.transition = '';
                }
            }
        };
        htmlElement._thoughtControlDropHandler = async function (e) {
            var _a, _b, _c;
            try {
                console.log(`ThoughtControl drop: ${thoughtId}`);
                htmlElement.style.transform = '';
                htmlElement.style.transition = '';
                const hasFiles = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.files) && e.dataTransfer.files.length > 0;
                const textData = ((_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.getData('text/uri-list')) ||
                    ((_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.getData('text/plain')) || '';
                console.log(`ThoughtControl drop data: ${textData}, hasFiles: ${hasFiles}`);
                if (textData) {
                    e.preventDefault();
                    e.stopPropagation();
                    await safeInvokeAsync(dotNetRef, 'HandleThoughtControlDrop', [thoughtId, textData, 0, '[]']);
                    return;
                }
                if (hasFiles || (e.dataTransfer.items && e.dataTransfer.items.length > 0)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const { allFiles, fileInfos, isFolderDrop } = await processDroppedItems(e.dataTransfer.items);
                    const filePathsJson = JSON.stringify(fileInfos);
                    await safeInvokeAsync(dotNetRef, 'HandleThoughtControlDrop', [thoughtId, '', allFiles.length, filePathsJson]);
                    const inputFile = document.getElementById(inputFileId);
                    if (inputFile) {
                        const dataTransfer = new DataTransfer();
                        allFiles.forEach(file => {
                            dataTransfer.items.add(file);
                        });
                        inputFile.files = dataTransfer.files;
                        const changeEvent = new Event('change', { bubbles: true });
                        inputFile.dispatchEvent(changeEvent);
                    }
                }
            }
            catch (error) {
                console.error('ThoughtControl drop handling error:', error);
            }
        };
        htmlElement.addEventListener('dragenter', htmlElement._thoughtControlDragEnterHandler);
        htmlElement.addEventListener('dragover', htmlElement._thoughtControlDragOverHandler);
        htmlElement.addEventListener('dragleave', htmlElement._thoughtControlDragLeaveHandler);
        htmlElement.addEventListener('drop', htmlElement._thoughtControlDropHandler);
    });
}
let attachmentDragState = {
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
let windowLeaveHandler = null;
let isTrackingWindowLeave = false;
let pendingNativeDrag = null;
function startWindowLeaveTracking() {
    if (isTrackingWindowLeave || windowLeaveHandler)
        return;
    const contentArea = document.getElementById('contentAreaOuter');
    if (!contentArea) {
        console.warn('Content area not found for boundary tracking');
        return;
    }
    windowLeaveHandler = function (e) {
        if (attachmentDragState.isHandleBasedReordering) {
            return;
        }
        const rect = contentArea.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right ||
            e.clientY < rect.top || e.clientY > rect.bottom) {
            console.log('Cursor left content area bounds during drag - initiating native drag operation');
            initiateNativeDragOperation();
        }
    };
    document.addEventListener('mousemove', windowLeaveHandler);
    isTrackingWindowLeave = true;
}
function stopWindowLeaveTracking() {
    if (!isTrackingWindowLeave || !windowLeaveHandler)
        return;
    document.removeEventListener('mousemove', windowLeaveHandler);
    windowLeaveHandler = null;
    isTrackingWindowLeave = false;
}
function initiateNativeDragOperation() {
    if (attachmentDragState.isHandleBasedReordering) {
        console.log('Handle-based reordering in progress - skipping native drag initiation');
        return;
    }
    if (!pendingNativeDrag) {
        console.log('No pending native drag operation to initiate');
        return;
    }
    const isMacOS = navigator.platform.toLowerCase().includes('mac');
    if (isMacOS) {
        console.log('macOS native drag already configured - skipping duplicate call');
        cancelCurrentDragOperation();
        return;
    }
    console.log(`Initiating native drag for attachment: ${pendingNativeDrag.attachmentId}`);
    safeInvoke(pendingNativeDrag.dotNetRef, 'StartAttachmentDragOperationAsync', [pendingNativeDrag.attachmentId, pendingNativeDrag.screenX, pendingNativeDrag.screenY]);
    cancelCurrentDragOperation();
}
function cancelCurrentDragOperation() {
    if (!attachmentDragState.draggedElement)
        return;
    console.log('Canceling drag operation');
    if (window.forceDragCleanup) {
        window.forceDragCleanup();
    }
    if (attachmentDragState.dropLine) {
        attachmentDragState.dropLine.style.display = 'none';
    }
    if (attachmentDragState.draggedElement) {
        const dragEndEvent = new DragEvent('dragend', {
            bubbles: true,
            cancelable: true
        });
        attachmentDragState.draggedElement.dispatchEvent(dragEndEvent);
    }
    attachmentDragState.draggedElement = null;
    attachmentDragState.draggedAttachmentId = null;
    attachmentDragState.currentDropIndex = -1;
    attachmentDragState.isHandleBasedReordering = false;
    stopWindowLeaveTracking();
    pendingNativeDrag = null;
    console.log('Cancelled drag operation!');
}
function createDropLine() {
    const dropLine = document.createElement('div');
    dropLine.className = `attachment-drop-line ${attachmentDragState.viewMode === 'List' ? 'horizontal' : 'vertical'}`;
    dropLine.style.display = 'none';
    return dropLine;
}
function updateDropLinePosition(e) {
    if (!attachmentDragState.container || !attachmentDragState.dropLine)
        return;
    const containerRect = attachmentDragState.container.getBoundingClientRect();
    const elements = attachmentDragState.attachmentElements.filter(el => el !== attachmentDragState.draggedElement);
    const scale = getScaleFactor(attachmentDragState.container);
    if (attachmentDragState.viewMode === 'List') {
        let dropIndex = 0;
        let dropY = containerRect.top;
        for (let i = 0; i < elements.length; i++) {
            const elementRect = elements[i].getBoundingClientRect();
            const elementMidpoint = elementRect.top + elementRect.height / 2;
            if (e.clientY < elementMidpoint) {
                dropIndex = attachmentDragState.originalOrder.indexOf(elements[i].getAttribute('data-attachment-id'));
                dropY = elementRect.top;
                break;
            }
            else {
                dropIndex = attachmentDragState.originalOrder.indexOf(elements[i].getAttribute('data-attachment-id')) + 1;
                dropY = elementRect.bottom;
            }
        }
        attachmentDragState.dropLine.style.display = 'block';
        const offsetY = (dropY - containerRect.top - 1.5) / scale;
        attachmentDragState.dropLine.style.top = `${offsetY}px`;
        attachmentDragState.currentDropIndex = dropIndex;
    }
    else {
        let dropIndex = 0;
        let dropX = containerRect.left;
        let rowTop = containerRect.top;
        let rowHeight = 0;
        const sortedElements = elements.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            if (Math.abs(aRect.top - bRect.top) > 10) {
                return aRect.top - bRect.top;
            }
            return aRect.left - bRect.left;
        });
        const rows = [];
        let currentRow = [];
        let lastTop = -1;
        sortedElements.forEach(element => {
            const rect = element.getBoundingClientRect();
            if (lastTop !== -1 && Math.abs(rect.top - lastTop) > 10) {
                if (currentRow.length > 0) {
                    rows.push(currentRow);
                }
                currentRow = [element];
            }
            else {
                currentRow.push(element);
            }
            lastTop = rect.top;
        });
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }
        let targetRow = null;
        let insertAtBeginning = false;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const firstInRow = row[0];
            const lastInRow = row[row.length - 1];
            const firstRect = firstInRow.getBoundingClientRect();
            const lastRect = lastInRow.getBoundingClientRect();
            if (e.clientY >= firstRect.top - 10 && e.clientY <= firstRect.bottom + 10) {
                targetRow = row;
                rowTop = firstRect.top;
                rowHeight = firstRect.height;
                let foundPosition = false;
                for (let i = 0; i < row.length; i++) {
                    const elementRect = row[i].getBoundingClientRect();
                    const elementMidpointX = elementRect.left + elementRect.width / 2;
                    if (e.clientX < elementMidpointX) {
                        dropIndex = attachmentDragState.originalOrder.indexOf(row[i].getAttribute('data-attachment-id'));
                        dropX = elementRect.left;
                        foundPosition = true;
                        break;
                    }
                }
                if (!foundPosition) {
                    const lastElement = row[row.length - 1];
                    const lastRect = lastElement.getBoundingClientRect();
                    dropIndex = attachmentDragState.originalOrder.indexOf(lastElement.getAttribute('data-attachment-id')) + 1;
                    dropX = lastRect.right;
                }
                break;
            }
            else if (e.clientY < firstRect.top) {
                targetRow = row;
                rowTop = firstRect.top;
                rowHeight = firstRect.height;
                dropIndex = attachmentDragState.originalOrder.indexOf(row[0].getAttribute('data-attachment-id'));
                dropX = firstRect.left;
                insertAtBeginning = true;
                break;
            }
        }
        if (!targetRow && rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            const lastElement = lastRow[lastRow.length - 1];
            const lastRect = lastElement.getBoundingClientRect();
            targetRow = lastRow;
            rowTop = lastRect.top;
            rowHeight = lastRect.height;
            dropIndex = attachmentDragState.originalOrder.indexOf(lastElement.getAttribute('data-attachment-id')) + 1;
            dropX = lastRect.right;
        }
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
export function initAttachmentDragAndDrop(dotNetRef, containerId, viewMode) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Attachment container not found: ${containerId}`);
        return;
    }
    attachmentDragState.container = container;
    attachmentDragState.viewMode = viewMode;
    const attachmentElements = Array.from(container.querySelectorAll('[data-attachment-id]'));
    attachmentDragState.attachmentElements = attachmentElements;
    attachmentDragState.originalOrder = attachmentElements.map(el => el.getAttribute('data-attachment-id'));
    attachmentDragState.dropLine = createDropLine();
    container.appendChild(attachmentDragState.dropLine);
    attachmentElements.forEach(element => {
        const isMacOS = navigator.platform.toLowerCase().includes('mac');
        const dragHandle = element.querySelector('.drag-handle');
        const iconTileDiv = element.querySelector('div:not(.drag-handle)');
        const useDragHandles = (isMacOS || isElectron()) && !!dragHandle;
        if (useDragHandles) {
            dragHandle.draggable = true;
            element.draggable = isElectron();
        }
        else {
            element.draggable = true;
        }
        if (element._attachmentDragStart) {
            element.removeEventListener('dragstart', element._attachmentDragStart);
        }
        if (element._attachmentDragEnd) {
            element.removeEventListener('dragend', element._attachmentDragEnd);
        }
        if (element._attachmentDragOver) {
            element.removeEventListener('dragover', element._attachmentDragOver);
        }
        if (element._attachmentDrop) {
            element.removeEventListener('drop', element._attachmentDrop);
        }
        if (dragHandle && dragHandle._dragHandleDragStart) {
            dragHandle.removeEventListener('dragstart', dragHandle._dragHandleDragStart);
        }
        if (dragHandle && dragHandle._dragHandleDragEnd) {
            dragHandle.removeEventListener('dragend', dragHandle._dragHandleDragEnd);
        }
        if (element._macOSMouseDown) {
            element.removeEventListener('mousedown', element._macOSMouseDown);
        }
        const createHandleDragStartHandler = () => {
            return function (e) {
                const attachmentId = element.getAttribute('data-attachment-id');
                if (!attachmentId)
                    return;
                console.log(`Attachment reorder drag start from handle: ${attachmentId}`);
                e.stopPropagation();
                attachmentDragState.draggedElement = element;
                attachmentDragState.draggedAttachmentId = attachmentId;
                attachmentDragState.isHandleBasedReordering = true;
                if (e.dataTransfer) {
                    e.dataTransfer.setData('application/x-thebrain-attachment-reorder', attachmentId);
                    e.dataTransfer.setData('text/plain', attachmentId);
                    e.dataTransfer.effectAllowed = 'move';
                }
            };
        };
        const createElementDragStartHandler = () => {
            return function (e) {
                const attachmentId = element.getAttribute('data-attachment-id');
                if (!attachmentId)
                    return;
                if (isElectron()) {
                    const dragType = element.getAttribute('data-drag-type');
                    const dragPath = element.getAttribute('data-drag-path');
                    const dragUrl = element.getAttribute('data-drag-url');
                    const dragTitle = element.getAttribute('data-drag-title');
                    if (dragType === 'url' && dragUrl) {
                        console.log(`Electron URL drag (HTML5 mode): ${attachmentId}`, dragUrl);
                        if (e.dataTransfer) {
                            e.dataTransfer.setData('text/uri-list', dragUrl);
                            e.dataTransfer.setData('text/plain', dragUrl);
                            e.dataTransfer.effectAllowed = 'copyLink';
                            const displayTitle = dragTitle || 'Link';
                            const dragImage = createDragImageSync(displayTitle, 'url');
                            e.dataTransfer.setDragImage(dragImage.element, 0, 0);
                        }
                        return;
                    }
                    let dragInfo = null;
                    if (dragType === 'file' && dragPath) {
                        dragInfo = { type: 'file', path: dragPath, title: dragTitle || undefined };
                    }
                    else if (dragType === 'folder' && dragPath) {
                        dragInfo = { type: 'folder', path: dragPath, title: dragTitle || undefined };
                    }
                    if (dragInfo) {
                        const ipcRenderer = getIpcRenderer();
                        if (ipcRenderer) {
                            e.preventDefault();
                            (async () => {
                                const displayTitle = dragInfo.title || (dragInfo.path ? dragInfo.path.split(/[\\/]/).pop() : 'Item') || 'Item';
                                let systemIcon = null;
                                if (dragInfo.path && dragInfo.type === 'file') {
                                    systemIcon = await getSystemFileIcon(dragInfo.path);
                                }
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
                pendingNativeDrag = {
                    attachmentId: attachmentId,
                    screenX: e.screenX,
                    screenY: e.screenY,
                    dotNetRef: dotNetRef
                };
                startWindowLeaveTracking();
                if (e.dataTransfer) {
                    e.dataTransfer.clearData('application/x-thebrain-attachment-id');
                    e.dataTransfer.clearData('text/plain');
                    e.dataTransfer.setData('application/x-thebrain-attachment-id', attachmentId);
                    e.dataTransfer.setData('text/plain', attachmentId);
                    e.dataTransfer.effectAllowed = 'copyMove';
                    console.log(`Set attachment drag data: ${attachmentId}`);
                }
            };
        };
        element._attachmentDragStart = createElementDragStartHandler();
        element._attachmentDragEnd = function (e) {
            if (attachmentDragState.dropLine) {
                attachmentDragState.dropLine.style.display = 'none';
            }
            if (e.dataTransfer) {
                e.dataTransfer.clearData('application/x-thebrain-attachment-id');
                e.dataTransfer.clearData('application/x-thebrain-attachment-reorder');
                e.dataTransfer.clearData('text/plain');
            }
            stopWindowLeaveTracking();
            pendingNativeDrag = null;
            attachmentDragState.draggedElement = null;
            attachmentDragState.draggedAttachmentId = null;
            attachmentDragState.currentDropIndex = -1;
            attachmentDragState.isHandleBasedReordering = false;
        };
        element._attachmentDragOver = function (e) {
            if (!attachmentDragState.draggedElement)
                return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            updateDropLinePosition(e);
        };
        element._attachmentDrop = function (e) {
            if (!attachmentDragState.draggedElement)
                return;
            e.preventDefault();
            e.stopPropagation();
            const draggedAttachmentId = attachmentDragState.draggedAttachmentId;
            if (!draggedAttachmentId || attachmentDragState.currentDropIndex === -1)
                return;
            if (attachmentDragState.dropLine) {
                attachmentDragState.dropLine.style.display = 'none';
            }
            safeInvoke(dotNetRef, 'HandleAttachmentReorder', [draggedAttachmentId, attachmentDragState.currentDropIndex]);
        };
        if (useDragHandles && dragHandle) {
            dragHandle._dragHandleDragStart = createHandleDragStartHandler();
            dragHandle._dragHandleDragEnd = element._attachmentDragEnd;
            dragHandle.addEventListener('dragstart', dragHandle._dragHandleDragStart);
            dragHandle.addEventListener('dragend', dragHandle._dragHandleDragEnd);
            if (!isElectron()) {
                element._macOSMouseDown = function (e) {
                    if (dragHandle && (e.target === dragHandle || dragHandle.contains(e.target))) {
                        return;
                    }
                    const attachmentId = element.getAttribute('data-attachment-id');
                    if (!attachmentId)
                        return;
                    console.log(`macOS mousedown for native drag: ${attachmentId}`);
                    pendingNativeDrag = {
                        attachmentId: attachmentId,
                        screenX: e.screenX,
                        screenY: e.screenY,
                        dotNetRef: dotNetRef
                    };
                    safeInvoke(dotNetRef, 'StartAttachmentDragOperationAsync', [attachmentId, e.screenX, e.screenY]);
                    setTimeout(() => {
                        if (pendingNativeDrag && pendingNativeDrag.attachmentId === attachmentId) {
                            console.log('Clearing pending native drag state after timeout');
                            pendingNativeDrag = null;
                        }
                    }, 3000);
                };
                element.addEventListener('mousedown', element._macOSMouseDown);
            }
        }
        element.addEventListener('dragstart', element._attachmentDragStart);
        element.addEventListener('dragend', element._attachmentDragEnd);
        element.addEventListener('dragover', element._attachmentDragOver);
        element.addEventListener('drop', element._attachmentDrop);
    });
    if (container._containerDragOver) {
        container.removeEventListener('dragover', container._containerDragOver);
    }
    container._containerDragOver = function (e) {
        if (!attachmentDragState.draggedElement)
            return;
        e.preventDefault();
        updateDropLinePosition(e);
    };
    container.addEventListener('dragover', container._containerDragOver);
}
function getScaleFactor(element) {
    const scaleContainer = element.closest('.attachments-and-note-section-scale-content');
    if (!scaleContainer) {
        return 1;
    }
    const rect = scaleContainer.getBoundingClientRect();
    const width = scaleContainer.offsetWidth;
    if (width === 0) {
        return 1;
    }
    const scale = rect.width / width;
    if (!Number.isFinite(scale) || scale <= 0) {
        return 1;
    }
    return scale;
}
export function clearPendingNativeDrag() {
    if (pendingNativeDrag) {
        console.log('Clearing pending native drag state');
        pendingNativeDrag = null;
    }
}
export function cleanupAttachmentDragAndDrop(containerId) {
    const container = document.getElementById(containerId);
    if (!container)
        return;
    const attachmentElements = Array.from(container.querySelectorAll('[data-attachment-id]'));
    attachmentElements.forEach(element => {
        element.draggable = false;
        const dragHandle = element.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.draggable = false;
            if (dragHandle._dragHandleDragStart) {
                dragHandle.removeEventListener('dragstart', dragHandle._dragHandleDragStart);
            }
            if (dragHandle._dragHandleDragEnd) {
                dragHandle.removeEventListener('dragend', dragHandle._dragHandleDragEnd);
            }
        }
        if (element._macOSMouseDown) {
            element.removeEventListener('mousedown', element._macOSMouseDown);
        }
        if (element._attachmentDragStart) {
            element.removeEventListener('dragstart', element._attachmentDragStart);
        }
        if (element._attachmentDragEnd) {
            element.removeEventListener('dragend', element._attachmentDragEnd);
        }
        if (element._attachmentDragOver) {
            element.removeEventListener('dragover', element._attachmentDragOver);
        }
        if (element._attachmentDrop) {
            element.removeEventListener('drop', element._attachmentDrop);
        }
    });
    if (container._containerDragOver) {
        container.removeEventListener('dragover', container._containerDragOver);
    }
    if (attachmentDragState.dropLine) {
        attachmentDragState.dropLine.remove();
    }
    stopWindowLeaveTracking();
    pendingNativeDrag = null;
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
export function getDropTargetAtPosition(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) {
        return null;
    }
    let current = element;
    while (current && current !== document.body) {
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
        const zone = current.getAttribute('data-zone');
        if (zone) {
            return {
                type: 'plex-zone',
                zone: zone,
                clientX: clientX,
                clientY: clientY
            };
        }
        if (current.id && current.id.match(/^tht-[a-f0-9-]+-cur$/)) {
            const thoughtId = current.id.replace(/^tht-/, '').replace(/-cur$/, '');
            return {
                type: 'thought',
                id: thoughtId,
                clientX: clientX,
                clientY: clientY
            };
        }
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
export function showDropTargetFeedback(targetInfo) {
    if (!targetInfo)
        return;
    try {
        if (targetInfo.type === 'plex-zone') {
            const zoneElement = document.querySelector(`[data-zone="${targetInfo.zone}"]`);
            if (zoneElement) {
                zoneElement.classList.add('hovered');
            }
        }
        else if (targetInfo.type === 'thought') {
            const thoughtElement = document.getElementById(`tht-${targetInfo.id}-cur`);
            if (thoughtElement instanceof HTMLElement) {
                thoughtElement.style.transform = 'scale(1.5)';
                thoughtElement.style.transition = 'all 0.2s ease';
            }
        }
        else if (targetInfo.type === 'content-area') {
            const contentArea = document.getElementById('attachments-section');
            if (contentArea) {
                contentArea.classList.add('drop-hovered');
            }
        }
        else if (targetInfo.type === 'upload-control') {
            let uploadControlFeedback = document.querySelector(`.upload-control-feedback[data-upload-control-id="${targetInfo.elementId}"]`);
            if (!uploadControlFeedback) {
                const container = document.getElementById(targetInfo.elementId);
                uploadControlFeedback = container === null || container === void 0 ? void 0 : container.querySelector('.upload-control-feedback');
            }
            if (uploadControlFeedback) {
                uploadControlFeedback.classList.add('drop-hovered');
            }
        }
    }
    catch (error) {
        console.error('Error showing drop target feedback:', error);
    }
}
export function hideDropTargetFeedback() {
    try {
        document.querySelectorAll('[data-zone].hovered').forEach(el => {
            el.classList.remove('hovered');
        });
        document.querySelectorAll('[id$="-cur"]').forEach(el => {
            if (el instanceof HTMLElement) {
                el.style.transform = '';
                el.style.transition = '';
            }
        });
        const contentArea = document.getElementById('attachments-section');
        if (contentArea) {
            contentArea.classList.remove('drop-hovered');
        }
        document.querySelectorAll('.upload-control-feedback.drop-hovered').forEach(el => {
            el.classList.remove('drop-hovered');
        });
    }
    catch (error) {
        console.error('Error hiding drop target feedback:', error);
    }
}
export function showPlexZoneFeedback(zone) {
    const zoneElement = document.querySelector(`[data-zone="${zone}"]`);
    if (zoneElement) {
        zoneElement.classList.add('hovered');
    }
}
export function hidePlexZoneFeedback(zone) {
    const zoneElement = document.querySelector(`[data-zone="${zone}"]`);
    if (zoneElement) {
        zoneElement.classList.remove('hovered');
    }
}
let defaultDropEffect = 'copy';
export function setDefaultDropEffect(effect) {
    if (effect === 'copy' || effect === 'move' || effect === 'link') {
        defaultDropEffect = effect;
    }
}
function hasExternalContent(e) {
    var _a;
    const types = ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.types) || [];
    return types.includes('Files') || types.includes('text/uri-list');
}
function getDropEffectForModifiers(e) {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    let desired;
    if (isMac) {
        if (e.ctrlKey)
            desired = 'link';
        else if (e.shiftKey)
            desired = 'move';
        else if (e.altKey)
            desired = 'copy';
        else
            desired = defaultDropEffect;
    }
    else {
        if (e.altKey)
            desired = 'link';
        else if (e.shiftKey)
            desired = 'move';
        else if (e.ctrlKey)
            desired = 'copy';
        else
            desired = defaultDropEffect;
    }
    if (e.dataTransfer && !isEffectPermitted(desired, e.dataTransfer.effectAllowed)) {
        return 'copy';
    }
    return desired;
}
function isEffectPermitted(effect, allowed) {
    if (allowed === 'all' || allowed === 'uninitialized')
        return true;
    if (allowed === 'none')
        return effect === 'none';
    return allowed.toLowerCase().includes(effect.toLowerCase());
}
function getModifierKeysValue(e) {
    let mods = 0;
    if (e.ctrlKey)
        mods |= 1;
    if (e.shiftKey)
        mods |= 2;
    if (e.altKey)
        mods |= 4;
    if (e.metaKey)
        mods |= 8;
    return mods;
}
function buildElectronDropData(e) {
    var _a, _b, _c;
    const dropData = {
        Files: [],
        Folders: [],
        Urls: [],
        Text: null,
        ScreenX: e.screenX,
        ScreenY: e.screenY,
        ClientX: e.clientX,
        ClientY: e.clientY,
        ModifierKeys: getModifierKeysValue(e),
        FileSizes: {},
        FolderSizes: {}
    };
    const uriList = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.getData('text/uri-list');
    if (uriList) {
        dropData.Urls = uriList.split('\n')
            .map(u => u.trim())
            .filter(u => u.startsWith('http://') || u.startsWith('https://'));
    }
    if (!dropData.Urls.length) {
        const text = (_b = e.dataTransfer) === null || _b === void 0 ? void 0 : _b.getData('text/plain');
        if (text && !text.startsWith('http://') && !text.startsWith('https://')) {
            dropData.Text = text;
        }
    }
    const files = (_c = e.dataTransfer) === null || _c === void 0 ? void 0 : _c.files;
    if (files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const filePath = file.path;
            if (!filePath)
                continue;
            if (electronDragDropHelper.isDirectory(filePath)) {
                dropData.Folders.push(filePath);
                const contents = electronDragDropHelper.walkFolder(filePath);
                const totalSize = contents.reduce((sum, f) => sum + (f.size || 0), 0);
                dropData.FolderSizes[filePath] = totalSize;
            }
            else {
                dropData.Files.push(filePath);
                dropData.FileSizes[filePath] = file.size;
            }
        }
    }
    return dropData;
}
async function routeElectronDropToHandler(dropDataJson, target) {
    const handler = window.blazorNativeDropHandler;
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
function getNodeFs() {
    var _a, _b;
    try {
        return (_b = (_a = window).require) === null || _b === void 0 ? void 0 : _b.call(_a, 'fs');
    }
    catch (_c) {
        return null;
    }
}
function getNodePath() {
    var _a, _b;
    try {
        return (_b = (_a = window).require) === null || _b === void 0 ? void 0 : _b.call(_a, 'path');
    }
    catch (_c) {
        return null;
    }
}
const electronDragDropHelper = {
    fs: null,
    path: null,
    init() {
        this.fs = getNodeFs();
        this.path = getNodePath();
        let success = !!this.fs && !!this.path;
        console.log(`Electron drag/drop helper initialized: ${success ? 'success' : 'failed'}`);
        return success;
    },
    isDirectory(filePath) {
        if (!this.fs)
            return false;
        try {
            return this.fs.statSync(filePath).isDirectory();
        }
        catch (_a) {
            return false;
        }
    },
    getFileSize(filePath) {
        if (!this.fs)
            return 0;
        try {
            return this.fs.statSync(filePath).size;
        }
        catch (_a) {
            return 0;
        }
    },
    walkFolder(folderPath) {
        if (!this.fs || !this.path)
            return [];
        const results = [];
        const walk = (dir) => {
            try {
                const entries = this.fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = this.path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        results.push({ path: fullPath, isDirectory: true, size: 0 });
                        walk(fullPath);
                    }
                    else {
                        try {
                            const size = this.fs.statSync(fullPath).size;
                            results.push({ path: fullPath, isDirectory: false, size });
                        }
                        catch (_a) {
                            results.push({ path: fullPath, isDirectory: false, size: 0 });
                        }
                    }
                }
            }
            catch (_b) {
            }
        };
        walk(folderPath);
        return results;
    }
};
export function initElectronNativeDropHandler() {
    if (!electronDragDropHelper.init()) {
        console.log('Node.js fs/path modules not available, skipping Electron native drop handler');
        return;
    }
    let currentTarget = null;
    let lastTargetJson = '';
    window.addEventListener('dragenter', (e) => {
        if (!hasExternalContent(e))
            return;
        if (isTabDragInProgress())
            return;
        e.preventDefault();
        e.stopPropagation();
        if (isLinuxElectron() && e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'all';
        }
    }, true);
    window.addEventListener('dragover', (e) => {
        if (!hasExternalContent(e))
            return;
        if (isTabDragInProgress())
            return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = getDropEffectForModifiers(e);
        }
        const target = getDropTargetAtPosition(e.clientX, e.clientY);
        const targetJson = JSON.stringify(target);
        if (targetJson !== lastTargetJson) {
            hideDropTargetFeedback();
            if (target) {
                showDropTargetFeedback(target);
            }
            currentTarget = target;
            lastTargetJson = targetJson;
        }
    }, true);
    window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) {
            hideDropTargetFeedback();
            currentTarget = null;
            lastTargetJson = '';
        }
    }, true);
    window.addEventListener('drop', async (e) => {
        if (!hasExternalContent(e))
            return;
        if (isTabDragInProgress())
            return;
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
class NativeDropHandler {
    constructor() {
        this.plexControlRef = null;
        this.attachmentsControlRef = null;
        this.uploadControls = new Map();
    }
    registerPlexControl(dotNetRef) {
        this.plexControlRef = dotNetRef;
    }
    registerAttachmentsControl(dotNetRef) {
        this.attachmentsControlRef = dotNetRef;
    }
    registerUploadControl(elementId, dotNetRef) {
        this.uploadControls.set(elementId, dotNetRef);
        console.log(`Registered upload control: ${elementId}`);
    }
    unregisterUploadControl(elementId) {
        this.uploadControls.delete(elementId);
        console.log(`Unregistered upload control: ${elementId}`);
    }
    async handlePlexZoneDrop(dropDataJson, zone) {
        if (!this.plexControlRef) {
            console.error('PlexControl not registered with NativeDropHandler');
            return;
        }
        await safeInvokeAsync(this.plexControlRef, 'HandleNativeZoneDropAsync', [dropDataJson, zone]);
    }
    async handleThoughtDrop(dropDataJson, thoughtId) {
        if (!this.plexControlRef) {
            console.error('PlexControl not registered with NativeDropHandler');
            return;
        }
        await safeInvokeAsync(this.plexControlRef, 'HandleNativeThoughtDropAsync', [dropDataJson, thoughtId]);
    }
    async handleContentAreaDrop(dropDataJson) {
        if (!this.attachmentsControlRef) {
            console.error('AttachmentsControl not registered with NativeDropHandler');
            return;
        }
        await safeInvokeAsync(this.attachmentsControlRef, 'HandleNativeContentAreaDropAsync', [dropDataJson]);
    }
    async handleUploadControlDrop(dropDataJson, elementId) {
        const uploadControl = this.uploadControls.get(elementId);
        if (!uploadControl) {
            console.error(`Upload control not registered: ${elementId}`);
            return;
        }
        await safeInvokeAsync(uploadControl, 'HandleNativeDropAsync', [dropDataJson]);
    }
}
const nativeDropHandler = new NativeDropHandler();
window.dragAndDropHelper = {
    clearPendingNativeDrag,
    getDropTargetAtPosition,
    showDropTargetFeedback,
    hideDropTargetFeedback,
    showPlexZoneFeedback,
    hidePlexZoneFeedback,
    initUploadControlFeedback,
    setDefaultDropEffect
};
window.blazorNativeDropHandler = nativeDropHandler;
window.initElectronNativeDropHandler = initElectronNativeDropHandler;
//# sourceMappingURL=dragAndDropHelper.js.map