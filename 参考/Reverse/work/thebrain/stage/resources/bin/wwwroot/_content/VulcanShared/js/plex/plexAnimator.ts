// @ts-ignore
import {Collider, CubicCollider, LineCollider, PI, Point, Rect} from "/_content/Venus/js/dist/geometry.js"
// @ts-ignore
import {DomUtils} from "/_content/Venus/js/dist/domUtils.js"
import {safeInvoke} from "../interop.js";

import {PlexAccessory} from "./plexAccessory.js";
import {ListLayout} from "./listLayout.js";
import {Backimator} from "./backimator.js";
import {ForceLayout, LinkData} from "./forceLayout.js";
import {plexCanvas} from "./plexCanvas.js";
import {ThoughtRep} from "./thoughtRep.js";
import {LinkRep} from "./linkRep.js";
import {Scrollbar} from "./scrollbar.js";
import {IndicatorList} from "./indicator.js";
import {GateStatus, LayoutType, ThoughtExpandDirection, ThoughtHorizontalAlignment} from "./enums.js";
import {LayoutNode} from "./layoutNode.js";
import {BaseLayout, syncThoughtFontStyling} from "./baseLayout.js";
import {NormalLayout} from "./normalLayout.js";
import {OutlineLayout} from "./outlineLayout.js";
import {MindmapLayout} from "./mindmapLayout.js";
import {PlexConnector} from "./plexConnector.js";
import {OneZoneRange, ZoneRanges} from "./zoneRanges.js";
import {Relation} from "./core.js";

export class PlexAnimator implements PlexConnector {

    // blazor puts elements onto the deck, which is hidden
    // we clone these nodes and put the clones into the field, which is visible
    // by doing this we maintain complete control over when things become visible and where they are
    // enabling animation via JS/CSS while still getting fed DOM elements via blazor

    // thought elements go through three phases
    //
    // new - id is the thought id (as set via PlexControl)
    // * on deck and about to be presented - children of the deck element
    //
    // cur - id has -cur suffix
    // * put into the field at the position of the old and moved via css animation to their correct position
    //
    // old - id has -old suffix
    // * when new elements arrive, all cur elements are marked as old and are either immediately replaced
    //   or animate to nothing. removed when animation ends or if they still exist at start

    dotNetHelper: any;
    deck!: HTMLElement;
    field!: HTMLElement;
    expandDeck!: HTMLElement;

    backimator!: Backimator;

    // Wallpaper crossfade state
    private _wallpaperOverlay: HTMLElement | null = null;
    private _wallpaperCrossfadeId: number = 0;

    focusedId: string = "";
    focusedUsingKeyboardNav: boolean = false;
    activeId: string | undefined;
    isTouchDevice: boolean = false;
    isPhone: boolean = false;
    lastActiveId: string | undefined;
    lastActiveDestX: number | undefined;
    lastActiveDestY: number | undefined;
    
    lastActivateClickTime: number = 0;

    lastBackgroundDragX: number = 0;
    lastBackgroundDragY: number = 0;

    // Vertical center of the active thought in Normal/Normal+1 layouts, as a fraction
    // of field height (0..1). 0.45 = active thought sits 5% above the middle. Phones use
    // a default 10% (of field height) higher so more of the child zone is visible above
    // the on-screen content/search swipe area.
    private NORMAL_CENTER_DEFAULT = 0.45;
    private NORMAL_CENTER_DEFAULT_PHONE = 0.35;
    normalCenterRatio: number = this.NORMAL_CENTER_DEFAULT;
    private NORMAL_CENTER_MIN = 0.20;
    private NORMAL_CENTER_MAX = 0.70;

    thtReps = new Map<string, ThoughtRep>();
    thtRepsOld = new Map<string, ThoughtRep>();
    thtRepsNew = new Map<string, ThoughtRep>();
    
    linkReps = new Map<string, LinkRep>();
    linkRepsOld = new Map<string, LinkRep>();
    linkRepsNew = new Map<string, LinkRep>();

    linksInUse: Set<string> = new Set<string>();

    colors: { [key: string]: number } = {};
    pendingHighlightIds: Set<string> = new Set<string>();
    isReadOnly = false;
    zoneScrollbars: { [key: string]: Scrollbar | null} = {};
    scrollRangesUpdateTimer: number = 0;
    requestExtraLinksResizeTimer: number = 0;
    
    outlineLayout: OutlineLayout = new OutlineLayout(this);
    mindmapLayout: MindmapLayout = new MindmapLayout(this);
    normalLayout: NormalLayout = new NormalLayout(this, false);
    normalPlusOneLayout: NormalLayout = new NormalLayout(this, true);
    currentLayout: BaseLayout = this.normalLayout;

    layout: LayoutType = LayoutType.Undefined;
    isStraightLinksEnabled = false; // must match the C# default in BrainSettings.StraightLinks
    isBackimatorEnabled = false;

    private _plexAccessory: PlexAccessory | undefined;
    get plexAccessory(): PlexAccessory {
        if(!this._plexAccessory) {
            this._plexAccessory = new PlexAccessory();
        }
        return this._plexAccessory;
    }

    thoughtIdSet: Set<string> = new Set<string>();
    
    animationTime = 0.75;
    // height in pixels
    rowHeight = 0; // needs to be set by caller
    initialRowHeight = 0; // stored when start() is called so we can adjust actual rowHeight based on width

    SCROLL_ANIMATION_TIME = 0.15;
    ICON_FADE_ANIMATION_TIME = 0.25;
    ICON_ZOOM_ANIMATION_TIME = 0.25;
    // Tag labels wrap to multiple lines past this width
    TAG_LABEL_MAX_WIDTH = '100px';
    ICON_ZOOM_DELAY_TIME = 0.25;
    MIN_TIME_BETWEEN_SCROLL = 0.3;
    PAGING_REPEAT_TIME = 0.2;
    PAGING_MIN = 0.05;
    COL_WIDTH = 200;
    // Minimum column width (in px) for Normal layout column calculation.
    // Configurable from C# via setMinColumnWidth()
    minColumnWidth: number = 240;
    // Row spacing multiplier (1.0 = default rowHeight); controlled by setThoughtSpacing(percent)
    thoughtSpacing: number = 1.0;

    GATE_SIZE = 3.5;
    GATE_OFFSET = 10;
    FORCE_LAYOUT_INTERACTION_DELAY = 0.3;
    FORCE_LAYOUT_LINK_LABELS_DELAY = 0.1;

    CONTROL_OFFSET = 30;
    CONTROL_SIZE = 15;

    LARGE_ICON_SIZE = 2048;

    // Tag label visibility mode: 'icons' = icons only, 'hover' = show labels on hover, 'always' = always show labels
    private tagTextVisibilityMode: 'icons' | 'hover' | 'always' = 'always';

    // Tag icon visibility mode mirrors text setting but for the icon itself
    private tagIconVisibilityMode: 'never' | 'hover' | 'always' = 'always';

    // Multiplier (percent) applied to indicator icon/label size (tags, notes, events, private), on top of
    // the row-height-derived size. 100 = unchanged. Independent of the thought Text Scale setting.
    private tagScalePercent: number = 100;

    // NOTE: this number must match the appropriate width for the responsive tailwind selector "sm:" or "md:" used
    // in the code in ThoughtContentControl.cs -->    sm:text-[@(GetFontSizePercent(...
    SM_BREAKPOINT_WIDTH = 640;

    forceLayout: ForceLayout = new ForceLayout((id) => {
        return this.getInitialNodePointForForceLayout(id);
    }, this.COL_WIDTH, this.rowHeight);

    lastNormalLayoutThoughtPoints: { [key: string]: Point} = {};

    // ResizeObserver to detect container size changes (e.g., splitter moves)
    private resizeObserver: ResizeObserver | undefined;

    constructor() {
        this.thoughtIdSet = new Set<string>();
        window.addEventListener("resize", (e) => { this.onResize(); });
    }

    // called from blazor
    setTagTextVisibility(mode: string) {
        const m = (mode || '').toLowerCase();
        if(m === 'donotshow' || m === 'icons') {
            this.tagTextVisibilityMode  = 'icons';
        } else if(m === 'showonhover' || m === 'hover') {
            this.tagTextVisibilityMode  = 'hover';
        } else if(m === 'alwaysshow' || m === 'always') {
            this.tagTextVisibilityMode  = 'always';
        }
    }

    setTagIconVisibility(mode: string) {
        const m = (mode || '').toLowerCase();
        if(m === 'donotshow' || m === 'never') {
            this.tagIconVisibilityMode = 'never';
        } else if(m === 'showonhover' || m === 'hover') {
            this.tagIconVisibilityMode = 'hover';
        } else if(m === 'alwaysshow' || m === 'always') {
            this.tagIconVisibilityMode = 'always';
        }
    }

    setTagScale(percent: number) {
        const p = Number(percent);
        if(!isFinite(p) || p <= 0) {
            return;
        }
        this.tagScalePercent = p;
    }

    onResize() {
        const plexContainer = document.getElementById("plexContainer");
        if(!plexContainer || plexContainer.classList.contains("plex-none")) {
            // plex is hidden or collapsing, skip expensive resize work
            return;
        }

        plexCanvas.queueResize();
        if(!this.field) {
            return;
        }

        try {
            // keep list layouts in sync on resize
            this.pinnedListLayout?.sync();
            this.pastListLayout?.sync();
            this.selectedListLayout?.sync();

            if(this.layout == LayoutType.Force) {
                let fieldRect = this.field.getBoundingClientRect();
                this.forceLayout.setArea(new Rect(0, 0, fieldRect.width, fieldRect.height));
            }
            else {
                // NOTE: when notes editor enters edit mode and leaves it, some hidden after-scroll thoughts are showing up that need to stay away
                this.setThoughtElementTransitionTimes(0);
                this.initThoughtReps();

                this.ensureRowHeight();
                this.moveWrapper();
                this.clampPanToViewport();

                if(this.requestExtraLinksResizeTimer != 0) {
                    clearTimeout(this.requestExtraLinksResizeTimer);
                }
                this.requestExtraLinksResizeTimer = setTimeout(() => {
                    this.requestExtraLinksResizeTimer = 0;
                    this.requestExtraLinks();
                }, 250);
                this.disappearOld();
                this.hideOffscreen();
                let thtElements = this.field.querySelectorAll(".tht.off");
                thtElements.forEach((thtEl_) => {
                    let thtEl = thtEl_ as HTMLElement;
                    thtEl.remove();
                });

                // Fix for DEKU-1211: Hide cur elements that weren't laid out during resize
                // These are thoughts that no longer fit but are still .tht.cur (not .tht.old or .tht.off)
                // We hide them rather than remove them so they can reappear when the container grows back
                let curElements = this.field.querySelectorAll(".tht.cur") as NodeListOf<HTMLElement>;
                curElements.forEach((thtEl) => {
                    let thtId = thtEl.id.substring(4, thtEl.id.length - 4);
                    if(!this.thoughtIdSet.has(thtId)) {
                        // This thought wasn't laid out, so hide it to prevent hover interactions
                        // Use display:none and pointer-events:none to fully disable interactions
                        // Only warn if thought is in a zone with NO scrollbar (should fit)
                        let isChildNoScroll = this.nodeChildrenIds.has(thtId) && !this.zoneScrollbars["child"];
                        let isParentNoScroll = this.nodeParentsIds.has(thtId) && !this.zoneScrollbars["parent"];
                        let isJumpNoScroll = this.nodeJumpsIds.has(thtId) && !this.zoneScrollbars["jump"];
                        let isSiblingNoScroll = this.nodeSiblingsIds.has(thtId) && !this.zoneScrollbars["sibling"];
                        if(isChildNoScroll || isParentNoScroll || isJumpNoScroll || isSiblingNoScroll) {
                            console.warn("[PLEX-BUG] onResize hiding a thought that should be visible (no scrollbar)!", thtId, "thoughtIdSet size:", this.thoughtIdSet.size);
                        }
                        thtEl.style.display = "none";
                        thtEl.style.pointerEvents = "none";
                        thtEl.classList.add("overflow-hidden-resize");
                    }
                });

                // Check if geometry changed and invalidate caches if so
                const currentSignature = this.getGeometrySignature();
                if (this.lastGeometrySignature !== "" && currentSignature !== this.lastGeometrySignature) {
                    this.clearZoneCaches();
                    safeInvoke(this.dotNetHelper, "InvalidateZoneRangesAndRefresh");
                }
                this.lastGeometrySignature = currentSignature;

                plexCanvas.clearLinkColliders();
            }
        } catch (e) {
            // Ignore errors when plex elements are not fully available during resize
        }
    }

    moveWrapper() {
        this.thoughtIdSet.clear();
        this.currentLayout.moveCurToNewPositions("all", false, this.lastBackgroundDragX, this.lastBackgroundDragY);
    }

    // called from blazor
    pinnedListLayout: ListLayout | undefined = undefined;
    pastListLayout: ListLayout | undefined = undefined;
    selectedListLayout: ListLayout | undefined = undefined;

    public initPastThoughtsList() {
        this.plexAccessory.initPastThoughtsList();
        if(!this.pastListLayout) {
            this.pastListLayout = new ListLayout('.past-thoughts-list');
        }
        this.pastListLayout.sync();
        // Ensure Plex canvas keeps animating while scrolling or wheeling the list
        plexCanvas.setupListScrollListeners();
    }
    
