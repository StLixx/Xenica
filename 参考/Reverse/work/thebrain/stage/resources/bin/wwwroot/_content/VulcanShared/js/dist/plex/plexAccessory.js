import { safeInvoke } from "../interop.js";
const WHEEL_REVERSAL_WINDOW_MS = 150;
const WHEEL_REVERSAL_COMMIT_PX = 24;
class WheelReversalFilter {
    constructor() {
        this.direction = 0;
        this.lastInputTime = 0;
        this.pendingReversal = 0;
    }
    filter(delta) {
        if (delta === 0) {
            return 0;
        }
        const now = performance.now();
        const direction = Math.sign(delta);
        const isRapid = now - this.lastInputTime <= WHEEL_REVERSAL_WINDOW_MS;
        this.lastInputTime = now;
        if (!isRapid || this.direction === 0) {
            this.direction = direction;
            this.pendingReversal = 0;
            return delta;
        }
        if (direction === this.direction) {
            const effective = delta + this.pendingReversal;
            if (Math.sign(effective) === direction) {
                this.pendingReversal = 0;
                return effective;
            }
            this.pendingReversal = effective;
            return 0;
        }
        this.pendingReversal += delta;
        if (Math.abs(this.pendingReversal) < WHEEL_REVERSAL_COMMIT_PX) {
            return 0;
        }
        const committed = this.pendingReversal;
        this.direction = direction;
        this.pendingReversal = 0;
        return committed;
    }
    reset() {
        this.direction = 0;
        this.lastInputTime = 0;
        this.pendingReversal = 0;
    }
}
export class PlexAccessory {
    constructor() {
        this.ptlScrollAmount = 0;
        this.ptlScrollInertia = 0.1;
        this.ptlIsScrolling = false;
        this.ptlWheelFilter = new WheelReversalFilter();
        this.pinnedThoughtsListScrollAmount = 0;
        this.pinnedThoughtsListScrollInertia = 0.1;
        this.pinnedThoughtsListIsScrolling = false;
        this.pinnedThoughtsListWheelFilter = new WheelReversalFilter();
    }
    disablePresentationMode() {
        document.exitFullscreen();
    }
    initPastThoughtsList() {
        const pastThoughtsListContainer = document.querySelector('.past-thoughts-list');
        const scrollLeftButton = document.querySelector('.past-thoughts-list-scroll-left');
        const scrollRightButton = document.querySelector('.past-thoughts-list-scroll-right');
        this.ptlScrollAmount = 0;
        this.ptlScrollInertia = 0.1;
        this.ptlIsScrolling = false;
        this.ptlScrollInterval = undefined;
        this.ptlWheelFilter.reset();
        if (!pastThoughtsListContainer || !scrollLeftButton || !scrollRightButton) {
            return;
        }
        pastThoughtsListContainer.addEventListener('wheel', (event) => {
            event.preventDefault();
            const delta = this.ptlWheelFilter.filter(event.deltaY);
            if (delta === 0) {
                return;
            }
            this.ptlScrollAmount += delta;
            if (!this.ptlIsScrolling) {
                this.ptlIsScrolling = true;
                this.scrollPtl(pastThoughtsListContainer);
            }
        });
        const startScroll = (direction, shiftKey) => {
            if (shiftKey) {
                if (direction === -1) {
                    this.ptlScrollAmount = -pastThoughtsListContainer.scrollWidth;
                }
                else {
                    this.ptlScrollAmount = (pastThoughtsListContainer.scrollWidth - pastThoughtsListContainer.clientWidth - pastThoughtsListContainer.scrollLeft);
                }
                if (!this.ptlIsScrolling) {
                    this.ptlIsScrolling = true;
                    this.scrollPtl(pastThoughtsListContainer);
                }
            }
            else {
                this.ptlScrollAmount += 150 * direction;
                if (!this.ptlIsScrolling) {
                    this.ptlIsScrolling = true;
                    this.scrollPtl(pastThoughtsListContainer);
                }
                this.ptlScrollInterval = window.setInterval(() => {
                    this.ptlScrollAmount += 150 * direction;
                    if (!this.ptlIsScrolling) {
                        this.ptlIsScrolling = true;
                        this.scrollPtl(pastThoughtsListContainer);
                    }
                }, 100);
            }
        };
        const stopScroll = () => {
            if (this.ptlScrollInterval !== undefined) {
                clearInterval(this.ptlScrollInterval);
                this.ptlScrollInterval = undefined;
            }
        };
        scrollLeftButton.addEventListener('mousedown', (event) => startScroll(-1, event.shiftKey));
        scrollRightButton.addEventListener('mousedown', (event) => startScroll(1, event.shiftKey));
        document.addEventListener('mouseup', stopScroll);
        document.addEventListener('mouseleave', stopScroll);
    }
    disposePastThoughtsList() {
        const pastThoughtsListContainer = document.querySelector('.past-thoughts-list');
        const scrollLeftButton = document.querySelector('.past-thoughts-list-scroll-left');
        const scrollRightButton = document.querySelector('.past-thoughts-list-scroll-right');
        this.ptlScrollAmount = 0;
        this.ptlScrollInertia = 0.1;
        this.ptlIsScrolling = false;
        if (this.ptlScrollInterval !== undefined) {
            clearInterval(this.ptlScrollInterval);
        }
        this.ptlScrollInterval = undefined;
        pastThoughtsListContainer === null || pastThoughtsListContainer === void 0 ? void 0 : pastThoughtsListContainer.removeEventListener('wheel', (event) => { });
        scrollLeftButton === null || scrollLeftButton === void 0 ? void 0 : scrollLeftButton.removeEventListener('mousedown', (event) => { });
        scrollRightButton === null || scrollRightButton === void 0 ? void 0 : scrollRightButton.removeEventListener('mousedown', (event) => { });
    }
    scrollPtl(container) {
        if (this.ptlScrollAmount !== 0) {
            const scrollStep = this.ptlScrollAmount * this.ptlScrollInertia;
            container.scrollLeft += scrollStep;
            this.ptlScrollAmount -= scrollStep;
            if (Math.abs(this.ptlScrollAmount) < 1) {
                this.ptlScrollAmount = 0;
            }
            requestAnimationFrame(() => this.scrollPtl(container));
        }
        else {
            this.ptlIsScrolling = false;
        }
    }
    initPinnedThoughtsList(dotNetHelper, highlightColor = 0xffffff, gateSize = 3.5, rowHeight = 28) {
        var _a, _b;
        this.dotNetHelper = dotNetHelper;
        const pinnedThoughtsListContainer = document.querySelector('.pinned-thoughts-list');
        const scrollLeftButton = document.querySelector('.pinned-thoughts-list-scroll-left');
        const scrollRightButton = document.querySelector('.pinned-thoughts-list-scroll-right');
        this.pinnedThoughtsListScrollAmount = 0;
        this.pinnedThoughtsListScrollInertia = 0.1;
        this.pinnedThoughtsListIsScrolling = false;
        this.pinnedThoughtsListScrollInterval = undefined;
        this.pinnedThoughtsListWheelFilter.reset();
        if (!pinnedThoughtsListContainer || !scrollLeftButton || !scrollRightButton) {
            return;
        }
        pinnedThoughtsListContainer.addEventListener('wheel', (event) => {
            event.preventDefault();
            const delta = this.pinnedThoughtsListWheelFilter.filter(event.deltaY);
            if (delta === 0) {
                return;
            }
            this.pinnedThoughtsListScrollAmount += delta;
            if (!this.pinnedThoughtsListIsScrolling) {
                this.pinnedThoughtsListIsScrolling = true;
                this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
            }
        });
        const startPinnedThoughtsScroll = (direction, shiftKey) => {
            if (shiftKey) {
                if (direction === -1) {
                    this.pinnedThoughtsListScrollAmount = -pinnedThoughtsListContainer.scrollWidth;
                }
                else {
                    this.pinnedThoughtsListScrollAmount = (pinnedThoughtsListContainer.scrollWidth - pinnedThoughtsListContainer.clientWidth - pinnedThoughtsListContainer.scrollLeft);
                }
                if (!this.pinnedThoughtsListIsScrolling) {
                    this.pinnedThoughtsListIsScrolling = true;
                    this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
                }
            }
            else {
                this.pinnedThoughtsListScrollAmount += 150 * direction;
                if (!this.pinnedThoughtsListIsScrolling) {
                    this.pinnedThoughtsListIsScrolling = true;
                    this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
                }
                this.pinnedThoughtsListScrollInterval = window.setInterval(() => {
                    this.pinnedThoughtsListScrollAmount += 150 * direction;
                    if (!this.pinnedThoughtsListIsScrolling) {
                        this.pinnedThoughtsListIsScrolling = true;
                        this.scrollPinnedThoughtsList(pinnedThoughtsListContainer);
                    }
                }, 100);
            }
        };
        const stopPinnedThoughtsScroll = () => {
            if (this.pinnedThoughtsListScrollInterval !== undefined) {
                clearInterval(this.pinnedThoughtsListScrollInterval);
                this.pinnedThoughtsListScrollInterval = undefined;
            }
        };
        scrollLeftButton.addEventListener('mousedown', (event) => startPinnedThoughtsScroll(-1, event.shiftKey));
        scrollRightButton.addEventListener('mousedown', (event) => startPinnedThoughtsScroll(1, event.shiftKey));
        document.addEventListener('mouseup', stopPinnedThoughtsScroll);
        document.addEventListener('mouseleave', stopPinnedThoughtsScroll);
        this.setupListDragDrop('.pinned-thoughts-list', 'x', 'ReorderPinnedThoughts', highlightColor, gateSize, rowHeight);
        this.updatePinnedScrollButtonsVisibility();
        (_a = this.pinnedThoughtsListResizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this.pinnedThoughtsListResizeObserver = new ResizeObserver(() => {
            this.updatePinnedScrollButtonsVisibility();
        });
        this.pinnedThoughtsListResizeObserver.observe(pinnedThoughtsListContainer);
        (_b = this.pinnedThoughtsListMutationObserver) === null || _b === void 0 ? void 0 : _b.disconnect();
        this.pinnedThoughtsListMutationObserver = new MutationObserver(() => {
            this.updatePinnedScrollButtonsVisibility();
        });
        this.pinnedThoughtsListMutationObserver.observe(pinnedThoughtsListContainer, { childList: true });
    }
    disposePinnedThoughtsList() {
        var _a, _b;
        const pinnedThoughtsListContainer = document.querySelector('.pinned-thoughts-list');
        const scrollLeftButton = document.querySelector('.pinned-thoughts-list-scroll-left');
        const scrollRightButton = document.querySelector('.pinned-thoughts-list-scroll-right');
        this.pinnedThoughtsListScrollAmount = 0;
        this.pinnedThoughtsListScrollInertia = 0.1;
        this.pinnedThoughtsListIsScrolling = false;
        if (this.pinnedThoughtsListScrollInterval !== undefined) {
            clearInterval(this.pinnedThoughtsListScrollInterval);
        }
        this.pinnedThoughtsListScrollInterval = undefined;
        pinnedThoughtsListContainer === null || pinnedThoughtsListContainer === void 0 ? void 0 : pinnedThoughtsListContainer.removeEventListener('wheel', (event) => { });
        scrollLeftButton === null || scrollLeftButton === void 0 ? void 0 : scrollLeftButton.removeEventListener('mousedown', (event) => { });
        scrollRightButton === null || scrollRightButton === void 0 ? void 0 : scrollRightButton.removeEventListener('mousedown', (event) => { });
        (_a = this.pinnedThoughtsListResizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this.pinnedThoughtsListResizeObserver = undefined;
        (_b = this.pinnedThoughtsListMutationObserver) === null || _b === void 0 ? void 0 : _b.disconnect();
        this.pinnedThoughtsListMutationObserver = undefined;
    }
    updatePinnedScrollButtonsVisibility() {
        const container = document.querySelector('.pinned-thoughts-list');
        const scrollButtons = document.querySelector('.pinned-thoughts-list-scroll-buttons');
        if (!container || !scrollButtons)
            return;
        const hasOverflow = container.scrollWidth > container.clientWidth;
        scrollButtons.style.display = hasOverflow ? 'flex' : 'none';
    }
    scrollPinnedThoughtsList(container) {
        if (this.pinnedThoughtsListScrollAmount !== 0) {
            const scrollStep = this.pinnedThoughtsListScrollAmount * this.pinnedThoughtsListScrollInertia;
            container.scrollLeft += scrollStep;
            this.pinnedThoughtsListScrollAmount -= scrollStep;
            if (Math.abs(this.pinnedThoughtsListScrollAmount) < 1) {
                this.pinnedThoughtsListScrollAmount = 0;
            }
            requestAnimationFrame(() => this.scrollPinnedThoughtsList(container));
        }
        else {
            this.pinnedThoughtsListIsScrolling = false;
        }
    }
    setupListDragDrop(containerSelector, axis, callbackName, highlightColor, gateSize, rowHeight, gateAlignment = 'center') {
        const flag = `listDragDropHooked_${axis}_${callbackName}`;
        if (document.documentElement.dataset[flag] === '1')
            return;
        document.documentElement.dataset[flag] = '1';
        const isHorizontal = axis === 'x';
        let container = document.querySelector(containerSelector);
        let draggingEl = null;
        let dragGhost = null;
        let dragPlaceholder = null;
        let isPointerDown = false;
        let isDragging = false;
        let startX = 0, startY = 0;
        let startClientMain = 0;
        let startRect = null;
        let lastClientMain = 0;
        let autoScrollRAF = null;
        let edgeDir = 0;
        let lastPlaceholderCenter = null;
        const DRAG_START_THRESHOLD = 6;
        const getDirectChild = (el) => {
            if (!el)
                return null;
            const live = document.querySelector(containerSelector);
            if (!live)
                return null;
            container = live;
            let cur = el;
            while (cur && cur.parentElement !== container) {
                cur = cur.parentElement;
            }
            return (cur && cur.parentElement === container) ? cur : null;
        };
        const toCssRgba = (num, alpha) => {
            num >>>= 0;
            const b = num & 0xFF;
            const g = (num >>> 8) & 0xFF;
            const r = (num >>> 16) & 0xFF;
            const a = Math.max(0, Math.min(1, alpha));
            return `rgba(${r},${g},${b},${a})`;
        };
        const ensurePlaceholder = (width, height) => {
            const activeOutline = highlightColor;
            const borderColor = toCssRgba(activeOutline, 1.0);
            const bgColor = toCssRgba(activeOutline, 0.15);
            if (!dragPlaceholder) {
                dragPlaceholder = document.createElement('div');
                dragPlaceholder.style.width = `${width}px`;
                dragPlaceholder.style.height = `${height}px`;
                dragPlaceholder.style.backgroundColor = `${bgColor}`;
                dragPlaceholder.style.border = `2px dashed ${borderColor}`;
                dragPlaceholder.style.borderRadius = '8px';
                dragPlaceholder.style.boxSizing = 'border-box';
                dragPlaceholder.style.flex = '0 0 auto';
            }
            else {
                dragPlaceholder.style.width = `${width}px`;
                dragPlaceholder.style.height = `${height}px`;
                dragPlaceholder.style.border = `2px dashed ${borderColor}`;
            }
            return dragPlaceholder;
        };
        const computeInsertion = (centerMain) => {
            const children = Array.from(container.children).filter(el => el !== dragPlaceholder);
            for (let i = 0; i < children.length; i++) {
                const c = children[i];
                const cRect = c.getBoundingClientRect();
                const mid = isHorizontal
                    ? (cRect.left + cRect.width / 2)
                    : (cRect.top + cRect.height / 2);
                if (centerMain < mid) {
                    return { beforeEl: c, index: i };
                }
            }
            return { beforeEl: null, index: children.length };
        };
        const positionPlaceholderAtCenter = (centerMain) => {
            const ins = computeInsertion(centerMain);
            if (dragPlaceholder) {
                if (ins.beforeEl) {
                    if (dragPlaceholder !== ins.beforeEl.previousSibling) {
                        container.insertBefore(dragPlaceholder, ins.beforeEl);
                        return true;
                    }
                }
                else {
                    if (container.lastElementChild !== dragPlaceholder) {
                        container.appendChild(dragPlaceholder);
                        return true;
                    }
                }
            }
            return false;
        };
        const FLIP_DURATION_MS = 200;
        const flipAnimateChildren = (action) => {
            const currentPlaceholder = dragPlaceholder;
            const children = Array.from(container.children).filter(el => el !== currentPlaceholder);
            const firstRects = new Map();
            for (const child of children) {
                firstRects.set(child, child.getBoundingClientRect());
            }
            const didChange = action();
            if (!didChange)
                return;
            for (const child of children) {
                child.style.transition = 'none';
                child.style.transform = '';
            }
            for (const child of children) {
                if (!child.parentElement)
                    continue;
                const first = firstRects.get(child);
                if (!first)
                    continue;
                const last = child.getBoundingClientRect();
                const delta = isHorizontal ? (first.left - last.left) : (first.top - last.top);
                if (Math.abs(delta) < 1)
                    continue;
                child.style.transform = isHorizontal ? `translateX(${delta}px)` : `translateY(${delta}px)`;
                child.offsetHeight;
                child.style.transition = `transform ${FLIP_DURATION_MS}ms ease`;
                child.style.transform = '';
                const onEnd = () => {
                    child.style.transition = '';
                    child.style.transform = '';
                    child.removeEventListener('transitionend', onEnd);
                };
                child.addEventListener('transitionend', onEnd);
                setTimeout(onEnd, FLIP_DURATION_MS + 50);
            }
        };
        const createGhost = (fromEl, rect) => {
            const clone = fromEl.cloneNode(true);
            clone.style.position = 'fixed';
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            clone.style.pointerEvents = 'none';
            clone.style.zIndex = '9999';
            clone.style.transition = 'none';
            clone.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
            clone.style.transform = 'scale(1.02)';
            document.body.appendChild(clone);
            return clone;
        };
        const updateGhostAndPlaceholder = (clientMain) => {
            if (!dragGhost || !startRect)
                return;
            const rect = container.getBoundingClientRect();
            if (isHorizontal) {
                const desiredLeft = startRect.left + (clientMain - startClientMain);
                const minLeft = rect.left;
                const maxLeft = rect.right - startRect.width;
                const clampedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
                dragGhost.style.left = `${clampedLeft}px`;
                const centerX = desiredLeft + (startRect.width / 2);
                lastPlaceholderCenter = centerX;
                flipAnimateChildren(() => positionPlaceholderAtCenter(centerX));
            }
            else {
                const desiredTop = startRect.top + (clientMain - startClientMain);
                const minTop = rect.top;
                const maxTop = rect.bottom - startRect.height;
                const clampedTop = Math.max(minTop, Math.min(maxTop, desiredTop));
                dragGhost.style.top = `${clampedTop}px`;
                const centerY = desiredTop + (startRect.height / 2);
                lastPlaceholderCenter = centerY;
                flipAnimateChildren(() => positionPlaceholderAtCenter(centerY));
            }
        };
        const clearGhostAndPlaceholder = () => {
            if (dragGhost && dragGhost.parentElement)
                dragGhost.parentElement.removeChild(dragGhost);
            dragGhost = null;
            if (dragPlaceholder && dragPlaceholder.parentElement)
                dragPlaceholder.parentElement.removeChild(dragPlaceholder);
            dragPlaceholder = null;
            lastPlaceholderCenter = null;
        };
        const updateAutoScroll = () => {
            const rect = container.getBoundingClientRect();
            const extent = isHorizontal ? rect.width : rect.height;
            const startEdge = isHorizontal ? rect.left : rect.top;
            const endEdge = isHorizontal ? rect.right : rect.bottom;
            const threshold = Math.min(60, extent * 0.15);
            const maxSpeed = 24;
            let dir = 0;
            if (lastClientMain < startEdge + threshold)
                dir = -1;
            else if (lastClientMain > endEdge - threshold)
                dir = 1;
            edgeDir = dir;
            const step = () => {
                if (edgeDir === 0) {
                    autoScrollRAF = null;
                    return;
                }
                const dist = edgeDir < 0 ? (lastClientMain - startEdge) : (endEdge - lastClientMain);
                const ratio = Math.max(0, Math.min(1, (threshold - dist) / threshold));
                const delta = edgeDir * (2 + Math.floor(maxSpeed * ratio));
                if (isHorizontal)
                    container.scrollLeft += delta;
                else
                    container.scrollTop += delta;
                if (dragGhost) {
                    const centerMain = lastPlaceholderCenter !== null && lastPlaceholderCenter !== void 0 ? lastPlaceholderCenter : (() => {
                        const ghostRect = dragGhost.getBoundingClientRect();
                        return isHorizontal
                            ? (ghostRect.left + ghostRect.width / 2)
                            : (ghostRect.top + ghostRect.height / 2);
                    })();
                    flipAnimateChildren(() => positionPlaceholderAtCenter(centerMain));
                }
                autoScrollRAF = requestAnimationFrame(step);
            };
            if (edgeDir !== 0 && autoScrollRAF == null)
                autoScrollRAF = requestAnimationFrame(step);
            if (edgeDir === 0 && autoScrollRAF != null) {
                cancelAnimationFrame(autoScrollRAF);
                autoScrollRAF = null;
            }
        };
        const clearAutoScroll = () => {
            edgeDir = 0;
            if (autoScrollRAF != null) {
                cancelAnimationFrame(autoScrollRAF);
                autoScrollRAF = null;
            }
        };
        const finalizeOrderAndNotify = () => {
            if (draggingEl && dragPlaceholder && dragPlaceholder.parentElement === container) {
                container.insertBefore(draggingEl, dragPlaceholder);
            }
            const ids = [];
            const nodes = container.querySelectorAll('[id^="tht-"]');
            nodes.forEach(n => { const id = n.id.substring(4, 40); if (id)
                ids.push(id); });
            safeInvoke(this.dotNetHelper, callbackName, [ids]);
        };
        let cancelNextClick = false;
        const suppressNextClick = (e) => {
            if (cancelNextClick) {
                e.preventDefault();
                e.stopPropagation();
                cancelNextClick = false;
                document.removeEventListener('click', suppressNextClick, true);
            }
        };
        const pointFromEvent = (ev) => ('touches' in ev ? ev.touches[0] : ev);
        const isOverGateForChild = (childEl, clientX, clientY) => {
            let thtEl = null;
            if (childEl.id && childEl.id.startsWith('tht-')) {
                thtEl = childEl;
            }
            else {
                thtEl = childEl.querySelector('[id^="tht-"]');
            }
            const rect = (thtEl !== null && thtEl !== void 0 ? thtEl : childEl).getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = rowHeight / 3.464;
            const gateSizeScaled = gateSize * 2.5;
            const jumpX = centerX - rect.width / 2;
            const jumpY = centerY;
            const parentX = gateAlignment === 'left' ? rect.left + 1.5 * dx : centerX - dx;
            const parentY = centerY - rect.height / 2;
            const childX = gateAlignment === 'left' ? rect.left + 3.5 * dx : centerX + dx;
            const childY = centerY + rect.height / 2;
            const inSquare = (gx, gy) => Math.abs(clientX - gx) <= gateSizeScaled && Math.abs(clientY - gy) <= gateSizeScaled;
            return inSquare(jumpX, jumpY) || inSquare(parentX, parentY) || inSquare(childX, childY);
        };
        const onPointerDown = (ev) => {
            const point = pointFromEvent(ev);
            const target = getDirectChild(ev.target);
            if (!target)
                return;
            if (isOverGateForChild(target, point.clientX, point.clientY)) {
                return;
            }
            isPointerDown = true;
            draggingEl = target;
            startX = point.clientX;
            startY = point.clientY;
            startClientMain = isHorizontal ? point.clientX : point.clientY;
            startRect = target.getBoundingClientRect();
        };
        const startDragIfNeeded = (dx, dy) => {
            var _a;
            if (isDragging)
                return true;
            const main = isHorizontal ? dx : dy;
            const cross = isHorizontal ? dy : dx;
            if (Math.abs(main) > DRAG_START_THRESHOLD && Math.abs(main) > Math.abs(cross)) {
                if (document.body.classList.contains('plex-gate-dragging')) {
                    isPointerDown = false;
                    draggingEl = null;
                    startRect = null;
                    return false;
                }
                isDragging = true;
                cancelNextClick = true;
                document.addEventListener('click', suppressNextClick, true);
                document.body.classList.add('list-reorder-dragging');
                document.body.dataset.listReorderDragging = 'true';
                if (draggingEl && startRect) {
                    const ph = ensurePlaceholder(startRect.width, startRect.height);
                    const next = draggingEl.nextSibling;
                    (_a = draggingEl.parentElement) === null || _a === void 0 ? void 0 : _a.removeChild(draggingEl);
                    if (next)
                        container.insertBefore(ph, next);
                    else
                        container.appendChild(ph);
                    dragGhost = createGhost(draggingEl, startRect);
                    const initialCenter = isHorizontal
                        ? startRect.left + (startRect.width / 2)
                        : startRect.top + (startRect.height / 2);
                    lastPlaceholderCenter = initialCenter;
                    positionPlaceholderAtCenter(initialCenter);
                }
                return true;
            }
            return false;
        };
        const onPointerMove = (ev) => {
            if (!isPointerDown)
                return;
            const point = 'touches' in ev ? ev.touches[0] : ev;
            const dx = point.clientX - startX;
            const dy = point.clientY - startY;
            if (!isDragging) {
                if (!startDragIfNeeded(dx, dy))
                    return;
                if ('preventDefault' in ev) {
                    try {
                        ev.preventDefault();
                    }
                    catch (_) { }
                }
            }
            if (isDragging) {
                lastClientMain = isHorizontal ? point.clientX : point.clientY;
                updateGhostAndPlaceholder(lastClientMain);
                updateAutoScroll();
                if ('preventDefault' in ev) {
                    try {
                        ev.preventDefault();
                    }
                    catch (_) { }
                }
            }
        };
        const endDrag = () => {
            if (!isPointerDown)
                return;
            clearAutoScroll();
            if (isDragging) {
                flipAnimateChildren(() => {
                    finalizeOrderAndNotify();
                    clearGhostAndPlaceholder();
                    return true;
                });
            }
            else {
                clearGhostAndPlaceholder();
            }
            isPointerDown = false;
            isDragging = false;
            draggingEl = null;
            startRect = null;
            if (cancelNextClick) {
                cancelNextClick = false;
                document.removeEventListener('click', suppressNextClick, true);
            }
            document.body.classList.remove('list-reorder-dragging');
            try {
                delete document.body.dataset.listReorderDragging;
            }
            catch (_) { }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', () => endDrag());
        document.addEventListener('touchstart', onPointerDown, { passive: true });
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', () => endDrag(), { passive: true });
        document.addEventListener('touchcancel', () => endDrag(), { passive: true });
    }
}
//# sourceMappingURL=plexAccessory.js.map