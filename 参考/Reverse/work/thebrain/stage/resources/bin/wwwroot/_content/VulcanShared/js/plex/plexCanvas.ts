// @ts-ignore
import {Collider, CubicCollider, LineCollider, PI, Point, Rect} from "/_content/Venus/js/dist/geometry.js"
import {Relation, RelationHelper} from "./core.js";
import {Scrollbar} from "./scrollbar.js";
import {plexAnimator} from "./plexAnimator.js";
import {LinkRep} from "./linkRep.js";
import {GateStatus, LayoutType, LinkMeaning, PlexObjectType, ThoughtControl, ThoughtExpandDirection, ThoughtHorizontalAlignment} from "./enums.js";
// @ts-ignore
import {DomUtils} from "/_content/Venus/js/dist/domUtils.js"
import {safeInvoke, safeInvokeAsync} from "../interop.js";
import {ThoughtRep} from "./thoughtRep.js";
import {contentEditableFieldHelper} from "../contentEditableFieldHelper.js";
import {Canvas2DApplication, Canvas2DGraphics} from "./canvas2DGraphics.js";
import {BaseLayout} from "./baseLayout.js";

export class DebugRect {
    constructor(public rect: Rect, public color: number = 0x000000, public strokeWidth: number = 1.0) {}
}

// Current text-scale setting and its allowed range, returned by PlexControl.BeginPlexPinch.
// defaultPercent is the size the fixed reference circle represents (100%).
interface PinchInfo {
    baselinePercent: number;
    minPercent: number;
    maxPercent: number;
    step: number;
    defaultPercent: number;
}

class PlexCanvas {

    FPS = 60;
    MAX_CLICK_DIST = 7;
    HOLD_TIME_MS = 500;

    // Hover-clone fade-in durations
    private static readonly HOVER_CLONE_FADE_MS = 250;
    private static readonly HOVER_LABEL_FADE_MS = 500;
    private static readonly HOVER_CLONE_OPACITY_TRANSITION = `opacity ${PlexCanvas.HOVER_CLONE_FADE_MS}ms ease`;
    private static readonly HOVER_LABEL_OPACITY_TRANSITION = `opacity ${PlexCanvas.HOVER_LABEL_FADE_MS}ms ease`;

    // Bottom layer for links
    appBottom: Canvas2DApplication | null = null;
    graphicsBottom!: Canvas2DGraphics;
    // Top layer for gates and beyond
    appTop: Canvas2DApplication | null = null;
    graphicsTop!: Canvas2DGraphics;
    // Interaction layer: only what the user is currently interacting with (the hovered
    // thought's gates and the drag link line). Sits above the accessory panels (z-10) and
    // the hover-clone (z-30) so those interactions are visible/clickable on top, while the
    // base gate canvas (appTop) stays below the panels.
    appInteraction: Canvas2DApplication | null = null;
    graphicsInteraction!: Canvas2DGraphics;

    field!: HTMLElement;
    focusCircleEl: HTMLElement | null = null;
    private topCanvasHost: HTMLElement | null = null;
    private topCanvasHostWasStatic: boolean = false;
    private syncTopCanvasPositionListener = () => this.syncTopCanvasPosition();
    private hoveredListOverlayEl: HTMLElement | null = null;
    private listOverlayExpandsVertically = true;
    private currentListOverlayExpandsVertically = true;
    private lastPointerClientPoint: Point | null = null;
    private lastPointerType: string = 'mouse';

    // Store ticker callback reference for proper removal (prevents accumulation on brain switch)
    private tickerCallback: ((info: any) => void) | null = null;

    linkColliders: { [key: string]: Collider } | undefined;

    // Grid position lookup for Normal layout keyboard navigation
    gridPositionToThoughtId: Map<string, string> = new Map();

    // Outline layout: maps each thought ID to its parent and relation type in the rendered tree
    outlineGroupOf: Map<string, {parentId: string, relationType: string}> = new Map();

    // Pending focus after scroll completes
    pendingFocusAfterScroll: string | undefined;
    isApplyingPendingFocus: boolean = false;

    scrollbars: Scrollbar[] = [];

    selectedThoughtIds: Array<string> = new Array<string>;
    selectedLinkIds: Set<string> = new Set<string>;
    previousSelectedLinkIds: Set<string> = new Set<string>;
    private marchingAntsObserver: MutationObserver | null = null;
    private marchingAntsResizeObserver: ResizeObserver | null = null; 

    hoveredThoughtId: string | undefined;
    hoveredLinkId: string | undefined;
    hoveredThoughtIconId: string | undefined;

    hoveredDecorationThtId: string | undefined;
    hoveredDecorationId: string | undefined; // tag id or special fixed id for note/event indicator
    hoveredDecorationType: string | undefined; // "private", "note", "event", or "tag"
    // Rest-state bounds of the tag expanded by the decoration hover (captured before expansion,
    // with the thought's bounds at the same moment so plex movement can be compensated). The
    // hover releases as soon as the pointer leaves these bounds — the expanded label must not
    // hold the hover, or it would block reaching the neighboring tags it covers.
    private expandedDecoration: { decorationId: string, restRect: DOMRect, thtRect: DOMRect } | undefined;

    hoveredNoteIndicatorTimeout: number | undefined;

    hoveredGateThtId: string | undefined;
    hoveredGateRelation: Relation = Relation.Unknown;
    hoveredGateChildSide: 'left' | 'right' | undefined;
    gateDragSourceChildSide: 'left' | 'right' | undefined; // Captures child side at drag start
    gateDragDestPoint: Point | undefined;
    gateDragDestThtId: string | undefined;
    // Pinned drag-link preview: kept on screen after release in empty area while the
    // CreateThought dialog is open, so the user keeps seeing the in-progress link.
    linkPreviewPinned: boolean = false;
    pinnedLinkSrcThtId: string | undefined;
    pinnedLinkSrcRelation: Relation = Relation.Unknown;
    pinnedLinkSrcChildSide: 'left' | 'right' | undefined;
    pinnedLinkDestPoint: Point | undefined;
    isListGateDragActive: boolean = false;
    // For drags that originate from Pinned/Past lists, keep a stable source rep
    private listGateDragSourceRep: ThoughtRep | undefined;
    // When hovering list items (Pinned/Past) track the specific rep
    hoveredListRep: ThoughtRep | undefined;
    private lastListRepHit: ThoughtRep | undefined;

    hoveredControlThtId: string | undefined;
    hoveredControl: ThoughtControl = ThoughtControl.Undefined;

    isAnimating = false; // this does not get set to true for brief animations
    stopAfterNextTick = false;
    renderNow = false;
    deltaSinceLastDraw = 0;
    chevronAnimating = false; // true while any chevron is mid-rotation
    chevronUnhoveredOpacity = 0.45; // chevron opacity when not mouse-hovered (full opacity when hovered)

    isSearchUIShowing: boolean = false;
    isDialogShowing: boolean = false;

    private _pressedObjectType: PlexObjectType = PlexObjectType.Nothing;
    get pressedObjectType(): PlexObjectType { return this._pressedObjectType; }
    set pressedObjectType(value: PlexObjectType) {
        const wasGate = this._pressedObjectType === PlexObjectType.ThoughtGate;
        const isGate = value === PlexObjectType.ThoughtGate;
        this._pressedObjectType = value;
        // Mirror gate-drag state on body so plexAccessory's drag-reorder can avoid
        // starting when a gate drag has already begun on the same mousedown.
        if(wasGate !== isGate) {
            if(isGate) document.body.classList.add('plex-gate-dragging');
            else document.body.classList.remove('plex-gate-dragging');
        }
    }
    pointerDownPoint: Point | undefined;
    pointerDownIsPrimary = false;
    lastDragPoint: Point | undefined;
    hasDragExceededClickDistance = false;
    // Track current dragged thought for zone drop in Normal layout
    draggedThoughtId: string | undefined;
    currentDropZone: string | null = null;
    draggedThoughtOriginalLeft: number | null = null;
    draggedThoughtOriginalTop: number | null = null;
    draggedThoughtSourceZone: string | null = null;
    hasLeftSourceZone: boolean = false;

    // Zone drag placeholder + FLIP animation state
    private zoneDragSlots: { x: number; y: number; w: number; h: number; col: number; alignment: ThoughtHorizontalAlignment }[] = [];
    private zoneDragThoughtOrder: string[] = []; // non-dragged thought IDs in grid order
    private zoneDragOriginalHeightByThought: Map<string, number> = new Map();
    // Per-thought vertical stride from the original layout. For inner thoughts in
    // Mindmap this encodes the full subtree height that was reserved beneath the
    // sibling — using it during drag preserves expanded-children spacing.
    private zoneDragOriginalStrideByThought: Map<string, number> = new Map();
    // Per-thought card-shift relative to its logical row top. Mindmap centers an
    // inner thought's card vertically within its subtree by shifting the card down
    // by (subtreeHeight - cardHeight)/2 — see mindmapLayout.layoutGenerationsGoingSideways
    // (reverseDeltaY). Without accounting for this, a short placeholder dropped above
    // a tall-subtree thought is positioned at the tall thought's mid-subtree card top
    // instead of the column's logical top, looking biased low.
    private zoneDragReverseDeltaYByThought: Map<string, number> = new Map();
    private zoneDragColumnStartY: Map<number, number> = new Map();
    private zoneDragPlaceholder: HTMLElement | null = null;
    private zoneDragCurrentDropIndex: number = -1;
    private zoneDragOriginalIndex: number = -1;
    private static readonly ZONE_FLIP_DURATION_MS = 200;

    resizeDelay = 250;
    resizeEventTimerHandle: number | undefined;

    // Double-click tracking for background
    lastBackgroundClickTime: number = 0;
    DOUBLE_CLICK_THRESHOLD_MS: number = 350;

    // touch state variables are all prefixed with "touch_" to avoid confusion with mouse events
    touch_lastStartTime: Date = new Date();
    touch_isDown: boolean = false;
    touch_hasDraggedTooFar = false;
    touch_lastSavedFakePointerEvent: any = false;
    touch_shouldPassThroughToScrollPage: boolean = false;
    touch_isDraggingScrollbar: boolean = false;
    touch_didPressAndHold: boolean = false;
    touch_holdTimeoutId: number | null = null;
    // A two-finger gesture either pans the plex vertically (Normal layouts; the equivalent of
    // dragging the background with a mouse, since single-finger vertical swipes are reserved on
    // phone for the content-reveal / search gestures) OR pinch-zooms the text scale (all
    // layouts). The two are mutually exclusive: the first decisive movement locks the mode.
    touch_isTwoFingerDragging: boolean = false;
    touch_twoFingerMode: "undecided" | "pan" | "pinch" = "undecided";
    touch_twoFingerStartCenter: Point | null = null;
    touch_twoFingerLastCenter: Point | null = null;
    touch_twoFingerStartDistance: number = 0;
    // Pinch shows two overlay circles (a fixed reference + one that scales with the gesture) as
    // feedback, rather than transforming the plex itself — the real text scale only changes on
    // commit, so text and positions can never desync mid-gesture. baselinePercent/min/max/step
    // come from BeginPlexPinch; lastFactor is the most recent (clamped) scale factor.
    touch_pinchInfo: PinchInfo | null = null;
    touch_pinchLastFactor: number = 1;
    touch_pinchOrigin: Point | null = null;
    private pinchCircleStatic: HTMLElement | null = null;
    private pinchCircleDynamic: HTMLElement | null = null;
    private pinchCircleBaseRadius: number = 0;
    private readonly TWO_FINGER_MIN_PINCH_DISTANCE = 30;
    // Pixels of finger travel before the gesture locks into pan or pinch.
    private readonly TWO_FINGER_DECIDE_PX = 12;

    cleanUpTimeoutId: number = 0;
    private hoverSuppressedUntil = 0;
    private readonly hoverSuppressionPaddingSeconds = 0.05;
    private readonly animationPaddingSeconds = 0.2;
    
    // Selection rectangle state
    isDrawingSelectionRect: boolean = false;
    selectionRectStartPoint: Point | undefined;
    selectionRectEndPoint: Point | undefined;
    selectionRectHighlightedThoughts: Set<string> = new Set<string>();
    selectionRectDeselectionPreviewThoughts: Set<string> = new Set<string>();
    selectionRectInitialSelectedThoughtIds: string[] | null = null;
    
    private debugRects: DebugRect[] = [];
    private showDebugRects: boolean = false;
    public debugRectsPush(drect: DebugRect): void {
        if(!this.showDebugRects) {
            return;
        }
        this.debugRects.push(drect);
    }
    
    public debugRectsClear() {
        if(!this.showDebugRects) {
            return;
        }
        this.debugRects = [];
    }
    
	private radialMenuTouchMoveListener = (event: TouchEvent) => this.handleTouchMoveFromRadialMenu(event);
	private radialMenuTouchEndListener = (event: TouchEvent) => this.handleTouchEndFromRadialMenu(event);
    private onKeyDownListener = (event: KeyboardEvent) => this.onKeyDown(event);
    private globalMouseMoveListener = (event: MouseEvent) => this.handleGlobalMouseMove(event);
    private globalMouseDownListener = (event: MouseEvent) => this.handleGlobalMouseDown(event);
    private globalMouseUpListener = (event: MouseEvent) => this.handleGlobalMouseUp(event);
    // Field event listener references for proper cleanup
    private onSelectStartListener = (e: Event) => { /* do nothing */ return false; };
    private onPointerMoveListener = (e: PointerEvent) => this.onPointerMove(e);
    private onPointerDownListener = (e: PointerEvent) => this.onPointerDown(e);
    private onPointerUpListener = (e: PointerEvent) => this.onPointerUp(e);
    private onPointerLeaveListener = (e: PointerEvent) => this.onPointerLeave(e);
    private onTouchStartListener = (e: TouchEvent) => this.onTouchStart(e);
    private onTouchEndListener = (e: TouchEvent) => this.onTouchEnd(e);
    private onTouchCancelListener = (e: TouchEvent) => this.onTouchCancel(e);
    private onTouchMoveListener = (e: TouchEvent) => this.onTouchMove(e);
    private onWheelListener = (e: WheelEvent) => this.onWheel(e);
    private onContextMenuListener = (e: MouseEvent) => this.onContextMenu(e);
    // Keep animations alive while interacting with Pinned/Past lists
    private listScrollHandler = (_: Event) => {
        this.renderNow = true;
        this.animateBriefly();
        this.handleListScrollHoverCheck();
        this.updateHoveredListOverlayPosition();
    };
    private listWheelHandler = (event: WheelEvent) => {
        this.renderNow = true;
        this.animateBriefly();
        const pointer = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(pointer, 'mouse');
        this.handleListScrollHoverCheck(pointer, 'mouse');
        this.updateHoveredListOverlayPosition();
    };

    constructor() {
        this.currentListOverlayExpandsVertically = this.listOverlayExpandsVertically;
    }