    public initPinnedThoughtsList() {
        // Pass dotNetHelper so accessory code can call back into C#, plus styling values
        this.plexAccessory.initPinnedThoughtsList(
            this.dotNetHelper,
            this.colors.thoughtHighlightOutline ?? 0xffffff,
            this.GATE_SIZE,
            this.rowHeight
        );
        if(!this.pinnedListLayout) {
            this.pinnedListLayout = new ListLayout('.pinned-thoughts-list');
        }
        this.pinnedListLayout.sync();
        // Ensure Plex canvas keeps animating while scrolling or wheeling the list
        plexCanvas.setupListScrollListeners();
    }

    public initSelectedThoughtsList() {
        if(!this.selectedListLayout) {
            // Left alignment so all rows' parent/child gates line up vertically
            // (regardless of row width), matching how the outline layout positions
            // child gates.
            this.selectedListLayout = new ListLayout('.selected-thoughts-list', ThoughtHorizontalAlignment.Left);
        }
        this.selectedListLayout.sync();
        // Ensure Plex canvas keeps animating while scrolling or wheeling the list
        plexCanvas.setupListScrollListeners();
        // Wire up drag-to-reorder (vertical axis). setupListDragDrop is idempotent —
        // a per-(axis, callback) flag on documentElement guards repeated calls.
        this.plexAccessory.dotNetHelper = this.dotNetHelper;
        this.plexAccessory.setupListDragDrop(
            '.selected-thoughts-list',
            'y',
            'ReorderSelectedThoughts',
            this.colors.thoughtHighlightOutline ?? 0xffffff,
            this.GATE_SIZE,
            this.rowHeight,
            'left'
        );
    }

    public syncAccessoryLists() {
        this.pinnedListLayout?.sync();
        this.pastListLayout?.sync();
        this.selectedListLayout?.sync();
    }

    public resetPastThoughtsListScroll() {
        const container = document.querySelector('.past-thoughts-list') as HTMLElement | null;
        if(container) {
            container.scrollLeft = 0;
        }
        this.plexAccessory.ptlScrollAmount = 0;
    }

    public shrinkSelectedThoughtsListItemWidths() {
        plexCanvas.shrinkAccessoryListItemWidths('.selected-thoughts-list');
    }

    // Ask server for extra links that include any arbitrary set of thought ids
    public requestExtraLinksForIds(thtIds: string[]) {
        if(!this.activeId) return;
        safeInvoke(this.dotNetHelper, "RequestExtraLinks", [this.activeId, thtIds.join(",")]);
    }
    
    public getAnyThoughtRepById(id: string): ThoughtRep | undefined {
        let rep = this.thtReps.get(id);
        if(rep) return rep;
        rep = this.pinnedListLayout?.getRep(id);
        if(rep) return rep;
        rep = this.pastListLayout?.getRep(id);
        if(rep) return rep;
        rep = this.selectedListLayout?.getRep(id);
        return rep;
    }

    public getAllListReps(): ThoughtRep[] {
        const arr: ThoughtRep[] = [];
        if(this.pinnedListLayout) {
            this.pinnedListLayout.reps.forEach(r => arr.push(r));
        }
        if(this.pastListLayout) {
            this.pastListLayout.reps.forEach(r => arr.push(r));
        }
        if(this.selectedListLayout) {
            this.selectedListLayout.reps.forEach(r => arr.push(r));
        }
        return arr;
    }
    
    public startLinkingFromQuadrant(linkRelation: Relation, currTouchPoint: Point, thoughtId: string){ 
        plexCanvas.startLinkingFromQuadrant(linkRelation, currTouchPoint, thoughtId);
    }
    
    // Incremented on every init. cleanUp passes the generation its PlexControl got back from init,
    // so a late-arriving cleanUp from a disposed instance cannot tear down a newer instance's canvases.
    private initGeneration = 0;

    // called from blazor
    async init(dotNetHelper: any, backimatorSettings: object, isStraightLinksEnabled: boolean): Promise<number> {
        const generation = ++this.initGeneration;
        // Set before plexCanvas.init so the very first link frame uses the configured style
        this.isStraightLinksEnabled = isStraightLinksEnabled;
        this.dotNetHelper = dotNetHelper;
        // Also expose to accessory helpers that may need callbacks
        this.plexAccessory.dotNetHelper = dotNetHelper;
        this.deck = document.getElementById("deck") as HTMLElement;
        if(!this.deck) {
            throw new Error("Plex deck element with id 'deck' not found. DOM may not be ready yet.");
        }
        this.field = document.getElementById("field") as HTMLElement;
        if(!this.field) {
            throw new Error("Plex field element with id 'field' not found. DOM may not be ready yet.");
        }
        this.expandDeck = document.getElementById("expand-deck") as HTMLElement;

        this.backimator = new Backimator(backimatorSettings);
        if(this.isBackimatorEnabled) {
            this.backimator.start(this.field);
        }
        await plexCanvas.init(this.field);

        // Set up ResizeObserver on plexContainer to detect splitter-caused resizes.
        // Coalesce fires via requestAnimationFrame: during the plexContainer's CSS
        // height/width transition (~350ms) the observer fires every frame and previously
        // ran a full onResize each time, producing visible twitches when two layout passes
        // landed within a single visual frame. With rAF coalescing we collapse repeat fires
        // to at most one onResize per frame.
        const plexContainer = document.getElementById("plexContainer");
        if(plexContainer && !this.resizeObserver) {
            let resizeRafId: number | null = null;
            this.resizeObserver = new ResizeObserver(() => {
                if(resizeRafId !== null) return;
                resizeRafId = requestAnimationFrame(() => {
                    resizeRafId = null;
                    this.onResize();
                });
            });
            this.resizeObserver.observe(plexContainer);
        }

        return generation;
    }

    // called from blazor
    setIsStraightLinksEnabled(isStraightLinksEnabled: boolean) {
        this.isStraightLinksEnabled = isStraightLinksEnabled;
        plexCanvas.clearLinkColliders();
    }

    // called from blazor
    setIsTouchDevice(isTouchDevice: boolean) {
        this.isTouchDevice = isTouchDevice;
    }

    // called from blazor
    setIsPhone(isPhone: boolean) {
        // Adopt the higher phone default only while the user hasn't manually panned (ratio
        // still at the desktop default), so re-initialization never clobbers a deliberate
        // two-finger pan.
        if(isPhone && this.normalCenterRatio === this.NORMAL_CENTER_DEFAULT) {
            this.normalCenterRatio = this.NORMAL_CENTER_DEFAULT_PHONE;
        }
        this.isPhone = isPhone;
    }

    // called from blazor
    setIsBackimatorEnabled(isBackimatorEnabled: boolean) {
        if(this.isBackimatorEnabled == isBackimatorEnabled) {
            return;
        }
        this.isBackimatorEnabled = isBackimatorEnabled;
        if(isBackimatorEnabled) {
            this.backimator.start(this.field);
        } else {
            this.backimator.cleanUp();
        }
    }

    // called from blazor
    setIsSearchUIShowing(isSearchUIShowing: boolean) {
        plexCanvas.setIsSearchUIShowing(isSearchUIShowing);
    }

    // called from blazor
    setIsDialogShowing(isDialogShowing: boolean) {
        plexCanvas.setIsDialogShowing(isDialogShowing);
    }

    // called from blazor when CreateThought dialog dismisses after empty-area gate drop
    endDragLinkPreview() {
        plexCanvas.endDragLinkPreview();
    }

    // called from blazor
    setMinColumnWidth(widthPx: number) {
        // Clamp to a reasonable range
        const clamped = Math.max(10, Math.min(600, Math.floor(widthPx)));
        if (this.minColumnWidth !== clamped) {
            this.minColumnWidth = clamped;
            // Re-layout with new column width
            this.onResize();
        }
    }

    // called from blazor
    setThoughtSpacing(percent: number) {
        // percent from 50..200 mapped to 0.5..2.0 multiplier
        const clampedPercent = Math.max(50, Math.min(200, Math.floor(percent)));
        const mult = clampedPercent / 100.0;
        if (Math.abs(this.thoughtSpacing - mult) > 0.001) {
            this.thoughtSpacing = mult;
            this.onResize();
        }
    }

    // called from blazor
    setListOverlayExpandsVertically(expandVertically: boolean) {
        plexCanvas.setListOverlayExpansionMode(expandVertically);
    }

    // called from blazor
    reinitializeBackimator(backimatorSettings: object){
        this.backimator.cleanUp();

        this.backimator = new Backimator(backimatorSettings);

        if(this.isBackimatorEnabled){
            this.backimator.start(this.field);
        }
    }

    // called from blazor
    setIsForceLayoutGatherEnabled(isForceLayoutGatherEnabled: boolean) {
        this.forceLayout.setIsGatherNodesEnabled(isForceLayoutGatherEnabled);
    }

    addLinkReps(links: LinkRep[]) {
        this.linkRepsOld = this.linkRepsNew;
        // linkRepsNew = links
        this.linkRepsNew = new Map<string, LinkRep>();
        links.forEach((l) => {
            let linkRep = new LinkRep(l.id, l.idA, l.idB, l.relation, l.color, l.label, l.thickness, l.direction, l.meaning);
            this.linkRepsNew.set(linkRep.id, linkRep);
        });
        // linkReps = linkRepsOld + linkRepsNew
        this.linkReps.clear();
        for(const linkRep of this.linkRepsOld.values()) {
            this.linkReps.set(linkRep.id, linkRep);
        }
        for(const linkRep of this.linkRepsNew.values()) {
            this.linkReps.set(linkRep.id, linkRep);
        }
        this.logInfo("addLinkReps -- linkRepsNew:", this.linkRepsNew.size, " linkRepsOld:", this.linkRepsOld.size, " linkReps:", this.linkReps.size);
    }

    // called from blazor when links are deleted (link eviction with Delete=true).
    // Extra/cross-links are pushed in via showExtraLinks and added to linkReps without ever being
    // pruned, so a deleted link (e.g. between a displayed child and its grandparent, which never touches
    // the active thought) keeps getting drawn from linkReps until a full rebuild. Remove them explicitly
    // from every link map so drawLinksAndSetupGates stops drawing them, then redraw.
    removeLinks(linkIds: string[]) {
        if(!linkIds || linkIds.length == 0) {
            return;
        }
        let removedAny = false;
        linkIds.forEach((id) => {
            if(this.linkReps.delete(id)) {
                removedAny = true;
            }
            this.linkRepsNew.delete(id);
            this.linkRepsOld.delete(id);
            this.linksInUse.delete(id);
        });
        if(removedAny) {
            plexCanvas.animateBriefly();
        }
    }

    ensureRowHeight() {
        let rowHeight = this.initialRowHeight;
        if(window.innerWidth < this.SM_BREAKPOINT_WIDTH) {
            rowHeight *= 0.8;
        }
        this.rowHeight = rowHeight;
    }

    // called from blazor
    setSelectedThoughtIds(ids: string[]) {
        plexCanvas.selectedThoughtsChanging(true);
        plexCanvas.selectedThoughtIds = ids;
        plexCanvas.selectedThoughtsChanging(false);
        // Trigger layout recalculation when selection changes
        if (this.field) {
            this.onResize();
        }
    }

    // called from blazor
    setSelectedLinkIds(ids: string[] | null) {
        plexCanvas.setSelectedLinkIds(ids);
    }

    // called from blazor on dispose of PlexControl
    cleanUp(generation: number) {
        if(generation != this.initGeneration) {
            // A newer PlexControl has already initialized; tearing down now would destroy its canvases.
            return;
        }
        this.thtReps = new Map<string, ThoughtRep>();
        this.thtRepsOld = new Map<string, ThoughtRep>();
        this.thtRepsNew = new Map<string, ThoughtRep>();
        this.linkReps = new Map<string, LinkRep>();
        this.linkRepsNew = new Map<string, LinkRep>();
        this.linkRepsOld = new Map<string, LinkRep>();
        this.linksInUse = new Set<string>();
        this.thoughtIdSet = new Set<string>();

        // Clear state variables
        this.focusedId = "";
        this.activeId = undefined;
        this.lastActiveId = undefined;
        this.lastActiveDestX = undefined;
        this.lastActiveDestY = undefined;

        // Clear zone scrollbars
        for (const key in this.zoneScrollbars) {
            if (this.zoneScrollbars[key]) {
                this.zoneScrollbars[key] = null;
            }
        }

        console.warn("PlexAnimator cleaning up...");
        // Clear pending timers
        if(this.scrollRangesUpdateTimer != 0) {
            clearTimeout(this.scrollRangesUpdateTimer);
            this.scrollRangesUpdateTimer = 0;
        }
        // Disconnect ResizeObserver
        if(this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }
        plexCanvas.cleanUp();
        this.dotNetHelper = null;
    }
    isSelectionPanelVisible(): boolean {
        // Panel is hidden via `hidden sm:flex` below the sm breakpoint (640px), so it doesn't actually occupy space on phones.
        if(window.innerWidth < this.SM_BREAKPOINT_WIDTH) {
            return false;
        }
        return plexCanvas.selectedThoughtIds && plexCanvas.selectedThoughtIds.length > 0;
    }
    
    // Get the width of the selection panel (as a fraction of field width)
    getSelectionPanelWidth(): number {
        if (!this.isSelectionPanelVisible() || !this.field) {
            return 0;
        }
        // Selection panel takes clamp(10rem, 25%, 25rem) of the field width
        // (min-w-[10rem] w-1/4 max-w-[25rem] on SelectedThoughtsPanel)
        const remInPixels = 16; // default browser font size
        const minWidthInPixels = 10 * remInPixels; // 160px
        const maxWidthInPixels = 25 * remInPixels; // 400px
        const fieldRect = this.field.getBoundingClientRect();
        const fieldWidth = fieldRect.width;
        const twentyFivePercent = fieldWidth * 0.25;
        const actualWidth = Math.min(Math.max(twentyFivePercent, minWidthInPixels), maxWidthInPixels);
        return actualWidth / fieldWidth; // return as fraction of field width
    }
    
