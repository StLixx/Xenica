import { Rect } from "./geometry.js";
import { safeInvoke } from "./interop.js";
export class DomUtils {
    static offsetElement(element, delta) {
        let left = +element.style.left.substring(0, element.style.left.length - 2);
        let top = +element.style.top.substring(0, element.style.top.length - 2);
        left += delta.x;
        top += delta.y;
        element.style.left = left + "px";
        element.style.top = top + "px";
    }
    static getCenter(element, parentElement) {
        let rect = this.getRect(element, parentElement);
        return rect.getCenter();
    }
    static getRect(element, parentElement) {
        let fieldRect = parentElement.getBoundingClientRect();
        let clientRect = element.getBoundingClientRect();
        let rect = new Rect(clientRect.x, clientRect.y, clientRect.width, clientRect.height);
        rect.x -= fieldRect.left;
        rect.y -= fieldRect.top;
        return rect;
    }
    static centerOnTopOf(element, centerOnElement, parentElement) {
        let cen = this.getCenter(centerOnElement, parentElement);
        this.centerAt(element, cen);
    }
    static keepInsideOf(element, locationElement) {
        let clientRect = element.getBoundingClientRect();
        let containRect = locationElement.getBoundingClientRect();
        let left = +element.style.left.substring(0, element.style.left.length - 2);
        let top = +element.style.top.substring(0, element.style.top.length - 2);
        if (clientRect.x < containRect.x) {
            left += containRect.x - clientRect.x;
        }
        if (clientRect.y < containRect.y) {
            top += containRect.y - clientRect.y;
        }
        if (clientRect.right > containRect.right) {
            left -= clientRect.right - containRect.right;
        }
        if (clientRect.bottom > containRect.bottom) {
            top -= clientRect.bottom - containRect.bottom;
        }
        element.style.left = left + "px";
        element.style.top = top + "px";
    }
    static centerAt(element, cen) {
        element.style.position = "absolute";
        element.style.left = cen.x - element.clientWidth / 2 + "px";
        element.style.top = cen.y - element.clientHeight / 2 + "px";
    }
    static positionAt(element, pt) {
        element.style.position = "absolute";
        element.style.left = pt.x + "px";
        element.style.top = pt.y + "px";
    }
    static SelectRangeInTextInputElement(element, range, selectAll) {
        if (!element || typeof element.focus !== 'function') {
            console.warn('SelectRangeInTextInputElement: Invalid or unfocusable element provided');
            return;
        }
        element.focus();
        if (selectAll) {
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                element.select();
                return;
            }
            else if (element.getAttribute('contenteditable') === 'true') {
                const domRange = document.createRange();
                domRange.selectNodeContents(element);
                const selection = window.getSelection();
                selection === null || selection === void 0 ? void 0 : selection.removeAllRanges();
                selection === null || selection === void 0 ? void 0 : selection.addRange(domRange);
                return;
            }
        }
        if (range) {
            const startIndex = range.start.value;
            const endIndex = range.end.value;
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                element.setSelectionRange(startIndex, endIndex);
            }
            else if (element.getAttribute('contenteditable') === 'true') {
                const selection = window.getSelection();
                const domRange = document.createRange();
                const textNode = element.firstChild;
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    domRange.setStart(textNode, startIndex);
                    domRange.setEnd(textNode, endIndex);
                    selection === null || selection === void 0 ? void 0 : selection.removeAllRanges();
                    selection === null || selection === void 0 ? void 0 : selection.addRange(domRange);
                }
            }
        }
    }
    static unfocusElement(elementId) {
        let elem = document.getElementById(elementId);
        if (elem) {
            elem.blur();
        }
    }
    static setInputValue(element, value) {
        if (element && element.value !== value) {
            element.value = value;
        }
    }
    static updatePrettyPrint() {
        PR.prettyPrint();
    }
    static getCursorPositionInElement(elementId) {
        let element = document.getElementById(elementId);
        if (element) {
            let inputElement = element;
            return inputElement.selectionStart;
        }
        else {
            return -1;
        }
    }
    static attachKeyDownSelectionSnapshot(elementId) {
        let element = document.getElementById(elementId);
        if (!element) {
            return;
        }
        let el = element;
        if (el.__keyDownSelectionSnapshotAttached) {
            return;
        }
        el.__keyDownSelectionSnapshotAttached = true;
        el.addEventListener('keydown', (e) => {
            el.__lastKeyDownSelectionStart = el.selectionStart;
            el.__lastKeyDownSelectionEnd = el.selectionEnd;
        }, true);
    }
    static wasCursorAtStartNoSelectionAtLastKeyDown(elementId) {
        let element = document.getElementById(elementId);
        if (!element) {
            return false;
        }
        return element.__lastKeyDownSelectionStart === 0 && element.__lastKeyDownSelectionEnd === 0;
    }
    static setPointerCapture(element, pointerId) {
        element === null || element === void 0 ? void 0 : element.setPointerCapture(pointerId);
    }
    static releasePointerCapture(element, pointerId) {
        element === null || element === void 0 ? void 0 : element.releasePointerCapture(pointerId);
    }
    static syncScrollTop(source, target) {
        if (source && target) {
            target.scrollTop = source.scrollTop;
        }
    }
    static syncGutterWithTextarea(textarea, gutter) {
        if (!textarea || !gutter)
            return;
        const ta = textarea;
        const text = ta.value || '';
        const lines = text.split('\n');
        const style = window.getComputedStyle(ta);
        const lineHeight = parseFloat(style.lineHeight);
        const isWrapping = style.whiteSpace !== 'pre';
        if (!isWrapping || !lineHeight) {
            let html = '';
            for (let i = 1; i <= lines.length; i++) {
                html += `<div style="height:${lineHeight}px">${i}</div>`;
            }
            gutter.innerHTML = html;
            gutter.scrollTop = ta.scrollTop;
            return;
        }
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const contentWidth = ta.clientWidth - paddingLeft - paddingRight;
        if (contentWidth <= 0) {
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
        for (let i = 0; i < lines.length; i++) {
            mirror.textContent = lines[i] || ' ';
            const h = mirror.offsetHeight;
            html += `<div style="height:${h}px">${i + 1}</div>`;
        }
        document.body.removeChild(mirror);
        gutter.innerHTML = html;
        gutter.scrollTop = ta.scrollTop;
    }
    static syncGutterCurrentLine(textarea, gutter) {
        var _a;
        if (!textarea || !gutter)
            return;
        const ta = textarea;
        const text = ta.value || '';
        const lines = text.split('\n');
        if (lines.length !== gutter.children.length) {
            DomUtils.syncGutterWithTextarea(textarea, gutter);
            return;
        }
        const style = window.getComputedStyle(ta);
        const isWrapping = style.whiteSpace !== 'pre';
        if (!isWrapping) {
            gutter.scrollTop = ta.scrollTop;
            return;
        }
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const contentWidth = ta.clientWidth - paddingLeft - paddingRight;
        if (contentWidth <= 0) {
            gutter.scrollTop = ta.scrollTop;
            return;
        }
        const cursorPos = (_a = ta.selectionStart) !== null && _a !== void 0 ? _a : 0;
        let lineIndex = 0;
        let pos = 0;
        for (let i = 0; i < lines.length; i++) {
            pos += lines[i].length + 1;
            if (pos > cursorPos) {
                lineIndex = i;
                break;
            }
        }
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
        const gutterChild = gutter.children[lineIndex];
        if (gutterChild) {
            gutterChild.style.height = h + 'px';
        }
        gutter.scrollTop = ta.scrollTop;
    }
    static initGutterResizeObserver(textarea, gutter) {
        if (!textarea || !gutter)
            return;
        DomUtils.disposeGutterResizeObserver(textarea);
        DomUtils.syncGutterWithTextarea(textarea, gutter);
        const observer = new ResizeObserver(() => {
            DomUtils.syncGutterWithTextarea(textarea, gutter);
        });
        observer.observe(textarea);
        DomUtils.gutterResizeObservers.set(textarea, observer);
    }
    static disposeGutterResizeObserver(textarea) {
        if (!textarea)
            return;
        const observer = DomUtils.gutterResizeObservers.get(textarea);
        if (observer) {
            observer.disconnect();
            DomUtils.gutterResizeObservers.delete(textarea);
        }
    }
    static captureElementRects(elementIds) {
        if (!elementIds || elementIds.length === 0) {
            return 0;
        }
        let captured = 0;
        for (const id of elementIds) {
            const element = document.getElementById(id);
            if (!element) {
                continue;
            }
            DomUtils.cardFlipRects[id] = DomUtils.getDocumentRelativeRect(element);
            captured++;
        }
        return captured;
    }
    static captureElementsBySelectorWithin(containerId, selector) {
        if (!selector) {
            return 0;
        }
        const scope = containerId ? document.getElementById(containerId) : document;
        if (!scope) {
            return 0;
        }
        DomUtils.cardFlipRects = {};
        let captured = 0;
        const elements = scope.querySelectorAll(selector);
        elements.forEach(element => {
            const el = element;
            if (!el.id) {
                return;
            }
            DomUtils.cardFlipRects[el.id] = DomUtils.getDocumentRelativeRect(el);
            captured++;
        });
        return captured;
    }
    static animateElementFlip(elementIds, durationMs) {
        if (!elementIds || elementIds.length === 0) {
            return;
        }
        const duration = durationMs && durationMs > 0 ? durationMs : 400;
        const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
        for (const id of elementIds) {
            const previousRect = DomUtils.cardFlipRects[id];
            const element = document.getElementById(id);
            delete DomUtils.cardFlipRects[id];
            if (!element) {
                continue;
            }
            const nextRect = DomUtils.getDocumentRelativeRect(element);
            let deltaX = 0;
            let deltaY = 0;
            if (previousRect) {
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
                if (finished) {
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
            if (typeof element.animate === 'function') {
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
            }
            else {
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
    static getDocumentRelativeRect(element) {
        var _a, _b, _c, _d, _e, _f;
        const rect = element.getBoundingClientRect();
        const scrollX = (_c = (_a = window.pageXOffset) !== null && _a !== void 0 ? _a : (_b = document.documentElement) === null || _b === void 0 ? void 0 : _b.scrollLeft) !== null && _c !== void 0 ? _c : 0;
        const scrollY = (_f = (_d = window.pageYOffset) !== null && _d !== void 0 ? _d : (_e = document.documentElement) === null || _e === void 0 ? void 0 : _e.scrollTop) !== null && _f !== void 0 ? _f : 0;
        return {
            left: rect.left + scrollX,
            top: rect.top + scrollY,
            width: rect.width,
            height: rect.height
        };
    }
    static initIgnoreScrollEvents(elementId) {
        let element = document.getElementById(elementId);
        if (element) {
            let startY = null;
            let startX = null;
            let maxDelta = 0;
            const moveThreshold = 10;
            element.addEventListener("touchstart", (event) => {
                startY = event.touches[0].clientY;
                startX = event.touches[0].clientX;
                maxDelta = 0;
            });
            element.addEventListener("touchend", (e) => {
                console.log(`maxDelta: ${maxDelta}`);
                if (maxDelta > moveThreshold) {
                    return;
                }
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: e.changedTouches[0].clientX,
                    clientY: e.changedTouches[0].clientY,
                    screenX: e.changedTouches[0].screenX,
                    screenY: e.changedTouches[0].screenY,
                    buttons: 0,
                    button: 0,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                    shiftKey: e.shiftKey,
                    metaKey: e.metaKey
                });
                e.changedTouches[0].target.dispatchEvent(clickEvent);
            });
            element.addEventListener("touchmove", (event) => {
                const deltaY = Math.abs(event.touches[0].clientY - startY);
                const deltaX = Math.abs(event.touches[0].clientX - startX);
                const delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                maxDelta = Math.max(maxDelta, delta);
                event.preventDefault();
            });
            element.addEventListener("wheel", (event) => {
                event.preventDefault();
            });
            element.addEventListener("scroll", (event) => {
                event.preventDefault();
            });
        }
    }
    static initPreventFocusLoss(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener("mousedown", (event) => {
                event.preventDefault();
            });
        }
    }
    static async setContenteditableText(element, content, targetXPosition, skipAutoCapture) {
        if (element) {
            const normalizedContent = content !== null && content !== void 0 ? content : "";
            if (element.innerText === normalizedContent) {
                return;
            }
            const isFocused = document.activeElement === element;
            let savedXPosition = targetXPosition !== undefined ? targetXPosition : null;
            let savedYPosition = null;
            if (isFocused && savedXPosition === null && !skipAutoCapture) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    if (element.contains(range.commonAncestorContainer)) {
                        const rect = range.getBoundingClientRect();
                        savedXPosition = rect.left;
                        savedYPosition = rect.top + rect.height / 2;
                    }
                }
            }
            element.innerText = normalizedContent;
            if (isFocused && savedXPosition !== null) {
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        if (document.activeElement === element) {
                            this.setCaretAtXPosition(element, savedXPosition, false, savedYPosition);
                        }
                        resolve();
                    });
                });
            }
            else if (isFocused) {
                if (document.activeElement === element) {
                    element.focus();
                }
            }
        }
    }
    static async getContenteditableText(element) {
        if (element) {
            return element.innerText;
        }
        return "";
    }
    static focusAndSetCaretToEnd(element) {
        if (element) {
            element.focus();
            if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                const textNode = element.firstChild;
                const range = document.createRange();
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, textNode.length);
                    range.setEnd(textNode, textNode.length);
                }
                else {
                    range.selectNodeContents(element);
                    range.collapse(false);
                }
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
    }
    static focusAndSetCaretToStart(element) {
        if (element) {
            element.focus();
            if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                const textNode = element.firstChild;
                const range = document.createRange();
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, 0);
                    range.setEnd(textNode, 0);
                }
                else {
                    range.selectNodeContents(element);
                    range.collapse(true);
                }
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
    }
    static getCaretXPosition(element) {
        if (!element) {
            return null;
        }
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return null;
        }
        const range = selection.getRangeAt(0);
        if (!element.contains(range.commonAncestorContainer)) {
            return null;
        }
        const rect = range.getBoundingClientRect();
        return rect.left;
    }
    static setCaretAtXPosition(element, targetX, targetLastRow = false, targetY = null) {
        if (!element) {
            return;
        }
        element.focus();
        const textNode = element.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
            return;
        }
        const textLength = textNode.length;
        if (textLength === 0) {
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.setEnd(textNode, 0);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
            return;
        }
        let closestOffset = 0;
        let closestDistance = Infinity;
        if (targetLastRow || targetY !== null) {
            let selectedRowTop = targetLastRow ? -Infinity : 0;
            let selectedRowHeight = 0;
            let bestRowDistance = Infinity;
            for (let i = 0; i <= textLength; i++) {
                const range = document.createRange();
                range.setStart(textNode, i);
                range.setEnd(textNode, i);
                const rect = range.getBoundingClientRect();
                if (targetLastRow) {
                    if (rect.top > selectedRowTop) {
                        selectedRowTop = rect.top;
                        selectedRowHeight = rect.height;
                    }
                }
                else {
                    const rowCenter = rect.top + rect.height / 2;
                    const rowDistance = Math.abs(rowCenter - targetY);
                    if (rowDistance < bestRowDistance) {
                        bestRowDistance = rowDistance;
                        selectedRowTop = rect.top;
                        selectedRowHeight = rect.height;
                    }
                }
            }
            closestOffset = textLength;
            const rowTolerance = Math.max(selectedRowHeight / 2, 1);
            for (let i = 0; i <= textLength; i++) {
                const range = document.createRange();
                range.setStart(textNode, i);
                range.setEnd(textNode, i);
                const rect = range.getBoundingClientRect();
                if (Math.abs(rect.top - selectedRowTop) > rowTolerance)
                    continue;
                const distance = Math.abs(rect.left - targetX);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestOffset = i;
                }
            }
        }
        else {
            for (let i = 0; i <= textLength; i++) {
                const range = document.createRange();
                range.setStart(textNode, i);
                range.setEnd(textNode, i);
                const rect = range.getBoundingClientRect();
                const distance = Math.abs(rect.left - targetX);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestOffset = i;
                }
            }
        }
        const range = document.createRange();
        range.setStart(textNode, closestOffset);
        range.setEnd(textNode, closestOffset);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    static focusElementById(elementId, preventScroll = false) {
        const element = document.getElementById(elementId);
        if (element) {
            const editableChild = element.querySelector("[contenteditable='true']");
            if (editableChild) {
                editableChild.focus({ preventScroll });
            }
            else {
                element.focus({ preventScroll });
            }
        }
    }
    static focusElementByIdWithRetry(elementIds, maxRetries = 5) {
        const ids = Array.isArray(elementIds) ? elementIds : [elementIds];
        let retries = 0;
        const tryFocus = () => {
            for (const id of ids) {
                const element = document.getElementById(id);
                if (element && element.offsetParent !== null) {
                    const editableChild = element.querySelector("[contenteditable='true']");
                    const targetElement = editableChild || element;
                    targetElement.focus();
                    if (document.activeElement === targetElement) {
                        return;
                    }
                }
            }
            if (retries < maxRetries) {
                retries++;
                requestAnimationFrame(tryFocus);
            }
        };
        requestAnimationFrame(tryFocus);
    }
    static openCurrentLocationInMobileApp(deepLinkUrl, androidAppStoreUrl) {
        const timeout = 500;
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
            if (document.visibilityState === 'hidden') {
                clearTimer();
            }
        };
        window.addEventListener('blur', clearTimer);
        window.addEventListener('pagehide', clearTimer);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.location.href = deepLinkUrl;
    }
    static getElementHeight(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            return element.clientHeight;
        }
        return 0;
    }
    static getComputedPaddingBottom(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return "0px";
        return window.getComputedStyle(element).paddingBottom || "0px";
    }
    static scrollToSelectedItem(dropdownElement, selectedIndex, itemSelector) {
        if (dropdownElement && selectedIndex >= 0) {
            const selector = itemSelector || '[role="none"]';
            const itemsContainer = dropdownElement.querySelector(selector);
            const items = itemsContainer ? itemsContainer.children : null;
            let itemHeight = 40;
            if (items && items.length > 0) {
                itemHeight = items[0].offsetHeight;
            }
            const containerHeight = dropdownElement.clientHeight;
            const itemsVisible = Math.floor(containerHeight / itemHeight);
            const middleOffset = Math.floor(itemsVisible / 2);
            const scrollTop = Math.max(0, (selectedIndex - middleOffset) * itemHeight);
            dropdownElement.scrollTop = scrollTop;
        }
    }
    static async loadGif(imgId) {
        const img = document.getElementById(imgId);
        if (!img) {
            console.error(`Img with id ${imgId} not found.`);
            return;
        }
        const player = new SuperGif({
            gif: img,
            auto_play: false,
            loop_mode: false,
            progressbar_height: 0,
            progressbar_foreground_color: 'transparent',
            progressbar_background_color: 'transparent'
        });
        player.load(() => {
            console.log('GIF is loaded and paused on frame 0');
        });
        this.gifMap.set(imgId, player);
    }
    static playGif(canvasId) {
        const player = this.gifMap.get(canvasId);
        if (!player) {
            console.error(`No GIF loaded for canvas ${canvasId}`);
            return;
        }
        player.move_to(0);
        player.play();
    }
    static async waitForElement(elementId, maxRetries = 10, delayMs = 100) {
        for (let i = 0; i < maxRetries; i++) {
            const element = document.getElementById(elementId);
            if (element) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        console.warn(`Element with id '${elementId}' not found after ${maxRetries} retries`);
        return false;
    }
    static async waitForChildElements(containerSelector, childSelector, minCount = 1, maxRetries = 20, delayMs = 50) {
        for (let i = 0; i < maxRetries; i++) {
            const container = document.querySelector(containerSelector);
            if (container) {
                const children = container.querySelectorAll(childSelector);
                if (children.length >= minCount) {
                    console.log(`Found ${children.length} elements matching '${containerSelector} ${childSelector}' (min: ${minCount})`);
                    return children.length;
                }
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        const container = document.querySelector(containerSelector);
        const count = container ? container.querySelectorAll(childSelector).length : 0;
        console.warn(`Only found ${count} elements matching '${containerSelector} ${childSelector}' after ${maxRetries} retries (min: ${minCount})`);
        return count;
    }
    static getElementTagNameAtPoint(clientX, clientY) {
        const element = document.elementFromPoint(clientX, clientY);
        if (element) {
            return element.tagName;
        }
        return null;
    }
    static getElementWidth(element) {
        if (element) {
            return element.offsetWidth;
        }
        return 0;
    }
    static scrollToCardInView(scrollContainer, cardElementId) {
        if (!scrollContainer || !cardElementId) {
            return false;
        }
        const cardElement = document.getElementById(cardElementId);
        if (!cardElement) {
            return false;
        }
        const containerRect = scrollContainer.getBoundingClientRect();
        const cardRect = cardElement.getBoundingClientRect();
        const containerHeight = containerRect.height;
        const cardHeight = cardRect.height;
        const cardOffsetTop = cardElement.offsetTop;
        let parent = cardElement.parentElement;
        while (parent && parent !== scrollContainer) {
            if (parent.offsetParent === scrollContainer || parent.offsetParent === scrollContainer.offsetParent) {
                break;
            }
            parent = parent.parentElement;
        }
        const cardTopInContainer = cardElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
        let targetScrollTop;
        const topPadding = 16;
        if (cardHeight >= containerHeight) {
            targetScrollTop = cardTopInContainer - topPadding;
        }
        else {
            targetScrollTop = cardTopInContainer - (containerHeight - cardHeight) / 2;
        }
        targetScrollTop = Math.max(0, targetScrollTop);
        scrollContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });
        return true;
    }
    static getElementSize(element, dimension) {
        if (!element)
            return 0;
        return dimension === 'width' ? element.offsetWidth : element.offsetHeight;
    }
    static focusFirstEditControlOrElement(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }
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
        for (const selector of selectors) {
            const element = container.querySelector(selector);
            if (element && !element.hasAttribute('disabled') && !element.hasAttribute('readonly')) {
                element.focus();
                return;
            }
        }
        if (container.hasAttribute('tabindex') || container.tabIndex >= 0) {
            container.focus();
        }
        else {
            container.setAttribute('tabindex', '-1');
            container.focus();
        }
    }
    static observeResize(element, dotNetRef) {
        if (!element || !dotNetRef) {
            return;
        }
        this.unobserveResize(element);
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                safeInvoke(dotNetRef, 'OnResize', [width]);
            }
        });
        observer.observe(element);
        this.resizeObservers.set(element, observer);
    }
    static unobserveResize(element) {
        if (!element) {
            return;
        }
        const observer = this.resizeObservers.get(element);
        if (observer) {
            observer.disconnect();
            this.resizeObservers.delete(element);
        }
    }
    static scrollElementIntoView(elementId, behavior = 'smooth', block = 'nearest') {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }
        const container = DomUtils.findScrollableAncestor(element);
        if (!container) {
            return;
        }
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const elementTopInContent = (elementRect.top - containerRect.top) + container.scrollTop;
        const elementBottomInContent = elementTopInContent + elementRect.height;
        const viewHeight = container.clientHeight;
        let targetScrollTop;
        if (block === 'center') {
            targetScrollTop = elementTopInContent - (viewHeight / 2) + (elementRect.height / 2);
        }
        else if (block === 'start') {
            targetScrollTop = elementTopInContent;
        }
        else if (block === 'end') {
            targetScrollTop = elementBottomInContent - viewHeight;
        }
        else {
            const viewTop = container.scrollTop;
            const viewBottom = viewTop + viewHeight;
            if (elementTopInContent >= viewTop && elementBottomInContent <= viewBottom) {
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
    static findScrollableAncestor(element) {
        let parent = element.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            const isScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
                && parent.scrollHeight > parent.clientHeight;
            if (isScrollable) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    }
    static getElementLeftById(elementId, fallback) {
        const element = document.getElementById(elementId);
        if (element) {
            return element.getBoundingClientRect().left;
        }
        return fallback;
    }
    static getElementRightById(elementId, fallback) {
        const element = document.getElementById(elementId);
        if (element) {
            return element.getBoundingClientRect().right;
        }
        return fallback;
    }
    static startBoundsTracking(elementId, dotNetRef) {
        DomUtils.stopBoundsTracking();
        const el = document.getElementById(elementId);
        if (!el)
            return;
        const listener = (e) => {
            const rect = el.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom) {
                safeInvoke(dotNetRef, 'OnMouseExitedPopoverBounds');
                DomUtils.stopBoundsTracking();
            }
        };
        DomUtils._boundsTracker = { listener };
        document.addEventListener('mousemove', listener);
    }
    static stopBoundsTracking() {
        if (DomUtils._boundsTracker) {
            document.removeEventListener('mousemove', DomUtils._boundsTracker.listener);
            DomUtils._boundsTracker = null;
        }
    }
    static highlightTextInContainer(containerId, text) {
        DomUtils.cancelTextHighlight();
        if (!text)
            return;
        let attempts = 0;
        const tryHighlight = () => {
            DomUtils._textHighlightTimer = null;
            const container = document.getElementById(containerId);
            if (!container)
                return;
            if (DomUtils.applyTextHighlight(container, text))
                return;
            attempts++;
            if (attempts < 15) {
                DomUtils._textHighlightTimer = setTimeout(tryHighlight, 200);
            }
        };
        tryHighlight();
    }
    static cancelTextHighlight() {
        if (DomUtils._textHighlightTimer) {
            clearTimeout(DomUtils._textHighlightTimer);
            DomUtils._textHighlightTimer = null;
        }
    }
    static applyTextHighlight(container, text) {
        let matches = DomUtils.collectPreviewMatches(container, [text]);
        if (matches.length === 0) {
            const words = DomUtils.previewQueryWords(text);
            if (words.length > 0) {
                matches = DomUtils.collectPreviewMatches(container, words);
            }
        }
        if (matches.length === 0) {
            return false;
        }
        for (let i = matches.length - 1; i >= 0; i--) {
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
            }
            catch (_a) {
            }
        }
        const first = container.querySelector('.search-preview-highlight');
        if (first) {
            const containerRect = container.getBoundingClientRect();
            const markRect = first.getBoundingClientRect();
            container.scrollTop += (markRect.top - containerRect.top) - container.clientHeight / 2 + markRect.height / 2;
        }
        return true;
    }
    static collectPreviewMatches(container, terms) {
        const escaped = terms
            .filter(t => t && t.length > 0)
            .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (escaped.length === 0) {
            return [];
        }
        const re = new RegExp(escaped.join('|'), 'gi');
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const matches = [];
        let node;
        while ((node = walker.nextNode())) {
            const textNode = node;
            const parent = textNode.parentElement;
            if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.classList.contains('search-preview-highlight')) {
                continue;
            }
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(textNode.data)) !== null) {
                if (m[0].length === 0) {
                    re.lastIndex++;
                    continue;
                }
                matches.push({ node: textNode, index: m.index, length: m[0].length });
                if (matches.length >= DomUtils.PREVIEW_HL_MAX) {
                    return matches;
                }
            }
        }
        return matches;
    }
    static previewQueryWords(query) {
        const seen = new Set();
        const words = [];
        for (const raw of query.split(/\s+/)) {
            const w = raw.trim();
            if (w.length < 2) {
                continue;
            }
            const key = w.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            words.push(w);
            if (words.length >= DomUtils.PREVIEW_HL_MAX_WORDS) {
                break;
            }
        }
        return words;
    }
    static getElementCenterById(elementId) {
        const element = document.getElementById(elementId);
        if (!element)
            return null;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
            return null;
        return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    }
    static async fetchTextContent(url) {
        try {
            const response = await fetch(url, {
                credentials: 'include'
            });
            if (response.ok) {
                const content = await response.text();
                return { success: true, content: content };
            }
            else {
                return { success: false, content: '', error: `Failed to load content: ${response.status} ${response.statusText}` };
            }
        }
        catch (error) {
            return { success: false, content: '', error: `Error loading content: ${error}` };
        }
    }
}
DomUtils.cardFlipRects = {};
DomUtils.gutterResizeObservers = new WeakMap();
DomUtils._boundsTracker = null;
DomUtils.gifMap = new Map();
DomUtils.resizeObservers = new Map();
DomUtils._textHighlightTimer = null;
DomUtils.PREVIEW_HL_MAX = 200;
DomUtils.PREVIEW_HL_MAX_WORDS = 8;
//# sourceMappingURL=domUtils.js.map