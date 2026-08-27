import { CubicCollider, LineCollider, PI, Point, Rect } from "/_content/Venus/js/dist/geometry.js";
import { Relation, RelationHelper } from "./core.js";
import { Scrollbar } from "./scrollbar.js";
import { plexAnimator } from "./plexAnimator.js";
import { GateStatus, LayoutType, LinkMeaning, PlexObjectType, ThoughtControl, ThoughtExpandDirection, ThoughtHorizontalAlignment } from "./enums.js";
import { DomUtils } from "/_content/Venus/js/dist/domUtils.js";
import { safeInvoke, safeInvokeAsync } from "../interop.js";
import { contentEditableFieldHelper } from "../contentEditableFieldHelper.js";
import { Canvas2DApplication } from "./canvas2DGraphics.js";
export class DebugRect {
    constructor(rect, color = 0x000000, strokeWidth = 1.0) {
        this.rect = rect;
        this.color = color;
        this.strokeWidth = strokeWidth;
    }
}
class PlexCanvas {
    get pressedObjectType() { return this._pressedObjectType; }
    set pressedObjectType(value) {
        const wasGate = this._pressedObjectType === PlexObjectType.ThoughtGate;
        const isGate = value === PlexObjectType.ThoughtGate;
        this._pressedObjectType = value;
        if (wasGate !== isGate) {
            if (isGate)
                document.body.classList.add('plex-gate-dragging');
            else
                document.body.classList.remove('plex-gate-dragging');
        }
    }
    debugRectsPush(drect) {
        if (!this.showDebugRects) {
            return;
        }
        this.debugRects.push(drect);
    }
    debugRectsClear() {
        if (!this.showDebugRects) {
            return;
        }
        this.debugRects = [];
    }
    constructor() {
        this.FPS = 60;
        this.MAX_CLICK_DIST = 7;
        this.HOLD_TIME_MS = 500;
        this.appBottom = null;
        this.appTop = null;
        this.appInteraction = null;
        this.focusCircleEl = null;
        this.topCanvasHost = null;
        this.topCanvasHostWasStatic = false;
        this.syncTopCanvasPositionListener = () => this.syncTopCanvasPosition();
        this.hoveredListOverlayEl = null;
        this.listOverlayExpandsVertically = true;
        this.currentListOverlayExpandsVertically = true;
        this.lastPointerClientPoint = null;
        this.lastPointerType = 'mouse';
        this.tickerCallback = null;
        this.gridPositionToThoughtId = new Map();
        this.outlineGroupOf = new Map();
        this.isApplyingPendingFocus = false;
        this.scrollbars = [];
        this.selectedThoughtIds = new Array;
        this.selectedLinkIds = new Set;
        this.previousSelectedLinkIds = new Set;
        this.marchingAntsObserver = null;
        this.marchingAntsResizeObserver = null;
        this.hoveredGateRelation = Relation.Unknown;
        this.linkPreviewPinned = false;
        this.pinnedLinkSrcRelation = Relation.Unknown;
        this.isListGateDragActive = false;
        this.hoveredControl = ThoughtControl.Undefined;
        this.isAnimating = false;
        this.stopAfterNextTick = false;
        this.renderNow = false;
        this.deltaSinceLastDraw = 0;
        this.chevronAnimating = false;
        this.chevronUnhoveredOpacity = 0.45;
        this.isSearchUIShowing = false;
        this.isDialogShowing = false;
        this._pressedObjectType = PlexObjectType.Nothing;
        this.pointerDownIsPrimary = false;
        this.hasDragExceededClickDistance = false;
        this.currentDropZone = null;
        this.draggedThoughtOriginalLeft = null;
        this.draggedThoughtOriginalTop = null;
        this.draggedThoughtSourceZone = null;
        this.hasLeftSourceZone = false;
        this.zoneDragSlots = [];
        this.zoneDragThoughtOrder = [];
        this.zoneDragOriginalHeightByThought = new Map();
        this.zoneDragOriginalStrideByThought = new Map();
        this.zoneDragReverseDeltaYByThought = new Map();
        this.zoneDragColumnStartY = new Map();
        this.zoneDragPlaceholder = null;
        this.zoneDragCurrentDropIndex = -1;
        this.zoneDragOriginalIndex = -1;
        this.resizeDelay = 250;
        this.lastBackgroundClickTime = 0;
        this.DOUBLE_CLICK_THRESHOLD_MS = 350;
        this.touch_lastStartTime = new Date();
        this.touch_isDown = false;
        this.touch_hasDraggedTooFar = false;
        this.touch_lastSavedFakePointerEvent = false;
        this.touch_shouldPassThroughToScrollPage = false;
        this.touch_isDraggingScrollbar = false;
        this.touch_didPressAndHold = false;
        this.touch_holdTimeoutId = null;
        this.touch_isTwoFingerDragging = false;
        this.touch_twoFingerMode = "undecided";
        this.touch_twoFingerStartCenter = null;
        this.touch_twoFingerLastCenter = null;
        this.touch_twoFingerStartDistance = 0;
        this.touch_pinchInfo = null;
        this.touch_pinchLastFactor = 1;
        this.touch_pinchOrigin = null;
        this.pinchCircleStatic = null;
        this.pinchCircleDynamic = null;
        this.pinchCircleBaseRadius = 0;
        this.TWO_FINGER_MIN_PINCH_DISTANCE = 30;
        this.TWO_FINGER_DECIDE_PX = 12;
        this.cleanUpTimeoutId = 0;
        this.hoverSuppressedUntil = 0;
        this.hoverSuppressionPaddingSeconds = 0.05;
        this.animationPaddingSeconds = 0.2;
        this.isDrawingSelectionRect = false;
        this.selectionRectHighlightedThoughts = new Set();
        this.selectionRectDeselectionPreviewThoughts = new Set();
        this.selectionRectInitialSelectedThoughtIds = null;
        this.debugRects = [];
        this.showDebugRects = false;
        this.radialMenuTouchMoveListener = (event) => this.handleTouchMoveFromRadialMenu(event);
        this.radialMenuTouchEndListener = (event) => this.handleTouchEndFromRadialMenu(event);
        this.onKeyDownListener = (event) => this.onKeyDown(event);
        this.globalMouseMoveListener = (event) => this.handleGlobalMouseMove(event);
        this.globalMouseDownListener = (event) => this.handleGlobalMouseDown(event);
        this.globalMouseUpListener = (event) => this.handleGlobalMouseUp(event);
        this.onSelectStartListener = (e) => { return false; };
        this.onPointerMoveListener = (e) => this.onPointerMove(e);
        this.onPointerDownListener = (e) => this.onPointerDown(e);
        this.onPointerUpListener = (e) => this.onPointerUp(e);
        this.onPointerLeaveListener = (e) => this.onPointerLeave(e);
        this.onTouchStartListener = (e) => this.onTouchStart(e);
        this.onTouchEndListener = (e) => this.onTouchEnd(e);
        this.onTouchCancelListener = (e) => this.onTouchCancel(e);
        this.onTouchMoveListener = (e) => this.onTouchMove(e);
        this.onWheelListener = (e) => this.onWheel(e);
        this.onContextMenuListener = (e) => this.onContextMenu(e);
        this.listScrollHandler = (_) => {
            this.renderNow = true;
            this.animateBriefly();
            this.handleListScrollHoverCheck();
            this.updateHoveredListOverlayPosition();
        };
        this.listWheelHandler = (event) => {
            this.renderNow = true;
            this.animateBriefly();
            const pointer = new Point(event.clientX, event.clientY);
            this.rememberPointerLocation(pointer, 'mouse');
            this.handleListScrollHoverCheck(pointer, 'mouse');
            this.updateHoveredListOverlayPosition();
        };
        this.resizeBufferPixels = 20;
        this.minResizeReduction = 200 * 200;
        this.lastDevicePixelRatio = window.devicePixelRatio || 1;
        this.lastResizeWidth = 0;
        this.lastResizeHeight = 0;
        this.stopAnimationsTimeoutId = null;
        this.resumeHoverAfterSuppressionTimer = null;
        this.lastThtResultId = null;
        this.IGNORED = false;
        this.PLEX_EVENT_EDGE_MARGIN = 40;
        this.lastThoughtDragDelta = null;
        this.PATH_RIGHT = "M4 19.5 L20 12 L4 4.5 z";
        this.PATH_LEFT = "M20 19.5 L4 12 L20 4.5 z";
        this.PATH_RIGHT_ONE_WAY = "M8 19.5 L24 12 L8 4.5 z M1 4.5 L5 4.5 L5 19.5 L1 19.5 z";
        this.PATH_LEFT_ONE_WAY = "M16 19.5 L0 12 L16 4.5 z z M23 4.5 L19 4.5 L19 19.5 L23 19.5 z";
        this.currentListOverlayExpandsVertically = this.listOverlayExpandsVertically;
    }
    cleanUp() {
        if (this.resizeEventTimerHandle !== undefined) {
            clearTimeout(this.resizeEventTimerHandle);
            this.resizeEventTimerHandle = undefined;
        }
        if (this.hoveredNoteIndicatorTimeout !== undefined) {
            clearTimeout(this.hoveredNoteIndicatorTimeout);
            this.hoveredNoteIndicatorTimeout = undefined;
        }
        if (this.stopAnimationsTimeoutId !== null) {
            clearTimeout(this.stopAnimationsTimeoutId);
            this.stopAnimationsTimeoutId = null;
        }
        window.removeEventListener('scroll', this.syncTopCanvasPositionListener, true);
        const previousHost = this.topCanvasHost;
        this.destroyExistingApps();
        if (previousHost && this.topCanvasHostWasStatic) {
            previousHost.style.position = '';
        }
        if (this.field) {
            this.field.removeEventListener('onselectstart', this.onSelectStartListener);
            this.field.removeEventListener('pointermove', this.onPointerMoveListener);
            this.field.removeEventListener('pointerdown', this.onPointerDownListener);
            this.field.removeEventListener('pointerup', this.onPointerUpListener);
            this.field.removeEventListener('pointerleave', this.onPointerLeaveListener);
            this.field.removeEventListener('touchstart', this.onTouchStartListener);
            this.field.removeEventListener('touchend', this.onTouchEndListener);
            this.field.removeEventListener('touchcancel', this.onTouchCancelListener);
            this.field.removeEventListener('touchmove', this.onTouchMoveListener);
            this.field.removeEventListener('wheel', this.onWheelListener);
            this.field.removeEventListener('contextmenu', this.onContextMenuListener);
        }
        if (this.marchingAntsObserver) {
            this.marchingAntsObserver.disconnect();
            this.marchingAntsObserver = null;
        }
        if (this.marchingAntsResizeObserver) {
            this.marchingAntsResizeObserver.disconnect();
            this.marchingAntsResizeObserver = null;
        }
        this.topCanvasHost = null;
        this.topCanvasHostWasStatic = false;
        this.removeHoveredListOverlay();
        document.removeEventListener('keydown', this.onKeyDownListener);
        document.removeEventListener('mousemove', this.globalMouseMoveListener);
        document.removeEventListener('mousedown', this.globalMouseDownListener);
        document.removeEventListener('mouseup', this.globalMouseUpListener);
        document.removeEventListener("touchmove", this.radialMenuTouchMoveListener);
        document.removeEventListener("touchend", this.radialMenuTouchEndListener);
        this.cleanupListScrollListeners();
    }
    syncTopCanvasPosition() {
        if (!this.appTop || !this.field) {
            return;
        }
        const rect = this.field.getBoundingClientRect();
        const hostRect = this.topCanvasHost ? this.topCanvasHost.getBoundingClientRect() : { left: 0, top: 0 };
        const canvas = this.appTop.canvas;
        canvas.style.left = `${rect.left - hostRect.left}px`;
        canvas.style.top = `${rect.top - hostRect.top}px`;
        if (this.appInteraction) {
            this.appInteraction.canvas.style.left = `${rect.left - hostRect.left}px`;
            this.appInteraction.canvas.style.top = `${rect.top - hostRect.top}px`;
        }
        this.updateHoveredListOverlayPosition();
    }
    queueResize() {
        if (!this.field || !this.appBottom) {
            return;
        }
        this.syncTopCanvasPosition();
        this.animateForSeconds(0.5);
        let currentDpr = window.devicePixelRatio || 1;
        let dprChanged = currentDpr !== this.lastDevicePixelRatio;
        const scale = Math.max(1, 1 / currentDpr);
        let scaledClientWidth = this.field.clientWidth * scale;
        let scaledClientHeight = this.field.clientHeight * scale;
        if (!dprChanged && scaledClientWidth == this.lastResizeWidth && scaledClientHeight == this.lastResizeHeight) {
            return;
        }
        if (dprChanged || scaledClientWidth > this.lastResizeWidth || scaledClientHeight > this.lastResizeHeight) {
            this.resizeRenderers(false);
        }
        if (this.resizeEventTimerHandle !== undefined) {
            clearTimeout(this.resizeEventTimerHandle);
        }
        this.resizeEventTimerHandle = setTimeout(this.resizeNow.bind(this), this.resizeDelay);
    }
    resizeNow() {
        this.resizeRenderers(true);
        safeInvoke(plexAnimator.dotNetHelper, "OnPlexResized");
        this.resizeEventTimerHandle = undefined;
        this.animateForSeconds(0.5);
    }
    resizeRenderers(exact = false) {
        var _a, _b, _c;
        if (!this.field || !this.appBottom) {
            return;
        }
        let currentDpr = window.devicePixelRatio || 1;
        let dprChanged = currentDpr !== this.lastDevicePixelRatio;
        const scale = Math.max(1, 1 / currentDpr);
        let extra = exact ? 0 : this.resizeBufferPixels;
        let newWidth = (this.field.clientWidth + extra) * scale;
        let newHeight = (this.field.clientHeight + extra) * scale;
        if (!dprChanged && newHeight <= this.lastResizeHeight && newWidth <= this.lastResizeWidth) {
            if (!exact) {
                return;
            }
            let reduction = (this.lastResizeWidth * this.lastResizeHeight) - (newWidth * newHeight);
            if (reduction < this.minResizeReduction) {
                return;
            }
        }
        if ((_a = this.appBottom) === null || _a === void 0 ? void 0 : _a.renderer) {
            this.appBottom.renderer.clear();
            this.appBottom.renderer.resize(newWidth, newHeight);
        }
        if ((_b = this.appTop) === null || _b === void 0 ? void 0 : _b.renderer) {
            this.appTop.renderer.clear();
            this.appTop.renderer.resize(newWidth, newHeight);
        }
        if ((_c = this.appInteraction) === null || _c === void 0 ? void 0 : _c.renderer) {
            this.appInteraction.renderer.clear();
            this.appInteraction.renderer.resize(newWidth, newHeight);
        }
        this.lastResizeWidth = newWidth;
        this.lastResizeHeight = newHeight;
        this.lastDevicePixelRatio = currentDpr;
    }
    destroyExistingApps() {
        if (this.appBottom) {
            if (this.tickerCallback) {
                this.appBottom.ticker.remove(this.tickerCallback);
                this.tickerCallback = null;
            }
            this.appBottom.destroy();
            this.appBottom = null;
        }
        if (this.appTop) {
            this.appTop.destroy();
            this.appTop = null;
        }
        if (this.appInteraction) {
            this.appInteraction.destroy();
            this.appInteraction = null;
        }
        document.querySelectorAll("#plex-links, #plex-gates, #plex-interaction").forEach((el) => el.remove());
    }
    async setupPixi() {
        this.destroyExistingApps();
        this.appBottom = new Canvas2DApplication();
        await this.appBottom.init({ backgroundAlpha: 0, autoDensity: true, width: this.field.clientWidth, height: this.field.clientHeight });
        this.field.appendChild(this.appBottom.canvas);
        this.appBottom.canvas.id = "plex-links";
        this.appBottom.canvas.style.position = "absolute";
        this.appBottom.canvas.style.touchAction = 'pan-y';
        this.appBottom.canvas.style.zIndex = "5";
        this.appBottom.canvas.style.pointerEvents = "none";
        this.graphicsBottom = this.appBottom.graphics;
        this.appTop = new Canvas2DApplication();
        await this.appTop.init({ backgroundAlpha: 0, autoDensity: true, width: this.field.clientWidth, height: this.field.clientHeight });
        const plexHost = this.field.closest('#plexContainer');
        this.topCanvasHost = plexHost || this.field.parentElement || this.field;
        if (this.topCanvasHost && getComputedStyle(this.topCanvasHost).position === 'static') {
            this.topCanvasHost.style.position = 'relative';
            this.topCanvasHostWasStatic = true;
        }
        else {
            this.topCanvasHostWasStatic = false;
        }
        this.topCanvasHost.appendChild(this.appTop.canvas);
        this.appTop.canvas.id = "plex-gates";
        this.appTop.canvas.style.position = "absolute";
        this.appTop.canvas.style.touchAction = 'pan-y';
        this.appTop.canvas.style.zIndex = "6";
        this.appTop.canvas.style.pointerEvents = "none";
        this.graphicsTop = this.appTop.graphics;
        this.appInteraction = new Canvas2DApplication();
        await this.appInteraction.init({ backgroundAlpha: 0, autoDensity: true, width: this.field.clientWidth, height: this.field.clientHeight });
        this.topCanvasHost.appendChild(this.appInteraction.canvas);
        this.appInteraction.canvas.id = "plex-interaction";
        this.appInteraction.canvas.style.position = "absolute";
        this.appInteraction.canvas.style.touchAction = 'pan-y';
        this.appInteraction.canvas.style.zIndex = "31";
        this.appInteraction.canvas.style.pointerEvents = "none";
        this.graphicsInteraction = this.appInteraction.graphics;
        this.syncTopCanvasPosition();
        window.removeEventListener('scroll', this.syncTopCanvasPositionListener, true);
        window.addEventListener('scroll', this.syncTopCanvasPositionListener, true);
        this.lastDevicePixelRatio = window.devicePixelRatio || 1;
        this.lastResizeWidth = 0;
        this.lastResizeHeight = 0;
        this.resizeRenderers(true);
    }
    async init(field) {
        if (!field) {
            throw new Error("PlexCanvas.init: field element is null or undefined. DOM may not be ready yet.");
        }
        this.field = field;
        this.focusCircleEl = document.getElementById('plex-focus-circle');
        document.addEventListener('focusin', () => {
            var _a;
            if (!this.focusCircleEl)
                return;
            const activeEl = document.activeElement;
            if (this.isEditableElement(activeEl) || this.isDialogShowing || this.isSearchUIShowing) {
                this.focusCircleEl.style.display = 'none';
            }
            else if (plexAnimator.focusedId && plexAnimator.focusedUsingKeyboardNav) {
                this.renderNow = true;
                this.stopAfterNextTick = true;
                if ((_a = this.appBottom) === null || _a === void 0 ? void 0 : _a.ticker) {
                    this.appBottom.ticker.start();
                }
            }
        });
        window.__plexTouchIsOverScrollbar = (x, y) => this.touch_isOverScrollbar(new Point(x, y));
        await this.setupPixi();
        this.queueResize();
        this.field.addEventListener('onselectstart', this.onSelectStartListener);
        this.field.addEventListener('pointermove', this.onPointerMoveListener);
        this.field.addEventListener('pointerdown', this.onPointerDownListener);
        this.field.addEventListener('pointerup', this.onPointerUpListener);
        this.field.addEventListener('pointerleave', this.onPointerLeaveListener);
        this.field.addEventListener('touchstart', this.onTouchStartListener);
        this.field.addEventListener('touchend', this.onTouchEndListener);
        this.field.addEventListener('touchcancel', this.onTouchCancelListener);
        this.field.addEventListener('touchmove', this.onTouchMoveListener);
        this.field.addEventListener('wheel', this.onWheelListener, { passive: false });
        this.field.addEventListener('contextmenu', this.onContextMenuListener);
        document.addEventListener('keydown', this.onKeyDownListener);
        document.addEventListener('mousemove', this.globalMouseMoveListener);
        document.addEventListener('mousedown', this.globalMouseDownListener);
        document.addEventListener('mouseup', this.globalMouseUpListener);
        this.stopAnimations();
        this.marchingAntsObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const el = mutation.target;
                    if (!el.classList.contains('tht'))
                        continue;
                    const needsAnts = el.classList.contains('thought-selected') || el.classList.contains('selection-rect-highlight');
                    const hasAnts = el.querySelector('.marching-ants-svg') !== null;
                    if (needsAnts && !hasAnts) {
                        this.createMarchingAntsSvg(el);
                    }
                    else if (!needsAnts && hasAnts) {
                        this.removeMarchingAntsSvg(el);
                    }
                }
                if (mutation.type === 'childList') {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node instanceof HTMLElement && node.classList.contains('tht')) {
                            const needsAnts = node.classList.contains('thought-selected') || node.classList.contains('selection-rect-highlight');
                            if (needsAnts && !node.querySelector('.marching-ants-svg')) {
                                this.createMarchingAntsSvg(node);
                            }
                        }
                    }
                }
            }
        });
        this.marchingAntsObserver.observe(this.field, {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true,
            childList: true,
        });
        this.marchingAntsResizeObserver = new ResizeObserver((entries) => this.handleMarchingAntsResize(entries));
        this.setupListScrollListeners();
        this.appBottom.ticker.maxFPS = this.FPS;
        if (this.tickerCallback) {
            console.warn("[PlexCanvas] Removing existing ticker callback before adding new one");
            this.appBottom.ticker.remove(this.tickerCallback);
            this.tickerCallback = null;
        }
        this.tickerCallback = (info) => {
            if (plexAnimator.isSwappingThoughtElements) {
                return;
            }
            this.syncTopCanvasPosition();
            let delta = info.deltaTime;
            if (this.field.clientWidth == 0 || this.field.clientHeight == 0) {
                return;
            }
            this.deltaSinceLastDraw += delta;
            let neededDelta = 60 / this.appBottom.ticker.maxFPS;
            if (this.isAnimating || this.renderNow || this.chevronAnimating || this.deltaSinceLastDraw > neededDelta || this.pressedObjectType !== PlexObjectType.Nothing || this.selectedLinkIds.size > 0 || this.stopAfterNextTick || this.linkPreviewPinned) {
                plexAnimator.tick(this.deltaSinceLastDraw);
                this.renderNow = false;
                this.graphicsBottom.clear();
                this.drawActiveThoughtBackground(this.graphicsBottom);
                let forceLayoutNeedsColliders = false;
                if (plexAnimator.layout == LayoutType.Force) {
                    this.clearLinkColliders();
                    forceLayoutNeedsColliders = plexAnimator.forceLayout.ellapsedTime > plexAnimator.FORCE_LAYOUT_LINK_LABELS_DELAY;
                }
                else if (this.isAnimating) {
                    this.clearLinkColliders();
                }
                let createColliders = this.linkColliders === undefined || forceLayoutNeedsColliders;
                if (createColliders) {
                    this.linkColliders = {};
                }
                this.drawLinksAndSetupGates(this.graphicsBottom, createColliders);
                this.drawScrollbars(this.graphicsBottom);
                this.graphicsTop.clear();
                this.graphicsInteraction.clear();
                this.chevronAnimating = false;
                this.drawGates(this.graphicsTop);
                this.drawInteractions(this.graphicsInteraction);
                this.drawDebugRectangles();
                this.deltaSinceLastDraw = 0;
                if (this.stopAfterNextTick) {
                    this.appBottom.ticker.stop();
                    this.stopAfterNextTick = false;
                }
            }
        };
        this.appBottom.ticker.add(this.tickerCallback);
    }
    drawDebugRectangles() {
        if (!this.showDebugRects) {
            return;
        }
        this.debugRects.forEach((drect) => {
            this.graphicsBottom.roundRect(drect.rect.x, drect.rect.y, drect.rect.width, drect.rect.height, 0)
                .stroke({ width: drect.strokeWidth, color: drect.color });
        });
    }
    setupListScrollListeners() {
        try {
            const pin = document.querySelector('.pinned-thoughts-list');
            if (pin && !pin.dataset["plexScrollHooked"]) {
                pin.addEventListener('scroll', this.listScrollHandler);
                pin.addEventListener('wheel', this.listWheelHandler, { passive: true });
                pin.dataset["plexScrollHooked"] = '1';
            }
            const past = document.querySelector('.past-thoughts-list');
            if (past && !past.dataset["plexScrollHooked"]) {
                past.addEventListener('scroll', this.listScrollHandler);
                past.addEventListener('wheel', this.listWheelHandler, { passive: true });
                past.dataset["plexScrollHooked"] = '1';
            }
            const selected = document.querySelector('.selected-thoughts-list');
            if (selected && !selected.dataset["plexScrollHooked"]) {
                selected.addEventListener('scroll', this.listScrollHandler);
                selected.addEventListener('wheel', this.listWheelHandler, { passive: true });
                selected.dataset["plexScrollHooked"] = '1';
            }
        }
        catch (_a) { }
    }
    cleanupListScrollListeners() {
        try {
            const pin = document.querySelector('.pinned-thoughts-list');
            if (pin) {
                pin.removeEventListener('scroll', this.listScrollHandler);
                pin.removeEventListener('wheel', this.listWheelHandler);
                delete pin.dataset["plexScrollHooked"];
            }
            const past = document.querySelector('.past-thoughts-list');
            if (past) {
                past.removeEventListener('scroll', this.listScrollHandler);
                past.removeEventListener('wheel', this.listWheelHandler);
                delete past.dataset["plexScrollHooked"];
            }
            const selected = document.querySelector('.selected-thoughts-list');
            if (selected) {
                selected.removeEventListener('scroll', this.listScrollHandler);
                selected.removeEventListener('wheel', this.listWheelHandler);
                delete selected.dataset["plexScrollHooked"];
            }
        }
        catch (_a) { }
    }
    rememberPointerLocation(point, pointerType) {
        this.lastPointerClientPoint = new Point(point.x, point.y);
        this.lastPointerType = pointerType || 'mouse';
    }
    handleListScrollHoverCheck(pointerPoint, pointerType) {
        var _a;
        const point = pointerPoint !== null && pointerPoint !== void 0 ? pointerPoint : this.lastPointerClientPoint;
        const type = (_a = pointerType !== null && pointerType !== void 0 ? pointerType : this.lastPointerType) !== null && _a !== void 0 ? _a : 'mouse';
        if (point) {
            this.checkForHover(new Point(point.x, point.y), type, true);
        }
        else if (this.hoveredListOverlayEl || this.hoveredListRep) {
            this.checkForHover(new Point(-99999, -99999), 'fakemouse', true);
        }
    }
    handleGlobalMouseMove(event) {
        var _a;
        const target = event.target;
        const isInLists = this.isInAccessoryList(target);
        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, 'mouse');
        if (this.pressedObjectType == PlexObjectType.ThoughtGate) {
            this.animateBriefly();
            this.checkForHover(clientPoint, 'fakemouse', true);
            let lastGateDragDestThtId = this.gateDragDestThtId;
            let thtResult = this.findThoughtAt(clientPoint, 'fakemouse');
            if (thtResult) {
                if (thtResult[0] != this.hoveredGateThtId) {
                    this.gateDragDestThtId = thtResult[0];
                    let thtRep = this.getRepForThoughtIdNearestToPoint(this.gateDragDestThtId, this.getFieldPointFromPoint(clientPoint));
                    if (thtRep) {
                        let otherGate = RelationHelper.getOpposite(this.hoveredGateRelation);
                        const inList = this.isInAccessoryList(thtRep.thtEl);
                        const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
                        let destChildSide;
                        if (plexAnimator.layout == LayoutType.Mindmap && isActiveThought && otherGate === Relation.Child && !inList) {
                            destChildSide = this.hoveredGateChildSide;
                        }
                        if (inList) {
                            const rect = DomUtils.getRect(thtRep.thtEl, this.field);
                            this.gateDragDestPoint = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, otherGate, false, destChildSide);
                        }
                        else {
                            this.gateDragDestPoint = this.getGateLocationFromThoughtRep(thtRep, otherGate, destChildSide);
                        }
                    }
                    else {
                        this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
                    }
                }
                else {
                    this.gateDragDestThtId = this.hoveredGateThtId;
                    this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
                }
            }
            else {
                this.gateDragDestThtId = undefined;
                this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            }
            if (lastGateDragDestThtId != this.gateDragDestThtId) {
                this.hoveredThoughtIdChanged(this.gateDragDestThtId, lastGateDragDestThtId);
            }
            this.renderNow = true;
            return;
        }
        if (isInLists && !this.isDialogShowing) {
            this.animateBriefly();
            this.checkForHover(clientPoint, 'fakemouse', true);
            this.renderNow = true;
        }
        else {
            if (this.pressedObjectType == PlexObjectType.Nothing) {
                if (this.hoveredThoughtId && !plexAnimator.thtReps.has(this.hoveredThoughtId)) {
                    this.checkForHover(new Point(-99999, -99999), 'fakemouse', true);
                    this.renderNow = true;
                    this.animateBriefly();
                }
                else if (this.hoveredThoughtId || this.hoveredLinkId || this.hoveredGateThtId || this.hoveredThoughtIconId) {
                    const fieldRect = this.field.getBoundingClientRect();
                    const isOutsideField = event.clientX < fieldRect.left || event.clientX > fieldRect.right
                        || event.clientY < fieldRect.top || event.clientY > fieldRect.bottom;
                    if (isOutsideField) {
                        this.checkForHover(new Point(-99999, -99999), 'fakemouse', true);
                        this.renderNow = true;
                        this.animateBriefly();
                    }
                }
            }
        }
    }
    handleGlobalMouseDown(event) {
        const target = event.target;
        const isInLists = this.isInAccessoryList(target);
        if (!isInLists)
            return;
        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, 'mouse');
        let thtResult = this.findThoughtAt(clientPoint, 'mouse');
        if (thtResult && thtResult[1] === PlexObjectType.ThoughtGate) {
            this.animateBriefly();
            this.pointerDownPoint = new Point(event.clientX, event.clientY);
            this.lastDragPoint = new Point(event.clientX, event.clientY);
            this.hasDragExceededClickDistance = false;
            this.hoveredGateThtId = thtResult[0];
            this.hoveredGateRelation = thtResult[2];
            this.hoveredListRep = this.lastListRepHit;
            this.listGateDragSourceRep = this.hoveredListRep;
            this.pressedObjectType = PlexObjectType.ThoughtGate;
            this.gateDragSourceChildSide = this.hoveredGateChildSide;
            this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            this.isListGateDragActive = true;
            if (this.hoveredThoughtId) {
                const lastId = this.hoveredThoughtId;
                this.hoveredThoughtId = undefined;
                this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastId);
            }
            this.renderNow = true;
        }
    }
    handleGlobalMouseUp(event) {
        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, 'mouse');
        if (this.pressedObjectType == PlexObjectType.ThoughtGate) {
            const isSelfLink = this.hoveredGateThtId != null && this.hoveredGateThtId === this.gateDragDestThtId;
            if (!isSelfLink) {
                safeInvoke(plexAnimator.dotNetHelper, "LinkThoughts", [this.hoveredGateThtId, this.gateDragDestThtId, this.hoveredGateRelation, event.shiftKey, event.clientX, event.clientY]);
            }
            this.pressedObjectType = PlexObjectType.Nothing;
            this.checkForHover(clientPoint, 'fakemouse', true);
            this.renderNow = true;
            this.animateBriefly();
            this.isListGateDragActive = false;
            this.listGateDragSourceRep = undefined;
            this.gateDragSourceChildSide = undefined;
        }
    }
    clearGates() {
        plexAnimator.thtReps.forEach((r) => {
            r.childGate = r.parentGate = r.jumpGate = GateStatus.Empty;
        });
        const listReps = plexAnimator.getAllListReps();
        listReps.forEach((r) => {
            r.childGate = r.parentGate = r.jumpGate = GateStatus.Empty;
        });
    }
    stopAnimations() {
        this.isAnimating = false;
        this.stopAfterNextTick = true;
    }
    startAnimations(seconds) {
        this.isAnimating = true;
        let hadHover = this.hoveredThoughtId != undefined || this.hoveredLinkId != undefined;
        if (this.hoveredThoughtId != undefined) {
            let lastHoveredThoughtId = this.hoveredThoughtId;
            this.hoveredThoughtId = undefined;
            this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastHoveredThoughtId);
        }
        if (this.hoveredLinkId != undefined) {
            let lastHoveredLinkId = this.hoveredLinkId;
            this.hoveredLinkId = undefined;
            this.hoveredLinkIdChanged(this.hoveredLinkId, lastHoveredLinkId);
        }
        if (hadHover) {
            safeInvoke(plexAnimator.dotNetHelper, "SetHoverItemByIdAsync", [null, -1]);
        }
        this.lastListRepHit = undefined;
        this.hoveredListRep = undefined;
        this.removeHoveredListOverlay();
        const totalSeconds = seconds + this.animationPaddingSeconds;
        this.animateForSeconds(totalSeconds);
    }
    suppressHoverForAnimation(seconds) {
        const totalSeconds = seconds + this.hoverSuppressionPaddingSeconds;
        this.suppressHoverFor(totalSeconds);
        this.removeHoveredListOverlay();
        if (this.resumeHoverAfterSuppressionTimer != null) {
            clearTimeout(this.resumeHoverAfterSuppressionTimer);
        }
        this.resumeHoverAfterSuppressionTimer = window.setTimeout(() => {
            this.resumeHoverAfterSuppressionTimer = null;
            this.handleListScrollHoverCheck();
            this.renderNow = true;
            this.animateBriefly();
        }, totalSeconds * 1000);
    }
    suppressHoverFor(seconds) {
        const now = Date.now();
        if (seconds <= 0) {
            this.hoverSuppressedUntil = Math.max(this.hoverSuppressedUntil, now);
            return;
        }
        const targetTime = now + seconds * 1000;
        if (targetTime > this.hoverSuppressedUntil) {
            this.hoverSuppressedUntil = targetTime;
        }
    }
    isHoverSuppressed() {
        if (this.hoverSuppressedUntil <= 0) {
            return false;
        }
        const now = Date.now();
        if (now < this.hoverSuppressedUntil) {
            return true;
        }
        this.hoverSuppressedUntil = 0;
        return false;
    }
    animateForSeconds(seconds) {
        var _a;
        this.stopAfterNextTick = false;
        if ((_a = this.appBottom) === null || _a === void 0 ? void 0 : _a.ticker) {
            this.appBottom.ticker.start();
        }
        if (this.stopAnimationsTimeoutId) {
            clearTimeout(this.stopAnimationsTimeoutId);
        }
        this.stopAnimationsTimeoutId = setTimeout(() => {
            this.stopAnimations();
            this.stopAnimationsTimeoutId = null;
        }, seconds * 1000);
    }
    animateBriefly() {
        if (!this.isAnimating) {
            this.animateForSeconds(0.1);
        }
    }
    clearLinkColliders() {
        this.linkColliders = undefined;
        this.removeLinkLabels();
    }
    removeLinkLabels() {
        let labelDivs = this.field.querySelectorAll(".link-label");
        labelDivs.forEach((div) => {
            div.remove();
        });
    }
    startLinkingFromQuadrant(linkRelation, currTouchPoint, thoughtId) {
        this.pointerDownPoint = new Point(currTouchPoint.x, currTouchPoint.y);
        this.lastDragPoint = new Point(currTouchPoint.x, currTouchPoint.y);
        this.hasDragExceededClickDistance = false;
        this.hoveredGateThtId = thoughtId;
        this.pressedObjectType = PlexObjectType.ThoughtGate;
        this.hoveredGateRelation = linkRelation;
        this.gateDragSourceChildSide = this.hoveredGateChildSide;
        this.gateDragDestPoint = this.getFieldPointFromPoint(currTouchPoint);
        document.addEventListener("touchmove", this.radialMenuTouchMoveListener);
        document.addEventListener("touchend", this.radialMenuTouchEndListener);
    }
    handleTouchMoveFromRadialMenu(event) {
        var _a;
        let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);
        this.renderNow = true;
        let lastGateDragDestThtId = this.gateDragDestThtId;
        let thtResult = this.findThoughtAt(clientPoint, "fakemouse");
        if (thtResult) {
            if (thtResult[0] != this.hoveredGateThtId) {
                if (thtResult[0] != this.lastThtResultId) {
                    safeInvoke(plexAnimator.dotNetHelper, "FireHapticClick");
                    this.lastThtResultId = thtResult[0];
                }
                this.gateDragDestThtId = thtResult[0];
                let thtRep = this.getRepForThoughtIdNearestToPoint(this.gateDragDestThtId, this.getFieldPointFromPoint(clientPoint));
                if (thtRep) {
                    let otherGate = RelationHelper.getOpposite(this.hoveredGateRelation);
                    const inList = this.isInAccessoryList(thtRep.thtEl);
                    const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
                    let destChildSide;
                    if (plexAnimator.layout == LayoutType.Mindmap && isActiveThought && otherGate === Relation.Child && !inList) {
                        destChildSide = this.hoveredGateChildSide;
                    }
                    if (inList) {
                        const rect = DomUtils.getRect(thtRep.thtEl, this.field);
                        this.gateDragDestPoint = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, otherGate, false, destChildSide);
                    }
                    else {
                        this.gateDragDestPoint = this.getGateLocationFromThoughtRep(thtRep, otherGate, destChildSide);
                    }
                }
                else {
                    this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
                }
            }
            else {
                this.gateDragDestThtId = this.hoveredGateThtId;
                this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            }
        }
        else {
            this.gateDragDestThtId = undefined;
            this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            this.lastThtResultId = null;
        }
        if (lastGateDragDestThtId != this.gateDragDestThtId) {
            this.hoveredThoughtIdChanged(this.gateDragDestThtId, lastGateDragDestThtId);
        }
    }
    handleTouchEndFromRadialMenu(event) {
        document.removeEventListener("touchmove", this.radialMenuTouchMoveListener);
        document.removeEventListener("touchend", this.radialMenuTouchEndListener);
        safeInvoke(plexAnimator.dotNetHelper, "LinkThoughts", [this.hoveredGateThtId, this.gateDragDestThtId, this.hoveredGateRelation, event.shiftKey, event.changedTouches[0].clientX, event.changedTouches[0].clientY]);
        this.pressedObjectType = PlexObjectType.Nothing;
        this.gateDragSourceChildSide = undefined;
        this.checkForHover(new Point(event.changedTouches[0].clientX, event.changedTouches[0].clientY), "fakemouse", true);
    }
    onPointerMove(event) {
        var _a;
        let scrollPoint = new Point(event.clientX - this.field.getBoundingClientRect().x, event.clientY - this.field.getBoundingClientRect().y);
        if (this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if (s != null) {
                    Scrollbar.stateByZone[s.zone].isHovered = s.isPointWithinScrollbar(scrollPoint);
                    s.onPointerMove(scrollPoint);
                }
            });
        }
        let allowDragBackground = (plexAnimator.layout == LayoutType.Force ||
            plexAnimator.layout == LayoutType.Outline ||
            plexAnimator.layout == LayoutType.Mindmap ||
            plexAnimator.layout == LayoutType.Normal ||
            plexAnimator.layout == LayoutType.NormalPlusOne);
        if (this.field == undefined || (this.isAnimating && !allowDragBackground)) {
            return;
        }
        this.animateBriefly();
        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, event.pointerType);
        if (event.pointerType == "touch") {
            return;
        }
        if (!this.pointerDownIsPrimary) {
            this.checkForHover(clientPoint, event.pointerType, false);
            return;
        }
        if (this.pressedObjectType != PlexObjectType.Nothing) {
            let deltaPoint = clientPoint.subtract(this.lastDragPoint);
            if (!this.hasDragExceededClickDistance) {
                let totalDelta = clientPoint.subtract(this.pointerDownPoint);
                if (totalDelta.x * totalDelta.x + totalDelta.y * totalDelta.y > this.MAX_CLICK_DIST * this.MAX_CLICK_DIST) {
                    this.hasDragExceededClickDistance = true;
                }
            }
            this.lastDragPoint = clientPoint;
            event.preventDefault();
            if (this.isDrawingSelectionRect && this.pressedObjectType == PlexObjectType.Background) {
                this.selectionRectEndPoint = this.getFieldPoint(event);
                this.updateSelectionRectangleHighlights();
                this.renderNow = true;
                return;
            }
            switch (this.pressedObjectType) {
                case PlexObjectType.ThoughtGate:
                    this.renderNow = true;
                    let lastGateDragDestThtId = this.gateDragDestThtId;
                    let thtResult = this.findThoughtAt(clientPoint, event.pointerType);
                    if (!this.isListGateDragActive) {
                        const newListRep = this.lastListRepHit;
                        if (this.hoveredListRep !== newListRep) {
                            this.hoveredListRep = newListRep;
                            this.renderNow = true;
                            this.updateHoveredListOverlayPosition();
                        }
                    }
                    if (thtResult) {
                        if (thtResult[0] != this.hoveredGateThtId) {
                            this.gateDragDestThtId = thtResult[0];
                            let thtRep = this.getRepForThoughtIdNearestToPoint(this.gateDragDestThtId, this.getFieldPoint(event));
                            if (thtRep) {
                                let otherGate = RelationHelper.getOpposite(this.hoveredGateRelation);
                                const inList = this.isInAccessoryList(thtRep.thtEl);
                                const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
                                let destChildSide;
                                if (plexAnimator.layout == LayoutType.Mindmap && isActiveThought && otherGate === Relation.Child && !inList) {
                                    destChildSide = this.hoveredGateChildSide;
                                }
                                if (inList) {
                                    const rect = DomUtils.getRect(thtRep.thtEl, this.field);
                                    this.gateDragDestPoint = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, otherGate, false, destChildSide);
                                }
                                else {
                                    this.gateDragDestPoint = this.getGateLocationFromThoughtRep(thtRep, otherGate, destChildSide);
                                }
                            }
                            else {
                                this.gateDragDestPoint = this.getFieldPoint(event);
                            }
                        }
                        else {
                            this.gateDragDestThtId = this.hoveredGateThtId;
                            this.gateDragDestPoint = this.getFieldPoint(event);
                        }
                    }
                    else {
                        this.gateDragDestThtId = undefined;
                        this.gateDragDestPoint = this.getFieldPoint(event);
                    }
                    if (lastGateDragDestThtId != this.gateDragDestThtId) {
                        this.hoveredThoughtIdChanged(this.gateDragDestThtId, lastGateDragDestThtId);
                    }
                    break;
                case PlexObjectType.Thought:
                    if (plexAnimator.layout != LayoutType.Force) {
                        if (this.supportsZoneDrag()) {
                            if (this.hasDragExceededClickDistance && this.draggedThoughtId) {
                                if (!this.zoneDragPlaceholder && this.draggedThoughtSourceZone
                                    && this.zoneDragSlots.length > 0 && !this.hasLeftSourceZone) {
                                    const rep = plexAnimator.thtReps.get(this.draggedThoughtId);
                                    if (rep) {
                                        const rect = rep.thtEl.getBoundingClientRect();
                                        this.zoneDragPlaceholder = this.createZonePlaceholder(rect.width, rect.height);
                                        this.field.appendChild(this.zoneDragPlaceholder);
                                        const slot = this.zoneDragSlots[this.zoneDragOriginalIndex];
                                        if (slot) {
                                            this.zoneDragPlaceholder.style.left = this.computeLeftForSlot(slot, rect.width, rep.alignment) + 'px';
                                            this.zoneDragPlaceholder.style.top = slot.y + 'px';
                                        }
                                        this.zoneDragCurrentDropIndex = this.zoneDragOriginalIndex;
                                        rep.thtEl.style.zIndex = '100';
                                        rep.thtEl.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
                                    }
                                }
                                let thtRepNorm = plexAnimator.thtReps.get(this.draggedThoughtId);
                                if (thtRepNorm) {
                                    thtRepNorm.thtEl.style.transition = "left 0s ease, top 0s ease";
                                    DomUtils.offsetElement(thtRepNorm.thtEl, deltaPoint);
                                    let hoveredElements = this.field.querySelectorAll(".hovered-tht, .hovered-tht-label");
                                    hoveredElements.forEach((hoverElement) => {
                                        hoverElement.style.transition = "left 0s ease, top 0s ease";
                                        DomUtils.offsetElement(hoverElement, deltaPoint);
                                    });
                                }
                                const zone = this.getZoneUnderClientPoint(clientPoint);
                                if (this.isOutlineOrMindmap()) {
                                    this.currentDropZone = this.draggedThoughtSourceZone;
                                }
                                else {
                                    if (zone !== this.draggedThoughtSourceZone && zone !== null) {
                                        this.hasLeftSourceZone = true;
                                        this.transitionToZoneChangeMode();
                                    }
                                    if (zone !== this.currentDropZone) {
                                        this.setZoneHovered(this.currentDropZone, false);
                                        this.currentDropZone = zone;
                                        if (this.hasLeftSourceZone) {
                                            this.setZoneHovered(this.currentDropZone, true);
                                        }
                                    }
                                }
                                if (!this.hasLeftSourceZone && this.zoneDragPlaceholder
                                    && this.currentDropZone === this.draggedThoughtSourceZone) {
                                    const dropIndex = this.computeDropIndex(this.currentDropZone, clientPoint, this.draggedThoughtId);
                                    this.updateZoneDragLayout(dropIndex);
                                }
                            }
                        }
                        break;
                    }
                    this.renderNow = true;
                    let thtRep = plexAnimator.thtReps.get(this.hoveredThoughtId);
                    if (thtRep) {
                        thtRep.thtEl.style.transition = "left 0s ease, top 0s ease";
                        DomUtils.offsetElement(thtRep.thtEl, deltaPoint);
                        let hoveredElements = this.field.querySelectorAll(".hovered-tht, .hovered-tht-label");
                        hoveredElements.forEach((hoverElement) => {
                            hoverElement.style.transition = "left 0s ease, top 0s ease";
                            DomUtils.offsetElement(hoverElement, deltaPoint);
                        });
                        if (plexAnimator.layout == LayoutType.Force) {
                            let newCen = DomUtils.getCenter(thtRep.thtEl, this.field);
                            plexAnimator.forceLayout.nodeDragged(thtRep.id, newCen, this.hasDragExceededClickDistance);
                        }
                    }
                    break;
                case PlexObjectType.Background:
                    if (allowDragBackground) {
                        if (plexAnimator.layout == LayoutType.Force) {
                            plexAnimator.forceLayout.backgroundDragged(deltaPoint, this.hasDragExceededClickDistance);
                        }
                        else {
                            plexAnimator.backgroundDragged(deltaPoint, this.hasDragExceededClickDistance);
                            this.renderNow = true;
                        }
                    }
                default:
                    break;
            }
            return;
        }
        if (this.checkForHover(clientPoint, event.pointerType, false)) {
            event.preventDefault();
        }
    }
    isPointInAccessoryPanel(clientPoint) {
        const selectors = ['.selected-thoughts-panel', '.pinned-thoughts-list-container', '.past-thoughts-list-container'];
        for (const selector of selectors) {
            const panel = document.querySelector(selector);
            if (!panel) {
                continue;
            }
            const style = getComputedStyle(panel);
            if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
                continue;
            }
            const r = panel.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) {
                continue;
            }
            if (clientPoint.x >= r.left && clientPoint.x <= r.right
                && clientPoint.y >= r.top && clientPoint.y <= r.bottom) {
                return true;
            }
        }
        return false;
    }
    isWithinExpandedDecorationRestBounds(indicatorId, thtEl, clientPoint) {
        const expanded = this.expandedDecoration;
        if (!expanded || expanded.decorationId !== indicatorId) {
            return true;
        }
        const thtRect = thtEl.getBoundingClientRect();
        const dx = thtRect.left - expanded.thtRect.left;
        const dy = thtRect.top - expanded.thtRect.top;
        return clientPoint.x >= expanded.restRect.left + dx && clientPoint.x <= expanded.restRect.right + dx
            && clientPoint.y >= expanded.restRect.top + dy && clientPoint.y <= expanded.restRect.bottom + dy;
    }
    findThoughtAt(clientPoint, pointerType) {
        this.lastListRepHit = undefined;
        let fieldRect = this.field.getBoundingClientRect();
        let point = new Point(clientPoint.x - fieldRect.x, clientPoint.y - fieldRect.y);
        const overAccessoryPanel = this.isPointInAccessoryPanel(clientPoint);
        let thtId = undefined;
        let plexObjectType = PlexObjectType.Nothing;
        let data;
        plexAnimator.thtReps.forEach((thtRep) => {
            var _a;
            if (overAccessoryPanel) {
                return;
            }
            if (pointerType == "touch") {
                return;
            }
            if (thtId !== undefined) {
                return;
            }
            if (parseFloat(thtRep.thtEl.style.opacity) < 1) {
                return;
            }
            const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
            if (plexAnimator.layout == LayoutType.Mindmap && isActiveThought) {
                let gatePt = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'left');
                let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                if (gateRect.contains(point)) {
                    thtId = thtRep.id;
                    data = Relation.Child;
                    this.hoveredGateChildSide = 'left';
                    if (plexAnimator.isReadOnly) {
                        plexObjectType = PlexObjectType.Thought;
                    }
                    else {
                        plexObjectType = PlexObjectType.ThoughtGate;
                    }
                    return;
                }
                gatePt = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'right');
                gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                if (gateRect.contains(point)) {
                    thtId = thtRep.id;
                    data = Relation.Child;
                    this.hoveredGateChildSide = 'right';
                    if (plexAnimator.isReadOnly) {
                        plexObjectType = PlexObjectType.Thought;
                    }
                    else {
                        plexObjectType = PlexObjectType.ThoughtGate;
                    }
                    return;
                }
                for (let gateNum = Relation.Parent; gateNum <= Relation.Jump; gateNum++) {
                    let gatePt = this.getGateLocationFromThoughtRep(thtRep, gateNum);
                    let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                    if (gateRect.contains(point)) {
                        thtId = thtRep.id;
                        data = gateNum;
                        this.hoveredGateChildSide = undefined;
                        if (plexAnimator.isReadOnly) {
                            plexObjectType = PlexObjectType.Thought;
                        }
                        else {
                            plexObjectType = PlexObjectType.ThoughtGate;
                        }
                        break;
                    }
                }
            }
            else {
                this.hoveredGateChildSide = undefined;
                for (let gateNum = Relation.Child; gateNum <= Relation.Jump; gateNum++) {
                    if (plexAnimator.layout == LayoutType.Mindmap && thtRep.id != plexAnimator.activeId &&
                        (gateNum == Relation.Jump || gateNum == Relation.Parent ||
                            thtRep.alignment == ThoughtHorizontalAlignment.Center)) {
                        continue;
                    }
                    let gatePt = this.getGateLocationFromThoughtRep(thtRep, gateNum);
                    let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                    if (gateRect.contains(point)) {
                        thtId = thtRep.id;
                        data = gateNum;
                        if (plexAnimator.isReadOnly) {
                            plexObjectType = PlexObjectType.Thought;
                        }
                        else {
                            plexObjectType = PlexObjectType.ThoughtGate;
                        }
                        break;
                    }
                }
            }
        });
        if (thtId === undefined) {
            const listReps = plexAnimator.getAllListReps();
            const selPanel = document.querySelector('.selected-thoughts-panel');
            let selPanelRect = null;
            if (selPanel && getComputedStyle(selPanel).pointerEvents !== 'none') {
                selPanelRect = selPanel.getBoundingClientRect();
            }
            listReps.forEach((thtRep) => {
                var _a, _b;
                if (thtId !== undefined) {
                    return;
                }
                if (pointerType == "touch") {
                    return;
                }
                const pinnedOrPastListEl = (_a = this.findAncestor(thtRep.thtEl, 'pinned-thoughts-list')) !== null && _a !== void 0 ? _a : this.findAncestor(thtRep.thtEl, 'past-thoughts-list');
                const isActiveThought = thtRep.id == ((_b = plexAnimator.node) === null || _b === void 0 ? void 0 : _b.id);
                for (let gateNum = Relation.Child; gateNum <= Relation.Jump; gateNum++) {
                    let rect = DomUtils.getRect(thtRep.thtEl, this.field);
                    let gatePt = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, gateNum, false);
                    let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5, isActiveThought);
                    if (gateRect.contains(point)) {
                        if (pinnedOrPastListEl && selPanelRect) {
                            const fieldRect = this.field.getBoundingClientRect();
                            const gateClientX = gatePt.x + fieldRect.x;
                            const gateClientY = gatePt.y + fieldRect.y;
                            if (gateClientX >= selPanelRect.left && gateClientX <= selPanelRect.right
                                && gateClientY >= selPanelRect.top && gateClientY <= selPanelRect.bottom) {
                                continue;
                            }
                        }
                        if (pinnedOrPastListEl) {
                            const listRect = pinnedOrPastListEl.getBoundingClientRect();
                            const fieldRect = this.field.getBoundingClientRect();
                            const gateClientX = gatePt.x + fieldRect.x;
                            if (gateClientX < listRect.left || gateClientX > listRect.right) {
                                continue;
                            }
                        }
                        thtId = thtRep.id;
                        data = gateNum;
                        plexObjectType = plexAnimator.isReadOnly ? PlexObjectType.Thought : PlexObjectType.ThoughtGate;
                        this.lastListRepHit = thtRep;
                        break;
                    }
                }
            });
        }
        if (plexAnimator.layout == LayoutType.Force || plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
            let start = (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) ? ThoughtControl.Chevron : ThoughtControl.Expand;
            let end = (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) ? ThoughtControl.Chevron : ThoughtControl.Anchor;
            plexAnimator.thtReps.forEach((thtRep) => {
                if (thtId !== undefined) {
                    return;
                }
                if (overAccessoryPanel) {
                    return;
                }
                if ((plexAnimator.layout == LayoutType.Mindmap || plexAnimator.layout == LayoutType.Outline)
                    && thtRep.id === plexAnimator.activeId) {
                    return;
                }
                for (let control = start; control <= end; control++) {
                    let controlPt = this.getControlLocation(thtRep, control);
                    let radius = plexAnimator.CONTROL_SIZE;
                    if (control == ThoughtControl.Chevron) {
                        radius = plexAnimator.rowHeight * 1.2;
                    }
                    let controlRect = new Rect(controlPt.x - radius / 2, controlPt.y - radius / 2, radius, radius);
                    if (controlRect.contains(point)) {
                        thtId = thtRep.id;
                        data = control;
                        plexObjectType = PlexObjectType.ThoughtControl;
                        break;
                    }
                }
            });
        }
        let allElementsAtPoint = document.elementsFromPoint(clientPoint.x, clientPoint.y);
        if (thtId === undefined) {
            let listThoughtEl = allElementsAtPoint.find(e => {
                const el = e;
                if (!el || !el.id || !el.id.startsWith('tht-'))
                    return false;
                return this.isInAccessoryList(el);
            });
            if (listThoughtEl) {
                const idFromEl = listThoughtEl.id.substring(4, 40);
                thtId = idFromEl;
                plexObjectType = PlexObjectType.Thought;
                this.lastListRepHit = this.getRepForThoughtIdNearestToPoint(idFromEl, point);
            }
        }
        if (thtId === undefined) {
            let elements = allElementsAtPoint.filter(e => e.classList.contains("tht-icon"));
            if (elements.length > 0) {
                let thtIconEl = elements[0];
                let thtEl = this.findAncestor(thtIconEl, "tht");
                if (thtEl && (!overAccessoryPanel || this.isInAccessoryList(thtEl))) {
                    thtId = thtEl.id.substring(4, 40);
                    plexObjectType = PlexObjectType.ThoughtIcon;
                }
            }
        }
        if (thtId === undefined) {
            let elements = allElementsAtPoint.filter(e => e.classList.contains("indicator-icon"));
            if (elements.length > 0) {
                let indicatorIconEl = elements[0];
                let thtEl = this.findAncestor(indicatorIconEl, "tht");
                if (thtEl && (!overAccessoryPanel || this.isInAccessoryList(thtEl))) {
                    thtId = thtEl.id.substring(4, 40);
                    plexObjectType = PlexObjectType.ThoughtDecorator;
                    data = {
                        indicatorId: indicatorIconEl.dataset["indicatorId"],
                        indicatorType: indicatorIconEl.dataset["indicatorType"]
                    };
                }
            }
        }
        if (thtId === undefined) {
            let container = allElementsAtPoint.find(e => {
                const el = e;
                return el.classList && (el.classList.contains("indicator-with-label") || el.classList.contains("indicator-label"));
            });
            if (container) {
                const wrapper = container.classList.contains("indicator-with-label") ? container : this.findAncestor(container, "indicator-with-label");
                if (wrapper) {
                    const icon = wrapper.querySelector(".indicator-icon");
                    const thtEl = this.findAncestor(wrapper, "tht");
                    if (icon && thtEl && (!overAccessoryPanel || this.isInAccessoryList(thtEl))
                        && this.isWithinExpandedDecorationRestBounds(icon.dataset["indicatorId"], thtEl, clientPoint)) {
                        thtId = thtEl.id.substring(4, 40);
                        plexObjectType = PlexObjectType.ThoughtDecorator;
                        data = {
                            indicatorId: icon.dataset["indicatorId"],
                            indicatorType: icon.dataset["indicatorType"]
                        };
                    }
                }
            }
        }
        if (thtId === undefined && !overAccessoryPanel) {
            let elements = allElementsAtPoint.filter(e => e.classList.contains("tht") && e.classList.contains("cur"));
            if (elements.length > 0) {
                thtId = elements[0].id.substring(4, 40);
                plexObjectType = PlexObjectType.Thought;
            }
        }
        if (thtId === undefined) {
            return null;
        }
        return [thtId, plexObjectType, data];
    }
    checkForHover(clientPoint, pointerType, ignoreHoverSuppress) {
        var _a, _b, _c, _d;
        let lastHoveredThoughtId = this.hoveredThoughtId;
        let lastHoveredGateThtId = this.hoveredGateThtId;
        let lastHoveredGateRelation = this.hoveredGateRelation;
        let lastHoveredLinkId = this.hoveredLinkId;
        let lastHoveredThoughtIconId = this.hoveredThoughtIconId;
        let lastHoveredDecorationThtId = this.hoveredDecorationThtId;
        let lastHoveredDecorationId = this.hoveredDecorationId;
        let lastHoveredDecorationType = this.hoveredDecorationType;
        let lastHoveredControlThtId = this.hoveredControlThtId;
        let lastListRepHit = this.lastListRepHit;
        const oldGateId = this.hoveredGateThtId;
        const oldGateRel = this.hoveredGateRelation;
        this.hoveredThoughtId = undefined;
        this.hoveredLinkId = undefined;
        this.hoveredGateThtId = undefined;
        this.hoveredGateRelation = Relation.Unknown;
        this.hoveredThoughtIconId = undefined;
        this.hoveredDecorationThtId = undefined;
        this.hoveredDecorationId = undefined;
        this.hoveredDecorationType = undefined;
        this.hoveredControlThtId = undefined;
        this.hoveredControl = ThoughtControl.Undefined;
        let isInteracting = false;
        let preventInteraction = this.isHoverSuppressed();
        if (!preventInteraction && plexAnimator.layout == LayoutType.Force && plexAnimator.forceLayout.ellapsedTime < plexAnimator.FORCE_LAYOUT_INTERACTION_DELAY) {
            preventInteraction = true;
        }
        if (ignoreHoverSuppress) {
            preventInteraction = false;
        }
        if (!preventInteraction) {
            if (this.pressedObjectType == PlexObjectType.ThoughtGate && oldGateId) {
                this.hoveredGateThtId = oldGateId;
                this.hoveredGateRelation = oldGateRel;
            }
            let thoughtResult = this.findThoughtAt(clientPoint, pointerType);
            if (thoughtResult) {
                switch (thoughtResult[1]) {
                    case PlexObjectType.ThoughtGate:
                        if (pointerType === "fake") {
                            this.hoveredThoughtId = thoughtResult[0];
                        }
                        else if (this.pressedObjectType != PlexObjectType.ThoughtGate) {
                            this.hoveredGateThtId = thoughtResult[0];
                            this.hoveredGateRelation = thoughtResult[2];
                            this.gateDragDestThtId = this.hoveredGateThtId;
                            this.hoveredThoughtId = thoughtResult[0];
                        }
                        break;
                    case PlexObjectType.ThoughtIcon:
                        if (!this.isDialogShowing) {
                            this.hoveredThoughtIconId = thoughtResult[0];
                        }
                        break;
                    case PlexObjectType.Thought:
                        this.hoveredThoughtId = thoughtResult[0];
                        break;
                    case PlexObjectType.ThoughtDecorator:
                        this.hoveredDecorationThtId = thoughtResult[0];
                        this.hoveredDecorationId = thoughtResult[2].indicatorId;
                        this.hoveredDecorationType = thoughtResult[2].indicatorType;
                        break;
                    case PlexObjectType.ThoughtControl:
                        this.hoveredControlThtId = thoughtResult[0];
                        this.hoveredControl = thoughtResult[2];
                        break;
                }
                isInteracting = true;
            }
            if (pointerType != "touch" && pointerType != "fake" && !isInteracting && this.linkColliders !== undefined) {
                let fieldRect = this.field.getBoundingClientRect();
                let point = new Point(clientPoint.x - fieldRect.x, clientPoint.y - fieldRect.y);
                Object.keys(this.linkColliders).forEach((id) => {
                    if (this.linkColliders[id].collide(point)) {
                        this.hoveredLinkId = id;
                    }
                });
                isInteracting = this.hoveredLinkId !== undefined;
            }
        }
        this.renderNow = this.renderNow || this.hoveredThoughtId != lastHoveredThoughtId || this.hoveredLinkId != lastHoveredLinkId || this.hoveredGateThtId != lastHoveredGateThtId || this.lastListRepHit != lastListRepHit || this.hoveredControlThtId != lastHoveredControlThtId;
        if (this.hoveredThoughtId != lastHoveredThoughtId || this.lastListRepHit != lastListRepHit) {
            this.hoveredListRep = (this.pressedObjectType == PlexObjectType.ThoughtGate && this.isListGateDragActive && this.listGateDragSourceRep)
                ? this.listGateDragSourceRep
                : this.lastListRepHit;
        }
        if (this.hoveredThoughtId != lastHoveredThoughtId) {
            this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastHoveredThoughtId);
        }
        if (this.hoveredLinkId != lastHoveredLinkId) {
            this.hoveredLinkIdChanged(this.hoveredLinkId, lastHoveredLinkId);
        }
        if (this.hoveredThoughtId != lastHoveredThoughtId || this.hoveredLinkId != lastHoveredLinkId || this.hoveredGateThtId != lastHoveredGateThtId || this.hoveredThoughtIconId != lastHoveredThoughtIconId) {
            let hoverId = (_d = (_c = (_b = (_a = this.hoveredThoughtId) !== null && _a !== void 0 ? _a : this.hoveredLinkId) !== null && _b !== void 0 ? _b : this.hoveredGateThtId) !== null && _c !== void 0 ? _c : this.hoveredThoughtIconId) !== null && _d !== void 0 ? _d : null;
            let entityType = (this.hoveredThoughtId || this.hoveredGateThtId || this.hoveredThoughtIconId) ? 2 : this.hoveredLinkId ? 3 : -1;
            safeInvoke(plexAnimator.dotNetHelper, "SetHoverItemByIdAsync", [hoverId, entityType]);
        }
        if (this.hoveredGateThtId != lastHoveredGateThtId || this.hoveredGateRelation != lastHoveredGateRelation) {
            this.hoveredGateOrControlThtIdChanged(this.hoveredGateThtId, lastHoveredGateThtId, this.hoveredGateRelation, lastHoveredGateRelation);
        }
        if (this.hoveredThoughtIconId != lastHoveredThoughtIconId) {
            this.hoveredThoughtIconIdChanged(this.hoveredThoughtIconId, lastHoveredThoughtIconId);
        }
        if (this.hoveredDecorationThtId != lastHoveredDecorationThtId || this.hoveredDecorationId != lastHoveredDecorationId || this.hoveredDecorationType != lastHoveredDecorationType) {
            this.hoveredDecorationChanged(this.hoveredDecorationThtId, lastHoveredDecorationThtId, this.hoveredDecorationId, lastHoveredDecorationId, this.hoveredDecorationType, lastHoveredDecorationType);
        }
        if (this.hoveredControlThtId != lastHoveredControlThtId) {
            this.hoveredGateOrControlThtIdChanged(this.hoveredControlThtId, lastHoveredControlThtId);
        }
        this.updateHoveredListOverlayPosition();
        return isInteracting;
    }
    findAncestor(el, cls) {
        if (el == null) {
            return null;
        }
        while ((el = el.parentElement) && !el.classList.contains(cls)) {
        }
        return el;
    }
    isInAccessoryList(el) {
        if (!el)
            return false;
        const classes = [
            'pinned-thoughts-list', 'past-thoughts-list', 'selected-thoughts-list',
            'pinned-thoughts-list-container', 'past-thoughts-list-container', 'selected-thoughts-panel'
        ];
        for (const cls of classes) {
            if (el.classList.contains(cls))
                return true;
            if (this.findAncestor(el, cls))
                return true;
        }
        return false;
    }
    updateColor(element, alpha) {
        const value = element.style.backgroundColor;
        let parts = value.match(/[\d.]+/g);
        if (!parts) {
            parts = ['200', '200', '200', '' + alpha];
        }
        else if (parts.length === 3) {
            parts.push(alpha);
        }
        else {
            parts[3] = '' + Math.min(1, Math.max(0, alpha));
        }
        element.style.backgroundColor = `rgba(${parts.join(',')})`;
    }
    removeHoveredListOverlay() {
        if (this.hoveredListOverlayEl) {
            this.hoveredListOverlayEl.remove();
            this.hoveredListOverlayEl = null;
        }
    }
    showHoveredListThoughtOverlay(rep) {
        if (this.isHoverSuppressed()) {
            this.removeHoveredListOverlay();
            return;
        }
        const doc = this.field.ownerDocument;
        const host = doc ? doc.body : document.body;
        this.removeHoveredListOverlay();
        const expandVertically = this.listOverlayExpandsVertically;
        this.currentListOverlayExpandsVertically = expandVertically;
        let clone = rep.thtEl.cloneNode(true);
        clone.classList.remove("cur", "link-hovered", "gate-hovered");
        clone.classList.add("hovered-list-tht", "hovered-tht");
        clone.id = "";
        const rect = rep.thtEl.getBoundingClientRect();
        clone.style.position = "absolute";
        clone.style.whiteSpace = "normal";
        clone.style.overflow = "visible";
        clone.style.pointerEvents = "none";
        clone.style.transition = PlexCanvas.HOVER_CLONE_OPACITY_TRANSITION;
        clone.style.opacity = "0";
        clone.style.zIndex = "30";
        if (expandVertically) {
            const width = rect.width;
            clone.style.width = `${width}px`;
            clone.style.maxWidth = `${width}px`;
        }
        else {
            clone.style.width = "fit-content";
            clone.style.maxWidth = "none";
        }
        host.appendChild(clone);
        const thoughtControlElements = clone.querySelectorAll(".thought-control");
        thoughtControlElements.forEach((el) => {
            el.style.overflow = "visible";
            el.style.opacity = "1.0";
            if (expandVertically) {
                const width = rect.width;
                el.style.maxWidth = `${width}px`;
                el.style.width = "100%";
            }
            else {
                el.style.maxWidth = "none";
                el.style.width = "fit-content";
            }
            const bg = window.getComputedStyle(el).backgroundColor;
            if (bg && bg.startsWith('rgba')) {
                const parts = bg.substring(bg.indexOf('(') + 1, bg.indexOf(')')).split(',');
                if (parts.length === 4) {
                    const alpha = parseFloat(parts[3]);
                    if (alpha < 1) {
                        parts[3] = '1';
                        el.style.backgroundColor = `rgba(${parts.join(',')})`;
                    }
                }
            }
        });
        const textElements = clone.querySelectorAll(".narrow-text-when-narrow");
        textElements.forEach((el) => {
            el.style.whiteSpace = "normal";
            el.style.textOverflow = "clip";
            if (expandVertically) {
                el.style.width = "100%";
                el.style.overflowWrap = "break-word";
            }
            else {
                el.style.overflow = "visible";
            }
            const fullName = el.dataset.fullName;
            if (fullName) {
                el.textContent = fullName;
            }
        });
        this.hoveredListOverlayEl = clone;
        this.updateHoveredListOverlayPosition();
        this.shrinkHoverCloneToWrappedContent(clone, this.field.getBoundingClientRect().right - rect.left - 4);
        requestAnimationFrame(() => { clone.style.opacity = "1"; });
    }
    updateHoveredListOverlayPosition() {
        if (!this.hoveredListOverlayEl || !this.hoveredListRep) {
            return;
        }
        const rect = this.hoveredListRep.thtEl.getBoundingClientRect();
        const overlay = this.hoveredListOverlayEl;
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.height = "auto";
        overlay.style.minHeight = `${rect.height}px`;
        overlay.style.bottom = "auto";
        if (this.currentListOverlayExpandsVertically) {
            const isPinned = !!this.findAncestor(this.hoveredListRep.thtEl, 'pinned-thoughts-list');
            const isSelected = !!this.findAncestor(this.hoveredListRep.thtEl, 'selected-thoughts-list');
            if (isPinned || isSelected) {
                overlay.style.top = `${rect.top + window.scrollY}px`;
            }
            else {
                overlay.style.top = "auto";
                overlay.style.bottom = `${window.innerHeight - rect.bottom}px`;
            }
            overlay.style.width = `${rect.width}px`;
            overlay.style.maxWidth = `${rect.width}px`;
            overlay.style.minWidth = `${rect.width}px`;
        }
        else {
            overlay.style.top = `${rect.top + window.scrollY}px`;
            overlay.style.maxWidth = "none";
            overlay.style.minWidth = `${rect.width}px`;
        }
        overlay.style.zIndex = "30";
        this.clampHoverCloneToPlexBounds(overlay, rect, true);
    }
    shrinkThoughtControlToWrappedContent(tc, availableWidth) {
        const textEls = tc.querySelectorAll(".narrow-text-when-narrow");
        if (textEls.length === 0)
            return;
        tc.style.removeProperty('width');
        if (availableWidth > 0) {
            tc.style.maxWidth = `${availableWidth}px`;
        }
        else {
            tc.style.removeProperty('maxWidth');
        }
        textEls.forEach(textEl => {
            textEl.style.removeProperty('width');
            if (availableWidth > 0) {
                textEl.style.maxWidth = `${availableWidth}px`;
            }
            else {
                textEl.style.removeProperty('maxWidth');
            }
        });
        const measureLines = () => {
            let longest = 0;
            let count = 0;
            textEls.forEach(textEl => {
                try {
                    const range = document.createRange();
                    range.selectNodeContents(textEl);
                    const rects = range.getClientRects();
                    if (rects.length > count)
                        count = rects.length;
                    for (let i = 0; i < rects.length; i++) {
                        if (rects[i].width > longest)
                            longest = rects[i].width;
                    }
                }
                catch (_) { }
            });
            return { longest, count };
        };
        const original = measureLines();
        if (original.longest <= 0)
            return;
        const tcWidth = tc.getBoundingClientRect().width;
        let textTotalWidth = 0;
        textEls.forEach(textEl => {
            textTotalWidth = Math.max(textTotalWidth, textEl.getBoundingClientRect().width);
        });
        if (textTotalWidth <= 0)
            return;
        const extra = tcWidth - textTotalWidth;
        const applyWidths = (textWidth) => {
            const tcTarget = textWidth + extra;
            tc.style.width = `${tcTarget}px`;
            tc.style.maxWidth = `${tcTarget}px`;
            textEls.forEach(textEl => {
                textEl.style.width = `${textWidth}px`;
                textEl.style.maxWidth = `${textWidth}px`;
            });
        };
        const revertWidths = () => {
            tc.style.removeProperty('width');
            if (availableWidth > 0) {
                tc.style.maxWidth = `${availableWidth}px`;
            }
            else {
                tc.style.removeProperty('maxWidth');
            }
            textEls.forEach(textEl => {
                textEl.style.removeProperty('width');
                if (availableWidth > 0) {
                    textEl.style.maxWidth = `${availableWidth}px`;
                }
                else {
                    textEl.style.removeProperty('maxWidth');
                }
            });
        };
        let margin = 1;
        let success = false;
        while (margin <= 64) {
            const targetTextWidth = Math.ceil(original.longest) + margin;
            const targetTcWidth = targetTextWidth + extra;
            if (targetTcWidth >= tcWidth)
                break;
            applyWidths(targetTextWidth);
            if (measureLines().count <= original.count) {
                success = true;
                break;
            }
            margin *= 2;
        }
        if (!success)
            revertWidths();
    }
    shrinkHoverCloneToWrappedContent(overlay, availableWidth) {
        const tcs = overlay.querySelectorAll(".thought-control");
        tcs.forEach(tc => this.shrinkThoughtControlToWrappedContent(tc, availableWidth));
    }
    shrinkAccessoryListItemWidths(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container)
            return;
        const containerRect = container.getBoundingClientRect();
        const tcs = container.querySelectorAll(".thought-control");
        tcs.forEach(tc => this.shrinkThoughtControlToWrappedContent(tc, containerRect.width));
    }
    clampHoverCloneToPlexBounds(overlay, anchorRect, hostIsBody) {
        if (!this.field)
            return;
        const plexRect = this.field.getBoundingClientRect();
        const PADDING = 4;
        overlay.classList.add("multiline-wrap");
        const availableWidth = Math.max(0, plexRect.right - anchorRect.left - PADDING);
        if (availableWidth > 0) {
            overlay.style.maxWidth = `${availableWidth}px`;
            const tcs = overlay.querySelectorAll(".thought-control");
            tcs.forEach(tc => {
                tc.style.maxWidth = `${availableWidth}px`;
            });
            const texts = overlay.querySelectorAll(".narrow-text-when-narrow");
            texts.forEach(t => {
                t.style.maxWidth = `${availableWidth}px`;
            });
        }
        const overlayRect = overlay.getBoundingClientRect();
        if (overlayRect.bottom > plexRect.bottom) {
            const desiredViewportTop = Math.max(plexRect.top, plexRect.bottom - overlayRect.height);
            overlay.style.bottom = "auto";
            overlay.style.transition = PlexCanvas.HOVER_CLONE_OPACITY_TRANSITION;
            if (hostIsBody) {
                overlay.style.top = `${desiredViewportTop + window.scrollY}px`;
            }
            else {
                overlay.style.top = `${desiredViewportTop - plexRect.top}px`;
            }
        }
        if (overlayRect.left < plexRect.left) {
            if (hostIsBody) {
                overlay.style.left = `${plexRect.left + window.scrollX}px`;
            }
            else {
                overlay.style.left = "0px";
            }
        }
    }
    setListOverlayExpansionMode(expandVertically) {
        if (this.listOverlayExpandsVertically === expandVertically) {
            return;
        }
        this.listOverlayExpandsVertically = expandVertically;
        if (!this.hoveredListOverlayEl) {
            this.currentListOverlayExpandsVertically = expandVertically;
            return;
        }
        if (this.hoveredListRep) {
            this.showHoveredListThoughtOverlay(this.hoveredListRep);
        }
        else {
            this.removeHoveredListOverlay();
        }
    }
    setIsSearchUIShowing(isShowing) {
        this.isSearchUIShowing = isShowing;
    }
    setIsDialogShowing(isShowing) {
        this.isDialogShowing = isShowing;
    }
    hoveredThoughtIdChanged(id, lastId) {
        var _a, _b;
        const textHoverMode = plexAnimator.tagTextVisibilityMode === 'hover';
        const iconHoverMode = plexAnimator.tagIconVisibilityMode === 'hover';
        const adjustGap = textHoverMode || iconHoverMode;
        if (lastId) {
            const lastRep = plexAnimator.thtReps.get(lastId);
            if (lastRep) {
                const originalIndicators = lastRep.thtEl.querySelector('.indicator-icons');
                if (originalIndicators) {
                    originalIndicators.style.visibility = '';
                }
                const wrappers = lastRep.thtEl.querySelectorAll('.indicator-with-label');
                wrappers.forEach(w => {
                    const label = w.querySelector('.indicator-label');
                    if (label) {
                        const originalText = label.dataset['originalText'];
                        const fullName = label.dataset['indicatorName'];
                        if (originalText !== undefined && originalText !== fullName) {
                            label.textContent = originalText;
                        }
                    }
                });
                if (textHoverMode) {
                    wrappers.forEach(w => {
                        const label = w.querySelector('.indicator-label');
                        if (label) {
                            label.style.display = 'none';
                        }
                        if (w.dataset && w.dataset['backColorCss']) {
                            w.style.backgroundColor = '';
                        }
                        if (w.dataset && w.dataset['foreColorCss']) {
                            w.style.color = '';
                        }
                        w.style.padding = '0';
                    });
                }
                if (iconHoverMode) {
                    const icons = lastRep.thtEl.querySelectorAll('.indicator-icon[data-icon-visibility="hover"]');
                    icons.forEach(icon => { icon.style.display = 'none'; });
                }
                if (adjustGap) {
                    const parent = lastRep.thtEl.querySelector('.indicator-icons');
                    if (parent) {
                        parent.style.gap = '0px';
                    }
                }
            }
        }
        if (id && !plexAnimator.thtReps.has(id)) {
            const ids = Array.from(plexAnimator.thtReps.keys());
            if (!ids.includes(id))
                ids.push(id);
            plexAnimator.requestExtraLinksForIds(ids);
        }
        let oldHoveredEls = this.field.querySelectorAll(".hovered-tht, .hovered-tht-label");
        oldHoveredEls.forEach((oldHoveredEl) => {
            oldHoveredEl.remove();
        });
        this.removeHoveredListOverlay();
        if (id) {
            const accessoryInstanceHovered = !!this.hoveredListRep && this.hoveredListRep.id === id;
            const rep = plexAnimator.thtReps.get(id);
            if (rep && !rep.thtEl.classList.contains("old") && !accessoryInstanceHovered) {
                const wrappers = rep.thtEl.querySelectorAll('.indicator-with-label');
                wrappers.forEach(w => {
                    const label = w.querySelector('.indicator-label');
                    if (label) {
                        const originalText = label.dataset['originalText'];
                        const fullName = label.dataset['indicatorName'];
                        if (fullName !== undefined && originalText !== fullName) {
                            label.textContent = fullName;
                        }
                    }
                });
                if (textHoverMode || iconHoverMode) {
                    if (textHoverMode) {
                        wrappers.forEach(w => {
                            const label = w.querySelector('.indicator-label');
                            if (label) {
                                label.style.display = '';
                            }
                            const ds = w.dataset || {};
                            if (ds['backColorCss']) {
                                w.style.backgroundColor = ds['backColorCss'];
                            }
                            if (ds['foreColorCss']) {
                                w.style.color = ds['foreColorCss'];
                            }
                            w.style.padding = '0.1em 0.45em';
                        });
                    }
                    if (iconHoverMode) {
                        const icons = rep.thtEl.querySelectorAll('.indicator-icon[data-icon-visibility="hover"]');
                        icons.forEach(icon => { icon.style.display = ''; });
                    }
                    if (adjustGap) {
                        const parent = rep.thtEl.querySelector('.indicator-icons');
                        if (parent) {
                            parent.style.gap = '1px';
                        }
                    }
                }
            }
            const listReorderDragActive = (document.body && (((_a = document.body.dataset) === null || _a === void 0 ? void 0 : _a.listReorderDragging) === 'true' || document.body.classList.contains('list-reorder-dragging')));
            const hoverSuppressedForAnim = this.isHoverSuppressed();
            let thtRep = plexAnimator.thtReps.get(id);
            if (thtRep && thtRep.thtEl.classList.contains("old")) {
                thtRep = undefined;
            }
            if (accessoryInstanceHovered) {
                thtRep = undefined;
            }
            if (thtRep && !listReorderDragActive && !hoverSuppressedForAnim) {
                const originalIndicators = thtRep.thtEl.querySelector('.indicator-icons');
                if (originalIndicators) {
                    originalIndicators.style.visibility = 'hidden';
                }
                let newElement = thtRep.thtEl.cloneNode(true);
                const overlayIndicators = newElement.querySelector('.indicator-icons');
                if (overlayIndicators) {
                    overlayIndicators.style.visibility = '';
                }
                newElement.id = "tht-" + id + "-hovered";
                newElement.classList.remove("cur", "link-hovered", "gate-hovered");
                newElement.classList.add("hovered-tht", "old");
                newElement.style.whiteSpace = "normal";
                newElement.style.overflow = "visible";
                newElement.style.maxHeight = "none";
                const clonedTextEl = newElement.querySelector('.narrow-text-when-narrow');
                if (clonedTextEl) {
                    clonedTextEl.style.display = '';
                    clonedTextEl.style.overflow = '';
                    clonedTextEl.style.removeProperty('-webkit-box-orient');
                    clonedTextEl.style.removeProperty('-webkit-line-clamp');
                    const fullName = clonedTextEl.dataset.fullName;
                    if (fullName) {
                        clonedTextEl.textContent = fullName;
                    }
                }
                newElement.style.animation = "";
                newElement.style.zIndex = "30";
                newElement.style.pointerEvents = "none";
                newElement.style.transition = PlexCanvas.HOVER_CLONE_OPACITY_TRANSITION;
                newElement.style.opacity = "0";
                let thoughtControlElements = newElement.querySelectorAll(".hovered-tht .thought-control");
                let that = this;
                thoughtControlElements.forEach((el) => {
                    el.style.overflow = "visible";
                    el.style.opacity = "1.0";
                    el.style.border = newElement.style.border;
                    that.updateColor(el, 1.0);
                    let textWrapperElements = el.querySelectorAll(".hovered-tht .thought-control div");
                    textWrapperElements.forEach((e) => {
                        e.style.whiteSpace = "normal";
                    });
                });
                this.field.appendChild(newElement);
                const anchorRect = thtRep.thtEl.getBoundingClientRect();
                this.clampHoverCloneToPlexBounds(newElement, anchorRect, false);
                this.shrinkHoverCloneToWrappedContent(newElement, this.field.getBoundingClientRect().right - anchorRect.left - 4);
                requestAnimationFrame(() => { newElement.style.opacity = "1"; });
                let top = parseInt(newElement.style.top.replace("px", ""));
                let labelText = thtRep.thtEl.dataset["label"];
                if (labelText && labelText.length > 0 && labelText != thtRep.thtEl.innerText) {
                    let point = DomUtils.getCenter(thtRep.thtEl, this.field);
                    point.y -= plexAnimator.rowHeight * 0.75;
                    let labelDiv = document.createElement("div");
                    labelDiv.classList.add("hovered-tht-label");
                    let content = document.createTextNode(labelText);
                    labelDiv.appendChild(content);
                    labelDiv.classList.add("thought-label", "rounded", "px-1", "cursor-default", "narrow-text-when-narrow");
                    labelDiv.style.zIndex = "30";
                    labelDiv.style.fontSize = (0.65 * plexAnimator.plexThoughtFontSize) + "%";
                    labelDiv.style.lineHeight = "1.2";
                    labelDiv.style.transition = PlexCanvas.HOVER_LABEL_OPACITY_TRANSITION;
                    labelDiv.style.opacity = "0";
                    this.field.appendChild(labelDiv);
                    DomUtils.centerAt(labelDiv, point);
                    let ltop = parseInt(labelDiv.style.top.replace("px", ""));
                    let height = parseInt(getComputedStyle(labelDiv).getPropertyValue("height").replace("px", ""));
                    let bottom = ltop + height;
                    let delta = 2;
                    if (bottom > top) {
                        delta += bottom - top;
                    }
                    let labelTop = parseInt(labelDiv.style.top.replace("px", ""));
                    labelDiv.style.top = (labelTop - delta) + 'px';
                    let labelLeft = parseInt(labelDiv.style.left.replace("px", ""));
                    if (labelLeft < 0) {
                        labelDiv.style.left = "0px";
                    }
                    requestAnimationFrame(() => { labelDiv.style.opacity = "1"; });
                }
            }
            if (this.hoveredListRep && this.hoveredListRep.id === id) {
                const listReorderDragActive2 = (document.body && (((_b = document.body.dataset) === null || _b === void 0 ? void 0 : _b.listReorderDragging) === 'true' || document.body.classList.contains('list-reorder-dragging')));
                if (!listReorderDragActive2 && !hoverSuppressedForAnim) {
                    this.showHoveredListThoughtOverlay(this.hoveredListRep);
                }
            }
        }
        this.highlightLinkLabelsForThought(id);
    }
    highlightLinkLabelsForThought(id) {
        let hoveredLinkLabelEls = this.field.querySelectorAll(".link-label.link-hovered");
        hoveredLinkLabelEls.forEach((label) => {
            label.classList.remove("link-hovered");
        });
        if (id) {
            let thtLinks = Array.from(plexAnimator.linkReps.values()).filter((l) => l.idB === id || l.idA === id);
            thtLinks.forEach((l) => {
                let label = document.getElementById("lnk-" + l.id);
                if (label) {
                    label.classList.add("link-hovered");
                }
            });
        }
    }
    hoveredThoughtIconIdChanged(id, lastId) {
        let oldHoveredEls = this.field.querySelectorAll(".hovered-tht-icon");
        if (oldHoveredEls.length > 0) {
            oldHoveredEls.forEach((oldHoveredEl) => {
                oldHoveredEl.style.transition = "opacity " + plexAnimator.ICON_FADE_ANIMATION_TIME + "s ease";
                oldHoveredEl.classList.remove("hovered-tht-icon");
                oldHoveredEl.style.opacity = "0";
                oldHoveredEl.id = "";
                oldHoveredEl.classList.add("icon-to-remove");
            });
            setTimeout(() => {
                let removeEls = this.field.querySelectorAll(".icon-to-remove");
                removeEls.forEach((el) => {
                    el.remove();
                });
            }, plexAnimator.ICON_FADE_ANIMATION_TIME * 1000);
        }
        if (lastId) {
            let thtRep = plexAnimator.thtReps.get(lastId);
            if (thtRep) {
                let iconEl = thtRep.thtEl.querySelector(".tht-icon");
                if (iconEl) {
                    iconEl.style.cursor = "inherit";
                }
            }
        }
        if (id) {
            setTimeout(() => {
                if (this.hoveredThoughtIconId == id) {
                    let existingHovered = this.field.querySelectorAll(".hovered-tht-icon");
                    if (existingHovered && existingHovered.length > 0) {
                        return;
                    }
                    let thtRep = plexAnimator.thtReps.get(id);
                    if (thtRep) {
                        let iconEl = thtRep.thtEl.querySelector(".tht-icon");
                        if (iconEl) {
                            iconEl.style.cursor = "none";
                            let newElement = iconEl.cloneNode(true);
                            let src = newElement.src;
                            let lastSlashIndex = src.lastIndexOf('/');
                            if (lastSlashIndex > 0 && src.substring(lastSlashIndex + 1)) {
                                let lastPart = src.substring(lastSlashIndex + 1);
                                if (Number(lastPart).toString() === lastPart) {
                                    newElement.src = src.substring(0, lastSlashIndex) + "/" + plexAnimator.LARGE_ICON_SIZE;
                                }
                            }
                            newElement.classList.add("hovered-tht-icon");
                            newElement.style.zIndex = "30";
                            newElement.style.pointerEvents = "none";
                            this.field.appendChild(newElement);
                            this.zoomToFullSize(newElement, iconEl, iconEl);
                            if (!newElement.complete) {
                                newElement.addEventListener('load', () => {
                                    this.zoomToFullSize(newElement, newElement, iconEl);
                                });
                            }
                        }
                    }
                }
            }, plexAnimator.ICON_ZOOM_DELAY_TIME * 1000);
        }
    }
    zoomToFullSize(newElement, srcElement, centerElement) {
        let startRect = DomUtils.getRect(srcElement, this.field);
        newElement.style.transition = "";
        newElement.style.maxWidth = "100%";
        newElement.style.maxHeight = "100%";
        newElement.style.objectFit = "contain";
        newElement.style.width = newElement.naturalWidth + "px";
        newElement.style.height = newElement.naturalHeight + "px";
        DomUtils.centerOnTopOf(newElement, centerElement, this.field);
        DomUtils.keepInsideOf(newElement, this.field);
        let endRect = DomUtils.getRect(newElement, this.field);
        this.positionElement(newElement, startRect);
        setTimeout(() => {
            newElement.style.transition = "all " + plexAnimator.ICON_ZOOM_ANIMATION_TIME + "s ease";
            this.positionElement(newElement, endRect);
        }, 30);
    }
    positionElement(element, rect) {
        element.style.left = rect.x + "px";
        element.style.top = rect.y + "px";
        element.style.width = rect.width + "px";
        element.style.height = rect.height + "px";
    }
    getColorString(num, alpha) {
        num >>>= 0;
        let b = num & 0xFF, g = (num & 0xFF00) >>> 8, r = (num & 0xFF0000) >>> 16, a = +alpha;
        return "rgba(" + [r, g, b, a].join(",") + ")";
    }
    hoveredLinkIdChanged(id, lastId) {
        if (lastId) {
            let link = this.getLinkRep(lastId);
            if (link) {
                let thtRepA = plexAnimator.thtReps.get(link.idA);
                let thtRepB = plexAnimator.thtReps.get(link.idB);
                if (thtRepA) {
                    thtRepA.thtEl.classList.remove("link-hovered");
                }
                if (thtRepB) {
                    thtRepB.thtEl.classList.remove("link-hovered");
                }
                let labelDiv = document.getElementById("lnk-" + link.id);
                if (labelDiv) {
                    labelDiv.classList.remove("link-hovered");
                }
            }
        }
        let link = this.getLinkRep(id);
        if (link) {
            let thtRepA = plexAnimator.thtReps.get(link.idA);
            let thtRepB = plexAnimator.thtReps.get(link.idB);
            if (thtRepA) {
                thtRepA.thtEl.classList.add("link-hovered");
            }
            if (thtRepB) {
                thtRepB.thtEl.classList.add("link-hovered");
            }
            let labelDiv = document.getElementById("lnk-" + link.id);
            if (labelDiv) {
                labelDiv.classList.add("link-hovered");
            }
        }
    }
    hoveredGateOrControlThtIdChanged(id, lastId, relation = Relation.Unknown, lastRelation = Relation.Unknown) {
        if (lastId) {
            let thtRep = plexAnimator.thtReps.get(lastId);
            if (thtRep) {
                thtRep.thtEl.classList.remove("gate-hovered");
            }
            if (lastRelation !== Relation.Unknown) {
                plexAnimator.linkReps.forEach(l => {
                    let connectedId;
                    if (l.idA == lastId && l.relation == lastRelation) {
                        connectedId = l.idB;
                    }
                    else if (l.idB == lastId && l.relation == this.getOppositeRelation(lastRelation)) {
                        connectedId = l.idA;
                    }
                    if (connectedId) {
                        let connectedRep = plexAnimator.thtReps.get(connectedId);
                        if (connectedRep) {
                            connectedRep.thtEl.classList.remove("link-hovered");
                        }
                    }
                });
            }
        }
        if (id) {
            let thtRep = plexAnimator.thtReps.get(id);
            if (thtRep) {
                thtRep.thtEl.classList.add("gate-hovered");
            }
            if (relation !== Relation.Unknown) {
                plexAnimator.linkReps.forEach(l => {
                    let connectedId;
                    if (l.idA == id && l.relation == relation) {
                        connectedId = l.idB;
                    }
                    else if (l.idB == id && l.relation == this.getOppositeRelation(relation)) {
                        connectedId = l.idA;
                    }
                    if (connectedId) {
                        let connectedRep = plexAnimator.thtReps.get(connectedId);
                        if (connectedRep) {
                            connectedRep.thtEl.classList.add("link-hovered");
                        }
                    }
                });
            }
        }
    }
    hoveredDecorationChanged(thtId, lastThtId, decorationId, lastDecorationId, decorationType, lastDecorationType) {
        if (this.hoveredNoteIndicatorTimeout) {
            clearTimeout(this.hoveredNoteIndicatorTimeout);
            this.hoveredNoteIndicatorTimeout = undefined;
        }
        const textHoverMode = plexAnimator.tagTextVisibilityMode === 'hover';
        const iconHoverMode = plexAnimator.tagIconVisibilityMode === 'hover';
        if (lastThtId && lastDecorationId) {
            this.expandedDecoration = undefined;
            const lastRep = plexAnimator.thtReps.get(lastThtId);
            if (lastRep) {
                if (lastRep.thtEl.dataset['decorationPriorZ'] !== undefined) {
                    lastRep.thtEl.style.zIndex = lastRep.thtEl.dataset['decorationPriorZ'];
                    delete lastRep.thtEl.dataset['decorationPriorZ'];
                }
                const thoughtNowHovered = this.hoveredThoughtId === lastThtId;
                const wrappers = lastRep.thtEl.querySelectorAll('.indicator-with-label');
                wrappers.forEach(w => {
                    const icon = w.querySelector('.indicator-icon');
                    if (icon && icon.dataset['indicatorId'] === lastDecorationId) {
                        w.style.zIndex = '';
                        if (thoughtNowHovered) {
                            return;
                        }
                        const label = w.querySelector('.indicator-label');
                        if (label) {
                            const originalText = label.dataset['originalText'];
                            const fullName = label.dataset['indicatorName'];
                            if (originalText !== undefined && originalText !== fullName) {
                                label.textContent = originalText;
                            }
                            if (textHoverMode) {
                                label.style.display = 'none';
                            }
                        }
                        if (textHoverMode) {
                            if (w.dataset && w.dataset['backColorCss']) {
                                w.style.backgroundColor = '';
                            }
                            if (w.dataset && w.dataset['foreColorCss']) {
                                w.style.color = '';
                            }
                            w.style.padding = '0';
                        }
                        if (iconHoverMode && icon.dataset['iconVisibility'] === 'hover') {
                            icon.style.display = 'none';
                        }
                    }
                });
            }
        }
        if (thtId && decorationId && !plexAnimator.isTouchDevice) {
            const rep = plexAnimator.thtReps.get(thtId);
            if (rep) {
                if (rep.thtEl.dataset['decorationPriorZ'] === undefined) {
                    rep.thtEl.dataset['decorationPriorZ'] = rep.thtEl.style.zIndex || '';
                }
                rep.thtEl.style.zIndex = '15';
                const wrappers = rep.thtEl.querySelectorAll('.indicator-with-label');
                wrappers.forEach(w => {
                    const icon = w.querySelector('.indicator-icon');
                    if (icon && icon.dataset['indicatorId'] === decorationId) {
                        this.expandedDecoration = {
                            decorationId: decorationId,
                            restRect: w.getBoundingClientRect(),
                            thtRect: rep.thtEl.getBoundingClientRect()
                        };
                        const label = w.querySelector('.indicator-label');
                        if (label) {
                            const originalText = label.dataset['originalText'];
                            const fullName = label.dataset['indicatorName'];
                            if (fullName !== undefined && originalText !== fullName) {
                                label.textContent = fullName;
                            }
                            if (textHoverMode) {
                                label.style.display = '';
                            }
                        }
                        if (textHoverMode) {
                            const ds = w.dataset || {};
                            if (ds['backColorCss']) {
                                w.style.backgroundColor = ds['backColorCss'];
                            }
                            if (ds['foreColorCss']) {
                                w.style.color = ds['foreColorCss'];
                            }
                            w.style.padding = '0.1em 0.45em';
                        }
                        if (iconHoverMode && icon.dataset['iconVisibility'] === 'hover') {
                            icon.style.display = '';
                        }
                        w.style.zIndex = '10';
                    }
                });
            }
        }
        if (thtId && decorationType === "note" && !plexAnimator.isTouchDevice) {
            this.hoveredNoteIndicatorTimeout = window.setTimeout(() => {
                safeInvoke(plexAnimator.dotNetHelper, "ShowNotesDialog", [thtId, true]);
            }, 500);
        }
    }
    getLinkRep(id) {
        if (!id) {
            return undefined;
        }
        return plexAnimator.linkReps.get(id);
    }
    isScrollbarInteracting() {
        let isInteracting = false;
        if (this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if (s != null) {
                    if (Scrollbar.stateByZone[s.zone].isHovered || Scrollbar.stateByZone[s.zone].isDragging) {
                        isInteracting = true;
                    }
                }
            });
        }
        return isInteracting;
    }
    getFieldPoint(event) {
        let rect = this.field.getBoundingClientRect();
        let p = new Point(event.clientX, event.clientY);
        p.x -= rect.x;
        p.y -= rect.y;
        return p;
    }
    getFieldPointFromPoint(point) {
        let rect = this.field.getBoundingClientRect();
        let p = new Point(point.x, point.y);
        p.x -= rect.x;
        p.y -= rect.y;
        return p;
    }
    isMainButton(event) {
        return event.pointerType !== "mouse" || event.button === 0;
    }
    drawSelectionRectangle(graphics) {
        if (!this.selectionRectStartPoint || !this.selectionRectEndPoint)
            return;
        let x = Math.min(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let y = Math.min(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let width = Math.abs(this.selectionRectEndPoint.x - this.selectionRectStartPoint.x);
        let height = Math.abs(this.selectionRectEndPoint.y - this.selectionRectStartPoint.y);
        const radiusScaleFactor = 0.2;
        let cornerRadius = Math.min(10, width * radiusScaleFactor, height * radiusScaleFactor);
        graphics.roundRect(x, y, width, height, cornerRadius)
            .fill({ color: plexAnimator.colors.thoughtActiveOutline, alpha: 0.2 })
            .stroke({ width: 2, color: plexAnimator.colors.thoughtActiveOutline, alpha: 1 });
    }
    updateSelectionRectangleHighlights() {
        if (!this.selectionRectStartPoint || !this.selectionRectEndPoint)
            return;
        let minX = Math.min(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let minY = Math.min(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let maxX = Math.max(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let maxY = Math.max(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let currentlyInRect = [];
        let thoughtElements = this.field.querySelectorAll('.tht.cur');
        thoughtElements.forEach((thtEl) => {
            let rect = DomUtils.getRect(thtEl, this.field);
            if (rect.x < maxX && rect.x + rect.width > minX &&
                rect.y < maxY && rect.y + rect.height > minY) {
                let thoughtId = thtEl.id.substring(4, 40);
                currentlyInRect.push(thoughtId);
            }
        });
        const baselineSelection = new Set(this.selectionRectInitialSelectedThoughtIds ? this.selectionRectInitialSelectedThoughtIds : this.selectedThoughtIds);
        const newHighlightedIds = new Set();
        const newDeselectionPreview = new Set();
        for (let thoughtId of currentlyInRect) {
            const element = document.getElementById(`tht-${thoughtId}-cur`);
            if (!element) {
                continue;
            }
            if (!baselineSelection.has(thoughtId)) {
                newHighlightedIds.add(thoughtId);
                if (!this.selectionRectHighlightedThoughts.has(thoughtId)) {
                    element.classList.add('selection-rect-highlight');
                }
            }
            else {
                newDeselectionPreview.add(thoughtId);
                if (!this.selectionRectDeselectionPreviewThoughts.has(thoughtId)) {
                    element.classList.remove('selection-rect-highlight');
                    element.classList.remove('thought-selected');
                    const hovered = document.getElementById(`tht-${thoughtId}-hovered`);
                    if (hovered) {
                        hovered.classList.remove('thought-selected');
                    }
                }
            }
        }
        for (let thoughtId of this.selectionRectHighlightedThoughts) {
            if (!newHighlightedIds.has(thoughtId)) {
                let element = document.getElementById(`tht-${thoughtId}-cur`);
                if (element) {
                    element.classList.remove('selection-rect-highlight');
                }
            }
        }
        for (let thoughtId of this.selectionRectDeselectionPreviewThoughts) {
            if (!newDeselectionPreview.has(thoughtId) && this.selectedThoughtIds.includes(thoughtId)) {
                let element = document.getElementById(`tht-${thoughtId}-cur`);
                if (element && !element.classList.contains('thought-selected')) {
                    element.classList.add('thought-selected');
                }
                let hovered = document.getElementById(`tht-${thoughtId}-hovered`);
                if (hovered && !hovered.classList.contains('thought-selected')) {
                    hovered.classList.add('thought-selected');
                }
            }
        }
        this.selectionRectHighlightedThoughts = newHighlightedIds;
        this.selectionRectDeselectionPreviewThoughts = newDeselectionPreview;
    }
    clearSelectionRectangleHighlights(restoreDeselectionPreview = true) {
        for (let thoughtId of this.selectionRectHighlightedThoughts) {
            let element = document.getElementById(`tht-${thoughtId}-cur`);
            if (element) {
                element.classList.remove('selection-rect-highlight');
            }
        }
        this.selectionRectHighlightedThoughts.clear();
        if (restoreDeselectionPreview) {
            for (let thoughtId of this.selectionRectDeselectionPreviewThoughts) {
                if (this.selectedThoughtIds.includes(thoughtId)) {
                    let element = document.getElementById(`tht-${thoughtId}-cur`);
                    if (element && !element.classList.contains('thought-selected')) {
                        element.classList.add('thought-selected');
                    }
                    let hovered = document.getElementById(`tht-${thoughtId}-hovered`);
                    if (hovered && !hovered.classList.contains('thought-selected')) {
                        hovered.classList.add('thought-selected');
                    }
                }
            }
        }
        this.selectionRectDeselectionPreviewThoughts.clear();
    }
    finalizeSelectionRectangle() {
        if (!this.selectionRectStartPoint || !this.selectionRectEndPoint)
            return;
        let minX = Math.min(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let minY = Math.min(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let maxX = Math.max(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let maxY = Math.max(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let selectedIds = [];
        let thoughtElements = this.field.querySelectorAll('.tht.cur');
        thoughtElements.forEach((thtEl) => {
            let rect = DomUtils.getRect(thtEl, this.field);
            if (rect.x < maxX && rect.x + rect.width > minX &&
                rect.y < maxY && rect.y + rect.height > minY) {
                let thoughtId = thtEl.id.substring(4, 40);
                selectedIds.push(thoughtId);
            }
        });
        const initialSelection = this.selectionRectInitialSelectedThoughtIds ? this.selectionRectInitialSelectedThoughtIds.slice() : this.selectedThoughtIds.slice();
        const rectSet = new Set(selectedIds);
        const initialSet = new Set(initialSelection);
        const newSelectedIds = [];
        for (const id of initialSelection) {
            if (!rectSet.has(id)) {
                newSelectedIds.push(id);
            }
        }
        for (const id of selectedIds) {
            if (!initialSet.has(id)) {
                newSelectedIds.push(id);
            }
        }
        this.selectedThoughtsChanging(true);
        this.selectedThoughtIds = newSelectedIds;
        this.selectedThoughtsChanging(false);
        this.selectionRectInitialSelectedThoughtIds = null;
    }
    couldTouchScrollbar(point) {
        let ret = false;
        if (this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if (s != null) {
                    if (s.isPointWithinScrollbar(point)) {
                        ret = true;
                        return;
                    }
                }
            });
        }
        return ret;
    }
    touch_isOverScrollbar(clientPoint) {
        let fieldRect = this.field.getBoundingClientRect();
        let point = new Point(clientPoint.x - fieldRect.x, clientPoint.y - fieldRect.y);
        if (this.couldTouchScrollbar(point)) {
            return true;
        }
        return false;
    }
    onTouchStart(event) {
        if (event.touches.length == 2) {
            const revealActive = window.__plexContentRevealActive;
            if (typeof revealActive === "function" && revealActive()) {
                return;
            }
            this.beginTwoFingerDrag(event);
            return;
        }
        if (event.touches.length != 1) {
            return;
        }
        let touchType = "touch";
        if (event.touches.item(0).touchType == "stylus") {
            touchType = "mouse";
        }
        this.touch_didPressAndHold = false;
        this.touch_hasDraggedTooFar = false;
        this.touch_shouldPassThroughToScrollPage = false;
        this.touch_lastSavedFakePointerEvent = this.newPointerEventFromTouchEvent(event.touches[0], 0, 0);
        this.touch_lastStartTime = new Date();
        this.touch_isDown = true;
        this.touch_isDraggingScrollbar = false;
        this.hasDragExceededClickDistance = false;
        let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);
        let isInteracting = this.checkForHover(clientPoint, touchType, true);
        let insideMargins = clientPoint.x > this.PLEX_EVENT_EDGE_MARGIN && clientPoint.x < this.field.clientWidth - this.PLEX_EVENT_EDGE_MARGIN;
        if (!isInteracting && (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) && insideMargins) {
            this.lastThoughtDragDelta = new Point(0, 0);
            this.setPressedObjectTypeBasedOnHoverState(this.touch_lastSavedFakePointerEvent);
            this.cancelHoldTimer();
            this.touch_holdTimeoutId = window.setTimeout(() => { this.checkHold(); }, this.HOLD_TIME_MS);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (this.touch_isOverScrollbar(clientPoint)) {
            this.touch_isDraggingScrollbar = true;
        }
        this.setPressedObjectTypeBasedOnHoverState(this.touch_lastSavedFakePointerEvent);
        if (this.pressedObjectType == PlexObjectType.Scrollbar) {
            this.touch_isDraggingScrollbar = true;
            this.touch_isDown = false;
            this.onPointerDown(this.touch_lastSavedFakePointerEvent);
            event.preventDefault();
            return;
        }
        if (this.pressedObjectType == PlexObjectType.Background) {
            this.touch_shouldPassThroughToScrollPage = true;
        }
        this.cancelHoldTimer();
        this.touch_holdTimeoutId = window.setTimeout(() => { this.checkHold(); }, this.HOLD_TIME_MS);
    }
    cancelHoldTimer() {
        if (this.touch_holdTimeoutId != null) {
            clearTimeout(this.touch_holdTimeoutId);
            this.touch_holdTimeoutId = null;
        }
    }
    touchesCenter(event) {
        let x = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        let y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        return new Point(x, y);
    }
    touchesDistance(event) {
        let dx = event.touches[0].clientX - event.touches[1].clientX;
        let dy = event.touches[0].clientY - event.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    isNormalLayout() {
        return plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne;
    }
    applyPinch(distance) {
        let info = this.touch_pinchInfo;
        if (info == null || this.touch_twoFingerStartDistance <= 0) {
            return;
        }
        let factor = distance / this.touch_twoFingerStartDistance;
        let minFactor = info.minPercent / info.baselinePercent;
        let maxFactor = info.maxPercent / info.baselinePercent;
        factor = Math.max(minFactor, Math.min(maxFactor, factor));
        this.touch_pinchLastFactor = factor;
        if (this.pinchCircleDynamic != null) {
            this.sizePinchCircle(this.pinchCircleDynamic, this.dynamicCircleRadius(info, factor));
        }
    }
    dynamicCircleRadius(info, factor) {
        let targetPercent = info.baselinePercent * factor;
        return this.pinchCircleBaseRadius * targetPercent / info.defaultPercent;
    }
    activeThoughtFieldCenter(fieldRect) {
        let activeId = plexAnimator.activeId;
        if (!activeId)
            return null;
        let el = document.getElementById("tht-" + activeId + "-cur");
        if (el == null)
            return null;
        let r = el.getBoundingClientRect();
        return new Point((r.left + r.width / 2) - fieldRect.left, (r.top + r.height / 2) - fieldRect.top);
    }
    ensurePinchCircles() {
        if (this.pinchCircleStatic != null && this.pinchCircleStatic.parentElement === this.field
            && this.pinchCircleDynamic != null && this.pinchCircleDynamic.parentElement === this.field) {
            return;
        }
        const make = (isReference) => {
            let el = document.createElement("div");
            el.className = "plex-pinch-circle";
            el.style.position = "absolute";
            el.style.borderRadius = "50%";
            el.style.pointerEvents = "none";
            el.style.boxSizing = "border-box";
            el.style.opacity = "0";
            el.style.transition = "opacity 150ms ease";
            el.style.zIndex = "40";
            if (isReference) {
                el.style.border = "2px solid rgba(255,255,255,0.85)";
                el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35)";
            }
            else {
                el.style.border = "3px solid rgba(255,255,255,0.97)";
                el.style.background = "rgba(255,255,255,0.10)";
                el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.45), 0 2px 14px rgba(0,0,0,0.35)";
            }
            this.field.appendChild(el);
            return el;
        };
        this.pinchCircleStatic = make(true);
        this.pinchCircleDynamic = make(false);
    }
    sizePinchCircle(el, radius) {
        let origin = this.touch_pinchOrigin;
        if (origin == null)
            return;
        el.style.width = (radius * 2) + "px";
        el.style.height = (radius * 2) + "px";
        el.style.left = (origin.x - radius) + "px";
        el.style.top = (origin.y - radius) + "px";
    }
    showPinchCircles() {
        var _a;
        this.ensurePinchCircles();
        let fieldRect = this.field.getBoundingClientRect();
        this.touch_pinchOrigin = (_a = this.activeThoughtFieldCenter(fieldRect)) !== null && _a !== void 0 ? _a : new Point(this.field.clientWidth / 2, this.field.clientHeight / 2);
        this.pinchCircleBaseRadius = Math.max(34, Math.min(90, this.field.clientHeight * 0.12));
        if (this.pinchCircleStatic != null) {
            this.sizePinchCircle(this.pinchCircleStatic, this.pinchCircleBaseRadius);
        }
        if (this.pinchCircleDynamic != null) {
            let info = this.touch_pinchInfo;
            let radius = info != null ? this.dynamicCircleRadius(info, 1) : this.pinchCircleBaseRadius;
            this.sizePinchCircle(this.pinchCircleDynamic, radius);
        }
        void this.field.offsetWidth;
        if (this.pinchCircleStatic != null)
            this.pinchCircleStatic.style.opacity = "1";
        if (this.pinchCircleDynamic != null)
            this.pinchCircleDynamic.style.opacity = "1";
    }
    hidePinchCircles() {
        if (this.pinchCircleStatic != null)
            this.pinchCircleStatic.style.opacity = "0";
        if (this.pinchCircleDynamic != null)
            this.pinchCircleDynamic.style.opacity = "0";
    }
    beginTwoFingerDrag(event) {
        this.cancelHoldTimer();
        this.touch_isDown = false;
        this.touch_didPressAndHold = false;
        this.touch_shouldPassThroughToScrollPage = false;
        this.touch_isDraggingScrollbar = false;
        this.lastThoughtDragDelta = null;
        this.touch_isTwoFingerDragging = true;
        this.touch_twoFingerMode = "undecided";
        let center = this.touchesCenter(event);
        this.touch_twoFingerStartCenter = center;
        this.touch_twoFingerLastCenter = center;
        this.touch_twoFingerStartDistance = this.touchesDistance(event);
        this.touch_pinchInfo = null;
        this.touch_pinchLastFactor = 1;
        safeInvokeAsync(plexAnimator.dotNetHelper, "BeginPlexPinch").then((info) => {
            if (info) {
                this.touch_pinchInfo = info;
            }
        });
        event.preventDefault();
        event.stopPropagation();
    }
    endTwoFingerDrag() {
        if (!this.touch_isTwoFingerDragging) {
            return;
        }
        let mode = this.touch_twoFingerMode;
        let info = this.touch_pinchInfo;
        let lastFactor = this.touch_pinchLastFactor;
        this.touch_isTwoFingerDragging = false;
        this.touch_twoFingerMode = "undecided";
        this.touch_twoFingerStartCenter = null;
        this.touch_twoFingerLastCenter = null;
        this.touch_twoFingerStartDistance = 0;
        this.touch_pinchInfo = null;
        this.touch_pinchLastFactor = 1;
        this.touch_pinchOrigin = null;
        if (mode == "pan" && this.isNormalLayout()) {
            plexAnimator.backgroundDragEnded();
            return;
        }
        if (mode == "pinch") {
            this.hidePinchCircles();
            let target = info != null ? this.pinchTargetPercentFor(info, lastFactor) : 0;
            if (info != null && target != info.baselinePercent) {
                safeInvoke(plexAnimator.dotNetHelper, "CommitPlexPinch", [target]);
            }
        }
    }
    pinchTargetPercentFor(info, factor) {
        let raw = Math.round((info.baselinePercent * factor - info.minPercent) / info.step);
        let percent = info.minPercent + raw * info.step;
        return Math.max(info.minPercent, Math.min(info.maxPercent, percent));
    }
    newPointerEventFromTouchEvent(t, deltaX, deltaY) {
        let ret = {};
        let fieldRect = this.field.getBoundingClientRect();
        let point = new Point(t.clientX - fieldRect.x, t.clientY - fieldRect.y);
        ret.clientX = t.clientX + deltaX;
        ret.clientY = t.clientY + deltaY;
        ret.offsetX = point.x + deltaX;
        ret.offsetY = point.y + deltaY;
        ret.pointerType = "fake";
        ret.button = 0;
        ret.pointerId = null;
        ret.preventDefault = () => { };
        return ret;
    }
    checkHold() {
        if (this.touch_isDown && !this.touch_hasDraggedTooFar) {
            this.touch_didPressAndHold = true;
            if (this.touch_lastSavedFakePointerEvent) {
                this.touch_shouldPassThroughToScrollPage = false;
                this.touch_lastSavedFakePointerEvent.button = 2;
                this.onContextMenu(this.touch_lastSavedFakePointerEvent);
            }
            this.checkForHover(new Point(-9999, -9999), "touch", true);
        }
    }
    onTouchMove(event) {
        if (event.touches.length < 1) {
            return;
        }
        if (this.touch_isTwoFingerDragging) {
            if (event.touches.length < 2 || this.touch_twoFingerLastCenter == null || this.touch_twoFingerStartCenter == null) {
                return;
            }
            event.preventDefault();
            let center = this.touchesCenter(event);
            let distance = this.touchesDistance(event);
            if (this.touch_twoFingerMode == "undecided") {
                let panTravel = Math.abs(center.y - this.touch_twoFingerStartCenter.y);
                let pinchTravel = this.touch_twoFingerStartDistance > this.TWO_FINGER_MIN_PINCH_DISTANCE
                    ? Math.abs(distance - this.touch_twoFingerStartDistance)
                    : 0;
                let canPan = this.isNormalLayout();
                if (pinchTravel > this.TWO_FINGER_DECIDE_PX && (!canPan || pinchTravel >= panTravel)) {
                    this.touch_twoFingerMode = "pinch";
                    this.showPinchCircles();
                }
                else if (canPan && panTravel > this.TWO_FINGER_DECIDE_PX) {
                    this.touch_twoFingerMode = "pan";
                }
                else {
                    this.touch_twoFingerLastCenter = center;
                    return;
                }
            }
            if (this.touch_twoFingerMode == "pan") {
                let delta = center.subtract(this.touch_twoFingerLastCenter);
                plexAnimator.backgroundDragged(delta, true);
            }
            else if (this.touch_twoFingerMode == "pinch") {
                this.applyPinch(distance);
            }
            this.touch_twoFingerLastCenter = center;
            return;
        }
        if (this.lastThoughtDragDelta != null && (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap)) {
            let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);
            let totalDelta = clientPoint.subtract(this.pointerDownPoint);
            if (this.lastThoughtDragDelta != null) {
                totalDelta = totalDelta.subtract(this.lastThoughtDragDelta);
            }
            plexAnimator.backgroundDragged(totalDelta, true);
            this.lastThoughtDragDelta = clientPoint.subtract(this.pointerDownPoint);
        }
        if (!this.touch_hasDraggedTooFar) {
            let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);
            let totalDelta = clientPoint.subtract(this.pointerDownPoint);
            let delta2 = totalDelta.x * totalDelta.x + totalDelta.y * totalDelta.y;
            this.touch_hasDraggedTooFar = delta2 > this.MAX_CLICK_DIST * this.MAX_CLICK_DIST;
        }
        if (!this.touch_isDraggingScrollbar && (this.touch_hasDraggedTooFar || this.touch_shouldPassThroughToScrollPage) && !this.touch_didPressAndHold) {
            return;
        }
        event.preventDefault();
        if (this.touch_isDraggingScrollbar) {
            this.touch_lastSavedFakePointerEvent = this.newPointerEventFromTouchEvent(event.touches[0], 0, 0);
            this.touch_lastSavedFakePointerEvent.isTouchDragging = true;
            this.onPointerMove(this.touch_lastSavedFakePointerEvent);
            return;
        }
    }
    onTouchEnd(event) {
        if (this.touch_isTwoFingerDragging) {
            event.preventDefault();
            if (event.touches.length === 0) {
                this.endTwoFingerDrag();
            }
            return;
        }
        this.lastThoughtDragDelta = null;
        this.touch_isDown = false;
        this.cancelHoldTimer();
        if (this.touch_shouldPassThroughToScrollPage) {
            return;
        }
        event.preventDefault();
        if (this.touch_didPressAndHold) {
            return;
        }
        if (this.touch_isDraggingScrollbar) {
            this.onPointerUp(this.touch_lastSavedFakePointerEvent);
            return;
        }
        if (!this.touch_hasDraggedTooFar) {
            this.onPointerDown(this.touch_lastSavedFakePointerEvent);
            this.onPointerUp(this.touch_lastSavedFakePointerEvent);
        }
    }
    onTouchCancel(event) {
        if (this.touch_isTwoFingerDragging) {
            event.preventDefault();
            this.endTwoFingerDrag();
            return;
        }
        this.touch_isDown = false;
        this.cancelHoldTimer();
        if (this.touch_shouldPassThroughToScrollPage) {
            return;
        }
        event.preventDefault();
        if (this.touch_isDraggingScrollbar) {
            this.onPointerUp(this.touch_lastSavedFakePointerEvent);
            return;
        }
    }
    onPointerDown(event) {
        event.preventDefault();
        this.animateBriefly();
        const downPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(downPoint, event.pointerType);
        this.selectionRectInitialSelectedThoughtIds = null;
        this.selectionRectDeselectionPreviewThoughts.clear();
        if (event.pointerType == "touch") {
            this.pointerDownPoint = downPoint;
            safeInvoke(plexAnimator.dotNetHelper, "ExitEditModeRequested");
            return;
        }
        if (event.pointerType === "mouse" && event.button === 1) {
            this.checkForHover(downPoint, event.pointerType, true);
            if (!this.hoveredThoughtId && !this.hoveredGateThtId && !this.hoveredThoughtIconId &&
                !this.hoveredLinkId && !this.hoveredDecorationThtId && !this.hoveredControlThtId) {
                safeInvoke(plexAnimator.dotNetHelper, "OnPlexBackgroundMiddleClick");
            }
            return;
        }
        this.pointerDownIsPrimary = this.isMainButton(event);
        if (this.pointerDownIsPrimary) {
            safeInvoke(plexAnimator.dotNetHelper, "ExitEditModeRequested");
        }
        if (this.scrollbars != null && this.pointerDownIsPrimary) {
            this.scrollbars.forEach((s) => {
                if (s != null) {
                    s.onPointerDown(event);
                }
            });
        }
        this.checkForHover(downPoint, event.pointerType, true);
        this.pointerDownPoint = downPoint;
        this.lastDragPoint = new Point(event.clientX, event.clientY);
        this.hasDragExceededClickDistance = false;
        if (this.isHoldingMultiSelectKeyModifier(event) && !plexAnimator.isReadOnly && !this.hoveredThoughtId && !this.hoveredGateThtId &&
            !this.hoveredThoughtIconId && !this.hoveredLinkId && !this.hoveredDecorationThtId && !this.hoveredControlThtId) {
            this.isDrawingSelectionRect = true;
            let fieldPoint = this.getFieldPoint(event);
            this.selectionRectStartPoint = fieldPoint;
            this.selectionRectEndPoint = fieldPoint;
            this.selectionRectInitialSelectedThoughtIds = this.selectedThoughtIds.slice();
            this.selectionRectDeselectionPreviewThoughts.clear();
            this.pressedObjectType = PlexObjectType.Background;
        }
        else {
            this.setPressedObjectTypeBasedOnHoverState(event);
        }
        if (event.pointerId) {
            this.field.setPointerCapture(event.pointerId);
        }
    }
    setPressedObjectTypeBasedOnHoverState(event) {
        const isTouch = event.pointerType === "fake";
        const treatAsScrollbar = isTouch
            ? this.touch_isDraggingScrollbar
            : (this.isScrollbarInteracting() || this.touch_isDraggingScrollbar);
        if (treatAsScrollbar) {
            this.pressedObjectType = PlexObjectType.Scrollbar;
        }
        else if (this.hoveredThoughtId && !this.hoveredGateThtId) {
            this.pressedObjectType = PlexObjectType.Thought;
            plexAnimator.forceLayout.nodePressed(this.hoveredThoughtId);
            if (this.supportsZoneDrag() && this.hoveredThoughtId != plexAnimator.activeId && this.isDraggableThought(this.hoveredThoughtId)) {
                this.draggedThoughtId = this.hoveredThoughtId;
                const rep = plexAnimator.thtReps.get(this.draggedThoughtId);
                if (rep) {
                    const left = parseInt(rep.thtEl.style.left || '0');
                    const top = parseInt(rep.thtEl.style.top || '0');
                    this.draggedThoughtOriginalLeft = isNaN(left) ? 0 : left;
                    this.draggedThoughtOriginalTop = isNaN(top) ? 0 : top;
                }
                this.draggedThoughtSourceZone = this.getZoneForThoughtElement(this.draggedThoughtId);
                if (this.draggedThoughtSourceZone === "sibling") {
                    this.hasLeftSourceZone = true;
                }
                else if (this.draggedThoughtSourceZone) {
                    this.captureZoneDragSlots(this.draggedThoughtSourceZone, this.draggedThoughtId);
                }
            }
            else if (!this.supportsZoneDrag()) {
                this.draggedThoughtId = this.hoveredThoughtId;
            }
        }
        else if (this.hoveredGateThtId) {
            this.pressedObjectType = PlexObjectType.ThoughtGate;
            if (this.isMainButton(event)) {
                this.gateDragDestPoint = this.getFieldPoint(event);
                this.gateDragSourceChildSide = this.hoveredGateChildSide;
            }
            else {
                this.gateDragDestPoint = undefined;
            }
            if (this.hoveredThoughtId) {
                const lastId = this.hoveredThoughtId;
                this.hoveredThoughtId = undefined;
                this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastId);
            }
        }
        else if (this.hoveredThoughtIconId) {
            this.pressedObjectType = PlexObjectType.ThoughtIcon;
        }
        else if (this.hoveredLinkId) {
            this.pressedObjectType = PlexObjectType.Link;
        }
        else if (this.hoveredDecorationThtId) {
            this.pressedObjectType = PlexObjectType.ThoughtDecorator;
        }
        else if (this.hoveredControlThtId) {
            this.pressedObjectType = PlexObjectType.ThoughtControl;
        }
        else {
            this.pressedObjectType = PlexObjectType.Background;
        }
    }
    onPointerLeave(event) {
        ["parent", "child", "sibling", "jump"].forEach((s) => {
            Scrollbar.stateByZone[s].isHovered = false;
        });
        if (this.pressedObjectType == PlexObjectType.Nothing) {
            this.checkForHover(new Point(-99999, -99999), "mouse", true);
        }
    }
    async flushContentEditableBlur() {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
            activeElement.blur();
            await contentEditableFieldHelper.waitForPendingBlur();
        }
    }
    async activateThought(thtId) {
        plexAnimator.lastActivateClickTime = performance.now();
        await this.flushContentEditableBlur();
        safeInvoke(plexAnimator.dotNetHelper, "ActivateThought", [thtId]);
        if (this.selectedLinkIds.size > 0) {
            this.clearSelectedLinks(false);
        }
    }
    clearSelectedLinks(navigateToLink) {
        this.willChangeSelectedLinks();
        this.selectedLinkIds.clear();
        this.didChangeSelectedLinks(navigateToLink);
    }
    isHoldingMultiSelectKeyModifier(event) {
        return navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;
    }
    onPointerUp(event) {
        const upPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(upPoint, event.pointerType);
        if (event.pointerType == "touch") {
            return;
        }
        if (this.pointerDownIsPrimary) {
            if (this.isDrawingSelectionRect && this.selectionRectStartPoint && this.selectionRectEndPoint) {
                this.finalizeSelectionRectangle();
                this.clearSelectionRectangleHighlights(false);
                this.isDrawingSelectionRect = false;
                this.selectionRectStartPoint = undefined;
                this.selectionRectEndPoint = undefined;
                this.selectionRectInitialSelectedThoughtIds = null;
                this.renderNow = true;
                this.animateBriefly();
                this.pressedObjectType = PlexObjectType.Nothing;
                return;
            }
            if (this.scrollbars != null) {
                this.scrollbars.forEach((s) => {
                    if (s != null) {
                        s.onPointerUp(event);
                    }
                });
            }
            if (this.pressedObjectType == PlexObjectType.Thought) {
                plexAnimator.forceLayout.nodeReleased(this.hoveredThoughtId);
                let thoughtResult = this.findThoughtAt(upPoint, event.pointerType);
                if (thoughtResult && thoughtResult[0] === this.hoveredThoughtId && !this.hasDragExceededClickDistance) {
                    if (event.altKey) {
                        safeInvoke(plexAnimator.dotNetHelper, "ShowThoughtProperties", [this.hoveredThoughtId]);
                    }
                    else if (!this.isHoldingMultiSelectKeyModifier(event)) {
                        this.activateThought(this.hoveredThoughtId);
                    }
                    else if (!plexAnimator.isReadOnly) {
                        this.selectedThoughtsChanging(true);
                        let index = this.selectedThoughtIds.indexOf(this.hoveredThoughtId);
                        if (index != -1) {
                            this.selectedThoughtIds.splice(index, 1);
                        }
                        else {
                            this.selectedThoughtIds.push(this.hoveredThoughtId);
                        }
                        this.selectedThoughtsChanging(false);
                    }
                }
                if (this.supportsZoneDrag() && this.hasDragExceededClickDistance && this.draggedThoughtId && this.currentDropZone && !plexAnimator.isReadOnly && this.draggedThoughtId != plexAnimator.activeId) {
                    const dropZone = this.currentDropZone;
                    const isSameZone = this.currentDropZone === this.draggedThoughtSourceZone;
                    if (this.hasLeftSourceZone && isSameZone) {
                        this.cleanupZoneDrag();
                        this.resetDraggedThoughtToOriginal();
                        this.draggedThoughtId = undefined;
                        this.setZoneHovered(dropZone, false);
                        this.currentDropZone = null;
                        this.draggedThoughtOriginalLeft = null;
                        this.draggedThoughtOriginalTop = null;
                        this.draggedThoughtSourceZone = null;
                        this.hasLeftSourceZone = false;
                    }
                    else {
                        const dropIndex = (isSameZone && !this.hasLeftSourceZone)
                            ? (this.zoneDragCurrentDropIndex >= 0
                                ? this.zoneDragCurrentDropIndex
                                : this.computeDropIndex(this.currentDropZone, upPoint, this.draggedThoughtId))
                            : -1;
                        this.cleanupZoneDrag();
                        const outlineGroup = plexAnimator.layout == LayoutType.Outline && this.draggedThoughtId
                            ? this.outlineGroupOf.get(this.draggedThoughtId) : null;
                        const isOutlineReorder = outlineGroup != null
                            && isSameZone && !this.hasLeftSourceZone && dropIndex >= 0;
                        if (isOutlineReorder) {
                            safeInvokeAsync(plexAnimator.dotNetHelper, "OnThoughtReorderedInOutline", [this.draggedThoughtId, outlineGroup.parentId, outlineGroup.relationType, dropIndex])
                                .then((success) => {
                                if (!success) {
                                    this.resetDraggedThoughtToOriginal();
                                }
                                this.draggedThoughtId = undefined;
                                this.currentDropZone = null;
                                this.draggedThoughtOriginalLeft = null;
                                this.draggedThoughtOriginalTop = null;
                                this.draggedThoughtSourceZone = null;
                                this.hasLeftSourceZone = false;
                            });
                        }
                        else {
                            console.log(`OnThoughtDroppedInZone: zone=${this.currentDropZone}, sourceZone=${this.draggedThoughtSourceZone}, isSameZone=${isSameZone}, dropIndex=${dropIndex}`);
                            safeInvokeAsync(plexAnimator.dotNetHelper, "OnThoughtDroppedInZone", [this.draggedThoughtId, this.currentDropZone, this.draggedThoughtSourceZone, dropIndex])
                                .then((success) => {
                                if (!success) {
                                    this.resetDraggedThoughtToOriginal();
                                }
                                this.draggedThoughtId = undefined;
                                this.setZoneHovered(dropZone, false);
                                this.currentDropZone = null;
                                this.draggedThoughtOriginalLeft = null;
                                this.draggedThoughtOriginalTop = null;
                                this.draggedThoughtSourceZone = null;
                                this.hasLeftSourceZone = false;
                            });
                        }
                    }
                }
                else {
                    if (this.supportsZoneDrag() && this.hasDragExceededClickDistance && this.draggedThoughtId) {
                        this.cleanupZoneDrag();
                        const invalid = plexAnimator.isReadOnly || this.draggedThoughtOriginalLeft == null || this.draggedThoughtOriginalTop == null || this.draggedThoughtId == plexAnimator.activeId;
                        const zoneUnder = this.getZoneUnderClientPoint(upPoint);
                        if (invalid || !zoneUnder) {
                            this.resetDraggedThoughtToOriginal();
                        }
                    }
                    this.draggedThoughtId = undefined;
                    this.setZoneHovered(this.currentDropZone, false);
                    this.currentDropZone = null;
                    this.draggedThoughtOriginalLeft = null;
                    this.draggedThoughtOriginalTop = null;
                    this.draggedThoughtSourceZone = null;
                    this.hasLeftSourceZone = false;
                }
            }
            else if (this.pressedObjectType == PlexObjectType.ThoughtIcon) {
                safeInvoke(plexAnimator.dotNetHelper, "OpenThoughtAttachment", [this.hoveredThoughtIconId, upPoint.x, upPoint.y]);
            }
            else if (this.pressedObjectType == PlexObjectType.ThoughtGate) {
                if (this.isListGateDragActive) {
                    this.isListGateDragActive = false;
                    this.listGateDragSourceRep = undefined;
                    this.gateDragSourceChildSide = undefined;
                    this.pressedObjectType = PlexObjectType.Nothing;
                    return;
                }
                if (this.hoveredGateThtId == this.gateDragDestThtId && !this.hasDragExceededClickDistance) {
                    if (!this.isHoldingMultiSelectKeyModifier(event)) {
                        this.activateThought(this.hoveredGateThtId);
                    }
                    else if (!plexAnimator.isReadOnly) {
                        this.selectedThoughtsChanging(true);
                        let thtIds = new Set();
                        plexAnimator.linkReps.forEach(l => {
                            if (l.idA == this.hoveredGateThtId && l.relation == this.hoveredGateRelation) {
                                thtIds.add(l.idB);
                            }
                            else if (l.idB == this.hoveredGateThtId && l.relation == this.getOppositeRelation(this.hoveredGateRelation)) {
                                thtIds.add(l.idA);
                            }
                        });
                        if ([...this.selectedThoughtIds].some(val => thtIds.has(val))) {
                            for (const id of thtIds) {
                                let index = this.selectedThoughtIds.indexOf(id);
                                if (index != -1) {
                                    this.selectedThoughtIds.splice(index, 1);
                                }
                            }
                        }
                        else {
                            for (const id of thtIds) {
                                this.selectedThoughtIds.push(id);
                            }
                        }
                        this.selectedThoughtsChanging(false);
                    }
                }
                else {
                    if (this.gateDragDestThtId == null && this.hoveredGateThtId && this.gateDragDestPoint) {
                        this.linkPreviewPinned = true;
                        this.pinnedLinkSrcThtId = this.hoveredGateThtId;
                        this.pinnedLinkSrcRelation = this.hoveredGateRelation;
                        this.pinnedLinkSrcChildSide = this.gateDragSourceChildSide;
                        this.pinnedLinkDestPoint = new Point(this.gateDragDestPoint.x, this.gateDragDestPoint.y);
                    }
                    safeInvoke(plexAnimator.dotNetHelper, "LinkThoughts", [this.hoveredGateThtId, this.gateDragDestThtId, this.hoveredGateRelation, event.shiftKey, event.clientX, event.clientY]);
                }
            }
            else if (this.pressedObjectType == PlexObjectType.Link && this.hoveredLinkId) {
                if (event.altKey) {
                    safeInvoke(plexAnimator.dotNetHelper, "ShowLinkProperties", [this.hoveredLinkId]);
                }
                else {
                    this.willChangeSelectedLinks();
                    if (!this.isHoldingMultiSelectKeyModifier(event)) {
                        this.selectedLinkIds.clear();
                    }
                    if (this.selectedLinkIds.has(this.hoveredLinkId)) {
                        this.selectedLinkIds.delete(this.hoveredLinkId);
                    }
                    else {
                        this.selectedLinkIds.add(this.hoveredLinkId);
                    }
                    this.didChangeSelectedLinks(true);
                }
            }
            else if (this.pressedObjectType == PlexObjectType.ThoughtDecorator && !this.hasDragExceededClickDistance) {
                if (plexAnimator.isTouchDevice) {
                    if (this.hoveredDecorationThtId) {
                        this.activateThought(this.hoveredDecorationThtId);
                    }
                }
                else if (this.hoveredDecorationType === "note" && this.hoveredDecorationThtId) {
                    safeInvoke(plexAnimator.dotNetHelper, "ShowNotesDialog", [this.hoveredDecorationThtId, false]);
                }
                else if (this.hoveredDecorationType === "tag") {
                    this.activateThought(this.hoveredDecorationId);
                }
            }
            else if (this.pressedObjectType == PlexObjectType.ThoughtControl && !this.hasDragExceededClickDistance && this.hoveredControlThtId) {
                let thtRep = plexAnimator.thtReps.get(this.hoveredControlThtId);
                switch (this.hoveredControl) {
                    case ThoughtControl.Expand:
                        if (thtRep && plexAnimator.canExpand(thtRep)) {
                            safeInvoke(plexAnimator.dotNetHelper, "ExpandThought", [this.hoveredControlThtId]);
                        }
                        break;
                    case ThoughtControl.Collapse:
                        if (plexAnimator.layout == LayoutType.Force) {
                            plexAnimator.collapseThought(this.hoveredControlThtId);
                        }
                        if (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
                            safeInvoke(plexAnimator.dotNetHelper, "CollapseThought", [this.hoveredControlThtId]);
                        }
                        break;
                    case ThoughtControl.Anchor:
                        plexAnimator.forceLayout.toggleNodeIsAnchored(this.hoveredControlThtId);
                        break;
                    case ThoughtControl.Chevron:
                        if (thtRep && plexAnimator.canExpand(thtRep)) {
                            safeInvoke(plexAnimator.dotNetHelper, "ExpandThought", [this.hoveredControlThtId]);
                        }
                        else {
                            safeInvoke(plexAnimator.dotNetHelper, "CollapseThought", [this.hoveredControlThtId]);
                        }
                        break;
                }
            }
            else if (this.pressedObjectType == PlexObjectType.Background) {
                if ((plexAnimator.layout == LayoutType.Mindmap || plexAnimator.layout == LayoutType.Outline) && !this.hasDragExceededClickDistance && plexAnimator.focusedId != plexAnimator.activeId) {
                    safeInvoke(plexAnimator.dotNetHelper, "ActivateThought", [plexAnimator.activeId, false]);
                }
                else if ((plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne) && this.hasDragExceededClickDistance) {
                    plexAnimator.backgroundDragEnded();
                }
                if (this.selectedLinkIds.size > 0 && !this.hasDragExceededClickDistance) {
                    this.clearSelectedLinks(true);
                }
                if (!this.hasDragExceededClickDistance) {
                    const now = Date.now();
                    if (now - this.lastBackgroundClickTime <= this.DOUBLE_CLICK_THRESHOLD_MS) {
                        this.lastBackgroundClickTime = 0;
                        safeInvoke(plexAnimator.dotNetHelper, "OnPlexBackgroundDoubleClick");
                    }
                    else {
                        this.lastBackgroundClickTime = now;
                    }
                }
            }
            else if (this.pressedObjectType == PlexObjectType.Scrollbar) {
                if (this.scrollbars != null) {
                    this.scrollbars.forEach((s) => {
                        if (s != null) {
                            s.onPointerUp(event);
                        }
                    });
                }
            }
            this.pointerDownIsPrimary = false;
        }
        setTimeout(() => {
            this.pressedObjectType = PlexObjectType.Nothing;
        }, 5);
        this.checkForHover(upPoint, event.pointerType, true);
        if (event.pointerId) {
            this.field.releasePointerCapture(event.pointerId);
        }
    }
    isOutlineOrMindmap() {
        return plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap;
    }
    supportsZoneDrag() {
        return plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne || this.isOutlineOrMindmap();
    }
    getZoneUnderClientPoint(clientPoint) {
        if (this.isOutlineOrMindmap()) {
            const fieldRect = this.field.getBoundingClientRect();
            if (clientPoint.x >= fieldRect.left && clientPoint.x <= fieldRect.right && clientPoint.y >= fieldRect.top && clientPoint.y <= fieldRect.bottom) {
                return "child";
            }
            return null;
        }
        const zones = ["parent", "child", "jump", "sibling"];
        for (const z of zones) {
            const el = document.querySelector(`.zone-div.zone-${z}`);
            if (!el)
                continue;
            const rect = el.getBoundingClientRect();
            if (clientPoint.x >= rect.left && clientPoint.x <= rect.right && clientPoint.y >= rect.top && clientPoint.y <= rect.bottom) {
                return z;
            }
        }
        return null;
    }
    isDraggableThought(thtId) {
        if (!this.isOutlineOrMindmap() && plexAnimator.layout != LayoutType.NormalPlusOne)
            return true;
        for (const id of this.gridPositionToThoughtId.values()) {
            if (id === thtId)
                return true;
        }
        return false;
    }
    getZoneForThoughtElement(thtId) {
        const rep = plexAnimator.thtReps.get(thtId);
        if (!rep)
            return null;
        if (thtId === plexAnimator.activeId)
            return "active";
        if (plexAnimator.layout == LayoutType.Outline) {
            const group = this.outlineGroupOf.get(thtId);
            if (group)
                return `${group.parentId}-${group.relationType}`;
        }
        if (this.isOutlineOrMindmap() && rep.zone) {
            return rep.zone;
        }
        const rect = rep.thtEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const zones = ["parent", "child", "jump", "sibling"];
        for (const z of zones) {
            const el = document.querySelector(`.zone-div.zone-${z}`);
            if (!el)
                continue;
            const zoneRect = el.getBoundingClientRect();
            if (centerX >= zoneRect.left && centerX <= zoneRect.right &&
                centerY >= zoneRect.top && centerY <= zoneRect.bottom) {
                return z;
            }
        }
        return null;
    }
    computeDropIndex(zone, clientPoint, draggedId) {
        const slots = this.zoneDragSlots;
        if (slots.length === 0)
            return 0;
        const fieldRect = this.field.getBoundingClientRect();
        const maxCol = slots.reduce((max, s) => Math.max(max, s.col), 0);
        const isSingleColumn = maxCol === 0;
        const slotCenterY = (i) => slots[i].y + slots[i].h / 2 + fieldRect.top;
        const transitionY = (i) => {
            const sameCol = slots[i].col;
            for (let j = i + 1; j < slots.length; j++) {
                if (slots[j].col === sameCol) {
                    return (slotCenterY(i) + slotCenterY(j)) / 2;
                }
            }
            return slotCenterY(i) + slots[i].h / 2;
        };
        if (isSingleColumn) {
            for (let i = 0; i < slots.length; i++) {
                if (clientPoint.y < transitionY(i))
                    return i;
            }
            return slots.length;
        }
        const colCenters = [];
        for (let c = 0; c <= maxCol; c++) {
            const inCol = slots.filter(s => s.col === c);
            if (inCol.length === 0)
                continue;
            colCenters[c] = inCol.reduce((s, t) => s + t.x, 0) / inCol.length;
        }
        const colSplits = [];
        for (let c = 0; c < maxCol; c++) {
            const a = colCenters[c];
            const b = colCenters[c + 1];
            if (a !== undefined && b !== undefined) {
                colSplits[c] = (a + b) / 2;
            }
        }
        const xRel = clientPoint.x - fieldRect.left;
        let pointerCol = maxCol;
        for (let c = 0; c < colSplits.length; c++) {
            if (xRel < colSplits[c]) {
                pointerCol = c;
                break;
            }
        }
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (pointerCol < s.col || (pointerCol === s.col && clientPoint.y < transitionY(i))) {
                return i;
            }
        }
        return slots.length;
    }
    static toCssRgba(num, alpha) {
        num >>>= 0;
        const b = num & 0xFF;
        const g = (num >>> 8) & 0xFF;
        const r = (num >>> 16) & 0xFF;
        const a = Math.max(0, Math.min(1, alpha));
        return `rgba(${r},${g},${b},${a})`;
    }
    computeLeftForSlot(slot, elWidth, alignment) {
        switch (alignment) {
            case ThoughtHorizontalAlignment.Left:
                return slot.x - slot.w / 2;
            case ThoughtHorizontalAlignment.Right:
                return slot.x + slot.w / 2 - elWidth;
            default:
                return slot.x - elWidth / 2;
        }
    }
    captureZoneDragSlots(zone, draggedId) {
        var _a, _b, _c, _d, _e;
        this.zoneDragSlots = [];
        this.zoneDragThoughtOrder = [];
        this.zoneDragOriginalIndex = -1;
        this.zoneDragOriginalHeightByThought = new Map();
        this.zoneDragOriginalStrideByThought = new Map();
        this.zoneDragReverseDeltaYByThought = new Map();
        this.zoneDragColumnStartY = new Map();
        const entries = [];
        let maxRow = 0;
        const zonePrefix = zone + "-";
        this.gridPositionToThoughtId.forEach((id, key) => {
            if (!key.startsWith(zonePrefix))
                return;
            const suffix = key.substring(zonePrefix.length);
            const suffixParts = suffix.split("-");
            const row = suffixParts.length > 1 ? parseInt(suffixParts[1]) : parseInt(suffixParts[0]);
            if (row > maxRow)
                maxRow = row;
        });
        const rowCount = maxRow + 1;
        this.gridPositionToThoughtId.forEach((id, key) => {
            if (!key.startsWith(zonePrefix))
                return;
            const suffix = key.substring(zonePrefix.length);
            const suffixParts = suffix.split("-");
            const col = suffixParts.length > 1 ? parseInt(suffixParts[0]) : 0;
            const row = suffixParts.length > 1 ? parseInt(suffixParts[1]) : parseInt(suffixParts[0]);
            entries.push({ id, col, linearIndex: col * rowCount + row });
        });
        entries.sort((a, b) => a.linearIndex - b.linearIndex);
        const fieldRect = this.field.getBoundingClientRect();
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const rep = plexAnimator.thtReps.get(entry.id);
            if (!rep)
                continue;
            const rect = rep.thtEl.getBoundingClientRect();
            const slotY = rect.top - fieldRect.top;
            this.zoneDragSlots.push({
                x: (rect.left + rect.width / 2) - fieldRect.left,
                y: slotY,
                w: rect.width,
                h: rect.height,
                col: entry.col,
                alignment: rep.alignment
            });
            if (entry.id === draggedId) {
                this.zoneDragOriginalIndex = this.zoneDragSlots.length - 1;
            }
            else {
                this.zoneDragThoughtOrder.push(entry.id);
                this.zoneDragOriginalHeightByThought.set(entry.id, rect.height);
            }
        }
        const isMindmap = plexAnimator.layout === LayoutType.Mindmap;
        const useReverseDelta = isMindmap && zone === "child";
        const layoutHeightMap = useReverseDelta ? plexAnimator.mindmapLayout.heightMap : null;
        const layoutActualHeightMap = useReverseDelta ? plexAnimator.mindmapLayout.actualHeightMap : null;
        const computeReverseDeltaY = (id) => {
            var _a;
            if (!layoutHeightMap || !layoutActualHeightMap)
                return 0;
            const ah = layoutActualHeightMap.get(id);
            if (ah === undefined)
                return 0;
            const hm = (_a = layoutHeightMap.get(id)) !== null && _a !== void 0 ? _a : 0;
            return hm > ah ? (hm - ah) / 2 : 0;
        };
        for (let i = 0; i < entries.length; i++) {
            this.zoneDragReverseDeltaYByThought.set(entries[i].id, computeReverseDeltaY(entries[i].id));
        }
        for (let i = 0; i < entries.length; i++) {
            const col = entries[i].col;
            if (!this.zoneDragColumnStartY.has(col)) {
                const reverse = (_a = this.zoneDragReverseDeltaYByThought.get(entries[i].id)) !== null && _a !== void 0 ? _a : 0;
                this.zoneDragColumnStartY.set(col, this.zoneDragSlots[i].y - reverse);
            }
        }
        const useSubtreeHeightForLastInCol = useReverseDelta;
        for (let i = 0; i < entries.length; i++) {
            const slot = this.zoneDragSlots[i];
            const next = this.zoneDragSlots[i + 1];
            let stride;
            if (next && next.col === slot.col) {
                const rdThis = (_b = this.zoneDragReverseDeltaYByThought.get(entries[i].id)) !== null && _b !== void 0 ? _b : 0;
                const rdNext = (_c = this.zoneDragReverseDeltaYByThought.get(entries[i + 1].id)) !== null && _c !== void 0 ? _c : 0;
                stride = (next.y - slot.y) - (rdNext - rdThis);
            }
            else if (useSubtreeHeightForLastInCol) {
                const mapped = layoutHeightMap === null || layoutHeightMap === void 0 ? void 0 : layoutHeightMap.get(entries[i].id);
                stride = (mapped !== undefined && mapped > slot.h) ? mapped : slot.h;
            }
            else {
                let mirrored;
                for (let j = i - 1; j >= 0; j--) {
                    if (this.zoneDragSlots[j].col === slot.col) {
                        const rdPrev = (_d = this.zoneDragReverseDeltaYByThought.get(entries[j].id)) !== null && _d !== void 0 ? _d : 0;
                        const rdThis = (_e = this.zoneDragReverseDeltaYByThought.get(entries[i].id)) !== null && _e !== void 0 ? _e : 0;
                        mirrored = (slot.y - this.zoneDragSlots[j].y) - (rdThis - rdPrev);
                        break;
                    }
                }
                stride = mirrored !== null && mirrored !== void 0 ? mirrored : slot.h;
            }
            this.zoneDragOriginalStrideByThought.set(entries[i].id, stride);
        }
    }
    createZonePlaceholder(width, height) {
        var _a, _b;
        const color = (_b = (_a = plexAnimator.colors) === null || _a === void 0 ? void 0 : _a.thoughtHighlightOutline) !== null && _b !== void 0 ? _b : 0xffffff;
        const borderColor = PlexCanvas.toCssRgba(color, 1.0);
        const bgColor = PlexCanvas.toCssRgba(color, 0.15);
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.backgroundColor = bgColor;
        el.style.border = `2px dashed ${borderColor}`;
        el.style.borderRadius = '8px';
        el.style.boxSizing = 'border-box';
        el.style.pointerEvents = 'none';
        return el;
    }
    updateZoneDragLayout(newDropIndex) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (newDropIndex === this.zoneDragCurrentDropIndex)
            return;
        if (!this.zoneDragPlaceholder || this.zoneDragSlots.length === 0)
            return;
        const thoughts = this.zoneDragThoughtOrder;
        const slots = this.zoneDragSlots;
        if (newDropIndex < 0)
            newDropIndex = 0;
        if (newDropIndex >= slots.length)
            newDropIndex = slots.length - 1;
        const firstRects = new Map();
        for (const id of thoughts) {
            const rep = plexAnimator.thtReps.get(id);
            if (rep)
                firstRects.set(id, rep.thtEl.getBoundingClientRect());
        }
        const placeholderSlot = slots[newDropIndex];
        const phWidth = parseFloat(this.zoneDragPlaceholder.style.width) || placeholderSlot.w;
        const phHeight = parseFloat(this.zoneDragPlaceholder.style.height) || placeholderSlot.h;
        const minStride = plexAnimator.getRowHeightWithSpacing();
        const draggedId = (_a = this.draggedThoughtId) !== null && _a !== void 0 ? _a : '';
        const phStride = Math.max((_b = this.zoneDragOriginalStrideByThought.get(draggedId)) !== null && _b !== void 0 ? _b : phHeight, phHeight, minStride);
        for (const id of thoughts) {
            const rep = plexAnimator.thtReps.get(id);
            if (rep) {
                rep.thtEl.style.transition = 'none';
                rep.thtEl.style.transform = '';
            }
        }
        const phReverseDelta = (_c = this.zoneDragReverseDeltaYByThought.get(draggedId)) !== null && _c !== void 0 ? _c : 0;
        let cursorY = 0;
        let cursorCol = null;
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (slot.col !== cursorCol) {
                cursorCol = slot.col;
                cursorY = (_d = this.zoneDragColumnStartY.get(slot.col)) !== null && _d !== void 0 ? _d : slot.y;
            }
            if (i === newDropIndex) {
                this.zoneDragPlaceholder.style.left = this.computeLeftForSlot(slot, phWidth, slot.alignment) + 'px';
                this.zoneDragPlaceholder.style.top = (cursorY + phReverseDelta) + 'px';
                cursorY += phStride;
                continue;
            }
            const thtIdx = i > newDropIndex ? i - 1 : i;
            const thtId = thoughts[thtIdx];
            if (thtId === undefined)
                continue;
            const rep = plexAnimator.thtReps.get(thtId);
            const sibReverseDelta = (_e = this.zoneDragReverseDeltaYByThought.get(thtId)) !== null && _e !== void 0 ? _e : 0;
            if (rep) {
                const thtWidth = rep.thtEl.offsetWidth;
                rep.thtEl.style.left = this.computeLeftForSlot(slot, thtWidth, slot.alignment) + 'px';
                rep.thtEl.style.top = (cursorY + sibReverseDelta) + 'px';
            }
            const siblingH = (_f = this.zoneDragOriginalHeightByThought.get(thtId)) !== null && _f !== void 0 ? _f : slot.h;
            const siblingStride = (_g = this.zoneDragOriginalStrideByThought.get(thtId)) !== null && _g !== void 0 ? _g : siblingH;
            cursorY += Math.max(siblingStride, siblingH, minStride);
        }
        for (const id of thoughts) {
            const first = firstRects.get(id);
            if (!first)
                continue;
            const rep = plexAnimator.thtReps.get(id);
            if (!rep)
                continue;
            const last = rep.thtEl.getBoundingClientRect();
            const deltaX = first.left - last.left;
            const deltaY = first.top - last.top;
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1)
                continue;
            rep.thtEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            rep.thtEl.offsetHeight;
            rep.thtEl.style.transition = `transform ${PlexCanvas.ZONE_FLIP_DURATION_MS}ms ease`;
            rep.thtEl.style.transform = '';
            const onEnd = () => {
                rep.thtEl.style.transition = '';
                rep.thtEl.style.transform = '';
                rep.thtEl.removeEventListener('transitionend', onEnd);
            };
            rep.thtEl.addEventListener('transitionend', onEnd);
            setTimeout(onEnd, PlexCanvas.ZONE_FLIP_DURATION_MS + 50);
        }
        this.zoneDragCurrentDropIndex = newDropIndex;
    }
    transitionToZoneChangeMode() {
        if (!this.zoneDragPlaceholder || this.zoneDragSlots.length === 0) {
            return;
        }
        const needsAnimation = this.zoneDragCurrentDropIndex !== this.zoneDragOriginalIndex;
        if (needsAnimation) {
            this.updateZoneDragLayout(this.zoneDragOriginalIndex);
        }
        const clearReorderState = () => {
            for (const id of this.zoneDragThoughtOrder) {
                const rep = plexAnimator.thtReps.get(id);
                if (rep) {
                    rep.thtEl.style.transition = '';
                    rep.thtEl.style.transform = '';
                }
            }
            this.zoneDragSlots = [];
            this.zoneDragThoughtOrder = [];
            this.zoneDragOriginalHeightByThought = new Map();
            this.zoneDragOriginalStrideByThought = new Map();
            this.zoneDragReverseDeltaYByThought = new Map();
            this.zoneDragColumnStartY = new Map();
            this.zoneDragCurrentDropIndex = -1;
            this.zoneDragOriginalIndex = -1;
        };
        if (needsAnimation) {
            setTimeout(clearReorderState, PlexCanvas.ZONE_FLIP_DURATION_MS + 50);
        }
        else {
            clearReorderState();
        }
    }
    cleanupZoneDrag() {
        if (this.zoneDragPlaceholder && this.zoneDragPlaceholder.parentElement) {
            this.zoneDragPlaceholder.parentElement.removeChild(this.zoneDragPlaceholder);
        }
        this.zoneDragPlaceholder = null;
        for (const id of this.zoneDragThoughtOrder) {
            const rep = plexAnimator.thtReps.get(id);
            if (rep) {
                rep.thtEl.style.transition = '';
                rep.thtEl.style.transform = '';
            }
        }
        if (this.draggedThoughtId) {
            const rep = plexAnimator.thtReps.get(this.draggedThoughtId);
            if (rep) {
                rep.thtEl.style.zIndex = '';
                rep.thtEl.style.boxShadow = '';
            }
        }
        this.zoneDragSlots = [];
        this.zoneDragThoughtOrder = [];
        this.zoneDragOriginalHeightByThought = new Map();
        this.zoneDragOriginalStrideByThought = new Map();
        this.zoneDragReverseDeltaYByThought = new Map();
        this.zoneDragColumnStartY = new Map();
        this.zoneDragCurrentDropIndex = -1;
        this.zoneDragOriginalIndex = -1;
    }
    setZoneHovered(zone, hovered) {
        if (!zone)
            return;
        const el = document.querySelector(`.zone-div.zone-${zone}`);
        if (!el)
            return;
        if (hovered) {
            el.classList.add('hovered', 'thought-drag');
        }
        else {
            el.classList.remove('hovered', 'thought-drag');
        }
        const overlay = el.querySelector('.zone-overlay');
        if (overlay) {
            if (hovered) {
                overlay.classList.remove('opacity-0');
                overlay.classList.add('opacity-100');
            }
            else {
                overlay.classList.remove('opacity-100');
                overlay.classList.add('opacity-0');
            }
        }
    }
    resetDraggedThoughtToOriginal() {
        if (!this.draggedThoughtId || this.draggedThoughtOriginalLeft == null || this.draggedThoughtOriginalTop == null) {
            return;
        }
        const rep = plexAnimator.thtReps.get(this.draggedThoughtId);
        if (!rep)
            return;
        const currLeft = parseInt(rep.thtEl.style.left || '0');
        const currTop = parseInt(rep.thtEl.style.top || '0');
        const dx = this.draggedThoughtOriginalLeft - (isNaN(currLeft) ? 0 : currLeft);
        const dy = this.draggedThoughtOriginalTop - (isNaN(currTop) ? 0 : currTop);
        rep.thtEl.style.transition = "left 0.15s ease, top 0.15s ease";
        rep.thtEl.style.left = `${this.draggedThoughtOriginalLeft}px`;
        rep.thtEl.style.top = `${this.draggedThoughtOriginalTop}px`;
        const hoveredEls = this.field.querySelectorAll('.hovered-tht, .hovered-tht-label');
        hoveredEls.forEach((el) => {
            DomUtils.offsetElement(el, new Point(dx, dy));
        });
    }
    onKeyDown(event) {
        var _a, _b;
        const activeEl = document.activeElement;
        if (this.isEditableElement(activeEl) || this.isDialogShowing || this.isSearchUIShowing) {
            return;
        }
        const hasModifier = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
        const key = event.key || event.code;
        if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' ||
            key === 'Up' || key === 'Down' || key === 'Left' || key === 'Right') {
            if (!hasModifier) {
                this.handleArrowKeyNavigation(key);
                event.preventDefault();
            }
            return;
        }
        const primaryModifier = navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;
        if ((key === 'ContextMenu' || ((key === 'Enter' || key === 'NumpadEnter') && primaryModifier)) && plexAnimator.focusedUsingKeyboardNav) {
            const focusedThtId = plexAnimator.focusedId;
            if (focusedThtId) {
                const el = document.getElementById(`tht-${focusedThtId}-cur`);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    const cursorPoint = new Point(rect.left + rect.width / 2, rect.top + rect.height / 2);
                    const g = plexAnimator.layout == LayoutType.Outline
                        ? this.outlineGroupOf.get(focusedThtId) : null;
                    safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThought", [cursorPoint, focusedThtId, (_a = g === null || g === void 0 ? void 0 : g.parentId) !== null && _a !== void 0 ? _a : "", (_b = g === null || g === void 0 ? void 0 : g.relationType) !== null && _b !== void 0 ? _b : ""]);
                }
            }
            event.preventDefault();
            return;
        }
        if (key === 'Enter' || key === 'NumpadEnter') {
            if (!hasModifier) {
                if (this.selectedLinkIds.size === 1) {
                    const linkId = Array.from(this.selectedLinkIds)[0];
                    safeInvoke(plexAnimator.dotNetHelper, "ShowLinkProperties", [linkId]);
                    event.preventDefault();
                    return;
                }
                const thoughtToActivate = plexAnimator.focusedId || plexAnimator.activeId;
                if (thoughtToActivate) {
                    this.activateThought(thoughtToActivate);
                    event.preventDefault();
                }
            }
            return;
        }
        if ((key === ' ' || key === 'Space') && plexAnimator.focusedUsingKeyboardNav) {
            if (!hasModifier) {
                safeInvoke(plexAnimator.dotNetHelper, "ToggleExpandCollapseFocusedThoughtAsync", [this.hoveredControlThtId]);
                event.preventDefault();
            }
            return;
        }
        if (key === 'Escape' || key === 'Esc') {
            if (this.supportsZoneDrag() && this.draggedThoughtId) {
                this.cleanupZoneDrag();
                this.resetDraggedThoughtToOriginal();
                this.setZoneHovered(this.currentDropZone, false);
                this.currentDropZone = null;
                this.draggedThoughtId = undefined;
                this.draggedThoughtOriginalLeft = null;
                this.draggedThoughtOriginalTop = null;
                this.draggedThoughtSourceZone = null;
                this.hasLeftSourceZone = false;
                this.pressedObjectType = PlexObjectType.Nothing;
                this.pointerDownIsPrimary = false;
                if (this.isDrawingSelectionRect) {
                    this.clearSelectionRectangleHighlights();
                    this.isDrawingSelectionRect = false;
                    this.selectionRectStartPoint = undefined;
                    this.selectionRectEndPoint = undefined;
                    this.selectionRectInitialSelectedThoughtIds = null;
                }
                this.renderNow = true;
                this.animateBriefly();
                event.preventDefault();
                return;
            }
            if (plexAnimator.focusedUsingKeyboardNav && plexAnimator.activeId) {
                plexAnimator.focusedId = plexAnimator.activeId;
                plexAnimator.focusedUsingKeyboardNav = false;
                safeInvoke(plexAnimator.dotNetHelper, "SetKeyboardNavItemByIdAsync", [null]);
                this.renderNow = true;
                this.animateBriefly();
                event.preventDefault();
                return;
            }
        }
    }
    isEditableElement(element) {
        if (!element)
            return false;
        if (element.id === 'searchInputControl' || element.id === 'plexContainer')
            return false;
        const tagName = element.tagName.toLowerCase();
        const classList = element.classList;
        if (tagName === 'input') {
            const inputType = element.type.toLowerCase();
            const textInputTypes = ['text', 'password', 'email', 'url', 'tel', 'search', 'number'];
            return textInputTypes.includes(inputType);
        }
        if (classList.contains('text-input')) {
            return true;
        }
        if (tagName === 'textarea') {
            return true;
        }
        if (element.contentEditable === 'true') {
            return true;
        }
        const editorIds = ['mdeHtml', 'mdeStyledMarkdownHtml', 'mdeText'];
        if (element.id && editorIds.includes(element.id)) {
            return true;
        }
        return false;
    }
    handleArrowKeyNavigation(key) {
        const currentFocusedId = plexAnimator.focusedId || plexAnimator.activeId;
        if (!currentFocusedId) {
            return;
        }
        const currentRep = plexAnimator.thtReps.get(currentFocusedId);
        if (!currentRep) {
            return;
        }
        let nextThoughtId = this.findThoughtInDirection(currentRep, key);
        const isNormalLayout = plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne;
        if (!nextThoughtId && isNormalLayout && currentFocusedId !== plexAnimator.activeId) {
            const isInParents = plexAnimator.nodeParentsIds.has(currentFocusedId);
            const isInChildren = plexAnimator.nodeChildrenIds.has(currentFocusedId);
            const isInJumps = plexAnimator.nodeJumpsIds.has(currentFocusedId);
            const isInSiblings = plexAnimator.nodeSiblingsIds.has(currentFocusedId);
            if ((isInParents && (key === 'ArrowDown' || key === 'Down')) ||
                (isInChildren && (key === 'ArrowUp' || key === 'Up')) ||
                (isInJumps && (key === 'ArrowRight' || key === 'Right')) ||
                (isInSiblings && (key === 'ArrowLeft' || key === 'Left'))) {
                nextThoughtId = plexAnimator.activeId;
            }
        }
        if (nextThoughtId && nextThoughtId !== currentFocusedId) {
            plexAnimator.focusedId = nextThoughtId;
            plexAnimator.focusedUsingKeyboardNav = true;
            plexAnimator.enablePlexFocusReticleAnimation(true);
            safeInvoke(plexAnimator.dotNetHelper, "SetKeyboardNavItemByIdAsync", [nextThoughtId]);
            this.renderNow = true;
            this.animateBriefly();
            this.panToFocusedThought(nextThoughtId);
        }
    }
    panToFocusedThought(thoughtId) {
        const isOutlineOrMindmap = plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap;
        if (!isOutlineOrMindmap) {
            return;
        }
        const rep = plexAnimator.thtReps.get(thoughtId);
        if (!rep || !rep.thtEl) {
            return;
        }
        const rect = DomUtils.getRect(rep.thtEl, this.field);
        const fieldRect = this.field.getBoundingClientRect();
        const minX = fieldRect.width * 0.25;
        const maxX = fieldRect.width * 0.75;
        const minY = fieldRect.height * 0.25;
        const maxY = fieldRect.height * 0.75;
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        let panX = 0;
        let panY = 0;
        if (centerX < minX) {
            panX = minX - centerX;
        }
        else if (centerX > maxX) {
            panX = maxX - centerX;
        }
        if (centerY < minY) {
            panY = minY - centerY;
        }
        else if (centerY > maxY) {
            panY = maxY - centerY;
        }
        if (panX !== 0 || panY !== 0) {
            plexAnimator.setThoughtElementTransitionTimes(0.3);
            plexAnimator.lastBackgroundDragX += panX;
            plexAnimator.lastBackgroundDragY += panY;
            const thtElements = this.field.querySelectorAll(".tht");
            thtElements.forEach((thtEl) => {
                thtEl.style.left = (parseInt(thtEl.style.left) + panX) + "px";
                thtEl.style.top = (parseInt(thtEl.style.top) + panY) + "px";
            });
            plexAnimator.clampPanToViewport();
            setTimeout(() => {
                plexAnimator.setThoughtElementTransitionTimes(0);
            }, 300);
        }
    }
    findThoughtInDirection(currentRep, direction) {
        const isNormalLayout = plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne;
        if (isNormalLayout) {
            return this.findThoughtInDirectionGrid(currentRep, direction);
        }
        else {
            return this.findThoughtInDirectionDotProduct(currentRep, direction);
        }
    }
    getNavigationReferencePoint(rep) {
        const rect = DomUtils.getRect(rep.thtEl, this.field);
        const isOutlineOrMindmap = plexAnimator.layout === LayoutType.Outline || plexAnimator.layout === LayoutType.Mindmap;
        if (isOutlineOrMindmap) {
            switch (rep.alignment) {
                case ThoughtHorizontalAlignment.Left:
                    return new Point(rect.x, rect.y + rect.height / 2);
                case ThoughtHorizontalAlignment.Right:
                    return new Point(rect.x + rect.width, rect.y + rect.height / 2);
                case ThoughtHorizontalAlignment.Center:
                default:
                    return new Point(rect.x + rect.width / 2, rect.y + rect.height / 2);
            }
        }
        return new Point(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    findThoughtInDirectionDotProduct(currentRep, direction) {
        const referencePoint = this.getNavigationReferencePoint(currentRep);
        const isUpDirection = direction === 'ArrowUp' || direction === 'Up';
        const isDownDirection = direction === 'ArrowDown' || direction === 'Down';
        const isLeftDirection = direction === 'ArrowLeft' || direction === 'Left';
        const isRightDirection = direction === 'ArrowRight' || direction === 'Right';
        let sectorDx = 0;
        let sectorDy = 0;
        if (isUpDirection) {
            sectorDx = 0;
            sectorDy = -1;
        }
        else if (isDownDirection) {
            sectorDx = 0;
            sectorDy = 1;
        }
        else if (isLeftDirection) {
            sectorDx = -1;
            sectorDy = 0;
        }
        else if (isRightDirection) {
            sectorDx = 1;
            sectorDy = 0;
        }
        let bestMatchId = undefined;
        let bestDist2 = Number.MAX_VALUE;
        let bestDP = -1;
        plexAnimator.thtReps.forEach((rep, id) => {
            if (id === currentRep.id) {
                return;
            }
            const testPoint = this.getNavigationReferencePoint(rep);
            let dx = testPoint.x - referencePoint.x;
            let dy = testPoint.y - referencePoint.y;
            const rad2 = dx * dx + dy * dy;
            const rad = Math.sqrt(rad2);
            dx /= rad;
            dy /= rad;
            let dotProduct = dx * sectorDx + dy * sectorDy;
            const QUANT = 4;
            dotProduct *= QUANT;
            dotProduct = Math.round(dotProduct);
            dotProduct /= QUANT;
            if (dotProduct <= 0.1) {
                return;
            }
            const dist2 = rad2;
            if (dotProduct >= bestDP && dist2 < bestDist2) {
                bestDist2 = dist2;
                bestMatchId = id;
                bestDP = dotProduct;
            }
        });
        return bestMatchId;
    }
    findThoughtInDirectionGrid(currentRep, direction) {
        const currentEl = currentRep.thtEl;
        const currentZone = currentEl.dataset.gridZone;
        const currentCol = parseInt(currentEl.dataset.gridColumn || '-1');
        const currentRow = parseInt(currentEl.dataset.gridRow || '-1');
        const isUpDirection = direction === 'ArrowUp' || direction === 'Up';
        const isDownDirection = direction === 'ArrowDown' || direction === 'Down';
        const isLeftDirection = direction === 'ArrowLeft' || direction === 'Left';
        const isRightDirection = direction === 'ArrowRight' || direction === 'Right';
        const isActiveThought = currentRep.id === plexAnimator.activeId;
        if (isActiveThought) {
            let targetZoneThoughts = [];
            let targetZone = null;
            if (isUpDirection) {
                targetZone = 'parent';
                targetZoneThoughts = Array.from(plexAnimator.nodeParentsIds);
            }
            else if (isDownDirection) {
                targetZone = 'child';
                targetZoneThoughts = Array.from(plexAnimator.nodeChildrenIds);
            }
            else if (isLeftDirection) {
                targetZone = 'jump';
                targetZoneThoughts = Array.from(plexAnimator.nodeJumpsIds);
            }
            else if (isRightDirection) {
                targetZone = 'sibling';
                targetZoneThoughts = Array.from(plexAnimator.nodeSiblingsIds);
            }
            if (!targetZone || targetZoneThoughts.length === 0) {
                return undefined;
            }
            const cols = plexAnimator.normalLayoutZoneToColumns.get(targetZone) || 1;
            const rows = plexAnimator.normalLayoutZoneToRows.get(targetZone) || 1;
            if (isUpDirection || isDownDirection) {
                const targetCol = Math.max(0, Math.floor(cols / 2) - 1);
                const targetRow = isDownDirection ? 0 : rows - 1;
                return this.findThoughtAtGridPosition(targetZone, targetCol, targetRow);
            }
            else {
                if (!plexAnimator.activeId) {
                    return this.findThoughtAtGridPosition(targetZone, 0, 0);
                }
                const activeRep = plexAnimator.thtReps.get(plexAnimator.activeId);
                if (!activeRep) {
                    return this.findThoughtAtGridPosition(targetZone, 0, 0);
                }
                const activeRect = DomUtils.getRect(activeRep.thtEl, this.field);
                const activeCenterY = activeRect.y + activeRect.height / 2;
                let bestRow = 0;
                let bestDistance = Number.MAX_VALUE;
                for (let row = 0; row < rows; row++) {
                    const thoughtId = this.findThoughtAtGridPosition(targetZone, 0, row);
                    if (thoughtId) {
                        const thoughtRep = plexAnimator.thtReps.get(thoughtId);
                        if (thoughtRep) {
                            const thoughtRect = DomUtils.getRect(thoughtRep.thtEl, this.field);
                            const thoughtCenterY = thoughtRect.y + thoughtRect.height / 2;
                            const distance = Math.abs(thoughtCenterY - activeCenterY);
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                bestRow = row;
                            }
                        }
                    }
                }
                return this.findThoughtAtGridPosition(targetZone, 0, bestRow);
            }
        }
        if (!currentZone || currentCol < 0 || currentRow < 0) {
            return undefined;
        }
        const cols = plexAnimator.normalLayoutZoneToColumns.get(currentZone) || 1;
        const rows = plexAnimator.normalLayoutZoneToRows.get(currentZone) || 1;
        const isInParents = currentZone === 'parent';
        const isInChildren = currentZone === 'child';
        const isInJumps = currentZone === 'jump';
        const isInSiblings = currentZone === 'sibling';
        let targetCol = currentCol;
        let targetRow = currentRow;
        if (isUpDirection) {
            targetRow--;
            if (targetRow < 0) {
                if (isInChildren) {
                    return plexAnimator.activeId;
                }
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, -1);
                if (nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, -1, nextThoughtId);
                    return undefined;
                }
                return undefined;
            }
        }
        else if (isDownDirection) {
            targetRow++;
            if (targetRow >= rows) {
                if (isInParents) {
                    return plexAnimator.activeId;
                }
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, 1);
                if (nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, 1, nextThoughtId);
                    return undefined;
                }
                return undefined;
            }
        }
        else if (isLeftDirection) {
            if (isInSiblings) {
                return plexAnimator.activeId;
            }
            targetCol--;
            if (targetCol < 0) {
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, -1);
                if (nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, -1, nextThoughtId);
                    return undefined;
                }
                return undefined;
            }
        }
        else if (isRightDirection) {
            if (isInJumps) {
                return plexAnimator.activeId;
            }
            targetCol++;
            if (targetCol >= cols) {
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, 1);
                if (nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, 1, nextThoughtId);
                    return undefined;
                }
                return undefined;
            }
        }
        return this.findThoughtAtGridPosition(currentZone, targetCol, targetRow);
    }
    findThoughtAtGridPosition(zone, col, row) {
        const key = `${zone}-${col}-${row}`;
        return this.gridPositionToThoughtId.get(key);
    }
    getNextThoughtIdInZoneByIndex(currentThoughtId, zone, delta) {
        let thoughtSet;
        switch (zone) {
            case 'parent':
                thoughtSet = plexAnimator.nodeParentsIds;
                break;
            case 'child':
                thoughtSet = plexAnimator.nodeChildrenIds;
                break;
            case 'jump':
                thoughtSet = plexAnimator.nodeJumpsIds;
                break;
            case 'sibling':
                thoughtSet = plexAnimator.nodeSiblingsIds;
                break;
            default:
                return undefined;
        }
        const thoughtIds = Array.from(thoughtSet);
        const currentIndex = thoughtIds.indexOf(currentThoughtId);
        if (currentIndex === -1) {
            return undefined;
        }
        const scrollbar = plexAnimator.zoneScrollbars[zone];
        const isHorizontal = (scrollbar === null || scrollbar === void 0 ? void 0 : scrollbar.isHorizontal) || false;
        const rows = plexAnimator.normalLayoutZoneToRows.get(zone) || 1;
        const skipAmount = isHorizontal ? rows * delta : delta;
        const nextIndex = currentIndex + skipAmount;
        if (nextIndex >= 0 && nextIndex < thoughtIds.length) {
            return thoughtIds[nextIndex];
        }
        return undefined;
    }
    scrollZoneAndFocusThought(zone, direction, thoughtIdToFocus) {
        const scrollbar = plexAnimator.zoneScrollbars[zone];
        if (scrollbar) {
            this.pendingFocusAfterScroll = thoughtIdToFocus;
            scrollbar.scrollByPage(direction);
        }
    }
    applyPendingFocus() {
        if (this.pendingFocusAfterScroll) {
            const thoughtId = this.pendingFocusAfterScroll;
            this.pendingFocusAfterScroll = undefined;
            this.isApplyingPendingFocus = true;
            plexAnimator.focusedId = thoughtId;
            plexAnimator.focusedUsingKeyboardNav = true;
            safeInvoke(plexAnimator.dotNetHelper, "SetKeyboardNavItemByIdAsync", [thoughtId]);
            this.renderNow = true;
            this.animateBriefly();
            this.panToFocusedThought(thoughtId);
        }
    }
    willChangeSelectedLinks() {
        this.selectedLinkIds.forEach((lid) => {
            let labelDiv = document.getElementById("lnk-" + lid);
            if (labelDiv) {
                labelDiv.classList.remove("link-selected");
            }
        });
        this.previousSelectedLinkIds = new Set(this.selectedLinkIds);
    }
    async didChangeSelectedLinks(navigateToLink) {
        this.selectedLinkIds.forEach((lid) => {
            let labelDiv = document.getElementById("lnk-" + lid);
            if (labelDiv) {
                labelDiv.classList.add("link-selected");
            }
        });
        if (this.selectedLinkIds.size > 0) {
            let thtsToKeep = new Set;
            this.selectedLinkIds.forEach((lid) => {
                let link = plexAnimator.linkReps.get(lid);
                if (link) {
                    thtsToKeep.add(link.idA);
                    thtsToKeep.add(link.idB);
                }
            });
            let thtElements = this.field.querySelectorAll(".tht.cur");
            thtElements.forEach((el) => {
                let thtEl = el;
                let thtId = thtEl.id.substring(4, 40);
                if (thtsToKeep.has(thtId)) {
                    thtEl.style.opacity = "1";
                }
                else {
                    thtEl.style.opacity = "0.5";
                }
            });
        }
        else {
            let thtElements = this.field.querySelectorAll(".tht.cur");
            thtElements.forEach((el) => {
                let thtEl = el;
                thtEl.style.opacity = "1";
            });
        }
        if (navigateToLink && (this.selectedLinkIds.size > 0 || this.previousSelectedLinkIds.size > 0)) {
            await this.flushContentEditableBlur();
            safeInvoke(plexAnimator.dotNetHelper, "ActivateLink", [navigateToLink ? Array.from(this.selectedLinkIds) : null]);
        }
        if (!plexAnimator.isReadOnly) {
        }
    }
    setSelectedLinkIds(ids) {
        this.willChangeSelectedLinks();
        this.selectedLinkIds.clear();
        if (ids != null) {
            ids.forEach(id => this.selectedLinkIds.add(id));
        }
        this.didChangeSelectedLinks(false);
    }
    getAntColor(bgColorString) {
        const match = bgColorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match)
            return "white";
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? "black" : "white";
    }
    createRoundedRectPath(w, h, rtl, rtr, rbr, rbl) {
        const inset = 1;
        const x = inset;
        const y = inset;
        const pw = w - inset * 2;
        const ph = h - inset * 2;
        return `M ${x + rtl} ${y}`
            + ` H ${x + pw - rtr} A ${rtr} ${rtr} 0 0 1 ${x + pw} ${y + rtr}`
            + ` V ${y + ph - rbr} A ${rbr} ${rbr} 0 0 1 ${x + pw - rbr} ${y + ph}`
            + ` H ${x + rbl} A ${rbl} ${rbl} 0 0 1 ${x} ${y + ph - rbl}`
            + ` V ${y + rtl} A ${rtl} ${rtl} 0 0 1 ${x + rtl} ${y}`
            + ` Z`;
    }
    createMarchingAntsSvg(element) {
        this.removeMarchingAntsSvg(element);
        const w = element.offsetWidth;
        const h = element.offsetHeight;
        if (w === 0 || h === 0)
            return;
        const tcChild = element.querySelector('.thought-control');
        let antColor = "white";
        if (tcChild) {
            const bg = getComputedStyle(tcChild).backgroundColor;
            antColor = this.getAntColor(bg);
        }
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", String(w));
        svg.setAttribute("height", String(h));
        svg.classList.add("marching-ants-svg");
        const cs = getComputedStyle(element);
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        if (bt !== 0 || bl !== 0) {
            svg.style.top = `-${bt}px`;
            svg.style.left = `-${bl}px`;
        }
        const isTag = element.classList.contains("rounded-tl-xl") && element.classList.contains("rounded-br-xl");
        const isType = !isTag && element.classList.contains("rounded-xl");
        this.populateMarchingAntsSvg(svg, w, h, antColor, isTag, isType);
        element.appendChild(svg);
        if (this.marchingAntsResizeObserver) {
            this.marchingAntsResizeObserver.observe(element);
        }
    }
    populateMarchingAntsSvg(svg, w, h, strokeColor, isTag, isType) {
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
        svg.setAttribute("width", String(w));
        svg.setAttribute("height", String(h));
        if (isTag) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", this.createRoundedRectPath(w, h, 12, 0, 12, 0));
            path.setAttribute("stroke", strokeColor);
            svg.appendChild(path);
        }
        else {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const inset = 1;
            rect.setAttribute("x", String(inset));
            rect.setAttribute("y", String(inset));
            rect.setAttribute("width", String(w - inset * 2));
            rect.setAttribute("height", String(h - inset * 2));
            rect.setAttribute("rx", isType ? "12" : "4");
            rect.setAttribute("stroke", strokeColor);
            svg.appendChild(rect);
        }
    }
    handleMarchingAntsResize(entries) {
        var _a, _b;
        for (const entry of entries) {
            const element = entry.target;
            const svg = element.querySelector('.marching-ants-svg');
            if (!svg) {
                (_a = this.marchingAntsResizeObserver) === null || _a === void 0 ? void 0 : _a.unobserve(element);
                continue;
            }
            const w = element.offsetWidth;
            const h = element.offsetHeight;
            if (w === 0 || h === 0)
                continue;
            const isTag = element.classList.contains("rounded-tl-xl") && element.classList.contains("rounded-br-xl");
            const isType = !isTag && element.classList.contains("rounded-xl");
            const strokeColor = ((_b = svg.firstElementChild) === null || _b === void 0 ? void 0 : _b.getAttribute("stroke")) || "white";
            this.populateMarchingAntsSvg(svg, w, h, strokeColor, isTag, isType);
        }
    }
    removeMarchingAntsSvg(element) {
        var _a;
        const existing = element.querySelector('.marching-ants-svg');
        if (existing) {
            existing.remove();
            (_a = this.marchingAntsResizeObserver) === null || _a === void 0 ? void 0 : _a.unobserve(element);
        }
    }
    selectedThoughtsChanging(begin) {
        this.selectedThoughtIds.forEach((tid) => {
            let labelDiv = document.getElementById("tht-" + tid + "-cur");
            if (labelDiv) {
                if (begin) {
                    labelDiv.classList.remove("thought-selected");
                }
                else {
                    labelDiv.classList.add("thought-selected");
                }
            }
            let hoveredDiv = document.getElementById("tht-" + tid + "-hovered");
            if (hoveredDiv) {
                if (begin) {
                    hoveredDiv.classList.remove("thought-selected");
                }
                else {
                    hoveredDiv.classList.add("thought-selected");
                }
            }
        });
        if (!begin) {
            plexAnimator.onResize();
            safeInvoke(plexAnimator.dotNetHelper, "SelectedThoughtsChanged", [this.selectedThoughtIds]);
        }
    }
    onWheel(event) {
        const layout = plexAnimator.layout;
        if (layout == LayoutType.Outline || layout == LayoutType.Mindmap || layout == LayoutType.Force) {
            const deltaPoint = new Point(-event.deltaX, -event.deltaY);
            plexAnimator.backgroundDragged(deltaPoint, true);
            this.renderNow = true;
            event.preventDefault();
            return;
        }
        if (this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if (s != null) {
                    s.onWheel(event);
                }
            });
        }
    }
    setScrollbarsToDraw(scrollbars) {
        this.scrollbars = scrollbars;
    }
    drawScrollbars(graphics) {
        if (this.scrollbars == null) {
            return;
        }
        this.scrollbars.forEach((s) => {
            if (s != null) {
                let color = Scrollbar.stateByZone[s.zone].isHovered ? plexAnimator.colors.gateHighlighted : plexAnimator.colors.scrollBarOutline;
                graphics.roundRect(s.visRect.x, s.visRect.y, s.visRect.width, s.visRect.height, 9999)
                    .stroke({ width: 1.5, color: color });
                graphics.roundRect(s.thumbRect.x, s.thumbRect.y, s.thumbRect.width, s.thumbRect.height, 9999)
                    .fill({ color: color, alpha: 0.5 });
            }
        });
    }
    drawActiveThoughtBackground(graphics) {
        if (!plexAnimator.colors) {
            return;
        }
        if (plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne || plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
            let cen = plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap
                ? plexAnimator.currentLayout.getActiveThoughtPosition()
                : plexAnimator.currentLayout.getActiveZoneCenter();
            if (!cen) {
                return;
            }
            if (plexAnimator.focusedId == plexAnimator.activeId) {
                graphics.circle(cen.x, cen.y, plexAnimator.rowHeight * 0.8)
                    .stroke({ width: 2, color: plexAnimator.colors.thoughtActiveResizeCircle, alpha: 0.8 });
            }
            let rep = plexAnimator.thtReps.get(plexAnimator.focusedId);
            if (rep && plexAnimator.focusedId != plexAnimator.activeId) {
                let focusEl = rep.thtEl;
                if (focusEl) {
                    let rect = DomUtils.getRect(focusEl, this.field);
                    const gap = plexAnimator.rowHeight * 0.1;
                    graphics.roundRect(rect.x - gap, rect.y - gap, rect.width + gap * 2, rect.height + gap * 2, gap)
                        .fill(plexAnimator.colors.thoughtBackground)
                        .stroke({ width: 1.5, color: plexAnimator.colors.thoughtActiveResizeCircle });
                }
            }
        }
        else {
            if (plexAnimator.activeId && plexAnimator.thtReps.get(plexAnimator.activeId)) {
                let activeEl = plexAnimator.thtReps.get(plexAnimator.activeId).thtEl;
                let cen = DomUtils.getCenter(activeEl, this.field);
                let fieldRect = this.field.getBoundingClientRect();
                if (!Rect.from(fieldRect).contains(cen)) {
                    return;
                }
                graphics.circle(cen.x, cen.y + plexAnimator.rowHeight * 0.06, plexAnimator.rowHeight * 0.8)
                    .stroke({ width: 1.5, color: plexAnimator.colors.thoughtActiveResizeCircle });
                let speed = 0.5;
                let time = 1 - (plexAnimator.forceLayout.ellapsedTime * speed) % 1;
                let alpha = 0.5;
                let fadeAlpha = Math.min(1, Math.max(0, 1 - time));
                graphics.circle(cen.x, cen.y + plexAnimator.rowHeight * 0.06, plexAnimator.rowHeight * (time + 0.8 / 3) * 3)
                    .stroke({ width: 1.5, color: plexAnimator.colors.thoughtActiveResizeCircle, alpha: alpha });
                graphics.circle(cen.x, cen.y + plexAnimator.rowHeight * 0.06, plexAnimator.rowHeight * (time + 3.8 / 3) * 3)
                    .stroke({ width: 1.5, color: plexAnimator.colors.thoughtActiveResizeCircle, alpha: fadeAlpha * alpha });
            }
        }
    }
    drawLinksAndSetupGates(graphics, createColliders) {
        this.clearGates();
        plexAnimator.linkReps.forEach((l) => {
            var _a, _b, _c, _d;
            let thtRepA = plexAnimator.getAnyThoughtRepById(l.idA);
            let thtRepB = plexAnimator.getAnyThoughtRepById(l.idB);
            if (thtRepA == null && thtRepB == null) {
                return;
            }
            if (thtRepA == null) {
                if ((!l.isOneWay() || l.isBackward()) && l.meaning != LinkMeaning.HasTag && l.meaning != LinkMeaning.InstanceOf) {
                    this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.More);
                }
                return;
            }
            else if (thtRepB == null) {
                if (!l.isOneWay() || !l.isBackward()) {
                    this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.More);
                }
                return;
            }
            if (thtRepA.thtEl.style.display === "none" || thtRepB.thtEl.style.display === "none") {
                return;
            }
            const aIsOld = thtRepA.thtEl.classList.contains("old");
            const bIsOld = thtRepB.thtEl.classList.contains("old");
            if (aIsOld || bIsOld) {
                if (!aIsOld && bIsOld) {
                    if (!l.isOneWay() || !l.isBackward()) {
                        this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.More);
                    }
                }
                else if (aIsOld && !bIsOld) {
                    if ((!l.isOneWay() || l.isBackward()) && l.meaning != LinkMeaning.HasTag && l.meaning != LinkMeaning.InstanceOf) {
                        this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.More);
                    }
                }
                return;
            }
            const aInPlex = plexAnimator.thtReps.has(thtRepA.id);
            const bInPlex = plexAnimator.thtReps.has(thtRepB.id);
            if (!aInPlex || !bInPlex) {
                if (aInPlex && !bInPlex) {
                    if (!l.isOneWay() || !l.isBackward()) {
                        this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.More);
                    }
                }
                else if (!aInPlex && bInPlex) {
                    if ((!l.isOneWay() || l.isBackward()) && l.meaning != LinkMeaning.HasTag && l.meaning != LinkMeaning.InstanceOf) {
                        this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.More);
                    }
                }
                return;
            }
            this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.Full);
            this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.Full);
            if (plexAnimator.layout === LayoutType.Force) {
                if (plexAnimator.forceLayout.isDrone(thtRepA.id) || plexAnimator.forceLayout.isDrone(thtRepB.id)) {
                    return;
                }
            }
            let opA = +getComputedStyle(thtRepA.thtEl).opacity;
            let opB = +getComputedStyle(thtRepB.thtEl).opacity;
            let minOpacity = Math.min(opA, opB);
            if (minOpacity < 0.2) {
                return;
            }
            let sGate;
            let dGate;
            sGate = l.relation;
            dGate = this.getOppositeRelation(l.relation);
            let isThtAJumpOfActive = plexAnimator.nodeJumpsIds.has(thtRepA.id);
            let isThtBJumpOfActive = plexAnimator.nodeJumpsIds.has(thtRepB.id);
            let rectA = DomUtils.getRect(thtRepA.thtEl, this.field);
            let rectB = DomUtils.getRect(thtRepB.thtEl, this.field);
            let isLinkHighlighted = false;
            if (this.hoveredThoughtId) {
                let idToTestForHover = this.hoveredThoughtId;
                if (plexAnimator.layout == LayoutType.Force) {
                    if (plexAnimator.forceLayout.isDrone(this.hoveredThoughtId)) {
                        let pilot = plexAnimator.forceLayout.getPilot(this.hoveredThoughtId);
                        if (pilot) {
                            idToTestForHover = pilot.id;
                        }
                    }
                }
                if (l.idA == idToTestForHover || l.idB == idToTestForHover) {
                    isLinkHighlighted = true;
                }
            }
            else if (this.hoveredLinkId == l.id) {
                isLinkHighlighted = true;
            }
            else if (this.hoveredGateThtId && this.hoveredGateRelation !== Relation.Unknown) {
                if (l.idA == this.hoveredGateThtId && l.relation == this.hoveredGateRelation) {
                    isLinkHighlighted = true;
                }
                else if (l.idB == this.hoveredGateThtId && l.relation == this.getOppositeRelation(this.hoveredGateRelation)) {
                    isLinkHighlighted = true;
                }
            }
            let isClusterLink = false;
            if (plexAnimator.layout === LayoutType.Force) {
                if (plexAnimator.forceLayout.isPilot(thtRepA.id)) {
                    rectA = plexAnimator.forceLayout.getNodeRect(thtRepA.id);
                    graphics.roundRect(rectA.x, rectA.y, rectA.width, rectA.height, 10)
                        .stroke({ width: 1, color: isLinkHighlighted ? plexAnimator.colors.linkHighlighted : plexAnimator.colors.linkNormal, alpha: 0.6 });
                    isClusterLink = true;
                }
                if (plexAnimator.forceLayout.isPilot(thtRepB.id)) {
                    rectB = plexAnimator.forceLayout.getNodeRect(thtRepB.id);
                    graphics.roundRect(rectB.x, rectB.y, rectB.width, rectB.height, 10)
                        .stroke({ width: 1, color: isLinkHighlighted ? plexAnimator.colors.linkHighlighted : plexAnimator.colors.linkNormal, alpha: 0.6 });
                    isClusterLink = true;
                }
            }
            let isGateBEastOfA = rectA.getCenter().x < rectB.getCenter().x;
            let childSideA;
            let childSideB;
            if (plexAnimator.layout == LayoutType.Mindmap) {
                const isAActive = thtRepA.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
                const isBActive = thtRepB.id == ((_b = plexAnimator.node) === null || _b === void 0 ? void 0 : _b.id);
                if (isAActive && sGate === Relation.Child) {
                    childSideA = isGateBEastOfA ? 'right' : 'left';
                }
                if (isBActive && dGate === Relation.Child) {
                    childSideB = !isGateBEastOfA ? 'right' : 'left';
                }
            }
            let gateA = this.getGateLocationFromRectAndThoughtRepForLink(rectA, thtRepA, sGate, isThtAJumpOfActive, isGateBEastOfA, childSideA);
            let gateB = this.getGateLocationFromRectAndThoughtRepForLink(rectB, thtRepB, dGate, isThtBJumpOfActive, !isGateBEastOfA, childSideB);
            let color = l.color;
            if (color === 0) {
                color = plexAnimator.colors.linkNormal;
            }
            if (isLinkHighlighted) {
                color = plexAnimator.colors.linkHighlighted;
            }
            let isExtraLink = plexAnimator.layout != LayoutType.Force && l.idA != plexAnimator.activeId && l.idB != plexAnimator.activeId;
            if (plexAnimator.layout === LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne) {
                if (plexAnimator.nodeParentsIds.has(l.idA) && plexAnimator.nodeSiblingsIds.has(l.idB) ||
                    plexAnimator.nodeParentsIds.has(l.idB) && plexAnimator.nodeSiblingsIds.has(l.idA)) {
                    isExtraLink = false;
                }
            }
            if (plexAnimator.primaryLinks.size > 0) {
                isExtraLink = !plexAnimator.isPrimaryLink(l.idA, l.idB);
            }
            if (isExtraLink) {
                minOpacity *= 0.4;
            }
            let defaultThickness = ((_c = plexAnimator.colors.linkThickness) !== null && _c !== void 0 ? _c : 150) / 100;
            let linkOpacity = ((_d = plexAnimator.colors.linkOpacity) !== null && _d !== void 0 ? _d : 60) / 100;
            let lineWidth = l.thickness <= 0 ? defaultThickness : l.thickness / 100;
            if (this.selectedLinkIds.size > 0) {
                if (this.selectedLinkIds.has(l.id)) {
                    lineWidth += 1;
                    let pulseOffset = (Date.now() % 875) / 875;
                    pulseOffset *= 2 * PI;
                    let delta = Math.sin(pulseOffset) * 0.25;
                    minOpacity = 0.85 + delta;
                }
                else if (!isLinkHighlighted) {
                    minOpacity *= 0.6;
                }
            }
            graphics.moveTo(gateA.x, gateA.y);
            let linkLabelPoint;
            let linkBeforePoint;
            if (plexAnimator.isStraightLinksEnabled) {
                graphics.lineTo(gateB.x, gateB.y)
                    .stroke({ width: lineWidth, color: color, alpha: minOpacity * linkOpacity });
                if (createColliders) {
                    this.linkColliders[l.id] = new LineCollider(gateA, gateB, 4);
                    if ((l.isDirected() || l.label && l.label.length > 0 || l.hasNotes || l.attachmentCount > 0) && !isExtraLink) {
                        linkLabelPoint = new Point((gateA.x + gateB.x) * 0.5, (gateA.y + gateB.y) * 0.5);
                        linkBeforePoint = gateA;
                    }
                }
            }
            else {
                let rectA = DomUtils.getRect(thtRepA.thtEl, this.field);
                let rectB = DomUtils.getRect(thtRepB.thtEl, this.field);
                let isSecondary = !plexAnimator.isPrimaryLink(l.idA, l.idB);
                let points = plexAnimator.currentLayout.getCurvePoints(l.relation, rectA, gateA, thtRepA.generation, thtRepA.alignment, rectB, gateB, thtRepB.generation, thtRepB.alignment, isSecondary);
                if (plexAnimator.layout === LayoutType.Mindmap &&
                    (thtRepA.zone === "parent" || thtRepB.zone === "parent")) {
                    points = plexAnimator.normalLayout.getCurvePoints(l.relation, rectA, gateA, thtRepA.generation, thtRepA.alignment, rectB, gateB, thtRepB.generation, thtRepB.alignment, isSecondary);
                }
                if (plexAnimator.layout === LayoutType.Mindmap &&
                    (thtRepA.zone === "jump" || thtRepB.zone === "jump")) {
                    points = plexAnimator.normalLayout.getCurvePoints(thtRepA.id == plexAnimator.activeId ? Relation.Child : Relation.Parent, rectA, gateA, thtRepA.generation, thtRepA.alignment, rectB, gateB, thtRepB.generation, thtRepB.alignment, isSecondary);
                }
                graphics.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y)
                    .stroke({ width: lineWidth, color: color, alpha: minOpacity * linkOpacity });
                if (createColliders) {
                    this.linkColliders[l.id] = new CubicCollider(points);
                    if ((l.isDirected() || l.label && l.label.length > 0 || l.hasNotes || l.attachmentCount > 0) && !isExtraLink) {
                        linkLabelPoint = CubicCollider.getCubicValueAt(points, 0.5);
                        linkBeforePoint = CubicCollider.getCubicValueAt(points, 0.48);
                    }
                }
            }
            if (createColliders && linkLabelPoint) {
                if (isClusterLink) {
                    if (this.hoveredThoughtId) {
                        if (plexAnimator.forceLayout.isDrone(this.hoveredThoughtId) || plexAnimator.forceLayout.isPilot(this.hoveredThoughtId)) {
                            let pilotId = plexAnimator.forceLayout.getPilot(this.hoveredThoughtId).id;
                            if (pilotId === l.idA || pilotId === l.idB) {
                                let realLinks = Array.from(plexAnimator.linkReps.values()).filter((nl) => nl.idA === this.hoveredThoughtId && nl.idB === l.idB || nl.idA === l.idA && nl.idB === this.hoveredThoughtId);
                                if (realLinks.length === 1) {
                                    let linkToGetLabelFrom = realLinks[0];
                                    let labelDiv = this.createLinkLabel(linkToGetLabelFrom, linkLabelPoint, linkBeforePoint);
                                    labelDiv.classList.add("link-hovered");
                                }
                            }
                        }
                    }
                }
                else {
                    let labelDiv = this.createLinkLabel(l, linkLabelPoint, linkBeforePoint);
                    if (l.idA === this.hoveredThoughtId || l.idB === this.hoveredThoughtId || l.id === this.hoveredLinkId) {
                        labelDiv.classList.add("link-hovered");
                    }
                }
            }
        });
    }
    setGateStatusForThoughtId(id, relation, status) {
        var _a, _b, _c;
        const plexRep = plexAnimator.thtReps.get(id);
        if (plexRep)
            plexRep.setGateStatusWithoutOverridingMore(relation, status);
        const pinned = (_a = plexAnimator.pinnedListLayout) === null || _a === void 0 ? void 0 : _a.getRep(id);
        if (pinned)
            pinned.setGateStatusWithoutOverridingMore(relation, status);
        const past = (_b = plexAnimator.pastListLayout) === null || _b === void 0 ? void 0 : _b.getRep(id);
        if (past)
            past.setGateStatusWithoutOverridingMore(relation, status);
        const selected = (_c = plexAnimator.selectedListLayout) === null || _c === void 0 ? void 0 : _c.getRep(id);
        if (selected)
            selected.setGateStatusWithoutOverridingMore(relation, status);
    }
    getOppositeRelation(r) {
        switch (r) {
            case Relation.Child:
                return Relation.Parent;
            case Relation.Parent:
                return Relation.Child;
            case Relation.Jump:
                return Relation.Jump;
            default:
                return Relation.Unknown;
        }
    }
    createLinkLabel(l, linkLabelPoint, linkBeforePoint) {
        let linkLabelAngle = Math.atan2(linkLabelPoint.y - linkBeforePoint.y, linkLabelPoint.x - linkBeforePoint.x);
        let isUpsideDown = linkBeforePoint.x > linkLabelPoint.x;
        let isLeft = l.isBackward() && !isUpsideDown || !l.isBackward() && isUpsideDown;
        if (isUpsideDown) {
            linkLabelAngle += PI;
        }
        let labelDiv = document.createElement("div");
        labelDiv.classList.add("flex", "place-items-center", "gap-1");
        let arrowDiv;
        if (l.isDirected()) {
            arrowDiv = document.createElement("div");
            arrowDiv.style.width = "1rem";
            arrowDiv.style.height = "1rem";
            let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 24 24");
            let color = l.color;
            if (color === 0) {
                color = plexAnimator.colors.linkNormal;
            }
            svg.setAttribute("fill", this.getColorString(color, 1));
            svg.setAttribute("stroke", this.getColorString(plexAnimator.colors.thoughtBackground, 1));
            svg.setAttribute("stroke-width", "1");
            let path = document.createElementNS("http://www.w3.org/2000/svg", 'path');
            if (isLeft) {
                if (l.isOneWay()) {
                    path.setAttribute("d", this.PATH_LEFT_ONE_WAY);
                }
                else {
                    path.setAttribute("d", this.PATH_LEFT);
                }
            }
            else {
                if (l.isOneWay()) {
                    path.setAttribute("d", this.PATH_RIGHT_ONE_WAY);
                }
                else {
                    path.setAttribute("d", this.PATH_RIGHT);
                }
            }
            svg.appendChild(path);
            arrowDiv.appendChild(svg);
        }
        if (isLeft && arrowDiv) {
            labelDiv.appendChild(arrowDiv);
        }
        if (l.hasNotes) {
            let noteIcon = document.createElement("i");
            noteIcon.className = "fas fa-circle-small";
            noteIcon.style.fontSize = "0.6rem";
            labelDiv.appendChild(noteIcon);
        }
        if (l.attachmentCount > 0) {
            let attachmentIcon = document.createElement("i");
            attachmentIcon.className = "fas fa-paperclip";
            attachmentIcon.style.fontSize = "0.6rem";
            labelDiv.appendChild(attachmentIcon);
        }
        if (l.label != null) {
            let textSpan = document.createElement("span");
            textSpan.style.position = "relative";
            textSpan.style.top = "0.12em";
            textSpan.textContent = l.label;
            labelDiv.appendChild(textSpan);
        }
        if (!isLeft && arrowDiv) {
            labelDiv.appendChild(arrowDiv);
        }
        labelDiv.classList.add("link-label", "rounded-full", "px-1", "cursor-default");
        labelDiv.style.height = "1.25em";
        labelDiv.style.lineHeight = "1";
        labelDiv.style.boxSizing = "border-box";
        labelDiv.style.pointerEvents = "none";
        labelDiv.style.fontSize = (0.8 * 100 * plexAnimator.rowHeight / 28.0) + "%";
        labelDiv.style.transform = "rotate(" + linkLabelAngle + "rad)";
        labelDiv.id = "lnk-" + l.id;
        this.field.appendChild(labelDiv);
        DomUtils.centerAt(labelDiv, linkLabelPoint);
        return labelDiv;
    }
    drawInteractions(graphics) {
        var _a;
        if (this.isDrawingSelectionRect && this.selectionRectStartPoint && this.selectionRectEndPoint) {
            this.drawSelectionRectangle(graphics);
        }
        if (this.focusCircleEl) {
            const activeEl = document.activeElement;
            const plexHasFocus = !this.isEditableElement(activeEl) && !this.isDialogShowing && !this.isSearchUIShowing;
            if (plexAnimator.focusedId && plexAnimator.focusedUsingKeyboardNav && plexHasFocus) {
                let rep = plexAnimator.thtReps.get(plexAnimator.focusedId);
                if (rep) {
                    let focusEl = rep.thtEl;
                    if (focusEl) {
                        let rect = DomUtils.getRect(focusEl, this.field);
                        const centerX = rect.x + rect.width / 2;
                        const centerY = rect.y + rect.height / 2;
                        const circleSize = plexAnimator.rowHeight * 0.65 * 2;
                        const wasHidden = this.focusCircleEl.style.display === 'none';
                        if (wasHidden && plexAnimator.activeId && !this.isApplyingPendingFocus) {
                            const activeRep = plexAnimator.thtReps.get(plexAnimator.activeId);
                            if (activeRep) {
                                const activeRect = DomUtils.getRect(activeRep.thtEl, this.field);
                                const activeCenterX = activeRect.x + activeRect.width / 2;
                                const activeCenterY = activeRect.y + activeRect.height / 2;
                                this.focusCircleEl.style.width = `${circleSize}px`;
                                this.focusCircleEl.style.height = `${circleSize}px`;
                                this.focusCircleEl.style.left = `${activeCenterX - circleSize / 2}px`;
                                this.focusCircleEl.style.top = `${activeCenterY - circleSize / 2}px`;
                                this.focusCircleEl.style.borderColor = this.getColorString(plexAnimator.colors.thoughtHighlightOutline, 1);
                            }
                            this.focusCircleEl.style.display = 'block';
                            void this.focusCircleEl.offsetHeight;
                        }
                        else if (wasHidden) {
                            this.focusCircleEl.style.display = 'block';
                        }
                        this.focusCircleEl.style.width = `${circleSize}px`;
                        this.focusCircleEl.style.height = `${circleSize}px`;
                        this.focusCircleEl.style.left = `${centerX - circleSize / 2}px`;
                        this.focusCircleEl.style.top = `${centerY - circleSize / 2}px`;
                        this.focusCircleEl.style.borderColor = this.getColorString(plexAnimator.colors.thoughtHighlightOutline, 1);
                        if (this.isApplyingPendingFocus) {
                            this.isApplyingPendingFocus = false;
                        }
                    }
                    else {
                        this.focusCircleEl.style.display = 'none';
                    }
                }
                else {
                    this.focusCircleEl.style.display = 'none';
                }
            }
            else {
                this.focusCircleEl.style.display = 'none';
            }
        }
        if (this.hoveredGateThtId != null) {
            let thtRep = undefined;
            if (this.pressedObjectType == PlexObjectType.ThoughtGate && this.isListGateDragActive && this.listGateDragSourceRep) {
                thtRep = this.listGateDragSourceRep;
            }
            else {
                thtRep = (this.hoveredListRep && this.hoveredListRep.id === this.hoveredGateThtId) ? this.hoveredListRep : plexAnimator.thtReps.get(this.hoveredGateThtId);
            }
            if (thtRep) {
                let gate;
                const isListRep = this.isInAccessoryList(thtRep.thtEl);
                const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
                if (isListRep) {
                    const rectA = DomUtils.getRect(thtRep.thtEl, this.field);
                    gate = this.getGateLocationFromRectAndThoughtRep(rectA, thtRep, this.hoveredGateRelation, false, this.gateDragSourceChildSide);
                }
                else {
                    gate = this.getGateLocationFromThoughtRep(thtRep, this.hoveredGateRelation, this.gateDragSourceChildSide);
                }
                if (this.pressedObjectType == PlexObjectType.ThoughtGate && this.gateDragDestPoint) {
                    this.drawDragLinkPreview(graphics, thtRep, gate, this.hoveredGateRelation, this.gateDragDestPoint);
                }
            }
        }
        if (this.linkPreviewPinned && this.pinnedLinkSrcThtId && this.pinnedLinkDestPoint
            && this.pressedObjectType != PlexObjectType.ThoughtGate) {
            const srcRep = plexAnimator.thtReps.get(this.pinnedLinkSrcThtId);
            if (srcRep) {
                let srcGate;
                const isListRep = this.isInAccessoryList(srcRep.thtEl);
                if (isListRep) {
                    const rectA = DomUtils.getRect(srcRep.thtEl, this.field);
                    srcGate = this.getGateLocationFromRectAndThoughtRep(rectA, srcRep, this.pinnedLinkSrcRelation, false, this.pinnedLinkSrcChildSide);
                }
                else {
                    srcGate = this.getGateLocationFromThoughtRep(srcRep, this.pinnedLinkSrcRelation, this.pinnedLinkSrcChildSide);
                }
                this.drawDragLinkPreview(graphics, srcRep, srcGate, this.pinnedLinkSrcRelation, this.pinnedLinkDestPoint);
            }
        }
        if (this.hoveredGateThtId == null && (this.hoveredControlThtId || this.hoveredThoughtId) && plexAnimator.layout == LayoutType.Force) {
            let thtId = this.hoveredControlThtId ? this.hoveredControlThtId : this.hoveredThoughtId;
            let thtRep = plexAnimator.thtReps.get(thtId);
            if (thtRep) {
                for (let ct = ThoughtControl.Expand; ct <= ThoughtControl.Anchor; ct++) {
                    this.drawControl(graphics, thtRep, ct, ct === this.hoveredControl);
                }
            }
        }
    }
    drawDragLinkPreview(graphics, thtRep, gate, relation, destPoint) {
        let destGate = new Point(destPoint.x, destPoint.y);
        if (plexAnimator.isStraightLinksEnabled) {
            graphics.moveTo(gate.x, gate.y).lineTo(destGate.x, destGate.y)
                .stroke({ width: 1, color: plexAnimator.colors.linkHighlighted });
        }
        else {
            let rectA = DomUtils.getRect(thtRep.thtEl, this.field);
            let rectB = new Rect(destGate.x - plexAnimator.rowHeight / 2, destGate.y - plexAnimator.rowHeight / 2, plexAnimator.rowHeight, plexAnimator.rowHeight);
            let isSecondary = false;
            let layout = plexAnimator.currentLayout;
            let gateRelation = relation;
            let alignment = ThoughtHorizontalAlignment.Center;
            let gen = -1;
            if (plexAnimator.layout == LayoutType.Mindmap && relation == Relation.Child) {
                layout = plexAnimator.mindmapLayout;
            }
            else if (plexAnimator.layout == LayoutType.Mindmap && relation == Relation.Jump) {
                layout = plexAnimator.normalLayout;
                gateRelation = Relation.Child;
            }
            else if (plexAnimator.layout == LayoutType.Mindmap && relation == Relation.Parent) {
                layout = plexAnimator.normalLayout;
                gateRelation = Relation.Parent;
            }
            else if (plexAnimator.layout == LayoutType.Outline && relation == Relation.Child) {
                alignment = ThoughtHorizontalAlignment.Left;
                gen = thtRep.generation + 1;
            }
            else if (plexAnimator.layout == LayoutType.Outline && relation == Relation.Jump) {
                alignment = ThoughtHorizontalAlignment.Right;
                gen = thtRep.generation + 1;
            }
            else if (plexAnimator.layout == LayoutType.Outline && relation == Relation.Parent) {
                alignment = ThoughtHorizontalAlignment.Left;
                gateRelation = Relation.Child;
                gen = thtRep.generation + 1;
            }
            let points = layout.getCurvePoints(gateRelation, rectA, gate, thtRep.generation, thtRep.alignment, rectB, destGate, gen, alignment, isSecondary);
            graphics.moveTo(gate.x, gate.y).bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y)
                .stroke({ width: 1, color: plexAnimator.colors.linkHighlighted });
        }
        graphics.circle(destGate.x, destGate.y, plexAnimator.GATE_SIZE * 2)
            .stroke({ width: 2, color: plexAnimator.colors.gateHighlighted });
        graphics.circle(destGate.x, destGate.y, plexAnimator.GATE_SIZE)
            .fill(plexAnimator.colors.gateNormal);
    }
    endDragLinkPreview() {
        var _a;
        if (!this.linkPreviewPinned) {
            return;
        }
        this.linkPreviewPinned = false;
        this.pinnedLinkSrcThtId = undefined;
        this.pinnedLinkSrcRelation = Relation.Unknown;
        this.pinnedLinkSrcChildSide = undefined;
        this.pinnedLinkDestPoint = undefined;
        this.renderNow = true;
        this.stopAfterNextTick = true;
        if ((_a = this.appBottom) === null || _a === void 0 ? void 0 : _a.ticker) {
            this.appBottom.ticker.start();
        }
    }
    drawControl(graphics, thtRep, controlType, isHighlighted) {
        if (controlType == ThoughtControl.Chevron) {
            let shouldDrawChevron = false;
            if (thtRep.expandDirection == ThoughtExpandDirection.Parent && thtRep.parentGate !== GateStatus.Empty ||
                (thtRep.expandDirection == ThoughtExpandDirection.Child || thtRep.expandDirection == ThoughtExpandDirection.ChildLeft) && thtRep.childGate !== GateStatus.Empty) {
                shouldDrawChevron = true;
            }
            if (shouldDrawChevron) {
                let chevron = this.getChevronLocation(thtRep.thtEl, thtRep.alignment);
                let rad = 0.4 * plexAnimator.rowHeight / 2;
                let fillColor = '#' + ('000000' + plexAnimator.colors.thoughtText.toString(16)).slice(-6);
                let targetAngle = 0;
                if (thtRep.expandDirection == ThoughtExpandDirection.Child) {
                    targetAngle = thtRep.childGate === GateStatus.Full ? 90 : 0;
                }
                else if (thtRep.expandDirection == ThoughtExpandDirection.ChildLeft) {
                    targetAngle = thtRep.childGate === GateStatus.Full ? -90 : 0;
                }
                else if (thtRep.expandDirection == ThoughtExpandDirection.Parent) {
                    targetAngle = thtRep.parentGate === GateStatus.Full ? -90 : 0;
                }
                let baseAngle = 0;
                if (thtRep.expandDirection == ThoughtExpandDirection.ChildLeft || thtRep.expandDirection == ThoughtExpandDirection.Parent) {
                    baseAngle = 180;
                }
                thtRep.chevronTargetAngle = baseAngle + targetAngle;
                if (isNaN(thtRep.chevronAngle)) {
                    thtRep.chevronAngle = thtRep.chevronTargetAngle;
                }
                const degreesPerFrame = 6.0;
                let diff = thtRep.chevronTargetAngle - thtRep.chevronAngle;
                while (diff > 180)
                    diff -= 360;
                while (diff < -180)
                    diff += 360;
                let maxStep = degreesPerFrame * Math.min(this.deltaSinceLastDraw, 2.0);
                if (Math.abs(diff) < 0.5) {
                    thtRep.chevronAngle = thtRep.chevronTargetAngle;
                }
                else if (Math.abs(diff) <= maxStep) {
                    thtRep.chevronAngle = thtRep.chevronTargetAngle;
                }
                else {
                    thtRep.chevronAngle += Math.sign(diff) * maxStep;
                    this.chevronAnimating = true;
                }
                let svgCode = this.getChevronRightSvg(fillColor);
                let opacity = getComputedStyle(thtRep.thtEl).opacity;
                let opacityNum = +opacity;
                let isChevronHovered = this.hoveredControlThtId === thtRep.id && this.hoveredControl === ThoughtControl.Chevron;
                let chevronAlpha = isChevronHovered ? 1.0 : this.chevronUnhoveredOpacity;
                this.drawSvgCenteredRotated(graphics, svgCode, chevron, rad * 1.6, thtRep.chevronAngle, { color: plexAnimator.colors.thoughtText, alpha: chevronAlpha * opacityNum }, { color: plexAnimator.colors.thoughtBackground, alpha: 0.85 * chevronAlpha * opacityNum, width: 4.0 });
            }
            return;
        }
        let isEnabled = true;
        if (controlType === ThoughtControl.Expand) {
            isEnabled = plexAnimator.canExpand(thtRep);
        }
        else if (controlType === ThoughtControl.Collapse) {
            isEnabled = plexAnimator.canCollapse(thtRep);
        }
        if (!isEnabled) {
            isHighlighted = false;
        }
        let cen = this.getControlLocation(thtRep, controlType);
        graphics.circle(cen.x, cen.y, plexAnimator.CONTROL_SIZE / 2)
            .fill({ color: plexAnimator.colors.thoughtBackground, alpha: 0.5 });
        graphics.circle(cen.x, cen.y, plexAnimator.CONTROL_SIZE / 2)
            .stroke({ width: 1, color: plexAnimator.colors.thoughtText, alpha: isHighlighted ? 1 : isEnabled ? 0.5 : 0.25 });
        let unit = plexAnimator.CONTROL_SIZE / 4;
        graphics.lineStyle(1, plexAnimator.colors.thoughtText, isEnabled ? 1 : 0.5);
        switch (controlType) {
            case ThoughtControl.Expand:
                graphics.moveTo(cen.x, cen.y - unit).lineTo(cen.x, cen.y + unit)
                    .stroke({ width: 1, color: plexAnimator.colors.thoughtText, alpha: isEnabled ? 1 : 0.5 });
                graphics.moveTo(cen.x - unit, cen.y).lineTo(cen.x + unit, cen.y)
                    .stroke({ width: 1, color: plexAnimator.colors.thoughtText, alpha: isEnabled ? 1 : 0.5 });
                break;
            case ThoughtControl.Collapse:
                graphics.moveTo(cen.x - unit, cen.y).lineTo(cen.x + unit, cen.y)
                    .stroke({ width: 1, color: plexAnimator.colors.thoughtText, alpha: isEnabled ? 1 : 0.5 });
                break;
            case ThoughtControl.Anchor:
                if (plexAnimator.forceLayout.nodeIsAnchored(thtRep.id)) {
                    graphics.circle(cen.x, cen.y, plexAnimator.CONTROL_SIZE / 2).fill(plexAnimator.colors.thoughtText);
                }
                graphics.moveTo(cen.x, cen.y - unit * 0.6).lineTo(cen.x, cen.y + unit)
                    .stroke({ width: 1, color: plexAnimator.colors.thoughtText, alpha: isEnabled ? 1 : 0.5 });
                graphics.moveTo(cen.x - unit * 0.7, cen.y - unit * 0.6).lineTo(cen.x + unit * 0.7, cen.y - unit * 0.6)
                    .stroke({ width: 1, color: plexAnimator.colors.thoughtText, alpha: isEnabled ? 1 : 0.5 });
                break;
        }
    }
    getChevronLocation(element, align) {
        let rect = DomUtils.getRect(element, this.field);
        let cen = rect.getCenter();
        let rad = plexAnimator.rowHeight / 2;
        return new Point(align === ThoughtHorizontalAlignment.Right ? rect.right() + 1.2 * rad : rect.x - 1.2 * rad, cen.y);
    }
    getAnchorSvg(fillColor) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="${fillColor}" d="M320 96a32 32 0 1 1 -64 0 32 32 0 1 1 64 0zm21.1 80C367 158.8 384 129.4 384 96c0-53-43-96-96-96s-96 43-96 96c0 33.4 17 62.8 42.9 80L224 176c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 0 208-48 0c-53 0-96-43-96-96l0-6.1 7 7c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9L97 263c-9.4-9.4-24.6-9.4-33.9 0L7 319c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l7-7 0 6.1c0 88.4 71.6 160 160 160l80 0 80 0c88.4 0 160-71.6 160-160l0-6.1 7 7c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-56-56c-9.4-9.4-24.6-9.4-33.9 0l-56 56c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l7-7 0 6.1c0 53-43 96-96 96l-48 0 0-208 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-10.9 0z"/></svg>`;
    }
    getChevronDownSvg(fillColor) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${fillColor}" d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192"/></svg>`;
    }
    getChevronUpSvg(fillColor) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${fillColor}" d="M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192"/></svg>`;
    }
    getChevronRightSvg(fillColor) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><path fill="${fillColor}" d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192"/></svg>`;
    }
    getChevronLeftSvg(fillColor) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><path fill="${fillColor}" d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192"/></svg>`;
    }
    drawSvgCentered(graphics, svg, center, svgHeight, fillObject, strokeObject) {
        let h = 512;
        let w = 512;
        let viewBoxBits = svg.match(/viewBox="([^"]*)"/);
        if (viewBoxBits != null) {
            let pieces = viewBoxBits[1].split(" ");
            h = +pieces[3];
            w = +pieces[2];
        }
        let r = w / h;
        graphics
            .translateTransform(center.x - svgHeight * 0.5 * r, center.y - svgHeight * 0.5)
            .scaleTransform(1.0 / h * svgHeight)
            .svg(svg)
            .stroke(strokeObject)
            .resetTransform();
        graphics
            .translateTransform(center.x - svgHeight * 0.5 * r, center.y - svgHeight * 0.5)
            .scaleTransform(1.0 / h * svgHeight)
            .svg(svg)
            .fill(fillObject)
            .resetTransform();
    }
    drawSvgCenteredRotated(graphics, svg, center, svgHeight, angleDegrees, fillObject, strokeObject) {
        let h = 512;
        let w = 512;
        let viewBoxBits = svg.match(/viewBox="([^"]*)"/);
        if (viewBoxBits != null) {
            let pieces = viewBoxBits[1].split(" ");
            h = +pieces[3];
            w = +pieces[2];
        }
        let r = w / h;
        let angleRad = angleDegrees * Math.PI / 180;
        graphics
            .translateTransform(center.x, center.y)
            .rotateTransform(angleRad)
            .translateTransform(-svgHeight * 0.5 * r, -svgHeight * 0.5)
            .scaleTransform(1.0 / h * svgHeight)
            .svg(svg)
            .stroke(strokeObject)
            .resetTransform();
        graphics
            .translateTransform(center.x, center.y)
            .rotateTransform(angleRad)
            .translateTransform(-svgHeight * 0.5 * r, -svgHeight * 0.5)
            .scaleTransform(1.0 / h * svgHeight)
            .svg(svg)
            .fill(fillObject)
            .resetTransform();
    }
    isInteractionThought(id) {
        if (this.hoveredListRep && this.hoveredListRep.id === id) {
            return false;
        }
        return id === this.hoveredThoughtId || id === this.hoveredGateThtId;
    }
    drawGates(graphics) {
        var _a;
        plexAnimator.thtReps.forEach((thtRep) => {
            var _a;
            if (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
                const chevronGraphics = this.isInteractionThought(thtRep.id) ? this.graphicsInteraction : this.graphicsTop;
                this.drawControl(chevronGraphics, thtRep, ThoughtControl.Chevron, false);
            }
            if (thtRep.thtEl.classList.contains("related-thought")) {
                return;
            }
            if (plexAnimator.layout == LayoutType.Mindmap) {
                let isValid = false;
                if (this.hoveredThoughtId != null && thtRep.id == this.hoveredThoughtId) {
                    isValid = true;
                }
                if (this.hoveredGateThtId != null && thtRep.id == this.hoveredGateThtId) {
                    isValid = true;
                }
                if (thtRep.zone == "parent" || thtRep.zone == "jump") {
                    isValid = false;
                }
                if (!isValid) {
                    return;
                }
            }
            const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
            const g = this.isInteractionThought(thtRep.id) ? this.graphicsInteraction : graphics;
            let color;
            let gate;
            let opacity = getComputedStyle(thtRep.thtEl).opacity;
            let opacityNum = +opacity;
            let rad = plexAnimator.rowHeight / 28.0 * plexAnimator.GATE_SIZE * opacityNum;
            if (plexAnimator.layout == LayoutType.Mindmap && isActiveThought) {
                gate = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'left');
                color = plexAnimator.colors.gateNormal;
                if (thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted;
                }
                if (thtRep.childGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({ color: color, alpha: opacity });
                }
                else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({ width: 1, color: color, alpha: opacity });
                }
                gate = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'right');
                color = plexAnimator.colors.gateNormal;
                if (thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted;
                }
                if (thtRep.childGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({ color: color, alpha: opacity });
                }
                else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({ width: 1, color: color, alpha: opacity });
                }
            }
            else {
                gate = this.getGateLocationFromThoughtRep(thtRep, Relation.Child);
                color = plexAnimator.colors.gateNormal;
                if (thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted;
                }
                if (thtRep.childGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({ color: color, alpha: opacity });
                }
                else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({ width: 1, color: color, alpha: opacity });
                }
            }
            gate = this.getGateLocationFromThoughtRep(thtRep, 2);
            color = plexAnimator.colors.gateNormal;
            if (thtRep.parentGate === GateStatus.More) {
                color = plexAnimator.colors.gateHighlighted;
            }
            if (thtRep.parentGate !== GateStatus.Empty) {
                g.circle(gate.x, gate.y, rad)
                    .fill({ color: color, alpha: opacity });
            }
            else {
                g.circle(gate.x, gate.y, rad)
                    .stroke({ width: 1, color: color, alpha: opacity });
            }
            if (plexAnimator.layout != LayoutType.Mindmap || isActiveThought) {
                gate = this.getGateLocationFromThoughtRep(thtRep, 3);
                color = plexAnimator.colors.gateNormal;
                if (thtRep.jumpGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted;
                }
                if (thtRep.jumpGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({ color: color, alpha: opacity });
                }
                else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({ width: 1, color: color, alpha: opacity });
                }
            }
            if (this.hoveredGateThtId && thtRep.id === this.hoveredGateThtId && this.hoveredGateRelation
                && this.isInteractionThought(thtRep.id)) {
                gate = this.getGateLocationFromThoughtRep(thtRep, this.hoveredGateRelation, this.hoveredGateChildSide);
                g.circle(gate.x, gate.y, rad * 2.0)
                    .stroke({ width: 2, color: plexAnimator.colors.gateHighlighted, alpha: opacity });
            }
        });
        if (this.hoveredListRep != null) {
            const thtRep = this.hoveredListRep;
            if (thtRep) {
                const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
                let color;
                let gate;
                let listOpacity = 1.0;
                let listRad = plexAnimator.rowHeight / 28.0 * plexAnimator.GATE_SIZE * listOpacity;
                let rect = DomUtils.getRect(thtRep.thtEl, this.field);
                gate = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, Relation.Child, false);
                color = plexAnimator.colors.gateNormal;
                if (thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted;
                }
                if (thtRep.childGate !== GateStatus.Empty) {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .fill({ color: color, alpha: listOpacity });
                }
                else {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .stroke({ width: 1, color: color, alpha: listOpacity });
                }
                gate = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, Relation.Parent, false);
                color = plexAnimator.colors.gateNormal;
                if (thtRep.parentGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted;
                }
                if (thtRep.parentGate !== GateStatus.Empty) {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .fill({ color: color, alpha: listOpacity });
                }
                else {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .stroke({ width: 1, color: color, alpha: listOpacity });
                }
                gate = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, Relation.Jump, false);
                color = plexAnimator.colors.gateNormal;
                if (thtRep.jumpGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted;
                }
                if (thtRep.jumpGate !== GateStatus.Empty) {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .fill({ color: color, alpha: listOpacity });
                }
                else {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .stroke({ width: 1, color: color, alpha: listOpacity });
                }
            }
        }
        if (this.hoveredGateThtId && this.hoveredListRep && this.hoveredListRep.id === this.hoveredGateThtId) {
            const rep = this.hoveredListRep;
            let rect = DomUtils.getRect(rep.thtEl, this.field);
            let gate = this.getGateLocationFromRectAndThoughtRep(rect, rep, this.hoveredGateRelation, false);
            let listRad = plexAnimator.rowHeight / 28.0 * plexAnimator.GATE_SIZE;
            this.graphicsInteraction.circle(gate.x, gate.y, listRad * 2.0)
                .stroke({ width: 2, color: plexAnimator.colors.gateHighlighted, alpha: 1.0 });
        }
    }
    getRepForThoughtIdNearestToPoint(id, fieldPoint) {
        var _a, _b, _c;
        let candidates = [];
        const plexRep = plexAnimator.thtReps.get(id);
        if (plexRep)
            candidates.push(plexRep);
        const pinned = (_a = plexAnimator.pinnedListLayout) === null || _a === void 0 ? void 0 : _a.getRep(id);
        if (pinned)
            candidates.push(pinned);
        const past = (_b = plexAnimator.pastListLayout) === null || _b === void 0 ? void 0 : _b.getRep(id);
        if (past)
            candidates.push(past);
        const selected = (_c = plexAnimator.selectedListLayout) === null || _c === void 0 ? void 0 : _c.getRep(id);
        if (selected)
            candidates.push(selected);
        if (candidates.length === 0)
            return undefined;
        let best = undefined;
        let bestDist = Number.MAX_VALUE;
        for (const rep of candidates) {
            const rect = DomUtils.getRect(rep.thtEl, this.field);
            const cen = rect.getCenter();
            const dx = cen.x - fieldPoint.x;
            const dy = cen.y - fieldPoint.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
                bestDist = d2;
                best = rep;
            }
        }
        return best;
    }
    getGateLocation(element, gateType, thtRepAlign, isGateBEastOfA, isListRep, isActiveThought, childGateSide, zone = null) {
        let rect = DomUtils.getRect(element, this.field);
        let opacity = getComputedStyle(element).opacity;
        let opacityNum = +opacity;
        return this.getGateLocationFromRect(opacityNum, rect, gateType, plexAnimator.nodeJumpsIds.has(element.id.substring(4, 40)), thtRepAlign, isGateBEastOfA, isListRep, isActiveThought, childGateSide, zone);
    }
    getGateLocationFromRect(animScale, rect, gateType, isJump, align, isGateBEastOfA, isListRep, isActiveThought, childGateSide, zone = null) {
        let cen = rect.getCenter();
        let dx = rect.height / 3.464 * animScale;
        if (isListRep) {
            dx = plexAnimator.rowHeight / 3.464 * animScale;
        }
        else if (plexAnimator.layout == LayoutType.Normal && isActiveThought) {
            dx = plexAnimator.rowHeight / 3.464 * animScale;
        }
        if (plexAnimator.layout == LayoutType.Mindmap && !isListRep) {
            if (zone === "parent") {
                if (gateType == Relation.Child) {
                    cen.y += rect.height / 2;
                    return cen;
                }
            }
            if (zone === "jump") {
                if (gateType == Relation.Jump) {
                    cen.y -= rect.height / 2;
                    return cen;
                }
            }
            if (gateType === Relation.Parent && isActiveThought) {
                cen.y -= rect.height / 2;
            }
            else if (gateType === Relation.Parent) {
                if (align == ThoughtHorizontalAlignment.Right) {
                    cen.x += rect.width / 2;
                }
                else {
                    cen.x -= rect.width / 2;
                }
            }
            else if (gateType === Relation.Child) {
                if (isActiveThought && childGateSide) {
                    if (childGateSide === 'left') {
                        cen.x -= rect.width / 2;
                    }
                    else {
                        cen.x += rect.width / 2;
                    }
                }
                else {
                    if (align == ThoughtHorizontalAlignment.Right) {
                        cen.x -= rect.width / 2;
                    }
                    else {
                        cen.x += rect.width / 2;
                    }
                }
            }
            else if (gateType === Relation.Jump) {
                cen.y += rect.height / 2;
            }
        }
        else if (gateType === Relation.Jump) {
            if (isJump) {
                cen.x += rect.width / 2;
            }
            else {
                cen.x -= rect.width / 2;
            }
        }
        else if (gateType === Relation.Child) {
            cen.y += rect.height / 2;
            if (align === ThoughtHorizontalAlignment.Center) {
                cen.x += dx;
            }
            else if (align === ThoughtHorizontalAlignment.Left) {
                cen.x = rect.x + 3.5 * dx;
            }
            else if (align === ThoughtHorizontalAlignment.Right) {
                cen.x = rect.right() - 1.5 * dx;
            }
        }
        else if (gateType === Relation.Parent) {
            cen.y -= rect.height / 2;
            if (align === ThoughtHorizontalAlignment.Center) {
                cen.x -= dx;
            }
            else if (align === ThoughtHorizontalAlignment.Left) {
                cen.x = rect.x + 1.5 * dx;
            }
            else if (align === ThoughtHorizontalAlignment.Right) {
                cen.x = rect.right() - 3.5 * dx;
            }
        }
        return cen;
    }
    getGateLocationFromThoughtRep(thtRep, gateType, childGateSide) {
        var _a;
        const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
        return this.getGateLocation(thtRep.thtEl, gateType, thtRep.alignment, this.IGNORED, thtRep.isListRep, isActiveThought, childGateSide);
    }
    getGateLocationFromRectAndThoughtRep(rect, thtRep, gateType, isJump, childGateSide) {
        var _a;
        const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
        return this.getGateLocationFromRect(1.0, rect, gateType, isJump, thtRep.alignment, this.IGNORED, thtRep.isListRep, isActiveThought, childGateSide, thtRep.zone);
    }
    getGateLocationFromRectAndThoughtRepForLink(rect, thtRep, gateType, isJump, isGateBEastOfA, childGateSide) {
        var _a;
        const isActiveThought = thtRep.id == ((_a = plexAnimator.node) === null || _a === void 0 ? void 0 : _a.id);
        if (thtRep.actualContentWidth && plexAnimator.layout === LayoutType.Mindmap && !isActiveThought) {
            const adjustedRect = new Rect(rect.x, rect.y, thtRep.actualContentWidth, rect.height);
            return this.getGateLocationFromRect(1.0, adjustedRect, gateType, isJump, thtRep.alignment, isGateBEastOfA, thtRep.isListRep, isActiveThought, childGateSide, thtRep.zone);
        }
        return this.getGateLocationFromRect(1.0, rect, gateType, isJump, thtRep.alignment, isGateBEastOfA, thtRep.isListRep, isActiveThought, childGateSide, thtRep.zone);
    }
    getControlLocation(thtRep, control) {
        let element = thtRep.thtEl;
        let rect = DomUtils.getRect(element, this.field);
        let cen = rect.getCenter();
        if (control === ThoughtControl.Expand) {
            cen.x -= plexAnimator.CONTROL_OFFSET + plexAnimator.CONTROL_SIZE * 2;
            cen.y -= rect.height * 0.3 + plexAnimator.CONTROL_SIZE / 2;
        }
        else if (control === ThoughtControl.Collapse) {
            cen.x -= plexAnimator.CONTROL_OFFSET + plexAnimator.CONTROL_SIZE;
            cen.y -= rect.height * 0.3 + plexAnimator.CONTROL_SIZE / 2;
        }
        else if (control === ThoughtControl.Anchor) {
            cen.x -= plexAnimator.CONTROL_OFFSET;
            cen.y -= rect.height * 0.3 + plexAnimator.CONTROL_SIZE / 2;
        }
        else if (control === ThoughtControl.Chevron) {
            return this.getChevronLocation(element, thtRep.alignment);
        }
        return cen;
    }
    onContextMenu(event) {
        var _a, _b, _c, _d;
        event.preventDefault();
        let objectType = this.pressedObjectType;
        this.pressedObjectType = PlexObjectType.Nothing;
        if (!this.hasDragExceededClickDistance) {
            let cursorPoint = new Point(event.clientX, event.clientY);
            if (objectType == PlexObjectType.Background) {
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForPlex", [cursorPoint]);
            }
            else if (objectType == PlexObjectType.Thought) {
                const g = plexAnimator.layout == LayoutType.Outline && this.hoveredThoughtId
                    ? this.outlineGroupOf.get(this.hoveredThoughtId) : null;
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThought", [cursorPoint, this.hoveredThoughtId, (_a = g === null || g === void 0 ? void 0 : g.parentId) !== null && _a !== void 0 ? _a : "", (_b = g === null || g === void 0 ? void 0 : g.relationType) !== null && _b !== void 0 ? _b : ""]);
            }
            else if (objectType == PlexObjectType.ThoughtGate && this.hoveredGateThtId) {
                const g = plexAnimator.layout == LayoutType.Outline
                    ? this.outlineGroupOf.get(this.hoveredGateThtId) : null;
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThought", [cursorPoint, this.hoveredGateThtId, (_c = g === null || g === void 0 ? void 0 : g.parentId) !== null && _c !== void 0 ? _c : "", (_d = g === null || g === void 0 ? void 0 : g.relationType) !== null && _d !== void 0 ? _d : ""]);
            }
            else if (objectType == PlexObjectType.Link && this.hoveredLinkId) {
                this.willChangeSelectedLinks();
                this.selectedLinkIds.clear();
                this.selectedLinkIds.add(this.hoveredLinkId);
                this.didChangeSelectedLinks(false);
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForLink", [cursorPoint, this.hoveredLinkId]);
            }
            else if (objectType == PlexObjectType.ThoughtIcon && this.hoveredThoughtIconId) {
                let thtIconId = this.hoveredThoughtIconId;
                this.hoveredThoughtIconId = undefined;
                this.hoveredThoughtIconIdChanged(undefined, thtIconId);
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThoughtIcon", [cursorPoint, thtIconId]);
            }
            else if (objectType == PlexObjectType.ThoughtDecorator
                && this.hoveredDecorationThtId
                && this.hoveredDecorationType === "tag") {
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForTag", [cursorPoint, this.hoveredDecorationThtId, this.hoveredDecorationId]);
            }
        }
    }
}
PlexCanvas.HOVER_CLONE_FADE_MS = 250;
PlexCanvas.HOVER_LABEL_FADE_MS = 500;
PlexCanvas.HOVER_CLONE_OPACITY_TRANSITION = `opacity ${PlexCanvas.HOVER_CLONE_FADE_MS}ms ease`;
PlexCanvas.HOVER_LABEL_OPACITY_TRANSITION = `opacity ${PlexCanvas.HOVER_LABEL_FADE_MS}ms ease`;
PlexCanvas.ZONE_FLIP_DURATION_MS = 200;
export const plexCanvas = new PlexCanvas();
//# sourceMappingURL=plexCanvas.js.map