    node: LayoutNode | null = null;
    nodeChildrenIds: Set<string> = new Set<string>();
    nodeParentsIds: Set<string> = new Set<string>();
    nodeJumpsIds: Set<string> = new Set<string>();
    nodeSiblingsIds: Set<string> = new Set<string>();
    
    nodeParentsOf: Map<string, string[]> = new Map<string, string[]>();
    nodeChildrenOf: Map<string, string[]> = new Map<string, string[]>();
    nodeJumpsOf: Map<string, string[]> = new Map<string, string[]>();

    primaryLinks: Set<string> = new Set<string>();

    addPrimaryLink(thtIdA: string, thtIdB: string) {
        this.primaryLinks.add(thtIdA + "==>" + thtIdB);
        this.primaryLinks.add(thtIdB + "==>" + thtIdA);
    }
    
    isPrimaryLink(thtIdA: string, thtIdB: string): boolean {
        if(!this.primaryLinks || this.primaryLinks.size == 0) {
            // normal layout doesn't really use this method, but this method gets called and passed to
            // baseLayout.getCurvePoints and its overrides in outlineLayout and mindmapLayout
            return true;
        }
        return this.primaryLinks.has(thtIdA + "==>" + thtIdB); // no need to check the other direction since both are here
    }
    
    plexThoughtFontSize: number = -1337;
    lastGeometrySignature: string = "";

    relateThoughts(nodeList: LayoutNode[]) {
        nodeList.forEach((node) => {
            let thtId = node.id;
            node.children?.forEach((child) => {
                let childThtId = child.id;
                if (this.nodeChildrenOf.get(thtId) == null) {
                    this.nodeChildrenOf.set(thtId, []);
                }
                this.nodeChildrenOf.get(thtId)!.push(childThtId);
            });
            node.parents?.forEach((parent) => {
                let parentThtId = parent.id;
                if (this.nodeParentsOf.get(thtId) == null) {
                    this.nodeParentsOf.set(thtId, []);
                }
                this.nodeParentsOf.get(thtId)!.push(parentThtId);
            });
            node.jumps?.forEach((jump) => {
                let jumpThtId = jump.id;
                if (this.nodeJumpsOf.get(thtId) == null) {
                    this.nodeJumpsOf.set(thtId, []);
                }
                this.nodeJumpsOf.get(thtId)!.push(jumpThtId);
            });
        });
    }

    setSecondGenerationRelatedNodes() {
        this.nodeParentsOf.clear();
        this.nodeChildrenOf.clear();
        this.nodeJumpsOf.clear();

        if(this.node?.siblings) { this.relateThoughts(this.node?.siblings!); }
        if(this.node?.children) { this.relateThoughts(this.node?.children!); }
        if(this.node?.parents ) { this.relateThoughts(this.node?.parents!);  }
        if(this.node?.jumps   ) { this.relateThoughts(this.node?.jumps!);    }
    }
    
    debugMe(str: string) {
        this.logInfo("===");
        this.logInfo(str);
        let thtElements = this.field.querySelectorAll(".tht") as NodeListOf<HTMLElement>;
        let total = thtElements.length;
        let cur = Array.from(this.filterNodeList(thtElements,
            (thtEl: HTMLElement) => thtEl.classList.contains("cur"))).length;
        let old = Array.from(this.filterNodeList(thtElements,
            (thtEl: HTMLElement) => thtEl.classList.contains("old"))).length;
        this.logInfo("total: ", total, " cur: ", cur, " old: ", old);
    }
    
    logInfo(...args: any[]) {
        return; // turn the logging on and off
        let args2 = ["plexAnimator.logInfo - "].concat(args);
        console.info(...args2);
    }

    getGeometrySignature(): string {
        const fieldRect = this.field?.getBoundingClientRect();
        const w = Math.round(fieldRect?.width ?? 0);
        const h = Math.round(fieldRect?.height ?? 0);
        const sel = this.isSelectionPanelVisible() ? 1 : 0;
        return `${w}_${h}_${this.plexThoughtFontSize}_${sel}`;
    }

    parentZoneRangesCache = new Map<string, OneZoneRange>();
    childrenZoneRangesCache = new Map<string, OneZoneRange>();
    jumpsZoneRangesCache = new Map<string, OneZoneRange>();
    siblingZoneRangesCache = new Map<string, OneZoneRange>();

    private siblingCacheKey(node: LayoutNode | null): string {
        return (node?.parents?.map((n: LayoutNode) => n.id) || []).sort().join(",");
    }

    zoneRangesFromLayoutNode(node: LayoutNode, activeId: string): ZoneRanges {
        let siblingKey = this.siblingCacheKey(node);
        this.logInfo("zoneRanges currently cached? -- siblingKey: ", siblingKey, " activeId: ", activeId);
        let siblingRange: OneZoneRange = this.siblingZoneRangesCache.get(siblingKey) || new OneZoneRange(0, 0, 0);
        let childrenRange: OneZoneRange = this.childrenZoneRangesCache.get(activeId) || new OneZoneRange(0, 0, 0);
        let parentRange: OneZoneRange = this.parentZoneRangesCache.get(activeId) || new OneZoneRange(0, 0, 0);
        let jumpsRange: OneZoneRange = this.jumpsZoneRangesCache.get(activeId) || new OneZoneRange(0, 0, 0);
        let ret = new ZoneRanges(
            activeId,
            parentRange.start | 0, parentRange.end | 0, parentRange.count | 0,
            childrenRange.start | 0, childrenRange.end | 0, childrenRange.count | 0,
            siblingRange.start | 0, siblingRange.end | 0, siblingRange.count | 0,
            jumpsRange.start | 0, jumpsRange.end | 0, jumpsRange.count | 0
        );
        this.logInfo("  CACHED is this:", ret.toString());
        return ret;
    }
    
    clamp(value: number, min: number, max: number): number {
        if(value < min) {
            return min;
        } else if(value > max) {
            return max;
        }
        return value;
    }
    
    getOneZoneRangeForZone(zone: string): OneZoneRange {
        let one: OneZoneRange;
        let id = this.activeId || "";
        if(zone == "parent") {
            one = this.parentZoneRangesCache.get(id) || new OneZoneRange(0, 0, 0);
        } else if(zone == "child") {
            one = this.childrenZoneRangesCache.get(id) || new OneZoneRange(0, 0, 0);
        } else if(zone == "jump") {
            one = this.jumpsZoneRangesCache.get(id) || new OneZoneRange(0, 0, 0);
        } else if(zone == "sibling") {
            one = this.siblingZoneRangesCache.get(this.siblingCacheKey(this.node)) || new OneZoneRange(0, 0, 0);
        } else {
            throw new Error("Unknown zone for setZoneRangeForZone: " + zone);
        }
        return one;
    }
    
    setCountForZone(zone: string, count: number) {
        let one: OneZoneRange = this.getOneZoneRangeForZone(zone);
        // keep the count from the C# side
        this.setOneZoneRangeForZone(zone, new OneZoneRange(one.start, one.end, count));
    }
    
    public setZoneRangeForZone(zone: string, start: number, end: number) {
        let span = end - start;
        this.logInfo("sZR4Z: zone: "+zone+", span: "+ span);
        let one = this.getOneZoneRangeForZone(zone);
        // keep the count from the C# side
        this.setOneZoneRangeForZone(zone, new OneZoneRange(start, Math.min(end, one.count), one.count));
    }
    
    setOneZoneRangeForZone(zone: string, oneZoneRange: OneZoneRange) {
        let id = this.activeId || "";
        let siblingKey = this.siblingCacheKey(this.node);
        this.logInfo("SET ONE - zone:", zone, "siblingKey: ", siblingKey, " activeId: ", id);
        if(zone == "parent") {
            this.parentZoneRangesCache.set(id, oneZoneRange);
            this.logInfo("set zone range for parent:", oneZoneRange);
        } else if(zone == "child") {
            this.childrenZoneRangesCache.set(id, oneZoneRange);
            this.logInfo("set zone range for child:", oneZoneRange);
        } else if(zone == "jump") {
            this.jumpsZoneRangesCache.set(id, oneZoneRange);
            this.logInfo("set zone range for jump:", oneZoneRange);
        } else if(zone == "sibling") {
            this.siblingZoneRangesCache.set(siblingKey, oneZoneRange);
            this.logInfo("set zone range for sibling:", oneZoneRange);
        } else {
            throw new Error("Unknown zone for setZoneRangesForZone: " + zone);
        }
    }
    
    lastSiblingScrollDirection: number = 0;
    lastParentScrollDirection: number = 0;
    lastChildScrollDirection: number = 0;
    lastJumpScrollDirection: number = 0;
    
    lastRangesWerePerfectMatch: boolean = false;
    
    zrCachedOld: ZoneRanges | null = null;
    lastOrderedJobId: number = 0;
    
    isSwappingThoughtElements: boolean = false;
    private _swappingStartId: number = 0;
    
    clearZoneCaches() {
        this.zrCachedOld = null;
        this.jumpsZoneRangesCache = new Map<string, OneZoneRange>();
        this.parentZoneRangesCache = new Map<string, OneZoneRange>();
        this.siblingZoneRangesCache = new Map<string, OneZoneRange>();
        this.childrenZoneRangesCache = new Map<string, OneZoneRange>();
        // C# resets zone ranges to start=0 alongside this cache clear; reset scrollbar
        // thumbs too so the visual position doesn't desync from the rendered items.
        this.zoneScrollbars = {};
        Scrollbar.resetZoneStates();
    }

