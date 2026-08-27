import { safeInvoke } from "./interop.js";
class SplitterDrag {
    constructor() {
        this._isDragging = false;
        this.containerElement = null;
        this.firstPaneElement = null;
        this.secondPaneElement = null;
        this.splitterBarElement = null;
        this.isHorizontal = true;
        this.isFlipped = false;
        this.barSize = 6;
        this.minFirstPx = 0;
        this.minSecondPx = 0;
        this.startClientPos = 0;
        this.startPosition = 50;
        this.containerSize = 0;
        this.dotNetHelper = null;
        this.pointerId = null;
        this.movePointerId = null;
        this._currentPosition = 50;
        this.liveResize = true;
        this.indicatorElement = null;
        this.allowMaxFirst = false;
        this.allowMaxSecond = false;
        this.maximizedBorderSize = 4;
        this.maximized = 'none';
        this.savedPosition = 50;
        this.jumpedFromClientPos = 0;
        this.dragStartMaximized = 'none';
        this.animationDurationMs = 250;
        this.transparentBar = false;
        this.bumpStopOverlay = null;
        this.bumpStopArrow = null;
        this.currentBumpStopProgress = 0;
        this.bumpStopTargetPane = null;
        this.onPointerMove = (e) => {
            if (!this.isDragging)
                return;
            if (this.movePointerId === null) {
                this.movePointerId = e.pointerId;
            }
            else if (e.pointerId !== this.movePointerId) {
                return;
            }
            if (e.buttons === 0) {
                this.endDrag();
                return;
            }
            const currentPos = this.isHorizontal ? e.clientX : e.clientY;
            const deltaPx = currentPos - this.startClientPos;
            let deltaPercent = (this.containerSize > 0) ? (deltaPx / this.containerSize) * 100 : 0;
            if (this.isFlipped) {
                deltaPercent = -deltaPercent;
            }
            let rawNewPosition = this.startPosition + deltaPercent;
            const minFirstPercent = (this.containerSize > 0) ? (this.minFirstPx / this.containerSize) * 100 : 0;
            const minSecondPercent = (this.containerSize > 0) ? (this.minSecondPx / this.containerSize) * 100 : 0;
            if (this.maximized !== 'none' && (this.allowMaxFirst || this.allowMaxSecond)) {
                const fixedJumpThresholdPx = 32;
                const jumpZoneFirstPercent = (this.minFirstPx > 0)
                    ? (fixedJumpThresholdPx / this.containerSize) * 100
                    : 0;
                const jumpZoneSecondPercent = (this.minSecondPx > 0)
                    ? 100 - (fixedJumpThresholdPx / this.containerSize) * 100
                    : 100;
                const shouldRestore = (this.maximized === 'second' && rawNewPosition >= jumpZoneFirstPercent) ||
                    (this.maximized === 'first' && rawNewPosition <= jumpZoneSecondPercent);
                if (shouldRestore) {
                    const newPos = Math.max(minFirstPercent, Math.min(100 - minSecondPercent, rawNewPosition));
                    this.maximized = 'none';
                    this.dragStartMaximized = 'none';
                    this._currentPosition = newPos;
                    this.animateRestore(newPos);
                    return;
                }
                else {
                    return;
                }
            }
            if ((this.allowMaxFirst || this.allowMaxSecond) && this.maximized === 'none' && (this.minFirstPx > 0 || this.minSecondPx > 0)) {
                const fixedJumpThresholdPx = 32;
                const jumpZoneFirstPercent = (this.minFirstPx > 0)
                    ? (fixedJumpThresholdPx / this.containerSize) * 100
                    : 0;
                const jumpZoneSecondPercent = (this.minSecondPx > 0)
                    ? 100 - (fixedJumpThresholdPx / this.containerSize) * 100
                    : 100;
                const bumpStopZonePx = fixedJumpThresholdPx - this.minFirstPx;
                const bumpStopZoneSecondPx = fixedJumpThresholdPx - this.minSecondPx;
                if (this.allowMaxSecond && this.minFirstPx > 0 && rawNewPosition <= minFirstPercent) {
                    const distanceIntoZone = minFirstPercent - rawNewPosition;
                    const zoneSize = minFirstPercent - jumpZoneFirstPercent;
                    const progress = zoneSize > 0 ? Math.min(1, distanceIntoZone / zoneSize) : 0;
                    this.updateBumpStopFeedback(progress, 'first');
                    if (rawNewPosition < jumpZoneFirstPercent) {
                        this.clearBumpStopFeedback();
                        this.savedPosition = this._currentPosition;
                        this.jumpedFromClientPos = currentPos;
                        this.maximized = 'second';
                        this.animateCollapse('second');
                        return;
                    }
                    if (this.liveResize) {
                        this.applyPosition(minFirstPercent);
                    }
                    else {
                        this.applyIndicatorPosition(minFirstPercent);
                    }
                    return;
                }
                if (this.allowMaxFirst && this.minSecondPx > 0 && rawNewPosition >= (100 - minSecondPercent)) {
                    const distanceIntoZone = rawNewPosition - (100 - minSecondPercent);
                    const zoneSize = jumpZoneSecondPercent - (100 - minSecondPercent);
                    const progress = zoneSize > 0 ? Math.min(1, distanceIntoZone / Math.abs(zoneSize)) : 0;
                    this.updateBumpStopFeedback(progress, 'second');
                    if (rawNewPosition > jumpZoneSecondPercent) {
                        this.clearBumpStopFeedback();
                        this.savedPosition = this._currentPosition;
                        this.jumpedFromClientPos = currentPos;
                        this.maximized = 'first';
                        this.animateCollapse('first');
                        return;
                    }
                    if (this.liveResize) {
                        this.applyPosition(100 - minSecondPercent);
                    }
                    else {
                        this.applyIndicatorPosition(100 - minSecondPercent);
                    }
                    return;
                }
                if (this.currentBumpStopProgress > 0) {
                    this.clearBumpStopFeedback();
                }
            }
            const newPosition = Math.max(minFirstPercent, Math.min(100 - minSecondPercent, rawNewPosition));
            if (this.liveResize) {
                this.applyPosition(newPosition);
            }
            else {
                this.applyIndicatorPosition(newPosition);
            }
        };
        this.onPointerUp = (e) => {
            if (!this.isDragging)
                return;
            if (e.pointerId !== this.pointerId && e.pointerId !== this.movePointerId)
                return;
            this.endDrag();
        };
    }
    get isDragging() {
        return this._isDragging;
    }
    startDrag(dotNetHelper, containerElement, firstPaneElement, secondPaneElement, splitterBarElement, pointerId, clientX, clientY, isHorizontal, isFlipped, position, barSize, minFirstPx, minSecondPx, allowMaxFirst, allowMaxSecond, maximizedBorderSize, maximized, liveResize, indicatorElement, animationDurationMs, transparentBar) {
        this.dotNetHelper = dotNetHelper;
        this.containerElement = containerElement;
        this.firstPaneElement = firstPaneElement;
        this.secondPaneElement = secondPaneElement;
        this.splitterBarElement = splitterBarElement;
        this.pointerId = pointerId;
        this.movePointerId = null;
        this.isHorizontal = isHorizontal;
        this.isFlipped = isFlipped;
        this.barSize = barSize;
        this.minFirstPx = minFirstPx;
        this.minSecondPx = minSecondPx;
        this.startPosition = position;
        this._currentPosition = position;
        this.savedPosition = position;
        this.allowMaxFirst = allowMaxFirst;
        this.allowMaxSecond = allowMaxSecond;
        this.maximizedBorderSize = maximizedBorderSize;
        this.maximized = maximized;
        this.dragStartMaximized = maximized;
        this.jumpedFromClientPos = 0;
        this.liveResize = liveResize;
        this.indicatorElement = indicatorElement;
        this.animationDurationMs = animationDurationMs;
        this.transparentBar = transparentBar;
        this.startClientPos = isHorizontal ? clientX : clientY;
        this.containerSize = isHorizontal
            ? containerElement.clientWidth
            : containerElement.clientHeight;
        this._isDragging = true;
        this.firstPaneElement.style.transition = '';
        this.secondPaneElement.style.transition = '';
        splitterBarElement.setPointerCapture(pointerId);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
        if (!this.liveResize && this.indicatorElement) {
            this.applyIndicatorPosition(position);
        }
        this.currentBumpStopProgress = 0;
        this.bumpStopTargetPane = null;
        this.clearBumpStopFeedback();
    }
    applyPosition(position) {
        if (!this.firstPaneElement || !this.secondPaneElement)
            return;
        const visualPosition = this.isFlipped ? 100 - position : position;
        const firstSize = visualPosition;
        const secondSize = 100 - visualPosition;
        const firstBarOffset = this.transparentBar ? 0 : (visualPosition / 100) * this.barSize;
        const secondBarOffset = this.transparentBar ? 0 : ((100 - visualPosition) / 100) * this.barSize;
        this.firstPaneElement.style.flex = `0 0 calc(${firstSize}% - ${firstBarOffset}px)`;
        this.secondPaneElement.style.flex = `0 0 calc(${secondSize}% - ${secondBarOffset}px)`;
        this._currentPosition = position;
    }
    applyIndicatorPosition(position) {
        if (!this.indicatorElement)
            return;
        const visualPosition = this.isFlipped ? 100 - position : position;
        if (this.isHorizontal) {
            this.indicatorElement.style.left = `${visualPosition}%`;
            this.indicatorElement.style.top = '0';
            this.indicatorElement.style.bottom = '0';
            this.indicatorElement.style.width = '2px';
            this.indicatorElement.style.height = '';
            this.indicatorElement.style.transform = 'translateX(-50%)';
        }
        else {
            this.indicatorElement.style.top = `${visualPosition}%`;
            this.indicatorElement.style.left = '0';
            this.indicatorElement.style.right = '0';
            this.indicatorElement.style.height = '2px';
            this.indicatorElement.style.width = '';
            this.indicatorElement.style.transform = 'translateY(-50%)';
        }
        this._currentPosition = position;
    }
    applyMaximized(pane) {
        if (!this.firstPaneElement || !this.secondPaneElement)
            return;
        const firstMaximized = this.isFlipped ? pane === 'second' : pane === 'first';
        if (firstMaximized) {
            this.firstPaneElement.style.flex = `0 0 calc(100% - ${this.maximizedBorderSize}px)`;
            this.secondPaneElement.style.flex = `0 0 0%`;
        }
        else {
            this.firstPaneElement.style.flex = `0 0 0%`;
            this.secondPaneElement.style.flex = `0 0 calc(100% - ${this.maximizedBorderSize}px)`;
        }
    }
    updateBumpStopFeedback(progress, targetPane) {
        this.currentBumpStopProgress = progress;
        this.bumpStopTargetPane = targetPane;
        if (!this.splitterBarElement || !this.containerElement)
            return;
        const collapsingPane = targetPane === 'first'
            ? (this.isFlipped ? this.secondPaneElement : this.firstPaneElement)
            : (this.isFlipped ? this.firstPaneElement : this.secondPaneElement);
        if (!collapsingPane)
            return;
        const easedProgress = progress * progress;
        this.splitterBarElement.style.transition = 'none';
        const glowIntensity = 4 + (easedProgress * 8);
        const glowOpacity = 0.2 + (easedProgress * 0.3);
        this.splitterBarElement.style.boxShadow =
            `0 0 ${glowIntensity}px rgb(var(--vapp-accent-warning) / ${glowOpacity})`;
        const bgOpacity = 0.4 + (easedProgress * 0.4);
        this.splitterBarElement.style.setProperty('background-color', `rgb(var(--vapp-accent-warning) / ${bgOpacity})`, 'important');
        if (!this.bumpStopOverlay) {
            this.bumpStopOverlay = document.createElement('div');
            this.bumpStopOverlay.className = 'splitter-collapse-overlay';
            this.bumpStopOverlay.style.cssText = `
                position: absolute;
                inset: 0;
                pointer-events: none;
                z-index: 15;
            `;
            collapsingPane.style.position = 'relative';
            collapsingPane.appendChild(this.bumpStopOverlay);
        }
        const gradientDir = this.isHorizontal
            ? (targetPane === 'first' ? 'to right' : 'to left')
            : (targetPane === 'first' ? 'to bottom' : 'to top');
        const overlayOpacity = easedProgress * 0.4;
        this.bumpStopOverlay.style.background =
            `linear-gradient(${gradientDir}, rgb(var(--vapp-accent-warning) / ${overlayOpacity}) 0%, transparent 70%)`;
        if (!this.bumpStopArrow) {
            this.bumpStopArrow = document.createElement('div');
            this.bumpStopArrow.className = 'splitter-collapse-arrow';
            this.bumpStopArrow.innerHTML = this.getArrowSvg(targetPane);
            collapsingPane.appendChild(this.bumpStopArrow);
        }
        const arrowOpacity = 0.3 + (easedProgress * 0.6);
        const arrowSize = 48 + (easedProgress * 16);
        const positionPercent = targetPane === 'first' ? '16%' : '84%';
        const positionProp = this.isHorizontal ? 'left' : 'top';
        const centerProp = this.isHorizontal ? 'top' : 'left';
        this.bumpStopArrow.style.cssText = `
            position: absolute;
            ${positionProp}: ${positionPercent};
            ${centerProp}: 50%;
            transform: translate(-50%, -50%);
            width: ${arrowSize}px;
            height: ${arrowSize}px;
            opacity: ${arrowOpacity};
            pointer-events: none;
            z-index: 16;
            border-radius: 50%;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            color: rgb(var(--vapp-accent-warning));
            filter: drop-shadow(0 2px 8px rgb(0 0 0 / 0.25));
        `;
    }
    getArrowSvg(targetPane) {
        let rotation = 0;
        if (this.isHorizontal) {
            rotation = targetPane === 'first' ? 180 : 0;
        }
        else {
            rotation = targetPane === 'first' ? 270 : 90;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
            <defs>
                <mask id="arrow-cutout">
                    <circle cx="50" cy="50" r="50" fill="white"/>
                    <g transform="rotate(${rotation} 50 50)">
                        <line x1="26" y1="50" x2="60" y2="50" stroke="black" stroke-width="11" stroke-linecap="round"/>
                        <polyline points="48,34 66,50 48,66" stroke="black" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </g>
                </mask>
            </defs>
            <circle cx="50" cy="50" r="50" fill="currentColor" mask="url(#arrow-cutout)"/>
        </svg>`;
    }
    clearBumpStopFeedback() {
        this.currentBumpStopProgress = 0;
        this.bumpStopTargetPane = null;
        if (this.splitterBarElement) {
            this.splitterBarElement.style.transition = '';
            this.splitterBarElement.style.boxShadow = '';
            this.splitterBarElement.style.removeProperty('background-color');
        }
        if (this.bumpStopOverlay) {
            this.bumpStopOverlay.remove();
            this.bumpStopOverlay = null;
        }
        if (this.bumpStopArrow) {
            this.bumpStopArrow.remove();
            this.bumpStopArrow = null;
        }
    }
    animateCollapse(maximizedPane) {
        if (!this.firstPaneElement || !this.secondPaneElement)
            return;
        const duration = 50;
        const easing = 'cubic-bezier(0.2, 0, 0.4, 1)';
        this.firstPaneElement.style.transition = `flex ${duration}ms ${easing}`;
        this.secondPaneElement.style.transition = `flex ${duration}ms ${easing}`;
        this.applyMaximized(maximizedPane);
        setTimeout(() => {
            if (this.firstPaneElement)
                this.firstPaneElement.style.transition = '';
            if (this.secondPaneElement)
                this.secondPaneElement.style.transition = '';
        }, duration);
    }
    animateRestore(targetPosition) {
        if (!this.firstPaneElement || !this.secondPaneElement)
            return;
        const duration = 60;
        const easing = 'cubic-bezier(0.2, 0, 0.4, 1)';
        this.firstPaneElement.style.transition = `flex ${duration}ms ${easing}`;
        this.secondPaneElement.style.transition = `flex ${duration}ms ${easing}`;
        this.applyPosition(targetPosition);
        setTimeout(() => {
            if (this.firstPaneElement)
                this.firstPaneElement.style.transition = '';
            if (this.secondPaneElement)
                this.secondPaneElement.style.transition = '';
        }, duration);
    }
    endDrag() {
        if (!this._isDragging)
            return;
        this._isDragging = false;
        this.clearBumpStopFeedback();
        if (this.containerElement) {
            const state = splitterStates.get(this.containerElement);
            if (state) {
                const tolerancePercent = 0.5;
                const minFirstPercent = this.containerSize > 0 ? (this.minFirstPx / this.containerSize) * 100 : 0;
                const minSecondPercent = this.containerSize > 0 ? (this.minSecondPx / this.containerSize) * 100 : 0;
                const isFirstAtMin = this.minFirstPx > 0 && this._currentPosition <= minFirstPercent + tolerancePercent;
                const isSecondAtMin = this.minSecondPx > 0 && (100 - this._currentPosition) <= minSecondPercent + tolerancePercent;
                state.position = this._currentPosition;
                state.maximized = this.maximized;
                state.isFirstLockedToMin = isFirstAtMin;
                state.isSecondLockedToMin = isSecondAtMin;
            }
        }
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        if (this.splitterBarElement && this.pointerId !== null) {
            try {
                this.splitterBarElement.releasePointerCapture(this.pointerId);
            }
            catch (_a) { }
        }
        if (this.firstPaneElement) {
            this.firstPaneElement.style.transition = `flex ${this.animationDurationMs}ms ease-out`;
        }
        if (this.secondPaneElement) {
            this.secondPaneElement.style.transition = `flex ${this.animationDurationMs}ms ease-out`;
        }
        safeInvoke(this.dotNetHelper, 'OnDragEndFromJs', [this._currentPosition, this.maximized]);
        this.dotNetHelper = null;
        this.pointerId = null;
        this.movePointerId = null;
    }
    cancelDrag() {
        if (this._isDragging) {
            this.endDrag();
        }
    }
}
const splitterDrag = new SplitterDrag();
const transparentBarHandlers = new WeakMap();
const resizeObservers = new Map();
const splitterStates = new Map();
function unobserveResize(element) {
    if (!element)
        return;
    const observer = resizeObservers.get(element);
    if (observer) {
        observer.disconnect();
        resizeObservers.delete(element);
    }
    const state = splitterStates.get(element);
    if (state === null || state === void 0 ? void 0 : state.resizeDebounceTimer) {
        clearTimeout(state.resizeDebounceTimer);
    }
    splitterStates.delete(element);
}
const RESIZE_DEBOUNCE_MS = 100;
function flushPendingCallbacks(state) {
    if (state.pendingOrientationChange !== null) {
        safeInvoke(state.dotNetRef, state.orientationChangedMethod, [state.pendingOrientationChange]);
        state.pendingOrientationChange = null;
    }
    if (state.pendingPositionChange !== null) {
        safeInvoke(state.dotNetRef, state.positionChangedMethod, [state.pendingPositionChange]);
        state.pendingPositionChange = null;
    }
    state.resizeDebounceTimer = null;
}
function scheduleCallback(state) {
    if (state.resizeDebounceTimer !== null) {
        clearTimeout(state.resizeDebounceTimer);
    }
    state.resizeDebounceTimer = window.setTimeout(() => flushPendingCallbacks(state), RESIZE_DEBOUNCE_MS);
}
function applyOrientationToDOM(container, splitterBar, orientation) {
    if (orientation === 'horizontal') {
        container.classList.remove('flex-col');
        container.classList.add('flex-row');
        splitterBar.style.cursor = 'ew-resize';
    }
    else {
        container.classList.remove('flex-row');
        container.classList.add('flex-col');
        splitterBar.style.cursor = 'ns-resize';
    }
}
function applyPositionToDOM(state, animated = false) {
    const visualPosition = state.flip ? 100 - state.position : state.position;
    const barOffset = state.transparentBar ? 0 : (visualPosition / 100) * state.barSize;
    const secondBarOffset = state.transparentBar ? 0 : ((100 - visualPosition) / 100) * state.barSize;
    const transition = animated ? 'flex 150ms ease-out' : 'none';
    state.firstPane.style.transition = transition;
    state.secondPane.style.transition = transition;
    state.firstPane.style.flex = `0 0 calc(${visualPosition}% - ${barOffset}px)`;
    state.secondPane.style.flex = `0 0 calc(${100 - visualPosition}% - ${secondBarOffset}px)`;
}
function observeSplitterResize(container, firstPane, secondPane, splitterBar, isAutoMode, threshold, initialOrientation, position, minFirstSizePx, minSecondSizePx, barSize, transparentBar, flip, maximized, dotNetRef, orientationChangedMethod, positionChangedMethod) {
    if (!container || !dotNetRef)
        return;
    unobserveResize(container);
    const rect = container.getBoundingClientRect();
    const effectiveOrientation = initialOrientation;
    const initialContainerSize = effectiveOrientation === 'horizontal' ? rect.width : rect.height;
    const tolerancePercent = 0.5;
    const initMinFirstPercent = initialContainerSize > 0 ? (minFirstSizePx / initialContainerSize) * 100 : 0;
    const initMinSecondPercent = initialContainerSize > 0 ? (minSecondSizePx / initialContainerSize) * 100 : 0;
    const isFirstLockedToMin = minFirstSizePx > 0 && position <= initMinFirstPercent + tolerancePercent;
    const isSecondLockedToMin = minSecondSizePx > 0 && (100 - position) <= initMinSecondPercent + tolerancePercent;
    const state = {
        isAutoMode,
        effectiveOrientation,
        threshold,
        position,
        minFirstSizePx,
        minSecondSizePx,
        barSize,
        transparentBar,
        flip,
        maximized: maximized,
        firstPane,
        secondPane,
        splitterBar,
        dotNetRef,
        orientationChangedMethod,
        positionChangedMethod,
        lastContainerSize: initialContainerSize,
        isFirstLockedToMin,
        isSecondLockedToMin,
        resizeDebounceTimer: null,
        pendingOrientationChange: null,
        pendingPositionChange: null
    };
    splitterStates.set(container, state);
    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            let orientationChanged = false;
            if (state.isAutoMode) {
                let newOrientation = null;
                if (width - height > state.threshold) {
                    newOrientation = 'horizontal';
                }
                else if (height - width > state.threshold) {
                    newOrientation = 'vertical';
                }
                if (newOrientation && newOrientation !== state.effectiveOrientation) {
                    state.effectiveOrientation = newOrientation;
                    orientationChanged = true;
                    applyOrientationToDOM(container, splitterBar, newOrientation);
                    state.pendingOrientationChange = newOrientation === 'horizontal' ? 0 : 1;
                    scheduleCallback(state);
                }
            }
            if ((state.minFirstSizePx > 0 || state.minSecondSizePx > 0) && state.maximized === 'none') {
                const containerSize = state.effectiveOrientation === 'horizontal' ? width : height;
                if (containerSize > 0) {
                    const minFirstPercent = (state.minFirstSizePx / containerSize) * 100;
                    const minSecondPercent = (state.minSecondSizePx / containerSize) * 100;
                    let newPosition = state.position;
                    if (!orientationChanged) {
                        if (state.isFirstLockedToMin && !state.isSecondLockedToMin) {
                            newPosition = (state.minFirstSizePx / containerSize) * 100;
                        }
                        else if (state.isSecondLockedToMin && !state.isFirstLockedToMin) {
                            newPosition = 100 - (state.minSecondSizePx / containerSize) * 100;
                        }
                    }
                    newPosition = Math.max(minFirstPercent, Math.min(100 - minSecondPercent, newPosition));
                    if (Math.abs(newPosition - state.position) > 0.01) {
                        state.position = newPosition;
                        applyPositionToDOM(state, false);
                        state.pendingPositionChange = newPosition;
                        scheduleCallback(state);
                    }
                    state.lastContainerSize = containerSize;
                }
            }
            else {
                const containerSize = state.effectiveOrientation === 'horizontal' ? width : height;
                if (containerSize > 0) {
                    state.lastContainerSize = containerSize;
                }
            }
        }
    });
    observer.observe(container);
    resizeObservers.set(container, observer);
    if (isAutoMode) {
        applyOrientationToDOM(container, splitterBar, state.effectiveOrientation);
    }
}
function applyMaximizedToDOM(state, pane, animated = false) {
    const firstMaximized = state.flip ? pane === 'second' : pane === 'first';
    const transition = animated ? 'flex 150ms ease-out' : 'none';
    state.firstPane.style.transition = transition;
    state.secondPane.style.transition = transition;
    if (firstMaximized) {
        state.firstPane.style.flex = '0 0 100%';
        state.secondPane.style.flex = '0 0 0%';
    }
    else {
        state.firstPane.style.flex = '0 0 0%';
        state.secondPane.style.flex = '0 0 100%';
    }
}
function updateSplitterState(container, isAutoMode, position, minFirstSizePx, minSecondSizePx, flip, maximized, targetOrientation, forcePosition) {
    const state = splitterStates.get(container);
    if (!state)
        return;
    const previousMaximized = state.maximized;
    const wasMaximized = previousMaximized !== 'none';
    const nextMaximized = maximized;
    const wasAutoMode = state.isAutoMode;
    state.isAutoMode = isAutoMode;
    state.maximized = nextMaximized;
    if ((state.isFirstLockedToMin || state.isSecondLockedToMin) && nextMaximized === 'none') {
        if (forcePosition) {
            state.isFirstLockedToMin = false;
            state.isSecondLockedToMin = false;
            state.position = position;
        }
        else {
            const rect = container.getBoundingClientRect();
            const containerSize = state.effectiveOrientation === 'horizontal' ? rect.width : rect.height;
            if (containerSize > 0) {
                let lockedPosition;
                if (state.isFirstLockedToMin) {
                    lockedPosition = (state.minFirstSizePx / containerSize) * 100;
                }
                else {
                    lockedPosition = 100 - (state.minSecondSizePx / containerSize) * 100;
                }
                state.position = lockedPosition;
                applyPositionToDOM(state, false);
            }
        }
    }
    else {
        state.position = position;
    }
    state.minFirstSizePx = minFirstSizePx;
    state.minSecondSizePx = minSecondSizePx;
    state.flip = flip;
    if (wasMaximized && state.maximized === 'none') {
        let targetPosition = state.position;
        if (state.minFirstSizePx > 0 || state.minSecondSizePx > 0) {
            const rect = container.getBoundingClientRect();
            const containerSize = state.effectiveOrientation === 'horizontal' ? rect.width : rect.height;
            if (containerSize > 0) {
                const minFirstPercent = (state.minFirstSizePx / containerSize) * 100;
                const minSecondPercent = (state.minSecondSizePx / containerSize) * 100;
                targetPosition = Math.max(minFirstPercent, Math.min(100 - minSecondPercent, state.position));
                if (Math.abs(targetPosition - state.position) > 0.01) {
                    state.position = targetPosition;
                    safeInvoke(state.dotNetRef, state.positionChangedMethod, [targetPosition]);
                }
            }
        }
        applyMaximizedToDOM(state, previousMaximized, false);
        state.firstPane.offsetHeight;
        state.secondPane.offsetHeight;
        requestAnimationFrame(() => {
            applyPositionToDOM(state, true);
        });
    }
    if (isAutoMode && !wasAutoMode) {
        const rect = container.getBoundingClientRect();
        let newOrientation = null;
        if (rect.width - rect.height > state.threshold) {
            newOrientation = 'horizontal';
        }
        else if (rect.height - rect.width > state.threshold) {
            newOrientation = 'vertical';
        }
        if (newOrientation && newOrientation !== state.effectiveOrientation) {
            state.effectiveOrientation = newOrientation;
            applyOrientationToDOM(container, state.splitterBar, newOrientation);
            safeInvoke(state.dotNetRef, state.orientationChangedMethod, [newOrientation === 'horizontal' ? 0 : 1]);
        }
    }
    else if (!isAutoMode && targetOrientation) {
        const orientation = targetOrientation;
        if (orientation !== state.effectiveOrientation) {
            state.effectiveOrientation = orientation;
        }
    }
}
export const SplitterDragModule = {
    startDrag: (dotNetHelper, container, firstPane, secondPane, splitterBar, pointerId, clientX, clientY, isHorizontal, isFlipped, position, barSize, minFirstPx, minSecondPx, allowMaxFirst, allowMaxSecond, maximizedBorderSize, maximized, liveResize, indicatorElement, animationDurationMs, transparentBar) => {
        splitterDrag.startDrag(dotNetHelper, container, firstPane, secondPane, splitterBar, pointerId, clientX, clientY, isHorizontal, isFlipped, position, barSize, minFirstPx, minSecondPx, allowMaxFirst, allowMaxSecond, maximizedBorderSize, maximized, liveResize, indicatorElement, animationDurationMs, transparentBar);
    },
    cancelDrag: () => {
        splitterDrag.cancelDrag();
    },
    initTransparentBar: (splitterBar, hoverColor) => {
        const existing = transparentBarHandlers.get(splitterBar);
        if (existing) {
            splitterBar.removeEventListener('mouseenter', existing.enter);
            splitterBar.removeEventListener('mouseleave', existing.leave);
        }
        const enterHandler = () => {
            if (!splitterDrag.isDragging) {
                splitterBar.style.backgroundColor = hoverColor;
            }
        };
        const leaveHandler = () => {
            if (!splitterDrag.isDragging) {
                splitterBar.style.backgroundColor = '';
            }
        };
        splitterBar.addEventListener('mouseenter', enterHandler);
        splitterBar.addEventListener('mouseleave', leaveHandler);
        transparentBarHandlers.set(splitterBar, { enter: enterHandler, leave: leaveHandler });
    },
    disposeTransparentBar: (splitterBar) => {
        const handlers = transparentBarHandlers.get(splitterBar);
        if (handlers) {
            splitterBar.removeEventListener('mouseenter', handlers.enter);
            splitterBar.removeEventListener('mouseleave', handlers.leave);
            transparentBarHandlers.delete(splitterBar);
        }
    },
    observeSplitterResize,
    updateSplitterState,
    unobserveResize
};
//# sourceMappingURL=splitterDrag.js.map