    cleanUp() {
        // Clear pending timers
        if(this.resizeEventTimerHandle !== undefined) {
            clearTimeout(this.resizeEventTimerHandle);
            this.resizeEventTimerHandle = undefined;
        }
        if(this.hoveredNoteIndicatorTimeout !== undefined) {
            clearTimeout(this.hoveredNoteIndicatorTimeout);
            this.hoveredNoteIndicatorTimeout = undefined;
        }
        if(this.stopAnimationsTimeoutId !== null) {
            clearTimeout(this.stopAnimationsTimeoutId);
            this.stopAnimationsTimeoutId = null;
        }

        window.removeEventListener('scroll', this.syncTopCanvasPositionListener, true);

        const previousHost = this.topCanvasHost;
        // this is necessary to make sure the previous instance doesn't keep running
        this.destroyExistingApps();
        if(previousHost && this.topCanvasHostWasStatic) {
            previousHost.style.position = '';
        }

        // Remove field event listeners to prevent leaks when switching brains
        if(this.field) {
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

        // Remove radial menu listeners if still active
        document.removeEventListener("touchmove", this.radialMenuTouchMoveListener);
        document.removeEventListener("touchend", this.radialMenuTouchEndListener);

        // Remove list scroll listeners
        this.cleanupListScrollListeners();
    }

    private syncTopCanvasPosition() {
        if(!this.appTop || !this.field) {
            return;
        }
        const rect = this.field.getBoundingClientRect();
        const hostRect = this.topCanvasHost ? this.topCanvasHost.getBoundingClientRect() : {left: 0, top: 0};
        const canvas = this.appTop.canvas;
        canvas.style.left = `${rect.left - hostRect.left}px`;
        canvas.style.top = `${rect.top - hostRect.top}px`;
        if(this.appInteraction) {
            this.appInteraction.canvas.style.left = `${rect.left - hostRect.left}px`;
            this.appInteraction.canvas.style.top = `${rect.top - hostRect.top}px`;
        }
        this.updateHoveredListOverlayPosition();
    }

    resizeBufferPixels = 20;

    minResizeReduction = 200 * 200;

    lastDevicePixelRatio = window.devicePixelRatio || 1;
    lastResizeWidth = 0;
    lastResizeHeight = 0;
    
    queueResize() {
        if(!this.field || !this.appBottom) {
            return;
        }

        this.syncTopCanvasPosition();

        this.animateForSeconds(0.5);

        let currentDpr = window.devicePixelRatio || 1;
        let dprChanged = currentDpr !== this.lastDevicePixelRatio;

        // Scale must always be 1 or higher - this seems like a bug but it works
        const scale = Math.max(1, 1 / currentDpr);
        let scaledClientWidth = this.field.clientWidth * scale;
        let scaledClientHeight = this.field.clientHeight * scale;

        if(!dprChanged && scaledClientWidth == this.lastResizeWidth && scaledClientHeight == this.lastResizeHeight) {
            return;
        }

        if(dprChanged || scaledClientWidth > this.lastResizeWidth || scaledClientHeight > this.lastResizeHeight) {
            this.resizeRenderers(false);
        }
        
        if(this.resizeEventTimerHandle !== undefined) {
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
    
    private resizeRenderers(exact: boolean = false) {
        // Size the canvas to cover the plex. This is necessary because the "resizeTo" option does not work unless the window size changes.
        if(!this.field || !this.appBottom) {
            return;
        }

        // Check if device pixel ratio changed (browser zoom)
        let currentDpr = window.devicePixelRatio || 1;
        let dprChanged = currentDpr !== this.lastDevicePixelRatio;

        // Scale must always be 1 or higher - this seems like a bug but it works
        const scale = Math.max(1, 1 / currentDpr);

        // extra pixels to add to the canvas size to avoid resizing too often since resizing is expensive and can cause the canvas to flicker
        // Scale dimensions by DPR to ensure canvas has enough backing store pixels at higher zoom levels
        let extra = exact ? 0 : this.resizeBufferPixels;
        let newWidth = (this.field.clientWidth + extra) * scale;
        let newHeight = (this.field.clientHeight + extra) * scale;

        // Compare against stored dimensions
        if(!dprChanged && newHeight <= this.lastResizeHeight && newWidth <= this.lastResizeWidth) {
            // size is smaller and dpr hasn't changed, only resize if we are exact and the reduction is significant
            if(!exact) {
                return;
            }
            let reduction = (this.lastResizeWidth * this.lastResizeHeight) - (newWidth * newHeight);
            if(reduction < this.minResizeReduction) {
                // if we're not growing, don't resize if the amount of reduction is not significant
                return;
            }
        }
        if(this.appBottom?.renderer) {
            this.appBottom.renderer.clear();
            this.appBottom.renderer.resize(newWidth, newHeight);
        }
        if(this.appTop?.renderer) {
            this.appTop.renderer.clear();
            this.appTop.renderer.resize(newWidth, newHeight);
        }
        if(this.appInteraction?.renderer) {
            this.appInteraction.renderer.clear();
            this.appInteraction.renderer.resize(newWidth, newHeight);
        }

        // Update the stored dimensions and device pixel ratio
        this.lastResizeWidth = newWidth;
        this.lastResizeHeight = newHeight;
        this.lastDevicePixelRatio = currentDpr;
    }
    
    // Tear down any previous canvas set. init can run before - or without - the prior
    // PlexControl's cleanUp arriving, and without this the old canvases stay in the DOM
    // frozen on their last frame while drawing moves to the new set.
    private destroyExistingApps() {
        if(this.appBottom) {
            if(this.tickerCallback) {
                this.appBottom.ticker.remove(this.tickerCallback);
                this.tickerCallback = null;
            }
            this.appBottom.destroy();
            this.appBottom = null;
        }
        if(this.appTop) {
            this.appTop.destroy();
            this.appTop = null;
        }
        if(this.appInteraction) {
            this.appInteraction.destroy();
            this.appInteraction = null;
        }
        // destroy() only detaches the canvas its app still owns - sweep any strays left by older orphaned sets
        document.querySelectorAll("#plex-links, #plex-gates, #plex-interaction").forEach((el) => el.remove());
    }

    async setupPixi() {

        this.destroyExistingApps();

        // Create the application helper and add its render target to the page

        // Bottom layer - for links
        this.appBottom = new Canvas2DApplication();
        await this.appBottom.init({ backgroundAlpha: 0, autoDensity: true, width: this.field.clientWidth, height: this.field.clientHeight });
        this.field.appendChild(this.appBottom.canvas);
        this.appBottom.canvas.id = "plex-links";
        this.appBottom.canvas.style.position = "absolute";
        this.appBottom.canvas.style.touchAction = 'pan-y'; // allow touch events to scroll the plex off the screen for long notes
        this.appBottom.canvas.style.zIndex = "5";
        this.appBottom.canvas.style.pointerEvents = "none"; // allow events to go the objects underneath us
        this.graphicsBottom = this.appBottom.graphics;

        // Top layer - for gates and beyond
        this.appTop = new Canvas2DApplication();
        await this.appTop.init({ backgroundAlpha: 0, autoDensity: true, width: this.field.clientWidth, height: this.field.clientHeight });
        const plexHost = this.field.closest('#plexContainer') as HTMLElement | null;
        this.topCanvasHost = plexHost || (this.field.parentElement as HTMLElement | null) || this.field;
        if(this.topCanvasHost && getComputedStyle(this.topCanvasHost).position === 'static') {
            this.topCanvasHost.style.position = 'relative';
            this.topCanvasHostWasStatic = true;
        } else {
            this.topCanvasHostWasStatic = false;
        }
        this.topCanvasHost.appendChild(this.appTop.canvas);
        this.appTop.canvas.id = "plex-gates";
        this.appTop.canvas.style.position = "absolute";
        this.appTop.canvas.style.touchAction = 'pan-y'; // allow touch events to scroll the plex off the screen for long notes
        this.appTop.canvas.style.zIndex = "6";
        this.appTop.canvas.style.pointerEvents = "none"; // allow events to go the objects underneath us
        this.graphicsTop = this.appTop.graphics;

        // Interaction layer - above the accessory panels (z-10) and the hover-clone (z-30)
        this.appInteraction = new Canvas2DApplication();
        await this.appInteraction.init({ backgroundAlpha: 0, autoDensity: true, width: this.field.clientWidth, height: this.field.clientHeight });
        this.topCanvasHost.appendChild(this.appInteraction.canvas);
        this.appInteraction.canvas.id = "plex-interaction";
        this.appInteraction.canvas.style.position = "absolute";
        this.appInteraction.canvas.style.touchAction = 'pan-y'; // allow touch events to scroll the plex off the screen for long notes
        this.appInteraction.canvas.style.zIndex = "31";
        this.appInteraction.canvas.style.pointerEvents = "none"; // allow events to go the objects underneath us
        this.graphicsInteraction = this.appInteraction.graphics;

        this.syncTopCanvasPosition();
        window.removeEventListener('scroll', this.syncTopCanvasPositionListener, true);
        window.addEventListener('scroll', this.syncTopCanvasPositionListener, true);

        // Initialize the stored dimensions and device pixel ratio, then resize to ensure correct scaling
        this.lastDevicePixelRatio = window.devicePixelRatio || 1;
        this.lastResizeWidth = 0;
        this.lastResizeHeight = 0;
        this.resizeRenderers(true);
    }

    async init(field: HTMLElement) {
        if(!field) {
            throw new Error("PlexCanvas.init: field element is null or undefined. DOM may not be ready yet.");
        }
        this.field = field;

        this.focusCircleEl = document.getElementById('plex-focus-circle') as HTMLElement;

        // Hide the reticle immediately when focus leaves the plex. drawInteractions
        // only runs while the canvas ticker is active, so without this the reticle
        // lingers until the next mouse move or animation tick.
        document.addEventListener('focusin', () => {
            if(!this.focusCircleEl) return;
            const activeEl = document.activeElement as HTMLElement;
            if(this.isEditableElement(activeEl) || this.isDialogShowing || this.isSearchUIShowing) {
                this.focusCircleEl.style.display = 'none';
            } else if(plexAnimator.focusedId && plexAnimator.focusedUsingKeyboardNav) {
                // Focus returned to the plex (e.g. via FocusPlexCommand). The ticker may be
                // idle, so kick it for one frame so drawInteractions can re-show the reticle
                // without waiting for a mouse move.
                this.renderNow = true;
                this.stopAfterNextTick = true;
                if(this.appBottom?.ticker) {
                    this.appBottom.ticker.start();
                }
            }
        });

        // Expose scrollbar hit-testing to cross-bundle gesture handlers (e.g. the
        // content-area pull-up in venus-utils) so they can avoid hijacking drags
        // that started on a plex scrollbar.
        (window as any).__plexTouchIsOverScrollbar = (x: number, y: number) => this.touch_isOverScrollbar(new Point(x, y));

        await this.setupPixi();
        
        this.queueResize();

        // use javascript event handling instead of pixi since we are using graphics objects
        this.field.addEventListener('onselectstart', this.onSelectStartListener);
        this.field.addEventListener('pointermove', this.onPointerMoveListener);
        this.field.addEventListener('pointerdown', this.onPointerDownListener);
        this.field.addEventListener('pointerup', this.onPointerUpListener);
        this.field.addEventListener('pointerleave', this.onPointerLeaveListener);
        this.field.addEventListener('touchstart', this.onTouchStartListener);
        this.field.addEventListener('touchend', this.onTouchEndListener);
        this.field.addEventListener('touchcancel', this.onTouchCancelListener);
        this.field.addEventListener('touchmove', this.onTouchMoveListener);
        this.field.addEventListener('wheel', this.onWheelListener, { passive: false } as AddEventListenerOptions);
        this.field.addEventListener('contextmenu', this.onContextMenuListener);
        document.addEventListener('keydown', this.onKeyDownListener);
        // Track hover over Past/Pinned lists (which overlay the field)
        document.addEventListener('mousemove', this.globalMouseMoveListener);
        document.addEventListener('mousedown', this.globalMouseDownListener);
        document.addEventListener('mouseup', this.globalMouseUpListener);

        this.stopAnimations();

        // Observe class changes on thought elements to sync marching ants SVG overlays.
        // This catches all code paths: direct class toggles, plexAnimator element recreation, etc.
        this.marchingAntsObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const el = mutation.target as HTMLElement;
                    if (!el.classList.contains('tht')) continue;
                    const needsAnts = el.classList.contains('thought-selected') || el.classList.contains('selection-rect-highlight');
                    const hasAnts = el.querySelector('.marching-ants-svg') !== null;
                    if (needsAnts && !hasAnts) {
                        this.createMarchingAntsSvg(el);
                    } else if (!needsAnts && hasAnts) {
                        this.removeMarchingAntsSvg(el);
                    }
                }
                if (mutation.type === 'childList') {
                    // When new .tht elements are added (e.g. plexAnimator cloneAndReplace),
                    // check if they already have selection classes and need ants
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

        // Ensure list interactions keep animations alive
        this.setupListScrollListeners();

        this.appBottom!.ticker.maxFPS = this.FPS;

        // CRITICAL: Remove any existing ticker callback before adding a new one to prevent accumulation
        if(this.tickerCallback) {
            console.warn("[PlexCanvas] Removing existing ticker callback before adding new one");
            this.appBottom!.ticker.remove(this.tickerCallback);
            this.tickerCallback = null;
        }

        // Store ticker callback reference so it can be removed in cleanUp()
        this.tickerCallback = (info: any) => {

            if(plexAnimator.isSwappingThoughtElements) {
                // While thoughts are being put into place, do not attempt to draw links or gates since the locations will be wrong
                return;
            }

            this.syncTopCanvasPosition();

            let delta = info.deltaTime;
            // deltaTime 1 = 1/60th of a second

            if(this.field.clientWidth == 0 || this.field.clientHeight == 0) {
                return;
            }
            
            this.deltaSinceLastDraw += delta;
            
            let neededDelta = 60 / this.appBottom!.ticker.maxFPS;
            
            if(this.isAnimating || this.renderNow || this.chevronAnimating || this.deltaSinceLastDraw > neededDelta || this.pressedObjectType !== PlexObjectType.Nothing || this.selectedLinkIds.size > 0 || this.stopAfterNextTick || this.linkPreviewPinned) {
                plexAnimator.tick(this.deltaSinceLastDraw);

                // bottom graphics
                this.renderNow = false;
                this.graphicsBottom.clear();
                this.drawActiveThoughtBackground(this.graphicsBottom);

                let forceLayoutNeedsColliders = false;
                if(plexAnimator.layout == LayoutType.Force) {
                    this.clearLinkColliders();
                    forceLayoutNeedsColliders = plexAnimator.forceLayout.ellapsedTime > plexAnimator.FORCE_LAYOUT_LINK_LABELS_DELAY;
                } else if(this.isAnimating) {
                    this.clearLinkColliders();
                }
                let createColliders = this.linkColliders === undefined || forceLayoutNeedsColliders;
                if(createColliders) {
                    this.linkColliders = {};
                }
                // clear all gates
                this.drawLinksAndSetupGates(this.graphicsBottom, createColliders);
                this.drawScrollbars(this.graphicsBottom);

                // top graphics
                this.graphicsTop.clear();
                this.graphicsInteraction.clear();
                this.chevronAnimating = false;
                this.drawGates(this.graphicsTop);
                this.drawInteractions(this.graphicsInteraction);

                this.drawDebugRectangles();
                
                // done
                this.deltaSinceLastDraw = 0;
                
                if(this.stopAfterNextTick) {
                    this.appBottom!.ticker.stop();
                    this.stopAfterNextTick = false;
                }
            }
        };

        // Add the ticker callback
        this.appBottom!.ticker.add(this.tickerCallback);
    }
    
    drawDebugRectangles() {
        if(!this.showDebugRects) {
            return;
        }
        this.debugRects.forEach((drect) => {
            this.graphicsBottom.roundRect(drect.rect.x, drect.rect.y, drect.rect.width, drect.rect.height, 0)
                .stroke({width:drect.strokeWidth, color: drect.color});
        });
    }

    // Attach lightweight listeners so scrolling the pinned/past/selected lists keeps the canvas animating
    public setupListScrollListeners() {
        try {
            const pin = document.querySelector('.pinned-thoughts-list') as HTMLElement | null;
            if(pin && !pin.dataset["plexScrollHooked"]) {
                pin.addEventListener('scroll', this.listScrollHandler);
                pin.addEventListener('wheel', this.listWheelHandler, { passive: true } as AddEventListenerOptions);
                pin.dataset["plexScrollHooked"] = '1';
            }
            const past = document.querySelector('.past-thoughts-list') as HTMLElement | null;
            if(past && !past.dataset["plexScrollHooked"]) {
                past.addEventListener('scroll', this.listScrollHandler);
                past.addEventListener('wheel', this.listWheelHandler, { passive: true } as AddEventListenerOptions);
                past.dataset["plexScrollHooked"] = '1';
            }
            const selected = document.querySelector('.selected-thoughts-list') as HTMLElement | null;
            if(selected && !selected.dataset["plexScrollHooked"]) {
                selected.addEventListener('scroll', this.listScrollHandler);
                selected.addEventListener('wheel', this.listWheelHandler, { passive: true } as AddEventListenerOptions);
                selected.dataset["plexScrollHooked"] = '1';
            }
        } catch { /* no-op */ }
    }

    // Remove list scroll listeners to prevent leaks when switching brains
    private cleanupListScrollListeners() {
        try {
            const pin = document.querySelector('.pinned-thoughts-list') as HTMLElement | null;
            if(pin) {
                pin.removeEventListener('scroll', this.listScrollHandler);
                pin.removeEventListener('wheel', this.listWheelHandler);
                delete pin.dataset["plexScrollHooked"];
            }
            const past = document.querySelector('.past-thoughts-list') as HTMLElement | null;
            if(past) {
                past.removeEventListener('scroll', this.listScrollHandler);
                past.removeEventListener('wheel', this.listWheelHandler);
                delete past.dataset["plexScrollHooked"];
            }
            const selected = document.querySelector('.selected-thoughts-list') as HTMLElement | null;
            if(selected) {
                selected.removeEventListener('scroll', this.listScrollHandler);
                selected.removeEventListener('wheel', this.listWheelHandler);
                delete selected.dataset["plexScrollHooked"];
            }
        } catch { /* no-op */ }
    }

    private rememberPointerLocation(point: Point, pointerType: string) {
        this.lastPointerClientPoint = new Point(point.x, point.y);
        this.lastPointerType = pointerType || 'mouse';
    }

    private handleListScrollHoverCheck(pointerPoint?: Point, pointerType?: string) {
        const point = pointerPoint ?? this.lastPointerClientPoint;
        const type = pointerType ?? this.lastPointerType ?? 'mouse';
        if(point) {
            this.checkForHover(new Point(point.x, point.y), type, true);
        } else if(this.hoveredListOverlayEl || this.hoveredListRep) {
            this.checkForHover(new Point(-99999, -99999), 'fakemouse', true);
        }
    }

    private handleGlobalMouseMove(event: MouseEvent) {
        const target = event.target as HTMLElement | null;
        const isInLists = this.isInAccessoryList(target);

        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, 'mouse');

        // If dragging a gate that originated in a list, keep updating regardless of cursor location
        if(this.pressedObjectType == PlexObjectType.ThoughtGate) {
            // While dragging, keep animations running so gates/links update smoothly
            this.animateBriefly();
            // Maintain hover state so gates/highlights update under cursor
            this.checkForHover(clientPoint, 'fakemouse', true);

            // Update destination thought/point
            let lastGateDragDestThtId = this.gateDragDestThtId;
            let thtResult = this.findThoughtAt(clientPoint, 'fakemouse');
            if(thtResult) {
                if(thtResult[0] != this.hoveredGateThtId) {
                    this.gateDragDestThtId = thtResult[0];
                    let thtRep = this.getRepForThoughtIdNearestToPoint(this.gateDragDestThtId!, this.getFieldPointFromPoint(clientPoint));
                    if(thtRep) {
                        let otherGate = RelationHelper.getOpposite(this.hoveredGateRelation);
                        // If destination is a list rep, force left-side gates
                        const inList = this.isInAccessoryList(thtRep.thtEl);
                        const isActiveThought = thtRep.id == plexAnimator.node?.id;

                        // Determine child gate side for mindmap active thought destinations
                        let destChildSide: 'left' | 'right' | undefined;
                        if(plexAnimator.layout == LayoutType.Mindmap && isActiveThought && otherGate === Relation.Child && !inList) {
                            // Use the side that was hovered if we're dragging from a child gate
                            destChildSide = this.hoveredGateChildSide;
                        }

                        if(inList) {
                            const rect = DomUtils.getRect(thtRep.thtEl, this.field);
                            this.gateDragDestPoint = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, otherGate, false, destChildSide);
                        } else {
                            this.gateDragDestPoint = this.getGateLocationFromThoughtRep(thtRep, otherGate, destChildSide);
                        }
                    } else {
                        this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
                    }
                } else {
                    this.gateDragDestThtId = this.hoveredGateThtId;
                    this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
                }
            } else {
                this.gateDragDestThtId = undefined;
                this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            }
            if(lastGateDragDestThtId != this.gateDragDestThtId) {
                this.hoveredThoughtIdChanged(this.gateDragDestThtId, lastGateDragDestThtId);
            }
            this.renderNow = true;
            return;
        }

        // Not dragging: only update hover while over the lists; clear when leaving lists
        if(isInLists && !this.isDialogShowing) {
            // While interacting over the lists, keep animations alive for smooth feedback
            this.animateBriefly();
            this.checkForHover(clientPoint, 'fakemouse', true);
            this.renderNow = true;
        } else {
            if(this.pressedObjectType == PlexObjectType.Nothing) {
                // Clear hover if the hovered thought rep no longer exists
                if(this.hoveredThoughtId && !plexAnimator.thtReps.has(this.hoveredThoughtId)) {
                    this.checkForHover(new Point(-99999, -99999), 'fakemouse', true);
                    this.renderNow = true;
                    this.animateBriefly();
                // Also clear hover if mouse is outside the field (catches fast mouse exits)
                } else if(this.hoveredThoughtId || this.hoveredLinkId || this.hoveredGateThtId || this.hoveredThoughtIconId) {
                    const fieldRect = this.field.getBoundingClientRect();
                    const isOutsideField = event.clientX < fieldRect.left || event.clientX > fieldRect.right
                        || event.clientY < fieldRect.top || event.clientY > fieldRect.bottom;
                    if(isOutsideField) {
                        this.checkForHover(new Point(-99999, -99999), 'fakemouse', true);
                        this.renderNow = true;
                        this.animateBriefly();
                    }
                }
            }
        }
    }

    private handleGlobalMouseDown(event: MouseEvent) {
        const target = event.target as HTMLElement | null;
        const isInLists = this.isInAccessoryList(target);
        if(!isInLists) return;

        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, 'mouse');
        // Detect if mouse went down on a list gate
        let thtResult = this.findThoughtAt(clientPoint, 'mouse');
        if(thtResult && thtResult[1] === PlexObjectType.ThoughtGate) {
            // Ensure animations are running during list-originated drags
            this.animateBriefly();
            this.pointerDownPoint = new Point(event.clientX, event.clientY);
            this.lastDragPoint = new Point(event.clientX, event.clientY);
            this.hasDragExceededClickDistance = false;
            this.hoveredGateThtId = thtResult[0];
            this.hoveredGateRelation = thtResult[2];
            this.hoveredListRep = this.lastListRepHit;
            // Remember the exact list rep as the drag source
            this.listGateDragSourceRep = this.hoveredListRep;
            this.pressedObjectType = PlexObjectType.ThoughtGate;
            // Capture which child gate side was clicked for mindmap active thought
            this.gateDragSourceChildSide = this.hoveredGateChildSide;
            this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            this.isListGateDragActive = true;
            // Hide the gate-hover clone now that a drag has started.
            if(this.hoveredThoughtId) {
                const lastId = this.hoveredThoughtId;
                this.hoveredThoughtId = undefined;
                this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastId);
            }
            this.renderNow = true;
        }
    }

    private handleGlobalMouseUp(event: MouseEvent) {
        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, 'mouse');
        if(this.pressedObjectType == PlexObjectType.ThoughtGate) {
            // Self-link is a no-op. Plex-origin drags happen to be no-ops only because
            // the source is typically the active thought; list-origin sources usually
            // aren't, so server-side LinkThoughts would expand/activate the source.
            const isSelfLink = this.hoveredGateThtId != null && this.hoveredGateThtId === this.gateDragDestThtId;
            if(!isSelfLink) {
                safeInvoke(plexAnimator.dotNetHelper, "LinkThoughts", [this.hoveredGateThtId, this.gateDragDestThtId, this.hoveredGateRelation, event.shiftKey, event.clientX, event.clientY]);
            }
            this.pressedObjectType = PlexObjectType.Nothing;
            this.checkForHover(clientPoint, 'fakemouse', true);
            this.renderNow = true;
            this.animateBriefly();
            this.isListGateDragActive = false;
            this.listGateDragSourceRep = undefined;
            this.gateDragSourceChildSide = undefined; // Clear the captured child side
        }
    }

    clearGates() {
        plexAnimator.thtReps.forEach((r) => {
            r.childGate = r.parentGate = r.jumpGate = GateStatus.Empty;
        })
        const listReps = plexAnimator.getAllListReps();
        listReps.forEach((r) => {
            r.childGate = r.parentGate = r.jumpGate = GateStatus.Empty;
        });
    }

    private stopAnimations() {
        this.isAnimating = false;
        this.stopAfterNextTick = true;
    }
    
    private stopAnimationsTimeoutId: number | null = null;

    startAnimations(seconds: number) {
        this.isAnimating = true;
        let hadHover = this.hoveredThoughtId != undefined || this.hoveredLinkId != undefined;
        if(this.hoveredThoughtId != undefined) {
            let lastHoveredThoughtId = this.hoveredThoughtId;
            this.hoveredThoughtId = undefined;
            this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastHoveredThoughtId);
        }
        if(this.hoveredLinkId != undefined) {
            let lastHoveredLinkId = this.hoveredLinkId;
            this.hoveredLinkId = undefined;
            this.hoveredLinkIdChanged(this.hoveredLinkId, lastHoveredLinkId);
        }
        if(hadHover) {
            safeInvoke(plexAnimator.dotNetHelper, "SetHoverItemByIdAsync", [null, -1]);
        }
        // this.clearLinkColliders(); // keep link labels visible during animation
        this.lastListRepHit = undefined;
        this.hoveredListRep = undefined;
        this.removeHoveredListOverlay();
        const totalSeconds = seconds + this.animationPaddingSeconds;
        // totalSeconds includes padding so we keep drawing until the transition finishes
        this.animateForSeconds(totalSeconds);
    }

    private resumeHoverAfterSuppressionTimer: number | null = null;

    suppressHoverForAnimation(seconds: number) {
        const totalSeconds = seconds + this.hoverSuppressionPaddingSeconds;
        this.suppressHoverFor(totalSeconds);
        // Hide any visible list-rep hover clone so it doesn't cover the activation animation.
        this.removeHoveredListOverlay();
        // Re-fire hover detection at the cursor's current location once suppression ends.
        // Otherwise, if the cursor is stationary over a thought when the animation
        // finishes, no mousemove fires and the hover clone never appears until the user
        // wiggles the mouse — the plex feels unresponsive.
        if(this.resumeHoverAfterSuppressionTimer != null) {
            clearTimeout(this.resumeHoverAfterSuppressionTimer);
        }
        this.resumeHoverAfterSuppressionTimer = window.setTimeout(() => {
            this.resumeHoverAfterSuppressionTimer = null;
            this.handleListScrollHoverCheck();
            this.renderNow = true;
            this.animateBriefly();
        }, totalSeconds * 1000);
    }

    private suppressHoverFor(seconds: number) {
        const now = Date.now();
        if(seconds <= 0) {
            this.hoverSuppressedUntil = Math.max(this.hoverSuppressedUntil, now);
            return;
        }
        const targetTime = now + seconds * 1000;
        if(targetTime > this.hoverSuppressedUntil) {
            this.hoverSuppressedUntil = targetTime;
        }
    }

    private isHoverSuppressed(): boolean {
        if(this.hoverSuppressedUntil <= 0) {
            return false;
        }
        const now = Date.now();
        if(now < this.hoverSuppressedUntil) {
            return true;
        }
        this.hoverSuppressedUntil = 0;
        return false;
    }
    
    private animateForSeconds(seconds: number) {
        this.stopAfterNextTick = false;
        if(this.appBottom?.ticker) {
            this.appBottom.ticker.start();
        }

        if(this.stopAnimationsTimeoutId) {
            clearTimeout(this.stopAnimationsTimeoutId);
        }
        this.stopAnimationsTimeoutId = setTimeout(() => {
            this.stopAnimations();
            this.stopAnimationsTimeoutId = null;
        }, seconds * 1000);
    }
    
    animateBriefly() {
        // this is needed so that changes such as highlighting of hovered links show up
        if(!this.isAnimating) {
            this.animateForSeconds(0.1);
        }
    }

    clearLinkColliders() {
        this.linkColliders = undefined;
        this.removeLinkLabels();
    }

    removeLinkLabels() {
        let labelDivs = this.field.querySelectorAll(".link-label") as NodeListOf<HTMLElement>;
        labelDivs.forEach((div) => {
            div.remove();
        });
    }
    
    public startLinkingFromQuadrant(linkRelation: Relation, currTouchPoint: Point, thoughtId: string){ 
        // console.log(`Linking from quadrant:  ${linkRelation}, at point: ${currTouchPoint.x}, ${currTouchPoint.y}`);
        
        this.pointerDownPoint = new Point(currTouchPoint.x, currTouchPoint.y);
        this.lastDragPoint = new Point(currTouchPoint.x, currTouchPoint.y);
        this.hasDragExceededClickDistance = false;
        this.hoveredGateThtId = thoughtId;
        this.pressedObjectType = PlexObjectType.ThoughtGate;
        this.hoveredGateRelation = linkRelation;
        // Capture which child gate side was clicked for mindmap active thought
        this.gateDragSourceChildSide = this.hoveredGateChildSide;

        this.gateDragDestPoint = this.getFieldPointFromPoint(currTouchPoint);
        
		document.addEventListener("touchmove", this.radialMenuTouchMoveListener);
		document.addEventListener("touchend", this.radialMenuTouchEndListener);
    }
    
    private lastThtResultId: string | null = null;
    
    private handleTouchMoveFromRadialMenu(event: TouchEvent) {
        // console.log(`handleTouchMoveFromRadialMenu: at point ${event.touches[0].clientX}, ${event.touches[0].clientY}`);
        
        let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);

        this.renderNow = true;
        // check for destination thought
        let lastGateDragDestThtId = this.gateDragDestThtId;
        let thtResult = this.findThoughtAt(clientPoint, "fakemouse");
        if(thtResult) {
            if(thtResult[0] != this.hoveredGateThtId) {
                // Play a haptic "click" if we are hovering over a different thought
                if(thtResult[0] != this.lastThtResultId) {
                    safeInvoke(plexAnimator.dotNetHelper, "FireHapticClick");
                    this.lastThtResultId = thtResult[0];
                }
                this.gateDragDestThtId = thtResult[0];
                let thtRep = this.getRepForThoughtIdNearestToPoint(this.gateDragDestThtId!, this.getFieldPointFromPoint(clientPoint));
                if(thtRep) {
                    let otherGate = RelationHelper.getOpposite(this.hoveredGateRelation);
                    // If destination is a list rep, force left-side gates
                    const inList = this.isInAccessoryList(thtRep.thtEl);
                    const isActiveThought = thtRep.id == plexAnimator.node?.id;

                    // Determine child gate side for mindmap active thought destinations
                    let destChildSide: 'left' | 'right' | undefined;
                    if(plexAnimator.layout == LayoutType.Mindmap && isActiveThought && otherGate === Relation.Child && !inList) {
                        // Use the side that was hovered if we're dragging from a child gate
                        destChildSide = this.hoveredGateChildSide;
                    }

                    if(inList) {
                        const rect = DomUtils.getRect(thtRep.thtEl, this.field);
                        this.gateDragDestPoint = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, otherGate, false, destChildSide);
                    } else {
                        this.gateDragDestPoint = this.getGateLocationFromThoughtRep(thtRep, otherGate, destChildSide);
                    }
                } else {
                    this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
                }
            } else {
                // dragging over itself
                this.gateDragDestThtId = this.hoveredGateThtId;
                this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            }
        } else {
            this.gateDragDestThtId = undefined;
            this.gateDragDestPoint = this.getFieldPointFromPoint(clientPoint);
            this.lastThtResultId = null;
        }
        if(lastGateDragDestThtId != this.gateDragDestThtId) {
            this.hoveredThoughtIdChanged(this.gateDragDestThtId, lastGateDragDestThtId);
        }
    }

    private handleTouchEndFromRadialMenu(event: TouchEvent){
		document.removeEventListener("touchmove", this.radialMenuTouchMoveListener);
		document.removeEventListener("touchend", this.radialMenuTouchEndListener);

        // console.log(`handleTouchEndFromRadialMenu: stopped touching at point ${event.changedTouches[0].clientX}, ${event.changedTouches[0].clientY}`);

        // ask server to continue with link thoughts
        safeInvoke(plexAnimator.dotNetHelper, "LinkThoughts", [this.hoveredGateThtId, this.gateDragDestThtId, this.hoveredGateRelation, event.shiftKey, event.changedTouches[0].clientX, event.changedTouches[0].clientY]);

        this.pressedObjectType = PlexObjectType.Nothing;
        this.gateDragSourceChildSide = undefined; // Clear the captured child side
        this.checkForHover(new Point(event.changedTouches[0].clientX, event.changedTouches[0].clientY), "fakemouse", true);

    }

    // external mouse drag listeners removed; list layouts enable direct hit-testing

    onPointerMove(event: PointerEvent) {
        // check scrollbars for hover
        let scrollPoint = new Point(event.clientX - this.field.getBoundingClientRect().x,
            event.clientY - this.field.getBoundingClientRect().y);
        if(this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if(s != null) {
                    Scrollbar.stateByZone[s.zone].isHovered = s.isPointWithinScrollbar(scrollPoint);
                    s.onPointerMove(scrollPoint)
                }
            });
        }
        
        let allowDragBackground = (
            plexAnimator.layout == LayoutType.Force ||
            plexAnimator.layout == LayoutType.Outline ||
            plexAnimator.layout == LayoutType.Mindmap ||
            plexAnimator.layout == LayoutType.Normal ||
            plexAnimator.layout == LayoutType.NormalPlusOne
        );

        if(this.field == undefined || (this.isAnimating && !allowDragBackground)) {
            return;
        }

        this.animateBriefly();

        const clientPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(clientPoint, event.pointerType);

        if(event.pointerType == "touch") {
            return;
        }

        if(!this.pointerDownIsPrimary) {
            this.checkForHover(clientPoint, event.pointerType, false);
            return;
        }
        
        if(this.pressedObjectType != PlexObjectType.Nothing) {
            let deltaPoint = clientPoint.subtract(this.lastDragPoint!);
            if(!this.hasDragExceededClickDistance) {
                let totalDelta = clientPoint.subtract(this.pointerDownPoint!);
                if(totalDelta.x * totalDelta.x + totalDelta.y * totalDelta.y > this.MAX_CLICK_DIST * this.MAX_CLICK_DIST ) {
                    this.hasDragExceededClickDistance = true;
                }
            }
            this.lastDragPoint = clientPoint;

            event.preventDefault();
            
            // Handle selection rectangle drawing
            if(this.isDrawingSelectionRect && this.pressedObjectType == PlexObjectType.Background) {
                this.selectionRectEndPoint = this.getFieldPoint(event);
                this.updateSelectionRectangleHighlights();
                this.renderNow = true;
                return;
            }
            
            switch(this.pressedObjectType) {
                case PlexObjectType.ThoughtGate:
                    this.renderNow = true;
                    // check for destination thought
                    let lastGateDragDestThtId = this.gateDragDestThtId;
                    let thtResult = this.findThoughtAt(clientPoint, event.pointerType);
                    if(!this.isListGateDragActive) {
                        const newListRep = this.lastListRepHit;
                        if(this.hoveredListRep !== newListRep) {
                            this.hoveredListRep = newListRep;
                            this.renderNow = true;
                            this.updateHoveredListOverlayPosition();
                        }
                    }
                    if(thtResult) {
                        if(thtResult[0] != this.hoveredGateThtId) {
                            this.gateDragDestThtId = thtResult[0];
                            let thtRep = this.getRepForThoughtIdNearestToPoint(this.gateDragDestThtId!, this.getFieldPoint(event));
                            if(thtRep) {
                                let otherGate = RelationHelper.getOpposite(this.hoveredGateRelation);
                                // If destination is a list rep, force left-side gates
                                const inList = this.isInAccessoryList(thtRep.thtEl);
                                const isActiveThought = thtRep.id == plexAnimator.node?.id;

                                // Determine child gate side for mindmap active thought destinations
                                let destChildSide: 'left' | 'right' | undefined;
                                if(plexAnimator.layout == LayoutType.Mindmap && isActiveThought && otherGate === Relation.Child && !inList) {
                                    // Use the side that was hovered if we're dragging from a child gate
                                    destChildSide = this.hoveredGateChildSide;
                                }

                                if(inList) {
                                    const rect = DomUtils.getRect(thtRep.thtEl, this.field);
                                    this.gateDragDestPoint = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, otherGate, false, destChildSide);
                                } else {
                                    this.gateDragDestPoint = this.getGateLocationFromThoughtRep(thtRep, otherGate, destChildSide);
                                }
                            } else {
                                this.gateDragDestPoint = this.getFieldPoint(event);
                            }
                        } else {
                            // dragging over itself
                            this.gateDragDestThtId = this.hoveredGateThtId;
                            this.gateDragDestPoint = this.getFieldPoint(event);
                        }
                    } else {
                        this.gateDragDestThtId = undefined;
                        this.gateDragDestPoint = this.getFieldPoint(event);
                    }
                    if(lastGateDragDestThtId != this.gateDragDestThtId) {
                        this.hoveredThoughtIdChanged(this.gateDragDestThtId, lastGateDragDestThtId);
                    }
                    break;
                case PlexObjectType.Thought:
                    if(plexAnimator.layout != LayoutType.Force) {
                        // Normal/NormalPlusOne/Outline/MindMap layout: visually drag the thought and indicate target zone
                        if(this.supportsZoneDrag()) {
                            if(this.hasDragExceededClickDistance && this.draggedThoughtId) {
                                // Initialize zone drag placeholder on first significant move
                                if(!this.zoneDragPlaceholder && this.draggedThoughtSourceZone
                                   && this.zoneDragSlots.length > 0 && !this.hasLeftSourceZone) {
                                    const rep = plexAnimator.thtReps.get(this.draggedThoughtId);
                                    if(rep) {
                                        const rect = rep.thtEl.getBoundingClientRect();
                                        this.zoneDragPlaceholder = this.createZonePlaceholder(rect.width, rect.height);
                                        this.field.appendChild(this.zoneDragPlaceholder);
                                        const slot = this.zoneDragSlots[this.zoneDragOriginalIndex];
                                        if(slot) {
                                            this.zoneDragPlaceholder.style.left = this.computeLeftForSlot(slot, rect.width, rep.alignment) + 'px';
                                            this.zoneDragPlaceholder.style.top = slot.y + 'px';
                                        }
                                        this.zoneDragCurrentDropIndex = this.zoneDragOriginalIndex;
                                        rep.thtEl.style.zIndex = '100';
                                        rep.thtEl.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
                                    }
                                }

                                // Move the dragged thought element visually
                                let thtRepNorm = plexAnimator.thtReps.get(this.draggedThoughtId!);
                                if(thtRepNorm) {
                                    thtRepNorm.thtEl.style.transition = "left 0s ease, top 0s ease";
                                    DomUtils.offsetElement(thtRepNorm.thtEl, deltaPoint);
                                    // Move hover overlays as well
                                    let hoveredElements = this.field.querySelectorAll(".hovered-tht, .hovered-tht-label") as NodeListOf<HTMLElement>;
                                    hoveredElements.forEach((hoverElement) => {
                                        hoverElement.style.transition = "left 0s ease, top 0s ease";
                                        DomUtils.offsetElement(hoverElement, deltaPoint);
                                    });
                                }
                                // Determine which zone is under the pointer and toggle visual state
                                const zone = this.getZoneUnderClientPoint(clientPoint);

                                // In Mindmap/Outline, cross-zone dragging is not supported.
                                // Keep the drop zone locked to the source zone so reordering
                                // continues to work even if the pointer drifts across zone boundaries.
                                if(this.isOutlineOrMindmap()) {
                                    this.currentDropZone = this.draggedThoughtSourceZone;
                                } else {
                                    // Track if the thought has ever left its source zone
                                    if(zone !== this.draggedThoughtSourceZone && zone !== null) {
                                        this.hasLeftSourceZone = true;
                                        this.transitionToZoneChangeMode();
                                    }

                                    if(zone !== this.currentDropZone) {
                                        this.setZoneHovered(this.currentDropZone, false);
                                        this.currentDropZone = zone;
                                        // Only show overlay if the thought has left the source zone at some point
                                        if(this.hasLeftSourceZone) {
                                            this.setZoneHovered(this.currentDropZone, true);
                                        }
                                    }
                                }

                                // Same-zone reorder: update placeholder + animate siblings
                                if(!this.hasLeftSourceZone && this.zoneDragPlaceholder
                                   && this.currentDropZone === this.draggedThoughtSourceZone) {
                                    const dropIndex = this.computeDropIndex(this.currentDropZone!, clientPoint, this.draggedThoughtId!);
                                    this.updateZoneDragLayout(dropIndex);
                                }
                            }
                        }
                        // Do not reflow layout here for Normal/Outline/MindMap
                        break;
                    }
                    this.renderNow = true;
                    // dragging a thought
                    let thtRep = plexAnimator.thtReps.get(this.hoveredThoughtId!);
                    if(thtRep) {
                        // move the thought
                        thtRep.thtEl.style.transition = "left 0s ease, top 0s ease";
                        DomUtils.offsetElement(thtRep.thtEl, deltaPoint);
                        // move thought hovers also
                        let hoveredElements = this.field.querySelectorAll(".hovered-tht, .hovered-tht-label") as NodeListOf<HTMLElement>;
                        hoveredElements.forEach((hoverElement) => {
                            hoverElement.style.transition = "left 0s ease, top 0s ease";
                            DomUtils.offsetElement(hoverElement, deltaPoint);
                        });
                        if(plexAnimator.layout == LayoutType.Force) {
                            // inform forceLayout of moved node
                            let newCen = DomUtils.getCenter(thtRep.thtEl, this.field);
                            plexAnimator.forceLayout.nodeDragged(thtRep.id, newCen, this.hasDragExceededClickDistance);
                        }
                    }
                    break;
                case PlexObjectType.Background:
                    if(allowDragBackground) {
                        if (plexAnimator.layout == LayoutType.Force) {
                            plexAnimator.forceLayout.backgroundDragged(deltaPoint, this.hasDragExceededClickDistance);
                        } else {
                            plexAnimator.backgroundDragged(deltaPoint, this.hasDragExceededClickDistance);
                            this.renderNow = true;
                        }
                    }
                default:
                    break;
            }
            return;
        }
        
        if(this.checkForHover(clientPoint, event.pointerType, false)) {
            event.preventDefault();
        }
    }
    
    IGNORED: boolean = false;

    // True when the point lies over an open, visible accessory panel that paints on top of
    // the Plex: the selection panel (left), the pinned-thoughts list (top), or the
    // past-thoughts list (bottom). Plex thoughts can be laid out beneath these panels
    // (e.g. Outline/Mindmap, which don't reserve margins for them); a point over a panel
    // must not hit those thoughts since the panel covers them and they cannot be clicked
    // through it. The panels' own list items remain interactive — they are resolved by the
    // accessory-list checks in findThoughtAt, which are not gated by this flag.
    private isPointInAccessoryPanel(clientPoint: Point): boolean {
        const selectors = ['.selected-thoughts-panel', '.pinned-thoughts-list-container', '.past-thoughts-list-container'];
        for(const selector of selectors) {
            const panel = document.querySelector(selector) as HTMLElement | null;
            if(!panel) {
                continue;
            }
            // Skip hidden/inactive panels: collapsed selection panel uses pointer-events:none;
            // pinned/past lists use display:none below the `sm` breakpoint.
            const style = getComputedStyle(panel);
            if(style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
                continue;
            }
            const r = panel.getBoundingClientRect();
            if(r.width <= 0 || r.height <= 0) {
                continue;
            }
            if(clientPoint.x >= r.left && clientPoint.x <= r.right
               && clientPoint.y >= r.top && clientPoint.y <= r.bottom) {
                return true;
            }
        }
        return false;
    }

    // While a tag is expanded by a decoration hover, only its rest-state footprint keeps the
    // hover alive — the expanded label must not, or it would trap the hover and block reaching
    // the neighboring tags it covers. Always true for tags other than the expanded one.
    private isWithinExpandedDecorationRestBounds(indicatorId: string | undefined, thtEl: HTMLElement, clientPoint: Point): boolean {
        const expanded = this.expandedDecoration;
        if(!expanded || expanded.decorationId !== indicatorId) {
            return true;
        }
        // Compensate for any plex movement since the bounds were captured
        const thtRect = thtEl.getBoundingClientRect();
        const dx = thtRect.left - expanded.thtRect.left;
        const dy = thtRect.top - expanded.thtRect.top;
        return clientPoint.x >= expanded.restRect.left + dx && clientPoint.x <= expanded.restRect.right + dx
            && clientPoint.y >= expanded.restRect.top + dy && clientPoint.y <= expanded.restRect.bottom + dy;
    }

    findThoughtAt(clientPoint: Point, pointerType: string): null | [string, PlexObjectType, any] {
        this.lastListRepHit = undefined;
        let fieldRect = this.field.getBoundingClientRect();
        let point = new Point(clientPoint.x - fieldRect.x, clientPoint.y - fieldRect.y)

        // When the cursor is over an open accessory panel (selection panel, pinned list, or
        // past list), suppress hits on Plex thoughts beneath it. The panels' own list items
        // remain interactive — they are resolved by the accessory-list checks further down,
        // which are not gated by this flag.
        const overAccessoryPanel = this.isPointInAccessoryPanel(clientPoint);

        let thtId: string | undefined = undefined;
        let plexObjectType = PlexObjectType.Nothing;
        let data: any;

        // look for a gate in Plex thought reps
        plexAnimator.thtReps.forEach((thtRep) => {
            if(overAccessoryPanel) {
                return; // beneath an accessory panel — not interactive
            }
            if(pointerType == "touch") {
                return; // touch should ignore gates because they are small and without hover user cannot tell where they are
            }
            if(thtId !== undefined) {
                return;
            }
            if(parseFloat(thtRep.thtEl.style.opacity) < 1) {
                // do not allow interaction on gates for faded thought (this includes distant thoughts)
                return;
            }
            const isActiveThought = thtRep.id == plexAnimator.node?.id;

            // For active thought in mindmap, check both left and right child gates
            if(plexAnimator.layout == LayoutType.Mindmap && isActiveThought) {
                // Check left child gate
                let gatePt = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'left');
                let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                if(gateRect.contains(point)) {
                    thtId = thtRep.id;
                    data = Relation.Child;
                    this.hoveredGateChildSide = 'left';
                    if(plexAnimator.isReadOnly) {
                        plexObjectType = PlexObjectType.Thought;
                    } else {
                        plexObjectType = PlexObjectType.ThoughtGate;
                    }
                    return;
                }

                // Check right child gate
                gatePt = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'right');
                gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                if(gateRect.contains(point)) {
                    thtId = thtRep.id;
                    data = Relation.Child;
                    this.hoveredGateChildSide = 'right';
                    if(plexAnimator.isReadOnly) {
                        plexObjectType = PlexObjectType.Thought;
                    } else {
                        plexObjectType = PlexObjectType.ThoughtGate;
                    }
                    return;
                }

                // Check parent and jump gates
                for(let gateNum = Relation.Parent; gateNum <= Relation.Jump; gateNum++) {
                    let gatePt = this.getGateLocationFromThoughtRep(thtRep, gateNum);
                    let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                    if(gateRect.contains(point)) {
                        thtId = thtRep.id;
                        data = gateNum;
                        this.hoveredGateChildSide = undefined;
                        if(plexAnimator.isReadOnly) {
                            plexObjectType = PlexObjectType.Thought;
                        } else {
                            plexObjectType = PlexObjectType.ThoughtGate;
                        }
                        break;
                    }
                }
            } else {
                // Standard gate checking for non-active thoughts or non-mindmap layout
                this.hoveredGateChildSide = undefined;
                for(let gateNum = Relation.Child; gateNum <= Relation.Jump; gateNum++) {
                    if(plexAnimator.layout == LayoutType.Mindmap && thtRep.id != plexAnimator.activeId &&
                        (gateNum == Relation.Jump || gateNum == Relation.Parent ||
                        thtRep.alignment == ThoughtHorizontalAlignment.Center)) {
                        // Skip parent and jump gates for non-active thought in mindmap,
                        // since these gates cannot be used to create thoughts that will
                        // subsequently become visible.
                        continue;
                    }
                    let gatePt = this.getGateLocationFromThoughtRep(thtRep, gateNum);
                    let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5);
                    if(gateRect.contains(point)) {
                        thtId = thtRep.id;
                        data = gateNum;
                        if(plexAnimator.isReadOnly) {
                            // treat gate just like the main thought
                            plexObjectType = PlexObjectType.Thought;
                        } else {
                            plexObjectType = PlexObjectType.ThoughtGate;
                        }
                        break;
                    }
                }
            }
        });

        // If none found yet, look in list reps (Pinned/Past)
        if(thtId === undefined) {
            const listReps = plexAnimator.getAllListReps();
            // The selection panel sits on the left and visually covers part of the
            // pinned/past lists' coordinate range. Their gate hitboxes can extend up
            // to ~9px past the row's left edge (toward the panel boundary), so a
            // cursor inside the panel area can otherwise trigger a gate hit on the
            // leftmost pin/past row. Exclude pinned/past gates whose hitbox center
            // lies inside the visible selection panel rect.
            const selPanel = document.querySelector('.selected-thoughts-panel') as HTMLElement | null;
            let selPanelRect: DOMRect | null = null;
            if(selPanel && getComputedStyle(selPanel).pointerEvents !== 'none') {
                selPanelRect = selPanel.getBoundingClientRect();
            }
            listReps.forEach((thtRep) => {
                if(thtId !== undefined) {
                    return;
                }
                if(pointerType == "touch") {
                    return;
                }
                const pinnedOrPastListEl = this.findAncestor(thtRep.thtEl, 'pinned-thoughts-list')
                    ?? this.findAncestor(thtRep.thtEl, 'past-thoughts-list');
                const isActiveThought = thtRep.id == plexAnimator.node?.id;
                for(let gateNum = Relation.Child; gateNum <= Relation.Jump; gateNum++) {
                    let rect = DomUtils.getRect(thtRep.thtEl, this.field);
                    // Lists: always place jump gate on the left (isJump=false)
                    let gatePt = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, gateNum, false);
                    let gateRect = new Rect(gatePt.x - plexAnimator.GATE_SIZE * 2.5, gatePt.y - plexAnimator.GATE_SIZE * 2.5, plexAnimator.GATE_SIZE * 5, plexAnimator.GATE_SIZE * 5, isActiveThought);
                    if(gateRect.contains(point)) {
                        // Skip when the gate's center sits inside the selection panel
                        // (only applies to pinned/past — selected-list gates are inside
                        // the panel by design).
                        if(pinnedOrPastListEl && selPanelRect) {
                            const fieldRect = this.field.getBoundingClientRect();
                            const gateClientX = gatePt.x + fieldRect.x;
                            const gateClientY = gatePt.y + fieldRect.y;
                            if(gateClientX >= selPanelRect.left && gateClientX <= selPanelRect.right
                               && gateClientY >= selPanelRect.top && gateClientY <= selPanelRect.bottom) {
                                continue;
                            }
                        }
                        // Rows scrolled partially out of the pinned/past list viewport are
                        // clipped by overflow-hidden, with the hidden part sitting under the
                        // list's scroll-arrow buttons. Their rects still extend there, so skip
                        // gates whose center lies outside the viewport's horizontal bounds.
                        if(pinnedOrPastListEl) {
                            const listRect = pinnedOrPastListEl.getBoundingClientRect();
                            const fieldRect = this.field.getBoundingClientRect();
                            const gateClientX = gatePt.x + fieldRect.x;
                            if(gateClientX < listRect.left || gateClientX > listRect.right) {
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

        if(plexAnimator.layout == LayoutType.Force || plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
            let start = (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) ? ThoughtControl.Chevron : ThoughtControl.Expand;
            let end = (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) ? ThoughtControl.Chevron : ThoughtControl.Anchor;
            // look for a control
            plexAnimator.thtReps.forEach((thtRep) => {
                if (thtId !== undefined) {
                    return;
                }
                if(overAccessoryPanel) {
                    return; // beneath an accessory panel — not interactive
                }
                // In mindmap/outline, skip active thought chevron — its hitbox overlaps with child chevrons
                if ((plexAnimator.layout == LayoutType.Mindmap || plexAnimator.layout == LayoutType.Outline)
                    && thtRep.id === plexAnimator.activeId) {
                    return;
                }
                for(let control = start; control <= end; control++) {
                    let controlPt = this.getControlLocation(thtRep, control);
                    let radius = plexAnimator.CONTROL_SIZE;
                    if(control == ThoughtControl.Chevron) {
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

        if(thtId === undefined) {
            // look for a thought in Past/Pinned/Selected lists
            let listThoughtEl = allElementsAtPoint.find(e => {
                const el = e as HTMLElement;
                if(!el || !el.id || !el.id.startsWith('tht-')) return false;
                // Exclude Plex .tht elements; only consider accessory list containers
                return this.isInAccessoryList(el);
            }) as HTMLElement | undefined;
            if(listThoughtEl) {
                const idFromEl = listThoughtEl.id.substring(4, 40);
                thtId = idFromEl;
                plexObjectType = PlexObjectType.Thought;
                // choose the nearest rep for this id
                this.lastListRepHit = this.getRepForThoughtIdNearestToPoint(idFromEl, point);
            }
        }

        if(thtId === undefined) {
            // look for a thought icon
            let elements = allElementsAtPoint.filter(e => e.classList.contains("tht-icon"));
            if(elements.length > 0) {
                let thtIconEl = elements[0] as HTMLElement;
                let thtEl = this.findAncestor(thtIconEl, "tht");
                if(thtEl && (!overAccessoryPanel || this.isInAccessoryList(thtEl))) {
                    thtId = thtEl.id.substring(4, 40);
                    plexObjectType = PlexObjectType.ThoughtIcon;
                }
            }
        }

        if(thtId === undefined) {
            // look for a thought tag/note indicator (icon itself)
            let elements = allElementsAtPoint.filter(e => e.classList.contains("indicator-icon"));
            if(elements.length > 0) {
                let indicatorIconEl = elements[0] as HTMLElement;
                let thtEl = this.findAncestor(indicatorIconEl, "tht");
                if(thtEl && (!overAccessoryPanel || this.isInAccessoryList(thtEl))) {
                    thtId = thtEl.id.substring(4, 40);
                    plexObjectType = PlexObjectType.ThoughtDecorator;
                    // Store both indicatorId and indicatorType in data as an object
                    data = {
                        indicatorId: indicatorIconEl.dataset["indicatorId"],
                        indicatorType: indicatorIconEl.dataset["indicatorType"]
                    };
                }
            }
        }

        if(thtId === undefined) {
            // look for a tag label container or label span and map to its icon
            let container = allElementsAtPoint.find(e => {
                const el = e as HTMLElement;
                return el.classList && (el.classList.contains("indicator-with-label") || el.classList.contains("indicator-label"));
            }) as HTMLElement | undefined;
            if(container) {
                // If hovered element is the label, go up to the container
                const wrapper = container.classList.contains("indicator-with-label") ? container : this.findAncestor(container, "indicator-with-label");
                if(wrapper) {
                    const icon = wrapper.querySelector(".indicator-icon") as HTMLElement | null;
                    const thtEl = this.findAncestor(wrapper, "tht");
                    if(icon && thtEl && (!overAccessoryPanel || this.isInAccessoryList(thtEl))
                        && this.isWithinExpandedDecorationRestBounds((icon.dataset as any)["indicatorId"], thtEl, clientPoint)) {
                        thtId = thtEl.id.substring(4, 40);
                        plexObjectType = PlexObjectType.ThoughtDecorator;
                        // Store both indicatorId and indicatorType in data as an object
                        data = {
                            indicatorId: icon.dataset["indicatorId"],
                            indicatorType: icon.dataset["indicatorType"]
                        };
                    }
                }
            }
        }

        if(thtId === undefined && !overAccessoryPanel) {
            // look for a thought
            let elements = allElementsAtPoint.filter(e => e.classList.contains("tht") && e.classList.contains("cur"));
            if(elements.length > 0) {
                thtId = elements[0].id.substring(4, 40);
                plexObjectType = PlexObjectType.Thought;
            }
        }

        if(thtId === undefined) {
            return null;
        }

        return [thtId, plexObjectType, data];
    }

    checkForHover(clientPoint: Point, pointerType: string, ignoreHoverSuppress: boolean): boolean {

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

        // reset hover state (but preserve source gate identity during a gate drag)
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
        if(!preventInteraction && plexAnimator.layout == LayoutType.Force && plexAnimator.forceLayout.ellapsedTime < plexAnimator.FORCE_LAYOUT_INTERACTION_DELAY) {
            // Do not allow hover during initial animation since things are moving fast and any hover is likely unintentional at this point
            preventInteraction = true;
        }
        
        if(ignoreHoverSuppress) {
            // Always allow hover checks on pointer down events
            preventInteraction = false; 
        }

        if(!preventInteraction) {
            // If we are dragging from a gate, keep the source gate identity
            if(this.pressedObjectType == PlexObjectType.ThoughtGate && oldGateId) {
                // Preserve original source gate while dragging a gate
                this.hoveredGateThtId = oldGateId;
                this.hoveredGateRelation = oldGateRel;
            }

            // look for a thought;
            let thoughtResult = this.findThoughtAt(clientPoint, pointerType);
            if(thoughtResult) {
                switch(thoughtResult[1]) {
                    case PlexObjectType.ThoughtGate:
                        if(pointerType === "fake") {
                            // Touch tap: treat gate as thought (no gate highlight)
                            this.hoveredThoughtId = thoughtResult[0];
                        } else if(this.pressedObjectType != PlexObjectType.ThoughtGate) {
                            // Only update source gate when not actively dragging
                            this.hoveredGateThtId = thoughtResult[0];
                            this.hoveredGateRelation = thoughtResult[2];
                            // Default to linking to itself only for a click, not during a drag
                            this.gateDragDestThtId = this.hoveredGateThtId;
                            // Treat as a thought hover too so the hover clone appears.
                            // Cleared on mousedown so the clone disappears when a drag starts.
                            this.hoveredThoughtId = thoughtResult[0];
                        }
                        break;
                    case PlexObjectType.ThoughtIcon:
                        if(!this.isDialogShowing) {
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

            if(pointerType != "touch" && pointerType != "fake" && !isInteracting && this.linkColliders !== undefined) {
                // look for a link
                let fieldRect = this.field.getBoundingClientRect();
                let point = new Point(clientPoint.x - fieldRect.x, clientPoint.y - fieldRect.y)
                Object.keys(this.linkColliders).forEach((id) => {
                    if(this.linkColliders![id].collide(point)) {
                        this.hoveredLinkId = id;
                    }
                });
                isInteracting = this.hoveredLinkId !== undefined;
            }
            
            // TODO check for scrollbar hover
            // if(!isInteracting && this.scrollbars != null) {
            //     this.scrollbars.forEach((s) => {
            //         if(s != null && s.isPointWithinScrollbar(clientPoint)) {
            //             //this.pressedObjectType = PlexObjectType.Scrollbar;
            //             Scrollbar.stateByZone[s.zone].isHovered = true;
            //             isInteracting = true;
            //         }
            //     });
            // }
        }

        this.renderNow = this.renderNow || this.hoveredThoughtId != lastHoveredThoughtId || this.hoveredLinkId != lastHoveredLinkId || this.hoveredGateThtId != lastHoveredGateThtId || this.lastListRepHit != lastListRepHit || this.hoveredControlThtId != lastHoveredControlThtId;
        
        // Update hoveredListRep when either hoveredThoughtId changes or lastListRepHit changes
        if(this.hoveredThoughtId != lastHoveredThoughtId || this.lastListRepHit != lastListRepHit) {
            // Remember the specific list rep (if any) determined in findThoughtAt.
            // If dragging from list gates, keep using the original source rep when cursor leaves the lists.
            this.hoveredListRep = (this.pressedObjectType == PlexObjectType.ThoughtGate && this.isListGateDragActive && this.listGateDragSourceRep)
                ? this.listGateDragSourceRep
                : this.lastListRepHit;
        }
        
        if(this.hoveredThoughtId != lastHoveredThoughtId) {
            this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastHoveredThoughtId);
        }
        if(this.hoveredLinkId != lastHoveredLinkId) {
            this.hoveredLinkIdChanged(this.hoveredLinkId, lastHoveredLinkId);
        }
        if(this.hoveredThoughtId != lastHoveredThoughtId || this.hoveredLinkId != lastHoveredLinkId || this.hoveredGateThtId != lastHoveredGateThtId || this.hoveredThoughtIconId != lastHoveredThoughtIconId) {
            // EntityType: 2 = Thought, 3 = Link, -1 = Unknown (null/clear)
            // Include hoveredGateThtId and hoveredThoughtIconId so hovering a gate or icon also counts as hovering the thought
            let hoverId = this.hoveredThoughtId ?? this.hoveredLinkId ?? this.hoveredGateThtId ?? this.hoveredThoughtIconId ?? null;
            let entityType = (this.hoveredThoughtId || this.hoveredGateThtId || this.hoveredThoughtIconId) ? 2 : this.hoveredLinkId ? 3 : -1;
            safeInvoke(plexAnimator.dotNetHelper, "SetHoverItemByIdAsync", [hoverId, entityType]);
        }
        if(this.hoveredGateThtId != lastHoveredGateThtId || this.hoveredGateRelation != lastHoveredGateRelation) {
            this.hoveredGateOrControlThtIdChanged(
                this.hoveredGateThtId, lastHoveredGateThtId,
                this.hoveredGateRelation, lastHoveredGateRelation
            );
        }
        if(this.hoveredThoughtIconId != lastHoveredThoughtIconId) {
            this.hoveredThoughtIconIdChanged(this.hoveredThoughtIconId, lastHoveredThoughtIconId);
        }
        if(this.hoveredDecorationThtId != lastHoveredDecorationThtId || this.hoveredDecorationId != lastHoveredDecorationId || this.hoveredDecorationType != lastHoveredDecorationType) {
            this.hoveredDecorationChanged(this.hoveredDecorationThtId, lastHoveredDecorationThtId, this.hoveredDecorationId, lastHoveredDecorationId, this.hoveredDecorationType, lastHoveredDecorationType);
        }
        if(this.hoveredControlThtId != lastHoveredControlThtId) {
            this.hoveredGateOrControlThtIdChanged(this.hoveredControlThtId, lastHoveredControlThtId);
        }
        this.updateHoveredListOverlayPosition();
        return isInteracting;
    }

    findAncestor(el: HTMLElement | null, cls: string): HTMLElement | null {
        if(el == null) {
            return null;
        }
        while((el = el.parentElement) && !el.classList.contains(cls)) {
            // do nothing
        }
        return el;
    }

    private isInAccessoryList(el: HTMLElement | null): boolean {
        if(!el) return false;
        // Includes the row containers themselves and the surrounding panel/container
        // wrappers so cursor positions in gaps between rows, panel padding, or the
        // panel header still count as "in the list" for hover/clearing purposes.
        const classes = [
            'pinned-thoughts-list', 'past-thoughts-list', 'selected-thoughts-list',
            'pinned-thoughts-list-container', 'past-thoughts-list-container', 'selected-thoughts-panel'
        ];
        for(const cls of classes) {
            if(el.classList.contains(cls)) return true;
            if(this.findAncestor(el, cls)) return true;
        }
        return false;
    }

    updateColor(element: HTMLElement, alpha: any) {
        const value = element.style.backgroundColor;
        let parts = value.match(/[\d.]+/g);
        if(!parts) {
            parts = ['200', '200', '200', ''+alpha];
        }
        else if (parts.length === 3) {
            parts.push(alpha);
        } else {
            parts[3] = '' + Math.min(1, Math.max(0, alpha));
        }
        element.style.backgroundColor = `rgba(${ parts.join(',') })`;
    }

    private removeHoveredListOverlay() {
        if(this.hoveredListOverlayEl) {
            this.hoveredListOverlayEl.remove();
            this.hoveredListOverlayEl = null;
        }
    }

    private showHoveredListThoughtOverlay(rep: ThoughtRep) {
        // Suppress during activation animations — the clone would cover the
        // thought as it animates into the center of the plex.
        if(this.isHoverSuppressed()) {
            this.removeHoveredListOverlay();
            return;
        }
        const doc = this.field.ownerDocument;
        const host = doc ? doc.body : document.body;
        this.removeHoveredListOverlay();

        const expandVertically = this.listOverlayExpandsVertically;
        this.currentListOverlayExpandsVertically = expandVertically;

        let clone = rep.thtEl.cloneNode(true) as HTMLElement;
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

        if(expandVertically) {
            const width = rect.width;
            clone.style.width = `${width}px`;
            clone.style.maxWidth = `${width}px`;
        } else {
            clone.style.width = "fit-content";
            clone.style.maxWidth = "none";
        }

        host.appendChild(clone);

        const thoughtControlElements = clone.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
        thoughtControlElements.forEach((el) => {
            el.style.overflow = "visible";
            el.style.opacity = "1.0";
            if(expandVertically) {
                const width = rect.width;
                (el as HTMLElement).style.maxWidth = `${width}px`;
                (el as HTMLElement).style.width = "100%";
            } else {
                (el as HTMLElement).style.maxWidth = "none";
                (el as HTMLElement).style.width = "fit-content";
            }
            const bg = window.getComputedStyle(el).backgroundColor;
            if(bg && bg.startsWith('rgba')) {
                const parts = bg.substring(bg.indexOf('(') + 1, bg.indexOf(')')).split(',');
                if(parts.length === 4) {
                    const alpha = parseFloat(parts[3]);
                    if(alpha < 1) {
                        parts[3] = '1';
                        (el as HTMLElement).style.backgroundColor = `rgba(${parts.join(',')})`;
                    }
                }
            }
        });

        const textElements = clone.querySelectorAll(".narrow-text-when-narrow") as NodeListOf<HTMLElement>;
        textElements.forEach((el) => {
            el.style.whiteSpace = "normal";
            el.style.textOverflow = "clip";
            if(expandVertically) {
                el.style.width = "100%";
                el.style.overflowWrap = "break-word";
            } else {
                el.style.overflow = "visible";
            }
            const fullName = el.dataset.fullName;
            if(fullName) {
                el.textContent = fullName;
            }
        });

        this.hoveredListOverlayEl = clone;
        this.updateHoveredListOverlayPosition();
        // One-shot shrink so the rounded background hugs the wrapped content. Done
        // after the position update (which applies max-width) so wrapping reflects
        // the final available width.
        this.shrinkHoverCloneToWrappedContent(clone, this.field.getBoundingClientRect().right - rect.left - 4);
        // Trigger the opacity transition on the next frame so the clone fades in.
        requestAnimationFrame(() => { clone.style.opacity = "1"; });
    }

    private updateHoveredListOverlayPosition() {
        if(!this.hoveredListOverlayEl || !this.hoveredListRep) {
            return;
        }
        const rect = this.hoveredListRep.thtEl.getBoundingClientRect();
        const overlay = this.hoveredListOverlayEl;

        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.height = "auto";
        overlay.style.minHeight = `${rect.height}px`;
        overlay.style.bottom = "auto";

        if(this.currentListOverlayExpandsVertically) {
            const isPinned = !!this.findAncestor(this.hoveredListRep.thtEl, 'pinned-thoughts-list');
            const isSelected = !!this.findAncestor(this.hoveredListRep.thtEl, 'selected-thoughts-list');
            if(isPinned || isSelected) {
                // Pinned (top of plex) and selected (left side, vertical list) anchor
                // at the row's top and grow downward.
                overlay.style.top = `${rect.top + window.scrollY}px`;
            } else {
                // Past list anchors at the bottom of the plex and grows upward.
                overlay.style.top = "auto";
                overlay.style.bottom = `${window.innerHeight - rect.bottom}px`;
            }
            overlay.style.width = `${rect.width}px`;
            overlay.style.maxWidth = `${rect.width}px`;
            overlay.style.minWidth = `${rect.width}px`;
        } else {
            overlay.style.top = `${rect.top + window.scrollY}px`;
            overlay.style.maxWidth = "none";
            overlay.style.minWidth = `${rect.width}px`;
        }

        // The hovered thought's gates render on the interaction canvas (z-31), above this
        // overlay, so the overlay no longer needs to duck on gate hover.
        overlay.style.zIndex = "30";

        this.clampHoverCloneToPlexBounds(overlay, rect, true);
    }

    // Constrains a hover-clone overlay so that:
    //   - its right edge does not extend past the right edge of the plex (forces wrap)
    //   - if wrapping pushes its bottom past the plex bottom, it shifts up
    //   - it does not extend past the plex left edge
    // Works for overlays appended to either document.body (list overlay) or this.field
    // (regular hover). Coordinates on the overlay are interpreted accordingly.
    // Shrink a single .thought-control's rounded background to hug the wrapped text,
    // instead of stretching to the (capped) max-width of its flex parent. Range rect
    // widths can disagree with layout's needed width by sub-pixel amounts (kerning,
    // anti-aliasing, trailing whitespace), so try increasing margins until the line
    // count after shrink matches the original — otherwise revert. Idempotent: any
    // prior pinned width on the element is reset before measuring so we always work
    // from the natural wrapped state.
    private shrinkThoughtControlToWrappedContent(tc: HTMLElement, availableWidth: number) {
        const textEls = tc.querySelectorAll(".narrow-text-when-narrow") as NodeListOf<HTMLElement>;
        if(textEls.length === 0) return;

        // Reset any prior shrink so we measure the natural wrapped state.
        tc.style.removeProperty('width');
        if(availableWidth > 0) {
            tc.style.maxWidth = `${availableWidth}px`;
        } else {
            tc.style.removeProperty('maxWidth');
        }
        textEls.forEach(textEl => {
            textEl.style.removeProperty('width');
            if(availableWidth > 0) {
                textEl.style.maxWidth = `${availableWidth}px`;
            } else {
                textEl.style.removeProperty('maxWidth');
            }
        });

        const measureLines = (): { longest: number, count: number } => {
            let longest = 0;
            let count = 0;
            textEls.forEach(textEl => {
                try {
                    const range = document.createRange();
                    range.selectNodeContents(textEl);
                    const rects = range.getClientRects();
                    if(rects.length > count) count = rects.length;
                    for(let i = 0; i < rects.length; i++) {
                        if(rects[i].width > longest) longest = rects[i].width;
                    }
                } catch(_) { /* ignore */ }
            });
            return { longest, count };
        };

        const original = measureLines();
        if(original.longest <= 0) return;

        const tcWidth = tc.getBoundingClientRect().width;
        let textTotalWidth = 0;
        textEls.forEach(textEl => {
            textTotalWidth = Math.max(textTotalWidth, textEl.getBoundingClientRect().width);
        });
        if(textTotalWidth <= 0) return;
        const extra = tcWidth - textTotalWidth;

        const applyWidths = (textWidth: number) => {
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
            if(availableWidth > 0) {
                tc.style.maxWidth = `${availableWidth}px`;
            } else {
                tc.style.removeProperty('maxWidth');
            }
            textEls.forEach(textEl => {
                textEl.style.removeProperty('width');
                if(availableWidth > 0) {
                    textEl.style.maxWidth = `${availableWidth}px`;
                } else {
                    textEl.style.removeProperty('maxWidth');
                }
            });
        };

        let margin = 1;
        let success = false;
        while(margin <= 64) {
            const targetTextWidth = Math.ceil(original.longest) + margin;
            const targetTcWidth = targetTextWidth + extra;
            if(targetTcWidth >= tcWidth) break;
            applyWidths(targetTextWidth);
            if(measureLines().count <= original.count) {
                success = true;
                break;
            }
            margin *= 2;
        }
        if(!success) revertWidths();
    }

    // Shrink each .thought-control inside a hover-clone overlay (one-shot at clone
    // creation; calling repeatedly would oscillate since prior shrink changes the
    // box rect we measure).
    private shrinkHoverCloneToWrappedContent(overlay: HTMLElement, availableWidth: number) {
        const tcs = overlay.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
        tcs.forEach(tc => this.shrinkThoughtControlToWrappedContent(tc, availableWidth));
    }

    // Shrink each .thought-control inside an accessory list (e.g. the selected-
    // thoughts list) so the rounded background hugs each row's wrapped text. Safe
    // to call repeatedly — the per-element method resets prior pinned widths first.
    public shrinkAccessoryListItemWidths(containerSelector: string) {
        const container = document.querySelector(containerSelector) as HTMLElement | null;
        if(!container) return;
        const containerRect = container.getBoundingClientRect();
        const tcs = container.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
        tcs.forEach(tc => this.shrinkThoughtControlToWrappedContent(tc, containerRect.width));
    }

    private clampHoverCloneToPlexBounds(overlay: HTMLElement, anchorRect: DOMRect, hostIsBody: boolean) {
        if(!this.field) return;
        const plexRect = this.field.getBoundingClientRect();
        const PADDING = 4;

        // Enable wrap. The `old` class on the clone activates a CSS rule that forces
        // `white-space: nowrap !important` on inner divs; `multiline-wrap` is the
        // codebase's existing override that allows wrapping (defined later in the
        // stylesheet, so it wins specificity-equal !important matches).
        overlay.classList.add("multiline-wrap");

        const availableWidth = Math.max(0, plexRect.right - anchorRect.left - PADDING);
        if(availableWidth > 0) {
            overlay.style.maxWidth = `${availableWidth}px`;
            // Propagate to inner thought-control(s) so their own max-width:100% (or
            // explicit pixel widths set above) don't prevent wrap.
            const tcs = overlay.querySelectorAll(".thought-control") as NodeListOf<HTMLElement>;
            tcs.forEach(tc => {
                tc.style.maxWidth = `${availableWidth}px`;
            });
            const texts = overlay.querySelectorAll(".narrow-text-when-narrow") as NodeListOf<HTMLElement>;
            texts.forEach(t => {
                t.style.maxWidth = `${availableWidth}px`;
            });
        }

        // Force layout so we read the wrapped height.
        const overlayRect = overlay.getBoundingClientRect();

        // Vertical clamp: if bottom overflows the plex, shift up (but not past plex top).
        if(overlayRect.bottom > plexRect.bottom) {
            const desiredViewportTop = Math.max(plexRect.top, plexRect.bottom - overlayRect.height);
            overlay.style.bottom = "auto";
            // Override the inherited `top` transition (set on every thought by
            // plexAnimator) so the hover-clone clamp shift is instant — but keep
            // the opacity transition so the fade-in still runs.
            overlay.style.transition = PlexCanvas.HOVER_CLONE_OPACITY_TRANSITION;
            if(hostIsBody) {
                overlay.style.top = `${desiredViewportTop + window.scrollY}px`;
            } else {
                overlay.style.top = `${desiredViewportTop - plexRect.top}px`;
            }
        }

        // Horizontal left clamp: don't let it stick out the left edge of the plex.
        if(overlayRect.left < plexRect.left) {
            if(hostIsBody) {
                overlay.style.left = `${plexRect.left + window.scrollX}px`;
            } else {
                overlay.style.left = "0px";
            }
        }
    }

    setListOverlayExpansionMode(expandVertically: boolean) {
        if(this.listOverlayExpandsVertically === expandVertically) {
            return;
        }
        this.listOverlayExpandsVertically = expandVertically;
        if(!this.hoveredListOverlayEl) {
            this.currentListOverlayExpandsVertically = expandVertically;
            return;
        }
        if(this.hoveredListRep) {
            this.showHoveredListThoughtOverlay(this.hoveredListRep);
        } else {
            this.removeHoveredListOverlay();
        }
    }

    setIsSearchUIShowing(isShowing: boolean) {
        this.isSearchUIShowing = isShowing;
    }

    setIsDialogShowing(isShowing: boolean) {
        this.isDialogShowing = isShowing;
    }

    hoveredThoughtIdChanged(id: string | undefined, lastId: string | undefined) {
        const textHoverMode = (plexAnimator as any).tagTextVisibilityMode === 'hover';
        const iconHoverMode = (plexAnimator as any).tagIconVisibilityMode === 'hover';
        const adjustGap = textHoverMode || iconHoverMode;

        if(lastId) {
            const lastRep = plexAnimator.thtReps.get(lastId);
            if(lastRep) {
                // Restore indicator visibility on the original thought element
                const originalIndicators = lastRep.thtEl.querySelector('.indicator-icons') as HTMLElement | null;
                if(originalIndicators) {
                    originalIndicators.style.visibility = '';
                }

                // Switch text back to original display text (label or name)
                const wrappers = lastRep.thtEl.querySelectorAll('.indicator-with-label') as NodeListOf<HTMLElement>;
                wrappers.forEach(w => {
                    const label = w.querySelector('.indicator-label') as HTMLElement | null;
                    if(label) {
                        // Only swap if the original text differs from the full name
                        const originalText = (label.dataset as any)['originalText'];
                        const fullName = (label.dataset as any)['indicatorName'];
                        if(originalText !== undefined && originalText !== fullName) {
                            label.textContent = originalText;
                        }
                    }
                });

                if(textHoverMode) {
                    wrappers.forEach(w => {
                        const label = w.querySelector('.indicator-label') as HTMLElement | null;
                        if(label) {
                            label.style.display = 'none';
                        }
                        // Remove pill colors when not hovered
                        if(w.dataset && (w.dataset as any)['backColorCss']) {
                            w.style.backgroundColor = '';
                        }
                        if(w.dataset && (w.dataset as any)['foreColorCss']) {
                            w.style.color = '';
                        }
                        // Remove horizontal padding until hovered again
                        w.style.padding = '0';
                    });
                }
                if(iconHoverMode) {
                    const icons = lastRep.thtEl.querySelectorAll('.indicator-icon[data-icon-visibility="hover"]') as NodeListOf<HTMLElement>;
                    icons.forEach(icon => { icon.style.display = 'none'; });
                }
                if(adjustGap) {
                    const parent = lastRep.thtEl.querySelector('.indicator-icons') as HTMLElement | null;
                    if(parent) { parent.style.gap = '0px'; }
                }
            }
        }
        // If hovering a list rep (not in Plex), request extra links that include it
        if(id && !plexAnimator.thtReps.has(id)) {
            const ids: string[] = Array.from(plexAnimator.thtReps.keys());
            if(!ids.includes(id)) ids.push(id);
            plexAnimator.requestExtraLinksForIds(ids);
        }
        // remove old
        let oldHoveredEls = this.field.querySelectorAll(".hovered-tht, .hovered-tht-label") as NodeListOf<HTMLElement>;
        oldHoveredEls.forEach((oldHoveredEl) => {
            oldHoveredEl.remove();
        });
        this.removeHoveredListOverlay();
        if(id) {
            // A thought can appear both in the Plex and in an accessory panel under the same
            // id. When the hovered instance is the accessory copy, leave the Plex copy alone
            // so it doesn't also render as hovered (its accessory overlay is shown below).
            const accessoryInstanceHovered = !!this.hoveredListRep && this.hoveredListRep.id === id;
            const rep = plexAnimator.thtReps.get(id);
            if(rep && !rep.thtEl.classList.contains("old") && !accessoryInstanceHovered) {
                // Always switch labels to names on thought hover (for any mode)
                const wrappers = rep.thtEl.querySelectorAll('.indicator-with-label') as NodeListOf<HTMLElement>;
                wrappers.forEach(w => {
                    const label = w.querySelector('.indicator-label') as HTMLElement | null;
                    if(label) {
                        // Only swap if the original text differs from the full name
                        const originalText = (label.dataset as any)['originalText'];
                        const fullName = (label.dataset as any)['indicatorName'];
                        if(fullName !== undefined && originalText !== fullName) {
                            label.textContent = fullName;
                        }
                    }
                });

                if(textHoverMode || iconHoverMode) {
                    if(textHoverMode) {
                        wrappers.forEach(w => {
                            const label = w.querySelector('.indicator-label') as HTMLElement | null;
                            if(label) {
                                label.style.display = '';
                            }
                            // Apply pill colors on hover using data attrs provided by showTags
                            const ds: any = w.dataset || {};
                            if(ds['backColorCss']) {
                                w.style.backgroundColor = ds['backColorCss'];
                            }
                            if(ds['foreColorCss']) {
                                w.style.color = ds['foreColorCss'];
                            }
                            // Apply horizontal padding only while hovered
                            w.style.padding = '0.1em 0.45em';
                        });
                    }
                    if(iconHoverMode) {
                        const icons = rep.thtEl.querySelectorAll('.indicator-icon[data-icon-visibility="hover"]') as NodeListOf<HTMLElement>;
                        icons.forEach(icon => { icon.style.display = ''; });
                    }
                    if(adjustGap) {
                        const parent = rep.thtEl.querySelector('.indicator-icons') as HTMLElement | null;
                        if(parent) { parent.style.gap = '1px'; }
                    }
                }
            }
            // If a list-reorder drag is in progress, suppress hover expansion overlays
            const listReorderDragActive = (document.body && ((document.body as any).dataset?.listReorderDragging === 'true' || document.body.classList.contains('list-reorder-dragging')));
            // Suppress the hover clone during activation animations — otherwise it sits
            // on top of the thought as it animates into the center of the plex.
            const hoverSuppressedForAnim = this.isHoverSuppressed();
            // clone and enable word wrap
            let thtRep = plexAnimator.thtReps.get(id);
            if(thtRep && thtRep.thtEl.classList.contains("old")) {
                thtRep = undefined;
            }
            // Don't clone the Plex instance when the accessory-panel instance is the hovered
            // one — that copy is shown via showHoveredListThoughtOverlay further down.
            if(accessoryInstanceHovered) {
                thtRep = undefined;
            }
            if(thtRep && !listReorderDragActive && !hoverSuppressedForAnim) {
                // Hide indicators on the original thought element to prevent duplicates
                const originalIndicators = thtRep.thtEl.querySelector('.indicator-icons') as HTMLElement | null;
                if(originalIndicators) {
                    originalIndicators.style.visibility = 'hidden';
                }

                let newElement = thtRep.thtEl.cloneNode(true) as HTMLElement;

                // Restore indicator visibility on the cloned overlay element
                const overlayIndicators = newElement.querySelector('.indicator-icons') as HTMLElement | null;
                if(overlayIndicators) {
                    overlayIndicators.style.visibility = '';
                }

                newElement.id = "tht-"+id+"-hovered";
                newElement.classList.remove("cur", "link-hovered", "gate-hovered");
                newElement.classList.add("hovered-tht", "old"); // "old" to make sure this is removed if a new animation starts
                newElement.style.whiteSpace = "normal";
                newElement.style.overflow = "visible";
                newElement.style.maxHeight = "none";
                const clonedTextEl = newElement.querySelector('.narrow-text-when-narrow') as HTMLElement;
                if (clonedTextEl) {
                    clonedTextEl.style.display = '';
                    clonedTextEl.style.overflow = '';
                    clonedTextEl.style.removeProperty('-webkit-box-orient');
                    clonedTextEl.style.removeProperty('-webkit-line-clamp');
                    const fullName = clonedTextEl.dataset.fullName;
                    if(fullName) {
                        clonedTextEl.textContent = fullName;
                    }
                }
                newElement.style.animation = "";
                // The hovered thought's gates render on the interaction canvas (z-31), above
                // this clone, so the clone no longer needs to duck on gate hover.
                newElement.style.zIndex = "30";
                newElement.style.pointerEvents = "none";
                newElement.style.transition = PlexCanvas.HOVER_CLONE_OPACITY_TRANSITION;
                newElement.style.opacity = "0";

                let thoughtControlElements = newElement.querySelectorAll(".hovered-tht .thought-control") as NodeListOf<HTMLElement>;
                let that = this;
                thoughtControlElements.forEach((el) => {
                    el.style.overflow = "visible";
                    el.style.opacity = "1.0";
                    el.style.border = newElement.style.border;
                    that.updateColor(el, 1.0);
                    // get the great-grandchild of newElement, which wraps the text
                    let textWrapperElements = el.querySelectorAll(".hovered-tht .thought-control div") as NodeListOf<HTMLElement>;
                    textWrapperElements.forEach((e) => {
                        e.style.whiteSpace = "normal";
                    });
                });
                this.field.appendChild(newElement);

                // Clamp the clone so it stays within the plex: wraps at the right edge,
                // shifts up if the wrapped clone would overflow the bottom.
                const anchorRect = thtRep.thtEl.getBoundingClientRect();
                this.clampHoverCloneToPlexBounds(newElement, anchorRect, false);
                // One-shot shrink so the rounded background hugs the wrapped content.
                this.shrinkHoverCloneToWrappedContent(newElement, this.field.getBoundingClientRect().right - anchorRect.left - 4);
                // Trigger the opacity transition on the next frame so the clone fades in.
                requestAnimationFrame(() => { newElement.style.opacity = "1"; });
                let top: any = parseInt(newElement.style.top.replace("px",""));

                // create label
                let labelText = thtRep.thtEl.dataset["label"];
                if(labelText && labelText.length > 0 && labelText != thtRep.thtEl.innerText) {
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
                    let ltop: any = parseInt(labelDiv.style.top.replace("px",""));
                    let height: any = parseInt(getComputedStyle(labelDiv).getPropertyValue("height").replace("px",""));
                    let bottom: any = ltop + height;
                    let delta = 2;
                    if(bottom > top) {
                        delta += bottom - top;
                    }
                    let labelTop = parseInt(labelDiv.style.top.replace("px",""));
                    labelDiv.style.top = (labelTop - delta) + 'px';
                    let labelLeft = parseInt(labelDiv.style.left.replace("px",""));
                    if(labelLeft < 0) {
                        labelDiv.style.left = "0px";
                    }
                    requestAnimationFrame(() => { labelDiv.style.opacity = "1"; });
                }
            }
            if(this.hoveredListRep && this.hoveredListRep.id === id) {
                const listReorderDragActive2 = (document.body && ((document.body as any).dataset?.listReorderDragging === 'true' || document.body.classList.contains('list-reorder-dragging')));
                if(!listReorderDragActive2 && !hoverSuppressedForAnim) {
                    this.showHoveredListThoughtOverlay(this.hoveredListRep);
                }
            }
        }

        this.highlightLinkLabelsForThought(id);
    }

    highlightLinkLabelsForThought(id: string | undefined) {

        // remove highlight from any links
        let hoveredLinkLabelEls = this.field.querySelectorAll(".link-label.link-hovered") as NodeListOf<HTMLElement>;
        hoveredLinkLabelEls.forEach((label) => {
            label.classList.remove("link-hovered");
        });

        // add highlight to links involving the thought
        if(id) {
            let thtLinks = Array.from(plexAnimator.linkReps.values()).filter((l) => l.idB === id || l.idA === id);
            thtLinks.forEach((l) => {
                let label = document.getElementById("lnk-" + l.id);
                if(label) {
                    label.classList.add("link-hovered");
                }
            });
        }
    }

    hoveredThoughtIconIdChanged(id: string | undefined, lastId: string | undefined) {
        // fade any existing
        let oldHoveredEls = this.field.querySelectorAll(".hovered-tht-icon") as NodeListOf<HTMLElement>;
        if(oldHoveredEls.length > 0) {
            oldHoveredEls.forEach((oldHoveredEl) => {
                oldHoveredEl.style.transition = "opacity " + plexAnimator.ICON_FADE_ANIMATION_TIME + "s ease";
                oldHoveredEl.classList.remove("hovered-tht-icon");
                oldHoveredEl.style.opacity = "0";
                oldHoveredEl.id = "";
                oldHoveredEl.classList.add("icon-to-remove");
            })
            setTimeout(() => {
                let removeEls = this.field.querySelectorAll(".icon-to-remove") as NodeListOf<HTMLElement>;
                removeEls.forEach((el) => {
                    el.remove();
                });
            }, plexAnimator.ICON_FADE_ANIMATION_TIME * 1000);
        }
        if(lastId) {
            // restore the cursor
            let thtRep = plexAnimator.thtReps.get(lastId);
            if(thtRep) {
                let iconEl = thtRep.thtEl.querySelector(".tht-icon") as HTMLElement | null;
                if(iconEl) {
                    // restore the cursor
                    iconEl.style.cursor = "inherit";
                }
            }
        }
        if(id) {
            setTimeout(() => {
                if(this.hoveredThoughtIconId == id) {
                    let existingHovered = this.field.querySelectorAll(".hovered-tht-icon") as NodeListOf<HTMLElement> | null;
                    if(existingHovered && existingHovered.length > 0) {
                        return;
                    }
                    // clone icon
                    let thtRep = plexAnimator.thtReps.get(id);
                    if(thtRep) {
                        let iconEl = thtRep.thtEl.querySelector(".tht-icon") as HTMLImageElement | null;
                        if(iconEl) {
                            // hide the cursor
                            iconEl.style.cursor = "none";
                            let newElement = iconEl.cloneNode(true) as HTMLImageElement;
                            // if the image is a scaled down version, increase the maximum size
                            let src = newElement.src;
                            let lastSlashIndex = src.lastIndexOf('/');
                            if(lastSlashIndex > 0 && src.substring(lastSlashIndex + 1)) {
                                let lastPart = src.substring(lastSlashIndex + 1);
                            if(Number(lastPart).toString() === lastPart) {
                                newElement.src = src.substring(0, lastSlashIndex) + "/" + plexAnimator.LARGE_ICON_SIZE;
                            }
                        }
                        newElement.classList.add("hovered-tht-icon");
                        newElement.style.zIndex = "30";
                        newElement.style.pointerEvents = "none";
                        this.field.appendChild(newElement);

                            this.zoomToFullSize(newElement, iconEl, iconEl);

                            if(!newElement.complete) {
                                // image is not loaded yet - wait for load to complete and then reanimate to full size
                                newElement.addEventListener('load', () => {
                                    this.zoomToFullSize(newElement, newElement, iconEl!);
                                });
                            }
                        }
                    }
                }
            }, plexAnimator.ICON_ZOOM_DELAY_TIME * 1000)
        }
    }

    zoomToFullSize(newElement: HTMLImageElement, srcElement: HTMLElement, centerElement: HTMLElement) {

        // save the current position
        let startRect = DomUtils.getRect(srcElement, this.field);

        // temporarily turn off transition so we can 
        // assign the destination style and save the resulting position
        // this is done so the browser will calculate all the final positions 
        newElement.style.transition = "";
        newElement.style.maxWidth = "100%";
        newElement.style.maxHeight = "100%";
        newElement.style.objectFit = "contain";
        newElement.style.width = newElement.naturalWidth + "px";
        newElement.style.height = newElement.naturalHeight + "px";

        // center on top of the old icon
        DomUtils.centerOnTopOf(newElement, centerElement, this.field);

        // center in the plex
        //DomUtils.centerOnTopOf(newElement, this.field, this.field);

        DomUtils.keepInsideOf(newElement, this.field);
        let endRect = DomUtils.getRect(newElement, this.field);

        // re-assign the saved style and begin transition
        this.positionElement(newElement, startRect);
        setTimeout(() => {
            newElement.style.transition = "all " + plexAnimator.ICON_ZOOM_ANIMATION_TIME + "s ease";
            // now say what we are transitioning to
            this.positionElement(newElement, endRect)
        }, 30);
    }

    positionElement(element: HTMLElement, rect: Rect) {
        element.style.left = rect.x+"px";
        element.style.top = rect.y+"px";
        element.style.width = rect.width+"px";
        element.style.height = rect.height+"px";
    }

    getColorString(num: number, alpha: number): string {
        num >>>= 0;
        let b = num & 0xFF,
            g = (num & 0xFF00) >>> 8,
            r = (num & 0xFF0000) >>> 16,
            a = +alpha;
        return "rgba(" + [r, g, b, a].join(",") + ")";
    }

    hoveredLinkIdChanged(id: string | undefined, lastId: string | undefined) {
        if(lastId) {
            let link = this.getLinkRep(lastId);
            if(link) {
                // remove highlights from previously highlighted link's thoughts
                let thtRepA = plexAnimator.thtReps.get(link.idA);
                let thtRepB = plexAnimator.thtReps.get(link.idB);
                if(thtRepA) {
                    thtRepA.thtEl.classList.remove("link-hovered");
                }
                if(thtRepB) {
                    thtRepB.thtEl.classList.remove("link-hovered");
                }
                // remove highlight from label
                let labelDiv = document.getElementById("lnk-"+link.id);
                if(labelDiv) {
                    labelDiv.classList.remove("link-hovered");
                }
            }
        }
        let link = this.getLinkRep(id);
        if(link) {
            // highlight thoughts
            let thtRepA = plexAnimator.thtReps.get(link.idA);
            let thtRepB = plexAnimator.thtReps.get(link.idB);
            if(thtRepA) {
                thtRepA.thtEl.classList.add("link-hovered");
            }
            if(thtRepB) {
                thtRepB.thtEl.classList.add("link-hovered");
            }
            // highlight label
            let labelDiv = document.getElementById("lnk-"+link.id);
            if(labelDiv) {
                labelDiv.classList.add("link-hovered");
            }
        }
    }

    hoveredGateOrControlThtIdChanged(
        id: string | undefined, lastId: string | undefined,
        relation: Relation = Relation.Unknown, lastRelation: Relation = Relation.Unknown
    ) {
        // Remove highlights from previous gate's thought and its connected thoughts
        if(lastId) {
            let thtRep = plexAnimator.thtReps.get(lastId);
            if(thtRep) {
                thtRep.thtEl.classList.remove("gate-hovered");
            }
            if(lastRelation !== Relation.Unknown) {
                plexAnimator.linkReps.forEach(l => {
                    let connectedId: string | undefined;
                    if(l.idA == lastId && l.relation == lastRelation) {
                        connectedId = l.idB;
                    } else if(l.idB == lastId && l.relation == this.getOppositeRelation(lastRelation)) {
                        connectedId = l.idA;
                    }
                    if(connectedId) {
                        let connectedRep = plexAnimator.thtReps.get(connectedId);
                        if(connectedRep) {
                            connectedRep.thtEl.classList.remove("link-hovered");
                        }
                    }
                });
            }
        }
        // Highlight the new gate's thought and its connected thoughts
        if(id) {
            let thtRep = plexAnimator.thtReps.get(id);
            if(thtRep) {
                thtRep.thtEl.classList.add("gate-hovered");
            }
            if(relation !== Relation.Unknown) {
                plexAnimator.linkReps.forEach(l => {
                    let connectedId: string | undefined;
                    if(l.idA == id && l.relation == relation) {
                        connectedId = l.idB;
                    } else if(l.idB == id && l.relation == this.getOppositeRelation(relation)) {
                        connectedId = l.idA;
                    }
                    if(connectedId) {
                        let connectedRep = plexAnimator.thtReps.get(connectedId);
                        if(connectedRep) {
                            connectedRep.thtEl.classList.add("link-hovered");
                        }
                    }
                });
            }
        }
    }

    hoveredDecorationChanged(thtId: string | undefined, lastThtId: string | undefined, decorationId: string | undefined, lastDecorationId: string | undefined, decorationType: string | undefined, lastDecorationType: string | undefined) {
        // Clear existing hover timer
        if(this.hoveredNoteIndicatorTimeout) {
            clearTimeout(this.hoveredNoteIndicatorTimeout);
            this.hoveredNoteIndicatorTimeout = undefined;
        }

        const textHoverMode = (plexAnimator as any).tagTextVisibilityMode === 'hover';
        const iconHoverMode = (plexAnimator as any).tagIconVisibilityMode === 'hover';

        // Handle unhover: restore original text and styling for the previously hovered indicator
        if(lastThtId && lastDecorationId) {
            this.expandedDecoration = undefined;
            const lastRep = plexAnimator.thtReps.get(lastThtId);
            if(lastRep) {
                // Restore the host thought's stacking order that was raised while a decoration was hovered.
                if((lastRep.thtEl.dataset as any)['decorationPriorZ'] !== undefined) {
                    lastRep.thtEl.style.zIndex = (lastRep.thtEl.dataset as any)['decorationPriorZ'];
                    delete (lastRep.thtEl.dataset as any)['decorationPriorZ'];
                }
                // When the pointer moves from the tag onto its thought control, hoveredThoughtIdChanged
                // (which fires first) has already expanded every tag — leave that styling in place and
                // only reset the z-order.
                const thoughtNowHovered = this.hoveredThoughtId === lastThtId;
                const wrappers = lastRep.thtEl.querySelectorAll('.indicator-with-label') as NodeListOf<HTMLElement>;
                wrappers.forEach(w => {
                    const icon = w.querySelector('.indicator-icon') as HTMLElement | null;
                    if(icon && (icon.dataset as any)['indicatorId'] === lastDecorationId) {
                        w.style.zIndex = '';
                        if(thoughtNowHovered) {
                            return;
                        }
                        const label = w.querySelector('.indicator-label') as HTMLElement | null;
                        if(label) {
                            // Only swap if the original text differs from the full name
                            const originalText = (label.dataset as any)['originalText'];
                            const fullName = (label.dataset as any)['indicatorName'];
                            if(originalText !== undefined && originalText !== fullName) {
                                label.textContent = originalText;
                            }
                            if(textHoverMode) {
                                label.style.display = 'none';
                            }
                        }
                        if(textHoverMode) {
                            // Remove pill colors and padding when not hovered
                            if(w.dataset && (w.dataset as any)['backColorCss']) {
                                w.style.backgroundColor = '';
                            }
                            if(w.dataset && (w.dataset as any)['foreColorCss']) {
                                w.style.color = '';
                            }
                            w.style.padding = '0';
                        }
                        if(iconHoverMode && (icon.dataset as any)['iconVisibility'] === 'hover') {
                            icon.style.display = 'none';
                        }
                    }
                });
            }
        }

        // Handle hover: apply the same styling as the thought-control hover, scoped to the hovered
        // indicator, plus a z-order bump so it appears in front of its neighbors (disabled on touch devices)
        if(thtId && decorationId && !plexAnimator.isTouchDevice) {
            const rep = plexAnimator.thtReps.get(thtId);
            if(rep) {
                // Raise the whole host thought above its siblings so the expanded decoration isn't
                // covered by neighboring thoughts. The per-wrapper z-index below only stacks the tag
                // within this thought's own context, which a sibling thought's context can still overlap.
                if((rep.thtEl.dataset as any)['decorationPriorZ'] === undefined) {
                    (rep.thtEl.dataset as any)['decorationPriorZ'] = rep.thtEl.style.zIndex || '';
                }
                rep.thtEl.style.zIndex = '15';
                const wrappers = rep.thtEl.querySelectorAll('.indicator-with-label') as NodeListOf<HTMLElement>;
                wrappers.forEach(w => {
                    const icon = w.querySelector('.indicator-icon') as HTMLElement | null;
                    if(icon && (icon.dataset as any)['indicatorId'] === decorationId) {
                        // Capture the collapsed bounds before expanding — the hover releases once
                        // the pointer leaves them (see isWithinExpandedDecorationRestBounds)
                        this.expandedDecoration = {
                            decorationId: decorationId,
                            restRect: w.getBoundingClientRect(),
                            thtRect: rep.thtEl.getBoundingClientRect()
                        };
                        const label = w.querySelector('.indicator-label') as HTMLElement | null;
                        if(label) {
                            // Only swap if the original text differs from the full name
                            const originalText = (label.dataset as any)['originalText'];
                            const fullName = (label.dataset as any)['indicatorName'];
                            if(fullName !== undefined && originalText !== fullName) {
                                label.textContent = fullName;
                            }
                            if(textHoverMode) {
                                label.style.display = '';
                            }
                        }
                        if(textHoverMode) {
                            // Apply pill colors on hover using data attrs provided by showTags
                            const ds: any = w.dataset || {};
                            if(ds['backColorCss']) {
                                w.style.backgroundColor = ds['backColorCss'];
                            }
                            if(ds['foreColorCss']) {
                                w.style.color = ds['foreColorCss'];
                            }
                            // Apply horizontal padding only while hovered
                            w.style.padding = '0.1em 0.45em';
                        }
                        if(iconHoverMode && (icon.dataset as any)['iconVisibility'] === 'hover') {
                            icon.style.display = '';
                        }
                        w.style.zIndex = '10';
                    }
                });
            }
        }

        // If hovering a note indicator, start timer to show dialog (disabled on touch devices)
        if(thtId && decorationType === "note" && !plexAnimator.isTouchDevice) {
            this.hoveredNoteIndicatorTimeout = window.setTimeout(() => {
                safeInvoke(plexAnimator.dotNetHelper, "ShowNotesDialog", [thtId, true]);
            }, 500); // 500ms delay before showing
        }
    }

    getLinkRep(id: string | undefined): LinkRep | undefined {
        if(!id) {
            return undefined;
        }
        return plexAnimator.linkReps.get(id);
    }

    isScrollbarInteracting() {
        let isInteracting = false;
        if(this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if(s != null) {
                    if(Scrollbar.stateByZone[s.zone].isHovered || Scrollbar.stateByZone[s.zone].isDragging) {
                        isInteracting = true;
                    }
                }
            });
        }
        return isInteracting;
    }

    getFieldPoint(event: PointerEvent): Point {
        let rect = this.field.getBoundingClientRect();
        let p = new Point(event.clientX, event.clientY);
        p.x -= rect.x;
        p.y -= rect.y;
        return p;
    }
    
    getFieldPointFromPoint(point: Point): Point {
        let rect = this.field.getBoundingClientRect();
        let p = new Point(point.x, point.y);
        p.x -= rect.x;
        p.y -= rect.y;
        return p;
    }

    isMainButton(event: PointerEvent): boolean {
        return event.pointerType !== "mouse" || event.button === 0;
    }
    
    // @ts-ignore
    drawSelectionRectangle(graphics: PIXI.Graphics) {
        if(!this.selectionRectStartPoint || !this.selectionRectEndPoint) return;
        
        let x = Math.min(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let y = Math.min(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let width = Math.abs(this.selectionRectEndPoint.x - this.selectionRectStartPoint.x);
        let height = Math.abs(this.selectionRectEndPoint.y - this.selectionRectStartPoint.y);
        
        
        const radiusScaleFactor = 0.2; // Adapt radius to rectangle size
        let cornerRadius = Math.min(10, width * radiusScaleFactor, height * radiusScaleFactor);
        
        graphics.roundRect(x, y, width, height, cornerRadius)
            .fill({color: plexAnimator.colors.thoughtActiveOutline, alpha: 0.2})
            .stroke({width: 2, color: plexAnimator.colors.thoughtActiveOutline, alpha: 1});
    }
    
    updateSelectionRectangleHighlights() {
        if(!this.selectionRectStartPoint || !this.selectionRectEndPoint) return;
        
        // Calculate selection rectangle bounds
        let minX = Math.min(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let minY = Math.min(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let maxX = Math.max(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let maxY = Math.max(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        
        let currentlyInRect: string[] = [];

        // Find all thoughts within the rectangle
        let thoughtElements = this.field.querySelectorAll('.tht.cur') as NodeListOf<HTMLElement>;
        thoughtElements.forEach((thtEl) => {
            // Get thought bounds relative to field
            let rect = DomUtils.getRect(thtEl, this.field);
            
            // Check if thought intersects with selection rectangle
            if(rect.x < maxX && rect.x + rect.width > minX &&
               rect.y < maxY && rect.y + rect.height > minY) {
                // Extract thought ID from element ID (format: tht-{guid}-cur)
                let thoughtId = thtEl.id.substring(4, 40);
                currentlyInRect.push(thoughtId);
            }
        });

        const baselineSelection = new Set(this.selectionRectInitialSelectedThoughtIds ? this.selectionRectInitialSelectedThoughtIds : this.selectedThoughtIds);
        const newHighlightedIds = new Set<string>();
        const newDeselectionPreview = new Set<string>();

        // Process thoughts currently inside rectangle
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
            } else {
                newDeselectionPreview.add(thoughtId);
                if (!this.selectionRectDeselectionPreviewThoughts.has(thoughtId)) {
                    element.classList.remove('selection-rect-highlight');
                    element.classList.remove('thought-selected');
                    const hovered = document.getElementById(`tht-${thoughtId}-hovered`);
                    if(hovered) {
                        hovered.classList.remove('thought-selected');
                    }
                }
            }
        }

        // Remove highlights from thoughts no longer highlighted
        for (let thoughtId of this.selectionRectHighlightedThoughts) {
            if (!newHighlightedIds.has(thoughtId)) {
                let element = document.getElementById(`tht-${thoughtId}-cur`);
                if (element) {
                    element.classList.remove('selection-rect-highlight');
                }
            }
        }

        // Restore selection visuals for thoughts no longer slated for deselection
        for (let thoughtId of this.selectionRectDeselectionPreviewThoughts) {
            if (!newDeselectionPreview.has(thoughtId) && this.selectedThoughtIds.includes(thoughtId)) {
                let element = document.getElementById(`tht-${thoughtId}-cur`);
                if (element && !element.classList.contains('thought-selected')) {
                    element.classList.add('thought-selected');
                }
                let hovered = document.getElementById(`tht-${thoughtId}-hovered`);
                if(hovered && !hovered.classList.contains('thought-selected')) {
                    hovered.classList.add('thought-selected');
                }
            }
        }

        // Update tracking sets
        this.selectionRectHighlightedThoughts = newHighlightedIds;
        this.selectionRectDeselectionPreviewThoughts = newDeselectionPreview;
    }

    clearSelectionRectangleHighlights(restoreDeselectionPreview: boolean = true) {
        // Remove all highlights
        for (let thoughtId of this.selectionRectHighlightedThoughts) {
            let element = document.getElementById(`tht-${thoughtId}-cur`);
            if (element) {
                element.classList.remove('selection-rect-highlight');
            }
        }
        this.selectionRectHighlightedThoughts.clear();

        if(restoreDeselectionPreview) {
            for (let thoughtId of this.selectionRectDeselectionPreviewThoughts) {
                if(this.selectedThoughtIds.includes(thoughtId)) {
                    let element = document.getElementById(`tht-${thoughtId}-cur`);
                    if(element && !element.classList.contains('thought-selected')) {
                        element.classList.add('thought-selected');
                    }
                    let hovered = document.getElementById(`tht-${thoughtId}-hovered`);
                    if(hovered && !hovered.classList.contains('thought-selected')) {
                        hovered.classList.add('thought-selected');
                    }
                }
            }
        }
        this.selectionRectDeselectionPreviewThoughts.clear();
    }

    finalizeSelectionRectangle() {
        if(!this.selectionRectStartPoint || !this.selectionRectEndPoint) return;
        
        // Calculate selection rectangle bounds
        let minX = Math.min(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let minY = Math.min(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        let maxX = Math.max(this.selectionRectStartPoint.x, this.selectionRectEndPoint.x);
        let maxY = Math.max(this.selectionRectStartPoint.y, this.selectionRectEndPoint.y);
        
        let selectedIds: string[] = [];

        // Find all thoughts within the rectangle
        let thoughtElements = this.field.querySelectorAll('.tht.cur') as NodeListOf<HTMLElement>;
        thoughtElements.forEach((thtEl) => {
            // Get thought bounds relative to field
            let rect = DomUtils.getRect(thtEl, this.field);
            
            // Check if thought intersects with selection rectangle
            if(rect.x < maxX && rect.x + rect.width > minX &&
               rect.y < maxY && rect.y + rect.height > minY) {
                // Extract thought ID from element ID (format: tht-{guid}-cur)
                let thoughtId = thtEl.id.substring(4, 40);
                selectedIds.push(thoughtId);
            }
        });

        // Toggle selections based on the rectangle contents
        const initialSelection = this.selectionRectInitialSelectedThoughtIds ? this.selectionRectInitialSelectedThoughtIds.slice() : this.selectedThoughtIds.slice();
        const rectSet = new Set(selectedIds);
        const initialSet = new Set(initialSelection);

        const newSelectedIds: string[] = [];

        // Keep initial selections that are not being toggled off
        for(const id of initialSelection) {
            if(!rectSet.has(id)) {
                newSelectedIds.push(id);
            }
        }

        // Add newly selected thoughts
        for(const id of selectedIds) {
            if(!initialSet.has(id)) {
                newSelectedIds.push(id);
            }
        }

        this.selectedThoughtsChanging(true);
        this.selectedThoughtIds = newSelectedIds;
        this.selectedThoughtsChanging(false);

        // Clear the stored baseline selection for future drags
        this.selectionRectInitialSelectedThoughtIds = null;
    }

    couldTouchScrollbar(point: Point): boolean {
        let ret = false;
        if(this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if(s != null) {
                    if(s.isPointWithinScrollbar(point)) {
                        ret = true;
                        return;
                    }
                }
            });
        }
        return ret;
    }

    touch_isOverScrollbar(clientPoint: Point): boolean {
        let fieldRect = this.field.getBoundingClientRect();
        let point = new Point(clientPoint.x - fieldRect.x, clientPoint.y - fieldRect.y)
        if(this.couldTouchScrollbar(point)) {
            return true;
        }
        return false;
    }

    PLEX_EVENT_EDGE_MARGIN = 40;
    
    onTouchStart(event: TouchEvent) {
        if(event.touches.length == 2) {
            // If a single-finger content-reveal / search drag is already in progress, it
            // started first and owns the touch session — don't start the plex two-finger
            // gesture (otherwise the reveal would be stranded partway on-screen).
            const revealActive = (window as any).__plexContentRevealActive;
            if(typeof revealActive === "function" && revealActive()) {
                return;
            }
            // Two fingers down: pinch to zoom the text scale (all layouts) and, on Normal
            // layouts, pan the plex vertically. The first finger already opened a single-
            // touch session above (touchstart fired with one touch); begin the two-finger
            // gesture, which cancels that session.
            this.beginTwoFingerDrag(event);
            return;
        }
        if(event.touches.length != 1) {
            // ignore other multi-touch
            return;
        }
        let touchType: string = "touch";
        // @ts-ignore
        if(event.touches.item(0).touchType == "stylus") { // this works on Safari only
            touchType = "mouse"; // pretend to be a mouse if Apple Pencil was used
        }

        // reset touch state
        this.touch_didPressAndHold = false;
        this.touch_hasDraggedTooFar = false;
        this.touch_shouldPassThroughToScrollPage = false;
        this.touch_lastSavedFakePointerEvent = this.newPointerEventFromTouchEvent(event.touches[0]!, 0, 0);
        this.touch_lastStartTime = new Date();
        this.touch_isDown = true;
        this.touch_isDraggingScrollbar = false;
        // hasDragExceededClickDistance is set true by onPointerMove during any drag (including
        // scrollbar drags on touch). For non-scrollbar touches, onTouchStart never calls
        // onPointerDown(fake) — the only place that normally resets it — so a stale true from a
        // prior scrollbar drag silently suppresses the next long-press's context menu at line 5691.
        this.hasDragExceededClickDistance = false;
        
        // see what is under the touch point - this mirrors onPointerDown
        let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);
        let isInteracting = this.checkForHover(clientPoint, touchType, true);
        
        let insideMargins = clientPoint.x > this.PLEX_EVENT_EDGE_MARGIN && clientPoint.x < this.field.clientWidth - this.PLEX_EVENT_EDGE_MARGIN;
        // OutlineLayout - allow panning by dragging background
        if(!isInteracting && (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) && insideMargins) {
            this.lastThoughtDragDelta = new Point(0, 0);
            this.setPressedObjectTypeBasedOnHoverState(this.touch_lastSavedFakePointerEvent);
            this.cancelHoldTimer();
            this.touch_holdTimeoutId = window.setTimeout(() => { this.checkHold(); }, this.HOLD_TIME_MS);
            event.preventDefault(); // prevent pass through to scroll page
            event.stopPropagation(); // prevent gesture recognizer for swipe back/forward
            return;
        }

        if(this.touch_isOverScrollbar(clientPoint)) {
            this.touch_isDraggingScrollbar = true;
        }
        this.setPressedObjectTypeBasedOnHoverState(this.touch_lastSavedFakePointerEvent);

        if(this.pressedObjectType == PlexObjectType.Scrollbar) {
            this.touch_isDraggingScrollbar = true;
            // pretend this is not a touch event so we can use the same code as mouse for handling scrollbars 
            this.touch_isDown = false;
            this.onPointerDown(this.touch_lastSavedFakePointerEvent);
            event.preventDefault(); // prevent pass through to scroll page if you hit a scrollbar
            return;
        }
        
        if(this.pressedObjectType == PlexObjectType.Background) {
            // background presses immediately start passing through to scroll page
            // everything else will not do so until touch_hasDraggedTooFar is set
            this.touch_shouldPassThroughToScrollPage = true;
        }

        this.cancelHoldTimer();
        this.touch_holdTimeoutId = window.setTimeout(() => { this.checkHold(); }, this.HOLD_TIME_MS);
    }

    // Store and clear the checkHold timer so it can't fire against a later touch.
    // Without this, a touchcancel (e.g. from a preventDefault higher up) leaves the
    // timer alive; it then fires during the next touch and mis-triggers the context
    // menu, or causes a double-fire that the menu treats as a close.
    private cancelHoldTimer() {
        if(this.touch_holdTimeoutId != null) {
            clearTimeout(this.touch_holdTimeoutId);
            this.touch_holdTimeoutId = null;
        }
    }

    // Midpoint of the first two active touches, in client coordinates.
    private touchesCenter(event: TouchEvent): Point {
        let x = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        let y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        return new Point(x, y);
    }

    // Distance between the first two active touches, in client pixels.
    private touchesDistance(event: TouchEvent): number {
        let dx = event.touches[0].clientX - event.touches[1].clientX;
        let dy = event.touches[0].clientY - event.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private isNormalLayout(): boolean {
        return plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne;
    }

    // Update the scaling feedback circle from the current finger spread. The plex itself is not
    // transformed — only the dynamic circle grows/shrinks relative to the fixed reference circle,
    // showing how the text size will change. Clamped to the committable range.
    private applyPinch(distance: number) {
        let info = this.touch_pinchInfo;
        if(info == null || this.touch_twoFingerStartDistance <= 0) {
            return; // info not loaded yet, or no usable baseline distance
        }
        let factor = distance / this.touch_twoFingerStartDistance;
        let minFactor = info.minPercent / info.baselinePercent;
        let maxFactor = info.maxPercent / info.baselinePercent;
        factor = Math.max(minFactor, Math.min(maxFactor, factor));
        this.touch_pinchLastFactor = factor;
        if(this.pinchCircleDynamic != null) {
            this.sizePinchCircle(this.pinchCircleDynamic, this.dynamicCircleRadius(info, factor));
        }
    }

    // Dynamic circle radius for a given scale factor. The size maps to the absolute text scale
    // (relative to the reference 100% = pinchCircleBaseRadius), so the circle starts at whatever
    // the current setting is and returns to the last size when a new gesture begins.
    private dynamicCircleRadius(info: PinchInfo, factor: number): number {
        let targetPercent = info.baselinePercent * factor; // already within [min,max] via factor clamp
        return this.pinchCircleBaseRadius * targetPercent / info.defaultPercent;
    }

    // Centre of the active thought in field-local coordinates (the circles anchor here), or null
    // if it can't be resolved.
    private activeThoughtFieldCenter(fieldRect: DOMRect): Point | null {
        let activeId = plexAnimator.activeId;
        if(!activeId) return null;
        let el = document.getElementById("tht-" + activeId + "-cur");
        if(el == null) return null;
        let r = el.getBoundingClientRect();
        return new Point((r.left + r.width / 2) - fieldRect.left, (r.top + r.height / 2) - fieldRect.top);
    }

    // Lazily create (and re-attach if the field was rebuilt) the two pinch feedback circles:
    // a fixed reference and one that scales. They sit above the plex content, ignore pointers,
    // and fade via opacity.
    private ensurePinchCircles() {
        if(this.pinchCircleStatic != null && this.pinchCircleStatic.parentElement === this.field
            && this.pinchCircleDynamic != null && this.pinchCircleDynamic.parentElement === this.field) {
            return;
        }
        const make = (isReference: boolean): HTMLElement => {
            let el = document.createElement("div");
            el.className = "plex-pinch-circle";
            el.style.position = "absolute";
            el.style.borderRadius = "50%";
            el.style.pointerEvents = "none";
            el.style.boxSizing = "border-box";
            el.style.opacity = "0";
            el.style.transition = "opacity 150ms ease";
            el.style.zIndex = "40";
            // Halo gives contrast on both light and dark wallpapers.
            if(isReference) {
                el.style.border = "2px solid rgba(255,255,255,0.85)";
                el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35)";
            } else {
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

    private sizePinchCircle(el: HTMLElement, radius: number) {
        let origin = this.touch_pinchOrigin;
        if(origin == null) return;
        el.style.width = (radius * 2) + "px";
        el.style.height = (radius * 2) + "px";
        el.style.left = (origin.x - radius) + "px";
        el.style.top = (origin.y - radius) + "px";
    }

    private showPinchCircles() {
        this.ensurePinchCircles();
        // Anchor both circles on the active thought (fall back to field centre).
        let fieldRect = this.field.getBoundingClientRect();
        this.touch_pinchOrigin = this.activeThoughtFieldCenter(fieldRect)
            ?? new Point(this.field.clientWidth / 2, this.field.clientHeight / 2);
        // Reference radius scales with the field so it reads well on any device; it represents the
        // default (100%) size.
        this.pinchCircleBaseRadius = Math.max(34, Math.min(90, this.field.clientHeight * 0.12));
        if(this.pinchCircleStatic != null) {
            this.sizePinchCircle(this.pinchCircleStatic, this.pinchCircleBaseRadius);
        }
        if(this.pinchCircleDynamic != null) {
            // Start at the current setting's size (factor 1) so re-pinching resumes from there.
            let info = this.touch_pinchInfo;
            let radius = info != null ? this.dynamicCircleRadius(info, 1) : this.pinchCircleBaseRadius;
            this.sizePinchCircle(this.pinchCircleDynamic, radius);
        }
        // Force a reflow so the opacity transition runs from 0.
        void this.field.offsetWidth;
        if(this.pinchCircleStatic != null) this.pinchCircleStatic.style.opacity = "1";
        if(this.pinchCircleDynamic != null) this.pinchCircleDynamic.style.opacity = "1";
    }

    private hidePinchCircles() {
        if(this.pinchCircleStatic != null) this.pinchCircleStatic.style.opacity = "0";
        if(this.pinchCircleDynamic != null) this.pinchCircleDynamic.style.opacity = "0";
    }

    private beginTwoFingerDrag(event: TouchEvent) {
        // Tear down the single-finger session the first touch started so its hold timer,
        // tap simulation and scroll pass-through don't fire when the gesture ends.
        this.cancelHoldTimer();
        this.touch_isDown = false;
        this.touch_didPressAndHold = false;
        this.touch_shouldPassThroughToScrollPage = false;
        this.touch_isDraggingScrollbar = false;
        this.lastThoughtDragDelta = null; // drop any single-finger background-pan state

        this.touch_isTwoFingerDragging = true;
        this.touch_twoFingerMode = "undecided";
        let center = this.touchesCenter(event);
        this.touch_twoFingerStartCenter = center;
        this.touch_twoFingerLastCenter = center;
        this.touch_twoFingerStartDistance = this.touchesDistance(event);
        // The circles are centred on the active thought when shown (see showPinchCircles).

        // Fetch the current scale + range so pinch can quantize/clamp locally. Resolves within a
        // few ms — pinch simply doesn't apply until it arrives (a no-op until then).
        this.touch_pinchInfo = null;
        this.touch_pinchLastFactor = 1;
        safeInvokeAsync<PinchInfo>(plexAnimator.dotNetHelper, "BeginPlexPinch").then((info) => {
            if(info) {
                this.touch_pinchInfo = info;
            }
        });

        event.preventDefault(); // don't let the page scroll / pinch-zoom
        event.stopPropagation(); // keep the content-reveal / search swipe handlers out of it
    }

    private endTwoFingerDrag() {
        if(!this.touch_isTwoFingerDragging) {
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

        if(mode == "pan" && this.isNormalLayout()) {
            plexAnimator.backgroundDragEnded(); // mirror the mouse background-drag release
            return;
        }
        if(mode == "pinch") {
            this.hidePinchCircles();
            let target = info != null ? this.pinchTargetPercentFor(info, lastFactor) : 0;
            if(info != null && target != info.baselinePercent) {
                // Persist the new scale; the committed re-render applies the real text size.
                safeInvoke(plexAnimator.dotNetHelper, "CommitPlexPinch", [target]);
            }
        }
    }

    private pinchTargetPercentFor(info: PinchInfo, factor: number): number {
        let raw = Math.round((info.baselinePercent * factor - info.minPercent) / info.step);
        let percent = info.minPercent + raw * info.step;
        return Math.max(info.minPercent, Math.min(info.maxPercent, percent));
    }

    newPointerEventFromTouchEvent(t: Touch, deltaX: number, deltaY: number): any {
        let ret: any = {};
        let fieldRect = this.field.getBoundingClientRect();
        let point = new Point(t.clientX - fieldRect.x, t.clientY - fieldRect.y);
        ret.clientX = t.clientX + deltaX;
        ret.clientY = t.clientY + deltaY;
        ret.offsetX = point.x + deltaX;
        ret.offsetY = point.y + deltaY;
        ret.pointerType = "fake"; // if we set this to "mouse", link colliders will be processed. If we set it to "touch", lots of events are mistakenly ignored
        ret.button = 0;
        ret.pointerId = null;
        ret.preventDefault = () => {};
        return ret;
    }

    checkHold() {
        if(this.touch_isDown && !this.touch_hasDraggedTooFar) {
            this.touch_didPressAndHold = true;

            if(this.touch_lastSavedFakePointerEvent) {
                // prevent scrolling
                this.touch_shouldPassThroughToScrollPage = false;
                // simulate right-click
                this.touch_lastSavedFakePointerEvent.button = 2;
                this.onContextMenu(this.touch_lastSavedFakePointerEvent);
            }

            // clear hover state since press-and-hold is kind of like onTouchEnd
            this.checkForHover(new Point(-9999, -9999), "touch", true) 
        }
    }
    
    lastThoughtDragDelta: Point | null = null;

    onTouchMove(event: TouchEvent) {
        if(event.touches.length < 1) {
            return;
        }

        if(this.touch_isTwoFingerDragging) {
            if(event.touches.length < 2 || this.touch_twoFingerLastCenter == null || this.touch_twoFingerStartCenter == null) {
                return;
            }
            event.preventDefault();
            let center = this.touchesCenter(event);
            let distance = this.touchesDistance(event);

            // Lock into pan or pinch on the first decisive movement; thereafter the other
            // action is impossible for the rest of the gesture.
            if(this.touch_twoFingerMode == "undecided") {
                let panTravel = Math.abs(center.y - this.touch_twoFingerStartCenter.y);
                let pinchTravel = this.touch_twoFingerStartDistance > this.TWO_FINGER_MIN_PINCH_DISTANCE
                    ? Math.abs(distance - this.touch_twoFingerStartDistance)
                    : 0;
                let canPan = this.isNormalLayout();
                if(pinchTravel > this.TWO_FINGER_DECIDE_PX && (!canPan || pinchTravel >= panTravel)) {
                    this.touch_twoFingerMode = "pinch";
                    this.showPinchCircles();
                } else if(canPan && panTravel > this.TWO_FINGER_DECIDE_PX) {
                    this.touch_twoFingerMode = "pan";
                } else {
                    // Not decisive yet — keep the baseline current so the first applied
                    // delta after locking is measured from here, then wait.
                    this.touch_twoFingerLastCenter = center;
                    return;
                }
            }

            if(this.touch_twoFingerMode == "pan") {
                let delta = center.subtract(this.touch_twoFingerLastCenter);
                plexAnimator.backgroundDragged(delta, true);
            } else if(this.touch_twoFingerMode == "pinch") {
                this.applyPinch(distance);
            }
            this.touch_twoFingerLastCenter = center;
            return;
        }

        if(this.lastThoughtDragDelta != null && (plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap)) {
            let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);
            let totalDelta = clientPoint.subtract(this.pointerDownPoint!);
            if(this.lastThoughtDragDelta != null) {
                totalDelta = totalDelta.subtract(this.lastThoughtDragDelta);
            }
            plexAnimator.backgroundDragged(totalDelta, true);
            this.lastThoughtDragDelta = clientPoint.subtract(this.pointerDownPoint!);
        }

        if(!this.touch_hasDraggedTooFar) {
            // check if we have dragged too far
            let clientPoint = new Point(event.touches[0].clientX, event.touches[0].clientY);
            let totalDelta = clientPoint.subtract(this.pointerDownPoint!);
            let delta2 = totalDelta.x * totalDelta.x + totalDelta.y * totalDelta.y;
            this.touch_hasDraggedTooFar = delta2 > this.MAX_CLICK_DIST * this.MAX_CLICK_DIST;
        }
        
        if(!this.touch_isDraggingScrollbar && (this.touch_hasDraggedTooFar || this.touch_shouldPassThroughToScrollPage) && !this.touch_didPressAndHold) {
            // pass through to allow user to scroll page
            return;
        }
        
        // prevent default to prevent scrolling
        event.preventDefault();

        if(this.touch_isDraggingScrollbar) {
            // simulate a mouse event so we can use the same code as mouse for handling scrollbars
            this.touch_lastSavedFakePointerEvent = this.newPointerEventFromTouchEvent(event.touches[0]!, 0, 0);
            this.touch_lastSavedFakePointerEvent.isTouchDragging = true;
            this.onPointerMove(this.touch_lastSavedFakePointerEvent);
            return;
        }
    }
 
    onTouchEnd(event: TouchEvent) {
        if(this.touch_isTwoFingerDragging) {
            // Stay in the two-finger gesture until every finger lifts so that releasing
            // one finger doesn't fall through to the tap/click simulation below.
            event.preventDefault();
            if(event.touches.length === 0) {
                this.endTwoFingerDrag();
            }
            return;
        }

        this.lastThoughtDragDelta = null;

        this.touch_isDown = false;
        this.cancelHoldTimer();

        if(this.touch_shouldPassThroughToScrollPage) {
            // allow default touch handling
            return;
        }

        // prevent default handling
        event.preventDefault();
        
        if(this.touch_didPressAndHold) {
            // we already handled this event
            return;
        }

        if(this.touch_isDraggingScrollbar) {
            // continue pretending to be a mouse event
            this.onPointerUp(this.touch_lastSavedFakePointerEvent);
            return;
        }

        if(!this.touch_hasDraggedTooFar) {
            // this was a tap - didn't move much and didn't hold long - similate a click
            this.onPointerDown(this.touch_lastSavedFakePointerEvent);
            this.onPointerUp(this.touch_lastSavedFakePointerEvent);
        }

    }

    onTouchCancel(event: TouchEvent) {
        if(this.touch_isTwoFingerDragging) {
            event.preventDefault();
            this.endTwoFingerDrag();
            return;
        }

        this.touch_isDown = false;
        this.cancelHoldTimer();

        if(this.touch_shouldPassThroughToScrollPage) {
            return;
        }

        event.preventDefault();

        if(this.touch_isDraggingScrollbar) {
            // Mirror onTouchEnd: onPointerUp clears Scrollbar.stateByZone (isDragging,
            // isPaging, isDraggingScrollBarThumb). onPointerLeave does not reset state
            // while dragging, so a touchcancel mid-scroll-drag would leave the zone
            // stuck as isDragging=true — subsequent touches would then be classified
            // as Scrollbar presses, skip their long-press timer, and the plex would
            // appear to "lose" long-press until a tap on the scrollbar reset it.
            this.onPointerUp(this.touch_lastSavedFakePointerEvent);
            return;
        }

    }

    onPointerDown(event: PointerEvent) {
        event.preventDefault();
        this.animateBriefly();

        const downPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(downPoint, event.pointerType);

        // Reset the selection rectangle baseline until a new drag is established
        this.selectionRectInitialSelectedThoughtIds = null;
        this.selectionRectDeselectionPreviewThoughts.clear();

        if(event.pointerType == "touch") {
            this.pointerDownPoint = downPoint;
            safeInvoke(plexAnimator.dotNetHelper, "ExitEditModeRequested");
            return;
        }

        // Middle click on background toggles Normal/NormalPlusOne layout
        if(event.pointerType === "mouse" && event.button === 1) {
            this.checkForHover(downPoint, event.pointerType, true);
            if(!this.hoveredThoughtId && !this.hoveredGateThtId && !this.hoveredThoughtIconId &&
               !this.hoveredLinkId && !this.hoveredDecorationThtId && !this.hoveredControlThtId) {
                safeInvoke(plexAnimator.dotNetHelper, "OnPlexBackgroundMiddleClick");
            }
            return;
        }

        this.pointerDownIsPrimary = this.isMainButton(event);

        if(this.pointerDownIsPrimary) {
            safeInvoke(plexAnimator.dotNetHelper, "ExitEditModeRequested");
        }

        if(this.scrollbars != null && this.pointerDownIsPrimary) {
            this.scrollbars.forEach((s) => {
                if(s != null) {
                    s.onPointerDown(event);
                }
            });
        }

        this.checkForHover(downPoint, event.pointerType, true);
        this.pointerDownPoint = downPoint;
        this.lastDragPoint = new Point(event.clientX, event.clientY);
        this.hasDragExceededClickDistance = false;
        
        // Check if Ctrl/Cmd is held and we're clicking on background
        if(this.isHoldingMultiSelectKeyModifier(event) && !plexAnimator.isReadOnly && !this.hoveredThoughtId && !this.hoveredGateThtId && 
           !this.hoveredThoughtIconId && !this.hoveredLinkId && !this.hoveredDecorationThtId && !this.hoveredControlThtId) {
            // Start selection rectangle
            this.isDrawingSelectionRect = true;
            let fieldPoint = this.getFieldPoint(event);
            this.selectionRectStartPoint = fieldPoint;
            this.selectionRectEndPoint = fieldPoint;
            this.selectionRectInitialSelectedThoughtIds = this.selectedThoughtIds.slice();
            this.selectionRectDeselectionPreviewThoughts.clear();
            this.pressedObjectType = PlexObjectType.Background;
        } else {
            this.setPressedObjectTypeBasedOnHoverState(event);
        }
        
        if(event.pointerId) {
            this.field.setPointerCapture(event.pointerId);
        }
    }
    
    setPressedObjectTypeBasedOnHoverState(event: PointerEvent) {
        // For touch-originated calls (touch creates a synthetic event with pointerType="fake"),
        // touch_isDraggingScrollbar is the authoritative signal — it's set from
        // touch_isOverScrollbar on the CURRENT clientPoint at onTouchStart. isScrollbarInteracting()
        // reads Scrollbar.stateByZone flags that are written by onPointerMove including synthesized
        // events that can fire after touchend on iOS, leaving the flags stuck true and making a
        // non-scrollbar touch get classified as a Scrollbar press — which sets touch_isDown=false
        // and silently suppresses long-press detection until the stale flag is cleared.
        const isTouch = event.pointerType === "fake";
        const treatAsScrollbar = isTouch
            ? this.touch_isDraggingScrollbar
            : (this.isScrollbarInteracting() || this.touch_isDraggingScrollbar);
        if(treatAsScrollbar) {
            this.pressedObjectType = PlexObjectType.Scrollbar;
        } else if(this.hoveredThoughtId && !this.hoveredGateThtId) {
            // Gate hits also set hoveredThoughtId (so the hover clone shows on gate
            // hover); the gate branch below must win when both are set.
            this.pressedObjectType = PlexObjectType.Thought;
            plexAnimator.forceLayout.nodePressed(this.hoveredThoughtId);
            // Allow dragging non-active thoughts in Normal, NormalPlusOne, Outline, and MindMap layouts.
            // In Mindmap/Outline/NormalPlusOne, only allow dragging thoughts directly connected to
            // the active thought (not grandchildren or deeper descendants).
            if(this.supportsZoneDrag() && this.hoveredThoughtId != plexAnimator.activeId && this.isDraggableThought(this.hoveredThoughtId!)) {
                this.draggedThoughtId = this.hoveredThoughtId;
                // Record original position for drag reset
                const rep = plexAnimator.thtReps.get(this.draggedThoughtId!);
                if(rep) {
                    const left = parseInt(rep.thtEl.style.left || '0');
                    const top = parseInt(rep.thtEl.style.top || '0');
                    this.draggedThoughtOriginalLeft = isNaN(left) ? 0 : left;
                    this.draggedThoughtOriginalTop = isNaN(top) ? 0 : top;
                }
                // Track which zone the thought is being dragged from
                this.draggedThoughtSourceZone = this.getZoneForThoughtElement(this.draggedThoughtId!);
                // Sibling-zone reordering is not supported by the data model, so treat any drag
                // originating in the sibling zone as if it has already left the source zone.
                // This skips placeholder/reorder UI and routes the drop through cross-zone logic
                // (or cancels it as a no-op when dropped back on the sibling zone).
                if(this.draggedThoughtSourceZone === "sibling") {
                    this.hasLeftSourceZone = true;
                } else if(this.draggedThoughtSourceZone) {
                    this.captureZoneDragSlots(this.draggedThoughtSourceZone, this.draggedThoughtId!);
                }
            } else if(!this.supportsZoneDrag()) {
                // For other layouts, keep previous behavior
                this.draggedThoughtId = this.hoveredThoughtId;
            }
        } else if(this.hoveredGateThtId) {
            this.pressedObjectType = PlexObjectType.ThoughtGate;
            if(this.isMainButton(event)) {
                this.gateDragDestPoint = this.getFieldPoint(event);
                // Capture which child gate side was clicked for mindmap active thought
                this.gateDragSourceChildSide = this.hoveredGateChildSide;
            } else {
                this.gateDragDestPoint = undefined;
            }
            // Hide the gate-hover clone now that a drag has started.
            if(this.hoveredThoughtId) {
                const lastId = this.hoveredThoughtId;
                this.hoveredThoughtId = undefined;
                this.hoveredThoughtIdChanged(this.hoveredThoughtId, lastId);
            }
        } else if(this.hoveredThoughtIconId) {
            this.pressedObjectType = PlexObjectType.ThoughtIcon;
        } else if(this.hoveredLinkId) {
            this.pressedObjectType = PlexObjectType.Link;
        } else if(this.hoveredDecorationThtId) {
            this.pressedObjectType = PlexObjectType.ThoughtDecorator;
        } else if(this.hoveredControlThtId) {
            this.pressedObjectType = PlexObjectType.ThoughtControl;
        } else {
            this.pressedObjectType = PlexObjectType.Background;
        }
    }

    onPointerLeave(event: PointerEvent) {
        ["parent", "child", "sibling", "jump"].forEach((s) => {
            Scrollbar.stateByZone[s].isHovered = false;
        });

        if(this.pressedObjectType == PlexObjectType.Nothing) {
            this.checkForHover(new Point(-99999, -99999), "mouse", true);
        }
    }

    async flushContentEditableBlur() {
        const activeElement = document.activeElement as HTMLElement;
        if(activeElement && activeElement.getAttribute('contenteditable') === 'true') {
            activeElement.blur();
            await contentEditableFieldHelper.waitForPendingBlur();
        }
    }

    async activateThought(thtId: string) {
        plexAnimator.lastActivateClickTime = performance.now();
        await this.flushContentEditableBlur();
        safeInvoke(plexAnimator.dotNetHelper, "ActivateThought", [thtId]);
        if(this.selectedLinkIds.size > 0) {
            this.clearSelectedLinks(false);
        }
    }

    clearSelectedLinks(navigateToLink: boolean) {
        this.willChangeSelectedLinks();
        this.selectedLinkIds.clear();
        this.didChangeSelectedLinks(navigateToLink);
    }

    isHoldingMultiSelectKeyModifier(event:PointerEvent): boolean {
        // macOS uses Cmd (metaKey); Windows + Linux use Ctrl. Matches the keyboard-handler
        // pattern at onKeyDown line ~4146. Prior impl assumed non-Windows == Mac, which
        // silently broke on Linux (Ctrl sets ctrlKey, not metaKey).
        return navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;
    }

    onPointerUp(event: PointerEvent) {

        const upPoint = new Point(event.clientX, event.clientY);
        this.rememberPointerLocation(upPoint, event.pointerType);

        if(event.pointerType == "touch") {
            return;
        }

        if(this.pointerDownIsPrimary) {
            // Handle selection rectangle completion
            if(this.isDrawingSelectionRect && this.selectionRectStartPoint && this.selectionRectEndPoint) {
                this.finalizeSelectionRectangle();
                this.clearSelectionRectangleHighlights(false);
                this.isDrawingSelectionRect = false;
                this.selectionRectStartPoint = undefined;
                this.selectionRectEndPoint = undefined;
                this.selectionRectInitialSelectedThoughtIds = null;
                this.renderNow = true;
                this.animateBriefly(); // Force immediate render to clear the rectangle
                this.pressedObjectType = PlexObjectType.Nothing;
                return;
            }
            
            if(this.scrollbars != null) {
                this.scrollbars.forEach((s) => {
                    if(s != null) {
                        s.onPointerUp(event);
                    }
                });
            }
            if(this.pressedObjectType == PlexObjectType.Thought) {
                plexAnimator.forceLayout.nodeReleased(this.hoveredThoughtId!);
                let thoughtResult = this.findThoughtAt(upPoint, event.pointerType);
                if(thoughtResult && thoughtResult[0] === this.hoveredThoughtId && !this.hasDragExceededClickDistance) {
                    if(event.altKey) {
                        safeInvoke(plexAnimator.dotNetHelper, "ShowThoughtProperties", [this.hoveredThoughtId]);
                    } else if(!this.isHoldingMultiSelectKeyModifier(event)) {
                        this.activateThought(this.hoveredThoughtId);
                    } else if(!plexAnimator.isReadOnly) {
                        this.selectedThoughtsChanging(true);
                        let index = this.selectedThoughtIds.indexOf(this.hoveredThoughtId);
                        if(index != -1) {
                            this.selectedThoughtIds.splice(index, 1);
                        } else {
                            this.selectedThoughtIds.push(this.hoveredThoughtId);
                        }
                        this.selectedThoughtsChanging(false);
                    }
                }
                // Handle zone drop in Normal/NormalPlusOne/Outline/MindMap layout if dragged sufficiently and a zone is targeted
                if(this.supportsZoneDrag() && this.hasDragExceededClickDistance && this.draggedThoughtId && this.currentDropZone && !plexAnimator.isReadOnly && this.draggedThoughtId != plexAnimator.activeId) {
                    // Capture current drop zone for setZoneHovered call in async callback
                    const dropZone = this.currentDropZone;
                    const isSameZone = this.currentDropZone === this.draggedThoughtSourceZone;

                    if(this.hasLeftSourceZone && isSameZone) {
                        // Returned to source zone after leaving → cancel, no action
                        this.cleanupZoneDrag();
                        this.resetDraggedThoughtToOriginal();
                        this.draggedThoughtId = undefined;
                        this.setZoneHovered(dropZone, false);
                        this.currentDropZone = null;
                        this.draggedThoughtOriginalLeft = null;
                        this.draggedThoughtOriginalTop = null;
                        this.draggedThoughtSourceZone = null;
                        this.hasLeftSourceZone = false;
                    } else {
                        // Either same-zone reorder (never left) or cross-zone change
                        const dropIndex = (isSameZone && !this.hasLeftSourceZone)
                            ? (this.zoneDragCurrentDropIndex >= 0
                                ? this.zoneDragCurrentDropIndex
                                : this.computeDropIndex(this.currentDropZone, upPoint, this.draggedThoughtId!))
                            : -1;
                        this.cleanupZoneDrag();

                        // In Outline layout, use the parent-aware reorder method
                        const outlineGroup = plexAnimator.layout == LayoutType.Outline && this.draggedThoughtId
                            ? this.outlineGroupOf.get(this.draggedThoughtId) : null;
                        const isOutlineReorder = outlineGroup != null
                            && isSameZone && !this.hasLeftSourceZone && dropIndex >= 0;
                        if(isOutlineReorder) {
                            safeInvokeAsync(plexAnimator.dotNetHelper, "OnThoughtReorderedInOutline", [this.draggedThoughtId, outlineGroup.parentId, outlineGroup.relationType, dropIndex])
                                .then((success: boolean) => {
                                    if(!success) {
                                        this.resetDraggedThoughtToOriginal();
                                    }
                                    this.draggedThoughtId = undefined;
                                    this.currentDropZone = null;
                                    this.draggedThoughtOriginalLeft = null;
                                    this.draggedThoughtOriginalTop = null;
                                    this.draggedThoughtSourceZone = null;
                                    this.hasLeftSourceZone = false;
                                });
                        } else {
                            console.log(`OnThoughtDroppedInZone: zone=${this.currentDropZone}, sourceZone=${this.draggedThoughtSourceZone}, isSameZone=${isSameZone}, dropIndex=${dropIndex}`);
                            safeInvokeAsync(plexAnimator.dotNetHelper, "OnThoughtDroppedInZone", [this.draggedThoughtId, this.currentDropZone, this.draggedThoughtSourceZone, dropIndex])
                                .then((success: boolean) => {
                                    if(!success) {
                                        // Operation was rejected server-side, reset position
                                        this.resetDraggedThoughtToOriginal();
                                    }
                                    // Clear drag state after async completes
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
                } else {
                    // Reset position if invalid drop (no zone, active id, or read-only)
                    if(this.supportsZoneDrag() && this.hasDragExceededClickDistance && this.draggedThoughtId) {
                        this.cleanupZoneDrag();
                        const invalid = plexAnimator.isReadOnly || this.draggedThoughtOriginalLeft == null || this.draggedThoughtOriginalTop == null || this.draggedThoughtId == plexAnimator.activeId;
                        const zoneUnder = this.getZoneUnderClientPoint(upPoint);
                        if(invalid || !zoneUnder) {
                            this.resetDraggedThoughtToOriginal();
                        }
                    }
                    // Clear drag state for zone drop
                    this.draggedThoughtId = undefined;
                    this.setZoneHovered(this.currentDropZone, false);
                    this.currentDropZone = null;
                    this.draggedThoughtOriginalLeft = null;
                    this.draggedThoughtOriginalTop = null;
                    this.draggedThoughtSourceZone = null;
                    this.hasLeftSourceZone = false;
                }
            } else if(this.pressedObjectType == PlexObjectType.ThoughtIcon) {
                safeInvoke(plexAnimator.dotNetHelper, "OpenThoughtAttachment", [this.hoveredThoughtIconId, upPoint.x, upPoint.y]);
            } else if(this.pressedObjectType == PlexObjectType.ThoughtGate) {
                // If this drag originated from a list gate, finalize via the global mouseup handler
                if(this.isListGateDragActive) {
                    this.isListGateDragActive = false;
                    this.listGateDragSourceRep = undefined;
                    this.gateDragSourceChildSide = undefined; // Clear the captured child side
                    this.pressedObjectType = PlexObjectType.Nothing;
                    return;
                }
                if(this.hoveredGateThtId == this.gateDragDestThtId && !this.hasDragExceededClickDistance) {
                    // click on a gate... activate/select
                    if (!this.isHoldingMultiSelectKeyModifier(event)) {
                        this.activateThought(this.hoveredGateThtId!);
                    } else if(!plexAnimator.isReadOnly) {
                        // select by gate
                        this.selectedThoughtsChanging(true);
                        // find all of the thoughts linked to this gate
                        let thtIds = new Set<string>();
                        plexAnimator.linkReps.forEach(l => {
                            if(l.idA == this.hoveredGateThtId && l.relation == this.hoveredGateRelation) {
                                thtIds.add(l.idB);
                            } else if(l.idB == this.hoveredGateThtId && l.relation == this.getOppositeRelation(this.hoveredGateRelation)) {
                                thtIds.add(l.idA);
                            }
                        })
                        // if any of the thoughts are already selected, deselect them all
                        if([...this.selectedThoughtIds].some(val => thtIds.has(val))) {
                            for(const id of thtIds) {
                                let index = this.selectedThoughtIds.indexOf(id);
                                if(index != -1) {
                                    this.selectedThoughtIds.splice(index, 1);
                                }
                            }
                        } else {
                            for(const id of thtIds) {
                                this.selectedThoughtIds.push(id);
                            }
                        }
                        this.selectedThoughtsChanging(false);
                    }
                } else {
                    // If dropped in empty area (no destination thought), the server will open the
                    // CreateThought dialog. Pin the link-line preview so it stays on screen until
                    // that dialog dismisses — endDragLinkPreview() is called from C# at that point.
                    if(this.gateDragDestThtId == null && this.hoveredGateThtId && this.gateDragDestPoint) {
                        this.linkPreviewPinned = true;
                        this.pinnedLinkSrcThtId = this.hoveredGateThtId;
                        this.pinnedLinkSrcRelation = this.hoveredGateRelation;
                        this.pinnedLinkSrcChildSide = this.gateDragSourceChildSide;
                        this.pinnedLinkDestPoint = new Point(this.gateDragDestPoint.x, this.gateDragDestPoint.y);
                    }
                    // ask server to continue with link thoughts
                    safeInvoke(plexAnimator.dotNetHelper, "LinkThoughts", [this.hoveredGateThtId, this.gateDragDestThtId, this.hoveredGateRelation, event.shiftKey, event.clientX, event.clientY]);
                }
            } else if(this.pressedObjectType == PlexObjectType.Link && this.hoveredLinkId) {

                if(event.altKey) {
                    safeInvoke(plexAnimator.dotNetHelper, "ShowLinkProperties", [this.hoveredLinkId]);
                } else {
                    this.willChangeSelectedLinks();

                    if(!this.isHoldingMultiSelectKeyModifier(event)) {
                        this.selectedLinkIds.clear();
                    }
                    if(this.selectedLinkIds.has(this.hoveredLinkId)) {
                        this.selectedLinkIds.delete(this.hoveredLinkId);
                    } else {
                        this.selectedLinkIds.add(this.hoveredLinkId);
                    }

                    this.didChangeSelectedLinks(true);
                }

            } else if(this.pressedObjectType == PlexObjectType.ThoughtDecorator && !this.hasDragExceededClickDistance) {
                if(plexAnimator.isTouchDevice) {
                    // On touch, tapping any indicator behaves like tapping the thought itself.
                    if(this.hoveredDecorationThtId) {
                        this.activateThought(this.hoveredDecorationThtId);
                    }
                } else if(this.hoveredDecorationType === "note" && this.hoveredDecorationThtId) {
                    // Show the notes dialog
                    safeInvoke(plexAnimator.dotNetHelper, "ShowNotesDialog", [this.hoveredDecorationThtId, false]);
                } else if(this.hoveredDecorationType === "tag") {
                    // Activate tag
                    this.activateThought(this.hoveredDecorationId!);
                }
                // For other indicator types (private, event) on mouse, we don't navigate.
            } else if(this.pressedObjectType == PlexObjectType.ThoughtControl && !this.hasDragExceededClickDistance && this.hoveredControlThtId) {
                let thtRep = plexAnimator.thtReps.get(this.hoveredControlThtId);
                switch(this.hoveredControl) {
                    case ThoughtControl.Expand:
                        if(thtRep && plexAnimator.canExpand(thtRep)) {
                            safeInvoke(plexAnimator.dotNetHelper, "ExpandThought", [this.hoveredControlThtId]);
                        }
                        break;
                    case ThoughtControl.Collapse:
                        if(plexAnimator.layout == LayoutType.Force) {
                            plexAnimator.collapseThought(this.hoveredControlThtId);
                        }
                        if(plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
                            safeInvoke(plexAnimator.dotNetHelper, "CollapseThought", [this.hoveredControlThtId]);
                        }
                        break;
                    case ThoughtControl.Anchor:
                        plexAnimator.forceLayout.toggleNodeIsAnchored(this.hoveredControlThtId);
                        break;
                    case ThoughtControl.Chevron:
                        if(thtRep && plexAnimator.canExpand(thtRep)) {
                            safeInvoke(plexAnimator.dotNetHelper, "ExpandThought", [this.hoveredControlThtId]);
                        } else {
                            safeInvoke(plexAnimator.dotNetHelper, "CollapseThought", [this.hoveredControlThtId]);
                        }
                        break;
                }
            } else if(this.pressedObjectType == PlexObjectType.Background) {
                if((plexAnimator.layout == LayoutType.Mindmap || plexAnimator.layout == LayoutType.Outline) && !this.hasDragExceededClickDistance && plexAnimator.focusedId != plexAnimator.activeId) {
                    // if focused thought != active thought then user can click or tap background to reset focus to active thought
                    safeInvoke(plexAnimator.dotNetHelper, "ActivateThought", [plexAnimator.activeId, false]);
                } else if((plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne) && this.hasDragExceededClickDistance) {
                    plexAnimator.backgroundDragEnded();
                }
                if(this.selectedLinkIds.size > 0 && !this.hasDragExceededClickDistance) {
                    this.clearSelectedLinks(true);
                }

                // Detect double-click on background (no drag)
                if(!this.hasDragExceededClickDistance) {
                    const now = Date.now();
                    if(now - this.lastBackgroundClickTime <= this.DOUBLE_CLICK_THRESHOLD_MS) {
                        // Double-click detected on background: toggle view mode via C# handler
                        this.lastBackgroundClickTime = 0;
                        safeInvoke(plexAnimator.dotNetHelper, "OnPlexBackgroundDoubleClick");
                    } else {
                        this.lastBackgroundClickTime = now;
                    }
                }
            } else if(this.pressedObjectType == PlexObjectType.Scrollbar) {
                if (this.scrollbars != null) {
                    this.scrollbars.forEach((s) => {
                        if(s != null) {
                            s.onPointerUp(event);
                        }
                    });
                }
            }
            this.pointerDownIsPrimary = false;
        }
        // else if(event.button === 2) // <-- this is the wrong way to detect a right click.
        // On Safari on Mac and iOS you must use onContextMenu (below) which does work on all platforms.

        setTimeout(() => {
            // introduce a small delay to give `onContextMenu` some time to handle a 
            // possible right-click event before resetting `pressedObjectType`. If we don't,
            // it will be `PlexObjectType.Nothing` in the handler and won't show a context menu.
            this.pressedObjectType = PlexObjectType.Nothing;
        }, 5);

        this.checkForHover(upPoint, event.pointerType, true);
        if(event.pointerId) {
            this.field.releasePointerCapture(event.pointerId);
        }
    }

    // Determine which drop zone (parent/child/jump/sibling), if any, is under the client point
    private isOutlineOrMindmap(): boolean {
        return plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap;
    }

    // Whether the current layout supports zone-based drag-to-reorder
    private supportsZoneDrag(): boolean {
        return plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne || this.isOutlineOrMindmap();
    }

    private getZoneUnderClientPoint(clientPoint: Point): string | null {
        // In Outline/MindMap layouts, the entire plex area is the child zone
        if(this.isOutlineOrMindmap()) {
            const fieldRect = this.field.getBoundingClientRect();
            if(clientPoint.x >= fieldRect.left && clientPoint.x <= fieldRect.right && clientPoint.y >= fieldRect.top && clientPoint.y <= fieldRect.bottom) {
                return "child";
            }
            return null;
        }
        const zones = ["parent", "child", "jump", "sibling"]; // must match server-side zone ids
        for(const z of zones) {
            const el = document.querySelector(`.zone-div.zone-${z}`) as HTMLElement | null;
            if(!el) continue;
            const rect = el.getBoundingClientRect();
            if(clientPoint.x >= rect.left && clientPoint.x <= rect.right && clientPoint.y >= rect.top && clientPoint.y <= rect.bottom) {
                return z;
            }
        }
        return null;
    }

    // In Mindmap/Outline/NormalPlusOne, only direct relations (those in gridPositionToThoughtId) are
    // draggable for reordering. In Normal layout, all non-active thoughts are draggable.
    private isDraggableThought(thtId: string): boolean {
        if(!this.isOutlineOrMindmap() && plexAnimator.layout != LayoutType.NormalPlusOne) return true;
        for(const id of this.gridPositionToThoughtId.values()) {
            if(id === thtId) return true;
        }
        return false;
    }

    // Determine which zone a thought element belongs to based on its position
    private getZoneForThoughtElement(thtId: string): string | null {
        const rep = plexAnimator.thtReps.get(thtId);
        if(!rep) return null;

        // Check if this is the active thought
        if(thtId === plexAnimator.activeId) return "active";

        // In Outline layout, use parentId-relationType as the "zone" so that
        // drag-to-reorder groups siblings by their shared parent and relation type.
        if(plexAnimator.layout == LayoutType.Outline) {
            const group = this.outlineGroupOf.get(thtId);
            if(group) return `${group.parentId}-${group.relationType}`;
        }

        // In Mindmap/Outline layouts, use the zone assigned during layout (rep.zone)
        // since zone divs may not accurately represent parent/jump/child regions.
        if(this.isOutlineOrMindmap() && rep.zone) {
            return rep.zone;
        }

        // Get the center point of the thought element
        const rect = rep.thtEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Check which zone contains this point (include sibling)
        const zones = ["parent", "child", "jump", "sibling"];
        for(const z of zones) {
            const el = document.querySelector(`.zone-div.zone-${z}`) as HTMLElement | null;
            if(!el) continue;
            const zoneRect = el.getBoundingClientRect();
            if(centerX >= zoneRect.left && centerX <= zoneRect.right &&
               centerY >= zoneRect.top && centerY <= zoneRect.bottom) {
                return z;
            }
        }
        return null;
    }

    // Compute the insertion index when a thought is dropped within the same zone.
    // Returns a slot index 0..slots.length where the placeholder should be inserted.
    //
    // Uses zoneDragSlots — the FROZEN slot positions captured at drag start —
    // rather than live getBoundingClientRect() values. Live rects return
    // mid-FLIP-animation positions while siblings are sliding to their preview
    // positions; reading them creates a feedback loop where computeDropIndex
    // alternates between two indices on every move event. Frozen slot data
    // also fixes the column-detection problem in Outline/Mindmap layouts where
    // the .zone-div has width 0 and cannot be used to derive column boundaries.
    private computeDropIndex(zone: string, clientPoint: Point, draggedId: string): number {
        const slots = this.zoneDragSlots;
        if(slots.length === 0) return 0;

        const fieldRect = this.field.getBoundingClientRect();
        const maxCol = slots.reduce((max, s) => Math.max(max, s.col), 0);
        const isSingleColumn = maxCol === 0;

        const slotCenterY = (i: number) => slots[i].y + slots[i].h / 2 + fieldRect.top;
        // Transition Y for slot i: pointer must cross the midpoint between this
        // slot's center and the next same-column slot's center before the drop
        // index advances. This prevents the destination from snapping to the
        // next row the instant the pointer crosses the current slot's center
        // (the previous behavior, which felt too eager). For the last slot in a
        // column there is no "next", so fall back to the slot's bottom edge.
        const transitionY = (i: number): number => {
            const sameCol = slots[i].col;
            for(let j = i + 1; j < slots.length; j++) {
                if(slots[j].col === sameCol) {
                    return (slotCenterY(i) + slotCenterY(j)) / 2;
                }
            }
            return slotCenterY(i) + slots[i].h / 2;
        };

        if(isSingleColumn) {
            for(let i = 0; i < slots.length; i++) {
                if(clientPoint.y < transitionY(i)) return i;
            }
            return slots.length;
        }

        // Derive column X boundaries from frozen slot centers.
        const colCenters: number[] = [];
        for(let c = 0; c <= maxCol; c++) {
            const inCol = slots.filter(s => s.col === c);
            if(inCol.length === 0) continue;
            colCenters[c] = inCol.reduce((s, t) => s + t.x, 0) / inCol.length;
        }
        const colSplits: number[] = []; // boundary between col c and col c+1
        for(let c = 0; c < maxCol; c++) {
            const a = colCenters[c];
            const b = colCenters[c + 1];
            if(a !== undefined && b !== undefined) {
                colSplits[c] = (a + b) / 2;
            }
        }
        const xRel = clientPoint.x - fieldRect.left;
        let pointerCol = maxCol;
        for(let c = 0; c < colSplits.length; c++) {
            if(xRel < colSplits[c]) { pointerCol = c; break; }
        }

        for(let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if(pointerCol < s.col || (pointerCol === s.col && clientPoint.y < transitionY(i))) {
                return i;
            }
        }
        return slots.length;
    }

    private static toCssRgba(num: number, alpha: number): string {
        num >>>= 0;
        const b = num & 0xFF;
        const g = (num >>> 8) & 0xFF;
        const r = (num >>> 16) & 0xFF;
        const a = Math.max(0, Math.min(1, alpha));
        return `rgba(${r},${g},${b},${a})`;
    }

    // Returns the CSS `left` value for placing an element of width `elWidth` into `slot`,
    // honoring the thought's horizontal alignment. `slot.x` is the captured center-X and
    // `slot.w` the captured width, so `slot.x - slot.w/2` / `slot.x + slot.w/2` are the
    // shared column edges in an aligned zone.
    private computeLeftForSlot(slot: { x: number; w: number },
                               elWidth: number,
                               alignment: ThoughtHorizontalAlignment): number {
        switch(alignment) {
            case ThoughtHorizontalAlignment.Left:
                return slot.x - slot.w / 2;
            case ThoughtHorizontalAlignment.Right:
                return slot.x + slot.w / 2 - elWidth;
            default:
                return slot.x - elWidth / 2;
        }
    }

    private captureZoneDragSlots(zone: string, draggedId: string) {
        this.zoneDragSlots = [];
        this.zoneDragThoughtOrder = [];
        this.zoneDragOriginalIndex = -1;
        this.zoneDragOriginalHeightByThought = new Map();
        this.zoneDragOriginalStrideByThought = new Map();
        this.zoneDragReverseDeltaYByThought = new Map();
        this.zoneDragColumnStartY = new Map();

        const entries: { id: string; col: number; linearIndex: number }[] = [];
        let maxRow = 0;
        const zonePrefix = zone + "-";
        // First pass: find maxRow for linear index calculation
        this.gridPositionToThoughtId.forEach((id, key) => {
            if(!key.startsWith(zonePrefix)) return;
            const suffix = key.substring(zonePrefix.length);
            const suffixParts = suffix.split("-");
            const row = suffixParts.length > 1 ? parseInt(suffixParts[1]) : parseInt(suffixParts[0]);
            if(row > maxRow) maxRow = row;
        });
        const rowCount = maxRow + 1;

        // Second pass: collect entries with linear indices
        this.gridPositionToThoughtId.forEach((id, key) => {
            if(!key.startsWith(zonePrefix)) return;
            const suffix = key.substring(zonePrefix.length);
            const suffixParts = suffix.split("-");
            const col = suffixParts.length > 1 ? parseInt(suffixParts[0]) : 0;
            const row = suffixParts.length > 1 ? parseInt(suffixParts[1]) : parseInt(suffixParts[0]);
            entries.push({ id, col, linearIndex: col * rowCount + row });
        });
        entries.sort((a, b) => a.linearIndex - b.linearIndex);

        // Store slots as center-x + width. computeLeftForSlot() derives the correct
        // left edge at paint time based on each thought's alignment, so left/right-aligned
        // layouts (Outline, MindMap) keep their shared column edge when widths differ.
        // Also record col + alignment per slot so the drag layout can anchor the
        // placeholder to the target column's edge when the dragged thought crosses
        // between Mindmap's left/right child columns.
        const fieldRect = this.field.getBoundingClientRect();
        for(let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const rep = plexAnimator.thtReps.get(entry.id);
            if(!rep) continue;
            const rect = rep.thtEl.getBoundingClientRect();
            const slotY = rect.top - fieldRect.top;
            this.zoneDragSlots.push({
                x: (rect.left + rect.width / 2) - fieldRect.left, // center-x relative to field
                y: slotY,
                w: rect.width,
                h: rect.height,
                col: entry.col,
                alignment: rep.alignment
            });
            if(entry.id === draggedId) {
                this.zoneDragOriginalIndex = this.zoneDragSlots.length - 1;
            } else {
                this.zoneDragThoughtOrder.push(entry.id);
                this.zoneDragOriginalHeightByThought.set(entry.id, rect.height);
            }
        }

        // In Mindmap, an inner thought's card is rendered shifted DOWN by
        // (subtreeHeight - cardHeight)/2 to sit centered in its subtree
        // (mindmapLayout.layoutGenerationsGoingSideways `reverseDeltaY`). The captured
        // slot.y is therefore the shifted card top, not the row's logical top.
        // We derive each thought's reverseDeltaY here so we can:
        //   1) reduce slot Y deltas to pure strides, and
        //   2) re-apply the per-occupant shift when placing each card during drag.
        // Outline (and non-Mindmap layouts) don't apply this shift, so reverseDeltaY = 0.
        // Mindmap centers an inner child card vertically inside its taller subtree
        // (mindmapLayout.layoutGenerationsGoingSideways `reverseDeltaY`), so the
        // captured slot.y is the shifted card top, not the row's logical top.
        // We undo that here so cursorY tracks the column's logical row top and
        // each card's reverseDeltaY is reapplied at placement.
        //
        // This shift is specific to the child zone — parent/jump zones in
        // mindmap arrange cards in a fixed-rowHeight grid that ignores any
        // subtree data the LayoutNode happens to carry, so applying a
        // reverseDeltaY there would push the placeholder/siblings far from
        // their actual rendered positions.
        const isMindmap = plexAnimator.layout === LayoutType.Mindmap;
        const useReverseDelta = isMindmap && zone === "child";
        const layoutHeightMap = useReverseDelta ? plexAnimator.mindmapLayout.heightMap : null;
        const layoutActualHeightMap = useReverseDelta ? plexAnimator.mindmapLayout.actualHeightMap : null;
        const computeReverseDeltaY = (id: string): number => {
            if(!layoutHeightMap || !layoutActualHeightMap) return 0;
            // actualHeightMap entries exist only for inner nodes (set in computeGenerations
            // when recursing into a node's children) — leaves never become an inner `id`.
            const ah = layoutActualHeightMap.get(id);
            if(ah === undefined) return 0;
            const hm = layoutHeightMap.get(id) ?? 0;
            return hm > ah ? (hm - ah) / 2 : 0;
        };
        for(let i = 0; i < entries.length; i++) {
            this.zoneDragReverseDeltaYByThought.set(entries[i].id, computeReverseDeltaY(entries[i].id));
        }

        // Each column's logical start = topmost slot's card top minus that node's
        // reverseDeltaY. This is where a leaf placeholder (no shift) should sit when
        // it takes the top slot from a tall-subtree inner thought.
        for(let i = 0; i < entries.length; i++) {
            const col = entries[i].col;
            if(!this.zoneDragColumnStartY.has(col)) {
                const reverse = this.zoneDragReverseDeltaYByThought.get(entries[i].id) ?? 0;
                this.zoneDragColumnStartY.set(col, this.zoneDragSlots[i].y - reverse);
            }
        }

        // Stride per thought in pure (logical-y) terms.
        // slot[i+1].y - slot[i].y = stride(i) + reverseDeltaY(i+1) - reverseDeltaY(i),
        // so subtract the shift difference to recover stride. For the last slot in a
        // column we have no following slot, so consult MindmapLayout.heightMap
        // (authoritative for inner thoughts with grandchild/great-grandchild subtrees)
        // before falling back to the rendered card height.
        //
        // The heightMap fallback only applies to the child zone — that's where
        // a thought's subtree actually reserves vertical space below it. In
        // the parent/jump zones cards are laid out in a fixed-rowHeight grid
        // regardless of any subtree data that happens to be loaded for the
        // thought, so using heightMap there bloats phStride and shoves the
        // placeholder + remaining cards wildly off during drag.
        const useSubtreeHeightForLastInCol = useReverseDelta;
        for(let i = 0; i < entries.length; i++) {
            const slot = this.zoneDragSlots[i];
            const next = this.zoneDragSlots[i + 1];
            let stride: number;
            if(next && next.col === slot.col) {
                const rdThis = this.zoneDragReverseDeltaYByThought.get(entries[i].id) ?? 0;
                const rdNext = this.zoneDragReverseDeltaYByThought.get(entries[i + 1].id) ?? 0;
                stride = (next.y - slot.y) - (rdNext - rdThis);
            } else if(useSubtreeHeightForLastInCol) {
                const mapped = layoutHeightMap?.get(entries[i].id);
                stride = (mapped !== undefined && mapped > slot.h) ? mapped : slot.h;
            } else {
                // Mirror the previous slot-in-column's stride so the last entry
                // matches the column's actual rendered cadence.
                let mirrored: number | undefined;
                for(let j = i - 1; j >= 0; j--) {
                    if(this.zoneDragSlots[j].col === slot.col) {
                        const rdPrev = this.zoneDragReverseDeltaYByThought.get(entries[j].id) ?? 0;
                        const rdThis = this.zoneDragReverseDeltaYByThought.get(entries[i].id) ?? 0;
                        mirrored = (slot.y - this.zoneDragSlots[j].y) - (rdThis - rdPrev);
                        break;
                    }
                }
                stride = mirrored ?? slot.h;
            }
            this.zoneDragOriginalStrideByThought.set(entries[i].id, stride);
        }
    }

    private createZonePlaceholder(width: number, height: number): HTMLElement {
        const color = plexAnimator.colors?.thoughtHighlightOutline ?? 0xffffff;
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

    private updateZoneDragLayout(newDropIndex: number) {
        if(newDropIndex === this.zoneDragCurrentDropIndex) return;
        if(!this.zoneDragPlaceholder || this.zoneDragSlots.length === 0) return;

        const thoughts = this.zoneDragThoughtOrder;
        const slots = this.zoneDragSlots;

        // Clamp index to valid range
        if(newDropIndex < 0) newDropIndex = 0;
        if(newDropIndex >= slots.length) newDropIndex = slots.length - 1;

        // FIRST: snapshot current visual positions of all non-dragged thoughts
        const firstRects = new Map<string, DOMRect>();
        for(const id of thoughts) {
            const rep = plexAnimator.thtReps.get(id);
            if(rep) firstRects.set(id, rep.thtEl.getBoundingClientRect());
        }

        const placeholderSlot = slots[newDropIndex];
        const phWidth = parseFloat(this.zoneDragPlaceholder.style.width) || placeholderSlot.w;
        const phHeight = parseFloat(this.zoneDragPlaceholder.style.height) || placeholderSlot.h;

        // Match mindmapLayout's per-row stride. heightMap entries use
        // Math.max(measuredHeight, rowHeightWithSpacing) for leaves and the full
        // subtree height for inner nodes — captured in zoneDragOriginalStrideByThought
        // from the rendered slot Y deltas. Without this, the drag preview collapses
        // both single-row gaps and the space reserved beneath siblings with expanded
        // children, which then snaps back open on drop.
        const minStride = plexAnimator.getRowHeightWithSpacing();
        const draggedId = this.draggedThoughtId ?? '';
        const phStride = Math.max(
            this.zoneDragOriginalStrideByThought.get(draggedId) ?? phHeight,
            phHeight,
            minStride
        );

        // Cancel in-progress transforms so we can measure true new positions
        for(const id of thoughts) {
            const rep = plexAnimator.thtReps.get(id);
            if(rep) {
                rep.thtEl.style.transition = 'none';
                rep.thtEl.style.transform = '';
            }
        }

        // Build the final visual order with the placeholder spliced in at newDropIndex.
        // Each position i pairs with slots[i] — this preserves the original column
        // layout (slot i's col determines which column the item is laid out in), so
        // Mindmap's two-column child zones keep their left/right split during the
        // preview. The actual re-layout on drop is handled elsewhere.
        //
        // cursorY tracks the LOGICAL row top for the column (i.e. before mindmap's
        // per-thought reverseDeltaY centering shift). Each card is then placed at
        // cursorY + reverseDeltaY(occupant). This matches mindmapLayout's placement
        // formula and lets a leaf placeholder dropped above a tall-subtree thought
        // sit at the column's logical top instead of the inner card's mid-subtree top.
        const phReverseDelta = this.zoneDragReverseDeltaYByThought.get(draggedId) ?? 0;
        let cursorY = 0;
        let cursorCol: number | null = null;
        for(let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if(slot.col !== cursorCol) {
                cursorCol = slot.col;
                cursorY = this.zoneDragColumnStartY.get(slot.col) ?? slot.y;
            }

            if(i === newDropIndex) {
                // Placeholder takes this slot. Anchor it to the slot's column edge
                // (Right for Mindmap's left column, Left for the right column,
                // Center for parent/jump) so cross-column drops re-anchor correctly.
                this.zoneDragPlaceholder.style.left = this.computeLeftForSlot(slot, phWidth, slot.alignment) + 'px';
                this.zoneDragPlaceholder.style.top = (cursorY + phReverseDelta) + 'px';
                cursorY += phStride;
                continue;
            }

            const thtIdx = i > newDropIndex ? i - 1 : i;
            const thtId = thoughts[thtIdx];
            if(thtId === undefined) continue;
            const rep = plexAnimator.thtReps.get(thtId);
            const sibReverseDelta = this.zoneDragReverseDeltaYByThought.get(thtId) ?? 0;
            if(rep) {
                const thtWidth = rep.thtEl.offsetWidth;
                // Use the paired slot's x/w so the sibling anchors to that slot's
                // column edge — important when a sibling crosses between left/right
                // columns (it should adopt the new column's shared edge).
                rep.thtEl.style.left = this.computeLeftForSlot(slot, thtWidth, slot.alignment) + 'px';
                rep.thtEl.style.top = (cursorY + sibReverseDelta) + 'px';
            }
            const siblingH = this.zoneDragOriginalHeightByThought.get(thtId) ?? slot.h;
            const siblingStride = this.zoneDragOriginalStrideByThought.get(thtId) ?? siblingH;
            cursorY += Math.max(siblingStride, siblingH, minStride);
        }

        // LAST + INVERT + PLAY
        for(const id of thoughts) {
            const first = firstRects.get(id);
            if(!first) continue;
            const rep = plexAnimator.thtReps.get(id);
            if(!rep) continue;
            const last = rep.thtEl.getBoundingClientRect();
            const deltaX = first.left - last.left;
            const deltaY = first.top - last.top;
            if(Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

            // INVERT: snap to old visual position
            rep.thtEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            rep.thtEl.offsetHeight; // force reflow

            // PLAY: animate to new layout position
            rep.thtEl.style.transition = `transform ${PlexCanvas.ZONE_FLIP_DURATION_MS}ms ease`;
            rep.thtEl.style.transform = '';

            // Cleanup
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

    /**
     * Called when the dragged thought leaves its source zone.
     * Animates the placeholder and sibling thoughts back to their original positions,
     * but keeps the placeholder visible as a reminder of which thought is being dragged.
     */
    private transitionToZoneChangeMode() {
        if(!this.zoneDragPlaceholder || this.zoneDragSlots.length === 0) {
            return;
        }

        // Animate everything back to original positions using existing FLIP logic
        const needsAnimation = this.zoneDragCurrentDropIndex !== this.zoneDragOriginalIndex;
        if(needsAnimation) {
            this.updateZoneDragLayout(this.zoneDragOriginalIndex);
        }

        // After animation completes, clear reorder state but keep placeholder
        const clearReorderState = () => {
            for(const id of this.zoneDragThoughtOrder) {
                const rep = plexAnimator.thtReps.get(id);
                if(rep) {
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

        if(needsAnimation) {
            setTimeout(clearReorderState, PlexCanvas.ZONE_FLIP_DURATION_MS + 50);
        } else {
            clearReorderState();
        }
    }

    private cleanupZoneDrag() {
        if(this.zoneDragPlaceholder && this.zoneDragPlaceholder.parentElement) {
            this.zoneDragPlaceholder.parentElement.removeChild(this.zoneDragPlaceholder);
        }
        this.zoneDragPlaceholder = null;

        // Clear transforms/transitions on all zone thoughts
        for(const id of this.zoneDragThoughtOrder) {
            const rep = plexAnimator.thtReps.get(id);
            if(rep) {
                rep.thtEl.style.transition = '';
                rep.thtEl.style.transform = '';
            }
        }

        // Restore dragged thought visual
        if(this.draggedThoughtId) {
            const rep = plexAnimator.thtReps.get(this.draggedThoughtId);
            if(rep) {
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

    // Toggle visual hover state on zone overlays
    private setZoneHovered(zone: string | null, hovered: boolean) {
        if(!zone) return;
        const el = document.querySelector(`.zone-div.zone-${zone}`) as HTMLElement | null;
        if(!el) return;
        // Toggle container class for potential CSS hooks
        if(hovered) { el.classList.add('hovered', 'thought-drag'); } else { el.classList.remove('hovered', 'thought-drag'); }
        // Also toggle the inner overlay visibility classes if present
        const overlay = el.querySelector('.zone-overlay') as HTMLElement | null;
        if(overlay) {
            if(hovered) {
                overlay.classList.remove('opacity-0');
                overlay.classList.add('opacity-100');
            } else {
                overlay.classList.remove('opacity-100');
                overlay.classList.add('opacity-0');
            }
        }
    }

    // Animate the dragged thought back to its original position (Normal layout only)
    private resetDraggedThoughtToOriginal() {
        if(!this.draggedThoughtId || this.draggedThoughtOriginalLeft == null || this.draggedThoughtOriginalTop == null) {
            return;
        }
        const rep = plexAnimator.thtReps.get(this.draggedThoughtId!);
        if(!rep) return;
        const currLeft = parseInt(rep.thtEl.style.left || '0');
        const currTop = parseInt(rep.thtEl.style.top || '0');
        const dx = this.draggedThoughtOriginalLeft - (isNaN(currLeft) ? 0 : currLeft);
        const dy = this.draggedThoughtOriginalTop - (isNaN(currTop) ? 0 : currTop);

        // Smoothly animate back
        rep.thtEl.style.transition = "left 0.15s ease, top 0.15s ease";
        rep.thtEl.style.left = `${this.draggedThoughtOriginalLeft}px`;
        rep.thtEl.style.top = `${this.draggedThoughtOriginalTop}px`;

        // Adjust hover overlays back as well
        const hoveredEls = this.field.querySelectorAll('.hovered-tht, .hovered-tht-label') as NodeListOf<HTMLElement>;
        hoveredEls.forEach((el) => {
            DomUtils.offsetElement(el, new Point(dx, dy));
        });
    }

    private onKeyDown(event: KeyboardEvent) {

        // Ignore if focus is in an editable element
        const activeEl = document.activeElement as HTMLElement;
        if(this.isEditableElement(activeEl) || this.isDialogShowing || this.isSearchUIShowing) {
            return;
        }

        // Only handle keys when pressed without modifiers (Ctrl, Alt, Shift, Meta/Command)
        const hasModifier = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;

        const key = event.key || event.code;

        if(key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' ||
           key === 'Up' || key === 'Down' || key === 'Left' || key === 'Right') {
            if(!hasModifier) {
                this.handleArrowKeyNavigation(key);
                event.preventDefault();
            }
            return;
        }

        const primaryModifier = navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;
        if((key === 'ContextMenu' || ((key === 'Enter' || key === 'NumpadEnter') && primaryModifier)) && plexAnimator.focusedUsingKeyboardNav) {
            const focusedThtId = plexAnimator.focusedId;
            if(focusedThtId) {
                const el = document.getElementById(`tht-${focusedThtId}-cur`);
                if(el) {
                    const rect = el.getBoundingClientRect();
                    const cursorPoint = new Point(rect.left + rect.width / 2, rect.top + rect.height / 2);
                    const g = plexAnimator.layout == LayoutType.Outline
                        ? this.outlineGroupOf.get(focusedThtId) : null;
                    safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThought", [cursorPoint, focusedThtId, g?.parentId ?? "", g?.relationType ?? ""]);
                }
            }
            event.preventDefault();
            return;
        }

        if(key === 'Enter' || key === 'NumpadEnter') {
            if(!hasModifier) {
                // Show properties for the selected link if one is selected
                if(this.selectedLinkIds.size === 1) {
                    const linkId = Array.from(this.selectedLinkIds)[0];
                    safeInvoke(plexAnimator.dotNetHelper, "ShowLinkProperties", [linkId]);
                    event.preventDefault();
                    return;
                }

                // Activate the focused thought (or active thought if nothing focused)
                const thoughtToActivate = plexAnimator.focusedId || plexAnimator.activeId;
                if(thoughtToActivate) {
                    this.activateThought(thoughtToActivate);
                    event.preventDefault();
                }
            }
            return;
        }

        if((key === ' ' || key === 'Space') && plexAnimator.focusedUsingKeyboardNav) {
            if(!hasModifier) {
                safeInvoke(plexAnimator.dotNetHelper, "ToggleExpandCollapseFocusedThoughtAsync", [this.hoveredControlThtId]);
                event.preventDefault();
            }
            return;
        }

        if(key === 'Escape' || key === 'Esc') {
            // Cancel current drag in Normal/NormalPlusOne/Outline/MindMap layout and reset visuals
            if(this.supportsZoneDrag() && this.draggedThoughtId) {
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
                // Clear selection rectangle if mid-draw
                if(this.isDrawingSelectionRect) {
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
            
            // If in keyboard navigation mode, reset focus to active thought and hide reticle
            if(plexAnimator.focusedUsingKeyboardNav && plexAnimator.activeId) {
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

    private isEditableElement(element: HTMLElement): boolean {
		if(!element) return false;

		if(element.id === 'searchInputControl' || element.id === 'plexContainer') return false;

		const tagName = element.tagName.toLowerCase();
		const classList = element.classList;

		// Check for input elements with text-like types
		if(tagName === 'input') {
			const inputType = (element as HTMLInputElement).type.toLowerCase();
			const textInputTypes = ['text', 'password', 'email', 'url', 'tel', 'search', 'number'];
			return textInputTypes.includes(inputType);
		}

		if(classList.contains('text-input')) {
			return true;
		}

		// Check for textarea
		if(tagName === 'textarea') {
			return true;
		}

		// Check for contenteditable elements
		if(element.contentEditable === 'true') {
			return true;
		}

		// Check for specific venus editor elements
		const editorIds = ['mdeHtml', 'mdeStyledMarkdownHtml', 'mdeText'];
		
		if(element.id && editorIds.includes(element.id)) {
			return true;
		}

		return false;
	}

    // Called from Blazor
    handleArrowKeyNavigation(key: string) {
        // Get current focused thought, or start from active thought
        const currentFocusedId = plexAnimator.focusedId || plexAnimator.activeId;
        if(!currentFocusedId) {
            return;
        }

        const currentRep = plexAnimator.thtReps.get(currentFocusedId);
        if(!currentRep) {
            return;
        }

        // Find the thought in the direction of the arrow key
        let nextThoughtId = this.findThoughtInDirection(currentRep, key);

        // If no thought found, check if we should return to active thought (Normal layout only)
        const isNormalLayout = plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne;
        if(!nextThoughtId && isNormalLayout && currentFocusedId !== plexAnimator.activeId) {
            // Determine which zone the current thought is in
            const isInParents = plexAnimator.nodeParentsIds.has(currentFocusedId);
            const isInChildren = plexAnimator.nodeChildrenIds.has(currentFocusedId);
            const isInJumps = plexAnimator.nodeJumpsIds.has(currentFocusedId);
            const isInSiblings = plexAnimator.nodeSiblingsIds.has(currentFocusedId);

            // Only return to active thought in these specific cases:
            // - Down from parents zone.
            // - Up from children zone.
            // - Right from jumps zone.
            // - Left from siblings zone.
            if((isInParents && (key === 'ArrowDown' || key === 'Down')) || 
                (isInChildren && (key === 'ArrowUp' || key === 'Up')) || 
                (isInJumps && (key === 'ArrowRight' || key === 'Right')) || 
                (isInSiblings && (key === 'ArrowLeft' || key === 'Left'))) {
                
                nextThoughtId = plexAnimator.activeId;
            }
        }

        if(nextThoughtId && nextThoughtId !== currentFocusedId) {
            // Update focused state directly in JS for immediate visual feedback
            plexAnimator.focusedId = nextThoughtId;
            plexAnimator.focusedUsingKeyboardNav = true;
            
            // Make sure reticle animation is enabled
            plexAnimator.enablePlexFocusReticleAnimation(true);

            // Update keyboard nav item via C#
            safeInvoke(plexAnimator.dotNetHelper, "SetKeyboardNavItemByIdAsync", [nextThoughtId]);
            this.renderNow = true;
            this.animateBriefly();

            // Pan to bring focused thought into view if needed
            this.panToFocusedThought(nextThoughtId);
        }
    }

    private panToFocusedThought(thoughtId: string) {
        // Only pan for Outline/Mindmap layouts (Normal layout handles this differently)
        const isOutlineOrMindmap = plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap;
        if(!isOutlineOrMindmap) {
            return;
        }

        const rep = plexAnimator.thtReps.get(thoughtId);
        if(!rep || !rep.thtEl) {
            return;
        }

        const rect = DomUtils.getRect(rep.thtEl, this.field);
        const fieldRect = this.field.getBoundingClientRect();

        // Define the safe zone (25%-75% of viewport, matching C# logic)
        const minX = fieldRect.width * 0.25;
        const maxX = fieldRect.width * 0.75;
        const minY = fieldRect.height * 0.25;
        const maxY = fieldRect.height * 0.75;

        // Calculate thought center in viewport coordinates
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        // Calculate how much to pan
        let panX = 0;
        let panY = 0;

        if(centerX < minX) {
            panX = minX - centerX;
        } else if(centerX > maxX) {
            panX = maxX - centerX;
        }

        if(centerY < minY) {
            panY = minY - centerY;
        } else if(centerY > maxY) {
            panY = maxY - centerY;
        }

        // Only pan if needed
        if(panX !== 0 || panY !== 0) {
            // Enable smooth transitions
            plexAnimator.setThoughtElementTransitionTimes(0.3);

            // Update cumulative drag offset
            plexAnimator.lastBackgroundDragX += panX;
            plexAnimator.lastBackgroundDragY += panY;

            // Apply pan to all thoughts
            const thtElements = this.field.querySelectorAll(".tht") as NodeListOf<HTMLElement>;
            thtElements.forEach((thtEl: HTMLElement) => {
                thtEl.style.left = (parseInt(thtEl.style.left) + panX) + "px";
                thtEl.style.top = (parseInt(thtEl.style.top) + panY) + "px";
            });

            // Clamp to keep thoughts on-screen
            plexAnimator.clampPanToViewport();

            // Reset transitions after animation
            setTimeout(() => {
                plexAnimator.setThoughtElementTransitionTimes(0);
            }, 300);
        }
    }

    private findThoughtInDirection(currentRep: ThoughtRep, direction: string): string | undefined {
        const isNormalLayout = plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne;
        if(isNormalLayout) {
            // Normal layout uses grid-based navigation
            return this.findThoughtInDirectionGrid(currentRep, direction);
        } else {
            // All other cases use dot product
            return this.findThoughtInDirectionDotProduct(currentRep, direction);
        }
    }

    private getNavigationReferencePoint(rep: ThoughtRep): Point {
        // Get the reference point for navigation calculations based on thought alignment
        const rect = DomUtils.getRect(rep.thtEl, this.field);

        // Use edge-based reference points for Outline and Mindmap layouts
        const isOutlineOrMindmap = plexAnimator.layout === LayoutType.Outline || plexAnimator.layout === LayoutType.Mindmap;

        if (isOutlineOrMindmap) {
            switch (rep.alignment) {
                case ThoughtHorizontalAlignment.Left:
                    // Children in Outline use left edge
                    return new Point(rect.x, rect.y + rect.height / 2);
                case ThoughtHorizontalAlignment.Right:
                    // Parents in Outline, left-side thoughts in Mindmap use right edge
                    return new Point(rect.x + rect.width, rect.y + rect.height / 2);
                case ThoughtHorizontalAlignment.Center:
                default:
                    // Active thought and others use center
                    return new Point(rect.x + rect.width / 2, rect.y + rect.height / 2);
            }
        }

        // All other layouts use center point
        return new Point(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }

    private findThoughtInDirectionDotProduct(currentRep: ThoughtRep, direction: string): string | undefined {
        // Find next thought in the specified direction using dot product method.
        const referencePoint = this.getNavigationReferencePoint(currentRep);

        const isUpDirection = direction === 'ArrowUp' || direction === 'Up';
        const isDownDirection = direction === 'ArrowDown' || direction === 'Down';
        const isLeftDirection = direction === 'ArrowLeft' || direction === 'Left';
        const isRightDirection = direction === 'ArrowRight' || direction === 'Right';

        // Determine sector direction vector based on arrow key
        let sectorDx = 0;
        let sectorDy = 0;
        if(isUpDirection) {
            sectorDx = 0; sectorDy = -1;
        } else if(isDownDirection) {
            sectorDx = 0; sectorDy = 1;
        } else if(isLeftDirection) {
            sectorDx = -1; sectorDy = 0;
        } else if(isRightDirection) {
            sectorDx = 1; sectorDy = 0;
        }

        let bestMatchId: string | undefined = undefined;
        let bestDist2: number = Number.MAX_VALUE;
        let bestDP: number = -1;

        // Iterate through all visible thoughts
        plexAnimator.thtReps.forEach((rep: ThoughtRep, id: string) => {
            if(id === currentRep.id) {
                return; // Skip the current thought
            }

            const testPoint = this.getNavigationReferencePoint(rep);

            // Calculate relative position
            let dx = testPoint.x - referencePoint.x;
            let dy = testPoint.y - referencePoint.y;
            const rad2 = dx * dx + dy * dy;
            const rad = Math.sqrt(rad2);

            // Normalize direction vector
            dx /= rad;
            dy /= rad;

            // Calculate dot product (measures alignment with desired direction)
            let dotProduct = dx * sectorDx + dy * sectorDy;

            // Quantize dot product to reduce floating point sensitivity
            const QUANT = 4;
            dotProduct *= QUANT;
            dotProduct = Math.round(dotProduct);
            dotProduct /= QUANT;

            // Half-plane check: only consider thoughts in the desired direction
            if(dotProduct <= 0.1) {
                return; // Not in the desired direction
            }

            // Track best candidate by dot product (alignment) first, then distance
            const dist2 = rad2;
            if(dotProduct >= bestDP && dist2 < bestDist2) {
                bestDist2 = dist2;
                bestMatchId = id;
                bestDP = dotProduct;
            }
        });

        return bestMatchId;
    }

    private findThoughtInDirectionGrid(currentRep: ThoughtRep, direction: string): string | undefined {
        // Grid-based navigation for Normal layout (matches OldPlex NormalLayout.cs behavior)
        const currentEl = currentRep.thtEl;
        const currentZone = currentEl.dataset.gridZone;
        const currentCol = parseInt(currentEl.dataset.gridColumn || '-1');
        const currentRow = parseInt(currentEl.dataset.gridRow || '-1');

        const isUpDirection = direction === 'ArrowUp' || direction === 'Up';
        const isDownDirection = direction === 'ArrowDown' || direction === 'Down';
        const isLeftDirection = direction === 'ArrowLeft' || direction === 'Left';
        const isRightDirection = direction === 'ArrowRight' || direction === 'Right';

        const isActiveThought = currentRep.id === plexAnimator.activeId;

        // From active thought: use dot product to find entry point into zones
        if(isActiveThought) {
            let targetZoneThoughts: string[] = [];
            let targetZone: string | null = null;

            if(isUpDirection) {
                targetZone = 'parent';
                targetZoneThoughts = Array.from(plexAnimator.nodeParentsIds);
            } else if(isDownDirection) {
                targetZone = 'child';
                targetZoneThoughts = Array.from(plexAnimator.nodeChildrenIds);
            } else if(isLeftDirection) {
                targetZone = 'jump';
                targetZoneThoughts = Array.from(plexAnimator.nodeJumpsIds);
            } else if(isRightDirection) {
                targetZone = 'sibling';
                targetZoneThoughts = Array.from(plexAnimator.nodeSiblingsIds);
            }

            if(!targetZone || targetZoneThoughts.length === 0) {
                return undefined;
            }

            // Get zone column and row counts
            const cols = plexAnimator.normalLayoutZoneToColumns.get(targetZone) || 1;
            const rows = plexAnimator.normalLayoutZoneToRows.get(targetZone) || 1;

            // Pick starting position: left-middle column for vertical navigation
            if(isUpDirection || isDownDirection) {
                const targetCol = Math.max(0, Math.floor(cols / 2) - 1); // Left-middle column
                const targetRow = isDownDirection ? 0 : rows - 1; // Top row for down, bottom row for up
                return this.findThoughtAtGridPosition(targetZone, targetCol, targetRow);
            } else {
                // For horizontal navigation (jump/sibling), find row most vertically aligned with active thought
                if(!plexAnimator.activeId) {
                    return this.findThoughtAtGridPosition(targetZone, 0, 0);
                }

                const activeRep = plexAnimator.thtReps.get(plexAnimator.activeId);
                if(!activeRep) {
                    return this.findThoughtAtGridPosition(targetZone, 0, 0);
                }

                const activeRect = DomUtils.getRect(activeRep.thtEl, this.field);
                const activeCenterY = activeRect.y + activeRect.height / 2;

                // Find the row in the target zone that's closest to the active thought's vertical center
                let bestRow = 0;
                let bestDistance = Number.MAX_VALUE;

                for(let row = 0; row < rows; row++) {
                    const thoughtId = this.findThoughtAtGridPosition(targetZone, 0, row);
                    if(thoughtId) {
                        const thoughtRep = plexAnimator.thtReps.get(thoughtId);
                        if(thoughtRep) {
                            const thoughtRect = DomUtils.getRect(thoughtRep.thtEl, this.field);
                            const thoughtCenterY = thoughtRect.y + thoughtRect.height / 2;
                            const distance = Math.abs(thoughtCenterY - activeCenterY);

                            if(distance < bestDistance) {
                                bestDistance = distance;
                                bestRow = row;
                            }
                        }
                    }
                }

                return this.findThoughtAtGridPosition(targetZone, 0, bestRow);
            }
        }

        // Within a zone: navigate by grid position
        if(!currentZone || currentCol < 0 || currentRow < 0) {
            return undefined;
        }

        const cols = plexAnimator.normalLayoutZoneToColumns.get(currentZone) || 1;
        const rows = plexAnimator.normalLayoutZoneToRows.get(currentZone) || 1;

        // Determine which zone we're in
        const isInParents = currentZone === 'parent';
        const isInChildren = currentZone === 'child';
        const isInJumps = currentZone === 'jump';
        const isInSiblings = currentZone === 'sibling';

        let targetCol = currentCol;
        let targetRow = currentRow;

        if(isUpDirection) {
            targetRow--;
            if(targetRow < 0) {
                // Check if we should return to active thought
                if(isInChildren) {
                    return plexAnimator.activeId;
                }
                // Check if we can scroll to reveal more thoughts
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, -1);
                if(nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, -1, nextThoughtId);
                    return undefined; // Don't navigate yet, wait for scroll to complete
                }
                return undefined;
            }
        } else if(isDownDirection) {
            targetRow++;
            if(targetRow >= rows) {
                // Check if we should return to active thought
                if(isInParents) {
                    return plexAnimator.activeId;
                }
                // Check if we can scroll to reveal more thoughts
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, 1);
                if(nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, 1, nextThoughtId);
                    return undefined; // Don't navigate yet, wait for scroll to complete
                }
                return undefined;
            }
        } else if(isLeftDirection) {
            if(isInSiblings) {
                // Left from siblings goes to active
                return plexAnimator.activeId;
            }
            targetCol--;
            if(targetCol < 0) {
                // Check if we can scroll to reveal more thoughts
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, -1);
                if(nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, -1, nextThoughtId);
                    return undefined; // Don't navigate yet, wait for scroll to complete
                }
                return undefined;
            }
        } else if(isRightDirection) {
            if(isInJumps) {
                // Right from jumps goes to active
                return plexAnimator.activeId;
            }
            targetCol++;
            if(targetCol >= cols) {
                // Check if we can scroll to reveal more thoughts
                const nextThoughtId = this.getNextThoughtIdInZoneByIndex(currentRep.id, currentZone, 1);
                if(nextThoughtId && plexAnimator.zoneScrollbars[currentZone]) {
                    this.scrollZoneAndFocusThought(currentZone, 1, nextThoughtId);
                    return undefined; // Don't navigate yet, wait for scroll to complete
                }
                return undefined;
            }
        }

        return this.findThoughtAtGridPosition(currentZone, targetCol, targetRow);
    }

    private findThoughtAtGridPosition(zone: string, col: number, row: number): string | undefined {
        // Find thought at specific grid position using cached lookup
        const key = `${zone}-${col}-${row}`;
        return this.gridPositionToThoughtId.get(key);
    }

    private getNextThoughtIdInZoneByIndex(currentThoughtId: string, zone: string, delta: number): string | undefined {
        // Get thought IDs from the appropriate zone set
        let thoughtSet: Set<string>;
        switch(zone) {
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

        // Convert set to array to get ordered list
        const thoughtIds = Array.from(thoughtSet);
        const currentIndex = thoughtIds.indexOf(currentThoughtId);

        if(currentIndex === -1) {
            return undefined;
        }

        // For horizontal scrollbars (children/parents), we need to skip by the number of rows
        // to stay in the same row. For vertical scrollbars (siblings/jumps), we skip by 1.
        const scrollbar = plexAnimator.zoneScrollbars[zone];
        const isHorizontal = scrollbar?.isHorizontal || false;
        const rows = plexAnimator.normalLayoutZoneToRows.get(zone) || 1;
        const skipAmount = isHorizontal ? rows * delta : delta;

        const nextIndex = currentIndex + skipAmount;
        if(nextIndex >= 0 && nextIndex < thoughtIds.length) {
            return thoughtIds[nextIndex];
        }

        return undefined;
    }

    scrollZoneAndFocusThought(zone: string, direction: 1 | -1, thoughtIdToFocus: string) {
        // Trigger scroll and store the thought to focus after layout completes
        const scrollbar = plexAnimator.zoneScrollbars[zone];
        if(scrollbar) {
            this.pendingFocusAfterScroll = thoughtIdToFocus;
            scrollbar.scrollByPage(direction);
        }
    }

    applyPendingFocus() {
        // Called after scroll layout completes to focus the pending thought
        if(this.pendingFocusAfterScroll) {
            const thoughtId = this.pendingFocusAfterScroll;
            this.pendingFocusAfterScroll = undefined;

            this.isApplyingPendingFocus = true;

            // Update focused state directly in JS for immediate visual feedback
            plexAnimator.focusedId = thoughtId;
            plexAnimator.focusedUsingKeyboardNav = true;

            // Set keyboard nav item via C#
            safeInvoke(plexAnimator.dotNetHelper, "SetKeyboardNavItemByIdAsync", [thoughtId]);
            this.renderNow = true;
            this.animateBriefly();

            // Pan to bring focused thought into view if needed
            this.panToFocusedThought(thoughtId);
        }
    }


    willChangeSelectedLinks(){
        this.selectedLinkIds.forEach((lid) => {
            let labelDiv = document.getElementById("lnk-"+lid);
            if(labelDiv) {
                labelDiv.classList.remove("link-selected");
            }
        });
        
        this.previousSelectedLinkIds = new Set(this.selectedLinkIds);
    }

    async didChangeSelectedLinks(navigateToLink: boolean) {
        this.selectedLinkIds.forEach((lid) => {
            let labelDiv = document.getElementById("lnk-"+lid);
            if(labelDiv) {
                labelDiv.classList.add("link-selected");
            }
        });

        if(this.selectedLinkIds.size > 0) {
            // now fade out any thoughts that are not related to a selected link
            let thtsToKeep: Set<string> = new Set<string>;
            this.selectedLinkIds.forEach((lid) => {
                let link = plexAnimator.linkReps.get(lid);
                if(link) {
                    thtsToKeep.add(link.idA);
                    thtsToKeep.add(link.idB);
                }
            });
            let thtElements = this.field.querySelectorAll(".tht.cur");
            thtElements.forEach((el) => {
                let thtEl = el as HTMLElement;
                let thtId = thtEl.id.substring(4, 40);
                if(thtsToKeep.has(thtId)) {
                    thtEl.style.opacity = "1";
                } else {
                    thtEl.style.opacity = "0.5";
                }
            });
        } else {
            // show all thought at normal opacity
            let thtElements = this.field.querySelectorAll(".tht.cur");
            thtElements.forEach((el) => {
                let thtEl = el as HTMLElement;
                thtEl.style.opacity = "1";
            });
        }

        if(navigateToLink && (this.selectedLinkIds.size > 0 || this.previousSelectedLinkIds.size > 0)) {
            await this.flushContentEditableBlur();
            safeInvoke(plexAnimator.dotNetHelper, "ActivateLink", [navigateToLink ? Array.from(this.selectedLinkIds) : null]);
        }
        
        // TODO: "Activate" the link by default. If one is already activated, call `ShowLinkDialog' for it instead
        
        if(!plexAnimator.isReadOnly) {
            // show/hide link dialog
            // plexAnimator.dotNetHelper.invokeMethodAsync("ShowLinkDialog", navigateToLink ? Array.from(this.selectedLinkIds) : null);
        }

    }

    // Called from C# to sync link selection state
    setSelectedLinkIds(ids: string[] | null) {
        this.willChangeSelectedLinks();
        this.selectedLinkIds.clear();
        if(ids != null) {
            ids.forEach(id => this.selectedLinkIds.add(id));
        }
        this.didChangeSelectedLinks(false);
    }

    getAntColor(bgColorString: string): string {
        const match = bgColorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return "white";
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? "black" : "white";
    }

    createRoundedRectPath(w: number, h: number, rtl: number, rtr: number, rbr: number, rbl: number): string {
        // Inset by 1px so the stroke is fully visible
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

    createMarchingAntsSvg(element: HTMLElement) {
        // Remove any existing overlay first
        this.removeMarchingAntsSvg(element);

        const w = element.offsetWidth;
        const h = element.offsetHeight;
        if (w === 0 || h === 0) return;

        // Determine ant color from the thought-control child's background
        const tcChild = element.querySelector('.thought-control') as HTMLElement;
        let antColor = "white";
        if (tcChild) {
            const bg = getComputedStyle(tcChild).backgroundColor;
            antColor = this.getAntColor(bg);
        }

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", String(w));
        svg.setAttribute("height", String(h));
        svg.classList.add("marching-ants-svg");

        // Offset by border width so SVG covers the full element including border
        const cs = getComputedStyle(element);
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        if (bt !== 0 || bl !== 0) {
            svg.style.top = `-${bt}px`;
            svg.style.left = `-${bl}px`;
        }

        // Detect shape from CSS classes
        const isTag = element.classList.contains("rounded-tl-xl") && element.classList.contains("rounded-br-xl");
        const isType = !isTag && element.classList.contains("rounded-xl");

        this.populateMarchingAntsSvg(svg, w, h, antColor, isTag, isType);

        element.appendChild(svg);

        // Track size changes so the SVG stays in sync with element dimensions
        if (this.marchingAntsResizeObserver) {
            this.marchingAntsResizeObserver.observe(element);
        }
    }

    private populateMarchingAntsSvg(svg: SVGSVGElement, w: number, h: number, strokeColor: string, isTag: boolean, isType: boolean) {
        // Clear existing children
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
        } else {
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

    private handleMarchingAntsResize(entries: ResizeObserverEntry[]) {
        for (const entry of entries) {
            const element = entry.target as HTMLElement;
            const svg = element.querySelector('.marching-ants-svg') as SVGSVGElement | null;
            if (!svg) {
                // Element no longer has ants, stop observing
                this.marchingAntsResizeObserver?.unobserve(element);
                continue;
            }
            const w = element.offsetWidth;
            const h = element.offsetHeight;
            if (w === 0 || h === 0) continue;

            const isTag = element.classList.contains("rounded-tl-xl") && element.classList.contains("rounded-br-xl");
            const isType = !isTag && element.classList.contains("rounded-xl");
            const strokeColor = (svg.firstElementChild?.getAttribute("stroke")) || "white";
            this.populateMarchingAntsSvg(svg, w, h, strokeColor, isTag, isType);
        }
    }

    removeMarchingAntsSvg(element: HTMLElement) {
        const existing = element.querySelector('.marching-ants-svg');
        if (existing) {
            existing.remove();
            this.marchingAntsResizeObserver?.unobserve(element);
        }
    }

    selectedThoughtsChanging(begin: boolean) {
        this.selectedThoughtIds.forEach((tid) => {
            let labelDiv = document.getElementById("tht-"+tid+"-cur");
            if(labelDiv) {
                if(begin) {
                    labelDiv.classList.remove("thought-selected");
                } else {
                    labelDiv.classList.add("thought-selected");
                }
            }
            let hoveredDiv = document.getElementById("tht-"+tid+"-hovered");
            if(hoveredDiv) {
                if(begin) {
                    hoveredDiv.classList.remove("thought-selected");
                } else {
                    hoveredDiv.classList.add("thought-selected");
                }
            }
        });

        if(!begin) {
            plexAnimator.onResize();
            safeInvoke(plexAnimator.dotNetHelper, "SelectedThoughtsChanged", [this.selectedThoughtIds]);
        }

    }

    onWheel(event: WheelEvent) {
        const layout = plexAnimator.layout;
        if(layout == LayoutType.Outline || layout == LayoutType.Mindmap || layout == LayoutType.Force) {
            const deltaPoint = new Point(-event.deltaX, -event.deltaY);
            plexAnimator.backgroundDragged(deltaPoint, true);
            this.renderNow = true;
            event.preventDefault();
            return;
        }

        if(this.scrollbars != null) {
            this.scrollbars.forEach((s) => {
                if(s != null) {
                    s.onWheel(event);
                }
            });
        }
    }

    setScrollbarsToDraw(scrollbars: Scrollbar[]) {
        this.scrollbars = scrollbars;
    }

    // @ts-ignore
    drawScrollbars(graphics: PIXI.Graphics) {
        if(this.scrollbars == null) {
            return;
        }

        this.scrollbars.forEach((s) => {
            if(s != null) {
                let color = Scrollbar.stateByZone[s.zone].isHovered ? plexAnimator.colors.gateHighlighted : plexAnimator.colors.scrollBarOutline;
                graphics.roundRect(s.visRect.x, s.visRect.y, s.visRect.width, s.visRect.height, 9999)
                    .stroke({width:1.5, color:color});
                graphics.roundRect(s.thumbRect.x, s.thumbRect.y, s.thumbRect.width, s.thumbRect.height, 9999)
                    .fill({color:color, alpha:0.5});
            }
        });
    }
    
    // @ts-ignore
    drawActiveThoughtBackground(graphics: PIXI.Graphics) {
        if(!plexAnimator.colors) {
            return;
        }
        if(plexAnimator.layout == LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne || plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
            let cen = plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap
                ? plexAnimator.currentLayout.getActiveThoughtPosition()
                : plexAnimator.currentLayout.getActiveZoneCenter();
            if (!cen) {
                return;
            }

            // always draw circle on active thought
            if(plexAnimator.focusedId == plexAnimator.activeId) {
                graphics.circle(cen.x, cen.y, plexAnimator.rowHeight * 0.8)
                    .stroke({width: 2, color: plexAnimator.colors.thoughtActiveResizeCircle, alpha: 0.8});
            }
            let rep = plexAnimator.thtReps.get(plexAnimator.focusedId);
            // draw outline for focused thought if not equal to active thought 
            if(rep && plexAnimator.focusedId != plexAnimator.activeId) {
                let focusEl = rep!.thtEl;
                if (focusEl) {
                    let rect = DomUtils.getRect(focusEl, this.field);
                    const gap = plexAnimator.rowHeight * 0.1;
                    graphics.roundRect(rect.x - gap, rect.y - gap, rect.width + gap*2, rect.height + gap*2, gap)
                        // Note that this is drawn before and behind the links, which makes it not look opaque!
                        .fill(plexAnimator.colors.thoughtBackground)
                        .stroke({width: 1.5, color: plexAnimator.colors.thoughtActiveResizeCircle });
                }
            }

        } else {

            // animated active thought indicator for force layout
            if(plexAnimator.activeId && plexAnimator.thtReps.get(plexAnimator.activeId)) {
                let activeEl = plexAnimator.thtReps.get(plexAnimator.activeId)!.thtEl;
                let cen = DomUtils.getCenter(activeEl, this.field);

                let fieldRect = this.field.getBoundingClientRect();
                if(!Rect.from(fieldRect).contains(cen)) {
                    return;
                }

                graphics.circle(cen.x, cen.y + plexAnimator.rowHeight * 0.06, plexAnimator.rowHeight * 0.8)
                    .stroke({width:1.5, color:plexAnimator.colors.thoughtActiveResizeCircle});

                let speed = 0.5;
                let time = 1 - (plexAnimator.forceLayout.ellapsedTime * speed) % 1;
                let alpha = 0.5;
                let fadeAlpha = Math.min(1, Math.max(0, 1 - time));

                graphics.circle(cen.x, cen.y + plexAnimator.rowHeight * 0.06, plexAnimator.rowHeight * (time+0.8/3) * 3)
                    .stroke({width:1.5, color:plexAnimator.colors.thoughtActiveResizeCircle, alpha:alpha});
                graphics.circle(cen.x, cen.y + plexAnimator.rowHeight * 0.06, plexAnimator.rowHeight * (time+3.8/3) * 3)
                    .stroke({width:1.5, color:plexAnimator.colors.thoughtActiveResizeCircle, alpha:fadeAlpha * alpha});
            }
        }
    }

    PATH_RIGHT = "M4 19.5 L20 12 L4 4.5 z";
    PATH_LEFT = "M20 19.5 L4 12 L20 4.5 z";
    PATH_RIGHT_ONE_WAY = "M8 19.5 L24 12 L8 4.5 z M1 4.5 L5 4.5 L5 19.5 L1 19.5 z";
    PATH_LEFT_ONE_WAY = "M16 19.5 L0 12 L16 4.5 z z M23 4.5 L19 4.5 L19 19.5 L23 19.5 z";

    // @ts-ignore
    drawLinksAndSetupGates(graphics: PIXI.Graphics, createColliders: boolean) {

        this.clearGates();

        plexAnimator.linkReps.forEach((l) => {

            let thtRepA = plexAnimator.getAnyThoughtRepById(l.idA);
            let thtRepB = plexAnimator.getAnyThoughtRepById(l.idB);
            if(thtRepA == null && thtRepB == null) {
                return;
            }

            // setup gates

            // show highlighted gate if other side of link is missing
            if(thtRepA == null) {
                if((!l.isOneWay() || l.isBackward()) && l.meaning != LinkMeaning.HasTag && l.meaning != LinkMeaning.InstanceOf) {
                    this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.More);
                }
                return;
            } else if(thtRepB == null) {
                if(!l.isOneWay() || !l.isBackward()) {
                    this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.More);
                }
                return;
            }
            if(thtRepA.thtEl.style.display === "none" || thtRepB.thtEl.style.display === "none") {
                // both exist but neither are being shown
                return;
            }
            // Treat animating-out (.old) elements like missing thoughts so gates update immediately on collapse
            const aIsOld = thtRepA.thtEl.classList.contains("old");
            const bIsOld = thtRepB.thtEl.classList.contains("old");
            if(aIsOld || bIsOld) {
                if(!aIsOld && bIsOld) {
                    if(!l.isOneWay() || !l.isBackward()) {
                        this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.More);
                    }
                } else if(aIsOld && !bIsOld) {
                    if((!l.isOneWay() || l.isBackward()) && l.meaning != LinkMeaning.HasTag && l.meaning != LinkMeaning.InstanceOf) {
                        this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.More);
                    }
                }
                return;
            }

            // Check if either endpoint is only a list rep (pinned/past), not in the plex
            const aInPlex = plexAnimator.thtReps.has(thtRepA.id);
            const bInPlex = plexAnimator.thtReps.has(thtRepB.id);
            if(!aInPlex || !bInPlex) {
                // Treat list-only reps like missing thoughts: the plex-side gets More (not Full)
                if(aInPlex && !bInPlex) {
                    if(!l.isOneWay() || !l.isBackward()) {
                        this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.More);
                    }
                } else if(!aInPlex && bInPlex) {
                    if((!l.isOneWay() || l.isBackward()) && l.meaning != LinkMeaning.HasTag && l.meaning != LinkMeaning.InstanceOf) {
                        this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.More);
                    }
                }
                return;
            }
            // if the gate is set to unused, change it (avoid overriding GateStatus.More)
            this.setGateStatusForThoughtId(l.idA, l.relation, GateStatus.Full);
            this.setGateStatusForThoughtId(l.idB, RelationHelper.getOpposite(l.relation), GateStatus.Full);

            if(plexAnimator.layout === LayoutType.Force) {
                // if this link involves a drone, do not draw it
                if(plexAnimator.forceLayout.isDrone(thtRepA.id) || plexAnimator.forceLayout.isDrone(thtRepB.id)) {
                    return;
                }
            }

            // if thought is very low opacity, do not draw links
            let opA = +getComputedStyle(thtRepA.thtEl).opacity;
            let opB = +getComputedStyle(thtRepB.thtEl).opacity;
            let minOpacity = Math.min(opA, opB);
            if(minOpacity < 0.2) {
                return;
            }
            
            let sGate: Relation;
            let dGate: Relation;
            sGate = l.relation;
            dGate = this.getOppositeRelation(l.relation);

            let isThtAJumpOfActive = plexAnimator.nodeJumpsIds.has(thtRepA.id);
            let isThtBJumpOfActive = plexAnimator.nodeJumpsIds.has(thtRepB.id);

            let rectA = DomUtils.getRect(thtRepA.thtEl, this.field);
            let rectB = DomUtils.getRect(thtRepB.thtEl, this.field);

            let isLinkHighlighted = false;

            if(this.hoveredThoughtId) {
                let idToTestForHover = this.hoveredThoughtId;
                // if the thought is part of a cluster, find the link using the pilot
                if(plexAnimator.layout == LayoutType.Force) {
                    if(plexAnimator.forceLayout.isDrone(this.hoveredThoughtId)) {
                        let pilot = plexAnimator.forceLayout.getPilot(this.hoveredThoughtId);
                        if(pilot) {
                            idToTestForHover = pilot.id;
                        }
                    }
                }
                if(l.idA == idToTestForHover || l.idB == idToTestForHover) {
                    isLinkHighlighted = true;
                }
            } else if(this.hoveredLinkId == l.id) {
                isLinkHighlighted = true;
            } else if(this.hoveredGateThtId && this.hoveredGateRelation !== Relation.Unknown) {
                if(l.idA == this.hoveredGateThtId && l.relation == this.hoveredGateRelation) {
                    isLinkHighlighted = true;
                } else if(l.idB == this.hoveredGateThtId && l.relation == this.getOppositeRelation(this.hoveredGateRelation)) {
                    isLinkHighlighted = true;
                }
            }

            let isClusterLink = false;
            if(plexAnimator.layout === LayoutType.Force) {
                // if this is a pilot representing a cluster, draw an outline and set the gate location for the entire cluster
                if(plexAnimator.forceLayout.isPilot(thtRepA.id)) {
                    rectA = plexAnimator.forceLayout.getNodeRect(thtRepA.id);
                    graphics.roundRect(rectA.x, rectA.y, rectA.width, rectA.height, 10)
                        .stroke({width:1, color:isLinkHighlighted ? plexAnimator.colors.linkHighlighted : plexAnimator.colors.linkNormal, alpha:0.6});
                    isClusterLink = true;
                }
                if(plexAnimator.forceLayout.isPilot(thtRepB.id)) {
                    rectB = plexAnimator.forceLayout.getNodeRect(thtRepB.id);
                    graphics.roundRect(rectB.x, rectB.y, rectB.width, rectB.height, 10)
                        .stroke({width:1, color:isLinkHighlighted ? plexAnimator.colors.linkHighlighted : plexAnimator.colors.linkNormal, alpha:0.6});
                    isClusterLink = true;
                }
            }

            let isGateBEastOfA = rectA.getCenter().x < rectB.getCenter().x;

            // Determine child gate sides for mindmap active thought
            let childSideA: 'left' | 'right' | undefined;
            let childSideB: 'left' | 'right' | undefined;
            if(plexAnimator.layout == LayoutType.Mindmap) {
                const isAActive = thtRepA.id == plexAnimator.node?.id;
                const isBActive = thtRepB.id == plexAnimator.node?.id;

                if(isAActive && sGate === Relation.Child) {
                    // A is active thought with child gate - determine which side based on B's position
                    childSideA = isGateBEastOfA ? 'right' : 'left';
                }
                if(isBActive && dGate === Relation.Child) {
                    // B is active thought with child gate - determine which side based on A's position
                    childSideB = !isGateBEastOfA ? 'right' : 'left';
                }
            }

            let gateA = this.getGateLocationFromRectAndThoughtRepForLink(rectA, thtRepA, sGate, isThtAJumpOfActive, isGateBEastOfA, childSideA);
            let gateB = this.getGateLocationFromRectAndThoughtRepForLink(rectB, thtRepB, dGate, isThtBJumpOfActive, !isGateBEastOfA, childSideB);
            let color = l.color;
            if(color === 0) {
                color = plexAnimator.colors.linkNormal;
            }
            if(isLinkHighlighted) {
                color = plexAnimator.colors.linkHighlighted;
            }

            // isExtraLink is currently true in normal layout for anything not involving the active thought - it should also be true for parent to sibling links
            let isExtraLink = plexAnimator.layout != LayoutType.Force && l.idA != plexAnimator.activeId && l.idB != plexAnimator.activeId;
            if(plexAnimator.layout === LayoutType.Normal || plexAnimator.layout == LayoutType.NormalPlusOne) {
                if(plexAnimator.nodeParentsIds.has(l.idA) && plexAnimator.nodeSiblingsIds.has(l.idB) ||
                    plexAnimator.nodeParentsIds.has(l.idB) && plexAnimator.nodeSiblingsIds.has(l.idA)) {
                    isExtraLink = false;
                }
            }
            if(plexAnimator.primaryLinks.size > 0) { // normal layout uses the above logic and leaves .primaryLinks empty
                isExtraLink = !plexAnimator.isPrimaryLink(l.idA, l.idB);
            }
            if(isExtraLink) {
                minOpacity *= 0.4;
            }
            let defaultThickness = (plexAnimator.colors.linkThickness ?? 150) / 100;
            let linkOpacity = (plexAnimator.colors.linkOpacity ?? 60) / 100;
            let lineWidth = l.thickness <= 0 ? defaultThickness : l.thickness / 100;

            if(this.selectedLinkIds.size > 0) {
                if(this.selectedLinkIds.has(l.id)) {
                    lineWidth += 1;
                    let pulseOffset = (Date.now() % 875) / 875; // 1000 = 1 pulse per second - 60 BPM
                    pulseOffset *= 2 * PI;
                    let delta = Math.sin(pulseOffset) * 0.25;
                    minOpacity = 0.85 + delta;
                } else if(!isLinkHighlighted) {
                    // something else is selected, dim this link unless hovered
                    minOpacity *= 0.6;
                }
            }

            graphics.moveTo(gateA.x, gateA.y);

            let linkLabelPoint: Point | undefined;
            let linkBeforePoint: Point | undefined;

            if(plexAnimator.isStraightLinksEnabled) {
                graphics.lineTo(gateB.x, gateB.y)
                    .stroke({width:lineWidth, color:color, alpha:minOpacity * linkOpacity});
                if(createColliders) {
                    this.linkColliders![l.id] = new LineCollider(gateA, gateB, 4);
                    if((l.isDirected() || l.label && l.label.length > 0 || l.hasNotes || l.attachmentCount > 0) && !isExtraLink) {
                        // calculate where the link label goes
                        linkLabelPoint = new Point((gateA.x+gateB.x)*0.5, (gateA.y+gateB.y)*0.5);
                        linkBeforePoint = gateA;
                    }
                }
            } else {
                let rectA = DomUtils.getRect(thtRepA.thtEl, this.field);
                let rectB = DomUtils.getRect(thtRepB.thtEl, this.field);
                let isSecondary = !plexAnimator.isPrimaryLink(l.idA, l.idB);
                let points: Point[] = plexAnimator.currentLayout.getCurvePoints(l.relation,
                    rectA, gateA, thtRepA.generation, thtRepA.alignment,
                    rectB, gateB, thtRepB.generation, thtRepB.alignment, isSecondary);
                if(plexAnimator.layout === LayoutType.Mindmap &&
                    (thtRepA.zone === "parent" || thtRepB.zone === "parent")) {
                    points = plexAnimator.normalLayout.getCurvePoints(l.relation,
                    rectA, gateA, thtRepA.generation, thtRepA.alignment,
                    rectB, gateB, thtRepB.generation, thtRepB.alignment, isSecondary);
                }
                if(plexAnimator.layout === LayoutType.Mindmap &&
                    (thtRepA.zone === "jump" || thtRepB.zone === "jump")) {
                    points = plexAnimator.normalLayout.getCurvePoints(thtRepA.id == plexAnimator.activeId ? Relation.Child : Relation.Parent,
                    rectA, gateA, thtRepA.generation, thtRepA.alignment,
                    rectB, gateB, thtRepB.generation, thtRepB.alignment, isSecondary);
                }
                graphics.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y)
                    .stroke({width: lineWidth, color: color, alpha: minOpacity * linkOpacity});
                if (createColliders) {
                    this.linkColliders![l.id] = new CubicCollider(points);
                    if ((l.isDirected() || l.label && l.label.length > 0 || l.hasNotes || l.attachmentCount > 0) && !isExtraLink) {
                        // calculate where the link label goes
                        linkLabelPoint = CubicCollider.getCubicValueAt(points, 0.5);
                        linkBeforePoint = CubicCollider.getCubicValueAt(points, 0.48);
                    }
                }
            }

            if(createColliders && linkLabelPoint) {
                if(isClusterLink) {
                    if(this.hoveredThoughtId) {
                        if(plexAnimator.forceLayout.isDrone(this.hoveredThoughtId) || plexAnimator.forceLayout.isPilot(this.hoveredThoughtId)) {
                            let pilotId = plexAnimator.forceLayout.getPilot(this.hoveredThoughtId)!.id;
                            if(pilotId === l.idA || pilotId === l.idB) {
                                // this link is being highlighted because a thought within the cluster is hovered - use the link label for that link
                                // find the link that matches the pilot's link
                                let realLinks = Array.from(plexAnimator.linkReps.values()).filter((nl) => nl.idA === this.hoveredThoughtId && nl.idB === l.idB || nl.idA === l.idA && nl.idB === this.hoveredThoughtId);
                                if(realLinks.length === 1) {
                                    let linkToGetLabelFrom = realLinks[0];
                                    let labelDiv = this.createLinkLabel(linkToGetLabelFrom, linkLabelPoint, linkBeforePoint!);
                                    labelDiv.classList.add("link-hovered")
                                }
                            }
                        }
                    }
                } else {
                    let labelDiv = this.createLinkLabel(l, linkLabelPoint, linkBeforePoint!);
                    if(l.idA === this.hoveredThoughtId || l.idB === this.hoveredThoughtId || l.id === this.hoveredLinkId) {
                        labelDiv.classList.add("link-hovered")
                    }
                }
            }

        });
    }

    private setGateStatusForThoughtId(id: string, relation: Relation, status: GateStatus) {
        const plexRep = plexAnimator.thtReps.get(id);
        if(plexRep) plexRep.setGateStatusWithoutOverridingMore(relation, status);
        const pinned = plexAnimator.pinnedListLayout?.getRep(id);
        if(pinned) pinned.setGateStatusWithoutOverridingMore(relation, status);
        const past = plexAnimator.pastListLayout?.getRep(id);
        if(past) past.setGateStatusWithoutOverridingMore(relation, status);
        const selected = plexAnimator.selectedListLayout?.getRep(id);
        if(selected) selected.setGateStatusWithoutOverridingMore(relation, status);
    }

    getOppositeRelation(r: Relation) : Relation {
        switch(r) {
            case Relation.Child:
                return Relation.Parent;
            case Relation.Parent:
                return Relation.Child;
            case Relation.Jump:
                return Relation.Jump;
            default:
                // this should never happen
                return Relation.Unknown;
        }
    }

    createLinkLabel(l: LinkRep, linkLabelPoint: Point, linkBeforePoint: Point): HTMLElement {
        // create link label
        let linkLabelAngle = Math.atan2(linkLabelPoint.y - linkBeforePoint!.y, linkLabelPoint.x - linkBeforePoint!.x);
        let isUpsideDown = linkBeforePoint!.x > linkLabelPoint.x;
        let isLeft = l.isBackward() && !isUpsideDown || !l.isBackward() && isUpsideDown;
        if(isUpsideDown) {
            linkLabelAngle += PI;
        }
        let labelDiv = document.createElement("div");
        labelDiv.classList.add("flex", "place-items-center", "gap-1");
        let arrowDiv: HTMLElement | undefined;
        if(l.isDirected()) {
            arrowDiv = document.createElement("div");
            arrowDiv.style.width = "1rem";
            arrowDiv.style.height = "1rem";
            let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 24 24");
            let color = l.color;
            if(color === 0) {
                color = plexAnimator.colors.linkNormal;
            }
            svg.setAttribute("fill", this.getColorString(color, 1));
            svg.setAttribute("stroke", this.getColorString(plexAnimator.colors.thoughtBackground, 1));
            svg.setAttribute("stroke-width", "1");
            let path = document.createElementNS("http://www.w3.org/2000/svg", 'path');
            if(isLeft) {
                if(l.isOneWay()) {
                    path.setAttribute("d", this.PATH_LEFT_ONE_WAY);
                } else {
                    path.setAttribute("d", this.PATH_LEFT);
                }
            } else {
                if(l.isOneWay()) {
                    path.setAttribute("d", this.PATH_RIGHT_ONE_WAY);
                } else {
                    path.setAttribute("d", this.PATH_RIGHT);
                }
            }
            svg.appendChild(path);
            arrowDiv.appendChild(svg);
        }

        if(isLeft && arrowDiv) {
            labelDiv.appendChild(arrowDiv);
        }
        
        // Add note indicator dot if link has notes
        if(l.hasNotes) {
            let noteIcon = document.createElement("i");
            noteIcon.className = "fas fa-circle-small";
            noteIcon.style.fontSize = "0.6rem";
            labelDiv.appendChild(noteIcon);
        }
        
        // Add attachment icon with count if link has attachments
        if(l.attachmentCount > 0) {
            let attachmentIcon = document.createElement("i");
            attachmentIcon.className = "fas fa-paperclip";
            attachmentIcon.style.fontSize = "0.6rem";
            labelDiv.appendChild(attachmentIcon);
        }
        
        if(l.label != null) {
            let textSpan = document.createElement("span");
            textSpan.style.position = "relative";
            textSpan.style.top = "0.12em";
            textSpan.textContent = l.label;
            labelDiv.appendChild(textSpan);
        }
        
        if(!isLeft && arrowDiv) {
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

    // @ts-ignore
    drawInteractions(graphics: PIXI.Graphics) {
        // Draw selection rectangle
        if(this.isDrawingSelectionRect && this.selectionRectStartPoint && this.selectionRectEndPoint) {
            this.drawSelectionRectangle(graphics);
        }

        // Position focus circle overlay on focused thought
        if(this.focusCircleEl) {
            // Hide the reticle when the plex doesn't effectively have focus
            // (mirrors the gate used in onKeyDown for accepting plex keyboard input)
            const activeEl = document.activeElement as HTMLElement;
            const plexHasFocus = !this.isEditableElement(activeEl) && !this.isDialogShowing && !this.isSearchUIShowing;
            if(plexAnimator.focusedId && plexAnimator.focusedUsingKeyboardNav && plexHasFocus) {
                let rep = plexAnimator.thtReps.get(plexAnimator.focusedId);
                if(rep) {
                    let focusEl = rep.thtEl;
                    if(focusEl) {
                        let rect = DomUtils.getRect(focusEl, this.field);
                        // Calculate center point of the thought
                        const centerX = rect.x + rect.width / 2;
                        const centerY = rect.y + rect.height / 2;

                        // Calculate the size based on row height (matching the previous circle radius)
                        const circleSize = plexAnimator.rowHeight * 0.65 * 2;

                        // If circle is not showing, position it on active thought first to enable animation
                        // UNLESS we're applying a pending focus after paging (to avoid visible jump)
                        const wasHidden = this.focusCircleEl.style.display === 'none';
                        if(wasHidden && plexAnimator.activeId && !this.isApplyingPendingFocus) {
                            // Position on active thought first
                            const activeRep = plexAnimator.thtReps.get(plexAnimator.activeId);
                            if(activeRep) {
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
                            // Force a reflow so the browser renders the circle at the active thought position
                            // before we update to the focused thought position (this enables the CSS transition)
                            void this.focusCircleEl.offsetHeight;
                        } else if(wasHidden) {
                            // When skipping active thought positioning, just show the circle
                            this.focusCircleEl.style.display = 'block';
                        }

                        // Update the circle size, position, and color
                        this.focusCircleEl.style.width = `${circleSize}px`;
                        this.focusCircleEl.style.height = `${circleSize}px`;
                        this.focusCircleEl.style.left = `${centerX - circleSize / 2}px`;
                        this.focusCircleEl.style.top = `${centerY - circleSize / 2}px`;
                        this.focusCircleEl.style.borderColor = this.getColorString(plexAnimator.colors.thoughtHighlightOutline, 1);

                        // Clear the pending focus flag after positioning is done
                        if(this.isApplyingPendingFocus) {
                            this.isApplyingPendingFocus = false;
                        }
                    } else {
                        this.focusCircleEl.style.display = 'none';
                    }
                } else {
                    this.focusCircleEl.style.display = 'none';
                }
            } else {
                this.focusCircleEl.style.display = 'none';
            }
        }

        if(this.hoveredGateThtId != null) {
            // draw gate circle and link if needed
            let thtRep: ThoughtRep | undefined = undefined;
            if(this.pressedObjectType == PlexObjectType.ThoughtGate && this.isListGateDragActive && this.listGateDragSourceRep) {
                // Use the original list source rep for a list-origin drag
                thtRep = this.listGateDragSourceRep;
            } else {
                thtRep = (this.hoveredListRep && this.hoveredListRep.id === this.hoveredGateThtId) ? this.hoveredListRep : plexAnimator.thtReps.get(this.hoveredGateThtId);
            }
            if(thtRep) {
                // Lists: always place jump gate on the left; detect list rep via DOM ancestry
                let gate: Point;
                const isListRep = this.isInAccessoryList(thtRep.thtEl);
                const isActiveThought = thtRep.id == plexAnimator.node?.id;
                if(isListRep) {
                    const rectA = DomUtils.getRect(thtRep.thtEl, this.field);
                    gate = this.getGateLocationFromRectAndThoughtRep(rectA, thtRep, this.hoveredGateRelation, false, this.gateDragSourceChildSide);
                } else {
                    gate = this.getGateLocationFromThoughtRep(thtRep, this.hoveredGateRelation, this.gateDragSourceChildSide);
                }
                if(this.pressedObjectType == PlexObjectType.ThoughtGate && this.gateDragDestPoint) {
                    this.drawDragLinkPreview(graphics, thtRep, gate, this.hoveredGateRelation, this.gateDragDestPoint);
                }
            }
        }

        // Pinned drag-link preview (CreateThought dialog is open after empty-area drop).
        if(this.linkPreviewPinned && this.pinnedLinkSrcThtId && this.pinnedLinkDestPoint
            && this.pressedObjectType != PlexObjectType.ThoughtGate) {
            const srcRep = plexAnimator.thtReps.get(this.pinnedLinkSrcThtId);
            if(srcRep) {
                let srcGate: Point;
                const isListRep = this.isInAccessoryList(srcRep.thtEl);
                if(isListRep) {
                    const rectA = DomUtils.getRect(srcRep.thtEl, this.field);
                    srcGate = this.getGateLocationFromRectAndThoughtRep(rectA, srcRep, this.pinnedLinkSrcRelation, false, this.pinnedLinkSrcChildSide);
                } else {
                    srcGate = this.getGateLocationFromThoughtRep(srcRep, this.pinnedLinkSrcRelation, this.pinnedLinkSrcChildSide);
                }
                this.drawDragLinkPreview(graphics, srcRep, srcGate, this.pinnedLinkSrcRelation, this.pinnedLinkDestPoint);
            }
        }

        if(this.hoveredGateThtId == null && (this.hoveredControlThtId || this.hoveredThoughtId) && plexAnimator.layout == LayoutType.Force) {
            // draw control
            let thtId = this.hoveredControlThtId ? this.hoveredControlThtId : this.hoveredThoughtId
            let thtRep = plexAnimator.thtReps.get(thtId!);
            if(thtRep) {
                for(let ct = ThoughtControl.Expand; ct <= ThoughtControl.Anchor; ct++) {
                    this.drawControl(graphics, thtRep, ct, ct === this.hoveredControl);
                }
            }
        }
    }

    // @ts-ignore
    drawDragLinkPreview(graphics: PIXI.Graphics, thtRep: ThoughtRep, gate: Point, relation: Relation, destPoint: Point) {
        let destGate = new Point(destPoint.x, destPoint.y);
        if(plexAnimator.isStraightLinksEnabled) {
            graphics.moveTo(gate.x, gate.y).lineTo(destGate.x, destGate.y)
                .stroke({width:1, color:plexAnimator.colors.linkHighlighted});
        } else {
            let rectA = DomUtils.getRect(thtRep.thtEl, this.field);
            let rectB = new Rect(destGate.x - plexAnimator.rowHeight / 2, destGate.y - plexAnimator.rowHeight / 2, plexAnimator.rowHeight, plexAnimator.rowHeight);
            let isSecondary = false;
            // default dragging link styles
            let layout: BaseLayout = plexAnimator.currentLayout;
            let gateRelation: Relation = relation;
            let alignment = ThoughtHorizontalAlignment.Center;
            let gen = -1;
            // special case dragging link styles
            if(plexAnimator.layout == LayoutType.Mindmap && relation == Relation.Child) {
                layout = plexAnimator.mindmapLayout;
            } else if(plexAnimator.layout == LayoutType.Mindmap && relation == Relation.Jump) {
                layout = plexAnimator.normalLayout;
                gateRelation = Relation.Child;
            } else if(plexAnimator.layout == LayoutType.Mindmap && relation == Relation.Parent) {
                layout = plexAnimator.normalLayout;
                gateRelation = Relation.Parent;
            } else if(plexAnimator.layout == LayoutType.Outline && relation == Relation.Child) {
                alignment = ThoughtHorizontalAlignment.Left;
                gen = thtRep.generation + 1;
            } else if(plexAnimator.layout == LayoutType.Outline && relation == Relation.Jump) {
                alignment = ThoughtHorizontalAlignment.Right;
                gen = thtRep.generation + 1;
            } else if(plexAnimator.layout == LayoutType.Outline && relation == Relation.Parent) {
                alignment = ThoughtHorizontalAlignment.Left;
                gateRelation = Relation.Child; // use a different gate to get drag link to look right
                gen = thtRep.generation + 1;
            }
            let points: Point[] = layout.getCurvePoints(gateRelation, rectA, gate, thtRep.generation, thtRep.alignment, rectB, destGate, gen, alignment, isSecondary);
            graphics.moveTo(gate.x, gate.y).bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y)
                .stroke({width:1, color:plexAnimator.colors.linkHighlighted});
        }
        graphics.circle(destGate.x, destGate.y, plexAnimator.GATE_SIZE * 2)
            .stroke({width:2, color:plexAnimator.colors.gateHighlighted});
        graphics.circle(destGate.x, destGate.y, plexAnimator.GATE_SIZE)
            .fill(plexAnimator.colors.gateNormal);
    }

    endDragLinkPreview() {
        if(!this.linkPreviewPinned) {
            return;
        }
        this.linkPreviewPinned = false;
        this.pinnedLinkSrcThtId = undefined;
        this.pinnedLinkSrcRelation = Relation.Unknown;
        this.pinnedLinkSrcChildSide = undefined;
        this.pinnedLinkDestPoint = undefined;
        this.renderNow = true;
        // The ticker may be idle (it stops once nothing requests redraws); kick it so the
        // next tick clears the now-unpinned preview without waiting for a mouse move.
        this.stopAfterNextTick = true;
        if(this.appBottom?.ticker) {
            this.appBottom.ticker.start();
        }
    }

    // @ts-ignore
    drawControl(graphics: PIXI.Graphics, thtRep: ThoughtRep, controlType: ThoughtControl, isHighlighted: boolean) {
        if(controlType == ThoughtControl.Chevron) {
            // TODO use isHighlighted
            let shouldDrawChevron = false;
            if(thtRep.expandDirection == ThoughtExpandDirection.Parent && thtRep.parentGate !== GateStatus.Empty ||
                (thtRep.expandDirection == ThoughtExpandDirection.Child || thtRep.expandDirection == ThoughtExpandDirection.ChildLeft) && thtRep.childGate !== GateStatus.Empty) {
                shouldDrawChevron = true;
            }
            if (shouldDrawChevron) {
                let chevron = this.getChevronLocation(thtRep.thtEl, thtRep.alignment);
                // Visually smaller, but the hit box is still bigger, especially for mobile / touch
                let rad = 0.4 * plexAnimator.rowHeight / 2;
                let fillColor = '#' + ('000000' + plexAnimator.colors.thoughtText.toString(16)).slice(-6);

                // Determine target angle based on state (right-pointing chevron = 0°)
                let targetAngle = 0;
                if (thtRep.expandDirection == ThoughtExpandDirection.Child) {
                    targetAngle = thtRep.childGate === GateStatus.Full ? 90 : 0; // right → down
                } else if (thtRep.expandDirection == ThoughtExpandDirection.ChildLeft) {
                    targetAngle = thtRep.childGate === GateStatus.Full ? -90 : 0; // left(180) → down via left(-90)
                } else if (thtRep.expandDirection == ThoughtExpandDirection.Parent) {
                    targetAngle = thtRep.parentGate === GateStatus.Full ? -90 : 0; // left(180) → up(-90)
                }

                // Base angle for the expand direction
                let baseAngle = 0;
                if (thtRep.expandDirection == ThoughtExpandDirection.ChildLeft || thtRep.expandDirection == ThoughtExpandDirection.Parent) {
                    baseAngle = 180;
                }

                thtRep.chevronTargetAngle = baseAngle + targetAngle;

                // Initialize on first draw
                if (isNaN(thtRep.chevronAngle)) {
                    thtRep.chevronAngle = thtRep.chevronTargetAngle;
                }

                // Animate toward target — time-based (deltaSinceLastDraw is in 1/60s units)
                const degreesPerFrame = 6.0; // degrees per 1/60th second (~360° per second)
                let diff = thtRep.chevronTargetAngle - thtRep.chevronAngle;
                // Normalize to [-180, 180] for shortest path
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                // Cap step to avoid jumping on large deltas (e.g., first frame after state change)
                let maxStep = degreesPerFrame * Math.min(this.deltaSinceLastDraw, 2.0);
                if (Math.abs(diff) < 0.5) {
                    thtRep.chevronAngle = thtRep.chevronTargetAngle;
                } else if (Math.abs(diff) <= maxStep) {
                    thtRep.chevronAngle = thtRep.chevronTargetAngle;
                } else {
                    thtRep.chevronAngle += Math.sign(diff) * maxStep;
                    this.chevronAnimating = true; // keep ticker running
                }

                let svgCode = this.getChevronRightSvg(fillColor);
                let opacity = getComputedStyle(thtRep.thtEl).opacity;
                let opacityNum = +opacity;
                let isChevronHovered = this.hoveredControlThtId === thtRep.id && this.hoveredControl === ThoughtControl.Chevron;
                let chevronAlpha = isChevronHovered ? 1.0 : this.chevronUnhoveredOpacity;
                this.drawSvgCenteredRotated(graphics, svgCode, chevron, rad * 1.6, thtRep.chevronAngle,
                    {color: plexAnimator.colors.thoughtText, alpha: chevronAlpha * opacityNum},
                    {color: plexAnimator.colors.thoughtBackground, alpha: 0.85 * chevronAlpha * opacityNum, width: 4.0}
                );
            }
            return;
        }

        let isEnabled = true;
        if(controlType === ThoughtControl.Expand) {
            isEnabled = plexAnimator.canExpand(thtRep);
        } else if(controlType === ThoughtControl.Collapse) {
            isEnabled = plexAnimator.canCollapse(thtRep);
        }
        if(!isEnabled) {
            isHighlighted = false;
        }
        let cen = this.getControlLocation(thtRep, controlType);

        graphics.circle(cen.x, cen.y, plexAnimator.CONTROL_SIZE / 2)
            .fill({color:plexAnimator.colors.thoughtBackground, alpha:0.5})
        graphics.circle(cen.x, cen.y, plexAnimator.CONTROL_SIZE / 2)
            .stroke({width:1, color:plexAnimator.colors.thoughtText, alpha:isHighlighted ? 1 : isEnabled ? 0.5 : 0.25});
        let unit = plexAnimator.CONTROL_SIZE / 4;
        graphics.lineStyle(1, plexAnimator.colors.thoughtText, isEnabled ? 1 : 0.5);
        switch(controlType) {
            case ThoughtControl.Expand:
                graphics.moveTo(cen.x, cen.y - unit).lineTo(cen.x, cen.y + unit)
                    .stroke({width:1, color:plexAnimator.colors.thoughtText, alpha:isEnabled ? 1 : 0.5});
                graphics.moveTo(cen.x - unit, cen.y).lineTo(cen.x + unit, cen.y)
                    .stroke({width:1, color:plexAnimator.colors.thoughtText, alpha:isEnabled ? 1 : 0.5});
                break;
            case ThoughtControl.Collapse:
                graphics.moveTo(cen.x - unit, cen.y).lineTo(cen.x + unit, cen.y)
                    .stroke({width:1, color:plexAnimator.colors.thoughtText, alpha:isEnabled ? 1 : 0.5});
                break;
            case ThoughtControl.Anchor:
                if(plexAnimator.forceLayout.nodeIsAnchored(thtRep.id)) {
                    graphics.circle(cen.x, cen.y, plexAnimator.CONTROL_SIZE / 2).fill(plexAnimator.colors.thoughtText);
                }
                //graphics.svg("M" + (cen.x - unit) + " " + (cen.y - unit) + " L" + (cen.x + unit) + " " + (cen.y + unit) + " M" + (cen.x + unit) + " " + (cen.y - unit) + " L" + (cen.x - unit) + " " + (cen.y + unit)
                graphics.moveTo(cen.x, cen.y - unit * 0.6).lineTo(cen.x, cen.y + unit)
                    .stroke({width:1, color:plexAnimator.colors.thoughtText, alpha:isEnabled ? 1 : 0.5});
                graphics.moveTo(cen.x - unit * 0.7, cen.y - unit * 0.6).lineTo(cen.x + unit * 0.7, cen.y - unit * 0.6)
                    .stroke({width:1, color:plexAnimator.colors.thoughtText, alpha:isEnabled ? 1 : 0.5});
                break;
        }

    }
    
    getChevronLocation(element: HTMLElement, align: ThoughtHorizontalAlignment): Point {
        let rect = DomUtils.getRect(element, this.field);
        let cen = rect.getCenter();
        let rad = plexAnimator.rowHeight / 2;
        return new Point(align === ThoughtHorizontalAlignment.Right ? rect.right() + 1.2 * rad : rect.x - 1.2 * rad, cen.y);
    }
    
    // ?
    getAnchorSvg(fillColor: string): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="${fillColor}" d="M320 96a32 32 0 1 1 -64 0 32 32 0 1 1 64 0zm21.1 80C367 158.8 384 129.4 384 96c0-53-43-96-96-96s-96 43-96 96c0 33.4 17 62.8 42.9 80L224 176c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 0 208-48 0c-53 0-96-43-96-96l0-6.1 7 7c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9L97 263c-9.4-9.4-24.6-9.4-33.9 0L7 319c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l7-7 0 6.1c0 88.4 71.6 160 160 160l80 0 80 0c88.4 0 160-71.6 160-160l0-6.1 7 7c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-56-56c-9.4-9.4-24.6-9.4-33.9 0l-56 56c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l7-7 0 6.1c0 53-43 96-96 96l-48 0 0-208 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-10.9 0z"/></svg>`;
    }
    
    getChevronDownSvg(fillColor: string): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${fillColor}" d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192"/></svg>`; // 'z' for closePath generates annoying PixiJS warnings
    }
    
    getChevronUpSvg(fillColor: string): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${fillColor}" d="M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192"/></svg>`;
    }
    
    getChevronRightSvg(fillColor: string): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><path fill="${fillColor}" d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192"/></svg>`;
    }
    
    getChevronLeftSvg(fillColor: string): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><path fill="${fillColor}" d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192"/></svg>`;
    }
    
    // @ts-ignore
    drawSvgCentered(graphics: PIXI.Graphics, svg: string, center: Point, svgHeight: number, fillObject: any, strokeObject: any) {
        let h = 512;
        let w = 512;
        let viewBoxBits = svg.match(/viewBox="([^"]*)"/);
        if(viewBoxBits != null) {
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
            .resetTransform()
        graphics
            .translateTransform(center.x - svgHeight * 0.5 * r, center.y - svgHeight * 0.5)
            .scaleTransform(1.0 / h * svgHeight)
            .svg(svg)
            // Note: fillObject seems to be ignored - this is why the getSvg... methods take a fillColor parameter
            .fill(fillObject)
            .resetTransform()
    }

    // @ts-ignore
    drawSvgCenteredRotated(graphics: PIXI.Graphics, svg: string, center: Point, svgHeight: number, angleDegrees: number, fillObject: any, strokeObject: any) {
        let h = 512;
        let w = 512;
        let viewBoxBits = svg.match(/viewBox="([^"]*)"/);
        if(viewBoxBits != null) {
            let pieces = viewBoxBits[1].split(" ");
            h = +pieces[3];
            w = +pieces[2];
        }
        let r = w / h;
        let angleRad = angleDegrees * Math.PI / 180;
        // Translate to center, rotate, offset to SVG top-left, scale
        graphics
            .translateTransform(center.x, center.y)
            .rotateTransform(angleRad)
            .translateTransform(-svgHeight * 0.5 * r, -svgHeight * 0.5)
            .scaleTransform(1.0 / h * svgHeight)
            .svg(svg)
            .stroke(strokeObject)
            .resetTransform()
        graphics
            .translateTransform(center.x, center.y)
            .rotateTransform(angleRad)
            .translateTransform(-svgHeight * 0.5 * r, -svgHeight * 0.5)
            .scaleTransform(1.0 / h * svgHeight)
            .svg(svg)
            .fill(fillObject)
            .resetTransform()
    }

    // A thought the user is currently interacting with — hovered, or the source of a
    // hovered/dragged gate. Its gates render on the interaction canvas (above panels and
    // the hover-clone) instead of the base gate canvas.
    private isInteractionThought(id: string): boolean {
        // A thought can exist both in the Plex and in an accessory panel with the same id.
        // When the hover is on the accessory instance (hoveredListRep), the Plex rep is NOT
        // the hovered one — the hovered-list-rep block draws the accessory instance instead,
        // so the Plex rep must keep its normal (base-canvas) gates.
        if(this.hoveredListRep && this.hoveredListRep.id === id) {
            return false;
        }
        return id === this.hoveredThoughtId || id === this.hoveredGateThtId;
    }

    // @ts-ignore
    drawGates(graphics: PIXI.Graphics) {
        plexAnimator.thtReps.forEach((thtRep) => {
            // Chevron is drawn not based on hover state. Route the hovered thought's chevron
            // to the interaction canvas (above the hover-clone) so it stays visible, matching
            // its gates.
            if(plexAnimator.layout == LayoutType.Outline || plexAnimator.layout == LayoutType.Mindmap) {
                const chevronGraphics = this.isInteractionThought(thtRep.id) ? this.graphicsInteraction : this.graphicsTop;
                this.drawControl(chevronGraphics, thtRep, ThoughtControl.Chevron, false); // TODO deal with is highlighted
            }

            // avoid drawing gates on tiny related thoughts in Normal +1 layout
            if(thtRep.thtEl.classList.contains("related-thought")) {
                return;
            }

            // in mind map, only show gates for hovered thought, if any
            if(plexAnimator.layout == LayoutType.Mindmap) {
                let isValid = false;
                if(this.hoveredThoughtId != null && thtRep.id == this.hoveredThoughtId) {
                    isValid = true;
                }
                if(this.hoveredGateThtId != null && thtRep.id == this.hoveredGateThtId) {
                    isValid = true;
                }
                if(thtRep.zone == "parent" || thtRep.zone == "jump") {
                    isValid = false;
                }
                if(!isValid) {
                    return;
                }
            }

            const isActiveThought = thtRep.id == plexAnimator.node?.id;
            // The hovered thought's gates render on the interaction canvas (above the
            // accessory panels and the hover-clone); all other gates stay on the base
            // canvas (below the panels).
            const g = this.isInteractionThought(thtRep.id) ? this.graphicsInteraction : graphics;
            let color;
            let gate;
            let opacity = getComputedStyle(thtRep.thtEl).opacity;
            let opacityNum = +opacity;

            // use opacity to scale gate
            let rad = plexAnimator.rowHeight / 28.0 * plexAnimator.GATE_SIZE * opacityNum;

            // child
            // For active thought in mindmap, draw two child gates (left and right)
            if(plexAnimator.layout == LayoutType.Mindmap && isActiveThought) {
                // Left child gate
                gate = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'left');
                color = plexAnimator.colors.gateNormal;
                if(thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted
                }
                if(thtRep.childGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({color:color, alpha:opacity});
                } else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({width:1, color:color, alpha:opacity});
                }

                // Right child gate
                gate = this.getGateLocationFromThoughtRep(thtRep, Relation.Child, 'right');
                color = plexAnimator.colors.gateNormal;
                if(thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted
                }
                if(thtRep.childGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({color:color, alpha:opacity});
                } else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({width:1, color:color, alpha:opacity});
                }
            } else {
                // Non-active thoughts: single child gate
                gate = this.getGateLocationFromThoughtRep(thtRep, Relation.Child);
                color = plexAnimator.colors.gateNormal;
                if(thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted
                }
                if(thtRep.childGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({color:color, alpha:opacity});
                } else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({width:1, color:color, alpha:opacity});
                }
            }
            // parent
            gate = this.getGateLocationFromThoughtRep(thtRep, 2);
            color = plexAnimator.colors.gateNormal;
            if(thtRep.parentGate === GateStatus.More) {
                color = plexAnimator.colors.gateHighlighted
            }
            if(thtRep.parentGate !== GateStatus.Empty) {
                g.circle(gate.x, gate.y, rad)
                    .fill({color:color, alpha:opacity});
            } else {
                g.circle(gate.x, gate.y, rad)
                    .stroke({width:1, color:color, alpha:opacity});
            }
            // jump
            if(plexAnimator.layout != LayoutType.Mindmap || isActiveThought) {
                gate = this.getGateLocationFromThoughtRep(thtRep, 3);
                color = plexAnimator.colors.gateNormal;
                if(thtRep.jumpGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted
                }
                if(thtRep.jumpGate !== GateStatus.Empty) {
                    g.circle(gate.x, gate.y, rad)
                        .fill({color:color, alpha:opacity});
                } else {
                    g.circle(gate.x, gate.y, rad)
                        .stroke({width:1, color:color, alpha:opacity});
                }
            }

            // possibly draw hovered gate highlight circle (only for the actually-hovered
            // instance — isInteractionThought excludes a Plex rep whose accessory twin is hovered)
            if(this.hoveredGateThtId && thtRep.id === this.hoveredGateThtId && this.hoveredGateRelation
               && this.isInteractionThought(thtRep.id)) {
                gate = this.getGateLocationFromThoughtRep(thtRep, this.hoveredGateRelation, this.hoveredGateChildSide);
                g.circle(gate.x, gate.y, rad * 2.0)
                    .stroke({width:2, color:plexAnimator.colors.gateHighlighted, alpha:opacity});
            }
        });

        // Draw gates for hovered list rep only (Pinned/Past), regardless of whether also in Plex
        if(this.hoveredListRep != null) {
            const thtRep = this.hoveredListRep;
            if(thtRep) {
                const isActiveThought = thtRep.id == plexAnimator.node?.id;
                // Lists are not "tiny related" thoughts, so always draw
                let color;
                let gate;
                // Lists don't fade their items; use full opacity scale
                let listOpacity = 1.0;
                let listRad = plexAnimator.rowHeight / 28.0 * plexAnimator.GATE_SIZE * listOpacity;

                // child
                let rect = DomUtils.getRect(thtRep.thtEl, this.field);
                gate = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, Relation.Child, false);
                color = plexAnimator.colors.gateNormal;
                if(thtRep.childGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted
                }
                if(thtRep.childGate !== GateStatus.Empty) {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .fill({color:color, alpha:listOpacity});
                } else {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .stroke({width:1, color:color, alpha:listOpacity});
                }
                // parent
                gate = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, Relation.Parent, false);
                color = plexAnimator.colors.gateNormal;
                if(thtRep.parentGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted
                }
                if(thtRep.parentGate !== GateStatus.Empty) {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .fill({color:color, alpha:listOpacity});
                } else {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .stroke({width:1, color:color, alpha:listOpacity});
                }
                // jump (default to non-jump horizontal side)
                gate = this.getGateLocationFromRectAndThoughtRep(rect, thtRep, Relation.Jump, false);
                color = plexAnimator.colors.gateNormal;
                if(thtRep.jumpGate === GateStatus.More) {
                    color = plexAnimator.colors.gateHighlighted
                }
                if(thtRep.jumpGate !== GateStatus.Empty) {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .fill({color:color, alpha:listOpacity});
                } else {
                    this.graphicsInteraction.circle(gate.x, gate.y, listRad)
                        .stroke({width:1, color:color, alpha:listOpacity});
                }
            }
        }

        // Possibly draw hovered gate highlight for the hovered list rep (Pinned/Past)
        if(this.hoveredGateThtId && this.hoveredListRep && this.hoveredListRep.id === this.hoveredGateThtId) {
            const rep = this.hoveredListRep;
            let rect = DomUtils.getRect(rep.thtEl, this.field);
            let gate = this.getGateLocationFromRectAndThoughtRep(rect, rep, this.hoveredGateRelation, false);
            let listRad = plexAnimator.rowHeight / 28.0 * plexAnimator.GATE_SIZE;
            this.graphicsInteraction.circle(gate.x, gate.y, listRad * 2.0)
                .stroke({width:2, color:plexAnimator.colors.gateHighlighted, alpha:1.0});
        }
    }

    private getRepForThoughtIdNearestToPoint(id: string, fieldPoint: Point): ThoughtRep | undefined {
        let candidates: ThoughtRep[] = [];
        const plexRep = plexAnimator.thtReps.get(id);
        if(plexRep) candidates.push(plexRep);
        const pinned = plexAnimator.pinnedListLayout?.getRep(id);
        if(pinned) candidates.push(pinned);
        const past = plexAnimator.pastListLayout?.getRep(id);
        if(past) candidates.push(past);
        const selected = plexAnimator.selectedListLayout?.getRep(id);
        if(selected) candidates.push(selected);
        if(candidates.length === 0) return undefined;
        let best: ThoughtRep | undefined = undefined;
        let bestDist = Number.MAX_VALUE;
        for(const rep of candidates) {
            const rect = DomUtils.getRect(rep.thtEl, this.field);
            const cen = rect.getCenter();
            const dx = cen.x - fieldPoint.x;
            const dy = cen.y - fieldPoint.y;
            const d2 = dx*dx + dy*dy;
            if(d2 < bestDist) {
                bestDist = d2;
                best = rep;
            }
        }
        return best;
    }

    getGateLocation(element: HTMLElement, gateType: Relation, thtRepAlign: ThoughtHorizontalAlignment, isGateBEastOfA: boolean, isListRep: boolean, isActiveThought: boolean, childGateSide?: 'left' | 'right', zone: "parent" | "jump" | "child" | "sibling" | null = null): Point {
        let rect = DomUtils.getRect(element, this.field);
        let opacity = getComputedStyle(element).opacity;
        let opacityNum = +opacity;
        return this.getGateLocationFromRect(opacityNum, rect, gateType, plexAnimator.nodeJumpsIds.has(element.id.substring(4, 40)), thtRepAlign, isGateBEastOfA, isListRep, isActiveThought, childGateSide, zone);
    }
    
    getGateLocationFromRect(animScale: number, rect: Rect, gateType: Relation, isJump: boolean, align: ThoughtHorizontalAlignment, isGateBEastOfA: boolean, isListRep: boolean, isActiveThought: boolean, childGateSide?: 'left' | 'right', zone: "parent" | "jump" | "child" | "sibling" | null = null): Point {
        let cen = rect.getCenter();
        // use the height of the thought to determine the X distance for gates to be apart. Yes, y-height to get x.
        // h / 2.0 --> 45 degrees
        // h / (2.0 * sqrt(3)) --> 30 degrees
        
        let dx = rect.height / 3.464 * animScale;
        // For list reps and normal-layout active thought, use single-line row height for X gate
        // offset so that a multi-line thought doesn't push gates outward as the row grows taller.
        if (isListRep) {
            dx = plexAnimator.rowHeight / 3.464 * animScale;
        } else if (plexAnimator.layout == LayoutType.Normal && isActiveThought) {
            dx = plexAnimator.rowHeight / 3.464 * animScale;
        }
        if(plexAnimator.layout == LayoutType.Mindmap && !isListRep) {
            if(zone === "parent") {
                if(gateType == Relation.Child) {
                    cen.y += rect.height / 2;
                    return cen;
                }
            }
            if(zone === "jump") {
                if(gateType == Relation.Jump) {
                    cen.y -= rect.height / 2;
                    return cen;
                }
            }
            if(gateType === Relation.Parent && isActiveThought) {
                cen.y -= rect.height / 2;
            } else if(gateType === Relation.Parent) {
                if(align == ThoughtHorizontalAlignment.Right) {
                    // for thoughts on left of screen, jump gates are on the right
                    cen.x += rect.width / 2;
                } else {
                    // for thoughts on right of screen, jump gates are on the left
                    cen.x -= rect.width / 2;
                }
            } else if(gateType === Relation.Child) {
                // For active thought in mindmap, support left/right child gates
                if(isActiveThought && childGateSide) {
                    if(childGateSide === 'left') {
                        cen.x -= rect.width / 2;
                    } else {
                        cen.x += rect.width / 2;
                    }
                } else {
                    // Non-active thoughts: single child gate based on alignment
                    if(align == ThoughtHorizontalAlignment.Right) {
                        // for thoughts on left of screen, child gates are on the left
                        cen.x -= rect.width / 2;
                    } else {
                        // for thoughts on right of screen, child gates are on the right
                        cen.x += rect.width / 2;
                    }
                }
            } else if(gateType === Relation.Jump) {
                cen.y += rect.height / 2;
            }
        } else if(gateType === Relation.Jump) {
            if(isJump) {
                cen.x += rect.width / 2;
            } else {
                cen.x -= rect.width / 2;
            }
        } else if(gateType === Relation.Child) {
            cen.y += rect.height / 2;
            if(align === ThoughtHorizontalAlignment.Center) {
                cen.x += dx;
            } else if(align === ThoughtHorizontalAlignment.Left) {
                cen.x = rect.x + 3.5 * dx;
            } else if(align === ThoughtHorizontalAlignment.Right) {
                cen.x = rect.right() - 1.5 * dx;
            }
        } else if(gateType === Relation.Parent) {
            cen.y -= rect.height / 2;
            if(align === ThoughtHorizontalAlignment.Center) {
                cen.x -= dx;
            } else if(align === ThoughtHorizontalAlignment.Left) {
                cen.x = rect.x + 1.5 * dx;
            } else if(align === ThoughtHorizontalAlignment.Right) {
                cen.x = rect.right() - 3.5 * dx;
            }
        }
        return cen;
    }

    // Convenience method that extracts common parameters from thtRep
    getGateLocationFromThoughtRep(thtRep: ThoughtRep, gateType: Relation, childGateSide?: 'left' | 'right'): Point {
        const isActiveThought = thtRep.id == plexAnimator.node?.id;
        return this.getGateLocation(thtRep.thtEl, gateType, thtRep.alignment, this.IGNORED, thtRep.isListRep, isActiveThought, childGateSide);
    }

    // Convenience method for when rect is already computed
    getGateLocationFromRectAndThoughtRep(rect: Rect, thtRep: ThoughtRep, gateType: Relation, isJump: boolean, childGateSide?: 'left' | 'right'): Point {
        const isActiveThought = thtRep.id == plexAnimator.node?.id;
        return this.getGateLocationFromRect(1.0, rect, gateType, isJump, thtRep.alignment, this.IGNORED, thtRep.isListRep, isActiveThought, childGateSide, thtRep.zone);
    }

    // Convenience method for drawing links between two thought reps
    getGateLocationFromRectAndThoughtRepForLink(rect: Rect, thtRep: ThoughtRep, gateType: Relation, isJump: boolean, isGateBEastOfA: boolean, childGateSide?: 'left' | 'right'): Point {
        const isActiveThought = thtRep.id == plexAnimator.node?.id;
        // Use actual content width if available for non-leaf thoughts in mindmap layout
        if (thtRep.actualContentWidth && plexAnimator.layout === LayoutType.Mindmap && !isActiveThought) {
            const adjustedRect = new Rect(rect.x, rect.y, thtRep.actualContentWidth, rect.height);
            return this.getGateLocationFromRect(1.0, adjustedRect, gateType, isJump, thtRep.alignment, isGateBEastOfA, thtRep.isListRep, isActiveThought, childGateSide, thtRep.zone);
        }
        return this.getGateLocationFromRect(1.0, rect, gateType, isJump, thtRep.alignment, isGateBEastOfA, thtRep.isListRep, isActiveThought, childGateSide, thtRep.zone);
    }

    getControlLocation(thtRep: ThoughtRep, control: ThoughtControl): Point {
        let element = thtRep.thtEl;
        let rect = DomUtils.getRect(element, this.field);
        let cen = rect.getCenter();
        if(control === ThoughtControl.Expand) {
            cen.x -= plexAnimator.CONTROL_OFFSET + plexAnimator.CONTROL_SIZE * 2;
            cen.y -= rect.height * 0.3 + plexAnimator.CONTROL_SIZE / 2;
        } else if(control === ThoughtControl.Collapse) {
            cen.x -= plexAnimator.CONTROL_OFFSET + plexAnimator.CONTROL_SIZE;
            cen.y -= rect.height * 0.3 + plexAnimator.CONTROL_SIZE / 2;
        } else if(control === ThoughtControl.Anchor) {
            cen.x -= plexAnimator.CONTROL_OFFSET;
            cen.y -= rect.height * 0.3 + plexAnimator.CONTROL_SIZE / 2;
        } else if(control === ThoughtControl.Chevron) {
            return this.getChevronLocation(element, thtRep.alignment);
        }
        return cen;
    }
    
    private onContextMenu(event: MouseEvent) {
        event.preventDefault();
        // Read pressedObjectType before clearing it, since the context menu may prevent
        // pointerup from firing, which would leave pressedObjectType stuck (e.g. as
        // ThoughtGate, freezing gate/link rendering via onMouseMove's early return).
        let objectType = this.pressedObjectType;
        this.pressedObjectType = PlexObjectType.Nothing;
        if(!this.hasDragExceededClickDistance) {
            let cursorPoint = new Point(event.clientX, event.clientY);
            if(objectType == PlexObjectType.Background){
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForPlex", [cursorPoint]);
            } else if(objectType == PlexObjectType.Thought){
                const g = plexAnimator.layout == LayoutType.Outline && this.hoveredThoughtId
                    ? this.outlineGroupOf.get(this.hoveredThoughtId) : null;
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThought", [cursorPoint, this.hoveredThoughtId, g?.parentId ?? "", g?.relationType ?? ""]);
            } else if(objectType == PlexObjectType.ThoughtGate && this.hoveredGateThtId){
                const g = plexAnimator.layout == LayoutType.Outline
                    ? this.outlineGroupOf.get(this.hoveredGateThtId) : null;
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThought", [cursorPoint, this.hoveredGateThtId, g?.parentId ?? "", g?.relationType ?? ""]);
            } else if(objectType == PlexObjectType.Link && this.hoveredLinkId) {
                this.willChangeSelectedLinks();
                this.selectedLinkIds.clear();
                this.selectedLinkIds.add(this.hoveredLinkId);
                this.didChangeSelectedLinks(false);
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForLink", [cursorPoint, this.hoveredLinkId]);
            } else if(objectType == PlexObjectType.ThoughtIcon && this.hoveredThoughtIconId) {
                let thtIconId = this.hoveredThoughtIconId;
                this.hoveredThoughtIconId = undefined;
                this.hoveredThoughtIconIdChanged(undefined, thtIconId);
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForThoughtIcon", [cursorPoint, thtIconId]);
            } else if(objectType == PlexObjectType.ThoughtDecorator
                      && this.hoveredDecorationThtId
                      && this.hoveredDecorationType === "tag") {
                safeInvoke(plexAnimator.dotNetHelper, "ShowContextMenuForTag", [cursorPoint, this.hoveredDecorationThtId, this.hoveredDecorationId]);
            }
        }
    }
}

export const plexCanvas: PlexCanvas = new PlexCanvas();