    // called from blazor
    start(orderedJobId: number, graph: any, isScrollEvent: boolean, zoneRanges: ZoneRanges, activeId: string, focusedId: string, itemFocusedUsingKeyboardNav: boolean, links: LinkRep[], layout: LayoutType, animationTime: number, colors: { [key: string]: number }, isReadOnly: boolean, rowHeight: number, fontSize: number) {

        if(this.lastActivateClickTime > 0) {
            const elapsed = performance.now() - this.lastActivateClickTime;
            if(elapsed > 1000) {
                console.warn(`[PERF] Slow click-to-start: ${elapsed.toFixed(0)}ms`);
            }
            this.lastActivateClickTime = 0;
        }

        this.logInfo("-=-=-\nSTART called with activeId:", activeId);
        if (orderedJobId == 0) {
            this.logInfo("orderedJobId is 0, to clearZoneCaches");
            this.clearZoneCaches();
        }
        if(orderedJobId && this.lastOrderedJobId > orderedJobId) {
            this.logInfo("BAILING because of an out of order Start job request:", this.lastOrderedJobId, " > ", orderedJobId);
            return;
        }
        if (orderedJobId) {
            this.lastOrderedJobId = orderedJobId;
        }

        if (isScrollEvent) {
            // reduce animation time for scroll events
            // make it animate 3 times faster
            animationTime *= 0.333;
        }

        // While we put thought elements into the deck, we are not swapping them out - setting this bogus link and gate locations from being drawn
        // Guard against overlapping start() calls clearing the flag prematurely
        this._swappingStartId++;
        const mySwappingId = this._swappingStartId;
        this.isSwappingThoughtElements = true;
        // Clear the flag one frame later so the browser processes CSS position changes before links
        // are drawn. start() is synchronous, so this callback cannot fire until the whole body has
        // finished - and registering it here (instead of at the end) guarantees the flag is cleared
        // even if something below throws, which would otherwise freeze the link canvas permanently.
        requestAnimationFrame(() => {
            // Only clear if no newer start() has begun (prevents premature clearing during rapid navigation)
            if (this._swappingStartId === mySwappingId) {
                this.isSwappingThoughtElements = false;
            }
        });

        this.plexThoughtFontSize = fontSize;
        if(this.activeId != activeId) {
            this.zoneScrollbars = {};
            Scrollbar.resetZoneStates();
        }
        this.lastActiveId = this.activeId;
        this.activeId = activeId;
        this.focusedId = focusedId;
        this.focusedUsingKeyboardNav = itemFocusedUsingKeyboardNav;
        this.primaryLinks = new Set<string>();

        let lastNode = this.node;
        this.currentLayout.prepareDisappearOld(lastNode);

        if(layout == LayoutType.Normal) {
            this.currentLayout = this.normalLayout;
        } else if(layout == LayoutType.NormalPlusOne) {
            this.currentLayout = this.normalPlusOneLayout;
        } else if(layout == LayoutType.Outline) {
            this.currentLayout = this.outlineLayout;
        } else if(layout == LayoutType.Mindmap) {
            this.currentLayout = this.mindmapLayout;
        }

        let node = LayoutNode.fromGraph(graph);
        this.node = node;
        this.nodeChildrenIds = new Set((node.children ?? []).map((n: LayoutNode) => n.id));
        this.nodeParentsIds = new Set((node.parents ?? []).map((n: LayoutNode) => n.id));
        this.nodeJumpsIds = new Set((node.jumps ?? []).map((n: LayoutNode) => n.id));
        this.nodeSiblingsIds = new Set((node.siblings ?? []).map((n: LayoutNode) => n.id));

        if(layout == LayoutType.Normal || layout == LayoutType.NormalPlusOne) {
            // Zone ranges can be Object not ZoneRanges, so we need to convert it first
            let zr = ZoneRanges.fromObject(zoneRanges);
            this.logInfo('JS Zone Ranges:', zr.toString());
            // check last ranges and see if they match or not, so we can know if we need to call back to C# SetNormalViewZoneRangesAndRelayout
            let zrCached = this.zoneRangesFromLayoutNode(node, activeId);
            this.zrCachedOld = zrCached; // store the old cached ranges so we can compare them later // ... ?
            this.lastRangesWerePerfectMatch = zr.equals(zrCached);
            if(!this.lastRangesWerePerfectMatch) {
                this.logInfo("------------------------------- Not a perfect match")
            }
            
            // store the ground truth of the count for each zone, from the C# side
            this.setCountForZone("parent", zr.parentCount);
            this.setCountForZone("child", zr.childCount);
            this.setCountForZone("jump", zr.jumpCount);
            this.setCountForZone("sibling", zr.siblingCount);

            // Diagnostic: detect mismatch between C# zone count and LayoutNode size
            const zones = [
                { name: "jump", count: zr.jumpCount, size: this.nodeJumpsIds.size },
                { name: "child", count: zr.childCount, size: this.nodeChildrenIds.size },
                { name: "parent", count: zr.parentCount, size: this.nodeParentsIds.size },
                { name: "sibling", count: zr.siblingCount, size: this.nodeSiblingsIds.size },
            ];
            for(const z of zones) {
                if(z.count < z.size) {
                    let msg = z.name + "Count mismatch: C# sent " + z.count + " but LayoutNode has " + z.size + ". zr: " + zr.toString();
                    console.error("[PLEX-DIAG] " + msg);
                    safeInvoke(this.dotNetHelper, "LogPlexDiagnostic", [msg]);
                }
            }
        } else {
            // for other layouts, we don't use zone ranges, so we just set them to empty
            this.lastRangesWerePerfectMatch = true;
        }
        
        this.setSecondGenerationRelatedNodes();
        
        // include active thought in count
        let thoughtCount = 1 + this.nodeChildrenIds.size + this.nodeParentsIds.size + this.nodeJumpsIds.size + this.nodeSiblingsIds.size;
        this.logInfo("start - Thought count: " + thoughtCount);
        
        let numberOfDivsOnDeck = this.deck.querySelectorAll(".tht").length;
        this.logInfo("start - Number of divs on deck: " + numberOfDivsOnDeck);

        // track which links are actually returned from the server so we can know which ones to delete
        this.linksInUse.clear();
        let linkIds: string[] = [];
        links.forEach(l => { 
            this.linksInUse.add(l.id); 
            linkIds.push(l.id);
        });

        this.addLinkReps(links);
        this.layout = layout;
        this.animationTime = animationTime;
        this.colors = colors;
        this.isReadOnly = isReadOnly;

        // Request metadata for the initial links (notes and attachments)
        // Not doing this for now as we will ask again after extra links are returned 
        // if(linkIds.length > 0) {
        //     this.dotNetHelper.invokeMethodAsync("RequestLinkMetadata", linkIds.join(","));
        // }

        this.initialRowHeight = rowHeight;
        this.ensureRowHeight();
        this.forceLayout.setRowHeight(this.rowHeight);

        this.debugMe("before removeOld");
        this.removeOld();
        this.debugMe("before marCurAndOffscreenAsOld");
        this.markCurAndOffscreenAsOld();
        this.debugMe("before cloneNewAndMarkAsCur");
        this.cloneNewAndMarkAsCur(this.deck);
        this.debugMe("before replaceOldWithCur");
        this.currentLayout.replaceOldWithCur();

        if(this.layout == LayoutType.Force) {
            this.setThoughtElementTransitionTimes(0);
        } else {
            this.setThoughtElementTransitionTimes(this.animationTime);
        }
        plexCanvas.suppressHoverForAnimation(this.animationTime);

        // begin animation
        // Note: zoneScrollbars are cleared when the active thought changes (see above).
        // We do NOT clear them here based on isScrollEvent, because non-scroll re-renders
        // (e.g. post-animation relayout callbacks) must also preserve scroll positions.
        this.initThoughtReps();
        this.processPendingHighlights();
        if(this.layout == LayoutType.Outline || this.layout == LayoutType.Mindmap) {
            plexCanvas.setScrollbarsToDraw([]);
        }
        if(this.layout == LayoutType.Force) {
            this.initForceLayout();
            plexCanvas.setScrollbarsToDraw([]);
        }
        else {
            this.moveWrapper();
            this.forceLayout.reset();
        }
        this.requestExtraLinks();
        this.markNonLayoutCurAsOld();
        this.disappearOld();
        // After layout, if zone ranges were corrected from end=0 (by layoutThoughts),
        // force a relayout callback so C# gets the updated ranges and can render missing thoughts.
        if(this.lastRangesWerePerfectMatch && zoneRanges &&
            (this.layout == LayoutType.Normal || this.layout == LayoutType.NormalPlusOne)) {
            let zrAfterLayout = this.zoneRangesFromLayoutNode(this.node, this.activeId || "");
            if(!ZoneRanges.fromObject(zoneRanges).equals(zrAfterLayout)) {
                this.lastRangesWerePerfectMatch = false;
            }
        }
        this.scrollDirStr = "";
        this.lastActiveId = this.activeId;
        if(this.scrollRangesUpdateTimer != 0) {
            // If we have a pending scroll ranges update, cancel it
            clearTimeout(this.scrollRangesUpdateTimer);
            this.scrollRangesUpdateTimer = 0;
        }
        const capturedNode = this.node;                                                                                                         
        const capturedActiveId = this.activeId;
        this.scrollRangesUpdateTimer = setTimeout(() => {
            // Only callback if state hasn't changed                                                                                            
            if(this.activeId === capturedActiveId && this.node === capturedNode) {
                this.maybeTellServerToRelayout(false); // is this right?
            }
            // clean up old that were not immediately replaced
            this.removeOld();
            this.hideOffscreen();
            if(this.layout == LayoutType.Force) {
                this.lastNormalLayoutThoughtPoints = {};
            }
        }, this.animationTime * 1000);
    }

    processPendingHighlights() {
        if(this.pendingHighlightIds.size === 0) return;
        const found: string[] = [];
        for(const id of this.pendingHighlightIds) {
            if(this.thtReps.has(id)) {
                found.push(id);
            }
        }
        for(const id of found) {
            this.pendingHighlightIds.delete(id);
            console.info("processPendingHighlights: highlighting", id);
            this.showNewThoughtHighlight(id);
        }
    }

    // Called from C# — queues IDs for highlighting. The actual highlight fires
    // from processPendingHighlights() after start() has populated thtReps.
    highlightNewThoughts(thoughtIds: string[]) {
        console.info("plexAnimator.highlightNewThoughts: queuing", thoughtIds);
        for(const id of thoughtIds) {
            this.pendingHighlightIds.add(id);
        }
    }

    showNewThoughtHighlight(thoughtId: string) {
        const thtRep = this.thtReps.get(thoughtId);
        if(!thtRep) {
            console.warn("showNewThoughtHighlight: no thtRep found for", thoughtId, "available keys:", Array.from(this.thtReps.keys()));
            return;
        }
        console.info("showNewThoughtHighlight: found thtRep for", thoughtId);

        let thtEl = thtRep.thtEl;
        const rect = thtEl.getBoundingClientRect();
        const fieldRect = this.field.getBoundingClientRect();

        // Skip highlight if the thought element is not visible (e.g. outside scroll zone)
        if(rect.width === 0 && rect.height === 0) return;
        if(rect.right < fieldRect.left || rect.left > fieldRect.right ||
           rect.bottom < fieldRect.top || rect.top > fieldRect.bottom) return;

        const initialSize = (Math.max(rect.width, rect.height) + 60) * 1.5;

        // Use thoughtHighlightOutline color from brain color scheme
        const colorNum = this.colors.thoughtHighlightOutline ?? 0xffffff;
        const r = (colorNum & 0xFF0000) >>> 16;
        const g = (colorNum & 0xFF00) >>> 8;
        const b = colorNum & 0xFF;

        const highlight = document.createElement("div");
        highlight.style.position = "absolute";
        highlight.style.pointerEvents = "none";
        highlight.style.zIndex = "20";
        highlight.style.borderRadius = "50%";
        highlight.style.border = `6px solid rgb(${r},${g},${b})`;
        highlight.style.boxSizing = "border-box";
        highlight.style.width = initialSize + "px";
        highlight.style.height = initialSize + "px";
        highlight.style.animation = "newThoughtHighlightShrink 1.5s linear forwards";

        this.field.appendChild(highlight);

        // Track the thought element's position every frame so the highlight follows it
        const field = this.field;
        let alive = true;
        const updatePosition = () => {
            if(!alive || !highlight.parentNode) return;
            // If the tracked element was removed from DOM (cloned/replaced), find the new one
            if(!thtEl.isConnected) {
                const replacement = document.getElementById("tht-" + thoughtId + "-cur") as HTMLElement;
                if(replacement) {
                    thtEl = replacement;
                } else {
                    alive = false;
                    highlight.remove();
                    return;
                }
            }
            const r2 = thtEl.getBoundingClientRect();
            const fr = field.getBoundingClientRect();
            const cx = (r2.left + r2.width / 2) - fr.left;
            const cy = (r2.top + r2.height / 2) - fr.top;
            highlight.style.left = (cx - initialSize / 2) + "px";
            highlight.style.top = (cy - initialSize / 2) + "px";
            requestAnimationFrame(updatePosition);
        };
        updatePosition();

        highlight.addEventListener("animationend", () => { alive = false; highlight.remove(); });
        setTimeout(() => { alive = false; if(highlight.parentNode) highlight.remove(); }, 2200);
    }

    private gateHighlightElements: HTMLElement[] = [];
    private gateHighlightRafId: number = 0;

    showGateHighlights(thoughtId?: string, relations?: number[]): void {
        this.removeGateHighlights();
        if(!this.node || !this.field) return;

        const targetId = (thoughtId && thoughtId.length > 0) ? thoughtId : this.node.id;
        const thtRep = this.thtReps.get(targetId);
        if(!thtRep) return;

        const targetRelations: Relation[] = (relations && relations.length > 0)
            ? relations as Relation[]
            : [Relation.Parent, Relation.Child, Relation.Jump];
        for(const rel of targetRelations) {
            const ring = document.createElement('div');
            ring.style.position = 'absolute';
            ring.style.pointerEvents = 'none';
            ring.style.zIndex = '20';
            ring.style.width = '28px';
            ring.style.height = '28px';
            ring.style.borderRadius = '50%';
            ring.style.border = '2px solid rgba(59, 130, 246, 0.8)';
            ring.style.boxShadow = '0 0 8px 2px rgba(59, 130, 246, 0.3)';
            ring.style.animation = 'gateHighlightPulse 2s ease-in-out infinite';
            ring.dataset.gateRelation = rel.toString();
            this.field.appendChild(ring);
            this.gateHighlightElements.push(ring);
        }

        const updatePositions = () => {
            if(this.gateHighlightElements.length === 0) return;
            const currentThtRep = this.thtReps.get(targetId);
            if(!currentThtRep) {
                this.removeGateHighlights();
                return;
            }

            for(const ring of this.gateHighlightElements) {
                const rel = parseInt(ring.dataset.gateRelation!) as Relation;
                const pos = plexCanvas.getGateLocationFromThoughtRep(currentThtRep, rel);
                ring.style.left = (pos.x - 14) + 'px';
                ring.style.top = (pos.y - 14) + 'px';
            }
            this.gateHighlightRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }

    removeGateHighlights(): void {
        if(this.gateHighlightRafId) {
            cancelAnimationFrame(this.gateHighlightRafId);
            this.gateHighlightRafId = 0;
        }
        for(const el of this.gateHighlightElements) {
            el.remove();
        }
        this.gateHighlightElements = [];
    }

    private dragHintElements: (HTMLElement | SVGSVGElement)[] = [];
    private dragHintRafId: number = 0;

    showDragHint(sourceThoughtId: string, sourceRelation: number, targetThoughtId: string, arcBelow: boolean = false): void {
        this.removeDragHint();
        if(!this.field) return;

        const srcRep = this.thtReps.get(sourceThoughtId);
        const tgtRep = this.thtReps.get(targetThoughtId);
        if(!srcRep || !tgtRep) return;

        // Source gate ring (same style as gate highlights)
        const srcRing = document.createElement('div');
        srcRing.style.position = 'absolute';
        srcRing.style.pointerEvents = 'none';
        srcRing.style.zIndex = '20';
        srcRing.style.width = '28px';
        srcRing.style.height = '28px';
        srcRing.style.borderRadius = '50%';
        srcRing.style.border = '2px solid rgba(59, 130, 246, 0.8)';
        srcRing.style.boxShadow = '0 0 8px 2px rgba(59, 130, 246, 0.3)';
        srcRing.style.animation = 'gateHighlightPulse 2s ease-in-out infinite';
        this.field.appendChild(srcRing);
        this.dragHintElements.push(srcRing);

        // Target thought glow overlay
        const tgtGlow = document.createElement('div');
        tgtGlow.style.position = 'absolute';
        tgtGlow.style.pointerEvents = 'none';
        tgtGlow.style.zIndex = '19';
        tgtGlow.style.borderRadius = '12px';
        tgtGlow.style.border = '2px solid rgba(59, 130, 246, 0.7)';
        tgtGlow.style.boxShadow = '0 0 12px 4px rgba(59, 130, 246, 0.25)';
        tgtGlow.style.animation = 'dragHintTargetPulse 2s ease-in-out infinite';
        this.field.appendChild(tgtGlow);
        this.dragHintElements.push(tgtGlow);

        // SVG arrow overlay
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '18';
        svg.style.overflow = 'visible';

        // Arrowhead marker
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'dragHintArrow');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '4');
        marker.setAttribute('orient', 'auto');
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowPath.setAttribute('d', 'M0,0 L10,4 L0,8 L2,4 Z');
        arrowPath.setAttribute('fill', 'rgba(59, 130, 246, 0.6)');
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        svg.appendChild(defs);

        // Curved path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(59, 130, 246, 0.5)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '8 6');
        path.setAttribute('marker-end', 'url(#dragHintArrow)');
        path.style.animation = 'dragHintDash 1s linear infinite';
        svg.appendChild(path);

        this.field.appendChild(svg);
        this.dragHintElements.push(svg);

        const field = this.field;
        const rel = sourceRelation as Relation;

        const updatePositions = () => {
            if(this.dragHintElements.length === 0) return;
            const currentSrc = this.thtReps.get(sourceThoughtId);
            const currentTgt = this.thtReps.get(targetThoughtId);
            if(!currentSrc || !currentTgt) {
                this.removeDragHint();
                return;
            }

            // Source gate position
            const srcPos = plexCanvas.getGateLocationFromThoughtRep(currentSrc, rel);
            srcRing.style.left = (srcPos.x - 14) + 'px';
            srcRing.style.top = (srcPos.y - 14) + 'px';

            // Target thought bounding box (field-relative)
            const tgtEl = currentTgt.thtEl;
            const tgtRect = tgtEl.getBoundingClientRect();
            const fieldRect = field.getBoundingClientRect();
            const tgtLeft = tgtRect.left - fieldRect.left;
            const tgtTop = tgtRect.top - fieldRect.top;
            const pad = 8;
            tgtGlow.style.left = (tgtLeft - pad) + 'px';
            tgtGlow.style.top = (tgtTop - pad) + 'px';
            tgtGlow.style.width = (tgtRect.width + pad * 2) + 'px';
            tgtGlow.style.height = (tgtRect.height + pad * 2) + 'px';

            // Arrow endpoint: nearest edge of target thought bounding box, centered along that edge
            const tgtCx = tgtLeft + tgtRect.width / 2;
            const tgtCy = tgtTop + tgtRect.height / 2;
            const edgeMargin = pad + 4;
            // Determine which edge the arrow should hit based on source position relative to target center
            const adx = Math.abs(srcPos.x - tgtCx);
            const ady = Math.abs(srcPos.y - tgtCy);
            const aspectX = adx / (tgtRect.width / 2 + edgeMargin || 1);
            const aspectY = ady / (tgtRect.height / 2 + edgeMargin || 1);
            let endX: number, endY: number;
            if(aspectX > aspectY) {
                // Hit left or right edge
                endX = srcPos.x < tgtCx ? tgtLeft - edgeMargin : tgtLeft + tgtRect.width + edgeMargin;
                endY = tgtCy;
            } else {
                // Hit top or bottom edge
                endX = tgtCx;
                endY = srcPos.y < tgtCy ? tgtTop - edgeMargin : tgtTop + tgtRect.height + edgeMargin;
            }

            const midX = (srcPos.x + endX) / 2;
            const midY = (srcPos.y + endY) / 2;
            // Offset control point perpendicular to the line for a nice curve
            const dx = endX - srcPos.x;
            const dy = endY - srcPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const curvature = Math.min(dist * 0.3, 60);
            const sign = arcBelow ? -1 : 1;
            const cpX = midX + (dy / dist) * curvature * sign;
            const cpY = midY - (dx / dist) * curvature * sign;
            path.setAttribute('d', `M${srcPos.x},${srcPos.y} Q${cpX},${cpY} ${endX},${endY}`);

            this.dragHintRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }

    removeDragHint(): void {
        if(this.dragHintRafId) {
            cancelAnimationFrame(this.dragHintRafId);
            this.dragHintRafId = 0;
        }
        for(const el of this.dragHintElements) {
            el.remove();
        }
        this.dragHintElements = [];
    }

    highlightThoughts(thoughtIds: string[]): void {
        this.removeDragHint();
        if(!this.field || !thoughtIds || thoughtIds.length === 0) return;

        const glowMap = new Map<string, HTMLElement>();
        const field = this.field;
        const ids = [...thoughtIds];

        const createGlow = (id: string): HTMLElement => {
            const glow = document.createElement('div');
            glow.style.position = 'absolute';
            glow.style.pointerEvents = 'none';
            glow.style.zIndex = '19';
            glow.style.borderRadius = '12px';
            glow.style.border = '2px solid rgba(59, 130, 246, 0.7)';
            glow.style.boxShadow = '0 0 12px 4px rgba(59, 130, 246, 0.25)';
            glow.style.animation = 'dragHintTargetPulse 2s ease-in-out infinite';
            field.appendChild(glow);
            this.dragHintElements.push(glow);
            return glow;
        };

        const updatePositions = () => {
            const fieldRect = field.getBoundingClientRect();
            for(const id of ids) {
                const rep = this.thtReps.get(id);
                if(!rep) continue;

                // Lazily create glow when thtRep becomes available
                let glow = glowMap.get(id);
                if(!glow) {
                    glow = createGlow(id);
                    glowMap.set(id, glow);
                }

                const rect = rep.thtEl.getBoundingClientRect();
                const pad = 8;
                glow.style.left = (rect.left - fieldRect.left - pad) + 'px';
                glow.style.top = (rect.top - fieldRect.top - pad) + 'px';
                glow.style.width = (rect.width + pad * 2) + 'px';
                glow.style.height = (rect.height + pad * 2) + 'px';
            }
            this.dragHintRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }

    showGateDragArrow(thoughtId: string | null, relation: number, offsetX: number, offsetY: number): void {
        this.removeDragHint();
        if(!this.field) return;

        const targetId = (thoughtId && thoughtId.length > 0) ? thoughtId : this.node?.id;
        if(!targetId) return;
        const srcRep = this.thtReps.get(targetId);
        if(!srcRep) return;

        // Source gate ring
        const srcRing = document.createElement('div');
        srcRing.style.position = 'absolute';
        srcRing.style.pointerEvents = 'none';
        srcRing.style.zIndex = '20';
        srcRing.style.width = '28px';
        srcRing.style.height = '28px';
        srcRing.style.borderRadius = '50%';
        srcRing.style.border = '2px solid rgba(59, 130, 246, 0.8)';
        srcRing.style.boxShadow = '0 0 8px 2px rgba(59, 130, 246, 0.3)';
        srcRing.style.animation = 'gateHighlightPulse 2s ease-in-out infinite';
        this.field.appendChild(srcRing);
        this.dragHintElements.push(srcRing);

        // SVG arrow
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '18';
        svg.style.overflow = 'visible';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'gateDragArrow');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '4');
        marker.setAttribute('orient', 'auto');
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowPath.setAttribute('d', 'M0,0 L10,4 L0,8 L2,4 Z');
        arrowPath.setAttribute('fill', 'rgba(59, 130, 246, 0.6)');
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        svg.appendChild(defs);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(59, 130, 246, 0.5)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '8 6');
        path.setAttribute('marker-end', 'url(#gateDragArrow)');
        path.style.animation = 'dragHintDash 1s linear infinite';
        svg.appendChild(path);

        this.field.appendChild(svg);
        this.dragHintElements.push(svg);

        const rel = relation as Relation;

        const updatePositions = () => {
            if(this.dragHintElements.length === 0) return;
            const currentSrc = this.thtReps.get(targetId);
            if(!currentSrc) {
                this.removeDragHint();
                return;
            }

            const srcPos = plexCanvas.getGateLocationFromThoughtRep(currentSrc, rel);
            srcRing.style.left = (srcPos.x - 14) + 'px';
            srcRing.style.top = (srcPos.y - 14) + 'px';

            const endX = srcPos.x + offsetX;
            const endY = srcPos.y + offsetY;
            // Slight curve for visual interest
            const cpX = srcPos.x + offsetX * 0.3 + 20;
            const cpY = srcPos.y + offsetY * 0.5;
            path.setAttribute('d', `M${srcPos.x},${srcPos.y} Q${cpX},${cpY} ${endX},${endY}`);

            this.dragHintRafId = requestAnimationFrame(updatePositions);
        };
        updatePositions();
    }

    maybeTellServerToRelayout(isScrollEvent: boolean) {
        // get current time as ticks since epoch
        let millisecondsSinceEpoch = Date.now();
        this.logInfo("*** maybeTellServerToRelayout - current time in milliseconds since epoch: ", millisecondsSinceEpoch);
        if(!this.lastRangesWerePerfectMatch && this.node != null) {
            // call back into C# to cause rerender with cached ZoneRanges
            let zr = this.zoneRangesFromLayoutNode(this.node, this.activeId || "<BOGUS>");
            // Note: do NOT advance lastOrderedJobId here. Only start() should
            // advance it (line ~780) so JS and C# stay in sync. Advancing it here
            // caused start() calls to be permanently rejected during rapid navigation
            // because lastOrderedJobId raced ahead of C#'s RequestedOrderedJobId.
            this.logInfo("calling C# SetNormalViewZoneRangesAndRelayout");
            safeInvoke(this.dotNetHelper, "SetNormalViewZoneRangesAndRelayout", [zr, isScrollEvent, millisecondsSinceEpoch]);
        } else {
            this.logInfo("lastRangesWerePerfectMatch, no need to call C# SetNormalViewZoneRangesAndRelayout");
        }
    }

    // called from blazor
    showExpandResults(expandedId: string, links: LinkRep[]) {

        if(this.layout != LayoutType.Force) {
            // layout was changed since request was made?
            return;
        }

        console.time("Received extra thoughts");

        this.addLinkReps(links);

        this.removeOld();
        this.cloneNewAndMarkAsCur(this.expandDeck);
        this.normalLayout.replaceOldWithCur(); // forceLayout uses normalLayout logic for disappearing thought locations

        console.timeEnd("Received extra thoughts");

        // begin animation
        this.initThoughtReps();
        this.initForceLayout();
        this.requestExtraLinks();
        this.disappearOld();
        setTimeout(() => {
            // clean up old that were not immediately replaced
            this.removeOld();
            this.hideOffscreen();
        }, this.animationTime * 1000);

    }

    getVisibleLinksToThought(thtId: string): LinkRep[] {
        let result: LinkRep[] = [];
        this.linkReps.forEach((linkRep) => {
            if((linkRep.idA === thtId && this.thtReps.has(linkRep.idB)) || (linkRep.idB === thtId && this.thtReps.has(linkRep.idA))) {
                result.push((linkRep));
            }
        })
        return result;
    }

    canExpand(thtRep: ThoughtRep) {
        if(thtRep.expandDirection === ThoughtExpandDirection.Parent) {
            return thtRep.parentGate === GateStatus.More;
        } else if(thtRep.expandDirection === ThoughtExpandDirection.Child || thtRep.expandDirection === ThoughtExpandDirection.ChildLeft) {
            return thtRep.childGate === GateStatus.More;
        }
        return thtRep.childGate === GateStatus.More || thtRep.parentGate === GateStatus.More || thtRep.jumpGate === GateStatus.More;
    }

    canCollapse(thtRep: ThoughtRep) {
        return this.getThoughtIdsToHideOnCollapse(thtRep.id, 0).length > 0;
    }

    getThoughtIdsToHideOnCollapse(thtId: string, generation: number): string[] {
        let result: string[] = [];
        let linksToTht = this.getVisibleLinksToThought(thtId);
        let linkCount = linksToTht.length;
        // can't collapse a thought that has more than two links if this is the second generation
        if(generation >= 1 && linkCount > 1) {
            return result;
        }
        // can't collapse active thought
        if(linkCount === 1 && thtId !== this.activeId) {
            result.push(thtId)
            return result;
        }
        // we are on generation 1 and it has more than 1 link
        linksToTht.forEach((link) => {
            let otherThtId = link.idA == thtId ? link.idB : link.idA;
            let addThese = this.getThoughtIdsToHideOnCollapse(otherThtId, generation + 1);
            if(addThese !== null) {
                result = result.concat(addThese);
            }
        });
        return result;
    }

    removeThoughtRep(id: string) {
        if(this.thtReps.has(id)) {
            let thtRep = this.thtReps.get(id)!;
            thtRep.thtEl.remove();
            this.thtReps.delete(id);
        }
    }

    getThoughtElementId(thtId: string) {
        if(!thtId) {
            return null;
        }

        let thoughtRep = this.thtReps.get(thtId);
        if(!thoughtRep) {
            let normalizedId = thtId.toLowerCase();
            thoughtRep = this.thtReps.get(normalizedId);
            if(!thoughtRep) {
                for(let rep of this.thtReps.values()) {
                    if(rep.id.toLowerCase() === normalizedId) {
                        thoughtRep = rep;
                        break;
                    }
                }
            }
        }

        if(!thoughtRep) {
            return null;
        }

        return thoughtRep.thtEl.id;
    }

    collapseThought(collapseId: string) {

        if(this.layout != LayoutType.Force) {
            // this should not happen
            throw new Error("Attempt to collapse when not in force layout");
        }

        let idsToCollapse = this.getThoughtIdsToHideOnCollapse(collapseId, 0);

        if(idsToCollapse.length == 0) {
            return;
        }

        // remove the thought elements
        idsToCollapse.forEach((id) => {
            this.removeThoughtRep(id);
        });

        // begin animation
        this.initThoughtReps();
        this.initForceLayout();
        this.requestExtraLinks();
        this.disappearOld();

    }

    removeOld() {
        let thtElements = this.field.querySelectorAll(".tht.old");
        thtElements.forEach((thtEl) => {
            let thtId = thtEl.id.substring(4, 40);
            this.thtReps.delete(thtId);
            thtEl.remove();
        });
        // make sure no links are missing due to thoughtReps being missing
        let thtElements2 = this.field.querySelectorAll(".tht.cur");
        thtElements2.forEach((thtEl) => {
            let thtId = thtEl.id.substring(4, 40);
            if(!this.thtReps.has(thtId)) {
                this.thtReps.set(thtId, new ThoughtRep(thtEl as HTMLElement));
            }
        });
    }

    markCurAndOffscreenAsOld() {
        let thtElements = this.field.querySelectorAll(".tht.cur, .tht.off");
        thtElements.forEach((thtEl) => {
            this.markElementAsOld(thtEl as HTMLElement);
        });
    }
    
    doesThoughtHaveZone(thtEl: HTMLElement, zone: string): boolean {
        if(zone === "all") {
            return true;
        }
        if(zone == "child") {
            return this.nodeChildrenIds.has(thtEl.id.substring(4, 40));
        }
        if(zone == "parent") {
            return this.nodeParentsIds.has(thtEl.id.substring(4, 40));
        }
        if(zone == "jump") {
            return this.nodeJumpsIds.has(thtEl.id.substring(4, 40));
        }
        if(zone == "sibling") {
            return this.nodeSiblingsIds.has(thtEl.id.substring(4, 40));
        }
        return false;
    }

    markOffscreenAsCur(zone: string) {
        let thtElements = this.field.querySelectorAll(".tht.off");
        let that = this;
        thtElements.forEach((thtEl) => {
            if(!that.doesThoughtHaveZone(thtEl as HTMLElement, zone)) {
                return;
            }
            this.markElementAsCur(thtEl as HTMLElement);
        });
    }

    markElementAsOld(thtEl: HTMLElement) {
        thtEl.classList.remove("cur", "off");
        thtEl.classList.add("old");
        thtEl.style.pointerEvents = "none";
        thtEl.id = thtEl.id.substring(0, thtEl.id.length - 4) + "-old";
    }

    // This is called by normalLayout.layoutThoughts at the bottom where it hides scroll items
    // before and after the visible thoughts
    markElementAsOffscreen(thtEl: HTMLElement, destPoint: Point | null, isScrollEvent: boolean) {
        thtEl.classList.remove("cur", "off");
        thtEl.classList.add("off");
        thtEl.id = thtEl.id.substring(0, thtEl.id.length - 4) + "-off";
        if(destPoint != null) {
            thtEl.style.opacity = "0";
            thtEl.style.fontSize = "0"; // make thought text shrink to nothing
            let thtIconEl = thtEl.querySelector(".tht-icon") as HTMLElement;
            if(thtIconEl) {
                thtIconEl.style.height = "0px"; // make thought icon shrink to nothing
            }
            thtEl.style.left = destPoint.x - (thtEl.clientWidth * 0.5) + "px";
            thtEl.style.top = destPoint.y - (thtEl.clientHeight * 0.5) + "px";
        }
    }

    setThoughtDisappearPosition(thtEl: HTMLElement, destPoint: Point | null) {
        if(destPoint != null) {
            thtEl.style.opacity = "0";
            thtEl.style.fontSize = "0"; // make thought text shrink to nothing
            let thtIconEl = thtEl.querySelector(".tht-icon") as HTMLElement;
            if(thtIconEl) {
                thtIconEl.style.height = "0px"; // make thought icon shrink to nothing
            }
            thtEl.style.left = destPoint.x - (thtEl.clientWidth * 0.5) + "px";
            thtEl.style.top = destPoint.y - (thtEl.clientHeight * 0.5) + "px";
        }
    }

    markElementAsCur(thtEl: HTMLElement) {
        thtEl.classList.remove("off", "old");
        thtEl.classList.add("cur");
        thtEl.id = thtEl.id.substring(0, thtEl.id.length - 4) + "-cur";
    }

    cloneNewAndMarkAsCur(container: HTMLElement) {
        let thtElements = container.querySelectorAll(".tht");
        thtElements.forEach((thtEl) => {
            let thtId = thtEl.id.substring(4);
            let newThtElement = thtEl.cloneNode(true) as HTMLElement;
            if(this.thtReps.has(thtId)) {
                // we already have this thought, make sure it is marked as old
                let existingEl = this.thtReps.get(thtId)!.thtEl;
                this.markElementAsOld(existingEl);
                newThtElement.style.display = existingEl.style.display;
                newThtElement.style.fontSize = existingEl.style.fontSize;
            } else {
                // default as hidden in case it is scrolled offscreen
                newThtElement.style.display = "none";
            }
            newThtElement.classList.add("cur");
            newThtElement.classList.add("drop-zone-enabled"); // DO NOT REMOVE THIS. See thebrain.js startGlobalDropPrevention()
            newThtElement.id = thtEl.id+"-cur";
            newThtElement.style.zIndex = "5";
            
            this.field.appendChild(newThtElement);
            if(plexCanvas.selectedThoughtIds.includes(thtId)) {
                newThtElement.classList.add("thought-selected");
            }
        });
    }

    
    public backgroundDragEnded() {
        this.forceInvalidateLayout();
    }
    
    isBackgroundDragged: boolean = false;
    public backgroundDragged(deltaPoint: Point, hasDragExceededClickDistance: boolean) {
        if(!hasDragExceededClickDistance) {
            return;
        }
        this.isBackgroundDragged = this.isBackgroundDragged || hasDragExceededClickDistance;
        this.setThoughtElementTransitionTimes(0);

        // For Normal layouts, adjust the vertical center ratio instead of panning elements.
        if(this.layout == LayoutType.Normal || this.layout == LayoutType.NormalPlusOne) {
            const fieldRect = this.field.getBoundingClientRect();
            if(fieldRect.height > 0) {
                // Dragging up (negative dy) moves center up; dragging down moves center down.
                const deltaRatio = deltaPoint.y / fieldRect.height;
                this.normalCenterRatio = Math.max(this.NORMAL_CENTER_MIN, Math.min(this.NORMAL_CENTER_MAX, this.normalCenterRatio + deltaRatio));
                // Recompute positions with the new center ratio
                this.thoughtIdSet.clear();
                this.currentLayout.moveCurToNewPositions("all", false);
            }
            return;
        }

        // Other layouts (Force/Outline/Mindmap) pan by shifting element positions directly.
        let thtElements = this.field.querySelectorAll(".tht") as NodeListOf<HTMLElement>;
        let clamped = this.clampPanDelta(deltaPoint.x, deltaPoint.y, thtElements);
        let dx = Math.round(clamped.x);
        let dy = Math.round(clamped.y);
        if(dx === 0 && dy === 0) return;
        this.lastBackgroundDragX += clamped.x;
        this.lastBackgroundDragY += clamped.y;
        thtElements.forEach((thtEl: HTMLElement) => {
            thtEl.style.left = (parseInt(thtEl.style.left) + dx) + "px";
            thtEl.style.top = (parseInt(thtEl.style.top) + dy) + "px";
        });
    }

    private static readonly PAN_EDGE_MARGIN = 100;

    private getThoughtsBoundingBox(thtElements: NodeListOf<HTMLElement>): { minX: number; minY: number; maxX: number; maxY: number } | null {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let count = 0;
        thtElements.forEach((el: HTMLElement) => {
            if(el.style.display === "none") return;
            let left = parseInt(el.style.left);
            let top = parseInt(el.style.top);
            if(isNaN(left) || isNaN(top)) return;
            count++;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + el.offsetWidth);
            maxY = Math.max(maxY, top + el.offsetHeight);
        });
        return count > 0 ? { minX, minY, maxX, maxY } : null;
    }

    private clampPanDelta(dx: number, dy: number, thtElements: NodeListOf<HTMLElement>): Point {
        const bbox = this.getThoughtsBoundingBox(thtElements);
        if(!bbox) return new Point(dx, dy);
        const fieldRect = this.field.getBoundingClientRect();
        const margin = PlexAnimator.PAN_EDGE_MARGIN;
        // Bottom-most thought must stay below top + margin
        if(bbox.maxY + dy < margin) dy = margin - bbox.maxY;
        // Top-most thought must stay above bottom - margin
        if(bbox.minY + dy > fieldRect.height - margin) dy = fieldRect.height - margin - bbox.minY;
        // Right-most thought must stay right of left + margin
        if(bbox.maxX + dx < margin) dx = margin - bbox.maxX;
        // Left-most thought must stay left of right - margin
        if(bbox.minX + dx > fieldRect.width - margin) dx = fieldRect.width - margin - bbox.minX;
        return new Point(dx, dy);
    }

    public clampPanToViewport() {
        if(this.layout != LayoutType.Outline && this.layout != LayoutType.Mindmap && this.layout != LayoutType.Force) return;
        let thtElements = this.field.querySelectorAll(".tht") as NodeListOf<HTMLElement>;
        let clamped = this.clampPanDelta(0, 0, thtElements);
        let dx = Math.round(clamped.x);
        let dy = Math.round(clamped.y);
        if(dx === 0 && dy === 0) return;
        this.lastBackgroundDragX += clamped.x;
        this.lastBackgroundDragY += clamped.y;
        thtElements.forEach((thtEl: HTMLElement) => {
            thtEl.style.left = (parseInt(thtEl.style.left) + dx) + "px";
            thtEl.style.top = (parseInt(thtEl.style.top) + dy) + "px";
        });
    }

    setThoughtElementTransitionTimes(seconds: number) {
        let thtElements = this.field.querySelectorAll(".tht");
        let lastActiveId = this.lastActiveId || "";
        thtElements.forEach((thtEl_) => {
            let thtEl = thtEl_ as HTMLElement;
            let id = thtEl.id.substring(4, 40);
            if(this.layout == LayoutType.Mindmap && id === lastActiveId) {
                // In mindmap layout, the previously-active thought transitions from 125% to
                // 100% font in place (it doesn't get replaced by a new element like in normal
                // layout). Animating font-size causes the text to briefly exceed the allocated
                // width and wrap. Exclude font-size so it changes instantly.
                thtEl.style.transition = "opacity " + seconds + "s ease, left " + seconds + "s ease, top " + seconds + "s ease, color " + seconds + "s ease";
            } else {
                thtEl.style.transition = "font-size " + seconds + "s ease, opacity " + seconds + "s ease, left " + seconds + "s ease, top " + seconds + "s ease, color " + seconds + "s ease";
            }
        });

        this.enablePlexFocusReticleAnimation(seconds > 0);

        plexCanvas.startAnimations(seconds);
    }

    enablePlexFocusReticleAnimation(enable: boolean) {
        let plexFocusCircle = document.getElementById("plex-focus-circle") as HTMLElement;
        if(plexFocusCircle) {
            let time = !enable ? 0 : (0.1);
            plexFocusCircle.style.transition = "left " + time + "s ease-out, top " + time + "s ease-out";
        }
    }

    // iterator for filtering thought elements (NodeListOf is not an array so cannot user .filter)
    *filterNodeList(nodeList: NodeListOf<HTMLElement>, func: any): Iterable<HTMLElement> {
        for (let i = 0; i < nodeList.length; i++) {
            if (func(nodeList[i])) {
                yield nodeList[i];
            }
        }
    }

    getThoughtElements(selectorString: string, set: Set<string>): HTMLElement[] {
        let thtElementsList = this.field.querySelectorAll(selectorString) as NodeListOf<HTMLElement>;
        return Array.from(this.filterNodeList(thtElementsList, (thtEl: HTMLElement) => set.has(thtEl.id.substring(4, 40))));
    }
    
    accountForThoughtAndRelations(thtEl: HTMLElement) {
        let id = thtEl.id.substring(4, 40);
        this.thoughtIdSet.add(id);
        // any relations?
        (this.nodeParentsOf.get(id) ?? []).forEach((relationId) => {
            this.thoughtIdSet.add(relationId);
        });
        (this.nodeJumpsOf.get(id) ?? []).forEach((relationId) => {
            this.thoughtIdSet.add(relationId);
        });
        (this.nodeChildrenOf.get(id) ?? []).forEach((relationId) => {
            this.thoughtIdSet.add(relationId);
        });
    }

    accountForOtherZones(zone: string) {
        this.thoughtIdSet.add(this.activeId!);
        if(zone !== "parent") {
            this.getThoughtElements('.tht.cur', this.nodeParentsIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
        if(zone !== "child") {
            this.getThoughtElements('.tht.cur', this.nodeChildrenIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
        if(zone !== "jump") {
            this.getThoughtElements('.tht.cur', this.nodeJumpsIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
        if(zone !== "sibling") {
            this.getThoughtElements('.tht.cur', this.nodeSiblingsIds).forEach((thtEl) => {
                this.accountForThoughtAndRelations(thtEl);
            });
        }
    }

    normalLayoutZoneToRows: Map<string, number> = new Map<string, number>();
    normalLayoutZoneToColumns: Map<string, number> = new Map<string, number>();
    
    scrollDirStr: string = "";
    scrolledZone: string = "";

    scrollChanged(zone: string, scrollDirStr: string) {
        this.scrollDirStr = scrollDirStr;
        this.scrolledZone = zone;
        this.showOffscreen(zone);
        this.setThoughtElementTransitionTimes(this.SCROLL_ANIMATION_TIME);
        if(this.layout == LayoutType.Normal) {
            this.normalLayout.moveCurToNewPositions(zone, true);
        } else if(this.layout == LayoutType.NormalPlusOne) {
            this.normalPlusOneLayout.moveCurToNewPositions(zone, true);
        }
        plexCanvas.applyPendingFocus(); // Apply pending focus after layout completes
        this.lastRangesWerePerfectMatch = false;
        //
        let id = this.activeId || "<BOGUS>";
        let zrCached = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        let myBool = false;
        let delta = 1;
        let c = this.normalLayoutZoneToColumns.get(zone) || 1;
        let r = this.normalLayoutZoneToRows.get(zone) || 1;
        if(c > 1) {
            delta = r;
        }
        let start = (this.zoneScrollbars[zone]?.startAt || 0) * delta;
        let end = start + r * c;
        this.setZoneRangeForZone(zone, start, end); // reset the zone range for this zone, so it can be set by C# later
        let zr = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        this.lastRangesWerePerfectMatch = zr.equals(zrCached);
        this.maybeTellServerToRelayout(true);

        this.accountForOtherZones(zone); // keep other zones from being hidden by thoughtIdSet bookkeeping
        this.requestExtraLinks();
        this.disappearOld(true);
        setTimeout(() => {
            this.hideOffscreen();
        }, this.SCROLL_ANIMATION_TIME * 1000);
    }
    
    // this is called when the background drag ends, to force a relayout
    // do not call this without a good reason
    forceInvalidateLayout() {
        this.setThoughtElementTransitionTimes(10); // instantly
            ["jump", "parent", "child", "sibling"].forEach((zone) => {
            if(this.layout == LayoutType.Normal) {
                this.normalLayout.moveCurToNewPositions(zone, true);
            } else if(this.layout == LayoutType.NormalPlusOne) {
                this.normalPlusOneLayout.moveCurToNewPositions(zone, true);
            }
            this.lastRangesWerePerfectMatch = false;
            //
            let myBool = false;
            let delta = 1;
            let c = this.normalLayoutZoneToColumns.get(zone) || 1;
            let r = this.normalLayoutZoneToRows.get(zone) || 1;
            if(c > 1) {
                delta = r;
            }
            let start = (this.zoneScrollbars[zone]?.startAt || 0) * delta;
            let end = start + r * c;
            this.setZoneRangeForZone(zone, start, end); // reset the zone range for this zone, so it can be set by C# later
        });
        // The live drag mutates the zone-range caches via layoutThoughts without notifying
        // C#, so diffing the node ranges here would always report "no change" and skip the
        // server relayout — leaving newly-fitting thoughts unrendered. Always notify.
        this.lastRangesWerePerfectMatch = false;
        this.maybeTellServerToRelayout(true);

        this.requestExtraLinks();
        this.disappearOld(true);
        setTimeout(() => {
            this.hideOffscreen();
        }, 10); // nearly instantaneous
    }
    
    scrollChangedTo(zone: string, pageNum: number) {
        this.scrolledZone = zone;
        this.showOffscreen(zone);
        this.setThoughtElementTransitionTimes(this.SCROLL_ANIMATION_TIME);
        if(this.layout == LayoutType.Normal) {
            this.normalLayout.moveCurToNewPositions(zone, true);
        } else if(this.layout == LayoutType.NormalPlusOne) {
            this.normalPlusOneLayout.moveCurToNewPositions(zone, true);
        }
        // Apply pending focus after layout completes
        plexCanvas.applyPendingFocus();
        this.lastRangesWerePerfectMatch = false;
        //
        let id = this.activeId || "<BOGUS>";
        let zrCached = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        let myBool = false;
        let c = this.normalLayoutZoneToColumns.get(zone) || 1;
        let r = this.normalLayoutZoneToRows.get(zone) || 1;
        let start = 0; 
        if (this.zoneScrollbars[zone]) {
            if (this.zoneScrollbars[zone]?.isHorizontal) {
                start = pageNum * r;
            } else {
                start = pageNum;
            }
        }
        let end = start + r * c;
        this.setZoneRangeForZone(zone, start, end); // reset the zone range for this zone, so it can be set by C# later
        let zr = this.zoneRangesFromLayoutNode(this.node || new LayoutNode(id), id);
        this.lastRangesWerePerfectMatch = zr.equals(zrCached);
        this.maybeTellServerToRelayout(true);

        this.accountForOtherZones(zone); // keep other zones from being hidden by thoughtIdSet bookkeeping
        this.requestExtraLinks();
        this.disappearOld(true);
        setTimeout(() => {
            this.hideOffscreen();
        }, this.SCROLL_ANIMATION_TIME * 1000);
    }

    hideOffscreen() {
        // offscreen elements must be hidden or they will still get pointer events even though their opacity is zero
        let thtElements = this.field.querySelectorAll(".tht.off");
        thtElements.forEach((thtEl_) => {
            let thtEl = thtEl_ as HTMLElement;
            thtEl.style.display = "none";
        });
    }

    markNonLayoutCurAsOld() {
        let curElements = this.field.querySelectorAll(".tht.cur");
        curElements.forEach((thtEl_) => {
            let thtEl = thtEl_ as HTMLElement;
            let id = thtEl.id.substring(4, 40);
            if (!this.thoughtIdSet.has(id)) {
                // Only warn if a thought belongs to a zone with NO scrollbar — meaning all
                // thoughts in that zone should fit and this one is being incorrectly hidden
                let isChildNoScroll = this.nodeChildrenIds.has(id) && !this.zoneScrollbars["child"];
                let isParentNoScroll = this.nodeParentsIds.has(id) && !this.zoneScrollbars["parent"];
                let isJumpNoScroll = this.nodeJumpsIds.has(id) && !this.zoneScrollbars["jump"];
                let isSiblingNoScroll = this.nodeSiblingsIds.has(id) && !this.zoneScrollbars["sibling"];
                if(isChildNoScroll || isParentNoScroll || isJumpNoScroll || isSiblingNoScroll) {
                    console.warn("[PLEX-BUG] markNonLayoutCurAsOld: hiding a thought that should be visible (no scrollbar in its zone)!", id,
                        "child:", isChildNoScroll, "parent:", isParentNoScroll, "jump:", isJumpNoScroll, "sibling:", isSiblingNoScroll,
                        "thoughtIdSet size:", this.thoughtIdSet.size);
                }
                this.markElementAsOld(thtEl);
            }
        });
    }

    showOffscreen(zone: string) {
        // offscreen elements must be set to displayed, or they won't animate their opacity correctly
        let thtElements = this.field.querySelectorAll(".tht.off");
        let that = this;
        thtElements.forEach((thtEl_) => {
            let thtEl = thtEl_ as HTMLElement;
            if(!that.doesThoughtHaveZone(thtEl as HTMLElement, zone)) {
                return;
            }
            thtEl.style.display = "block";
        });
    }

    // Called from Blazor
    enablePresentationMode() {
        let elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
            // @ts-ignore
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            // @ts-ignore
            elem.webkitRequestFullscreen();
            // @ts-ignore
        } else if (elem.msRequestFullscreen) { /* IE11 */
            // @ts-ignore
            elem.msRequestFullscreen();
        }
    }
    
    initForceLayout() {
        let fieldRect = this.field.getBoundingClientRect();
        this.forceLayout.setArea(new Rect(0, 0, fieldRect.width, fieldRect.height));

        // filter links out that are not used (links to tags and links to thoughts that aren't currently present for example)
        let filteredLinks = Array.from(this.linkReps.values()).filter((l) => this.thtReps.has(l.idA) && this.thtReps.has(l.idB));

        this.thtReps.forEach((thtRep) => {
            thtRep.thtEl.style.opacity = "1";
            thtRep.thtEl.style.maxWidth = this.COL_WIDTH + "px";
        });

        this.forceLayout.setData(this.activeId, this.getLinkData(filteredLinks));
        this.positionForceLayout();
    }

    private getLinkData(links: LinkRep[]): LinkData[] {
        let data: LinkData[] = [];
        links.forEach((link) => {
            let properties = link.color+":"+link.direction+":"+link.thickness;
            let ld = new LinkData(link.id, link.idA, link.idB, link.relation, properties);
            data.push(ld);
        });
        return data;
    }

    positionForceLayout() {
        this.thtReps.forEach((thtRep) => {
            if(plexCanvas.hoveredThoughtId != thtRep.id) {
                let point = this.forceLayout.getNodePoint(thtRep.id);
                if(point) {
                    DomUtils.centerAt(thtRep.thtEl, point);
                    thtRep.thtEl.style.opacity = "1";
                    thtRep.thtEl.style.fontSize = "100%";
                }
            }
        })
    }

    tick(delta: number) {
        if(this.layout == LayoutType.Force) {
            this.forceLayout.tick(delta/200);
            this.positionForceLayout();
        }
    }

    disappearOld(isScrollEvent: boolean = false) {
        this.currentLayout.disappearOld(isScrollEvent);
    }

    initThoughtReps() {
        // reset the list of thought reps based on old and new thought elements
        this.thtRepsOld = this.thtRepsNew;
        // thtRepsNew = thtElements
        this.thtRepsNew = new Map<string, ThoughtRep>();
        let thtElements = Array.from(this.field.querySelectorAll(".tht.cur,.tht.off") as NodeListOf<HTMLElement>);
        thtElements.forEach((thtEl) => {
            let thtRep = new ThoughtRep(thtEl);
            this.thtRepsNew.set(thtRep.id, thtRep);
            thtEl.style.display = "block";
            thtEl.style.opacity = "0";
            // Reset pointer-events in case element was previously hidden due to overflow
            thtEl.style.pointerEvents = "";
        });
        // thtReps = thtRepsOld + thtRepsNew
        this.thtReps.clear();
        for(const thtRep of this.thtRepsOld.values()) {
            this.thtReps.set(thtRep.id, thtRep);
        }
        for(const thtRep of this.thtRepsNew.values()) {
            // Preserve chevron animation state from old rep
            const oldRep = this.thtRepsOld.get(thtRep.id);
            if (oldRep && !isNaN(oldRep.chevronAngle)) {
                thtRep.chevronAngle = oldRep.chevronAngle;
            }
            this.thtReps.set(thtRep.id, thtRep);
        }
        this.logInfo("initThoughtAndLinkReps -- thtRepsNew:", this.thtRepsNew.size, " thtRepsOld:", this.thtRepsOld.size, " thtReps:", this.thtReps.size);
    }
    
    requestExtraLinks() {
        // get the links between all the thoughts that are onscreen now and tell me if there is any link from any of these thoughts to anything else not in the collection
        // the results will be used to draw level 2 links as well as highlighted gates
        
        if(!this.activeId) {
            return;
        }
        
        let thtElements = Array.from(this.field.querySelectorAll(".tht.cur"));
        let thtIds: string[] = [];
        thtElements.forEach((t) => {
            thtIds.push(t.id.substring(4, 40));
        })
        // results will come in a callback to showExtraLinks()
        safeInvoke(this.dotNetHelper, "RequestExtraLinks", [this.activeId, thtIds.join(",")]);
    }

    // called from server
    showExtraLinks(rowHeightPixels: number, thtId: string, links: LinkRep[], tagLists: IndicatorList[]) {
        if(thtId != this.activeId) {
            // active thought must have changed since the request was made - ignore
            return;
        }
        plexCanvas.animateBriefly();
        let linkIds: string[] = [];
        links.forEach((l) => {
            let linkRep = new LinkRep(l.id, l.idA, l.idB, l.relation, l.color, l.label, l.thickness, l.direction, l.meaning);
            this.linkRepsNew.set(linkRep.id, linkRep);
            this.linkReps.set(linkRep.id, linkRep);
            linkIds.push(l.id);
        });
        this.showTags(tagLists, rowHeightPixels);

        if(this.layout == LayoutType.Force) {
            let filteredLinks = links.filter((l) => this.thtReps.has(l.idA) && this.thtReps.has(l.idB))
            this.forceLayout.addData(this.getLinkData(filteredLinks));
        }

        // Request metadata for the links (notes and attachments)
        if(linkIds.length > 0) {
            safeInvoke(this.dotNetHelper, "RequestLinkMetadata", [linkIds.join(",")]);
        }
    }

    // called from server with link metadata (notes and attachments)
    showLinkMetadata(linkMetadataList: any[]) {
        if(linkMetadataList.length === 0) {
            return;
        }
        linkMetadataList.forEach((metadata) => {
            let linkRep = this.linkReps.get(metadata.linkId);
            if(linkRep) {
                linkRep.hasNotes = metadata.hasNotes;
                linkRep.attachmentCount = metadata.attachmentCount;
            }
        });
        plexCanvas.clearLinkColliders();
        plexCanvas.animateBriefly();
    }

    showTags(indicatorLists: IndicatorList[], rowHeightPixels: number) {
        indicatorLists.forEach((indicatorList) => {
            let thtRep = this.thtReps.get(indicatorList.thtId);
            if(thtRep) {
                let indicatorParent = thtRep.thtEl.querySelector(".indicator-icons") as HTMLElement;
                // Control spacing between icon/label based on visibility mode
                const compactGap = this.tagTextVisibilityMode === 'hover' || this.tagIconVisibilityMode === 'hover';
                indicatorParent.style.gap = compactGap ? '0px' : '1px';
                const opacity = parseFloat(getComputedStyle(thtRep.thtEl).opacity);
                let needToAnimate = opacity < 0.5; // if the parent is doing an appear animation make the icon also animate
                if(indicatorParent.children.length) {
                    needToAnimate = false;
                }
                indicatorParent.replaceChildren();
                // Anchor the row by its top so a tag that grows taller on hover expands downward
                // instead of pushing the row up. 0.2 places the icon-height (0.45) row at the same
                // spot the old bottom anchor (0.25 below the thought) did.
                indicatorParent.style.top = `calc(100% - ${rowHeightPixels*0.2}px)`;
                if(thtRep.alignment === ThoughtHorizontalAlignment.Right) {
                    indicatorParent.style.right = `calc(0% + ${rowHeightPixels*1.1}px)`;
                    indicatorParent.style.flexDirection = "row-reverse";
                } else if(thtRep.alignment === ThoughtHorizontalAlignment.Left) {
                    indicatorParent.style.left = `calc(0% + ${rowHeightPixels*1.1}px)`;
                } else {
                    indicatorParent.style.left = `calc(50% + ${rowHeightPixels*0.8}px)`;
                }
                indicatorList.indicators.forEach((indicator) => {
                    // Tag indicators reference the tag thought id (different from the host thought id),
                    // while non-tag indicators (notes, private, events) use the host thought id.
                    const isTagIndicator = indicator.indicatorId !== indicatorList.thtId;
                    const iconMode = isTagIndicator ? this.tagIconVisibilityMode : 'always';
                    const shouldCreateIcon = iconMode !== 'never';
                    // Size multiplier applies to all indicators (tags, notes, events, private thoughts).
                    const indicatorSizeFactor = this.tagScalePercent / 100;
                    const targetSizePx = 0.45 * rowHeightPixels * indicatorSizeFactor;
                    let iconElement: HTMLImageElement | null = null;
                    if(shouldCreateIcon) {
                        iconElement = document.createElement("img");
                        iconElement.src = indicator.imageAddress;
                        iconElement.classList.add("indicator-icon");
                        iconElement.dataset["indicatorId"] = indicator.indicatorId;
                        iconElement.dataset["thoughtId"] = indicatorList.thtId;
                        if(indicator.indicatorType) {
                            iconElement.dataset["indicatorType"] = indicator.indicatorType;
                        }
                        try {
                            iconElement.style.setProperty("height", targetSizePx + "px", "important");
                            iconElement.style.setProperty("max-width", targetSizePx + "px", "important");
                            iconElement.style.setProperty("width", "auto", "important");
                        } catch { /* ignore */ }
                        if(isTagIndicator) {
                            iconElement.dataset["iconVisibility"] = iconMode;
                            if(iconMode === 'hover') {
                                iconElement.style.display = 'none';
                            }
                        }
                    }

                    let indicatorElement: HTMLElement | null = null;
                    const shouldShowLabel = isTagIndicator && this.tagTextVisibilityMode !== 'icons';
                    if(shouldShowLabel) {
                        const indicatorEntry = document.createElement("span");
                        indicatorEntry.classList.add("indicator-with-label");
                        indicatorEntry.style.display = "inline-flex";
                        // Top-aligned so the icon stays put when the label wraps and grows taller
                        indicatorEntry.style.alignItems = "flex-start";
                        indicatorEntry.style.flexShrink = "0";
                        if(iconElement) {
                            indicatorEntry.appendChild(iconElement);
                        }
                        const indicatorLabel = document.createElement("span");
                        indicatorLabel.classList.add("indicator-label");
                        // Use label if available, otherwise use name
                        const displayText = (indicator as any).label || indicator.name;
                        indicatorLabel.textContent = displayText;
                        // Wrap the text to multiple lines past the max width. Keep the label (and its
                        // pill wrapper above) at their natural width otherwise — flex would shrink
                        // them to the longest word, wrapping at every break point.
                        indicatorLabel.style.maxWidth = this.TAG_LABEL_MAX_WIDTH;
                        indicatorLabel.style.whiteSpace = 'normal';
                        indicatorLabel.style.flexShrink = '0';
                        // Store both name and original text as data attributes for hover switching
                        indicatorLabel.dataset["indicatorName"] = indicator.name;
                        indicatorLabel.dataset["originalText"] = displayText;
                        // Get default colors from thought-control element
                        const thoughtControl = thtRep.thtEl.querySelector(".thought-control") as HTMLElement;
                        const defaultBgColor = thoughtControl ? window.getComputedStyle(thoughtControl).backgroundColor : '';
                        const defaultFgColor = thoughtControl ? window.getComputedStyle(thoughtControl).color : '';

                        // Determine the colors to use (custom or default)
                        const bgColor = (indicator as any).backColorCss || defaultBgColor;
                        const fgColor = (indicator as any).foreColorCss || defaultFgColor;

                        // Persist colors and name as data attrs for hover reveal
                        if(fgColor) {
                            (indicatorEntry.dataset as any)["foreColorCss"] = fgColor;
                        }
                        if((indicator as any).backColorCss) {
                            (indicatorEntry.dataset as any)["backColorCss"] = (indicator as any).backColorCss;
                        } else if(defaultBgColor) {
                            (indicatorEntry.dataset as any)["backColorCss"] = defaultBgColor;
                        }
                        // Store the name for hover display
                        (indicatorEntry.dataset as any)["indicatorName"] = indicator.name;

                        // Apply colors immediately for 'always' mode
                        if(this.tagTextVisibilityMode  === 'always') {
                            if(fgColor) {
                                indicatorEntry.style.color = fgColor;
                            }
                            if(bgColor) {
                                indicatorEntry.style.backgroundColor = bgColor;
                            }
                        }
                        // Scale pill (and thus border-radius/padding via em) with rowHeightPixels
                        // Use the container's font-size so .indicator-with-label { border-radius: 0.5em } scales visually
                        const labelFontSizePx = Math.max(8, rowHeightPixels * (10 / 28) * indicatorSizeFactor);
                        try {
                            indicatorEntry.style.setProperty("font-size", labelFontSizePx + "px", "important");
                        } catch { /* ignore */ }
                        // If hover mode, hide label initially (shown on thought hover) and remove pill padding
                        if(this.tagTextVisibilityMode  === 'hover') {
                            indicatorLabel.style.display = 'none';
                            indicatorEntry.style.padding = '0';
                        }

                        indicatorEntry.appendChild(indicatorLabel);
                        indicatorElement = indicatorEntry;
                    } else if(iconElement) {
                        indicatorElement = iconElement;
                    }

                    if(!indicatorElement) {
                        return;
                    }

                    indicatorParent.appendChild(indicatorElement);
                    if(needToAnimate && iconElement) {
                        // make it start from nothing then animate up to target size
                        iconElement.style.setProperty("height", "0px", "important");
                        // NOTE: this is a hack to force the CSS animation height to be reset to zero as we just requested.
                        // This has been tested on Safari and Chrome
                        // DO NOT remove this hack
                        let height = window.getComputedStyle(iconElement).height;
                        // Preserve hover zoom animation by including transform in the transition
                        iconElement.style.transition = `height ${this.animationTime}s ease, transform ${this.ICON_ZOOM_ANIMATION_TIME}s ease`;
                        // NOTE: keep this number 0.45 in sync with the CSS .indicator-icon height in PlexControl.razor
                        iconElement.style.setProperty("height", targetSizePx + "px", "important");
                    }
                });
            }
        });
    }
    
    setThoughtPosition(tht: HTMLElement, point: Point, fontSizePercent: number, isYAtTop: boolean = false, horizAlign: ThoughtHorizontalAlignment = ThoughtHorizontalAlignment.Center) {
        tht.style.position = "absolute";
        let id = tht.id.substring(4, 40);
        
        // This hack seems to work reliably to find out the new width and height of the final element
        // so we can center it. Without this hack, the current starting animation fontsize causes
        // offsetWidth and offsetHeight to return the wrong width and height, even zero.
        // Note the measurer element lives in PlexControl, and is not invisible, it just has zero opacity.
        let reusable = document.getElementById("measurer") as HTMLElement;
        let htmlClone = tht.cloneNode(true) as HTMLElement;
        syncThoughtFontStyling(tht, htmlClone);
        htmlClone.style.fontSize = fontSizePercent + "%";
        // If the element has an inline maxWidth (set by normalLayout), the clone inherits it
        // via cloneNode and overrides the CSS max-width:100%, so measurer width doesn't matter.
        // If no inline maxWidth exists (outline layout), give the measurer a width matching
        // the field so max-width:100% resolves correctly (matching the actual rendering context).
        const hasInlineMaxWidth = tht.style.maxWidth !== "";
        if (!hasInlineMaxWidth) {
            reusable.style.width = this.field.offsetWidth + "px";
            reusable.style.minWidth = this.field.offsetWidth + "px";
        }
        reusable.appendChild(htmlClone);
        let w = htmlClone.offsetWidth;
        let h = htmlClone.offsetHeight;
        reusable.removeChild(htmlClone);
        if (!hasInlineMaxWidth) {
            reusable.style.width = "";
            reusable.style.minWidth = "";
        }

        let dx = -w / 2;
        if(horizAlign === ThoughtHorizontalAlignment.Right) {
            dx = -w;
        } else if(horizAlign === ThoughtHorizontalAlignment.Left) {
            dx = 0;
        }
        let x = (point.x + dx);
        let y = isYAtTop ? point.y : point.y - h / 2;
        tht.style.left = x + "px";
        tht.style.top = y + "px";
        this.thoughtIdSet.add(id);
        this.lastNormalLayoutThoughtPoints[id] = point;
    }
    
    getRowHeightWithSpacing(): number {
        const spacing = this.thoughtSpacing || 1.0;
        return this.rowHeight * spacing;
    }

    getInitialNodePointForForceLayout(id: string): Point | undefined {
        if(id in this.lastNormalLayoutThoughtPoints) {
            return this.lastNormalLayoutThoughtPoints[id];
        }
        return undefined;
    }

    getThoughtScreenCenter(id: string): { x: number, y: number } | null {
        let rep = this.getAnyThoughtRepById(id);
        if (!rep) return null;
        let rect = rep.thtEl.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    getThoughtIconScreenCenter(id: string): { x: number, y: number } | null {
        let rep = this.getAnyThoughtRepById(id);
        if (!rep) return null;
        let iconEl = rep.thtEl.querySelector(".tht-icon") as HTMLElement | null;
        if (iconEl) {
            let iconRect = iconEl.getBoundingClientRect();
            let thtRect = rep.thtEl.getBoundingClientRect();
            return { x: iconRect.left + iconRect.width / 2, y: thtRect.top + thtRect.height / 2 };
        }
        // Fallback to thought center if no icon element
        let rect = rep.thtEl.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    // Called from Blazor before WallpaperVal changes.
    // Captures the current background into an overlay div so the old wallpaper
    // fades out smoothly after Blazor re-renders with the new background.
    crossfadeWallpaper(newCssValue: string, durationMs: number) {
        if(!this.field) {
            return;
        }

        // Bump the crossfade ID to cancel any in-progress crossfade
        const myId = ++this._wallpaperCrossfadeId;

        // Remove any existing overlay from a prior crossfade
        if(this._wallpaperOverlay) {
            this._wallpaperOverlay.remove();
            this._wallpaperOverlay = null;
        }

        // Capture the field's current computed background properties
        const computed = getComputedStyle(this.field);
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.zIndex = "1";
        overlay.style.pointerEvents = "none";
        overlay.style.backgroundImage = computed.backgroundImage;
        overlay.style.backgroundSize = computed.backgroundSize;
        overlay.style.backgroundPositionX = computed.backgroundPositionX;
        overlay.style.backgroundPositionY = computed.backgroundPositionY;
        overlay.style.opacity = "1";
        overlay.style.transition = `opacity ${durationMs}ms ease-in-out`;

        this.field.prepend(overlay);
        this._wallpaperOverlay = overlay;

        // Extract URL from the new CSS value for preloading
        const urlMatch = newCssValue.match(/url\(([^)]+)\)/);
        const imageUrl = urlMatch ? urlMatch[1].replace(/['"]/g, "") : null;

        const fadeOut = () => {
            if(myId !== this._wallpaperCrossfadeId) {
                return; // Superseded by a newer crossfade
            }
            requestAnimationFrame(() => {
                overlay.style.opacity = "0";
            });
            overlay.addEventListener("transitionend", () => {
                if(this._wallpaperOverlay === overlay) {
                    this._wallpaperOverlay = null;
                }
                overlay.remove();
            }, { once: true });
            // Safety fallback in case transitionend doesn't fire
            setTimeout(() => {
                if(overlay.parentNode) {
                    overlay.remove();
                    if(this._wallpaperOverlay === overlay) {
                        this._wallpaperOverlay = null;
                    }
                }
            }, durationMs + 200);
        };

        if(imageUrl) {
            // Preload the new image, then fade out the overlay
            const img = new Image();
            img.onload = () => { fadeOut(); };
            img.onerror = () => { fadeOut(); };
            img.src = imageUrl;
            // Safety timeout if image takes too long
            setTimeout(() => {
                if(myId === this._wallpaperCrossfadeId && overlay.style.opacity === "1") {
                    fadeOut();
                }
            }, 5000);
        } else {
            // New background is a gradient — small delay for Blazor re-render
            setTimeout(() => { fadeOut(); }, 50);
        }
    }

}
export const plexAnimator: PlexAnimator = new PlexAnimator();
